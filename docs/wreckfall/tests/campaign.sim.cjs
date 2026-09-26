// 12-wave campaign: per-wave reach/clear and all-clear rate per policy.
// node tests/campaign.sim.cjs [n] [policies]
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 12;
const which = (process.argv[3] || "human,hgreedy,oracle").split(",");
const LAST = WF.CAMPAIGN.length;
const mk = {
  human: (s) => B.humanBot({ seed: s }),
  hgreedy: (s) => B.humanBot({ seed: s, name: "hgreedy", mode: "greedy", waits: [0] }),
  oracle: () => B.oracleBot(),
  greedy: () => B.oracleBot({ name: "greedy", mode: "greedy", waits: [0] }),
};
for (const pn of which) {
  const per = {};
  const at = (w) => (per[w] = per[w] || { reach: 0, clear: 0, t: [], d: { bomb: 0, wreck: 0, invade: 0 }, over: 0 });
  let all = 0;
  const allT = [];
  const reached = [];
  for (let i = 0; i < N; i++) {
    const s = WF.createGame(6000 + i);
    const bot = mk[pn](6000 + i);
    at(1).reach++;
    let wStart = 0;
    let done = false;
    while (s.mode !== "over" && !done && s.t < 1500) {
      WF.step(s, bot.update(s) || {});
      for (const e of s.events) {
        if (e.type === "death") at(s.wave).d[e.cause]++;
        if (e.type === "gameover") at(s.wave).over++;
        if (e.type === "clear") {
          at(s.wave).clear++;
          at(s.wave).t.push(s.t - wStart);
          if (s.wave === LAST) { all++; allT.push(s.t); done = true; }
        }
        if (e.type === "wave") { at(s.wave).reach++; wStart = s.t; }
      }
    }
    reached.push(done ? LAST + 1 : s.wave);
  }
  const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
  console.log(`${pn}: ALL CLEAR ${all}/${N}` + (allT.length ? ` in ${(med(allT) / 60).toFixed(1)} min` : "") + `  median wave reached ${med(reached)}`);
  for (let w = 1; w <= LAST; w++) {
    const r = per[w];
    if (!r) break;
    const p = WF.waveParams(w, true);
    console.log(`  ${String(w).padStart(2)} ${(p.name || p.behavior).padEnd(10)} reach ${String(r.reach).padStart(2)} clear ${String(r.clear).padStart(2)}  tClear ${med(r.t).toFixed(0).padStart(3)}s / T ${p.timeAllowance.toFixed(0)}s  deaths b${r.d.bomb} w${r.d.wreck} i${r.d.invade}`);
  }
}
