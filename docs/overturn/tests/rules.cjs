// Rule conformance on injected states. node tests/rules.cjs
const OT = require('../core.js'), B = require('../bots.js'), assert = require('node:assert/strict'), C = OT.C;
let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
// a game in play with one free ball, no skill shot pending
const playing = (f) => { const s = OT.create(1); s.skill = -1; Object.assign(s.bs[0], { x: 0, y: 60, vx: 0, vy: 100, held: 0, arm: 1 }); if (f) f(s, s.bs[0]); return s; };
const run = (s, ticks, dir, until) => { const seen = []; for (let i = 0; i < ticks; i++) { OT.step(s, { dir: dir || 0 }); seen.push(...s.events); if (until && until(s)) break; } return seen; };
const sum = s => s.segs.reduce((a, h) => a + Math.max(0, h), 0);
const bankDown = (s, k) => { s.th = Math.PI / 2 - OT.BANK_A(k); s.up[k * 3] = 0; s.up[k * 3 + 2] = 0; Object.assign(s.bs[0], { x: 0, y: 20, vx: 0, vy: 100 }); }; // one face left, the ball falling onto it

{ const a = OT.create(7), b = OT.create(7), pa = B.policies.mash(3), pb = B.policies.mash(3);
  for (let i = 0; i < 3000; i++) { OT.step(a, pa(a)); OT.step(b, pb(b)); }
  ok('same seed and inputs give the same game', JSON.stringify(a) === JSON.stringify(b)); }
{ const s = OT.create(1); run(s, C.READY - 1); const held = s.bs[0].held > 0; run(s, 2);
  ok('the ball is held at the hub through READY, then fired upward', held && s.bs[0].held === 0 && s.bs[0].vy < 0 && Math.hypot(s.bs[0].x, s.bs[0].y) < 5); }
{ const s = playing((s, b) => { b.x = -8; }); const ev = run(s, 60, 0, s => s.stats.bounces > 0), r = ev.find(e => e.type === 'rim');
  ok('a landing costs the section one of its three and lights its lamp', r && s.segs[r.seg] === 2 && sum(s) === 35 && s.lamps[r.seg] === 1 && OT.repairNow(s) === 1, r);
  ok('the rim throws the ball back toward the centre at its own speed', Math.abs(Math.hypot(s.bs[0].vx, s.bs[0].vy) - C.KICK) < 30 && s.bs[0].vy < 0); }
{ const s = playing(s => { s.om = C.OMEGA; s.th = Math.PI / 2 - 4 * OT.SEG_A; }); run(s, 60, 1, s => s.stats.bounces > 0);
  const t = playing(s => { s.om = -C.OMEGA; s.th = Math.PI / 2 - 4 * OT.SEG_A; }); run(t, 60, -1, s => s.stats.bounces > 0);
  ok('a turning rim drags the ball its own way: clockwise sends it left, anticlockwise right', s.bs[0].vx < -60 && t.bs[0].vx > 60, { cw: s.bs[0].vx, ccw: t.bs[0].vx }); }
{ const s = playing((s, b) => { b.x = -8; s.segs[3] = 0; s.segs[2] = 0; s.segs[8] = 1; s.mult = 3; s.ballTargets = 4; }); const ev = run(s, 200, 0, s => s.phase !== 'play'), lost = ev.find(e => e.type === 'lost');
  ok('where the rim is gone the ball falls out and is lost', s.balls === 2 && s.causes.drop === 1 && ev.some(e => e.type === 'through'));
  ok('the lost ball pays its bonus (targets x 100 x multiplier) and the multiplier starts again', lost.bonus === 1200 && s.score === 1200 && s.mult === 1 && s.ballTargets === 0, lost);
  run(s, C.LOST + 2); ok('the next ball finds every hole and worn-out section built up to two landings, and a skill shot waiting', s.phase === 'play' && s.bs.length === 1 && s.bs[0].held > 0 && s.segs[3] === 2 && s.segs[2] === 2 && s.segs[8] === 2 && s.segs[5] === 3 && s.skill >= 0); }
{ const s = playing((s, b) => { b.x = -2; s.segs[3] = 0; s.th = -(OT.SEG_A - 0.04); });
  const i = OT.segAt(s, Math.atan2(-Math.sin(s.th) * -2 + Math.cos(s.th) * 92, Math.cos(s.th) * -2 + Math.sin(s.th) * 92));
  ok('a ball at the very end of a hole still lands on the standing section beside it', i >= 0 && s.segs[i] > 0, { i }); }
{ const s = playing((s, b) => { s.th = Math.PI / 2 - OT.BANK_A(0); b.x = 3; b.y = 80; b.vy = 200; }); const ev = run(s, 40, 0, s => s.stats.backs > 0), first = ev.find(e => e.type === 'back');
  ok('from the rim side a target is steel: it does not fall', first && s.stats.targets === 0 && s.up.slice(0, 3).join('') === '111', { backs: s.stats.backs }); let far = 0, at = -1; for (let i = 0; i < 70 && s.phase === 'play'; i++) { OT.step(s, { dir: 0 }); if (s.bs[0] && Math.abs(s.bs[0].x) > far) far = Math.abs(s.bs[0].x); if (at < 0 && far > 30) at = s.stats.bounces; }
  ok('and the steel back sends the ball along the bank toward the nearer end, out from under the roof within a few landings', first.side !== 0 && s.phase === 'play' && far > 30 && at >= 0 && at <= 3, { reached: Math.round(far), landingsToGetOut: at, backs: s.stats.backs });
  const keep = C.DEFLECT; C.DEFLECT = 0; const t = playing((s, b) => { s.th = Math.PI / 2 - OT.BANK_A(0); b.x = 3; b.y = 80; b.vy = 200; }); run(t, 90, 0, s => s.phase !== 'play'); C.DEFLECT = keep;
  ok('(without the deflector the same ball is trapped and lost in a second and a half)', t.phase !== 'play' && t.stats.bounces >= 5, { landings: t.stats.bounces }); }
{ const s = playing((s, b) => { s.th = Math.PI / 2 - OT.BANK_A(0); b.y = 20; }); run(s, 30, 0, s => s.stats.targets > 0);
  ok('hit on the face turned to the centre, it falls and scores', s.stats.targets === 1 && s.up[1] === 0 && s.score === C.PTS.target && s.bs[0].vy < 0); }
{ const s = playing(s => { bankDown(s, 0); s.segs = [3, 1, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3]; s.lamps = [1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]; });
  const ev = run(s, 30, 0, s => s.stats.banks > 0), bk = ev.find(e => e.type === 'bank');
  ok('a finished bank puts back one bounce per lit lamp, weakest section first, and the lamps go out', bk && bk.lamps === 5 && bk.gain === 5 && s.segs[2] >= 2 && sum(s) === 32 && OT.lit(s) === 0, { segs: s.segs });
  ok('it pays, raises the multiplier and lights the hub', s.score === 100 + 1000 && s.mult === 2 && s.hubLit === 1);
  Object.assign(s.bs[0], { held: 9999, x: 0, y: 0 }); run(s, C.RESET - 30); const before = s.up.slice(0, 3).join(''); run(s, 30);
  ok('the bank stands up again after its delay', before === '000' && s.up.slice(0, 3).join('') === '111', { before }); }
{ const s = playing(s => { bankDown(s, 0); s.level = 3; s.segs[7] = 1; }); const ev = run(s, 30, 0, s => s.stats.banks > 0), v = ev.find(e => e.type === 'void');
  ok('every fourth bank tears the weakest section out for good', v && v.seg === 7 && s.segs[7] === -1, v);
  s.lamps.fill(1); bankDown(s, 1); run(s, 30, 0, s => s.stats.banks > 1); ok('no repair brings it back', s.segs[7] === -1);
  s.bs[0].out = 1; s.bs[0].x = 0; s.bs[0].y = 200; run(s, 3); run(s, C.LOST + 2); ok('nor does the patch for a new ball', s.segs[7] === -1 && s.balls === 2); }
{ const s = playing((s, b) => { s.hubLit = 1; b.x = 0; b.y = 40; b.vy = -300; }); const ev = run(s, 30, 0, s => s.locks > 0);
  ok('a lit hub catches a ball that comes up the middle, and holds it', s.locks === 1 && s.bs[0].held > 0 && s.hubLit === 0 && ev.some(e => e.type === 'lock'));
  run(s, C.HOLD + 1); ok('then fires it back out', s.bs[0].held === 0 && s.bs[0].vy < 0);
  const t = playing((s, b) => { b.x = 0; b.y = 40; b.vy = -300; }); run(t, 30); ok('an unlit hub lets it through', t.locks === 0 && t.bs[0].held === 0); }
{ const s = playing((s, b) => { s.hubLit = 1; s.locks = 1; b.x = 0; b.y = 40; b.vy = -300; }); const ev = run(s, 30, 0, s => s.multi);
  ok('the second lock starts a multiball: two balls', s.multi === 1 && s.bs.length === 2 && ev.some(e => e.type === 'multiball'));
  run(s, C.HOLD + C.FIRE_GAP + 2); ok('fired one after the other, to opposite sides', s.bs.every(b => b.held === 0) && s.bs[0].vx * s.bs[1].vx < 0 || s.bs.length < 2);
  const m = playing(s => { s.multi = 1; s.bs.push(Object.assign({}, s.bs[0], { x: 60, y: -20, vx: 0, vy: -50 })); bankDown(s, 0); }); const e2 = run(m, 30, 0, s => s.stats.banks > 0);
  ok('in a multiball a finished bank is a jackpot and does not light the hub', e2.find(e => e.type === 'bank').jackpot === 1 && m.score === 100 + C.PTS.jackpot && m.hubLit === 0);
  m.bs[1].out = 1; m.bs[1].x = 0; m.bs[1].y = 200; run(m, 2); ok('losing one of two ends the multiball and costs no ball', m.bs.length === 1 && m.multi === 0 && m.balls === 3 && m.phase === 'play'); }
{ const s = OT.create(5); const k = s.skill; s.th = Math.PI / 2 - (k + 0.5) * OT.SEG_A; run(s, C.READY + 1); s.bs[0].vx = 0; const ev = run(s, 300, 0, s => s.stats.bounces > 0), r = ev.find(e => e.type === 'rim');
  ok('skill shot: the first landing on the flashing section pays and stores a save', r.seg === k && r.skill === C.PTS.skill && s.save === 1 && s.skill === -1, { k, seg: r.seg });
  s.bs[0].out = 1; s.bs[0].x = 0; s.bs[0].y = 200; const e2 = run(s, 3);
  ok('the save fires a lost ball back from the hub, once', e2.some(e => e.type === 'saved') && s.balls === 3 && s.save === 0 && s.bs.length === 1 && s.bs[0].held > 0);
  const t = OT.create(5); t.th = Math.PI / 2 - (t.skill + 6.5) * OT.SEG_A; run(t, C.READY + 1); t.bs[0].vx = 0; run(t, 300, 0, s => s.stats.bounces > 0); ok('missed, it is gone', t.save === 0 && t.skill === -1 && t.stats.skills === 0); }
// jackpots
{ const s = playing(s => { s.multi = 1; s.bs.push(Object.assign({}, s.bs[0], { x: 60, y: -20, vx: 0, vy: -50 })); });
  const down = k => { s.up[k * 3] = 0; s.up[k * 3 + 1] = 1; s.up[k * 3 + 2] = 0; s.bankT[k] = 0; s.th = Math.PI / 2 - OT.BANK_A(k); s.om = 0; Object.assign(s.bs[0], { x: 0, y: 20, vx: 0, vy: 100, held: 0 }); Object.assign(s.bs[1], { x: 0, y: -60, vx: 0, vy: -200 }); const n = s.stats.banks, sc = s.score; const ev = run(s, 30, 0, s => s.stats.banks > n); return { ev, got: s.score - sc }; };
  const a = down(0), again = down(0);
  ok('in a multiball each bank is a jackpot once: taken again it pays as an ordinary bank', a.got === 100 * 1 + C.PTS.jackpot * 1 && again.got === 100 * 2 + C.PTS.bank * 2 && s.stats.jackpots === 1, { first: a.got, again: again.got });
  down(1); const lit1 = s.superLit; const c = down(2);
  ok('the third bank\'s jackpot lights the super jackpot at the hub', lit1 === 0 && s.superLit === 1 && s.stats.jackpots === 3 && c.ev.some(e => e.type === 'superLit'));
  s.th = 0; s.om = 0; Object.assign(s.bs[0], { x: 0, y: 40, vx: 0, vy: -300, arm: 1, held: 0 }); const sc = s.score, m = s.mult, ev = run(s, 30, 0, s => s.stats.supers > 0);
  ok('a ball up the middle takes it: three jackpots\' worth, and the banks light again', s.score - sc === C.PTS.super * m && s.superLit === 0 && s.jp.join('') === '000' && s.bs[0].held > 0 && s.multi === 1 && ev.some(e => e.type === 'super'), { got: s.score - sc });
  s.superLit = 1; s.jp = [1, 1, 1]; s.bs[1].out = 1; s.bs[1].x = 0; s.bs[1].y = 200; run(s, 2); ok('it goes out with the multiball', s.multi === 0 && s.superLit === 0 && s.jp.join('') === '000'); }
// rounds
{ const s = playing(s => { s.spell = C.SPELL - 1; s.th = Math.PI / 2 - OT.BANK_A(0); Object.assign(s.bs[0], { y: 20 }); }); const ev = run(s, 30, 0, s => s.stats.targets > 0);
  ok('the sixth face finishes the word and readies a round on a standing section in the open', s.spell === C.SPELL && s.ready >= 0 && s.ready % 4 !== 1 && s.ready % 4 !== 2 && ev.some(e => e.type === 'ready'), { ready: s.ready }); }
const startRound = (kind, f) => playing((s, b) => { s.roundIdx = C.ROUNDS.indexOf(kind); s.ready = 3; s.th = Math.PI / 2 - 3.5 * OT.SEG_A; b.y = 70; b.vy = 150; if (f) f(s, b); });
{ const s = startRound('solo'); const ev = run(s, 30, 0, s => s.round);
  ok('landing on the flashing section starts the next round and clears the word', s.round && s.round.kind === 'solo' && s.ready === -1 && s.spell === 0 && s.round.tgt >= 0 && ev.some(e => e.round === 'solo'));
  const hit = () => { const T = OT.TARGETS[s.round.tgt]; s.th = Math.PI / 2 - T.a; s.om = 0; const c = Math.cos(s.th), n = Math.sin(s.th); Object.assign(s.bs[0], { x: c * T.x * 0.6 - n * T.y * 0.6, y: n * T.x * 0.6 + c * T.y * 0.6, vx: 0, vy: 150 }); const before = s.stats.solos; run(s, 40, 0, s => s.stats.solos > before || !s.round); };
  const sc = s.score; hit(); const first = s.score - sc; hit();
  ok('solo: the lit face pays more each time', first === 100 + C.PTS.solo && s.stats.solos === 2 && s.round && s.round.n === 2, { first, solos: s.stats.solos });
  hit(); ok('the third ends the round and stores a save', s.stats.solos === 3 && !s.round && s.save === 1); }
{ const s = startRound('chase'); run(s, 30, 0, s => s.round); const lit = s.round.seg;
  ok('chase: the light starts on the next standing section', lit === 4);
  run(s, C.CHASE_STEP + 1); const moved = s.round.seg; s.th = Math.PI / 2 - (moved + 0.5) * OT.SEG_A; s.om = 0; Object.assign(s.bs[0], { x: 0, y: 70, vx: 0, vy: 150 }); const ev = run(s, 30, 0, s => s.stats.chases > 0);
  ok('it moves on, and a landing on it pays and sends it on again', moved !== lit && s.stats.chases === 1 && ev.find(e => e.chase).chase === C.PTS.chase && s.round.seg !== moved, { moved }); }
{ const s = startRound('rush'); run(s, 30, 0, s => s.round); const v0 = OT.rushValue(s); run(s, 60); const v1 = OT.rushValue(s);
  bankDown(s, 0); const sc = s.score, ev = run(s, 30, 0, s => s.stats.banks > 0), bk = ev.find(e => e.type === 'bank');
  ok('rush: the value falls, and the first finished bank takes what is left and ends the round', v1 < v0 && bk.rush > 0 && bk.rush <= v1 && s.score - sc === 100 + 1000 + bk.rush && !s.round, { v0, v1, got: bk.rush }); }
{ const s = startRound('chase'); run(s, 30, 0, s => s.round); const ev = run(s, C.ROUND_T + 5, 0, s => !s.round && false);
  ok('a round ends when its clock runs out, or with the ball', ev.some(e => e.type === 'roundEnd')); }
{ const s = playing((s, b) => { b.x = -8; s.segs[3] = 0; s.segs[2] = 0; }); run(s, 200, 0, s => s.phase !== 'play'); const none = s.save; run(s, C.LOST + 2);
  ok('the first ball starts with no save; the second starts with the save lit', OT.create(1).save === 0 && none === 0 && s.phase === 'play' && s.save === 1 && s.balls === 2);
  const k = s.skill; s.th = Math.PI / 2 - (k + 0.5) * OT.SEG_A; run(s, C.READY + 1); s.bs[0].vx = 0; const ev = run(s, 300, 0, s => s.stats.bounces > 0), r = ev.find(e => e.type === 'rim');
  ok('with a save already lit, a skill shot gives two letters of the word instead', r.seg === k && r.skill === C.PTS.skill && r.letters === 2 && s.spell === 2 && s.save === 1, { spell: s.spell }); }
{ const s = startRound('rush', s => { s.roundIdx = 2; }); run(s, 30, 0, s => s.round); bankDown(s, 0); const ev = run(s, 30, 0, s => !s.round);
  ok('when the last round of the cycle ends, the hub lights for an extra ball', s.roundIdx === 3 && s.extraLit === 1 && ev.some(e => e.type === 'extraLit'));
  s.hubLit = 0; s.th = 0; Object.assign(s.bs[0], { x: 0, y: 40, vx: 0, vy: -300, arm: 1 }); const e2 = run(s, 30, 0, s => s.stats.extends > 0);
  ok('a ball up the middle collects it: one more ball, no lock', s.balls === 4 && s.extraLit === 0 && s.locks === 0 && s.bs[0].held > 0 && e2.some(e => e.type === 'extend'));
  const t = startRound('solo'); run(t, 30, 0, s => s.round); run(t, 1, 0); t.round.t = 1; run(t, 3); ok('the first round of a cycle does not light it', !t.round && t.extraLit === 0);
  const u = playing((s, b) => { s.extraLit = 1; s.balls = C.STOCK_MAX; b.x = 0; b.y = 40; b.vy = -300; }); run(u, 30, 0, s => s.stats.extends > 0); ok('never more than a full rack', u.balls === C.STOCK_MAX && u.extraLit === 0);
  const w = startRound('rush', s => { s.roundIdx = 2; s.extraGiven = C.EXTRA_MAX; }); run(w, 30, 0, s => s.round); bankDown(w, 0); run(w, 30, 0, s => !s.round);
  ok('the hub lights for an extra ball twice in a game and no more', C.EXTRA_MAX === 2 && s.extraGiven === 1 && !w.round && w.extraLit === 0);
  const v = playing(s => { s.score = 999000; bankDown(s, 0); }); run(v, 30, 0, s => s.stats.banks > 0); ok('score alone no longer gives a ball', v.balls === 3 && v.score > 1000000); }
{ const s = OT.create(3); run(s, 60 * 120, 0, s => s.over); ok('left alone, the game is over inside a minute', s.over && s.t * C.TICK < 60, { t: s.t * C.TICK, score: s.score }); }
{ const s = playing(), c = OT.clone(s); run(c, 100, 1); ok('an imagined copy leaves the game untouched', s.t === 0 && s.th === 0 && sum(s) === 36 && c.t === 100 && s.bs[0].y === 60); }
console.log('rules:', n, 'passed');
