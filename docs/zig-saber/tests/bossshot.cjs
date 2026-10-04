// stills of the gate fight. node tests/bossshot.cjs
const { chromium } = require('playwright'), path = require('path');
require('fs').mkdirSync(path.resolve(__dirname, '../evidence'), { recursive: true });
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 768, height: 672 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?zone=2'); await p.waitForTimeout(300); await p.keyboard.press('Space');
  await p.waitForFunction(() => __game.state.phase === 'play');
  await p.evaluate(() => { const s = __game.state, bot = ZSBots.precise(); s.camX = (s.course.end + 2) * 8 - 44; s.ship.y = 120; s.enemies = []; s.nextEv = 1e9; s.lives = 9; __game.pilot = q => bot(q); });
  await p.waitForFunction(() => __game.state.boss && __game.state.enemies.some(e => e.type === 'plate' && e.x < 170), null, { timeout: 20000 });
  await p.screenshot({ path: path.resolve(__dirname, '../evidence/boss-plate.png') });
  await p.waitForFunction(() => __game.state.boss && __game.state.boss.plates.some(q => q.s === 'open') && __game.state.shot, null, { timeout: 20000, polling: 16 });
  await p.screenshot({ path: path.resolve(__dirname, '../evidence/boss-open.png') });
  await p.waitForFunction(() => __game.state.phase === 'clear', null, { timeout: 60000 }); await p.waitForTimeout(1200);
  await p.screenshot({ path: path.resolve(__dirname, '../evidence/boss-clear.png') });
  console.log(errs.length ? 'ERRORS ' + errs.join('\n') : 'no errors'); await b.close();
})();
