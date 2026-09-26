// Sensitivity of the human-limited reader to each limitation: node tests/human-sweep.cjs [runs]
const SKY = require("../core.js");
const B = require("../bots.js");
const runs = Number(process.argv[2] || 20);
const variants = {
  full: {},
  noLapse: { lapseRate: 0 },
  noLatency: { latency: 0 },
  slowDecide: { decisionHz: 5 },
  lapseOnly: { latency: 0, noise: 0, decisionHz: 60 },
  moreLapse: { lapseRate: 0.35 },
};
for (const [name, v] of Object.entries(variants)) {
  let score = 0, t = 0, round = 0;
  for (let s = 1; s <= runs; s++) {
    const g = SKY.createGame(s * 7919);
    const pol = B.reader(Object.assign({ human: true, haulAt: 5, seed: s }, v));
    for (let i = 0; i < 300 * 60 && g.phase !== "over"; i++) { const inp = pol(g); g.events.length = 0; SKY.step(g, inp); }
    score += g.score; t += g.t; round += g.round;
  }
  console.log(name.padEnd(12), "score", (score / runs).toFixed(0).padStart(6), " survT", (t / runs).toFixed(0).padStart(4), " round", (round / runs).toFixed(1));
}
