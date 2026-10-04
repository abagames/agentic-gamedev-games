// stills of the strongest feedback moments. node tests/feelshot.cjs
const { chromium } = require('playwright'), path = require('path');
require('fs').mkdirSync(path.resolve(__dirname, '../evidence'), { recursive: true });
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 768, height: 672 } });
  await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?zone=1'); await p.waitForTimeout(300); await p.keyboard.press('Space');
  await p.waitForFunction(() => __game.state.phase === 'play'); 
  await p.evaluate(() => { const s = __game.state, K = ZS.KIND.train; s.nextEv = 1e9; s.trains[99] = { killed: 0, escaped: false, n: 3 }; for (let k = 0; k < 3; k++) s.enemies.push({ type: 'train', x: 60 + k * 18, y: s.ship.y, v: K.v, w: K.w, h: K.h, train: 99, warn: 0, age: 99 }); __game.button(); __game.tick(); __game.tick(); __game.render(); });
  await p.screenshot({ path: path.resolve(__dirname, '../evidence/feel-cut.png') });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const s = __game.state, K = ZS.KIND.shell; s.enemies.push({ type: 'shell', x: 150, y: s.ship.y, v: K.v, w: K.w, h: K.h, train: 0, warn: 0, age: 99 }); s.enemies.push({ type: 'rusher', x: 250, y: s.ship.y+30, v: 4, w: 14, h: 8, train: 0, warn: 30, age: 9 }); s.enemies.push({ type: 'drone', x: 200, y: s.ship.y-30, v: 1.7, w: 12, h: 10, train: 0, warn: 0, age: 9 }); __game.button(); for (let i = 0; i < 9; i++) __game.tick(); __game.render(); });
  await p.screenshot({ path: path.resolve(__dirname, '../evidence/feel-shot.png') });
  await b.close();
})();
