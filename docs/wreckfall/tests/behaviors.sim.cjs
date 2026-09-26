// Formation behaviours: the same wave and seeds with each behaviour forced.
// node tests/behaviors.sim.cjs [n] [wave]
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 10;
const WAVE = +process.argv[3] || 5;
const pols = {
  oracle: () => B.oracleBot(),
  human: (s) => B.humanBot({ seed: s }),
  hgreedy: (s) => B.humanBot({ seed: s, name: "hgreedy", mode: "greedy", waits: [0] }),
};
function one(seed, bot, behavior) {
  const s = WF.createGame(seed, { startWave: WAVE, behavior });
  s.lives = 99;
  const st = { shots: 0, hulks: 0, chains: [], reverses: 0, deaths: 0, inv: 0, firedWhileHeld: 0 };
  while (s.mode === "ready" || s.mode === "play" || s.mode === "dead") {
    WF.step(s, bot.update(s) || {});
    for (const e of s.events) {
      if (e.type === "fire") st.shots++;
      if (e.type === "swallow" && e.armored) st.hulks++;
      if (e.type === "land") st.chains.push(e.n);
      if (e.type === "reverse") st.reverses++;
      if (e.type === "death") { st.deaths++; if (e.cause === "invade") st.inv++; }
    }
    if (s.mode === "over" || s.t > 300) break;
  }
  st.t = s.t - s.waveStartT;
  st.cleared = s.mode === "clear";
  st.waits = bot.waits ? bot.waits.slice() : [];
  return st;
}
console.log(`wave ${WAVE}, ${N} seeds, time allowance ${WF.timeAllowance(WAVE).toFixed(0)} s`);
for (const [pn, mk] of Object.entries(pols)) {
  for (const bh of ["normal", "convoy", "reverse"]) {
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(one(9500 + i, mk(9500 + i), bh));
    const sum = (f) => rs.reduce((a, r) => a + f(r), 0);
    const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
    const ch = rs.flatMap((r) => r.chains);
    const ws = rs.flatMap((r) => r.waits);
    console.log(
      `${pn.padEnd(7)} ${bh.padEnd(7)} clear ${sum((r) => r.cleared)}/${N}  tClear med ${med(rs.map((r) => r.t)).toFixed(1)}s  shots/hulk ${(sum((r) => r.shots) / Math.max(1, sum((r) => r.hulks))).toFixed(2)}  mean chain ${(ch.reduce((a, b) => a + b, 0) / Math.max(1, ch.length)).toFixed(2)}` +
        (ws.length ? `  planned wait mean ${(ws.reduce((a, b) => a + b, 0) / ws.length).toFixed(2)}s (≥0.6s ${((ws.filter((x) => x >= 0.6).length / ws.length) * 100).toFixed(0)}%)` : "") +
        (bh === "reverse" ? `  reversals/wave ${(sum((r) => r.reverses) / N).toFixed(1)}` : "") +
        `  deaths/wave ${(sum((r) => r.deaths) / N).toFixed(2)} (invasions ${sum((r) => r.inv)})`
    );
  }
}
