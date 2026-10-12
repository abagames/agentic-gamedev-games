// The search for a way out tells a closed ring of bullets from an open one.

import test from "node:test";
import assert from "node:assert/strict";
import { createSim, stepSim } from "../src/sim/sim.js";
import { wayOut } from "../tools/lib/dodge.mjs";

// The ship in an empty field with a ring of bullets closing on it.
function ringed(count, radius = 7) {
  const sim = createSim({ seed: 9 });
  sim.stage.frozen = true;
  sim.enemies = [];
  sim.ship.respawn = 0;
  for (let i = 0; i < 5; i++) stepSim(sim, 0);
  // (In the middle, so that no part of the ring is off the field.)
  sim.ship.x = 0;
  sim.ship.y = 0;
  sim.bullets = [];
  for (let i = 0; i < count; i++) {
    const a = (i * Math.PI * 2) / count;
    sim.bullets.push({ id: 90000 + i, x: sim.ship.x + Math.sin(a) * radius, y: sim.ship.y + Math.cos(a) * radius, dir: a + Math.PI, speed: 0.25, age: 100, owner: 0, from: "small", ox: 0, shape: 0, chain: [], depth: 0, r: 0, mirror: 1, fuse: -1 });
  }
  return sim;
}

test("dodge: a ring with gaps a ship can pass has a way out", () => {
  const sim = ringed(12);
  assert.equal(wayOut(sim, sim.frame + 90), true);
});

test("dodge: a ring too tight to pass has none", () => {
  // 80 bullets at radius 7: 0.55 apart, and the ship is 0.9 across.
  const sim = ringed(80);
  assert.equal(wayOut(sim, sim.frame + 90), false);
});

test("dodge: the game's own hit test does not let a ship step through that ring", () => {
  // It once did: it tested only the stretch each bullet covered, and a ship
  // flying into a bullet stepped over it (fixed 2026-10-12, bullets.js).
  const sim = ringed(80);
  assert.equal(wayOut(sim, sim.frame + 90, { strict: false }), false);
});

test("dodge: with nothing coming, staying alive is a way out", () => {
  const sim = ringed(0);
  assert.equal(wayOut(sim, sim.frame + 60), true);
});
