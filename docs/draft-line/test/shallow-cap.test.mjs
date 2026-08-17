// The shallow tow can only fill the gauge to CHARGE_SHALLOW_CAP (80). THE defect this
// fixes: "gauge full" and "a release right now slingshots" were different facts, because
// a player could sit in the wide, easy shallow band forever and hold a full bar without
// ever having earned a tick on a rival's bumper. The HUD had to grow a third, dulled gold
// state to say "full, but not really", and camping in shallow with a full gauge was a
// strategy. With the cap, charge == CHARGE_MAX IMPLIES deep-or-coyote-window by
// construction: the gauge is two honest states again, and the last 20% is only ever bought
// on the bumper.
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';
import { Game } from '../src/game.js';
import { Course } from '../src/course.js';
import { makeDriver } from '../src/driver.js';

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
// Zone dictated by the test rather than by rival geometry, so transitions are exact.
function rig() {
  const sim = new Sim(course(), 1);
  sim.zoneOverride = null;
  sim._resolveZone = function () { this.zoneDepth = 1; return this.zoneOverride; };
  return sim;
}
const idle = { steer: 0, throttle: 0, boost: false };
const DT = 1 / 60;
function hold(sim, zone, seconds, dt = DT) {
  sim.zoneOverride = zone;
  for (let t = 0; t + 1e-9 < seconds; t += dt) sim.step(dt, idle);
}

// ---------------------------------------------------------------- 1. the ceiling
{
  const sim = rig();
  hold(sim, 'shallow', 60);      // ~5x longer than a full fill would ever need
  ok('shallow charging tops out exactly at CHARGE_SHALLOW_CAP',
    sim.charge === S.CHARGE_SHALLOW_CAP, `charge=${sim.charge}`);
  ok('and the capped gauge is not slingReady', sim.slingReady === false);
}

// ---------------------------------------------------------------- 2. grace holds 100%
{
  const sim = rig();
  hold(sim, 'deep', 5);
  ok('deep reaches CHARGE_MAX', sim.charge === S.CHARGE_MAX);
  sim.zoneOverride = 'shallow';
  // Sample every tick of the window: the level must not sag at all, not merely end high.
  let minCharge = Infinity;
  const ticks = Math.floor(S.BOOST.slingGrace / DT) - 1;   // stay strictly inside [0, grace)
  for (let i = 0; i < ticks; i++) { sim.step(DT, idle); minCharge = Math.min(minCharge, sim.charge); }
  ok('inside the coyote window a full gauge holds at 100% in shallow',
    minCharge === S.CHARGE_MAX && sim.slingGrace > 0 && sim.slingReady === true,
    `min=${minCharge} grace=${sim.slingGrace.toFixed(4)}`);
}

// ---------------------------------------------------------------- 3. the give-back
{
  const sim = rig();
  hold(sim, 'deep', 5);
  sim.zoneOverride = 'shallow';
  // Run past the window and let the excess drain.
  const expect = S.BOOST.slingGrace + (S.CHARGE_MAX - S.CHARGE_SHALLOW_CAP) / S.CHARGE_EXCESS_DRAIN;
  let t = 0, fellAt = null;
  while (t < 3) {
    sim.step(DT, idle); t += DT;
    if (fellAt === null && sim.charge <= S.CHARGE_SHALLOW_CAP) fellAt = t;
  }
  ok('after the window the excess drains to the cap at CHARGE_EXCESS_DRAIN',
    Math.abs(fellAt - expect) < 0.05, `fell at ${fellAt.toFixed(3)}s, expected ~${expect.toFixed(3)}s`);
  ok('and it CLAMPS at the cap rather than continuing down',
    sim.charge === S.CHARGE_SHALLOW_CAP, `charge after 3 s = ${sim.charge}`);
  // A slower rate would be invisible in peripheral vision; assert the intent, not just the
  // constant, so lowering CHARGE_EXCESS_DRAIN toward CHARGE_DRAIN fails here.
  ok('the give-back is fast enough to read as a consequence (< 0.5 s of drain)',
    (S.CHARGE_MAX - S.CHARGE_SHALLOW_CAP) / S.CHARGE_EXCESS_DRAIN < 0.5);
}

// The clamp must not eat charge the shallow band would have given anyway: a gauge already
// at or below the cap is untouched by the give-back branch and keeps charging.
{
  const sim = rig();
  sim.zoneOverride = 'shallow';
  sim.charge = S.CHARGE_SHALLOW_CAP - 10;
  const before = sim.charge;
  sim.step(DT, idle);
  ok('below the cap, shallow still CHARGES (the give-back is not a general drain)',
    sim.charge > before, `${before} -> ${sim.charge.toFixed(3)}`);
}

// ---------------------------------------------------------------- 4. clean air in grace
// Decision: the coyote window is defined by where the car WAS, so it holds ALL decay, not
// only the shallow give-back. Splitting on the current zone would make the same 0.25 s
// mean two different things and would leave deep -> clean-air unprotected — CHARGE_DRAIN
// runs on the very tick the zone goes null, so one tick used to be enough to cancel the
// window entirely (see sling-grace 3d).
{
  const sim = rig();
  hold(sim, 'deep', 5);
  sim.zoneOverride = null;
  let minCharge = Infinity;
  const ticks = Math.floor(S.BOOST.slingGrace / DT) - 1;
  for (let i = 0; i < ticks; i++) { sim.step(DT, idle); minCharge = Math.min(minCharge, sim.charge); }
  ok('the window holds the gauge in CLEAN AIR too',
    minCharge === S.CHARGE_MAX && sim.slingReady === true, `min=${minCharge}`);

  const before = sim.charge;
  hold(sim, null, 1.0);
  // Only the portion of that second spent outside the window drains, at the ordinary
  // CHARGE_DRAIN (6/s) — clean air does NOT get the fast give-back, which belongs to the
  // shallow cap alone.
  const spent = 1.0 - (S.BOOST.slingGrace - (ticks + 1) * DT);
  ok('once the window closes, clean air drains at CHARGE_DRAIN as before',
    sim.slingGrace === 0 && Math.abs((before - sim.charge) - S.CHARGE_DRAIN * spent) < 0.3,
    `dropped ${(before - sim.charge).toFixed(2)} over ~${spent.toFixed(2)}s (CHARGE_DRAIN=${S.CHARGE_DRAIN})`);
}

// ---------------------------------------------------------------- 5. unreachability
// The state the dulled-gold gauge existed to draw — charge at CHARGE_MAX while a release
// would NOT slingshot — must have no reachable path. Two searches, because "I could not
// find one" is only worth as much as the search.
//
// 5a. Adversarial zone scripting: a randomised walk over every zone transition the sim
// admits, plus the events that write charge outside the charge loop (bumps, spins,
// releases, rearm). This is the search that would find a hole in the charge loop itself.
{
  let rngState = 12345;
  const rnd = () => (rngState = (rngState * 1664525 + 1013904223) >>> 0) / 4294967296;
  let violations = 0, fullTicks = 0, deepTicks = 0, worst = null;
  for (let run = 0; run < 200; run++) {
    const sim = rig();
    let zone = 'deep';
    for (let i = 0; i < 900; i++) {         // 15 s each, 50 minutes of play in total
      if (rnd() < 0.06) zone = [null, 'shallow', 'deep'][Math.floor(rnd() * 3)];
      sim.zoneOverride = zone;
      const r = rnd();
      if (r < 0.004) sim._doBump({ bump: false }, 0.5);
      else if (r < 0.006) sim._doSpin({ spin: false }, 'rear');
      sim.step(DT, { steer: 0, throttle: 1, boost: rnd() < 0.01 });
      if (zone === 'deep') deepTicks++;
      if (sim.charge >= S.CHARGE_MAX) {
        fullTicks++;
        if (!sim.slingArmed) { violations++; worst = { zone: sim.zone, grace: sim.slingGrace, charge: sim.charge }; }
      }
    }
  }
  ok('adversarial zone walk: a full gauge is ALWAYS armed (dim-gold state unreachable)',
    violations === 0 && fullTicks > 1000,
    `${fullTicks} full ticks observed over ${deepTicks} deep ticks, ${violations} violations`
    + (worst ? ` worst=${JSON.stringify(worst)}` : ''));
}

// 5b. Organic play on the real course with the real bots, which exercises zone geometry,
// collisions, boosts and resets that the scripted walk above stubs out.
{
  const bots = {
    plain: makeDriver({ useTow: false, release: 'none' }),
    masher: makeDriver({ useTow: true, release: 'asap' }),
    expert: makeDriver({ useTow: true, release: 'expert' }),
  };
  let violations = 0, fullTicks = 0, shallowFullTicks = 0;
  for (const [, bot] of Object.entries(bots)) {
    for (const seed of [101, 505, 1313]) {
      const c = new Course(seed);
      const sim = new Sim(c, seed);
      let steps = 0;
      while (!sim.finished && !sim.gameOver && steps++ < 60 * 240) {
        sim.step(DT, bot(sim, c));
        if (sim.charge >= S.CHARGE_MAX) {
          fullTicks++;
          if (!sim.slingArmed) violations++;
          if (sim.zone === 'shallow' && sim.slingGrace <= 0) shallowFullTicks++;
        }
      }
    }
  }
  ok('organic play on the real course never reaches a full-but-unarmed gauge',
    violations === 0 && fullTicks > 100,
    `${fullTicks} full ticks, ${violations} violations, ${shallowFullTicks} shallow-unarmed`);
}

// And the direct statement of the invariant the HUD now relies on.
{
  const sim = rig();
  hold(sim, 'shallow', 60);
  ok('shallow camping cannot reach CHARGE_MAX at all',
    sim.charge < S.CHARGE_MAX && sim.slingReady === false, `charge=${sim.charge}`);
}

// ---------------------------------------------------------------- 6. two gauge states
// The HUD gauge must paint exactly two colour families again: chargeLow while filling,
// chargeHigh + a white blink when the slingshot is live. Read off the actual fillStyle.
{
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const noop = () => {};
  const fills = [];
  const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'fillRect') return (x, y, w, h) => fills.push({ x, y, w, h, color: target.fillStyle });
      return key in target ? target[key] : noop;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const game = new Game(ctx);
  const bar = (t) => {
    fills.length = 0;
    game.t = t;
    game._renderHud();
    const row = fills.filter((f) => f.x === 0 && f.y === 0 && f.h === S.CELL && f.w > 1);
    return row[row.length - 1];
  };
  const s = game.sim;
  s._resolveZone = function () { this.zoneDepth = 1; return this.zoneOverride; };
  const set = (charge, zone, grace) => { s.charge = charge; s.zoneOverride = zone; s.zone = zone; s.slingGrace = grace; };

  set(S.CHARGE_MAX * 0.6, null, 0);
  ok('below full paints chargeLow', bar(0).color === S.PAL.chargeLow, bar(0).color);
  set(S.CHARGE_SHALLOW_CAP, 'shallow', 0);
  ok('a capped shallow gauge is still chargeLow', bar(0).color === S.PAL.chargeLow, bar(0).color);

  set(S.CHARGE_MAX, 'deep', S.BOOST.slingGrace);
  const a = bar(0).color, b = bar(0.125).color;
  ok('a full gauge blinks white against chargeHigh',
    (a === '#ffffff') !== (b === '#ffffff') && (a === S.PAL.chargeHigh || b === S.PAL.chargeHigh),
    `${a}/${b}`);

  // Sweep every reachable (charge, zone, grace) combination the gauge can be asked to
  // draw and collect the colour set: it must be exactly the two states plus the blink.
  const seen = new Set();
  for (const charge of [0.1, 0.5, 0.8, 0.99, 1.0].map((f) => f * S.CHARGE_MAX)) {
    for (const zone of [null, 'shallow', 'deep']) {
      for (const grace of [0, 0.1, S.BOOST.slingGrace]) {
        if (charge >= S.CHARGE_MAX && !(zone === 'deep' || grace > 0)) continue;  // unreachable (5)
        set(charge, zone, grace);
        seen.add(bar(0).color); seen.add(bar(0.125).color);
      }
    }
  }
  ok('the gauge paints exactly two states (+ the white blink)',
    seen.size === 3 && seen.has(S.PAL.chargeLow) && seen.has(S.PAL.chargeHigh) && seen.has('#ffffff'),
    [...seen].join(' '));
  ok('the dulled third gauge colour is gone from the palette',
    S.PAL.chargeHighDim === undefined);
}

console.log(`\nshallow-cap: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
