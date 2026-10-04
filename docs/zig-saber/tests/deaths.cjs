// where and how a bot dies. usage: node tests/deaths.cjs [seeds] [json opts for human]
const ZS = require('../core.js'), B = require('../bots.js');
const N = +process.argv[2] || 8, o = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const hist = {}; let tot = 0, zs = 0, sc = 0;
for (let s = 1; s <= N; s++) {
  const st = ZS.newGame(), bot = B.human(s, o);
  while (st.phase !== 'over' && st.t < 60 * 60 * 10 && st.stats.loops < 1) {
    ZS.step(st, st.phase === 'play' && bot(st));
    for (const e of st.events) if (e.type === 'death') { const k = Math.floor((st.camX + 44) / 8 / 20) * 20 + ':' + e.cause; hist[k] = (hist[k] || 0) + 1; tot++; }
  }
  zs += st.stats.zones; sc += st.score;
}
console.log('zones/run', (zs / N).toFixed(2), 'score', (sc / N).toFixed(0), 'deaths', tot);
console.log(Object.entries(hist).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([k, v]) => k + ' x' + v).join('  '));
