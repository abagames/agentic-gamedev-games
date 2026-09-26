// Sanity check of simulated players: input rate, reversal rate, min gap between shots.
const WF = require("../core.js");
const B = require("../bots.js");
const pols = { human: (s) => B.humanBot({ seed: s }), oracle: () => B.oracleBot(), greedy: () => B.oracleBot({ name: "greedy", mode: "greedy", waits: [0] }) };
for (const [name, mk] of Object.entries(pols)) {
  let shots = 0, rev = 0, playT = 0, minGap = 99, gaps = [];
  for (let k = 0; k < 4; k++) {
    const s = WF.createGame(3000 + k), bot = mk(3000 + k);
    let lastDir = 0, lastShot = -9;
    while (s.mode !== "over" && s.t < 240) {
      const inp = bot.update(s) || {};
      const x0 = s.player.x;
      WF.step(s, inp);
      if (s.mode === "play") playT += WF.DT;
      const d = Math.sign(Math.round((s.player.x - x0) * 100));
      if (d && lastDir && d !== lastDir) rev++;
      if (d) lastDir = d;
      for (const e of s.events) if (e.type === "fire") { shots++; const g = s.t - lastShot; gaps.push(g); minGap = Math.min(minGap, g); lastShot = s.t; }
    }
  }
  gaps.sort((a, b) => a - b);
  console.log(`${name.padEnd(7)} shots/min ${(shots / playT * 60).toFixed(0)}  reversals/s ${(rev / playT).toFixed(2)}  shot gap min ${minGap.toFixed(2)}s p10 ${gaps[Math.floor(gaps.length * 0.1)].toFixed(2)}s med ${gaps[Math.floor(gaps.length / 2)].toFixed(2)}s`);
}
