// DRAFT LINE rev.3 — shared contract.
// Every module reads its numbers from here. Do not hard-code gameplay values elsewhere.

// ---------------------------------------------------------------- display
export const VIEW_W = 320;          // logical pixels (1983-1985 band)
export const VIEW_H = 224;
export const CELL = 8;              // 40 x 28 cells
export const HUD_TOP_H = 5 * CELL;  // 40
export const ROAD_H = 20 * CELL;    // 160  -> y = 40..199
export const HUD_BOT_H = 3 * CELL;  // 24   -> y = 200..223
export const ROAD_Y0 = HUD_TOP_H;
export const ROAD_Y1 = HUD_TOP_H + ROAD_H;
export const HORIZON_BASE = ROAD_Y0 + 5 * CELL; // y = 80, nominal horizon
// The screen row the player car's TYRES sit on. This is not a free cosmetic constant: the
// camera is placed exactly far enough BEHIND the player that the player's own z projects
// to this row (see cameraSetback() in render.js), so the drawn gap to a rival closes at
// precisely the moment the simulated gap does. Moving this row moves the camera, not the
// alignment.
export const PLAYER_GROUND_Y = ROAD_Y1 - 10;

// ---------------------------------------------------------------- world
export const SEG_LEN = 8;           // metres per road segment
export const ROAD_WIDTH = 10;       // metres, half-width = 5 -> x normalised -1..+1
export const DRAW_DISTANCE = 140;   // segments rendered ahead (1120 m)
// Rendering-only. The classic cabinets keep camera height and road half-width in roughly
// a 1:1 ratio; at 1.35 m against a 5 m half-width the road projected ~880 px wide at the
// bottom scanline (2.75 screens) and reached the horizon within 100 m, so the whole
// 1120 m draw distance collapsed into the first three segments.
// 4.6 m was a crane shot: it flattened the road into a wide grey sheet. Era cabinets sit
// low, just above the car's own roof, which is what makes the road fill the frame.
export const CAMERA_HEIGHT = 2.8;   // metres
export const CAMERA_DEPTH = 1 / Math.tan((60 / 2) * Math.PI / 180); // fov 60deg

// ---------------------------------------------------------------- corner geometry
// CURVE_ACCUM is the map from the course's abstract `curve` units to actual road
// geometry, and it lives here rather than in render.js because it is what the player
// reads corner severity off (B5/B3a-0d: it was a gameplay-visible constant sitting in
// the renderer). The renderer integrates it twice over distance:
//     cx += dcx + curve*CURVE_ACCUM/2 ;  dcx += curve*CURVE_ACCUM      (per SEG_LEN)
// so over an arc length s the centreline moves sideways by
//     cx(s) = curve * CURVE_ACCUM * s^2 / (2*SEG_LEN^2),
// which is the small-angle offset of a circular arc of radius
//     R = SEG_LEN^2 / (curve * CURVE_ACCUM).
//
// DERIVATION. A corner must sweep the road off the side of the frame within its OWN
// held length, not within the draw distance -- real corners are 100-200 m long, and a
// value tuned against the 1120 m draw distance delivers almost none of its displacement
// while the corner is actually on screen. Measured over the 32 contract seeds, a
// hairpin-class run (|curve| >= 0.85) is 88-136 m long, median 112 m.
// The screen displacement of the centreline at the far end of a corner of length L is
//     px = curve * CURVE_ACCUM * L * CAMERA_DEPTH * (VIEW_W/2) / (2*SEG_LEN^2)
// Requiring that the STRONGEST curvature the generator can emit (the maxCurvature
// ceiling, 1.10) reaches the frame edge (VIEW_W/2 = 160 px) at L = 112 m gives
//     CURVE_ACCUM = 160 / (1.10 * 112 * 2.16506) = 0.5999  ->  0.60.
// Cross-check, independent of the frame: that is R = 64/(1.10*0.60) = 97 m at the
// ceiling, 101 m for the 1.055 hairpin seed 101 generates, 267 m at the blind-corner
// threshold 0.4, and 1067 m for a 0.1 kink. Those are real road radii; the previous
// value 0.07 implied a 914 m radius for a HAIRPIN, i.e. a motorway bend, which is why
// every corner drew at 19-28 px of vanishing-point shift regardless of its curvature.
export const CURVE_ACCUM = 0.60;    // metres of centreline drift per segment^2 per curve unit
// The only bound the renderer still needs, and it is a consequence of the frame, not a
// tuned number: past the point where a ring's road AND everything standing beside it has
// left the viewport sideways, further displacement is unobservable, so the drift is
// clamped there to keep the fiction finite. The clamp is derived from the widest world-x
// anything is ever drawn at:
//     props.js FAR_BAND max centre 4.20 half-widths = 21.0 m
//   + the widest PROP_KINDS half-width (BUILDING, 6.0 m)                    = 27.0 m
//   + the camera's own maximum lateral offset (1.0 half-width, the offroad
//     threshold, applied outside the clamp)                                 =  5.0 m
export const LATERAL_LIMIT_M = 32;  // metres; see VP clamp in render.js

// ---------------------------------------------------------------- car / physics
export const VMAX = 100;            // m/s, player's own top speed. NEVER scales with leg.
export const ACCEL = 34;            // m/s^2 toward current speed cap
export const BRAKE = 62;
// ENGINE BRAKING / COAST DRAG (P4). Deceleration, m/s^2, applied when the throttle is
// fully released (`input.throttle === 0`) — releasing UP bleeds speed instead of holding
// it. The constant is NOT free: its ceiling is derived from B13's brake corners, and the
// derivation is stated in full at COAST_DRAG_CEILING below (it needs CENTRIFUGAL and
// BRAKE_CORNER, which are declared further down this file). In one line: coasting the
// WHOLE of a brake corner's telegraph must still leave the car physically unable to hold
// that corner, or "release UP" becomes a substitute brake and B13's exception corner —
// the only reason BRAKE exists in this game — stops being a button press.
//   9 m/s^2 is 0.145 * BRAKE and 62% of the derived ceiling (14.63). It sheds VMAX down to
//   the corner's entry speed over 209 m: 3.1x the 68 m telegraph, 4.6x the D = 45.4 m
//   sight distance. Swept over 0/3/6/9/12/16/20/27.7 on the 32-seed basis (P4, see
//   BACKLOG): every value in 3..27.7 was within seed noise of every other, so this is the
//   value the DERIVATION picks, not the one the measurements picked — they could not tell
//   them apart. Only 0 (no engine braking at all) measured clearly worse.
export const COAST_DRAG = 9;
// P6 REMOVED `COAST_DRAG_ONSET = 0.35`, an undocumented ramp (`COAST_DRAG * min(1, coastT /
// ONSET)`) that had been added to sim.js after P4 shipped, with no derivation, no BACKLOG
// entry, and sim.test.mjs §18(b) left RED by it (it measures one tick, and one tick into a
// lift the drag was 9 * (1/60)/0.35 = 0.43 m/s^2 — 4.8% of nominal).
//
// It is what P6 was: holding the tow is done with SHORT lifts. Over a lift of duration T the
// ramp delivers a MEAN drag of COAST_DRAG * (1 - ONSET/(2T)); at the ~0.3 s lifts
// station-keeping is made of that is 3.9 m/s^2 — 43% of nominal, and BELOW the draft-hold
// floor derived below. So the tool the player uses to sit in the slipstream had been quietly
// cut to under half strength, the gauge stopped filling, and the boost stopped being worth
// the 420 km/h the deep tow pays. Measured, player path, 32 seeds: 13/32 -> 30/32 seeds reach
// 420 km/h and the best gauge a pair of hands can fill goes 87% -> 96%. See BACKLOG P6.
//
// If a future pass wants "release UP is gentle at first", the lever is COAST_DRAG itself,
// not a ramp — and any ramp reintroduced must be checked against DRAFT_HOLD_DRAG below, in
// its MEAN-over-a-short-lift form, not at its asymptote.
// How fast speed above the current cap bleeds off (per second). Only ever applies after
// a boost ends; the throttle itself can never take you above the cap. See sim.js.
// Raised from 3.2 with the boost rework. 3.2 is a 0.31 s time constant: the car sagged
// off a slingshot so gently that the END of the dash was invisible too — the whole event
// had no edge at either side. At 6.0 the drop is ~11 m/s in the first tenth of a second,
// which lands on the same frames as the visual/audio falloff cue.
export const CAP_DECAY = 6.0;
export const OFFROAD_FACTOR = 0.55; // speed multiplier while |x| > 1.0
export const CAR_LEN = 4.4;         // metres, one "car length" for dz zones
// Deliberately wider than a real 1985 sports car (~1.8 m). The road has to stay 10 m for
// the |x|>1 offroad rule, and at a true 1.8 m the car reads as a speck in a ten-metre
// road. Cabinet sprites of the era were chunky for exactly this reason. Rendering only.
export const CAR_WIDTH = 2.3;       // metres, drawn width of every car sprite
export const STEER_RATE = 1.9;      // normalised x per second at full lock, at VMAX
// x += curve * speed^2 * CENTRIFUGAL * gFactor  (per second).
// INVARIANT (asserted in test/sim.test.mjs): at the worst curvature the generator can
// produce, at full speed, inside the DEEP zone, the drift must stay strictly below the
// steering authority available there. The deep zone must feel HEAVY, never LOCKED —
// a corner you cannot physically hold is the unfair-death case this design forbids.
// Worst case: curve 1.10, v = 1.06*VMAX, gFactor 1.35 -> drift 1.42/s
//             vs deep authority 1.9 * 0.85 * 1.04 = 1.68/s  (84% consumed).
export const CENTRIFUGAL = 0.000085;

// ---------------------------------------------------------------- brake corners (B13)
// THE EXCEPTION CLASS. The CENTRIFUGAL invariant above proves that every corner the
// generator can produce is holdable at any speed — which is exactly why BRAKE existed with
// nothing to press it for: if the drift never exceeds the steering, there is never a speed
// judgement to make. B13's shape is RARE, NOT UNIVERSAL: the invariant above keeps covering
// every ordinary corner untouched, and a small, explicitly-classed set of corners
// (course.brakeCorners, ~one per leg) gets its own derived bound below. A universal corner
// speed policy was measured and rejected (B2a's phi sweep: 0.65 -> 28/32 finished, spins UP
// to 6.66), so this is the only shape the measurements support.
//
// THE FLAT-OUT CEILING. In clean air at VMAX the steering authority is
//     A(VMAX) = STEER_RATE * (0.35 + 0.65 * 1) = STEER_RATE
// and the drift is curve * VMAX^2 * CENTRIFUGAL. The curvature at which full opposite lock
// exactly cancels the drift is therefore
//     CURVE_FLAT_MAX = STEER_RATE / (VMAX^2 * CENTRIFUGAL) = 1.9 / 0.85 = 2.235
// Below it a corner is takeable flat (hold lock, hold the line). At or above it NO steering
// input can stop the car being pushed outward for as long as the corner is held — the
// strict complement of the CENTRIFUGAL invariant, which is what makes "you must arrive
// slower" a physical fact rather than a preference.
export const CURVE_FLAT_MAX = STEER_RATE / (VMAX * VMAX * CENTRIFUGAL);

export const BRAKE_CORNER = {
  // The exception curvature. It is pinned between two derived bounds, not chosen:
  //
  //   LOWER — it must actually require braking, with margin. At exactly CURVE_FLAT_MAX the
  //     drift only ties the steering, so a car entering on the inside edge would creep out
  //     over the corner rather than be pushed out; and the DEEP zone's gFactor, the boost
  //     assist and the 8 m curvature sampling all move the tie by a few percent. 2.60 is
  //     1.163 * CURVE_FLAT_MAX: at VMAX in clean air, at full opposite lock, the car still
  //     loses 0.31 half-widths per second — it crosses the whole 2.0 half-widths of road in
  //     6.4 s, and the corner is held for ~0.6 s, so the penalty is proportionate rather
  //     than instantly terminal. See BRAKE_CORNER_PENALTY below for the measured cost.
  //   UPPER — it must stay legible. A corner sweeps the road off the side of the frame in
  //     L = (VIEW_W/2) / (curve * CURVE_ACCUM * CAMERA_DEPTH / (2*SEG_LEN^2)) * SEG_LEN^2...
  //     i.e. 160 / (curve * CURVE_ACCUM * 2.16506) metres. The fairness rules require the
  //     road ahead to be readable for the derived sight distance D = 45.4 m (course.js), so
  //     the road must not leave the frame nearer than that:
  //         curve <= 160 / (CURVE_ACCUM * 2.16506 * 45.4) = 2.71
  //     2.60 leaves the frame at 47.4 m, just outside D. This is the binding constraint on
  //     how sharp an exception corner may be, and it is why 2.60 is not simply "3".
  // Implied road radius R = SEG_LEN^2 / (curve * CURVE_ACCUM) = 64 / 1.56 = 41 m. A real
  // first-gear hairpin, against 97 m for the generator's ordinary ceiling.
  curve: 2.60,
  // CONTROLLABILITY BOUND. The entry speed at which the corner becomes as holdable as the
  // WORST ORDINARY corner already is: the CENTRIFUGAL invariant's worst case consumes 84%
  // of the available authority (drift 1.42/s vs deep authority 1.68/s) and is documented
  // above as "heavy, never LOCKED". Re-using that same 84% rather than inventing a new
  // comfort number is what makes this bound additive to the existing proof instead of a
  // re-derivation of it. Solve for v in
  //     curve * v^2 * CENTRIFUGAL * gMul = phi * STEER_RATE * (0.35 + 0.65*v/VMAX) * steerMul
  // (see brakeCornerEntrySpeed below; the authority is speed-dependent, so it is a
  // quadratic, not a square root). Clean air: 78.9 m/s = 284 km/h, against 360 flat out.
  phi: 0.84,
  // Braking from VMAX to that entry speed costs (VMAX^2 - v^2) / (2*BRAKE) = 30.4 m, which
  // the telegraph has to cover: props.js places the WARN sign at 1.5*D = 68 m before the
  // corner, i.e. 2.2x the distance physically required to shed the speed, and 1.5x the
  // distance required to see and react to a hazard at all. That margin is the acceptance
  // check "a legible warning at or beyond the required sight distance".
  //
  // GENERATOR RATE — "rare, not universal", the whole point of the item. Exactly one per
  // leg on legs 2..8; leg 1 is exempt because it is the teaching leg (fast/flat by
  // construction, where the player is learning the tow and nothing else). 7 per 8-leg
  // course = 0.875 per leg. Asserted in test/sim.test.mjs §13.
  perLeg: 1,
  firstLeg: 2,
  // Metres the corner is held AT `curve` (the smoothstep ramps in and out are extra and are
  // sized by CURVE_RAMP_RATE, ~136 m each). Short: this is an event, not a section of road.
  holdM: [48, 72],
  // WHAT ONE OF THESE COSTS, and why the leg clock pays it back. legExtension() below was
  // sized against measured driver ceilings on a road where "every corner is takeable flat
  // by construction" — a car that never slows. B13 makes that premise false once per leg,
  // so leaving the clock alone would not be "leaving the difficulty curve untouched", it
  // would be silently tightening every leg by the cost of the new feature.
  //
  // The analytic floor is small: the road on which the derived bound actually binds is
  // ~130 m (the 48-72 m hold plus the ~35 m tail of each smoothstep ramp that sits above
  // CURVE_FLAT_MAX), so holding 78.95 m/s instead of VMAX across it costs 0.35 s, and the
  // deceleration and re-acceleration transitions add 0.11 s: 0.46 s.
  // MEASURED end to end (32 contract seeds, clock disabled so restarts cannot confound the
  // mean), per corner: plain 0.42 s, masher 0.44 s, expert 1.00 s.
  //
  // THE COST IS NOT FLAT ACROSS SKILL, and that is the whole reason this number is 0.45 and
  // not the expert's 1.00. A car that never reaches VMAX pays only the corner's own physics
  // — and note that the non-expert measurement (0.42 s) lands on the ANALYTIC floor derived
  // above (0.46 s), which is the check that the two ways of counting agree. The expert pays
  // more than double, and the excess is entirely the TOW: exiting at 79 m/s in clean air
  // leaves 7 m/s of closing speed on a 93 m/s pack, so a draft lost at the corner takes
  // most of a leg to win back.
  //
  // So the clock is compensated for the PHYSICS of the corner and not for its ECONOMY. A
  // driver that cannot use the mechanic is left exactly as far from finishing as it was
  // before B13; the expert is charged the remaining 0.55 s per corner against the margin
  // the tow buys. The exception corner is therefore a new SKILL DEMAND rather than a flat
  // tax on the clock: what it costs you is the time you spend out of the draft, which is
  // the one quantity this game is about.
  //
  // Compensating at the expert's own cost instead was measured and rejected: it hands the
  // slowest drivers time for a feature that barely costs them, and the drivers who must
  // never finish start finishing (at an earlier 1.8 s: plain 0/32 -> 20/32, masher
  // 1/32 -> 27/32).
  timeCost: 0.45,
};

// The largest speed at which an exception corner of curvature `absCurve` is as holdable as
// the worst corner the CENTRIFUGAL invariant already covers. Returns Infinity for ordinary
// curvature — the invariant covers those and this bound must never bind on them, which is
// what "strictly additive" means here.
//   steerMul / gMul: the zone or boost-assist multipliers the car is under (DEEP.steer,
//   DEEP.gFactor, BOOST.assistSteer), so the bound is evaluated in the state the car is
//   actually in rather than in clean air only.
export function brakeCornerEntrySpeed(absCurve, steerMul = 1, gMul = 1) {
  if (!(absCurve > CURVE_FLAT_MAX)) return Infinity;
  // k*v^2 = phi*STEER_RATE*steerMul*(0.35 + 0.65*v/VMAX)  ->  k*v^2 - b*v - a = 0
  const k = absCurve * CENTRIFUGAL * gMul;
  const base = BRAKE_CORNER.phi * STEER_RATE * steerMul;
  const a = base * 0.35;
  const b = base * 0.65 / VMAX;
  return (b + Math.sqrt(b * b + 4 * k * a)) / (2 * k);
}

// ---------------------------------------------------------------- coast-drag ceiling (P4)
// THE BOUND ON ENGINE BRAKING, derived from B13 rather than chosen. B13 gave BRAKE its
// first reason to exist: an exception corner that no steering input can hold at speed. If
// simply RELEASING the throttle sheds enough speed to take one, the brake button loses that
// reason again and B13 collapses into something the player never has to press anything for.
//
// The strictest place to test that is the telegraph: props.js puts the WARN sign at
// 1.5*D = 68 m before the corner, and that is the earliest a fair player is required to
// have acted. So ask what a player who releases UP AT THE SIGN, from VMAX, and does nothing
// else, is doing at the corner's mouth:
//     vCoast(68) = sqrt(VMAX^2 - 2 * COAST_DRAG * 68)
// Two nested bounds on that speed, both read off B13's own geometry:
//
//   HARD  — vCoast(68) must not reach BRAKE_CORNER's derived entry speed (78.95 m/s, the
//           phi = 0.84 controllability bound). At or above
//               (VMAX^2 - vEntry^2) / (2*68) = 27.69 m/s^2
//           coasting IS braking: the corner is simply takeable by letting go.
//   BINDING — stricter, and the one this project asserts. Coasting the whole telegraph must
//           leave the car above the speed at which the drift merely TIES full opposite lock
//           (phi = 1, i.e. brakeCornerEntrySpeed evaluated at full authority): 89.50 m/s.
//           Above that speed the corner cannot be held AT ALL, so a coasting player has not
//           merely arrived "a bit hot", they have arrived somewhere the brake is still
//           mandatory. Hence
//               COAST_DRAG <= (VMAX^2 - vHold^2) / (2 * telegraph) = 14.63 m/s^2
// The gap between the two is the whole safety margin of this item, and 9 sits well below
// both: at the mouth a coasting car is doing 93.68 m/s, where the drift at BRAKE_CORNER.curve
// is 106.5% of full lock. It is an aid, not an alternative.
//
// NOTE the direction of this bound: it caps engine braking from ABOVE. There is no lower
// bound in the physics — COAST_DRAG = 0 is a perfectly consistent game (it is what shipped
// for eleven passes) and the case for a nonzero value is a FEEL case, decided by the user
// in P4 and supported only weakly by measurement (see BACKLOG).
// phi = 1 exactly: brakeCornerEntrySpeed folds `phi * steerMul`, so steerMul = 1/phi asks it
// for the FULL-LOCK tie rather than the 84% comfort bound. Deriving vHold this way instead of
// re-solving the quadratic is deliberate — B13's bound and this one then cannot disagree.
export const COAST_DRAG_HOLD_SPEED = brakeCornerEntrySpeed(BRAKE_CORNER.curve, 1 / BRAKE_CORNER.phi);
// The telegraph is owned by course.js/props.js (1.5 * course.blindCrestExclusionM, 68.0 m on
// the stock spec) and cannot be imported here without a cycle, so the ceiling is a FUNCTION of
// it and sim.test.mjs §18 evaluates it at the live value. Nothing is duplicated.
export const coastDragCeiling = (telegraphM) =>
  (VMAX * VMAX - COAST_DRAG_HOLD_SPEED * COAST_DRAG_HOLD_SPEED) / (2 * telegraphM);
export const COAST_DRAG_CEILING = coastDragCeiling(68.0);

// ---------------------------------------------------------------- draft zones
// dz is measured in CAR_LEN units from player's nose to rival's tail.
// Zone depth is a HOLDABILITY constraint, not a realism one. At ~90 m/s a 0.8-car-length
// band (3.5 m) is 0.04 s of travel — no human and no controller can sit in it. The bands
// below are ~10 m and ~13 m deep, which a player can actually hold with throttle feathering.
export const DEEP = {
  // dzMax was 3.0. THE defect this fixes: the zone was 9.7 m deep, and a player who does
  // NOT slow down crosses it at (VMAX - rivalSpeed) = 6.6 m/s, i.e. in 1.47 s — while the
  // gauge took 3.13 s to fill. The fill took 2.1x longer than the zone let you stay in it
  // at speed, so filling it REQUIRED braking to the rival's pace and station-keeping there.
  // Drafting therefore cost 6.6 m/s for three seconds on top of the time spent getting
  // into position, and the slingshot had to buy all of that back before it bought anything.
  // Measured end-to-end, the intended loop beat never-drafting by only 6.7% with a perfect
  // bot — and that margin is smaller than a human's positioning error, which is exactly why
  // it felt "faster to just drive past them".
  // The zone is now deep enough, and the gauge fast enough (below), that a well-placed car
  // fills it in ONE pass without ever lifting: you fly through the slipstream and out of
  // it, instead of parking behind a car.
  dzMin: 0.8, dzMax: 3.8, dxMax: 0.28,
  // Peak rate, on the bumper. Scaled down toward `chargeFloor` at the back edge of the
  // zone by sim._chargeRate(), so PROXIMITY is what fills the gauge: a car tucked right in
  // fills in ~1.2 s, one loafing at the back edge takes ~2.6 s. That is the skill
  // expression the flat 32/s never had — depth in the zone was worth nothing, so there was
  // no reason to take the risky position.
  charge: 85,      // per second, at the deepest point of the zone
  chargeFloor: 0.45,   // multiplier on `charge` at the shallow edge of the zone
  drag: 0.62,      // air-resistance multiplier -> passive speed gain
  steer: 0.85,     // heavy but responsive
  gFactor: 1.35,   // centrifugal multiplier: the real cost, felt only in corners
};
export const SHALLOW = {
  // dzMin tracks DEEP.dzMax so the two bands abut instead of overlapping. (_resolveZone
  // returns DEEP first, so an overlap was harmless, but it made the bands lie about
  // themselves to anything else reading the spec.)
  dzMin: 3.8, dzMax: 6.6, dxMax: 0.36,
  charge: 8, drag: 0.82, steer: 0.95, gFactor: 1.12,
};
export const CHARGE_DRAIN = 6;      // per second when outside any zone
export const CHARGE_MAX = 100;
// CHARGE_SHALLOW_CAP: the shallow tow can only fill the gauge to here. THE defect this
// fixes: a full gauge used to be reachable without ever having earned a deep tick, so
// "gauge full" and "a release would slingshot" were different facts, and the HUD had to
// grow a third, dulled state to say "full, but not really". With the cap, charge ==
// CHARGE_MAX implies deep (or its coyote window) BY CONSTRUCTION, and the gauge is back to
// two honest states: blue while filling, gold + white blink when the slingshot is live —
// and "live" excludes the time a boost is already running, since the button does nothing
// there.
// Sitting in the shallow tow is still worth doing — it is most of the gauge — but the last
// 20% is only ever bought on a rival's bumper.
export const CHARGE_SHALLOW_CAP = 80;
// CHARGE_EXCESS_DRAIN: rate at which charge above CHARGE_SHALLOW_CAP is given back once
// the car settles into the shallow band (and the coyote window has closed). Clamped AT the
// cap, never below — dropping out of the deep band must not also cost the shallow charge
// you would have had anyway. 60/s takes the full 100 -> 80 in 0.33 s: fast enough that the
// loss reads as an immediate consequence of leaving the bumper rather than as a slow leak
// (CHARGE_DRAIN's 6/s would take 3.3 s and would be invisible in peripheral vision while
// the player is watching the road), and slow enough to still be ~20 animation frames of
// visibly shrinking bar rather than a single-frame snap the eye cannot catch.
export const CHARGE_EXCESS_DRAIN = 60;

// boost: consumes ALL charge. Superlinear so that mashing is strictly worse.
export const BOOST = {
  // Retuned from 0.6 / 2.0 alongside the impulse below, and NOT by feel: front-loading the
  // dash changes what a given duration is worth, so the duration was swept against
  // test/playable.test.mjs and set to the value that reproduces the original skill
  // separation (expert 4/5 seeds, plain 0/5, masher 0/5) with spin rate inside its
  // assertion. The old dash was 3.35 s long but spent 1.83 s of that merely RAMPING toward
  // its ceiling; the new one is at its ceiling within 0.15 s, so a shorter window buys more
  // ground and the two effects had to be balanced against each other empirically.
  baseDur: 0.5, durPerCharge: 2.5,
  // baseGain is deliberately near-zero: it is what a mashed, barely-charged release is
  // worth, and at 0.06 a masher got a third of a full slingshot for a tenth of the work.
  // The gain the player is actually playing for is the c^2 term.
  // gain = VMAX * (baseGain + gainPerCharge2 * c^gainExp).
  // The exponent went 2 -> 3 when the gauge got cheap in TIME. With a ~1.3 s fill, the c^2
  // curve no longer punished spam hard enough on its own: a masher was finishing 1-3 of 5
  // seeds depending on where the other knobs sat. Cubing it collapses the partial-charge
  // payoff (a 35% gauge is worth 1.5 m/s instead of 5.7 — i.e. nothing) while RAISING what
  // a full gauge pays, which is the direction the dash wanted to go anyway. Spam is now
  // beaten by the shape of the curve rather than by an arbitrary threshold.
  baseGain: 0.01, gainPerCharge2: 0.36, gainExp: 3,   // * VMAX
  slingDur: 1.4, slingGain: 1.4,          // multipliers for a FULL gauge released inside
                                          // DEEP (or its coyote window); see Sim#slingReady
  assistTime: 0.25, assistSteer: 1.25,    // exit assist, held for the whole boost + this
  // ---- anti-spam --------------------------------------------------------------
  // A proximity-weighted 95/s fills the gauge in ~1.1 s on the bumper, which is what makes
  // drafting pay — but it also handed a masher a usable gauge almost immediately, and the
  // masher went from 0/5 to 2/5 finishes. The c^2 reward curve alone stops being enough to
  // punish spam once charge is cheap in TIME, so spam is now blocked structurally instead:
  //
  // minCharge: below this the button does nothing at all. A slingshot is a thing you have,
  // not a thing you dribble — dumping a quarter-full gauge is no longer a (bad) move, it
  // is not a move. Costs a competent player nothing: they release at 100.
  // Between minCharge and CHARGE_MAX a release is legal but is an ORDINARY boost, even in
  // the deep band: the 1.4x multipliers and the chain session belong to a full gauge only
  // (Sim#slingReady). A partial release therefore stays legal-but-worse, which is the whole
  // point of this threshold, and the white blink now means exactly "a press right now
  // slingshots" rather than "a press right now might" — including while a boost is still
  // running, where the gauge can refill but the button is inert, so the bar stays blue and
  // the ready cue waits for the boost to end.
  minCharge: 25,
  // rearm: the gauge cannot start refilling for this long after a release. Physically it
  // is the tow you just blew out of; mechanically it puts a floor under the cycle time
  // that no amount of button-pressing can beat. Free for a real player, who spends ~47% of
  // every cycle repositioning for the next tow anyway.
  rearm: 0.6,
  // slingGrace: coyote time for the slingshot. The deep band is a moving, narrow box on a
  // rival's bumper, so the exact tick you leave it is not something the player can see or
  // time — and losing the 1.4x multipliers to a frame of jitter reads as the button
  // ignoring you rather than as a mistake. Within this long after the last deep tick, a
  // release still counts as a slingshot (if the gauge is full). Kept short so the skill
  // axis survives: shallow charging alone never earns it, and you still have to have
  // EARNED a deep tick.
  slingGrace: 0.25,
  // ---- the punch -------------------------------------------------------------
  // THE defect this block fixes: the boost raised the speed CAP correctly, but the only
  // thing that ever moved the car toward that cap was ACCEL (34 m/s^2, and 28.9 at the
  // 0.85 idle throttle). Measured on a real expert release: peak +54.4 m/s, but only
  // +6.3 m/s of it had arrived after 0.2 s — 11%. A 6 m/s step on a three-digit km/h
  // readout is invisible, so the dash read as "nothing happened" for its first second and
  // by the time the speed was actually there the button press was long forgotten.
  // Fraction of the total gain handed over as an INSTANT velocity step on the press frame.
  // This is the shove; everything else is follow-through.
  impulse: 0.60,
  // Acceleration available while the boost window is open, replacing ACCEL. Sized so the
  // remaining 40% of the gain lands inside ~0.1 s: the whole delta is present within the
  // first 0.2 s, which is the window the player still attributes to the button.
  accel: 260,
  // The last N seconds of the window, the gain ramps linearly to zero. Combined with
  // CAP_DECAY this makes the dash END as an event — the car is actively dragged back down
  // — instead of a boost that quietly stops being there.
  falloff: 0.35,
};

// ---------------------------------------------------------------- collisions
export const HIT = {
  dxMax: 0.18, dzMax: 0.78,
  // A full slingshot arrives on slow traffic at 50-90 m/s of closing speed, which is a
  // spin at any plausible threshold. What 0.12 additionally caught was ordinary
  // pack-jostling at ~12 m/s — the boost could not be used in traffic at all, and spin
  // recovery, not the payoff numbers, was the single largest cost in a measured run.
  spinDv: 0.20,        // relative closing speed / VMAX above which it is a SPIN
  bumpPush: 0.25, bumpChargeMul: 0.5, bumpStun: 0.30,
  // Was 1.6 s / 0.25. Measured on the final leg: one spin cost ~180 m of a 2560 m leg —
  // 7%, more than a whole slingshot returns — so a single mistake deleted the leg no
  // matter how well the other 24 seconds were driven, and every failed expert run on the
  // last leg had exactly one spin in it. At 0.9 s / 0.50 a spin is still by far the worst
  // thing that can happen to you (~90 m) without being terminal.
  spinTime: 0.9, spinSpeedMul: 0.50,
  shoulderSoft: 1.0, shoulderSpin: 1.35,
};

// ---------------------------------------------------------------- overtake spatial cue
// One abstract `overtake` event produces one four-voice composite SE per simulation tick:
// a short filtered engine body (two detuned saws + triangle sub) and a broad tyre/wind wash.
// The whole event remains <= 0.6 s and never becomes a persistent rival-engine layer. Its
// onset briefly ducks only the persistent player engine/wind beds; other SFX are untouched.
// representative position is the closest lateral clean crossing in that tick, measured
// after movement as relativeDx = car.x - player.x (negative = left, positive = right).
//
// FULL-SCALE WIDTH is derived from the existing physical/readability envelopes rather than
// being retuned in the event producer or audio consumer:
//   one drawn car width in normalised road-x = CAR_WIDTH / (ROAD_WIDTH / 2) = 0.46
//   full collision corridor                 = 2 * HIT.dxMax              = 0.36
// The larger envelope is where the cue reaches its conservative maximum. MAX = 0.75 leaves
// cross-feed in both ears instead of hard-panning a close cabinet SE.
export const OVERTAKE_PAN = Object.freeze({
  max: 0.75,
  fullScaleDx: Math.max(CAR_WIDTH / (ROAD_WIDTH / 2), 2 * HIT.dxMax),
});
export const overtakePan = (relativeDx) => {
  const dx = Number.isFinite(relativeDx) ? relativeDx : 0;
  return Math.max(-OVERTAKE_PAN.max, Math.min(OVERTAKE_PAN.max,
    dx / OVERTAKE_PAN.fullScaleDx * OVERTAKE_PAN.max));
};

// ---------------------------------------------------------------- progression
export const TOTAL_LEGS = 8;
export const START_TIME = 45;
export const legDistance = (leg) => 1600 + 120 * leg;     // metres
// Sized against measured driver ceilings, not by feel. A clean-air driver is capped at
// VMAX and loses a little to corners and traffic, so its best sustained leg pace is
// ~100.3 m/s; a driver working the tow measures ~102.8 median / ~112 p90. The final
// leg's required average therefore has to sit between those two — at the old 1.2 slope
// it was exactly 100.0 m/s, i.e. exactly the clean-air ceiling, and a driver ignoring
// the mechanic finished whenever a seed was kind. Required average for leg L is
// legDistance(L) / legExtension(L-1): 92.2 m/s at leg 7, 100.7 m/s at leg 8.
// B13: + BRAKE_CORNER.timeCost. Every clock this function issues is the clock for a leg
// that contains exactly one exception corner — the leg-1 clock is START_TIME, and
// _progress() sets the clock for leg L+1 from legExtension(L) — so the compensation is
// unconditional here rather than branching on the leg number. See BRAKE_CORNER.timeCost
// for the derivation and the measurement. Required average for leg 8 is therefore
// legDistance(8)/legExtension(7) = 2560/27.22 = 94.0 m/s of ROLLING average, which is the
// same task as the old 100.7 m/s was before one 1.8 s stop-and-go was added to the leg.
export const legExtension = (leg) => 34 - 1.226 * leg + BRAKE_CORNER.timeCost;  // seconds
// Hard-capped at 1.10. The cap is NOT reached inside 8 legs (leg 8 is 1.06), and it was
// originally a bet on a post-ending EXPERT loop starting from a higher leg number. That
// loop is REJECTED (B7, 2026-08-11) — but the cap stayed, because in the meantime it
// became the definition of a term the tests actually assert against:
//   `maxCurvature(999)` is how "the strongest curvature this generator can EVER emit"
//   is written, and the cap is the only reason that expression converges to a number.
// Three live assertions read it that way: sim.test.mjs §7 measures the cornering cost at
// that worst case and proves it stays under the steering authority (the CENTRIFUGAL
// invariant), and §13 asserts twice that the B13 brake-corner bound is STRICTLY ADDITIVE
// — `brakeCornerEntrySpeed(maxCurvature(999)) === Infinity`, i.e. no ordinary corner
// anywhere on the ceiling demands braking. Uncap it and that expression becomes 70.4,
// which is above CURVE_FLAT_MAX (2.235) and would turn a proof into a false statement.
// B14 also derived CURVE_ACCUM from this same 1.10, and B13's §13 measures the ordinary/
// exception split against it. So it now protects the invariants, not a hypothetical loop.
export const maxCurvature = (leg) => Math.min(1.10, 0.5 + 0.07 * leg);
// Cars per 1000 m of SLOW TRAFFIC (the blue cars — obstacles, not the red rivals the tow
// targets, so this number has no effect on the draft economy at all; it only sets how often
// a mistake is available).
// Was `min(16, 2 + 1.1*leg)`: 3.1/km on leg 1 rising to 10.8/km on leg 8, i.e. a mean
// spacing of 93 m at the end. Re-derived rather than reduced by feel, against the one
// length in the game that traffic has to be compared with: a full slingshot covers ~177 m
// (measured, see BACKLOG). At 93 m spacing a dash met TWO cars on average, during the one
// phase where the car is least steerable (drift goes as v^2 and the dash peaks at ~152 m/s)
// — so traffic during a dash was not a thing you threaded, it was a lottery, and it is
// where essentially all of the expert bot's spins came from. Setting the final-leg spacing
// to one dash length (1000/177 = 5.6 cars/km) makes the dash something you AIM through a
// gap: on average one car to deal with, not two.
//   trafficDensity(leg) = 1.5 + 0.5*leg  ->  2.0/km on leg 1 (500 m spacing, teaching),
//   5.5/km on leg 8 (182 m spacing, one dash length).
// (B5, 2026-08-11) The `min(8, ...)` cap is GONE. It was reached at leg 13 and the game
// has 8 legs, so it never bound; it was carried purely as a bet on B7's post-ending EXPERT
// loop, and B7 is now rejected. Unlike maxCurvature's cap it was load-bearing for nothing:
// no assertion, invariant or derivation evaluates trafficDensity outside 1..TOTAL_LEGS,
// and course.js only ever calls it with a real leg number. A cap whose only job is to keep
// a formula sane on inputs no caller can produce is a claim about code that does not exist.
export const trafficDensity = (leg) => 1.5 + 0.5 * leg; // cars per 1000 m
// Rivals must be slower than the player's clean-air top speed by enough that a
// closing gap is actually closable. At 0.92+ Vmax the closing rate was ~6 m/s, which
// any single spin wiped out permanently — the player could never reach a tow again.
// The tow is only worth taking if sitting in it costs little: while station-keeping the
// player is pinned to this speed, so every m/s below VMAX is a tax on charging. At
// 0.88 VMAX the tax exceeded what the release paid back. It still has to be strictly
// below VMAX or the pack could never be caught in clean air at all.
export const rivalSpeed = (leg) => (0.93 + 0.004 * leg) * VMAX;
export const rivalWobble = (leg) => 0.10 + 0.015 * leg;

// ---- THE FLOOR ON ENGINE BRAKING (P6), the other side of COAST_DRAG_CEILING ------------
// P4 recorded, correctly, that the physics puts no LOWER bound on COAST_DRAG. The DRAFT
// does. The slipstream raises the player's cap to DEEP_CAP while the car being drafted runs
// at rivalSpeed, so the zone itself hands the player an overspeed they did not ask for and
// must cancel to stay in it:
//     dv    = DEEP_CAP - rivalSpeed(1)          (leg 1 is the worst: the slowest rivals)
//     band  = (DEEP.dzMax - DEEP.dzMin) * CAR_LEN
// The player has exactly one tool for this that is not the BRAKE sledgehammer — releasing
// UP — and it must null dv inside the band, or the car is spat out of the front of the zone
// before the gauge fills and the whole tow-charge-slingshot loop is unreachable by hand:
//     COAST_DRAG >= dv^2 / (2 * band)
// The bots never revealed this because driver.js station-keeps with a PD on the gap, which
// has a continuous throttle and absorbs any constant drag as a steady-state offset. A pair
// of hands has an ON/OFF key. This is the floor; COAST_DRAG_CEILING is the roof; the shipped
// 9 sits between them (1.48x the floor, 0.62x the roof). Both are asserted (sim.test §18/§19).
export const DEEP_CAP = VMAX * (1 + (1 - DEEP.drag) * 0.16);
export const DRAFT_HOLD_DRAG = (() => {
  const dv = DEEP_CAP - rivalSpeed(1);
  return (dv * dv) / (2 * (DEEP.dzMax - DEEP.dzMin) * CAR_LEN);
})();
export const RIVAL_SLOWDOWN_WARN = 0.4; // brake lamp lead time, seconds
// Pack spacing, as a fraction of how far one full slingshot closes on a rival
// (computed in sim._packGap from BOOST and rivalSpeed — never picked by feel).
// Below 1.0 on purpose: a release that lands exactly on the next tow's tail arrives with
// no margin to decelerate into the zone, so the boost is set to slightly overshoot the
// gap and the player brakes into station instead of coasting up to it for seconds.
// Reduced from 0.52/0.86: the boost is now much stronger, so its reach — and with it
// the derived spacing — grew, and the extra spacing was spent coasting up to the next
// tow at clean-air speed, which is exactly the phase the mechanic is supposed to replace.
// B8 (2026-08-11), re-swept after the traffic cut and then REJECTED. Left at 0.30/0.55.
// The old B8 result ("0.22/0.44 lifts strategy A from +8.5% to +12.0%, blocked only by the
// spin gate") was measured on 5 seeds and does not survive 32, let alone 96: across
// 0.30..0.22 strategy A sits on a PLATEAU of +9.1..+11.2% and the spin cost is
// non-monotone. What IS monotone, and what the 5-seed basis could never see, is the
// MASHER's finish rate — 96 seeds per value, all three drivers:
//
//   PACK_GAP     plain    masher    expert    expert mean spins
//   0.30/0.55     2/96      2/96     87/96     5.97
//   0.28/0.53     1/96     13/96     87/96     6.45
//   0.26/0.50     3/96     18/96     88/96     6.49
//   0.22/0.44     4/96     21/96     91/96     7.53
//
// Tighter spacing means the next rival is always already within reach, so dumping a partial
// gauge and coasting up to the next tow becomes viable — i.e. it pays for exactly the
// behaviour the c^3 reward curve, `minCharge` and `rearm` all exist to punish. Buying
// +1.3% of expert pace at the cost of a 6.5x rise in how often mashing finishes the game is
// a bad trade in a design whose entire claim is skill separation. The spin gate was never
// the real objection; this is.
export const PACK_GAP = { min: 0.30, max: 0.55 };
export const RIVAL_DRIFT_RATE = 0.18;   // normalised x per second of idle lateral wander
// Rivals thread the traffic instead of driving through it.
// A tow that ploughs through a slow car is a tow the player cannot follow: holding the
// draft would mean rear-ending traffic at ~40 m/s, so the player must leave the zone and
// the gauge never fills. Measured before this existed: 82% of all DEEP-zone exits
// happened while a slow car sat on the rival's line, median draft stint 0.78 s against
// the 5.0 s needed to fill the gauge. With rivals picking the clean line, traffic stops
// being the thing that breaks the tow and becomes the reason to take one.
export const RIVAL_AVOID = {
  lookahead: 3.2,   // seconds of closing time a rival looks ahead for slow traffic
  // A rival must clear a slow car by enough that ANYONE sitting in its draft zone
  // clears it too, otherwise the tow stays clean and the follower still has to bail.
  // = the full half-width of the DEEP zone plus the collision half-width.
  dx: DEEP.dxMax + HIT.dxMax,
  offset: DEEP.dxMax + HIT.dxMax + 0.14,  // aim point, one margin outside that
  rate: 0.55,       // normalised x per second while avoiding (vs RIVAL_DRIFT_RATE idling)
  laneMax: 0.66,    // the draft line must stay far enough inside HIT.shoulderSoft that a
                    // player holding it at the edge of DEEP.dxMax is still on the road
};

// ---------------------------------------------------------------- scoring
export const SCORE = {
  perMetre: 1,
  deepMetreBonus: 3,      // extra per metre travelled inside DEEP
  checkpoint: 100,        // * remaining seconds
  // A chain belongs to ONE slingshot boost session. A target scores only when its
  // relative z crosses from ahead to behind for the first time in that target lifecycle.
  // Rival and traffic base points are immediate; the bounded link bonus is banked once
  // when the boost expires naturally or the finish is crossed. Spin/timeout/game-over
  // preserve already-earned base points but forfeit the link bonus. Checkpoints and bumps
  // do not end the session. Normal boosts and passes outside a boost never score here.
  slingshotRival: 500,
  slingshotTraffic: 200,
  chainLink: 250,          // * min(max(chain - 1, 0), chainLinkCap)
  chainLinkCap: 3,
  finishTime: 1000,       // * remaining seconds at the finish gate
};

// INV-CHAIN-SESSION (gameplay-visible scoring contract):
// - identity: every spawned rival/traffic car receives one passId; it can score at most
//   once in its lifecycle, while a later spawn receives a different passId;
// - session: only release.sling === true starts a fresh chain at zero with a fresh seen-ID
//   set; neither state may survive natural end, finish, spin, timeout/game-over or reset;
// - causal event: score is emitted only by an ahead->behind relative-z crossing by a real
//   vehicle during that session; a collision on the crossing tick wins and excludes it;
// - ordering: all crossings on the boost's final tick are processed before its one allowed
//   settlement, and rival/traffic ordering cannot change the total;
// - readout: each scored pass publishes kind/base points/chain, and settlement publishes
//   chain/bonus/reason so the HUD and SE never reconstruct gameplay state.

// ---------------------------------------------------------------- the crash spin (P1)
// HOW A SPIN IS PRESENTED. The simulation's spin is untouched by this block: HIT.spinTime
// and HIT.spinSpeedMul own the timing and the speed loss, this owns nothing but the
// picture. It lives here rather than in render.js because it is gameplay-visible feedback
// on the game's single most punishing event (B3a item 0d, B14).
//
// WHY THE OLD PRESENTATION COULD NOT WORK, and it is a representation error rather than a
// tuning one. Every car in this game is a CAMERA-FACING BILLBOARD: _drawCar and
// _drawPlayer paint an axis-aligned silhouette at a projected point, with no model and no
// orientation. Applying a 2D rotation transform to a billboard rotates THE PICTURE about
// the screen's own normal — the axis pointing at the player's eye. A car spinning on
// tarmac rotates about the GROUND's normal, which in this projection is very nearly
// vertical on screen. Those two axes are ~90 degrees apart, so no amount of slowing,
// damping or easing the transform can make it read correctly: it is the wrong axis, and
// the drawn result is a car doing a barrel roll / a sprite on a turntable.
//
// WHAT CARRIES A GROUND-PLANE YAW INSTEAD, all three cues drawn from the SAME yaw angle so
// they cannot disagree:
//
//  (1) THE FEATURES SWEEP ACROSS A FIXED SILHOUETTE — the primary cue. See the P8 block
//      below: the drawn box is CONSTANT in width AND height for the whole spin, and the
//      yaw is carried by where the cabin, the lamps and the four tyres sit inside it.
//      (P1 and P7 instead swung the drawn WIDTH by |cos psi|*CAR_WIDTH + |sin psi|*CAR_LEN
//      — geometrically exact, and reported from play three times as a squash-and-stretch.
//      That formula is still here, but as the DIVISOR that normalises feature offsets, not
//      as a drawn size. Nothing in the branch scales any more.)
//  (2) FACING IDENTITY — which END of the car is pointed at the camera. Tail lamps and a
//      rear window when it is facing away, a windscreen and headlamps when it has come
//      round to face you, a long roofline over a visible wheel at each end when it is
//      broadside. Without this, (1) alone is ambiguous between a yaw and a squash.
//  (3) A SHADOW AND SCRUB THAT STAY ON THE GROUND — the shadow is drawn as a flat
//      axis-aligned smear whose width tracks the same footprint as the body but which
//      NEVER rotates, and the tyre scrub marks are laid at the car's ground contact and
//      left behind in world space. These are what make the tarmac the frame of reference
//      instead of the screen.
//
// NOT USED, and recorded so it is not re-tried: a lateral DRIFT of the sprite across the
// road. It is a real cue in the genre, but the sim deliberately holds x fixed through a
// spin (steering is disabled while spinning, sim.js) and faking the drift in the renderer
// would put the drawn car somewhere the collision model says it is not — the exact class
// of defect this project has already fixed twice (B10, and the drawn-gap work).
export const SPIN_VIS = {
  // Whole turns completed over HIT.spinTime (0.9 s). ONE, not the two the old transform
  // did. Two turns is 800 deg/s = 13.3 deg per frame at 60 Hz, which sends the width cue
  // through broadside FOUR times in 0.9 s; at a sprite ~26 px wide that reads as a
  // vibration, not a rotation. One turn is 400 deg/s, 6.7 deg/frame, two broadside passes
  // — the slowest rate that still unambiguously resolves as a full revolution. It must be
  // a whole number so the car finishes the spin pointing down the road again, which is
  // where the simulation resumes it.
  turns: 1,
  // width(psi) = |cos psi| * CAR_WIDTH + |sin psi| * CAR_LEN — quoted here so the
  // foreshortening formula is readable; both are load-bearing constants above, not new
  // numbers.
  //
  // THE SCRUB, AND THE TRAIL THAT COULD NOT EXIST. The first cut laid a long world-anchored
  // tyre trail behind the car, on the theory that marks receding with the road are the
  // strongest possible statement that the tarmac is the frame of reference. It was built,
  // and then measured, and it is INVISIBLE — not subtly, completely. This chase camera sits
  // 7.05 m behind the car (cameraSetback) and its ground band spans dz = 6.5 m (the bottom
  // scanline) to ~40 m (the horizon). A mark laid at the REAR contacts is already at
  // dz = 4.9 m, below the frame, and one laid at the FRONT contacts starts at dz = 9.3 m
  // and is swept out of the bottom of the picture in (9.3 - 6.5) / 50 = 0.056 SECONDS —
  // three frames. A screenshot is what caught this; the assertion that "52 marks are live"
  // was perfectly true and completely uninformative, which is this file's recurring lesson.
  //
  // So the scrub is kept but re-scoped to what the camera can actually show: a dense,
  // short-lived smear at the contact patches, emitted at all FOUR yawed tyre positions (the
  // front pair is the visible one), which swings side to side with the yaw. The step is one
  // emission per ~1.2 frames so that the ~0.056 s visible window always holds two or three
  // marks and the smear is continuous rather than a blinking dot. `scrubLife` only bounds
  // the list: every mark leaves the frame long before it expires.
  scrubStep: 0.02,
  scrubLife: 0.28,
  // Half-width of one scrub mark, as a fraction of CAR_WIDTH.
  scrubFrac: 0.16,
  // THE SMOKE IS THE CUE THAT SURVIVES, for the same geometric reason the trail did not: a
  // puff RISES, and rising moves it UP the frame against the perspective that is dragging it
  // down, so it stays in the picture for its whole life instead of 0.056 s. It is emitted at
  // the ground contact, not at the sprite's centre, so what the player sees is smoke coming
  // off the tarmac. 10 puffs over the 0.9 s spin, each climbing 1.6 m — over half the
  // camera's own 2.8 m height, so a puff visibly crosses from below the car's roofline to
  // above it — in 0.5 s.
  puffs: 10,
  puffRiseM: 1.6,
  puffLife: 0.5,

  // ---- P8: NOTHING SCALES. THE SILHOUETTE IS FIXED AND THE FEATURES CARRY THE YAW ------
  // Third report of one defect. P1 swung the drawn WIDTH by the yawed-rectangle formula;
  // P7 kept that premise and added ground cues in ANTI-PHASE so that something in the frame
  // got shorter as the car got wider. From play, all three times: 「スピンは車が左右にビヨン
  // ビヨン伸びているように見える」. The PREMISE is what was wrong. A camera-facing sprite
  // whose width swings reads as squash-and-stretch however correct the width law is and
  // whatever else moves against it, because a horizontal scale and a correct width law are
  // the same image.
  //
  // So the drawn box is now INVARIANT — CAR_WIDTH * pxPerM across and the same height as the
  // flat sprite, on every frame of the spin — and the rotation is carried by moving the
  // car's FEATURES laterally across it: the cabin glass, the lamp pair, the four tyres.
  // This is how fixed-resolution sprite hardware of the era faked yaw. Nothing scales, so
  // nothing can read as a scale.
  //
  // THE OFFSET MODEL, and it is one line. A feature at car-frame (u across, v along) turned
  // by psi has lateral extent u*cos psi + v*sin psi metres. The car's own half-extent at
  // that yaw is hw*|cos psi| + hl*|sin psi| (hw = CAR_WIDTH/2, hl = CAR_LEN/2) — P1's width
  // formula, halved. Dividing the first by the second gives
  //
  //     n(u,v) = (u*cos psi + v*sin psi) / (hw*|cos psi| + hl*|sin psi|)   in [-1, +1]
  //
  // for every point inside the car, BY CONSTRUCTION (|u| <= hw, |v| <= hl). So n is a
  // normalised position across the car's presented face, and a feature of drawn width fw is
  // centred n * (W - fw)/2 from the sprite's centre: it sweeps the room it has inside the
  // fixed silhouette and can never leave it. The formula that used to be the drawn size is
  // now the DIVISOR, which is precisely the change of premise this item is.
  //
  // DIRECTION. Each feature's n is a single sinusoid, so the pattern shears one way, reaches
  // the flank, wraps as the opposite side of the car comes round, and returns — one sense
  // for the whole turn. The depth -u*sin psi + v*cos psi says which features are NEAR (drawn
  // over the body) and which are FAR (drawn under it, in shade); it is the same sign
  // convention the lamp identity already used, so the two cannot disagree. `turns` is a
  // whole number, so the car finishes pointing back down the road.
  //
  // WHAT WAS KEPT FROM P7 AND WHY. (a) The four contact patches stay, re-based on n: their
  // ARRANGEMENT is a rigid-body fact no scale can produce, and it is now the strongest cue
  // in the branch. (b) The shadow stays a FOOTPRINT whose depth foreshortens, because it
  // lies on the tarmac and is the one thing in the picture that genuinely must — and with
  // the body fixed it can no longer be read as the car itself changing size. Dropped:
  // (c) the DECK/silhouette break, which existed to make the outline say something the
  // width swing could not, and would now be the only thing varying the drawn outline —
  // against the whole point of this item; and (d) the cabin-as-yawed-rectangle narrowing,
  // which was a width law for a feature, built purely as a counterweight. Both were
  // counterweights to a swing that no longer exists.
  //
  // Every fraction below is the car's own shape, quoted against CAR_WIDTH and CAR_LEN so it
  // cannot drift from the body _drawCar draws flat; none is a tuning knob for the LOOK of
  // the spin, and none is reachable by the simulation.
  roofWidFrac: 0.56,   // cabin width / CAR_WIDTH — the same 0.56 _drawPlayer draws flat, and
                       // now a CONSTANT drawn width: the cabin MOVES, it does not narrow.
  roofLenFrac: 0.45,   // cabin length / CAR_LEN. Not drawn as a width: it fixes WHERE the
                       // cabin sits. A rear-set cabin whose back edge is the car's rear face
                       // has its centre 0.5*CAR_LEN*(1 - roofLenFrac) = 1.21 m behind the
                       // car's centre, so at broadside n = -1.21/hl = -0.55 and the glass
                       // sits better than a quarter of the way toward the tail end of the
                       // fixed box. The set-back IS the cabin's sweep, and it has no freedom
                       // left in it once the cabin's own length is chosen.
  trackFrac: 0.86,     // wheel spacing across / CAR_WIDTH
  wheelbaseFrac: 0.62, // axle spacing along  / CAR_LEN
  wheelM: 0.42,        // drawn size of one contact patch, metres
  lampUFrac: 0.76,     // lamp centre across / hw. Read off the flat sprite, which puts its
                       // lamp centres at 0.12 and 0.88 of the drawn width, i.e. +-0.76 of
                       // the half width — so the spin's tail-on frame is the parked car's
                       // own lamp spacing rather than a second opinion about it.
  // The one stylisation, and it is recorded as one. A car's TRUE ground footprint at this
  // camera is 4.4 m of road seen from 7 m away: the projection makes that ~66 px of the
  // 108 px visible road band, so an honest full-strength footprint draws a black slab over
  // most of the lower screen (built, captured, looked at — see BACKLOG P7). The shadow and
  // the four contact patches are therefore drawn at this fraction of their true depth. It
  // is applied to EVERY ground element identically, so it is a uniform vertical squash of
  // the ground plane near the car rather than a per-element fudge, and the RATIO the cue is
  // actually made of (1.91x, CAR_LEN/CAR_WIDTH) is preserved exactly. Since P8 it is the
  // ONLY thing in the branch whose drawn size changes at all — and it is the ground, not
  // the car.
  groundSquash: 0.35,
  // Lamp identity, FADED rather than snapped. P1 switched it at |cos psi| = 0.35, so the
  // tail lamps vanished between one frame and the next; a lamp swinging away from you dims,
  // and the dimming is itself evidence of the turn. The window is pinned to the two bounds
  // §16 already asserts the identity against — nothing may be lit inside |cos psi| < 0.30
  // (broadside), and the identity must be unambiguous by |cos psi| = 0.50 — so this is the
  // widest fade the existing invariant allows, not a chosen one.
  lampOff: 0.30,
  lampFade: 0.20,
};

// -------------------------------------------------- background counter-scroll on curves (P5)
// THE MAIN CUE THAT SELLS A CURVE AS A CURVE. Turning right swings the car's heading right,
// so everything at optical infinity — hills, sun — must sweep LEFT across the frame. This
// is a RACING-VIEW, PRESENTATION-ONLY quantity: it reads the course's curvature and the
// car's speed and writes nothing back, and it is a different surface from B6's ceremony
// coastline (renderCoast), which has its own parallax and is not touched by this block.
//
// WHAT WAS THERE BEFORE, and it was wrong twice over. _drawSky displaced the hills by
// `-baseCurve * HILL_SHIFT_MAX`, sampled as `u = (px + shift)/VIEW_W` — so the drawn
// displacement was +curve, i.e. the hills slid the SAME way as the road's own centreline
// drift. It was CO-scrolling, the opposite of the cue. And being proportional to the
// instantaneous curvature it was a static offset, not a scroll: it snapped to a value on
// corner entry, sat there, and snapped back on exit. Nothing ever moved while the corner
// was being held, which is the whole read.
//
// THE RATE, derived from the projection with no free parameter. Heading changes at
// dtheta/dd = 1/R, and R = SEG_LEN^2 / (curve * CURVE_ACCUM) (see CURVE_ACCUM above), so
// dtheta/dt = v * curve * CURVE_ACCUM / SEG_LEN^2. A layer at infinity displaces
// (VIEW_W/2) * CAMERA_DEPTH pixels per radian near the frame centre. Hence
//
//   PX_PER_CURVE_METRE = (VIEW_W/2) * CAMERA_DEPTH * CURVE_ACCUM / SEG_LEN^2 = 2.5981
//
// pixels of background travel per unit curvature per metre driven — speed enters only
// through the metres, which is correct: the same corner costs the same heading whatever
// speed it is taken at.
export const PX_PER_CURVE_METRE =
  (VIEW_W / 2) * CAMERA_DEPTH * CURVE_ACCUM / (SEG_LEN * SEG_LEN);

export const BG_SCROLL = {
  // FRACTION OF TRUE YAW, and this is the one stylistic decision in the block. At 1.0 the
  // background is exactly right and unusable: measured over 12 seeds, a corner in this game
  // holds for a median 280 m, which is 359 px of travel on a 320 px frame — the sun leaves
  // the picture and comes back, and a landmark that wraps stops being a heading reference.
  // 0.5 is not a taste value, it is the only fraction with an on-screen referent: the road's
  // OWN projected centreline at any ring displaces (VIEW_W/2)*CAMERA_DEPTH*theta/2 px —
  // exactly half the background's, because the lateral offset of a corner is a quadratic
  // while its heading is a linear (chord bearing = half the swept angle). So at 0.5 the
  // background travels EXACTLY as far as the road's own vanishing point does, in the
  // opposite direction. The two cues are matched in size and mirrored in sign, which is
  // both what the player was asking for ("a little, the other way") and a relationship a
  // test can assert instead of eyeballing.
  yawFrac: 0.5,
  // RETURN TO NEUTRAL. Without this the offset is an absolute heading and wanders off with
  // the course; with it, the offset means "which way am I turning RIGHT NOW", which is the
  // question the cue exists to answer. Time constant derived from the road: the median
  // straight between corners is 240 m, ~2.7 s at race pace, and the cue must be fully back
  // to neutral before the next corner or a left-hander inherits the last right-hander's
  // displacement. 2.7 s / ln(100) = 0.586 s for 99% recovery, so 0.55 s. The same constant
  // seen from the other end sets how fast the cue arrives: 0.55 s is 33 frames to 63% of
  // the corner's value, well inside the 3.1 s a median corner is held.
  tau: 0.55,
  // SATURATION, in pixels, and it is a safety valve rather than an operating point. The sun
  // is the one element of this backdrop that is not periodic — the hill silhouette is
  // sampled fresh across three frame-widths every frame and can slide forever, a single sun
  // cannot. It sits at SUN_X*VIEW_W = 217.6 with r = 9, so its right edge has
  // 320 - 226.6 = 93.4 px of room before it starts leaving the frame. At yawFrac 0.5 and
  // tau 0.55 the steady-state offset is 0.5 * 2.5981 * curve * v * 0.55 = 0.714 * curve * v,
  // so the strongest ORDINARY corner the generator can emit (maxCurvature ceiling 1.10) at
  // VMAX asks for 78.6 px and never reaches this bound. Only B13's brake corners and a
  // boosted hairpin do, which is exactly the right set of things to clip.
  maxPx: 93,
  // The near rank of hills already moved at 0.6x the far rank's rate and keeps doing so:
  // two ranks at one rate is a flat cut-out, and this is the only depth the sky has.
  nearRankFrac: 0.6,
};

// Advance the background offset by one frame. Pure, and exported so the rule above is
// asserted rather than described: `off` is the current displacement in pixels (negative =
// the background has slid LEFT, which is what a RIGHT-hand curve must do), `curve` is the
// signed curvature of the segment under the camera, `speed` is m/s, `dt` seconds.
// Decay is exponential and exact rather than `off -= off*dt/tau`, so the recovery does not
// depend on the frame rate.
export function bgScrollStep(off, curve, speed, dt) {
  const rate = -BG_SCROLL.yawFrac * PX_PER_CURVE_METRE * curve * speed;   // px/s
  const next = off * Math.exp(-dt / BG_SCROLL.tau) + rate * dt;
  return next < -BG_SCROLL.maxPx ? -BG_SCROLL.maxPx
    : next > BG_SCROLL.maxPx ? BG_SCROLL.maxPx : next;
}

// ---------------------------------------------------------------- ending backdrop (B6)
// THE DAWN COASTLINE the finish ceremony plays in front of. It is a CEREMONY-STATE
// SURFACE: nothing here is ever evaluated during a race, and the racing render path does
// not read this block at all. It lives in spec.js anyway because every number below is a
// tuning constant the player sees (B3a item 0d and B14 both cost this project a pass for
// leaving exactly this kind of number in render.js).
//
// THE PICTURE, back to front: three flat dawn sky bands + a warm glow strip on the horizon
// line; the sun rising out of the water; the sea, in three bands lightening toward the
// horizon; two ranks of headland silhouettes standing on the horizon; a glitter path on
// the water under the sun; the surf line; and the near foreland the coast road runs along.
// All procedural, no assets, same flat-band vocabulary as _drawSky.
//
// SCROLL SPEEDS ARE DERIVED FROM THE CEREMONY'S OWN LENGTH, not chosen. The ceremony runs
// 18 s (game.js auto-advances FINISH at modeT > 18), so with every silhouette built on a
// period of exactly VIEW_W = 320 px:
//   - a layer must not visibly REPEAT while the player is looking at it, so the farthest
//     layer's speed < 320/18 = 17.8 px/s. `farHill` at 3.0 px/s travels 54 px in a full
//     ceremony — a sixth of the frame, plainly moved, never wrapped.
//   - a layer must be legibly MOVING within the shortest interval a player spends on one
//     still (~1 s), which at this resolution means >= ~3 px/s. Every speed below clears it,
//     the slowest by exactly its own margin: 3.0 px/s is the floor, deliberately.
//   - the ranks are spaced by ratio, not by taste: 3.0 / 7.0 / 16.0 / 22.0 is roughly
//     1 : 2.3 : 5.3 : 7.3, so the near foreland covers 288 px in the ceremony — one frame
//     width, i.e. exactly one pattern cycle, which is what makes the parallax read as
//     travel rather than as four things sliding at one speed.
// All motion is left-ward and a pure function of a clock, so there is no scroll state to
// reset: entering the ceremony twice gives the same picture at the same modeT.
export const COAST = {
  scroll: { farHill: 3.0, headland: 7.0, foreland: 16.0, surf: 22.0 },  // px/s
  // Sky band split, as fractions of the sky's height (ROAD_Y0..HORIZON_BASE = 40 px).
  // Matches _drawSky's own 0.45/0.33/rest split so the ending is the same sky grammar as
  // the road's, repainted in dawn colours; `glowPx` is the extra warm strip sitting on the
  // horizon line itself, which is what separates "dawn" from "a dark sky over water".
  sky: { topFrac: 0.42, midFrac: 0.30, glowPx: 5 },
  // The sun. `xFrac` is deliberately OFF-CENTRE: the ceremony's text is a centred column
  // ~144 px wide at its widest (FINAL SCORE at 2 px/cell), i.e. x = 88..232, so the sun and
  // the glitter path it casts are placed left of 88 to keep the brightest thing on screen
  // out from under the brightest text on screen. 0.20 * 320 = 64 px, and the glitter column
  // is 26 px wide, reaching 77 — 11 px of clearance.
  sun: {
    xFrac: 0.20, r: 13,
    // It RISES. From centre 4 px BELOW the horizon (a disc mostly still in the water) to
    // 18 px above it over the ceremony's 18 s: 1.22 px/s, which is under a pixel per frame
    // — a change you notice between two glances and never see happen, which is the only
    // honest speed for a sunrise.
    y0: 4, y1: -18, riseS: 18,
  },
  // Sea: from the horizon down to the shoreline, which sits at this fraction of the ground
  // band (HORIZON_BASE..ROAD_Y1, 120 px) -> row 154. Chosen so the two stat lines (rows
  // 128/140) sit on water and the FINAL SCORE line (156) sits on the near foreland, i.e. on
  // the darkest thing in the frame; see the contrast clause of B6's acceptance check.
  shoreFrac: 0.62,
  // Sun glitter on the water: a column of dashed highlights under the sun, widening toward
  // the viewer the way a real glitter path does. Dashes are a deterministic function of the
  // clock (no RNG) so the water shimmers instead of fizzing as noise.
  // `gate` is the fraction of the column left UNLIT. At 0.35 (the first cut) the path broke
  // into four detached blocks that read as an object floating on the water rather than as a
  // reflection; at 0.18 it is a broken line that still visibly connects the sun to the
  // shore, which is what a glitter path is.
  // `weldFrac` is the top fraction of the path that is ALWAYS lit, whatever the phase says.
  // Without it the dash pattern can open a gap immediately under the waterline and the path
  // detaches from the sun — at which point it stops reading as a reflection and starts
  // reading as an object floating on the water, which is what the first capture showed.
  glitter: { wTop: 5, wBottom: 26, dashPx: 2, rate: 1.7, gate: 0.18, wobble: 1, weldFrac: 0.18 },
  // The near foreland's wavy top edge and the surf line drawn on it.
  foreland: { amp: 4, surfPx: 1 },
  // Headland ranks: amplitude in px above the horizon, and the two spatial frequencies each
  // rank is built from (the same two-sine silhouette _drawSky uses for its hills, so the
  // coast and the road's own hills are demonstrably the same landscape).
  // The FAR rank is the TALLER one, which is not a compositional preference: a nearer rank
  // taller than the one behind it hides the far rank's skyline completely, and a layer that
  // cannot be seen cannot parallax. The first cut had it the other way round (14 vs 22) and
  // the probe measured the far rank's displacement as exactly 0 px.
  hills: { farAmp: 26, nearAmp: 15, k1: 3.0, k2: 1.7 },
};

// ---------------------------------------------------------------- palette
// Small fixed palette, era-flavoured. Index by name, never by literal hex elsewhere.
export const PAL = {
  skyTop: '#101c48', skyMid: '#2c4a8c', skyLow: '#6d84c4', sun: '#ffd76b',
  hill: '#1b3a2e', hillLit: '#2a5442',
  // Optical-infinity landmark: quieter than the road, cars, warning gold and sun. The
  // two close blue-greys give the tiny silhouette one lit edge without turning it into a
  // gameplay cue.
  distantTower: '#314866', distantTowerLit: '#496382',
  // Scenic elevated road: a cool, low-value trio that stays behind the driveable road,
  // white lane marks, cars and warning gold in the visual hierarchy.
  overpassDeck: '#414955', overpassEdge: '#596370', overpassPier: '#343d48',
  overpassUnderside: '#252c35',
  road1: '#4a4a52', road2: '#42424a',
  // Scenic cross-road pavement stays darker and cooler than the driveable road. Its seam
  // is deliberately below the lane/rumble value, so it reads as surface detail rather
  // than a warning or a route invitation.
  crossRoad: '#383a43', crossRoadSeam: '#626570',
  rumble1: '#d8d8e0', rumble2: '#b02830',
  grass1: '#1d5a2c', grass2: '#19502a',
  lane: '#d8d8e0',
  hudBg: '#000000', hudText: '#e8e8f0', hudDim: '#7a7a8c',
  timeWarn: '#ff4040', chargeLow: '#3c78d8', chargeHigh: '#ffd76b',
  // There is deliberately no third, dulled gold here. It existed for "gauge full but a
  // release would not slingshot", which CHARGE_SHALLOW_CAP made unreachable: charge can
  // only reach CHARGE_MAX while deep or inside the coyote window (proved by the reachability
  // searches in test/shallow-cap.test.mjs), so full always means live. Two states.
  gate: '#e0e0e8', gateGlow: '#ffd76b',
  // ---- car classes ------------------------------------------------------------------
  // Three roles, three hues, no two of them adjacent. THE defect this fixes: the player's
  // car and the slow TRAFFIC were both drawn '#3c7cc8' — literally the same blue — so the
  // one sprite you must never confuse with an obstacle was the obstacle's colour. On a
  // 320x224 screen a rival at 40 m is ~9 px wide and hue is the only channel left.
  //   traffic = blue   (hazard: cold, recedes)
  //   rival   = red    (target: the thing you chase and tuck in behind)
  //   player  = magenta — the only strong hue the 1985 palette had left. Deliberately NOT
  //             orange or amber: those sit between the rival red and the charge-gauge gold
  //             (#ffd76b) and would be a third member of the warm family. Magenta is far
  //             from red, from blue, from gold and from the greens, and it is squarely
  //             era-coherent — the boards of this period leant on magenta precisely because
  //             it was the cheapest way to get a colour nothing else in the scene owned.
  // ---- the ending's dawn coastline (B6) ----------------------------------------------
  // A SEPARATE, DARKER RANGE than the racing palette on purpose, and the reason is the
  // acceptance check's contrast clause rather than mood: the ceremony's own text is drawn
  // over every one of these, so the backdrop is built dark and the warmth is spent on a
  // 5 px glow strip and one sun instead of on large areas. The scrim the ceremony already
  // paints (#00000080 over the road viewport) then halves all of it again.
  // Dawn rather than dusk is carried by the ORDER of the ramp — indigo above, violet, then
  // a warm band only at the very bottom of the sky, with the sun still in the water — not
  // by any one hue, which is the only part of this a still frame can argue about.
  dawnSkyTop: '#241a46', dawnSkyMid: '#4a3260', dawnSkyLow: '#8c4a48', dawnGlow: '#d4784a',
  // THE SEA IS ALMOST BLACK, AND IT IS DERIVED, NOT ATMOSPHERE. The binding case for B6's
  // >= 4.5:1 contrast clause is the DIMMEST ceremony text on the BRIGHTEST thing under it:
  // PAL.hudDim (#7a7a8c, relative luminance 0.199) is the TIME BONUS label at row 92, and
  // row 92 is water. 4.5:1 against L = 0.199 allows the COMPOSITED background at most
  //     L_bg <= (0.199 + 0.05)/4.5 - 0.05 = 0.0033
  // and the ceremony's scrim passes 50% of the backdrop in sRGB, so dawnSeaFar itself may
  // not exceed L = 0.0058 — which is a near-black. The first cut used a handsome slate-violet
  // sea (#3a3158) and measured 4.09:1; the second tried to rescue it by taking the scrim to
  // 75% black, which passed at 4.66:1 and turned the whole coastline into a black rectangle.
  // So the lever is here, and the picture it produces is the truthful one: BEFORE SUNRISE
  // THE COLOUR IS ALL IN THE SKY AND THE WATER IS NEARLY BLACK. Everything bright in this
  // backdrop — the glow strip, the sun, the glitter path — is therefore placed where the
  // text is not, which is what COAST.sun.xFrac is for.
  dawnSeaFar: '#131530', dawnSeaMid: '#0e1026', dawnSeaNear: '#090a1a',
  dawnSurf: '#b8a8c0',
  dawnLandFar: '#1e1a38', dawnLandNear: '#131028', dawnForeland: '#050409',
  trafficBody: '#3c7cc8', trafficRoof: '#68a8e8',
  rivalBody:   '#c83c3c', rivalRoof:   '#e86868', rivalLamp: '#ff3020',
  playerBody:  '#d8489c', playerShade: '#8c2864', playerRoof: '#f090c8',
};

// READY overlay hierarchy. The instruction sits over a live, high-variance road scene,
// so it gets a local dark plate instead of the low-priority hudDim colour. Keeping these
// roles and anchors in the shared contract lets rendering and visual probes inspect the
// same values without competing magic numbers.
export const READY_OVERLAY = Object.freeze({
  ready: Object.freeze({ y: 88, scale: 4, colorRole: 'hudText' }),
  countdown: Object.freeze({ y: 118, scale: 5, colorRole: 'chargeHigh' }),
  instruction: Object.freeze({
    text: 'HOLD TOW   PRESS BOOST', y: 150, scale: 1, colorRole: 'hudText',
    plateRole: 'hudBg', plateAlpha: 0.72, padX: 6, padY: 5,
  }),
});

// Rendering-only semantic contract for the finite-distance skyline landmark. Keeping its layout
// and palette roles here makes the visual hierarchy runtime-readable and prevents the
// renderer and its probes from maintaining parallel magic numbers. It reads camera travel
// as a visual clock, but has no course position, collision or simulation hook.
export const DISTANT_TOWER = Object.freeze({
  xFrac: 0.27,
  // 38 px is the minimum that leaves the deck above the tallest hill at the chosen x
  // across the ordinary counter-scroll range; 27 px left only the spire visible.
  heightPx: 38,
  mastWidthPx: 5,
  deckWidthPx: 13,
  deckHeightPx: 4,
  spireHeightPx: 6,
  // One tower grows over most of the race rather than repeatedly popping back to the
  // horizon. Smoothstep gives zero growth velocity at both ends. The modest maximum and
  // outward drift keep it secondary to the road even at the finish.
  approachM: 12000,
  scaleFar: 1.00,
  scaleNear: 1.80,
  outwardFrac: 0.10,
  baseDropPx: 7,
  curveParallaxNear: 1.35,
  paletteRoles: Object.freeze({ body: 'distantTower', litEdge: 'distantTowerLit' }),
});

// Rendering-only semantic contract for flat scenic cross-roads. These positions are a
// visual rhythm along the authored road, not junctions in Course: neither Course nor Sim
// imports this object. At each position the renderer paints a short transverse strip on
// the exact road scanline slabs it has already projected, so curve, grade, crest clipping
// and distance fog are shared rather than approximated by a sprite.
export const CROSS_ROAD = Object.freeze({
  positionsM: Object.freeze([
    960, 2240, 3520, 4800, 6080, 7360, 8640,
    9920, 11200, 12480, 13760, 15040, 16320,
  ]),
  // Five segment-widths remain a brief event at racing speed, but survive the 2 px
  // scanline sampler far enough away to emerge through fog instead of popping in as a
  // one-slab stripe. The lateral reach is a minimum: the renderer may extend it just
  // far enough to clear the viewport at each projected scanline. This keeps the ends
  // out of frame without replacing the road-plane projection with a screen rectangle.
  lengthM: 40,
  seamM: 6,
  halfWidthM: 240,
  edgeOverscanPx: 24,
  // Start within the ordinary 1120 m road draw distance. Smoothstep gives zero opacity
  // velocity at both ends, avoiding a one-frame pop when a fast car crosses the boundary.
  visibleFarM: 1080,
  fadeInM: 260,
  paletteRoles: Object.freeze({ pavement: 'crossRoad', seam: 'crossRoadSeam' }),
  // Back-to-front within one road slab. Fog is applied after the completed segment;
  // props and cars are applied after renderRoad returns.
  layerOrder: Object.freeze([
    'distanceBands', 'mainRoad', 'crossRoad', 'centerLine', 'distanceFog',
    'roadsideProps', 'cars',
  ]),
});

// Rendering-only contract for distant diagonal elevated roads. Positions are visual
// events, never routes: Course and Sim do not import this object. Each deck spans two
// world points across and along the view, which gives it genuine perspective on curves
// and grades without ever becoming a driveable surface. The same authored structure now
// continues from middle distance into a segmented foreground underside, letting the
// camera pass below it without creating a route, collision shape or simulation event.
export const DISTANT_OVERPASS = Object.freeze({
  positionsM: Object.freeze([1800, 5000, 8200, 11400, 14600]),
  visibleFarM: 950,
  fadeInM: 140,
  // The nearer endpoint is halfDepthM closer than the event anchor. A 350 m anchor
  // cutoff therefore still leaves 200 m to that endpoint: emphatically mid-distance,
  // never an overhead crossing.
  visibleNearM: 350,
  fadeOutM: 80,
  // Crossfade from the terrain-backed distant silhouette to the foreground underside.
  // Both representations are half-alpha at 390 m and sum to one across the handoff.
  overheadFarM: 430,
  overheadFadeM: 80,
  overheadNearPlaneM: 8,
  overheadSlices: 16,
  // At 320x224 the first cut (10 m high, 84x104 m span) collapsed into a nearly
  // horizontal 1 px horizon mark. This broader/taller silhouette yields a clear diagonal
  // without approaching the car or filling the centre.
  // 9 m keeps ample visual clearance above a 2.8 m camera while allowing the real
  // projected soffit to cross the 40 px viewport ceiling during the underpass. The old
  // 24 m value put the whole bridge above the forward frustum and required a fake strip.
  heightM: 9,
  halfSpanM: 105,
  halfDepthM: 150,
  deckThicknessM: 2.2,
  edgeHeightM: 0.8,
  pierInsetM: 63,
  pierWidthM: 3.0,
  paletteRoles: Object.freeze({
    deck: 'overpassDeck', edge: 'overpassEdge', pier: 'overpassPier', underside: 'overpassUnderside',
  }),
  layerOrder: Object.freeze([
    'sky', 'distantHills', 'distantOverpass', 'terrain/mainRoad',
    'overheadUnderside', 'roadsideProps/warnings', 'checkpointGate', 'cars',
  ]),
});

/* ==================================================================
   MODULE CONTRACTS

   ---- src/course.js -------------------------------------------------
   export class Course {
     constructor(seed:number)
     // Builds the whole 8-leg course up front, deterministically.
     segments: Array<{ index, z, curve, y }>   // z = index*SEG_LEN, y = elevation (m)
     raceLength: number                         // metres of RACED road: sum of the 8
                                                // legDistance()s, 17120 m stock. This is
                                                // the finish line, and it is what the leg
                                                // generators, the traffic budget and the
                                                // course self-checks are all scoped to.
                                                // `checkpoints[7].z === raceLength`.
     totalLength: number                        // raceLength + RUNOFF_M (400 m). Metres of
                                                // road that EXISTS, not road that is
                                                // raced: the run-off exists only so the
                                                // finish ceremony has tarmac under it and
                                                // segmentAt() cannot walk off the end
                                                // while the car coasts to a stop. Never
                                                // use it as a progress denominator.
     checkpoints: Array<{ leg, z }>             // 8 entries, last one is the finish
     traffic: Array<{ z, x, speedFactor }>      // pre-placed slow cars, sorted by z
     segmentAt(z): segment
     curveAt(z): number       // interpolated curvature
     elevationAt(z): number   // interpolated elevation, metres
   }
     legCharacter: Array<{ leg, curve, elev }>  // 'fast'|'flowing'|'technical',
                                                // 'flat'|'rolling'|'mountain'
     blindCrestExclusionM: number               // derived, see below
     brakeCorners: Array<{ z, dir, severity, leg, apexZ, exitZ, entryV }>   // B13
   Generation rules (mandatory):
     - The road is COMPOSED FROM FEATURES, not walked. Each leg is sequenced from a named
       palette (STRAIGHT / KINK / SWEEPER / ESS / HAIRPIN, and FLAT / CLIMB / DESCENT /
       CREST / DIP) according to a per-leg character drawn from the seed, so legs are
       distinguishable and a road can be learned. Deterministic from the seed.
       (Superseded rule, for the record: the old contract mandated the first-order walk
       `curve[i] = clamp(curve[i-1] + rand(-0.25,0.25), +-maxCurvature(leg))` with a pull
       toward zero. Measured over 24 seeds it made every leg the same leg — 88% of the road
       in one curvature band, longest true straight 23 m, elevation range 9 m. A zero-mean
       walk with a restoring force has one stationary distribution and cannot compose.
       KEPT, re-confirmed after B13 (B5, 2026-08-11): the reason to keep a dead rule on
       the page is that a live rule is a fragment of it. The `|dcurve| <= 0.25` clause
       immediately below is the walk's per-step bound, surviving with its original
       magnitude and no longer with anything around it to explain where 0.25 came from,
       and B13 made that MORE load-bearing rather than less — the brake corner is the one
       feature allowed past maxCurvature, and the single thing that still makes it fair is
       that it must ramp in under this bound like everything else, over 136 m. B13
       explicitly declined to scope the rate limit when it scoped the ceiling. Delete the
       superseded rule and the surviving clause reads as a tuned constant.)
     - |curve[i] - curve[i-1]| <= 0.25 for every i. This is the part of the old rule that
       was load-bearing (it bounds what the steering is ever asked to counter) and it is
       preserved: every feature transition is a smoothstep ramp whose LENGTH is sized from
       its own magnitude. Asserted in Course._selfCheck().
     - |curve[i]| <= maxCurvature(leg[i]). Unchanged, and NOT raised: stronger corners are
       made by contrast (a hairpin is preceded by a mandatory 220 m straight run-up), not
       by lifting the ceiling, so the CENTRIFUGAL invariant above is untouched.
     - No traffic car may be placed within 2 segments after any segment
       whose |curve| > 0.4 (blind-corner rule).
     - No traffic car within 40 m of a checkpoint z.
     - BLIND-CREST rule: no traffic car may be hidden by a hill from any camera position
       within `blindCrestExclusionM` of it. That distance is DERIVED, not chosen:
         D = vClose * (tReact + tSteer)
       where vClose is the peak slingshot speed minus the slowest traffic, tSteer is the
       time to move from dead-on to clear of HIT.dxMax using boost-assisted steering minus
       the centrifugal drift at the worst curvature traffic may legally sit on (0.4 — which
       is why this rule and the blind-corner rule have to be derived together), and tReact
       is a 0.30 s human reaction budget. Stock spec: D = 45.4 m. See course.js.
     - Traffic count per leg = trafficDensity(leg) * legDistance(leg)/1000.
     - BRAKE-CORNER rule (B13). Exactly BRAKE_CORNER.perLeg exception corners per leg from
       leg BRAKE_CORNER.firstLeg onward (leg 1, the teaching leg, is exempt) — ~1 per leg,
       RARE and never a rhythm; a universal corner-speed policy was measured and rejected.
       Each is emitted as an ordinary feature (same ramp writer, same |dcurve| <= 0.25
       guarantee) at |curve| = BRAKE_CORNER.curve, which is ABOVE maxCurvature(leg) and
       above CURVE_FLAT_MAX, so no steering input holds it at VMAX. Every segment it
       writes carries `brakeCorner: true`; the maxCurvature ceiling and the CENTRIFUGAL
       invariant continue to govern every segment that does not. Mandatory 260 m straight
       run-up, and the approach is declared a level window so the WARN sign props.js places
       at 1.5*D = 68 m can see the corner over the terrain. Published as `brakeCorners`,
       whose `z` is the first metre at which |curve| passes CURVE_FLAT_MAX.

   ---- src/render.js -------------------------------------------------
   export class Renderer {
     constructor(ctx: CanvasRenderingContext2D)
     // Call order per frame:
     beginFrame()
     renderRoad(course, cam)         // cam = { z, x, height }  x normalised
     // After renderRoad, this is valid for the current frame:
     project(z:number, x:number, yOffset:number): { sx, sy, scale, visible }
        // scale = pixels per metre at that depth; visible=false when behind camera,
        // beyond DRAW_DISTANCE, or occluded by a hill crest.
     drawSprite(z, x, drawFn)        // drawFn(ctx, sx, sy, scale) called only if visible;
                                     // must be depth-sorted far->near by the CALLER.
     endFrame()
   }
   TWO ORDERS, AND THEY ARE OPPOSITE ON PURPOSE (B5, 2026-08-11). This has been misread
   before, so it is stated once here: the ROAD is rasterised NEAR->FAR, because occlusion
   is a running "highest scanline drawn so far" clip and a crest can only hide what is
   drawn after it; SPRITES are handed to drawSprite() FAR->NEAR by the caller
   (`game.js` sorts descending z), because between two sprites the only thing resolving
   overlap is painter's order. Sprites do not fight the road for occlusion — drawSprite()
   consults the same clip table the road built, so a car behind a brow is CLIPPED at the
   ridge row rather than culled (INV-CREST-CLIPS-NOT-CULLS, sim.test.mjs §12).
   Requirements: scanline/segment-based pseudo-3D (projected trapezoids), hill occlusion
   via a running max-y clip drawn NEAR->FAR (the crest occlusion depends on that order),
   alternating road/grass/rumble bands, lane dashes, curve-driven vanishing-point shift,
   fog-to-sky fade near the draw-distance limit. Must render into the y range
   [ROAD_Y0, ROAD_Y1) only.

   VANISHING-POINT SHIFT (renegotiated 2026-08-11, B14; supersedes "max +-7 cells").
   The old contract fixed the shift at +-7 cells = +-56 px and reached it through a
   tanh soft-limit. That was an inherited number and it was the wrong frame to think in:
   it saturates from curvature 0.2 upward, so a 1.03 hairpin and a 0.4 sweeper were drawn
   within 20% of each other, and on real courses (32 seeds, camera stepped every 64 m)
   the drawn shift measured 19 px on straight road against 25 px inside a 1.0 hairpin —
   the renderer was destroying the course's curvature ORDERING, not merely capping its
   magnitude. The shift is now governed entirely by CURVE_ACCUM (above), which is derived
   from corner geometry, and the only remaining bound is the off-frame clamp
   LATERAL_LIMIT_M, which by construction can never move a pixel that is inside the
   viewport. Consequences that the fairness rules depend on, and which hold:
     - at the maximum curvature the generator can emit (1.10) the road leaves the frame
       112 m ahead of the camera, against the D = 45.4 m sight distance the blind-corner
       and blind-crest rules require (2.5x margin) and the 68 m at which B12 places a
       brake-corner warning sign (1.6x margin);
     - the road only ever leaves the frame inside a corner, so no straight loses its
       vanishing point.

   ---- src/game.js lifecycle and persistence -------------------------
   High scores are always a non-empty, score-descending top-five array of
   { name, score }. Names are exactly three ASCII characters from A-Z/space/./-/!;
   scores are safe integers in [0, 9_999_999]. A mixed stored array rescues its valid
   entries; an unreadable, empty or wholly invalid value uses the cabinet defaults.
   Existing non-canonical storage is rewritten once, while a missing key or canonical
   value causes no write. Storage exceptions never prevent startup.

   The game clock is active exactly while the document is visible and the window is
   focused. Losing either condition clears live input and freezes simulation, mode,
   ceremony, entry and presentation clocks. Held codes become blocked until their keyup;
   only a later keydown may act. READY and RACE draw PAUSED while inactive.

   startRun() creates a new simulation, then clears every run-local flash/readout/trail,
   queued boost edge and terminal one-shot guard before READY can render. It stops audio
   one-shots and delayed work without replacing Sound or AudioContext. Cabinet history,
   mute/unlock state, the global animation clock, renderer, Sound identity and held-key
   edge state are preserved.

   A game-over tick is an audio terminal bundle: its game-over jingle is resolved before
   ordinary reactions and is the only one-shot emitted on that tick. The guard is once per
   run; low-time warnings are eligible only when the post-tick mode remains RACE.

   ATTRACT/title is always silent, both on initial load and after GAME OVER, initials entry,
   or the high-score path. Entering it stops BGM, persistent engine/wind beds, delayed work
   and residual one-shots; its visual demo emits no audio. Visibility restoration must not
   restart anything there. A later startRun preserves mute/unlock state and re-arms normal
   READY/RACE audio through the ordinary per-frame lifecycle.

   ---- src/audio.js --------------------------------------------------
   export class Sound {
     constructor()
     unlock(): Promise<void>          // must be called from a user gesture
     setEngine({ speed01, boosting })
     setDraft(level01)                // 0 = clean air, 1 = deep zone (muffled wind)
     sfx(name, { pan? }) // one of AUDIO_EVENTS.sfx; pan applies only to `overtake`
     jingle(name)// one of AUDIO_EVENTS.jingle
     // (B5) The checkpoint is a JINGLE and only a jingle. The contract used to name it on
     // both surfaces and audio.js implemented both (a G5 blip and the rising triad), but
     // only the jingle was ever on the live path — game.js fires it from `ev.checkpoint`
     // and nothing calls sfx('checkpoint'). The SE was deleted, not the jingle, so what
     // the player hears is unchanged.
     music(name) // internal cue control; ATTRACT/title and gameplay currently request none
     setMuted(b)
   }
   Pure WebAudio synthesis, no assets. Must degrade silently if WebAudio is absent.
   An overtake event retains `overtake` as its count and may additionally carry
   `overtakePan`. The representative is the collision-free, not-already-overtaken car
   among every ahead->behind crossing in that tick with minimum abs(car.x - player.x).
   Traversal remains rivals before traffic and array order within each, and an exact tie
   keeps the first target. No candidate means no pan field (presentation/audio treat a
   missing or zero field as centre). The producer maps relativeDx through OVERTAKE_PAN;
   the audio boundary independently sanitises its public option to [-1, 1], treating
   undefined/NaN/Infinity as zero. StereoPannerNode absence or failure is a centred mono
   fallback, and all four overtake voices converge on one panner when it is available.
   All sibling SFX remain centred and otherwise unchanged.
   ================================================================== */

// Executable event-boundary registry. Tests census gameplay producers and audio programs
// against this object so unknown events, dead aliases and orphan programs cannot drift.
export const AUDIO_EVENTS = Object.freeze({
  sfx: Object.freeze([
    'bump', 'spin', 'release', 'boostOut', 'chargeFull', 'overtake', 'chainBonus', 'timeLow',
  ]),
  jingle: Object.freeze(['checkpoint', 'finish', 'gameover', 'entry']),
});
