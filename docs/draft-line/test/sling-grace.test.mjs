// Slingshot coyote time (BOOST.slingGrace). The deep band is a narrow moving box on a
// rival's bumper: the exact tick you leave it is not something a player can see, so a
// release just after it still slingshots. The skill axis has to survive, so shallow-only
// charging must never earn one.
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};

const course = () => ({
  traffic: [], totalLength: 999999,
  checkpoints: Array.from({ length: S.TOTAL_LEGS }, (_, i) => ({ leg: i + 1, z: (i + 1) * 1000 })),
  curveAt: () => 0, elevationAt: () => 0,
  segmentAt: (z) => ({ index: Math.floor(z / S.SEG_LEN), z, curve: 0, y: 0 }),
});

// A sim whose zone is dictated by the test rather than by rival geometry, so the timing
// of the transition is exact. Everything else (ordering inside step) stays real.
function rig() {
  const sim = new Sim(course(), 1);
  sim.zoneOverride = null;
  sim._resolveZone = function () { this.zoneDepth = 1; return this.zoneOverride; };
  return sim;
}
const idle = { steer: 0, throttle: 0, boost: false };
const press = { steer: 0, throttle: 0, boost: true };
// Presses charged and un-rearmed, so only the sling decision is under test.
function pressNow(sim) {
  sim.charge = S.CHARGE_MAX;
  sim.rearm = 0;
  sim._clearBoost();
  return sim.step(1 / 60, press);
}
function hold(sim, zone, seconds, dt = 1 / 60) {
  sim.zoneOverride = zone;
  for (let t = 0; t + 1e-9 < seconds; t += dt) sim.step(dt, idle);
}
// Leaves deep, then spends exactly `seconds` of simulated time outside it (the tick that
// leaves deep counts), and returns the release event of a press on the next tick.
// The default fallback zone is SHALLOW, because that is the transition the coyote window
// exists for: the deep band is a small box inside the shallow one, so band jitter drops
// you into shallow, not out of the draft. It also matters for the charge level now that a
// slingshot needs a FULL gauge — see the clean-air case at the bottom of this file.
function leaveDeepThenPress(sim, seconds, dt, zone = 'shallow') {
  sim.zoneOverride = zone;
  const ticks = Math.round(seconds / dt);
  for (let i = 0; i < ticks; i++) sim.step(dt, idle);
  return pressNow(sim);
}

// 1. Regression: releasing inside the deep zone is a slingshot.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  const ev = pressNow(sim);
  ok('deep release slingshots', ev.release && ev.release.sling === true,
    JSON.stringify(ev.release));
}

// 2. New behaviour: inside the grace window it is still a slingshot.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  const ev = leaveDeepThenPress(sim, 0.1875, 1 / 32);   // 0.1875 s < 0.25 s
  ok('release 0.1875 s after leaving deep still slingshots',
    ev.release && ev.release.sling === true,
    `grace=${sim.slingGrace.toFixed(4)}`);
}

// 2b. The tick that leaves deep must not open a one-tick hole.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  const ev = leaveDeepThenPress(sim, 1 / 60, 1 / 60);
  ok('release on the tick after leaving deep still slingshots',
    ev.release && ev.release.sling === true);
}

// 3. Past the window it is an ordinary boost again.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  const ev = leaveDeepThenPress(sim, 0.3125, 1 / 32);  // 0.3125 s > 0.25 s
  ok('release 0.3125 s after leaving deep is NOT a slingshot',
    ev.release && ev.release.sling === false,
    `grace=${sim.slingGrace}`);
}

// 3b. Boundary. The window is half-open [0, slingGrace): grace is decremented before the
// release is read, so exactly slingGrace after the last deep tick the timer reads 0 and
// the comparison `slingGrace > 0` fails. Exact dt (1/32 = 2^-5) keeps this free of
// floating-point slack. (dt must stay <= 1/30: step() clamps larger ones.)
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  const ev = leaveDeepThenPress(sim, S.BOOST.slingGrace, 1 / 32);
  ok('release at exactly slingGrace is NOT a slingshot',
    sim.slingGrace === 0 && ev.release && ev.release.sling === false,
    `grace=${sim.slingGrace}`);
}

// 3c. The gauge must be FULL as well. A release inside the grace window with a partial
// gauge is an ordinary boost: the white blink means "a press right now slingshots", and
// slingArmed alone no longer decides.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  sim.zoneOverride = 'shallow';
  sim.step(1 / 60, idle);
  sim.charge = S.CHARGE_MAX * 0.99;
  sim.rearm = 1;               // keep the integrator from topping the gauge back up
  sim._clearBoost();
  const ev = sim.step(1 / 60, press);
  ok('a 99% release inside the grace window is NOT a slingshot',
    sim.slingGrace > 0 && ev.release && ev.release.sling === false,
    JSON.stringify(ev.release));
}

// 3d. Leaving the draft ALTOGETHER. This case USED to be a hole: CHARGE_DRAIN ran on the
// very tick the zone went null, so one tick of clean air dropped the gauge under
// CHARGE_MAX and the grace window was cancelled by the drain it was supposed to survive
// (previous expectation: sling === false, release.charge < 1). The grace now holds ALL
// decay, so the window means the same thing wherever the car ended up — it is defined by
// where you WERE. Expected now: a full-gauge press one tick into clean air still slingshots
// at full charge.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  sim.zoneOverride = null;
  sim.rearm = 0;
  sim._clearBoost();
  sim.charge = S.CHARGE_MAX;
  const ev = sim.step(1 / 60, press);
  ok('the grace holds the gauge in clean air too, so a press one tick out still slingshots',
    sim.slingGrace > 0 && ev.release && ev.release.sling === true && ev.release.charge === 1,
    `grace=${sim.slingGrace.toFixed(4)} charge=${ev.release && ev.release.charge}`);
}

// 3e. ...and only for the length of the window. Once it closes, clean air drains normally.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  sim.charge = S.CHARGE_MAX;
  sim.rearm = 0;
  hold(sim, null, 0.5);                   // 0.5 s > slingGrace
  // Only the 0.25 s past the window drains, at the ordinary CHARGE_DRAIN.
  const want = S.CHARGE_MAX - S.CHARGE_DRAIN * (0.5 - S.BOOST.slingGrace);
  ok('past the window, clean air drains the gauge again',
    sim.slingGrace === 0 && sim.charge < S.CHARGE_MAX && Math.abs(sim.charge - want) < 0.2,
    `charge=${sim.charge.toFixed(2)} want~${want.toFixed(2)}`);
}

// 4. Skill axis: shallow-only charging never earns a slingshot, however long it holds.
{
  const sim = rig();
  hold(sim, 'shallow', 3.0);
  const organic = sim.charge;
  const ev = pressNow(sim);   // forces a full gauge, which shallow alone can no longer reach
  ok('shallow-only release is NOT a slingshot, even with the gauge forced full',
    ev.release && ev.release.sling === false && sim.slingGrace === 0
    && organic <= S.CHARGE_SHALLOW_CAP,
    `organic charge ${organic.toFixed(1)} <= cap ${S.CHARGE_SHALLOW_CAP}`);
}

// 5. Reset paths clear the grace, so no state leaks between runs.
{
  const sim = rig();
  hold(sim, 'deep', 0.5);
  ok('grace is armed while deep', sim.slingGrace === S.BOOST.slingGrace);
  sim._resetRun(0);
  ok('_resetRun clears grace', sim.slingGrace === 0);

  const sim2 = rig();
  hold(sim2, 'deep', 0.5);
  sim2.reset();
  ok('reset clears grace', sim2.slingGrace === 0);

  const sim3 = rig();
  hold(sim3, 'deep', 0.5);
  sim3._doSpin({ spin: false }, 'rear');
  ok('spin clears grace', sim3.slingGrace === 0);

  ok('fresh sim starts with zero grace', new Sim(course(), 3).slingGrace === 0);
}

console.log(`\nsling-grace: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
