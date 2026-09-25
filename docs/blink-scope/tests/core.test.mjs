// Mechanic conformance for the simulation core: node tests/core.test.mjs
import assert from "node:assert/strict";
import { createGame, step, tipPoint, CFG, TAU, sectorParams, speedFor, sweepOmega, blipLife, bonusFrac, timeBonus } from "../game-core.js";

const DT = 1 / 120;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok  ", name);
  } catch (e) {
    console.log("FAIL", name);
    throw e;
  }
}

// A game already in play with no spawner interference.
function playing(seed = 1) {
  const g = createGame(seed);
  while (g.phase !== "play") step(g, DT);
  g.spawnT = 1e9;
  g.hunters = [];
  return g;
}
function hunter(g, x, y, speed = 0) {
  const h = { id: g.nextId++, x, y, h: 0, speed, turn: 0, dead: false };
  g.hunters.push(h);
  g.spawned++;
  return h;
}
function runFor(g, sec, press = () => false) {
  const all = [];
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) all.push(...step(g, DT, press(g, i)).map((e) => ({ ...e })));
  return all;
}

test("idle never scores and loses every ship to contact", () => {
  const g = createGame(5);
  runFor(g, 200);
  assert.equal(g.phase, "over");
  assert.equal(g.score, 0);
  assert.ok(g.stats.deaths.every((d) => d.cause === "contact"));
});

test("press during READY starts play at once and is an ordinary blink", () => {
  const g = createGame(1);
  step(g, DT);
  assert.equal(g.phase, "ready");
  const x0 = g.px;
  const y0 = g.py;
  step(g, DT, true);
  assert.equal(g.phase, "play");
  assert.equal(g.stats.jumps, 1);
  assert.ok(Math.abs(Math.hypot(g.px - x0, g.py - y0) - CFG.jumpR) < 1e-6);
  assert.equal(g.shots.length, 1);
  // From here the sector runs normally: the time bonus drains.
  const t0 = g.sectorT;
  runFor(g, 0.5);
  assert.ok(g.sectorT > t0);
});

test("no press: READY still ends by itself after readyTime", () => {
  const g = createGame(1);
  runFor(g, CFG.readyTime - 0.05);
  assert.equal(g.phase, "ready");
  runFor(g, 0.1);
  assert.equal(g.phase, "play");
});

test("blink lands exactly jumpR along the sweep angle", () => {
  const g = playing();
  const before = { x: g.px, y: g.py };
  const th = g.theta + sweepOmega(g) * DT; // angle after this step's rotation
  step(g, DT, true);
  assert.ok(Math.abs(Math.hypot(g.px - before.x, g.py - before.y) - CFG.jumpR) < 1e-6);
  assert.ok(Math.abs(Math.atan2(g.py - before.y, g.px - before.x) - Math.atan2(Math.sin(th), Math.cos(th))) < 1e-6);
});

// Landing point and heading of a press made on the next step.
function aim(g) {
  g.theta = 0;
  const th = sweepOmega(g) * DT;
  return {
    lx: g.px + Math.cos(th) * CFG.jumpR,
    ly: g.py + Math.sin(th) * CFG.jumpR,
    dx: Math.cos(th),
    dy: Math.sin(th),
  };
}

test("landing on a hunter is a crash, not a kill", () => {
  const g = playing();
  const { lx, ly } = aim(g);
  const h = hunter(g, lx, ly + CFG.contactR - 2);
  const lives = g.lives;
  step(g, DT, true);
  assert.equal(g.phase, "dying");
  assert.equal(g.lives, lives - 1);
  assert.equal(g.stats.deaths.at(-1).cause, "contact");
  assert.ok(!h.dead);
  assert.equal(g.score, 0);
});

test("the blink fires a shot along the sweep that kills the first hunter in its band", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const along = 150;
  const w = CFG.shotW0 + CFG.shotSpread * along;
  // Just inside the band at 150 ahead, and a second one directly behind it.
  const first = hunter(g, lx + dx * along - dy * (w - 2), ly + dy * along + dx * (w - 2));
  const beyond = hunter(g, lx + dx * (along + 90), ly + dy * (along + 90)); // > burstR away
  step(g, DT, true);
  assert.equal(g.shots.length, 1);
  assert.ok(!first.dead, "the shot needs travel time");
  runFor(g, along / (CFG.shotSpeed * g.k) + 0.03);
  assert.ok(first.dead);
  assert.ok(!beyond.dead, "the shot stops at the first hit");
  assert.equal(g.score, 100);
  assert.equal(g.shots.length, 0);
});

test("a hunter just outside the shot band survives; shots expire at shotRange", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const along = 150;
  const w = CFG.shotW0 + CFG.shotSpread * along;
  const miss = hunter(g, lx + dx * along - dy * (w + 3), ly + dy * along + dx * (w + 3));
  step(g, DT, true);
  const ev = runFor(g, CFG.shotRange / (CFG.shotSpeed * g.k) + 0.05);
  assert.ok(!miss.dead);
  assert.ok(ev.some((e) => e.type === "shotEnd"));
  assert.equal(g.shots.length, 0);
  assert.equal(g.stats.misses, 1);
});

test("hunters passed over by the blink are not hit (the shot starts at the landing point)", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const passed = hunter(g, lx - dx * 50, ly - dy * 50);
  step(g, DT, true);
  runFor(g, 0.4);
  assert.ok(!passed.dead);
  assert.equal(g.score, 0);
});

test("chain: the shot's kill bursts through hunters spaced inside burstR, scoring 100·n² per link", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const bx = lx + dx * 100;
  const by = ly + dy * 100;
  const hs = [0, 1, 2, 3].map((i) => hunter(g, bx - dy * i * (CFG.burstR - 4), by + dx * i * (CFG.burstR - 4)));
  step(g, DT, true);
  runFor(g, 0.8);
  assert.ok(hs.every((h) => h.dead));
  assert.equal(g.score, 100 + 400 + 900 + 1600);
  assert.equal(g.stats.bestChain, 4);
});

test("a hunter is scored exactly once even when two bursts cover it", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const bx = lx + dx * 100;
  const by = ly + dy * 100;
  hunter(g, bx, by); // shot hit
  hunter(g, bx - dy * 30, by + dx * 30); // link 1
  const shared = hunter(g, bx - dy * 15 + dx * 30, by + dx * 15 + dy * 30); // inside both bursts
  step(g, DT, true);
  const ev = runFor(g, 0.8);
  assert.ok(shared.dead);
  assert.equal(ev.filter((e) => e.type === "kill" && e.id === shared.id).length, 1);
  assert.equal(g.stats.kills, 3);
});

test("landing outside the scope loses the ship (edge)", () => {
  const g = playing();
  g.px = CFG.cx + CFG.scopeR - 20;
  g.py = CFG.cy;
  g.theta = 0;
  const lives = g.lives;
  step(g, DT, true);
  assert.equal(g.phase, "dying");
  assert.equal(g.lives, lives - 1);
  assert.equal(g.stats.deaths.at(-1).cause, "edge");
  assert.equal(g.score, 0);
});

test("the sweep paints each hunter once per revolution", () => {
  const g = playing();
  const h = hunter(g, g.px + 80, g.py + 30);
  const ev = runFor(g, (TAU / sweepOmega(g)) * 3 - 0.01);
  assert.equal(ev.filter((e) => e.type === "paint" && e.id === h.id).length, 3);
});

test("contact loses a ship; respawn clears nearby hunters without scoring", () => {
  const g = playing();
  hunter(g, g.px + 5, g.py);
  step(g, DT);
  assert.equal(g.phase, "dying");
  assert.equal(g.stats.deaths.at(-1).cause, "contact");
  runFor(g, CFG.dyingTime + 0.05);
  assert.equal(g.phase, "ready");
  assert.equal(g.hunters.length, 0);
  assert.equal(g.score, 0);
});

test("sector clears only when the quota is destroyed; spawner keeps pressure", () => {
  const g = playing();
  const q = sectorParams(1).quota;
  g.spawnT = 0;
  runFor(g, 3);
  assert.ok(g.hunters.length > 0, "spawner runs while the player stalls");
  assert.ok(g.hunters.length <= sectorParams(1).liveCap);
  // Destroy the rest of the quota by hand through the scoring path.
  g.hunters = [];
  g.spawned = q;
  g.killed = q - 1;
  const { lx, ly, dx, dy } = aim(g);
  hunter(g, lx + dx * 60, ly + dy * 60);
  g.spawned = q;
  const s0 = g.score;
  step(g, DT, true);
  const ev = runFor(g, 0.3);
  assert.equal(g.phase, "clear");
  const clear = ev.find((e) => e.type === "clear");
  assert.equal(g.score - s0, 100 + clear.bonus);
  assert.equal(clear.bonus, timeBonus(g));
  runFor(g, CFG.clearTime + 0.05);
  assert.equal(g.sector, 2);
  assert.equal(g.phase, "ready");
});

test("extra ships at 10,000, then every 20,000 (30k, 50k …)", () => {
  const g = playing();
  const lives = g.lives;
  const kill = () => {
    const { lx, ly, dx, dy } = aim(g);
    hunter(g, lx + dx * 60, ly + dy * 60);
    step(g, DT, true);
    return runFor(g, 0.2).filter((e) => e.type === "extend").length;
  };
  g.score = 9950;
  assert.equal(kill(), 1, "10,000");
  assert.equal(g.lives, lives + 1);
  g.score = 29850;
  g.px = CFG.cx;
  g.py = CFG.cy;
  assert.equal(kill(), 0, "no extend at 20,000-29,999");
  g.score = 29950;
  g.px = CFG.cx;
  g.py = CFG.cy;
  assert.equal(kill(), 1, "30,000");
  assert.equal(g.nextExtend, 50000);
  assert.equal(g.lives, lives + 2);
});

test("game over after the last ship; further presses do nothing", () => {
  const g = playing();
  g.lives = 1;
  hunter(g, g.px + 3, g.py);
  runFor(g, CFG.dyingTime + 0.2);
  assert.equal(g.phase, "over");
  const x = g.px;
  runFor(g, 1, () => true);
  assert.equal(g.px, x);
});

test("restart: a fresh game starts clean", () => {
  const g = createGame(9);
  assert.equal(g.score, 0);
  assert.equal(g.lives, CFG.lives);
  assert.equal(g.sector, 1);
  assert.equal(g.phase, "ready");
});

test("game speed starts at 1.2 (sweep 1.5 s), rises 7% of base per sector, caps at x1.3", () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(speedFor(1), 1.2));
  assert.ok(near(CFG.sweepPeriod / speedFor(1), 1.5));
  assert.ok(near(speedFor(2), 1.2 * 1.07));
  assert.ok(near(speedFor(5), 1.2 * 1.28));
  assert.ok(near(speedFor(6), 1.2 * 1.3));
  assert.ok(near(speedFor(20), 1.2 * 1.3));
  // No step change: hunter speed rises smoothly.
  for (let s = 1; s < 12; s++) assert.ok(sectorParams(s + 1).speed - sectorParams(s).speed <= 36 * 1.2 * 0.07 + 1e-9);
});

test("every rate scales together: hunter closing per sweep turn is the same in every sector", () => {
  const perTurn = (sector) => {
    const g = createGame(1, { sector });
    const p = sectorParams(sector, g.k);
    return {
      close: p.speed * (TAU / sweepOmega(g)),
      turn: p.turn * (TAU / sweepOmega(g)),
      spawnsPerTurn: TAU / sweepOmega(g) / p.spawnInterval,
      shotPerTurn: CFG.shotSpeed * g.k * (TAU / sweepOmega(g)),
      blipTurns: blipLife(g) / (TAU / sweepOmega(g)),
    };
  };
  const a = perTurn(1);
  for (const sector of [2, 4, 8, 12]) {
    const b = perTurn(sector);
    for (const key of Object.keys(a)) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${key} at sector ${sector}`);
  }
});

test("clearing a sector speeds the sweep up; a ?speed override stays fixed", () => {
  const measure = (g) => {
    const t0 = g.theta;
    step(g, DT);
    return (((g.theta - t0) % TAU) + TAU) % TAU;
  };
  const g = playing();
  const w1 = measure(g);
  g.killed = sectorParams(1).quota;
  runFor(g, 0.1);
  assert.equal(g.phase, "clear");
  runFor(g, CFG.clearTime + 0.05);
  assert.equal(g.sector, 2);
  assert.ok(Math.abs(measure(g) / w1 - 1.07) < 1e-6);

  const f = createGame(1, { speed: 1.3 });
  assert.equal(f.k, 1.3);
  while (f.phase !== "play") step(f, DT);
  f.killed = sectorParams(1).quota;
  f.hunters = [];
  runFor(f, CFG.clearTime + 0.3);
  assert.equal(f.sector, 2);
  assert.equal(f.k, 1.3);
});

test("blips fade in blipLife / k and shots fly at shotSpeed * k", () => {
  const g = createGame(1, { speed: 1.45 });
  while (g.phase !== "play") step(g, DT);
  g.spawnT = 1e9;
  g.hunters = [];
  g.blips = [{ x: 0, y: 0, age: 0, id: 1, dist: 0 }];
  runFor(g, CFG.blipLife / 1.45 - 0.05);
  assert.equal(g.blips.length, 1);
  runFor(g, 0.1);
  assert.equal(g.blips.length, 0);
  g.theta = 0;
  step(g, DT, true);
  const t0 = g.shots[0].travel;
  step(g, DT);
  assert.ok(Math.abs(g.shots[0].travel - t0 - CFG.shotSpeed * 1.45 * DT) < 1e-9);
});

test("the shot paints hunters in its reveal band without killing them, once per shot", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const along = 120;
  const w = CFG.shotW0 + CFG.shotSpread * along;
  const at = (side) => hunter(g, lx + dx * along - dy * side, ly + dy * along + dx * side);
  const flank = at(w + CFG.revealExtra - 3); // outside hit band, inside reveal band
  const far = at(-(w + CFG.revealExtra + 4)); // beyond the reveal band
  step(g, DT, true);
  const ev = runFor(g, CFG.shotRange / (CFG.shotSpeed * g.k) + 0.05);
  const shotPaints = ev.filter((e) => e.type === "paint" && e.src === "shot");
  assert.deepEqual(shotPaints.map((e) => e.id), [flank.id]);
  assert.ok(!flank.dead && !far.dead);
  assert.ok(g.blips.some((b) => b.id === flank.id && b.src === "shot"));
  assert.equal(g.score, 0);
});

test("a shot that hits stops revealing: hunters beyond the hit point stay unpainted", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const target = hunter(g, lx + dx * 80, ly + dy * 80);
  const w = CFG.shotW0 + CFG.shotSpread * 200;
  const behind = hunter(g, lx + dx * 200 - dy * (w + 10), ly + dy * 200 + dx * (w + 10));
  step(g, DT, true);
  const ev = runFor(g, 0.4);
  assert.ok(target.dead);
  assert.ok(!ev.some((e) => e.type === "paint" && e.src === "shot" && e.id === behind.id));
  assert.ok(!ev.some((e) => e.type === "paint" && e.src === "shot" && e.id === target.id));
});

test("death events name the killer (landing crash and touch); edge deaths have none", () => {
  const a = playing();
  const { lx, ly } = aim(a);
  const h = hunter(a, lx + 3, ly);
  const ev = step(a, DT, true).map((e) => ({ ...e }));
  const d = ev.find((e) => e.type === "death");
  assert.equal(d.killer.id, h.id);
  assert.equal(d.killer.x, h.x);

  const b = playing();
  const t = hunter(b, b.px + 5, b.py);
  const d2 = step(b, DT).find((e) => e.type === "death");
  assert.equal(d2.cause, "contact");
  assert.equal(d2.killer.id, t.id);

  const c = playing();
  c.px = CFG.cx + CFG.scopeR - 20;
  c.theta = 0;
  const d3 = step(c, DT, true).find((e) => e.type === "death");
  assert.equal(d3.cause, "edge");
  assert.equal(d3.killer, null);
});

test("time bonus: 250 x quota at the start, drains to 0 at par, only while playing", () => {
  const g = playing();
  const q = sectorParams(1).quota;
  g.sectorT = 0;
  assert.equal(timeBonus(g), 250 * q);
  const par = (CFG.parPerHunter * q) / g.k;
  g.sectorT = par / 2;
  assert.equal(timeBonus(g), 125 * q);
  g.sectorT = par + 5;
  assert.equal(timeBonus(g), 0);
  assert.equal(bonusFrac(g), 0);
  // READY and dying don't drain it.
  const r = createGame(3);
  runFor(r, CFG.readyTime - 0.1);
  assert.equal(r.sectorT, 0);
  const d = playing();
  hunter(d, d.px + 3, d.py);
  step(d, DT);
  const t0 = d.sectorT;
  runFor(d, 1);
  assert.equal(d.phase, "dying");
  assert.equal(d.sectorT, t0);
});

test("chain links beyond the first give back 2 s of par; a single kill gives none", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  g.sectorT = 10;
  hunter(g, lx + dx * 100, ly + dy * 100);
  step(g, DT, true);
  runFor(g, 0.3);
  assert.ok(g.sectorT > 10, "single kill: no refund, time kept running");
  const h = aim(g);
  g.sectorT = 10;
  const bx = h.lx + h.dx * 100;
  const by = h.ly + h.dy * 100;
  hunter(g, bx, by);
  hunter(g, bx - h.dy * 30, by + h.dx * 30);
  hunter(g, bx + h.dy * 30, by - h.dx * 30);
  step(g, DT, true);
  const ev = runFor(g, 0.4);
  assert.equal(ev.filter((e) => e.type === "kill").length, 3);
  // Two extra links refund 2 x 2 s (scaled by game speed); ~0.4 s of play passed.
  assert.ok(Math.abs(g.sectorT - (10 - (2 * CFG.chainRefund) / g.k + 0.4 + DT)) < 0.05, `sectorT ${g.sectorT}`);
});

test("chain link points cap at link 7 (4900)", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const bx = lx + dx * 100;
  const by = ly + dy * 100;
  for (let i = 0; i < 9; i++) hunter(g, bx - dy * i * 30, by + dx * i * 30);
  step(g, DT, true);
  const ev = runFor(g, 1.2);
  const pts = ev.filter((e) => e.type === "kill").map((e) => e.pts);
  assert.deepEqual(pts, [100, 400, 900, 1600, 2500, 3600, 4900, 4900, 4900]);
});

test("one hitbox: landing and ordinary contact both use contactR", () => {
  const a = playing();
  const { lx, ly } = aim(a);
  hunter(a, lx, ly + CFG.contactR + 1.5); // just outside: not a crash on landing
  step(a, DT, true);
  assert.equal(a.phase, "play");
  const b = playing();
  const t = aim(b);
  hunter(b, t.lx, t.ly + CFG.contactR - 0.5); // just inside: crash
  step(b, DT, true);
  assert.equal(b.phase, "dying");
  assert.equal(CFG.landR, undefined, "no separate landing radius");
});

test("clearing sector 10 completes the game; sector 9 still advances", () => {
  const finish = (sector) => {
    const g = createGame(1, { sector });
    while (g.phase !== "play") step(g, DT);
    g.spawnT = 1e9;
    g.hunters = [];
    g.killed = sectorParams(sector, g.k).quota;
    const ev = runFor(g, 0.1 + CFG.clearTime + 0.1);
    return { g, ev };
  };
  const a = finish(9);
  assert.equal(a.g.sector, 10);
  assert.equal(a.g.phase, "ready");
  const b = finish(10);
  assert.equal(b.g.phase, "complete");
  assert.equal(b.g.sector, 10);
  assert.equal(b.ev.filter((e) => e.type === "complete").length, 1);
  assert.ok(b.ev.some((e) => e.type === "clear"), "the final sector still pays its time bonus");
  const x = b.g.px;
  runFor(b.g, 1, () => true);
  assert.equal(b.g.px, x, "no play after completion");
  assert.equal(b.g.phase, "complete");
});

test("time bar shortens per hunter in later sectors (par x (1 - parDecay x (sector - 1)))", () => {
  const at = (sector) => {
    const g = createGame(1, { sector });
    const q = sectorParams(sector, g.k).quota;
    g.sectorT = 0;
    const full = timeBonus(g);
    // Seconds of play that drain the bar completely.
    const expected = (CFG.parPerHunter * (1 - CFG.parDecay * (sector - 1)) * q) / g.k;
    g.sectorT = expected - 1e-6;
    assert.ok(bonusFrac(g) > 0);
    g.sectorT = expected + 1e-6;
    assert.equal(bonusFrac(g), 0);
    return { full, expected };
  };
  const s1 = at(1);
  const s10 = at(10);
  assert.equal(s1.full, 250 * CFG.quotaBase);
  assert.ok(Math.abs(s10.expected / (CFG.parPerHunter * (CFG.quotaBase + 9 * CFG.quotaStep) / createGame(1, { sector: 10 }).k) - (1 - 9 * CFG.parDecay)) < 1e-9);
});

test("a destroyed hunter's blips go out within trackOut; other contacts stay", () => {
  const g = playing();
  const { lx, ly, dx, dy } = aim(g);
  const target = hunter(g, lx + dx * 80, ly + dy * 80);
  const other = hunter(g, g.px - 150, g.py);
  g.blips = [
    { x: target.x + 30, y: target.y, age: 0.5, id: target.id, dist: 0 }, // stale paint, off its true spot
    { x: target.x + 15, y: target.y, age: 0.1, id: target.id, dist: 0 },
    { x: other.x, y: other.y, age: 0.5, id: other.id, dist: 0 },
  ];
  step(g, DT, true);
  runFor(g, 0.12);
  assert.ok(target.dead);
  assert.ok(g.blips.filter((b) => b.id === target.id).every((b) => b.out !== undefined), "its track is going out");
  runFor(g, CFG.trackOut + 0.02);
  assert.equal(g.blips.filter((b) => b.id === target.id).length, 0);
  assert.ok(g.blips.some((b) => b.id === other.id), "unrelated contact untouched");
});

console.log(`\n${passed} passed`);
