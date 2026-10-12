// Deliberately broken or trivial sims. They exist so the instruments can be
// shown to fail (and to pass) on known inputs; none of this is game code.

import { INPUT } from "../../src/sim/input.js";

const hash = (sim) => JSON.stringify(sim);

// Broken: uses Math.random, so two runs with the same seed diverge.
export const nondeterministic = {
  createSim: ({ seed }) => ({ seed, frame: 0, x: 0 }),
  stepSim: (sim, bits) => {
    sim.x += Math.random() + bits;
    sim.frame++;
  },
  hashState: hash,
};

// Broken: ignores the seed.
export const seedBlind = {
  createSim: () => ({ frame: 0, acc: 0 }),
  stepSim: (sim, bits) => {
    sim.acc = (sim.acc * 31 + bits + 1) >>> 0;
    sim.frame++;
  },
  hashState: hash,
};

// Broken: ignores the inputs.
export const inputBlind = {
  createSim: ({ seed }) => ({ seed, frame: 0 }),
  stepSim: (sim) => {
    sim.frame++;
  },
  hashState: hash,
};

const base = {
  getScore: (sim) => sim.score,
  isEnded: () => false,
  capabilities: { scoring: true },
  fps: 60,
};

// Degenerate: holding shot is the best possible play.
export const holdWins = {
  ...base,
  createSim: ({ seed }) => ({ seed, frame: 0, score: 0 }),
  stepSim: (sim, bits) => {
    if (bits & INPUT.SHOT) sim.score += 1;
    sim.frame++;
  },
};

// Healthy: shooting scores a little, shooting while moving toward a target
// side that keeps changing scores a lot.
export const skillWins = {
  ...base,
  createSim: ({ seed }) => ({ seed, frame: 0, score: 0, s: seed >>> 0 || 1, side: INPUT.DOWN }),
  stepSim: (sim, bits) => {
    if (sim.frame % 45 === 0) {
      sim.s = (Math.imul(sim.s, 1664525) + 1013904223) >>> 0;
      // Directions no monotonous baseline holds.
      sim.side = sim.s & 0x10000 ? INPUT.DOWN : INPUT.RIGHT;
    }
    if (bits & INPUT.SHOT) {
      if (sim.frame % 20 === 0) sim.score += 1;
      if (bits & sim.side) sim.score += 1;
    }
    sim.frame++;
  },
};

// Nothing a monotonous policy does scores; only up+left+shot does.
export const zeroBaseline = {
  ...base,
  createSim: ({ seed }) => ({ seed, frame: 0, score: 0 }),
  stepSim: (sim, bits) => {
    if ((bits & INPUT.SHOT) && (bits & INPUT.LEFT) && (bits & INPUT.UP)) sim.score += 1;
    sim.frame++;
  },
};
