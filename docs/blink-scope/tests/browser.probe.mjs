// Browser probe: node tests/browser.probe.mjs [screenshotDir]
// Drives the real page (file://) and asserts mechanic outcomes through window.__blink.
import { chromium, devices } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const shots = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(pathToFileURL(resolve("index.html")).href);

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("ok  ", name);
}
const state = () =>
  page.evaluate(() => {
    const a = window.__blink.app;
    const g = a.game;
    return {
      mode: a.mode,
      phase: g?.phase,
      score: g?.score,
      lives: g?.lives,
      px: g?.px,
      py: g?.py,
      jumps: g?.stats.jumps,
      kills: g?.stats.kills,
      deaths: g?.stats.deaths.map((d) => d.cause),
    };
  });
const snap = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });

// Put the running game into play with a clean field and a parked spawner.
async function arena() {
  await page.waitForFunction(() => window.__blink.game?.phase === "play", null, { timeout: 5000 });
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.spawnT = 1e9;
    g.hunters = [];
    g.blips = [];
  });
}
// Place hunters relative to the landing point of a press made right now:
// [ahead along the sweep, sideways].
async function placeAtTip(offsets) {
  await page.evaluate((offsets) => {
    const { game: g, CFG } = window.__blink;
    const a = g.theta + ((Math.PI * 2) / CFG.sweepPeriod) * g.k * (1 / 120);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const lx = g.px + c * CFG.jumpR;
    const ly = g.py + s * CFG.jumpR;
    for (const [ahead, side] of offsets) {
      g.hunters.push({ id: g.nextId++, x: lx + c * ahead - s * side, y: ly + s * ahead + c * side, h: 0, speed: 0, turn: 0, dead: false });
      g.spawned++;
    }
  }, offsets);
}
// Freeze the sweep near an inward angle so a blink stays on the scope.
// The sim is frozen (via hit-stop) during setup so a press resolves on the
// first tick after thaw(), with the sweep exactly where the setup put it.
const thaw = () => page.evaluate(() => (window.__blink.app.hitstop = 0));
// Setup waits until no chain burst or shot from an earlier scenario is still
// in flight; otherwise an old burst can join the new cluster to its chain.
const aimInward = async () => {
  await page.waitForFunction(() => {
    const g = window.__blink.game;
    return !g.pending.length && !g.shots.length;
  });
  return aimInwardNow();
};
const aimInwardNow = () =>
  page.evaluate(() => {
    window.__blink.app.hitstop = 999;
    const g = window.__blink.game;
    g.px = 300;
    g.py = 300;
    g.theta = 0;
  });

await check("loads to the title/attract screen with the demo pilot running", async () => {
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  const t0 = await page.evaluate(() => window.__blink.app.demo.t);
  await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => window.__blink.app.demo.t);
  assert.ok(t1 > t0, "attract demo advances");
  // The demo pilot reads the scope through paint events; if the page stops
  // feeding it events it goes blind and never kills anything.
  await page.waitForFunction(() => window.__blink.app.demo.stats.kills > 0, null, { timeout: 25000 });
  await snap("probe-title");
});

await check("Space starts a game in READY", async () => {
  await page.keyboard.press("Space");
  const s = await state();
  assert.equal(s.mode, "game");
  assert.equal(s.phase, "ready");
  assert.equal(s.lives, await page.evaluate(() => window.__blink.CFG.lives));
});

await check("a press during READY (SECTOR 1 shown) starts play at once with a blink", async () => {
  const s0 = await state();
  assert.equal(s0.phase, "ready");
  await page.keyboard.press("Space");
  await page.waitForTimeout(60);
  const s1 = await state();
  assert.equal(s1.phase, "play");
  assert.equal(s1.jumps, s0.jumps + 1);
  assert.ok(Math.abs(Math.hypot(s1.px - s0.px, s1.py - s0.py) - 110) < 0.5);
});

await check("press (Space) blinks the ship jumpR along the sweep", async () => {
  await arena();
  await aimInward();
  const s0 = await state();
  await page.keyboard.press("Space");
  await thaw();
  await page.waitForTimeout(60);
  const s1 = await state();
  assert.equal(s1.jumps, s0.jumps + 1);
  const d = Math.hypot(s1.px - s0.px, s1.py - s0.py);
  assert.ok(Math.abs(d - 110) < 0.5, `moved ${d}`);
});

await check("pointer press also blinks and its shot destroys a hunter ahead", async () => {
  await aimInward();
  await placeAtTip([[120, 0]]);
  const s0 = await state();
  await page.mouse.click(320, 320);
  await thaw();
  await page.waitForTimeout(150);
  const s1 = await state();
  assert.equal(s1.jumps, s0.jumps + 1);
  assert.equal(s1.kills, s0.kills + 1);
  assert.equal(s1.score - s0.score, 100);
});

await check("KeyZ: the shot hits a 4-hunter cluster and it chains for 100+400+900+1600", async () => {
  await aimInward();
  await placeAtTip([
    [110, 0],
    [110, 36],
    [110, 72],
    [110, 108],
  ]);
  const s0 = await state();
  await page.keyboard.press("KeyZ");
  await thaw();
  await page.waitForTimeout(110);
  await snap("probe-shot");
  await page.waitForTimeout(90);
  await snap("probe-chain");
  await page.waitForTimeout(700);
  const s1 = await state();
  assert.equal(s1.kills - s0.kills, 4);
  assert.equal(s1.score - s0.score, 100 + 400 + 900 + 1600);
});

await check("a kill sends a spark to its bezel tick; the tick goes dark when it arrives", async () => {
  await aimInward();
  await placeAtTip([[120, 0]]);
  const k0 = (await state()).kills;
  await page.keyboard.press("Space");
  await thaw();
  await page.waitForFunction((k0) => window.__blink.game.stats.kills > k0, k0, { timeout: 1000 });
  const tickAt = () =>
    page.evaluate(() => {
      const { game: g, app, CFG } = window.__blink;
      const quota = (window.__blink.CFG.quotaBase + window.__blink.CFG.quotaStep * (g.sector - 1));
      const slot = quota - g.killed;
      const a = -Math.PI / 2 + (slot / quota) * Math.PI * 2;
      const c = document.getElementById("scope");
      const k = c.width / 600;
      const x = (CFG.cx + Math.cos(a) * (CFG.scopeR + 9)) * k;
      const y = (CFG.cy + Math.sin(a) * (CFG.scopeR + 9)) * k;
      const r = Math.round(3.5 * k); // stay clear of the time-bar arc 8 units outside
      const d = c.getContext("2d").getImageData(Math.round(x) - r, Math.round(y) - r, 2 * r + 1, 2 * r + 1).data;
      let gmax = 0;
      for (let i = 1; i < d.length; i += 4) gmax = Math.max(gmax, d[i]);
      return { g: gmax, sparks: app.fx.filter((f) => f.k === "spark" && f.slot === slot).length };
    });
  const during = await tickAt();
  await snap("probe-spark");
  await page.waitForTimeout(900);
  const after = await tickAt();
  assert.equal(during.sparks, 1, "spark in flight for this slot");
  assert.equal(after.sparks, 0);
  assert.ok(during.g > after.g + 60, `tick lit while in flight (${during.g}) then dark (${after.g})`);
});

await check("time bar: arc length on the bezel follows the remaining bonus", async () => {
  const sample = () =>
    page.evaluate(() => {
      const { CFG } = window.__blink;
      const c = document.getElementById("scope");
      const k = c.width / 600;
      const x = c.getContext("2d");
      const at = (deg) => {
        const a = -Math.PI / 2 + (deg * Math.PI) / 180;
        const px = (CFG.cx + Math.cos(a) * (CFG.scopeR + 17)) * k;
        const py = (CFG.cy + Math.sin(a) * (CFG.scopeR + 17)) * k;
        const d = x.getImageData(Math.round(px) - 2, Math.round(py) - 2, 5, 5).data;
        let m = 0;
        for (let i = 1; i < d.length; i += 4) m = Math.max(m, d[i]);
        return m;
      };
      return { a45: at(45), a200: at(200) };
    });
  const setFrac = (f) =>
    page.evaluate((f) => {
      const { game: g, CFG } = window.__blink;
      const q = (window.__blink.CFG.quotaBase + window.__blink.CFG.quotaStep * (g.sector - 1));
      g.sectorT = (1 - f) * ((CFG.parPerHunter * q) / g.k);
      window.__blink.app.hitstop = 999; // hold it still while sampling
    }, f);
  await setFrac(0.9);
  await page.waitForTimeout(60);
  const full = await sample();
  await setFrac(0.3);
  await page.waitForTimeout(60);
  const low = await sample();
  await snap("probe-timebar");
  await page.evaluate(() => (window.__blink.app.hitstop = 0));
  assert.ok(full.a45 > 60 && full.a200 > 60, `90%: lit at 45 and 200 deg ${JSON.stringify(full)}`);
  assert.ok(low.a45 > 60 && low.a200 < 25, `30%: lit at 45, dark at 200 deg ${JSON.stringify(low)}`);
});

await check("sector clear: the bar drains into the score as a TIME BONUS count-up", async () => {
  await page.evaluate(() => {
    const { game: g } = window.__blink;
    g.hunters = [];
    g.blips = [];
    g.killed = (window.__blink.CFG.quotaBase + window.__blink.CFG.quotaStep * (g.sector - 1)) - 1;
    g.spawned = g.killed;
  });
  await aimInward();
  await placeAtTip([[100, 0]]);
  const s0 = (await state()).score;
  await page.keyboard.press("Space");
  await thaw();
  await page.waitForFunction(() => window.__blink.game.phase === "clear", null, { timeout: 2000 });
  const mid = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 750));
    const { app, game: g } = window.__blink;
    return { bonus: app.tally?.bonus, t: app.tally?.t, score: g.score };
  });
  await snap("probe-tally");
  assert.ok(mid.bonus > 0, "tally running");
  assert.equal(mid.score - s0, 100 + mid.bonus, "score includes the kill and the bonus");
  await page.waitForFunction(() => window.__blink.game.phase === "ready", null, { timeout: 4000 });
  assert.equal(await page.evaluate(() => window.__blink.app.tally), null);
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 4000 });
});

await check("blips inside the jump ring are drawn in the danger colour", async () => {
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.px = 300;
    g.py = 300;
    g.blips = [
      { x: 340, y: 300, age: 0.5, id: 900, dist: 40 },
      { x: 300, y: 480, age: 0.5, id: 901, dist: 180 },
    ];
    g.theta = Math.PI; // keep the beam away from the probe pixels
  });
  await page.waitForTimeout(50);
  const px = await page.evaluate(() => {
    const c = document.getElementById("scope");
    const k = c.width / 600;
    const ctx = c.getContext("2d");
    const at = (x, y) => Array.from(ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data);
    return { inside: at(340, 300), onRing: at(300, 480) };
  });
  assert.ok(px.inside[0] > px.inside[1], `inside blip reddish ${px.inside}`);
  assert.ok(px.onRing[1] > px.onRing[0], `ring blip green ${px.onRing}`);
});

await check("close range: an unpainted hunter within nearR shows as a dim red dot; farther ones don't", async () => {
  await page.evaluate(() => {
    const g = window.__blink.game;
    window.__blink.app.hitstop = 999;
    g.hunters = [];
    g.blips = [];
    g.px = 300;
    g.py = 300;
    g.theta = Math.PI / 2; // beam pointing down, away from the probes
    g.hunters.push({ id: 801, x: 300, y: 280, h: 0, speed: 0, turn: 0, dead: false }); // 20 away
    g.hunters.push({ id: 802, x: 300 - 40, y: 300, h: 0, speed: 0, turn: 0, dead: false }); // 40 away
  });
  await page.waitForTimeout(80);
  const px = await page.evaluate(() => {
    const c = document.getElementById("scope");
    const k = c.width / 600;
    const x = c.getContext("2d");
    const red = (wx, wy) => {
      const d = x.getImageData(Math.round((wx - 2) * k), Math.round((wy - 2) * k), Math.round(4 * k), Math.round(4 * k)).data;
      let m = 0;
      for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i] - d[i + 1]);
      return m;
    };
    return { near: red(300, 280), far: red(260, 300) };
  });
  await page.evaluate(() => {
    window.__blink.game.hunters = [];
    window.__blink.app.hitstop = 0;
  });
  assert.ok(px.near > 60, `near hunter drawn red (${px.near})`);
  assert.ok(px.far < 20, `40-away hunter stays hidden (${px.far})`);
});

await check("blinking onto a hunter is a crash, not a kill", async () => {
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.hunters = [];
    g.blips = [];
  });
  await aimInward();
  await placeAtTip([[0, 0]]);
  const s0 = await state();
  await page.keyboard.press("Space");
  await thaw();
  await page.waitForTimeout(100);
  const s1 = await state();
  assert.equal(s1.phase, "dying");
  assert.equal(s1.lives, s0.lives - 1);
  assert.equal(s1.deaths.at(-1), "contact");
  assert.equal(s1.kills, s0.kills);
  assert.equal(s1.score, s0.score);
  const killer = await page.evaluate(() => window.__blink.app.fx.filter((f) => f.k === "killer").length);
  assert.equal(killer, 1, "the hunter landed on is revealed");
  await snap("probe-killer");
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 5000 });
});

await check("blinking off the scope loses a ship (edge)", async () => {
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.hunters = [];
    g.blips = [];
    g.px = 300 + 260;
    g.py = 300;
    g.theta = 0;
  });
  const s0 = await state();
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  const s1 = await state();
  assert.equal(s1.phase, "dying");
  assert.equal(s1.lives, s0.lives - 1);
  assert.equal(s1.deaths.at(-1), "edge");
  await snap("probe-edge-death");
});

await check("contact with the last ship ends the game; hi-score saved", async () => {
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 5000 });
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.lives = 1;
    g.spawnT = 1e9;
    g.hunters = [{ id: 999, x: g.px + 4, y: g.py, h: 0, speed: 0, turn: 0, dead: false }];
  });
  await page.waitForFunction(() => window.__blink.game.phase === "over", null, { timeout: 4000 });
  const s = await state();
  assert.equal(s.deaths.at(-1), "contact");
  const hi = await page.evaluate(() => Number(localStorage.getItem("blink-scope-hi")));
  assert.equal(hi, s.score);
  await page.waitForTimeout(1300);
  await snap("probe-gameover");
});

await check("restart: press on GAME OVER starts a fresh game", async () => {
  await page.keyboard.press("Space");
  const s = await state();
  assert.equal(s.mode, "game");
  assert.equal(s.phase, "ready");
  assert.equal(s.score, 0);
  assert.equal(s.lives, await page.evaluate(() => window.__blink.CFG.lives));
});

await check("idle in the real page loses a ship without scoring", async () => {
  await page.waitForFunction(() => window.__blink.game.stats.deaths.length > 0, null, { timeout: 30000 });
  const s = await state();
  assert.equal(s.score, 0);
  assert.equal(s.deaths[0], "contact");
});

await check("?speed and ?sector overrides start a fixed-speed, later-sector game", async () => {
  await page.goto(pathToFileURL(resolve("index.html")).href + "?speed=1.3&sector=5");
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  await page.keyboard.press("Space");
  const s = await page.evaluate(() => ({ k: window.__blink.game.k, sector: window.__blink.game.sector }));
  assert.equal(s.k, 1.3);
  assert.equal(s.sector, 5);
  await page.goto(pathToFileURL(resolve("index.html")).href + "?sector=8");
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  await page.keyboard.press("Space");
  const t = await page.evaluate(() => ({ k: window.__blink.game.k, sector: window.__blink.game.sector }));
  assert.equal(t.sector, 8);
  assert.ok(Math.abs(t.k - 1.2 * 1.3) < 1e-9);
});

await check("metronome: eight clicks per sweep turn while playing", async () => {
  await page.goto(pathToFileURL(resolve("index.html")).href);
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 5000 });
  const r = await page.evaluate(async () => {
    const { app, game: g, CFG } = window.__blink;
    g.spawnT = 1e9;
    g.hunters = [];
    const m0 = app.metro;
    const t0 = g.t;
    const turn = CFG.sweepPeriod / g.k;
    await new Promise((res) => {
      const f = () => (g.t - t0 >= turn * 2 ? res() : requestAnimationFrame(f));
      f();
    });
    return { clicks: app.metro - m0, turns: (g.t - t0) / turn };
  });
  assert.ok(Math.abs(r.clicks - 8 * r.turns) <= 1.01, `${r.clicks} clicks in ${r.turns.toFixed(2)} turns`);
});

await check("a big chain blooms the graticule but never fills the screen", async () => {
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.hunters = [];
    g.blips = [];
  });
  await aimInward();
  await placeAtTip([
    [110, 0],
    [110, 36],
    [110, 72],
    [110, -36],
  ]);
  await page.keyboard.press("Space");
  await thaw();
  await page.waitForFunction(() => window.__blink.app.surge > 0.5, null, { timeout: 1500 });
  const px = await page.evaluate(() => {
    const c = document.getElementById("scope");
    return Array.from(c.getContext("2d").getImageData(3, 3, 1, 1).data);
  });
  await snap("probe-surge");
  assert.ok(px[0] + px[1] + px[2] < 40, `corner stays dark: ${px}`);
});

await check("game over: picture collapses to a line then a dot before GAME OVER appears", async () => {
  await page.waitForFunction(() => window.__blink.app.surge === 0, null, { timeout: 3000 });
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.lives = 1;
    g.spawnT = 1e9;
    g.hunters = [{ id: 998, x: g.px + 4, y: g.py, h: 0, speed: 0, turn: 0, dead: false }];
  });
  await page.waitForFunction(() => window.__blink.game.phase === "over", null, { timeout: 4000 });
  await page.waitForFunction(() => window.__blink.app.overT > 0.38 && window.__blink.app.overT < 0.5, null, { timeout: 2000, polling: 5 });
  const line = await page.evaluate(() => {
    const c = document.getElementById("scope");
    const x = c.getContext("2d");
    const n = c.width;
    const sum = (y) => Array.from(x.getImageData(0, Math.round(y), n, 1).data).reduce((a, v, i) => (i % 4 === 3 ? a : a + v), 0);
    return { mid: sum(n / 2), top: sum(n * 0.25) };
  });
  await snap("probe-collapse");
  assert.ok(line.mid > 10 * (line.top + 1), `bright centre line (${line.mid}) over dark field (${line.top})`);
  await page.waitForFunction(() => window.__blink.app.overT > 1.3, null, { timeout: 3000 });
  await snap("probe-gameover-after");
  // The tube stays off: no scope face or graticule, only the result text.
  const dark = await page.evaluate(() => {
    const c = document.getElementById("scope");
    const k = c.width / 600;
    const x = c.getContext("2d");
    const lum = (wx, wy, r) => {
      const d = x.getImageData(Math.round((wx - r) * k), Math.round((wy - r) * k), Math.round(2 * r * k), Math.round(2 * r * k)).data;
      let m = 0;
      for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i] + d[i + 1] + d[i + 2]);
      return m;
    };
    return { face: lum(150, 450, 30), crosshair: lum(300, 80, 4), title: lum(300, 233, 20) };
  });
  assert.ok(dark.face < 30 && dark.crosshair < 30, `scope stays dark ${JSON.stringify(dark)}`);
  assert.ok(dark.title > 200, `GAME OVER is lit ${JSON.stringify(dark)}`);
});

await check("restart from the dark screen powers the tube back on", async () => {
  await page.keyboard.press("Space");
  const p0 = await page.evaluate(() => ({ powerT: window.__blink.app.powerT, phase: window.__blink.game.phase }));
  assert.ok(p0.powerT < 0.2, `power-on running (${p0.powerT})`);
  assert.equal(p0.phase, "ready");
  await page.waitForFunction(() => window.__blink.app.powerT > 0.4);
  const face = await page.evaluate(() => {
    const c = document.getElementById("scope");
    const k = c.width / 600;
    const d = c.getContext("2d").getImageData(Math.round(296 * k), Math.round(76 * k), Math.round(8 * k), Math.round(8 * k)).data;
    let m = 0;
    for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i + 1]);
    return m;
  });
  assert.ok(face > 20, `graticule visible again (${face})`);
});

await check("sonar echoes return after range/speed and are Doppler-shifted by approach", async () => {
  await page.goto(pathToFileURL(resolve("index.html")).href);
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 5000 });
  await aimInward();
  await page.evaluate(() => {
    const { game: g, app } = window.__blink;
    g.spawnT = 1e9;
    g.hunters = [];
    app.echoes = [];
    const put = (id, x, y, h, speed) => g.hunters.push({ id, x, y, h, speed, turn: 0, dead: false });
    // Flank contacts beside the firing line (theta = 0, from (300,300) landing at (410,300)).
    put(701, 470, 300 + 55, Math.atan2(-55, -170), 40); // near, heading at the ship: approaching
    put(702, 560, 300 - 70, 0, 40); // far, heading away: receding
    g.spawned += 2;
  });
  await page.keyboard.press("Space");
  await thaw();
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ echoes: window.__blink.app.echoes, k: window.__blink.game.k, speed: window.__blink.CFG.shotSpeed }));
  const near = r.echoes.find((e) => e.id === 701);
  const far = r.echoes.find((e) => e.id === 702);
  assert.ok(near && far, `both flanks echoed: ${JSON.stringify(r.echoes)}`);
  assert.ok(Math.abs(near.delay - near.range / (r.speed * r.k)) < 1e-9);
  assert.ok(far.delay > near.delay, "farther contact echoes later");
  assert.ok(near.doppler > 1 && far.doppler < 1, `approach raises, retreat lowers pitch (${near.doppler}, ${far.doppler})`);
});

await check("audio: a worst-case stack (chain + pings + echoes + clicks) stays below clipping", async () => {
  await aimInward();
  await placeAtTip([
    [110, 0],
    [110, 36],
    [110, 72],
    [110, -36],
    [110, -72],
    [110, 108],
  ]);
  await page.evaluate(() => {
    const g = window.__blink.game;
    for (let i = 0; i < 6; i++) g.hunters.push({ id: 600 + i, x: 300 + 150 + i * 12, y: 300 + 60 + (i % 2) * 20, h: Math.PI, speed: 40, turn: 0, dead: false });
  });
  await page.keyboard.press("Space");
  await thaw();
  const peaks = await page.evaluate(async () => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1800) {
      out.push(window.__blink.peak());
      await new Promise((r) => setTimeout(r, 15));
    }
    return { max: Math.max(...out), state: window.__blink.audioState?.() };
  });
  console.log(`      peak output ${peaks.max.toFixed(3)}`);
  assert.ok(peaks.max > 0.01, "audio actually rendered (otherwise this check is inconclusive)");
  assert.ok(peaks.max < 1, `no clipping (peak ${peaks.max})`);
});

await check("game clear: finishing sector 10 shows ALL SECTORS CLEAR, saves HI, and restarts", async () => {
  await page.goto(pathToFileURL(resolve("index.html")).href + "?sector=10");
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  await page.evaluate(() => localStorage.setItem("blink-scope-hi", "0"));
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 5000 });
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.spawnT = 1e9;
    g.hunters = [];
    g.score = 123450;
    g.killed = window.__blink.CFG.quotaBase + window.__blink.CFG.quotaStep * 9;
  });
  await page.waitForFunction(() => window.__blink.game.phase === "complete", null, { timeout: 6000 });
  const r = await page.evaluate(() => ({ sector: window.__blink.game.sector, score: window.__blink.game.score, hi: Number(localStorage.getItem("blink-scope-hi")) }));
  assert.equal(r.sector, 10);
  assert.equal(r.hi, r.score, "HI saved on completion");
  await page.waitForFunction(() => window.__blink.app.overT > 1.4);
  await snap("probe-complete");
  const lit = await page.evaluate(() => {
    const c = document.getElementById("scope");
    const k = c.width / 600;
    const d = c.getContext("2d").getImageData(Math.round(150 * k), Math.round(195 * k), Math.round(300 * k), Math.round(30 * k)).data;
    let m = 0;
    for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i] + d[i + 1] + d[i + 2]);
    return m;
  });
  assert.ok(lit > 500, `ALL SECTORS CLEAR drawn (${lit})`);
  await page.keyboard.press("Space");
  const s2 = await state();
  assert.equal(s2.phase, "ready");
  assert.equal(s2.score, 0);
});

await check("keyboard: ordinary keys are the button; modifiers, shortcuts and system keys are not; presses within 50 ms merge", async () => {
  await page.goto(pathToFileURL(resolve("index.html")).href);
  await page.waitForFunction(() => window.__blink?.app.mode === "title");
  await page.keyboard.press("KeyQ"); // any letter starts the game
  assert.equal(await page.evaluate(() => window.__blink.app.mode), "game");
  await page.waitForFunction(() => window.__blink.game.phase === "play", null, { timeout: 5000 });
  await page.evaluate(() => {
    const g = window.__blink.game;
    g.spawnT = 1e9;
    g.hunters = [];
  });
  const jumps = () => page.evaluate(() => window.__blink.game.stats.jumps);
  const centre = () =>
    page.evaluate(() => {
      const g = window.__blink.game;
      g.px = 300;
      g.py = 300;
    });
  const tryKey = async (key) => {
    await centre();
    await page.waitForTimeout(70);
    const j0 = await jumps();
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
    return (await jumps()) - j0;
  };
  for (const k of ["KeyA", "Digit7", "ArrowLeft", "Slash", "Backspace", "Numpad3"]) assert.equal(await tryKey(k), 1, `${k} blinks`);
  for (const k of ["Shift", "Control", "Alt", "Tab", "Escape", "F2", "Control+KeyB", "Alt+KeyZ", "Meta+KeyZ"]) assert.equal(await tryKey(k), 0, `${k} ignored`);
  // A rolled pair of keys 10 ms apart is one blink; the next press 80 ms later counts.
  await centre();
  await page.waitForTimeout(70);
  const j0 = await jumps();
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(10);
  await page.keyboard.down("KeyD");
  await page.keyboard.up("KeyS");
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(40);
  assert.equal((await jumps()) - j0, 1, "rolled pair merges");
  // Held key auto-repeat is not extra presses.
  await centre();
  await page.waitForTimeout(70);
  const j1 = await jumps();
  await page.keyboard.down("KeyF");
  await page.keyboard.down("KeyF"); // auto-repeat (repeat: true)
  await page.keyboard.up("KeyF");
  await page.waitForTimeout(40);
  assert.equal((await jumps()) - j1, 1, "auto-repeat ignored");
});

await check("mobile: the whole screen is the button, and the scope fits inside safe-area insets", async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const m = await ctx.newPage();
  m.on("pageerror", (e) => errors.push(String(e)));
  await m.goto(pathToFileURL(resolve("index.html")).href);
  await m.waitForFunction(() => window.__blink?.app.mode === "title");
  const box = await m.evaluate(() => {
    const r = document.getElementById("scope").getBoundingClientRect();
    return { y: r.y, h: r.height, w: r.width };
  });
  assert.ok(box.y > 40, "portrait leaves a band above the scope");
  // Tap in the empty band above the scope: starts the game.
  await m.touchscreen.tap(195, box.y / 2);
  assert.equal(await m.evaluate(() => window.__blink.app.mode), "game");
  // Tap in the band below the scope during READY: an ordinary blink.
  const j0 = await m.evaluate(() => window.__blink.game.stats.jumps);
  await m.touchscreen.tap(195, box.y + box.h + (664 - box.y - box.h) / 2);
  await m.waitForTimeout(80);
  assert.equal(await m.evaluate(() => window.__blink.game.stats.jumps), j0 + 1);
  // Long press / context menu is suppressed.
  const prevented = await m.evaluate(() => !document.body.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  assert.ok(prevented, "context menu suppressed");
  // Safe-area insets (as on a notched phone in landscape) shrink the scope to fit.
  const fit = await m.evaluate(() => {
    document.body.style.padding = "0 44px 0 44px";
    window.dispatchEvent(new Event("resize"));
    const r = document.getElementById("scope").getBoundingClientRect();
    return { left: r.left, right: r.right, vw: innerWidth };
  });
  assert.ok(fit.left >= 44 - 0.5 && fit.right <= fit.vw - 44 + 0.5, `scope inside insets ${JSON.stringify(fit)}`);
  await ctx.close();
});

assert.deepEqual(errors, []);
console.log(`\n${passed} passed, 0 page errors`);
await browser.close();
