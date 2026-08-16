// Focused state-machine tests for editable high-score initials.
import assert from 'node:assert/strict';
import { ACTION_CODES, Game } from '../src/game.js';

const noop = () => {};
const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
  get: (target, key) => (key in target ? target[key] : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});

let saved = [];
globalThis.localStorage = {
  getItem: () => null,
  setItem: (key, value) => saved.push([key, value]),
};

function entryGame(score = 123456) {
  saved = [];
  const game = new Game(ctx);
  game.sound = {
    unlock: noop, setMuted: noop, sfx: noop, jingle: noop, music: noop, stopAll: noop,
    setEngineRunning: noop, setEngine: noop, setDraft: noop,
  };
  game.sim.score = score;
  game.hi = [{ name: 'ACE', score: 100000 }];
  game._enterEntryOrAttract();
  assert.equal(game.mode, 'entry', 'qualifying score should reach initials entry');
  return game;
}

function tap(game, code) {
  game.onKeyDown(code);
  game.onKeyUp(code);
}

function edit(game, code) {
  game.onKeyDown(code);
  game.update(1 / 60);
  game.onKeyUp(code);
  game.entry.cool = 0;
}

function submit(game, name = 'NEW') {
  game.entry.name = [...name];
  game.entry.pos = 2;
  tap(game, 'Enter');
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    throw error;
  }
}

test('left/right aliases move the cursor and clamp at both boundaries', () => {
  const game = entryGame();
  tap(game, 'ArrowLeft');
  tap(game, 'KeyA');
  assert.equal(game.entry.pos, 0);
  tap(game, 'ArrowRight');
  assert.equal(game.entry.pos, 1);
  tap(game, 'KeyD');
  tap(game, 'ArrowRight');
  assert.equal(game.entry.pos, 2);
});

test('character selection edits only the active position through both aliases', () => {
  const game = entryGame();
  tap(game, 'ArrowRight');
  edit(game, 'ArrowUp');
  assert.deepEqual(game.entry.name, ['A', 'B', 'A']);
  edit(game, 'KeyS');
  assert.deepEqual(game.entry.name, ['A', 'A', 'A']);
  edit(game, 'KeyW');
  assert.deepEqual(game.entry.name, ['A', 'B', 'A']);
  edit(game, 'ArrowDown');
  assert.deepEqual(game.entry.name, ['A', 'A', 'A']);
});

test('confirm aliases commit one slot at a time, and only rightmost confirm submits', () => {
  const game = entryGame();
  tap(game, 'Enter');
  assert.equal(game.mode, 'entry');
  assert.equal(game.entry.pos, 1);
  tap(game, 'KeyZ');
  assert.equal(game.mode, 'entry');
  assert.equal(game.entry.pos, 2);
  assert.equal(saved.length, 0);
  tap(game, 'Space');
  assert.equal(game.mode, 'attract');
  assert.equal(saved.length, 1);
});

test('every ACTION alias confirms ENTRY and J/K never edit a character', () => {
  for (const code of ACTION_CODES) {
    const game = entryGame();
    const before = game.entry.name.join('');
    tap(game, code);
    assert.equal(game.entry.pos, 1, code);
    assert.equal(game.entry.name.join(''), before, `${code} edited initials`);
  }
});

test('confirm held on the middle slot reaches the right edge but cannot submit', () => {
  const game = entryGame();
  tap(game, 'Enter');
  game.onKeyDown('KeyZ');
  game.onKeyDown('KeyZ');
  assert.equal(game.mode, 'entry');
  assert.equal(game.entry.pos, 2);
  assert.equal(saved.length, 0);
  game.onKeyUp('KeyZ');
  game.onKeyDown('KeyZ');
  assert.equal(game.mode, 'attract');
  assert.equal(saved.length, 1);
});

test('an earlier character can be corrected, revisited, and submitted at the rightmost slot', () => {
  const game = entryGame(234567);
  tap(game, 'KeyD');
  edit(game, 'ArrowUp');                    // ABA
  tap(game, 'ArrowRight');
  edit(game, 'KeyW');                       // ABB
  tap(game, 'KeyA');
  tap(game, 'ArrowLeft');
  edit(game, 'ArrowUp');                    // BBB
  tap(game, 'KeyD');
  tap(game, 'ArrowRight');
  tap(game, 'Space');

  assert.equal(game.mode, 'attract');
  assert.deepEqual(game.hi[0], { name: 'BBB', score: 234567 });
  assert.equal(saved.length, 1);
  assert.equal(JSON.parse(saved[0][1])[0].name, 'BBB');
});

test('confirm is edge-triggered while held', () => {
  const game = entryGame(345678);
  tap(game, 'ArrowRight');
  tap(game, 'ArrowRight');
  game.onKeyDown('KeyZ');
  game.onKeyDown('KeyZ');
  assert.equal(game.mode, 'attract');
  assert.equal(saved.length, 1);
  game.onKeyUp('KeyZ');
});

test('default ties keep ACE/TOW/AIR ahead while one point more passes each rank', () => {
  for (const [name, boundary, expectedRank] of [
    ['ACE', 50000, 0], ['TOW', 30000, 1], ['AIR', 25000, 2],
  ]) {
    const tied = entryGame(boundary);
    tied.hi = [
      { name: 'ACE', score: 50000 },
      { name: 'TOW', score: 30000 },
      { name: 'AIR', score: 25000 },
    ];
    tied._enterEntryOrAttract();
    submit(tied);
    assert.equal(tied.hi.findIndex((entry) => entry.name === name), expectedRank);
    assert.ok(tied.hi.findIndex((entry) => entry.name === 'NEW') > expectedRank);

    const ahead = entryGame(boundary + 1);
    ahead.hi = [
      { name: 'ACE', score: 50000 },
      { name: 'TOW', score: 30000 },
      { name: 'AIR', score: 25000 },
    ];
    ahead._enterEntryOrAttract();
    submit(ahead);
    assert.equal(ahead.hi.findIndex((entry) => entry.name === 'NEW'), expectedRank);
  }
});

test('full-table qualification remains strict at each default-score boundary', () => {
  for (const [boundary, table, expectedRank] of [
    [50000, [
      { name: 'ACE', score: 50000 }, { name: 'A02', score: 50000 },
      { name: 'A03', score: 50000 }, { name: 'A04', score: 50000 },
      { name: 'A05', score: 50000 },
    ], 0],
    [30000, [
      { name: 'ACE', score: 50000 }, { name: 'TOW', score: 30000 },
      { name: 'T03', score: 30000 }, { name: 'T04', score: 30000 },
      { name: 'T05', score: 30000 },
    ], 1],
    [25000, [
      { name: 'ACE', score: 50000 }, { name: 'TOW', score: 30000 },
      { name: 'A03', score: 26000 }, { name: 'A04', score: 26000 },
      { name: 'AIR', score: 25000 },
    ], 4],
  ]) {
    const tied = entryGame(boundary);
    tied.hi = table.map((entry) => ({ ...entry }));
    tied._enterEntryOrAttract();
    assert.equal(tied.mode, 'attract');

    const ahead = entryGame(boundary + 1);
    ahead.hi = table.map((entry) => ({ ...entry }));
    ahead._enterEntryOrAttract();
    assert.equal(ahead.mode, 'entry');
    submit(ahead);
    assert.equal(ahead.hi.findIndex((entry) => entry.name === 'NEW'), expectedRank);
  }
});

test('the initial three-entry table accepts exactly the first two below-table entries', () => {
  const game = entryGame(2);
  game.hi = [
    { name: 'ACE', score: 50000 },
    { name: 'TOW', score: 30000 },
    { name: 'AIR', score: 25000 },
  ];
  game._enterEntryOrAttract();
  assert.equal(game.mode, 'entry');
  submit(game, 'ONE');

  game.sim.score = 1;
  game._enterEntryOrAttract();
  assert.equal(game.mode, 'entry');
  submit(game, 'TWO');
  assert.equal(game.hi.length, 5);

  game.sim.score = 0;
  game._enterEntryOrAttract();
  assert.equal(game.mode, 'attract');
  assert.equal(game.hi.length, 5);
});

console.log(`\n${passed} passed, 0 failed`);
