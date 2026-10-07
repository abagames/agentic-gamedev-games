// Browser flow through real input events, and the frames the notices appear in. node tests/browser.cjs
const { chromium } = require('playwright'), path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
const EV = path.resolve(__dirname, '../evidence'); fs.mkdirSync(EV, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '../index.html');
let last = '(start)'; // the last check that passed, printed if a later step fails
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 672, height: 864 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); last = name; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
  const shot = name => p.screenshot({ path: path.join(EV, name + '.png') });
  const ev = (f, a) => p.evaluate(f, a);
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.goto(URL); await p.waitForTimeout(400);
  ok('loads on the title', (await ev(() => __game.mode)) === 'title' && (await ev(() => __game.attract)) === 'title'); await shot('b-title');
  await ev(() => __game.setModeT(1e6)); await p.waitForTimeout(200); ok('attract: how to play', (await ev(() => __game.attract)) === 'rules'); await shot('b-rules');
  await ev(() => __game.setModeT(310)); await p.waitForTimeout(150); await shot('b-rules-2');
  await ev(() => __game.setModeT(610)); await p.waitForTimeout(150); await shot('b-rules-3');
  await ev(() => __game.setModeT(1e6)); await p.waitForTimeout(1500); const dt = await ev(() => __game.demo.t);
  ok('attract: a game plays itself, silently', (await ev(() => __game.attract)) === 'demo' && dt > 30 && (await ev(() => __game.audio.state)) === 'none'); await shot('b-demo');
  await ev(() => __game.setModeT(1e6)); await p.waitForTimeout(200); ok('attract: the best five', (await ev(() => __game.attract)) === 'best'); await shot('b-best');
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok('the start button begins a game with the ball held at the hub', await ev(() => __game.mode === 'play' && __game.state.bs[0].held > 0 && __game.audio.musicName === 'play')); await shot('b-ready');
  ok('the standing notice says where to land and what it gives', (await ev(() => __game.objective(__game.state))) === 'CYAN ARROW: +SAVE');
  await p.waitForFunction(() => __game.state.bs[0].held === 0, null, { timeout: 4000 }); ok('READY hands over to play', true);
  const th0 = await ev(() => __game.state.th);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(300); await p.keyboard.up('ArrowRight');
  const th1 = await ev(() => __game.state.th); ok('right turns the table clockwise', th1 > th0 + 0.3, { th0, th1 });
  await p.keyboard.down('KeyA'); await p.waitForTimeout(300); await p.keyboard.up('KeyA'); await p.waitForTimeout(80);
  const th2 = await ev(() => __game.state.th); ok('left (A) turns it back', th2 < th1 - 0.3, { th2 });
  await p.waitForTimeout(150); const th3 = await ev(() => __game.state.th); await p.waitForTimeout(150);
  ok('released, the table stands still', Math.abs((await ev(() => __game.state.th)) - th3) < 1e-9);
  await p.mouse.move(600, 300); await p.mouse.down(); await p.waitForTimeout(250); const th4 = await ev(() => __game.state.th); await p.mouse.up();
  ok('pressing the right half of the page turns it too', th4 > th3 + 0.2);
  await p.keyboard.press('KeyP'); const tp = await ev(() => __game.state.t); await p.waitForTimeout(200);
  ok('P pauses and shows the rules with the current values', await ev(t => __game.paused && __game.state.t === t, tp)); await shot('b-pause');
  await ev(() => __game.setModeT(0)); await p.waitForTimeout(150); await shot('b-pause-1');
  await ev(() => __game.setModeT(310)); await p.waitForTimeout(150); await shot('b-pause-2'); await ev(() => __game.setModeT(610)); await p.waitForTimeout(150); await shot('b-pause-3');
  await p.keyboard.press('KeyP'); await p.waitForTimeout(60); ok('P resumes', await ev(() => !__game.paused));
  // feel: a thrown landing leaves a streak, the brake overshoots, a lost ball is seen falling
  await ev(() => { const s = __game.state; s.skill = -1; s.th = -0.5; s.om = OT.C.OMEGA; __game.keys.r = true; __game.place({ x: 0, y: 70, vx: 0, vy: 200, held: 0 }); });
  await p.waitForFunction(() => __game.state.stats.bounces > 0 && __game.fx.parts.length >= 7 && __game.state.bs[0].vx < -50, null, { timeout: 4000, polling: 4 }); await shot('b-throw');
  ok('a landing on a turning table throws the ball and leaves sparks along the rim', true);
  await ev(() => { __game.keys.r = false; }); await p.waitForFunction(() => __game.fx.wob !== 0, null, { timeout: 2000, polling: 4 });
  ok('letting go: the table overshoots a hair and settles', true); await p.waitForTimeout(250); ok('and comes to rest', await ev(() => __game.fx.wob === 0));
  // a simulated player takes over
  await ev(() => { const bot = OTBots.policies.strong(5); __game.pilot = s => bot(s); __game.state.balls = 5; });
  await p.waitForFunction(() => __game.state.stats.banks >= 1, null, { timeout: 90000, polling: 16 }); await p.waitForTimeout(150); await shot('b-bank');
  ok('a finished bank repairs the rim and the display shows it', await ev(() => __game.state.hubLit === 1 || __game.state.locks > 0) && /RIM|LOCK|READY|ROUND|SKILL|SOLO/.test(await ev(() => (__game.fx.show ? __game.fx.show.stages.map(g => g.s || g.n).join('|') : ''))));
  await p.waitForFunction(() => __game.state.stats.locks >= 1, null, { timeout: 90000, polling: 16 }); await p.waitForTimeout(100); await shot('b-lock');
  ok('the hub takes a ball', true);
  await p.waitForFunction(() => __game.state.multi === 1 && __game.state.bs.every(b => b.held === 0), null, { timeout: 180000, polling: 16 }); await p.waitForTimeout(300); await shot('b-multiball');
  ok('multiball: two balls, its own music and notice', await ev(() => __game.state.bs.length === 2 && __game.audio.musicName === 'multi' && __game.objective(Object.assign({}, __game.state, { round: null, skill: -1, extraLit: 0, superLit: 0 })) === 'JACKPOT: LIT BANKS'));
  // lamps: a landing says +1, and a bank sends each lit lamp to the section it rebuilds
  await ev(() => { const s = __game.state; s.balls = 5; __game.pilot = () => ({ dir: 0 }); __game.fx.fly.length = 0; __game.fx.log.length = 0; s.round = null; s.ready = -1; s.spell = 0; s.hubLit = 0; s.skill = -1; s.multi = 0; s.mult = 4; s.segs = [1, 3, 3, 0, 2, 3, 3, 3, 3, 3, 3, 3]; s.lamps = [1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0]; s.up = [0, 1, 0, 1, 1, 1, 1, 1, 1]; s.bankT.fill(0); s.th = Math.PI / 2 - OT.BANK_A(0); s.om = 0; __game.place({ x: 0, y: 20, vx: 0, vy: 100, held: 0 }); });
  await p.waitForFunction(() => __game.fx.fly.length > 0 && __game.fx.fly[0].t > 8, null, { timeout: 5000, polling: 4 }); await shot('b-lamps-fly');
  ok('and lights the next multiplier light', await ev(() => __game.state.mult === 5 && __game.fx.mult > 0));
  ok('a finished bank sends one spark per lit lamp to the rim, and names the count', (await ev(() => __game.fx.fly.length)) === 5 && (await ev(() => __game.fx.log.some(l => l.startsWith('RIM +5|')))));
  await ev(() => { const s = __game.state; s.lamps.fill(0); s.th = Math.PI / 2 - 7.5 * OT.SEG_A; __game.place({ x: 0, y: 70, vx: 0, vy: 150, held: 0 }); });
  await p.waitForFunction(() => __game.state.lamps[7] === 1 && __game.fx.lampT > 0 && __game.fx.lamp[7] > 0, null, { timeout: 5000, polling: 4 }); await shot('b-lamp-lit');
  ok('a landing that lights a lamp swells it and brightens the repair figure', true);
  await ev(() => { const bot = OTBots.policies.strong(5); __game.pilot = s => bot(s); });
  // second feel pass: a rim nearly gone thins the music and warns; a landing caught at a hole's edge pings; the score rolls
  await ev(() => { const s = __game.state; __game.pilot = () => ({ dir: 0 }); s.balls = 5; s.round = null; s.ready = -1; s.skill = -1; s.multi = 0; s.segs = [0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2]; s.th = Math.PI / 2 - 3.5 * OT.SEG_A; s.om = 0; __game.place({ x: 0, y: 70, vx: 0, vy: 150 }); });
  await p.waitForFunction(() => __game.audio.thin === true, null, { timeout: 3000, polling: 4 });
  ok('with ' + (await ev(() => __game.DANGER_AT)) + ' landings or fewer left in the rim, the music loses its bass and a warning sounds', await ev(() => __game.fx.warnT > 0));
  await ev(() => { const s = __game.state; s.segs.fill(3); }); await p.waitForFunction(() => __game.audio.thin === false, null, { timeout: 3000, polling: 4 }); ok('and gets it back when the rim is rebuilt', true);
  await ev(() => { const s = __game.state; s.segs.fill(3); s.segs[3] = 0; s.th = Math.PI / 2 - (3 + 0.985) * OT.SEG_A; s.om = 0; __game.fx.parts.length = 0; __game.place({ x: 0, y: 70, vx: 0, vy: 150 }); });
  await p.waitForFunction(() => __game.state.stats.bounces > 0 && __game.fx.parts.filter(q => q.col === '#fff').length >= 9, null, { timeout: 3000, polling: 4 }); await shot('b-edge');
  ok('a ball caught on the very end of the section beside a hole throws white sparks', await ev(() => __game.state.segs[4] === 2 && __game.state.phase === 'play'));
  await ev(() => { __game.state.score += 50000; }); await p.waitForTimeout(100); const mid = await ev(() => __game.fx.shown), tot = await ev(() => __game.state.score); await p.waitForTimeout(1500);
  ok('the score on the display rolls up to its value', mid < tot && (await ev(() => __game.fx.shown === __game.state.score)), { mid, tot });
  // a ball thrown out through a hole at the top must not be drawn coming back across the table
  await ev(() => { const s = __game.state; __game.pilot = () => ({ dir: 0 }); s.balls = 5; s.save = 0; s.multi = 0; s.segs.fill(3); s.th = 0; s.om = 0; s.segs[7] = 0; s.segs[8] = 0; s.segs[9] = 0; __game.fx.ghosts.length = 0; __game.place({ x: -12, y: -80, vx: 0, vy: -300 }); });
  await p.waitForFunction(() => __game.fx.ghosts.length > 0, null, { timeout: 3000, polling: 4 });
  const seen = await ev(() => new Promise(done => { const out = []; const t = setInterval(() => { const q = __game.fx.ghosts[0]; if (!q) { clearInterval(t); done(out); return; } const c = document.getElementById('screen').getContext('2d'), px = c.getImageData(Math.round(112 + q.x), Math.round(144 + q.y), 1, 1).data; out.push({ r: Math.round(Math.hypot(q.x, q.y)), white: px[0] > 230 && px[1] > 230 && px[2] > 230 }); }, 16); }));
  await shot('b-fall-top');
  ok('thrown out at the top, the ball falls behind the table: no white ball is drawn inside the rim on its way down', seen.length > 10 && seen.some(q => q.r < 80) && !seen.some(q => q.r < 90 && q.white), { samples: seen.length, nearest: Math.min(...seen.map(q => q.r)) });
  // forced moments
  await ev(() => { const s = __game.state; s.level = 3; s.multi = 0; s.round = null; s.ready = -1; s.spell = 0; s.skill = -1; s.up = [0, 1, 0, 1, 1, 1, 1, 1, 1]; s.bankT.fill(0); s.th = Math.PI / 2 - OT.BANK_A(0); __game.place({ x: 0, y: 20, vx: 0, vy: 100, held: 0 }); });
  await ev(() => { __game.pilot = () => ({ dir: 0 }); });
  await p.waitForFunction(() => __game.state.stats.voids >= 1 && __game.fx.log.some(l => l.includes('TORN OUT')), null, { timeout: 5000, polling: 4 }); await p.waitForTimeout(250); await shot('b-void');
  ok('the fourth bank tears a section out, and the notice says so', true);
  // rounds: the word, the flashing section, and each round's lights
  const land = seg => ev(seg => { const s = __game.state; s.th = Math.PI / 2 - (seg + 0.5) * OT.SEG_A; s.om = 0; __game.place({ x: 0, y: 70, vx: 0, vy: 150, held: 0 }); }, seg);
  await ev(() => { const s = __game.state; s.balls = 5; __game.pilot = () => ({ dir: 0 }); s.segs.fill(3); s.round = null; s.ready = -1; s.spell = 5; s.up.fill(1); s.bankT.fill(0); s.th = Math.PI / 2 - OT.BANK_A(0); __game.place({ x: 0, y: 20, vx: 0, vy: 100, held: 0 }); });
  await p.waitForFunction(() => __game.state.ready >= 0, null, { timeout: 5000, polling: 16 }); await p.waitForTimeout(200); await shot('b-round-ready');
  await ev(() => { const s = __game.state; s.skill = (s.ready + 4) % 12; }); await p.waitForTimeout(140); await shot('b-two-arrows'); await ev(() => { __game.state.skill = -1; });
  ok('the sixth face finishes the word and a section flashes', await ev(() => __game.state.spell === 6 && __game.objective(Object.assign({}, __game.state, { skill: -1 })) === 'YELLOW ARROW:ROUND'));
  for (const kind of ['solo', 'chase', 'rush']) {
    await ev(k => { const s = __game.state; s.round = null; s.roundIdx = OT.C.ROUNDS.indexOf(k); s.ready = 3; s.segs.fill(3); s.save = 1; }, kind); await land(3);
    await p.waitForFunction(k => __game.state.round && __game.state.round.kind === k, kind, { timeout: 5000, polling: 16 }); await p.waitForTimeout(500); await shot('b-round-' + kind);
    ok('landing on it starts the ' + kind + ' round', true);
  }
  await ev(() => { __game.state.round = null; __game.state.ready = -1; });
  await ev(() => { const s = __game.state; s.balls = 5; s.multi = 1; s.jp = [1, 1, 1]; s.superLit = 1; s.extraLit = 0; s.hubLit = 0; s.th = 0; s.om = 0; __game.place({ x: 0, y: 60, vx: 0, vy: -330 }); s.bs.push(Object.assign({}, s.bs[0], { x: 50, y: -40, vx: 0, vy: -100 })); });
  await p.waitForTimeout(60); await shot('b-super-lit');
  await p.waitForFunction(() => __game.state.stats.supers >= 1, null, { timeout: 5000, polling: 4 }); await p.waitForTimeout(500); await shot('b-super');
  ok('the super jackpot is taken at the hub and shown', await ev(() => __game.fx.log.some(l => l.startsWith('SUPER|JACKPOT|')) && __game.state.superLit === 0));
  await ev(() => { const s = __game.state; s.multi = 0; s.hubLit = 0; s.extraLit = 1; s.balls = 3; s.th = 0; s.om = 0; __game.place({ x: 0, y: 60, vx: 0, vy: -330, held: 0, arm: 1 }); });
  await p.waitForTimeout(80); await shot('b-extra-lit'); ok('a lit extra ball is named on the display', (await ev(() => __game.objective(Object.assign({}, __game.state, { skill: -1, round: null })))) === 'HUB: EXTRA BALL' || (await ev(() => __game.state.stats.extends)) >= 1);
  await p.waitForFunction(() => __game.state.stats.extends >= 1, null, { timeout: 5000, polling: 4 }); await p.waitForTimeout(300); await shot('b-extra-ball');
  ok('up the middle collects it', await ev(() => __game.state.balls === 4 && __game.state.extraLit === 0));
  await ev(() => { const s = __game.state; __game.pilot = () => ({ dir: 0 }); s.balls = 1; s.save = 1; s.segs[4] = 0; s.segs[9] = 0; __game.place({ x: 0, y: 0, vx: 0, vy: 0, out: 0, held: 12 }); });
  await p.waitForTimeout(150); await shot('b-save-lit');
  await ev(() => { const s = __game.state; __game.place({ x: 0, y: 200, out: 1, held: 0 }); });
  await p.waitForFunction(() => __game.state.stats.saves >= 1, null, { timeout: 5000, polling: 16 }); await p.waitForTimeout(60); const net = await ev(() => __game.fx.net); await p.waitForTimeout(200); await shot('b-saved');
  ok('the save light flashes as it is spent', net > 0);
  ok('a stored save fires the ball back', await ev(() => __game.state.balls === 1 && __game.state.save === 0));
  await ev(() => { const s = __game.state; s.ballTargets = 7; s.mult = 3; __game.place({ x: 0, y: 200, out: 1, held: 0 }); });
  await p.waitForFunction(() => __game.state.phase === 'lost' && __game.fx.ghosts.length > 0, null, { timeout: 5000, polling: 4 }); await shot('b-fall');
  ok('a lost ball is drawn falling away while the moment holds', await ev(() => __game.freeze > 0 || __game.fx.ghosts[0].t > 0));
  await p.waitForTimeout(1300); await shot('b-bonus');
  ok('the last ball is lost and its bonus is counted', await ev(() => __game.fx.log.includes('BONUS|7X300|2100') && __game.audio.musicName === null), await ev(() => ({ log: __game.fx.log.slice(-4), music: __game.audio.musicName, phase: __game.state.phase, mode: __game.mode })));
  await p.waitForFunction(() => __game.mode === 'over', null, { timeout: 20000 }); await p.waitForTimeout(200); await shot('b-over');
  ok('game over leaves the address bar alone', (await ev(() => location.hash)) === '');
  ok('and the score enters the best five', await ev(() => __game.best.includes(__game.state.score)));
  await ev(() => { __game.best.splice(0, 5, 900000, 800000, 700000, 600000, 500000); __game.setRank(-1); }); await p.waitForTimeout(120); await shot('b-over-unranked');
  await ev(() => { __game.best.splice(0, 5, 900000, 800000, __game.state.score, 600000, 500000); __game.setRank(2); }); await p.waitForTimeout(120); await shot('b-over-ranked');
  await ev(() => __game.setModeT(899)); await p.waitForTimeout(250);
  ok('left alone for 15 seconds, game over returns to the title', await ev(() => __game.mode === 'title' && __game.attract === 'title')); await shot('b-over-to-title');
  // between games nothing of the last game may stay on the lower panel: leave a round waiting and look at the dots on each attract page
  const amber = () => ev(() => { const c = document.getElementById('screen').getContext('2d'), d = c.getImageData(0, 256, 224, 32).data; let lit = '', rows = []; for (let y = 0; y < 16; y++) { let r = ''; for (let x = 0; x < 112; x++) { const i = (y * 2 * 224 + x * 2) * 4; r += d[i] > 200 ? '#' : '.'; } rows.push(r); } return rows.join('\n'); });
  await ev(() => { __game.state.ready = 3; __game.state.spell = 6; }); await p.waitForTimeout(700); const onTitle = await amber();
  await ev(() => __game.setModeT(1e6)); await p.waitForTimeout(300); await ev(() => __game.setModeT(1e6)); await p.waitForTimeout(300); await ev(() => __game.setModeT(1e6)); await p.waitForTimeout(700);
  ok('the best-five page is showing', (await ev(() => __game.attract)) === 'best'); await shot('b-best-after-game'); const onBest = await amber();
  ok('with a round left waiting, the lower panel shows the same thing on the title and best-five pages, and it does not blink', onTitle === onBest && onTitle.includes('#'), { litDots: onTitle.split('#').length - 1 });
  await ev(() => { __game.state.ready = -1; __game.state.spell = 0; __game.setModeT(1e6); }); await p.waitForTimeout(300);
  ok('and the loop is back at the title', (await ev(() => __game.attract)) === 'title');
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok('the button starts a fresh game', await ev(() => __game.mode === 'play' && __game.state.score === 0 && __game.state.balls === 3 && __game.state.segs.every(h => h === 3)));
  ok('no console errors', errs.length === 0, errs);
  await b.close(); console.log('browser: all passed');
})().catch(async e => { console.error('FAILED AFTER: ' + last); console.error(e); process.exit(1); });
