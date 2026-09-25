// Policy comparison: node tests/balance.sim.mjs [runs] [maxSeconds]
// Bots read true hunter positions (stronger information than a human has).
import { createGame, step, CFG, TAU, makeRng, sweepOmega, isFinished } from "../game-core.js";
import { makePilot, shotWouldHit, landingSafe, HUMAN } from "../demo-bot.js";

const DT = 1 / 120;
const runs = Number(process.argv[2] ?? 30);
const maxT = Number(process.argv[3] ?? 240);


function nearest(g) {
  let best = Infinity;
  for (const h of g.hunters) best = Math.min(best, Math.hypot(h.x - g.px, h.y - g.py));
  return best;
}

const policies = {
  idle: () => () => false,
  spam: () => () => true,
  random2hz: (rng) => () => rng() < 2 * DT,
  pingpong: () => {
    let next = 1.5;
    return (g) => {
      if (g.t >= next) {
        next = g.t + Math.PI / sweepOmega(g);
        return true;
      }
      return false;
    };
  },
  // Fires whenever the beam line covers a hunter; never escapes, ignores landing safety.
  greedy: () => (g) => g.phase === "play" && shotWouldHit(g, g.hunters),
  // Frame-perfect fire when the shot would hit + escape when a hunter is close.
  greedyEscape: () => (g) =>
    g.phase === "play" &&
    landingSafe(g, g.hunters) &&
    (shotWouldHit(g, g.hunters) || nearest(g) < 75),
  // Scheduled aim with 45 ms timing noise, true positions.
  noisyHuman: (rng) => makePilot(rng, { info: "true" }),
  // Human model: only painted blips, extrapolated; 45 ms timing noise.
  radarHuman: (rng) => makePilot(rng, { info: "radar" }),
  // Fallible human: sloppier timing, slow to notice danger, often doesn't look
  // around the landing point (see HUMAN in demo-bot.js).
  humanLike: (rng) => makePilot(rng, HUMAN),
};

function run(name, seed) {
  const g = createGame(seed);
  const rng = makeRng(seed * 7919 + 13);
  const pol = policies[name](rng);
  let ev = [];
  while (!isFinished(g) && g.t < maxT) {
    ev = step(g, DT, pol(g, ev)).slice();
  }
  return {
    score: g.score,
    t: g.t,
    sector: g.sector,
    kills: g.stats.kills,
    jumps: g.stats.jumps,
    chain: g.stats.bestChain,
    edge: g.stats.deaths.filter((d) => d.cause === "edge").length,
    contact: g.stats.deaths.filter((d) => d.cause === "contact").length,
  };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pick = process.argv[4] ? process.argv[4].split(",") : Object.keys(policies);
console.log(`runs=${runs} maxT=${maxT}s`);
console.log("policy        score    time  sector kills jumps chain edgeD contD");
for (const name of pick) {
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(run(name, s));
  const f = (k, d = 0) => mean(rs.map((r) => r[k])).toFixed(d).padStart(6);
  console.log(
    `${name.padEnd(12)} ${f("score")} ${f("t", 1)} ${f("sector", 2)} ${f("kills", 1)} ${f("jumps")} ${f("chain", 1)} ${f("edge", 1)} ${f("contact", 1)}`,
  );
}
