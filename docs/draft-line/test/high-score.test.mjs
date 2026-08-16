import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

const noop = () => {};
const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
  get: (target, key) => (key in target ? target[key] : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
const defaults = [
  { name: 'ACE', score: 50000 },
  { name: 'TOW', score: 30000 },
  { name: 'AIR', score: 25000 },
];

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}`); throw error; }
}

function load(raw, { readThrows = false, writeThrows = false } = {}) {
  const writes = [];
  globalThis.localStorage = {
    getItem() { if (readThrows) throw new Error('read denied'); return raw; },
    setItem(key, value) {
      writes.push([key, value]);
      if (writeThrows) throw new Error('write denied');
    },
  };
  return { game: new Game(ctx), writes };
}

test('missing storage uses defaults without creating the key', () => {
  const { game, writes } = load(null);
  assert.deepEqual(game.hi, defaults);
  assert.equal(writes.length, 0);
});

for (const [name, raw] of [
  ['invalid JSON', '{no'], ['JSON null', 'null'], ['object schema', '{"name":"ACE","score":1}'],
  ['empty array', '[]'],
  ['all-invalid array', JSON.stringify([
    { name: 7, score: 10 }, { name: 'NUM', score: '10' }, { name: 'NEG', score: -1 },
    { name: 'FRA', score: 1.5 }, { name: 'BIG', score: 10_000_000 },
  ])],
]) {
  test(`${name} falls back and is canonicalized once`, () => {
    const { game, writes } = load(raw);
    assert.deepEqual(game.hi, defaults);
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0][1]), defaults);
  });
}

test('mixed arrays rescue only valid entries and normalize names', () => {
  const raw = JSON.stringify([
    { name: 'aé!', score: 200 },
    { name: 'xy', score: 200 },
    { name: '.-!', score: 300 },
    { name: 99, score: 999 },
    { name: 'STR', score: '500' },
    { name: 'NAN', score: null },
  ]);
  const { game, writes } = load(raw);
  assert.deepEqual(game.hi, [
    { name: '.-!', score: 300 },
    { name: 'A !', score: 200 },
    { name: 'XY ', score: 200 },
  ]);
  assert.equal(writes.length, 1);
});

test('scores require safe bounded integers and stable ties preserve storage order', () => {
  const raw = JSON.stringify([
    { name: 'ONE', score: 8 }, { name: 'TWO', score: 9 }, { name: 'THR', score: 9 },
    { name: 'FOU', score: 7 }, { name: 'FIV', score: 6 }, { name: 'SIX', score: 5 },
    { name: 'MAX', score: 9_999_999 }, { name: 'BAD', score: 10_000_000 },
  ]);
  const { game } = load(raw);
  assert.deepEqual(game.hi, [
    { name: 'MAX', score: 9_999_999 }, { name: 'TWO', score: 9 },
    { name: 'THR', score: 9 }, { name: 'ONE', score: 8 }, { name: 'FOU', score: 7 },
  ]);
});

test('an already-canonical legacy array is preserved without a write', () => {
  const old = [
    { name: 'ACE', score: 100 }, { name: 'ACE', score: 100 }, { name: '!.-', score: 0 },
  ];
  const { game, writes } = load(JSON.stringify(old));
  assert.deepEqual(game.hi, old);
  assert.equal(writes.length, 0);
  assert.equal(game.hiScore, 100);
  assert.ok(Number.isFinite(game.hiScore));
});

test('valid stored rankings remain authoritative over defaults without a write', () => {
  const stored = [
    { name: 'OLD', score: 91000 }, { name: 'TOP', score: 44000 },
    { name: 'LOW', score: 12000 },
  ];
  const { game, writes } = load(JSON.stringify(stored));
  assert.deepEqual(game.hi, stored);
  assert.equal(writes.length, 0);
});

test('read and write exceptions recover in memory without aborting startup', () => {
  const read = load(null, { readThrows: true });
  assert.deepEqual(read.game.hi, defaults);
  assert.equal(read.writes.length, 0);
  const write = load('[{"name":"ok","score":1}]', { writeThrows: true });
  assert.deepEqual(write.game.hi, [{ name: 'OK ', score: 1 }]);
  assert.equal(write.writes.length, 1);
});

test('a canonical write survives restart and is not written a second time', () => {
  let stored = '[{"name":"a?","score":7}]';
  let writes = 0;
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { writes++; stored = value; },
  };
  const first = new Game(ctx);
  const second = new Game(ctx);
  assert.deepEqual(first.hi, [{ name: 'A  ', score: 7 }]);
  assert.deepEqual(second.hi, first.hi);
  assert.equal(writes, 1);
});

test('recovered scores keep name-entry qualification finite and functional', () => {
  const { game } = load('[{"name":"ace","score":100}]');
  game.sim.score = 101;
  game._enterEntryOrAttract();
  assert.equal(game.mode, 'entry');
  assert.ok(Number.isFinite(game.hiScore));
  assert.deepEqual(game.entry, { name: ['A', 'A', 'A'], pos: 0, cool: 0 });
});

delete globalThis.localStorage;
console.log(`\n${passed} passed, 0 failed`);
