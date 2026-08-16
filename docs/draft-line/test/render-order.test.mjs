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

console.log(`\n${passed} passed, 0 failed`);
