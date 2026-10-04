// Screenshots of the main screens. node tests/shots.cjs
const { chromium } = require('playwright'), path = require('path');
require('fs').mkdirSync(path.resolve(__dirname, '../evidence'), { recursive: true });
const EV = path.resolve(__dirname, '../evidence');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 768, height: 672 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(600);
  const shot = n => p.screenshot({ path: path.join(EV, n + '.png') });
  await shot('title');
  await p.evaluate(() => __game.setTitleT(700)); await p.waitForTimeout(2500); await shot('demo');
  await p.evaluate(() => __game.setTitleT(1600)); await p.waitForTimeout(200); await shot('best');
  for (const z of [0, 1, 2]) {
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?zone=' + z); await p.waitForTimeout(300);
    await p.keyboard.press('Space'); await p.waitForTimeout(300); await shot('ready' + z);
    await p.evaluate(() => { const bot = ZSBots.precise(); __game.pilot = s => bot(s); });
    for (let i = 0; i < 6; i++) { await p.waitForTimeout(3300); await shot('play' + z + '-' + i); }
  }
  console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no errors'); await b.close();
})();
