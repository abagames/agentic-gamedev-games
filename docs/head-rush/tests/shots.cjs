// Screenshots of title and live play driven by the oracle bot (visual review aid).
const { chromium } = require('playwright'), path = require('path');
require('fs').mkdirSync(path.resolve(__dirname, '../evidence'), { recursive: true });
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 720, height: 816 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?test');
  await p.waitForTimeout(1500); await p.screenshot({ path: path.resolve(__dirname, '../evidence/title.png') });
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.evaluate(() => { const pol = HRBots.oracle(); window.__pol = pol; });
  // drive the live game with the oracle for N ticks, then screenshot
  for (const [n, name] of [[400, 'play1'], [4000, 'play2'], [6000, 'play3']]) {
    await p.evaluate(([n, name]) => { const g = __game; for (let i = 0; i < n; i++) { const s = g.state; HR.step(s, __pol(s)); if (s.tier >= 4 && (name === 'play3' ? s.leader && s.followers.length >= 3 && s.fright === 0 && s.player.boost : s.fright > 30 && s.followers.length > 2)) break; } g.render(); }, [n, name]);
    await p.screenshot({ path: path.resolve(__dirname, '../evidence/' + name + '.png') });
  }
  console.log('errors', errs);
  await b.close();
})();
