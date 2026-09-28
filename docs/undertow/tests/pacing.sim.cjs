// Pacing: how much of play has something to act on in view. node tests/pacing.sim.cjs [games] [bot]
const U = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const kind = process.argv[3] || "h0";
let launches = { ship: 0, esub: 0 }, esubGrab = 0, shipGrabSpill = 0;
let tot = 0, busy = 0, enemyView = 0, capView = 0, homeTrip = 0;
for (let i = 0; i < N; i++) {
  const opt = { seed: i, gather: +kind[1], race: !kind.includes("n"), ferry: kind.includes("f") };
  const bot = kind[0] === "o" ? B.oracleBot(opt) : B.humanBot(opt);
  const g = U.newGame(2000 + i);
  while (g.mode !== "over" && g.t < 600) {
    U.step(g, bot.act(g));
    for (const e of g.events) { if (e.type === 'launch') launches[e.kind]++; if (e.type === 'grab' && e.kind === 'esub') esubGrab++; }
    if (g.mode !== "play" || !g.player.alive) continue;
    tot++;
    const p = g.player;
    const ev = g.enemies.some((e) => Math.abs(U.dx(p.x, e.x)) < 128);
    const cv = g.captives.some((c) => !c.raft && Math.abs(U.dx(p.x, c.x)) < 128);
    if (ev) enemyView++;
    if (cv) capView++;
    if (ev || cv) busy++;
    if (p.cargo > 0 && !ev && !cv) homeTrip++;
  }
}
const f = (v) => ((100 * v) / tot).toFixed(0) + "%";
console.log(`launches ${JSON.stringify(launches)} esub grabs ${esubGrab}`);
console.log(`${kind}: something in view ${f(busy)}  raider in view ${f(enemyView)}  sinking survivor in view ${f(capView)}  empty-screen trip with cargo ${f(homeTrip)}`);
