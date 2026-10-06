// The game on a phone-sized touch screen. node tests/touch.cjs
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const EV = path.resolve(__dirname, '../evidence'); fs.mkdirSync(EV, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
  const ev = (f, a) => p.evaluate(f, a);
  await p.goto(URL); await p.waitForTimeout(400);
  const box = await ev(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, left: r.left }; });
  ok('on a phone the screen fills the width instead of staying at 1x', box.w > 380 && box.h <= 844, box);
  ok('the title asks for a tap, and names the touch controls', await ev(() => __game.touch && __game.startLabel() === 'TAP TO START' && __game.turnLabel() === 'HOLD LEFT OR RIGHT SIDE'));
  await p.screenshot({ path: path.join(EV, 't-title.png') });
  await p.touchscreen.tap(195, 500); await p.waitForTimeout(150);
  ok('a tap starts the game', await ev(() => __game.mode === 'play'));
  await p.waitForFunction(() => __game.state.bs[0].held === 0, null, { timeout: 4000 });
  // two thumbs through real pointer events: right down, left down, right up -> still turning left
  const fire = (type, id, x) => ev(([type, id, x]) => dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: 600, bubbles: true, cancelable: true })), [type, id, x]);
  const th = () => ev(() => __game.state.th);
  await fire('pointerdown', 1, 330); const a0 = await th(); await p.waitForTimeout(250); const a1 = await th();
  ok('holding the right side turns clockwise', a1 > a0 + 0.2);
  await fire('pointerdown', 2, 60); await p.waitForTimeout(250); const a2 = await th();
  ok('a second finger on the left takes over', a2 < a1 - 0.1, { a1, a2 });
  await fire('pointerup', 2, 60); await p.waitForTimeout(250); const a3 = await th();
  ok('lifting it hands back to the finger still held', a3 > a2 + 0.2, { a2, a3 });
  await fire('pointerup', 1, 330); await p.waitForTimeout(120); const a4 = await th(); await p.waitForTimeout(150);
  ok('all fingers up: the table stands still', Math.abs((await th()) - a4) < 1e-9);
  await p.touchscreen.tap(195, box.top + 20); await p.waitForTimeout(100);
  ok('a tap on the top display pauses', await ev(() => __game.paused)); await p.screenshot({ path: path.join(EV, 't-pause.png') });
  await p.touchscreen.tap(195, 500); await p.waitForTimeout(100); ok('a tap resumes', await ev(() => !__game.paused));
  ok('no console errors', errs.length === 0, errs);
  await b.close(); console.log('touch: all passed');
})().catch(e => { console.error(e); process.exit(1); });
