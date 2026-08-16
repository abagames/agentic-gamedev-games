import assert from 'node:assert/strict';
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';
import { Game } from '../src/game.js';
import { Sound } from '../src/audio.js';

const noop = () => {};
const course = () => ({
  traffic: [], totalLength: 999999,
  checkpoints: Array.from({ length: S.TOTAL_LEGS }, (_, i) => ({ leg: i + 1, z: (i + 1) * 1000 })),
  curveAt: () => 0, elevationAt: () => 0,
  segmentAt: (z) => ({ index: Math.floor(z / S.SEG_LEN), z, curve: 0, y: 0 }),
});
const events = () => ({
  bump: false, spin: false, release: null, chargeFull: false, overtake: 0,
  checkpoint: false, finish: false, timeout: false, gameover: false,
  boostEnd: false, passes: [], chainEnd: null,
});
const fresh = () => { const sim = new Sim(course(), 1); sim.score = 0; return sim; };
const target = (sim, kind, id, x, { overtaken = false, crossed = true } = {}) => ({
  passId: id, z: sim.z + (crossed ? -1 : 1), x, speed: 0, overtaken,
  _passPrevRelZ: 1,
  ...(kind === 'rival' ? { targetX: x, baseSpeed: 0, brakeTimer: 999, lamp: 0, braking: 0 } : {}),
});
const scan = (sim, rivals, traffic, collided = new Set()) => {
  sim.rivals = rivals; sim.traffic = traffic;
  const ev = events(); sim._overtakes(ev, collided); return ev;
};

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}`); throw error; }
}

test('left, right and centre preserve the relativeDx sign convention', () => {
  for (const [x, sign] of [[-0.23, -1], [0.23, 1], [0, 0]]) {
    const sim = fresh();
    const ev = scan(sim, [target(sim, 'rival', `r:${x}`, x)], []);
    assert.equal(ev.overtake, 1);
    assert.equal(Math.sign(ev.overtakePan), sign);
    assert.equal(ev.overtakePan, S.overtakePan(x));
  }
});

test('the closest lateral crossing wins across every same-tick rival and traffic pass', () => {
  const sim = fresh(); sim.x = 0.1;
  const ev = scan(sim, [
    target(sim, 'rival', 'r:far', 0.72),
    target(sim, 'rival', 'r:mid', 0.36),
  ], [target(sim, 'traffic', 't:close', 0.02)]);
  assert.equal(ev.overtake, 3);
  assert.equal(ev.overtakePan, S.overtakePan(-0.08));
});

test('an exact lateral tie keeps deterministic traversal-first order', () => {
  const sim = fresh();
  const ev = scan(sim, [
    target(sim, 'rival', 'r:first', 0.2),
    target(sim, 'rival', 'r:second', -0.2),
  ], [target(sim, 'traffic', 't:third', -0.2)]);
  assert.equal(ev.overtake, 3);
  assert.equal(ev.overtakePan, S.overtakePan(0.2));
});

test('a collided closer car is excluded before representative selection', () => {
  const sim = fresh();
  const hit = target(sim, 'rival', 'r:hit', 0.05);
  const clean = target(sim, 'traffic', 't:clean', -0.4);
  const ev = scan(sim, [hit], [clean], new Set([hit.passId]));
  assert.equal(ev.overtake, 1);
  assert.equal(ev.overtakePan, S.overtakePan(-0.4));
  assert.equal(hit.overtaken, true);
});

test('ordinary, normal-boost and slingshot overtakes all emit position independently of chain score', () => {
  const cases = [
    { boost: null, scored: false },
    { boost: { active: true, t: 1, dur: 1, gain: 0.2, sling: false, pending: 0, ending: false }, scored: false },
    { boost: { active: true, t: 1, dur: 1, gain: 0.2, sling: true, pending: 0, ending: false }, scored: true },
  ];
  for (const [i, mode] of cases.entries()) {
    const sim = fresh();
    if (mode.boost) sim.boost = mode.boost;
    if (mode.scored) sim._startChainSession();
    const ev = scan(sim, [target(sim, 'rival', `r:mode-${i}`, -0.3)], []);
    assert.equal(ev.overtake, 1);
    assert.equal(ev.overtakePan, S.overtakePan(-0.3));
    assert.equal(ev.passes.length > 0, mode.scored);
  }
});

test('already-overtaken duplicates cannot become the representative', () => {
  const sim = fresh();
  const duplicate = target(sim, 'rival', 'r:old', 0.01, { overtaken: true });
  const valid = target(sim, 'traffic', 't:new', 0.42);
  const ev = scan(sim, [duplicate], [valid]);
  assert.equal(ev.overtake, 1);
  assert.equal(ev.overtakePan, S.overtakePan(0.42));
});

test('a tick with no crossing keeps the count at zero and publishes no pan field', () => {
  const sim = fresh();
  const ev = scan(sim, [target(sim, 'rival', 'r:ahead', -0.2, { crossed: false })], []);
  assert.equal(ev.overtake, 0);
  assert.equal(Object.hasOwn(ev, 'overtakePan'), false);
});

function gameHarness() {
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; },
  });
  const game = new Game(ctx); const calls = [];
  game.sound = {
    sfx: (name, options) => calls.push({ name, options }), jingle: noop, music: noop,
    stopAll: noop, unlock: noop, setMuted: noop, setPageVisible: noop,
    setEngineRunning: noop, setEngine: noop, setDraft: noop,
  };
  return { game, calls };
}

test('no pass makes no sound and multiple same-tick passes still make exactly one panned call', () => {
  const { game, calls } = gameHarness();
  game._reactTo({ overtake: 0, overtakePan: 0.4 });
  assert.equal(calls.length, 0);
  game._reactTo({ overtake: 3, overtakePan: -0.4, passes: [] });
  assert.deepEqual(calls, [{ name: 'overtake', options: { pan: -0.4 } }]);
});

function soundHarness(createStereoPanner) {
  const sound = new Sound();
  const bus = { name: 'sfx-bus' }; const voices = []; const panners = []; const filters = [];
  const duckParam = () => ({
    value: 1, events: [],
    cancelScheduledValues(at) { this.events.push(['cancel', at]); },
    setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); },
    linearRampToValueAtTime(value, at) { this.value = value; this.events.push(['linear', value, at]); },
  });
  sound.ready = true; sound.busSfx = bus;
  sound.duckEngine = { gain: duckParam() };
  sound.duckWind = { gain: duckParam() };
  sound.ctx = {
    currentTime: 2,
    createBiquadFilter: () => {
      const filter = {
        type: '',
        frequency: {
          value: 0,
          setValueAtTime(value, at) { this.value = value; this.startAt = at; },
          exponentialRampToValueAtTime(value, at) { this.endValue = value; this.endAt = at; },
        },
        Q: { value: 0, setValueAtTime(value, at) { this.value = value; this.at = at; } },
        connect(dest) { this.connected = dest; },
      };
      filters.push(filter); return filter;
    },
  };
  if (createStereoPanner) {
    sound.ctx.createStereoPanner = () => {
      const panner = {
        pan: { value: 99, setValueAtTime(value, at) { this.value = value; this.at = at; } },
        connect(dest) { this.connected = dest; },
      };
      panners.push(panner); return panner;
    };
  }
  sound._tone = (at, options) => voices.push({ primitive: 'tone', at, ...options });
  sound._noise = (at, options) => voices.push({ primitive: 'noise', at, ...options });
  return { sound, bus, voices, panners, filters };
}

test('the public pan option clamps to [-1,1] and invalid values fall back to centre', () => {
  const h = soundHarness(true);
  for (const [input, expected] of [[9, 1], [-9, -1], [NaN, 0], [Infinity, 0], [-Infinity, 0], [undefined, 0]]) {
    h.sound.sfx('overtake', { pan: input });
    assert.equal(h.panners.at(-1).pan.value, expected);
  }
});

test('missing createStereoPanner is a non-throwing centred mono fallback', () => {
  const h = soundHarness(false);
  assert.doesNotThrow(() => h.sound.sfx('overtake', { pan: 0.6 }));
  assert.equal(h.voices.length, 4);
  assert.equal(h.filters.length, 1);
  assert.equal(h.filters[0].connected, h.bus);
  assert.equal(h.voices.find((voice) => voice.primitive === 'noise').dest, h.bus);
  assert.ok(h.voices.filter((voice) => voice.primitive === 'tone')
    .every((voice) => voice.dest === h.filters[0]));
});

test('all overtake layers converge through one shared StereoPannerNode', () => {
  const h = soundHarness(true);
  h.sound.sfx('overtake', { pan: 0.6 });
  assert.equal(h.panners.length, 1);
  assert.equal(h.panners[0].connected, h.bus);
  assert.equal(h.panners[0].pan.value, 0.6);
  assert.equal(h.voices.length, 4);
  assert.equal(h.filters.length, 1);
  assert.equal(h.filters[0].type, 'lowpass');
  assert.equal(h.filters[0].frequency.value, 2600);
  assert.equal(h.filters[0].frequency.endValue, 1100);
  assert.equal(h.filters[0].Q.value, 1.2);
  assert.equal(h.filters[0].connected, h.panners[0]);
  assert.equal(h.voices.find((voice) => voice.primitive === 'noise').dest, h.panners[0]);
  assert.ok(h.voices.filter((voice) => voice.primitive === 'tone')
    .every((voice) => voice.dest === h.filters[0]));
});

test('overtake briefly ducks only the persistent engine and wind beds', () => {
  const h = soundHarness(true);
  h.sound.sfx('overtake', { pan: 0 });
  const engine = h.sound.duckEngine.gain.events;
  const wind = h.sound.duckWind.gain.events;
  assert.ok(engine.some(([kind, value]) => kind === 'linear' && value === 0.55));
  assert.ok(wind.some(([kind, value]) => kind === 'linear' && value === 0.40));
  assert.deepEqual(engine.at(-1), ['linear', 1, 2.401]);
  assert.deepEqual(wind.at(-1), ['linear', 1, 2.401]);
});

test('pan options leave every other SFX centred and program-equivalent', () => {
  const h = soundHarness(true);
  h.sound.sfx('bump');
  const baseline = structuredClone(h.voices);
  h.voices.length = 0;
  h.sound.sfx('bump', { pan: 0.9 });
  assert.deepEqual(h.voices, baseline);
  assert.equal(h.panners.length, 0);
  assert.ok(h.voices.every((voice) => voice.dest === undefined));
});

delete globalThis.localStorage;
console.log(`\n${passed} passed, 0 failed`);
