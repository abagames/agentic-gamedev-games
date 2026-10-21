// node tests/district.cjs [seeds] [policies] [cx:cy,...] [off] — one life in each district: does it clear, how long, what ends it
// off: comma list of elements switched off (oneway,bridge,van,dog)
const S = require('../core.js'), A = require('./adapter.cjs'), B = require('../bots.js');
const SEED0 = +process.env.SEED0 || 1;
const n = +process.argv[2] || 6, names = (process.argv[3] || 'human,strong').split(','), ds = (process.argv[4] || '0:0,0:-1,1:0,0:1,-1:0,1:1').split(',').map(s => s.split(':').map(Number));   // districts as cx:cy
const off = {}, zone = process.env.ZONE; for (const k of (process.argv[5] || '').split(',').filter(Boolean)) off[k] = true;
for (const d of ds) for (const name of names) {
  let clears = 0, tClear = 0, score = 0, cars = 0, opened = 0, river = 0, van = 0, cuts = 0, revs = 0, secs = 0; const causes = {}, ends = [];
  for (let seed = SEED0; seed < SEED0 + n; seed++) {
    const st = S.create(seed, { at: d, off, zone });
    st.lives = 1;
    let prevDir = 0;
    const pol = name.startsWith('blind-') ? B[name.split('-')[1]](seed, { blind: off.__blind || { [name.split('-')[2]]: true } }) : A.policies[name].make(seed);
    let t0 = 0, done = false;
    while (!done && st.t < 60 * 300) {
      A.step(st, pol(st));
      for (const e of st.events) {
        if (e.type === 'go') t0 = st.t;
        if (e.type === 'exit') opened++;
        if (e.type === 'clear') { clears++; tClear += (st.t - t0) / 60; ends.push(((st.t - t0) / 60 | 0) + 's'); done = true; }
        if (e.type === 'death') { causes[e.cause] = (causes[e.cause] || 0) + 1; ends.push('x' + ((st.t - t0) / 60 | 0)); done = true; }
      }
    }
    score += st.score; cars += st.stats.cars; van += st.stats.vanHits; secs += (st.t - t0) / 60;
  }
  console.log(`${d.join(':').padEnd(5)} ${(zone || 'drawn').padEnd(9)} ${name.padEnd(14)} clear ${clears}/${n} exit opened ${opened}/${n} | ${ends.join(' ')} | cars/run ${(cars / n).toFixed(1)} score/run ${(score / n) | 0} | ${JSON.stringify(causes)} | vanhits ${van} | cars/min ${(cars / secs * 60).toFixed(1)}`);
}
