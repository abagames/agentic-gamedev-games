// The play statistics count what they say they count.

import test from "node:test";
import assert from "node:assert/strict";
import { createSim, stepSim, observe } from "../src/sim/sim.js";
import { INPUT } from "../src/sim/input.js";
import { createPlayStats, playStatsStep, playStatsSummary, countsText } from "../tools/lib/playstats.mjs";

test("playstats: input changes, holds and shot releases over a known input", () => {
  const sim = createSim({ seed: 5 });
  const stats = createPlayStats();
  // 30 frames left with shot, 30 still without, 60 right with shot.
  const inputs = [...Array(30).fill(INPUT.LEFT | INPUT.SHOT), ...Array(30).fill(0), ...Array(60).fill(INPUT.RIGHT | INPUT.SHOT)];
  for (const bits of inputs) {
    stepSim(sim, bits);
    playStatsStep(stats, sim, observe(sim));
  }
  const s = playStatsSummary(stats);
  assert.equal(s.seconds, 2);
  assert.equal(s["input changes/s"], 1);
  assert.equal(s["move changes/s"], 1);
  assert.equal(s["still, share"], 0.25);
  assert.equal(s["shot held, share"], 0.75);
  assert.equal(s["shot releases/min"], 30);
  assert.deepEqual(stats.holds, [30]);
  assert.equal(s.ended, 0);
});

test("playstats: a miss is counted once, under its cause, and counting stops at game over", () => {
  const sim = createSim({ seed: 5 });
  const stats = createPlayStats();
  sim.lives = 0;
  sim.stage.frozen = true;
  sim.ship.respawn = 0;
  sim.bullets = [{ id: 99999, x: sim.ship.x, y: sim.ship.y + 1, dir: Math.PI, speed: 0.2, age: 100 }];
  for (let i = 0; i < 60; i++) {
    stepSim(sim, 0);
    playStatsStep(stats, sim, observe(sim));
  }
  assert.equal(sim.phase, "gameover");
  assert.equal(stats.ended, true);
  assert.ok(stats.frames < 60);
  assert.match(countsText(stats.misses), /^bullet( of \w+)? 1$/);
});
