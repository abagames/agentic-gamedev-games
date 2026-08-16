// DRAFT LINE — pseudo-3D road renderer.
// Classic 1983-85 segment projection: each road segment becomes a trapezoid between
// two projected rings, drawn near->far with a running "highest drawn scanline" clip so
// hill crests occlude everything behind them. The same clip table is reused by
// project() so sprites vanish behind crests too.

import {
  VIEW_W, VIEW_H, CELL,
  ROAD_Y0, ROAD_Y1, HORIZON_BASE,
  SEG_LEN, ROAD_WIDTH, DRAW_DISTANCE,
  CAMERA_HEIGHT, CAMERA_DEPTH, PLAYER_GROUND_Y,
  CURVE_ACCUM, LATERAL_LIMIT_M,
  BG_SCROLL,
  COAST, PAL, DISTANT_TOWER, CROSS_ROAD, DISTANT_OVERPASS,
} from './spec.js';
import { propsFor, PROP_KINDS } from './props.js';

// ---- rendering-only constants (not gameplay values) ----
const HALF_W = ROAD_WIDTH / 2;          // metres
const SCREEN_HALF = VIEW_W / 2;         // px; also the ndc -> px factor (square pixels)

const RUMBLE_FRAC = 0.14;               // rumble strip width, fraction of road half-width
const LANE_FRAC = 0.028;                // centre dash half-width, fraction of half-width
// Bands and dashes are keyed to WORLD DISTANCE, not to the segment index. A segment is
// 8 m; near the camera a single segment covers half the viewport, so a per-segment flip
// left the whole foreground one flat colour and the rumble strobe -- the entire speed
// sensation in this genre -- only existed near the horizon.
// Near the camera, one road SEGMENT (8 m) can cover 40%+ of the road viewport's height
// (a close ring's projected height grows without bound as 1/dz). If BAND_LEN/LANE_LEN were
// long enough that an 8-15 m real span never completes one light/dark cycle, that whole
// screen-filling slab reads as a single flat colour -- which is exactly the "strobe dies
// in the foreground" defect: the near band is the fastest-moving part of the screen and
// the one place this genre's speed sensation comes from. Kept short enough that even the
// most-compressed near segment (the last ~10 m in front of the near plane) completes
// several cycles.
const BAND_LEN = 8;                     // metres per light/dark band flip
const LANE_LEN = 8;                     // metres per centre-dash cycle
const LANE_ON_LEN = 4;                  // metres lit inside each cycle
const SLICE_PX = 2;                     // scanline slab height when a segment is tall
// Past the depth where one band is thinner than this many scanlines, the light/dark flip
// aliases into a fizzing zebra instead of reading as texture. Beyond it, draw flat.
const BAND_MIN_PX = 3;
// A ring within a few metres of the near plane projects a half-width far wider than the
// screen -- and that is CORRECT: at camAbove 2.8 m against a 5 m half-width the road
// genuinely overflows a 60 deg frame in the bottom ~30 scanlines. Capping it at 0.8 of a
// half-screen (as this used to) held the drawn half-width to ~128 px across y=140..200
// where perspective demands 107 -> 214, so the foreground road stopped widening and its
// edges bent back INWARD toward the viewer -- the "near road wraps at you" defect.
// The cap survives only as a numeric safety valve for the degenerate case (camera almost
// on the tarmac over a crest, where 1/dz explodes), far outside the visible range, and it
// is now applied per scanline slab AFTER the exact interpolation so it can only clip, never
// reshape, on-screen geometry.
const WIDTH_SAFETY_FRAC = 4.0;          // fraction of SCREEN_HALF a road half-width may reach

// CURVE_ACCUM moved to spec.js (B5 / B3a-0d): it is a gameplay-visible constant — it is
// the entire basis on which the player judges how hard a corner is — and the contract now
// carries both its derivation and the bound below.
//
// THE OLD BOUND, AND WHAT IT WAS ACTUALLY PROTECTING. This used to be
//   const VP_SHIFT_MAX = 7 * CELL;  lateral = VP_SHIFT_MAX * tanh(raw / VP_SHIFT_MAX);
// a soft-limit at 56 px. Its stated job was to stop a long corner kinking back to
// straight against a hard clamp. Measured (scratchpad/b14measure.mjs), it was doing
// something else: tanh is already 10% down at raw = 34 px and 30% down at raw = 68 px,
// so it compressed ordinary corners, not just extreme ones, and it flattened every
// corner above ~0.5 onto the same 55 px. But it was NOT the cause of "the curves are
// weak": on real courses the UNBOUNDED shift only ran 21 px (straight) to 29 px
// (1.0 hairpin), so the cap was mostly not even reached. The cause was CURVE_ACCUM.
//
// THE NEW BOUND, in two parts, because the road and the sprites need different things.
//
// (a) THE ROAD NEEDS NO BOUND — it needs a CULL. A road ring is not drawn at its own
// position; it is one END of a trapezoid that is interpolated across the scanlines
// between it and its neighbour. So clamping a ring's screen x moves pixels INSIDE the
// frame whenever the other end of that trapezoid is still on screen — which is not a
// corner case but the common one, since exactly one ring per frame straddles the edge.
// That was measured, not reasoned: clamping the rings and diffing a whole lap against an
// unclamped render changed 183 of 428 frames (scratchpad/b14clamp.mjs). The rings are
// therefore left exact, and each scanline SLAB is skipped when the slab itself is wholly
// off-frame. A cull of something entirely outside the viewport is invisible by
// construction, and it also keeps _slab() off absurd coordinates. The grass fill is
// deliberately still emitted for those rows: it is what INV-GROUND-BAND-ALWAYS-PAINTED
// (sim.test.mjs §12) relies on, and it spans the full viewport width anyway.
//
// (b) SPRITES DO NEED A BOUND, because project() hands sx straight to a draw call with
// no second endpoint to interpolate against. The bound is derived from the frame:
//   limit(sc) = SCREEN_HALF + LATERAL_LIMIT_M * sc
// An object attached to that depth is drawn spanning
//   sx = SCREEN_HALF + lateral - camXm*sc + xw*sc,   |camXm| <= 5 m, |xw| <= 27 m
// (27 m = props.js FAR_BAND's 4.20 half-widths plus the widest PROP_KINDS half-width),
// so when lateral is clamped to +limit its nearest drawn edge sits at
//   >= VIEW_W + (32 - 5 - 27)*sc = VIEW_W:
// the clamp can only move something already outside the frame. LATERAL_LIMIT_M = 32 is
// exactly 21 + 6 + 5; it is that sum, not a chosen number. A hard clamp is safe here
// where the old tanh was not — the old one bound at 56 px, in the middle of the picture,
// which is precisely why it had to be softened.
const lateralLimit = (sc) => SCREEN_HALF + LATERAL_LIMIT_M * sc;
// P5. The background's displacement is no longer computed here at all. It used to be
// `-baseCurve * HILL_SHIFT_MAX` — a static offset proportional to the instantaneous
// curvature, and drawn in the WRONG DIRECTION (it co-scrolled with the road's own drift).
// It is now an accumulated counter-scroll handed in as `cam.bgOffset`, integrated by
// spec.js's bgScrollStep() from the derivation in the BG_SCROLL block. Nothing about the
// background's motion may be decided in this file.
// The nearest ring is placed this many pixels below the road viewport. Rings closer than
// that are folded onto it instead of being parked at the camera plane, where 1/dz blows
// up and paints the foreground with a single enormous trapezoid.
const NEAR_PAD_PX = 24;

const FOG_START = 0.55;                 // fraction of DRAW_DISTANCE where fog begins
const FOG_MAX = 0.92;                   // maximum fog alpha at the draw-distance limit

const HILL_COUNT = 7;                   // distant hill silhouette lumps
const HILL_MAX_H = 3 * CELL;            // px above the horizon
const SUN_X = 0.68, SUN_Y = 0.30, SUN_R = 9;  // sky-relative sun placement

// ---- roadside props (B12) ----
// A prop is drawn only while its ground ring is inside this many segments of the camera.
// Past that it is 1-2 px of noise on the horizon and costs more than it shows; the road's
// own fog has already taken over as the depth cue by then.
const PROP_DRAW_SEGS = 44;
const PROP_PAL = {
  postA: '#d8d8e0', postB: '#b02830',
  trunk: '#4a3320', foliage1: '#1f6b34', foliage2: '#154f27',
  pine1: '#17532c', pine2: '#0f3d20',
  rock1: '#6a6a70', rock2: '#4a4a52',
  pylon: '#3a4560',
  boardFace: '#e8e4d8', boardFrame: '#8c6a3c', boardInkA: '#c83c3c', boardInkB: '#3c7cc8',
  boardShadow: '#123c1e',
  wall: '#c8b08c', wallShade: '#8c7458', roof: '#7a3830',
  window: '#2c4a8c', doorway: '#3a2a1c',
  warnFace: '#ffd76b', warnEdge: '#1a1a20',
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// World sprites share the same ground-depth axis. Quantizing only the tie key to one
// centimetre keeps effectively co-planar objects deterministic without changing any
// visually meaningful near/far relationship. At the same key props paint first and cars
// second, preserving the gameplay silhouette when two bases genuinely coincide.
const WORLD_DEPTH_CM = 100;
const WORLD_KIND_ORDER = { prop: 0, traffic: 1, rival: 2 };
export function sortWorldSprites(items) {
  return [...items].sort((a, b) => {
    const depth = Math.round(b.z * WORLD_DEPTH_CM) - Math.round(a.z * WORLD_DEPTH_CM);
    if (depth) return depth;
    const kindA = a.category === 'prop' ? 'prop' : a.kind;
    const kindB = b.category === 'prop' ? 'prop' : b.kind;
    const kind = (WORLD_KIND_ORDER[kindA] ?? 0) - (WORLD_KIND_ORDER[kindB] ?? 0);
    if (kind) return kind;
    const lateral = (a.x || 0) - (b.x || 0);
    if (lateral) return lateral;
    return String(a.kind || '').localeCompare(String(b.kind || ''));
  });
}

// Returns the palette role for a transverse pavement band at world z. The authored list
// is tiny and ordered, so a linear walk is cheaper and clearer than maintaining another
// spatial index. This is deliberately render-local: a crossing is never a route, trigger,
// collision shape, traffic source or scoring event.
function crossRoadStyleAt(z, camZ) {
  const half = CROSS_ROAD.lengthM / 2;
  for (const crossingZ of CROSS_ROAD.positionsM) {
    const d = Math.abs(z - crossingZ);
    if (d <= half) {
      const approach = crossingZ - camZ;
      const fade = clamp((CROSS_ROAD.visibleFarM - approach) / CROSS_ROAD.fadeInM, 0, 1);
      const alpha = fade * fade * (3 - 2 * fade);
      return {
        colour: d >= half - CROSS_ROAD.seamM ? PAL.crossRoadSeam : PAL.crossRoad,
        alpha,
      };
    }
    if (crossingZ > z + half) break;
  }
  return null;
}

// How far BEHIND the player the camera must sit for the player's own z to project onto
// PLAYER_GROUND_Y. Inverting the ring projection: dyh = camAbove*depth*SCREEN_HALF/dz.
// The player cannot be projected from the camera's own position — dz = 0 is degenerate,
// which is why this genre pins the car to a fixed row in the first place. Pinning the ROW
// while leaving the camera on top of the player is what broke the alignment: the row
// silently implied a depth (7.05 m at the default FOV) that the simulation knew nothing
// about. Setting the camera back by that exact amount makes the pinned row a genuine
// projection of the player's z, so player and rivals live in one coordinate system.
// It is a function of depth, so the boost's FOV punch shifts it too — the camera surges
// ~1.4 m forward during a dash and the alignment still holds frame by frame.
export function cameraSetback(depth = CAMERA_DEPTH, height = CAMERA_HEIGHT) {
  return (height * depth * SCREEN_HALF) / (PLAYER_GROUND_Y - HORIZON_BASE);
}

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    const N = DRAW_DISTANCE + 2;
    // Per-frame projection tables, indexed by ring n (n = segments ahead of the camera).
    this._n = 0;
    this._z = new Float64Array(N);      // world z of ring n
    this._sx = new Float64Array(N);     // screen x of the road centre
    this._sy = new Float64Array(N);     // screen y of the road surface
    this._sc = new Float64Array(N);     // pixels per metre
    this._clip = new Float64Array(N);   // highest (smallest y) scanline still visible at ring n
    this._cx = new Float64Array(N);     // world centreline drift at ring n, metres
    this._cxd = new Float64Array(N);    // d(cx)/dsegment at ring n — the quadratic's slope
    this._cxc = new Float64Array(N);    // curve*CURVE_ACCUM of the segment starting at ring n
    this._segY = new Float64Array(N);   // world road elevation at ring n, metres
    this._camZ = 0;
    this._camXm = 0;
    this._camY = CAMERA_HEIGHT;
    this._horizon = HORIZON_BASE;
    this._ready = false;
  }

  beginFrame() {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ROAD_Y0, VIEW_W, ROAD_Y1 - ROAD_Y0);
    ctx.clip();
    this._ready = false;
  }

  endFrame() {
    this.ctx.restore();
  }

  // ------------------------------------------------------------------ road
  renderRoad(course, cam) {
    const ctx = this.ctx;
    const camZ = cam.z;
    const camXm = (cam.x || 0) * HALF_W;
    const camY = course.elevationAt(camZ) + (cam.height != null ? cam.height : CAMERA_HEIGHT);
    this._camZ = camZ;
    this._camXm = camXm;
    this._camY = camY;
    // Per-frame camera depth. Defaults to the module constant, so every existing caller
    // and every projection regression test sees byte-identical geometry; the boost widens
    // the field of view by passing a SMALLER depth for the frames the dash is live.
    // It must be stored and reused by project() as well, or sprites would swim relative to
    // the road they stand on for the duration of the punch.
    const camDepth = (cam.depth != null && cam.depth > 0.05) ? cam.depth : CAMERA_DEPTH;
    this._camDepth = camDepth;

    const baseIndex = Math.floor(camZ / SEG_LEN);
    this._baseZ = baseIndex * SEG_LEN;
    const horizon = HORIZON_BASE;
    this._horizon = horizon;

    this._drawSky(cam.bgOffset || 0, camZ);

    // Clear the GROUND half of the viewport before any of it is drawn.
    // Nothing else guarantees these rows are painted: _drawSky covers ROAD_Y0..horizon and
    // the hill silhouettes bottom out exactly at `horizon`, so every row from `horizon`
    // down belongs to the road loop — and the road loop legitimately paints nothing there
    // whenever the far rings are culled behind a crest (`yFar >= maxy`) or simply fall
    // short of the horizon. Measured over 1877 camera positions on Course(4242): row 80 was
    // left untouched in 18.4% of frames, rows 81-87 in 14.0% down to 0.9%. With no clear,
    // whatever was in those rows LAST frame survived — and what lands there is distant car
    // sprites, which _drawCar floors to a 2x2 px blob. Deleting every rival and every
    // traffic car and forcing one render still left 7 px of PAL.rivalBody in row 80 and
    // 8 px of PAL.trafficRoof in row 83: the reported "traces of cars near the horizon".
    // Fogged sky is the honest colour for it — it is exactly what the distance fade below
    // converges to, so the band reads as haze at the draw-distance limit rather than as a
    // seam.
    ctx.fillStyle = PAL.skyLow;
    ctx.fillRect(0, horizon, VIEW_W, ROAD_Y1 - horizon);

    // ---- project every ring, accumulating the curve drift of the centreline ----
    let cx = 0;    // centreline lateral offset, metres
    let dcx = 0;   // its per-segment derivative
    const nRings = DRAW_DISTANCE + 1;
    const segs = course.segments;

    // Near plane: the depth whose road surface lands NEAR_PAD_PX below the viewport.
    // Everything nearer is folded onto it, so 1/dz can never blow up.
    const camAbove = Math.max(0.2, camY - course.elevationAt(camZ));
    this._camAbove = camAbove;
    const nearZ = Math.max(0.5,
      camDepth * SCREEN_HALF * camAbove / ((ROAD_Y1 + NEAR_PAD_PX) - horizon));
    this._nearZ = nearZ;

    // Pass A: accumulate the curve drift, and record elevation.
    // The accumulator is anchored on the CAMERA, not on ring 0. Ring 0 sits at baseZ, up
    // to a whole segment BEHIND the camera, and jumps forward 8 m every time baseIndex
    // ticks over; seeding cx=dcx=0 there made the drift field a function of the grid
    // rather than of the road. For constant curvature C the drift measured from ring 0 is
    // (C/2)(m + u)^2 - (C/2)(m + u), whose linear term (C/2)m(2u - 1) sweeps from -(C/2)m
    // to +(C/2)m as the camera crosses its segment and then snaps back — so the whole
    // projected centreline lurched -6.5 px then +4.5 px per frame on an 8 m cycle, and
    // every sprite standing on it lurched with it.
    // Seeding the state at the camera and stepping the exact double integral of a
    // piecewise-constant curvature (cx += dcx*h + c*K*h^2/2, dcx += c*K*h) makes the field
    // depend only on distance ahead of the camera. u < 0 for ring 0 is the same formula
    // run backwards, which keeps ring 0 continuous with the rest.
    {
      const u = (camZ - baseIndex * SEG_LEN) / SEG_LEN;   // 0..1 through the base segment
      const b = segs[baseIndex < 0 ? 0 : Math.min(baseIndex, segs.length - 1)];
      const c0 = b.curve * CURVE_ACCUM;
      cx = 0.5 * c0 * u * u;      // state at ring 0, stepped back by u from the camera
      dcx = -c0 * u;
    }
    for (let n = 0; n < nRings; n++) {
      const si = baseIndex + n;
      // Clamp both ends: on the grid the car sits a few cm behind z=0, so baseIndex is -1
      // and an unclamped lookup returns undefined.
      const seg = segs[si < 0 ? 0 : si < segs.length ? si : segs.length - 1];
      const c = seg.curve * CURVE_ACCUM;
      this._cx[n] = cx;
      this._cxd[n] = dcx;    // stored BEFORE the step, so cx(n+t) = cx + dcx*t + c*t^2/2
      this._cxc[n] = c;      // ...which is the same double integral the rings themselves use
      this._segY[n] = seg.y;
      cx += dcx + 0.5 * c;
      dcx += c;
    }

    // Pass B: project every ring.
    for (let n = 0; n < nRings; n++) {
      const z = (baseIndex + n) * SEG_LEN;
      const dz = Math.max(z - camZ, nearZ);

      const sc = (camDepth / dz) * SCREEN_HALF;   // pixels per metre at this depth
      // Exact — no bound at all on the ring itself; off-frame slabs are culled below.
      // The drawn displacement is therefore exactly curve * CURVE_ACCUM integrated twice,
      // i.e. the course's own curvature, for every pixel that is inside the viewport.
      const lateral = this._cx[n] * sc;
      const sx = SCREEN_HALF + lateral - camXm * sc;
      const sy = horizon - (this._segY[n] - camY) * sc;
      this._z[n] = z;
      this._sx[n] = sx;
      this._sy[n] = sy;
      this._sc[n] = sc;
    }

    // Mid-distance scenery is painted after the sky/hills but before any terrain. Road
    // slabs subsequently cover the parts below a crest, while props, cars and warnings
    // remain unconditionally above it. This is scenery, never an overhead occluder.
    this._drawDistantOverpasses(camZ);

    // ---- draw near -> far, clipping each trapezoid to the highest scanline drawn ----
    let maxy = ROAD_Y1;   // nothing above this line has been covered yet
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      this._clip[n] = maxy;
      const yNear = this._sy[n];
      const yFar = this._sy[n + 1];
      if (yFar >= maxy) continue;                 // fully hidden behind a nearer crest
      if (yFar >= ROAD_Y1) continue;              // below the viewport entirely
      if (yNear <= ROAD_Y0 && yFar <= ROAD_Y0) {  // above the viewport entirely
        maxy = Math.min(maxy, yFar);
        continue;
      }

      const si2 = baseIndex + n;   // clamp both ends: baseIndex is -1 on the start line
      const seg = segs[si2 < 0 ? 0 : Math.min(si2, segs.length - 1)];

      const y1 = clamp(yNear, ROAD_Y0, ROAD_Y1);
      const y2 = clamp(yFar, ROAD_Y0, ROAD_Y1);
      const clipBottom = Math.min(y1, maxy);
      if (y2 >= clipBottom) { maxy = Math.min(maxy, yFar); continue; }

      const widthCap = SCREEN_HALF * WIDTH_SAFETY_FRAC;
      const x1 = this._sx[n], w1 = this._sc[n] * HALF_W;
      const x2 = this._sx[n + 1], w2 = this._sc[n + 1] * HALF_W;
      // Interpolate against the RAW ring rows, not the viewport-clamped ones. On a road
      // plane both the centre and the half-width are exactly linear in (y - horizon), so
      // interpolating on the raw basis is perspective-exact at every scanline. Using the
      // clamped y1 as the basis while x1/w1 still described the unclamped row squashed a
      // whole segment's worth of widening into the visible part of the trapezoid.
      const dy = yNear - yFar;
      const segAbove = camY - seg.y;   // camera height above THIS segment's surface

      // Walk the trapezoid in scanline slabs so the band phase is a function of world
      // distance at every depth. A far segment is one slab; the nearest is ~30.
      for (let yb = clipBottom; yb > y2; yb -= SLICE_PX) {
        const yt = Math.max(y2, yb - SLICE_PX);
        // Inverse-project the slab's midpoint to a world distance.
        const dyh = (yb + yt) / 2 - horizon;
        const zMid = dyh > 0.001
          ? camZ + camDepth * SCREEN_HALF * segAbove / dyh
          : camZ + DRAW_DISTANCE * SEG_LEN;
        // How tall is one band at this depth? y = horizon + segAbove*K/dz, so
        // dy/dz = -segAbove*K/dz^2, and a BAND_LEN band covers dyh^2*BAND_LEN/(segAbove*K).
        const K = camDepth * SCREEN_HALF;
        const bandPx = dyh > 0.001 ? (dyh * dyh * BAND_LEN) / Math.max(0.2, segAbove * K) : 0;
        const flat = bandPx < BAND_MIN_PX;
        const band = Math.floor(zMid / BAND_LEN) % 2 === 0;
        const lanePx = bandPx * (LANE_ON_LEN / BAND_LEN);
        // Far field: pick the DARK half of each pair, never the light one. Forcing the light
        // half instead paints a solid white kerb across the whole horizon.
        const cGrass = flat ? PAL.grass2 : (band ? PAL.grass1 : PAL.grass2);
        const cRumble = flat ? PAL.rumble2 : (band ? PAL.rumble1 : PAL.rumble2);
        const cRoad = flat ? PAL.road2 : (band ? PAL.road1 : PAL.road2);

        // Screen-space interpolation of the two ring edges at this slab.
        const tb = dy > 0.0001 ? clamp((yb - yFar) / dy, 0, 1) : 1;
        const tt = dy > 0.0001 ? clamp((yt - yFar) / dy, 0, 1) : 1;
        const xb = x2 + (x1 - x2) * tb, wb = Math.min(w2 + (w1 - w2) * tb, widthCap);
        const xt = x2 + (x1 - x2) * tt, wt = Math.min(w2 + (w1 - w2) * tt, widthCap);

        ctx.fillStyle = cGrass;
        ctx.fillRect(0, yt, VIEW_W, yb - yt);

        const r = 1 + RUMBLE_FRAC;
        // Off-frame cull (see (a) above). On a hairpin the road genuinely leaves the side
        // of the frame; past that point its slabs paint nothing and only cost coordinates.
        if (Math.max(xb + wb * r, xt + wt * r) < 0) continue;
        if (Math.min(xb - wb * r, xt - wt * r) > VIEW_W) continue;
        this._slab(xb, wb * r, yb, xt, wt * r, yt, cRumble);
        this._slab(xb, wb, yb, xt, wt, yt, cRoad);

        // FLAT CROSS-ROAD LAYER ORDER:
        // distance bands/main road -> transverse pavement -> centre line -> distance fog.
        // The band reuses this slab's inverse-projected z and both projected road centres,
        // rather than a screen-space rectangle, so it stays glued to curves and grades.
        // Its finite lateral span also widens with the same perspective as the main road.
        const crossStyle = crossRoadStyleAt(zMid, camZ);
        if (crossStyle && crossStyle.alpha > 0) {
          // Keep a substantial authored world-space reach, then extend only as much as
          // this projected slab needs to clear both viewport edges. Because the bottom
          // and top widths are derived independently from their road-plane scales, the
          // transverse road keeps the same curve/grade perspective instead of becoming
          // a giant fixed screen-space rectangle with vertical ends.
          const authoredScale = CROSS_ROAD.halfWidthM / HALF_W;
          const edgeWidth = (x, overscan) => Math.max(x + overscan, VIEW_W - x + overscan);
          const crossWb = Math.max(wb * authoredScale, edgeWidth(xb, CROSS_ROAD.edgeOverscanPx));
          const crossWt = Math.max(wt * authoredScale, edgeWidth(xt, CROSS_ROAD.edgeOverscanPx));
          ctx.globalAlpha = crossStyle.alpha;
          this._slab(xb, crossWb, yb, xt, crossWt, yt, crossStyle.colour);
          ctx.globalAlpha = 1;
        }
        if (lanePx >= BAND_MIN_PX && zMid % LANE_LEN < LANE_ON_LEN) {
          this._slab(xb, wb * LANE_FRAC, yb, xt, wt * LANE_FRAC, yt, PAL.lane);
        }
      }

      // distance fog toward the sky colour
      const t = n / DRAW_DISTANCE;
      if (t > FOG_START) {
        const a = FOG_MAX * ((t - FOG_START) / (1 - FOG_START)) ** 1.6;
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = PAL.skyLow;
        ctx.fillRect(0, y2, VIEW_W, clipBottom - y2);
        ctx.globalAlpha = 1;
      }

      maxy = Math.min(maxy, yFar);
    }
    this._clip[DRAW_DISTANCE] = maxy;
    this._n = DRAW_DISTANCE;
    this._baseIndex = baseIndex;
    // Ring n sits at world z = _baseZ + n*SEG_LEN, NOT at camZ + n*SEG_LEN. project()
    // must index the tables from this origin or it samples the wrong ring.
    this._baseZ = baseIndex * SEG_LEN;
    this._ready = true;

    // The same structures switch to a segmented foreground facade as they approach.
    // It is above the road (so the camera visibly passes underneath) but below props,
    // WARN signs, gates and cars, preserving every gameplay-relevant silhouette.
    this._drawOverheadOverpasses(camZ);

    // Props and cars are deliberately deferred to Game's shared world-sprite queue. The
    // projection tables are ready here; both object classes then use this same crest clip.
  }

  // ------------------------------------------------------------------ roadside props
  // B12. Placement and the fairness exclusions live in props.js; these methods expose the
  // visible set and paint operation to Game's shared far-to-near sprite queue.
  visibleProps(course) {
    const props = propsFor(course);
    // NEAR-PLANE DISCIPLINE. project() takes dz EXACTLY (`dz = Math.max(z - camZ, 1e-3)`) —
    // deliberately, because folding it at nearZ is what used to make near RIVALS inherit a
    // clamp meant only for the road's own 1/dz blow-up. That is right for cars, which are
    // never at dz ~ 0, and wrong for props, which sweep straight past the camera. Measured
    // on the live build before this line existed: props reached dz = 0.8 m at 347 px/m,
    // drawing a BILLBOARD 2398 px tall and 3197 px wide, and a BUILDING 2836 x 4253 —
    // ten times the 320x224 frame, unbounded, exactly the B3a item 0c failure mode.
    // nearZ is the depth the ROAD itself is folded at, so it is the near plane this whole
    // renderer already agrees on; nothing nearer is real geometry here.
    // This is a cull, not a fold: a fold would freeze a prop mid-frame at a fixed enormous
    // size instead of letting it sweep off. It is pop-free because large props now clear
    // the verge with their near EDGE (see props.js), so they are fully off-frame laterally
    // well before they reach nearZ — asserted in scratchpad/b12nearprobe.mjs.
    const zNear = this._camZ + (this._nearZ || 0);
    const zFar = this._camZ + PROP_DRAW_SEGS * SEG_LEN;
    // props are sorted by z; a linear scan from a binary-searched start keeps this O(visible).
    let lo = 0, hi = props.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (props[m].z < zNear) lo = m + 1; else hi = m; }
    let end = lo;
    while (end < props.length && props[end].z <= zFar) end++;
    return props.slice(lo, end);
  }

  drawProp(p) {
    return this.drawSprite(p.z, p.x,
      (ctx, sx, sy, scale) => this._drawProp(ctx, p, sx, sy, scale));
  }

  _drawProp(ctx, p, sx, sy, scale) {
    const g = PROP_KINDS[p.kind];
    if (!g) return;
    const h = g.h * p.scale * scale;          // px tall
    const w = g.w * p.scale * scale;          // px half-width
    if (h < 1 || w < 0.4) {
      // Sub-pixel: still worth one dot. At the far end of the draw distance this is what
      // makes the verge continuous instead of popping objects into existence at 200 m.
      ctx.fillStyle = PROP_PAL.foliage2;
      ctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 1);
      return;
    }
    const x = Math.round(sx), y = Math.round(sy);
    const iw = Math.max(1, Math.round(w));
    const ih = Math.max(1, Math.round(h));
    switch (p.kind) {
      case 'POST': {
        // Alternating white/red marker post — the same two colours as the rumble strip, so
        // it reads as roadside furniture rather than as an object in the world.
        ctx.fillStyle = p.seedHue < 0.5 ? PROP_PAL.postA : PROP_PAL.postB;
        ctx.fillRect(x - iw, y - ih, Math.max(1, iw * 2), ih);
        ctx.fillStyle = PROP_PAL.postA;
        ctx.fillRect(x - iw, y - ih, Math.max(1, iw * 2), Math.max(1, Math.round(ih * 0.25)));
        break;
      }
      case 'TREE': {
        const th = Math.round(ih * 0.34);
        ctx.fillStyle = PROP_PAL.trunk;
        ctx.fillRect(x - Math.max(1, Math.round(iw * 0.16)), y - th,
          Math.max(1, Math.round(iw * 0.32)), th);
        ctx.fillStyle = p.seedHue < 0.45 ? PROP_PAL.foliage1 : PROP_PAL.foliage2;
        ctx.beginPath();
        ctx.arc(x, y - ih + ih * 0.30, Math.max(1, ih * 0.32), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'PINE': {
        ctx.fillStyle = PROP_PAL.trunk;
        ctx.fillRect(x - 1, y - Math.round(ih * 0.2), 2, Math.round(ih * 0.2));
        ctx.fillStyle = p.seedHue < 0.5 ? PROP_PAL.pine1 : PROP_PAL.pine2;
        // Three stacked triangles: the cheapest silhouette that still reads as conifer.
        for (let k = 0; k < 3; k++) {
          const top = y - ih + (ih * 0.28) * k;
          const base = top + ih * 0.42;
          const ww = iw * (0.55 + 0.22 * k);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x + ww, base);
          ctx.lineTo(x - ww, base);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'ROCK': {
        ctx.fillStyle = PROP_PAL.rock2;
        ctx.beginPath();
        ctx.moveTo(x - iw, y);
        ctx.lineTo(x - iw * 0.5, y - ih);
        ctx.lineTo(x + iw * 0.4, y - ih * 0.8);
        ctx.lineTo(x + iw, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PROP_PAL.rock1;
        ctx.fillRect(x - Math.round(iw * 0.5), y - ih, Math.max(1, Math.round(iw * 0.5)),
          Math.max(1, Math.round(ih * 0.4)));
        break;
      }
      case 'PYLON': {
        ctx.fillStyle = PROP_PAL.pylon;
        const t = Math.max(1, Math.round(iw * 0.12));
        ctx.fillRect(x - iw * 0.5, y - ih, t, ih);
        ctx.fillRect(x + iw * 0.5 - t, y - ih, t, ih);
        ctx.fillRect(x - iw, y - ih, iw * 2, Math.max(1, Math.round(ih * 0.06)));
        ctx.fillRect(x - iw * 0.6, y - ih * 0.55, iw * 1.2, Math.max(1, Math.round(ih * 0.05)));
        break;
      }
      // The two large props are drawn PROPORTIONALLY, not with constant pixel insets.
      // The first cut framed the board by filling it in the frame colour and insetting the
      // face by exactly 1 px: at 20 m a billboard is ~83 px tall, so a 1 px frame is a
      // rounding error and the sprite read as a bare tan slab with no edge, no post and no
      // ground contact. Every dimension below is a fraction of the sprite's own size, so
      // the same silhouette survives from 4 px tall to full-screen.
      case 'BILLBOARD': {
        const legH = Math.max(1, Math.round(ih * 0.36));
        const bh = ih - legH;
        const fr = Math.max(1, Math.round(Math.min(iw, bh) * 0.11));   // frame thickness
        const postW = Math.max(1, Math.round(iw * 0.13));
        // Ground footing FIRST, so the posts land on it: a dark pad on the verge is what
        // says the thing is standing on the ground rather than floating in front of it.
        ctx.fillStyle = PROP_PAL.boardShadow;
        ctx.fillRect(x - Math.round(iw * 0.62), y - Math.max(1, Math.round(ih * 0.02)),
          Math.max(2, Math.round(iw * 1.24)), Math.max(1, Math.round(ih * 0.035)));
        // Twin support posts, splayed — one central post reads as a lollipop sign.
        ctx.fillStyle = PROP_PAL.boardFrame;
        ctx.fillRect(x - Math.round(iw * 0.52), y - legH, postW, legH);
        ctx.fillRect(x + Math.round(iw * 0.52) - postW, y - legH, postW, legH);
        // A brace across the legs: cheap, and it is the detail that reads as "structure".
        if (legH > 6) {
          ctx.fillRect(x - Math.round(iw * 0.52), y - Math.round(legH * 0.45),
            Math.max(2, Math.round(iw * 1.04)), Math.max(1, Math.round(legH * 0.10)));
        }
        // Frame, then face inset by the frame thickness.
        ctx.fillStyle = PROP_PAL.boardFrame;
        ctx.fillRect(x - iw, y - ih, iw * 2, bh);
        ctx.fillStyle = PROP_PAL.boardFace;
        ctx.fillRect(x - iw + fr, y - ih + fr,
          Math.max(1, iw * 2 - fr * 2), Math.max(1, bh - fr * 2));
        // Two ink bars standing in for lettering. At the size a billboard is legible for
        // (under ~60 m) this is all the era would have drawn anyway, and it keeps the
        // sprite from turning into a white flash-card at the near end.
        ctx.fillStyle = p.seedHue < 0.5 ? PROP_PAL.boardInkA : PROP_PAL.boardInkB;
        ctx.fillRect(x - iw * 0.68, y - ih + bh * 0.26, iw * 1.36, Math.max(1, bh * 0.18));
        ctx.fillRect(x - iw * 0.68, y - ih + bh * 0.58, iw * 0.88, Math.max(1, bh * 0.14));
        break;
      }
      case 'BUILDING': {
        const wallH = Math.round(ih * 0.66);
        // Footing, same reason as the billboard: ground contact is what stops a big sprite
        // reading as a slab pasted over the horizon.
        ctx.fillStyle = PROP_PAL.boardShadow;
        ctx.fillRect(x - Math.round(iw * 1.05), y - Math.max(1, Math.round(ih * 0.02)),
          Math.max(2, Math.round(iw * 2.1)), Math.max(1, Math.round(ih * 0.035)));
        ctx.fillStyle = PROP_PAL.wall;
        ctx.fillRect(x - iw, y - wallH, iw * 2, wallH);
        ctx.fillStyle = PROP_PAL.wallShade;
        ctx.fillRect(x + iw * 0.35, y - wallH, iw * 0.65, wallH);
        ctx.fillStyle = PROP_PAL.roof;
        ctx.beginPath();
        ctx.moveTo(x - iw * 1.1, y - wallH);
        ctx.lineTo(x, y - ih);
        ctx.lineTo(x + iw * 1.1, y - wallH);
        ctx.closePath();
        ctx.fill();
        // Openings, only once they are more than a pixel. A blank wall at close range is
        // the same "flat untextured rectangle" failure the billboard had.
        const winW = Math.round(iw * 0.26), winH = Math.round(wallH * 0.22);
        if (winW >= 2 && winH >= 2) {
          ctx.fillStyle = PROP_PAL.window;
          ctx.fillRect(x - Math.round(iw * 0.66), y - wallH + Math.round(wallH * 0.18), winW, winH);
          ctx.fillRect(x - Math.round(iw * 0.14), y - wallH + Math.round(wallH * 0.18), winW, winH);
          ctx.fillStyle = PROP_PAL.doorway;
          ctx.fillRect(x - Math.round(iw * 0.40), y - Math.round(wallH * 0.42),
            Math.max(2, Math.round(iw * 0.28)), Math.round(wallH * 0.42));
        }
        break;
      }
      case 'WARN': {
        // B13's telegraph. Diamond on a post, in the charge-gauge gold — the only colour on
        // screen that already means "the mechanic is talking to you".
        const postH = Math.round(ih * 0.45);
        ctx.fillStyle = PROP_PAL.warnEdge;
        ctx.fillRect(x - 1, y - postH, 2, postH);
        const d = Math.max(2, (ih - postH) * 0.5);
        ctx.fillStyle = PROP_PAL.warnEdge;
        ctx.beginPath();
        ctx.moveTo(x, y - ih - 1); ctx.lineTo(x + d + 1, y - postH - d);
        ctx.lineTo(x, y - postH + 1); ctx.lineTo(x - d - 1, y - postH - d);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = PROP_PAL.warnFace;
        ctx.beginPath();
        ctx.moveTo(x, y - ih + 1); ctx.lineTo(x + d - 1, y - postH - d);
        ctx.lineTo(x, y - postH - 1); ctx.lineTo(x - d + 1, y - postH - d);
        ctx.closePath(); ctx.fill();
        break;
      }
      default: break;
    }
  }

  // One scanline slab of a road trapezoid: bottom edge (xb,wb,yb), top edge (xt,wt,yt).
  _slab(xb, wb, yb, xt, wt, yt, colour) {
    const ctx = this.ctx;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(xb - wb, yb);
    ctx.lineTo(xb + wb, yb);
    ctx.lineTo(xt + wt, yt);
    ctx.lineTo(xt - wt, yt);
    ctx.closePath();
    ctx.fill();
  }

  // `bgOffset` is the accumulated counter-scroll in pixels, POSITIVE = the background has
  // slid right (a left-hand curve). See spec.js BG_SCROLL for where it comes from; this
  // method only applies it. Everything at optical infinity moves by it — the hill ranks and
  // the sun alike — because the whole point is that they share one heading.
  _drawSky(bgOffset, travelledM = 0) {
    const ctx = this.ctx;
    const horizon = HORIZON_BASE;
    const top = ROAD_Y0;
    const h = horizon - top;
    // Three flat era-style sky bands rather than a smooth gradient.
    ctx.fillStyle = PAL.skyTop;
    ctx.fillRect(0, top, VIEW_W, Math.ceil(h * 0.45));
    ctx.fillStyle = PAL.skyMid;
    ctx.fillRect(0, top + Math.ceil(h * 0.45), VIEW_W, Math.ceil(h * 0.33));
    ctx.fillStyle = PAL.skyLow;
    ctx.fillRect(0, top + Math.ceil(h * 0.78), VIEW_W, h - Math.ceil(h * 0.78));

    // Sun. It is at infinity too, so it counter-scrolls with the hills. BG_SCROLL.maxPx is
    // derived from exactly this circle's clearance to the frame edge, so it stays whole.
    ctx.fillStyle = PAL.sun;
    ctx.beginPath();
    ctx.arc(VIEW_W * SUN_X + bgOffset, top + h * SUN_Y, SUN_R, 0, Math.PI * 2);
    ctx.fill();

    // Distant hills. The silhouette is sampled fresh across three frame-widths every frame,
    // so the far rank can slide arbitrarily far without a seam or a wrap; the near rank
    // moves at BG_SCROLL.nearRankFrac of it. The finite-distance tower is deliberately
    // inserted BETWEEN them: the far ridge cannot swallow its observation deck, while the
    // near ridge still occludes its foot and seats it in the landscape.
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? PAL.hill : PAL.hillLit;
      ctx.beginPath();
      ctx.moveTo(-VIEW_W, horizon);
      const phase = pass === 0 ? 0 : 1.7;
      const amp = pass === 0 ? HILL_MAX_H : HILL_MAX_H * 0.62;
      const off = bgOffset * (pass === 0 ? 1 : BG_SCROLL.nearRankFrac);
      for (let px = -VIEW_W; px <= VIEW_W * 2; px += 4) {
        // MINUS the offset: a feature at pattern coordinate u is drawn at px = u*W + off,
        // i.e. the picture moves WITH the offset. The old code added it, which is why the
        // hills used to slide the wrong way.
        const u = (px - off) / VIEW_W;
        const yy = horizon - amp * (0.5 + 0.5 * Math.sin(u * HILL_COUNT + phase))
          * (0.6 + 0.4 * Math.sin(u * 2.3 + phase));
        ctx.lineTo(px, yy);
      }
      ctx.lineTo(VIEW_W * 2, horizon);
      ctx.closePath();
      ctx.fill();

      if (pass === 0) this._drawDistantTower(bgOffset, horizon, travelledM);
    }
  }

  _drawDistantTower(bgOffset, horizon, travelledM = 0) {
    const ctx = this.ctx;
    const t = DISTANT_TOWER;
    const u0 = clamp(travelledM / t.approachM, 0, 1);
    const u = u0 * u0 * (3 - 2 * u0); // smoothstep: approach without start/end pops
    const scale = t.scaleFar + (t.scaleNear - t.scaleFar) * u;
    const curveParallax = 1 + (t.curveParallaxNear - 1) * u;
    const x = Math.round(VIEW_W * (t.xFrac - t.outwardFrac * u) + bgOffset * curveParallax);
    const baseY = Math.round(horizon + 2 + t.baseDropPx * u);
    const height = Math.round(t.heightPx * scale);
    const mastW = Math.max(3, Math.round(t.mastWidthPx * scale));
    const deckW = Math.max(7, Math.round(t.deckWidthPx * scale));
    const deckH = Math.max(3, Math.round(t.deckHeightPx * scale));
    const spireH = Math.max(4, Math.round(t.spireHeightPx * scale));
    const topY = baseY - height;
    const mastTop = topY + spireH;
    const deckY = mastTop + Math.round(5 * scale);
    const mastX = Math.round(x - mastW / 2);

    ctx.fillStyle = PAL[t.paletteRoles.body];
    ctx.fillRect(x, topY, Math.max(1, Math.round(scale)), spireH);
    ctx.fillRect(mastX, mastTop, mastW, baseY - mastTop);
    ctx.fillRect(Math.round(x - deckW / 2), deckY, deckW, deckH);

    // A single cool edge is enough to keep the 5 px mast readable at 320x224. No beacon:
    // blinking or warm lights are reserved for warnings, traffic and boost feedback.
    ctx.fillStyle = PAL[t.paletteRoles.litEdge];
    ctx.fillRect(mastX + mastW - 1, mastTop + 1, 1, baseY - mastTop - 2);
    ctx.fillRect(Math.round(x - deckW / 2) + 1, deckY + 1, deckW - 2, 1);
  }

  _drawDistantOverpasses(camZ) {
    const ctx = this.ctx;
    const o = DISTANT_OVERPASS;
    const smooth = (v) => { const u = clamp(v, 0, 1); return u * u * (3 - 2 * u); };
    for (const z of o.positionsM) {
      const dz = z - camZ;
      if (dz <= o.visibleNearM || dz >= o.visibleFarM) continue;
      const farAlpha = smooth((o.visibleFarM - dz) / o.fadeInM);
      const nearAlpha = smooth((dz - o.visibleNearM) / o.fadeOutM);
      const alpha = Math.min(farAlpha, nearAlpha);
      if (alpha <= 0) continue;

      // Opposite signs in lateral and depth make the deck cross the screen diagonally.
      // Sampling the same projected centreline tables as the road keeps that diagonal
      // stable through camera motion, curves and grades.
      const a = this._projectScenery(z - o.halfDepthM, -o.halfSpanM, o.heightM);
      const b = this._projectScenery(z + o.halfDepthM, o.halfSpanM, o.heightM);
      const au = this._projectScenery(z - o.halfDepthM, -o.halfSpanM, o.heightM + o.edgeHeightM);
      const bu = this._projectScenery(z + o.halfDepthM, o.halfSpanM, o.heightM + o.edgeHeightM);
      const ad = this._projectScenery(z - o.halfDepthM, -o.halfSpanM, o.heightM - o.deckThicknessM);
      const bd = this._projectScenery(z + o.halfDepthM, o.halfSpanM, o.heightM - o.deckThicknessM);
      if (![a, b, au, bu, ad, bd].every(Boolean)) continue;

      ctx.save();
      ctx.globalAlpha = alpha * 0.82;
      this._quad(a, b, bd, ad, PAL[o.paletteRoles.deck]);
      this._quad(au, bu, b, a, PAL[o.paletteRoles.edge]);

      // Two narrow supports are enough to establish elevation. Their low contrast and
      // terrain-first occlusion prevent them becoming false hazards or lane markers.
      for (const s of [-1, 1]) {
        const t = (s * o.pierInsetM + o.halfSpanM) / (2 * o.halfSpanM);
        const pz = (z - o.halfDepthM) + (2 * o.halfDepthM) * t;
        const px = s * o.pierInsetM;
        const top = this._projectScenery(pz, px, o.heightM - o.deckThicknessM);
        const foot = this._projectScenery(pz, px, 0);
        if (!top || !foot) continue;
        const hw = Math.max(1, o.pierWidthM * top.scale * 0.5);
        this._quad({ sx: top.sx - hw, sy: top.sy }, { sx: top.sx + hw, sy: top.sy },
          { sx: foot.sx + hw, sy: foot.sy }, { sx: foot.sx - hw, sy: foot.sy },
          PAL[o.paletteRoles.pier]);
      }

      ctx.restore();
    }
  }

  _drawOverheadOverpasses(camZ) {
    const ctx = this.ctx;
    const o = DISTANT_OVERPASS;
    const smooth = (v) => { const u = clamp(v, 0, 1); return u * u * (3 - 2 * u); };
    for (const z of o.positionsM) {
      const dz = z - camZ;
      if (dz >= o.overheadFarM || dz <= -o.halfDepthM + o.overheadNearPlaneM) continue;
      const alpha = smooth((o.overheadFarM - dz) / o.overheadFadeM);
      if (alpha <= 0) continue;

      // Parametric diagonal: t=0 is the near/left endpoint, t=1 the far/right one.
      // Clip t against a small camera near plane instead of requiring both original
      // endpoints to project. That is the key to a continuous sweep while one half of
      // the bridge passes behind the camera.
      const z0 = z - o.halfDepthM;
      const spanZ = 2 * o.halfDepthM;
      const tMin = clamp((camZ + o.overheadNearPlaneM - z0) / spanZ, 0, 1);
      if (tMin >= 1) continue;
      const slices = o.overheadSlices;
      const firstSlice = Math.min(slices - 1, Math.floor(tMin * slices));

      ctx.save();
      ctx.globalAlpha = alpha;
      // Far -> near painter order. Each slice is independently near-clipped, so no
      // coordinate approaches the camera plane's 1/dz singularity.
      for (let i = slices - 1; i >= firstSlice; i--) {
        // Boundaries stay at fixed authored world fractions for the whole pass. Only the
        // nearest surviving slice moves at the camera near plane; reparameterising every
        // boundary over the shrinking visible interval made the entire deck crawl and
        // introduced a visible cut whenever ceil(sliceCount) changed.
        const ta = i === firstSlice ? tMin : i / slices;
        const tb = (i + 1) / slices;
        const point = (t, h) => this._projectScenery(
          z0 + spanZ * t,
          -o.halfSpanM + 2 * o.halfSpanM * t,
          h,
        );
        const at = point(ta, o.heightM);
        const bt = point(tb, o.heightM);
        const ab = point(ta, o.heightM - o.deckThicknessM);
        const bb = point(tb, o.heightM - o.deckThicknessM);
        if (![at, bt, ab, bb].every(Boolean)) continue;
        this._quad(at, bt, bb, ab, PAL[o.paletteRoles.underside]);
        // One cool pixel-era rim separates the soffit from the sky without borrowing
        // white lane paint or yellow warning value.
        const ae = point(ta, o.heightM + o.edgeHeightM);
        const be = point(tb, o.heightM + o.edgeHeightM);
        if (ae && be) this._quad(ae, be, bt, at, PAL[o.paletteRoles.edge]);
      }

      // Supports remain scenery: draw only while ahead of the camera and let the later
      // prop/warning pass cover them. Their off-centre placement leaves the road mouth open.
      for (const s of [-1, 1]) {
        const t = (s * o.pierInsetM + o.halfSpanM) / (2 * o.halfSpanM);
        const pz = z0 + spanZ * t;
        if (pz - camZ <= o.overheadNearPlaneM) continue;
        const top = this._projectScenery(pz, s * o.pierInsetM, o.heightM - o.deckThicknessM);
        const foot = this._projectScenery(pz, s * o.pierInsetM, 0);
        if (!top || !foot) continue;
        const hw = Math.max(1, o.pierWidthM * top.scale * 0.5);
        this._quad({ sx: top.sx - hw, sy: top.sy }, { sx: top.sx + hw, sy: top.sy },
          { sx: foot.sx + hw, sy: foot.sy }, { sx: foot.sx - hw, sy: foot.sy },
          PAL[o.paletteRoles.pier]);
      }

      ctx.restore();
    }
  }

  _projectScenery(z, xM, heightM) {
    const f = (z - this._baseZ) / SEG_LEN;
    const n = Math.floor(f);
    if (n < 0 || n >= DRAW_DISTANCE) return null;
    const t = clamp(f - n, 0, 1);
    const sx = this._sx[n] + (this._sx[n + 1] - this._sx[n]) * t;
    const sy = this._sy[n] + (this._sy[n + 1] - this._sy[n]) * t;
    const sc = this._sc[n] + (this._sc[n + 1] - this._sc[n]) * t;
    return { sx: sx + xM * sc, sy: sy - heightM * sc, scale: sc };
  }

  _quad(a, b, c, d, colour) {
    const ctx = this.ctx;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
    ctx.closePath(); ctx.fill();
  }

  // ------------------------------------------------------------------ ending backdrop
  // B6. The dawn coastline the finish ceremony plays in front of. This is a CEREMONY-STATE
  // surface and it is deliberately a SIBLING of renderRoad(), not a mode inside it: it
  // shares beginFrame()/endFrame() (so it is clipped to the same road viewport and can
  // never paint into the HUD) and nothing else. renderRoad and everything it calls is
  // untouched by this method's existence, which is what keeps the race view provably
  // unchanged — the two paths share no state, no table and no branch.
  //
  // Every number is in spec.js's COAST/PAL blocks with its derivation. `t` is the
  // ceremony's own clock in seconds; the whole picture is a pure function of it, so there
  // is nothing to reset when the ceremony is entered, left or re-entered.
  renderCoast(t) {
    const ctx = this.ctx;
    const horizon = HORIZON_BASE;
    const top = ROAD_Y0;
    const h = horizon - top;
    const groundH = ROAD_Y1 - horizon;
    const shoreY = Math.round(horizon + groundH * COAST.shoreFrac);

    // The projection tables belong to the road; nothing may call project() off a coast
    // frame and get a stale answer from the last race frame.
    this._ready = false;
    this._horizon = horizon;

    // ---- sky: three flat dawn bands, warm only at the bottom, plus the horizon glow ----
    const hTop = Math.ceil(h * COAST.sky.topFrac);
    const hMid = Math.ceil(h * COAST.sky.midFrac);
    ctx.fillStyle = PAL.dawnSkyTop; ctx.fillRect(0, top, VIEW_W, hTop);
    ctx.fillStyle = PAL.dawnSkyMid; ctx.fillRect(0, top + hTop, VIEW_W, hMid);
    ctx.fillStyle = PAL.dawnSkyLow;
    ctx.fillRect(0, top + hTop + hMid, VIEW_W, h - hTop - hMid);
    ctx.fillStyle = PAL.dawnGlow;
    ctx.fillRect(0, horizon - COAST.sky.glowPx, VIEW_W, COAST.sky.glowPx);

    // ---- the sun, rising. Drawn BEFORE the sea, so the sea cuts it off at the waterline
    // and it reads as coming out of the water rather than as a disc pasted over it. ----
    const rise = clamp(t / COAST.sun.riseS, 0, 1);
    const sunX = VIEW_W * COAST.sun.xFrac;
    const sunY = horizon + COAST.sun.y0 + (COAST.sun.y1 - COAST.sun.y0) * rise;
    ctx.fillStyle = PAL.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, COAST.sun.r, 0, Math.PI * 2);
    ctx.fill();

    // ---- sea: three bands, lightest at the horizon (it is reflecting the glow) ----
    const seaSplit = [0.30, 0.62, 1.0];
    const seaCols = [PAL.dawnSeaFar, PAL.dawnSeaMid, PAL.dawnSeaNear];
    let yPrev = horizon;
    for (let i = 0; i < 3; i++) {
      const yNext = i === 2 ? shoreY : Math.round(horizon + (shoreY - horizon) * seaSplit[i]);
      ctx.fillStyle = seaCols[i];
      ctx.fillRect(0, yPrev, VIEW_W, yNext - yPrev);
      yPrev = yNext;
    }

    // ---- headlands. Two ranks standing ON the horizon line and rising into the sky, so
    // they are painted after the sea (which owns everything below the line) and over the
    // sun (the sun is behind the land, which is the whole reason a headland reads as far
    // away). Same two-sine silhouette the road's own hills use. ----
    // The offsets are POSITIVE multiples of t: sampling the silhouette at (px + t*speed)
    // moves each feature LEFT across the frame, which is the direction the world moved
    // while the player was driving. (Negating it scrolls the coast backwards — measured,
    // not assumed: scratchpad/b6probe.mjs reads the per-layer displacement off the frame
    // buffer and caught exactly that sign error.)
    this._coastRidge(t * COAST.scroll.farHill, horizon, COAST.hills.farAmp,
      COAST.hills.k1, 0, PAL.dawnLandFar);
    this._coastRidge(t * COAST.scroll.headland, horizon, COAST.hills.nearAmp,
      COAST.hills.k2, 2.1, PAL.dawnLandNear);

    // ---- glitter path: the sun's reflection, widening toward the viewer. Deterministic
    // dashes off the clock — the era drew shimmer as blinking dashes, and an RNG here would
    // fizz as noise between frames (the same rule _drawSpeedLines follows). ----
    const g = COAST.glitter;
    for (let y = horizon + 1; y < shoreY; y += g.dashPx) {
      const u = (y - horizon) / (shoreY - horizon);
      const w = g.wTop + (g.wBottom - g.wTop) * u;
      // One dash per row-band, its phase a function of depth and time; the modulo gate is
      // what makes the column broken rather than a solid gold bar (which would be a second
      // bright mass competing with the text).
      const ph = Math.sin(u * 9.1 + t * g.rate) * 0.5 + 0.5;
      if (ph < g.gate && u > g.weldFrac) continue;
      const dw = Math.max(1, Math.round(w * (0.25 + 0.5 * ph)));
      ctx.fillStyle = ph > 0.8 ? PAL.sun : PAL.dawnGlow;
      ctx.fillRect(Math.round(sunX - dw / 2 + Math.sin(u * 5.3 + t) * g.wobble), y,
        dw, Math.max(1, g.dashPx - 1));
    }

    // ---- the near foreland the coast road runs along: a wavy dark edge, the darkest mass
    // in the frame, carrying the fastest scroll. The surf line is drawn on its own edge. ----
    const off = t * COAST.scroll.foreland;
    const surfOff = t * COAST.scroll.surf;
    ctx.fillStyle = PAL.dawnForeland;
    ctx.beginPath();
    ctx.moveTo(0, ROAD_Y1);
    for (let px = 0; px <= VIEW_W; px += 2) {
      ctx.lineTo(px, this._forelandY(px + off, shoreY));
    }
    ctx.lineTo(VIEW_W, ROAD_Y1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PAL.dawnSurf;
    for (let px = 0; px < VIEW_W; px += 2) {
      // The surf runs along the land's edge but at its own speed, so the water reads as
      // moving against the shore instead of the shore reading as a moving object.
      if ((Math.sin((px + surfOff) * 0.11) + Math.sin((px + surfOff) * 0.041)) < 0.15) continue;
      const y = Math.round(this._forelandY(px + off, shoreY));
      ctx.fillRect(px, y - COAST.foreland.surfPx, 2, COAST.foreland.surfPx);
    }
  }

  // The foreland's top edge at screen x. Period is exactly VIEW_W, so the layer wraps
  // seamlessly however long the ceremony runs.
  _forelandY(x, shoreY) {
    const u = (x / VIEW_W) * Math.PI * 2;
    return shoreY + COAST.foreland.amp * (Math.sin(u * 2) * 0.6 + Math.sin(u * 3 + 1.1) * 0.4);
  }

  // One headland rank: a filled silhouette standing on `baseY` and rising `amp` px into the
  // sky. Two sines with a shared period of VIEW_W so the rank is seamless when it wraps.
  _coastRidge(offset, baseY, amp, k, phase, colour) {
    const ctx = this.ctx;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let px = 0; px <= VIEW_W; px += 4) {
      const u = ((px + offset) / VIEW_W) * Math.PI * 2;
      const y = baseY - amp * (0.5 + 0.5 * Math.sin(u * k + phase))
        * (0.55 + 0.45 * Math.sin(u * 2 + phase * 1.7));
      ctx.lineTo(px, y);
    }
    ctx.lineTo(VIEW_W, baseY);
    ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------------ sprites
  // Pixels-per-metre on the road surface at screen row y. Inverse of the ring projection:
  // dyh = segAbove*CAMERA_DEPTH*SCREEN_HALF/dz and sc = CAMERA_DEPTH*SCREEN_HALF/dz, so
  // sc collapses to dyh/camAbove. The player sprite is sized and steered through this so
  // it cannot drift out of scale with the road it is standing on.
  metresToPixelsAtY(y) {
    const dyh = Math.max(1, y - (this._horizon != null ? this._horizon : HORIZON_BASE));
    return dyh / Math.max(0.2, this._camAbove != null ? this._camAbove : CAMERA_HEIGHT);
  }

  roadHalfWidthAtY(y) {
    return HALF_W * this.metresToPixelsAtY(y);
  }

  project(z, x, yOffset) {
    const miss = { sx: 0, sy: 0, scale: 0, visible: false };
    if (!this._ready) return miss;
    if (z < this._camZ) return miss;                 // behind the camera
    // Ring n is at _baseZ + n*SEG_LEN. Measuring f from the CAMERA instead put every
    // sprite (camZ - _baseZ)/SEG_LEN rings too near — a value that ramps 0 -> 1 and snaps
    // back every 8 m of travel, so a rival held at a constant relative depth slid ~5 px
    // down the screen and grew 23% in scale, then jumped back: the opponent depth jitter.
    const f = (z - this._baseZ) / SEG_LEN;
    const n = Math.floor(f);
    if (n >= this._n) return miss;
    const t = f - n;

    // Scale is 1/dz — a HYPERBOLA. Reading it out of _sc by linear interpolation
    // reconstructs a chord of that hyperbola: harmless past ~50 m (0.4% error), ruinous in
    // the last few metres, where a chord across one 8 m segment overshoots by 20%+ and the
    // error re-sweeps every time the segment grid slides under the camera. On top of that
    // _sc's nearest entries are FOLDED at nearZ (see NEAR_PAD_PX) — deliberately non-
    // physical, so a near sprite inherited a clamp meant only to stop the road's own 1/dz
    // blow-up, and inherited it intermittently, because which rings fall inside nearZ
    // changes as the camera crosses each segment boundary.
    // So: take dz exactly, and interpolate only the world-space fields, which are smooth.
    const dz = Math.max(z - this._camZ, 1e-3);
    const sc = ((this._camDepth || CAMERA_DEPTH) / dz) * SCREEN_HALF;
    // cx is a QUADRATIC in distance (piecewise-constant curvature, integrated twice), so a
    // linear read between two rings reconstructs a chord of that parabola. The chord error
    // peaks at c*CURVE_ACCUM/8 metres mid-segment and sweeps back to zero every time the
    // grid slides 8 m under the camera — invisible far away, but multiplied by sc it became
    // a 2.85 px/tick lateral judder on a rival at point-blank range (sim.test.mjs §5), and
    // it grew in exact proportion to CURVE_ACCUM, which is why raising CURVE_ACCUM for B14
    // is what surfaced it. Same class as the depth judder fixed above: a smooth world field
    // sampled on the segment grid and rebuilt with the wrong basis. Evaluate the parabola
    // instead; at t=1 this equals _cx[n+1] exactly, so rings and sprites cannot disagree.
    const cxm = this._cx[n] + t * (this._cxd[n] + 0.5 * this._cxc[n] * t);  // metres
    const segY = this._segY[n] + (this._segY[n + 1] - this._segY[n]) * t; // metres

    const lim = lateralLimit(sc);
    const lateral = clamp(cxm * sc, -lim, lim);
    const cy = this._horizon - (segY - this._camY) * sc;
    const sx = SCREEN_HALF + lateral - this._camXm * sc + (x || 0) * HALF_W * sc;
    const sy = cy - (yOffset || 0) * sc;

    // Occlusion is reported, NOT applied. `clip` is the row from the very table the road
    // was drawn with: a crest hides everything BELOW it. Folding that into `visible` culled
    // a sprite whole the moment its ground row went behind a brow — so a car on the far
    // side of a crest vanished entirely instead of showing its roof above the brow, which
    // is one of the defining looks of the genre. Callers clip to `clip` (see drawSprite)
    // and the car now emerges roof-first. `visible` is therefore purely "in front of the
    // camera, inside the draw distance, and somewhere in the frame".
    const clip = Math.min(this._clip[n], ROAD_Y1);
    const visible = sy > ROAD_Y0 && sy < ROAD_Y1 + sc * 8;
    return { sx, sy, scale: sc, visible, clip };
  }

  drawSprite(z, x, drawFn) {
    const p = this.project(z, x, 0);
    if (!p.visible) return p;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ROAD_Y0, VIEW_W, Math.max(0, this._clipAt(z) - ROAD_Y0));
    ctx.clip();
    drawFn(ctx, p.sx, p.sy, p.scale);
    ctx.restore();
    return p;
  }

  _clipAt(z) {
    const f = (z - this._baseZ) / SEG_LEN;
    const n = clamp(Math.floor(f), 0, this._n);
    return Math.min(this._clip[n], ROAD_Y1);
  }
}
