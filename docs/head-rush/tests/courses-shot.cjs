// Screenshot every course layout at READY (visual review aid). node tests/courses-shot.cjs
const { chromium } = require('playwright'), path = require('path');
require('fs').mkdirSync(path.resolve(__dirname, '../evidence'), { recursive: true });
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 720, height: 816 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const n = require('../core.js').COURSES.length;
  for (let c = 0; c < n; c++) {
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?course=' + c);
    await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    await p.screenshot({ path: path.resolve(__dirname, '../evidence/course' + c + '.png') });
  }
  console.log('errors', errs); await b.close();
})();
