import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { Sound } from '../src/audio.js';
import { AUDIO_EVENTS } from '../src/spec.js';

const noop = () => {};
const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
  get: (target, key) => (key in target ? target[key] : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
globalThis.localStorage = { getItem: () => null, setItem: noop };

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}`); throw error; }
}

function loggedGame() {
  const game = new Game(ctx);
  const calls = [];
  game.sound = {
    sfx: (name) => calls.push(['sfx', name]),
    jingle: (name) => calls.push(['jingle', name]),
    music: (name) => calls.push(['music', name]),
    stopAll: () => calls.push(['stopAll']),
    unlock: noop, setMuted: noop, setPageVisible: noop,
    setEngineRunning: noop, setEngine: noop, setDraft: noop,
  };
  return { game, calls };
}

test('initial ATTRACT stays logically silent across visibility and re-arms on startRun', () => {
  const game = new Game(ctx);
  assert.equal(game.mode, 'attract');
  assert.equal(game.sound._engineOn, false);
  assert.equal(game.sound._musicName, null);
  assert.equal(game.sound._activeSources.size, 0);

  game.setPageVisible(false);
  game.setPageVisible(true);
  assert.equal(game.sound._engineOn, false);
  assert.equal(game.sound._musicName, null);
  assert.equal(game.sound._activeSources.size, 0);

  game.startRun();
  game.update(1 / 60);
  assert.equal(game.mode, 'ready');
  assert.equal(game.sound._engineOn, true);
  assert.equal(game.sound._musicName, null);
});

test('terminal arbitration emits only one game-over jingle from a crowded frame', () => {
  const { game, calls } = loggedGame();
  game.startRun(); game._enterRace(); calls.length = 0;
  game.sim.timer = 1;
  game.sim.step = () => ({
    bump: true, spin: true, timeout: true, gameover: true, chargeFull: true,
    release: { sling: true, charge: 1 }, boostEnd: true, overtake: 2,
    passes: [{ kind: 'traffic', points: 1, chain: 1 }],
    chainEnd: { chain: 1, bonus: 10, reason: 'natural', awarded: true },
    checkpoint: true,
  });
  game.sim.gameOver = true;
  game.update(1 / 60);
  const oneShots = calls.filter(([kind]) => kind === 'sfx' || kind === 'jingle');
  assert.deepEqual(oneShots, [['jingle', 'gameover']]);
  assert.equal(game.mode, 'gameover');
});

test('duplicate game-over entry in one run never replays the jingle', () => {
  const { game, calls } = loggedGame();
  game.startRun(); calls.length = 0;
  game._enterGameOver(); game._enterGameOver(); game._enterGameOver();
  assert.deepEqual(calls.filter(([kind]) => kind === 'jingle'), [['jingle', 'gameover']]);
});

test('direct and initials game-over routes enter the same silent ATTRACT contract', () => {
  for (const qualifies of [false, true]) {
    const { game, calls } = loggedGame();
    game.startRun(); game._enterRace(); calls.length = 0;
    game.sim.score = qualifies ? 100 : 0;
    game.hi = Array.from({ length: 5 }, (_, i) => ({
      name: 'ACE', score: (qualifies ? 5 : 500) - i,
    }));
    game._enterGameOver();
    assert.deepEqual(calls.filter(([kind]) => kind === 'jingle'), [['jingle', 'gameover']]);

    calls.length = 0;
    game._enterEntryOrAttract();
    if (qualifies) {
      assert.equal(game.mode, 'entry');
      game.entry.name = ['N', 'E', 'W'];
      game.entry.pos = 2;
      calls.length = 0;
      game._confirm();
    }
    assert.equal(game.mode, 'attract');
    assert.deepEqual(calls, [['stopAll']]);

    game.sim.step = () => ({ release: { sling: true, charge: 1 }, checkpoint: true });
    game.update(1 / 60);
    assert.deepEqual(calls, [['stopAll']], 'visual demo must not reopen any sound');
  }
});

test('nonterminal spin and low-time warning remain one-shot events', () => {
  const spin = loggedGame();
  spin.game.startRun(); spin.game._enterRace(); spin.calls.length = 0;
  spin.game.sim.step = () => ({ spin: true });
  spin.game.update(1 / 60);
  assert.equal(spin.calls.filter((call) => call.join(':') === 'sfx:spin').length, 1);

  const low = loggedGame();
  low.game.startRun(); low.game._enterRace(); low.calls.length = 0;
  low.game.sim.timer = 5; low.game.timeLowTick = 0;
  low.game.sim.step = () => ({});
  low.game.update(1 / 60);
  assert.equal(low.calls.filter((call) => call.join(':') === 'sfx:timeLow').length, 1);
  assert.equal(low.game.mode, 'race');
});

test('startRun clears every run-local transient before the first READY update', () => {
  const { game, calls } = loggedGame();
  game.keys.add('ArrowUp'); game.t = 77; game.muted = true;
  const kept = { ctx: game.ctx, renderer: game.renderer, sound: game.sound, hi: game.hi };
  Object.assign(game, {
    cpFlash: 1, checkpointAward: { stale: true }, releaseFlash: 1, chainFlash: 1,
    passReadouts: [{ life: 1 }], chainEndReadout: { life: 1 }, shake: 1,
    boostKick: 1, boostEnv: 1, boostOutFlash: 1, _boostPunch: 1, bgOffset: 99,
    scrub: [{ age: 0 }], _scrubT: 1, _puffT: 1, _puffN: 7, timeLowTick: 1,
    boostEdge: true, _gameOverJinglePlayed: true,
  });
  game.startRun();
  assert.equal(game.mode, 'ready');
  assert.equal(game.modeT, 0);
  assert.deepEqual({
    cpFlash: game.cpFlash, checkpointAward: game.checkpointAward,
    releaseFlash: game.releaseFlash, chainFlash: game.chainFlash,
    passReadouts: game.passReadouts, chainEndReadout: game.chainEndReadout,
    shake: game.shake, boostKick: game.boostKick, boostEnv: game.boostEnv,
    boostOutFlash: game.boostOutFlash, boostPunch: game._boostPunch,
    bgOffset: game.bgOffset, scrub: game.scrub, scrubT: game._scrubT,
    puffT: game._puffT, puffN: game._puffN, timeLowTick: game.timeLowTick,
    boostEdge: game.boostEdge, gameOverJinglePlayed: game._gameOverJinglePlayed,
  }, {
    cpFlash: 0, checkpointAward: null, releaseFlash: 0, chainFlash: 0,
    passReadouts: [], chainEndReadout: null, shake: 0, boostKick: 0, boostEnv: 0,
    boostOutFlash: 0, boostPunch: 0, bgOffset: 0, scrub: [], scrubT: 0,
    puffT: 0, puffN: 0, timeLowTick: 0, boostEdge: false, gameOverJinglePlayed: false,
  });
  assert.equal(game.t, 77);
  assert.equal(game.muted, true);
  assert.equal(game.keys.has('ArrowUp'), true);
  assert.equal(game.ctx, kept.ctx); assert.equal(game.renderer, kept.renderer);
  assert.equal(game.sound, kept.sound); assert.equal(game.hi, kept.hi);
  assert.equal(calls.filter(([kind]) => kind === 'stopAll').length, 1);
  game.render();
  assert.equal(game.passReadouts.length, 0);
  assert.equal(game.chainEndReadout, null);
});

test('consecutive startRun calls have the same postcondition and stop audio each time', () => {
  const { game, calls } = loggedGame();
  game.startRun();
  game.cpFlash = 1; game.scrub = [{ age: 0 }]; game.boostEdge = true;
  game.startRun();
  assert.equal(game.cpFlash, 0); assert.deepEqual(game.scrub, []);
  assert.equal(game.boostEdge, false);
  assert.equal(calls.filter(([kind]) => kind === 'stopAll').length, 2);
});

function windState(speed01, draft) {
  const trackedParam = () => ({
    target: NaN,
    setTargetAtTime(value) { this.target = value; },
  });
  const sound = new Sound();
  sound.ctx = { currentTime: 0 };
  sound.ready = true;
  sound._engineOn = true;
  sound._engine = { speed01, boosting: false };
  sound._draft = draft;
  sound.windGain = { gain: trackedParam() };
  sound.windBand = { frequency: trackedParam() };
  sound.boomGain = { gain: trackedParam() };
  sound.boomBand = { frequency: trackedParam() };
  sound._applyWind();
  return {
    rush: sound.windGain.gain.target,
    windCutoff: sound.windBand.frequency.target,
    boom: sound.boomGain.gain.target,
    boomCutoff: sound.boomBand.frequency.target,
  };
}

test('wind contract halves the bright rush and keeps the deep-draft boom contrast', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12,
    `expected ${expected}, got ${actual}`);
  const idle = windState(0, 0);
  near(idle.rush, 0.00625);
  near(idle.windCutoff, 5000);
  near(idle.boom, 0);

  const clean = windState(1, 0);
  near(clean.rush, 0.03375);
  near(clean.windCutoff, 5000);
  near(clean.boom, 0);

  const partialGate = Math.pow(0.5, 1.9);
  const partial = windState(1, 0.5);
  near(partial.rush, 0.03375 * partialGate);
  near(partial.windCutoff, 500 + 4500 * partialGate);
  near(partial.boom, 0.097 * Math.pow(0.5, 1.4));
  near(partial.boomCutoff, 130);
  assert.ok(partial.rush < clean.rush * 0.27, 'partial draft must strongly suppress the rush');

  const deep = windState(1, 1);
  near(deep.rush, 0);
  near(deep.windCutoff, 500);
  near(deep.boom, 0.097);
  near(deep.boomCutoff, 165);
});

function measure(program) {
  const steps = [];
  const param = { value: 0, cancelScheduledValues: noop, setValueAtTime: noop,
    linearRampToValueAtTime: noop, setTargetAtTime: noop };
  const receiver = {
    ctx: { currentTime: 0 }, _windTimer: null, _windBase: 0,
    windGain: { gain: param }, _applyWind: noop,
    _tone: (at, opts) => steps.push(at + opts.dur),
    _noise: (at, opts) => steps.push(at + opts.dur),
  };
  program.call(receiver, 0);
  if (receiver._windTimer) clearTimeout(receiver._windTimer);
  return { steps: steps.length, duration: Math.max(0, ...steps) };
}

function capture(program) {
  const voices = [];
  const receiver = {
    _tone: (at, opts) => voices.push({ primitive: 'tone', at, ...opts }),
    _noise: (at, opts) => voices.push({ primitive: 'noise', at, ...opts }),
  };
  program.call(receiver, 0);
  return voices;
}

test('overtake is a short non-musical engine body plus broad tyre/wind pass-by', () => {
  const sound = new Sound();
  const program = sound._SFX.overtake;
  const voices = capture(program);
  assert.equal(program.name, 'overtake');
  assert.deepEqual(measure(program), { steps: 4, duration: 0.48 });
  assert.equal(voices.length, 4);

  const noise = voices.find((voice) => voice.primitive === 'noise');
  const saws = voices.filter((voice) => voice.type === 'sawtooth');
  const body = voices.find((voice) => voice.type === 'triangle');
  assert.ok(noise && saws.length === 2 && body);
  assert.equal(noise.type, 'bandpass');
  assert.ok(noise.atk >= 0.010 && noise.gain >= 0.21 && noise.gain <= 0.23);
  assert.ok(noise.f0 >= 4000 && noise.f1 <= 900 && noise.q >= 0.7 && noise.q <= 0.8);
  assert.ok(saws.every((saw) => saw.f0 >= 320 && saw.f0 <= 345
    && saw.f1 >= 180 && saw.f1 <= 195 && saw.atk <= 0.010 && saw.gain >= 0.12));
  assert.ok(body.f0 >= 155 && body.f0 <= 175 && body.f1 >= 85 && body.f1 <= 100);
  assert.ok(body.atk <= 0.012 && body.gain >= 0.09 && body.f0 / body.f1 < 2);
  assert.equal(voices.some((voice) => voice.type === 'square'), false);
});

test('registry, gameplay producers and implemented programs form one closed census', () => {
  const sound = new Sound();
  assert.deepEqual(Object.keys(sound._SFX).sort(), [...AUDIO_EVENTS.sfx].sort());
  assert.deepEqual(Object.keys(sound._JINGLE).sort(), [...AUDIO_EVENTS.jingle].sort());

  const source = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  const produced = { sfx: new Set(), jingle: new Set() };
  // Count the abstract event at argument one whether the producer uses only the event
  // name or follows it with boundary options such as the overtake pan.
  for (const match of source.matchAll(/this\.sound\.(sfx|jingle)\('([^']+)'\s*(?:,|\))/g)) {
    produced[match[1]].add(match[2]);
  }
  assert.deepEqual([...produced.sfx].sort(), [...AUDIO_EVENTS.sfx].sort());
  assert.deepEqual([...produced.jingle].sort(), [...AUDIO_EVENTS.jingle].sort());
});

test('all sound programs stay inside the cabinet one-shot budget', () => {
  const sound = new Sound();
  for (const [name, program] of Object.entries(sound._SFX)) {
    const budget = measure(program);
    assert.ok(budget.duration <= 0.6 + 1e-9, `${name} SFX duration ${budget.duration}`);
    assert.ok(budget.steps <= 24, `${name} SFX steps ${budget.steps}`);
  }
  for (const [name, program] of Object.entries(sound._JINGLE)) {
    const budget = measure(program);
    assert.ok(budget.duration <= 2.0 + 1e-9, `${name} jingle duration ${budget.duration}`);
    assert.ok(budget.steps <= 24, `${name} jingle steps ${budget.steps}`);
  }
  assert.deepEqual(measure(sound._JINGLE.gameover), { steps: 7, duration: 1.98 });
});

delete globalThis.localStorage;
console.log(`\n${passed} passed, 0 failed`);
