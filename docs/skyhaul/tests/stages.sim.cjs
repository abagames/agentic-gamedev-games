// Difficulty profile per stage of the first tour: node tests/stages.sim.cjs [runs]
// Each round is played on its own (lives unlimited, 120 s cap) by the oracle and human-limited readers.
const SKY = require("../core.js");
const B = require("../bots.js");
const runs = Number(process.argv[2] || 20);
const pols = [["oracle@4", (s) => B.reader({ haulAt: 4, seed: s })], ["human@4", (s) => B.reader({ human: true, haulAt: 4, seed: s })]];
console.log("round planet  tag        | oracle deaths/min clears  | human deaths/min clears  top causes (human)");
for (let r = 1; r <= 8; r++) {
  const row = [];
  let causes = {};
  for (const [nm, mk] of pols) {
    let play = 0, deaths = 0, clears = 0;
    for (let s = 1; s <= runs; s++) {
      const g = SKY.createGame(s * 313, { noBonus: true });
      SKY.startRound(g, r);
      g.lives = 99;
      const bot = mk(s);
      for (let i = 0; i < 120 * 60 && g.round === r; i++) {
        SKY.step(g, bot(g));
        if (g.phase === "play") play++;
        for (const e of g.events) {
          if (e.t === "death") {
            deaths++;
            if (nm.startsWith("human")) causes[e.cause] = (causes[e.cause] || 0) + 1;
          }
          if (e.t === "clear") clears++;
        }
        g.events.length = 0;
      }
    }
    row.push(`${((deaths / play) * 3600).toFixed(2).padStart(5)} ${String(clears).padStart(2)}/${runs}`);
  }
  const R = SKY.roundRules(r);
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ":" + v).join(" ");
  console.log(`${String(r).padStart(5)} ${R.planetName.padEnd(7)} ${(R.tag || "-").padEnd(10)} | ${row[0].padStart(22)} | ${row[1].padStart(21)}  ${top}`);
}
