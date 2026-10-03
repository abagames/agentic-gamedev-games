// Bot ladder over seeds. usage: node tests/balance.cjs [seeds] [oracleSeeds]
const HR = require('../core.js'), B = require('../bots.js');
const N = +process.argv[2] || 12, NO = +process.argv[3] || 3;
function summary(name, mk, n, opts) {
  const rs = []; for (let s = 1; s <= n; s++) rs.push(B.run(mk(s), s, opts));
  const m = f => (rs.reduce((a, r) => a + f(r), 0) / rs.length);
  const med = [...rs].map(r => r.score).sort((a, b) => a - b)[rs.length >> 1];
  console.log(name.padEnd(14), 'mean', m(r => r.score).toFixed(0).padStart(7), 'med', String(med).padStart(7), 'crash', m(r => r.stats.crashes).toFixed(1), 'flags', m(r => r.stats.refills).toFixed(1), 'tier', m(r => r.tier).toFixed(1),
    'eats', m(r => r.stats.eats).toFixed(1), 'maxCh', m(r => r.stats.maxChain).toFixed(1), 'chain%', (100 * m(r => r.stats.chainScore) / Math.max(1, m(r => r.score))).toFixed(0), 'wakes', m(r => r.stats.wakes).toFixed(1), 'pow', m(r => r.stats.powers).toFixed(1), 'wasted', m(r => r.stats.wasted).toFixed(1), 'shift/min', m(r => r.perMin).toFixed(0));
  return rs;
}
summary('idle', () => B.simple.idle(), N);
summary('holdBoost', () => B.simple.holdBoost(), N);
summary('mash', s => B.simple.mash(s), N);
summary('greedy', () => B.simple.greedy(), N);
summary('human', s => B.human(s), N);
summary('human-noconv', s => B.human(s), N, { convoy: false });
summary('oracle', () => B.oracle(), NO);
summary('oracle-alwaysB', () => B.oracle({ boosts: [1] }), 1);
summary('oracle-noconv', () => B.oracle(), NO, { convoy: false });
