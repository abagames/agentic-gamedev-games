// Ladder of simulated players over the same seeds. node tests/balance.cjs [seeds] [policy,policy...] [capSeconds]
const OT = require('../core.js'), B = require('../bots.js');
if (process.env.OT_C) Object.assign(OT.C, JSON.parse(process.env.OT_C));
const N = +process.argv[2] || 8, names = (process.argv[3] || 'idle,hold,stepper,wiggle,mash,greedy,player,novice,regular,human,strong').split(','), CAP = +process.argv[4] || 600;
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
for (const name of names) {
  const T = [], S = [], L = [], causes = {}; const X = {}; let capped = 0, turns = 0, ticks = 0, bounces = 0, targets = 0, firstBall = [];
  for (let seed = 1; seed <= N; seed++) {
    const st = OT.create(seed), pol = B.policies[name](seed); let fb = 0;
    while (!st.over && st.t * OT.C.TICK < CAP) { OT.step(st, pol(st)); if (!fb && Object.keys(st.causes).length) fb = st.t; }
    if (!st.over) capped++;
    T.push(st.t * OT.C.TICK); S.push(st.score); L.push(st.level); firstBall.push((fb || st.t) * OT.C.TICK);
    for (const k in st.causes) causes[k] = (causes[k] || 0) + st.causes[k];
    for (const k of ['locks','multiballs','jackpots','supers','saves','skills','extends','rounds','rushes','chases','solos']) X[k] = +((X[k] || 0) + st.stats[k] / N).toFixed(2);
    turns += st.stats.turns; ticks += st.t; bounces += st.stats.bounces; targets += st.stats.targets;
  }
  console.log(name.padEnd(8), 'time med', med(T).toFixed(0).padStart(4), 'min', Math.min(...T).toFixed(0).padStart(4), 'max', Math.max(...T).toFixed(0).padStart(4),
    '| 1st ball', med(firstBall).toFixed(0).padStart(4), '| banks med', String(med(L)).padStart(3), '| score med', String(med(S)).padStart(7),
    '| turns/s', (turns / (ticks / 60)).toFixed(2), '| bounces/target', (bounces / Math.max(1, targets)).toFixed(1), '| capped', capped, JSON.stringify(causes), JSON.stringify(X));
}
