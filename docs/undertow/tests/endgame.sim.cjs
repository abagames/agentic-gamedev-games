// How long does a wave run after the sea is settled (nobody on a raft or in the water, no loaded
// raider) until everyone aboard our sub/ferry has docked? node tests/endgame.sim.cjs [games] [bot]
const U = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const kind = process.argv[3] || "h0f";
const tails = [];
let lostInTail = 0;
for (let i = 0; i < N; i++) {
  const opt = { seed: i, gather: +kind[1], race: !kind.includes("n"), ferry: kind.includes("f") };
  const bot = kind[0] === "o" ? B.oracleBot(opt) : B.humanBot(opt);
  const g = U.newGame(5000 + i);
  let settledAt = null;
  let lost0 = 0;
  while (g.mode !== "over" && g.t < 600) {
    U.step(g, bot.act(g));
    const settled = g.mode === "play" && g.captives.length === 0 && !g.enemies.some((e) => e.load > 0);
    if (settled && settledAt === null) {
      settledAt = g.t;
      lost0 = g.waveStats.lost;
    }
    if (!settled && g.mode === "play" && g.captives.length > 0) settledAt = null;
    if (g.events.some((e) => e.type === "clear")) {
      if (settledAt !== null) {
        tails.push(g.t - settledAt);
        lostInTail += g.waveStats.lost - lost0;
      }
      settledAt = null;
    }
  }
}
tails.sort((a, b) => a - b);
const q = (p) => tails[Math.min(tails.length - 1, Math.floor(p * tails.length))].toFixed(1);
console.log(`${kind}: waves ${tails.length}  settled→clear median ${q(0.5)}s  p90 ${q(0.9)}s  max ${q(1)}s  lost in the tail ${lostInTail}`);
