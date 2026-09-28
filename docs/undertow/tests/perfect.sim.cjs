// Can everyone be saved? Per wave: share of waves with nobody lost, and mean lost.
// node tests/perfect.sim.cjs [games] [bot,bot...]   (bots as in ladder: o0f, h0f, ...)
// Each game starts at a given wave with a fresh town, so every wave is measured on its own.
const U = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const which = (process.argv[3] || "o0f,h0f").split(",");
const waves = (process.argv[4] || "1,2,3,4,5,6,8").split(",").map(Number);
function make(name, seed) {
  if (name === "plan") return B.plannerBot({ seed });
  if (name === "planh") return B.plannerBot({ seed, horizon: 2, every: 0.3 });
  const m = /^([oh])(\d)(n?)(f?)$/.exec(name);
  const opts = { seed, gather: +m[2], race: !m[3], ferry: !!m[4], name };
  return m[1] === "o" ? B.oracleBot(opts) : B.humanBot(opts);
}
for (const name of which) {
  const row = [];
  for (const w of waves) {
    let perfect = 0, lost = 0, people = 0, done = 0;
    for (let i = 0; i < N; i++) {
      const g = U.newGame(11000 + i * 7 + w, { wave: w });
      g.lives = 99; // measure the wave, not the lives
      const bot = make(name, 11000 + i);
      while (g.t < 200) {
        U.step(g, bot.act(g));
        const c = g.events.find((e) => e.type === "clear");
        if (c) {
          done++;
          if (c.perfect) perfect++;
          lost += c.lost;
          people += g.waveStats.people;
          break;
        }
        if (g.mode === "over") break;
      }
    }
    row.push(`w${w} ${perfect}/${done} lost ${(lost / Math.max(1, done)).toFixed(1)}/${(people / Math.max(1, done)).toFixed(0)}`);
  }
  console.log(name.padEnd(5), row.join("  "));
}
