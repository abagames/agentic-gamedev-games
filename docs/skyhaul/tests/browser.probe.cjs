// Browser probe of the real page (file://): node tests/browser.probe.cjs [screenshotDir]
// Exercises load → title → start → keyboard/touch control → grab → delivery → death → game over → restart.
const { chromium } = require("playwright");
const path = require("path");
const assert = require("node:assert/strict");

const shots = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  let passed = 0;
  const check = async (name, fn) => {
    await fn();
    passed++;
    console.log("ok  ", name);
  };
  const st = () =>
    page.evaluate(() => {
      const a = window.__sky.app;
      const g = a.game;
      return {
        mode: a.mode,
        phase: g && g.phase,
        score: g && g.score,
        lives: g && g.lives,
        lx: g && g.lander.x,
        ly: g && g.lander.y,
        n: g ? g.chain.length - 1 : 0,
        humans: g && g.humans.length,
        round: g && g.round,
      };
    });
  const until = async (pred, ms = 6000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout; last state " + JSON.stringify(s));
      await page.waitForTimeout(30);
    }
  };
  // Keep the Defender out of the way for deterministic control checks.
  const parkDefender = () =>
    page.evaluate(() => {
      const d = window.__sky.app.game.def;
      d.x = -39;
      d.vx = 0;
      d.cool = 99;
      d.turnCool = 99;
      d.dir = -1;
    });

  await check("loads to the attract/title screen with a running demo", async () => {
    await page.waitForTimeout(800);
    const s = await st();
    assert.equal(s.mode, "title");
    const demoT = await page.evaluate(() => window.__sky.app.demo && window.__sky.app.demo.t);
    assert.ok(demoT > 0.3);
    if (shots) await page.screenshot({ path: `${shots}/probe-title.png` });
  });

  await check("Space starts a game at round 1 with 3 lives", async () => {
    await page.keyboard.press("Space");
    const s = await until((s) => s.mode === "play");
    assert.equal(s.round, 1);
    assert.equal(s.lives, 3);
    await until((s) => s.phase === "play");
  });

  await check("arrow keys fly the lander (right, then down)", async () => {
    await parkDefender();
    const a = await st();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(350);
    await page.keyboard.up("ArrowRight");
    const b = await st();
    assert.ok(b.lx > a.lx + 15, `x ${a.lx} → ${b.lx}`);
    await parkDefender();
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(350);
    await page.keyboard.up("ArrowDown");
    const c = await st();
    assert.ok(c.ly > b.ly + 15, `y ${b.ly} → ${c.ly}`);
  });

  await check("flying the hook onto a human attaches it (real input)", async () => {
    // Put a lone walker just below-right and fly into it with keys.
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      const h = g.humans[0];
      for (const o of g.humans) if (o !== h) o.x = h.x < 160 ? 300 : 20;
      h.walkT = 99;
      h.dir = 1;
      g.lander.x = h.x - 30;
      g.lander.y = 200;
    });
    await parkDefender();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.down("ArrowDown");
    const s = await until((s) => s.n >= 1, 3000);
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("ArrowDown");
    assert.ok(s.n >= 1);
  });

  await check("climbing into the hatch delivers and scores 100·n²", async () => {
    const before = await st();
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      g.ship.x = 160;
      g.lander.x = 160;
      g.lander.y = 60;
    });
    await parkDefender();
    await page.keyboard.down("ArrowUp");
    const s = await until((s) => s.n === 0 && s.score > before.score, 4000);
    await page.keyboard.up("ArrowUp");
    assert.equal(s.score - before.score, 100 * before.n * before.n);
    if (shots) await page.screenshot({ path: `${shots}/probe-delivery.png` });
  });

  await check("touch drag steers the lander", async () => {
    await parkDefender();
    const a = await st();
    const box = await page.locator("canvas").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(({ x, y }) => {
      const cv = document.querySelector("canvas");
      const ev = (type, px, py) => new PointerEvent(type, { pointerId: 7, clientX: px, clientY: py, bubbles: true, pointerType: "touch" });
      cv.dispatchEvent(ev("pointerdown", x, y));
      window.dispatchEvent(ev("pointermove", x - 60, y));
    }, { x, y });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, bubbles: true })));
    const b = await st();
    assert.ok(b.lx < a.lx - 10, `x ${a.lx} → ${b.lx}`);
  });

  await check("a Defender laser kills the lander: dying → ready with one life fewer", async () => {
    const a = await st();
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      g.lander.invuln = 0;
      g.lasers.push({ y: g.lander.y, x0: g.lander.x - 30, dir: 1, t: 0.05 });
    });
    await until((s) => s.phase === "dying", 1500);
    const s = await until((s) => s.phase === "ready" || s.phase === "play", 4000);
    assert.equal(s.lives, a.lives - 1);
    if (shots) await page.screenshot({ path: `${shots}/probe-respawn.png` });
  });

  const kill = () =>
    page.evaluate(() => {
      const g = window.__sky.app.game;
      g.lander.invuln = 0;
      g.lasers.push({ y: g.lander.y, x0: g.lander.x - 30, dir: 1, t: 0.05 });
    });
  const mode = () => page.evaluate(() => window.__sky.app.mode);
  const untilMode = async (m, ms = 8000) => {
    const t0 = Date.now();
    while ((await mode()) !== m) {
      if (Date.now() - t0 > ms) throw new Error(`mode ${await mode()} never became ${m}`);
      await page.waitForTimeout(30);
    }
  };

  await check("bonus stage: parachutists fall, timer runs, result screen, then the next planet", async () => {
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      SKY.startRound(g, 2);
      g.lives = 5;
    });
    await until((s) => s.phase === "play", 4000);
    // clear round 2 instantly: the planet's last round leads into the bonus stage
    await page.evaluate(() => (window.__sky.app.game.humans = []));
    await page.waitForFunction(() => !!window.__sky.app.game.bonus, null, { timeout: 6000 });
    await page.waitForFunction(() => window.__sky.app.game.phase === "play", null, { timeout: 4000 });
    await page.waitForTimeout(2500);
    const b = await page.evaluate(() => ({ spawned: window.__sky.app.game.bonus.spawned, t: window.__sky.app.game.bonus.t, def: window.__sky.app.game.def.x }));
    assert.ok(b.spawned >= 2, "parachutists dropping");
    assert.ok(b.t < 23, "timer running");
    if (shots) await page.screenshot({ path: `${shots}/probe-bonus.png` });
    await page.evaluate(() => (window.__sky.app.game.bonus.t = 0.01));
    await page.waitForFunction(() => window.__sky.app.game.phase === "clear", null, { timeout: 3000 });
    if (shots) await page.screenshot({ path: `${shots}/probe-bonus-result.png` });
    await page.waitForFunction(() => window.__sky.app.game.round === 3 && !window.__sky.app.game.bonus, null, { timeout: 6000 });
    const planet = await page.evaluate(() => window.__sky.app.game.rules.planetName);
    assert.equal(planet, "OCHRE");
  });

  await check("qualifying game over → initials board (arrows and WASD) → table highlights the entry → title", async () => {
    await page.evaluate(() => localStorage.removeItem("skyhaul.table"));
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      g.lives = 1;
      g.score = 12000; // ties the factory 3rd place: the new entry must rank above it
    });
    await until((s) => s.phase === "play", 5000);
    await kill();
    await untilMode("over", 3000);
    if (shots) await page.screenshot({ path: `${shots}/probe-gameover.png` });
    await untilMode("entry", 5000);
    const rank = await page.evaluate(() => window.__sky.app.entry.rank);
    assert.equal(rank, 2, "tie goes to the new entry");
    // A press inside the grace window must not select anything.
    await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => window.__sky.app.entry.name), "");
    await page.waitForTimeout(450);
    // "C" with arrows: right, right, select
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    // "M" with WASD: down (→ index 12 = M), select with Enter
    await page.keyboard.press("KeyS");
    await page.keyboard.press("Enter");
    for (let i = 0; i < 11; i++) await page.keyboard.press("KeyD"); // M(12) → X(23)
    await page.keyboard.press("Space");
    const e = await page.evaluate(() => ({ name: window.__sky.app.entry.name, cursor: window.__sky.app.entry.cursor }));
    assert.equal(e.name, "CMX");
    assert.equal(e.cursor, 29, "full name moves the cursor to END");
    if (shots) await page.screenshot({ path: `${shots}/probe-entry.png` });
    await page.keyboard.press("Space");
    await untilMode("table", 2000);
    const t = await page.evaluate(() => window.__sky.readTable());
    assert.deepEqual(t[2], { score: 12000, name: "CMX" });
    assert.equal(t[3].name, "UFO");
    if (shots) await page.screenshot({ path: `${shots}/probe-table.png` });
    await untilMode("title", 9000);
  });

  await check("attract cycle: title → demo → table → title, and it never writes rankings", async () => {
    const before = await page.evaluate(() => localStorage.getItem("skyhaul.table"));
    await page.evaluate(() => (window.__sky.app.modeT = 60 * 6));
    await untilMode("demo", 2000);
    if (shots) await page.screenshot({ path: `${shots}/probe-demo.png` });
    await page.evaluate(() => (window.__sky.app.modeT = 60 * 30));
    await untilMode("table", 2000);
    await page.evaluate(() => (window.__sky.app.modeT = 60 * 6));
    await untilMode("title", 2000);
    assert.equal(await page.evaluate(() => localStorage.getItem("skyhaul.table")), before);
  });

  await check("non-qualifying game over skips entry; second full loop and restart work", async () => {
    await page.waitForTimeout(450); // past the title's confirm grace
    await page.keyboard.press("Space");
    await until((s) => s.mode === "play" && s.lives === 3 && s.score === 0);
    await page.evaluate(() => (window.__sky.app.game.lives = 1));
    await until((s) => s.phase === "play", 5000);
    await kill();
    await untilMode("over", 3000);
    await untilMode("table", 5000); // score 0: no entry
    await untilMode("title", 9000);
    await page.waitForTimeout(450);
    await page.keyboard.press("Space");
    const s = await until((s) => s.mode === "play");
    assert.equal(s.lives, 3);
  });

  await check("entry times out with padding and still saves", async () => {
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      g.lives = 1;
      g.score = 50000;
    });
    await until((s) => s.phase === "play", 5000);
    await kill();
    await untilMode("entry", 8000);
    await page.evaluate(() => (window.__sky.app.entry.t = 0.05));
    await untilMode("table", 2000);
    const t = await page.evaluate(() => window.__sky.readTable());
    assert.deepEqual(t[0], { score: 50000, name: "---" });
    await page.evaluate(() => localStorage.removeItem("skyhaul.table"));
  });

  await check("mission complete: round 8 clear → ending screen (no bonus stage) with ships bonus → initials entry", async () => {
    await untilMode("title", 10000);
    await page.waitForTimeout(450);
    await page.keyboard.press("Space");
    await until((s) => s.mode === "play" && s.phase === "play", 6000);
    await page.evaluate(() => {
      const g = window.__sky.app.game;
      SKY.startRound(g, 8);
      g.lives = 3;
    });
    await until((s) => s.phase === "play", 5000);
    await page.evaluate(() => (window.__sky.app.game.humans = []));
    await page.waitForFunction(() => window.__sky.app.game.phase === "complete", null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__sky.app.game.bonus), null, "no bonus stage after round 8");
    await page.waitForTimeout(3500);
    if (shots) await page.screenshot({ path: `${shots}/probe-complete.png` });
    const c = await page.evaluate(() => ({ round: window.__sky.app.game.round, cleared: window.__sky.app.game.cleared, bonus: window.__sky.app.game.complete.livesBonus }));
    assert.equal(c.round, 8);
    assert.ok(c.cleared);
    assert.equal(c.bonus, 3 * 5000);
    await untilMode("over", 8000);
    await untilMode("entry", 6000); // 15 000+ qualifies for the factory table
    await page.evaluate(() => (window.__sky.app.entry.t = 0.05));
    await untilMode("table", 3000);
    await page.evaluate(() => localStorage.removeItem("skyhaul.table"));
  });

  await check("no console errors", async () => {
    assert.deepEqual(errors, []);
  });
  console.log(`\n${passed} passed`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
