// node tests/demo.cjs — picks a strong-bot run whose first 45 s show the most pileup score, with a pileup inside its
// first 12 s, and writes demo.js for the attract loop
const fs = require('fs'), path = require('path'), S = require('../core.js'), B = require('../bots.js');
const TICKS = 60 * 47;
let best = null;
for (let seed = 1; seed <= 30; seed++) {
  const st = S.create(seed), f = B.strong(seed), inputs = [];
  let first = 0;
  while (st.t < TICKS && !st.over && st.stats.deaths === 0) { const i = f(st); if (i.d) inputs.push([st.t, i.d]); S.step(st, i); if (!first && st.score) first = st.t; }
  if (st.stats.deaths === 0 && first && first < 60 * 12 && (!best || st.score > best.score)) best = { seed, score: st.score, ticks: st.t, inputs, best: st.stats.best };
}
const out = `// PILEUP — attract-mode demo: a recorded strong-bot run (seed ${best.seed}, ${best.score} points, best pileup ${best.best}), replayed through the rules. Written by tests/demo.cjs.\nwindow.PILEUP_DEMO = ${JSON.stringify({ seed: best.seed, ticks: best.ticks, inputs: best.inputs })};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'demo.js'), out);
console.log('demo seed', best.seed, 'score', best.score, 'best pileup', best.best, 'inputs', best.inputs.length);
