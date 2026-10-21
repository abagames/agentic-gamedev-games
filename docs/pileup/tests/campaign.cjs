// node tests/campaign.cjs [seeds] [policies] [district] — how far runs get: districts cleared, lives lost per district, time
const S = require('../core.js'), A = require('./adapter.cjs');
const n = +process.argv[2] || 6, names = (process.argv[3] || 'human,strong').split(','), d0 = +process.argv[4] || 0;
for (const name of names) {
  const rows = [];
  for (let seed = 1; seed <= n; seed++) {
    const st = S.create(seed, { district: d0 }), pol = A.policies[name].make(seed);
    const per = []; let t0 = 0, deaths0 = 0;
    while (!A.ended(st)) {
      A.step(st, pol(st));
      for (const e of st.events) if (e.type === 'exit') per.push(`exit@${((st.t - t0) / 60) | 0}s`);
      for (const e of st.events) if (e.type === 'clear') { per.push(`${((st.t - t0) / 60) | 0}s/${st.stats.deaths - deaths0}x`); t0 = st.t; deaths0 = st.stats.deaths; }
    }
    rows.push({ won: st.won, d: st.d, score: st.score, t: st.t / 60 | 0, per: per.join(' '), fail: JSON.stringify(st.stats.fail), best: st.stats.best, van: st.stats.vanHits });
  }
  console.log(name);
  for (const r of rows) console.log(`  ${r.won ? 'WON ' : 'out '} district ${r.d + (r.won ? 0 : 1)} score ${r.score} ${r.t}s | per district ${r.per} | ${r.fail} best ${r.best} van ${r.van}`);
}
