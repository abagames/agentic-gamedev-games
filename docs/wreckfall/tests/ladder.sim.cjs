// Policy ladder: node tests/ladder.sim.cjs [games] [maxSeconds] [policies,comma]
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const maxT = +process.argv[3] || 300;
const which = (process.argv[4] || "idle,mash,nearest,human,oracle").split(",");
const make = {
  idle: () => B.idleBot(),
  mash: () => B.mashBot(),
  nearest: () => B.nearestBot(),
  human: (seed) => B.humanBot({ seed }),
  oracle: () => B.oracleBot(),
  greedy: () => B.oracleBot({ name: "greedy", mode: "greedy", waits: [0] }),
};
function pct(a, p) {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(p * b.length))];
}
for (const name of which) {
  const rs = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) rs.push(B.playGame(1000 + i, make[name](1000 + i), { maxT }));
  const scores = rs.map((r) => r.score);
  const waves = rs.map((r) => r.wavesCleared);
  const chains = rs.flatMap((r) => r.chains);
  const hist = [0, 0, 0, 0, 0];
  for (const c of chains) hist[Math.min(4, c - 1)]++;
  const d = { bomb: 0, wreck: 0, invade: 0 };
  for (const r of rs) for (const k in d) d[k] += r.deaths[k];
  const wt = rs.flatMap((r) => r.waveTimes);
  console.log(
    `${name.padEnd(8)} score med ${pct(scores, 0.5)} (p10 ${pct(scores, 0.1)} p90 ${pct(scores, 0.9)})  waves med ${pct(waves, 0.5)} max ${Math.max(...waves)}  ` +
      `alive med ${pct(rs.map((r) => r.t), 0.5).toFixed(0)}s  chain 1/2/3/4/5+ ${hist.join("/")} mean ${(chains.reduce((a, b) => a + b, 0) / Math.max(1, chains.length)).toFixed(2)}  ` +
      `deaths b${d.bomb}/w${d.wreck}/i${d.invade}  waveT med ${wt.length ? pct(wt, 0.5).toFixed(0) : "-"}s  ` +
      `shots/kill ${(rs.reduce((a, r) => a + r.shots, 0) / Math.max(1, rs.reduce((a, r) => a + r.kills, 0))).toFixed(2)}  [${((Date.now() - t0) / 1000).toFixed(1)}s]`
  );
}
