// Rescuer engagement on VERDA round 2: node tests/rescuer.sim.cjs '{"speed":42,"rest":5}' [minChain]
// Reports how often the Rescuer is actually in play, what it takes, what is won back, and the
// score cost, for the oracle and human-limited readers.
const SKY = require("../core.js");
const B = require("../bots.js");
const P = JSON.parse(process.argv[2] || '{"speed":42,"rest":5}');
if (process.argv[3]) SKY.CFG.rescuerMinChain = Number(process.argv[3]);
for (const [nm, mk] of [["oracle@4", (s) => B.reader({ haulAt: 4, seed: s })], ["human@4", (s) => B.reader({ human: true, haulAt: 4, seed: s })]]) {
  let play = 0, chase = 0, sn = 0, back = 0, score = 0, deaths = 0;
  for (let s = 1; s <= 20; s++) {
    const g = SKY.createGame(s * 911, { rules: P === null ? { rescuer: null } : { rescuer: P }, noBonus: true });
    SKY.startRound(g, 2);
    g.lives = 99;
    const bot = mk(s);
    for (let i = 0; i < 90 * 60 && g.round === 2; i++) {
      SKY.step(g, bot(g));
      if (g.phase === "play") {
        play++;
        if (g.rescuer && g.rescuer.mode !== "patrol") chase++;
      }
      for (const e of g.events) if (e.t === "death") deaths++;
      g.events.length = 0;
    }
    sn += g.stats.snatches;
    back += g.stats.stealBacks;
    score += g.score;
  }
  const min = play / 60 / 60;
  console.log(`${nm.padEnd(9)} rescuer active ${((100 * chase) / play).toFixed(0)}% of play, snatches/min ${(sn / min).toFixed(2)}, won back ${sn ? ((100 * back) / sn).toFixed(0) : "-"}%, score/min ${(score / min).toFixed(0)}, deaths/min ${(deaths / min).toFixed(2)}`);
}
