// DRAFT LINE — roadside props (B12).
//
// WHY THIS EXISTS, and why it is not decoration:
//
// 1. Speed in this genre is read from NEAR-FIELD PARALLAX, not from the road surface. The
//    road's own rumble/band strobe is periodic and centred; it says "moving", it does not
//    say "fast". What says fast is a solid object entering the frame at the edge, growing
//    without bound and leaving sideways in a fraction of a second. With an empty verge the
//    outer thirds of the frame were a flat green field with literally zero moving pixels.
// 2. B13's brake-requiring corners have to be telegraphed to be fair. That needs a physical
//    object standing at a derived distance before the corner. See WARN below — the hook is
//    already here, the corner class that feeds it is not (that is B13's job).
//
// ---------------------------------------------------------------------------------------
// DETERMINISM CONTRACT — the load-bearing constraint on this file.
//
// Every balance number in this project is measured against seeded course generation, and
// test/playable.test.mjs contracts on 32 seeds. Props are therefore generated from a
// SEPARATE, INDEPENDENTLY-SEEDED RNG STREAM (`makeRng(seed ^ PROP_STREAM_SALT)`), built
// LAZILY and cached off to the side of the Course object. Nothing in here draws a single
// number from the stream that produces curvature, elevation, traffic or pack layout, and
// nothing in here mutates the course. Consequence, verified by diffing the whole
// playable.test.mjs report before and after this module existed: every per-driver number is
// byte-identical. If that ever stops being true, the bug is here, not in the balance.
// ---------------------------------------------------------------------------------------

import { SEG_LEN, ROAD_WIDTH } from './spec.js';
import { makeRng } from './rng.js';

// Any odd 32-bit constant works; this one is the golden-ratio word used elsewhere in the
// codebase's hashing idiom. It only has to be a stream the course generator never visits.
const PROP_STREAM_SALT = 0x9e3779b9;

// ---- geometry ----------------------------------------------------------------------
// x is in ROAD HALF-WIDTHS, same units as traffic/rival x, so 1.0 is the white line.
// The rumble strip runs to 1.14 (RUMBLE_FRAC in render.js), so nothing may start inside
// 1.25 or it reads as an object standing ON the road.
const VERGE_MIN = 1.30;
// The lateral band is not a taste call, it is arithmetic. A prop leaves the frame sideways
// when |x| * HALF_W * sc > SCREEN_HALF, and sc = CAMERA_DEPTH * SCREEN_HALF / dz, so it
// exits at dz = |x| * HALF_W * CAMERA_DEPTH = |x| * 8.66 m. That is the whole design:
//   x = 1.5  ->  on screen until 13 m,  and at 25 m it is already 60 px tall at the edge;
//   x = 4.4  ->  gone from the frame at 38 m, while still only ~9 px tall.
// A prop parked far off the verge therefore never contributes near-field motion at all —
// it shrinks out of relevance before it ever reaches the frame edge. The first cut of this
// file used bands of [1.3, 2.6] / [2.6, 5.2] and measured 0.1% edge coverage: the props
// were there, they were just never big and on-screen at the same time.
const NEAR_BAND = [1.30, 2.05];
const FAR_BAND = [2.05, 4.20];
// Large occluders (billboards, buildings) are pushed further out: they are the only props
// that could plausibly mask a car, and distance is the cheapest half of that guarantee.
//
// CENTRE vs EDGE — this was a real defect, not a tuning nicety. A prop's `x` is its CENTRE,
// but a large prop is metres wide, and the first cut placed BILLBOARD and BUILDING at a
// flat centre offset of 2.10 half-widths with no account of their own footprint:
//   BILLBOARD half-width 5.0 m at max jitter -> near face 5.5 m from the centreline = 1.11
//   BUILDING  half-width 7.4 m at max jitter -> near face 3.1 m from the centreline = 0.61
// The road edge is 1.00. So a building's near wall stood INSIDE the tarmac. That is what
// produced the screen-filling tan slab: an object overhanging the road can never exit the
// frame sideways however close it gets, so its projected width grows without bound as
// dz -> 0 while every other prop has long since swept off the edge.
// Large props are therefore placed by their NEAR EDGE: |x| >= VERGE_MIN + halfWidth/HALF_W,
// evaluated per prop with its own size jitter. The consequence that matters downstream is
// that the near face now clears the verge by construction, so the prop is guaranteed to be
// fully off-frame before it reaches the near plane — which is what makes the near-plane
// cull in render.js pop-free rather than merely bounded.
const LARGE_X_MIN = 2.10;
const HALF_W_M = ROAD_WIDTH / 2;

// ---- the prop kinds ------------------------------------------------------------------
// `h` is height in metres, `w` half-width in metres — both real world units, because
// drawSprite hands the draw function a pixels-per-metre scale and everything else in this
// renderer is sized off metres. `occluder` marks the kinds the fairness rules police.
export const PROP_KINDS = {
  POST:      { h: 1.2,  w: 0.10, occluder: false },  // marker post — the cheap parallax unit
  TREE:      { h: 7.5,  w: 1.8,  occluder: false },  // broadleaf
  PINE:      { h: 11.0, w: 1.3,  occluder: false },
  ROCK:      { h: 2.2,  w: 2.0,  occluder: false },
  PYLON:     { h: 16.0, w: 3.0,  occluder: false },  // far only, never near the verge
  BILLBOARD: { h: 6.0,  w: 4.0,  occluder: true },
  BUILDING:  { h: 8.0,  w: 6.0,  occluder: true },
  WARN:      { h: 2.6,  w: 1.1,  occluder: false },  // B13's telegraph. See placeWarnings().
};

// ---- per-leg character mixes ---------------------------------------------------------
// Leg character is (curve, elev) — 'fast|flowing|technical' x 'flat|rolling|mountain'.
// The curve character sets the DENSITY and the small-prop rhythm; the elevation character
// sets the vegetation/terrain palette. That split is deliberate: density is a statement
// about how fast the leg is meant to feel, palette is a statement about where it is.
//
// spacing = mean metres between props on each side. A prop crosses the frame edge in
// roughly (spacing / v) seconds, so at racing speed (~110 m/s) a 34 m spacing is ~3 props
// per second per side — enough to read as continuous motion without becoming a picket fence.
const CURVE_PROFILE = {
  // A fast leg is open country: sparse, big, far back. Sparse is correct here — on a
  // straight at full speed the eye tracks the vanishing point, and a dense verge just
  // fizzes. The billboards do the work.
  fast:      { spacing: 34, nearFrac: 0.60, big: 0.30 },
  // A flowing leg lines the road: the verge is what tells you the road is bending before
  // the tarmac does, so it wants continuity, not landmarks.
  flowing:   { spacing: 26, nearFrac: 0.76, big: 0.14 },
  // A technical leg is dense and close and almost all small: marker posts at corner entry
  // are the genre's actual practice and they give the tightest read on rotation.
  technical: { spacing: 20, nearFrac: 0.86, big: 0.08 },
};
// Weights over the small-prop palette per elevation character.
const ELEV_PALETTE = {
  flat:     { POST: 0.42, TREE: 0.34, PINE: 0.04, ROCK: 0.04, PYLON: 0.16 },
  rolling:  { POST: 0.30, TREE: 0.46, PINE: 0.14, ROCK: 0.06, PYLON: 0.04 },
  mountain: { POST: 0.26, TREE: 0.08, PINE: 0.44, ROCK: 0.22, PYLON: 0.00 },
};
// Large-prop palette per elevation character. Mountains get no billboards worth the name.
const ELEV_LARGE = {
  flat:     { BILLBOARD: 0.62, BUILDING: 0.38 },
  rolling:  { BILLBOARD: 0.55, BUILDING: 0.45 },
  mountain: { BILLBOARD: 0.30, BUILDING: 0.70 },
};

// ---- the exclusion rules -------------------------------------------------------------
// Reused verbatim from course.js's traffic rules — NOT re-derived, and deliberately so:
// D = course.blindCrestExclusionM = 45.4 m on the stock spec, the distance in which a
// player must be able to see a hazard and still steer clear of it.
const BLIND_CURVE = 0.4;   // same threshold the blind-corner traffic rule uses
const BLIND_SEGS = 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function pickWeighted(rng, mix) {
  let total = 0;
  for (const k in mix) total += mix[k];
  let r = rng.range(0, total);
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return Object.keys(mix)[0];
}

// May a LARGE (occluding) prop stand at z?
//
// Three clauses, all of them a reuse of an existing rule rather than a new number:
//
// 1. BLIND-CORNER. A billboard on the inside of a bend stands exactly where the sight line
//    across the corner passes. Traffic is already banned from |curve| > 0.4 and the two
//    segments after it; an occluder is banned from the same window, plus BLIND_SEGS
//    segments BEFORE it as well — because the thing an occluder hides is what is AHEAD of
//    it, so its exclusion zone has to extend forward along the road, not just backward.
// 2. BLIND-CREST. The prop's own position must be crest-fair by course._crestFair(): a
//    billboard that leaps out of a brow is the same defect as a car that does.
// 3. TRAFFIC SHADOW. No occluder within D metres BEFORE any traffic car (and a car length
//    or so after it). D is the exact distance the blind-crest derivation says the player
//    needs to see a car and get out of its way, so an occluder anywhere in that window is
//    by construction able to eat the whole reaction budget. This is the clause that makes
//    "a billboard that hides traffic is a fairness bug" a checkable statement.
function largePropAllowed(course, z, D, trafficZ) {
  const i = Math.floor(z / SEG_LEN);
  for (let k = -BLIND_SEGS; k <= BLIND_SEGS; k++) {
    const s = course.segments[i + k];
    if (s && Math.abs(s.curve) > BLIND_CURVE) return false;
  }
  if (!course._crestFair(z)) return false;
  // trafficZ is sorted; a linear scan over the local window is enough at this call rate.
  for (let t = 0; t < trafficZ.length; t++) {
    const cz = trafficZ[t];
    if (cz < z - 12) continue;
    if (cz > z + D) break;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------
// buildProps(course) -> Array<{ z, x, kind, side, scale, seedHue, warnFor }>, sorted by z.
//
// Pure function of course.seed. Does not read, and cannot read, the course's own RNG.
// ---------------------------------------------------------------------------------------
export function buildProps(course) {
  // The renderer is also driven against synthetic stub courses (the projection-geometry
  // regressions in sim.test.mjs use a bare flat-road object with no legs and no seed).
  // A verge is meaningless there and must not be an error: props are presentation, and
  // presentation may never be the reason a geometry probe cannot run.
  if (!Array.isArray(course.legs) || !Array.isArray(course.legCharacter)) return [];
  const rng = makeRng(((course.seed >>> 0) ^ PROP_STREAM_SALT) >>> 0);
  const D = course.blindCrestExclusionM || 0;
  const trafficZ = (course.traffic || []).map((c) => c.z);
  const out = [];

  for (const l of course.legs) {
    const ch = course.legCharacter[l.leg - 1];
    const prof = CURVE_PROFILE[ch.curve] || CURVE_PROFILE.flowing;
    const smallMix = ELEV_PALETTE[ch.elev] || ELEV_PALETTE.rolling;
    const largeMix = ELEV_LARGE[ch.elev] || ELEV_LARGE.rolling;

    // Each side of the road is walked independently, so the two verges do not pulse in
    // lockstep — a symmetric verge reads as a corridor and kills the sense of an open road.
    for (const side of [-1, 1]) {
      let z = l.startZ + rng.range(0, prof.spacing);
      while (z < l.endZ) {
        const big = rng.next() < prof.big;
        let kind = big ? pickWeighted(rng, largeMix) : pickWeighted(rng, smallMix);
        // Drawn before the branch so the stream advances identically whichever way the
        // legality test goes — a downgraded prop must not shift every later prop on the leg.
        const jitter = rng.range(0.82, 1.24);
        let x;
        if (big) {
          if (!largePropAllowed(course, z, D, trafficZ)) {
            // Downgrade rather than skip: a hole in the verge is a hole in the parallax,
            // and the reason for the exclusion is the OCCLUDER, not the position.
            kind = pickWeighted(rng, smallMix);
            x = rng.range(NEAR_BAND[0], NEAR_BAND[1]);
          } else {
            // Clear the verge with the prop's OWN near edge, not with its centre.
            const edgeMin = VERGE_MIN + (PROP_KINDS[kind].w * jitter) / HALF_W_M;
            const lo = Math.max(LARGE_X_MIN, edgeMin);
            x = rng.range(lo, lo + 1.6);
          }
        } else if (kind === 'PYLON') {
          x = rng.range(FAR_BAND[0] + 1.4, FAR_BAND[1]);
        } else {
          const near = rng.next() < prof.nearFrac;
          const band = near ? NEAR_BAND : FAR_BAND;
          x = rng.range(band[0], band[1]);
        }
        out.push({
          z,
          x: side * Math.max(VERGE_MIN, x),
          kind,
          side,
          scale: jitter,                  // per-prop size jitter, so a row of trees is a row
          seedHue: rng.next(),            // stable per-prop colour jitter
          warnFor: null,
        });
        // Jittered spacing: a fixed pitch beats against the 8 m band strobe and produces a
        // visible moire on straights.
        z += prof.spacing * rng.range(0.55, 1.5);
      }
    }
  }

  placeWarnings(course, out, D);
  out.sort((a, b) => a.z - b.z);
  return out;
}

// ---------------------------------------------------------------------------------------
// B13's TELEGRAPH — the hook this file shipped for B12, now live (2026-08-11, sixth pass).
//
// course.js publishes its brake-requiring corners as
//   course.brakeCorners = [{ z, dir: -1|1, severity: 0..1 }, ...]
// and every one of them gets a WARN sign on the OUTSIDE of the corner, standing at least
// `D` metres before the corner entry — D being the same 45.4 m sight-distance derivation
// the blind-crest rule uses, i.e. the distance in which a player can see a hazard and still
// act on it. Nothing else in this file, in render.js, or in game.js needed to change when
// the corner class arrived — the prediction B12 made about its own hook held exactly.
//
// Measured on the live class (sim.test.mjs §13, 12 seeds x 7 corners): every corner is
// signed, the nearest sign stands 68.0 m ahead against D = 45.4 m, all of them on the
// outside of the corner, all of them in view over the terrain from a further D back, and
// the smallest is 10.6 px tall on a 224 px screen at the distance it stands at.
// ---------------------------------------------------------------------------------------
export function placeWarnings(course, out, D) {
  const corners = course.brakeCorners;
  if (!Array.isArray(corners)) return;
  for (const c of corners) {
    // One sign margin past the bare sight distance: D is the distance to *steer* clear at
    // full speed, and a brake decision needs to be legible before that, not exactly at it.
    const z = Math.max(0, c.z - D * 1.5);
    if (z <= 0) continue;
    out.push({
      z,
      x: (c.dir > 0 ? -1 : 1) * 1.55,   // outside of the corner: the side you are looking at
      kind: 'WARN',
      side: c.dir > 0 ? -1 : 1,
      scale: 1,
      seedHue: 0,
      warnFor: c,
    });
  }
}

// Cache, keyed off the Course instance. The course object is never mutated by this module
// beyond this one WeakMap entry's existence, so nothing about course generation can be
// perturbed by whether props were ever asked for.
const CACHE = new WeakMap();

export function propsFor(course) {
  let p = CACHE.get(course);
  if (!p) { p = buildProps(course); CACHE.set(course, p); }
  return p;
}

// Exported for the measurement harness in scratchpad/.
export const PROP_GEOMETRY = { VERGE_MIN, NEAR_BAND, FAR_BAND, LARGE_X_MIN, ROAD_WIDTH, clamp };
