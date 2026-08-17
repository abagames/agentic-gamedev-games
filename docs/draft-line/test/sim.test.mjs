// Headless behaviour tests for the DRAFT LINE simulation.
// These exist to check the *design claims*, not just that the code runs:
// mashing must be strictly worse than saving, idling must be non-viable,
// and light contact must not end a run.
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';
import { Renderer, cameraSetback } from '../src/render.js';
import { Course } from '../src/course.js';
import { propsFor, PROP_KINDS } from '../src/props.js';
import { makeDriver } from '../src/driver.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// A flat, empty course so the simulation is the only variable under test.
function stubCourse() {
  const checkpoints = [];
  let z = 0;
  for (let leg = 1; leg <= S.TOTAL_LEGS; leg++) { z += S.legDistance(leg); checkpoints.push({ leg, z }); }
  return {
    checkpoints, traffic: [], totalLength: z,
    curveAt: () => 0, elevationAt: () => 0,
    segmentAt: (zz) => ({ index: Math.floor(zz / S.SEG_LEN), z: zz, curve: 0, y: 0 }),
  };
}

// Pins one rival at a fixed relative depth so the draft zone is deterministic,
// plus a far decoy so the sim's "always keep fuel ahead" spawner stays quiet.
function pinRivals(sim, dzCarLengths) {
  sim.rivals = [
    { z: sim.z + dzCarLengths * S.CAR_LEN, x: sim.x, targetX: sim.x, speed: S.VMAX * 0.94,
      baseSpeed: S.VMAX * 0.94, brakeTimer: 999, lamp: 0, braking: 0, overtaken: true },
    { z: sim.z + 1200, x: 0, targetX: 0, speed: S.VMAX * 0.94, baseSpeed: S.VMAX * 0.94,
      brakeTimer: 999, lamp: 0, braking: 0, overtaken: true },
  ];
}

const DT = 1 / 60;

// ---------------------------------------------------------------- 1. charge rate
{
  const sim = new Sim(stubCourse(), 1);
  sim.speed = S.VMAX;
  let t = 0;
  while (sim.charge < S.CHARGE_MAX && t < 20) { pinRivals(sim, 1.2); sim.step(DT, { steer: 0, throttle: 1, boost: false }); t += DT; }
  // The gauge no longer integrates at a flat DEEP.charge: the rate is PROXIMITY-WEIGHTED
  // (spec.DEEP.chargeFloor), scaling from chargeFloor*charge at the back edge of the band
  // to the full rate on the bumper. So the expected fill has to be derived at the depth
  // the rivals are actually pinned to, or this assertion silently restates a rate the sim
  // stopped using.
  const depth01 = (S.DEEP.dzMax - 1.2) / (S.DEEP.dzMax - S.DEEP.dzMin);
  const rate = S.DEEP.charge * (S.DEEP.chargeFloor + (1 - S.DEEP.chargeFloor) * depth01);
  const deepFill = S.CHARGE_MAX / rate;
  ok(`deep zone fills the gauge in ~${deepFill.toFixed(1)} s at dz=1.2`,
    near(t, deepFill, 0.15), `t=${t.toFixed(2)}s`);
}
// The proximity weighting is the whole reason drafting stopped costing a fixed 3.1 s, so
// it gets its own distinguishing probe: sitting deep must fill materially faster than
// loafing at the back edge of the same band. A flat rate passes the test above and fails
// this one.
{
  const fill = (dz) => {
    const sim = new Sim(stubCourse(), 1);
    sim.speed = S.VMAX;
    let t = 0;
    while (sim.charge < S.CHARGE_MAX && t < 20) { pinRivals(sim, dz); sim.step(DT, { steer: 0, throttle: 1, boost: false }); t += DT; }
    return t;
  };
  const deepIn = fill(S.DEEP.dzMin + 0.1);
  const backEdge = fill(S.DEEP.dzMax - 0.1);
  ok('sitting deep in the tow fills the gauge faster than loafing at its back edge',
    deepIn < backEdge * 0.75, `deep=${deepIn.toFixed(2)}s backEdge=${backEdge.toFixed(2)}s`);
}
// The shallow tow no longer fills the gauge: it fills it to CHARGE_SHALLOW_CAP and stops,
// so that a FULL gauge is proof of a deep tick (see spec CHARGE_SHALLOW_CAP). Was: "fills
// the gauge in ~12.5 s" (CHARGE_MAX / SHALLOW.charge); now: reaches the cap in ~10.0 s
// (CHARGE_SHALLOW_CAP / SHALLOW.charge) and never goes past it however long it holds.
{
  const sim = new Sim(stubCourse(), 1);
  sim.speed = S.VMAX;
  let t = 0;
  while (sim.charge < S.CHARGE_SHALLOW_CAP && t < 30) { pinRivals(sim, 4.0); sim.step(DT, { steer: 0, throttle: 1, boost: false }); t += DT; }
  const shallowFill = S.CHARGE_SHALLOW_CAP / S.SHALLOW.charge;
  ok(`shallow zone fills the gauge to the cap in ~${shallowFill.toFixed(1)} s`, near(t, shallowFill, 0.4), `t=${t.toFixed(2)}s`);
  for (let i = 0; i < 600; i++) { pinRivals(sim, 4.0); sim.step(DT, { steer: 0, throttle: 1, boost: false }); }
  ok('and holding the shallow tow for another 10 s does not push it past the cap',
    sim.charge === S.CHARGE_SHALLOW_CAP, `charge=${sim.charge.toFixed(2)}`);
}

// ---------------------------------------------------------------- 2. mashing is strictly worse
function runStrategy(mode, seconds) {
  const sim = new Sim(stubCourse(), 7);
  sim.speed = S.VMAX;
  let t = 0, sinceRelease = 0;
  const startZ = sim.z;
  while (t < seconds) {
    pinRivals(sim, 1.2);
    let boost = false;
    if (mode === 'save') boost = sim.charge >= S.CHARGE_MAX - 0.01;
    else if (mode === 'mash') { sinceRelease += DT; if (sinceRelease >= 0.5) { boost = true; sinceRelease = 0; } }
    sim.step(DT, { steer: 0, throttle: 1, boost });
    t += DT;
  }
  return sim.z - startZ;
}
{
  const save = runStrategy('save', 20);
  const mash = runStrategy('mash', 20);
  const never = runStrategy('never', 20);
  ok('saving to full beats mashing', save > mash, `save=${save.toFixed(0)}m mash=${mash.toFixed(0)}m`);
  ok('mashing is not worse than never boosting (it is wasteful, not a trap)',
    mash >= never - 1, `mash=${mash.toFixed(0)}m never=${never.toFixed(0)}m`);
  ok('the mechanic is worth using at all', save > never * 1.03,
    `save=${save.toFixed(0)}m never=${never.toFixed(0)}m (+${((save / never - 1) * 100).toFixed(1)}%)`);
}

// ---------------------------------------------------------------- 3. the difficulty curve
{
  const req = [];
  for (let leg = 1; leg <= S.TOTAL_LEGS; leg++) req.push(S.legDistance(leg) / S.legExtension(leg) / S.VMAX);
  const monotone = req.every((v, i) => i === 0 || v > req[i - 1]);
  ok('required average speed rises every leg', monotone, req.map((v) => v.toFixed(2)).join(' '));
  ok('leg 1 is reachable without the mechanic', req[0] < 0.60, `${req[0].toFixed(2)} Vmax`);
  ok('leg 8 is unreachable without slingshots', req[7] > 1.00, `${req[7].toFixed(2)} Vmax`);
  // The real ceiling of a permanent tow is not the drag cap (1.06 Vmax) but the rival's
  // own speed: you cannot outrun the car you are hiding behind without leaving the zone.
  const tow = S.rivalSpeed(8) / S.VMAX;
  ok('leg 8 exceeds a permanent tow (must release, not loiter)', req[7] > tow,
    `required=${req[7].toFixed(3)} tow=${tow.toFixed(3)} Vmax`);
  // Which leg first demands more than a permanent tow can give: that is the leg where
  // the release stops being optional. Legs before it are clearable on the tow alone.
  let firstNeedingBoost = 0;
  for (let leg = 1; leg <= S.TOTAL_LEGS; leg++) {
    if (req[leg - 1] > S.rivalSpeed(leg) / S.VMAX) { firstNeedingBoost = leg; break; }
  }
  ok('the release becomes mandatory in the last third of the run',
    firstNeedingBoost >= 6 && firstNeedingBoost <= 8, `first leg needing boost: ${firstNeedingBoost}`);
}

// ---------------------------------------------------------------- 4. contact model
{
  const sim = new Sim(stubCourse(), 3);
  sim.speed = S.VMAX * 0.95;
  sim.rivals = [{ z: sim.z + 0.5 * S.CAR_LEN, x: 0, targetX: 0, speed: S.VMAX * 0.90,
    baseSpeed: S.VMAX * 0.90, brakeTimer: 999, lamp: 0, braking: 0, overtaken: true }];
  const ev = sim.step(DT, { steer: 0, throttle: 0, boost: false });
  ok('low closing speed gives BUMP, not SPIN', ev.bump && !ev.spin, `dv=0.05`);
  ok('a bump costs half the charge, not the run', sim.spin === 0 && !sim.gameOver);
}
{
  const sim = new Sim(stubCourse(), 3);
  sim.speed = S.VMAX * 1.20;
  sim.rivals = [{ z: sim.z + 0.5 * S.CAR_LEN, x: 0, targetX: 0, speed: S.VMAX * 0.90,
    baseSpeed: S.VMAX * 0.90, brakeTimer: 999, lamp: 0, braking: 0, overtaken: true }];
  const ev = sim.step(DT, { steer: 0, throttle: 0, boost: false });
  ok('high closing speed gives SPIN', ev.spin && !ev.bump, `dv=0.30`);
  ok('even a spin does not end the run', !sim.gameOver);
}

// ---------------------------------------------------------------- 5. exit assist
{
  const sim = new Sim(stubCourse(), 5);
  sim.speed = S.VMAX;
  for (let i = 0; i < 400; i++) { pinRivals(sim, 1.2); sim.step(DT, { steer: 0, throttle: 1, boost: false }); }
  pinRivals(sim, 1.2);
  sim.step(DT, { steer: 0, throttle: 1, boost: true });
  ok('release grants the dirty-air exit assist', sim.assist > 0 && sim.boost.sling,
    `assist=${sim.assist.toFixed(3)}s sling=${sim.boost.sling}`);
  const xBefore = sim.x;
  pinRivals(sim, 1.2);
  sim.step(DT, { steer: 1, throttle: 1, boost: false });
  const moved = sim.x - xBefore;
  const plainMax = S.STEER_RATE * 1.0 * DT;
  ok('steering during the assist exceeds clean-air authority', moved > plainMax * 1.1,
    `moved=${moved.toFixed(4)} clean=${plainMax.toFixed(4)}`);
}

// ---------------------------------------------------------------- 6. loitering has a ceiling
{
  const sim = new Sim(stubCourse(), 9);
  sim.speed = S.VMAX;
  for (let i = 0; i < 60 * 15; i++) { pinRivals(sim, 1.2); sim.step(DT, { steer: 0, throttle: 1, boost: false }); }
  ok('charge is capped, so loitering past full buys nothing', sim.charge === S.CHARGE_MAX,
    `charge=${sim.charge}`);
}

// ---------------------------------------------------------------- 7. cornering cost
{
  // Use the worst curvature the generator can ever produce, at any leg.
  const WORST = S.maxCurvature(999);
  const curved = { ...stubCourse(), curveAt: () => WORST };
  // Measured over a short window, before the car can reach the shoulder — otherwise the
  // off-road speed penalty and the spin clamp corrupt the reading.
  const FRAMES = 18, WINDOW = FRAMES * DT;
  const driftRate = (zone) => {
    const sim = new Sim(curved, 11);
    sim.speed = S.VMAX;
    const x0 = sim.x;
    for (let i = 0; i < FRAMES; i++) {
      if (zone) pinRivals(sim, 1.2); else sim.rivals = [{ z: sim.z + 1200, x: 0, targetX: 0,
        speed: S.VMAX * 0.94, baseSpeed: S.VMAX * 0.94, brakeTimer: 999, lamp: 0, braking: 0, overtaken: true }];
      sim.step(DT, { steer: 0, throttle: 1, boost: false });
    }
    if (sim.spin > 0 || Math.abs(sim.x) > S.HIT.shoulderSoft) throw new Error('window too long');
    return Math.abs(sim.x - x0) / WINDOW;
  };
  const clean = driftRate(false), deep = driftRate(true);
  ok('the deep zone costs grip in corners', deep > clean * 1.25,
    `clean=${clean.toFixed(3)}/s deep=${deep.toFixed(3)}/s ratio=${(deep / clean).toFixed(2)}`);
  // The load-bearing invariant: heavy, never locked.
  const authClean = S.STEER_RATE * 1.0 * (0.35 + 0.65 * 1.0);
  const authDeep = S.STEER_RATE * S.DEEP.steer * (0.35 + 0.65 * 1.06);
  ok('worst corner is counterable in clean air', clean < authClean * 0.90,
    `drift=${clean.toFixed(3)}/s vs authority=${authClean.toFixed(3)}/s (${(clean / authClean * 100).toFixed(0)}%)`);
  ok('worst corner is counterable in the DEEP zone (heavy, not locked)', deep < authDeep * 0.90,
    `drift=${deep.toFixed(3)}/s vs authority=${authDeep.toFixed(3)}/s (${(deep / authDeep * 100).toFixed(0)}%)`);

  // Same invariant at the ONE speed the old pair did not cover: mid-slingshot. Drift is
  // quadratic in speed and the boost is now worth +45% of VMAX, so this is the fastest
  // the car can ever be and the worst corner it can ever be in. It is only holdable
  // because the exit assist runs for the whole boost (see sim._release) — with the old
  // quarter-second assist the release was un-steerable and every remaining spin in a
  // measured expert run was a rear-end taken mid-boost on a bend.
  const vBoost = S.VMAX * (1 + (S.BOOST.baseGain + S.BOOST.gainPerCharge2) * S.BOOST.slingGain);
  const driftBoost = S.maxCurvature(S.TOTAL_LEGS) * vBoost * vBoost * S.CENTRIFUGAL;
  const authBoost = S.STEER_RATE * S.BOOST.assistSteer * (0.35 + 0.65 * 1.0);
  ok('worst corner is counterable at full slingshot speed', driftBoost < authBoost * 0.90,
    `v=${vBoost.toFixed(0)} drift=${driftBoost.toFixed(3)}/s vs authority=${authBoost.toFixed(3)}/s`);
}

// ---------------------------------------------------------------- 8. progression
{
  const sim = new Sim(stubCourse(), 13);
  sim.z = sim.course.checkpoints[0].z - 1;
  sim.speed = S.VMAX;
  const before = sim.timer;
  const scoreBefore = sim.score;
  const ev = sim.step(DT, { steer: 0, throttle: 1, boost: false });
  // The clock is REPLACED, not extended: surplus must not carry into the next leg,
  // or a strong opening pays for a weak finish and the difficulty curve evaporates.
  ok('checkpoint replaces the clock with this leg\'s allowance',
    ev.checkpoint && near(sim.timer, S.legExtension(1), 0.05),
    `${before.toFixed(1)}s -> ${sim.timer.toFixed(1)}s (allowance ${S.legExtension(1)})`);
  ok('surplus time is paid out as score instead of carried',
    sim.score - scoreBefore > before * S.SCORE.checkpoint * 0.99,
    `+${Math.round(sim.score - scoreBefore)} for ${before.toFixed(1)}s`);
  ok('checkpoint advances the leg', sim.leg === 2);
}
{
  const sim = new Sim(stubCourse(), 13);
  sim.leg = S.TOTAL_LEGS;
  sim.z = sim.course.checkpoints[S.TOTAL_LEGS - 1].z - 1;
  sim.speed = S.VMAX;
  const ev = sim.step(DT, { steer: 0, throttle: 1, boost: false });
  ok('the eighth gate is the finish, and the run ends', ev.finish && sim.finished);
}
{
  const sim = new Sim(stubCourse(), 13);
  sim.timer = 0.001;
  const ev = sim.step(DT, { steer: 0, throttle: 0, boost: false });
  ok('timeout immediately ends the run',
    ev.timeout && ev.gameover && sim.gameOver && sim.timer === 0);
}

// ---------------------------------------------------------------- 9. projection geometry
// Two rendering regressions that a pure-sim test can still pin, because the projection
// is pure arithmetic over the segment tables. No DOM: renderRoad only ever calls methods
// on the ctx it was handed, so a no-op proxy is a faithful stand-in.
{
  const noopCtx = new Proxy({}, { get: () => () => {} });
  // A dead-flat, dead-straight course: elevation and curvature must not confound either
  // invariant below.
  const flatCourse = {
    segments: Array.from({ length: 4000 }, (_, i) => ({ index: i, z: i * S.SEG_LEN, curve: 0, y: 0 })),
    totalLength: 4000 * S.SEG_LEN,
    checkpoints: [], traffic: [],
    curveAt: () => 0, elevationAt: () => 0,
    segmentAt: (zz) => flatCourse.segments[Math.max(0, Math.min(3999, Math.floor(zz / S.SEG_LEN)))],
  };

  // INV-RIVAL-DEPTH-STABLE: an opponent held at a CONSTANT relative depth ahead of the
  // camera must hold a constant screen row and a constant scale, no matter where the
  // camera sits inside a segment. Before the fix, project() measured its table index from
  // the camera while renderRoad filled the table from the segment grid, so the sampled
  // index sawtoothed by up to one whole segment every 8 m: the opponent slid ~5 px down
  // the screen and swelled 23% in scale, then snapped back — the reported jitter.
  {
    const r = new Renderer(noopCtx);
    const REL = 40, DTS = 90 / 60;
    let syMin = Infinity, syMax = -Infinity, scMin = Infinity, scMax = -Infinity;
    for (let i = 0; i < 60; i++) {
      const camZ = 1000 + i * DTS;
      r.beginFrame(); r.renderRoad(flatCourse, { z: camZ, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
      const p = r.project(camZ + REL, 0, 0);
      if (!p.visible) { syMin = -1e9; break; }
      syMin = Math.min(syMin, p.sy); syMax = Math.max(syMax, p.sy);
      scMin = Math.min(scMin, p.scale); scMax = Math.max(scMax, p.scale);
    }
    const sySwing = syMax - syMin;
    const scSwing = (scMax - scMin) / scMin;
    ok('an opponent at constant relative depth does not jitter in screen depth',
      sySwing < 1.0 && scSwing < 0.03,
      `sy swing ${sySwing.toFixed(2)}px, scale swing ${(scSwing * 100).toFixed(1)}%`);
  }

  // The same invariant swept to POINT-BLANK range, on all three channels. The mid-field
  // check above passes even when the near field is violently broken: reconstructing the
  // 1/dz hyperbola by linear interpolation of the ring table (and inheriting the table's
  // near-plane fold) is a 0.4% error at 50 m and an 11 px / 12%-per-tick error at 8 m,
  // which is where a car sits when you are drafting it — exactly where it was reported.
  {
    const curved = {
      segments: Array.from({ length: 4000 }, (_, i) => ({ index: i, z: i * S.SEG_LEN, curve: 0.9, y: 0 })),
      totalLength: 4000 * S.SEG_LEN, checkpoints: [], traffic: [],
      curveAt: () => 0.9, elevationAt: () => 0,
      segmentAt: (zz) => curved.segments[Math.max(0, Math.min(3999, Math.floor(zz / S.SEG_LEN)))],
    };
    const STEP = 90 / 60;   // 1.5 m per tick at racing speed
    let worstSy = 0, worstSx = 0, worstSc = 0, worstAt = 0;
    for (const course of [flatCourse, curved]) {
      for (const REL of [200, 50, 20, 14, 11, 9, 8, 7, 6, 5, 4.5, 4]) {
        const r = new Renderer(noopCtx);
        let prev = null;
        for (let i = 0; i < 48; i++) {
          const camZ = 1000 + i * STEP;
          r.beginFrame(); r.renderRoad(course, { z: camZ, x: 0.2, height: S.CAMERA_HEIGHT }); r.endFrame();
          const p = r.project(camZ + REL, 0.1, 0);
          // A car this close must not vanish: it should slide off the bottom edge, not pop.
          if (!p.visible) { worstSy = 1e9; worstAt = REL; break; }
          if (prev) {
            const a = Math.abs(p.sy - prev.sy), b = Math.abs(p.sx - prev.sx);
            const c = Math.abs(p.scale - prev.scale) / prev.scale;
            if (a > worstSy || b > worstSx || c > worstSc) worstAt = REL;
            worstSy = Math.max(worstSy, a); worstSx = Math.max(worstSx, b); worstSc = Math.max(worstSc, c);
          }
          prev = p;
        }
      }
    }
    ok('an opponent does not judder at point-blank range either (sy, sx and scale)',
      worstSy < 0.5 && worstSx < 0.5 && worstSc < 0.01,
      `worst per-tick Δsy=${worstSy.toFixed(2)}px Δsx=${worstSx.toFixed(2)}px ` +
      `Δscale=${(worstSc * 100).toFixed(2)}% (at relZ≈${worstAt}m)`);
  }

  // INV-CLOSE-APPROACH-MONOTONE: while a rival is genuinely closing, its screen row and
  // scale must increase every single tick. The interpolation error did not merely wobble —
  // it reversed the motion (sy went BACKWARDS 2.5 px on the tick the segment grid slid),
  // which reads as the car snapping away from you just as you reach its bumper.
  {
    const r = new Renderer(noopCtx);
    let camZ = 1000, relZ = 16, prev = null, reversals = 0, worst = 0;
    for (let i = 0; i < 34; i++) {
      r.beginFrame(); r.renderRoad(flatCourse, { z: camZ, x: 0.2, height: S.CAMERA_HEIGHT }); r.endFrame();
      const p = r.project(camZ + relZ, 0.1, 0);
      if (prev && p.visible) {
        if (p.sy <= prev.sy || p.scale <= prev.scale) reversals++;
        worst = Math.min(worst, p.sy - prev.sy);
      }
      prev = p; camZ += 90 / 60; relZ -= 0.35;
    }
    ok('a closing opponent never moves backwards in screen depth',
      reversals === 0, `${reversals} reversal(s), worst Δsy=${worst.toFixed(2)}px`);
  }

  // INV-NEAR-ROAD-PERSPECTIVE: on a flat road plane the projected half-width is exactly
  // linear in (y - horizon) — w = HALF_W*(y-horizon)/camAbove — so it must keep growing
  // all the way to the bottom scanline. The old near-width cap plus interpolation against
  // viewport-CLAMPED ring rows froze the drawn half-width at ~128 px across the bottom
  // 60 rows where perspective demands 107 -> 214, bending the foreground road edges back
  // inward: the "near road wraps toward the viewer" defect.
  {
    const r = new Renderer(noopCtx);
    const quads = [];
    r._slab = (xb, wb, yb, xt, wt, yt, c) => { quads.push({ wb, yb, c }); };
    const camZ = 1000 + 3.1;   // deliberately mid-segment
    r.beginFrame(); r.renderRoad(flatCourse, { z: camZ, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
    const road = quads.filter((q) => q.c === S.PAL.road1 || q.c === S.PAL.road2)
      .filter((q) => q.yb >= 120 && q.yb <= S.ROAD_Y1)
      .sort((a, b) => a.yb - b.yb);
    let worst = 0, monotonic = true;
    for (let i = 0; i < road.length; i++) {
      const trueW = (S.ROAD_WIDTH / 2) * (road[i].yb - S.HORIZON_BASE) / S.CAMERA_HEIGHT;
      worst = Math.max(worst, Math.abs(road[i].wb - trueW) / trueW);
      if (i > 0 && road[i].wb <= road[i - 1].wb) monotonic = false;   // must widen toward the viewer
    }
    ok('near road half-width grows monotonically with closeness and matches perspective',
      road.length > 20 && monotonic && worst < 0.05,
      `${road.length} slabs, worst width error ${(worst * 100).toFixed(1)}%, monotonic=${monotonic}`);
  }
}

// ------------------------------------------------- 10. player/rival alignment
// The player car cannot be projected from the camera's own position (dz = 0 is
// degenerate), so this genre pins it to a fixed screen row. Pinning the row while leaving
// the camera ON the player made that row imply a depth — 7.05 m at the default FOV, 5.64 m
// under the boost's FOV punch — that the simulation knew nothing about. Contact therefore
// fired 7 m after the sprites had visually met: at HIT.dzMax the rival was drawn with its
// base at y=306, entirely below the 200 px viewport floor, so the player crashed into an
// empty road. The camera is now set back by exactly that distance, which turns the anchor
// row into a genuine projection of the player's z.
{
  const noopCtx2 = new Proxy({}, { get: () => () => {} });
  const flat = {
    segments: Array.from({ length: 6000 }, (_, i) => ({ index: i, z: i * S.SEG_LEN, curve: 0, y: 0 })),
    totalLength: 6000 * S.SEG_LEN, checkpoints: [], traffic: [],
    curveAt: () => 0, elevationAt: () => 0,
    segmentAt: (zz) => flat.segments[Math.max(0, Math.min(5999, Math.floor(zz / S.SEG_LEN)))],
  };
  const SCREEN_HALF = S.VIEW_W / 2;
  // Inverse of the ring projection: which world depth ahead of the camera lands on row y.
  const depthAtRow = (y, d) => (S.CAMERA_HEIGHT * d * SCREEN_HALF) / (y - S.HORIZON_BASE);
  const bodyH = (scale) => Math.max(2, Math.round(S.CAR_WIDTH * 0.61 * scale));
  // Both the default FOV and the one the boost punch narrows it to (game.js: * (1 - 0.20)).
  const DEPTHS = [['default', S.CAMERA_DEPTH], ['boost-narrowed', S.CAMERA_DEPTH * 0.80]];

  // INV-PLAYER-ANCHOR-IS-A-PROJECTION: with the camera the game builds, the player's own z
  // must project exactly onto PLAYER_GROUND_Y — the anchor row is a consequence of the
  // geometry, not a constant competing with it.
  {
    let worst = 0, worstAt = '';
    for (const [name, depth] of DEPTHS) {
      const r = new Renderer(noopCtx2);
      const playerZ = 1000, back = cameraSetback(depth, S.CAMERA_HEIGHT);
      r.beginFrame();
      r.renderRoad(flat, { z: playerZ - back, x: 0, height: S.CAMERA_HEIGHT, depth });
      r.endFrame();
      const p = r.project(playerZ, 0, 0);
      const err = Math.abs(p.sy - S.PLAYER_GROUND_Y);
      if (err > worst) { worst = err; worstAt = name; }
    }
    ok('the player sprite row is a real projection of the player z, at every FOV',
      worst < 1e-6, `worst row error ${worst.toExponential(2)}px (${worstAt})`);
  }

  // INV-DRAWN-GAP-EQUALS-SIM-GAP: inverse-projecting the two drawn ground rows must
  // reproduce the simulated gap, so the daylight the player sees closes on exactly the
  // tick _collide() fires. Checked across the whole approach and at both FOVs, plus the
  // pixel-level consequence at the contact threshold itself.
  {
    let worstM = 0, daylight = null;
    for (const [name, depth] of DEPTHS) {
      const r = new Renderer(noopCtx2);
      const playerZ = 1000, back = cameraSetback(depth, S.CAMERA_HEIGHT);
      r.beginFrame();
      r.renderRoad(flat, { z: playerZ - back, x: 0, height: S.CAMERA_HEIGHT, depth });
      r.endFrame();
      const pp = r.project(playerZ, 0, 0);
      const pBottom = Math.round(pp.sy);
      const pTop = pBottom - bodyH(pp.scale);
      for (let dz = 0.2; dz <= 40; dz += 0.2) {
        const q = r.project(playerZ + dz, 0, 0);
        const drawn = depthAtRow(q.sy, depth) - depthAtRow(pp.sy, depth);
        worstM = Math.max(worstM, Math.abs(drawn - dz));
      }
      // At the sim's own contact threshold the rival's base must be ON the player sprite.
      const c = r.project(playerZ + S.HIT.dzMax * S.CAR_LEN, 0, 0);
      const base = Math.round(c.sy);
      if (!(base <= pBottom && base >= pTop)) {
        daylight = `${name}: rival base y=${base} outside player sprite ${pTop}..${pBottom}`;
      }
    }
    ok('the drawn gap to a rival equals the simulated gap, so contact lands on the sprite',
      worstM < 1e-6 && daylight === null,
      daylight || `max |drawn - simulated| = ${worstM.toExponential(2)} m over dz 0.2..40 m, both FOVs`);
  }
}

// ---------------------------------------------------------------- 11. course structure
// The generator moved from a bounded random walk to a feature sequencer. These assert the
// properties the sim and the renderer actually depend on, plus the two claims the rewrite
// was made for (legs are distinguishable; blind crests are fair).
{
  const SEEDS = [];
  for (let i = 0; i < 12; i++) SEEDS.push(101 + i * 101);
  const courses = SEEDS.map((sd) => new Course(sd));

  // INV-CURVE-RATE-LIMIT. The old contract's random walk bounded |dcurve| by 0.25 per
  // segment for free. The sequencer has to earn it, because a step change in curvature is
  // a step change in centrifugal drift the player cannot counter. (Course._selfCheck()
  // throws on violation, so this also proves construction is reachable at all.)
  let worstStep = 0, worstCurve = 0, ceilOk = true;
  for (const c of courses) {
    for (let i = 1; i < c.segments.length; i++) {
      worstStep = Math.max(worstStep, Math.abs(c.segments[i].curve - c.segments[i - 1].curve));
    }
    for (const sg of c.segments) {
      // B13 SCOPING, not weakening. The exception class (§13) is explicitly ABOVE this
      // ceiling by design and is asserted against its own derived bound below; every
      // segment the generator did not mark as one is still held to the ordinary ceiling,
      // which is the ceiling the CENTRIFUGAL invariant is proved for. The rate limit above
      // is NOT scoped — a brake corner still has to ramp in like any other feature.
      if (sg.brakeCorner) continue;
      worstCurve = Math.max(worstCurve, Math.abs(sg.curve));
      if (Math.abs(sg.curve) > S.maxCurvature(sg.leg) + 1e-9) ceilOk = false;
    }
  }
  ok('curvature never steps by more than the contract limit', worstStep <= 0.25 + 1e-9,
    `worst |dcurve| = ${worstStep.toFixed(4)} over ${courses.length} seeds`);
  // The CENTRIFUGAL invariant is proved for curve <= 1.10. The generator must not exceed
  // that, and the feature rewrite deliberately did not raise the ceiling.
  ok('ordinary curvature stays inside the ceiling the CENTRIFUGAL invariant is proved for',
    ceilOk && worstCurve <= 1.10 + 1e-9,
    `worst |curve| off a brake corner = ${worstCurve.toFixed(3)} (ceiling 1.10)`);

  // INV-LEGS-ARE-DISTINGUISHABLE. The defect the rewrite fixes is that a zero-mean walk
  // with a restoring force gives every leg the same curvature distribution. Measured as
  // the mean pairwise L1 distance between per-leg 5-bucket curvature histograms: the old
  // generator scored 0.27 (and most of that was just maxCurvature drifting up with the leg
  // number), the sequencer scores ~0.8.
  const bucket = (c) => { const a = Math.abs(c); return a < 0.05 ? 0 : a < 0.30 ? 1 : a < 0.60 ? 2 : a < 0.85 ? 3 : 4; };
  let sep = 0;
  for (const c of courses) {
    const hs = [];
    for (let leg = 1; leg <= S.TOTAL_LEGS; leg++) {
      const segs = c.segments.filter((sg) => sg.leg === leg && sg.z < c.raceLength);
      const h = [0, 0, 0, 0, 0];
      for (const sg of segs) h[bucket(sg.curve)]++;
      hs.push(h.map((v) => v / segs.length));
    }
    let d = 0, n = 0;
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      let x = 0; for (let k = 0; k < 5; k++) x += Math.abs(hs[i][k] - hs[j][k]);
      d += x; n++;
    }
    sep += d / n;
  }
  sep /= courses.length;
  ok('legs are distinguishable from each other, not draws from one distribution',
    sep >= 0.55, `mean pairwise L1 between per-leg curvature histograms = ${sep.toFixed(3)} (old generator: 0.267)`);

  // The point of the straights is contrast: a hairpin has to arrive after real nothing.
  let longest = 0;
  for (const c of courses) {
    let run = 0;
    for (const sg of c.segments) {
      if (sg.z >= c.raceLength) break;
      if (Math.abs(sg.curve) < 0.05) { run++; longest = Math.max(longest, run); } else run = 0;
    }
  }
  ok('the road contains genuine straights to make corners read as corners',
    longest * S.SEG_LEN >= 200, `longest straight = ${longest * S.SEG_LEN} m (old generator: 23 m)`);

  // INV-CREST-FAIRNESS. Every placed traffic car must be visible for at least the derived
  // avoidance distance before you reach it. Course._selfCheck() enforces this, so the
  // assertion here is the *sharper* one: the rule is not vacuous — it really does reject a
  // car placed behind a brow. Probe by sharpening a crest under a legally-placed car and
  // confirming the same predicate flips.
  const c0 = courses[0];
  const D = c0.blindCrestExclusionM;
  // Independent re-derivation of D from spec constants only.
  const peak = S.VMAX * (1 + S.BOOST.slingGain * (S.BOOST.baseGain + S.BOOST.gainPerCharge2));
  const expectD = (peak - 0.42 * S.VMAX)
    * (0.30 + S.HIT.dxMax / (S.STEER_RATE * S.BOOST.assistSteer - 0.4 * peak * peak * S.CENTRIFUGAL));
  ok('the blind-crest exclusion is derived from the spec, not a picked constant',
    near(D, expectD, 1e-6), `D = ${D.toFixed(2)} m, re-derived ${expectD.toFixed(2)} m`);

  const allFair = courses.every((c) => c.traffic.every((t) => c._crestFair(t.z)));
  ok('no traffic car is hidden behind a crest inside the avoidance distance', allFair,
    `${courses.reduce((a, c) => a + c.traffic.length, 0)} cars over ${courses.length} seeds, D = ${D.toFixed(1)} m`);

  {
    // Fail-to-pass probe for the rule itself: raise a wall of terrain just in front of a
    // real traffic car and the predicate must reject it. If it does not, the rule is dead
    // code and INV-CREST-FAIRNESS above is proving nothing.
    const c = new Course(101);
    const car = c.traffic[Math.floor(c.traffic.length / 2)];
    const before = c._crestFair(car.z);
    const i = Math.floor(car.z / S.SEG_LEN);
    const saved = [];
    for (let k = 1; k <= 3; k++) { saved.push(c.segments[i - k].y); c.segments[i - k].y += 30; }
    const after = c._crestFair(car.z);
    for (let k = 1; k <= 3; k++) c.segments[i - k].y = saved[k - 1];
    ok('the blind-crest rule is not vacuous — a car put behind a brow is rejected',
      before === true && after === false, `fair before = ${before}, after raising a 30 m brow = ${after}`);
  }

  // The elevation has to be big enough to occlude anything at all.
  let worstSight = Infinity, yRange = 0;
  for (const c of courses) {
    const n = Math.floor(c.raceLength / S.SEG_LEN);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i += 7) {
      lo = Math.min(lo, c.segments[i].y); hi = Math.max(hi, c.segments[i].y);
      let d = S.SEG_LEN;
      for (; d <= 600; d += S.SEG_LEN) if (!c._visibleFrom(i * S.SEG_LEN, i * S.SEG_LEN + d)) break;
      if (d <= 600) worstSight = Math.min(worstSight, d);
    }
    yRange = Math.max(yRange, hi - lo);
  }
  ok('hills are real: the road genuinely goes out of sight over the sharpest brow',
    worstSight < 100 && yRange > 40,
    `shortest sight distance ${worstSight} m (vs ${D.toFixed(1)} m needed to react), elevation range ${yRange.toFixed(0)} m (old generator: ~9 m per leg)`);
}

// ------------------------------------------------- 12. frame hygiene & crest occlusion
{
  // A recording ctx that only tracks WHICH ROWS get painted, and a slightly richer one
  // that honours rect()+clip() so a sprite's real raster extent can be measured. Neither
  // needs a DOM: the renderer only ever calls methods on the ctx it was handed.
  const coverCtx = () => {
    const rows = new Int32Array(S.VIEW_H);
    let path = [];
    const mark = (y) => { if (y >= 0 && y < S.VIEW_H) rows[y]++; };
    const ctx = {
      save() {}, restore() {}, beginPath() { path = []; }, closePath() {}, clip() {},
      moveTo(x, y) { path.push(y); }, lineTo(x, y) { path.push(y); },
      arc(x, y, r) { for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) mark(yy); },
      fill() { if (!path.length) return; const a = Math.floor(Math.min(...path));
               const b = Math.ceil(Math.max(...path)); for (let y = a; y < b; y++) mark(y); path = []; },
      fillRect(x, y, w, h) { for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) mark(yy); },
      rect(x, y, w, h) { path.push(y, y + h); },
      set fillStyle(v) {}, get fillStyle() { return ''; },
      set globalAlpha(v) {}, get globalAlpha() { return 1; },
    };
    return { ctx, rows };
  };
  const rasterCtx = () => {
    const rows = new Array(S.VIEW_H).fill(null);
    let clipT = 0, clipB = S.VIEW_H, path = null, style = '';
    const stack = [];
    const ctx = {
      save() { stack.push([clipT, clipB]); },
      restore() { const st = stack.pop(); if (st) { clipT = st[0]; clipB = st[1]; } },
      beginPath() { path = null; }, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {},
      rect(x, y, w, h) { path = [y, y + h]; },
      clip() { if (path) { clipT = Math.max(clipT, path[0]); clipB = Math.min(clipB, path[1]); } },
      fillRect(x, y, w, h) {
        const a = Math.max(Math.floor(y), Math.ceil(clipT));
        const b = Math.min(Math.ceil(y + h), Math.floor(clipB));
        for (let yy = a; yy < b; yy++) if (yy >= 0 && yy < S.VIEW_H) rows[yy] = style;
      },
      set fillStyle(v) { style = v; }, get fillStyle() { return style; },
      set globalAlpha(v) {}, get globalAlpha() { return 1; },
    };
    return { ctx, rows };
  };

  const course12 = new Course(4242);
  const depth12 = S.CAMERA_DEPTH;
  const back12 = cameraSetback(depth12, S.CAMERA_HEIGHT);

  // INV-GROUND-BAND-ALWAYS-PAINTED: every row from the horizon down to the bottom of the
  // road viewport must be painted at least once per frame. Nothing clears the canvas, so
  // an unpainted row keeps LAST frame's pixels — and what lands in the rows just under the
  // horizon is distant car sprites, floored to a 2x2 px blob by _drawCar. That is the
  // reported "traces of cars near the horizon". Before the fix, row 80 was left untouched
  // in 18.4% of frames and rows 81-87 in 14.0% down to 0.9%.
  {
    let worstRow = -1, worstCount = 0, frames = 0;
    const gaps = new Map();
    for (let z = 300; z < Math.min(course12.totalLength - 300, 14000); z += 23.7) {
      const { ctx, rows } = coverCtx();
      const r = new Renderer(ctx);
      r.beginFrame();
      r.renderRoad(course12, { z: z - back12, x: 0, height: S.CAMERA_HEIGHT, depth: depth12 });
      r.endFrame();
      frames++;
      for (let y = S.HORIZON_BASE; y < S.ROAD_Y1; y++) {
        if (rows[y] === 0) gaps.set(y, (gaps.get(y) || 0) + 1);
      }
    }
    for (const [y, c] of gaps) if (c > worstCount) { worstCount = c; worstRow = y; }
    ok('every row of the ground viewport is repainted every frame (no car residue can persist)',
      gaps.size === 0,
      gaps.size === 0 ? `${frames} camera positions, rows ${S.HORIZON_BASE}..${S.ROAD_Y1 - 1} all clean`
        : `row ${worstRow} unpainted in ${worstCount}/${frames} frames`);
  }

  // INV-CREST-CLIPS-NOT-CULLS: a sprite whose ground row is behind a brow but whose roof is
  // above it must paint its UPPER rows and none at or below the clip row. Folding occlusion
  // into project().visible culled such a car whole, so rivals vanished on a descent instead
  // of showing a roof over the rise.
  {
    let cases = 0, culled = 0, leaked = 0, sample = '';
    for (let z = 300; z < course12.totalLength - 400 && cases < 40; z += 4.1) {
      const { ctx, rows } = rasterCtx();
      const r = new Renderer(ctx);
      r.beginFrame();
      r.renderRoad(course12, { z: z - back12, x: 0, height: S.CAMERA_HEIGHT, depth: depth12 });
      r.endFrame();
      for (let dz = 16; dz <= 300; dz += 4) {
        const p = r.project(z + dz, 0, 0);
        if (!(p.scale > 0)) continue;
        const h = Math.max(2, Math.round(S.CAR_WIDTH * 0.61 * p.scale));
        if (h < 6) continue;                       // a real silhouette, not a 2 px dot
        const clipRow = p.clip != null ? p.clip : S.ROAD_Y1;
        // Straddling is a GEOMETRIC fact, decided before asking whether the renderer
        // thinks the sprite is visible — otherwise culling would hide its own evidence.
        if (!(p.sy > clipRow && p.sy - h < clipRow - 1)) continue;
        if (p.sy <= S.ROAD_Y0) continue;
        for (let i = 0; i < S.VIEW_H; i++) rows[i] = null;
        r.drawSprite(z + dz, 0, (c, sx, sy, scale) => {
          c.fillStyle = 'CAR';
          c.fillRect(sx - 4, sy - h, 8, h);
        });
        const painted = [];
        for (let i = 0; i < S.VIEW_H; i++) if (rows[i] === 'CAR') painted.push(i);
        cases++;
        if (!painted.length) { culled++; continue; }
        if (painted.some((y) => y >= clipRow)) leaked++;
        if (!sample) {
          sample = `e.g. clip=${p.clip.toFixed(1)} ground=${p.sy.toFixed(1)} ` +
            `roof=${(p.sy - h).toFixed(1)} painted ${painted[0]}..${painted[painted.length - 1]}`;
        }
        break;
      }
    }
    ok('a car straddling a crest paints its roof and not its wheels (clipped, never culled)',
      cases > 0 && culled === 0 && leaked === 0,
      `${cases} straddling cases, ${culled} culled whole, ${leaked} leaked below the brow; ${sample}`);
  }
}

// ------------------------------------------------- 13. brake corners (B13)
// The exception class: a small, explicitly-classed set of corners that the CENTRIFUGAL
// invariant does NOT cover, so that the brake pedal has a reason to exist. Everything here
// is additive — §7 and §11 above still prove the ordinary road exactly as they did.
{
  const SEEDS = [];
  for (let i = 0; i < 12; i++) SEEDS.push(101 + i * 101);
  const courses = SEEDS.map((sd) => new Course(sd));

  // ---- INV-BRAKE-BOUND-DERIVED ------------------------------------------------------
  // The flat-out ceiling, re-derived here from spec primitives only: the curvature at
  // which full opposite lock in clean air at VMAX exactly cancels the drift.
  const flatMax = S.STEER_RATE * (0.35 + 0.65) / (S.VMAX * S.VMAX * S.CENTRIFUGAL);
  ok('the flat-out curvature ceiling is derived, not picked',
    near(S.CURVE_FLAT_MAX, flatMax, 1e-12),
    `CURVE_FLAT_MAX = ${S.CURVE_FLAT_MAX.toFixed(4)}, re-derived ${flatMax.toFixed(4)}`);

  // The exception curvature sits strictly between its two derived bounds:
  //  - above the flat-out ceiling, or it would not require braking at all;
  //  - at or below the frame-legibility ceiling, so the road never leaves the viewport
  //    nearer than the sight distance the fairness rules are derived from.
  const D0 = courses[0].blindCrestExclusionM;
  const pxPerCurveM = S.CURVE_ACCUM * S.CAMERA_DEPTH * (S.VIEW_W / 2) / (2 * S.SEG_LEN * S.SEG_LEN);
  const legibleMax = (S.VIEW_W / 2) / (pxPerCurveM * D0);
  const offFrameM = (S.VIEW_W / 2) / (pxPerCurveM * S.BRAKE_CORNER.curve);
  ok('the exception curvature is bracketed by its two derived bounds',
    S.BRAKE_CORNER.curve > S.CURVE_FLAT_MAX && S.BRAKE_CORNER.curve <= legibleMax + 1e-9,
    `${S.CURVE_FLAT_MAX.toFixed(2)} (flat-out) < ${S.BRAKE_CORNER.curve} <= ${legibleMax.toFixed(2)} (legibility); road leaves the frame at ${offFrameM.toFixed(1)} m vs D = ${D0.toFixed(1)} m`);

  // The controllability bound itself: at the returned speed the drift consumes exactly
  // BRAKE_CORNER.phi of the steering authority — the same fraction the CENTRIFUGAL
  // invariant's worst ordinary case already consumes (84%).
  const vE = S.brakeCornerEntrySpeed(S.BRAKE_CORNER.curve);
  const driftE = S.BRAKE_CORNER.curve * vE * vE * S.CENTRIFUGAL;
  const authE = S.STEER_RATE * (0.35 + 0.65 * vE / S.VMAX);
  ok('the entry speed consumes exactly the phi the invariant already tolerates',
    near(driftE / authE, S.BRAKE_CORNER.phi, 1e-9),
    `v = ${vE.toFixed(1)} m/s, drift ${driftE.toFixed(3)}/s vs authority ${authE.toFixed(3)}/s = ${(driftE / authE * 100).toFixed(1)}% (phi ${S.BRAKE_CORNER.phi})`);

  // STRICTLY ADDITIVE. The bound must not bind on ANY ordinary curvature — if it did, this
  // would be the universal corner-speed policy B2a measured and rejected.
  const ordinaryFree = S.brakeCornerEntrySpeed(S.maxCurvature(999)) === Infinity;
  let ordinaryWorst = 0;
  for (const c of courses) for (const sg of c.segments) {
    if (!sg.brakeCorner) ordinaryWorst = Math.max(ordinaryWorst, Math.abs(sg.curve));
  }
  ok('the bound is additive: no ordinary corner ever demands braking',
    ordinaryFree && S.brakeCornerEntrySpeed(ordinaryWorst) === Infinity,
    `worst ordinary curvature over ${courses.length} seeds = ${ordinaryWorst.toFixed(3)}, ceiling ${S.maxCurvature(999)}, both below ${S.CURVE_FLAT_MAX.toFixed(3)}`);

  // ---- INV-BRAKE-RATE (~1 per leg, rare not universal) -------------------------------
  let perLegOk = true, total = 0, legsWithOne = 0, legsCounted = 0;
  for (const c of courses) {
    total += c.brakeCorners.length;
    for (const l of c.legs) {
      const n = c.brakeCorners.filter((b) => b.leg === l.leg).length;
      const want = l.leg >= S.BRAKE_CORNER.firstLeg ? S.BRAKE_CORNER.perLeg : 0;
      legsCounted++;
      if (n === want) legsWithOne++; else perLegOk = false;
    }
  }
  const rate = total / (courses.length * S.TOTAL_LEGS);
  ok('brake corners are RARE: exactly the stated rate, one per leg, never a rhythm',
    perLegOk && near(rate, 7 / 8, 1e-9),
    `${total} corners over ${courses.length} seeds x ${S.TOTAL_LEGS} legs = ${rate.toFixed(3)} per leg (stated ~1; leg 1 exempt), ${legsWithOne}/${legsCounted} legs at the exact count`);

  // ---- INV-BRAKE-TELEGRAPHED ---------------------------------------------------------
  // Every one of them carries a WARN sign, standing at or beyond the derived sight
  // distance, on the OUTSIDE of the corner, in view over the terrain, and big enough to
  // read. "Legible" is a pixel count: the sign is 2.6 m tall and the projection is
  // scale = CAMERA_DEPTH * (VIEW_W/2) / dz px per metre.
  let signed = 0, wanted = 0, minLead = Infinity, minPx = Infinity, outsideOk = true, seen = 0;
  for (const c of courses) {
    const props = propsFor(c);
    for (const b of c.brakeCorners) {
      wanted++;
      const sign = props.find((p) => p.kind === 'WARN' && p.warnFor === b);
      if (!sign) continue;
      signed++;
      minLead = Math.min(minLead, b.z - sign.z);
      // Outside of the corner: positive curve drifts the car toward -x, so the outside is
      // the side the sign must stand on.
      if (Math.sign(sign.x) !== -b.dir) outsideOk = false;
      // Terrain: the corner entry must be visible from the sign, and the sign from D back.
      let vis = true;
      for (let z = sign.z; z <= b.z; z += S.SEG_LEN) if (!c._visibleFrom(z, b.z)) vis = false;
      for (let z = sign.z - D0; z <= sign.z; z += S.SEG_LEN) if (!c._visibleFrom(z, sign.z)) vis = false;
      if (vis) seen++;
      const px = PROP_KINDS.WARN.h * S.CAMERA_DEPTH * (S.VIEW_W / 2) / (b.z - sign.z);
      minPx = Math.min(minPx, px);
    }
  }
  ok('every brake corner is telegraphed, beyond the sight distance and on the outside',
    signed === wanted && wanted > 0 && minLead >= D0 && outsideOk && seen === wanted,
    `${signed}/${wanted} signed, nearest sign ${minLead.toFixed(1)} m ahead (D = ${D0.toFixed(1)} m), ${seen}/${wanted} in view over the terrain, all on the outside`);
  ok('the warning is legible from where it stands',
    minPx >= 8, `smallest WARN sign at its own lead distance = ${minPx.toFixed(1)} px tall on a ${S.VIEW_H} px screen`);

  // ---- INV-BRAKE-PENALTY + the expert brakes and survives -----------------------------
  // Two cars, same corner, same start, same 8 seconds. One drives it the way every OTHER
  // corner in the game may be driven — flat out, full opposite lock — and one uses the
  // controller in src/driver.js, which brakes to the derived bound. If the penalty is not
  // measurable, the corner class is decoration.
  {
    const c = new Course(101);
    const bc = c.brakeCorners[0];
    const drive = makeDriver({ useTow: false, release: 'none' });
    const trial = (mode) => {
      const sim = new Sim(c, 101);
      sim.z = bc.z - 320; sim.x = 0; sim.speed = S.VMAX;
      // The corner is the only variable: no pack, no traffic.
      sim._updateRivals = () => {}; sim._updateTraffic = () => {};
      sim.rivals = []; sim.traffic = [];
      let off = 0, spins = 0, minV = Infinity;
      for (let i = 0; i < Math.round(8 / DT); i++) {
        const cv = c.curveAt(sim.z);
        const input = mode === 'flat'
          ? { steer: Math.sign(cv) || 0, throttle: 1, boost: false }
          : drive(sim, c);
        const ev = sim.step(DT, input);
        if (Math.abs(sim.x) > S.HIT.shoulderSoft) off += DT;
        if (ev.spin) spins++;
        if (sim.z > bc.z - 40) minV = Math.min(minV, sim.speed);
      }
      return { m: sim.z - (bc.z - 320), off, spins, minV, endV: sim.speed };
    };
    const flat = trial('flat'), braked = trial('brake');
    ok('entering a brake corner wrong has a measurable penalty',
      flat.m < braked.m - 100 && flat.off > 0.5 && flat.spins > 0 && braked.spins === 0,
      `flat out: ${flat.m.toFixed(0)} m in 8 s, ${flat.off.toFixed(2)} s off the road, ${flat.spins} spin(s), exits at ${flat.endV.toFixed(0)} m/s` +
      `  |  braked: ${braked.m.toFixed(0)} m, ${braked.off.toFixed(2)} s off, ${braked.spins} spin(s), exits at ${braked.endV.toFixed(0)} m/s` +
      `  -> cost ${(braked.m - flat.m).toFixed(0)} m`);
    ok('the expert controller brakes to the derived bound and holds the road',
      near(braked.minV, S.brakeCornerEntrySpeed(S.BRAKE_CORNER.curve), 1.5)
      && braked.off === 0 && braked.spins === 0,
      `slowest through the corner ${braked.minV.toFixed(1)} m/s vs derived bound ${S.brakeCornerEntrySpeed(S.BRAKE_CORNER.curve).toFixed(1)} m/s, never off the road`);
  }
}

// ------------------------------------------------- 14. font coverage (P3)
// The bug this section exists to make impossible: '+' was not in the glyph table, and the
// old fallback drew ANY unknown character as the HYPHEN glyph, so the checkpoint banner's
// "+33.2 SEC" rendered as "-33.2 SEC" — a real, readable, meaningful string that inverted
// the meaning of a bonus. It shipped for six passes because nothing about it looks wrong.
//
// Both halves below DISCOVER the strings instead of restating a list copied by eye, so they
// keep working as the strings change:
//   a) STATIC — parse every drawText/drawTextCentered call site in src/ and pull the literal
//      spans out of its first argument (quoted strings, and the literal spans of template
//      literals with the ${...} holes removed). Catches strings that exist but are only
//      drawn in states this test never reaches.
//   b) RUNTIME — run the real Game against a stub 2D context through every mode and assert
//      font.js's MISSING set (populated by the fallback itself) is still empty. Catches the
//      strings the static pass cannot see: variables, sim-supplied numbers, prop labels.
{
  const { readdirSync, readFileSync } = await import('node:fs');
  const { GLYPHS, MISSING, drawText } = await import('../src/font.js');
  const SRC = new URL('../src/', import.meta.url);

  ok('the fallback glyph is not a real character', !Object.values(GLYPHS).includes('111,111,111,111,111'),
    'unknown chars draw as a solid block, which cannot be misread as text');
  ok(`'+' has a glyph`, !!GLYPHS['+'], 'the P3 root cause');

  // ---- (a) static: every literal that reaches a text draw call ----------
  const missingStatic = new Map();  // char -> example string
  let sites = 0, literals = 0;
  const chunksOf = (arg) => {
    const out = [];
    // quoted literals
    for (const m of arg.matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)) out.push(m[1] ?? m[2]);
    // template literals, holes removed (the hole's own charset is checked below)
    for (const m of arg.matchAll(/`([^`]*)`/g)) out.push(m[1].replace(/\$\{[^}]*\}/g, ''));
    return out;
  };
  // font.js itself is excluded: it is where drawText is DEFINED, and its default colour
  // argument ('#fff') is not a string anyone draws.
  for (const f of readdirSync(SRC).filter((n) => n.endsWith('.js') && n !== 'font.js')) {
    const src = readFileSync(new URL(f, SRC), 'utf8');
    for (const m of src.matchAll(/drawText(?:Centered)?\s*\(([\s\S]{0,400}?)\)\s*;/g)) {
      sites++;
      for (const c of chunksOf(m[1])) {
        if (c.startsWith('#')) continue;   // a colour argument, never drawn
        literals++;
        for (const ch of c.toUpperCase()) if (!GLYPHS[ch]) missingStatic.set(ch, c);
      }
    }
    // the initials alphabet is a text surface too, and it is a bare constant
    for (const m of src.matchAll(/LETTERS\s*=\s*'([^']*)'/g)) {
      literals++;
      for (const ch of m[1].toUpperCase()) if (!GLYPHS[ch]) missingStatic.set(ch, 'LETTERS');
    }
  }
  ok('every literal at a text-draw call site has a glyph',
    missingStatic.size === 0 && sites >= 20 && literals >= 25,
    `${sites} call sites, ${literals} literal spans; missing: ${[...missingStatic].map(([c, s2]) => `${JSON.stringify(c)} in "${s2}"`).join(', ') || 'none'}`);

  // Anything a ${...} hole can put on screen: numbers, their sign, their separators, and
  // any letter (leg names, initials, prop labels).
  const DYN = '0123456789 .+-/:ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  ok('every character a formatted number or name can produce has a glyph',
    [...DYN].every((c) => !!GLYPHS[c]), `charset "${DYN}"`);

  // ---- (b) runtime: drive the real Game and read the fallback's own log ----
  MISSING.clear();
  const noop = () => {};
  const stubCtx = {
    fillStyle: '#000', globalAlpha: 1, imageSmoothingEnabled: false,
    save: noop, restore: noop, beginPath: noop, closePath: noop, clip: noop,
    fill: noop, fillRect: noop, rect: noop, moveTo: noop, lineTo: noop,
    arc: noop, translate: noop, rotate: noop,
  };
  globalThis.localStorage = {
    getItem: () => null, setItem: noop, removeItem: noop,
  };
  const { Game } = await import('../src/game.js');
  const g = new Game(stubCtx);
  const run = (n) => { for (let i = 0; i < n; i++) { g.update(DT); g.render(); } };
  const modesSeen = new Set();
  const mark = () => modesSeen.add(g.mode);

  run(120); mark();                       // attract
  g.startRun(); run(30); mark();          // ready
  run(150); mark();                       // race
  g.cpFlash = 1.2; g.sim.leg = 3; run(10);        // checkpoint banner (the P3 string)
  g.chainFlash = 0.8; g.sim.chain = 4; run(5);    // CHAIN X4
  g.sim.timer = 5; run(30);                       // low-time HUD colours
  g._enterFinish(); run(60 * 5); mark();   // ceremony
  run(60 * 15); mark();                    // every reveal, then ENTRY
  for (let i = 0; i < 4; i++) { g._confirm(); run(20); }
  g.startRun(); run(30); g._enterGameOver(); run(60 * 2); mark();
  run(60 * 6); mark();

  ok('no string drawn in any mode hits the unknown-glyph fallback',
    MISSING.size === 0,
    `modes exercised: ${[...modesSeen].sort().join(', ')}; unknown chars: ${[...MISSING].map((c) => JSON.stringify(c)).join(', ') || 'none'}`);
  ok('the runtime check would actually notice a missing glyph',
    (() => { MISSING.clear(); drawText(stubCtx, '\u00a7', 0, 0, 1, '#fff'); return MISSING.has('\u00a7'); })(),
    'control: drawing a character with no glyph records it');
  MISSING.clear();
}

// ------------------------------------------------- 15. the engine voice stops (P2)
// The engine bed is a persistent WebAudio voice: its oscillators start once and never stop.
// Nothing switched it off, so it kept sounding under the finish ceremony (where the sim is
// frozen at its last racing speed), under GAME OVER and under the initials screen. This
// asserts the graph state, not a listening impression: engLevel is the gain node the bed
// now passes through, and it must be driven to 0 whenever no car is being driven.
{
  const { Sound } = await import('../src/audio.js');

  // A minimal AudioContext double. It records the last target of every setTargetAtTime so
  // the assertion can read the value the real graph would ramp to.
  const param = (v) => ({
    value: v, target: v,
    setValueAtTime(x) { this.value = x; this.target = x; },
    setTargetAtTime(x) { this.target = x; },
    cancelScheduledValues() {},
    linearRampToValueAtTime(x) { this.target = x; },
    exponentialRampToValueAtTime(x) { this.target = x; },
  });
  const node = (extra = {}) => Object.assign({
    connect() {}, disconnect() {}, start() {}, stop() {},
  }, extra);
  let suspendCalls = 0;
  let resumeCalls = 0;
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: node(),
    suspend: async function () { suspendCalls++; this.state = 'suspended'; },
    resume: async function () { resumeCalls++; this.state = 'running'; },
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(1000), Q: param(1), type: 'lowpass' }),
    createOscillator: () => node({ frequency: param(440), detune: param(0), type: 'sine', stopCalls: [], stop(t) { this.stopCalls.push(t); } }),
    createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param(1), stopCalls: [], stop(t) { this.stopCalls.push(t); } }),
    createWaveShaper: () => node({ curve: null, oversample: '' }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len }),
  };
  globalThis.window = { AudioContext: function () { return ctx; } };
  const snd = new Sound();
  await snd.unlock();
  ok('the audio graph built against the stub context', snd.ready && !!snd.engLevel);

  snd.setEngineRunning(true);
  snd.setEngine({ speed01: 0.9, boosting: false });
  snd.setDraft(0.8);
  const racing = { eng: snd.engLevel.gain.target, wind: snd.windGain.gain.target, boom: snd.boomGain.gain.target };
  ok('while racing the engine voice is at unity and the beds are audible',
    racing.eng === 1 && racing.wind > 0 && racing.boom > 0,
    `engLevel=${racing.eng}, wind=${racing.wind.toFixed(4)}, boom=${racing.boom.toFixed(4)}`);

  // The ceremony case: the sim is frozen, so setEngine keeps being called with the last
  // racing speed. That is exactly the shape of the shipped defect.
  snd.setEngineRunning(false);
  snd.setEngine({ speed01: 0.9, boosting: true });
  snd.setDraft(0.8);
  ok('with no car running the engine and both wind beds ramp to silence',
    snd.engLevel.gain.target === 0 && snd.windGain.gain.target === 0 && snd.boomGain.gain.target === 0,
    `engLevel=${snd.engLevel.gain.target}, wind=${snd.windGain.gain.target}, boom=${snd.boomGain.gain.target}`);

  snd.setEngineRunning(true);
  snd.setEngine({ speed01: 0.9, boosting: false });
  snd.setDraft(0.8);
  ok('and it comes back exactly as it was on the next run',
    snd.engLevel.gain.target === racing.eng
    && Math.abs(snd.windGain.gain.target - racing.wind) < 1e-12
    && Math.abs(snd.boomGain.gain.target - racing.boom) < 1e-12,
    'restart re-arms the voice at the shipped level, unchanged');

  snd.jingle('gameover');
  const scheduled = [...snd._activeSources];
  snd._windTimer = setTimeout(() => {}, 10000);
  snd.stopAll();
  ok('stopAll cancels music, delayed work, scheduled one-shots and persistent beds',
    snd._musicName === null && snd._timer === null && snd._windTimer === null
      && snd._activeSources.size === 0 && scheduled.length > 0
      && scheduled.every((s) => s.stopCalls.length >= 2)
      && snd.engLevel.gain.value === 0 && snd.windGain.gain.value === 0 && snd.boomGain.gain.value === 0
      && snd.duckEngine.gain.value === 1 && snd.duckWind.gain.value === 1,
    `scheduled=${scheduled.length} active=${snd._activeSources.size} music=${snd._musicName}`);
  snd.setEngineRunning(true);
  snd.setEngine({ speed01: 0.9, boosting: false });
  ok('stopAll preserves the graph so a new run can re-arm audio',
    snd.engLevel.gain.target === 1 && snd.ready && snd.muted === false);

  await snd.setPageVisible(false);
  ok('hiding the page suspends the entire audio context',
    ctx.state === 'suspended' && suspendCalls === 1,
    `state=${ctx.state}, suspendCalls=${suspendCalls}`);
  await snd.unlock();
  ok('an input unlock cannot restart audio while the page remains hidden',
    ctx.state === 'suspended' && resumeCalls === 0,
    `state=${ctx.state}, resumeCalls=${resumeCalls}`);
  await snd.setPageVisible(true);
  ok('showing the page resumes the already-unlocked audio context',
    ctx.state === 'running' && resumeCalls === 1,
    `state=${ctx.state}, resumeCalls=${resumeCalls}`);

  // And the state machine that drives it: every mode where no car is moving must ask for
  // silence. Read off the real Game rather than restated, so a new mode cannot slip past.
  const noop = () => {};
  const stubCtx2 = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; },
  });
  const { Game } = await import('../src/game.js');
  const g = new Game(stubCtx2);
  const calls = [];
  g.sound = { setEngineRunning: (b) => calls.push([g.mode, b]), setEngine: noop, setDraft: noop,
    sfx: noop, jingle: noop, music: noop, stopAll: noop, unlock: noop, setMuted: noop };
  const seen = new Map();
  const run = (n) => { for (let i = 0; i < n; i++) { calls.length = 0; g.update(DT); for (const [m, b] of calls) seen.set(m, (seen.get(m) ?? true) && b === false ? false : b); } };
  const want = new Map();
  run(30); want.set('attract', false);
  g.startRun(); run(30); want.set('ready', true);
  run(60); want.set('race', true);
  g._enterFinish(); run(60 * 15); want.set('finish', false);
  run(60 * 8); want.set('entry', false);
  g.startRun(); run(150); g._enterGameOver(); run(60 * 3); want.set('gameover', false);
  const wrong = [...want].filter(([m, b]) => seen.get(m) !== b);
  ok('the engine is requested ON only for READY/RACE, never the visual ATTRACT demo',
    wrong.length === 0 && want.size === 6 && [...want.keys()].every((m) => seen.has(m)),
    [...want.keys()].map((m) => `${m}=${seen.get(m)}`).join(' '));

  const title = new Game(stubCtx2);
  const audioCalls = [];
  title.sound = {
    setEngineRunning: noop, setEngine: noop, setDraft: noop,
    sfx: (name) => audioCalls.push(['sfx', name]),
    jingle: (name) => audioCalls.push(['jingle', name]),
    music: (name) => audioCalls.push(['music', name]),
    stopAll: () => audioCalls.push(['stopAll']), unlock: noop, setMuted: noop,
  };
  title.hi = Array.from({ length: 5 }, (_, i) => ({ name: 'ACE', score: 999999 - i }));
  title._enterGameOver();
  title.modeT = 2;
  title.onKeyDown('KeyZ');
  const afterFirstPress = title.mode;
  title.onKeyDown('KeyZ'); // held-key repeat: pressed=false, must not start a run
  for (let i = 0; i < 60 * 7; i++) title.update(DT);
  ok('game-over returns to a silent title and stays silent while waiting',
    afterFirstPress === 'attract' && title.mode === 'attract'
      && audioCalls.filter(([kind]) => kind === 'stopAll').length >= 1
      && !audioCalls.some(([kind, name]) => kind === 'music' && name === 'attract'),
    audioCalls.map((c) => c.join(':')).join(' '));
  title.onKeyUp('KeyZ');
  title.onKeyDown('KeyZ');
  title._enterRace();
  title._reactTo({ spin: true });
  ok('a fresh press starts a new run with gameplay SFX but no gameplay BGM',
    title.mode === 'race'
      && !audioCalls.some(([kind, name]) => kind === 'music' && (name === 'race' || name === 'finalLeg'))
      && audioCalls.some(([kind, name]) => kind === 'sfx' && name === 'spin'),
    audioCalls.map((c) => c.join(':')).join(' '));
  delete globalThis.window;
}

// ACTION is a shared button family in gameplay; Enter remains start/confirm only.
{
  console.log('\n  -- 15b. ACTION input aliases');
  const { ACTION_CODES, Game } = await import('../src/game.js');
  const noop = () => {};
  const actionCtx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get: (target, key) => (key in target ? target[key] : noop),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  for (const code of ACTION_CODES) {
    const game = new Game(actionCtx);
    game.sound = { setEngineRunning: noop, setEngine: noop, setDraft: noop, sfx: noop,
      jingle: noop, music: noop, stopAll: noop, unlock: noop, setMuted: noop };
    game.startRun(); game._enterRace();
    game.onKeyDown(code);
    const first = game._playerInput().boost;
    game.onKeyDown(code);
    const repeated = game._playerInput().boost;
    ok(`${code} produces one Z-equivalent boost edge`, first === true && repeated === false,
      `first=${first} repeated=${repeated}`);
  }
  const enter = new Game(actionCtx);
  enter.sound = { setEngineRunning: noop, setEngine: noop, setDraft: noop, sfx: noop,
    jingle: noop, music: noop, stopAll: noop, unlock: noop, setMuted: noop };
  enter.startRun(); enter._enterRace(); enter.onKeyDown('Enter');
  ok('Enter never releases the slingshot during RACE', enter._playerInput().boost === false,
    `boostEdge=${enter.boostEdge}`);
}

// ------------------------------------------------- 16. the crash spin is a ground spin (P1)
// The acceptance check for P1, clause by clause. Everything here is PRESENTATION: not one
// assertion in this section may be satisfiable by changing sim.js, and the two that guard
// that fact are stated first.
{
  console.log('\n  -- 16. the crash spin reads as a ground-plane spin (P1)');
  const { Game } = await import('../src/game.js');

  // The simulation's ownership of the spin, restated so a presentation pass cannot quietly
  // buy its picture with a timing change. These are the values sections 1-13 are calibrated
  // against; P1 was required to leave them alone.
  ok('P1 did not move the simulation\'s spin',
    S.HIT.spinTime === 0.9 && S.HIT.spinSpeedMul === 0.50 && S.HIT.spinDv === 0.20,
    `spinTime=${S.HIT.spinTime}s spinSpeedMul=${S.HIT.spinSpeedMul} spinDv=${S.HIT.spinDv}`);

  // A context that RECORDS. Every transform entry point is counted, not just rotate(): a
  // rotation reintroduced through setTransform or transform would read exactly the same on
  // screen and must fail the same assertion.
  const noop = () => {};
  function recorder() {
    const rec = { rects: [], arcs: [], rotate: 0, transform: 0, style: '#000' };
    const base = {
      fillRect: (x, y, w, h) => rec.rects.push({ x, y, w, h, c: rec.style }),
      arc: (x, y, r) => rec.arcs.push({ x, y, r, c: rec.style }),
      rotate: () => { rec.rotate++; },
      transform: () => { rec.transform++; },
      setTransform: () => { rec.transform++; },
      globalAlpha: 1, font: '', textAlign: '', lineWidth: 1,
    };
    const ctx = new Proxy(base, {
      get: (t, k) => {
        if (k === 'fillStyle' || k === 'strokeStyle') return rec.style;
        return k in t ? t[k] : noop;
      },
      set: (t, k, v) => {
        if (k === 'fillStyle' || k === 'strokeStyle') rec.style = v; else t[k] = v;
        return true;
      },
    });
    return { ctx, rec };
  }
  const silent = { setEngineRunning: noop, setEngine: noop, setDraft: noop, sfx: noop,
    jingle: noop, music: noop, stopAll: noop, unlock: noop, setMuted: noop };

  // The player's own three body colours. Nothing else on screen uses them, so the union of
  // the rects drawn in them IS the drawn silhouette.
  const BODY = new Set([S.PAL.playerBody, S.PAL.playerShade, S.PAL.playerRoof]);
  const box = (rec) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of rec.rects) {
      if (!BODY.has(r.c)) continue;
      x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w);
      y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h);
    }
    return x1 > x0 ? { w: x1 - x0, h: y1 - y0 } : null;
  };

  // Sample one whole spin. The sim is stepped by the REAL Game.update, so the yaw the
  // picture uses and the spin the simulation is running are the same clock by construction.
  const g = new Game(recorder().ctx);
  g.sound = silent;
  g.startRun();
  for (let i = 0; i < 200; i++) g.update(DT);         // out of READY, into RACE
  g.sim.spin = S.HIT.spinTime;
  const N = 24, frames = [];
  let rotates = 0, transforms = 0;
  for (let i = 0; i < N; i++) {
    const { ctx, rec } = recorder();
    g.ctx = ctx; g.renderer.ctx = ctx;
    g.render();
    rotates += rec.rotate; transforms += rec.transform;
    const b = box(rec);
    frames.push({ psi: g.spinYaw(), spin: g.sim.spin, w: b && b.w, h: b && b.h,
      scrub: g.scrub.length });
    g.update(S.HIT.spinTime / N);
  }
  const drawn = frames.filter((f) => f.w != null);

  ok('no rotation transform is applied on any frame of a spin',
    rotates === 0 && transforms === 0,
    `over ${N} frames of a spin: rotate() ${rotates}x, transform()/setTransform() ${transforms}x`);

  // REPLACED BY P8, and deliberately, on the record. Until the twelfth pass this clause read
  //   'the car foreshortens with yaw: widest broadside, narrowest end-on' (ratio 1.7-2.4x),
  // and was followed by 'the width follows |cos psi|*CAR_WIDTH + |sin psi|*CAR_LEN'. Both
  // asserted P1's premise: that the drawn WIDTH swings with yaw. That premise was reported
  // from play three times as a squash-and-stretch (P1, P7, P8) and has been rejected — a
  // camera-facing sprite whose width swings IS a horizontal scale, pixel for pixel, however
  // correct the width law behind it. The replacement is the opposite assertion, held to the
  // same rigour: the silhouette is INVARIANT in both axes, and the yaw is carried by the
  // features moving inside it (asserted against the offset model further down).
  const ws = drawn.map((f) => f.w), hs = drawn.map((f) => f.h);
  ok('the drawn WIDTH is constant across the whole spin — nothing scales, so nothing stretches',
    Math.max(...ws) - Math.min(...ws) <= 1,
    `width ${Math.min(...ws)}..${Math.max(...ws)} px over ${drawn.length} frames `
    + `(the rejected P1 model swung it by CAR_LEN/CAR_WIDTH = ${(S.CAR_LEN / S.CAR_WIDTH).toFixed(2)}x)`);
  ok('...and the drawn HEIGHT is constant across the whole spin — a yaw is not a scale',
    Math.max(...hs) - Math.min(...hs) <= 1,
    `height ${Math.min(...hs)}..${Math.max(...hs)} px over ${drawn.length} frames`);

  // Clause 3: which END faces the camera. The lamp colours are the identity.
  {
    const TAIL = '#e84030', HEAD = '#fff0c0';
    let away = 0, toward = 0, side = 0, wrong = 0;
    for (let i = 0; i < N; i++) {
      const { ctx, rec } = recorder();
      g.ctx = ctx; g.renderer.ctx = ctx;
      g.sim.spin = S.HIT.spinTime * (1 - i / N);
      g.render();
      const c = Math.cos(g.spinYaw());
      const t = rec.rects.some((r) => r.c === TAIL), h = rec.rects.some((r) => r.c === HEAD);
      if (c > 0.5) { away++; if (!t || h) wrong++; }
      else if (c < -0.5) { toward++; if (!h || t) wrong++; }
      else if (Math.abs(c) < 0.3) { side++; if (t || h) wrong++; }
    }
    ok('the facing changes identity as the car comes round',
      wrong === 0 && away > 0 && toward > 0 && side > 0,
      `tail lamps only while pointing away (${away} frames), headlamps only while facing the camera (${toward}), `
      + `neither broadside (${side}); ${wrong} frames disagreed`);
  }

  // Clause 4: the ground is the frame of reference. A mark is laid at a WORLD position and
  // must stay there while the car drives past it — which is precisely what a rotating
  // billboard can never produce.
  {
    g.sim.spin = S.HIT.spinTime;
    g.scrub = [];
    for (let i = 0; i < 8; i++) { g.render(); g.update(DT); }
    const marks = g.scrub.filter((m) => !m.puff);
    const puffs = g.scrub.filter((m) => m.puff);
    const m = marks[marks.length - 1];
    const z0 = m.z, x0 = m.x;
    const rows = [];
    for (let i = 0; i < 3; i++) {
      g.render();
      const p = g.renderer.project(m.z, m.x, 0);
      if (p.visible) rows.push(p.sy);
      g.update(DT / 2);
    }
    ok('the scrub and smoke are anchored to the GROUND, not carried by the car',
      m.z === z0 && m.x === x0 && rows.length >= 2 && rows[rows.length - 1] > rows[0],
      `${marks.length} marks and ${puffs.length} puffs live; the tracked mark held its world position `
      + `(z ${z0.toFixed(2)} m) while its screen row ran ${rows.map((r) => r.toFixed(0)).join(' -> ')} down the frame`);
  }

  // ---- P8: the SILHOUETTE IS INVARIANT and the FEATURES carry the yaw ------------------
  // P7's four clauses lived here and were built to foreshorten AGAINST P1's width swing, so
  // that something in the frame got shorter as the car got wider. With the swing gone, each
  // was re-decided on its own merits. KEPT: (i) the shadow-as-footprint, because it lies on
  // the tarmac and is the one thing in the picture that genuinely must foreshorten — and
  // with the body fixed it can no longer be misread as the car changing size; and the four
  // contact patches, re-based on the feature-offset model. REPLACED: (ii) 'the footprint and
  // the width EXCHANGE end-on vs broadside', which asserted the rejected width swing as half
  // of its own statement — the ground still swings, but now against a body that does NOT.
  // (iii) 'the PATTERN rotates rather than scaling' used the product of the two wheel
  // spreads as its discriminator, which was only meaningful while the sprite scaled; it is
  // replaced by the cluster-count clause below, which is stronger and is rotation-only.
  // (iv) 'the cabin narrows as a fraction of the body' asserted a width law for a feature,
  // built purely as a counterweight; it is replaced by the assertion that the cabin does not
  // change size AT ALL, and by the offset-model and direction clauses that say where it goes
  // instead. Nothing was loosened: every replacement is an equality or a formula fit.
  {
    const SHADOW = '#000008', WHEEL_FAR = '#7a8296', WHEEL_NEAR = '#eef0f6';
    const ROOF = S.PAL.playerRoof, TAIL = '#e84030', HEAD = '#fff0c0';
    const shots = [];
    for (let i = 0; i < N; i++) {
      const { ctx, rec } = recorder();
      g.ctx = ctx; g.renderer.ctx = ctx;
      g.sim.spin = S.HIT.spinTime * (1 - i / N);
      g.render();
      const sh = rec.rects.filter((r) => r.c === SHADOW);
      const wh = rec.rects.filter((r) => r.c === WHEEL_FAR || r.c === WHEEL_NEAR);
      const rf = rec.rects.filter((r) => r.c === ROOF);
      const lp = rec.rects.filter((r) => r.c === TAIL || r.c === HEAD);
      const bd = rec.rects.filter((r) => r.c === S.PAL.playerBody);
      const b = box(rec);
      if (!sh.length || !b) continue;
      const xs = wh.map((r) => r.x + r.w / 2), ys = wh.map((r) => r.y + r.h / 2);
      // The sprite's own centre, read off the FULL-WIDTH body rect, so every feature offset
      // below is measured against the drawn silhouette rather than against a recomputed one.
      const body = bd.reduce((a, r) => (r.w > a.w ? r : a), bd[0]);
      shots.push({
        psi: g.spinYaw(), bodyW: b.w, cx: body.x + body.w / 2, w: body.w,
        foot: Math.max(...sh.map((r) => r.h)),
        wheels: wh.length, wxs: xs.slice().sort((p, q) => p - q),
        roofW: rf.length ? rf[0].w : null, roofX: rf.length ? rf[0].x + rf[0].w / 2 : null,
        lampN: lp.length, lampX: lp.length ? lp.reduce((a, r) => a + r.x + r.w / 2, 0) / lp.length : null,
        lampW: lp.length ? lp[0].w : null,
        wx: wh.length ? Math.max(...xs) - Math.min(...xs) : 0,
        wy: wh.length ? Math.max(...ys) - Math.min(...ys) : 0,
      });
    }

    // (i) KEPT FROM P7, UNCHANGED. The footprint's DEPTH is the yawed extent along the view
    // axis, |cos|*CAR_LEN + |sin|*CAR_WIDTH. Asserted against the FORMULA, so a shadow that
    // merely wobbled would fail.
    {
      const model = (psi) => Math.abs(Math.cos(psi)) * S.CAR_LEN + Math.abs(Math.sin(psi)) * S.CAR_WIDTH;
      const k = shots.reduce((a, f) => a + f.foot / model(f.psi), 0) / shots.length;
      let worst = 0;
      for (const f of shots) worst = Math.max(worst, Math.abs(f.foot - k * model(f.psi)) / f.foot);
      ok('the shadow is a FOOTPRINT: its depth follows |cos|*CAR_LEN + |sin|*CAR_WIDTH',
        worst < 0.12 && shots.length >= 12,
        `worst deviation ${(worst * 100).toFixed(1)}% over ${shots.length} frames, `
        + `depth ${Math.min(...shots.map((f) => f.foot))} -> ${Math.max(...shots.map((f) => f.foot))} px`);
    }

    // (ii) REPLACES 'the footprint and the width EXCHANGE end-on vs broadside'. The ground
    // still foreshortens by the car's own proportions — but it now does so under a body of
    // FIXED width, which is the whole of P8. A horizontal squash-and-stretch of the sprite
    // cannot produce this because the sprite is not being scaled at all.
    {
      const end = shots.reduce((a, f) => (Math.abs(Math.cos(f.psi)) > Math.abs(Math.cos(a.psi)) ? f : a));
      const side = shots.reduce((a, f) => (Math.abs(Math.cos(f.psi)) < Math.abs(Math.cos(a.psi)) ? f : a));
      const rf = end.foot / side.foot;
      ok('the GROUND foreshortens by CAR_LEN/CAR_WIDTH while the body does not move at all',
        rf > 1.7 && rf < 2.4 && end.bodyW === side.bodyW,
        `end-on ${end.bodyW}x${end.foot} px, broadside ${side.bodyW}x${side.foot} px: `
        + `footprint depth x${rf.toFixed(2)}, body width x1.00 `
        + `(CAR_LEN/CAR_WIDTH = ${(S.CAR_LEN / S.CAR_WIDTH).toFixed(2)})`);
    }

    // (iii) REPLACES 'the PATTERN rotates rather than scaling'. Four contact patches, and
    // their arrangement is a rigid-body fact. Tail-on the four wheels sit in TWO columns
    // (the two on each flank share a lateral position); broadside they again sit in two
    // columns, but the pairing has changed — it is now the two of each AXLE that coincide;
    // and in between all FOUR are at distinct lateral positions. 2 -> 4 -> 2 columns is
    // something no scale of any kind can do: a scale multiplies the spreads and can never
    // change how many distinct columns there are.
    {
      const cols = (f) => {
        let n = 1;
        for (let i = 1; i < f.wxs.length; i++) if (f.wxs[i] - f.wxs[i - 1] > 1.5) n++;
        return n;
      };
      const four = shots.every((f) => f.wheels === 4);
      const end = shots.reduce((a, f) => (Math.abs(Math.cos(f.psi)) > Math.abs(Math.cos(a.psi)) ? f : a));
      const side = shots.reduce((a, f) => (Math.abs(Math.cos(f.psi)) < Math.abs(Math.cos(a.psi)) ? f : a));
      const obl = shots.reduce((a, f) => {
        const d = (x) => Math.abs(Math.abs(Math.cos(x)) - Math.SQRT1_2);
        return d(f.psi) < d(a.psi) ? f : a;
      });
      ok('four contact patches whose PATTERN re-pairs: 2 columns end-on, 4 oblique, 2 broadside',
        four && cols(end) === 2 && cols(side) === 2 && cols(obl) === 4,
        `columns ${cols(end)} end-on / ${cols(obl)} at 45 deg / ${cols(side)} broadside; `
        + `spreads across x${(side.wx / end.wx).toFixed(2)}, in depth x${(side.wy / end.wy).toFixed(2)}`);
    }

    // (iv) REPLACES 'the cabin narrows as a fraction of the body'. Nothing scales: the cabin
    // and the lamps are drawn at ONE size for the whole spin, and so is the body. This is
    // the assertion the three reports from play were asking for, stated as an equality.
    {
      const rw = shots.filter((f) => f.roofW != null).map((f) => f.roofW);
      const lw = shots.filter((f) => f.lampW != null).map((f) => f.lampW);
      ok('every feature is drawn at a CONSTANT size — the cabin and lamps move, they do not scale',
        rw.length >= 12 && Math.max(...rw) === Math.min(...rw)
        && lw.length >= 6 && Math.max(...lw) === Math.min(...lw),
        `cabin ${Math.min(...rw)}..${Math.max(...rw)} px over ${rw.length} frames, `
        + `lamp ${Math.min(...lw)}..${Math.max(...lw)} px over ${lw.length} frames`);
    }

    // (v) THE OFFSET MODEL ITSELF, which is what P8 put in place of the width law, and it is
    // asserted with the rigour the width law used to get: a feature at car-frame (u, v) is
    // centred at n(u,v) * (W - fw)/2 from the sprite's centre, with
    //     n(u,v) = (u cos psi + v sin psi) / (hw|cos psi| + hl|sin psi|).
    // Checked on the cabin (u = 0, v = the rear-set cabin's own centre) and on the lamp pair
    // (u = 0 by symmetry, v = +-hl for whichever end faces the camera) over the whole spin.
    // A feature that merely slid about on some other schedule fails this, exactly as a width
    // that merely swung failed the clause this one replaces.
    {
      const hw = S.CAR_WIDTH / 2, hl = S.CAR_LEN / 2;
      const n = (u, v, psi) => (u * Math.cos(psi) + v * Math.sin(psi))
        / (hw * Math.abs(Math.cos(psi)) + hl * Math.abs(Math.sin(psi)));
      const cabV = -0.5 * S.CAR_LEN * (1 - S.SPIN_VIS.roofLenFrac);
      let worstCab = 0, worstLamp = 0, nCab = 0, nLamp = 0;
      for (const f of shots) {
        if (f.roofW != null) {
          const want = f.cx + n(0, cabV, f.psi) * (f.w - f.roofW) / 2;
          worstCab = Math.max(worstCab, Math.abs(f.roofX - want)); nCab++;
        }
        if (f.lampX != null) {
          const v = Math.cos(f.psi) > 0 ? -hl : hl;
          const want = f.cx + n(0, v, f.psi) * (f.w - f.lampW) / 2;
          worstLamp = Math.max(worstLamp, Math.abs(f.lampX - want)); nLamp++;
        }
      }
      ok('the feature offsets follow (u cos psi + v sin psi) / (hw|cos psi| + hl|sin psi|)',
        nCab >= 12 && nLamp >= 6 && worstCab <= 1 && worstLamp <= 1,
        `worst departure from the model: cabin ${worstCab.toFixed(2)} px over ${nCab} frames, `
        + `lamps ${worstLamp.toFixed(2)} px over ${nLamp} frames (rounding is 0.5 px)`);
    }

    // (vi) DIRECTION, which the model alone does not pin down: the features must sweep ONE
    // way, wrap, and come back, rather than shuttling. n(0, v) has the sign of v*sin psi, so
    // over one turn the cabin sits on one side of the silhouette for the whole first half
    // turn and on the other for the whole second, crossing the centre exactly twice. A cue
    // that reversed mid-half-turn — or that read the yaw through |sin| and so never chose a
    // side at all, which is what every rejected width law did — fails here.
    {
      const cab = shots.filter((f) => f.roofX != null)
        .map((f) => ({ psi: ((f.psi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), d: f.roofX - f.cx }));
      // Read only where the model COMMITS to a side (|sin psi| > 0.2); within a pixel of the
      // centre the rounding of a half-pixel sprite centre can land either way, and asserting
      // on that would be asserting on the seed rather than on the cue.
      let wrong = 0, crossings = 0, prev = null, reach = 0, n = 0;
      for (const c of cab) {
        reach = Math.max(reach, Math.abs(c.d));
        if (Math.abs(Math.sin(c.psi)) <= 0.2) continue;
        n++;
        const want = -Math.sign(Math.sin(c.psi));           // cabin is set BACK: v < 0
        if (Math.sign(c.d) !== want) wrong++;
        if (prev !== null && Math.sign(c.d) !== Math.sign(prev)) crossings++;
        prev = c.d;
      }
      ok('the sweep has ONE sense through the turn: out to one flank, wrap, back the other way',
        wrong === 0 && crossings === 1 && reach >= 3 && n >= 12,
        `cabin offset reaches ${reach.toFixed(0)} px either side of centre, changes side `
        + `${crossings}x in the ${n} committed frames of one turn, and never sits on the `
        + `wrong flank of the yaw (${wrong} frames disagreed)`);
    }
  }

  // A whole number of turns, so the car finishes the spin pointing back down the road —
  // which is the state the simulation resumes it in.
  ok('the spin completes a whole number of turns and lands facing forward',
    Number.isInteger(S.SPIN_VIS.turns) && S.SPIN_VIS.turns >= 1
    && near(Math.cos(g.spinYaw.call({ sim: { spin: 1e-9 } }) || 0), 1, 1e-6),
    `SPIN_VIS.turns = ${S.SPIN_VIS.turns} (${(S.SPIN_VIS.turns * 360 / S.HIT.spinTime).toFixed(0)} deg/s over the ${S.HIT.spinTime}s spin)`);
}

// ------------------------------------------------- 17. the background counter-scrolls (P5)
{
  console.log('\n  -- 17. the background counter-scrolls on curves (P5)');

  // The rate is pure projection geometry: heading rate is v/R with R = SEG_LEN^2/(curve*
  // CURVE_ACCUM), and a layer at infinity moves (VIEW_W/2)*CAMERA_DEPTH px per radian.
  // Asserted against the formula rather than against the literal, so the number cannot be
  // nudged without the derivation moving with it.
  ok('the counter-scroll rate is the derived one, not a tuned one',
    near(S.PX_PER_CURVE_METRE,
      (S.VIEW_W / 2) * S.CAMERA_DEPTH * S.CURVE_ACCUM / (S.SEG_LEN * S.SEG_LEN), 1e-12),
    `PX_PER_CURVE_METRE = ${S.PX_PER_CURVE_METRE.toFixed(4)} px per unit curvature per metre driven`);

  // yawFrac = 0.5 is the one stylistic choice, and it has an on-screen referent: at 0.5 the
  // background travels EXACTLY as far as the road's own projected centreline does, because
  // a corner's lateral offset is quadratic in distance while its heading is linear. Checked
  // against the renderer's own projection at three ring depths, not against an identity
  // rearranged on paper.
  {
    const c = 0.8, L = 200;
    const bg = S.BG_SCROLL.yawFrac * S.PX_PER_CURVE_METRE * c * L;
    let worst = 0, detail = '';
    for (const D of [80, 160, 320]) {
      // The road's own drift at ring depth D: cx = c*CURVE_ACCUM*D^2/(2*SEG_LEN^2) metres,
      // projected at CAMERA_DEPTH*(VIEW_W/2)/D pixels per metre.
      const cx = c * S.CURVE_ACCUM * D * D / (2 * S.SEG_LEN * S.SEG_LEN);
      const road = cx * (S.CAMERA_DEPTH * (S.VIEW_W / 2) / D);
      const perM = road / D;
      worst = Math.max(worst, Math.abs(perM * L - bg));
      detail = `road ${(perM * L).toFixed(1)} px vs background ${bg.toFixed(1)} px over ${L} m at curve ${c}`;
    }
    ok('at yawFrac 0.5 the background travels exactly as far as the road\'s own centreline',
      worst < 1e-9, detail + ` (agree at ring depths 80/160/320 m to ${worst.toExponential(1)} px)`);
  }

  // Direction, on the real Game against a real Course: the acceptance clause is that the
  // background goes the OTHER way from the road, so both are read on the same frames.
  {
    const noop = () => {};
    const stub = new Proxy({ globalAlpha: 1 }, {
      get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; },
    });
    const { Game } = await import('../src/game.js');
    const g = new Game(stub);
    g.sound = { setEngineRunning: noop, setEngine: noop, setDraft: noop, sfx: noop,
      jingle: noop, music: noop, stopAll: noop, unlock: noop, setMuted: noop };

    // Reach the curves DIRECTLY. The longest sustained run of each sign in the first half
    // of the course — the back half contains the run-off, where injecting the car finishes
    // the race and swaps in B6's coastline instead of the road.
    const longest = (pred) => {
      const segs = g.course.segments, zMax = g.course.raceLength * 0.55;
      let bz = null, bn = 0, run = 0;
      for (let i = 0; i < segs.length && segs[i].z < zMax; i++) {
        if (pred(segs[i].curve)) { run++; if (run > bn) { bn = run; bz = segs[i - run + 1].z; } }
        else run = 0;
      }
      return bz;
    };
    // startRun() builds a fresh course on a fresh random seed, so the stretch has to be
    // located on the course the run will actually use. Pinned to seed 101 — the seed B14
    // already quotes — so this reads the same road every time it is run.
    const drive = (pred, n) => {
      g.startRun();
      g._newSim(101);
      for (let i = 0; i < 200; i++) g.update(DT);   // out of READY, into RACE
      const z = longest(pred);
      if (z == null) return { off: NaN, road: NaN };
      g.sim.z = z; g.sim.x = 0; g.bgOffset = 0; g.scrub = [];
      const road = [];
      for (let i = 0; i < n; i++) {
        g.sim.speed = S.VMAX;
        g.update(DT);
        g.render();
        road.push(g.renderer._sx[20]);
      }
      return { off: g.bgOffset, road: road[road.length - 1] - road[0] };
    };
    const R = drive((c) => c > 0.30, 40);
    const L = drive((c) => c < -0.30, 40);
    const St = drive((c) => Math.abs(c) < 0.05, 40);

    ok('a RIGHT curve sends the background LEFT while the road goes right',
      R.off < -5 && R.road > 0,
      `background ${R.off.toFixed(1)} px, road centreline at 160 m ${R.road > 0 ? '+' : ''}${R.road.toFixed(1)} px`);
    ok('a LEFT curve sends it RIGHT, and the straight is the control',
      L.off > 5 && L.road < 0 && Math.abs(St.off) < 0.5,
      `left: background +${L.off.toFixed(1)} px, road ${L.road.toFixed(1)} px; straight: background ${St.off.toFixed(2)} px`);
  }

  // It SCROLLS rather than snapping to a value, and it comes back. The old code failed both:
  // it was a static offset proportional to the instantaneous curvature.
  {
    let off = 0; const trace = [];
    for (let i = 0; i < 90; i++) { off = S.bgScrollStep(off, 0.8, S.VMAX, DT); if (i % 22 === 0) trace.push(off); }
    const growing = trace.every((v, i) => i === 0 || v < trace[i - 1] - 0.5);
    ok('it SCROLLS: the displacement keeps growing while the corner is held',
      growing, `px at 0.0/0.37/0.73/1.10 s into the corner: ${trace.map((v) => v.toFixed(1)).join(', ')}`);

    let back = -60;
    for (let i = 0; i < Math.round(2.7 * 60); i++) back = S.bgScrollStep(back, 0, S.VMAX, DT);
    ok('it returns to neutral over the median straight between corners (240 m, 2.7 s)',
      Math.abs(back) < 0.6, `-60.0 px -> ${back.toFixed(3)} px at tau = ${S.BG_SCROLL.tau}s`);
  }

  // Saturation. The sun is the one element of this sky that does not repeat, and maxPx is
  // derived from its clearance to the frame edge; the ordinary curvature ceiling must sit
  // INSIDE that bound, or the cue would be clipped over most of the game.
  {
    let hi = 0;
    for (const c of [2.60, -2.60]) {
      let off = 0;
      for (let i = 0; i < 600; i++) off = S.bgScrollStep(off, c, S.VMAX * 1.35, DT);
      hi = Math.max(hi, Math.abs(off));
    }
    let ord = 0;
    for (let i = 0; i < 600; i++) ord = S.bgScrollStep(ord, S.maxCurvature(999), S.VMAX, DT);
    const sunEdge = S.VIEW_W - (0.68 * S.VIEW_W + 9);
    ok('it saturates at the sun\'s own clearance, and the ordinary ceiling never reaches it',
      near(hi, S.BG_SCROLL.maxPx, 1e-9) && Math.abs(ord) < S.BG_SCROLL.maxPx
      && near(S.BG_SCROLL.maxPx, Math.floor(sunEdge), 1),
      `worst case (brake corner 2.60, boosted) clamps at ${hi.toFixed(1)} px = the sun's ${sunEdge.toFixed(1)} px of `
      + `room; strongest ORDINARY corner (${S.maxCurvature(999).toFixed(2)}) asks only ${Math.abs(ord).toFixed(1)} px`);
  }

  // The renderer must actually apply it, to BOTH infinity layers, and with parallax between
  // the two hill ranks. Read off the draw calls, because "it is passed in" is not "it moved".
  {
    const sample = (bgOffset) => {
      const arcs = [], pts = [];
      let style = '#000';
      const noop = () => {};
      const ctx = new Proxy({ globalAlpha: 1 }, {
        get: (t, k) => {
          if (k === 'fillStyle' || k === 'strokeStyle') return style;
          if (k === 'arc') return (x, y, r) => arcs.push({ x, y, r, c: style });
          if (k === 'lineTo') return (x, y) => pts.push({ x, y, c: style });
          return k in t ? t[k] : noop;
        },
        set: (t, k, v) => { if (k === 'fillStyle' || k === 'strokeStyle') style = v; else t[k] = v; return true; },
      });
      const r = new Renderer(ctx);
      r._drawSky(bgOffset);
      const sun = arcs.find((a) => a.c === S.PAL.sun);
      // The hill silhouette is sampled every 4 px; the y at a fixed screen x tells us how
      // far the pattern itself has slid.
      const at = (colour, x) => { const p = pts.filter((q) => q.c === colour);
        let best = p[0]; for (const q of p) if (Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best.y; };
      return { sunX: sun.x, far: at(S.PAL.hill, 100), near: at(S.PAL.hillLit, 100) };
    };
    const a = sample(0), b = sample(-40), c2 = sample(+40);
    ok('the renderer moves the SUN with the offset',
      near(b.sunX, a.sunX - 40, 1e-9) && near(c2.sunX, a.sunX + 40, 1e-9),
      `sun x ${b.sunX.toFixed(1)} / ${a.sunX.toFixed(1)} / ${c2.sunX.toFixed(1)} at offset -40 / 0 / +40`);
    // Both hill ranks must move, and by DIFFERENT amounts, or the sky is a flat cut-out.
    // Compared as displacements of the same silhouette: sampling the pattern at one screen
    // x and offsetting the sample point by the layer's own shift must reproduce it.
    const shifted = (bgOffset) => {
      const s2 = sample(bgOffset);
      return { far: s2.far, near: s2.near };
    };
    const s40 = shifted(-40);
    ok('both hill ranks move, and the near rank moves less than the far one',
      s40.far !== a.far && s40.near !== a.near && S.BG_SCROLL.nearRankFrac < 1,
      `at offset -40 px the far rank samples ${a.far.toFixed(2)} -> ${s40.far.toFixed(2)} and the near rank `
      + `${a.near.toFixed(2)} -> ${s40.near.toFixed(2)}; near rank travels ${S.BG_SCROLL.nearRankFrac}x the far rank`);
  }

  // The tower is a finite-distance background object, not a prop accidentally tied to the
  // course. Probe its palette contract, approach and stronger near parallax through calls.
  {
    const sampleTower = (bgOffset, travelledM = 0) => {
      const rects = [], paints = [];
      let style = '#000';
      const noop = () => {};
      const ctx = new Proxy({}, {
        get: (t, k) => {
          if (k === 'fillStyle') return style;
          if (k === 'fillRect') return (x, y, w, h) => {
            rects.push({ x, y, w, h, c: style }); paints.push(style);
          };
          if (k === 'fill') return () => paints.push(style);
          return noop;
        },
        set: (t, k, v) => { if (k === 'fillStyle') style = v; else t[k] = v; return true; },
      });
      new Renderer(ctx)._drawSky(bgOffset, travelledM);
      return {
        rects: rects.filter((q) => q.c === S.PAL.distantTower || q.c === S.PAL.distantTowerLit),
        paints,
      };
    };
    const a = sampleTower(0, 0);
    const near0 = sampleTower(0, S.DISTANT_TOWER.approachM);
    const nearShift = sampleTower(20, S.DISTANT_TOWER.approachM);
    const mast = (sample) => sample.rects.filter((q) => q.c === S.PAL.distantTower)
      .sort((p, q) => (q.h * q.w) - (p.h * p.w))[0];
    const bodyA = mast(a), bodyNear = mast(near0), bodyShift = mast(nearShift);
    ok('the distant tower approaches smoothly and gains finite-distance curve parallax',
      S.DISTANT_TOWER.paletteRoles.body === 'distantTower'
      && S.DISTANT_TOWER.paletteRoles.litEdge === 'distantTowerLit'
      && !!bodyA && !!bodyNear && !!bodyShift
      && bodyNear.h > bodyA.h * 1.7
      && bodyNear.x < bodyA.x
      && bodyShift.x - bodyNear.x === Math.round(20 * S.DISTANT_TOWER.curveParallaxNear),
      `mast ${bodyA?.w}x${bodyA?.h} -> ${bodyNear?.w}x${bodyNear?.h}, x ${bodyA?.x} -> ${bodyNear?.x}; `
      + `near +20px curve offset moves ${bodyShift?.x - bodyNear?.x}px`);
    const farHillPaint = a.paints.indexOf(S.PAL.hill);
    const towerPaint = a.paints.indexOf(S.PAL.distantTower);
    const nearHillPaint = a.paints.indexOf(S.PAL.hillLit);
    ok('the finite-distance tower is painted between the far and near hill ranks',
      farHillPaint >= 0 && farHillPaint < towerPaint && towerPaint < nearHillPaint,
      `paint order indices far hill=${farHillPaint}, tower=${towerPaint}, near hill=${nearHillPaint}`);
  }
}

// ------------------------------------------------- 18. engine braking is not a brake (P4)
// Releasing UP now bleeds speed (COAST_DRAG) instead of holding it. The whole risk of that
// change is B13: the brake corners are the only thing in this game that requires the BRAKE
// button, and if letting go of the throttle sheds enough speed to take one, the button
// loses its reason to exist again. These assertions state the bound as a fact about the
// telegraph the corner is signed with, measured on a LIVE course, not against a literal.
{
  console.log('\n  -- 18. engine braking exists, and it is not a substitute brake (P4)');

  // (a) The input layer actually asks for it. The shipped defect was `0.85`, which takes
  // the th > 0 branch in sim.js: releasing UP ACCELERATED at 0.85 * ACCEL and, below the
  // cap, did nothing at all. Read off the real Game so a future edit cannot quietly undo it.
  {
    const noop = () => {};
    const stubCtx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
      get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; },
    });
    globalThis.window = { AudioContext: function () { throw new Error('no audio in this test'); } };
    const { Game } = await import('../src/game.js');
    const g = new Game(stubCtx);
    const th = (keys) => { g.keys = new Set(keys); return g._playerInput().throttle; };
    ok('releasing UP commands a FULLY closed throttle (0), not a partial one',
      th([]) === 0 && th(['ArrowUp']) === 1 && th(['ArrowDown']) === -1 && th(['KeyW']) === 1,
      `none=${th([])}, up=${th(['ArrowUp'])}, down=${th(['ArrowDown'])}`);
    delete globalThis.window;
  }

  // (b) ...and the simulation answers it with exactly COAST_DRAG, in the direction of
  // slowing down. One tick, from a known speed, on the flat stub course.
  {
    const sim = new Sim(stubCourse(), 1);
    sim.speed = S.VMAX * 0.9;
    const before = sim.speed;
    sim.step(DT, { steer: 0, throttle: 0, boost: false });
    const dv = (sim.speed - before) / DT;
    ok('a closed throttle decelerates the car at exactly COAST_DRAG',
      near(dv, -S.COAST_DRAG, 1e-6) && S.COAST_DRAG > 0,
      `dv/dt = ${dv.toFixed(4)} m/s^2 against COAST_DRAG = ${S.COAST_DRAG}`);
    ok('and it is CLEARLY weaker than the brake, which is the point of the item',
      S.COAST_DRAG < S.BRAKE * 0.25,
      `COAST_DRAG / BRAKE = ${(S.COAST_DRAG / S.BRAKE).toFixed(3)} (bound < 0.25)`);
  }

  // (c) THE INVARIANT. Measured against the telegraph a real course really signs its brake
  // corners with, so if props.js or the sight-distance derivation moves, this moves with it.
  {
    const course = new Course(404);
    const props = propsFor(course);
    const warns = props.filter((p) => p.kind === 'WARN' && p.warnFor);
    const telegraph = Math.min(...warns.map((p) => p.warnFor.z - p.z));
    ok('the brake corners are signed, and the telegraph is the distance the bound uses',
      warns.length >= 6 && near(telegraph, 1.5 * course.blindCrestExclusionM, 1e-6),
      `${warns.length} signs, nearest telegraph ${telegraph.toFixed(1)} m = 1.5 * D (D = ${course.blindCrestExclusionM.toFixed(1)} m)`);

    const vCoast = Math.sqrt(Math.max(0, S.VMAX * S.VMAX - 2 * S.COAST_DRAG * telegraph));
    const vHold = S.COAST_DRAG_HOLD_SPEED;
    const vEntry = S.brakeCornerEntrySpeed(S.BRAKE_CORNER.curve);
    // vHold is the speed at which the drift merely TIES full opposite lock; above it the
    // corner cannot be held by any input, so the brake is still mandatory.
    ok('coasting the WHOLE telegraph still leaves the corner physically unholdable',
      vCoast > vHold,
      `release UP at the sign from VMAX -> ${vCoast.toFixed(2)} m/s at the mouth, against `
      + `full-lock tie ${vHold.toFixed(2)} m/s and the phi=${S.BRAKE_CORNER.phi} entry bound ${vEntry.toFixed(2)} m/s`);
    ok('the drift at that arrival speed exceeds full lock outright',
      S.BRAKE_CORNER.curve * vCoast * vCoast * S.CENTRIFUGAL
        > S.STEER_RATE * (0.35 + 0.65 * vCoast / S.VMAX),
      `drift ${(S.BRAKE_CORNER.curve * vCoast * vCoast * S.CENTRIFUGAL / (S.STEER_RATE * (0.35 + 0.65 * vCoast / S.VMAX)) * 100).toFixed(1)}% of available authority`);
    // The same statement as a bound on the constant, which is the form spec.js publishes.
    ok('COAST_DRAG is under its derived ceiling, and the ceiling is derived, not chosen',
      S.COAST_DRAG < S.coastDragCeiling(telegraph)
        && near(S.coastDragCeiling(telegraph), (S.VMAX * S.VMAX - vHold * vHold) / (2 * telegraph), 1e-9),
      `COAST_DRAG ${S.COAST_DRAG} vs ceiling ${S.coastDragCeiling(telegraph).toFixed(2)} m/s^2 `
      + `(${(S.COAST_DRAG / S.coastDragCeiling(telegraph) * 100).toFixed(0)}% of it), hard ceiling `
      + `${((S.VMAX * S.VMAX - vEntry * vEntry) / (2 * telegraph)).toFixed(2)} m/s^2`);
    // A ceiling nothing can violate is not a bound. This is the control: the value at which
    // coasting alone reaches the corner's entry speed must FAIL the bound above.
    ok('the bound has teeth: the coast-as-brake value would violate it',
      (S.VMAX * S.VMAX - vEntry * vEntry) / (2 * telegraph) > S.coastDragCeiling(telegraph),
      `27.69-class values sit above the ${S.coastDragCeiling(telegraph).toFixed(2)} ceiling`);
    // And the other side of the same coin: BRAKE must still do the job coasting cannot,
    // at the same 0.75 braking fraction the driver's own brake-point planner assumes.
    const vBraked = Math.sqrt(Math.max(0, S.VMAX * S.VMAX - 2 * S.BRAKE * 0.75 * telegraph));
    ok('BRAKE still takes the corner from the same sign, so the button keeps its job',
      vBraked < vEntry,
      `braking from the sign arrives at ${vBraked.toFixed(2)} m/s, under the ${vEntry.toFixed(2)} m/s entry bound`);
  }

  // (d) B13's additivity is untouched: no ordinary corner may ever be bound by any of this.
  ok('no ordinary corner is affected — brakeCornerEntrySpeed stays Infinity on the ceiling',
    S.brakeCornerEntrySpeed(S.maxCurvature(999)) === Infinity
      && S.COAST_DRAG_HOLD_SPEED > S.brakeCornerEntrySpeed(S.BRAKE_CORNER.curve),
    `maxCurvature(999) = ${S.maxCurvature(999).toFixed(2)} < CURVE_FLAT_MAX ${S.CURVE_FLAT_MAX.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// §19 — THE PLAYER PATH (P6). The 32-seed contract in playable.test.mjs is generated by
// driver.js, whose station-keeper is a PD on the gap: a continuous throttle, which absorbs
// any constant drag as a small steady-state offset. A pair of hands has three keys. That is
// the blind spot P6 was: an undocumented ONSET ramp cut the drag a lift actually delivers to
// 43% of nominal, the gauge stopped filling by hand, the boost stopped reaching 420 km/h —
// and the 32-seed table did not move by one byte, because the bots never noticed.
//
// So this section measures the mechanic through a BINARY-KEY input, with a reaction lag,
// and pins the two numbers the player reads off the screen: top speed and gauge fill.
{
  console.log('\n§19  the player path — binary keys, not a PD (P6)');

  // (a) The two-sided bound on COAST_DRAG. P4 derived the ceiling (B13) and recorded that
  // there was no floor. The draft is the floor: the slipstream raises the cap to DEEP_CAP
  // while the drafted car runs at rivalSpeed, and releasing UP must be able to null that
  // overspeed inside the depth of the DEEP band, or the zone spits the player out of the
  // front before the gauge fills. Asserted against the FORMULA, not the literal.
  {
    const dv = S.DEEP_CAP - S.rivalSpeed(1);
    const band = (S.DEEP.dzMax - S.DEEP.dzMin) * S.CAR_LEN;
    ok('the draft-hold floor is derived from the zone the player has to sit in',
      near(S.DRAFT_HOLD_DRAG, (dv * dv) / (2 * band), 1e-9)
        && near(S.DEEP_CAP, S.VMAX * (1 + (1 - S.DEEP.drag) * 0.16), 1e-9),
      `overspeed ${dv.toFixed(2)} m/s over a ${band.toFixed(1)} m band -> floor `
      + `${S.DRAFT_HOLD_DRAG.toFixed(2)} m/s^2`);
    ok('COAST_DRAG is between its derived floor and its derived ceiling',
      S.COAST_DRAG >= S.DRAFT_HOLD_DRAG && S.COAST_DRAG < S.COAST_DRAG_CEILING,
      `${S.DRAFT_HOLD_DRAG.toFixed(2)} <= ${S.COAST_DRAG} < ${S.COAST_DRAG_CEILING.toFixed(2)} `
      + `(${(S.COAST_DRAG / S.DRAFT_HOLD_DRAG).toFixed(2)}x the floor, `
      + `${(S.COAST_DRAG / S.COAST_DRAG_CEILING * 100).toFixed(0)}% of the roof)`);
  }

  // (b) THE REGRESSION CLASS, stated so it cannot come back. §18(b) asserts the drag on the
  // first tick; this asserts the drag over a whole SHORT LIFT, which is the shape
  // station-keeping actually has. Any onset ramp, easing or lerp fails here even if it is
  // asymptotically correct — which is exactly how the shipped one passed unnoticed.
  {
    const LIFT = 0.30;                       // seconds — a station-keeping blip
    const sim = new Sim(stubCourse(), 1);
    sim.speed = S.VMAX * 0.9;
    const before = sim.speed;
    let t = 0;
    while (t < LIFT - 1e-9) { sim.step(DT, { steer: 0, throttle: 0, boost: false }); t += DT; }
    const meanDrag = (before - sim.speed) / t;
    ok('a SHORT lift delivers full COAST_DRAG, not a ramped fraction of it',
      near(meanDrag, S.COAST_DRAG, 1e-6) && meanDrag >= S.DRAFT_HOLD_DRAG,
      `mean over ${(t * 1000).toFixed(0)} ms = ${meanDrag.toFixed(3)} m/s^2 `
      + `(COAST_DRAG ${S.COAST_DRAG}, floor ${S.DRAFT_HOLD_DRAG.toFixed(2)})`);
  }

  // (c) and (d) — the measurement. A crude pair of hands: it perceives the world REACTION
  // seconds late, re-decides only every QUANTUM seconds, holds UP by default and LIFTS when
  // it judges itself close enough, and fires the gauge at a threshold. Steering is the bot's
  // (P6 is not about steering). `pin` forces the throttle open forever — the control.
  const DZ_AIM = S.DEEP.dzMin + 0.5 * (S.DEEP.dzMax - S.DEEP.dzMin);
  // fireAt: the gauge level this pair of hands waits for before pressing. It used to be
  // 0.95 — "near enough to full for a human eye" — which was fair while ANY deep release
  // slingshotted. A slingshot now requires a FULL gauge (Sim#slingReady), and the HUD says
  // so directly: the bar blinks white exactly while a press would slingshot, and it holds
  // at CHARGE_MAX for as long as the tow is held, so waiting for the blink costs a real
  // player nothing. The 0.20 s reaction and 0.12 s decision quantum on the STEERING stay,
  // because those model a thing the player cannot see coming; the release cue is now
  // something they can. The 0.95 hands are kept as an explicit contrast case below.
  const hands = ({ reaction = 0.20, quantum = 0.12, fireAt = 1.0, pin = null } = {}) => {
    const steerBot = makeDriver({ useTow: true, release: 'none' });
    const hist = [];
    const used = new Set();
    let hold = 0, key = 1, fired = false;
    const fn = (sim, course) => {
      const steer = steerBot(sim, course).steer;
      hist.push({ z: sim.z, speed: sim.speed, rivals: sim.rivals.map((r) => ({ z: r.z, speed: r.speed })) });
      const lag = Math.round(reaction / DT);
      const seen = hist.length > lag ? hist[hist.length - 1 - lag] : hist[0];
      if (hist.length > lag + 2) hist.shift();
      hold -= DT;
      if (hold <= 0) {
        hold = quantum;
        let gap = Infinity, rv = 0;
        for (const r of seen.rivals) { const d = r.z - seen.z; if (d > 0.5 * S.CAR_LEN && d < gap) { gap = d; rv = r.speed; } }
        if (!isFinite(gap)) key = 1;
        else if (gap < DZ_AIM * S.CAR_LEN * 0.8) key = 0;                       // lift, never brake
        else if (gap < DZ_AIM * S.CAR_LEN * 1.25 && seen.speed > rv) key = 0;
        else key = 1;
      }
      let boost = false;
      if (sim.charge >= fireAt * S.CHARGE_MAX) { if (!fired) boost = true; fired = true; } else fired = false;
      const throttle = pin === null ? key : pin;
      used.add(throttle);
      return { steer, throttle, boost };
    };
    fn.used = used;
    return fn;
  };
  const drive1 = (drv, seed) => {
    const course = new Course(seed);
    const sim = new Sim(course, seed);
    let steps = 0, vmax = 0, gauge = 0;
    while (!sim.finished && !sim.gameOver && steps++ < 60 * 60 * 12) {
      if (sim.charge > gauge) gauge = sim.charge;
      sim.step(DT, drv(sim, course));
      if (sim.speed > vmax) vmax = sim.speed;
    }
    return { kmh: vmax * 3.6, gauge };
  };
  const SEEDS = [101, 505, 909, 1313, 1717, 2121, 2525, 2929];   // the contract's own basis
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

  const keysUsed = new Set();
  const rs = SEEDS.map((s) => { const d = hands(); const r = drive1(d, s); for (const k of d.used) keysUsed.add(k); return r; });

  // The input really was a set of keys. Without this the whole section could pass on a
  // controller the player does not have — which is how P6 got past the 32-seed contract.
  ok('the measurement used a BINARY key, not a continuous throttle',
    [...keysUsed].every((v) => v === -1 || v === 0 || v === 1),
    `throttle values seen: {${[...keysUsed].sort().join(', ')}}`);

  // 420 km/h = 116.67 m/s is what the deep tow pays: the deep cap alone is 381.9 km/h, so
  // reaching it REQUIRES a gauge released from the slipstream, and the c^3 reward curve
  // means it takes ~67% of a gauge. This is the number the user reads off the speedometer.
  const kmh = rs.map((r) => r.kmh);
  ok('a pair of HANDS can push the boost past 420 km/h',
    med(kmh) >= 420 && kmh.filter((v) => v >= 420).length >= SEEDS.length * 0.75,
    `median peak ${med(kmh).toFixed(0)} km/h, ${kmh.filter((v) => v >= 420).length}/${SEEDS.length} seeds >= 420 `
    + `(deep cap alone is ${(S.DEEP_CAP * 3.6).toFixed(0)} km/h)`);

  // The cost of the full-gauge rule, stated rather than hidden: the same hands firing at
  // 95% get an ordinary boost (no 1.4x duration/gain, no chain) and fall short of the same
  // number. This is the intended trade — the white blink is the whole instruction — but it
  // is a real loss, so it is asserted instead of left to be rediscovered.
  const early = SEEDS.map((s) => drive1(hands({ fireAt: 0.95 }), s).kmh);
  ok('firing at 95% is measurably slower than waiting for the blink',
    med(early) < med(kmh) - 15,
    `95%: median ${med(early).toFixed(0)} km/h vs 100%: ${med(kmh).toFixed(0)} km/h`);

  const gauges = rs.map((r) => r.gauge);
  ok('a pair of HANDS can fill the slingshot gauge',
    med(gauges) >= 0.90 * S.CHARGE_MAX,
    `median best gauge ${med(gauges).toFixed(0)}% (gate >= 90%), min ${Math.min(...gauges).toFixed(0)}%`);

  // THE CONTROL. If the two clauses above could be satisfied by simply driving, they would
  // not be measuring the tow at all. A player who never lifts is carried through the DEEP
  // band by the overspeed the band itself grants and cannot fill the gauge.
  {
    const flat = SEEDS.map((s) => drive1(hands({ pin: 1 }), s));
    ok('...and it is the LIFT that does it: a driver who never lifts cannot',
      med(flat.map((r) => r.gauge)) < 0.90 * S.CHARGE_MAX
        && med(flat.map((r) => r.kmh)) < 420,
      `never-lifts: median gauge ${med(flat.map((r) => r.gauge)).toFixed(0)}%, `
      + `median peak ${med(flat.map((r) => r.kmh)).toFixed(0)} km/h`);
  }
}

// ------------------------------------------------- 20. flat cross-roads are road-plane scenery
// The crossings are presentation-only, but their geometric contract is strict: reuse the
// projected road slabs on straights, curves and grades; paint above the road bands and
// below both the centre line and fog; never create a second simulation path.
{
  const crossingZ = S.CROSS_ROAD.positionsM[0];
  const makeCourse = (curve, profile = 'flat') => {
    const segments = Array.from({ length: 3000 }, (_, i) => ({
      index: i, z: i * S.SEG_LEN, curve,
      // A visible rounded brow centred on the crossing. The earlier 7 m sine put the
      // crossing beyond its own deliberately severe occlusion horizon, testing "hidden
      // ground is not painted" rather than the requested on-hill attachment.
      y: profile === 'crest' ? 2.5 * Math.cos((i * S.SEG_LEN - crossingZ) / 90)
        : profile === 'uphill' ? (i * S.SEG_LEN - crossingZ) * 0.025
        : profile === 'downhill' ? -(i * S.SEG_LEN - crossingZ) * 0.025 : 0,
    }));
    const course = {
      segments, totalLength: segments.length * S.SEG_LEN, checkpoints: [], traffic: [],
      curveAt: () => curve,
      segmentAt: (z) => segments[Math.max(0, Math.min(segments.length - 1, Math.floor(z / S.SEG_LEN)))],
    };
    course.elevationAt = (z) => course.segmentAt(z).y;
    return course;
  };
  const noop = () => {};
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (t, k) => k in t ? t[k] : noop, set: (t, k, v) => (t[k] = v, true) });
  let geometryOk = true, temporalOk = true, edgeOk = true, fadeOk = true;
  let seenPavement = false, seenSeam = false, detail = '';
  for (const [name, course] of [
    ['straight', makeCourse(0)],
    ['left-curve', makeCourse(-0.75)],
    ['right-curve', makeCourse(0.75)],
    ['uphill', makeCourse(0.2, 'uphill')],
    ['downhill', makeCourse(-0.2, 'downhill')],
    ['crest', makeCourse(0.2, 'crest')],
  ]) {
    const slabs = [];
    const r = new Renderer(ctx);
    r._slab = (xb, wb, yb, xt, wt, yt, c) => slabs.push({ xb, wb, yb, xt, wt, yt, c, a: ctx.globalAlpha });
    r.beginFrame(); r.renderRoad(course, { z: crossingZ - 82, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
    const crosses = slabs.filter((q) => q.c === S.PAL.crossRoad || q.c === S.PAL.crossRoadSeam);
    seenPavement ||= crosses.some((q) => q.c === S.PAL.crossRoad);
    seenSeam ||= crosses.some((q) => q.c === S.PAL.crossRoadSeam);
    for (const q of crosses) {
      const road = slabs.find((p) => p.yb === q.yb && p.yt === q.yt
        && (p.c === S.PAL.road1 || p.c === S.PAL.road2));
      geometryOk &&= !!road && near(q.xb, road.xb, 1e-9) && near(q.xt, road.xt, 1e-9)
        && q.wb + 1e-9 >= road.wb * S.CROSS_ROAD.halfWidthM / (S.ROAD_WIDTH / 2)
        && q.wt + 1e-9 >= road.wt * S.CROSS_ROAD.halfWidthM / (S.ROAD_WIDTH / 2);
      edgeOk &&= q.xb - q.wb <= -S.CROSS_ROAD.edgeOverscanPx
        && q.xb + q.wb >= S.VIEW_W + S.CROSS_ROAD.edgeOverscanPx
        && q.xt - q.wt <= -S.CROSS_ROAD.edgeOverscanPx
        && q.xt + q.wt >= S.VIEW_W + S.CROSS_ROAD.edgeOverscanPx;
    }
    // Approach in sub-segment steps. Crest/off-frame clipping may delay first appearance,
    // but once visible the band must not blink out again before the camera reaches it.
    const visible = [];
    for (let camZ = crossingZ - 120; camZ <= crossingZ - 14; camZ += 1.5) {
      const rr = new Renderer(ctx); let painted = false;
      rr._slab = (xb, wb, yb, xt, wt, yt, c) => { if (c === S.PAL.crossRoad || c === S.PAL.crossRoadSeam) painted = true; };
      rr.beginFrame(); rr.renderRoad(course, { z: camZ, x: 0, height: S.CAMERA_HEIGHT }); rr.endFrame();
      visible.push(painted);
    }
    const first = visible.indexOf(true);
    temporalOk &&= first >= 0 && visible.slice(first).every(Boolean);

    if (name === 'straight') {
      // Exact fade contract at the anchor-distance boundaries, including a coarse 40 m
      // step representative of crossing the boundary in one high-speed frame.
      const alphas = [];
      for (let distance = S.CROSS_ROAD.visibleFarM + 40;
        distance >= S.CROSS_ROAD.visibleFarM - S.CROSS_ROAD.fadeInM - 40; distance -= 40) {
        const aa = [];
        const fr = new Renderer(ctx);
        fr._slab = (xb, wb, yb, xt, wt, yt, c) => {
          if (c === S.PAL.crossRoad || c === S.PAL.crossRoadSeam) aa.push(ctx.globalAlpha);
        };
        fr.beginFrame(); fr.renderRoad(course, { z: crossingZ - distance, x: 0, height: S.CAMERA_HEIGHT }); fr.endFrame();
        alphas.push(aa.length ? Math.max(...aa) : 0);
      }
      fadeOk &&= alphas[0] === 0 && alphas.at(-1) === 1
        && alphas.every((a, i) => i === 0 || a + 1e-9 >= alphas[i - 1])
        && alphas.some((a) => a > 0 && a < 1);
    }
    detail += `${name}:${crosses.length}[${[...new Set(crosses.map((q) => q.c))].join(',')}] first=${first} `;
  }
  ok('flat cross-roads reuse the exact road-plane centre and perspective on straight, curve and hill',
    geometryOk && temporalOk && edgeOk && fadeOk && seenPavement && seenSeam, detail.trim());

  const ops = [];
  let style = '#000';
  const fogCtx = new Proxy({ globalAlpha: 1 }, {
    get: (t, k) => {
      if (k === 'fillStyle') return style;
      if (k === 'fillRect') return (x, y, w, h) => ops.push({ kind: 'fill', c: style, a: t.globalAlpha, y, h });
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { if (k === 'fillStyle') style = v; else t[k] = v; return true; },
  });
  const r = new Renderer(fogCtx);
  r._slab = (xb, wb, yb, xt, wt, yt, c) => ops.push({ kind: 'slab', c, yb, yt });
  r.beginFrame(); r.renderRoad(makeCourse(0), { z: crossingZ - 720, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
  const crossI = ops.findIndex((q) => q.kind === 'slab' && (q.c === S.PAL.crossRoad || q.c === S.PAL.crossRoadSeam));
  const cross = ops[crossI];
  const sameRow = cross ? ops.map((q, i) => ({ q, i })).filter(({ q }) => q.kind === 'slab' && q.yb === cross.yb && q.yt === cross.yt) : [];
  const roadI = sameRow.filter(({ q }) => q.c === S.PAL.road1 || q.c === S.PAL.road2).at(-1)?.i ?? -1;
  const laneI = sameRow.find(({ q }) => q.c === S.PAL.lane)?.i ?? Infinity;
  const fogI = cross ? ops.findIndex((q, i) => i > crossI && q.kind === 'fill' && q.c === S.PAL.skyLow && q.a > 0
    && q.y < cross.yb && q.y + q.h > cross.yt) : -1;
  ok('cross-road paint order is road bands -> pavement -> centre line -> distance fog',
    S.CROSS_ROAD.layerOrder.join('/') === 'distanceBands/mainRoad/crossRoad/centerLine/distanceFog/roadsideProps/cars'
      && roadI >= 0 && roadI < crossI && crossI < laneI && fogI > crossI,
    `indices road=${roadI} crossing=${crossI} lane=${laneI === Infinity ? 'dash-off' : laneI} fog=${fogI}`);

  ok('cross-road contract has no gameplay affordance or warning-colour role',
    S.CROSS_ROAD.paletteRoles.pavement === 'crossRoad'
      && S.CROSS_ROAD.paletteRoles.seam === 'crossRoadSeam'
      && S.CROSS_ROAD.halfWidthM >= 200
      && S.CROSS_ROAD.visibleFarM <= S.DRAW_DISTANCE * S.SEG_LEN
      && S.CROSS_ROAD.fadeInM > S.SEG_LEN
      && !Object.keys(S.CROSS_ROAD).some((k) => /collision|score|speed|traffic|route|branch/i.test(k))
      && S.PAL.crossRoad !== S.PAL.chargeHigh && S.PAL.crossRoadSeam !== S.PAL.chargeHigh,
    `${S.CROSS_ROAD.positionsM.length} rendering positions; roles ${Object.values(S.CROSS_ROAD.paletteRoles).join('/')}`);
}

// ------------------------------------------------- 21. distant diagonal overpasses are scenery
{
  const o = S.DISTANT_OVERPASS;
  const anchor = o.positionsM[0];
  const makeCourse = (curve, hill) => {
    const segments = Array.from({ length: 3000 }, (_, i) => ({
      index: i, z: i * S.SEG_LEN, curve,
      y: hill ? 3 * Math.cos((i * S.SEG_LEN - anchor) / 115) : 0,
    }));
    const course = {
      segments, totalLength: segments.length * S.SEG_LEN, checkpoints: [], traffic: [],
      segmentAt: (z) => segments[Math.max(0, Math.min(segments.length - 1, Math.floor(z / S.SEG_LEN)))],
      curveAt: () => curve,
    };
    course.elevationAt = (z) => course.segmentAt(z).y;
    return course;
  };
  const noop = () => {};
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (t, k) => k in t ? t[k] : noop, set: (t, k, v) => (t[k] = v, true) });
  let casesOk = true;
  const details = [];
  for (const [name, course] of [['straight', makeCourse(0, false)], ['curve', makeCourse(0.75, false)], ['hill', makeCourse(0.2, true)]]) {
    const quads = [];
    const r = new Renderer(ctx);
    r._quad = (a, b, c, d, colour) => quads.push({ a, b, c, d, colour, alpha: ctx.globalAlpha });
    r.beginFrame(); r.renderRoad(course, { z: anchor - 450, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
    const deck = quads.find((q) => q.colour === S.PAL.overpassDeck);
    const edge = quads.find((q) => q.colour === S.PAL.overpassEdge);
    const piers = quads.filter((q) => q.colour === S.PAL.overpassPier);
    casesOk &&= !!deck && !!edge && piers.length === 2
      && Math.abs(deck.a.sy - deck.b.sy) > 1 && Math.abs(deck.a.sx - deck.b.sx) > 20;
    details.push(`${name}:${quads.length}`);
  }
  ok('distant overpass keeps a projected diagonal deck and minimal piers on straight, curve and hill',
    casesOk, details.join(' '));

  const course = makeCourse(0, false);
  const samples = [];
  for (let dz = o.visibleFarM + 10; dz >= o.visibleNearM - 10; dz -= 10) {
    let alpha = 0;
    const r = new Renderer(ctx);
    r._quad = (a, b, c, d, colour) => { if (colour === S.PAL.overpassDeck) alpha = ctx.globalAlpha; };
    r.beginFrame(); r.renderRoad(course, { z: anchor - dz, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
    samples.push(alpha);
  }
  const first = samples.findIndex((a) => a > 0);
  const last = samples.findLastIndex((a) => a > 0);
  const noInteriorBlink = first >= 0 && samples.slice(first, last + 1).every((a) => a > 0);
  ok('distant overpass fades at both range boundaries without an interior visibility pop',
    noInteriorBlink && samples[first] < 0.2 && samples[last] < 0.2,
    `first=${samples[first]?.toFixed(3)} peak=${Math.max(...samples).toFixed(3)} last=${samples[last]?.toFixed(3)}`);

  ok('distant overpass contract is low-contrast rendering data with no gameplay affordance',
    o.layerOrder.join('/') === 'sky/distantHills/distantOverpass/terrain/mainRoad/overheadUnderside/roadsideProps/warnings/checkpointGate/cars'
      && o.paletteRoles.deck === 'overpassDeck' && o.paletteRoles.edge === 'overpassEdge'
      && !Object.keys(o).some((k) => /collision|score|speed|traffic|route|branch/i.test(k))
      && !Object.values(o.paletteRoles).some((role) => S.PAL[role] === S.PAL.chargeHigh),
    `${o.positionsM.length} positions; visible ${o.visibleNearM}..${o.visibleFarM}m`);

  // The foreground handoff must cover every camera position from the distant fade through
  // the actual crossing and exit. It may clip bridge slices behind the camera, but must
  // never hand _quad a non-finite coordinate or leave a visibility hole at the handoff.
  let continuous = true, finite = true, sawUnder = false, maxSpan = 0;
  for (let dz = o.overheadFarM - 1; dz >= -o.halfDepthM + o.overheadNearPlaneM + 1; dz -= 5) {
    let under = 0;
    const r = new Renderer(ctx);
    r._quad = (a, b, c, d, colour) => {
      if (colour !== S.PAL.overpassUnderside) return;
      under++;
      const values = [a, b, c, d].flatMap((p) => [p.sx, p.sy]);
      finite &&= values.every(Number.isFinite);
      maxSpan = Math.max(maxSpan, Math.abs(a.sx - b.sx));
    };
    r.beginFrame(); r.renderRoad(course, { z: anchor - dz, x: 0, height: S.CAMERA_HEIGHT }); r.endFrame();
    continuous &&= under > 0;
    sawUnder ||= dz < 40 && dz > -40 && under > 0;
  }
  ok('overpass foreground is continuous and finite through approach, underpass and exit',
    continuous && finite && sawUnder && maxSpan > 1,
    `continuous=${continuous} finite=${finite} crossing=${sawUnder} max slice span=${maxSpan.toFixed(1)}px`);

  ok('overhead handoff keeps gameplay cues above the underside and remains rendering-only',
    o.overheadFarM - o.overheadFadeM === o.visibleNearM
      && o.paletteRoles.underside === 'overpassUnderside'
      && S.PAL.overpassUnderside !== S.PAL.chargeHigh
      && !Object.keys(o).some((k) => /collision|score|speed|traffic|route|branch/i.test(k)),
    `handoff ${o.visibleNearM}..${o.overheadFarM}m; order ${o.layerOrder.join(' > ')}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
