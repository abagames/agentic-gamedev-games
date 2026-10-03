// Browser flow test through real key events. node tests/browser.cjs
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const EV = path.resolve(__dirname, '../evidence'); fs.mkdirSync(EV, { recursive: true });
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 720, height: 816 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
  const shot = name => p.screenshot({ path: path.join(EV, name + '.png') });
  const ev = f => p.evaluate(f);
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(800);
  const d0 = await ev(() => __game.demo.tick); await p.waitForTimeout(400);
  ok('title attract demo runs', (await ev(() => __game.mode)) === 'title' && (await ev(() => __game.demo.tick)) > d0);
  await shot('b-title');
  // attract cycle: title -> pure demo (no logo, no table) -> best 5
  ok('attract opens on the title page', (await ev(() => __game.attract)) === 'title');
  await ev(() => __game.setTitleT(419)); await p.waitForTimeout(120);
  ok('then a pure demo scene, restarted from READY', await ev(() => __game.attract === 'demo' && __game.demo.tick < 30));
  await shot('b-demo');
  await ev(() => __game.setTitleT(1619)); await p.waitForTimeout(120); ok('then the best-5 table', (await ev(() => __game.attract)) === 'best');
  await ev(() => __game.setTitleT(0)); await p.waitForTimeout(60);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(80); ok('the title has no course selection', (await ev(() => __game.sel.course)) === 0);
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  ok('the run starts on CLASSIC and lasts 3:00', await ev(() => __game.state.course === 0 && __game.state.timeLeft === HR.C.TIME));
  // back to title for the sprint checks below
  await p.goto('file://' + path.resolve(__dirname, '../index.html')); await p.waitForTimeout(500);
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  ok('Enter starts a run in READY', await ev(() => __game.mode === 'play' && __game.state.phase === 'ready'));
  await p.waitForFunction(() => __game.state.phase === 'play', null, { timeout: 5000 });
  ok('READY hands over to play', true);
  // put the car before the top gap (Down = toward the centre there), no rivals around
  const setup = () => ev(() => { const s = __game.state; s.leader = null; s.followers = []; s.dormant = []; s.flying = []; s.leaderWait = -1e9; const p = s.player; p.r = 1; p.s = HR.wrap(-40, 1); p.zk = -1; p.can = false; p.slT = 0; });
  await setup(); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(700);
  ok('ArrowDown on the top side turns inward at the gap', (await ev(() => __game.state.player.r)) === 2);
  await setup(); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(700);
  ok('ArrowUp on the top side turns outward', (await ev(() => __game.state.player.r)) === 0);
  await setup(); await p.keyboard.down('Space'); await p.keyboard.down('KeyS'); await p.waitForTimeout(500); await p.keyboard.up('KeyS'); await p.keyboard.up('Space');
  ok('holding S with Space crosses just one lane', (await ev(() => __game.state.player.r)) === 2);
  await setup(); await p.keyboard.down('KeyS'); await p.waitForTimeout(500); await p.keyboard.up('KeyS');
  ok('holding S at normal speed crosses two lanes', (await ev(() => __game.state.player.r)) === 3);
  await setup(); await ev(() => { __game.state.player.s = HR.wrap(-14, 1); }); await p.keyboard.down('KeyS'); await p.waitForTimeout(110); await p.keyboard.up('KeyS'); await p.waitForTimeout(400);
  ok('a normal key press at the gap moves exactly one lane', (await ev(() => __game.state.player.r)) === 2);
  await setup(); await p.keyboard.down('Space'); await p.waitForTimeout(150); ok('Space accelerates', await ev(() => __game.state.player.boost)); await p.keyboard.up('Space');
  // path indicator: only near a gap, and it predicts the lane the real input reaches
  const setupFar = () => ev(() => { const s = __game.state; s.leader = null; s.followers = []; s.dormant = []; s.cruisers = []; s.leaderWait = -1e9; const q = s.player; q.r = 0; q.s = HR.wrap(HR.gapS(0, 3) - 120, 0); q.zk = -1; q.can = false; q.slT = 0; });
  await setupFar(); await p.waitForTimeout(60); ok('no path indicator far from a gap', (await ev(() => __game.path)) === null);
  for (const [hold, name] of [[330, 'held Left'], [0, 'no input']]) {
    await ev(() => { const s = __game.state, q = s.player; q.r = 0; q.s = HR.wrap(HR.gapS(0, 3) - 50, 0); q.zk = -1; q.can = false; q.slT = 0; });
    if (hold) await p.keyboard.down('ArrowLeft');
    await p.waitForTimeout(hold ? 200 : 120); const pred = await ev(() => __game.path && __game.path.lane);
    await p.waitForTimeout(700); if (hold) await p.keyboard.up('ArrowLeft');
    const got = await ev(() => __game.state.player.r);
    ok('path indicator predicts the lane reached (' + name + ')', pred === got && pred != null, { pred, got });
  }
  await shot('b-path');
  // cruiser warning line: in the player's lane it shows the lane ahead of the truck (it drives clockwise, s decreasing)
  const cw = await ev(() => { const s = __game.state, q = s.player; s.fright = 0; s.leader = null; s.followers = [];
    q.r = 2; q.s = HR.wrap(HR.gapS(2, 3) - 120, 2); q.zk = -1; q.can = false; q.slT = 0;
    s.cruisers = [{ id: 501, r: 2, s: HR.wrap(q.s + 150, 2) }, { id: 502, r: 4, s: 20 }]; __game.tick();
    const cp = __game.cpaths, c = s.cruisers.find(x => x.id === 501);
    const mine = cp.find(x => x.id === 501), other = cp.find(x => x.id === 502);
    const [x0, y0] = HR.pos(c.r, c.s - 10), [x1, y1] = HR.pos(c.r, c.s - 40);
    return { mine: !!mine, other: !!other, lane: mine && mine.r, first: mine && mine.pts[0], expect0: [x0, y0], hit40: mine && mine.pts.some(p => Math.hypot(p[0] - x1, p[1] - y1) < 2) }; });
  ok('a cruiser in your lane shows its warning line ahead of it, on its own lane', cw.mine && cw.lane === 2 && cw.hit40 && Math.hypot(cw.first[0] - cw.expect0[0], cw.first[1] - cw.expect0[1]) < 3, cw);
  ok('a cruiser in another lane shows no line away from a gap', !cw.other, cw);
  await ev(() => { const s = __game.state; s.player.s = HR.wrap(HR.gapS(2, 3) - 30, 2); __game.tick(); });
  ok('near a gap every cruiser shows its line', await ev(() => __game.cpaths.length === 2));
  await ev(() => { const s = __game.state; s.leader = { id: 503, r: 0, s: HR.wrap(s.player.s + 300, 0), zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; s.trail = [{ d: -200, x: 0, y: 0, r: 0, s: 0 }, { d: 0, x: 0, y: 0, r: 0, s: 0 }]; s.fright = 200; __game.tick(); });
  ok('no cruiser line while powered', await ev(() => __game.state.fright > 0 && __game.cpaths.length === 0));
  await ev(() => { const s = __game.state; s.leader = null; });
  await ev(() => { const s = __game.state; s.fright = 0; s.cruisers = []; });
  await p.waitForTimeout(100); await shot('b-cruiser-line');
  // pause / mute / blur
  await p.keyboard.press('KeyP'); const t1 = await ev(() => __game.state.tick); await p.waitForTimeout(200);
  ok('P pauses the clock', (await ev(() => __game.state.tick)) === t1); await shot('b-pause');
  await p.keyboard.press('KeyP'); await p.waitForTimeout(100); ok('P resumes', (await ev(() => __game.state.tick)) > t1);
  await p.keyboard.press('KeyM'); ok('M mutes', await ev(() => __game.audio.muted)); await p.keyboard.press('KeyM');
  await ev(() => window.dispatchEvent(new Event('blur'))); ok('leaving the window pauses', await ev(() => __game.paused));
  await p.keyboard.press('KeyZ'); await p.waitForTimeout(50); ok('any key resumes', !(await ev(() => __game.paused)));
  // powered head-on through a live convoy
  await ev(() => {
    const s = __game.state; s.dormant = []; s.flying = []; s.returning = [];
    s.player.r = 0; s.player.s = HR.wrap(-2 * HR.RINGS[0] + 10, 0); s.player.slT = 0;
    const ls = HR.wrap(-2 * HR.RINGS[0] + 100, 0);
    s.leader = { id: 90, r: 0, s: ls, zk: -1, can: false, slT: 0, slx: 0, sly: 0 };
    s.trail = []; s.trailD = 0; for (let i = 40; i >= 0; i--) { const q = ls + i * 4; const [x, y] = HR.pos(0, q); s.trail.push({ d: -i * 4, x, y, r: 0, s: q }); }
    s.followers = [0, 1, 2, 3].map(i => ({ id: 91 + i, lag: HR.C.FOLLOW * (i + 1) })); s.fright = 300; s.chain = 0; s.score = 0;
  });
  await p.waitForTimeout(250); await shot('b-chain-mid');
  await p.waitForTimeout(1500);
  const ch = await ev(() => ({ score: __game.state.score, eats: __game.state.stats.eats, chain: __game.state.stats.maxChain }));
  ok('live powered head-on chains through the convoy', ch.chain >= 5 && ch.score >= 6200, ch);
  // crash
  await ev(() => {
    const s = __game.state; s.fright = 0; s.grace = 0; s.followers = []; s.player.r = 0; s.player.s = HR.wrap(-2 * HR.RINGS[0] + 10, 0);
    const ls = HR.wrap(-2 * HR.RINGS[0] + 60, 0); s.leader = { id: 95, r: 0, s: ls, zk: -1, can: false, slT: 0, slx: 0, sly: 0 };
  });
  await p.waitForFunction(() => __game.state.phase === 'crash', null, { timeout: 3000 }); await p.waitForTimeout(120); await shot('b-crash');
  ok('unpowered head-on crashes', true);
  await p.waitForFunction(() => __game.state.phase === 'play', null, { timeout: 5000 }); ok('play resumes after a crash', true);
  // time over → name entry → table → title, twice (qualifying, then a tie that must rank above the older entry)
  const key = (k, ms) => p.keyboard.press(k).then(() => p.waitForTimeout(ms || 60));
  await ev(() => { localStorage.clear(); __game.state.timeLeft = 30; __game.state.score = 12345; });
  await p.waitForFunction(() => __game.mode === 'over', null, { timeout: 3000 }); await ev(() => { __game.state.score = 12345; }); await p.waitForTimeout(300); await shot('b-over');
  ok('time up shows the result', true);
  await p.waitForTimeout(800); await key('Space', 100); ok('Space after TIME UP opens name entry for a top-5 score', (await ev(() => __game.mode)) === 'entry');
  await key('Space', 80); ok('grace period: the closing key types nothing', (await ev(() => __game.entry.name)) === '');
  await p.waitForTimeout(300);
  await key('Space'); await key('ArrowRight'); await key('Enter'); await key('ArrowDown'); await key('KeyZ');
  ok('letters via Space / Enter / Z with Right and Down moves', (await ev(() => __game.entry.name)) === 'ABL', await ev(() => __game.entry.name));
  ok('third letter jumps the cursor to END', (await ev(() => __game.entry.cur)) === 29);
  await key('ArrowLeft'); await key('KeyX'); ok('DEL removes a letter', (await ev(() => __game.entry.name)) === 'AB');
  await shot('b-entry');
  await key('ArrowRight'); await key('Enter', 150);
  ok('END saves and shows the table', await ev(() => __game.mode === 'table' && __game.readRank().some(r => r.n === 'AB.' && r.s === 12345)), await ev(() => [__game.mode, __game.entry, __game.readRank()]));
  await shot('b-table');
  ok('defaults are never written', await ev(() => JSON.parse(localStorage.getItem('head-rush-rank-s0')).length === 1));
  await p.waitForTimeout(700); await key('Space', 200); ok('table returns to the title', (await ev(() => __game.mode)) === 'title');
  await p.waitForTimeout(200); await key('Enter', 150);
  ok('a second run starts clean', await ev(() => __game.mode === 'play' && __game.state.score === 0 && __game.state.timeLeft === HR.C.TIME));
  await ev(() => { __game.state.timeLeft = 30; __game.state.score = 12345; });
  await p.waitForFunction(() => __game.mode === 'over'); await ev(() => { __game.state.score = 12345; }); await p.waitForTimeout(1100); await key('Space', 500);
  await key('Space'); await key('Space'); await key('Space', 150); await key('Enter', 150);
  ok('an equal score ranks above the older entry', await ev(() => { const t = __game.readRank(); const i = t.findIndex(r => r.s === 12345); return t[i].n === 'AAA' && t[i + 1].n === 'AB.'; }));
  await p.waitForTimeout(700); await key('Space', 300); await key('Enter', 150);
  await ev(() => { __game.state.timeLeft = 30; });
  await p.waitForFunction(() => __game.mode === 'over'); await ev(() => { __game.state.score = 10; }); await p.waitForTimeout(1100); await key('Space', 100);
  ok('a non-qualifying score skips entry and shows the table', (await ev(() => __game.mode)) === 'table');
  // running out of cars: GAME OVER screen, then the same entry/table path
  await p.waitForTimeout(700); await key('Space', 300); await key('Enter', 300);
  await ev(() => { const s = __game.state; s.lives = 1; s.grace = 0; s.fright = 0; s.followers = []; s.dormant = []; s.cruisers = []; s.score = 20000; s.nextExtend = 1e9;
    s.player.r = 0; s.player.s = HR.wrap(-2 * HR.RINGS[0] + 10, 0); const ls = HR.wrap(-2 * HR.RINGS[0] + 60, 0); s.leader = { id: 96, r: 0, s: ls, zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; });
  await p.waitForFunction(() => __game.mode === 'over', null, { timeout: 5000 }); await p.waitForTimeout(200); await shot('b-gameover');
  ok('losing the last car shows GAME OVER', await ev(() => __game.state.overReason === 'lives' && __game.state.timeLeft > 0));
  await p.waitForTimeout(800); await key('Space', 200); ok('GAME OVER leads to name entry for a top-5 score', (await ev(() => __game.mode)) === 'entry');
  await p.waitForTimeout(400); await key('ArrowLeft'); await key('Space', 300); ok('END from the entry board saves and shows the table', (await ev(() => __game.mode)) === 'table');
  // headless Chromium does not hide a tab on bringToFront, so this is a synthetic visibility check (not physical evidence)
  await p.waitForTimeout(800); await key('Space', 300); await key('Enter', 300);
  const setHidden = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true); await p.waitForTimeout(500);
  const hid = await ev(() => [__game.audio.state, __game.paused, __game.mode]);
  await setHidden(false); await p.waitForTimeout(150);
  const vis = await ev(() => __game.audio.state);
  ok('(synthetic) hidden suspends audio and pauses play; visible resumes audio', hid[0] === 'suspended' && hid[1] === true && vis === 'running', { hid, vis });
  ok('a fresh run starts with 2 reserve cars (3 in all)', await ev(() => __game.state.lives === 3));
  ok('sound runs on the two-PSG model (AudioWorklet or ScriptProcessor fallback)', await ev(() => ['worklet', 'script'].includes(__game.audio.backend) && __game.audio.state === 'running'), await ev(() => [__game.audio.backend, __game.audio.state]));
  ok('renderer exposes palette roles and sprite sizes (cars 13x9, 5x7 font)', await ev(() => { const v = __game.visual; return v.palette.me === '#f8e800' && v.sprite.car.join() === '13,9' && v.sprite.font.join() === '5,7,6'; }));
  ok('no console errors', errs.length === 0, errs);
  console.log(n, 'browser checks passed');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
