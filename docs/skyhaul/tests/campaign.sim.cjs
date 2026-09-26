// Campaign pacing by planet: node tests/campaign.sim.cjs [runs] [maxSeconds]
// For each policy: how far it gets, and per planet the time spent, deaths, and haul weight.
const SKY = require("../core.js");
const B = require("../bots.js");
const runs = Number(process.argv[2] || 20);
const maxT = Number(process.argv[3] || 600);
const policies = {
  "oracle@4": (s) => B.reader({ haulAt: 4, seed: s }),
  "oracle@6": (s) => B.reader({ haulAt: 6, seed: s }),
  "human@4": (s) => B.reader({ human: true, haulAt: 4, seed: s }),
  "human@6": (s) => B.reader({ human: true, haulAt: 6, seed: s }),
};
for (const [name, mk] of Object.entries(policies)) {
  const per = {}; // planet name → {t, deaths, hauls, weight, rounds}
  let score = 0, maxRound = 0;
  for (let s = 1; s <= runs; s++) {
    const g = SKY.createGame(s * 4099, { endless: true });
    const bot = mk(s);
    for (let i = 0; i < maxT * 60 && g.phase !== "over"; i++) {
      SKY.step(g, bot(g));
      const P = (per[g.rules.planetName] ||= { t: 0, deaths: 0, hauls: 0, weight: 0, clears: 0 });
      if (g.phase === "play") P.t += SKY.CFG.dt;
      for (const e of g.events) {
        if (e.t === "death") P.deaths++;
        if (e.t === "delivered") (P.hauls++, (P.weight += e.n));
        if (e.t === "clear") P.clears++;
      }
      g.events.length = 0;
    }
    score += g.score;
    maxRound = Math.max(maxRound, g.round);
  }
  console.log(`${name}: mean score ${(score / runs).toFixed(0)}, best round ${maxRound}`);
  for (const [pn, P] of Object.entries(per))
    console.log(
      `   ${pn.padEnd(7)} play ${(P.t / runs).toFixed(0).padStart(4)}s/run  clears ${(P.clears / runs).toFixed(2)}  deaths/min ${((P.deaths / Math.max(1, P.t)) * 60).toFixed(2)}  avg haul ${(P.weight / Math.max(1, P.hauls)).toFixed(2)}`
    );
}
