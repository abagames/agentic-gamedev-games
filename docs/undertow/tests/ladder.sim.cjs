// Policy ladder: node tests/ladder.sim.cjs [games] [maxSeconds] [policies,comma]
// policies: idle, mash, o0..o5 (oracle, gather k), h0..h5 (human-limited, gather k), add "n" suffix for no raft racing (o3n), "f" to use the ferry (o3f, o3nf)
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const maxT = +process.argv[3] || 600;
const which = (process.argv[4] || "idle,mash,o0,o2,o3,o4,h0,h2,h3").split(",");
function make(name, seed) {
  if (name === "idle") return B.idleBot();
  if (name === "mash") return B.mashBot();
  if (name === "plan") return B.plannerBot({ seed });
  if (name === "planh") return B.plannerBot({ seed, horizon: 2, every: 0.3 });
  const m = /^([oh])(\d)(n?)(f?)$/.exec(name);
  const opts = { seed, gather: +m[2], race: !m[3], ferry: !!m[4], name };
  return m[1] === "o" ? B.oracleBot(opts) : B.humanBot(opts);
}
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
for (const name of which) {
  const rs = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) rs.push(B.playGame(1000 + i, make(name, 1000 + i), { maxT }));
  const sum = (k) => rs.reduce((a, r) => a + r.stats[k], 0);
  const d = { mine: 0, etorp: 0, ram: 0, shell: 0, charge: 0 };
  for (const r of rs) for (const k in d) d[k] += r.stats.deaths[k] || 0;
  const sizes = rs.flatMap((r) => r.stats.spillSizes);
  const why = {}; for (const r of rs) why[r.why || "time"] = (why[r.why || "time"] || 0) + 1;
  const sc = rs.map((r) => r.score);
  console.log(
    `${name.padEnd(5)} score med ${pct(sc, 0.5)} (p10 ${pct(sc, 0.1)} p90 ${pct(sc, 0.9)})  waves med ${pct(rs.map((r) => r.wavesCleared), 0.5)} max ${Math.max(...rs.map((r) => r.wavesCleared))}  alive med ${pct(rs.map((r) => r.t), 0.5).toFixed(0)}s end ${JSON.stringify(why)}\n` +
    `      deliv ${sum("deliveredTotal")} taken ${sum("taken")} drown ${sum("drowned")} blasted ${sum("blasted")} lostSub ${sum("lostWithSub")} | sunk ship ${sum("shipsSunk")} sub ${sum("esubsSunk")} mines ${sum("minesShot")} | spills ${sizes.length} mean ${(sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length)).toFixed(2)} allSaved ${sum("allSaved")} bonus ${sum("spillBonus")} | deaths m${d.mine}/t${d.etorp}/r${d.ram}/s${d.shell}/c${d.charge} shots ${sum("shots")} | ferry handed ${sum("handed")} home ${sum("ferryHome")} sunk ${sum("ferrySunk")} spilled ${sum("ferrySpilled")} hits ${sum("ferryHits")}/${sum("shells")}  [${((Date.now() - t0) / 1000).toFixed(1)}s]`
  );
}
