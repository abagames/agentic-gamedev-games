// Runtime smoke test: load the real build in a real browser, idle through attract,
// then drive it. Any console error, uncaught exception, or crash fails the run.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { CROSS_ROAD, DISTANT_OVERPASS } from '../src/spec.js';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const path = join(ROOT, rel === '/' ? 'index.html' : rel);
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const problems = [];
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('crash', () => problems.push('page crashed'));

const step = async (label, fn) => { process.stdout.write(`  ${label} ... `); await fn(); console.log('ok'); };

await step('load', async () => {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 10000 });
});

await step('attract runs 6s and the demo car actually moves', async () => {
  // window0 is the snapshot game.js took right as the (silent, pre-render) warm-up handed
  // off to the visible attract loop — see Game._enterAttract's `attractWindowStart`. B4's
  // acceptance is about what happens ON SCREEN in the 6s window, so tow/release counts
  // must be deltas against that snapshot, not the sim's cumulative totals (which would
  // include the warm-up and could pass even if the visible window showed nothing).
  const z0 = await page.evaluate(() => window.__game.sim.z);
  const window0 = await page.evaluate(() => window.__game.attractWindowStart);
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => ({
    z: window.__game.sim.z, mode: window.__game.mode,
    deep: window.__game.sim.stats.deepMetres, releases: window.__game.sim.stats.releases,
  }));
  if (s.mode !== 'attract') throw new Error(`expected attract, got ${s.mode}`);
  if (s.z - z0 < 200) throw new Error(`demo car barely moved: ${(s.z - z0).toFixed(0)}m`);
  const windowDeep = s.deep - window0.deep;
  const windowReleases = s.releases - window0.releases;
  console.log(`\n      demo drove ${(s.z - z0).toFixed(0)}m; within the 6s window: ${windowDeep.toFixed(0)}m in the tow, ${windowReleases} slingshot release(s)`);
  process.stdout.write('    ');
  // B4 acceptance: within the visible 6s window (not cumulative since sim start), the
  // demo must accumulate >150m of tow distance and fire at least one slingshot release.
  if (windowDeep < 150) throw new Error(`demo spent only ${windowDeep.toFixed(0)}m in the tow during the 6s window, expected > 150m`);
  if (windowReleases < 1) throw new Error('demo fired no slingshot releases within the 6s window');
});

await step('start the run', async () => {
  await page.keyboard.press('KeyZ');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const ready0 = await page.evaluate(() => ({ mode: window.__game.mode, modeT: window.__game.modeT,
    paused: window.__game.pausedOverlayVisible }));
  await page.waitForTimeout(350);
  const ready1 = await page.evaluate(() => ({ mode: window.__game.mode, modeT: window.__game.modeT,
    paused: window.__game.pausedOverlayVisible }));
  if (ready0.mode !== 'ready' || ready1.mode !== 'ready' || !ready1.paused || ready1.modeT !== ready0.modeT) {
    throw new Error(`READY did not freeze on blur: ${JSON.stringify({ ready0, ready1 })}`);
  }
  await page.screenshot({ path: 'test/screenshot-paused-ready.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(2600);
  const mode = await page.evaluate(() => window.__game.mode);
  if (mode !== 'race') throw new Error(`expected race, got ${mode}`);
});

await step('blur + hidden freeze the race and held input must be re-armed', async () => {
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  const frozen0 = await page.evaluate(() => ({
    z: window.__game.sim.z, timer: window.__game.sim.timer, t: window.__game.t,
    modeT: window.__game.modeT, active: window.__game.active,
    paused: window.__game.pausedOverlayVisible, visible: window.__game.sound._pageVisible,
  }));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
    code: 'ArrowUp', key: 'ArrowUp', repeat: true, bubbles: true,
  })));
  await page.waitForTimeout(400);
  const frozen1 = await page.evaluate(() => ({
    z: window.__game.sim.z, timer: window.__game.sim.timer, t: window.__game.t,
    modeT: window.__game.modeT, active: window.__game.active,
    paused: window.__game.pausedOverlayVisible, visible: window.__game.sound._pageVisible,
  }));
  if (JSON.stringify(frozen1) !== JSON.stringify(frozen0) || frozen1.active || !frozen1.paused || frozen1.visible) {
    throw new Error(`race clocks/input changed while inactive: ${JSON.stringify({ frozen0, frozen1 })}`);
  }
  await page.screenshot({ path: 'test/screenshot-paused-race.png' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const blocked = await page.evaluate(() => ({
    active: window.__game.active, held: window.__game.keys.has('ArrowUp'),
    blocked: window.__game.blockedKeys.has('ArrowUp'), visible: window.__game.sound._pageVisible,
  }));
  if (!blocked.active || blocked.held || !blocked.blocked || !blocked.visible) {
    throw new Error(`held key re-armed without keyup: ${JSON.stringify(blocked)}`);
  }
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(150);
  const rearmed = await page.evaluate(() => ({ held: window.__game.keys.has('ArrowUp'),
    blocked: window.__game.blockedKeys.has('ArrowUp') }));
  await page.keyboard.up('ArrowUp');
  if (!rearmed.held || rearmed.blocked) throw new Error(`fresh keydown did not re-arm: ${JSON.stringify(rearmed)}`);
});

await step('input burst: steering, throttle, boost', async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600);
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(400);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('KeyZ'); await page.waitForTimeout(300);
    await page.keyboard.press('KeyZ'); await page.waitForTimeout(300);
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(200);
    await page.keyboard.up('ArrowDown');
  }
  await page.keyboard.up('ArrowUp');
});

await step('state is sane after driving', async () => {
  const s = await page.evaluate(() => {
    const g = window.__game;
    return { z: g.sim.z, x: g.sim.x, speed: g.sim.speed, charge: g.sim.charge,
      score: g.sim.score, leg: g.sim.leg, mode: g.mode };
  });
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${k} is ${v}`);
  }
  if (s.z <= 0) throw new Error('car never moved');
  if (Math.abs(s.x) > 2) throw new Error(`x escaped the road: ${s.x}`);
  console.log(`\n      z=${s.z.toFixed(0)}m speed=${(s.speed * 3.6).toFixed(0)}kmh charge=${s.charge.toFixed(0)} leg=${s.leg} score=${Math.floor(s.score)}`);
  process.stdout.write('    ');
});

await step('fast-forward to the finish via a scripted autopilot', async () => {
  // Drive the sim directly at high speed to confirm the ending path exists and
  // the ceremony/entry states do not throw.
  await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 20000 && !g.sim.finished && !g.sim.gameOver; i++) {
      g.sim.timer = 30;
      g.sim.speed = 120;
      g.sim.step(1 / 60, { steer: 0, throttle: 1, boost: false });
    }
  });
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => ({ finished: window.__game.sim.finished, mode: window.__game.mode }));
  if (!s.finished) throw new Error('never reached the finish');
  if (s.mode !== 'finish') throw new Error(`expected finish ceremony, got ${s.mode}`);
  await page.waitForTimeout(3000);
});

await page.screenshot({ path: 'test/screenshot-finish.png' });
await page.evaluate(() => { window.__game._enterAttract(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'test/screenshot-attract.png' });
await page.evaluate(() => { window.__game.startRun(); });
await page.waitForTimeout(3500);
await page.screenshot({ path: 'test/screenshot-race.png' });

// Visual evidence for the finite-distance skyline tower. Hold every gameplay variable
// constant and vary only travelled distance, so the three frames isolate its approach.
for (const [name, z] of [['far', 0], ['mid', 6000], ['near', 12000]]) {
  await page.evaluate((zz) => {
    const g = window.__game;
    g.sim.z = zz; g.sim.x = 0; g.sim.speed = 0; g.bgOffset = 0;
    g.render();
  }, z);
  await page.screenshot({ path: `test/screenshot-tower-${name}.png` });
}

// Representative flat-cross-road evidence. Choose the straightest, curviest and most
// vertically changing authored positions on the live course, hold the car 82 m before
// each one, and freeze all presentation variables. These are visual checks, not mechanics.
const crossingCases = await page.evaluate((positions) => {
  const c = window.__game.course;
  return positions.map((z) => ({
    z,
    curve: c.segmentAt(z).curve,
    rise: c.elevationAt(z + 40) - c.elevationAt(z - 40),
    crest: Math.abs(c.elevationAt(z) * 2 - c.elevationAt(z - 40) - c.elevationAt(z + 40)),
  }));
}, CROSS_ROAD.positionsM);
const picks = {
  straight: crossingCases.reduce((a, b) => (Math.abs(b.curve) + Math.abs(b.rise) * 0.02 < Math.abs(a.curve) + Math.abs(a.rise) * 0.02 ? b : a)),
  left: crossingCases.reduce((a, b) => (b.curve < a.curve ? b : a)),
  right: crossingCases.reduce((a, b) => (b.curve > a.curve ? b : a)),
  uphill: crossingCases.reduce((a, b) => (b.rise > a.rise ? b : a)),
  downhill: crossingCases.reduce((a, b) => (b.rise < a.rise ? b : a)),
  crest: crossingCases.reduce((a, b) => (b.crest > a.crest ? b : a)),
};
for (const [name, pick] of Object.entries(picks)) {
  await page.evaluate((z) => {
    const g = window.__game;
    g.sim.z = z - 82; g.sim.x = 0; g.sim.speed = 0; g.bgOffset = 0;
    // Keep the next checkpoint ahead of the injected camera position; otherwise the live
    // animation loop immediately re-triggers every earlier gate before screenshot().
    g.sim.leg = Math.min(g.course.checkpoints.length,
      1 + g.course.checkpoints.filter((cp) => cp.z <= g.sim.z).length);
    // The finish fast-forward above can leave a checkpoint ceremony timer alive. Clear
    // presentation overlays so this screenshot isolates the road-plane evidence.
    g.cpFlash = 0; g.releaseFlash = 0; g.chainFlash = 0; g.boostOutFlash = 0; g.shake = 0;
    g.render();
  }, pick.z);
  await page.screenshot({ path: `test/screenshot-cross-road-${name}.png` });
  console.log(`  cross-road ${name}: z=${pick.z}m curve=${pick.curve.toFixed(2)} rise80=${pick.rise.toFixed(1)}m crest=${pick.crest.toFixed(1)}m`);
}

// Fade-boundary evidence: use one straight representative and vary only camera distance.
// The far/mid/full captures make a pop or a horizon-only blinking stripe visible.
for (const [name, distance] of [
  ['fade-start', CROSS_ROAD.visibleFarM - 20],
  ['fade-mid', CROSS_ROAD.visibleFarM - CROSS_ROAD.fadeInM / 2],
  ['fade-full', CROSS_ROAD.visibleFarM - CROSS_ROAD.fadeInM - 40],
]) {
  await page.evaluate(({ z, distance }) => {
    const g = window.__game;
    g.sim.z = z - distance; g.sim.x = 0; g.sim.speed = 0; g.bgOffset = 0;
    g.cpFlash = 0; g.releaseFlash = 0; g.chainFlash = 0; g.boostOutFlash = 0; g.shake = 0;
    g.render();
  }, { z: picks.straight.z, distance });
  await page.screenshot({ path: `test/screenshot-cross-road-${name}.png` });
}

// Distant elevated-road evidence under representative course geometry. At 450 m it is
// fully inside the fade window and remains scenery behind the road, cars and warnings.
const overpassCases = await page.evaluate((positions) => {
  const c = window.__game.course;
  return positions.map((z) => ({
    z,
    curve: Math.abs(c.segmentAt(z).curve),
    rise: Math.abs(c.elevationAt(z + 80) - c.elevationAt(z - 80)),
  }));
}, DISTANT_OVERPASS.positionsM);
const overpassPicks = {
  straight: overpassCases.reduce((a, b) => (b.curve + b.rise * 0.02 < a.curve + a.rise * 0.02 ? b : a)),
  curve: overpassCases.reduce((a, b) => (b.curve > a.curve ? b : a)),
  hill: overpassCases.reduce((a, b) => (b.rise > a.rise ? b : a)),
};
for (const [name, pick] of Object.entries(overpassPicks)) {
  await page.evaluate((z) => {
    const g = window.__game;
    g.sim.z = z - 450; g.sim.x = 0; g.sim.speed = 0; g.bgOffset = 0;
    g.sim.leg = Math.min(g.course.checkpoints.length,
      1 + g.course.checkpoints.filter((cp) => cp.z <= g.sim.z).length);
    g.cpFlash = 0; g.releaseFlash = 0; g.chainFlash = 0; g.boostOutFlash = 0; g.shake = 0;
    g.render();
  }, pick.z);
  await page.screenshot({ path: `test/screenshot-overpass-${name}.png` });
  console.log(`  overpass ${name}: z=${pick.z}m curve=${pick.curve.toFixed(2)} rise160=${pick.rise.toFixed(1)}m`);
}

// One fixed structure across the near handoff: approach, directly underneath, and exit.
// These isolate the painter-order transition that the ordinary driving smoke may cross too
// quickly to capture at 100 m/s.
const passZ = overpassPicks.straight.z;
for (const [name, dz] of [['approach', 220], ['under', 12], ['exit', -80]]) {
  await page.evaluate(({ z, rel }) => {
    const g = window.__game;
    g.sim.z = z - rel; g.sim.x = 0; g.sim.speed = 0; g.bgOffset = 0;
    g.sim.leg = Math.min(g.course.checkpoints.length,
      1 + g.course.checkpoints.filter((cp) => cp.z <= g.sim.z).length);
    g.cpFlash = 0; g.releaseFlash = 0; g.chainFlash = 0; g.boostOutFlash = 0; g.shake = 0;
    g.render();
  }, { z: passZ, rel: dz });
  await page.screenshot({ path: `test/screenshot-underpass-${name}.png` });
}

// Adversarial visual evidence at the most curved and most vertically changing authored
// crossings, close enough that the foreground tessellation and near-plane clip are active.
for (const [kind, pick] of [['curve', overpassPicks.curve], ['hill', overpassPicks.hill]]) {
  for (const [phase, dz] of [['approach', 220], ['under', 12], ['exit', -80]]) {
    await page.evaluate(({ z, rel }) => {
      const g = window.__game;
      g.sim.z = z - rel; g.sim.x = 0; g.sim.speed = 0; g.bgOffset = 0;
      g.sim.leg = Math.min(g.course.checkpoints.length,
        1 + g.course.checkpoints.filter((cp) => cp.z <= g.sim.z).length);
      g.cpFlash = 0; g.releaseFlash = 0; g.chainFlash = 0; g.boostOutFlash = 0; g.shake = 0;
      g.render();
    }, { z: pick.z, rel: dz });
    await page.screenshot({ path: `test/screenshot-underpass-${kind}-${phase}.png` });
  }
}

await browser.close();
server.close();

if (problems.length) {
  console.log(`\nSMOKE FAILED — ${problems.length} runtime problem(s):`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nSMOKE PASSED — no console errors, no exceptions, no crash.');
console.log('Screenshots: test/screenshot-attract.png, screenshot-race.png, screenshot-finish.png, screenshot-paused-{ready,race}.png, screenshot-tower-{far,mid,near}.png, screenshot-cross-road-{straight,left,right,uphill,downhill,crest,fade-start,fade-mid,fade-full}.png, screenshot-overpass-{straight,curve,hill}.png, screenshot-underpass-{approach,under,exit}.png');
