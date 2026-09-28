// Who gets the wreck survivors? node tests/rafts.sim.cjs [games] [bot]
// Counts, per wave, how survivors in life jackets leave the water: caught by the sub, grabbed by a
// raider, or drowned. Also how long a grab-ship spends sailing out empty.
const U = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const kind = process.argv[3] || "h0f";
const byWave = {};
let outT = 0, huntT = 0, homeT = 0, liftT = 0;
for (let i = 0; i < N; i++) {
  const opt = { seed: i, gather: +kind[1], race: !kind.includes("n"), ferry: kind.includes("f") };
  const bot = kind === "idle" ? B.idleBot() : kind[0] === "o" ? B.oracleBot(opt) : B.humanBot(opt);
  const g = U.newGame(4000 + i);
  while (g.mode !== "over" && g.t < 600) {
    const jackets = new Map(g.captives.filter((c) => c.jacket).map((c) => [c.id, c]));
    U.step(g, bot.act(g));
    const w = (byWave[g.wave] = byWave[g.wave] || { board: 0, grab: 0, raftSink: 0 });
    const left = new Set(g.captives.map((c) => c.id));
    const caughtNow = g.events.filter((e) => e.type === "catch" && !e.spill).length;
    const drownNow = g.events.filter((e) => e.type === "drown" || e.type === "captiveBlasted").length;
    let gone = 0;
    for (const id of jackets.keys()) if (!left.has(id)) gone++;
    w.board += caughtNow;
    w.raftSink += Math.min(drownNow, gone - caughtNow);
    w.grab += Math.max(0, gone - caughtNow - Math.min(drownNow, gone - caughtNow));
    for (const e of g.enemies) if (e.kind === "ship") {
      if (e.state === "out") outT += U.DT; else if (e.state === "hunt") huntT += U.DT; else if (e.state === "lift") liftT += U.DT; else homeT += U.DT;
    }
  }
}
console.log(`${kind}: jacket survivors by wave (sub caught / raider grabbed / drowned)`);
for (const w of Object.keys(byWave).slice(0, 12)) {
  const r = byWave[w];
  const tot = r.board + r.grab + r.raftSink;
  if (tot) console.log(`  wave ${w.padStart(2)}  ${String(r.board).padStart(4)} / ${String(r.grab).padStart(4)} / ${String(r.raftSink).padStart(3)}   raider share ${((100 * r.grab) / tot).toFixed(0)}%`);
}
const T = outT + huntT + homeT + liftT;
console.log(`grab-ship time: sailing out empty ${((100 * outT) / T).toFixed(0)}%  hunting ${((100 * huntT) / T).toFixed(0)}%  lifting ${((100 * liftT) / T).toFixed(0)}%  heading home ${((100 * homeT) / T).toFixed(0)}%`);
