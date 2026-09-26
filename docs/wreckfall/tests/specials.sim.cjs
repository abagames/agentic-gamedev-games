// Does SPLITTER change the decision? node tests/specials.sim.cjs [n] [wave]
// Plays single waves (fresh lives) with the specials of each variant vs. none, same seeds.
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 12;
const WAVE = +process.argv[3] || 3;
const pols = {
  oracle: () => B.oracleBot(),
  greedy: () => B.oracleBot({ name: "greedy", mode: "greedy", waits: [0] }),
  human: (s) => B.humanBot({ seed: s }),
  hgreedy: (s) => B.humanBot({ seed: s, name: "hgreedy", mode: "greedy", waits: [0] }),
};
const variants = { none: [], split: ["split"] };

function one(seed, bot, specials) {
  const s = WF.createGame(seed, { startWave: WAVE, specials });
  s.lives = 99;
  const st = { t: 0, deaths: { bomb: 0, wreck: 0, invade: 0 }, shots: 0, hitSpecial: 0, hits: 0, hulks: 0, hulkWithSpecial: 0, forks: 0 };
  const wreckHasSpecial = new Map();
  let specialShare = 0, samples = 0;
  while (s.mode !== "clear" && s.t < 240) {
    WF.step(s, bot.update(s) || {});
    if (s.mode === "play" && Math.random() < 0.05) {
      const esc = s.enemies.filter((e) => e.alive && !e.armored);
      if (esc.length) { specialShare += esc.filter((e) => e.kind !== "esc").length / esc.length; samples++; }
    }
    for (const e of s.events) {
      if (e.type === "fire") st.shots++;
      if (e.type === "hit" && e.byShot) { st.hits++; if (e.kind === "split") { st.hitSpecial++; wreckHasSpecial.set(e.id, true); } }
      if (e.type === "fork") { st.forks++; if (wreckHasSpecial.get(e.id)) wreckHasSpecial.set(e.child, true); else wreckHasSpecial.set(e.child, false); }
      if (e.type === "swallow" && e.kind === "split") wreckHasSpecial.set(e.id, true);
      if (e.type === "swallow" && e.armored) { st.hulks++; if (wreckHasSpecial.get(e.id)) st.hulkWithSpecial++; }
      if (e.type === "death") st.deaths[e.cause]++;
    }
  }
  st.t = s.t - s.waveStartT;
  st.cleared = s.mode === "clear";
  st.share = samples ? specialShare / samples : 0;
  return st;
}

console.log(`wave ${WAVE} (hulks ${WF.waveParams(WAVE).hulks}×${WF.waveParams(WAVE).armored.length} lanes), ${N} seeds`);
for (const [pn, mk] of Object.entries(pols)) {
  for (const [vn, sp] of Object.entries(variants)) {
    const rs = [];
    for (let i = 0; i < N; i++) rs.push(one(7000 + i, mk(7000 + i), sp));
    const sum = (f) => rs.reduce((a, r) => a + f(r), 0);
    const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const hs = sum((r) => r.hitSpecial), h = sum((r) => r.hits);
    console.log(
      `${pn.padEnd(7)} ${vn.padEnd(5)} clear ${sum((r) => r.cleared)}/${N}  tClear med ${med(rs.map((r) => r.t)).toFixed(1)}s  shots/hulk ${(sum((r) => r.shots) / Math.max(1, sum((r) => r.hulks))).toFixed(2)}  ` +
        (vn === "none" ? "" : `shots on specials ${((hs / Math.max(1, h)) * 100).toFixed(0)}% (share ${(sum((r) => r.share) / N * 100).toFixed(0)}%)  hulks via special ${((sum((r) => r.hulkWithSpecial) / Math.max(1, sum((r) => r.hulks))) * 100).toFixed(0)}%  `) +
        `deaths/wave b${(sum((r) => r.deaths.bomb) / N).toFixed(2)} w${(sum((r) => r.deaths.wreck) / N).toFixed(2)} i${(sum((r) => r.deaths.invade) / N).toFixed(2)}`
    );
  }
}
