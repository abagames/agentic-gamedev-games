// THICK hulks and the MOTHERSHIP, each on vs off on the same waves and seeds.
// node tests/extras.sim.cjs [n] [wave] [feature: thick|ufo]
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 10;
const WAVE = +process.argv[3] || 5;
const FEAT = process.argv[4] || "thick";
const pols = {
  oracle: () => B.oracleBot(),
  greedy: () => B.oracleBot({ name: "greedy", mode: "greedy", waits: [0] }),
  human: (s) => B.humanBot({ seed: s }),
  hgreedy: (s) => B.humanBot({ seed: s, name: "hgreedy", mode: "greedy", waits: [0] }),
};
const off = FEAT === "thick" ? { noThick: true, noUfo: true } : { noUfo: true };
const on = FEAT === "thick" ? { noUfo: true } : {};

function one(seed, bot, opts) {
  const s = WF.createGame(seed, Object.assign({ startWave: WAVE }, opts));
  s.lives = 99;
  const st = { shots: 0, hulks: 0, bounces: 0, ufoSeen: 0, ufoHit: 0, ufoHulks: 0, ufoDeaths: 0, deaths: { bomb: 0, wreck: 0, invade: 0 }, score0: s.score };
  const ufoWrecks = new Set();
  let lastWreckKill = null;
  while (s.mode === "ready" || s.mode === "play" || s.mode === "dead") {
    const before = s.wrecks.map((w) => ({ id: w.id, ufo: !!w.ufo, x: w.x, w: w.w }));
    WF.step(s, bot.update(s) || {});
    for (const e of s.events) {
      if (e.type === "fire") st.shots++;
      if (e.type === "bounce") st.bounces++;
      if (e.type === "ufo") st.ufoSeen++;
      if (e.type === "ufoHit") { st.ufoHit++; ufoWrecks.add(e.id); }
      if (e.type === "fork" && ufoWrecks.has(e.id)) ufoWrecks.add(e.child);
      if (e.type === "swallow" && e.armored) { st.hulks++; if (ufoWrecks.has(e.id)) st.ufoHulks++; }
      if (e.type === "death") {
        st.deaths[e.cause]++;
        if (e.cause === "wreck" && before.some((w) => w.ufo && Math.abs(w.x - e.x) < w.w / 2 + 12)) st.ufoDeaths++;
      }
    }
    if (s.mode === "over" || s.t > 300) break;
  }
  st.t = s.t - s.waveStartT;
  st.cleared = s.mode === "clear";
  st.score = s.score - st.score0;
  return st;
}

console.log(`${FEAT} on/off, wave ${WAVE} (thick ${WF.waveDef(WAVE).thick}), ${N} seeds`);
for (const [pn, mk] of Object.entries(pols)) {
  for (const [vn, opts] of [["off", off], ["on", on]]) {
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(one(9000 + i, mk(9000 + i), opts));
    const sum = (f) => rs.reduce((a, r) => a + f(r), 0);
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    let line = `${pn.padEnd(7)} ${vn.padEnd(3)} clear ${sum((r) => r.cleared)}/${N}  tClear med ${med(rs.map((r) => r.t)).toFixed(1)}s  shots/hulk ${(sum((r) => r.shots) / Math.max(1, sum((r) => r.hulks))).toFixed(2)}  score med ${med(rs.map((r) => r.score))}  deaths/wave b${(sum((r) => r.deaths.bomb) / N).toFixed(2)} w${(sum((r) => r.deaths.wreck) / N).toFixed(2)} i${(sum((r) => r.deaths.invade) / N).toFixed(2)}`;
    if (FEAT === "thick" && vn === "on") line += `  bounces/wave ${(sum((r) => r.bounces) / N).toFixed(1)}`;
    if (FEAT === "ufo" && vn === "on") line += `  ufo seen ${sum((r) => r.ufoSeen)} hit ${sum((r) => r.ufoHit)}  hulks by ufo wreck ${sum((r) => r.ufoHulks)}/${sum((r) => r.hulks)}  ufo-wreck deaths ${sum((r) => r.ufoDeaths)}`;
    console.log(line);
  }
}
