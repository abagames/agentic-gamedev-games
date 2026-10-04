// Bot ladder. usage: node tests/balance.cjs [humanSeeds] [loops] [which]
const ZS = require('../core.js'), B = require('../bots.js');
const N = +process.argv[2] || 6, LOOPS = +process.argv[3] || 2, which = process.argv[4] || 'all';
function row(name, mk, n, opts) {
  const t0 = Date.now(), rs = []; for (let s = 1; s <= n; s++) rs.push(B.run(mk(s), Object.assign({ loops: LOOPS }, opts)));
  const m = f => rs.reduce((a, r) => a + f(r), 0) / rs.length, S = r => r.stats;
  const by = {}; for (const r of rs) for (const k in r.stats.deathBy) by[k] = (by[k] || 0) + r.stats.deathBy[k];
  console.log(name.padEnd(12), 'score', m(r => r.score).toFixed(0).padStart(7), 'zones', m(r => r.zones).toFixed(1), 'sec', m(r => r.t / 60).toFixed(0).padStart(4), 'deaths', m(r => S(r).deaths).toFixed(1),
    'far', m(r => S(r).far).toFixed(0), 'cut', m(r => S(r).cut).toFixed(0), 'multi', m(r => S(r).multi).toFixed(0), 'long', m(r => S(r).longCuts).toFixed(0), 'decay', m(r => S(r).decays).toFixed(0), 'guard', m(r => S(r).guards).toFixed(0), 'caps', m(r => S(r).caps).toFixed(1) + '/' + m(r => S(r).capDrops).toFixed(1),
    'gems', m(r => S(r).gems).toFixed(0), 'dry%', (100 * m(r => S(r).dry) / Math.max(1, m(r => S(r).presses))).toFixed(0), 'press/s', m(r => r.perSec).toFixed(2), 'minGap', Math.min(...rs.map(r => r.minGap)), 'p10', m(r => r.p10Gap).toFixed(0), JSON.stringify(by), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  return rs;
}
const all = which === 'all';
if (all || which === 'simple') { row('idle', () => B.simple.idle(), 1); row('mash6', () => B.simple.mash(6), 1); row('mash12', () => B.simple.mash(12), 1); row('mash30', () => B.simple.mash(30), 1); row('survivor', () => B.simple.survivor(), 1); row('shooter', () => B.simple.shooter(), 1); }
if (all || which === 'human') row('human', s => B.human(s), N);
if (all || which === 'precise') row('precise', () => B.precise(), 1);
if (all || which === 'oracle') row('oracle', () => B.oracle(), 1);
