// Gamepad (stubbed getGamepads) and touch (emulated touchscreen) input. node tests/input-devices.cjs
const { chromium } = require('playwright'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch(); let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
  const url = 'file://' + path.resolve(__dirname, '../index.html');
  const setup = p => p.evaluate(() => { const s = __game.state; s.phase = 'play'; s.first = false; s.leader = null; s.followers = []; s.dormant = []; s.cruisers = []; s.leaderWait = -1e9; const q = s.player; q.r = 1; q.s = HR.wrap(-40, 1); q.zk = -1; q.can = false; q.slT = 0; });
  // --- gamepad ---
  const p = await b.newPage({ viewport: { width: 720, height: 816 } });
  await p.addInitScript(() => { window.__pad = { connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [window.__pad]; });
  await p.goto(url); await p.waitForTimeout(400);
  const btn = async (i, ms) => { await p.evaluate(i => { __pad.buttons[i].pressed = true; }, i); await p.waitForTimeout(ms || 60); await p.evaluate(i => { __pad.buttons[i].pressed = false; }, i); await p.waitForTimeout(60); };
  await btn(15); ok('pad d-pad right on the title does nothing (no course select)', (await p.evaluate(() => __game.sel.course === 0 && __game.mode === 'title')));
  await btn(0); await p.waitForTimeout(100); ok('pad A starts a run', await p.evaluate(() => __game.mode === 'play'));
  await setup(p); await btn(13, 60); await p.waitForTimeout(600); ok('pad d-pad down turns inward at the top gap', (await p.evaluate(() => __game.state.player.r)) === 2);
  await setup(p); await p.evaluate(() => { __pad.axes[1] = -0.9; }); await p.waitForTimeout(90); await p.evaluate(() => { __pad.axes[1] = 0; }); await p.waitForTimeout(600);
  ok('left stick up turns outward', (await p.evaluate(() => __game.state.player.r)) === 0);
  await p.evaluate(() => { __pad.buttons[5].pressed = true; }); await p.waitForTimeout(100); ok('R1 held accelerates', await p.evaluate(() => __game.state.player.boost)); await p.evaluate(() => { __pad.buttons[5].pressed = false; });
  await btn(9); ok('Start pauses', await p.evaluate(() => __game.paused)); await btn(9); ok('Start resumes', !(await p.evaluate(() => __game.paused)));
  // --- touch ---
  const ctx = await b.newContext({ hasTouch: true, viewport: { width: 480, height: 544 } }), t = await ctx.newPage();
  await t.goto(url); await t.waitForTimeout(400);
  const box = await t.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const at = (lx, ly) => [box.x + lx / 240 * box.w, box.y + ly / 272 * box.h];
  await t.touchscreen.tap(...at(120, 200)); await t.waitForTimeout(150); ok('tap starts a run', await t.evaluate(() => __game.mode === 'play'));
  await setup(t); await t.touchscreen.tap(...at(120, 144)); await t.waitForTimeout(600); ok('tap inside your lane ring turns inward', (await t.evaluate(() => __game.state.player.r)) === 2);
  await setup(t); await t.touchscreen.tap(...at(5, 30)); await t.waitForTimeout(600); ok('tap outside your lane ring turns outward', (await t.evaluate(() => __game.state.player.r)) === 0);
  console.log(n, 'input-device checks passed (touch is emulated, not a real device)'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
