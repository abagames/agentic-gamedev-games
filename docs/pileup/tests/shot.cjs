// node tests/shot.cjs <policy> <seed> <cx:cy> <ticks...> — plays a bot's run in the page from that district and saves
// screenshots at those ticks of play to evidence/shots/
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const S = require('../core.js'), A = require('./adapter.cjs');
(async () => {
  const [pol, seed, at] = [process.argv[2] || 'strong', +process.argv[3] || 1, (process.argv[4] || '0:0').split(':').map(Number)];
  const ticks = process.argv.slice(5).map(Number);
  const out = path.join(__dirname, '..', 'evidence', 'shots'); fs.mkdirSync(out, { recursive: true });
  const st = S.create(seed, { at }), f = A.policies[pol].make(seed), inputs = [];
  while (!st.over && st.t < Math.max(...ticks)) { const i = f(st); inputs.push(i.d || 0); S.step(st, i); }
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1008, height: 928 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.join(__dirname, '..', 'index.html') + '?manual=1');
  await p.evaluate(([seed, at]) => { __test.load(PILEUP.create(seed, { at })); }, [seed, at]);
  for (let t = 0; t < inputs.length; t++) {
    await p.evaluate((d) => { if (d) __test.steer(d); __test.advance(1); }, inputs[t]);
    if (ticks.includes(t + 1)) await p.screenshot({ path: path.join(out, `${pol}-s${seed}-${at.join('_')}-t${t + 1}.png`) });
  }
  console.log('page', await p.evaluate(() => S0 = __test.state.hash ? 0 : PILEUP.hash(__test.state)), 'rules', S.hash(st), errs.length ? errs : 'no errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
