// the two-loop campaign: how far each profile gets. usage: node tests/campaign.cjs [seeds]
const ZS = require('../core.js'), B = require('../bots.js'), N = +process.argv[2] || 16;
for (const [name, mk, n] of [['human', s => B.human(s), N], ['expert', s => B.expert(s), Math.ceil(N / 2)], ['precise', () => B.precise(), 1]]) {
  const rs = []; for (let s = 1; s <= n; s++) rs.push(B.run(mk(s)));
  const m = f => rs.reduce((a, r) => a + f(r), 0) / n;
  console.log(name.padEnd(8), 'all clear', (100 * m(r => r.cleared ? 1 : 0)).toFixed(0) + '%', 'reach loop 2', (100 * m(r => r.loop >= 1 || r.stats.loops >= 1 ? 1 : 0)).toFixed(0) + '%', 'gates destroyed', m(r => r.gates).toFixed(2), 'score', m(r => r.score).toFixed(0), 'sec', m(r => r.t / 60).toFixed(0), 'ships lost', m(r => r.stats.deaths).toFixed(1));
}
