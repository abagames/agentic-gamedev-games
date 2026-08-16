import assert from 'node:assert/strict';
import { ACTION_CODES, Game } from '../src/game.js';

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

function gameWithAudio() {
  const game = new Game(ctx);
  const visibility = [];
  game.sound = {
    unlock: noop, setMuted: noop, sfx: noop, jingle: noop, music: noop, stopAll: noop,
    setEngineRunning: noop, setEngine: noop, setDraft: noop,
    setPageVisible: (visible) => visibility.push(visible),
  };
  return { game, visibility };
}

function dirtyClocks(game) {
  game.t = 10; game.modeT = 3; game.sim.z = 444; game.sim.timer = 8;
  game.cpFlash = 1; game.releaseFlash = 1; game.chainFlash = 1;
  game.passReadouts = [{ life: 1 }]; game.chainEndReadout = { life: 1 };
  game.shake = 1; game.boostKick = 1; game.boostEnv = 1; game.boostOutFlash = 1;
  game.bgOffset = 5; game.scrub = [{ age: 0, puff: false }];
  game._scrubT = 0.1; game._puffT = 0.1; game.timeLowTick = 0.3;
  game.entry.cool = 0.1; game.ceremony = true; game.ceremonyT = 2;
  game.finishBonus = 20; game.finishTarget = 100;
}

function clockSnapshot(game) {
  return {
    t: game.t, modeT: game.modeT, z: game.sim.z, timer: game.sim.timer,
    cpFlash: game.cpFlash, releaseFlash: game.releaseFlash, chainFlash: game.chainFlash,
    passLife: game.passReadouts[0]?.life, chainLife: game.chainEndReadout?.life,
    shake: game.shake, boostKick: game.boostKick, boostEnv: game.boostEnv,
    boostOutFlash: game.boostOutFlash, bgOffset: game.bgOffset,
    scrubAge: game.scrub[0]?.age, scrubT: game._scrubT, puffT: game._puffT,
    timeLowTick: game.timeLowTick, entryCool: game.entry.cool,
    ceremonyT: game.ceremonyT, finishBonus: game.finishBonus,
  };
}

test('blur clears held input, freezes every game clock, and requires keyup then keydown', () => {
  const { game } = gameWithAudio();
  game.startRun(); game._enterRace(); dirtyClocks(game);
  game.onKeyDown('ArrowUp'); game.onKeyDown('KeyZ');
  game.setWindowFocused(false);
  const frozen = clockSnapshot(game);
  assert.equal(game.active, false);
  assert.deepEqual([...game.keys], []);
  assert.equal(game.boostEdge, false);
  assert.ok(game.blockedKeys.has('ArrowUp') && game.blockedKeys.has('KeyZ'));
  game.setWindowFocused(false);
  game.update(10);
  assert.deepEqual(clockSnapshot(game), frozen);
  game.setWindowFocused(true);
  game.onKeyDown('ArrowUp');
  assert.equal(game.keys.has('ArrowUp'), false);
  game.onKeyUp('ArrowUp'); game.onKeyDown('ArrowUp');
  assert.equal(game.keys.has('ArrowUp'), true);
});

test('hidden independently freezes state and preserves the audio visibility contract', () => {
  const { game, visibility } = gameWithAudio();
  game.startRun(); dirtyClocks(game);
  const frozen = clockSnapshot(game);
  game.setPageVisible(false);
  game.setPageVisible(false);
  game.update(4);
  assert.deepEqual(clockSnapshot(game), frozen);
  assert.deepEqual(visibility, [false, false]);
  game.setPageVisible(true);
  assert.equal(game.active, true);
  assert.deepEqual(visibility, [false, false, true]);
});

test('blur-hidden-focus-visible order resumes only after both conditions recover', () => {
  const { game } = gameWithAudio();
  game.setWindowFocused(false);
  game.setPageVisible(false);
  game.setWindowFocused(true);
  assert.equal(game.active, false);
  game.setPageVisible(true);
  assert.equal(game.active, true);
});

test('hidden-blur-visible-focus inverse order also waits for both conditions', () => {
  const { game } = gameWithAudio();
  game.setPageVisible(false);
  game.setWindowFocused(false);
  game.setPageVisible(true);
  assert.equal(game.active, false);
  game.setWindowFocused(true);
  assert.equal(game.active, true);
});

test('ENTRY state cannot move or submit while inactive and synthesizes no confirm', () => {
  const { game } = gameWithAudio();
  game.sim.score = 100000; game.hi = [{ name: 'ACE', score: 1 }];
  game._enterEntryOrAttract();
  game.entry.pos = 1;
  const before = structuredClone(game.entry);
  game.setWindowFocused(false);
  game.onKeyDown('ArrowRight'); game.onKeyDown('KeyZ'); game.update(1);
  game.setWindowFocused(true);
  game.onKeyDown('ArrowRight'); game.onKeyDown('KeyZ');
  assert.equal(game.mode, 'entry');
  assert.deepEqual(game.entry, before);
  game.onKeyUp('ArrowRight'); game.onKeyUp('KeyZ');
  game.onKeyDown('ArrowRight');
  assert.equal(game.entry.pos, 2);
});

test('a held confirm moved to the blocked set cannot submit after resume', () => {
  const { game } = gameWithAudio();
  game.sim.score = 100000; game.hi = [{ name: 'ACE', score: 1 }];
  game._enterEntryOrAttract(); game.entry.pos = 1;
  game.onKeyDown('KeyZ');
  assert.equal(game.entry.pos, 2);
  game.setWindowFocused(false); game.setWindowFocused(true);
  game.onKeyDown('KeyZ');
  assert.equal(game.mode, 'entry');
  game.onKeyUp('KeyZ'); game.onKeyDown('KeyZ');
  assert.equal(game.mode, 'attract');
});

test('every ACTION key requires keyup before focus re-arms its edge', () => {
  for (const code of ACTION_CODES) {
    const { game } = gameWithAudio();
    game.startRun(); game._enterRace();
    game.onKeyDown(code);
    assert.equal(game.boostEdge, true, code);
    game.setWindowFocused(false);
    assert.equal(game.boostEdge, false, code);
    assert.ok(game.blockedKeys.has(code), code);
    game.setWindowFocused(true);
    game.onKeyDown(code);
    assert.equal(game.boostEdge, false, `${code} re-armed without keyup`);
    game.onKeyUp(code); game.onKeyDown(code);
    assert.equal(game.boostEdge, true, `${code} did not re-arm`);
  }
});

test('PAUSED overlay is exposed only in READY and RACE', () => {
  const { game } = gameWithAudio();
  game.startRun(); game.setWindowFocused(false);
  assert.equal(game.pausedOverlayVisible, true);
  game.mode = 'race'; assert.equal(game.pausedOverlayVisible, true);
  for (const mode of ['entry', 'finish', 'gameover', 'attract']) {
    game.mode = mode;
    assert.equal(game.pausedOverlayVisible, false, mode);
  }
});

test('focus changes do not masquerade as page visibility audio changes', () => {
  const { game, visibility } = gameWithAudio();
  game.setWindowFocused(false); game.setWindowFocused(true);
  assert.deepEqual(visibility, []);
});

delete globalThis.localStorage;
console.log(`\n${passed} passed, 0 failed`);
