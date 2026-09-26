// Browser probe of the real page (file://): node tests/browser.probe.cjs [screenshotDir]
// load → title → start → keyboard move/fire → hulk clink → wreck chain → touch drag/tap → death → game over → title → restart → demo.
const { chromium } = require("playwright");
const path = require("path");
const assert = require("node:assert/strict");
const shots = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 672, height: 768 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  let passed = 0;
  const check = async (name, fn) => { await fn(); passed++; console.log("ok  ", name); };
  const st = () => page.evaluate(() => {
    const g = window.__wf.game;
    return { app: window.__wf.app, mode: g && g.mode, x: g && g.player.x, shot: !!(g && g.shot), score: g && g.score, lives: g && g.lives, shots: g && g.stats.shots, wave: g && g.wave, chains: g && g.stats.chains };
  });
  const until = async (pred, ms = 8000) => {
    const t0 = Date.now();
    for (;;) { const s = await st(); if (pred(s)) return s; if (Date.now() - t0 > ms) throw new Error("timeout: " + JSON.stringify(s)); await page.waitForTimeout(30); }
  };
  const snap = async (n) => shots && page.screenshot({ path: path.join(shots, n + ".png") });

  await check("loads to the title screen without errors", async () => {
    await page.waitForTimeout(400);
    assert.equal((await st()).app, "title");
    await snap("title");
  });
  await check("Space starts a game; READY then play", async () => {
    await page.keyboard.press("Space");
    const s = await until((s) => s.app === "play");
    assert.equal(s.mode, "ready");
    await until((s) => s.mode === "play");
  });
  await check("arrow keys move the cannon both ways", async () => {
    const x0 = (await st()).x;
    await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(400); await page.keyboard.up("ArrowLeft");
    const x1 = (await st()).x;
    assert.ok(x1 < x0 - 20, `left ${x0}->${x1}`);
    await page.keyboard.down("KeyD"); await page.waitForTimeout(400); await page.keyboard.up("KeyD");
    assert.ok((await st()).x > x1 + 20);
  });
  await check("Z fires one shot; holding does not auto-repeat", async () => {
    const n0 = (await st()).shots;
    await page.keyboard.down("KeyZ");
    await until((s) => s.shot);
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyZ");
    assert.equal((await st()).shots, n0 + 1);
  });
  await check("a shot under a hulk-only column clinks off and scores nothing", async () => {
    await until((s) => s.mode === "play" && !s.shot);
    const r = await page.evaluate(() => {
      const g = window.__wf.game;
      g.wrecks = [];
      for (const e of g.enemies) if (!e.armored) e.alive = false; // escorts gone for a moment
      g.respawns = [];
      for (const l of g.lanes) l.v = 0;
      const h = g.enemies.find((e) => e.armored && e.alive);
      h.x = Math.round(g.player.x);
      g.bombs = []; g.telegraphs = []; g.bombT = 99;
      return { score: g.score, id: h.id };
    });
    await page.keyboard.press("Space");
    await page.waitForTimeout(800);
    const after = await page.evaluate((id) => ({ alive: window.__wf.game.enemies.find((e) => e.id === id).alive, score: window.__wf.game.score }), r.id);
    assert.equal(after.alive, true);
    assert.equal(after.score, r.score);
  });
  await check("a wreck dropped onto a hulk crushes it (chain of 2) and the cannon escapes", async () => {
    await page.evaluate(() => {
      const g = window.__wf.game;
      const h = g.enemies.find((e) => e.armored && e.alive);
      const px = Math.round(g.player.x);
      g.enemies.push({ id: 9999, lane: 0, x: px, alive: true, flash: 0, armored: false });
      h.x = px + 30; // not in the shot's column
      for (const o of g.enemies) if (o.armored && o !== h && Math.abs(o.x - px) < 24) o.x = px + 60;
      g.bombs = []; g.telegraphs = []; g.bombT = 99; g.shot = null;
      window.__probeHulk = h.id;
    });
    const c0 = (await st()).chains.length;
    await page.keyboard.press("Space");
    try { await page.waitForFunction(() => window.__wf.game.wrecks.length > 0, null, { timeout: 2000 }); }
    catch (e) { console.log("state", JSON.stringify(await st())); throw e; }
    // the hulk has drifted under the falling wreck
    await page.evaluate(() => { const g = window.__wf.game; g.enemies.find((e) => e.id === window.__probeHulk).x = g.wrecks[0].x; });
    await page.keyboard.down("ArrowRight"); await page.waitForTimeout(450); await page.keyboard.up("ArrowRight");
    const s = await until((s) => s.chains.length > c0, 3000);
    assert.equal(s.chains[s.chains.length - 1], 2);
    assert.equal(s.mode === "dead", false);
    await snap("chain");
  });
  await check("touch: drag moves the cannon, tap fires", async () => {
    await until((s) => s.mode === "play" && !s.shot);
    const box = await page.locator("#screen").boundingBox();
    const x0 = (await st()).x;
    const cy = box.y + box.height * 0.8;
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: cy, id: 1 }] });
    const sx = box.x + box.width / 2;
    await tp("touchStart", sx);
    for (let i = 1; i <= 10; i++) { await tp("touchMove", sx - i * 8); await page.waitForTimeout(40); }
    await page.waitForTimeout(400);
    await tp("touchEnd");
    const x1 = (await st()).x;
    assert.ok(x1 < x0 - 15, `drag ${x0}->${x1}`);
    const n0 = (await st()).shots;
    await tp("touchStart", sx); await page.waitForTimeout(60); await tp("touchEnd");
    await until((s) => s.shots === n0 + 1, 1500);
  });
  await check("losing the last life ends the game, then returns to the title", async () => {
    await until((s) => s.mode === "play" && !s.shot);
    await page.evaluate(() => { const g = window.__wf.game; g.lives = 1; });
    await page.evaluate(() => { const g = window.__wf.game; g.bombs.push({ id: 5555, x: Math.round(g.player.x), y: 200 }); });
    await until((s) => s.app === "over", 5000);
    await snap("over");
    await page.waitForTimeout(1700);
    await page.keyboard.press("Space");
    await until((s) => s.app === "title");
  });
  await check("restart from the title gives a fresh game", async () => {
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    const s = await until((s) => s.app === "play");
    assert.equal(s.score, 0); assert.equal(s.wave, 1); assert.equal(s.lives, 3);
  });
  await check("every enemy sprite renders in every tint combination (telegraph + hit flash)", async () => {
    await page.evaluate(() => window.__wf.start(5, { startWave: 5 }));
    await until((s) => s.app === "play");
    await page.evaluate(() => {
      const g = window.__wf.game;
      for (const e of g.enemies) { e.flash = 0.2; e.ping = 0.2; } // both at once: the crash case
    });
    await page.waitForTimeout(200);
    assert.deepEqual(errors, []);
  });
  await check("an extend earned on the wave-clear tick still shows EXTEND next to WAVE CLEAR", async () => {
    await page.evaluate(() => window.__wf.start(4, { startWave: 2 }));
    await until((s) => s.mode === "play");
    await page.evaluate(() => { const g = window.__wf.game; g.score = 29000; for (const e of g.enemies) if (e.armored) e.alive = false; });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ banner: window.__wf.fx().banner && window.__wf.fx().banner.str, extendT: window.__wf.fx().extendT, lives: window.__wf.game.lives }));
    assert.equal(r.banner, "WAVE CLEAR");
    assert.ok(r.extendT > 0, "EXTEND line is showing");
    assert.equal(r.lives, 4);
  });
  await check("attract demo plays by itself and exits on a key", async () => {
    await page.evaluate(() => window.__wf.demo(11));
    await page.waitForTimeout(6000);
    const s = await st();
    assert.equal(s.app, "demo");
    assert.ok(s.shots > 0);
    await page.keyboard.press("Space");
    await until((s) => s.app === "title");
  });
  assert.deepEqual(errors, []);
  console.log(`\n${passed} passed, no page errors`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
