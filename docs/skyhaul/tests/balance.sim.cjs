// Bot ladder: node tests/balance.sim.cjs [runs] [maxSeconds]
const SKY = require("../core.js");
const B = require("../bots.js");

const runs = Number(process.argv[2] || 30);
const maxT = Number(process.argv[3] || 240);
// Optional rule override for every round, e.g. '{"heavyEvery":4,"bomber":true}'
const rules = process.argv[4] ? JSON.parse(process.argv[4]) : undefined;
const only = process.argv[5] ? new RegExp(process.argv[5]) : null;

const policies = {
  idle: () => B.idle(),
  "haul@1": () => B.fixedHaul(1),
  "haul@3": () => B.fixedHaul(3),
  "hoard@99": () => B.fixedHaul(99),
  "oracle@2": (s) => B.reader({ haulAt: 2, seed: s }),
  "oracle@4": (s) => B.reader({ haulAt: 4, seed: s }),
  "oracle@6": (s) => B.reader({ haulAt: 6, seed: s }),
  "oracle@9": (s) => B.reader({ haulAt: 9, seed: s }),
  "human@2": (s) => B.reader({ human: true, haulAt: 2, seed: s }),
  "human@4": (s) => B.reader({ human: true, haulAt: 4, seed: s }),
  "human@6": (s) => B.reader({ human: true, haulAt: 6, seed: s }),
  "human@9": (s) => B.reader({ human: true, haulAt: 9, seed: s }),
  "oracle@4-alwaysDodge": (s) => B.reader({ haulAt: 4, turret: "dodge", seed: s }),
  "human@4-alwaysDodge": (s) => B.reader({ human: true, haulAt: 4, turret: "dodge", seed: s }),
  "oracle@6-heavyLate": (s) => B.reader({ haulAt: 6, heavyPref: "late", seed: s }),
  "oracle@6-heavyAvoid": (s) => B.reader({ haulAt: 6, heavyPref: "avoid", seed: s }),
  "human@6-heavyLate": (s) => B.reader({ human: true, haulAt: 6, heavyPref: "late", seed: s }),
  "human@6-heavyAvoid": (s) => B.reader({ human: true, haulAt: 6, heavyPref: "avoid", seed: s }),
};

function run(name, seed) {
  const g = SKY.createGame(seed, { rules });
  const pol = policies[name](seed);
  const steps = maxT * 60;
  let inputs = 0;
  let last = "";
  const deathCause = {};
  for (let i = 0; i < steps && g.phase !== "over"; i++) {
    const inp = pol(g);
    const k = inp.dx + "," + inp.dy;
    if (k !== last) (inputs++, (last = k));
    g.events.length = 0;
    SKY.step(g, inp);
    for (const e of g.events) if (e.t === "death") deathCause[e.cause] = (deathCause[e.cause] || 0) + 1;
  }
  const dl = g.stats.deliveries;
  return {
    score: g.score,
    round: g.round,
    t: g.t,
    over: g.phase === "over",
    avgHaul: dl.length ? dl.reduce((a, b) => a + b, 0) / dl.length : 0,
    cuts: g.stats.cuts,
    recatch: g.stats.recatches,
    rescues: g.stats.rescues,
    ips: inputs / g.t,
    deathCause: g.stats.deathBy,
    mineCuts: g.stats.mineCuts,
    snatches: g.stats.snatches,
    stealBacks: g.stats.stealBacks,
  };
}

const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log(`runs=${runs} maxT=${maxT}s`);
console.log("policy            medScore  meanScore  medRound  survT  avgHaul  cuts  recatch  rescue  in/s");
for (const name of Object.keys(policies)) {
  if (only && !only.test(name)) continue;
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(run(name, s * 7919));
  const dc = {};
  for (const r of rs) for (const k in r.deathCause) dc[k] = (dc[k] || 0) + r.deathCause[k];
  const mean = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  console.log(
    name.padEnd(17),
    String(med(rs.map((r) => r.score))).padStart(8),
    mean((r) => r.score).toFixed(0).padStart(10),
    String(med(rs.map((r) => r.round))).padStart(9),
    mean((r) => r.t).toFixed(0).padStart(6),
    mean((r) => r.avgHaul).toFixed(2).padStart(8),
    mean((r) => r.cuts).toFixed(1).padStart(5),
    mean((r) => r.recatch).toFixed(1).padStart(8),
    mean((r) => r.rescues).toFixed(1).padStart(7),
    mean((r) => r.ips).toFixed(1).padStart(5),
    "  mineCut " + mean((r) => r.mineCuts).toFixed(1),
    " snatch " + mean((r) => r.snatches).toFixed(1) + " back " + mean((r) => r.stealBacks).toFixed(1),
    " deaths " + JSON.stringify(dc)
  );
}
