// The charge gauge and the "ready" ping must mean "a release RIGHT NOW slingshots", not
// "the bar is full". Before this, both read charge level alone, so a full gauge blinked
// white and pinged while shallow-drafting or after the coyote window had closed —
// promising the 1.4x release the sim would then refuse to give. The promise now comes
// from one place, Sim#slingReady, which is the same rule _release itself uses.
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';
import { Game } from '../src/game.js';

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

// Zone dictated by the test rather than by rival geometry, so transition timing is exact.
function rig() {
  const sim = new Sim(course(), 1);
  sim.zoneOverride = null;
  sim._resolveZone = function () { this.zoneDepth = 1; return this.zoneOverride; };
  return sim;
}
const idle = { steer: 0, throttle: 0, boost: false };
const press = { steer: 0, throttle: 0, boost: true };
function hold(sim, zone, seconds, dt = 1 / 60) {
  sim.zoneOverride = zone;
  for (let t = 0; t + 1e-9 < seconds; t += dt) sim.step(dt, idle);
}
function pressNow(sim) {
  sim.charge = S.CHARGE_MAX;
  sim.rearm = 0;
  sim._clearBoost();
  return sim.step(1 / 60, press);
}

// ---------------------------------------------------------------- 1. regression
// Collapsing the rule into a getter must not move the _release outcome anywhere.
{
  const cases = [
    ['deep', () => { const s = rig(); hold(s, 'deep', 0.5); return pressNow(s); }, true],
    // Falls back to SHALLOW, the transition the coyote window exists for; dropping out of
    // the draft entirely drains the gauge, which a slingshot now needs full (sling-grace 3d).
    ['inside grace', () => {
      const s = rig(); hold(s, 'deep', 0.5); s.zoneOverride = 'shallow';
      for (let i = 0; i < 6; i++) s.step(1 / 32, idle);          // 0.1875 s < 0.25 s
      return pressNow(s);
    }, true],
    ['past grace', () => {
      const s = rig(); hold(s, 'deep', 0.5); s.zoneOverride = 'shallow';
      for (let i = 0; i < 10; i++) s.step(1 / 32, idle);         // 0.3125 s > 0.25 s
      return pressNow(s);
    }, false],
    ['shallow only', () => { const s = rig(); hold(s, 'shallow', 3.0); return pressNow(s); }, false],
    ['clean air', () => { const s = rig(); hold(s, null, 1.0); return pressNow(s); }, false],
  ];
  for (const [name, run, want] of cases) {
    const ev = run();
    ok(`_release sling unchanged: ${name} -> ${want}`,
      ev.release && ev.release.sling === want, JSON.stringify(ev.release));
  }
}

// ---------------------------------------------------------------- 2. slingReady truth table
// Charge level and armed-ness are separate facts; slingReady is their AND.
{
  const s = rig();
  hold(s, 'deep', 2.0);
  s.charge = S.CHARGE_MAX;
  ok('100% + deep -> slingReady', s.slingReady === true && s.slingArmed === true);

  s.charge = S.CHARGE_MAX * 0.99;
  ok('99% + deep -> NOT slingReady (armed, not full)',
    s.slingReady === false && s.slingArmed === true);

  // Coyote window: armed without being in the band.
  s.charge = S.CHARGE_MAX;
  s.zoneOverride = null;
  s.step(1 / 60, idle);
  s.charge = S.CHARGE_MAX;
  ok('100% + inside grace -> slingReady',
    s.zone !== 'deep' && s.slingGrace > 0 && s.slingReady === true);

  const t = rig();
  hold(t, 'shallow', 3.0);
  t.charge = S.CHARGE_MAX;
  ok('100% + shallow only -> NOT slingReady',
    t.slingReady === false && t.slingArmed === false);

  const u = rig();
  hold(u, 'deep', 0.5);
  u.zoneOverride = null;
  for (let i = 0; i < 10; i++) u.step(1 / 32, idle);
  u.charge = S.CHARGE_MAX;
  ok('100% + grace expired -> NOT slingReady',
    u.slingGrace === 0 && u.slingReady === false);

  // The third axis. Was (before this change): "100% + deep + boosting -> slingReady", i.e.
  // true — the cue promised a slingshot that _release refuses to give while a boost runs.
  // Now: false. slingArmed is untouched, because WHERE you are has not changed; only the
  // question "would a press right now slingshot?" has.
  const b = rig();
  hold(b, 'deep', 2.0);
  b.charge = S.CHARGE_MAX;
  b.boost = { active: true, t: 2, dur: 4, gain: 40, sling: true, pending: 0, ending: false };
  ok('100% + deep + boosting -> NOT slingReady (was: true)',
    b.slingReady === false && b.slingArmed === true && b.charge >= S.CHARGE_MAX);
  b._clearBoost();
  ok('...and it becomes slingReady the instant the boost is cleared',
    b.slingReady === true);
}

// ---------------------------------------------------------------- 3. cue is an edge
{
  const s = rig();
  s.zoneOverride = 'deep';
  let rises = 0, ticksReady = 0;
  for (let i = 0; i < 240; i++) {           // 4 s tucked in deep, never releasing
    const ev = s.step(1 / 60, idle);
    if (ev.slingReady) rises++;
    if (s.slingReady) ticksReady++;
  }
  ok('ready cue fires exactly once while the condition holds',
    rises === 1, `rises=${rises} readyTicks=${ticksReady}`);

  // Falling back to false re-arms it.
  s.charge = 0;
  s.step(1 / 60, idle);
  ok('cue does not re-fire on the drop tick', s.slingReady === false);
  let again = 0;
  for (let i = 0; i < 240; i++) if (s.step(1 / 60, idle).slingReady) again++;
  ok('cue fires again after re-arming', again === 1, `again=${again}`);
}

// A press on the same tick the condition would first become true is owned by the release
// sound: the cue is resolved after the release, when charge is already back to 0.
{
  const s = rig();
  hold(s, 'deep', 2.0);
  s.charge = S.CHARGE_MAX; s.rearm = 0; s._clearBoost(); s._slingReadyWas = false;
  const ev = s.step(1 / 60, press);
  ok('a release on the arming tick emits no ready ping',
    ev.release && ev.release.sling === true && ev.slingReady === false && s._slingReadyWas === false,
    JSON.stringify({ release: ev.release, slingReady: ev.slingReady }));
}

// Re-fire frequency over a long deep/shallow flutter. The 0.25 s coyote window is supposed
// to swallow band jitter, so the cue must not machine-gun at the boundary.
{
  const s = rig();
  s.charge = S.CHARGE_MAX;
  let pings = 0;
  const dt = 1 / 60, ticks = 60 * 30;      // 30 s
  for (let i = 0; i < ticks; i++) {
    s.zoneOverride = (i % 12) < 3 ? 'deep' : 'shallow';   // in/out 5x per second
    s.charge = S.CHARGE_MAX;               // pin the bar full: isolate the armed axis
    if (s.step(dt, idle).slingReady) pings++;
  }
  ok('flutter at 5 Hz produces no cue re-fire (grace bridges the gaps)',
    pings === 1, `pings in 30 s = ${pings}`);
}

// ---------------------------------------------------------------- 4. reset paths
{
  const paths = [
    ['_resetRun', (s) => s._resetRun(0)],
    ['reset', (s) => s.reset()],
    ['_doSpin', (s) => s._doSpin({ spin: false }, 'rear')],
  ];
  for (const [name, apply] of paths) {
    const s = rig();
    s.zoneOverride = 'deep';
    for (let i = 0; i < 240; i++) s.step(1 / 60, idle);
    ok(`${name}: latch is set before`, s._slingReadyWas === true);
    apply(s);
    ok(`${name} clears the ready latch`, s._slingReadyWas === false);

    // And the cue really does ping again on the next arming, rather than staying mute.
    s.zoneOverride = 'deep';
    let rises = 0;
    for (let i = 0; i < 240; i++) if (s.step(1 / 60, idle).slingReady) rises++;
    ok(`${name}: cue re-arms across the boundary`, rises === 1, `rises=${rises}`);
  }
  ok('a fresh sim starts with a clear latch', new Sim(course(), 3)._slingReadyWas === false);
}

// ---------------------------------------------------------------- 5. the two gauge states
// Inspect the actual fillStyle the HUD paints into the gauge row.
{
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const noop = () => {};
  const fills = [];
  const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'fillRect') {
        return (x, y, w, h) => fills.push({ x, y, w, h, color: target.fillStyle });
      }
      return key in target ? target[key] : noop;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const game = new Game(ctx);

  // The gauge bar is the fill that starts at the origin and is narrower than the full
  // screen only because of charge; identify it by its row height and non-background colour.
  const bar = (t) => {
    fills.length = 0;
    game.t = t;
    game._renderHud();
    const row = fills.filter((f) => f.x === 0 && f.y === 0 && f.h === S.CELL && f.w > 1);
    return row[row.length - 1];   // background tile paints first, bar second
  };

  const s = game.sim;
  s._resolveZone = function () { this.zoneDepth = 1; return this.zoneOverride; };
  const set = (charge, zone, grace) => { s.charge = charge; s.zoneOverride = zone; s.zone = zone; s.slingGrace = grace; };

  set(S.CHARGE_MAX * 0.6, null, 0);
  ok('below 100% paints chargeLow', bar(0).color === S.PAL.chargeLow, bar(0).color);

  // Was: "100% but not armed paints chargeHighDim, no blink" — a third gauge state for a
  // full-but-unarmed gauge. CHARGE_SHALLOW_CAP made that state unreachable (proved in
  // test/shallow-cap.test.mjs), so it is gone; the shallow band's own ceiling is blue.
  set(S.CHARGE_SHALLOW_CAP, 'shallow', 0);
  const capA = bar(0).color, capB = bar(0.125).color;   // opposite blink phases (8 Hz)
  ok('a shallow gauge at its cap is still chargeLow, no blink',
    capA === S.PAL.chargeLow && capB === S.PAL.chargeLow, `${capA}/${capB}`);

  set(S.CHARGE_MAX, 'deep', S.BOOST.slingGrace);
  const onA = bar(0).color, onB = bar(0.125).color;
  ok('100% and armed blinks white against chargeHigh',
    (onA === '#ffffff') !== (onB === '#ffffff') &&
    (onA === S.PAL.chargeHigh || onB === S.PAL.chargeHigh), `${onA}/${onB}`);

  // Armed via the coyote window only (out of the band) must look identical to deep.
  set(S.CHARGE_MAX, null, 0.1);
  const graceA = bar(0).color, graceB = bar(0.125).color;
  ok('100% inside the coyote window looks the same as deep',
    new Set([graceA, graceB]).size === new Set([onA, onB]).size &&
    graceA === onA && graceB === onB, `${graceA}/${graceB}`);

  // Two states, and they must be unmistakable at a glance in peripheral vision.
  ok('the two states use two distinct colours',
    new Set([S.PAL.chargeLow, S.PAL.chargeHigh]).size === 2);
  ok('the dulled third state is gone', S.PAL.chargeHighDim === undefined);
}

// ---------------------------------------------------------------- 6. full gauge required
// _release now asks slingReady, not slingArmed: a PARTIAL gauge dumped inside the deep
// band is an ordinary boost. It used to slingshot, which made the white blink ("a press
// right now slingshots") a lie in the generous direction — the HUD said BOOST-grade and
// the sim handed out the 1.4x multipliers and a chain session anyway.
{
  // A press at a chosen charge level. rearm is held above zero so the charge integrator
  // cannot top the gauge up to CHARGE_MAX on the very tick under test (it drains by
  // CHARGE_DRAIN*dt instead, which keeps a "99%" case comfortably below full).
  const pressAt = (sim, charge) => {
    sim.charge = charge;
    sim.rearm = charge >= S.CHARGE_MAX ? 0 : 1;
    sim._clearBoost();
    return sim.step(1 / 60, press);
  };

  const deepRig = () => { const s = rig(); hold(s, 'deep', 0.5); return s; };
  const graceRig = () => {
    const s = rig(); hold(s, 'deep', 0.5); s.zoneOverride = 'shallow';
    for (let i = 0; i < 6; i++) s.step(1 / 32, idle);      // 0.1875 s < 0.25 s
    return s;
  };
  const shallowRig = () => { const s = rig(); hold(s, 'shallow', 3.0); return s; };

  let ev = pressAt(deepRig(), S.CHARGE_MAX);
  ok('100% + deep -> sling', ev.release && ev.release.sling === true, JSON.stringify(ev.release));

  const s99 = deepRig();
  ev = pressAt(s99, S.CHARGE_MAX * 0.99);
  ok('99% + deep -> NOT sling (the fix)',
    ev.release && ev.release.sling === false && ev.release.charge < 1,
    JSON.stringify(ev.release));
  ok('99% + deep starts NO chain session',
    s99._chainSession === null && s99.chain === 0,
    `session=${s99._chainSession} chain=${s99.chain}`);
  ok('99% + deep still boosts (legal, just worse)',
    s99.boost.active === true && s99.boost.sling === false
    && s99.boost.gain < S.VMAX * (S.BOOST.baseGain + S.BOOST.gainPerCharge2),
    `gain=${s99.boost.gain.toFixed(2)}`);

  const sFull = deepRig();
  pressAt(sFull, S.CHARGE_MAX);
  ok('100% + deep DOES start a chain session',
    sFull._chainSession !== null && sFull.boost.sling === true);

  ev = pressAt(graceRig(), S.CHARGE_MAX);
  ok('100% + inside grace -> sling', ev.release && ev.release.sling === true);

  ev = pressAt(graceRig(), S.CHARGE_MAX * 0.99);
  ok('99% + inside grace -> NOT sling', ev.release && ev.release.sling === false);

  ev = pressAt(shallowRig(), S.CHARGE_MAX);
  ok('100% + shallow only -> NOT sling', ev.release && ev.release.sling === false);

  // Just above minCharge the button still fires: this change removes the slingshot from a
  // partial release, not the release itself.
  const sMin = deepRig();
  ev = pressAt(sMin, S.BOOST.minCharge + 1);
  ok('a barely-legal deep release is an ordinary boost, not a no-op',
    ev.release && ev.release.sling === false && sMin.boost.active === true);
}

// ---------------------------------------------------------------- 7. the HUD word
// The dash banner has to say the same thing the sim did. Decoded from the glyph rects the
// 3x5 font actually paints, so it fails if the word or its condition drifts.
{
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const noop = () => {};
  const fills = [];
  const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'fillRect') return (x, y, w, h) => fills.push({ x, y, w, h });
      return key in target ? target[key] : noop;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const game = new Game(ctx);
  const wordWidth = (s) => s.length * 4 * 3 - 3;    // font.textWidth(s, 3)

  // The banner is the only px-3 text on the row at ROAD_Y0 + 8; measure its span and turn
  // that back into a character count.
  const banner = (sling) => {
    game.sim.boost = { active: true, t: 1, dur: 1, gain: 1, sling, pending: 0, ending: false };
    game.boostKick = 1; game.boostEnv = 1; game.t = 0;   // floor(0*12)%2===0 -> visible
    fills.length = 0;
    game._renderHud();
    const glyphs = fills.filter((f) => f.w === 3 && f.h === 3
      && f.y >= S.ROAD_Y0 + 8 && f.y < S.ROAD_Y0 + 8 + 15);
    if (!glyphs.length) return null;
    const min = Math.min(...glyphs.map((f) => f.x));
    const max = Math.max(...glyphs.map((f) => f.x + f.w));
    return max - min;
  };

  const wSling = banner(true), wBoost = banner(false);
  ok('a slingshot boost paints SLINGSHOT', wSling === wordWidth('SLINGSHOT'),
    `span=${wSling} want=${wordWidth('SLINGSHOT')}`);
  ok('an ordinary boost paints BOOST', wBoost === wordWidth('BOOST'),
    `span=${wBoost} want=${wordWidth('BOOST')}`);

  // End to end: the word follows the RELEASE, so a 99% deep release must read BOOST.
  const drive = (charge) => {
    const s = game.sim;
    s._resolveZone = function () { this.zoneDepth = 1; return 'deep'; };
    s.zone = 'deep'; s.slingGrace = S.BOOST.slingGrace;
    s.charge = charge; s.rearm = charge >= S.CHARGE_MAX ? 0 : 1;
    s._clearBoost();
    s.step(1 / 60, { steer: 0, throttle: 0, boost: true });
    game.boostKick = 1; game.boostEnv = 1; game.t = 0;
    fills.length = 0;
    game._renderHud();
    const glyphs = fills.filter((f) => f.w === 3 && f.h === 3
      && f.y >= S.ROAD_Y0 + 8 && f.y < S.ROAD_Y0 + 8 + 15);
    const min = Math.min(...glyphs.map((f) => f.x));
    const max = Math.max(...glyphs.map((f) => f.x + f.w));
    return max - min;
  };
  ok('a real 100% deep release reads SLINGSHOT',
    drive(S.CHARGE_MAX) === wordWidth('SLINGSHOT'));
  ok('a real 99% deep release reads BOOST',
    drive(S.CHARGE_MAX * 0.99) === wordWidth('BOOST'));
}

// ---------------------------------------------------------------- 8. no cue while boosting
// The lie this section exists for: a slingshot runs up to (baseDur + durPerCharge) * slingDur
// = 4.2 s, while the gauge is spendable again after rearm (0.6 s) + a bumper refill (~1.2 s).
// For the ~2.4 s in between, the bar blinked white and the ready ping fired while a press did
// literally NOTHING — _release returns early for the whole boost. There is deliberately no
// input buffer: the CUE is what moved, not the window.
{
  const s = rig();
  hold(s, 'deep', 2.0);
  s.charge = S.CHARGE_MAX; s.rearm = 0; s._clearBoost(); s._slingReadyWas = false;
  const rel = s.step(1 / 60, press);
  ok('rig: a full deep release slingshots', rel.release?.sling === true && s.boost.active);

  s.zoneOverride = 'deep';         // tuck straight back in and refill during the boost
  let tick = 0, edges = 0, edgeTicks = [], readyDuringBoost = 0;
  let refillTick = null, boostEndTick = null, pressedDuringBoostDidNothing = true;
  const releasesAtStart = s.stats.releases;
  while (tick < 600) {
    tick++;
    const boosting = s.boost.active;
    // Mash the button all the way through: it must remain a no-op until the boost is over.
    const ev = s.step(1 / 60, boosting ? press : idle);
    if (boosting && (ev.release || s.stats.releases !== releasesAtStart)) {
      pressedDuringBoostDidNothing = false;
    }
    if (boosting && refillTick === null && s.charge >= S.CHARGE_MAX) refillTick = tick;
    // Sampled AFTER the step and against the post-step flag: the boost is cleared at the
    // tail of the tick it expires on, and that tick is legitimately ready again.
    if (s.boost.active && s.slingReady) readyDuringBoost++;
    if (ev.slingReady) { edges++; edgeTicks.push(tick); }
    if (ev.boostEnd) { boostEndTick = tick; break; }
  }
  // Run a few ticks past the boost so the post-boost edge lands.
  for (let i = 0; i < 5 && edges === 0; i++) {
    tick++;
    if (s.step(1 / 60, idle).slingReady) { edges++; edgeTicks.push(tick); }
  }

  ok('the gauge refills to 100% while the boost is still running',
    refillTick !== null && boostEndTick !== null && refillTick < boostEndTick,
    `full@${refillTick} boostEnd@${boostEndTick}`);
  ok('charge full + deep + boosting is never slingReady',
    readyDuringBoost === 0, `readyTicks during boost = ${readyDuringBoost}`);
  ok('pressing during the boost still does nothing (unchanged)',
    pressedDuringBoostDidNothing && s.stats.releases === releasesAtStart);
  ok('ev.slingReady never rises during the boost',
    edgeTicks.every((t) => t > boostEndTick), `edges@${edgeTicks} boostEnd@${boostEndTick}`);
  ok('the ready cue rises exactly once, and only after the boost ends',
    edges === 1 && edgeTicks[0] === boostEndTick + 1,
    `edge@${edgeTicks[0]} boostEnd@${boostEndTick}`);
  // The measured size of the lie: the ping used to fire at `refillTick`.
  console.log(`        ready cue moved ${edgeTicks[0] - refillTick} ticks later `
    + `(${((edgeTicks[0] - refillTick) / 60).toFixed(2)} s): was tick ${refillTick} (refill), `
    + `now tick ${edgeTicks[0]} (boost end at ${boostEndTick})`);
  ok('the shifted cue is the whole ~2.4 s dead window, not a rounding tick',
    (edgeTicks[0] - refillTick) / 60 > 2.0, `${((edgeTicks[0] - refillTick) / 60).toFixed(2)} s`);
}

// The gauge must LOOK inert while boosting too: plain blue, no gold, no white blink.
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
  s._resolveZone = function () { this.zoneDepth = 1; return 'deep'; };
  s.charge = S.CHARGE_MAX; s.zone = 'deep'; s.slingGrace = S.BOOST.slingGrace;

  s.boost = { active: true, t: 2, dur: 4, gain: 40, sling: true, pending: 0, ending: false };
  const bA = bar(0).color, bB = bar(0.125).color;   // opposite blink phases (8 Hz)
  ok('100% + deep but boosting paints chargeLow, no gold and no white blink',
    bA === S.PAL.chargeLow && bB === S.PAL.chargeLow, `${bA}/${bB}`);

  s._clearBoost();
  const aA = bar(0).color, aB = bar(0.125).color;
  ok('...and the same state blinks white the moment the boost ends',
    (aA === '#ffffff') !== (aB === '#ffffff')
    && (aA === S.PAL.chargeHigh || aB === S.PAL.chargeHigh), `${aA}/${aB}`);
}

console.log(`\nsling-ready: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
