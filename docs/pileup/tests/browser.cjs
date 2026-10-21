// node tests/browser.cjs — the page headless: title, attract demo, start, real-key steering and reversal, a pileup,
// the exit, game over, initials, restart twice (nothing carried over), and every sound's level through the output chain.
// Screenshots go to evidence/.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const out = path.join(__dirname, '..', 'evidence'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1008, height: 928 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, '..', 'index.html') + '?manual=1&seed=3');
  await p.evaluate(() => localStorage.clear());
  await p.evaluate(() => __test.advance(1));
  await p.screenshot({ path: path.join(out, 'title.png') });
  const ck = (c, m) => { if (!c) throw new Error(m); };
  // the title gives way to the demo, which plays real rules and returns to the title
  await p.evaluate(() => __test.advance(60 * 9 + 2));
  ck(await p.evaluate(() => __test.mode) === 'demo', 'no demo after the title');
  await p.evaluate(() => __test.advance(60 * 20));
  await p.screenshot({ path: path.join(out, 'demo.png') });
  const demoScore = await p.evaluate(() => __test.state.score);
  ck(demoScore > 0, 'demo scored nothing');
  ck(await p.evaluate(() => SFX.musicWanted === null), 'the demo plays music (demo sound is off)');
  await p.evaluate(() => { for (let i = 0; i < 60 * 40 && __test.mode === 'demo'; i++) __test.advance(1); });
  ck(await p.evaluate(() => __test.mode) === 'title', 'demo did not return to the title');

  // start with a real key; READY, then play
  await p.keyboard.press('Space');
  ck(await p.evaluate(() => __test.mode === 'play' && __test.state.phase === 'ready'), 'Space did not start at READY');
  await p.evaluate(() => __test.advance(5));
  await p.screenshot({ path: path.join(out, 'ready.png') });
  await p.evaluate(() => __test.advance(90));
  ck(await p.evaluate(() => SFX.musicWanted && SFX.musicWanted.section === 'chase'), 'no chase music in play');
  await p.keyboard.press('ArrowLeft'); await p.evaluate(() => __test.advance(5));
  ck(await p.evaluate(() => __test.state.p.dir) === 4, 'ArrowLeft did not steer');
  await p.keyboard.press('ArrowRight'); await p.evaluate(() => __test.advance(1));
  ck(await p.evaluate(() => __test.state.p.dir) === 2, 'ArrowRight did not reverse');

  // a line of three cars on the tracks just after a double-back folds into a pileup; that is the quota minus three
  await p.evaluate(() => {
    const st = __test.state, S = PILEUP, at = (x, y) => ({ x: S.cen(x), y: S.cen(y) });
    st.warn = null; st.spawnT = 1e9; st.cops = []; st.p = { ...at(1, 16), dir: 0, want: 0 }; st.wrecked = S.district(st).quota - 3;
    const t = []; for (let x = 4; x <= 13; x++) t.push([x, 7, 0]); for (let x = 12; x >= 10; x--) t.push([x, 7, 0]);
    st.trail = t; st.trailBase = 0;
    const mk = (id, x, ti) => ({ id, ...at(x, 7), dir: 2, pref: [1, 2, 3, 4], ti, kind: 'car', hp: 1, stun: 0, immune: 0 });
    st.cops.push(mk(90, 12, 9), mk(91, 9, 6), mk(92, 6, 3));
    __test.advance(20);
  });
  await p.screenshot({ path: path.join(out, 'line.png') });
  await p.evaluate(() => __test.advance(70));
  await p.screenshot({ path: path.join(out, 'pileup.png') });
  const sc = await p.evaluate(() => ({ score: __test.state.score, best: __test.state.stats.best, exit: __test.state.exit }));
  ck(sc.best === 3 && sc.score === 600 && sc.exit, 'pileup / exit: ' + JSON.stringify(sc));
  ck(await p.evaluate(() => SFX.musicWanted && SFX.musicWanted.section === 'getaway'), 'exits open but the music did not switch to the getaway');
  // a hidden page goes quiet and plays nothing; back in view the music the game wants comes back
  const vis = await p.evaluate(() => { SFX.setHostVisible(false); const n = SFX.log.length; SFX.play('scent'); const skipped = SFX.log[SFX.log.length - 1].skipped; SFX.setHostVisible(false); const h = SFX.hidden; SFX.setHostVisible(true); return { skipped, h, back: !SFX.hidden && SFX.musicWanted && SFX.musicWanted.section }; });
  ck(vis.skipped && vis.h && vis.back === 'getaway', 'host visibility: ' + JSON.stringify(vis));
  // drive out through the bottom exit
  await p.evaluate(() => { const st = __test.state, S = PILEUP; st.p = { x: S.cen(10), y: S.cen(15), dir: 3, want: 3 }; __test.advance(40); });
  await p.screenshot({ path: path.join(out, 'clear.png') });
  ck(await p.evaluate(() => __test.state.phase) === 'clear', 'did not clear through the exit');
  await p.evaluate(() => __test.advance(200));
  ck(await p.evaluate(() => __test.state.d === 1 && __test.state.cy === 1 && __test.state.lives === 4), 'into HARBOR with an extra car');
  await p.screenshot({ path: path.join(out, 'district2.png') });

  // idle until all cars are lost: game over, a top-five score asks for initials
  await p.evaluate(() => { __test.state.score = 25000; __test.state.nextExtend = 1e9; for (let i = 0; i < 60 * 300 && __test.mode === 'play'; i++) __test.advance(1); });
  ck(await p.evaluate(() => __test.mode) === 'over', 'idle did not end the run');
  const line = await p.evaluate(() => __test.last);
  ck(/^RUN v1 build=\S+ progress=[\d.]+ score=\d+ time=\d+ fail=caught:\d+$/.test(line), 'summary: ' + line);
  await p.evaluate(() => __test.advance(62));
  ck(await p.evaluate(() => __test.mode) === 'entry', 'no initials entry for a top score');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('Space'); await p.keyboard.press('Space'); await p.keyboard.press('Space');
  await p.screenshot({ path: path.join(out, 'title-after.png') });
  const tbl = await p.evaluate(() => __test.table.map(r => r.n + ':' + r.s).join(' '));
  ck(/BAA:25000/.test(tbl) && await p.evaluate(() => __test.mode) === 'title', 'initials not stored: ' + tbl);

  // restart twice: every run starts clean
  for (let k = 0; k < 2; k++) {
    await p.keyboard.press('Space');
    const s0 = await p.evaluate(() => ({ score: __test.state.score, cops: __test.state.cops.length, wrecks: __test.state.wrecks.length, d: __test.state.d, lives: __test.state.lives, fx: Object.values(__test.fx).filter(Array.isArray).reduce((a, v) => a + v.length, 0) }));
    ck(s0.score === 0 && s0.cops === 0 && s0.wrecks === 0 && s0.d === 0 && s0.lives === 3 && s0.fx === 0, 'restart not clean: ' + JSON.stringify(s0));
    await p.evaluate(() => { for (let i = 0; i < 60 * 300 && __test.mode === 'play'; i++) __test.advance(1); __test.advance(62); });
    if (await p.evaluate(() => __test.mode) === 'entry') { for (let i = 0; i < 3; i++) await p.keyboard.press('Space'); }
    else await p.evaluate(() => __test.toTitle());
  }

  // sound levels through the real output chain: each event alone, the music bed, and effects over the bed
  const lv = await p.evaluate(async () => {
    const r = {}, bed = { section: 'chase', heat: 3, line: true };
    for (const name of Object.keys(SFX.PROGRAMS)) r[name] = await SFX.render([[name, 3, 0.01]], 1.8);
    r.music = await SFX.render([], 7, bed);
    r.getaway = await SFX.render([], 7, { section: 'getaway', heat: 6, line: true });
    r.scentOverMusic = await SFX.render([['scent', 1, 1.0]], 2, bed);
    r.crashOverMusic = await SFX.render([['crash', 6, 1.0]], 2, bed);
    r.busy = await SFX.render([['crash', 2, 0.51], ['crash', 3, 0.55], ['crash', 4, 0.59], ['scent', 1, 0.52], ['siren', 1, 0.5], ['dent', 1, 0.53]], 1.5, bed);
    return r;
  });
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v.peak.toFixed(2)}`).join(', ');
  console.log('peaks:', fmt(lv));
  for (const [k, v] of Object.entries(lv)) { ck(v.peak > (k === 'tick' ? 0.08 : 0.1), `${k} too quiet (${v.peak.toFixed(3)})`); ck(v.peak <= 1.0, `${k} clips`); }   // tick: the initials chime, behind everything
  ck(lv.scent.peak >= 0.6 * lv.music.peak, `the radio blip sits under the music (${lv.scent.peak.toFixed(2)} vs ${lv.music.peak.toFixed(2)})`);
  ck(lv.music.peak < lv.crash.peak, 'the music is louder than a crash');
  if (errs.length) throw new Error('page errors: ' + errs.join('\n'));
  console.log('browser ok', sc, line, 'demo score', demoScore);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
