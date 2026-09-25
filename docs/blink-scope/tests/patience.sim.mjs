// Does "shoot now" or "wait for clusters" dominate? node tests/patience.sim.mjs [seeds] [chainScore] [chainRefund]
// Compares an immediate pilot, adaptive pilots (fire only into clusters while
// the time bar is above 80% / 50% / 25%) and an always-patient pilot.
import { CFG, createGame, step, makeRng, isFinished } from "../game-core.js";
import { makePilot, HUMAN } from "../demo-bot.js";

const DT = 1 / 120;
const seeds = Number(process.argv[2] ?? 60);
if (process.argv[3]) CFG.chainScore = process.argv[3];
if (process.argv[4]) CFG.chainRefund = Number(process.argv[4]);
const mean = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;

console.log(`chainScore=${CFG.chainScore} chainRefund=${CFG.chainRefund}s seeds=${seeds}`);
for (const [info, preset] of [["true", { info: "true" }], ["radar", { info: "radar" }], ["human", HUMAN]]) {
  const out = [];
  for (const [name, pa] of [["immediate", 1], ["adaptive>80%", 0.8], ["adaptive>50%", 0.5], ["patient", 0]]) {
    const rs = [];
    for (let s = 1; s <= seeds; s++) {
      const g = createGame(s);
      const pol = makePilot(makeRng(s * 7919 + 13), { ...preset, patientAbove: pa });
      let ev = [];
      while (!isFinished(g) && g.t < 300) ev = step(g, DT, pol(g, ev)).slice();
      rs.push({ score: g.score, sector: g.sector });
    }
    out.push(`${name} ${mean(rs, "score").toFixed(0)} (s${mean(rs, "sector").toFixed(1)})`);
  }
  console.log(`${info.padEnd(5)} ${out.join(" | ")}`);
}
