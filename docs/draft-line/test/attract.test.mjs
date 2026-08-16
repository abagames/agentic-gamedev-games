// Focused state and data-contract tests for the alternating attract panels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_CODES, ATTRACT_CONTROLS, ATTRACT_VIEW, Game } from '../src/game.js';

const noop = () => {};
const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
  get: (target, key) => (key in target ? target[key] : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
const silentSound = () => ({
  unlock: noop, setMuted: noop, sfx: noop, jingle: noop, music: noop, stopAll: noop,
  setEngineRunning: noop, setEngine: noop, setDraft: noop,
});

let stored = null;
globalThis.localStorage = {
  getItem: () => stored,
  setItem: (_key, value) => { stored = value; },
};

function game() {
  const result = new Game(ctx);
  result.sound = silentSound();
  return result;
}
function tap(result, code) {
  result.onKeyDown(code);
  result.onKeyUp(code);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS  ${name}`);
}

test('default ranking is a descending 50k/30k/25k goal ladder', () => {
  stored = null;
  const result = game();
  assert.deepEqual(result.hi, [
    { name: 'ACE', score: 50000 },
    { name: 'TOW', score: 30000 },
    { name: 'AIR', score: 25000 },
  ]);
});

test('saved rankings take priority and are not replaced by new defaults', () => {
  stored = JSON.stringify([{ name: 'OLD', score: 43210 }]);
  const result = game();
  assert.deepEqual(result.hi, [{ name: 'OLD', score: 43210 }]);
});

test('title and ranking phases alternate and return to title with fade separation', () => {
  stored = null;
  const result = game();
  result.modeT = 1;
  assert.deepEqual(result.attractPanel(), { phase: 'title', alpha: 1 });
  result.modeT = ATTRACT_VIEW.titleS;
  assert.deepEqual(result.attractPanel(), { phase: 'ranking', alpha: 0 });
  result.modeT = ATTRACT_VIEW.titleS + 1;
  assert.deepEqual(result.attractPanel(), { phase: 'ranking', alpha: 1 });
  result.modeT = ATTRACT_VIEW.titleS + ATTRACT_VIEW.rankingS;
  assert.deepEqual(result.attractPanel(), { phase: 'title', alpha: 0 });
});

test('confirm starts immediately from both attract phases', () => {
  stored = null;
  const title = game();
  title.modeT = 2;
  tap(title, 'Enter');
  assert.equal(title.mode, 'ready');

  const ranking = game();
  ranking.modeT = ATTRACT_VIEW.titleS + 2;
  tap(ranking, 'Space');
  assert.equal(ranking.mode, 'ready');
});

test('every ACTION alias starts from both attract phases exactly like Z', () => {
  for (const code of ACTION_CODES) {
    for (const modeT of [2, ATTRACT_VIEW.titleS + 2]) {
      const result = game();
      result.modeT = modeT;
      tap(result, code);
      assert.equal(result.mode, 'ready', `${code} at ${modeT}`);
    }
  }
});

test('every ACTION alias confirms GAMEOVER and FINISH exactly like Z', () => {
  for (const code of ACTION_CODES) {
    for (const ending of ['gameover', 'finish']) {
      const result = game();
      result.hi = Array.from({ length: 5 }, () => ({ name: 'ACE', score: 999999 }));
      result.sim.score = 0;
      result.mode = ending;
      result.modeT = ending === 'gameover' ? 2 : 15;
      tap(result, code);
      assert.equal(result.mode, 'attract', `${code} from ${ending}`);
    }
  }
});

test('a submitted name is the ranking data shown on the next attract loop', () => {
  stored = null;
  const result = game();
  result.hi = [{ name: 'ACE', score: 50000 }];
  result.sim.score = 123456;
  result._enterEntryOrAttract();
  result.entry.name = ['N', 'E', 'W'];
  result.entry.pos = 2;
  result._confirm();
  result.modeT = ATTRACT_VIEW.titleS + 1;
  assert.equal(result.attractPanel().phase, 'ranking');
  assert.deepEqual(result.attractRanking()[0], { rank: 1, name: 'NEW', score: 123456 });
});

test('title guidance names the actual accelerator and brake aliases', () => {
  stored = null;
  const result = game();
  assert.match(ATTRACT_CONTROLS[0], /UP\/W ACCEL/);
  assert.match(ATTRACT_CONTROLS[0], /DOWN\/S BRAKE/);
  assert.match(ATTRACT_CONTROLS.join(' '), /ACTION Z\/X\/J\/K\/SPACE/);
  const throttle = (keys) => { result.keys = new Set(keys); return result._playerInput().throttle; };
  assert.equal(throttle(['ArrowUp']), 1);
  assert.equal(throttle(['KeyW']), 1);
  assert.equal(throttle(['ArrowDown']), -1);
  assert.equal(throttle(['KeyS']), -1);
  assert.ok(ATTRACT_VIEW.titleS - 2 * ATTRACT_VIEW.fadeS >= 7.5,
    'title controls should remain fully readable for at least 7.5 seconds');
});

test('score tables use a score heading rather than a time heading', () => {
  const source = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.equal((source.match(/'BEST SCORES'/g) || []).length, 2);
  assert.doesNotMatch(source, /'BEST TIMES?'/);
});

test('initial and post-game attract entry both stop every audio source', () => {
  stored = null;
  const result = game();
  const calls = [];
  result.sound = {
    ...silentSound(),
    music: (name) => calls.push(['music', name]),
    stopAll: () => calls.push(['stopAll']),
  };
  result._enterAttract();
  assert.deepEqual(calls, [['stopAll']]);
  result._enterGameOver();
  calls.length = 0;
  result._enterAttract();
  assert.deepEqual(calls, [['stopAll']]);
});

console.log(`\n${passed} passed, 0 failed`);
