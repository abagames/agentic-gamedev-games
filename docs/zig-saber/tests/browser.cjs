// Browser flow through real input events, plus feel checks on the rendered game. node tests/browser.cjs
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const EV = path.resolve(__dirname, '../evidence'); fs.mkdirSync(EV, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 768, height: 672 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
  const shot = name => p.screenshot({ path: path.join(EV, name + '.png') });
  const ev = (f, a) => p.evaluate(f, a);
  const untilPlay = () => p.waitForFunction(() => __game.state && __game.state.phase === 'play', null, { timeout: 6000 });
  // quiet stretch of the lead-in: no script, a foe placed by hand
  const calm = () => ev(() => { const s = __game.state; s.nextEv = 1e9; s.pending = []; s.enemies = []; s.shot = null; s.ship.y = 120; s.ship.dir = -1; s.camX = 320; });

  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.goto(URL); await p.waitForTimeout(500);
  ok('loads on the title page', (await ev(() => __game.mode)) === 'title' && (await ev(() => __game.attract)) === 'title'); await shot('b-title');
  await ev(() => __game.setTitleT(479)); await p.waitForTimeout(700);
  const t0 = await ev(() => __game.demo.t); await p.waitForTimeout(500);
  ok('attract: a demo plays itself', (await ev(() => __game.attract)) === 'demo' && (await ev(() => __game.demo.t)) > t0); await shot('b-demo');
  await ev(() => __game.setTitleT(1600)); await p.waitForTimeout(150);
  ok('attract: then the best five', (await ev(() => __game.attract)) === 'best'); await shot('b-best');
  ok('attract makes no sound requests', (await ev(() => __game.audio.state)) === 'none');

  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok('the button starts a game at READY', await ev(() => __game.mode === 'play' && __game.state.phase === 'ready')); await shot('b-ready');
  await untilPlay(); ok('READY hands over to play', true);
  await calm(); await p.keyboard.press('Space'); await p.waitForTimeout(60);
  ok('Space: the ship turns and fires', await ev(() => __game.state.ship.dir === 1 && __game.state.stats.presses === 1 && !!__game.state.shot));
  await calm(); const pr0 = await ev(() => __game.state.stats.presses); await p.keyboard.press('KeyZ'); await p.waitForTimeout(60);
  ok('Z is the same button', (await ev(() => __game.state.stats.presses)) === pr0 + 1);
  await calm(); await p.mouse.click(20, 600); await p.waitForTimeout(60);
  ok('so is a click or touch anywhere on the page', (await ev(() => __game.state.stats.presses)) === pr0 + 2);
  await calm(); await p.keyboard.down('Space'); await p.waitForTimeout(300); await p.keyboard.up('Space');
  ok('holding the button is one press', (await ev(() => __game.state.stats.presses)) === pr0 + 3);
  // hit stop on a cut, and a press made during it is kept
  await calm(); await ev(() => { const s = __game.state, K = ZS.KIND.train; s.trains[99] = { killed: 0, escaped: false, n: 3 }; for (let k = 0; k < 3; k++) s.enemies.push({ type: 'train', x: 60 + k * 18, y: s.ship.y, v: K.v, w: K.w, h: K.h, train: 99, warn: 0, age: 99 }); __game.button(); __game.tick(); });
  const fz = await ev(() => ({ freeze: __game.freeze, blade: __game.fx.blade && __game.fx.blade.n, cut: __game.state.stats.cut, t: __game.state.t, items: __game.state.items.length }));
  ok('a three-cut freezes the frame and draws the blade', fz.freeze >= 6 && fz.blade === 3 && fz.cut === 3 && fz.items === 1, fz);
  await ev(() => { __game.button(); __game.tick(); });
  ok('a press during the freeze waits', await ev(t => __game.state.t === t && __game.pressQ === 1, fz.t));
  await p.waitForTimeout(350); await shot('b-cut');
  ok('and is played when time resumes', await ev(() => __game.pressQ === 0 && __game.state.stats.presses >= 2));
  // pause
  await p.keyboard.press('KeyP'); const tp = await ev(() => __game.state.t); await p.waitForTimeout(200);
  ok('P pauses', await ev(t => __game.paused && __game.state.t === t, tp)); await shot('b-pause');
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok('the button resumes without turning the ship', await ev(() => !__game.paused));
  // a bot flies the rest: capsule, laser, zone change
  await ev(() => { const bot = ZSBots.precise(); __game.pilot = s => bot(s); __game.state.lives = 9; ZS.placeAt(__game.state, 0); });
  await p.waitForFunction(() => __game.state.stats.caps >= 2, null, { timeout: 90000 }); await p.waitForTimeout(100);
  ok('a capsule is collected in real play', await ev(() => __game.state.laser > 0)); await shot('b-laser');
  await p.waitForFunction(() => __game.state.stats.longCuts >= 1 && __game.fx.blade && __game.fx.blade.lv > 0, null, { timeout: 50000, polling: 16 }); await shot('b-beam');
  ok('and the lengthened blade cuts beyond its base reach', true);
  await ev(() => { const s = __game.state; s.zone = 0; s.boss = null; s.camX = s.course.zones[0].c1 * 8 - 44 - 40; s.ship.y = 120; s.enemies = []; });
  await p.waitForFunction(() => __game.state.zone === 1, null, { timeout: 8000 }); await p.waitForTimeout(500); await shot('b-zone');
  ok('zone change shows its banner', await ev(() => !!__game.fx.banner));
  // death and restart at the checkpoint
  await ev(() => { __game.pilot = () => false; __game.state.lives = 2; });
  await p.waitForFunction(() => __game.state.phase === 'dead', null, { timeout: 8000 }); await p.waitForTimeout(250); await shot('b-death');
  const deathX = await ev(() => __game.state.camX);
  ok('not pressing ends on the rock', await ev(() => __game.state.lives === 1 && __game.fx.parts.length > 10));
  await p.waitForFunction(() => __game.state.phase === 'ready', null, { timeout: 5000 });
  ok('then READY again about two seconds back, not at the start of the zone', await ev(x => { const b = x - __game.state.camX; return b >= 140 && b < 420 && __game.state.laser === 0; }, deathX), await ev(x => x - __game.state.camX, deathX));
  await ev(() => { __game.state.score = 50000; });
  await p.waitForFunction(() => __game.mode === 'over', null, { timeout: 30000 }); await shot('b-over');
  ok('the last ship lost is GAME OVER', true);
  await p.waitForFunction(() => __game.mode === 'table', null, { timeout: 6000 }); await p.waitForTimeout(300);
  ok('a ranking score is written down at once under the call sign dealt at game start', await ev(() => { const r = __game.readRank()[3]; return __game.entry.rank === 3 && r.s === 50000 && __game.names.includes(r.n) && r.n === __game.entry.name; }), await ev(() => __game.readRank()[3]));
  await shot('b-table'); await p.waitForTimeout(800); await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok('the button returns to the title', (await ev(() => __game.mode)) === 'title');
  await p.goto(URL); await p.waitForTimeout(300);
  ok('the ranking survives a reload', await ev(() => __game.readRank()[3].s === 50000));
  // second run: restart, low score skips entry
  await p.keyboard.press('Enter'); await untilPlay();
  const n1 = await ev(() => __game.readRank()[3].n);
  ok('each game deals a pilot name from the fixed roster of three-letter call signs', await ev(() => __game.names.includes(__game.entry.name) && __game.names.length >= 40 && __game.names.every(n => /^[A-Z]{3}$/.test(n)) && new Set(__game.names).size === __game.names.length), [n1, await ev(() => __game.entry.name)]);
  ok('a second game starts clean', await ev(() => __game.state.score === 0 && __game.state.lives === ZS.C.LIVES && __game.state.loop === 0));
  await ev(() => { __game.state.lives = 1; }); await p.waitForFunction(() => __game.mode === 'table', null, { timeout: 15000 });
  ok('a score below the table goes straight to the table', await ev(() => __game.entry.rank === -1 && __game.readRank().length === 5));
  ok('with one score saved, the table still ends on a default low enough to beat (30000)', await ev(() => __game.readRank()[4].def === true && __game.readRank()[4].s === 30000));
  // visibility
  await p.waitForTimeout(800); await p.keyboard.press('Space'); await p.waitForTimeout(200); await p.keyboard.press('Space'); await untilPlay();
  await ev(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(150);
  ok('a hidden page pauses the game and suspends audio', await ev(() => __game.paused && __game.audio.state !== 'running'), await ev(() => __game.audio.state));
  await ev(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(150);
  ok('and audio resumes when it is shown again', (await ev(() => __game.audio.state)) === 'running');
  await p.keyboard.press('KeyM'); ok('M mutes', await ev(() => __game.audio.muted));
  ok('no console errors', errs.length === 0, errs);
  console.log(n + ' checks passed'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
