// Mechanic conformance tests for the simulation core: node tests/core.test.cjs
const assert = require("node:assert/strict");
const SKY = require("../core.js");
const B = require("../bots.js");
const { CFG } = SKY;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  ", name);
}

function playing(seed) {
  const g = SKY.createGame(seed || 1);
  while (g.phase !== "play") SKY.step(g, { dx: 0, dy: 0 });
  // Park the Defender far away and harmless unless a test wants it.
  g.def.x = -CFG.wrapPad + 1;
  g.def.y = CFG.topY;
  g.def.cool = 99;
  g.def.dir = -1;
  g.def.vx = 0;
  g.events.length = 0;
  return g;
}
function freezeDefender(g) {
  g.def.cool = 99;
  g.def.x = -CFG.wrapPad + 1;
  g.def.vx = 0;
  g.def.dir = -1;
  g.def.turnCool = 99;
}
function hangTo(g, x, y) {
  // Teleport the lander and let the chain settle under it.
  g.lander.x = x;
  g.lander.y = y;
  g.lander.vx = g.lander.vy = 0;
  let yy = y + CFG.landerHalfH;
  g.chain.forEach((n, i) => {
    yy += i === 0 ? CFG.hookLen : CFG.linkLen;
    n.x = n.px = x;
    n.y = n.py = yy;
  });
}
function grabN(g, n) {
  for (let k = 0; k < n; k++) {
    // a walker on open ground (not hugging a wall the hull cannot get down beside)
    const open = (h) => !g.ground || SKY.groundUnder(g, h.x - 10, h.x + 10) >= SKY.groundAt(g, h.x) - 1;
    const h = g.humans.find((h) => h.state === "walk" && open(h));
    const depth = CFG.landerHalfH + CFG.hookLen + CFG.linkLen * SKY.bodyCount(g);
    hangTo(g, h.x, h.y - depth);
    for (const o of g.humans) if (o !== h && o.state === "walk" && Math.abs(o.x - h.x) < 30) o.x = h.x + (h.x < 160 ? 60 : -60); // keep neighbours clear
    SKY.step(g, { dx: 0, dy: 0 });
  }
}

test("round starts in ready, then play", () => {
  const g = SKY.createGame(3);
  assert.equal(g.phase, "ready");
  for (let i = 0; i < CFG.readyTime * 60 + 2; i++) SKY.step(g, {});
  assert.equal(g.phase, "play");
  assert.equal(g.humans.length, CFG.humansBase);
});

test("tip touching a walker attaches it; the new body becomes the tip", () => {
  const g = playing(5);
  grabN(g, 1);
  assert.equal(SKY.bodyCount(g), 1);
  const held = g.humans.filter((h) => h.state === "held");
  assert.equal(held.length, 1);
  assert.equal(SKY.tip(g).hid, held[0].id);
  assert.ok(g.stats.maxChain >= 1);
});

test("only the chain's lowest point grabs: a body at the lander's own height is not taken", () => {
  const g = playing(5);
  grabN(g, 3);
  hangTo(g, 160, 100);
  const h = g.humans.find((o) => o.state === "walk");
  h.state = "fall";
  h.x = 160;
  h.y = 100; // overlapping the lander hull, far above the tip
  SKY.step(g, {});
  assert.equal(h.state, "fall");
  assert.equal(SKY.bodyCount(g), 3);
});

test("delivery pays 100·n² and removes the bodies", () => {
  for (const n of [1, 3, 5]) {
    const g = playing(11);
    grabN(g, n);
    assert.equal(SKY.bodyCount(g), n);
    const before = g.score;
    const humansBefore = g.humans.length;
    g.lander.x = g.ship.x;
    g.lander.y = CFG.topY;
    for (let i = 0; i < 120 && !g.lander.docked; i++) SKY.step(g, { dx: 0, dy: -1 });
    assert.ok(g.lander.docked, "docked");
    for (let i = 0; i < 120 && g.reel; i++) {
      freezeDefender(g);
      SKY.step(g, {});
    }
    assert.equal(g.score - before, CFG.scoreUnit * n * n);
    assert.equal(g.humans.length, humansBefore - n);
    assert.equal(SKY.bodyCount(g), 0);
    assert.equal(g.lander.docked, false);
  }
});

test("an empty lander cannot dock (the hatch is not a hiding place)", () => {
  const g = playing(2);
  g.lander.x = g.ship.x;
  g.lander.y = CFG.topY;
  for (let i = 0; i < 60; i++) SKY.step(g, { dx: 0, dy: -1 });
  assert.equal(g.lander.docked, false);
  assert.ok(g.lander.y >= CFG.topY);
});

test("a laser across the chain cuts it there; bodies below fall", () => {
  const g = playing(9);
  grabN(g, 4);
  hangTo(g, 160, 100);
  const third = g.chain[3]; // 3rd body
  g.lasers.push({ y: third.y, x0: 140, dir: 1, t: 0.1 });
  SKY.step(g, {});
  const n = SKY.bodyCount(g);
  assert.ok(n >= 1 && n <= 2, `kept ${n}`);
  assert.equal(g.humans.filter((h) => h.state === "fall").length, 4 - n);
  assert.ok(g.lander.alive);
});

test("a laser through the lander kills it and drops the whole chain", () => {
  const g = playing(9);
  grabN(g, 2);
  hangTo(g, 160, 100);
  g.lander.invuln = 0;
  const lives = g.lives;
  g.lasers.push({ y: g.lander.y, x0: 140, dir: 1, t: 0.1 });
  SKY.step(g, {});
  assert.equal(g.lander.alive, false);
  assert.equal(g.lives, lives - 1);
  assert.equal(g.phase, "dying");
  assert.equal(g.humans.filter((h) => h.state === "fall").length, 2);
});

test("falling bodies can be recaught by the tip", () => {
  const g = playing(4);
  const h = g.humans[0];
  for (const o of g.humans) if (o !== h) o.x = h.x > 160 ? 8 : CFG.W - 8;
  h.state = "fall";
  h.y = 120;
  hangTo(g, h.x, 120 - CFG.landerHalfH - CFG.hookLen);
  SKY.step(g, {});
  assert.equal(h.state, "held");
  assert.equal(g.stats.recatches, 1);
  assert.ok(g.events.some((e) => e.t === "attach" && e.air));
});

test("the Defender rescues a falling body and then holds fire briefly", () => {
  const g = playing(4);
  const h = g.humans[0];
  h.state = "fall";
  h.x = 150;
  h.y = 120;
  g.def.x = 146;
  g.def.y = 120;
  g.def.cool = 0;
  hangTo(g, 60, 60);
  SKY.step(g, {});
  assert.equal(h.state, "walk");
  assert.ok(g.def.calm > 0);
  assert.equal(g.stats.rescues, 1);
});

test("a committed pass flies one row: the lock equals its row and never moves", () => {
  const g = playing(8);
  hangTo(g, 200, 120);
  g.def.x = 40;
  g.def.y = 120;
  g.def.dir = 1;
  g.def.vx = 90;
  g.def.cool = 99;
  g.def.turnCool = 0;
  let lockY = null;
  for (let i = 0; i < 90; i++) {
    SKY.step(g, { dx: 0, dy: i < 45 ? -1 : 1 }); // lander moves around while the ship passes
    if (g.def.lock !== null) {
      if (lockY === null) lockY = g.def.lock;
      assert.equal(g.def.lock, lockY);
      assert.ok(Math.abs(g.def.y - lockY) < 1e-9, "flies its locked row");
    }
    if (g.phase !== "play") break;
  }
  assert.notEqual(lockY, null, "a lock happened");
});

test("the Defender telegraphs before every shot and holds its row while doing so", () => {
  const g = playing(8);
  hangTo(g, 250, 140);
  g.def.x = 60;
  g.def.y = 140;
  g.def.dir = 1;
  g.def.vx = 90;
  g.def.cool = 0;
  let sawTele = false;
  let teleY = null;
  for (let i = 0; i < 60; i++) {
    SKY.step(g, {});
    for (const e of g.events) {
      if (e.t === "tele") (sawTele = true), (teleY = g.def.y);
      if (e.t === "fire") {
        assert.ok(sawTele, "fire preceded by tele");
        assert.ok(Math.abs(e.y - teleY) < 1e-9, "fired from the telegraphed row");
      }
    }
    g.events.length = 0;
  }
  assert.ok(sawTele);
});

test("round clears when every human is delivered; next round has more", () => {
  const g = playing(6);
  g.humans = [];
  SKY.step(g, {});
  assert.equal(g.phase, "clear");
  const secs = Math.floor(SKY.hotTime(g) - g.roundT);
  assert.equal(g.score, CFG.roundBonus + secs * CFG.timeBonusPerSec, "round bonus + time bonus");
  for (let i = 0; i < (CFG.clearTime + 1) * 60 + 2; i++) SKY.step(g, {});
  assert.equal(g.round, 2);
  assert.equal(g.humans.length, CFG.humansBase + CFG.humansStep);
});

test("alert: the Defender goes hot after the round timer", () => {
  const g = playing(6);
  assert.ok(SKY.hotTime(g) >= 50, "each round sets its own HOT time");
  g.roundT = SKY.hotTime(g) - 0.01;
  SKY.step(g, {});
  assert.equal(g.alert, true);
});

test("extra lander at 10000", () => {
  const g = playing(6);
  const lives = g.lives;
  g.score = CFG.extendFirst - 100;
  grabN(g, 1);
  g.lander.x = g.ship.x;
  g.lander.y = CFG.topY;
  for (let i = 0; i < 200 && (g.reel || !g.stats.deliveries.length); i++) {
    freezeDefender(g);
    SKY.step(g, { dx: 0, dy: -1 });
  }
  assert.equal(g.lives, lives + 1);
});

test("idle loses: an idle lander dies out within 90 s on every seed", () => {
  for (let s = 1; s <= 20; s++) {
    const g = SKY.createGame(s * 101);
    for (let i = 0; i < 90 * 60 && g.phase !== "over"; i++) SKY.step(g, {});
    assert.equal(g.phase, "over", `seed ${s}`);
    assert.equal(g.score, 0);
  }
});

test("a heavy counts 2 in the payout: walker + heavy + walker pays 100·4²", () => {
  const g = playing(21);
  const hv = g.humans[1];
  hv.kind = "heavy";
  hv.w = 2;
  // grab walker, heavy, walker in that order
  for (const h of [g.humans[0], hv, g.humans[2]]) {
    for (const o of g.humans) if (o !== h && o.state === "walk" && Math.abs(o.x - h.x) < 30) o.x = h.x + (h.x < 160 ? 60 : -60);
    // Hang the chain straight so its tip sits exactly on the target.
    let d = CFG.landerHalfH + CFG.hookLen;
    for (let i = 1; i < g.chain.length; i++) d += SKY.linkLen(g.chain[i]);
    g.lander.x = h.x;
    g.lander.y = h.y - d;
    let yy = g.lander.y + CFG.landerHalfH;
    g.chain.forEach((n, i) => { yy += i === 0 ? CFG.hookLen : SKY.linkLen(n); n.x = n.px = h.x; n.y = n.py = yy; });
    SKY.step(g, {});
    assert.equal(h.state, "held");
  }
  assert.equal(SKY.chainWeight(g), 4);
  const before = g.score;
  g.lander.x = g.ship.x;
  g.lander.y = CFG.topY;
  for (let i = 0; i < 200 && (g.reel || g.stats.deliveries.length === 0); i++) {
    freezeDefender(g);
    SKY.step(g, { dx: 0, dy: -1 });
  }
  assert.equal(g.score - before, 100 * 16);
});

test("a heavy drags the lander like two bodies", () => {
  const speed = (w) => {
    const g = playing(3);
    for (let k = 0; k < w.length; k++) {
      const h = g.humans[k];
      h.state = "held";
      h.w = w[k];
      g.chain.push({ x: g.lander.x, y: g.lander.y + 20, px: g.lander.x, py: g.lander.y + 20, hid: h.id, w: w[k] });
    }
    hangTo(g, 160, 80);
    for (let i = 0; i < 60; i++) {
      freezeDefender(g);
      SKY.step(g, { dx: 1, dy: 0 });
    }
    return g.lander.vx;
  };
  assert.ok(Math.abs(speed([2]) - speed([1, 1])) < 0.5);
  assert.ok(speed([2]) < speed([1]) - 5);
});

test("mines: harmless while arming, then cut the chain where it touches", () => {
  const g = playing(12);
  grabN(g, 3);
  hangTo(g, 160, 100);
  const mid = g.chain[2];
  g.mines = [{ x: mid.x, y: mid.y, t: 0 }];
  SKY.step(g, {});
  assert.equal(SKY.bodyCount(g), 3, "not armed yet");
  hangTo(g, 160, 100);
  g.mines[0].t = CFG.mineArm;
  SKY.step(g, {});
  assert.ok(SKY.bodyCount(g) < 3, "cut once armed");
  assert.equal(g.mines.length, 0, "mine consumed");
  assert.equal(g.stats.mineCuts, 1);
  assert.ok(g.lander.alive);
});

test("mines: the lander hull touching an armed mine dies", () => {
  const g = playing(12);
  hangTo(g, 160, 100);
  g.lander.invuln = 0;
  g.mines = [{ x: 162, y: 100, t: 5 }];
  SKY.step(g, {});
  assert.equal(g.lander.alive, false);
  assert.equal(g.stats.deathBy.mine, 1);
});

test("the Bomber lays mines on its pass, never near the lander, and they expire", () => {
  const g = playing(13);
  g.bomber = { x: 20, y: 100, dir: 1, drop: 0 };
  hangTo(g, 300, 200);
  let laid = 0;
  for (let i = 0; i < 60 * 6; i++) {
    freezeDefender(g);
    g.lander.invuln = 99;
    SKY.step(g, {});
    for (const e of g.events) if (e.t === "mine") {
      laid++;
      assert.ok(Math.hypot(e.x - g.lander.x, e.y - g.lander.y) > CFG.mineSafeR);
    }
    g.events.length = 0;
  }
  assert.ok(laid >= 3, `laid ${laid}`);
  assert.ok(g.mines.length <= CFG.mineMax);
  for (let i = 0; i < 60 * (CFG.mineLife + 1); i++) {
    freezeDefender(g);
    g.bomber = null;
    SKY.step(g, {});
  }
  assert.equal(g.mines.length, 0, "all expired");
});

test("planet schedule: 2 rounds each, systems arrive in order, tour repeats", () => {
  const names = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => SKY.roundRules(r).planetName);
  assert.deepEqual(names, ["VERDA", "VERDA", "OCHRE", "OCHRE", "CINDER", "CINDER", "VOID", "VOID", "VERDA"]);
  // Each round has its own mix, not an ever-growing pile.
  const R = (r) => SKY.roundRules(r);
  assert.equal(R(1).heavyEvery, 0);
  assert.ok(R(3).heavyEvery > 0);
  assert.equal(R(1).bomber, false);
  assert.ok(R(4).bomber && R(4).tag === "MINES", "the Bomber arrives on OCHRE's second round");
  assert.ok(R(5).turrets.length > 0 && R(5).tag === "GUNS");
  assert.ok(R(5).shutter);
  assert.equal(R(6).tag, "ACE");
  assert.ok(R(6).def.speed > 1.2 && R(6).def.fire < 1, "ACE: a fast, trigger-happy Defender");
  assert.ok(!R(6).bomber && !R(6).rescuer && R(6).turrets.length === 0, "ACE is a duel");
  assert.ok(R(7).turrets.length > 0 && R(7).bomber && R(7).shutter, "CROSSFIRE: turrets, mines and the hatch shutter");
  assert.deepEqual(R(8).def, R(6).def, "the ace pilot returns for the final round");
  const kinds = (r) => [R(r).bomber ? "B" : "", R(r).rescuer ? "R" : "", R(r).turrets.length ? "T" : "", R(r).heavyEvery ? "H" : ""].join("");
  const mixes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(kinds));
  assert.ok(mixes.size >= 6, "at least six distinct mixes in a tour");
  assert.equal(SKY.roundRules(9).tour, 1);
  assert.ok(SKY.roundScale(9).speed > SKY.roundScale(1).speed + 0.1, "the second tour sharpens the pilot on the same planet");
});

function onPlanet(round, seed) {
  const g = SKY.createGame(seed || 5);
  SKY.startRound(g, round);
  while (g.phase !== "play") SKY.step(g, {});
  freezeDefender(g);
  g.bomber = null;
  g.mines = [];
  return g;
}

test("terrain stops lasers: a shot into a mesa wall never reaches the far side", () => {
  const g = onPlanet(5);
  // find a mesa: a column at least 20 px above the base
  let wall = -1;
  for (let x = 30; x < 290; x++) if (g.ground[x] < CFG.groundY - 20) { wall = x; break; }
  assert.ok(wall > 0);
  const y = CFG.groundY - 8; // low row, below the mesa top
  const x0 = wall - 30;
  const stop = SKY.terrainStop(g, x0, y, 1);
  assert.ok(stop >= x0 && stop <= wall + 1, `stop ${stop} wall ${wall}`);
  const l = { y, x0, dir: 1, t: 1, stop };
  const [a, b] = SKY.laserSpan(l);
  assert.ok(b <= stop + 1e-9);
});

test("terrain walls are solid sideways; gentle slopes are climbed", () => {
  const g = onPlanet(5);
  // a rising wall with open low ground in front of it
  let wall = -1;
  for (let x = 40; x < 290; x++) if (g.ground[x] < CFG.groundY - 20 && g.ground[x - 20] >= CFG.groundY - 1) { wall = x; break; }
  assert.ok(wall > 0);
  g.lander.x = wall - 18;
  g.lander.y = CFG.groundY - 8;
  g.lander.invuln = 99;
  for (let i = 0; i < 90; i++) SKY.step(g, { dx: 1, dy: 0 });
  assert.ok(g.lander.x < wall, "blocked by the wall");
  assert.ok(g.lander.y > CFG.groundY - 18, "not lifted up the wall");
  const h = onPlanet(3); // rolling hills
  h.lander.invuln = 99;
  h.lander.x = 20;
  h.lander.y = SKY.groundUnder(h, 14, 26) - 6;
  for (let i = 0; i < 180; i++) {
    h.lander.invuln = 99;
    freezeDefender(h);
    SKY.step(h, { dx: 1, dy: 1 });
  }
  assert.ok(h.lander.x > 150, `hugging the hills still travels (x ${h.lander.x.toFixed(0)})`);
});

test("nobody stands on a cliff: spawns are on footholds and landers slide off walls", () => {
  for (const r of [5, 7]) {
    for (let seed = 1; seed < 8; seed++) {
      const g = onPlanet(r, seed);
      for (const h of g.humans) assert.ok(SKY.slopeAt(g, h.x).steep <= 2, `round ${r} seed ${seed} x ${h.x}`);
      // drop someone onto a wall and let them settle
      let wall = -1;
      for (let x = 30; x < 290; x++) if (SKY.slopeAt(g, x).steep > 2) { wall = x; break; }
      const h = g.humans[0];
      h.state = "fall";
      h.x = wall;
      h.y = g.ground[wall] - 10;
      for (let i = 0; i < 180; i++) {
        freezeDefender(g);
        g.lander.invuln = 99;
        g.lander.x = 300;
        g.lander.y = 60;
        SKY.step(g, {});
      }
      if (h.state === "walk") assert.ok(SKY.slopeAt(g, h.x).steep <= 2, "slid to the foot");
    }
  }
});

test("a shut hatch refuses docking; an open one accepts", () => {
  const g = onPlanet(5);
  grabN(g, 1);
  g.ship.cycle = CFG.dt; // force to the start of the cycle, then run until shut
  for (let i = 0; i < 400 && g.ship.open; i++) {
    freezeDefender(g);
    g.lander.x = 300;
    g.lander.y = 120;
    SKY.step(g, {});
  }
  assert.equal(g.ship.open, false);
  g.lander.x = g.ship.x;
  g.lander.y = CFG.topY;
  SKY.step(g, { dx: 0, dy: -1 });
  assert.equal(g.lander.docked, false);
  for (let i = 0; i < 300 && !g.lander.docked; i++) {
    freezeDefender(g);
    g.lander.x = g.ship.x;
    SKY.step(g, { dx: 0, dy: -1 });
  }
  assert.equal(g.lander.docked, true, "docks once the hatch opens");
});

test("over terrain the Defender still flies a committed pass dead straight", () => {
  for (const r of [3, 5, 7]) {
    for (let seed = 1; seed <= 6; seed++) {
      const g = SKY.createGame(seed * 31);
      SKY.startRound(g, r);
      const bot = B.reader({ haulAt: 4, seed });
      let lockY = null;
      for (let i = 0; i < 60 * 40 && g.round === r && g.phase !== "over"; i++) {
        SKY.step(g, bot(g));
        const d = g.def;
        if (d.lock !== null && d.mode === "hunt") {
          if (lockY === null) lockY = d.lock;
          assert.ok(Math.abs(d.y - d.lock) < 1e-6, `round ${r} seed ${seed}: row changed during a pass`);
        } else lockY = null;
        g.events.length = 0;
      }
    }
  }
});

test("bonus stage follows each planet's last round only, then the next planet begins", () => {
  for (const r of [1, 2, 3, 4]) {
    const g = SKY.createGame(9);
    SKY.startRound(g, r);
    while (g.phase !== "play") SKY.step(g, {});
    g.humans = [];
    SKY.step(g, {});
    assert.equal(g.phase, "clear");
    for (let i = 0; i < 60 * 4 && g.phase === "clear"; i++) SKY.step(g, {});
    if (r % 2 === 0) {
      assert.ok(g.bonus, `bonus after round ${r}`);
      assert.equal(g.round, r, "round number unchanged during the bonus");
    } else {
      assert.equal(g.bonus, null);
      assert.equal(g.round, r + 1);
    }
  }
});

test("bonus stage: no enemies, parachutists drop, timer ends it, next round follows", () => {
  const g = SKY.createGame(4);
  SKY.startRound(g, 2);
  SKY.startBonus(g);
  let deaths = 0;
  let chutes = 0;
  const bot = B.idle();
  for (let i = 0; i < 60 * 30 && g.bonus && g.phase !== "clear"; i++) {
    SKY.step(g, bot(g));
    for (const e of g.events) {
      if (e.t === "death") deaths++;
      if (e.t === "chute") chutes++;
      assert.notEqual(e.t, "fire");
      assert.notEqual(e.t, "mine");
    }
    g.events.length = 0;
  }
  assert.equal(deaths, 0);
  assert.equal(chutes, CFG.bonusCount);
  assert.equal(g.phase, "clear");
  assert.equal(g.humans.length, 0, "leftovers cleared");
  for (let i = 0; i < 60 * 5 && g.bonus; i++) SKY.step(g, {});
  assert.equal(g.round, 3);
  assert.equal(g.rules.planetName, "OCHRE");
});

test("bonus stage: delivering every parachutist pays PERFECT", () => {
  const g = SKY.createGame(4);
  SKY.startRound(g, 2);
  SKY.startBonus(g);
  while (g.phase !== "play") SKY.step(g, {});
  g.bonus.delivered = g.bonus.total; // as if all were hauled in
  g.bonus.spawned = g.bonus.total;
  g.humans = [];
  const before = g.score;
  let ev = null;
  SKY.step(g, {});
  for (const e of g.events) if (e.t === "bonusEnd") ev = e;
  assert.ok(ev && ev.perfect);
  assert.equal(g.score - before, CFG.bonusPerfect);
});

test("round 1 is gentler: no Rescuer and a slower-firing Defender; the Rescuer arrives in round 2", () => {
  assert.equal(SKY.roundRules(1).rescuer, null);
  assert.ok(SKY.roundRules(1).def.fire > 1.4);
  assert.ok(SKY.roundRules(2).rescuer);
  assert.equal(SKY.roundRules(2).def.fire, 1);
  const g = SKY.createGame(3);
  assert.equal(g.rescuer, null);
  SKY.startRound(g, 2);
  assert.ok(g.rescuer);
  for (const r of [1, 2, 3, 4, 5, 6, 7, 8])
    if (SKY.roundRules(r).rescuer) assert.ok(SKY.roundRules(r).rescuer.speed < CFG.landerSpeed * 0.6, "always well below an unladen lander");
});

function withRescuer(seed) {
  const g = SKY.createGame(seed || 3);
  SKY.startRound(g, 2);
  while (g.phase !== "play") SKY.step(g, {});
  freezeDefender(g);
  return g;
}

test("the Rescuer plucks only the lowest captive of a hanging chain, and never harms the lander", () => {
  const g = withRescuer(3);
  grabN(g, 3);
  hangTo(g, 160, 80);
  const lowest = SKY.tip(g).hid;
  const r = g.rescuer;
  r.rest = 0;
  r.x = SKY.tip(g).x;
  r.y = SKY.tip(g).y - 7;
  g.lander.invuln = 0;
  let snatched = false;
  for (let i = 0; i < 30 && !snatched; i++) {
    freezeDefender(g);
    g.lander.x = 160;
    g.lander.y = 80;
    SKY.step(g, {});
    snatched = g.events.some((e) => e.t === "snatch");
  }
  assert.ok(snatched);
  assert.equal(SKY.bodyCount(g), 2, "only one body taken");
  assert.equal(g.humans.find((h) => h.id === lowest).state, "carried");
  // flying straight through the lander does nothing to it
  r.x = g.lander.x;
  r.y = g.lander.y;
  SKY.step(g, {});
  assert.ok(g.lander.alive);
});

test("a carried captive is hooked back by the chain tip; otherwise it is set down far from the lander", () => {
  const g = withRescuer(5);
  const h = g.humans[0];
  h.state = "carried";
  const r = g.rescuer;
  r.mode = "carry";
  r.carryId = h.id;
  r.dropX = 30;
  r.x = 200;
  r.y = 120;
  // steal back: bring the hook onto the carried body
  SKY.step(g, {});
  hangTo(g, h.x, h.y - CFG.landerHalfH - CFG.hookLen);
  SKY.step(g, {});
  assert.equal(h.state, "held");
  assert.equal(g.stats.stealBacks, 1);
  assert.notEqual(r.mode, "carry");
  // set down: another carry, lander far away
  const g2 = withRescuer(6);
  const h2 = g2.humans[0];
  h2.state = "carried";
  Object.assign(g2.rescuer, { mode: "carry", carryId: h2.id, dropX: 30, x: 200, y: 120 });
  hangTo(g2, 300, 60);
  let dropped = false;
  for (let i = 0; i < 60 * 12 && !dropped; i++) {
    freezeDefender(g2);
    g2.lander.x = 300;
    g2.lander.y = 60;
    SKY.step(g2, {});
    dropped = g2.events.some((e) => e.t === "drop");
    g2.events.length = 0;
  }
  assert.ok(dropped);
  assert.ok(Math.abs(h2.x - 30) < 12, "set down at the far side");
  assert.equal(h2.state, "fall");
});

test("no Rescuer in bonus stages", () => {
  const g = SKY.createGame(4);
  SKY.startRound(g, 2);
  SKY.startBonus(g);
  assert.equal(g.rescuer, null);
});

function onTurretStage(seed) {
  const g = SKY.createGame(seed || 3);
  SKY.startRound(g, 5);
  while (g.phase !== "play") SKY.step(g, {});
  freezeDefender(g);
  g.rescuer = null;
  g.bomber = null;
  g.mines = [];
  return g;
}

test("turrets telegraph, then fire straight up: a hanging chain shields the lander, losing its lowest captives", () => {
  const g = onTurretStage(3);
  const t = g.turrets[0];
  grabN(g, 3);
  g.lander.invuln = 0;
  let charged = false, fired = null;
  for (let i = 0; i < 120 && !fired; i++) {
    freezeDefender(g);
    hangTo(g, t.x, t.y - 90);
    SKY.step(g, {});
    for (const e of g.events) {
      if (e.t === "turretCharge") charged = true;
      if (e.t === "turretFire") fired = e;
    }
    g.events.length = 0;
  }
  assert.ok(charged && fired, "charged then fired");
  assert.ok(fired.shielded, "the chain took the shot");
  assert.ok(g.lander.alive, "the lander survived");
  assert.equal(SKY.bodyCount(g), 2, "a straight hanging chain loses only its lowest captive");
});

test("turrets: with no chain in the column the beam reaches the lander; off the column nothing fires", () => {
  const g = onTurretStage(4);
  const t = g.turrets[1];
  g.lander.invuln = 0;
  hangTo(g, t.x, t.y - 90);
  let died = false;
  for (let i = 0; i < 300 && !died; i++) {
    freezeDefender(g);
    SKY.step(g, {});
    died = !g.lander.alive;
  }
  assert.ok(died);
  assert.equal(g.stats.deathBy.turret, 1);
  const h = onTurretStage(5);
  hangTo(h, 5, 60); // far from every turret column
  for (let i = 0; i < 180; i++) {
    freezeDefender(h);
    h.lander.x = 5;
    SKY.step(h, {});
    assert.ok(!h.events.some((e) => e.t === "turretFire"));
    h.events.length = 0;
  }
});

test("a side-swung chain shields only from its crossing point down", () => {
  const g = onTurretStage(6);
  const t = g.turrets[0];
  grabN(g, 4);
  // lander just beside the column, chain angled so only the two lowest bodies cross it
  g.lander.x = t.x - 20;
  g.lander.y = t.y - 100;
  g.lander.invuln = 0;
  let y = g.lander.y + CFG.landerHalfH;
  g.chain.forEach((n, i) => {
    y += i === 0 ? CFG.hookLen : CFG.linkLen;
    n.x = n.px = i < 3 ? t.x - 20 : t.x;
    n.y = n.py = y;
  });
  t.cool = 0;
  t.charge = 0.001;
  SKY.step(g, {});
  assert.ok(SKY.bodyCount(g) >= 2, `kept ${SKY.bodyCount(g)}`);
  assert.ok(g.lander.alive);
});

test("HOT time follows the round: short early, long late, a little longer each tour; warning ticks count down", () => {
  const hot = (r) => SKY.roundRules(r).hotTime;
  assert.ok(hot(1) < hot(4) && hot(4) < hot(7), `${hot(1)} ${hot(4)} ${hot(7)}`);
  assert.equal(hot(9), hot(1) + CFG.hotPerTour);
  const g = SKY.createGame(2);
  while (g.phase !== "play") SKY.step(g, {});
  g.roundT = SKY.hotTime(g) - 5.5;
  const ticks = [];
  for (let i = 0; i < 60 * 6 && !g.alert; i++) {
    g.lander.invuln = 99;
    freezeDefender(g);
    SKY.step(g, {});
    for (const e of g.events) if (e.t === "hotTick") ticks.push(e.left);
    g.events.length = 0;
  }
  assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
  assert.ok(g.alert);
});

test("time bonus: whole seconds left on the fuse × 50 × (tour+1); zero once HOT", () => {
  const clearAt = (roundT, alert, round) => {
    const g = SKY.createGame(5);
    SKY.startRound(g, round || 1);
    while (g.phase !== "play") SKY.step(g, {});
    g.roundT = roundT;
    g.alert = alert;
    g.humans = [];
    const before = g.score;
    SKY.step(g, {});
    return { gained: g.score - before, info: g.clearInfo, g };
  };
  const hot1 = SKY.roundRules(1).hotTime;
  const a = clearAt(hot1 - 20.5, false);
  assert.equal(a.info.secsLeft, 20);
  assert.equal(a.gained, CFG.roundBonus + 20 * CFG.timeBonusPerSec);
  const b = clearAt(hot1 + 5, true);
  assert.equal(b.info.timeBonus, 0, "nothing after HOT");
  assert.equal(b.gained, CFG.roundBonus);
  const c = clearAt(1, false, 9); // second tour: × 2
  assert.equal(c.info.timeBonus, c.info.secsLeft * CFG.timeBonusPerSec * 2);
});

test("mission complete: clearing round 8 ends the game straight away (no bonus stage) with a ships bonus", () => {
  const g = SKY.createGame(11);
  SKY.startRound(g, 8);
  while (g.phase !== "play") SKY.step(g, {});
  g.lives = 3;
  g.alert = true; // no time bonus, to isolate the ships bonus
  g.humans = [];
  g.events.length = 0;
  let completeEv = null;
  let over = false;
  for (let i = 0; i < 60 * 20 && !over; i++) {
    const before = g.score;
    SKY.step(g, {});
    for (const e of g.events) {
      if (e.t === "complete") completeEv = { e, gained: g.score - before };
      if (e.t === "round") assert.fail("no round 9 in the campaign");
      if (e.t === "bonusStart") assert.fail("no bonus stage after the final round");
    }
    g.events.length = 0;
    over = g.phase === "over";
  }
  assert.ok(completeEv, "complete event");
  assert.equal(completeEv.e.livesBonus, 3 * CFG.livesBonus);
  assert.equal(completeEv.gained, 3 * CFG.livesBonus);
  assert.ok(over && g.gameOver && g.cleared);
  assert.equal(g.round, 8);
  // simulations can still tour
  const h = SKY.createGame(11, { endless: true });
  SKY.startRound(h, 8);
  while (h.phase !== "play") SKY.step(h, {});
  h.humans = [];
  for (let i = 0; i < 60 * 40 && h.round === 8; i++) {
    SKY.step(h, {});
    if (h.bonus && h.phase === "play") (h.bonus.t = 0.01), (h.bonus.spawned = h.bonus.total), (h.humans = []);
  }
  assert.equal(h.round, 9);
});

test("near miss: a shot just past the hull or the chain fires one graze (feedback only), a hit does not", () => {
  const g = playing(9);
  hangTo(g, 160, 100);
  g.lander.invuln = 0;
  // 8 px under the lander: past the hit band (6), inside the graze margin
  g.lasers.push({ y: 108, x0: 140, dir: 1, t: 0.02 });
  let grazes = 0;
  for (let i = 0; i < 30; i++) {
    freezeDefender(g);
    hangTo(g, 160, 100);
    SKY.step(g, {});
    grazes += g.events.filter((e) => e.t === "graze").length;
    g.events.length = 0;
  }
  assert.ok(g.lander.alive, "no hit");
  assert.equal(grazes, 1, "exactly one graze per shot");
  const h = playing(9);
  hangTo(h, 160, 100);
  h.lander.invuln = 0;
  h.lasers.push({ y: 100, x0: 140, dir: 1, t: 0.02 });
  SKY.step(h, {});
  assert.equal(h.lander.alive, false);
  assert.ok(!h.events.some((e) => e.t === "graze"), "a hit is not a graze");
});

test("cut recoil: after a cut the chain left hanging springs upward, hardest at the cut end", () => {
  const g = playing(9);
  grabN(g, 4);
  hangTo(g, 160, 100);
  const third = g.chain[3];
  g.lasers.push({ y: third.y, x0: 140, dir: 1, t: 0.1 });
  SKY.step(g, {});
  const n = SKY.bodyCount(g);
  assert.ok(n >= 1 && n < 4);
  const end = g.chain[g.chain.length - 1];
  const hook = g.chain[0];
  assert.ok(end.y - end.py < -0.5, "cut end moving up");
  assert.ok(end.y - end.py < hook.y - hook.py, "the cut end springs harder than the top");
});

test("deterministic: same seed + same inputs → same state", () => {
  const run = () => {
    const g = SKY.createGame(77);
    const bot = B.reader({ haulAt: 4, seed: 1 });
    for (let i = 0; i < 60 * 60; i++) SKY.step(g, bot(g));
    return JSON.stringify([g.score, g.round, g.lives, g.lander.x, g.def.x, g.humans.length]);
  };
  assert.equal(run(), run());
});

console.log(`\n${passed} passed`);
