// Where does the sub spend its time? node tests/depth.sim.cjs [games] [bot]
const U = require("../core.js");
const B = require("../bots.js");
const { CFG } = U;
const N = +process.argv[2] || 6;
const kind = process.argv[3] || "h0f";
const bands = [0, 0, 0, 0];
const labels = ["firing band (<=66)", "shallow 66-100", "mid 100-135", "deep 135+"];
for (let i = 0; i < N; i++) {
  const opt = { seed: i, gather: +kind[1], race: !kind.includes("n"), ferry: kind.includes("f") };
  const bot = kind[0] === "o" ? B.oracleBot(opt) : B.humanBot(opt);
  const g = U.newGame(6000 + i);
  while (g.mode !== "over" && g.t < 600) {
    U.step(g, bot.act(g));
    if (g.mode !== "play" || !g.player.alive) continue;
    const y = g.player.y;
    bands[y <= CFG.fireBand ? 0 : y < 100 ? 1 : y < 135 ? 2 : 3]++;
  }
}
const tot = bands.reduce((a, b) => a + b, 0);
console.log(kind + ": " + bands.map((b, i) => `${labels[i]} ${((100 * b) / tot).toFixed(0)}%`).join("  "));
