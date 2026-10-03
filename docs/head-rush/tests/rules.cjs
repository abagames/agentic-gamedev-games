// Mechanic conformance probes on the deterministic core. node tests/rules.cjs
const HR = require('../core.js'), assert = require('node:assert/strict');
const { C, RINGS } = HR;
let n = 0; const ok = (name, cond, info) => { assert.ok(cond, name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };

function playState(seed) { const st = HR.create(seed || 1); st.phase = 'play'; st.first = false; return st; }
function clearRivals(st) { st.leader = null; st.followers = []; st.dormant = []; st.flying = []; st.returning = []; st.leaderWait = -1e9; }
function run(st, n, inp) { for (let i = 0; i < n; i++) HR.step(st, typeof inp === 'function' ? inp(i, st) : inp || {}); }
function placeBefore(p, r, k, dist) { p.r = r; p.s = HR.wrap(2 * RINGS[r] * k - dist, r); p.zk = -1; p.can = false; p.slT = 0; }

// --- lane shifting ---
{
  const st = playState(); clearRivals(st); placeBefore(st.player, 0, 3, 30);
  run(st, 5, {}); run(st, 1, { in: true }); run(st, 60, {});
  ok('tapped turn is buffered and taken at the next gap', st.player.r === 1, st.player.r);
  const s2 = playState(); clearRivals(s2); placeBefore(s2.player, 0, 3, 150); run(s2, 1, { in: true }); run(s2, 100, {});
  ok('an early tap is still taken at the next gap', s2.player.r === 1, s2.player.r);
  const s2b = playState(); clearRivals(s2b); placeBefore(s2b.player, 0, 3, 30); run(s2b, 1, { out: true }); run(s2b, 200, {});
  ok('a queued turn that cannot be used at its gap is discarded, not carried', s2b.player.r === 0 && s2b.player.req === 0, s2b.player.r);
  const s2c = playState(); clearRivals(s2c); placeBefore(s2c.player, 0, 3, 30); run(s2c, 1, { in: true }); run(s2c, 1, { in: true }); run(s2c, 60, {});
  ok('repeated taps do not stack: one tap, one lane', s2c.player.r === 1, s2c.player.r);
  const s3 = playState(); clearRivals(s3); placeBefore(s3.player, 0, 3, 30); run(s3, 60, { inHeld: true });
  ok('holding "in" at base speed crosses two lanes in one gap, and no more', s3.player.r === 2, s3.player.r);
  const s3c = playState(); clearRivals(s3c); placeBefore(s3c.player, 0, 3, 30); let lanesAtExit = -1, seenZ = false;
  for (let i = 0; i < 200 && lanesAtExit < 0; i++) { HR.step(s3c, { inHeld: true }); const inz = Math.abs(HR.gapOf(s3c.player.r, s3c.player.s).o) < C.GAPW; if (inz) seenZ = true; else if (seenZ) lanesAtExit = s3c.player.r; }
  ok('a slow car holding the key leaves the gap exactly two lanes over', lanesAtExit === 2, lanesAtExit);
  const s3s = playState(); clearRivals(s3s); placeBefore(s3s.player, 0, 3, 16); run(s3s, 3, {}); run(s3s, 9, { inHeld: true }); run(s3s, 40, {});
  ok('a normal-length press made right at the gap moves only one lane', s3s.player.r === 1, s3s.player.r);
  const s3h = playState(); clearRivals(s3h); placeBefore(s3h.player, 0, 3, 12); run(s3h, 40, { inHeld: true });
  ok('holding that starts only at the gap edge gets at most two lanes', s3h.player.r <= 2, s3h.player.r);
  const s3b = playState(); clearRivals(s3b); s3b.tier = 10; placeBefore(s3b.player, 0, 3, 70); run(s3b, 30, { inHeld: true });
  ok('at top speed tier holding crosses two lanes', s3b.player.r === 2, s3b.player.r);
  const s4 = playState(); clearRivals(s4); placeBefore(s4.player, 0, 3, 30); run(s4, 40, { inHeld: true, boost: true });
  ok('full throttle crosses only one lane', s4.player.r === 1, s4.player.r);
  const s5 = playState(); clearRivals(s5); placeBefore(s5.player, 0, 3, 40); run(s5, 60, (i, st) => ({ inHeld: true, boost: i < 6 }));
  ok('letting go of the throttle before the gap allows the full two-lane crossing', s5.player.r === 2, s5.player.r);
  const s6 = playState(); clearRivals(s6); placeBefore(s6.player, 4, 0, 30); run(s6, 60, { inHeld: true });
  ok('innermost lane cannot turn further in', s6.player.r === 4);
}
// --- rival lane logic ---
{
  const st = playState(); clearRivals(st); st.dormant = [];
  st.player.r = 3; st.player.s = 4 * RINGS[3] + 10; // bottom of lane 3, far away
  st.seed = 7; const agg0 = C.AGG0; C.AGG0 = 1;
  st.leader = { id: 99, r: 0, s: HR.wrap(2 * RINGS[0] * 1 + 60, 0), zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; // before left gap (moving cw = decreasing s)
  run(st, 60, {});
  ok('rival turns one lane toward your lane at a gap', st.leader.r === 1, st.leader.r);
  st.fright = 300; st.leader.s = HR.wrap(2 * RINGS[1] * 0 + 60, 1); st.leader.zk = -1; st.leader.locked = false; st.player.r = 2; st.player.s = 4 * RINGS[2] + 10;
  run(st, 110, {});
  ok('frightened rival turns away from your lane', st.leader.r === 0, st.leader.r);
  C.AGG0 = agg0;
}
// --- head-on, power, chain ---
function headOn(fright, followers) {
  const st = playState(); clearRivals(st);
  st.player.r = 0; st.player.s = HR.wrap(-2 * RINGS[0] + 20, 0); // right side, moving up
  const ls = HR.wrap(-2 * RINGS[0] + 90, 0);
  st.leader = { id: 50, r: 0, s: ls, zk: -1, can: false, slT: 0, slx: 0, sly: 0 };
  st.trail = []; st.trailD = 0; for (let i = 30; i >= 0; i--) { const s = ls + i * 4; const [x, y] = HR.pos(0, s); st.trail.push({ d: -i * 4, x, y, r: 0, s }); }
  for (let i = 0; i < followers; i++) st.followers.push({ id: 60 + i, lag: C.FOLLOW * (i + 1) });
  st.fright = fright;
  return st;
}
{
  const st = headOn(0, 0); let crashed = false; for (let i = 0; i < 60 && !crashed; i++) { HR.step(st, {}); crashed = st.phase === 'crash'; }
  ok('head-on in the same lane crashes', crashed);
  const t0 = st.timeLeft; run(st, C.CRASH + C.READY + 1, {});
  ok('speed tier and speed stay finite through a crash', Number.isFinite(st.tier) && Number.isFinite(HR.speed(st)), st.tier);
  ok('crash costs clock time and resets the field', st.phase === 'play' && t0 - st.timeLeft >= C.CRASH + C.READY, t0 - st.timeLeft);
  const e = headOn(400, 3); const pts = [];
  for (let i = 0; i < 120; i++) { HR.step(e, {}); for (const ev of e.events) if (ev.type === 'eat') pts.push(ev.pts); }
  ok('powered head-on eats the whole convoy with doubling chain', JSON.stringify(pts) === JSON.stringify([200, 400, 800, 1600]), pts);
  ok('eating the leader promotes the next car (no crash during chain)', e.phase === 'play' && e.stats.crashes === 0);
  ok('eating the whole convoy ends the power at once', e.fright === 0, e.fright);
  run(e, C.RETURN + 5, {}); ok('eaten cars return to parked spots later', e.dormant.length + (e.leader ? 1 : 0) + e.flying.length + e.returning.length === 4 && e.returning.length === 0, { d: e.dormant.length, r: e.returning.length, f: e.flying.length, l: !!e.leader });
}
// --- parked cars / convoy growth ---
{
  const st = headOn(0, 0); st.leader.r = 4; st.leader.s = 10; st.trail.forEach(t => { t.r = 4; });
  const sp = HR.spotPos(0); st.dormant = [{ id: 70, spot: 0 }]; placeBefore(st.player, sp.r, 0, 0); st.player.s = HR.wrap(sp.s - 20, sp.r);
  run(st, 20, {});
  ok('driving over a parked car wakes it', st.dormant.length === 0 && st.stats.wakes === 1);
  run(st, C.FLY + 2, {});
  ok('woken car joins the convoy tail', st.followers.length === 1, st.followers.length);
  const s2 = playState(); clearRivals(s2); s2.leaderWait = 0; s2.dormant = [{ id: 71, spot: 0 }]; s2.player.r = sp.r; s2.player.s = HR.wrap(sp.s - 20, sp.r);
  let crashed = false; for (let i = 0; i < 90; i++) { HR.step(s2, {}); crashed = crashed || s2.phase === 'crash'; }
  ok('waking a car with no convoy never spawns it on you', !crashed && (s2.leader || s2.dormant.length === 1));
}
// --- half clear, flag, refill ---
{
  const st = playState(); clearRivals(st);
  HR.DOTS.dots.forEach((d, i) => { if (d.half === 0 && !d.power) st.dots[i] = false; });
  const last = HR.DOTS.dots.findIndex(d => d.half === 0 && !d.power && d.r === 0);
  st.dots[last] = true; const d = HR.DOTS.dots[last]; st.player.r = 0; st.player.s = HR.wrap(d.s - 12, 0);
  run(st, 20, {});
  ok('clearing a half raises a flag on the other half', st.items.length === 1 && st.items[0].half === 0 && HR.pos(st.items[0].r, st.items[0].s)[0] > HR.CX, st.items);
  const it = st.items[0], tier0 = st.tier, cars0 = st.carsTotal;
  st.player.r = it.r; st.player.s = HR.wrap(it.s - 15, it.r); run(st, 20, {});
  ok('flag refills the cleared half, speeds up, adds a parked car', st.items.length === 0 && HR.dotsLeft(st, 0) > 50 && st.tier === tier0 + 1 && st.carsTotal === cars0 + 1, { tier: st.tier, left: HR.dotsLeft(st, 0) });
  ok('speed rises with tier', HR.speed(st) > C.SPEED0);
  ok('top speed is reached at tier 7 (1.77x the start, about 204 px/s)', C.TIER_MAX === 7 && Math.abs(HR.speed({ tier: C.TIER_MAX }) / C.SPEED0 - 1.77) < 1e-9 && Math.abs(HR.speed({ tier: C.TIER_MAX }) - 203.55) < 0.01);
  { const c = playState(); c.grace = 0; ok('a crash and the restart cost about 1.25 s of clock in all', (C.CRASH + C.READY) / 60 <= 1.3 && C.READY0 / 60 <= 1.5); }
}
// --- clock ---
{
  const st = HR.create(3); const t0 = st.timeLeft; run(st, C.READY0 - 1, {});
  ok('opening READY does not consume the clock', st.timeLeft === t0);
  st.timeLeft = 2; run(st, 5, {}); ok('clock expiry ends the run', st.phase === 'over');
}
// --- courses ---
function courseState(c) { const st = HR.create(1, { course: c }); st.phase = 'play'; st.first = false; clearRivals(st); return st; }
function before(st, r, k, dist) { const p = st.player; p.r = r; p.s = HR.wrap(HR.gapS(r, k) - dist, r); p.zk = -1; p.can = false; p.slT = 0; }
{
  // UNDERTOW: the top/bottom entrance gaps only go in; the side gaps go both ways
  let st = courseState(2); before(st, 1, 0, 30); run(st, 60, { outHeld: true });
  ok('one-way (inward) gap refuses an outward turn', st.player.r === 1, st.player.r);
  st = courseState(2); before(st, 1, 0, 30); run(st, 1, { in: true }); run(st, 60, {});
  ok('one-way (inward) gap takes an inward turn', st.player.r === 2, st.player.r);
  st = courseState(2); before(st, 2, 1, 30); run(st, 1, { in: true }); run(st, 60, {});
  ok('UNDERTOW side gap is two-way (in)', st.player.r === 3, st.player.r);
  st = courseState(2); before(st, 2, 1, 30); run(st, 1, { out: true }); run(st, 60, {});
  ok('UNDERTOW side gap is two-way (out)', st.player.r === 1, st.player.r);
  st = courseState(3); before(st, 1, HR.findGap(0, 0), 30); run(st, 60, { inHeld: true });
  ok('LONG STRAIGHT entrance gap does not serve the outer lanes', st.player.r === 1, st.player.r);
  st = courseState(3); before(st, 2, HR.findGap(0, 0), 30); run(st, 1, { in: true }); run(st, 60, {});
  ok('LONG STRAIGHT entrance gap serves the inner lanes', st.player.r === 3, st.player.r);
  // the rival obeys the same arrows: player outside it at a top gap cannot be followed outward
  st = courseState(2); const aggU = C.AGG0; C.AGG0 = 1; st.player.r = 0; st.player.s = HR.wrap(HR.gapS(0, 2) + 10, 0);
  st.leader = { id: 99, r: 2, s: HR.wrap(HR.gapS(2, 0) + 60, 2), zk: -1, can: false, slT: 0, slx: 0, sly: 0 };
  run(st, 60, {}); ok('rival cannot turn against a one-way gap', st.leader.r === 2, st.leader.r);
  C.AGG0 = aggU;
  // TWIN GATES: the off-centre gaps stop short of the inner lane
  st = courseState(1); before(st, 3, HR.findGap(0, -36), 30); run(st, 32, { inHeld: true });
  ok('partial gap does not reach the innermost lane', st.player.r === 3, st.player.r);
  st = courseState(1); before(st, 3, HR.findGap(1, 0), 30); run(st, 60, { inHeld: true });
  ok('full side gap does reach it', st.player.r === 4, st.player.r);
  ok('no dot sits inside a wall opening (gap centre ±12 px plus dot size)', HR.COURSES.every((_, c) => { const g = HR.geo(c); return g.dots.every(d => g.ring[d.r].every(e => { const P = 4 * g.hw[d.r] + 4 * g.hh[d.r]; let o = Math.abs(d.s - e.s); o = Math.min(o, P - o); return o >= 14; })); }));
  ok('every course has dots on both halves and parking spots', HR.COURSES.every((_, c) => { const g = HR.geo(c); return g.dots.some(d => d.half === 0) && g.dots.some(d => d.half === 1) && g.spots.length >= 8 && g.dots.filter(d => d.power).length === 2; }));
}
// --- cruiser ---
{
  const st = playState(); clearRivals(st); st.tier = 3; st.player.r = 0; st.player.s = HR.gapS(0, 2) + 12;
  run(st, 70, {});
  ok('a cruiser joins at speed tier 3, off the player lane', st.cruisers.length === 1 && st.cruisers[0].r !== 0, st.cruisers);
  const r0 = st.cruisers[0].r; run(st, 600, (i, s) => ({ inHeld: false })); ok('cruiser never changes lane', st.cruisers.length === 0 || st.cruisers[0].r === r0 || st.phase !== 'play');
  const h = playState(); clearRivals(h); h.player.r = 2; h.player.s = HR.wrap(HR.gapS(2, 3) + 12, 2);
  h.cruisers = [{ id: 80, r: 2, s: HR.wrap(h.player.s + 60, 2) }]; let crashed = false; for (let i = 0; i < 40; i++) { HR.step(h, {}); crashed = crashed || h.phase === 'crash'; }
  ok('head-on with a cruiser crashes', crashed);
  const e = playState(); clearRivals(e); e.fright = 200; e.player.r = 2; e.player.s = HR.wrap(HR.gapS(2, 3) + 12, 2);
  e.cruisers = [{ id: 81, r: 2, s: HR.wrap(e.player.s + 60, 2) }]; e.leader = { id: 82, r: 4, s: 30, zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; e.trail = [{ d: -200, x: 0, y: 0, r: 4, s: 30 }, { d: 0, x: 0, y: 0, r: 4, s: 30 }]; run(e, 40, {});
  ok('powered head-on eats a cruiser for no points', e.cruisers.length === 0 && e.stats.truckEats === 1 && e.stats.chainScore === 0 && e.phase === 'play', e.stats.chainScore);
}
{
  // a truck still on the road keeps the power alive after the last red car is eaten
  const e = headOn(400, 3); const far = (e.player.r + 2) % HR.NR; e.cruisers = [{ id: 83, r: far, s: 0 }];
  let eats = 0; for (let i = 0; i < 120 && eats < 4; i++) { HR.step(e, {}); eats += e.events.filter(v => v.type === 'eat').length; }
  ok('a remaining truck keeps the power on after the convoy is eaten', eats === 4 && e.cruisers.length === 1 && e.fright > 1, { eats, fright: e.fright });
  e.cruisers = [{ id: 84, r: e.player.r, s: HR.wrap(e.player.s + 60, e.player.r) }]; run(e, 40, {});
  ok('eating the last truck then ends the power at once', e.cruisers.length === 0 && e.fright === 0 && e.phase === 'play', { fright: e.fright, phase: e.phase });
}
// --- trucks lift the chain ---
{
  const run1 = trucks => { const e = headOn(400, 2); for (let i = 0; i < trucks; i++) e.cruisers.push({ id: 700 + i, r: 0, s: HR.wrap(e.player.s + 30 + i * 14, 0) });
    const pts = []; for (let i = 0; i < 160; i++) { HR.step(e, {}); for (const v of e.events) if (v.type === 'eat') pts.push(v.truck ? 'T' : v.pts); } return pts; };
  const p0 = run1(0), p1 = run1(1), p2 = run1(2);
  ok('without a truck the convoy scores x1 x2 x3', JSON.stringify(p0) === JSON.stringify([200, 400, 800]), p0);
  ok('one truck first: no points for it, then base x2: x2 x4 x8', JSON.stringify(p1) === JSON.stringify(['T', 400, 800, 1600]), p1);
  ok('two trucks first: base x3, so the reds score x3 x6 x12', JSON.stringify(p2) === JSON.stringify(['T', 'T', 600, 1200, 2400]), p2);
}
{
  // the base multiplier lasts for the whole run, is capped, and a crash loses it
  const power = (e, reds) => { e.player.r = 0; e.player.s = HR.wrap(-2 * RINGS[0] + 20, 0); e.player.slT = 0; e.grace = 0;
    const ls = HR.wrap(-2 * RINGS[0] + 90, 0); e.leader = { id: 800 + e.tick, r: 0, s: ls, zk: -1, can: false, slT: 0, slx: 0, sly: 0 };
    e.trail = []; e.trailD = 0; for (let i = 30; i >= 0; i--) { const s0 = ls + i * 4; const [x, y] = HR.pos(0, s0); e.trail.push({ d: -i * 4, x, y, r: 0, s: s0 }); }
    e.followers = []; for (let i = 0; i < reds - 1; i++) e.followers.push({ id: 900 + e.tick + i, lag: C.FOLLOW * (i + 1) }); e.fright = 400; };
  const pts = e => { const out = []; for (let i = 0; i < 160 && e.phase === 'play'; i++) { HR.step(e, {}); for (const v of e.events) if (v.type === 'eat') out.push(v.truck ? 'T' : v.pts); if (!e.leader && !e.followers.length) break; } return out; };
  const e = headOn(400, 0); e.leader = null; e.followers = [];
  power(e, 1); e.cruisers = [{ id: 760, r: 0, s: HR.wrap(e.player.s + 30, 0) }]; const p1 = pts(e); e.fright = 1; HR.step(e, {});
  ok('a truck raises the base to x2 and its red car scores x2', JSON.stringify(p1) === JSON.stringify(['T', 400]) && e.base === 1, { p1, base: e.base });
  power(e, 2); const p2 = pts(e); e.fright = 1; HR.step(e, {});
  ok('the base carries into every later power: reds start at x2', JSON.stringify(p2) === JSON.stringify([400, 800]) && e.base === 1, p2);
  power(e, 1); e.cruisers = [700, 701, 702].map((id, i) => ({ id, r: 0, s: HR.wrap(e.player.s + 30 + i * 14, 0) })); const p3 = pts(e);
  ok('the base has no cap: three more trucks take it to x5', JSON.stringify(p3) === JSON.stringify(['T', 'T', 'T', 1000]) && e.base === 4, { p3, base: e.base });
  e.fright = 1; HR.step(e, {}); ok('the next power starts from x5', HR.mult(e, 1) === 5 && e.chain === 0);
  const m = HR.create(1); m.base = 9; ok('the total multiplier is capped at x64 (12,800 per car)', HR.mult(m, 1) === 10 && HR.mult(m, 3) === 40 && HR.mult(m, 4) === 64 && HR.mult(m, 9) === 64);
  m.base = 0; ok('without trucks the chain still tops out at x64', HR.mult(m, 7) === 64 && HR.mult(m, 12) === 64);
  { const keep = C.TRUCK_MAX; C.TRUCK_MAX = 1; const f = headOn(400, 0); f.base = 1; f.cruisers = [{ id: 710, r: 0, s: HR.wrap(f.player.s + 30, 0) }]; const pf = pts(f); C.TRUCK_MAX = keep;
    ok('with a base cap set, a truck past the cap scores like a red car', pf[0] === 400 && f.base === 1, pf); }
  const c = headOn(0, 0); c.base = 2; c.grace = 0; const evs = []; for (let i = 0; i < 80 && c.phase !== 'crash'; i++) { HR.step(c, {}); evs.push(...c.events.map(v => v.type)); }
  ok('a crash loses the base multiplier (and says so)', c.phase === 'crash' && c.base === 0 && evs.includes('baselost'));
}
// --- switch chain ---
{
  const e = headOn(400, 0); e.shiftSinceEat = false; run(e, 60, {}); const first = e.score;
  e.chain = 1; e.shiftSinceEat = true; e.player.r = 0; e.player.s = HR.wrap(-2 * RINGS[0] + 20, 0);
  const ls = HR.wrap(-2 * RINGS[0] + 90, 0); e.leader = { id: 51, r: 0, s: ls, zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; e.fright = 300;
  const pts = []; for (let i = 0; i < 60; i++) { HR.step(e, {}); for (const v of e.events) if (v.type === 'eat') pts.push([v.pts, v.sw]); }
  ok('a chain hit after a lane change scores double', pts.length === 1 && pts[0][0] === 800 && pts[0][1] === true, pts);
}
// --- flag morphs the refilled half ---
{
  const st = HR.create(2); st.phase = 'play'; st.first = false; clearRivals(st);
  ok('a run lasts three minutes', st.timeLeft === C.TIME && C.TIME === 180 * 60);
  const takeFlag = half => { HR.use(st); HR.G.dots.forEach((d, i) => { if (d.half === half && !d.power) st.dots[i] = false; });
    const last = HR.G.dots.findIndex(d => d.half === half && !d.power && d.r === 0); st.dots[last] = true; const d = HR.G.dots[last];
    st.player.r = 0; st.player.s = HR.wrap(d.s - 12, 0); st.player.slT = 0; run(st, 20, {});
    const it = st.items[0]; st.flagAt = HR.pos(it.r, it.s); st.player.r = it.r; st.player.s = HR.wrap(it.s - 15, it.r); run(st, 12, {}); };
  // eat part of the right half so its state must survive a left-half change
  HR.use(st); HR.G.dots.forEach((d, i) => { if (d.half === 1 && i % 3 === 0 && !d.power) st.dots[i] = false; });
  const keyOf = d => d.r + ':' + d.s.toFixed(2);
  const rightBefore = new Map(); HR.G.dots.forEach((d, i) => { if (d.half === 1) rightBefore.set(keyOf(d), st.dots[i]); });
  const pr0 = st.pr, pl0 = st.pl, gapsR = JSON.stringify(HR.G.gaps.filter(q => q.half === 1));
  st.dormant = [{ id: 70, spot: 2 }, { id: 71, spot: 20 }];
  takeFlag(0);
  HR.use(st);
  ok('the flag gives the cleared (left) half a different pattern', st.pl !== pl0 && st.pr === pr0, [pl0, st.pl]);
  ok('the other half keeps its gaps', JSON.stringify(HR.G.gaps.filter(q => q.half === 1)) === gapsR);
  const rightNow = new Map(); HR.G.dots.forEach((d, i) => { if (d.half === 1) rightNow.set(keyOf(d), st.dots[i]); });
  const nearFlag = k => { const d = HR.G.dots.find(q => keyOf(q) === k); return Math.hypot(d.x - st.flagAt[0], d.y - st.flagAt[1]) < 30; }; // the drive onto the flag may eat a dot
  ok('the other half keeps its dots and which ones were eaten', rightNow.size === rightBefore.size && [...rightBefore].every(([k, v]) => nearFlag(k) || rightNow.get(k) === v) && [...rightBefore.values()].some(v => !v), { before: rightBefore.size, now: rightNow.size });
  ok('the refilled half is full on the new pattern', HR.G.dots.every((d, i) => d.half !== 0 || st.dots[i]));
  ok('parked cars sit on valid spots of the new layout', st.dormant.every(d => HR.G.spots[d.spot] != null) && new Set(st.dormant.map(d => d.spot)).size === st.dormant.length);
  ok('no crash or stall in the switch frame', st.phase === 'play' && st.stats.crashes === 0);
  takeFlag(1); HR.use(st); ok('the right half changes on its own flag', st.pr !== pr0, [pr0, st.pr]);
  { const key = d => d.r + ':' + d.s.toFixed(2), N = HR.HALVES.length; let bad = 0;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) for (let c = 0; c < N; c++) {
      if (HR.geoLR(a, b).dots.filter(d => d.half === 1).map(key).join() !== HR.geoLR(c, b).dots.filter(d => d.half === 1).map(key).join()) bad++;
      if (HR.geoLR(b, a).dots.filter(d => d.half === 0).map(key).join() !== HR.geoLR(b, c).dots.filter(d => d.half === 0).map(key).join()) bad++; }
    ok('a half\'s dots never depend on the other half\'s pattern (all combinations)', bad === 0, bad); }
  ok('every gap fits inside the side on each lane it joins (none clipped by a corner)', HR.HALVES.every(h => h.gaps.every(q => { for (let r = q.lo; r <= q.hi; r++) if (Math.abs(q.off) + HR.C.GAPW >= [108, 88, 68, 48, 28][r]) return false; return true; })));
  ok('every pair of half-patterns builds a valid field', HR.HALVES.every((_, a) => HR.HALVES.every((__, b) => { const g = HR.geoLR(a, b), fe = (HR.HALVES[a].feast ? 1 : 0) + (HR.HALVES[b].feast ? 1 : 0); return g.dots.filter(d => d.power).length === 2 + 9 * fe && g.spots.length >= 8 && g.dots.some(d => d.half === 0) && g.dots.some(d => d.half === 1); })));
}
// --- path indicator ---
{
  let bad = 0, cases = 0;
  for (let pat = 0; pat < HR.HALVES.length; pat++) for (const inp of [{}, { inHeld: true }, { outHeld: true }, { inHeld: true, boost: true }, { boost: true }]) for (const tier of [0, 6]) for (const r0 of [0, 2, 4]) {
    const st = HR.create(1); st.pl = pat; st.pr = pat; HR.use(st); st.dots = HR.G.dots.map(() => true); st.phase = 'play'; st.first = false; clearRivals(st); st.tier = tier;
    const k = HR.G.ring[r0][0]; if (!k) continue; st.player.r = r0; st.player.s = HR.wrap(k.s - 40, r0); st.player.zk = -1; st.player.can = false;
    const pr = HR.predictPath(st, inp); const q = HR.clone(st); let t = 0, seen = false;
    // run the real game with the same input until it reaches the edge of the next gap
    while (t++ < 400) { const o = HR.gapOf(q.player.r, q.player.s).o; if (Math.abs(o) < C.GAPW) seen = true; else if (seen && HR.distToGap(q.player.r, q.player.s, 1) - C.GAPW < 6) break; HR.step(q, inp); }
    cases++; if (pr.lane !== q.player.r) bad++;
  }
  ok('path indicator lane matches the real game for every pattern, input, tier and start lane', bad === 0, { cases, bad });
}
// --- slower rivals, grace after a bite, rival path ---
{
  const st = playState(); ok('rivals start at 75% of the player speed and gain a little with tier', Math.abs(HR.rivalSpeed(st) / HR.speed(st) - 0.75) < 1e-9 && (st.tier = C.TIER_MAX, HR.rivalSpeed(st) / HR.speed(st) > 0.75 + 1e-9), HR.rivalSpeed(st) / HR.speed(st));
  // eat the leader just as the power ends, with a follower right behind it: no crash
  const e = headOn(400, 1); let crashed = false, ate = 0;
  for (let i = 0; i < 120; i++) { HR.step(e, {}); crashed = crashed || e.phase === 'crash'; const n = e.events.filter(v => v.type === 'eat').length; ate += n; if (n) e.fright = 1; /* power ends right at the bite */ }
  ok('after a bite the next car cannot crash you even if the power ran out', ate >= 1 && !crashed, { ate, crashed, fright: e.fright });
  const f = headOn(0, 0); f.grace = 0; let c2 = false; for (let i = 0; i < 80; i++) { HR.step(f, {}); c2 = c2 || f.phase === 'crash'; }
  ok('without a bite, head-on still crashes', c2);
  // rival path: the lane it shows after its next gap is the lane it takes
  let bad = 0, n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const q = HR.create(seed); q.phase = 'play'; q.first = false; q.dormant = []; q.cruisers = [];
    for (let i = 0; i < 200 + seed * 37; i++) HR.step(q, {});
    if (q.phase !== 'play' || !q.leader) continue;
    // advance until the rival has locked its next turn
    let guard = 0; while (q.leader && !q.leader.locked && guard++ < 400 && q.phase === 'play') HR.step(q, {});
    if (!q.leader || q.phase !== 'play') continue;
    const pr = HR.predictRival(q); const id = q.leader.id; let seen = false, t = 0;
    const g = HR.clone(q); g.ghost = true;
    while (t++ < 400 && g.leader && g.leader.id === id) { const L = g.leader, o = HR.gapOf(L.r, L.s).o; if (Math.abs(o) < C.GAPW) seen = true; else if (seen) break; HR.step(g, {}); }
    if (!g.leader || g.leader.id !== id) continue;
    n++; if (g.leader.r !== pr.lane) bad++;
  }
  ok('rival path shows the lane the rival takes at its signalled gap', n >= 10 && bad === 0, { n, bad });
}
// --- where rivals appear ---
{
  const B2 = require('../bots.js'); let n = 0, bad = [];
  for (let seed = 1; seed <= 8; seed++) {
    const st = HR.create(seed), pol = B2.human(seed);
    while (st.phase !== 'over') {
      HR.step(st, pol(st)); HR.use(st);
      const relocating = st.flying.some(f => f.lead);
      for (const e of st.events) if (e.type === 'leader' && st.leader) {
        n++; const [px, py] = HR.carXY(st.player), [x, y] = HR.pos(st.leader.r, st.leader.s), d = Math.hypot(x - px, y - py);
        let ahead = 1e9; if (st.leader.r === st.player.r) { ahead = (st.leader.s - st.player.s) % HR.per(st.leader.r); if (ahead < 0) ahead += HR.per(st.leader.r); }
        // a new leader appears behind the player: at least SPAWN_MIN away and SPAWN_LATE seconds from meeting it
        const mt = HR.meetTime(st, st.leader.r, st.leader.s);
        if (d < C.SPAWN_MIN - 5 || mt < C.SPAWN_LATE - 0.3) bad.push({ d: d | 0, meet: +mt.toFixed(2), relocated: !!e.relocated });
      }
    }
  }
  ok('a new leader appears behind the player, not just ahead (relocated cars aside)', n > 20 && bad.filter(b => !b.relocated).length <= n * 0.02, { n, bad: bad.filter(b => !b.relocated).slice(0, 3) });
  // staying on the innermost lane cannot keep the leader away forever
  const inner = playState(); clearRivals(inner); inner.leaderWait = 0; inner.dormant = [{ id: 91, spot: 3 }]; inner.player.r = 4;
  let tt = 0; while (!inner.leader && tt++ < 400) HR.step(inner, {});
  ok('a leader still appears while the player circles the innermost lane', !!inner.leader, tt);
  // the red car is never away for long outside power (driving over parked cars must not keep postponing it)
  let worst = 0;
  for (let seed = 1; seed <= 6; seed++) for (const course of [0, 3]) {
    const st = HR.create(seed, { course }), pol = B2.human(seed); let run = 0;
    while (st.phase !== 'over') { HR.step(st, pol(st)); if (st.phase === 'play' && !st.leader && st.fright === 0) { run++; worst = Math.max(worst, run); } else run = 0; }
  }
  ok('outside power a red car is back within 2.5 s', worst <= 150, (worst / 60).toFixed(2) + ' s');
  // warm-up: a new leader waits in place and cannot hit
  const w = playState(); clearRivals(w); w.leaderWait = 0; w.dormant = [{ id: 90, spot: 0 }];
  w.player.r = 4; w.player.s = HR.wrap(HR.spotPos(0).s + HR.per(4) / 2, 4);
  let t = 0; while (!w.leader && t++ < 200) HR.step(w, {});
  const s0 = w.leader && w.leader.s; run(w, C.WARM - 2, {});
  ok('a new leader waits in place for its start-up', w.leader && w.leader.s === s0 && w.leader.warm > 0);
  run(w, 10, {}); ok('then it sets off', w.leader && w.leader.s !== s0);
}
// --- FEAST bonus half ---
{
  const fi = HR.HALVES.findIndex(h => h.feast);
  const g = HR.geoLR(fi, 0);
  ok('a feast half has a pellet on every lane corner and sparse dots', g.dots.filter(d => d.power && d.half === 0).length === 10 && g.dots.filter(d => d.half === 0 && !d.power).length < 0.5 * g.dots.filter(d => d.half === 1 && !d.power).length);
  ok('feast is never a starting course', HR.COURSES.every(c => !HR.HALVES[c.l].feast && !HR.HALVES[c.r].feast));
  // pattern choice over many morphs: spacing, never both halves, never feast -> feast
  const st = HR.create(11); st.phase = 'play'; st.first = false; clearRivals(st);
  let feasts = 0, minGap = 1e9, last = -99, both = false, again = false, k = 0;
  for (let i = 0; i < 400; i++) {
    const half = i & 1, before = half ? st.pr : st.pl; HR.use(st);
    // call the refill path through a flag pickup
    st.items = [{ half, r: 0, s: HR.gapS(0, 1) }]; st.player.r = 0; st.player.s = HR.wrap(HR.gapS(0, 1) - 12, 0); st.player.slT = 0; run(st, 8, {});
    k++; const now = half ? st.pr : st.pl;
    if (HR.HALVES[now].feast) { feasts++; minGap = Math.min(minGap, k - last); last = k; if (HR.HALVES[before].feast) again = true; }
    if (HR.HALVES[st.pl].feast && HR.HALVES[st.pr].feast) both = true;
  }
  ok('feast never lands on both halves or twice running on one half', feasts > 20 && !both && !again, { feasts, both, again });
  // stacking power on a feast half
  const q = HR.create(3); q.pl = fi; HR.use(q); q.dots = HR.G.dots.map(() => true); q.phase = 'play'; q.first = false; clearRivals(q);
  q.leader = { id: 77, r: 4, s: 10, zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; q.trail = [{ d: -200, x: 0, y: 0, r: 4, s: 10 }, { d: 0, x: 0, y: 0, r: 4, s: 10 }];
  const pi = HR.G.dots.findIndex(d => d.power && d.half === 0 && d.r === 0), pd = HR.G.dots[pi];
  q.player.r = 0; q.player.s = HR.wrap(pd.s - 8, 0); run(q, 8, {});
  const f1 = q.fright; ok('a feast pellet gives about half the normal power', f1 > 0 && f1 <= Math.round(HR.frightTicks(0) * C.FEAST_T) + 1, f1);
  const pj = HR.G.dots.findIndex((d, i) => d.power && d.half === 0 && d.r === 0 && i !== pi && q.dots[i]); const pe = HR.G.dots[pj];
  q.player.s = HR.wrap(pe.s - 8, 0); const fBefore = q.fright; run(q, 8, {});
  ok('a second feast pellet adds to the remaining power, capped at a normal pellet', q.fright > fBefore && q.fright <= HR.frightTicks(0), [fBefore, q.fright]);
}
// --- power duration ---
{
  ok('power lasts 5.2 s at the start and never less than 4 s at top speed', HR.frightTicks(0) === Math.round(5.2 * 60) && HR.frightTicks(10) === 240 && HR.frightTicks(5) > HR.frightTicks(10), [HR.frightTicks(0), HR.frightTicks(5), HR.frightTicks(10)]);
}
// --- feast schedule is fixed, not random ---
{
  const fi = HR.HALVES.findIndex(h => h.feast);
  const sched = []; for (const seed of [1, 2, 3, 4]) {
    const st = HR.create(seed * 97); st.phase = 'play'; st.first = false; clearRivals(st); const at = [];
    for (let k = 1; k <= 16; k++) {
      const half = k & 1; // alternate halves, as a player usually does
      st.items = [{ half, r: 0, s: HR.gapS(0, 1) }]; st.player.r = 0; st.player.s = HR.wrap(HR.gapS(0, 1) - 12, 0); st.player.slT = 0; run(st, 8, {});
      if ((half ? st.pr : st.pl) === fi) at.push(k);
    }
    sched.push(at.join(','));
  }
  ok('feast comes on flags 3, 7, 11, 15 whatever the seed', sched.every(x => x === '3,7,11,15'), sched);
  // a due feast that would sit on both halves moves to the next flag instead of being dropped
  const st = HR.create(5); st.phase = 'play'; st.first = false; clearRivals(st); const at = [];
  const order = [0, 1, 0, 1, 1, 1, 1, 0, 0, 0]; // the left half is refilled at flag 3, then the right half three times in a row
  order.forEach((half, i) => { st.items = [{ half, r: 0, s: HR.gapS(0, 1) }]; st.player.r = 0; st.player.s = HR.wrap(HR.gapS(0, 1) - 12, 0); st.player.slT = 0; run(st, 8, {}); if (HR.HALVES[half ? st.pr : st.pl].feast) at.push(i + 1); });
  ok('a blocked feast is delayed, never lost', at.length === 2 && at[0] === 3 && at[1] >= 7, at);
}
// --- lives, extends, game over ---
{
  const st = playState(); ok('a run starts with 3 cars', st.lives === 3);
  const e = headOn(0, 0); e.grace = 0; for (let i = 0; i < 80 && e.phase !== 'crash'; i++) HR.step(e, {});
  ok('a crash costs a car', e.phase === 'crash' && e.lives === 2, e.lives);
  const g = headOn(0, 0); g.lives = 1; g.grace = 0; let ph = []; for (let i = 0; i < 300; i++) { HR.step(g, {}); if (ph[ph.length - 1] !== g.phase) ph.push(g.phase); }
  ok('losing the last car ends the run with GAME OVER after the crash', g.phase === 'over' && g.overReason === 'lives' && ph.join() === 'play,crash,over', ph);
  const x = playState(); clearRivals(x); const got = [];
  for (const sc of [2990, 3000, 7990, 8000, 13000, 18000]) { x.score = sc; HR.step(x, {}); for (const v of x.events) if (v.type === 'extend') got.push(sc); }
  ok('extends at 3k, then every 5k (8k, 13k ...), up to the 6-car cap', JSON.stringify(got) === JSON.stringify([3000, 8000, 13000]) && x.lives === 6, { got, lives: x.lives });
  x.lives = 4; x.score = 23000; HR.step(x, {}); ok('a threshold passed while at the cap is not banked: the next extend comes at the next threshold', x.lives === 5 && x.nextExtend === 28000, { lives: x.lives, next: x.nextExtend });
  x.score = 99000; HR.step(x, {}); ok('no more than 6 cars', x.lives === 6);
  const t = playState(); clearRivals(t); t.timeLeft = 2; run(t, 4, {}); ok('time running out is a separate ending', t.phase === 'over' && t.overReason === 'time');
}
// --- no dot is skipped by the sideways slide after a turn ---
{
  const firstAfterGap = (st, r, k) => { HR.use(st); const gs = HR.gapS(r, k); let best = -1, bd = 1e9; for (const i of HR.G.byRing[r]) { let d = (HR.G.dots[i].s - gs) % HR.per(r); if (d < 0) d += HR.per(r); if (d > 0 && d < bd) { bd = d; best = i; } } return best; };
  const res = [];
  for (const [label, inp, lanes] of [['top speed, holding two lanes', { inHeld: true }, 2], ['top speed, full throttle one lane', { inHeld: true, boost: true }, 1]]) {
    const st = playState(); clearRivals(st); st.tier = C.TIER_MAX; placeBefore(st.player, 0, 3, 60);
    const target = firstAfterGap(st, lanes, 3); let t = 0;
    while (t++ < 120 && !(st.player.r === lanes && HR.G.dots[target] && st.dots[target] === false)) HR.step(st, inp);
    res.push({ label, lane: st.player.r, eaten: st.dots[target] === false });
  }
  ok('the first dot after a gap is picked up right after a turn, even at top speed', res.every(r => r.eaten), res);
}
// --- the order of half-patterns is fixed, not random ---
{
  const fi = HR.HALVES.findIndex(h => h.feast);
  const seqFor = (course, seed) => { const st = HR.create(seed, { course }); st.phase = 'play'; st.first = false; clearRivals(st); const got = [];
    for (let k = 1; k <= 12; k++) { const half = k & 1; st.items = [{ half, r: 0, s: HR.gapS(0, 1) }]; st.player.r = 0; st.player.s = HR.wrap(HR.gapS(0, 1) - 12, 0); st.player.slT = 0; run(st, 8, {}); got.push(half ? st.pr : st.pl); }
    return got; };
  const name = l => l.map(i => HR.HALVES[i].name.split(' ')[0]).join(',');
  const same = HR.COURSES.every((_, c) => [3, 41, 977].every(seed => JSON.stringify(seqFor(c, seed)) === JSON.stringify(seqFor(c, 1))));
  ok('the same starting course always gives the same sequence of half-patterns', same);
  const cl = seqFor(0, 1).filter(i => i !== fi);
  ok('from CLASSIC the halves change easiest first: TWIN, UNDERTOW, LONG, LADDER, then round again', name(cl.slice(0, 5)) === 'TWIN,UNDERTOW,LONG,LADDER,CLASSIC', name(cl));
  ok('every change gives that half a different pattern', HR.COURSES.every((_, c) => { const st = HR.create(1, { course: c }); st.phase = 'play'; st.first = false; clearRivals(st); let okk = true;
    for (let k = 1; k <= 12; k++) { const half = k & 1, before = half ? st.pr : st.pl; st.items = [{ half, r: 0, s: HR.gapS(0, 1) }]; st.player.r = 0; st.player.s = HR.wrap(HR.gapS(0, 1) - 12, 0); st.player.slT = 0; run(st, 8, {}); if ((half ? st.pr : st.pl) === before) okk = false; } return okk; }));
}
// --- determinism ---
{
  const B = require('../bots.js'); const a = B.run(B.human(5), 5), b = B.run(B.human(5), 5);
  ok('same seed and policy reproduce the same run', a.score === b.score, a.score);
}
ok('all tuning constants are finite', (HR.checkC(), true));
{ const keep = C.CRASH_DROP; delete C.CRASH_DROP; let threw = false; try { HR.checkC(); } catch (e) { threw = /CRASH_DROP/.test(e.message); } C.CRASH_DROP = keep; ok('a missing constant is reported by name', threw); }
console.log(n, 'checks passed');
