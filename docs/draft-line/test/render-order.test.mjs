// Pure painter-order contract for world-space props and opponent cars.
import assert from 'node:assert/strict';
import { sortWorldSprites } from '../src/render.js';

const labels = (items) => sortWorldSprites(items).map((item) => item.label);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  PASS  ${name}`); };

test('a far car paints before a nearer building', () => {
  assert.deepEqual(labels([
    { label: 'building', category: 'prop', kind: 'BUILDING', z: 100, x: 2 },
    { label: 'car', category: 'car', kind: 'rival', z: 140, x: 0 },
  ]), ['car', 'building']);
});

test('a far building paints before a nearer car', () => {
  assert.deepEqual(labels([
    { label: 'building', category: 'prop', kind: 'BUILDING', z: 140, x: 2 },
    { label: 'car', category: 'car', kind: 'rival', z: 100, x: 0 },
  ]), ['building', 'car']);
});

test('coincident and sub-centimetre depths have deterministic stable precedence', () => {
  const items = [
    { label: 'right tree', category: 'prop', kind: 'TREE', z: 100.004, x: 2 },
    { label: 'left building', category: 'prop', kind: 'BUILDING', z: 100.003, x: -2 },
    { label: 'traffic', category: 'car', kind: 'traffic', z: 100.002, x: 0.2 },
    { label: 'rival', category: 'car', kind: 'rival', z: 100.001, x: 0 },
  ];
  const expected = ['left building', 'right tree', 'traffic', 'rival'];
  assert.deepEqual(labels(items), expected);
  assert.deepEqual(labels([...items].reverse()), expected);
});

// The checkpoint gate is a world sprite, not a pre-pass layer: props and cars BEYOND it
// must already be on the canvas before its CHECK/FINISH board is painted.
test('props and cars beyond the gate paint before the gate', () => {
  assert.deepEqual(labels([
    { label: 'gate', category: 'gate', kind: 'gate', z: 1720, x: 0 },
    { label: 'pylon', category: 'prop', kind: 'PYLON', z: 1975, x: -3 },
    { label: 'far tree', category: 'prop', kind: 'TREE', z: 1890, x: 2 },
    { label: 'near-ish tree', category: 'prop', kind: 'TREE', z: 1743, x: 2 },
    { label: 'far rival', category: 'car', kind: 'rival', z: 1800, x: 0 },
    { label: 'far traffic', category: 'car', kind: 'traffic', z: 1760, x: 1 },
  ]), ['pylon', 'far tree', 'far rival', 'far traffic', 'near-ish tree', 'gate']);
});

test('props and cars in front of the gate paint after the gate', () => {
  assert.deepEqual(labels([
    { label: 'near tree', category: 'prop', kind: 'TREE', z: 1700, x: 2 },
    { label: 'gate', category: 'gate', kind: 'gate', z: 1720, x: 0 },
    { label: 'near rival', category: 'car', kind: 'rival', z: 1690, x: 0 },
  ]), ['gate', 'near tree', 'near rival']);
});

test('a FINISH gate sorts exactly like a CHECK gate', () => {
  assert.deepEqual(labels([
    { label: 'far tree', category: 'prop', kind: 'TREE', z: 1890, x: 2 },
    { label: 'finish gate', category: 'gate', kind: 'gate', isFinish: true, z: 1720, x: 0 },
    { label: 'near tree', category: 'prop', kind: 'TREE', z: 1700, x: 2 },
  ]), ['far tree', 'finish gate', 'near tree']);
});

test('at a coincident depth the gate paints first, and order is stable', () => {
  const items = [
    { label: 'tree', category: 'prop', kind: 'TREE', z: 1720, x: 2 },
    { label: 'gate', category: 'gate', kind: 'gate', z: 1720, x: 0 },
    { label: 'rival', category: 'car', kind: 'rival', z: 1720, x: 0 },
  ];
  const expected = ['gate', 'tree', 'rival'];
  assert.deepEqual(labels(items), expected);
  assert.deepEqual(labels([...items].reverse()), expected);
});

// The player is drawn after the whole queue, so it is in front of the gate whether the
// gate is still ahead of it or already behind it. This pins the queue's own contract:
// nothing the gate does can put it into the player's layer.
test('the gate never joins the player layer', () => {
  const near = labels([
    { label: 'gate', category: 'gate', kind: 'gate', z: 10, x: 0 },
    { label: 'traffic', category: 'car', kind: 'traffic', z: 5, x: 0 },
  ]);
  assert.deepEqual(near, ['gate', 'traffic']);
  const passedGate = labels([
    { label: 'gate', category: 'gate', kind: 'gate', z: -5, x: 0 },
    { label: 'traffic', category: 'car', kind: 'traffic', z: 5, x: 0 },
  ]);
  assert.deepEqual(passedGate, ['traffic', 'gate']);
});

console.log(`\n${passed} passed, 0 failed`);
