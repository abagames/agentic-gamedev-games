// DRAFT LINE — course generation.
// Builds the entire 8-leg course deterministically from a seed at construction time.
// All gameplay numbers come from spec.js; nothing here is tuned locally except the
// generator's own shape parameters, which are declared as named consts below.
//
// ---------------------------------------------------------------------------------
// 2026-08-11 REWRITE: from a bounded random walk to a FEATURE SEQUENCER.
//
// The old generator was `curve[i] = clamp(curve[i-1] + rand(+-0.25), +-cmax)` with a pull
// toward zero, and the same idea on the elevation slope. Measured over 24 seeds, that
// produced a road with no structure at all:
//   - 88% of every leg sat in the "gentle"/"sweeper" band (|curve| 0.05-0.60);
//   - the longest genuinely straight stretch in an entire 2500 m leg was 23 METRES;
//   - the per-leg curvature histogram was the same on every leg to within a few percent,
//     because a zero-mean walk with a restoring force converges to one distribution and
//     the only thing that changed between legs was the clamp;
//   - total elevation range across a whole leg was 6.6-9.2 m, i.e. no hill worth the name.
// A driver cannot learn a road like that, and no leg is distinguishable from any other.
//
// The road is now COMPOSED from named features (STRAIGHT / KINK / SWEEPER / ESS / HAIRPIN,
// and FLAT / CLIMB / DESCENT / CREST / DIP for the vertical), sequenced per leg according
// to a per-leg CHARACTER that is itself drawn from the seed. Everything is still a pure
// function of the seed, and the important property of the old rule — that curvature never
// changes faster than CURVE_STEP per segment, so the car is never asked to counter a step
// change — is preserved BY CONSTRUCTION (each transition gets a ramp sized from its own
// magnitude) and asserted in _selfCheck().
//
// Deliberately NOT done: raising maxCurvature(). The brief's preferred lever is contrast,
// and contrast is what was missing — the old road had no straights, so a 0.9 corner arrived
// in the middle of a 0.4 corner and read as more of the same. A hairpin still peaks at
// maxCurvature(leg) (1.06 on leg 8), exactly as before, so the CENTRIFUGAL invariant in
// spec.js is untouched. What changed is that it now arrives after 200-400 m of true zero.
// ---------------------------------------------------------------------------------

import {
  SEG_LEN,
  TOTAL_LEGS,
  CAMERA_HEIGHT,
  CENTRIFUGAL,
  VMAX,
  STEER_RATE,
  BOOST,
  HIT,
  legDistance,
  maxCurvature,
  trafficDensity,
  BRAKE_CORNER,
  CURVE_FLAT_MAX,
  brakeCornerEntrySpeed,
} from './spec.js';
import { makeRng } from './rng.js';

// ---- generator shape parameters (course-shape detail, not gameplay balance) ----
const CURVE_STEP = 0.25;       // hard ceiling on |curve[i] - curve[i-1]|, from the contract
const CURVE_RAMP_RATE = 0.16;  // mean curvature change per segment inside a ramp. Smoothstep's
                               // peak slope is 1.5x its mean, so the worst per-segment step is
                               // 1.5 * 0.16 = 0.24 < CURVE_STEP. Asserted in _selfCheck().
const CURVE_SNAP = 0.02;       // below this magnitude a plateau is written as exactly 0

// Curvature feature palette. `mag` is a fraction of maxCurvature(leg), `hold` is the
// length in metres the feature sits AT that magnitude (the ramp in and out is extra).
const CURVE_FEATURES = {
  STRAIGHT: { mag: [0, 0],       hold: [150, 420] },
  KINK:     { mag: [0.34, 0.44], hold: [40, 90] },
  SWEEPER:  { mag: [0.55, 0.78], hold: [180, 380] },
  ESS:      { mag: [0.50, 0.70], hold: [110, 190] },  // emitted as two opposite lobes
  HAIRPIN:  { mag: [0.95, 1.00], hold: [56, 112] },
};
// A hairpin is only a hairpin if you arrive at it fast. If the sequencer wants one and the
// previous feature was not a long enough straight, it emits the straight first. This is the
// whole "impression of a stronger corner through contrast" lever.
const HAIRPIN_RUNUP_M = 220;

// ---- brake corners (B13) -------------------------------------------------------------
// The exception class. Exactly BRAKE_CORNER.perLeg of these per leg from BRAKE_CORNER
// firstLeg onward, at a curvature that spec.js derives to be above CURVE_FLAT_MAX — i.e.
// ABOVE what any steering input can hold at VMAX. Everything else about the road is
// unchanged, and the CENTRIFUGAL invariant still covers every other segment.
//
// Placement is drawn inside a window rather than at a fixed offset, so the player cannot
// learn "the brake corner is at 60% of the leg" and stop reading the road. The window is
// bounded so the whole feature (run-up + ramp + hold + ramp) fits inside the leg with room
// left for the sequencer to finish it normally.
const BRAKE_AT_FRAC = [0.30, 0.60];
// A corner you cannot take flat, arrived at out of another corner, is not a decision — the
// player is already slow. It gets the same treatment a hairpin gets, and more of it: the
// approach must be genuinely straight so the WARN sign stands against nothing and the speed
// the player arrives with is their own choice. 260 m at VMAX is 2.6 s of clear road, and it
// has to exceed the 68 m the sign stands at plus the 30.4 m the braking itself takes.
const BRAKE_RUNUP_M = 260;

// Per-leg curvature character -> feature weights.
const CURVE_MIX = {
  fast:      { STRAIGHT: 0.50, SWEEPER: 0.34, KINK: 0.16, ESS: 0.00, HAIRPIN: 0.00 },
  flowing:   { STRAIGHT: 0.18, SWEEPER: 0.42, KINK: 0.10, ESS: 0.30, HAIRPIN: 0.00 },
  technical: { STRAIGHT: 0.30, SWEEPER: 0.20, KINK: 0.22, ESS: 0.00, HAIRPIN: 0.28 },
};

// ---- elevation ----
// Elevation is generated as a GRADE (rise per metre) profile with the same ramp machinery,
// then integrated. A crest is therefore literally a vertical curve: grade +g ramping to
// grade -g over a length L, which is the standard highway geometry whose sight distance is
// sqrt(2*h*L/A). That is what makes the blind-brow rule below derivable instead of guessed.
const ELEV_GRADE_MAX = 0.05;   // 5% — steep for a road, readable as a hill on a 160 px view
// Vertical-curve lengths, in metres. This is the single most load-bearing pair of numbers
// in the elevation generator, because over a crest of vertical-curve length L with an
// algebraic grade change A, an eye h above the road sees exactly sqrt(2*h*L/A) ahead.
//   CREST  = 32 m: the shortest vertical curve that still has more than three 8 m segments
//            in it. Continuum sight distance sqrt(2*2.8*32/0.10) = 42.3 m; measured against
//            the actual 8 m segment sampling the renderer occludes with, 48 m — deliberately LESS than the
//            45.4 m the blind-crest rule below demands, so the rule actually fires on real
//            terrain instead of being decorative. This is the "elevation that changes what
//            the player can see" the brief asked for: over the sharpest brow the road ahead
//            is gone for 0.3 s at racing speed.
//   NORMAL = 160 m: every other grade transition (into a climb, out of a descent) is long
//            and smooth, so only the brows are abrupt. A single rate for both made every
//            gentle rise start with a visible kink.
const ELEV_RAMP_CREST_M = 32;
const ELEV_RAMP_NORMAL_M = 160;
const ELEV_Y_MAX = 90;         // metres, absolute elevation envelope
const ELEV_Y_SOFT = 55;        // above this the sequencer biases toward returning to 0
const ELEV_FEATURES = {
  FLAT:    { grade: [0, 0],          hold: [120, 320] },
  CLIMB:   { grade: [0.030, 0.050],  hold: [180, 460] },
  DESCENT: { grade: [0.030, 0.050],  hold: [180, 460] },
  CREST:   { grade: [0.030, 0.050],  hold: [40, 130] },   // up, then straight to down
  DIP:     { grade: [0.030, 0.050],  hold: [40, 130] },   // down, then straight to up
};
const ELEV_MIX = {
  flat:     { FLAT: 0.55, CLIMB: 0.16, DESCENT: 0.16, CREST: 0.09, DIP: 0.04 },
  rolling:  { FLAT: 0.16, CLIMB: 0.14, DESCENT: 0.14, CREST: 0.34, DIP: 0.22 },
  mountain: { FLAT: 0.06, CLIMB: 0.24, DESCENT: 0.24, CREST: 0.30, DIP: 0.16 },
};

const RUNOFF_M = 400;          // metres of straight, flat road appended past the finish

// ---- traffic placement rules ----
const BLIND_CURVE = 0.4;       // |curve| above which the 2 following segments are excluded
const BLIND_SEGS = 2;
const CHECKPOINT_CLEAR_M = 40; // no traffic within this distance of a checkpoint z
// Human reaction budget used to derive the blind-CREST exclusion (see _sightExclusionM).
// This is the one number in that derivation that is not read off another constant: it is a
// simple-visual-choice reaction time, ~18 frames at 60 Hz. Everything else in the rule is
// computed from spec.js.
const REACTION_S = 0.30;

// ---- traffic properties ----
const TRAFFIC_X_MAX = 0.72;    // normalised lateral limit for parked-in traffic
const TRAFFIC_SPEED_MIN = 0.42;
const TRAFFIC_SPEED_MAX = 0.78;
const TRAFFIC_PLACE_TRIES = 40;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (t) => t * t * (3 - 2 * t);

export class Course {
  constructor(seed) {
    // Recorded so that things which must be deterministic from the seed but must NOT
    // perturb course generation (roadside props, see src/props.js) can open their own
    // independently-salted RNG stream. Storing it draws nothing from `rng`, so every
    // generated number below is bit-for-bit what it was before this line existed.
    this.seed = seed >>> 0;
    const rng = makeRng(seed >>> 0);

    // ---------------------------------------------------------------- legs
    // Cumulative leg boundaries. legs[i] describes leg i+1.
    this.legs = [];
    let acc = 0;
    for (let leg = 1; leg <= TOTAL_LEGS; leg++) {
      const len = legDistance(leg);
      this.legs.push({ leg, startZ: acc, endZ: acc + len, length: len });
      acc += len;
    }
    this.raceLength = acc;                 // 17120 m for the stock formula
    this.totalLength = acc + RUNOFF_M;     // includes the post-finish run-off

    // Checkpoints sit on the cumulative leg boundaries; the 8th is the finish.
    this.checkpoints = this.legs.map((l) => ({ leg: l.leg, z: l.endZ }));
    // (B5, 2026-08-11) `finishZ` used to be published here as well. It was an exact alias
    // of `raceLength` (the 8th checkpoint sits on the cumulative leg boundary by
    // construction) and nothing in src/ or test/ ever read it — a second name for the
    // finish line is a way for the two to drift apart, not a convenience. Removed;
    // use `raceLength`, or `checkpoints[TOTAL_LEGS - 1].z` if you want it as an event.

    // ---------------------------------------------------------------- segments
    const nSeg = Math.ceil(this.totalLength / SEG_LEN);
    this.segments = new Array(nSeg);
    for (let i = 0; i < nSeg; i++) {
      const z = i * SEG_LEN;
      this.segments[i] = {
        index: i, z, curve: 0, y: 0, grade: 0,
        leg: z < this.raceLength ? this.legOf(z) : TOTAL_LEGS,
      };
    }

    // Per-leg character. Leg 1 is always the teaching leg (fast + flat): the player has to
    // learn the tow before the road starts asking questions. The rest are drawn from
    // difficulty-banded multisets, so every seed gets a spread of characters AND the hard
    // ones cannot land early. This is what makes leg 5 feel unlike leg 2.
    this.legCharacter = this._assignCharacters(rng);

    // B13's exception class, filled by _buildCurvature. Published as
    //   brakeCorners: Array<{ z, dir: -1|1, severity: 0..1, leg, apexZ, exitZ, entryV }>
    // `z` is the point at which the curvature first passes CURVE_FLAT_MAX, i.e. the first
    // metre at which no steering input can hold the car at VMAX — the thing the sign has to
    // be ahead of. props.placeWarnings() reads this list and needs nothing else.
    this.brakeCorners = [];
    // z-ranges the elevation generator must leave level, so the WARN sign can see the
    // corner it is warning about. Filled by _emitBrakeCorner, consumed by _buildElevation.
    this._brakeFlatWindows = [];

    this._buildCurvature(rng);
    this._buildElevation(rng);

    // ---------------------------------------------------------------- traffic
    // Sight-distance table has to exist before traffic can be checked for fairness.
    this.blindCrestExclusionM = this._sightExclusionM();
    this.traffic = [];
    for (const l of this.legs) {
      const count = Math.round((trafficDensity(l.leg) * l.length) / 1000);
      for (let k = 0; k < count; k++) {
        let placed = null;
        for (let t = 0; t < TRAFFIC_PLACE_TRIES; t++) {
          const z = rng.range(l.startZ, l.endZ);
          if (!this._trafficAllowed(z)) continue;
          placed = z;
          break;
        }
        if (placed === null) continue; // dense leg with nowhere legal left: skip quietly
        this.traffic.push({
          z: placed,
          x: rng.range(-TRAFFIC_X_MAX, TRAFFIC_X_MAX),
          speedFactor: rng.range(TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX),
          leg: l.leg,
        });
      }
    }
    this.traffic.sort((a, b) => a.z - b.z);

    this._selfCheck();
  }

  // ---------------------------------------------------------------- characters
  _assignCharacters(rng) {
    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng.range(0, i + 1)) % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    // Difficulty bands: legs 2-3 easy, 4-5 middling, 6-8 hard. Shuffling INSIDE a band
    // keeps the ramp monotone while still making the seed matter.
    const cur = [
      'fast',
      ...shuffle(['fast', 'flowing']),
      ...shuffle(['flowing', 'technical']),
      ...shuffle(['flowing', 'technical', 'technical']),
    ];
    const elev = [
      'flat',
      ...shuffle(['flat', 'rolling']),
      ...shuffle(['rolling', 'mountain']),
      ...shuffle(['rolling', 'mountain', 'mountain']),
    ];
    const out = [];
    for (let i = 0; i < TOTAL_LEGS; i++) out.push({ leg: i + 1, curve: cur[i], elev: elev[i] });
    return out;
  }

  _pickWeighted(rng, mix) {
    let total = 0;
    for (const k in mix) total += mix[k];
    let r = rng.range(0, total);
    for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
    return Object.keys(mix)[0];
  }

  // ---------------------------------------------------------------- ramp writer
  // Writes one plateau at `value` into segments[key] starting at cursor i, preceded by a
  // smoothstep ramp from the current value whose LENGTH is sized from the magnitude of the
  // change. That is what bounds the per-segment delta by construction rather than by luck,
  // and it is why the CURVE_STEP contract survives the move away from the random walk:
  // smoothstep's peak slope is 1.5x its mean, so |delta| <= 1.5 * rampRate.
  _emit(state, key, value, holdSegs, snap) {
    const n = this.segments.length;
    const target = Math.abs(value) < snap ? 0 : value;
    const d = target - state.cur;
    const rampSegs = Math.max(2, Math.ceil(Math.abs(d) / state.rampRate));
    for (let k = 1; k <= rampSegs && state.i < n; k++, state.i++) {
      this.segments[state.i][key] = state.cur + d * smoothstep(k / rampSegs);
    }
    state.cur = target;
    for (let k = 0; k < holdSegs && state.i < n; k++, state.i++) {
      this.segments[state.i][key] = state.cur;
    }
  }

  // ---------------------------------------------------------------- curvature
  _buildCurvature(rng) {
    const n = this.segments.length;
    const st = { i: 0, cur: 0, rampRate: CURVE_RAMP_RATE };
    let sign = rng.range(-1, 1) < 0 ? -1 : 1;
    let straightM = 0;          // metres of true straight immediately behind the cursor

    for (const l of this.legs) {
      const endI = Math.min(n, Math.round(l.endZ / SEG_LEN));
      const mix = CURVE_MIX[this.legCharacter[l.leg - 1].curve];
      const cmax = maxCurvature(l.leg);
      // B13. One brake corner per leg, at a seeded position inside the leg. Drawn here
      // (once per leg, unconditionally) so the RNG stream advances identically whether or
      // not this leg is eligible — the same discipline props.js uses for its jitter.
      const brakeFrac = rng.range(BRAKE_AT_FRAC[0], BRAKE_AT_FRAC[1]);
      const brakeHoldSegs = Math.max(3, Math.round(
        rng.range(BRAKE_CORNER.holdM[0], BRAKE_CORNER.holdM[1]) / SEG_LEN));
      let brakeLeft = l.leg >= BRAKE_CORNER.firstLeg ? BRAKE_CORNER.perLeg : 0;
      const brakeZ = l.startZ + l.length * brakeFrac;
      while (st.i < endI) {
        // The exception corner pre-empts the sequencer the moment the cursor reaches its
        // seeded position. It is emitted as a feature like any other — same ramp writer,
        // same CURVE_STEP guarantee — the only difference is the magnitude, which is
        // deliberately above maxCurvature(leg) and therefore above what the CENTRIFUGAL
        // invariant covers. That is the whole of B13's road change.
        if (brakeLeft > 0 && st.i * SEG_LEN >= brakeZ) {
          brakeLeft--;
          straightM = this._emitBrakeCorner(st, sign, brakeHoldSegs, straightM, l.leg);
          sign = -sign;
          continue;
        }
        let kind = this._pickWeighted(rng, mix);
        // A straight is a straight; six of them in a row is an empty leg. Independent draws
        // do produce that (p ~ 1/2000 per pick at the technical mix's 30% weight, and a
        // course makes ~70 draws), and seed 101 leg 7 was exactly that: 1784 m of nothing on
        // a leg whose character is supposed to be `technical`. Once the road has already
        // laid down more than one feature's worth of straight, re-draw from the corners.
        if (kind === 'STRAIGHT' && straightM >= CURVE_FEATURES.STRAIGHT.hold[1]) {
          kind = this._pickWeighted(rng, { ...mix, STRAIGHT: 0 });
        }
        // A hairpin without a run-up is just another corner. Emit the run-up first: this
        // is the entire "make corners feel stronger through contrast" lever, and it is the
        // reason maxCurvature() did not have to be raised.
        if (kind === 'HAIRPIN' && straightM < HAIRPIN_RUNUP_M) {
          const need = Math.max(4, Math.round((HAIRPIN_RUNUP_M - straightM) / SEG_LEN));
          this._emit(st, 'curve', 0, need, CURVE_SNAP);
          straightM += need * SEG_LEN;
          if (st.i >= endI) break;
        }
        const f = CURVE_FEATURES[kind];
        const holdSegs = Math.max(3, Math.round(rng.range(f.hold[0], f.hold[1]) / SEG_LEN));
        const mag = rng.range(f.mag[0], f.mag[1]) * cmax;

        if (kind === 'STRAIGHT') {
          this._emit(st, 'curve', 0, holdSegs, CURVE_SNAP);
          straightM += holdSegs * SEG_LEN;
        } else if (kind === 'ESS') {
          // Two opposite lobes back to back. The ramp between them is the direction change
          // and is the one place the road crosses zero without ever being straight.
          this._emit(st, 'curve', sign * mag, holdSegs, CURVE_SNAP);
          this._emit(st, 'curve', -sign * mag, holdSegs, CURVE_SNAP);
          sign = -sign;
          straightM = 0;
        } else {
          this._emit(st, 'curve', sign * mag, holdSegs, CURVE_SNAP);
          // 65% chance the next corner goes the other way: a road that keeps turning the
          // same way spirals and stops reading as a route.
          if (rng.range(0, 1) < 0.65) sign = -sign;
          straightM = 0;
        }
      }
    }
    // Run-off past the finish: ramp flat and stay flat.
    this._emit(st, 'curve', 0, n, CURVE_SNAP);
    for (; st.i < n; st.i++) this.segments[st.i].curve = 0;
  }

  // ---------------------------------------------------------------- brake corner (B13)
  // Emits: mandatory straight run-up -> ramp -> hold at BRAKE_CORNER.curve -> ramp out ->
  // a short settling straight. Returns the new `straightM` for the caller's sequencer.
  //
  // Every segment it writes is marked `brakeCorner: true`. That flag is what keeps this
  // strictly ADDITIVE: Course._selfCheck() and sim.test.mjs §11 still hold the ordinary
  // maxCurvature(leg) ceiling — the ceiling the CENTRIFUGAL invariant is proved for —
  // against every UNMARKED segment, and the marked ones are checked against their own
  // derived bound instead. Nothing about the ordinary road's proof is renegotiated.
  _emitBrakeCorner(st, sign, holdSegs, straightM, leg) {
    if (straightM < BRAKE_RUNUP_M) {
      const need = Math.max(4, Math.round((BRAKE_RUNUP_M - straightM) / SEG_LEN));
      this._emit(st, 'curve', 0, need, CURVE_SNAP);
      straightM += need * SEG_LEN;
    }
    const i0 = st.i;
    this._emit(st, 'curve', sign * BRAKE_CORNER.curve, holdSegs, CURVE_SNAP);
    // Ramp back out, then a short settle. The exit matters: this is where the player gets
    // the speed back, and a second corner arriving on top of the exit would make the brake
    // decision unreadable in hindsight.
    this._emit(st, 'curve', 0, 8, CURVE_SNAP);
    const i1 = Math.min(st.i, this.segments.length);
    // The telegraph is only a telegraph if the corner is actually in view from the sign.
    // Measured before this existed: 7 of 224 corners over the 32 contract seeds had their
    // entry hidden by a brow from the sign position — the elevation generator's CREST is
    // deliberately blind for ~48 m (see ELEV_RAMP_CREST_M) and 68 m of approach is more
    // than that. Rather than move the sign (which would break the D derivation) or soften
    // crests (which would undo the whole point of the elevation rewrite), the brake
    // corner's own approach is declared a flat window and the elevation sequencer honours
    // it. This is the same shape as the traffic exclusions: a fairness rule that removes
    // terrain from one place rather than weakening it everywhere.
    this._brakeFlatWindows.push({
      z0: i0 * SEG_LEN - BRAKE_RUNUP_M,
      z1: i1 * SEG_LEN,
    });
    let entryI = -1, apexI = i0;
    for (let i = i0; i < i1; i++) {
      this.segments[i].brakeCorner = true;
      const a = Math.abs(this.segments[i].curve);
      if (entryI < 0 && a > CURVE_FLAT_MAX) entryI = i;
      if (a > Math.abs(this.segments[apexI].curve)) apexI = i;
    }
    if (entryI >= 0) {
      const mag = Math.abs(this.segments[apexI].curve);
      this.brakeCorners.push({
        z: entryI * SEG_LEN,
        dir: sign,
        // How far past the flat-out ceiling the corner goes, as a fraction of the ceiling
        // itself. 0 = exactly unholdable at VMAX, 1 = twice the ceiling. Presentation may
        // scale the telegraph off it; the placement rule does not need it.
        severity: Math.max(0, Math.min(1, (mag - CURVE_FLAT_MAX) / CURVE_FLAT_MAX)),
        leg,
        apexZ: apexI * SEG_LEN,
        exitZ: i1 * SEG_LEN,
        entryV: brakeCornerEntrySpeed(mag),
      });
    }
    return 0;
  }

  // ---------------------------------------------------------------- elevation
  // Generated as a GRADE profile with the same ramp machinery, then integrated. A crest is
  // therefore literally a vertical curve — grade +g ramping to grade -g over a length L —
  // which is the standard highway geometry whose sight distance is sqrt(2*h*L/A). That is
  // what makes the blind-brow rule below derivable instead of guessed.
  _buildElevation(rng) {
    const n = this.segments.length;
    // Two ramp rates: brows are short (blind), everything else is long (smooth).
    const rampCrest = (2 * ELEV_GRADE_MAX) / (ELEV_RAMP_CREST_M / SEG_LEN);
    const rampNormal = (2 * ELEV_GRADE_MAX) / (ELEV_RAMP_NORMAL_M / SEG_LEN);
    const st = { i: 0, cur: 0, rampRate: rampNormal };
    let y = 0;   // running estimate, used only to bias the sequencer back toward zero

    for (const l of this.legs) {
      const endI = Math.min(n, Math.round(l.endZ / SEG_LEN));
      const mix = ELEV_MIX[this.legCharacter[l.leg - 1].elev];
      while (st.i < endI) {
        // B13's flat windows come first: inside one, the only legal feature is FLAT, held
        // long enough to cover the rest of the window. The grade ramps to zero over
        // ELEV_RAMP_NORMAL_M/2 at most (80 m for the steepest 5% grade), which is a
        // vertical curve with sight distance sqrt(2*h*L/A) = 95 m — comfortably beyond the
        // 68 m the sign stands at — and the ramp is triggered a margin early so it has
        // finished before the window opens.
        const z = st.i * SEG_LEN;
        const win = this._brakeFlatWindows.find((w) => z >= w.z0 - ELEV_RAMP_NORMAL_M / 2
          && z < w.z1);
        if (win) {
          this._emit(st, 'grade', 0, Math.max(3, Math.ceil((win.z1 - z) / SEG_LEN)), 0);
          continue;
        }
        let kind = this._pickWeighted(rng, mix);
        // Envelope: near the top or bottom of the world, a climb becomes a descent. Keeps
        // |y| inside ELEV_Y_MAX without a clamp, which would put a kink in the profile.
        if (y > ELEV_Y_SOFT && kind === 'CLIMB') kind = 'DESCENT';
        if (y < -ELEV_Y_SOFT && kind === 'DESCENT') kind = 'CLIMB';
        const f = ELEV_FEATURES[kind];
        const holdSegs = Math.max(3, Math.round(rng.range(f.hold[0], f.hold[1]) / SEG_LEN));
        const g = rng.range(f.grade[0], f.grade[1]);
        const s = (kind === 'DESCENT' || kind === 'DIP') ? -1 : 1;

        if (kind === 'FLAT') {
          this._emit(st, 'grade', 0, holdSegs, 0);
        } else if (kind === 'CREST' || kind === 'DIP') {
          // The brow itself: get UP to the approach grade smoothly, then reverse it over
          // the short vertical curve. That reversal is the blind bit.
          this._emit(st, 'grade', s * g, holdSegs, 0);
          st.rampRate = rampCrest;
          this._emit(st, 'grade', -s * g, holdSegs, 0);
          st.rampRate = rampNormal;
          // Net over the pair is ~0; the ramps are symmetric.
        } else {
          this._emit(st, 'grade', s * g, holdSegs, 0);
          y += s * g * holdSegs * SEG_LEN;
        }
        y = clamp(y, -ELEV_Y_MAX, ELEV_Y_MAX);
      }
    }
    st.rampRate = rampNormal;
    this._emit(st, 'grade', 0, n, 0);
    for (; st.i < n; st.i++) this.segments[st.i].grade = 0;

    // Integrate grade -> elevation. The run-off past the finish already ramped to grade 0
    // above, so the ceremony plays out on level road whatever height it ended at.
    let yy = 0;
    for (const seg of this.segments) {
      yy = clamp(yy + seg.grade * SEG_LEN, -ELEV_Y_MAX, ELEV_Y_MAX);
      seg.y = yy;
    }
  }

  // ---------------------------------------------------------------- sight distance
  // Is the ROAD SURFACE at zTarget visible to a camera on the road at zEye?
  // The renderer occludes a sprite when its GROUND row falls below the running crest clip,
  // so the fair test is the ground point, not the roof: a car is fully invisible until its
  // tyres clear the brow. Standard terrain LOS: the target is visible iff the slope from
  // the eye to it is at least the slope from the eye to every point in between.
  _visibleFrom(zEye, zTarget) {
    const i0 = clamp(Math.round(zEye / SEG_LEN), 0, this.segments.length - 1);
    const i1 = clamp(Math.round(zTarget / SEG_LEN), 0, this.segments.length - 1);
    if (i1 <= i0) return true;
    const eyeY = this.segments[i0].y + CAMERA_HEIGHT;
    let worst = -Infinity;
    for (let i = i0 + 1; i < i1; i++) {
      const s = (this.segments[i].y - eyeY) / ((i - i0) * SEG_LEN);
      if (s > worst) worst = s;
    }
    const sTarget = (this.segments[i1].y - eyeY) / ((i1 - i0) * SEG_LEN);
    return sTarget >= worst;
  }

  // ---- the blind-crest exclusion, derived -------------------------------------------
  // A car hidden behind a brow is fair only if, at the instant it becomes visible, the
  // player still has room to get out of the way. Required room:
  //
  //   D = vClose * (tReact + tSteer)
  //
  //   vClose : worst closing speed = the peak of a full slingshot minus the slowest traffic.
  //            peak cap = VMAX * (1 + slingGain * (baseGain + gainPerCharge2 * 1^gainExp))
  //   tSteer : time to move from dead-on (dx = 0) to just clear of the collision box
  //            (|dx| > HIT.dxMax), using the lateral authority actually available during a
  //            boost (STEER_RATE * 1.0 * BOOST.assistSteer) MINUS the centrifugal drift
  //            working against it. Traffic can only legally sit where |curve| <= BLIND_CURVE
  //            (the blind-corner rule above), so BLIND_CURVE is the worst drift that can
  //            coexist with a legally placed car — which is exactly why the two rules have
  //            to be derived together.
  //   tReact : REACTION_S.
  //
  // With the stock spec: peak cap 151.8 m/s, slowest traffic 42.0 m/s -> vClose 109.8 m/s;
  // authority 1.9 * 1.25 = 2.375/s, drift 0.4 * 151.8^2 * 8.5e-5 = 0.783/s -> net 1.592/s;
  // tSteer = 0.18 / 1.592 = 0.113 s; D = 109.8 * (0.30 + 0.113) = 45.4 m.
  // The rule is then: a traffic car at zT is illegal if it is hidden from ANY camera
  // position in [zT - D, zT). Note this is not a constant number of segments — it is a
  // test against the actual generated terrain, so a gentle rise costs nothing and only a
  // real brow excludes anything.
  _sightExclusionM() {
    const peakCap = VMAX * (1 + BOOST.slingGain * (BOOST.baseGain + BOOST.gainPerCharge2));
    const vClose = peakCap - TRAFFIC_SPEED_MIN * VMAX;
    const authority = STEER_RATE * 1.0 * BOOST.assistSteer;
    const drift = BLIND_CURVE * peakCap * peakCap * CENTRIFUGAL;
    const net = Math.max(0.2, authority - drift);
    const tSteer = HIT.dxMax / net;
    return vClose * (REACTION_S + tSteer);
  }

  // ---------------------------------------------------------------- helpers
  legOf(z) {
    for (const l of this.legs) if (z < l.endZ) return l.leg;
    return TOTAL_LEGS;
  }

  segmentAt(z) {
    const n = this.segments.length;
    let i = Math.floor(z / SEG_LEN);
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    return this.segments[i];
  }

  curveAt(z) {
    return this._lerpField(z, 'curve');
  }

  elevationAt(z) {
    return this._lerpField(z, 'y');
  }

  _lerpField(z, key) {
    const n = this.segments.length;
    const f = z / SEG_LEN;
    let i = Math.floor(f);
    if (i < 0) return this.segments[0][key];
    if (i >= n - 1) return this.segments[n - 1][key];
    const t = f - i;
    const a = this.segments[i][key];
    const b = this.segments[i + 1][key];
    return a + (b - a) * t;
  }

  // Traffic legality: the three exclusion rules.
  _trafficAllowed(z) {
    const i = Math.floor(z / SEG_LEN);
    // Blind-corner rule: nothing within BLIND_SEGS segments AFTER a sharp segment.
    for (let k = 1; k <= BLIND_SEGS; k++) {
      const s = this.segments[i - k];
      if (s && Math.abs(s.curve) > BLIND_CURVE) return false;
    }
    // The car's own segment being sharp is also treated as blind (conservative).
    const own = this.segments[i];
    if (own && Math.abs(own.curve) > BLIND_CURVE) return false;
    // Checkpoint rule.
    for (const cp of this.checkpoints) {
      if (Math.abs(z - cp.z) < CHECKPOINT_CLEAR_M) return false;
    }
    // Blind-crest rule (see _sightExclusionM).
    if (!this._crestFair(z)) return false;
    return true;
  }

  _crestFair(z) {
    const D = this.blindCrestExclusionM;
    const step = SEG_LEN;
    for (let d = step; d <= D; d += step) {
      if (!this._visibleFrom(z - d, z)) return false;
    }
    return true;
  }

  _selfCheck() {
    if (this.checkpoints.length !== TOTAL_LEGS) {
      throw new Error(`Course: expected ${TOTAL_LEGS} checkpoints, got ${this.checkpoints.length}`);
    }
    // Curvature rate limit — the one property of the old random walk that mattered.
    for (let i = 1; i < this.segments.length; i++) {
      const d = Math.abs(this.segments[i].curve - this.segments[i - 1].curve);
      if (d > CURVE_STEP + 1e-9) {
        throw new Error(`Course: curvature step ${d.toFixed(4)} at segment ${i} exceeds ${CURVE_STEP}`);
      }
    }
    // Curvature ceiling per leg — for ORDINARY road. B13's exception class is exempt by
    // construction and is checked against its own derived bound immediately below; the
    // exemption is scoped to segments the generator explicitly marked, so a bug that let
    // ordinary curvature past maxCurvature() is still caught.
    for (const s of this.segments) {
      if (s.brakeCorner) continue;
      const cm = maxCurvature(s.leg);
      if (Math.abs(s.curve) > cm + 1e-9) {
        throw new Error(`Course: |curve| ${Math.abs(s.curve).toFixed(3)} at segment ${s.index} exceeds maxCurvature(${s.leg})=${cm}`);
      }
    }
    // The exception class: bounded ABOVE by BRAKE_CORNER.curve (which spec.js derives from
    // frame legibility) and BELOW by CURVE_FLAT_MAX at its apex (or it would not require
    // braking at all, and the whole class would be decoration).
    for (const s of this.segments) {
      if (!s.brakeCorner) continue;
      if (Math.abs(s.curve) > BRAKE_CORNER.curve + 1e-9) {
        throw new Error(`Course: brake-corner |curve| ${Math.abs(s.curve).toFixed(3)} at segment ${s.index} exceeds BRAKE_CORNER.curve=${BRAKE_CORNER.curve}`);
      }
    }
    const expectBrake = this.legs.filter((l) => l.leg >= BRAKE_CORNER.firstLeg).length
      * BRAKE_CORNER.perLeg;
    if (this.brakeCorners.length !== expectBrake) {
      throw new Error(`Course: expected ${expectBrake} brake corners, got ${this.brakeCorners.length}`);
    }
    for (const bc of this.brakeCorners) {
      const apex = Math.abs(this.segmentAt(bc.apexZ).curve);
      if (apex <= CURVE_FLAT_MAX) {
        throw new Error(`Course: brake corner at z=${bc.z.toFixed(0)} peaks at ${apex.toFixed(3)}, which is takeable flat (<= ${CURVE_FLAT_MAX.toFixed(3)})`);
      }
    }
    for (const car of this.traffic) {
      const i = Math.floor(car.z / SEG_LEN);
      for (let k = 1; k <= BLIND_SEGS; k++) {
        const s = this.segments[i - k];
        if (s && Math.abs(s.curve) > BLIND_CURVE) {
          throw new Error(
            `Course: traffic at z=${car.z.toFixed(1)} violates the blind-corner rule ` +
            `(segment ${s.index} curve=${s.curve.toFixed(3)})`
          );
        }
      }
      for (const cp of this.checkpoints) {
        if (Math.abs(car.z - cp.z) < CHECKPOINT_CLEAR_M) {
          throw new Error(
            `Course: traffic at z=${car.z.toFixed(1)} is within ${CHECKPOINT_CLEAR_M} m ` +
            `of checkpoint ${cp.leg} (z=${cp.z})`
          );
        }
      }
      if (!this._crestFair(car.z)) {
        throw new Error(
          `Course: traffic at z=${car.z.toFixed(1)} is hidden behind a crest inside the ` +
          `${this.blindCrestExclusionM.toFixed(1)} m avoidance distance`
        );
      }
    }
    if (this.traffic.length === 0) throw new Error('Course: no traffic could be placed');
  }
}
