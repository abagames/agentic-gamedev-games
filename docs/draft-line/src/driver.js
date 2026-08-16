// DRAFT LINE — autopilot driver.
//
// One controller, used by the attract demo (src/game.js) and by the scripted drivers in
// test/playable.test.mjs. Having two of these was how the attract mode ended up
// demonstrating a car driving down a road instead of demonstrating the game.
//
// Nothing here is gameplay balance. Every number below is a *controller* parameter: it
// decides how well a robot drives, never what the game does. The gameplay constants this
// module reads (STEER_RATE, CENTRIFUGAL, DEEP, HIT, ...) all come from spec.js, and the
// controller derives its set-points from them rather than restating them.

import * as S from './spec.js';

const CL = S.CAR_LEN;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- controller gains (bot tuning, not gameplay tuning) ----------------------
const K_GAP = 1.05;      // 1/s : metres of gap error -> m/s of commanded closing speed
const K_SPEED = 0.30;    // s/m : m/s of speed error  -> throttle
const K_STEER = 4.2;     // 1/x : lane error          -> steering command
// Closing on anything faster than HIT.spinDv * VMAX turns a touch into a spin, so the
// controller is never allowed to command a closing speed that could cause one.
const CLOSE_MAX = S.HIT.spinDv * S.VMAX * 0.75;
// Set-point inside the DEEP band, as a fraction of the band. The charge rate is
// proximity-weighted (spec.DEEP.chargeFloor), so deeper fills faster — but deeper is also
// closer to the bumper of a car that brakes without warning. Swept: at 0.25 (the deep
// quarter, chasing max charge rate) the bot filled fastest and then span 16 times a run,
// which costs far more than the charge rate buys; at 0.55 it gives up some fill speed and
// spins ~7 times. This is a BOT risk-appetite number, not a statement about where a human
// should sit — the proximity weighting exists precisely so that a human with better hands
// can take the deeper, faster, riskier line.
const DZ_TARGET = S.DEEP.dzMin + 0.55 * (S.DEEP.dzMax - S.DEEP.dzMin);
const TOW_SEEK_M = 140;  // how far ahead we will chase a tow
// Metres of gap error above which we stop station-keeping and just drive. Sized so the
// PD still owns the last stretch: at ~10 m/s of overspeed, BRAKE kills it in well under
// the time this gap takes to close.
const APPROACH_M = 3.0;
const LANE_MAX = 0.86;   // stay off the shoulder (HIT.shoulderSoft is 1.0)
// Traffic lookahead. We would much rather steer around a slow car than brake for it, so
// the swerve horizon is long and the brake horizon is short and only fires when the
// swerve has not cleared the path in time.
const SWERVE_T = 5.0;    // seconds of closing time considered for a lane change
// Strictly shorter than the rival's own reaction horizon, so a drafting bot never
// pre-empts the line its tow is about to take.
const DRAFT_SWERVE_T = S.RIVAL_AVOID.lookahead * 0.5;
const SWERVE_MIN_M = 45;
const BRAKE_T = 1.6;     // seconds of closing time before we give up and lift
// Clearance (seconds of closing time) below which holding the draft is not worth it and
// the whole road is searched instead.
const ESCAPE_T = 0.9;
// Clearance beyond this is not worth steering for. Without the saturation the planner
// chased the single most-open lane on a 250 m horizon and wove across the whole road at
// 100 m/s, which put it in front of more cars than it avoided.
const SAFE_T = 5.0;
// Clear road (seconds of closing time) required before an expert will spend the gauge.
// Raised 2.5 -> 3.5 (and patience 1.5 -> 3.0) with the faster gauge: a cheaper gauge means
// more releases per run, and every release is a chance to arrive on traffic at 145 m/s, so
// the bot has to be choosier about where it spends one or spin count rises with fill rate.
const RELEASE_CLEAR_T = 3.5;
// Worst curvature tolerated over the reach of a release.
const RELEASE_CURVE = 0.75;
// Seconds we will sit on a full gauge waiting for a better place to spend it.
const RELEASE_PATIENCE = 3.0;
const LAST_DT = 1 / 60;
// Safety factor on the braking distance used by the anti-spin governor.
const GOVERN_MARGIN = 2.0;
// Safety factor applied to the computed lateral rate (see lateralModel).
const LAT_MARGIN = 0.9;
const FLAT_OUT = S.VMAX * 1.6;   // "no limit"; the sim's own cap does the real limiting
// ---- curvature-aware speed target (B2a) --------------------------------------
// Fraction of the instant's steering authority that the centrifugal drift is allowed to
// eat before the controller asks for less speed. The spec's CENTRIFUGAL invariant only
// promises the drift stays BELOW the authority (84% consumed at the worst case the
// generator can produce) — i.e. that the corner is HOLDABLE, not that any swerve is still
// available inside it. This target reserves the difference.
//
// MEASURED, and this is the honest record: on the current build this is NOT what the
// remaining spins are made of. Curvature at the moment of a spin is statistically
// identical to the road as a whole (mean 0.334 vs 0.324 over 306k frames; 9.2% of spins
// at |curve| >= 0.68 against 10.2% of all road), and the drift consumes a median of 25%
// of authority at the moment of impact. B2a's premise — "rear-ends on high-curvature
// segments" — was true before the second pass, and the curvature-aware `latRate` in
// lateralModel() already absorbed it. See the report in B2a for the full disproof.
//
// So 0.70 is set where it is a free guard on the tail, not a speed policy: it binds on
// 2.6% of frames and asks for more than 3 m/s of braking on 0.05%. Measured on 128
// off-contract seeds it is inside the noise (spins 4.41 vs 4.44, finishes 121 vs 122).
// Values that actually shape the pace are strictly worse: 0.55 costs 12 finishes in 128
// and RAISES spins, because slowing the charging phase leaves the car in traffic longer
// per metre without touching the mid-boost event that causes the spins.
// It is kept because it is the derived, working brake B13's exception corners need.
const CURVE_PHI = 0.70;
// How far ahead the target looks, in seconds of travel: must exceed the time to shed the
// overspeed, and VMAX-worth of excess at BRAKE is ~1.6 s.
const CURVE_LOOK_T = 2.0;
// Never ask for less than this; below it the target would be setting clean-air pace
// rather than protecting a swerve.
const CURVE_VMIN = 0.70 * S.VMAX;
// How much of a rival's own avoidance travel (spec.RIVAL_AVOID) we treat as lateral
// uncertainty when planning around it. THIS is the lever that moved the spin count, and
// it is a different mechanism from the one B2a named: 111 of 184 spins are rivals, 91%
// happen mid-boost at ~134 m/s, and the median struck object entered our line only
// 0.07 s before impact — a lateral event, not a failure to brake. A rival swerving for
// traffic of its own crosses 0.55 x/s, so by the time we arrive it is anywhere in a band
// that widens with closing time; planning against its current x plans against a car that
// is no longer there. Swept on 128 off-contract seeds: 0 -> 6.17 spins, 0.2 -> 4.72,
// 0.25 -> 4.58, 0.3 -> 4.44, 0.35 -> 4.69, 0.5 -> 5.63. A broad plateau at 0.2-0.35, and
// 0.30 is its middle rather than an edge. Finish rate IMPROVES with it (89% -> 95%),
// which is the tell that it is a real mechanism and not a re-roll of which seeds spin.
const PAD_K = 0.30;

// Largest speed at which drift(|c|, v) <= CURVE_PHI * authority(v), for the zone the car
// is in right now. authority() is speed-dependent (sim.js), so this is solved by fixed
// point rather than in closed form; it converges in two or three passes because
// authority is flat above VMAX and only mildly sloped below it.
function curveSpeedTarget(sim, absCurve) {
  if (absCurve <= 1e-6) return Infinity;
  const zp = sim.zone === 'deep' ? S.DEEP : sim.zone === 'shallow' ? S.SHALLOW : null;
  const steerMul = sim.assist > 0 ? S.BOOST.assistSteer : (zp ? zp.steer : 1);
  const gMul = sim.assist > 0 ? 1 : (zp ? zp.gFactor : 1);
  // B13. An exception corner (spec.CURVE_FLAT_MAX) is not a preference — no steering input
  // holds it at VMAX — so the spec's own derived controllability bound REPLACES the
  // controller's risk appetite there, in both directions:
  //   - it is a hard ceiling: CURVE_VMIN (a floor that exists only to stop this target
  //     setting clean-air pace on ordinary corners) must never override it;
  //   - and it is not to be beaten by the controller's more conservative CURVE_PHI either.
  //     The spec bound is phi = 0.84, the same fraction of authority the CENTRIFUGAL
  //     invariant's worst ordinary case already consumes, so a bot that crawls below it is
  //     throwing away pace for a safety margin the design says is not needed. Measured:
  //     the phi-0.70 value floors to CURVE_VMIN = 70 m/s where the derived bound is 79.
  const hard = S.brakeCornerEntrySpeed(absCurve, steerMul, gMul);
  if (hard !== Infinity) return hard;
  const k = absCurve * S.CENTRIFUGAL * gMul;
  let v = S.VMAX;
  for (let i = 0; i < 3; i++) {
    const authority = 0.35 + 0.65 * Math.min(1, v / S.VMAX);
    v = Math.sqrt(CURVE_PHI * S.STEER_RATE * authority * steerMul / k);
  }
  return Math.max(CURVE_VMIN, v);
}

// The fastest we may be going RIGHT NOW such that every corner inside the braking horizon
// can still be met at its own target speed.
//
// This replaces a max-over-a-fixed-horizon: taking the worst curvature within 2 s and
// asking for its speed immediately means braking for a corner from wherever the horizon
// first touches it, which on B13's exception corners measured as ~450 m of road held at
// 71 m/s for a stretch that is only ~164 m long. The braking curve is the derived form of
// the same idea — v_allowed(d)^2 = v_target(d)^2 + 2*BRAKE*d — so the car arrives at the
// corner at its target speed instead of arriving early and slow. BRAKE_USE is the fraction
// of the panel's braking force the plan is allowed to assume, which is the whole safety
// margin: at 0.75 the controller has a quarter of the deceleration in hand for the corner
// it did not see (a rival braking, a swerve) at every point on the curve.
const BRAKE_USE = 0.75;
function curveBrakePoint(sim, course) {
  let limit = Infinity;
  const horizon = Math.max(60, CURVE_LOOK_T * sim.speed);
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const d = (i / N) * horizon;
    const target = curveSpeedTarget(sim, Math.abs(course.curveAt(sim.z + d)));
    if (target === Infinity) continue;
    const allowed = Math.sqrt(target * target + 2 * S.BRAKE * BRAKE_USE * d);
    if (allowed < limit) limit = allowed;
  }
  return limit;
}

// The player's steering authority and the centrifugal drift at the current instant,
// mirroring src/sim.js exactly so the controller can cancel the drift instead of
// fighting it with proportional error (which parks the car at a constant offset).
function lateralModel(sim, curve) {
  const zp = sim.zone === 'deep' ? S.DEEP : sim.zone === 'shallow' ? S.SHALLOW : null;
  const steerMul = sim.assist > 0 ? S.BOOST.assistSteer : (zp ? zp.steer : 1);
  const gMul = sim.assist > 0 ? 1 : (zp ? zp.gFactor : 1);
  const authority = 0.35 + 0.65 * Math.min(1, sim.speed / S.VMAX);
  const drift = curve * sim.speed * sim.speed * S.CENTRIFUGAL * gMul;
  const rate = S.STEER_RATE * authority * steerMul;
  // How fast we can actually move sideways right now, worst case: the drift eats the
  // steering, so in a corner the usable rate is a fraction of STEER_RATE and a swerve
  // that a flat-road estimate says is easy may be impossible. Every remaining spin was
  // a rear-end on a curved segment, taken by a controller that had assumed a constant
  // lateral rate.
  const latRate = Math.max(0.15, (rate - Math.abs(drift)) * LAT_MARGIN);
  return { driftSteer: rate > 0 ? drift / rate : 0, latRate };
}

// Nearest rival ahead that we could realistically draft.
function pickTow(sim) {
  let tow = null;
  for (const r of sim.rivals) {
    const dzm = r.z - sim.z;
    if (dzm <= 0.5 * CL || dzm > TOW_SEEK_M) continue;
    if (!tow || r.z < tow.z) tow = r;
  }
  return tow;
}

// Plan a lane, then a speed for it. `tow` is excluded from the obstacle set: the
// station-keeper owns the gap to it, and treating it as a hazard would make the
// controller brake away from the very thing it is trying to sit behind.
//
// This is a whole-road search rather than a react-to-the-nearest-car rule, because the
// react-to-nearest version dithered. Measured: 4.3 of the expert's 6.2 spins per run
// happened DURING a boost, and every trace showed the same two failures — the aim point
// flipping side the instant the obstacle's own wander crossed x=0 (`o.x > 0 ? -1 : 1`),
// and two obstacles alternating as "nearest" on successive frames, so the car sat at
// full lock in both directions at 60 Hz and never actually moved out of the way.
// Scoring every candidate lane against ALL obstacles at once removes both: the choice
// depends on the road, not on which car happened to be nearest this frame.
function planLane(sim, tow, preferred, prevLane, LAT_RATE) {
  // Speed we plan against. A lit brake lamp is a telegraph — the sim lights it
  // RIVAL_SLOWDOWN_WARN seconds before the car actually slows — so planning against the
  // speed it is ABOUT to have is what stops a rival's brake event from landing on top of
  // a player who is charging or mid-boost. That case was 100% of the remaining
  // no-obstacle-in-sight spins.
  const willBe = (o) => (o.lamp > 0 ? o.speed * (1 - S.rivalWobble(sim.leg)) : o.speed);
  const obs = [];
  for (const t of sim.traffic) obs.push([t, 'traffic']);
  for (const r of sim.rivals) if (r !== tow) obs.push([r, 'rival']);

  // While drafting, the tow's line IS the clean line (rivals thread traffic themselves,
  // see spec.RIVAL_AVOID) — but only once the rival has actually reacted, at
  // RIVAL_AVOID.lookahead seconds of closing. Looking further ahead than the tow does
  // makes a follower bail out of the zone for a car the tow is about to dodge anyway;
  // measured, that was 100% of lateral DEEP-zone exits. So while drafting we look LESS
  // far ahead than the tow does, and only at what is on our own nose.
  const horizonT = tow ? DRAFT_SWERVE_T : SWERVE_T;
  const clearBy = S.HIT.dxMax * 1.3;
  // A rival is not a point: it swerves for traffic of its own (spec.RIVAL_AVOID) at up to
  // `rate` per second, so by the time we arrive it may be anywhere within a band that
  // widens with the closing time. Measured, this — not curvature — is what the remaining
  // spins are: the median struck object entered our line 0.07 s before impact.
  const pad = (kind, tc) => (kind === 'rival'
    ? Math.min(S.RIVAL_AVOID.offset, S.RIVAL_AVOID.rate * tc) * PAD_K : 0);

  // How long candidate lane `cx` stays clear, in seconds of closing time.
  const clearance = (cx) => {
    let worst = Infinity;
    let cause = null;
    const moveT = Math.abs(cx - sim.x) / LAT_RATE;
    for (const [o, kind] of obs) {
      const dzm = o.z - sim.z;
      if (dzm <= 0) continue;
      const dv = sim.speed - o.speed;
      if (dv <= 0) continue;                    // we are not catching it
      if (dzm > Math.max(SWERVE_MIN_M, dv * horizonT)) continue;
      const tc = dzm / dv;
      const cb = clearBy + pad(kind, tc);
      // Clear if the lane misses it AND we can be in that lane before we arrive.
      if (Math.abs(cx - o.x) >= cb && moveT < tc * 0.7) continue;
      // Also clear if we are already wide of it and staying wide.
      if (Math.abs(cx - o.x) >= cb && Math.abs(sim.x - o.x) >= cb) continue;
      if (tc < worst) { worst = tc; cause = { kind, o, dzm, dv }; }
    }
    return { worst, cause };
  };

  const search = (span) => {
    const cands = [];
    const push = (v) => { const c = clamp(v, -LANE_MAX, LANE_MAX); if (!cands.includes(c)) cands.push(c); };
    push(preferred);
    if (prevLane !== null) push(prevLane);
    for (let i = 1; i <= 6; i++) { push(preferred + (i / 6) * span); push(preferred - (i / 6) * span); }
    let best = cands[0];
    let bestScore = -Infinity;
    let bestCause = null;
    let bestClear = 0;
    for (const cx of cands) {
      const { worst, cause } = clearance(cx);
      // Prefer clear road; among equally clear lanes prefer the one we want to be in, and
      // break remaining ties toward the lane we are already committed to (anti-dither).
      const score = Math.min(worst, SAFE_T) * 10
        - Math.abs(cx - preferred)
        - (prevLane === null ? 0 : 0.35 * Math.abs(cx - prevLane));
      if (score > bestScore) {
        bestScore = score; best = cx; bestClear = worst;
        bestCause = worst === Infinity ? null : cause;
      }
    }
    return { best, bestCause, bestClear };
  };

  // While drafting the search is restricted to lanes that still hold the draft, so the
  // planner cannot quietly trade the zone away for a marginally cleaner road...
  let { best, bestCause, bestClear } = search(tow ? S.DEEP.dxMax * 0.7 : LANE_MAX);
  // ...but the draft is never worth a wreck. When a slow car sits on the tow's own line
  // there is no lane inside the zone that clears it, and a follower that will not look
  // outside the zone simply drives into the back of it at 45 m/s of closing speed.
  if (tow && bestClear < ESCAPE_T) ({ best, bestCause, bestClear } = search(LANE_MAX));

  // Speed. Brake only when steering will not get us clear in time — lifting off for a
  // car we are already steering around throws away the whole slingshot. Measured, an
  // unconditional long-range brake limit held the median release to 94 m/s over its
  // 3.6 s, against the ~120 m/s the boost is worth.
  let speedLimit = Infinity;
  for (const [o, kind] of obs) {
    const dzm = o.z - sim.z;
    if (dzm <= 0) continue;
    const dv = sim.speed - willBe(o);
    if (dv <= 0) continue;
    const tContact = dzm / dv;
    const clearBy = S.HIT.dxMax * 1.3 + pad(kind, tContact);
    const need = Math.max(0, clearBy - Math.abs(best - o.x));
    const onOurLine = Math.abs(o.x - sim.x) < clearBy || Math.abs(o.x - best) < clearBy;
    if (onOurLine && tContact < BRAKE_T && need / LAT_RATE > tContact * 0.8) {
      speedLimit = Math.min(speedLimit, willBe(o));
    }
    // Hard floor, independent of any swerve estimate: never arrive at something on our
    // own line closing fast enough for the sim to call it a spin. The window has to be a
    // BRAKING distance, not a car length: at 50 m/s of closing the old one-car-length
    // window gave 0.17 s of warning against the ~1.4 s that shedding the overspeed takes,
    // so the governor never fired and every mid-boost mistake cost 1.6 s and the gauge
    // instead of half the gauge.
    const safeV = willBe(o) + S.HIT.spinDv * S.VMAX * 0.5;
    const excess = sim.speed - safeV;
    if (excess > 0 && Math.abs(o.x - sim.x) < clearBy) {
      const tBrake = excess / S.BRAKE;
      const tClear = Math.max(0, clearBy - Math.abs(best - o.x)) / LAT_RATE
        + Math.abs(best - sim.x) / LAT_RATE;
      // If the lane search could not find ANY lane that clears this car, steering is not
      // going to save us and the only question left is whether we started braking in
      // time — so the tClear estimate does not get a vote.
      const blocked = bestCause !== null && bestCause.o === o;
      if (tContact < tBrake * GOVERN_MARGIN + 0.25 && (blocked || tClear > tContact * 0.5)) {
        speedLimit = Math.min(speedLimit, safeV);
      }
    }
  }
  return { laneX: best, speedLimit, cause: bestCause, clear: bestClear };
}

/**
 * @param {object} opts
 *   useTow  {boolean} chase and hold the draft zone (false = clean-air racing line)
 *   release {'none'|'asap'|'expert'} boost policy
 * @returns {(sim, course) => {steer, throttle, boost}}
 */
export function makeDriver(opts = {}) {
  const useTow = opts.useTow !== false;
  const release = opts.release || (useTow ? 'expert' : 'none');
  const MASH_AT = 12;
  let prevLane = null;
  let fullFor = 0;

  return function drive(sim, course) {
    const curve = course.curveAt(sim.z);
    // The corner we will be IN when we get to the car in front, not the one we are in
    // now. Every remaining spin was a rear-end taken at |curve| >= 0.68: the planner had
    // sized its swerve on flat-road authority and arrived with the drift eating it.
    let worstCurve = Math.abs(curve);
    for (let i = 1; i <= 8; i++) {
      const c = Math.abs(course.curveAt(sim.z + i * 0.25 * sim.speed));
      if (c > worstCurve) worstCurve = c;
    }
    const boosting = sim.boost.active;
    const tow = useTow && !boosting && sim.spin <= 0 ? pickTow(sim) : null;

    // ---- lane ------------------------------------------------------------
    const { driftSteer } = lateralModel(sim, curve);
    const { latRate } = lateralModel(sim, worstCurve);
    const preferred = clamp(tow ? tow.x : 0, -LANE_MAX, LANE_MAX);
    const haz = planLane(sim, tow, preferred, prevLane, latRate);
    const laneX = haz.laneX;
    prevLane = laneX;

    const steer = clamp(driftSteer + (laneX - sim.x) * K_STEER, -1, 1);

    // ---- speed: PD station-keeping on the gap, then hazard limiting -------
    let desired = FLAT_OUT;
    let gapErr = null;
    if (tow) {
      // Two modes. Outside the zone there is nothing to hold station ON, so the car runs
      // at its own cap and the sim does the limiting; the PD only takes over once the
      // zone is within braking reach. Running the PD all the way out was measured as the
      // single largest cost in the whole loop: because the commanded closing speed is
      // capped at CLOSE_MAX, an approaching bot asked for rivalSpeed+9 ~ 97 m/s instead
      // of its own 100, for 41 s of every 217 s run — more than the entire slingshot
      // was worth. It is a controller bug, not a payoff problem.
      // Error in metres, positive = too far back. The commanded closing speed is the
      // P term; reading the rival's *current* speed (which dips the instant it brakes)
      // is the D term, and is what keeps a brake event from becoming a rear-end.
      gapErr = (tow.z - sim.z) - DZ_TARGET * CL;
      const close = clamp(K_GAP * gapErr, -CLOSE_MAX, CLOSE_MAX);
      desired = tow.speed + close;
      if (gapErr > APPROACH_M) desired = FLAT_OUT;
      // NOTE: an earlier revision held FLAT_OUT here while the gauge filled, to "fly
      // through" the slipstream instead of parking in it. Measured, that was a net LOSS:
      // mean speed inside DEEP rose 96.2 -> 98.6 m/s, but spins rose 9.2 -> 10.0 per run
      // and course time got 3.7 s WORSE, because arriving hot put the car into traffic
      // mid-boost more often and a spin costs far more than the charging tax it saved.
      // The proximity-weighted charge rate is what shortens the pinned phase; the throttle
      // is not the lever.
      // A lit brake lamp is a telegraph; back off before the speed actually drops.
      if (tow.lamp > 0) desired = Math.min(desired, tow.speed);
    }
    // The braking curve already evaluates the corner under the wheels (d = 0) as well as
    // every corner inside the horizon, so it REPLACES the old "target speed of the worst
    // curvature within 2 s" outright rather than being minimised with it. Keeping both was
    // measured to hold the car at an exception corner's entry speed for a full 2 s of
    // travel — ~190 m — before the corner, which is most of the 350 m slow zone the profile
    // showed against the ~130 m the corner physically demands.
    const curveLimit = curveBrakePoint(sim, course);
    desired = Math.min(desired, haz.speedLimit, curveLimit);
    let throttle = clamp((desired - sim.speed) * K_SPEED, -1, 1);
    // Coast, never brake, while still short of the zone. After a release we arrive at the
    // next tow well above its speed; braking off that overspeed throws away the tail of
    // the slingshot and turns the approach into a ten-second crawl at the 8 m/s the
    // clean-air cap allows. Only the arrival itself is worth braking for.
    if (gapErr !== null && gapErr > CLOSE_MAX && haz.speedLimit === Infinity
        && sim.speed <= curveLimit) {
      throttle = Math.max(throttle, 0);
    }

    // ---- boost -----------------------------------------------------------
    let boost = false;
    if (release === 'asap') boost = sim.charge > MASH_AT;
    else if (release === 'expert') {
      // Full gauge, in the deep zone, AND with somewhere to put the speed. Releasing
      // into a car is how a slingshot becomes a spin: 4.3 of 6.2 spins per run used to
      // happen mid-boost. Waiting a moment for clear road costs nothing — the gauge
      // holds at CHARGE_MAX.
      // ...and not into a corner. The gauge holds at CHARGE_MAX, so waiting for the exit
      // of a bend costs nothing, while spending it at the entry of one puts the car into
      // traffic at 130 m/s with the drift already eating most of its steering.
      let bendAhead = 0;
      const reach = (S.BOOST.baseDur + S.BOOST.durPerCharge) * S.BOOST.slingDur * sim.speed;
      // Distance to the nearest exception corner inside the reach, tracked separately from
      // `bendAhead`: an ordinary bend anywhere in the reach is a reason to wait, but an
      // exception corner is only a reason to wait if it is close enough that the boost
      // cannot be shed before it (below).
      let brakeAheadM = Infinity;
      for (let i = 0; i <= 10; i++) {
        const d = (i / 10) * reach;
        const c = Math.abs(course.curveAt(sim.z + d));
        if (c > bendAhead) bendAhead = c;
        if (c > S.CURVE_FLAT_MAX && d < brakeAheadM) brakeAheadM = d;
      }
      const ready = sim.charge >= S.CHARGE_MAX - 0.5 && sim.zone === 'deep';
      fullFor = ready ? fullFor + LAST_DT : 0;
      // Waiting for a straight is free only while a straight is coming. On the late legs
      // the generator's curvature ceiling is above the gate, so an unconditional gate
      // simply never fires and the driver never spends the gauge at all.
      // ...and NEVER into an exception corner, whatever the patience timer says. B13's
      // brake corners are the one place where "spend it anyway, I have waited long enough"
      // is not a defensible trade: the corner cannot be held at boost speed by any steering
      // input, so a release aimed into one is a guaranteed trip across the shoulder. The
      // patience override exists because the ordinary curvature ceiling can sit above
      // RELEASE_CURVE for a whole leg; the exception class never does, since every one of
      // them ends in a settling straight.
      // How much road it takes to get from the top of this release back down to the
      // corner's derived entry speed, at the same braking fraction the brake-point planner
      // assumes, with a 1.5x margin. Blocking on the whole 420 m reach instead was measured
      // to cost 2.4 releases a run — nearly a fifth of the gauge economy — for corners the
      // car had ample room to brake for.
      const vPeak = sim.speed * (1 + (S.BOOST.baseGain + S.BOOST.gainPerCharge2)
        * S.BOOST.slingGain);
      const vEnter = S.brakeCornerEntrySpeed(S.BRAKE_CORNER.curve);
      const shedM = 1.5 * Math.max(0, vPeak * vPeak - vEnter * vEnter)
        / (2 * S.BRAKE * BRAKE_USE);
      const brakeAhead = brakeAheadM < shedM;
      boost = ready && !brakeAhead
        && ((haz.clear >= RELEASE_CLEAR_T && bendAhead <= RELEASE_CURVE)
          || fullFor > RELEASE_PATIENCE);
    }

    // Diagnostic sink. Read by scratchpad instrumentation; nothing in the game uses it.
    drive.last = { tow, laneX, cause: haz.cause, driftSteer, desired };

    return { steer, throttle, boost };
  };
}
