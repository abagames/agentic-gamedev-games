// Mechanic conformance on the rules core (no browser). node tests/rules.cjs
const ZS = require('../core.js'), B = require('../bots.js'), assert = require('node:assert/strict');
const { C, KIND } = ZS; let n = 0;
const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
const play = o => { const st = ZS.newGame(o); st.phase = 'play'; return st; }; // open lead-in, no script yet
const foe = (st, type, x, y, train) => { const K = KIND[type], e = { type, x, y: y == null ? st.ship.y : y, v: K.v, w: K.w, h: K.h, train: train || 0, warn: 0, age: 99 }; st.enemies.push(e); return e; };
const ev = (st, t) => st.events.filter(e => e.type === t);
const NOSE = C.SHIP_X + C.NOSE;

// ---- course ----
const co = ZS.buildCourse(0);
ok('the course is the same every time', ZS.buildCourse(0) === co && JSON.stringify(co.ceil) === JSON.stringify(ZS.buildCourse(1).ceil));
ok('three zones, checkpoint at each start and middle', co.zones.length === 3 && co.cps.length === 6, co.cps);
{
  const tab = B.table(co, 12, 3), alive = co.cps.map((c, i) => { const st = ZS.newGame({ cp: i }); return B.alive(tab, B.kOf(st), B.yOf(st.ship.y), -1); });
  ok('rock alone can be flown from every checkpoint with presses >= 0.2 s apart and a 3 px berth', alive.every(Boolean), alive);
  let bad = 0; for (const e of co.events) if (e.y && e.type !== 'plug' && e.type !== 'capitem' && !ZS.clearRow(co, e.wx - 60, e.wx, e.y, 5)) bad++;
  ok('scripted enemies enter along open rows', bad === 0, { waves: co.events.length });
  ok('gems sit in open space', co.gems.every(g => !ZS.solid(co, g.wx, g.y)) && co.gems.length > 20, co.gems.length);
  ok('trains are 3 long on loop 1, 4 on loop 2, 5 from loop 4', ZS.trainLen(0) === 3 && ZS.trainLen(1) === 4 && ZS.trainLen(3) === 5);
  ok('later loops script more waves', ZS.buildCourse(3).events.length > co.events.length * 1.4, [co.events.length, ZS.buildCourse(3).events.length]);
}
// ---- the one button ----
{
  const st = play(); const y0 = st.ship.y, x0 = st.camX; ZS.step(st, false);
  ok('the ship always moves: up at start', st.ship.y === y0 - C.VY && Math.abs(st.camX - x0 - C.SCROLL) < 1e-9);
  ZS.step(st, true);
  ok('a press turns and fires', st.ship.dir === 1 && st.shot && ev(st, 'shot').length === 1);
  ZS.step(st, true);
  ok('a press while the shot is out only turns', st.ship.dir === -1 && ev(st, 'turn').length === 1 && st.stats.dry === 1 && st.shot.x > NOSE + C.REACH[0]);
  for (let i = 0; i < 40; i++) ZS.step(st, false);
  ok('the shot comes home when it leaves the screen', st.shot === null);
}
{
  const st = play(); foe(st, 'drone', 200); ZS.step(st, true); let k = 0; while (!ev(st, 'kill').length && k++ < 60) ZS.step(st, false);
  ok('far kill: 100, and the energy is home', st.score === 100 && st.shot === null && st.stats.far === 1, { ticks: k });
}
{
  const st = play(); foe(st, 'drone', NOSE + 40); ZS.step(st, true);
  ok('blade cut inside blade range: 300, no projectile, energy home at once', st.score === 300 && st.shot === null && ev(st, 'slash')[0].n === 1 && st.stats.cut === 1);
  foe(st, 'drone', NOSE + 40, st.ship.y); ZS.step(st, true);
  ok('so the very next press can cut again, and a second cutting swing pays double', st.score === 300 + 600 && st.chain === 2);
  ZS.step(st, true); ZS.step(st, true);
  ok('a press while the wave is out is dry but does not touch the chain', st.chain === 2 && st.stats.dry === 1);
}
{
  const st = play(), y = st.ship.y, id = 7; st.trains[id] = { killed: 0, escaped: false, n: 3 };
  for (let k = 0; k < 3; k++) foe(st, 'train', NOSE + 34 + k * ZS.TRAIN_GAP, y, id);
  ZS.step(st, true);
  ok('one swing through a whole train: 300 + 600 + 1200', st.score === 2100 && ev(st, 'slash')[0].n === 3 && st.stats.multi === 1);
  ok('and the last of a whole train drops a capsule', st.items.length === 1 && ev(st, 'capdrop').length === 1);
  st.items[0].x = C.SHIP_X + 4; st.items[0].y = st.ship.y; ZS.step(st, false);
  ok('flying through the capsule raises the laser one level (+300)', st.laser === 1 && st.laserT === C.DECAY[1] && st.score === 2400 && st.items.length === 0);
  const yy = st.ship.y; foe(st, 'drone', NOSE + 85, yy); foe(st, 'shell', NOSE + 150, yy);
  ZS.step(st, true);
  ok('level 1 lengthens the blade to 96 px: a drone at 85 px is a full cut on the chain (300 x2), the shell at 150 is out of reach', st.score === 2400 + 600 && st.chain === 2 && st.enemies.length === 1 && st.enemies[0].type === 'shell' && st.laser === 1 && st.stats.longCuts === 1, [st.score, st.chain, st.enemies.length, st.laser, st.stats.longCuts]);
  st.laser = 3; st.enemies = []; foe(st, 'shell', NOSE + 150, st.ship.y); foe(st, 'drone', NOSE + 120, st.ship.y); const s9 = st.score; ZS.step(st, true);
  ok('level 3 reaches 160 px and cuts armour there: 300 x3 + 500 x2 x3, no level spent', st.score - s9 === 900 + 3000 && st.laser === 3 && st.enemies.length === 0, st.score - s9);
  st.laser = C.LASER_MAX; st.items.push({ type: 'cap', x: C.SHIP_X, y: st.ship.y + st.ship.dir * C.VY }); const s0 = st.score; ZS.step(st, false);
  ok('a capsule on a full stock is 1000', st.score - s0 === 1000 && st.laser === C.LASER_MAX);
}
{
  const st = play(), id = 3; st.trains[id] = { killed: 0, escaped: false, n: 3 };
  foe(st, 'train', NOSE + 10, st.ship.y, id); foe(st, 'train', -11, 40, id).v = 2; foe(st, 'train', NOSE + 28, st.ship.y, id);
  ZS.step(st, false); ZS.step(st, true);
  ok('a train that lost a member off screen drops nothing', st.trains[id].escaped && st.items.length === 0 && st.stats.cut === 2);
}
{
  const st = play(); foe(st, 'shell', 150); ZS.step(st, true); let k = 0; while (!ev(st, 'ping').length && k++ < 60) ZS.step(st, false);
  ok('a shell deflects the far shot', st.score === 0 && st.enemies.length === 1 && st.shot === null && st.stats.pings === 1);
  st.enemies[0].x = NOSE + 40; st.enemies[0].y = st.ship.y; ZS.step(st, true);
  ok('and opens to the blade: 500', st.score === 500 && st.enemies.length === 0);
}
{
  const st = play({ zone: 2 }); // find a wall ahead of the ship's row: it stops the blade, not the wave
  let found = false;
  for (let t = 0; t < 3000 && !found; t++) {
    st.camX += C.SCROLL; const r = ZS.reach(st, NOSE, st.ship.y + st.ship.dir * C.MID, C.W);
    if (r > 8 && r < 30 && !ZS.hitsRock(st.course, st.camX + C.SHIP_X, st.ship.y, 0)) { found = true; foe(st, 'drone', NOSE + r + 70); const s0 = st.score; st.nextEv = 1e9; ZS.step(st, true); ok('rock stops the blade (no cut behind it) but the wave is launched through it', st.score === s0 && st.shot !== null && ev(st, 'spark').some(e => e.own), { rockAt: r });
      let k = 0; while (st.shot && k++ < 10) ZS.step(st, false);
      ok('and the wave kills what is behind the rock', st.score - s0 === 100 && st.stats.far === 1); }
  }
  ok('(a wall was found for that check)', found);
}
// ---- the swing covers the side you are heading for ----
{
  const mk = dy => { const st = play(); foe(st, 'drone', NOSE + 40, st.ship.y + dy); ZS.step(st, true); return st.score; }; // heading up at start
  ok('an enemy 25 px ahead of the heading is cut; 25 px behind is not; 8 px behind still is', mk(-25) === 300 && mk(25) === 0 && mk(8) === 300, [mk(-25), mk(25), mk(8)]);
  const st = play(); foe(st, 'drone', 200, st.ship.y - 28); ZS.step(st, true); let k = 0; while (!ev(st, 'kill').length && k++ < 40) ZS.step(st, false);
  ok('the wave carries the same band down the screen', st.score === 100 && st.shot === null);
}
// ---- entries are announced ----
{
  const st = ZS.newGame(); st.phase = 'play'; st.ship.y = 120; let seen = -1, came = -1;
  for (let t = 0; t < 900 && came < 0; t++) { if (ZS.hitsRock(st.course, st.camX + C.SHIP_X + 4, st.ship.y + st.ship.dir * 12, 0)) st.ship.dir = -st.ship.dir; ZS.step(st, false); if (seen < 0 && st.marks.length) seen = st.t; if (st.enemies.length) came = st.t; if (st.phase !== 'play') break; }
  ok('a marker lights on the row 40 ticks before the enemy enters', seen > 0 && came - seen === C.MARK, { seen, came });
}
// ---- every start and restart opens with a carrier ----
{
  const st = ZS.newGame(); for (let i = 0; i < C.READY; i++) ZS.step(st, false);
  ok('READY ends with a red carrier train announced a little off the ship\'s row', st.phase === 'play' && st.pending.length === 1 && st.pending[0].carrier === true && st.pending[0].type === 'train');
  st.nextEv = 1e9; let y0 = -1, t = 0;
  while (!st.enemies.some(e => e.type === 'train') && t++ < 120 && st.phase === 'play') { if (ZS.hitsRock(st.course, st.camX + C.SHIP_X + 4, st.ship.y + st.ship.dir * 14, 0)) st.ship.dir = -st.ship.dir; const y = st.ship.y; ZS.step(st, false); if (y0 < 0 && st.marks.length) y0 = y; }
  const tr = st.enemies.filter(e => e.type === 'train');
  ok('it arrives within 1.1 s, three red ships, 40 px from where the ship was when it was announced', tr.length === 3 && !tr[0].plain && st.trains[tr[0].train].carrier === true && Math.abs(Math.abs(tr[0].y - y0) - 40) <= 8 && t <= 66, { ticks: t, y: tr[0] && tr[0].y, shipWas: y0 });
  const d = ZS.newGame(); d.phase = 'play'; d.camX = 2000; d.lives = 3; d.ship.y = 20; ZS.step(d, false); for (let i = 0; i < C.DEAD + C.READY_BACK + 1; i++) ZS.step(d, false);
  ok('and the same after a lost ship', d.phase === 'play' && d.pending.some(p => p.gift));
}
// ---- a loaded laser is armour ----
{
  const st = play(); st.laser = 2; st.laserT = 400; foe(st, 'drone', C.SHIP_X + 6, st.ship.y - C.VY); foe(st, 'drone', C.SHIP_X + 30, st.ship.y - C.VY * 8); ZS.step(st, false);
  ok('touching an enemy with laser loaded costs every level instead of the ship', st.phase === 'play' && st.laser === 0 && st.stats.guards === 1 && st.score === 100 && st.guardT === C.GUARD);
  for (let i = 0; i < 12; i++) ZS.step(st, false);
  ok('and the ship rams through whatever else it touches for half a second', st.phase === 'play' && st.laser === 0 && st.stats.rams === 2);
}
// ---- risk that pays ----
{
  const a = play(); foe(a, 'drone', NOSE + 20); ZS.step(a, true);
  ok('a cut within 24 px of the nose pays double and holds the chain half as long again', a.score === 600 && a.stats.closeCuts === 1 && a.chainT >= Math.round(C.CHAIN_T[1] * 1.5) - 1);
  const h = play(); h.chain = 4; h.chainT = 999; h.pending.push({ at: h.t + 1, stage: 1, type: 'drone', spd: 1, y: 60 }); h.nextEv = 1e9; ZS.step(h, false); ZS.step(h, false);
  ok('heat: at x5 a new enemy flies 32 % faster', Math.abs(h.enemies[0].v - ZS.KIND.drone.v * 1.32) < 1e-9);
  const q = ZS.newGame(); q.phase = 'play'; q.ship.y = 120; q.chain = 4; q.chainT = 99999; let extra = 0;
  for (let t = 0; t < 700 && q.phase === 'play'; t++) { if (ZS.hitsRock(q.course, q.camX + C.SHIP_X + 4, q.ship.y + q.ship.dir * 12, 0)) q.ship.dir = -q.ship.dir; ZS.step(q, false); }
  ok('heat: at x4 and x5 every scripted wave draws two aimed drones as well', q.stats.heatDrones >= 2 && q.stats.heatDrones % 2 === 0, q.stats.heatDrones);
}
// ---- chain, laser conditions, lanes, compound waves ----
{
  const st = play(); st.chain = 3; st.chainT = 999; foe(st, 'drone', 200); ZS.step(st, true); let k = 0; while (!ev(st, 'kill').length && k++ < 40) ZS.step(st, false);
  ok('a far kill neither feeds nor breaks the chain', st.chain === 3 && st.score === 100);
  const d = play(); d.chain = 4; d.chainT = 2; d.nextEv = 1e9; ZS.step(d, false); ZS.step(d, false);
  ok('without a cut the chain drops one step at a time: x5 holds 1 s, x4 1.5 s, x3 2 s, x2 2.5 s', d.chain === 3 && d.chainT === C.CHAIN_T[3] && C.CHAIN_T.join() === '0,150,120,90,60' && d.stats.chainDrops === 1);
  const e2 = play(); foe(e2, 'drone', NOSE + 40); ZS.step(e2, true);
  ok('a cutting swing restarts the clock', e2.chain === 1 && e2.chainT >= C.CHAIN_T[1] - 1);
  const b = play(); b.chain = 4; foe(b, 'drone', NOSE + 40); ZS.step(b, true);
  ok('the chain tops out at x5', b.score === 1500 && b.chain === ZS.C.CHAIN_MAX);
}
{
  const b = play(); b.laser = 2; b.laserT = 3; for (let i = 0; i < 3; i++) ZS.step(b, false);
  ok('the laser loses a level when its time runs out: 15 s at level 1, 10 s at 2, 7 s at 3', b.laser === 1 && b.laserT === C.DECAY[1] && b.stats.decays === 1 && C.DECAY.join() === '0,900,600,420');
  const w = play(); w.laser = 1; w.laserT = 400; ZS.step(w, true);
  ok('the wave leaves from the tip of the lengthened blade', w.shot && Math.abs(w.shot.x - (NOSE + C.REACH[1] + C.SHOT_V)) < 0.01, w.shot && w.shot.x);
}
{
  const plugs = co.events.filter(e => e.type === 'plug'), caps = co.events.filter(e => e.type === 'capitem');
  ok('every fortress island has a sealed lane with gems and a capsule behind the seal', plugs.length >= 2 && plugs.length === caps.length && plugs.every((p, i) => caps[i].wx > p.wx && caps[i].y === p.y && co.gems.filter(g => g.wx > p.wx && g.wx < caps[i].wx && Math.abs(g.y - p.y) <= 10).length === 4), plugs.length);
  const st = play(); st.camX = plugs[0].wx - C.W - 20; st.nextEv = co.events.indexOf(plugs[0]); st.ship.y = plugs[0].y; ZS.step(st, false);
  const pl = st.enemies.find(e => e.type === 'plug');
  ok('the seal scrolls with the rock', !!pl && Math.abs((pl.x + st.camX) - plugs[0].wx) < 2);
  const move = x => { st.camX += pl.x - x; pl.x = x; }; st.enemies = [pl]; st.nextEv = 1e9; move(135); st.ship.y = pl.y; ZS.step(st, true); let k = 0; while (!ev(st, 'ping').length && k++ < 40) ZS.step(st, false);
  ok('the wave bounces off a seal', st.enemies.length === 1 && st.stats.pings === 1);
  move(NOSE + 40); st.ship.y = pl.y; const s0 = st.score; ZS.step(st, true);
  ok('the blade opens it: 500', st.score - s0 === 500 && st.enemies.length === 0);
  const cv = ZS.buildCourse(0).events.filter(e => e.type === 'convoy');
  ok('compound waves are scripted (convoys; pincers as two trains at one column)', cv.length >= 2 && co.events.some((e, i) => i && e.type === 'train' && co.events[i - 1].type === 'train' && co.events[i - 1].wx === e.wx), cv.length);
  const c = play(); c.pending.push({ at: c.t + 1, stage: 1, type: 'convoy', spd: 1, y: c.ship.y, n: 3 }); c.nextEv = 1e9; ZS.step(c, false); ZS.step(c, false);
  ok('a convoy is a shell leading a train at one speed', c.enemies.length === 4 && c.enemies[0].type === 'shell' && c.enemies[0].v === c.enemies[1].v && c.enemies[1].x - c.enemies[0].x === 26, c.enemies.map(e => e.type[0] + Math.round(e.x)));
}
// ---- what the items are worth ----
{
  const tr = co.events.filter(e => e.type === 'train'), cv = co.events.filter(e => e.type === 'convoy');
  const all = tr.concat(cv), car = all.filter(e => e.carrier).length;
  ok('about one train in four (convoys included) is a red carrier', car >= all.length * 0.18 && car <= all.length * 0.3, [car, all.length]);
  const st = play(); st.trains[9] = { killed: 0, escaped: false, n: 3, carrier: false }; for (let k = 0; k < 3; k++) foe(st, 'train', NOSE + 34 + k * 18, st.ship.y, 9); ZS.step(st, true);
  ok('a plain train is worth its cuts but drops nothing', st.score === 2100 && st.items.length === 0);
  const g = play(); g.nextEv = 1e9; g.laser = 2; g.laserT = 10; g.chain = 2; g.chainT = 99; const gm = co.gems[0]; g.camX = gm.wx - C.SHIP_X - 2; g.ship.y = gm.y; g.ship.dir = 1; g.nextGem = 0; ZS.step(g, false);
  ok('a gem winds the laser clock back up and scores on the cut chain (100 x3)', g.laserT === C.DECAY[2] && g.score === 300 && g.laser === 2);
  const b = play(); b.items.push({ type: 'cap', x: C.SHIP_X, y: b.ship.y - C.VY, big: true }); ZS.step(b, false);
  ok('the sealed lane capsule gives top laser level and a full chain at once', b.laser === C.LASER_MAX && b.chain === C.CHAIN_MAX && b.score === 1000);
  const p = play(), K = ZS.KIND.plug; p.enemies.push({ type: 'plug', x: NOSE + 40, y: p.ship.y - 45, v: K.v, w: K.w, h: K.h, train: 0, warn: 0, age: 99 }); ZS.step(p, true);
  const fz = co.zones[2], fg = co.gems.filter(q => q.wx >= fz.c0 * 8 && q.wx < fz.c1 * 8);
  ok('fortress gems sit on the flight line: each has 20 px of open space above and below', fg.length >= 20 && fg.every(q => ZS.clearRow(co, q.wx - 4, q.wx + 4, q.y, 20)), fg.length);
  ok('a seal cannot be opened from outside its lane', p.enemies.length === 1 && p.score === 0);
}
// ---- gems ----
{
  const st = play(); st.nextEv = 1e9; const g = co.gems;
  const fly = i => { st.camX = g[i].wx - C.SHIP_X - 2; st.ship.y = g[i].y; st.ship.dir = 1; st.nextGem = Math.min(st.nextGem, i); ZS.step(st, false); };
  fly(0); const a = st.score; fly(1); const b = st.score - a;
  ok('gems chain: 100 then 200', a === 100 && b === 200 && st.gemChain === 2);
  st.camX = g[2].wx + 20; st.ship.y = ZS.gapMid(co, Math.floor((st.camX + C.SHIP_X) / 8)); ZS.step(st, false);
  ok('a gem that scrolls away breaks the chain', st.gemChain === 0);
}
// ---- failure, restart, progress ----
{
  const st = ZS.newGame(); let t = 0; while (st.phase !== 'over' && t++ < 5000) ZS.step(st, false);
  ok('never pressing: three ships lost on rock, no score', st.phase === 'over' && st.score === 0 && st.stats.deathBy.rock === 3, { ticks: t });
  ZS.step(st, true); ok('nothing happens after game over', st.phase === 'over');
}
{
  const st = play(); foe(st, 'drone', C.SHIP_X + 6, st.ship.y - C.VY); ZS.step(st, false);
  ok('touching an enemy loses the ship', st.phase === 'dead' && st.lives === 2 && st.stats.deathBy.drone === 1);
  for (let i = 0; i < C.DEAD; i++) ZS.step(st, false);
  st.laser = 0; ok('then READY at the checkpoint, laser gone, screen empty', st.phase === 'ready' && st.laser === 0 && st.enemies.length === 0 && st.cp === 0);
  for (let i = 0; i < C.READY_BACK; i++) ZS.step(st, true);
  ok('READY ignores the button and hands over to play', st.phase === 'play' && st.stats.presses === 0);
}
{
  const st = play(); st.nextEv = 1e9; st.camX = co.zones[0].c1 * 8 - C.SHIP_X + 20; st.zone = 1; st.score = 0; ZS.rewind(st); st.phase = 'play'; st.ship.y = ZS.openRun(co, Math.floor((st.camX + C.SHIP_X) / 8))[1];
  for (let i = 0; i < 200 && st.phase === 'play'; i++) { if (ZS.hitsRock(co, st.camX + C.SHIP_X + 4, st.ship.y + st.ship.dir * 14, 0)) st.ship.dir = -st.ship.dir; ZS.step(st, false); }
  ok('a ship set back across a zone line is not paid the zone bonus twice', st.score < 10000 && st.zone === 1, st.score);
}
{ // a lost ship is set back about two seconds, to a roomy spot, never to the start of the zone
  let worst = 0, tight = 0, n = 0;
  for (let cam = 700; cam < co.end * 8 - 300; cam += 97) {
    const st = play(); st.camX = cam; st.lives = 3; ZS.rewind(st); n++;
    const back = cam - st.camX; worst = Math.max(worst, back);
    if (!ZS.clearRow(co, st.camX + C.SHIP_X - 12, st.camX + C.SHIP_X + 80, st.ship.y, 36)) tight++;
  }
  ok('anywhere on the course: back by 2 s, at most ' + worst + ' px, with 36 px of room above and below for the first second', worst >= C.BACKUP && worst < 420 && tight === 0, { places: n, worst, tight });
}
{
  const st = play(), e = foe(st, 'rusher', 0, st.ship.y - C.VY); e.warn = 20; e.x = C.SHIP_X; ZS.step(st, false);
  ok('a rusher still blinking at the edge cannot be hit or hit you', st.phase === 'play' && st.enemies[0].x === C.W - 6);
}
{
  const st = play(); st.camX = co.zones[0].c1 * 8 - C.SHIP_X - 1; st.ship.y = 120; st.nextEv = 1e9; ZS.step(st, false); ZS.step(st, false);
  ok('leaving a zone without having lost a ship in it pays 10000 x5', st.zone === 1 && st.score === C.ZONE_BONUS * C.NO_MISS && st.stats.noMiss === 1);
  { const q = play(); q.zoneLost = 1; q.camX = co.zones[0].c1 * 8 - C.SHIP_X - 1; q.ship.y = 120; q.nextEv = 1e9; co.gems.forEach((g, i) => { if (g.zone === 0) q.gemTaken[i] = 1; }); ZS.step(q, false); ZS.step(q, false);
    ok('with a ship lost it pays 10000; every gem of the zone adds 100000', q.score === C.ZONE_BONUS + C.GEM_PERFECT && q.stats.gemPerfect === 1 && q.zoneLost === 0, q.score); }
  // ---- the gate ----
  const B = C.BOSS, fly = () => { if (ZS.hitsRock(co, st.camX + C.SHIP_X + 4, st.ship.y + st.ship.dir * 16, 0)) st.ship.dir = -st.ship.dir; ZS.step(st, false); };
  st.camX = (co.end + 6) * 8 - C.SHIP_X - 1; st.zone = 2; st.ship.y = 120; fly(); fly();
  ok('past the fortress the gate arrives instead of the loop ending', st.phase === 'play' && !!st.boss && st.boss.hp === B.HP && st.boss.plates.length === 5);
  let t = 0; while (!st.enemies.some(e => e.type === 'plate') && t++ < 400) fly();
  const pl = st.enemies.find(e => e.type === 'plate');
  ok('it throws two of its own plates along the rows nearest the ship, with one escort of drones: nothing else, no bullets', !!pl && st.boss.plates[pl.plate].s === 'fly' && st.enemies.filter(e => e.type === 'plate').length === 2 && st.enemies.filter(e => e.type === 'drone').length === C.BOSS.ESCORT && st.enemies.every(e => e.type === 'plate' || e.type === 'drone'), { ticks: t });
  // a wave against a closed row is stopped; the wave is the only thing the closed gate stops
  st.enemies = []; st.boss.plates.forEach(p => { p.s = 'on'; }); st.boss.launchT = 999; st.ship.y = ZS.rowY(2); st.ship.dir = -1; ZS.step(st, true); t = 0; while (st.shot && t++ < 40) ZS.step(st, false);
  ok('a closed plate stops the wave', st.boss.hp === B.HP && st.stats.bossHits === 0 && st.stats.pings >= 1);
  // cut a thrown plate: its row opens
  const K = ZS.KIND.plate; st.ship.y = ZS.rowY(2); st.boss.plates[2].s = 'fly'; st.enemies = [{ type: 'plate', x: NOSE + 40, y: ZS.rowY(2), v: K.v, w: K.w, h: K.h, train: 0, warn: 0, age: 99, plate: 2 }]; st.chain = 0; const s1 = st.score; ZS.step(st, true);
  ok('cutting the plate (500) opens its row of the core', st.score - s1 === 500 && st.boss.plates[2].s === 'open' && st.stats.plates === 1);
  st.ship.y = ZS.rowY(2) + 10; st.ship.dir = -1; st.boss.emitT = 999; ZS.step(st, true); t = 0; while (st.shot && t++ < 40) ZS.step(st, false);
  { const q = ZS.clone(st), D = ZS.KIND.drone; q.enemies = [{ type: 'drone', x: NOSE + 16, y: q.ship.y, v: D.v, w: D.w, h: D.h, train: 0, warn: 0, age: 99, gate: true }, { type: 'drone', x: NOSE + 34, y: q.ship.y, v: D.v, w: D.w, h: D.h, train: 0, warn: 0, age: 99, gate: true }]; q.chain = 4; q.chainT = 99; q.shot = null; const s0 = q.score; ZS.step(q, true);
    ok('what the gate sends out pays plain value: no chain, no point-blank double, no doubling (300 + 300 at x5)', q.score - s0 === 600, q.score - s0);
    ok('so a second left on the clock (5000) is worth more than anything that can be cut in it', C.GATE_SEC === 5000); }
  ok('a wave into the open row hurts the core by one', st.boss.hp === B.HP - 1 && st.stats.bossHits === 1 && st.boss.plates[2].s === 'open');
  { const q = ZS.clone(st); q.boss.plates[0].s = 'open'; q.boss.plates[0].t = 200; q.boss.plates[4].s = 'open'; q.boss.plates[4].t = 200; q.ship.y = ZS.rowY(2) + 10; q.ship.dir = -1; const s0 = q.score; ZS.step(q, true); let k = 0; while (q.shot && k++ < 40) ZS.step(q, false);
    ok('with three rows open the same hit pays three times', q.score - s0 === 600, q.score - s0);
    q.boss.hp = Math.floor(q.boss.hp0 / 2); q.boss.launchT = 1; q.enemies = []; q.boss.plates.forEach(p => { if (p.s !== 'open') p.s = 'on'; }); ZS.step(q, false); ZS.step(q, false);
    ok('below half strength the gate goes into overdrive: plates come 40 % sooner', q.boss.over === true && q.boss.launchT <= Math.round(B.LAUNCH * 0.6)); }
  st.laser = 3; st.laserT = 400; st.ship.y = ZS.rowY(2) + 10; st.ship.dir = -1; st.chain = 0; const s2 = st.score; ZS.step(st, true);
  ok('at laser level 3 the blade reaches the core: three damage, 1000, and the row slams shut', st.boss.hp === B.HP - 4 && st.score - s2 === 1000 && st.boss.plates[2].s === 'on' && st.chain === 1);
  st.boss.plates[1].s = 'fly'; st.enemies = [{ type: 'plate', x: -11, y: ZS.rowY(1), v: K.v, w: K.w, h: K.h, train: 0, warn: 0, age: 99, plate: 1 }]; st.ship.y = 180; ZS.step(st, false);
  ok('a plate that gets past returns to the gate', st.boss.plates[1].s === 'on' && st.enemies.length === 0);
  { const q = ZS.clone(st); q.boss.left = 2; q.boss.launchT = 999; q.boss.emitT = 999; q.boss.plates[2].s = 'open'; q.boss.plates[2].t = 999; q.enemies = []; q.ship.y = ZS.rowY(2) + 10; q.ship.dir = -1; ZS.step(q, false); ZS.step(q, false);
    ok('at zero the gate shuts its plates and starts to pull away', q.phase === 'play' && q.boss.leaving > 0 && q.boss.plates.every(p => p.s === 'on') && ev(q, 'bossaway').length === 1 && C.BOSS.TIME === 4500);
    const hp = q.boss.hp, x0 = q.boss.x, sc = q.score; ZS.step(q, true); let k = 0; while (q.shot && k++ < 30) ZS.step(q, false);
    ok('nothing hurts it while it leaves', q.boss.hp === hp && q.boss.x > x0);
    k = 0; while (q.phase === 'play' && k++ < 200) { if (ZS.hitsRock(q.course, q.camX + C.SHIP_X + 4, q.ship.y + q.ship.dir * 16, 0)) q.ship.dir = -q.ship.dir; ZS.step(q, false); }
    ok('when it is off the screen the loop ends with no bonus', q.phase === 'clear' && q.won === false && q.score === sc && q.boss.x > C.W - 10, { x: Math.round(q.boss.x), ticks: k }); }
  st.boss.plates[2].s = 'open'; st.boss.plates[2].t = 200; st.boss.hp = 1; st.boss.left = 60 * 20 + 5; st.laser = 0; st.score = C.EXTEND[0] - 100; st.ship.y = ZS.rowY(2) + 10; st.ship.dir = -1; ZS.step(st, true); t = 0; while (st.phase === 'play' && t++ < 40) ZS.step(st, false);
  ok('the last hit destroys the gate: gate bonus, 5000 for every second left on it, loop bonus, and an extend when the score crosses the first threshold', st.phase === 'clear' && st.won === true && st.score - (C.EXTEND[0] - 100 + 200 + C.BOSS_BONUS + C.LOOP_BONUS) >= 19 * C.GATE_SEC && st.score - (C.EXTEND[0] - 100 + 200 + C.BOSS_BONUS + C.LOOP_BONUS) <= 20 * C.GATE_SEC && st.lives === C.LIVES + 1 && st.stats.loops === 1 && !st.final, st.score);
  ok('extra ships at 200000, 600000, 1400000 and 3000000, and no more', C.EXTEND.join() === '200000,600000,1400000,3000000' && st.nextExtend === 600000, st.nextExtend);
  { const q = ZS.newGame(); q.phase = 'play'; q.nextEv = 1e9; q.pending.push({ at: q.t + 1, stage: 1, type: 'drone', spd: 1, y: q.ship.y - 20 }); q.score = 9999900; q.extends = 0; q.nextExtend = C.EXTEND[0];
    ZS.step(q, false); ZS.step(q, false); q.enemies[0].x = NOSE + 40; q.enemies[0].y = q.ship.y - 10; ZS.step(q, true);
    ok('even ten million points earn only the four', q.lives === C.LIVES + 4 && q.extends === 4 && q.nextExtend === Infinity, [q.lives, q.nextExtend]); }
  for (let i = 0; i < C.CLEAR; i++) ZS.step(st, false);
  ok('then the next loop starts at READY on the first zone, without the gate', st.phase === 'ready' && st.loop === 1 && st.zone === 0 && st.cp === 0 && st.boss === null);
  // the second loop is the last
  st.phase = 'play'; st.boss = ZS.newBoss(st); st.boss.x = B.FACE; st.boss.hp = 1; st.boss.plates[2].s = 'open'; st.boss.plates[2].t = 200; st.boss.launchT = 999; st.boss.emitT = 999; st.camX = (st.course.end + 8) * 8; st.nextEv = 1e9; st.enemies = []; st.ship.y = ZS.rowY(2) + 10; st.ship.dir = -1; st.lives = 2; const s3 = st.score;
  ZS.step(st, true); t = 0; while (st.phase === 'play' && t++ < 40) ZS.step(st, false);
  ok('destroying the second gate clears the game; the ships are not paid yet', st.final === true && st.cleared === true && ev(st, 'allclear')[0].ships === st.lives && st.tally === st.lives && st.lives >= 2, st.lives);
  const ships = st.lives, s4 = st.score; let paid = 0, seq = [];
  for (let i = 0; i <= C.CLEAR + ships * 26 + 120 && st.phase !== 'over'; i++) { ZS.step(st, false); for (const e of st.events) if (e.type === 'shipbonus') { paid++; seq.push(st.lives); } }
  ok('then every ship left is counted off one at a time for 50000', paid === ships && st.score - s4 === ships * C.SHIP_BONUS && st.lives === 0 && seq.join() === Array.from({ length: ships }, (_, k) => ships - 1 - k).join(), { ships, seq });
  ok('and the game ends there', st.phase === 'over' && st.loop === 1 && C.LOOPS === 2);
}
{
  const a = play(); foe(a, 'drone', 160); const b = ZS.clone(a); ZS.step(b, true); for (let i = 0; i < 30; i++) ZS.step(b, false);
  ok('clone is independent', a.enemies.length === 1 && a.score === 0 && a.t === 0 && b.score === 100);
}
// ---- monotonous play loses ----
{
  const mono = { idle: B.simple.idle(), mash6: B.simple.mash(6), mash12: B.simple.mash(12), mash30: B.simple.mash(30), survivor: B.simple.survivor(), shooter: B.simple.shooter() };
  const res = {}; for (const k in mono) res[k] = B.run(mono[k], { loops: 1 });
  const best = Math.max(...Object.values(res).map(r => r.score));
  const hs = [1, 2, 3, 4].map(s => B.run(B.human(s), { loops: 1 })), hm = hs.reduce((a, r) => a + r.score, 0) / hs.length;
  ok('idle, mashing and rock-only flying never leave the first zone', Object.entries(res).every(([k, r]) => k === 'shooter' || r.zones === 0), Object.fromEntries(Object.entries(res).map(([k, r]) => [k, r.score])));
  ok('and score far below the human-limited player', best < hm * 0.3, { bestMono: best, human: Math.round(hm) });
  ok('the human-limited player presses no faster than 9 ticks apart', Math.min(...hs.map(r => r.minGap)) >= 9, hs.map(r => r.perSec.toFixed(2)));
}
console.log(n + ' checks passed');
