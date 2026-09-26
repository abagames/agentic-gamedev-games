// Per-wave reach / clear time / deaths: node tests/waves.sim.cjs [games] [policy]
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 8;
const pol = process.argv[3] || "human";
const make = { human: (s) => B.humanBot({ seed: s }), hgreedy: (s) => B.humanBot({ seed: s, name: "hgreedy", mode: "greedy", waits: [0] }), oracle: () => B.oracleBot(), greedy: () => B.oracleBot({ name: "greedy", mode: "greedy", waits: [0] }) };
const per = {};
const at = (w) => (per[w] = per[w] || { reach: 0, clear: 0, times: [], deaths: { bomb: 0, wreck: 0, invade: 0 }, over: 0 });
const scores = [], times = [];
for (let i = 0; i < N; i++) {
  const s = WF.createGame(2000 + i);
  const bot = make[pol](2000 + i);
  at(1).reach++;
  let wStart = 0;
  while (s.mode !== "over" && s.t < 1200) {
    WF.step(s, bot.update(s) || {});
    for (const e of s.events) {
      if (e.type === "death") at(s.wave).deaths[e.cause]++;
      if (e.type === "clear") { at(s.wave).clear++; at(s.wave).times.push(s.t - wStart); }
      if (e.type === "wave") { at(s.wave).reach++; wStart = s.t; }
      if (e.type === "gameover") at(s.wave).over++;
    }
  }
  scores.push(s.score); times.push(s.t);
}
const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
console.log(`${pol}: score med ${med(scores)}  life med ${med(times).toFixed(0)}s`);
for (const w of Object.keys(per).map(Number).sort((a, b) => a - b)) {
  const r = per[w];
  console.log(`wave ${String(w).padStart(2)} reach ${r.reach} clear ${r.clear} tClear ${med(r.times).toFixed(0)}s  deaths b${r.deaths.bomb} w${r.deaths.wreck} i${r.deaths.invade}  over ${r.over}`);
}
