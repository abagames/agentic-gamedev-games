// The policy fitted to the author's play: the same run for the same seed, a
// person's rate of input, and the two things it was built to have and a
// reacting policy does not.

import test from "node:test";
import assert from "node:assert/strict";
import { createSim, stepSim, observe } from "../src/sim/sim.js";
import { author, authorWith } from "../tools/policies/author.mjs";
import { createPlayStats, playStatsStep, playStatsSummary } from "../tools/lib/playstats.mjs";

function play(policy, { seed = 3101, variant = 0, mode = "normal", frames = 3600 } = {}) {
  const sim = createSim({ seed, mode });
  const decide = policy.create({ seed, variant });
  const stats = createPlayStats();
  const inputs = [];
  for (let t = 0; t < frames; t++) {
    const bits = decide(observe(sim), t);
    inputs.push(bits);
    stepSim(sim, bits);
    if (sim.lives < 2) sim.lives = 2;
    playStatsStep(stats, sim, observe(sim));
  }
  return { stats, summary: playStatsSummary(stats), inputs };
}

test("author: the same seed and variant give the same inputs; another variant does not", () => {
  const a = play(author, { frames: 1200 });
  const b = play(author, { frames: 1200 });
  const c = play(author, { frames: 1200, variant: 1 });
  assert.deepEqual(a.inputs, b.inputs);
  assert.notDeepEqual(a.inputs, c.inputs);
});

test("author: it changes its input no faster than the author does", () => {
  // The author: 5.3 to 7.3 changes a second over three runs (replays/).
  for (const mode of ["normal", "rapid", "dense"]) {
    const { summary } = play(author, { mode });
    assert.ok(summary["input changes/s"] > 3 && summary["input changes/s"] < 8, `${mode}: ${summary["input changes/s"]}`);
    assert.ok(summary["kills/min"] > 60, `${mode}: ${summary["kills/min"]} kills/min`);
  }
});

test("author: knowing when a seed goes off is what keeps it from sudden hits", () => {
  // Three minutes in each of three runs. With the beat of the seeds known,
  // next to no miss is to a bullet in its first quarter second; without it
  // (reacting only), such misses are the usual kind.
  const sudden = (policy) => [3101, 3102, 3103].reduce((n, seed) => n + play(policy, { seed, frames: 10800 }).stats.sudden, 0);
  const knowing = sudden(author);
  const reacting = sudden(authorWith({ common: { foresee: 0 } }));
  assert.ok(reacting >= 6 && knowing * 3 <= reacting, `knowing: ${knowing}, reacting: ${reacting}`);
});
