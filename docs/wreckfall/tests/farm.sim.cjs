// Exploit probe: does delaying the last hulk (farming respawning escorts) out-score clearing?
// node tests/farm.sim.cjs [n] [wave]
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const WAVE = +process.argv[3] || 2;
const pols = { oracle: () => B.oracleBot(), farm: () => B.oracleBot({ name: "farm", mode: "farm" }) };
for (const [name, mk] of Object.entries(pols)) {
  const rs = [];
  for (let i = 0; i < N; i++) {
    const s = WF.createGame(8000 + i, { startWave: WAVE });
    s.lives = 99;
    const bot = mk();
    let bonus = 0, deaths = 0;
    while (s.mode !== "clear" && s.t < 400) {
      WF.step(s, bot.update(s) || {});
      for (const e of s.events) { if (e.type === "clear") bonus = e.bonus; if (e.type === "death") deaths++; }
    }
    rs.push({ score: s.score, t: s.t, bonus, deaths, cleared: s.mode === "clear" });
  }
  const m = (f) => rs.reduce((a, r) => a + f(r), 0) / N;
  console.log(`${name.padEnd(7)} wave ${WAVE}: score/wave ${m((r) => r.score).toFixed(0)}  of which height bonus ${m((r) => r.bonus).toFixed(0)}  time ${m((r) => r.t).toFixed(0)}s  pts/s ${m((r) => r.score / r.t).toFixed(0)}  deaths ${m((r) => r.deaths).toFixed(2)}  cleared ${rs.filter((r) => r.cleared).length}/${N}`);
}
