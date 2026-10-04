// per-loop deaths and score of one bot, starting each loop fresh. usage: node tests/loops.cjs [bot] [maxLoop]
const ZS = require('../core.js'), B = require('../bots.js');
const which = process.argv[2] || 'precise', L = +process.argv[3] || 5;
for (let loop = 0; loop <= L; loop++) {
  const seeded = which === 'human' || which === 'expert', seeds = seeded ? 6 : 1; let d = 0, sc = 0, z = 0, by = {}, ev = ZS.buildCourse(loop).events.length;
  for (let s = 1; s <= seeds; s++) {
    const st = ZS.newGame({ loop }), bot = seeded ? B[which](s) : B[which](); st.lives = 99;
    while (st.stats.loops < 1 && st.t < 60 * 60 * 8) ZS.step(st, st.phase === 'play' && bot(st));
    d += st.stats.deaths; sc += st.score; z += st.stats.zones; for (const k in st.stats.deathBy) by[k] = (by[k] || 0) + st.stats.deathBy[k];
  }
  console.log(which, 'loop', loop + 1, 'waves', ev, 'deaths', (d / seeds).toFixed(1), 'score', (sc / seeds).toFixed(0), JSON.stringify(by));
}
