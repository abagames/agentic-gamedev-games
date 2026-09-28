// Core rule tests: node tests/core.test.cjs
const assert = require("node:assert/strict");
const U = require("../core.js");
const B = require("../bots.js");
const { CFG, DT, PORT, dx } = U;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  ", name);
}
function play(g, n, input) {
  for (let i = 0; i < n; i++) U.step(g, input || { x: 0, y: 0, fire: false });
}
function started(seed) {
  const g = U.newGame(seed || 1);
  play(g, Math.ceil(CFG.readyT / DT) + 1);
  assert.equal(g.mode, "play");
  return g;
}
function clearSea(g) {
  g.captives = [];
  g.enemies = [];
  g.mines = [];
  g.etorps = [];
  g.launchT = 999;
  g.raidQueue = [];
  g.burst = 0;
}
function ship(g, x, load) {
  const e = { id: g.nextId++, kind: "ship", route: 1, x, y: CFG.surf, dir: 1, load, alive: true, state: "home", target: null, arm: 0, held: null, cd: 99, aim: 0, t: 0 };
  g.enemies.push(e);
  return e;
}
function keepWaveOpen(g) {
  // a survivor far away who never sinks keeps the wave from clearing during a test
  g.captives.push({ id: g.nextId++, x: U.wrap(PORT + 200), y: CFG.surf + 3, sink: 0, drift: 0, ph: 0, jacket: true, spill: null });
}
// fire once and run, holding every enemy still (their own motion is not under test)
function fireHeld(g, ticks) {
  const pins = g.enemies.map((e) => [e, e.x, e.y]);
  U.step(g, { x: 0, y: 0, fire: true });
  for (let i = 0; i < ticks; i++) {
    for (const [e, x, y] of pins) {
      e.x = x;
      e.y = y;
    }
    U.step(g, { x: 0, y: 0, fire: false });
  }
}
// the run a torpedo needs to climb from depth y to a surface hull
const runFrom = (y) => (y - (CFG.surf + CFG.hullDepth - 3)) / CFG.torpRise;

test("same seed and inputs give the same game", () => {
  const a = B.playGame(7, B.humanBot({ seed: 7 }), { maxT: 120 });
  const b = B.playGame(7, B.humanBot({ seed: 7 }), { maxT: 120 });
  assert.equal(a.score, b.score);
  assert.equal(a.g.lives, b.g.lives);
  assert.equal(a.stats.lost, b.stats.lost);
  assert.equal(a.g.player.x, b.g.player.x);
});

test("a wave starts with every survivor in the water, spread from off our harbour to off their port, and the raiders sortie from their port", () => {
  const g = U.newGame(3);
  const spec = U.waveSpec(1);
  assert.equal(g.captives.length, spec.survivors);
  let near = 0, far = 0;
  for (const c of g.captives) {
    assert.ok(c.jacket && !c.spill);
    assert.ok(c.y >= CFG.surf + 3 && c.y <= CFG.surf + 56);
    const dPort = Math.abs(dx(c.x, PORT));
    assert.ok(dPort >= CFG.spreadFromPort - 9, "off their port " + dPort);
    assert.ok(Math.abs(dx(c.x, U.HOME)) >= CFG.spreadFromHome - 9, "off our harbour");
    if (dPort < 200) near++;
    else far++;
  }
  assert.ok(near > 0 && far > 0, "spread across the sea");
  assert.equal(g.enemies.length, 0);
  play(g, Math.ceil((CFG.readyT + 3) / DT));
  assert.ok(g.enemies.length >= 2, "the port empties at once");
  for (const e of g.enemies) assert.ok(Math.abs(dx(e.x, PORT)) < 160 || e.kind === "dd");
});

test("a raider with people aboard is much slower, and slower still with more", () => {
  assert.equal(U.loadedFactor(0), 1);
  assert.ok(U.loadedFactor(1) <= 0.5);
  assert.ok(U.loadedFactor(3) < U.loadedFactor(1));
  assert.ok(U.loadedFactor(10) >= CFG.loadedMin);
});

test("the campaign brings in one element per early wave", () => {
  const s = (n) => U.waveSpec(n);
  assert.equal(s(1).esubMax, 0);
  assert.equal(s(1).escortP, 0);
  assert.ok(s(2).esubMax > 0, "wave 2 adds grab-subs");
  assert.equal(s(2).escortP, 0);
  assert.ok(s(3).escortP > 0, "wave 3 adds escorts");
  assert.ok(s(3).gunReach < 40 && s(4).gunReach === 40, "wave 4 widens the deck guns' reach");
  assert.equal(U.FINAL_WAVE, 8);
});

test("each new wave starts with the sub and an empty ferry at our harbour", () => {
  const g = started();
  clearSea(g);
  g.player.x = U.wrap(PORT - 50);
  g.player.y = 150;
  g.ferry.x = U.wrap(U.HOME + CFG.ferryStation);
  g.ferry.alive = false; // sunk and waiting
  for (let i = 0; i < 60 * 6 && g.wave === 1; i++) U.step(g, {});
  assert.equal(g.wave, 2);
  assert.equal(g.player.x, U.wrap(U.HOME));
  assert.ok(g.player.y > CFG.surf + U.waveSpec(2).gunReach, "below the deck guns");
  assert.ok(g.ferry.alive && g.ferry.load === 0 && g.ferry.x === U.wrap(U.HOME));
});

test("clearing the final wave wins the campaign, with a bonus for the subs in hand", () => {
  const g = U.newGame(4, { wave: U.FINAL_WAVE });
  play(g, Math.ceil(CFG.readyT / DT) + 1);
  clearSea(g);
  g.perfectWaves = 0;
  const s0 = g.score;
  let ev = null;
  for (let i = 0; i < 60 * 6 && g.mode !== "over"; i++) {
    U.step(g, {});
    for (const e of g.events) if (e.type === "allclear") ev = e;
  }
  assert.equal(g.mode, "over");
  assert.equal(g.overWhy, "allclear");
  assert.equal(g.player.inv, 0, "no invulnerability blinking on the ALL CLEAR screen");
  assert.equal(g.player.x, U.wrap(U.HOME), "home at the jetty");
  assert.ok(ev && ev.bonus === g.lives * CFG.pts.subLeft);
  assert.ok(g.score >= s0 + ev.bonus);
});

test("the sub catches a sinking survivor by touch at any depth; jacket survivors carry no spill bonus", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 200); // away from the harbour, where cargo would be unloaded
  p.y = 140;
  g.captives.push({ id: 901, x: p.x, y: 140, sink: 3, drift: 0, ph: 0, jacket: true, spill: null });
  const s0 = g.score;
  play(g, 2);
  assert.equal(p.cargo, 1);
  assert.equal(g.score, s0);
});

test("the torpedo climbs as it runs: depth sets its range to the hulls", () => {
  for (const y of [100, 140]) {
    const g = started();
    clearSea(g);
    keepWaveOpen(g);
    const p = g.player;
    p.x = U.wrap(U.HOME + 150);
    p.y = y;
    p.face = 1;
    const run = runFrom(y);
    const hit = ship(g, U.wrap(p.x + 8 + run), 0);
    fireHeld(g, 90);
    assert.equal(hit.alive, false, "hull at the matching range from y=" + y);
  }
  // too close for the depth: the torpedo passes under the hull
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 150);
  p.y = 140;
  p.face = 1;
  const near = ship(g, U.wrap(p.x + 40), 0);
  fireHeld(g, 90);
  assert.equal(near.alive, true);
  // from right under the surface the torpedo breaks surface almost at once
  const g2 = started();
  clearSea(g2);
  keepWaveOpen(g2);
  g2.player.x = U.wrap(U.HOME + 150);
  g2.player.y = CFG.subMinY;
  g2.player.face = 1;
  const far = ship(g2, U.wrap(g2.player.x + 80), 0);
  fireHeld(g2, 90);
  assert.equal(far.alive, true);
});

test("a torpedo sinks a grab-sub where its climbing run crosses the sub's depth", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 150);
  p.y = 150;
  p.face = 1;
  // the run crosses depth 130 after 40 px
  const e = { id: 77, kind: "esub", x: U.wrap(p.x + 8 + 40), y: 130, dir: -1, load: 2, alive: true, state: "home", target: null, arm: 0, cd: 99, aim: 0, t: 0 };
  g.enemies.push(e);
  fireHeld(g, 40);
  assert.equal(e.alive, false);
  assert.equal(g.captives.filter((c) => c.spill === "e77").length, 2);
});

test("sinking a raider spills everyone aboard; an empty raider is worth nothing", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 150);
  p.y = 120;
  p.face = 1;
  ship(g, U.wrap(p.x + 8 + runFrom(120)), 4);
  const s0 = g.score;
  fireHeld(g, 60);
  const spilled = g.captives.filter((c) => c.spill);
  assert.equal(spilled.length, 4);
  assert.equal(g.score - s0, 4 * CFG.pts.perLoad);
  for (const c of spilled) assert.ok(c.sink >= U.waveSpec(1).sinkSpeed * 0.8);
  const g2 = started();
  clearSea(g2);
  keepWaveOpen(g2);
  g2.player.x = U.wrap(U.HOME + 150);
  g2.player.y = 120;
  g2.player.face = 1;
  ship(g2, U.wrap(g2.player.x + 8 + runFrom(120)), 0);
  const s1 = g2.score;
  fireHeld(g2, 60);
  assert.equal(g2.enemies.length, 0);
  assert.equal(g2.score, s1);
});

test("catching a whole spill pays n² × 100 once; a lost one pays nothing", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.y = 100;
  g.spills.s = { total: 3, caught: 0, lost: 0 };
  for (let i = 0; i < 3; i++) g.captives.push({ id: 500 + i, x: p.x, y: 100, sink: 0, drift: 0, ph: 0, spill: "s" });
  const s0 = g.score;
  play(g, 2);
  assert.equal(p.cargo, 3);
  assert.equal(g.score - s0, 900);
  play(g, 10);
  assert.equal(g.score - s0, 900);

  const g2 = started();
  clearSea(g2);
  keepWaveOpen(g2);
  g2.player.y = 100;
  g2.spills.s = { total: 2, caught: 0, lost: 0 };
  g2.captives.push({ id: 600, x: g2.player.x, y: 100, sink: 0, drift: 0, ph: 0, spill: "s" });
  g2.captives.push({ id: 601, x: U.wrap(g2.player.x + 100), y: CFG.seabed - 0.1, sink: 10, drift: 0, ph: 0, spill: "s" });
  const s1 = g2.score;
  const t1 = g2.lostRun;
  play(g2, 5);
  assert.equal(g2.score, s1);
  assert.equal(g2.lostRun, t1 + 1, "a drowned survivor counts as lost");
});

test("deck guns: fire only at a sub within 40 px of the surface; the aim follows during the flash, locks on firing, and the burst reaches into the water", () => {
  function setup(y) {
    const g = started();
    clearSea(g);
    keepWaveOpen(g);
    const p = g.player;
    p.x = U.wrap(U.HOME + 200);
    p.y = y;
    p.inv = 0;
    const e = ship(g, U.wrap(p.x + 60), 0);
    e.scd = 0;
    return { g, p, e };
  }
  // deeper than the gun's reach: left alone
  {
    const { g, p, e } = setup(CFG.exposed + 12);
    for (let i = 0; i < 60 * 3; i++) {
      e.x = U.wrap(p.x + 60);
      U.step(g, { x: 0, y: 0, fire: false });
      p.y = CFG.exposed + 12;
    }
    assert.equal(g.stats.shells, 0, "deep sub is left alone");
  }
  // within reach, holding still near the surface: flash, track, lock, burst, sunk
  {
    const { g, p, e } = setup(CFG.surf + 10);
    let tell = -1, fire = -1, locked = null;
    for (let i = 0; i < 60 * 4 && p.alive; i++) {
      e.x = U.wrap(p.x + 60);
      U.step(g, { x: 0, y: 0, fire: false });
      p.y = CFG.surf + 10;
      for (const ev of g.events) {
        if (ev.type === "shellTell" && tell < 0) tell = i;
        if (ev.type === "shellFire" && fire < 0) {
          fire = i;
          locked = ev.tx;
        }
      }
    }
    assert.ok(tell >= 0 && fire - tell >= Math.round(CFG.shellTell / DT) - 1, "gun flashes first");
    assert.ok(Math.abs(dx(locked, p.x)) < 3, "aimed at the sub");
    assert.equal(p.alive, false);
    assert.equal(g.stats.deaths.shell, 1);
  }
  // inside the gun's reach but deeper than the burst when it lands: survives
  {
    const { g, p, e } = setup(CFG.surf + 10);
    let fired = false;
    for (let i = 0; i < 60 * 4; i++) {
      e.x = U.wrap(p.x + 60);
      U.step(g, { x: 0, y: 0, fire: false });
      if (g.events.some((ev) => ev.type === "shellFire")) fired = true;
      p.y = fired ? CFG.surf + CFG.shellBlastR + 6 : CFG.surf + 10;
    }
    assert.ok(fired);
    assert.equal(p.alive, true, "below the burst");
  }
  // the aim follows the sub while the gun flashes, then stays where it was when fired
  {
    const { g, p, e } = setup(CFG.surf + 10);
    let aim0 = null, aim1 = null, locked = null;
    for (let i = 0; i < 60 * 3 && locked == null; i++) {
      e.x = U.wrap(p.x + 60);
      U.step(g, { x: 1, y: 0, fire: false });
      p.y = CFG.surf + 10;
      if (e.shellT > 0 && aim0 == null) aim0 = e.aimX;
      if (e.shellT > 0) aim1 = e.aimX;
      for (const ev of g.events) if (ev.type === "shellFire") locked = ev.tx;
    }
    assert.ok(dx(aim0, aim1) > 10, `tracked the moving sub ${aim0} -> ${aim1} locked ${locked}`);
    const sh = g.shells[0];
    assert.equal(sh.x1, locked);
  }
});

test("grab-ships carry survivors to the port, and every one of them counts as lost", () => {
  const r = B.playGame(11, B.idleBot(), { maxT: 200 });
  assert.ok(r.stats.taken > 5);
  assert.ok(r.stats.lost >= r.stats.taken);
  assert.equal(r.stats.deliveredTotal, 0);
});

test("idle and mashing both lose; the planner lasts and scores", () => {
  const idle = B.playGame(5, B.idleBot(), { maxT: 600 });
  const mash = B.playGame(5, B.mashBot(), { maxT: 600 });
  const plan = B.playGame(5, B.plannerBot({ seed: 5 }), { maxT: 600 });
  assert.ok(idle.over, "idle loses");
  assert.ok(mash.over, "mashing loses");
  // idle "clears" waves fast by losing everyone; compare how long the town holds and the score
  assert.ok(plan.t > idle.t * 1.3, `plan ${plan.t.toFixed(0)}s vs idle ${idle.t.toFixed(0)}s`);
  assert.ok(plan.score > Math.max(1000, mash.score) && plan.t > mash.t, `plan ${plan.score} in ${plan.t.toFixed(0)}s vs mash ${mash.score} in ${mash.t.toFixed(0)}s`);
});

test("a mine is announced before it drops, and never on a sub hugging the surface", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  const e = ship(g, p.x, 0);
  e.cd = 0;
  e.state = "hunt";
  e.state = "home";
  e.speed = 0;
  p.y = CFG.surf + CFG.mineMinDepth - 4;
  // hold the ship still over the sub
  for (let i = 0; i < 60; i++) {
    e.x = p.x;
    U.step(g, { x: 0, y: 0, fire: false });
  }
  assert.equal(g.mines.length, 0, "no mine on a shallow sub");
  p.y = 120;
  let tell = -1;
  let drop = -1;
  for (let i = 0; i < 120 && drop < 0; i++) {
    e.x = p.x;
    U.step(g, { x: 0, y: -0.001, fire: false });
    p.y = 120;
    for (const ev of g.events) {
      if (ev.type === "mineTell" && tell < 0) tell = i;
      if (ev.type === "mineDrop") drop = i;
    }
  }
  assert.ok(tell >= 0 && drop > tell);
  assert.ok((drop - tell) * DT >= CFG.mineTell - DT);
});

test("survivors aboard are unloaded only at our harbour, at the surface", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.cargo = 3;
  p.x = U.wrap(U.HOME + 120);
  p.y = CFG.subMinY;
  play(g, 60);
  assert.equal(p.cargo, 3, "no unloading away from the harbour");
  p.x = U.HOME;
  p.y = CFG.subMinY;
  play(g, 60);
  assert.equal(p.cargo, 0);
  assert.equal(g.stats.deliveredTotal, 3);
});

test("the wave clears only when everyone has reached a port: not while anyone is aboard our sub or ferry", () => {
  const g = started();
  clearSea(g);
  const p = g.player;
  p.cargo = 2;
  p.x = U.wrap(U.HOME + 200);
  p.y = 110;
  play(g, 60 * 3);
  assert.equal(g.mode, "play", "survivors aboard the sub: not over yet");
  // hand them to the ferry on station
  const f = g.ferry;
  play(g, 60 * 8);
  p.x = f.x;
  p.y = CFG.subMinY;
  play(g, 30);
  assert.equal(p.cargo, 0);
  assert.equal(f.load, 2);
  p.y = 110;
  p.x = U.wrap(U.HOME + 300);
  play(g, 60);
  assert.equal(g.mode, "play", "survivors aboard the ferry: not over yet");
  const d0 = g.stats.deliveredTotal;
  let cleared = false;
  for (let i = 0; i < 60 * 12 && !cleared; i++) {
    U.step(g, { x: 0, y: 0, fire: false });
    if (g.events.some((e) => e.type === "clear")) cleared = true;
  }
  assert.ok(cleared);
  assert.equal(g.stats.deliveredTotal, d0 + 2, "saved by docking, not by the clear");
});

test("a destroyed sub throws its survivors out where it died; the next sub starts at our harbour", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 250);
  p.y = 110;
  p.cargo = 4;
  p.inv = 0;
  g.blasts.push({ x: p.x, y: p.y, t: 0, cause: "mine" });
  play(g, 1);
  const out = g.captives.filter((c) => c.spill);
  assert.equal(out.length, 4);
  for (const c of out) assert.ok(Math.abs(dx(c.x, U.HOME + 250)) < 12 && Math.abs(c.y - 110) < 4);
  play(g, Math.ceil(CFG.respawnT / DT) + 2);
  assert.ok(g.player.alive);
  assert.equal(g.player.x, U.wrap(U.HOME));
  assert.equal(g.player.cargo, 0);
});

test("a grab-ship sails out empty just past the farthest survivor on its side, then trawls back", () => {
  const g = started();
  clearSea(g);
  const near = U.wrap(PORT + 100);
  const far = U.wrap(PORT + 220);
  g.captives.push({ id: 4241, x: near, y: CFG.surf + 3, sink: 0, drift: 0, ph: 0, jacket: true, spill: null });
  g.captives.push({ id: 4242, x: far, y: CFG.surf + 3, sink: 0, drift: 0, ph: 0, jacket: true, spill: null });
  g.launchT = 0;
  play(g, 2);
  const e = g.enemies[0];
  assert.equal(e.kind, "ship");
  assert.equal(e.state, "out");
  assert.equal(e.route, 1);
  let turnedAt = null;
  let firstGrab = null;
  for (let i = 0; i < 60 * 40 && e.load < 2; i++) {
    U.step(g, { x: 0, y: 0, fire: false });
    if (e.state === "out") assert.equal(e.load, 0, "no grabbing on the way out");
    else if (turnedAt === null) turnedAt = dx(PORT, e.x);
    for (const ev of g.events) if (ev.type === "grab" && firstGrab === null) firstGrab = dx(PORT, ev.x);
  }
  assert.ok(turnedAt > 220 && turnedAt < 220 + 12, "turned just past the far survivor: " + turnedAt);
  assert.ok(Math.abs(firstGrab - 220) < 6, "far survivor first: " + firstGrab);
  assert.equal(e.load, 2);
});

test("a loaded raider must reach its port before its hold is lost", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const e = ship(g, U.wrap(PORT - 200), 3); // the test survivor sits on the other side
  const lost0 = g.stats.lost || 0;
  play(g, 60);
  assert.equal(g.stats.lost || 0, lost0, "still carrying, not yet lost");
  play(g, 60 * 20);
  assert.equal(e.alive, false);
  assert.equal(g.stats.taken, 3);
  assert.equal(g.stats.lost, lost0 + 3);
});

test("the ferry takes survivors from a surfaced sub and saves them only when it reaches our harbour", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  const f = g.ferry;
  p.x = U.wrap(U.HOME + 150);
  p.y = 110; // deep: the ferry sails out to its station on the sub's side
  play(g, 60 * 8);
  assert.ok(Math.abs(dx(f.x, U.HOME + CFG.ferryStation)) < 2, "ferry on station " + f.x);
  p.cargo = 4;
  p.x = f.x;
  p.y = CFG.subMinY;
  const d0 = g.stats.deliveredTotal;
  play(g, 60);
  assert.equal(p.cargo, 0);
  assert.equal(f.load, 4);
  assert.equal(g.stats.deliveredTotal, d0, "not saved while at sea");
  p.y = 110;
  play(g, 60 * 2);
  assert.equal(f.state, "return");
  play(g, 60 * 10);
  assert.equal(f.load, 0);
  assert.equal(g.stats.deliveredTotal, d0 + 4);
});

test("raiders shell only a loaded ferry; two hits sink it and its load spills", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const f = g.ferry;
  // parked on station (x = station, so it does not move)
  f.side = 1;
  f.x = U.wrap(U.HOME + CFG.ferryStation);
  f.state = "out";
  f.load = 0;
  const e = ship(g, U.wrap(f.x + 60), 0);
  e.scd = 0;
  e.state = "out";
  e.turnX = e.x;
  e.route = 1;
  g.player.x = f.x; // keeps the station on this side
  g.player.y = 120;
  play(g, 60 * 3);
  assert.equal(g.stats.shells, 0, "empty ferry is left alone");
  f.load = 5;
  let tell = -1;
  let fire = -1;
  for (let i = 0; i < 60 * 30 && f.alive; i++) {
    f.lastHand = g.t; // keep it waiting on station
    e.x = U.wrap(f.x + 60);
    U.step(g, { x: 0, y: 0, fire: false });
    for (const ev of g.events) {
      if (ev.type === "shellTell" && tell < 0) tell = i;
      if (ev.type === "shellFire" && fire < 0) fire = i;
    }
  }
  assert.ok(fire - tell >= Math.round(CFG.shellTell / DT) - 1, `gun flashes before the shot (tell ${tell} fire ${fire} mode ${g.mode} enemies ${g.enemies.length} alive ${f.alive} load ${f.load})`);
  assert.equal(f.alive, false);
  assert.equal(g.stats.ferryHits, CFG.ferryHP);
  const spilled = g.captives.filter((c) => c.spill && c.spill.startsWith("ferry"));
  assert.equal(spilled.length, 5);
  play(g, Math.ceil(CFG.ferryRespawn / DT) + 2);
  assert.ok(f.alive);
  assert.equal(f.hp, CFG.ferryHP);
});

test("a grab-sub leaves its port just under the surface, dives to work, and must rise to get back in", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  // a spill sinking deep out at sea, for the grab-sub to go after
  g.spills.d = { total: 1, caught: 0, lost: 0 };
  g.captives.push({ id: 5151, x: U.wrap(PORT + 140), y: 140, sink: 0, drift: 0, ph: 0, spill: "d" });
  g.enemies.push({ id: 61, kind: "ship", route: 1, x: U.wrap(PORT + 300), y: CFG.surf, dir: 1, load: 0, alive: true, state: "lift", liftT: -999, target: null, arm: 0, cd: 99, scd: 99, aim: 0, t: 0 });
  const U2 = U;
  // launch one grab-sub by hand through the normal path
  g.spec.esubMax = 1;
  g.launchT = 0;
  play(g, 2);
  const e = g.enemies.find((o) => o.kind === "esub");
  assert.ok(e, "a grab-sub sortied");
  assert.ok(Math.abs(e.y - CFG.esubPortY) < 3, "leaves near the surface: " + e.y);
  let deepest = e.y;
  let entered = false;
  let yAtEntry = null;
  for (let i = 0; i < 60 * 40 && !entered; i++) {
    U2.step(g, { x: 0, y: 0, fire: false });
    deepest = Math.max(deepest, e.y);
    if (!e.alive) {
      entered = true;
      yAtEntry = e.y;
    }
  }
  assert.ok(deepest > 120, "dived to work: " + deepest);
  assert.ok(entered, "went home with its catch");
  assert.ok(yAtEntry <= CFG.esubPortY + 4, "rose before entering: " + yAtEntry);
  assert.equal(g.stats.taken, 1);
});

test("an escort destroyer rides astern of its raider, runs at a sub that comes close, and depth-charges it at its depth after the rack flashes", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.inv = 0;
  const e = ship(g, U.wrap(U.HOME + 200), 3);
  e.raider = true;
  e.dir = 1;
  const d = { id: g.nextId++, kind: "dd", route: 1, x: U.wrap(e.x - CFG.ddGuard), y: CFG.surf, dir: 1, load: 0, alive: true, state: "escort", of: e.id, cd: 0, t: 0 };
  g.enemies.push(d);
  // far away: nothing
  p.y = 120;
  for (let i = 0; i < 60; i++) {
    p.x = U.wrap(d.x + CFG.ddChase + 30);
    U.step(g, { x: 0, y: 0, fire: false });
  }
  assert.equal(g.charges.length, 0);
  assert.ok(Math.abs(dx(d.x, e.x) - CFG.ddGuard) < 6, "on station astern of its raider");
  // within range and under water: tell, then a pair of charges set to our depth
  let tell = -1;
  let drop = -1;
  for (let i = 0; i < 120 && drop < 0; i++) {
    p.x = U.wrap(d.x + 20);
    p.y = 120;
    U.step(g, { x: 0, y: 0, fire: false });
    for (const ev of g.events) {
      if (ev.type === "chargeTell" && tell < 0) tell = i;
      if (ev.type === "chargeDrop") drop = i;
    }
  }
  assert.ok(tell >= 0 && drop - tell >= Math.round(CFG.ddTell / DT) - 1);
  assert.equal(g.charges.length, 3);
  for (const c of g.charges) assert.ok(Math.abs(c.fuse - 120) <= 4);
  // a torpedo sinks it like any hull
  const g2 = started();
  clearSea(g2);
  keepWaveOpen(g2);
  g2.player.x = U.wrap(U.HOME + 150);
  g2.player.y = 120;
  g2.player.face = 1;
  g2.enemies.push({ id: 999, kind: "dd", route: 1, x: U.wrap(g2.player.x + 8 + runFrom(120)), y: CFG.surf, dir: 1, load: 0, alive: true, state: "hunt", huntT: 99, cd: 99, t: 0 });
  fireHeld(g2, 60);
  assert.equal(g2.stats.ddSunk, 1);
});

test("losing enough survivors since the last miss or wave start costs the sub; a miss or the next wave resets the count", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 200);
  p.cargo = 2;
  const lives0 = g.lives;
  const drownOne = () => {
    g.captives.push({ id: g.nextId++, x: U.wrap(U.HOME + 400), y: CFG.seabed - 0.05, sink: 10, drift: 0, ph: 0, spill: null });
    play(g, 2);
  };
  for (let i = 0; i < CFG.lostPerMiss - 1; i++) drownOne();
  assert.equal(g.lostRun, CFG.lostPerMiss - 1);
  assert.ok(p.alive);
  const d0 = g.stats.deliveredTotal;
  drownOne();
  assert.equal(p.alive, false, "recalled");
  assert.equal(g.stats.deaths.lost, 1);
  assert.equal(g.lives, lives0 - 1);
  assert.equal(g.lostRun, 0, "a miss resets the count");
  assert.equal(g.stats.deliveredTotal, d0 + 2, "whoever was aboard went home with the recalled sub");
  // clearing the wave: the figures still standing pay a bonus, and the count resets only when
  // the next wave starts (the clear screen still shows what was lost)
  play(g, Math.ceil(CFG.respawnT / DT) + 2);
  drownOne();
  assert.equal(g.lostRun, 1);
  g.captives = [];
  const s0 = g.score;
  let clearEv = null;
  for (let i = 0; i < 3 && !clearEv; i++) {
    U.step(g, {});
    clearEv = g.events.find((e) => e.type === "clear");
  }
  assert.equal(g.mode, "clear");
  assert.equal(clearEv.standing, CFG.lostPerMiss - 1);
  assert.equal(clearEv.standBonus, (CFG.lostPerMiss - 1) * CFG.pts.standing * g.wave);
  assert.ok(g.score >= s0 + clearEv.standBonus);
  assert.equal(g.lostRun, 1, "still shown during the clear");
  play(g, Math.ceil(CFG.clearT / DT) + 2);
  assert.equal(g.lostRun, 0, "reset when the next wave starts");
});

test("one mistake costs one sub: losses while the sub is down, or of people thrown out of it, do not count toward the next miss", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 200);
  p.y = 120;
  p.cargo = 3;
  p.inv = 0;
  const lives0 = g.lives;
  // sunk: its three are thrown out, then a lot more drown while it is down
  g.blasts.push({ x: p.x, y: p.y, t: 0, cause: "mine" });
  play(g, 1);
  assert.equal(p.alive, false);
  for (let i = 0; i < 5; i++) g.captives.push({ id: 7000 + i, x: U.wrap(U.HOME + 400), y: CFG.seabed - 0.05, sink: 10, drift: 0, ph: 0, spill: null });
  play(g, 2);
  assert.equal(g.lostRun, 0, "nothing counted while down");
  play(g, Math.ceil(CFG.respawnT / DT) + 2);
  assert.ok(g.player.alive);
  // the ones thrown out of the sunk sub drown after the respawn: still not counted
  for (const c of g.captives) if (c.spill && c.spill.startsWith("sub")) c.y = CFG.seabed - 0.05;
  play(g, 3);
  assert.equal(g.lostRun, 0);
  assert.equal(g.lives, lives0 - 1, "one sub for one mistake");
});

test("people already aboard raiders when the sub is lost do not count against the next sub; people taken later do", () => {
  const g = started();
  clearSea(g);
  keepWaveOpen(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 150);
  p.y = 120;
  p.inv = 0;
  // a loaded raider close to its port
  const e = ship(g, U.wrap(PORT - CFG.escapeDX - 20), 2);
  e.dir = 1;
  e.route = -1;
  g.blasts.push({ x: p.x, y: p.y, t: 0, cause: "mine" });
  play(g, 1);
  assert.equal(p.alive, false);
  assert.equal(e.forfeit, 2);
  play(g, Math.ceil(CFG.respawnT / DT) + 2);
  assert.ok(g.player.alive);
  // it docks after we are back: taken, but not counted
  for (let i = 0; i < 60 * 6 && e.alive; i++) U.step(g, {});
  assert.equal(e.alive, false);
  assert.ok(g.stats.taken >= 2);
  assert.equal(g.lostRun, 0, "already theirs when we went down");
  // a raider that takes someone after the respawn does count
  const e2 = ship(g, U.wrap(PORT - CFG.escapeDX - 20), 1);
  e2.dir = 1;
  e2.route = -1;
  for (let i = 0; i < 60 * 6 && e2.alive; i++) U.step(g, {});
  assert.equal(g.lostRun, 1);
});

test("nothing dangerous survives a wave clear into the next wave (mines, charges, shells, torpedoes, blasts)", () => {
  const g = started();
  clearSea(g);
  const p = g.player;
  p.x = U.wrap(U.HOME + 200);
  p.y = 120;
  // the moment the wave clears, the sea is full of trouble, some of it right on our harbour
  g.mines.push({ x: U.HOME, y: 110, stopY: 110, t: 0, id: 9001 });
  g.charges.push({ x: U.HOME, y: 80, fuse: CFG.exposed + 6 });
  g.shells.push({ x0: 100, x1: U.HOME, t: 0, x: 100, y: CFG.surf - 4, at: "sub" });
  g.etorps.push({ x: U.HOME + 20, y: CFG.exposed + 6, vx: -CFG.etorpSpeed, t: 0 });
  g.blasts.push({ x: U.HOME, y: CFG.exposed + 6, t: 0.05, cause: "charge", r: 30 });
  U.step(g, {});
  assert.equal(g.mode, "clear");
  for (const k of ["mines", "charges", "shells", "etorps", "blasts"]) assert.equal(g[k].length, 0, k + " cleared at the clear");
  play(g, Math.ceil((CFG.clearT + CFG.readyT) / DT) + 30);
  assert.equal(g.mode, "play");
  assert.equal(g.wave, 2);
  assert.ok(g.player.alive, "the new wave does not open with an old explosion");
  assert.equal(g.stats.deaths.charge || 0, 0);
});

test("losing every sub ends the game", () => {
  const g = started();
  g.lives = 1;
  g.player.inv = 0;
  g.blasts.push({ x: g.player.x, y: g.player.y, t: 0, cause: "mine" });
  play(g, 2);
  assert.equal(g.player.alive, false);
  play(g, Math.ceil(CFG.respawnT / DT) + 2);
  assert.equal(g.mode, "over");
  assert.equal(g.overWhy, "lives");
});

console.log(`\n${passed} passed`);
