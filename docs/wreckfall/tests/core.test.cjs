// Rule invariants for WRECKFALL's core: node tests/core.test.cjs
const assert = require("node:assert/strict");
const WF = require("../core.js");
const { CFG, W } = WF;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  ", name);
}

// a play-mode game with a hand-placed, motionless formation
function rig(enemies, opts) {
  const s = WF.createGame(opts && opts.seed ? opts.seed : 5);
  s.mode = "play";
  s.modeT = 0;
  s.enemies = enemies.map((e, i) => Object.assign({ id: 1000 + i, alive: true, flash: 0, armored: e.lane === 4, kind: e.lane === 4 ? "hulk" : "esc" }, e));
  s.total = Math.max(1, s.enemies.filter((e) => e.armored).length);
  for (const l of s.lanes) l.v = 0;
  s.params = Object.assign({}, s.params, { descent: 0, bombInterval: 999 });
  s.bombT = 999;
  s.drop = 0;
  return s;
}
function run(s, secs, input) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / WF.DT); i++) {
    WF.step(s, typeof input === "function" ? input(s, i) : input || {});
    ev.push(...s.events);
  }
  return ev;
}
const pressOnce = (s, i) => ({ fire: i === 0 });

test("same seed and inputs give the same game", () => {
  const a = WF.createGame(42);
  const b = WF.createGame(42);
  for (let i = 0; i < 3000; i++) {
    const inp = { left: i % 200 < 70, right: i % 200 > 130, fire: i % 23 === 0 };
    WF.step(a, inp);
    WF.step(b, inp);
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("a shot hits the lowest craft in its column first", () => {
  const s = rig([{ lane: 0, x: 100 }, { lane: 2, x: 100 }, { lane: 4, x: 30 }]);
  s.player.x = 100;
  const ev = run(s, 1, pressOnce);
  const hit = ev.find((e) => e.type === "hit");
  assert.equal(hit.lane, 2);
  assert.ok(s.enemies[0].alive, "upper craft untouched by the shot");
});

test("only one shot at a time, and holding fire does not auto-repeat", () => {
  const s = rig([{ lane: 4, x: 30 }]);
  s.player.x = 150;
  const ev = run(s, 2, { fire: true });
  assert.equal(ev.filter((e) => e.type === "fire").length, 1);
  const s2 = rig([{ lane: 4, x: 30 }]);
  s2.player.x = 150;
  const ev2 = run(s2, 0.3, (st, i) => ({ fire: i % 4 < 2 }));
  assert.equal(ev2.filter((e) => e.type === "fire").length, 1, "second press while the shot is in flight is ignored");
});

test("shots bounce off hulks; the hulk survives", () => {
  const s = rig([{ lane: 4, x: 100 }, { lane: 4, x: 30 }]);
  s.player.x = 100;
  const ev = run(s, 1, pressOnce);
  assert.ok(ev.some((e) => e.type === "clink" && e.armored));
  assert.ok(s.enemies[0].alive);
  assert.equal(s.score, 0);
});

test("a wreck swallows the craft it falls through, scoring k × points for the k-th", () => {
  const s = rig([{ lane: 0, x: 100 }, { lane: 2, x: 104 }, { lane: 3, x: 96 }, { lane: 4, x: 102 }, { lane: 4, x: 20 }]);
  s.player.x = 100;
  // clear the column below lane 0 for the shot: park lanes 2-4 until the shot passes
  const lower = s.enemies.slice(1, 4);
  for (const e of lower) e.alive = false;
  const ev = [];
  for (let i = 0; i < 200; i++) {
    WF.step(s, { fire: i === 0, targetX: i > 5 ? 60 : undefined });
    ev.push(...s.events);
    if (ev.some((e) => e.type === "hit")) for (const e of lower) if (!e._back) { e.alive = true; e._back = true; }
  }
  const sw = ev.filter((e) => e.type === "swallow");
  assert.deepEqual(sw.map((e) => e.n), [2, 3, 4]);
  assert.deepEqual(sw.map((e) => e.pts), [30 * 2, 20 * 3, CFG.hulkPoints * 4]);
  const land = ev.find((e) => e.type === "land");
  assert.equal(land.n, 4);
  assert.equal(land.w, CFG.wreckW0 + 3 * CFG.wreckGrow);
  assert.equal(s.score, 50 + 60 + 60 + 600);
});

test("a wreck landing on the cannon kills it; one landing beside it does not", () => {
  const s = rig([{ lane: 0, x: 100 }, { lane: 4, x: 20 }]);
  s.player.x = 100;
  const ev = run(s, 2, pressOnce);
  assert.ok(ev.some((e) => e.type === "death" && e.cause === "wreck"));
  const s2 = rig([{ lane: 0, x: 100 }, { lane: 4, x: 20 }]);
  s2.player.x = 100;
  const ev2 = run(s2, 2, (st, i) => ({ fire: i === 0, targetX: i > 2 ? 100 + CFG.wreckW0 / 2 + CFG.playerHalfW + 1 : 100 }));
  assert.ok(ev2.some((e) => e.type === "land"));
  assert.ok(!ev2.some((e) => e.type === "death"));
});

test("wreck drift carries half the lane's motion", () => {
  const s = rig([{ lane: 0, x: 100 }, { lane: 4, x: 20 }]);
  s.lanes[0].v = 40;
  s.player.x = 100;
  // compensate: fire when the craft is overhead
  s.enemies[0].x = 100 - 40 * ((CFG.playerY - 6 - WF.laneY(s, 0)) / CFG.shotSpeed);
  const ev = run(s, 2, (st, i) => ({ fire: i === 0, targetX: 20 }));
  const hit = ev.find((e) => e.type === "hit");
  const land = ev.find((e) => e.type === "land");
  assert.ok(hit && land);
  assert.ok(land.x > hit.x + 5, "wreck lands downstream of where it was hit");
});

test("destroyed escorts re-enter from the edge they travel from; hulks never return", () => {
  const s = rig([{ lane: 1, x: 100 }, { lane: 4, x: 20 }, { lane: 4, x: 200 }]);
  s.lanes[1].v = -30;
  s.player.x = 100;
  s.enemies[0].x = 100 + 30 * ((CFG.playerY - 6 - WF.laneY(s, 1)) / CFG.shotSpeed);
  run(s, CFG.escortRespawn + 1.5, (st, i) => ({ fire: i === 0, targetX: 40 }));
  const back = s.enemies.filter((e) => e.alive && e.lane === 1);
  assert.equal(back.length, 1);
  assert.ok(back[0].x > W - 40, "re-entered from the right edge (moving left)");
  const hulks = s.enemies.filter((e) => e.armored).length;
  assert.equal(hulks, 2);
});

test("crushing the last hulk clears the wave and pays the height bonus", () => {
  const s = rig([{ lane: 0, x: 100 }, { lane: 4, x: 20 }]);
  s.player.x = 100;
  const ev = run(s, 2, (st, i) => {
    if (st.wrecks.length) st.enemies[1].x = st.wrecks[0].x + 1; // the hulk has drifted under the wreck
    return { fire: i === 0, targetX: 40 };
  });
  const clr = ev.find((e) => e.type === "clear");
  assert.ok(clr);
  assert.equal(clr.bonus, clr.room * CFG.heightBonus * 2);
  run(s, CFG.waveClearTime + 0.1);
  assert.equal(s.wave, 2);
  assert.equal(s.lanes[3].armored, false);
  run(s, 60 * 0); // wave 4 gets two hulk lanes
  assert.deepEqual(WF.waveParams(4).armored, [3, 4]);
});

test("hulks reaching the line end the game at once, whatever lives are left", () => {
  const s = rig([{ lane: 4, x: 60 }]);
  s.player.x = 150;
  s.lives = 3;
  s.drop = CFG.invadeY - CFG.enemyHalfH - WF.laneY(s, 4) + 0.5;
  const ev = run(s, CFG.respawnTime + 0.2);
  assert.ok(ev.some((e) => e.type === "death" && e.cause === "invade"));
  assert.ok(ev.some((e) => e.type === "gameover"));
  assert.equal(s.mode, "over");
});

test("height bonus = room above the line × heightBonus × (wave + 1), and it drains as the formation descends", () => {
  const s = WF.createGame(2, { startWave: 3 });
  s.mode = "play";
  const b0 = WF.heightBonusNow(s);
  run(s, 3);
  const b1 = WF.heightBonusNow(s);
  assert.ok(b1 < b0);
  const drained = (b0 - b1) / 3;
  const expect = WF.waveParams(3).descent * CFG.heightBonus * 4;
  assert.ok(Math.abs(drained - expect) < expect * 0.25, `drain ${drained}/s vs ${expect}/s`);
});

test("bombs are telegraphed, kill the cannon, and can be shot down", () => {
  const s = rig([{ lane: 2, x: 100 }, { lane: 4, x: 20 }]);
  s.player.x = 100;
  s.bombT = 0.01;
  s.params.bombInterval = 999;
  const ev = run(s, 3);
  const tell = ev.findIndex((e) => e.type === "tell");
  const drop = ev.findIndex((e) => e.type === "bomb");
  assert.ok(tell >= 0 && drop > tell);
  assert.ok(ev.some((e) => e.type === "death" && e.cause === "bomb"));
  const s2 = rig([{ lane: 4, x: 20 }]);
  s2.player.x = 100;
  s2.bombs.push({ id: 9, x: 100, y: 120 });
  const ev2 = run(s2, 1, pressOnce);
  assert.ok(ev2.some((e) => e.type === "bombshot"));
  assert.equal(s2.bombs.length, 0);
});

test("a shot is absorbed by a falling wreck", () => {
  const s = rig([{ lane: 4, x: 20 }]);
  s.player.x = 100;
  s.wrecks.push({ id: 77, x: 100, y: 150, vx: 0, vy: 0, n: 1, w: 10, pts: 10, lanes: [0], age: 0 });
  const ev = run(s, 0.3, pressOnce);
  assert.ok(ev.some((e) => e.type === "clink" && !e.armored));
  assert.ok(!ev.some((e) => e.type === "hit"));
});

test("extends at 30000, 100000, then every 100000; game over when the last life is lost", () => {
  const s = rig([{ lane: 4, x: 20 }]);
  const l0 = s.lives;
  s.score = 29990;
  s.player.x = 100;
  s.bombs.push({ id: 9, x: 100, y: 120 });
  run(s, 1, pressOnce); // shooting the bomb pays 5 → no extend yet
  s.score = 29999;
  s.bombs.push({ id: 10, x: 100, y: 120 });
  run(s, 1, pressOnce);
  assert.equal(s.lives, l0 + 1);
  assert.equal(s.nextExtend, 100000);
  const g = WF.createGame(3);
  let t = 0;
  while (g.mode !== "over" && t++ < 60 * 400) WF.step(g, {});
  assert.equal(g.mode, "over");
  assert.equal(g.lives, 0);
});

// ---- SPLITTER ------------------------------------------------------------------------
test("splitters: one per escort lane on the campaign's splitter waves only", () => {
  const s = WF.createGame(3, { startWave: 5 });
  const kinds = s.enemies.filter((e) => !e.armored).map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === "split").length, 3, "one per escort lane (wave 5 has three)");
  assert.ok(kinds.every((k) => k === "split" || k === "esc"));
  assert.ok(WF.createGame(3, { startWave: 3 }).enemies.every((e) => e.kind !== "split"));
});
test("a shot splitter becomes two wrecks spreading apart; a swallowed one forks the chain", () => {
  const s = rig([{ lane: 0, x: 100, kind: "split" }, { lane: 4, x: 20 }]);
  s.player.x = 100;
  const ev = run(s, 0.8, (st, i) => ({ fire: i === 0, targetX: 30 }));
  assert.ok(ev.some((e) => e.type === "fork"));
  assert.equal(s.wrecks.length, 2);
  assert.ok(Math.abs(s.wrecks[0].vx - s.wrecks[1].vx - -2 * CFG.splitV) < 1e-9 || Math.abs(s.wrecks[1].vx - s.wrecks[0].vx - -2 * CFG.splitV) < 1e-9);

  const s2 = rig([{ lane: 0, x: 100 }, { lane: 4, x: 20 }]);
  s2.player.x = 100;
  let placed = false;
  const ev2 = [];
  for (let i = 0; i < 160; i++) {
    WF.step(s2, { fire: i === 0, targetX: 30 });
    ev2.push(...s2.events);
    if (!placed && s2.wrecks.length && s2.wrecks[0].y > WF.laneY(s2, 0) + 6) {
      s2.enemies.push({ id: 6000, lane: 2, x: s2.wrecks[0].x, alive: true, flash: 0, armored: false, kind: "split" });
      placed = true;
    }
  }
  const fork = ev2.find((e) => e.type === "fork");
  assert.ok(fork && fork.n === 2, "fork carries the chain count");
  assert.equal(ev2.filter((e) => e.type === "land").length, 2);
});

test("destroyed specials re-enter as the same kind", () => {
  const s = rig([{ lane: 1, x: 100, kind: "split" }, { lane: 4, x: 20 }, { lane: 4, x: 200 }]);
  s.lanes[1].v = -30;
  s.player.x = 100;
  s.enemies[0].x = 100 + 30 * ((CFG.playerY - 6 - WF.laneY(s, 1)) / CFG.shotSpeed);
  run(s, CFG.escortRespawn + 1.5, (st, i) => ({ fire: i === 0, targetX: 180 })); // clear of both fork branches
  assert.equal(s.mode, "play");
  const back = s.enemies.filter((e) => e.alive && e.lane === 1);
  assert.equal(back.length, 1);
  assert.equal(back[0].kind, "split");
});

// ---- THICK hulks / MOTHERSHIP ------------------------------------------------------------
test("thick hulks follow the campaign table, all in the bottom lane", () => {
  const s = WF.createGame(3, { startWave: 7 });
  assert.equal(s.enemies.filter((e) => e.thick).length, WF.waveDef(7).thick);
  assert.ok(s.enemies.filter((e) => e.thick).every((e) => e.lane === 4));
  assert.equal(WF.createGame(3).enemies.filter((e) => e.thick).length, 0);
});
test("on a thick hulk: ×1 breaks up, ×2 knocks the plate off, ×3 crushes", () => {
  const drop = (n, thick) => {
    const s = rig([{ lane: 0, x: 100 }, { lane: 4, x: 20, thick }]);
    s.player.x = 100;
    const hulk = s.enemies[1];
    const ev = [];
    for (let i = 0; i < 160; i++) {
      WF.step(s, { fire: i === 0, targetX: 30 });
      ev.push(...s.events);
      if (s.wrecks.length && s.wrecks[0].n < n) s.wrecks[0].n = n; // as if it had swallowed n-1 craft
      if (s.wrecks.length) hulk.x = s.wrecks[0].x;
    }
    return { ev, hulk };
  };
  const a = drop(1, true);
  assert.ok(a.ev.some((e) => e.type === "bounce" && !e.plate));
  assert.ok(a.hulk.alive && a.hulk.thick, "×1 does nothing");
  assert.ok(!a.ev.some((e) => e.type === "land"), "the wreck broke up before landing");
  const b = drop(2, true);
  assert.ok(b.ev.some((e) => e.type === "bounce" && e.plate));
  assert.ok(b.hulk.alive && !b.hulk.thick, "×2 knocks the plate off");
  const c = drop(3, true);
  assert.ok(!c.hulk.alive, "×3 crushes a thick hulk");
  const d = drop(1, false);
  assert.ok(!d.hulk.alive, "any wreck crushes a plain hulk");
});

test("the mothership crosses above the top lane, then leaves", () => {
  const s = rig([{ lane: 4, x: 20 }]);
  s.ufoT = 0.01;
  const ev = run(s, 0.1);
  assert.ok(ev.some((e) => e.type === "ufo"));
  assert.ok(s.ufo);
  assert.ok(WF.ufoY(s) < WF.laneY(s, 0));
  const ev2 = run(s, (W + 40) / CFG.ufoSpeed + 0.5);
  assert.ok(ev2.some((e) => e.type === "ufoGone"));
  assert.equal(s.ufo, null);
});

test("shooting the mothership drops a 56 px wreck that counts as 3 craft and keeps its width", () => {
  const s = rig([{ lane: 2, x: 60 }, { lane: 4, x: 20 }]);
  s.ufo = { x: 100, v: 0 };
  s.ufoT = 999;
  s.player.x = 100;
  const ev = [];
  for (let i = 0; i < 90 && !ev.some((e) => e.type === "swallow"); i++) {
    WF.step(s, { fire: i === 0, targetX: i > 2 ? 30 : 100 });
    ev.push(...s.events);
    const w = s.wrecks[0];
    if (w && w.y > WF.laneY(s, 2) - 12 && s.enemies[0].x !== w.x) s.enemies[0].x = w.x + 20; // under the hull's edge
  }
  const hit = ev.find((e) => e.type === "ufoHit");
  assert.ok(hit);
  assert.equal(hit.pts, CFG.ufoPoints);
  const sw = ev.find((e) => e.type === "swallow");
  assert.equal(sw.n, CFG.ufoN + 1, "the first craft it swallows is the 4th link");
  assert.equal(s.wrecks[0].w, CFG.ufoW, "does not shrink to the normal width cap");
});

// ---- time allowance / formation behaviours ------------------------------------------------
test("descent comes from a time allowance that grows with hulks and thick hulks", () => {
  for (let w = 1; w <= 12; w++) {
    const p = WF.waveParams(w);
    const room0 = CFG.invadeY - (CFG.laneY0 + 4 * CFG.laneGap + p.startDrop + CFG.enemyHalfH);
    assert.ok(Math.abs(p.descent * WF.timeAllowance(w) - room0) < 1e-9, "descent × allowance = room");
  }
  // more work → more time, before pressure: wave 3 (thick added) gets more than wave 2
  assert.ok(WF.timeAllowance(3) > WF.timeAllowance(2));
  assert.ok(WF.timeAllowance(4) > WF.timeAllowance(3), "two hulk lanes");
});

test("campaign: 12 waves, each adds at most one element not seen before", () => {
  assert.equal(WF.CAMPAIGN.length, 12);
  const seen = new Set();
  for (let w = 1; w <= 12; w++) {
    const d = WF.waveDef(w);
    const els = [];
    if (d.specials.length) els.push("split");
    if (d.thick) els.push("thick");
    if (d.lanes === 2) els.push("twin");
    if (d.behavior !== "normal") els.push(d.behavior);
    const fresh = els.filter((x) => !seen.has(x));
    assert.ok(fresh.length <= 1, `wave ${w} introduces ${fresh}`);
    for (const x of els) seen.add(x);
  }
  assert.deepEqual([...seen].sort(), ["convoy", "reverse", "split", "thick", "twin"]);
  const s = WF.createGame(2, { startWave: 5 });
  assert.equal(s.params.behavior, "convoy");
  assert.ok(s.lanes.every((l) => l.v > 0), "convoy: every lane streams the same way");
});

test("clearing wave 12 pays the ships bonus and ends the game as ALL CLEAR", () => {
  const s = WF.createGame(4, { startWave: 12 });
  s.mode = "play";
  s.lives = 2;
  const score0 = s.score;
  for (const e of s.enemies) if (e.armored) e.alive = false;
  const ev = run(s, CFG.endingTime + 0.2);
  const ac = ev.find((e) => e.type === "allclear");
  assert.ok(ac);
  assert.equal(ac.bonus, ac.ships * CFG.shipsBonus); // the height bonus may extend first
  assert.ok(ac.ships >= 2);
  assert.ok(s.score - score0 >= ac.bonus);
  assert.equal(s.mode, "over");
  assert.ok(s.allClear);
  assert.ok(ev.some((e) => e.type === "gameover" && e.allClear));
});
test("REVERSE: crushing a hulk flips the lane above it; plain waves do not", () => {
  const trial = (behavior) => {
    const s = WF.createGame(2, { startWave: 5, behavior });
    s.mode = "play";
    s.bombT = 999;
    s.ufoT = 999;
    const h = s.enemies.find((e) => e.armored && e.lane === 4 && !e.thick);
    const v3 = s.lanes[3].v;
    s.wrecks.push({ id: 900, x: h.x, y: WF.laneY(s, 4) - 12, vx: 0, vy: 60, n: 1, w: 10, pts: 10, lanes: [0], age: 0 });
    for (let i = 0; i < 30; i++) WF.step(s, { targetX: h.x < 112 ? 200 : 20 });
    return { before: v3, after: s.lanes[3].v, crushed: !h.alive };
  };
  const r = trial("reverse");
  assert.ok(r.crushed);
  assert.equal(r.after, -r.before);
  const n = trial("normal");
  assert.ok(n.crushed);
  assert.equal(n.after, n.before);
});

test("the reserve-ship count never goes up when the cannon is destroyed", () => {
  const s = rig([{ lane: 4, x: 20 }]);
  s.player.x = 100;
  s.bombs.push({ id: 9, x: 100, y: 220 });
  const before = WF.reserveShips(s);
  const seen = [];
  for (let i = 0; i < 60 * (CFG.respawnTime + 1); i++) {
    WF.step(s, {});
    seen.push(WF.reserveShips(s));
  }
  assert.ok(seen.every((n) => n <= before), `reserve went above ${before}: ${Math.max(...seen)}`);
  assert.equal(seen[seen.length - 1], before - 1, "one reserve ship came into play");
});

test("extend thresholds: 30000, 100000, 200000, 300000", () => {
  const s = rig([{ lane: 4, x: 20 }]);
  const l0 = s.lives;
  const at = [];
  for (const target of [29999, 30000, 99999, 100000, 199999, 200000, 300000]) {
    s.score = target - 1;
    s.bombs.push({ id: 50 + at.length, x: 100, y: 120 });
    s.player.x = 100;
    s.score = target - 5; // shooting a bomb pays 5
    run(s, 1, (st, i) => ({ fire: i === 0 }));
    at.push(s.lives - l0);
  }
  assert.deepEqual(at, [0, 1, 1, 2, 2, 3, 4]);
});

console.log(`\n${passed} passed`);
