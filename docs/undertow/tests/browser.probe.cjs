// Browser probe of the real page (file://): node tests/browser.probe.cjs [screenshotDir]
// load → title → start → move → fire → sink a loaded raider → catch the spill → unload → death → game over → title → restart → demo
const { chromium } = require("playwright");
const path = require("path");
const assert = require("node:assert/strict");
const shots = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 768, height: 576 } });
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
      const g = window.__ut.game;
      return {
        app: window.__ut.app,
        mode: g && g.mode,
        x: g && g.player.x,
        y: g && g.player.y,
        alive: g && g.player.alive,
        cargo: g && g.player.cargo,
        torp: !!(g && g.torp),
        shots: g && g.stats.shots,
        score: g && g.score,
        lives: g && g.lives,
        delivered: g && g.stats.deliveredTotal,
        allSaved: g && g.stats.allSaved,
      };
    });
  const until = async (pred, ms = 8000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout: " + JSON.stringify(s));
      await page.waitForTimeout(30);
    }
  };
  const snap = async (n) => shots && page.screenshot({ path: path.join(shots, n + ".png") });
  // keep the wave open and quiet while probing a rule
  const quiet = () =>
    page.evaluate(() => {
      const g = window.__ut.game;
      g.enemies = [];
      g.mines = [];
      g.etorps = [];
      g.launchT = 999;
      g.raidQueue = [];
      g.burst = 0;
      g.captives = [{ id: 9999, x: (UT.PORT + 200) % UT.WORLD, y: UT.CFG.surf + 1, sink: 0, drift: 0, ph: 0, raft: true, raftT: 999, raftId: "keep", spill: null }];
    });

  await check("loads to the title screen without errors", async () => {
    await page.waitForTimeout(800); // the title ignores keys for its first 0.3 s
    assert.equal((await st()).app, "title");
    await snap("title");
  });
  await check("Space starts a game; READY then play", async () => {
    await page.keyboard.press("Space");
    const s = await until((s) => s.app === "play");
    assert.equal(s.mode, "ready");
    await until((s) => s.mode === "play");
  });
  await check("arrow keys steer the sub in both axes", async () => {
    await quiet();
    const a = await st();
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("ArrowDown");
    const b = await st();
    const d = await page.evaluate(([x0, x1]) => UT.dx(x0, x1), [a.x, b.x]);
    assert.ok(d < -15, "moved left " + d);
    assert.ok(b.y > a.y + 10, "dived " + a.y + "->" + b.y);
  });
  await check("Z fires one torpedo per press", async () => {
    await until((s) => !s.torp);
    const n0 = (await st()).shots;
    await page.keyboard.down("KeyZ");
    await page.waitForTimeout(1200);
    await page.keyboard.up("KeyZ");
    assert.equal((await st()).shots, n0 + 1);
  });
  await check("a torpedo fired from depth climbs into a loaded grab-ship; its hold spills and is caught whole", async () => {
    await quiet();
    await until((s) => !s.torp);
    await page.evaluate(() => {
      const g = window.__ut.game;
      const p = g.player;
      p.x = UT.wrap(UT.HOME + 200); // away from the harbour, where cargo would be unloaded
      p.y = 110;
      p.vy = 0;
      p.face = 1;
      // the torpedo climbs 1 px per 2 px: from depth 110 it reaches the hulls this far ahead
      const run = (110 - (UT.CFG.surf + UT.CFG.hullDepth - 3)) / UT.CFG.torpRise;
      g.enemies.push({ id: 8888, kind: "ship", route: 1, x: UT.wrap(p.x + 8 + run), y: UT.CFG.surf, dir: 1, load: 3, alive: true, state: "lift", liftT: -99, target: null, arm: 0, held: null, cd: 99, scd: 99, aim: 0, t: 0 });
    });
    const n0 = (await st()).shots;
    await page.keyboard.press("KeyZ");
    await page.waitForTimeout(150);
    if ((await st()).shots === n0) {
      console.log("     (the first press did not register; pressed again)");
      await page.keyboard.press("KeyZ");
    }
    await until((s) => s.score >= 150, 3000);
    await snap("spill");
    // steer onto the nearest falling survivor with the arrow keys until the spill is gone
    for (let i = 0; i < 200; i++) {
      const tgt = await page.evaluate(() => {
        const g = window.__ut.game;
        let best = null;
        for (const c of g.captives) {
          if (c.spill !== "e8888") continue;
          const d = UT.dx(g.player.x, c.x);
          const dy = c.y + 4 - g.player.y;
          if (!best || Math.abs(d) + Math.abs(dy) < Math.abs(best.d) + Math.abs(best.dy)) best = { d, dy };
        }
        return best;
      });
      if (!tgt) break;
      const kx = tgt.d > 2 ? "ArrowRight" : tgt.d < -2 ? "ArrowLeft" : null;
      const ky = tgt.dy > 2 ? "ArrowDown" : tgt.dy < -2 ? "ArrowUp" : null;
      if (kx) await page.keyboard.down(kx);
      if (ky) await page.keyboard.down(ky);
      await page.waitForTimeout(40);
      if (kx) await page.keyboard.up(kx);
      if (ky) await page.keyboard.up(ky);
    }
    const s = await st();
    assert.equal(s.cargo, 3);
    assert.equal(s.allSaved, 1);
    await snap("caught");
  });
  await check("surfacing at the harbour unloads everyone aboard", async () => {
    const d0 = (await st()).delivered;
    await page.evaluate(() => {
      const g = window.__ut.game;
      g.player.x = UT.HOME;
    });
    await page.keyboard.down("ArrowUp");
    await until((s) => s.cargo === 0, 4000);
    await page.keyboard.up("ArrowUp");
    assert.equal((await st()).delivered, d0 + 3);
  });
  await check("a mine blast kills the sub; losing the last one ends the game", async () => {
    await page.evaluate(() => {
      const g = window.__ut.game;
      g.lives = 1;
      g.player.inv = 0;
      g.blasts.push({ x: g.player.x, y: g.player.y, t: 0, cause: "mine" });
    });
    await until((s) => !s.alive, 2000);
    await snap("death");
    await until((s) => s.mode === "over", 5000);
    await snap("over");
  });
  await check("game over returns to the title, and a new game starts clean", async () => {
    await until((s) => s.app === "title", 8000);
    await page.waitForTimeout(500);
    await page.keyboard.press("Space");
    const s = await until((s) => s.app === "play" && s.mode === "ready");
    assert.equal(s.score, 0);
    assert.equal(s.lives, 3);
  });
  await check("the attract demo plays itself and any key leaves it", async () => {
    await page.evaluate(() => window.__ut.start(true));
    await page.waitForTimeout(2500);
    const a = await st();
    await page.waitForTimeout(3500);
    const s = await st();
    assert.equal(s.app, "demo");
    const moved = (await page.evaluate(([x0, x1]) => Math.abs(UT.dx(x0, x1)), [a.x, s.x])) + Math.abs(s.y - a.y);
    assert.ok(moved > 10 || s.shots > 0 || s.cargo !== a.cargo, "demo sub moved " + moved);
    await snap("demo");
    await page.keyboard.press("KeyX");
    await until((s) => s.app === "title");
  });

  assert.deepEqual(errors, []);
  console.log(`\n${passed} passed, no console errors`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
