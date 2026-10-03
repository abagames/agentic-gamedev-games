// Play-feel contract: the feedback added for impact, input confirmation, dot runs and state changes. node tests/feel.cjs
// Each scenario runs inside one page.evaluate (synchronous), so the page's own animation loop cannot tick in between.
const { chromium } = require('playwright'), path = require('path'), assert = require('node:assert/strict');
const S = require('../psg.js');
let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };

// --- sound programs (node) ---
{
  const inKey = f => { const deg = [9, 11, 0, 2, 4, 5, 7], m = 69 + 12 * Math.log2(f / 440), r = Math.round(m); return Math.abs(m - r) < 0.25 && deg.includes(((r % 12) + 12) % 12); };
  const pitch = a => S.PROGRAMS.dot(a).tones[0][0][0];
  for (const tier of [0, 3, 7]) {
    const run = [0, 1, 2, 3, 4, 5, 6].map(k => pitch(tier + 10 * k));
    ok('tier ' + tier + ': an unbroken dot run climbs one scale step per dot for six dots', run.every((f, i) => i === 0 || f > run[i - 1]), run);
    const top = [7, 8, 9, 10].map(k => pitch(tier + 10 * k));
    ok('tier ' + tier + ': past the climb the run shimmers between the top two notes', new Set(top).size === 2 && Math.max(...top) === run[6], top);
  }
  ok('the first dot of a run starts higher at a higher speed tier', pitch(0) < pitch(3) && pitch(3) < pitch(7));
  const notes = []; for (let t = 0; t < 8; t++) for (let k = 0; k < 12; k++) notes.push(pitch(t + 10 * k));
  for (const k of ['arm']) for (const [f] of S.PROGRAMS[k]().tones[0]) notes.push(f);
  for (const [f] of S.PROGRAMS.shift(2).tones[0]) notes.push(f);
  ok('dot-run, arm and second-lane notes are all in A minor', notes.every(inKey), notes.filter(f => !inKey(f)).slice(0, 4));
  ok('a one-lane turn is noise only; the second lane in the same gap adds a tone', !S.PROGRAMS.shift(1).tones && S.PROGRAMS.shift(2).tones.length === 1 && !!S.PROGRAMS.shift(2).noise);
  ok('the arm and boost cues are short (<= 8 frames)', S.PROGRAMS.arm().tones[0].length <= 8 && S.PROGRAMS.boost().noise.length <= 8);
}

(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 720, height: 816 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?test'); await p.waitForTimeout(600);
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  const ev = (f, a) => p.evaluate(f, a);
  // shared page helpers: a clean live run, a head-on rival, sound log, key events
  await ev(() => {
    const A = __game.audio, play = A.play.bind(A); window.__snd = []; A.play = (name, arg) => { __snd.push([name, arg]); play(name, arg); };
    window.key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    window.fresh = () => { __game.newGame(); const s = __game.state; s.phase = 'play'; s.first = false; s.phaseT = 0; s.grace = 0; s.fright = 0; s.followers = []; s.dormant = []; s.cruisers = []; s.flying = []; s.returning = []; s.leader = null; s.leaderWait = -1e9; s.nextExtend = 1e9; __snd.length = 0; return s; };
    window.headOn = (s, d, id) => { s.player.r = 0; s.player.s = HR.wrap(-2 * HR.RINGS[0] + 10, 0); s.player.slT = 0; s.leader = { id: id || 96, r: 0, s: HR.wrap(-2 * HR.RINGS[0] + 10 + d, 0), zk: -1, can: false, slT: 0, slx: 0, sly: 0 }; s.trail = [{ d: -200, x: 0, y: 0, r: 0, s: s.leader.s }, { d: 0, x: 0, y: 0, r: 0, s: s.leader.s }]; s.trailD = 0; };
    window.until = (f, max) => { for (let i = 0; i < (max || 600); i++) { __game.tick(); if (f()) return i; } return -1; };
  });

  // 1. the bitten car is knocked off: white, held on the impact point through the hit-stop, then flying outward along the player's travel
  const k = await ev(() => {
    const s = fresh(); headOn(s, 50, 91); s.fright = 400; s.powerOn = true;
    if (until(() => s.events.some(e => e.type === 'eat')) < 0) return null;
    const F = __game.feel, q = F.knocked[F.knocked.length - 1], at = [q.x, q.y], stop = s.stop, tg = HR.tan(s.player.r, s.player.s);
    for (let i = 0; i < stop; i++) __game.tick();
    const held = Math.hypot(q.x - at[0], q.y - at[1]);
    for (let i = 0; i < 8; i++) __game.tick();
    const moved = [q.x - at[0], q.y - at[1]], v1 = Math.hypot(q.vx, q.vy) / Math.pow(0.97, 8);
    // a second bite of the same power (chain 2) flies faster
    // (eating the only car ended that power, so restore it with one bite already counted)
    headOn(s, 50, 92); s.grace = 0; s.fright = 400; s.chain = 1;
    if (until(() => s.events.some(e => e.type === 'eat')) < 0) return null;
    const q2 = F.knocked[F.knocked.length - 1], chain = s.events.find(e => e.type === 'eat').chain;
    return { col: q.col === F.col.flash, stop, held, along: +(moved[0] * tg[0] + moved[1] * tg[1]).toFixed(1), v1: +v1.toFixed(2), v2: +Math.hypot(q2.vx, q2.vy).toFixed(2), chain };
  });
  ok('an eaten car turns white (out of play) and is knocked off the track', k && k.col, k);
  ok('it stays on the impact point through the hit-stop', k && k.stop > 0 && k.held === 0, k);
  ok('then flies on in the player\'s direction of travel', k && k.along > 4, k);
  ok('a later bite in the chain hits harder (faster launch)', k && k.chain === 2 && k.v2 > k.v1, k);

  // 2. crash: the hit rival is replaced by debris; a short freeze, then the player's car is thrown back the way it came
  const c = await ev(() => {
    const s = fresh(); s.lives = 3; headOn(s, 50, 93);
    if (until(() => s.phase === 'crash') < 0) return null;
    const F = __game.feel, w = F.wreck, tg = HR.tan(s.player.r, s.player.s), x0 = [w.x, w.y], hide = F.crashHide, deb = F.knocked.some(q => q.wreck);
    for (let i = 0; i < 3; i++) __game.tick(); const frozen = Math.hypot(w.x - x0[0], w.y - x0[1]); // 4 frozen frames, the crash frame included
    for (let i = 0; i < 12; i++) __game.tick(); const back = -((w.x - x0[0]) * tg[0] + (w.y - x0[1]) * tg[1]);
    return { hide, deb, frozen, back: +back.toFixed(1) };
  });
  ok('a crash hides the rival it hit and throws it as debris', c && c.hide === 93 && c.deb, c);
  ok('the wreck holds still for the impact freeze, then is thrown back against its travel', c && c.frozen === 0 && c.back > 4, c);

  // 3. blinker: lit on the very frame a turn is pressed, whatever the blink phase was
  const bl = await ev(() => {
    const s = fresh(); s.player.r = 2; s.player.s = 4; const out = [];
    for (let ph = 0; ph < 8; ph++) {
      s.player.r = 2; s.player.s = HR.wrap(HR.gapS(2, 0) + 30, 2); s.player.slT = 0; // well clear of a gap, so the press queues instead of turning at once
      for (let i = 0; i < 3 + ph; i++) __game.tick(); // land on every phase of the 8-frame blink
      for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key(code, true);
      __game.tick(); __game.render();
      const p = s.player, [x, y] = HR.carXY(p), tg = HR.tan(p.r, p.s), nx = -tg[1], ny = tg[0], q = p.req;
      const toC = (HR.CX - x) * nx + (HR.CY - y) * ny > 0 ? 1 : -1, kk = toC * q;
      const px = Math.round(x + nx * kk * 5 + tg[0] * 3) - 1, py = Math.round(y + ny * kk * 5 + tg[1] * 3) - 1;
      const d = document.getElementById('screen').getContext('2d').getImageData(px, py, 1, 1).data;
      out.push(q !== 0 && d[0] === 0xf8 && d[1] === 0xb0 && d[2] === 0x00);
      for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) key(code, false);
      p.req = 0; for (let i = 0; i < 6; i++) __game.tick();
    }
    return out;
  });
  ok('the blinker is lit on the first frame of a press at every blink phase', bl.every(Boolean), bl);

  // 4. the double-blinker arm cue and the boost cue fire once per press, not every frame
  const cue = await ev(() => {
    const s = fresh(); s.player.r = 2; s.player.s = HR.wrap(HR.gapS(2, 0) + 30, 2);
    const inKey = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'][HR.gapSide(HR.nextGapK(2, s.player.s, 1))]; // "toward the centre" at the coming gap
    key(inKey, true); for (let i = 0; i < 20; i++) __game.tick(); key(inKey, false);
    const arm = __snd.filter(q => q[0] === 'arm').length; __snd.length = 0;
    key('Space', true); for (let i = 0; i < 40; i++) __game.tick(); key('Space', false); for (let i = 0; i < 5; i++) __game.tick();
    const boost = __snd.filter(q => q[0] === 'boost').length, armBoost = __snd.filter(q => q[0] === 'arm').length;
    return { arm, boost, armBoost };
  });
  ok('holding a turn past the multi-lane threshold gives one arm cue', cue.arm === 1, cue);
  ok('pressing full throttle gives one boost cue, and no arm cue while boosting', cue.boost === 1 && cue.armBoost === 0, cue);

  // 5. dot run: the run count rises dot by dot along a lane and restarts after a lane change
  const dr = await ev(() => {
    const s = fresh(); s.player.r = 0; s.player.s = HR.wrap(-2 * HR.RINGS[0] + 30, 0);
    const runs = [], shiftAt = [];
    for (let i = 0; i < 900; i++) {
      if (i % 40 === 0) { key('ArrowDown', true); key('ArrowRight', true); key('ArrowUp', true); key('ArrowLeft', true); }
      if (i % 40 === 2) { key('ArrowDown', false); key('ArrowRight', false); key('ArrowUp', false); key('ArrowLeft', false); }
      __game.tick();
      if (s.events.some(e => e.type === 'shift' && e.who === 'p')) shiftAt.push(runs.length);
      for (const q of __snd) if (q[0] === 'dot') runs.push(Math.floor(q[1] / 10)); __snd.length = 0;
      if (s.phase !== 'play') break;
    }
    return { runs, shiftAt };
  });
  const maxRun = Math.max(...dr.runs), rises = dr.runs.filter((r, i) => i > 0 && r === dr.runs[i - 1] + 1).length;
  ok('consecutive dots raise the run one at a time', maxRun >= 4 && rises >= dr.runs.length * 0.6, { maxRun, rises, dots: dr.runs.length });
  ok('the first dot after a lane change starts a new run', dr.shiftAt.length > 0 && dr.shiftAt.every(i => i >= dr.runs.length || dr.runs[i] === 0), { shifts: dr.shiftAt.length, after: dr.shiftAt.map(i => dr.runs[i]) });

  // 6. power wave: a fresh power stamps the wave start; a power taken while already powered does not restart it
  const pw = await ev(() => {
    const s = fresh(); const G = HR.use(s); const i = G.dots.findIndex(d => d.power); if (i < 0) return null; const d = G.dots[i];
    const put = () => { s.player.r = d.r; s.player.s = HR.wrap(d.s - 8, d.r); s.player.slT = 0; s.dots[i] = true; };
    headOn(s, 300, 94); put(); s.powerOn = true; s.fright = 0;
    if (until(() => s.events.some(e => e.type === 'power'), 60) < 0) return null; const t1 = __game.feel.powerT0, tick1 = s.tick;
    for (let j = 0; j < 10; j++) __game.tick(); put();
    if (until(() => s.events.some(e => e.type === 'power'), 60) < 0) return null;
    return { fresh: t1 === tick1, kept: __game.feel.powerT0 === t1 };
  });
  ok('a fresh power starts the head-to-tail colour wave; a top-up while powered does not restart it', pw && pw.fresh && pw.kept, pw);

  // 7. half cleared: barriers blink, the new flag drops in, a spark heads for it
  const hc = await ev(() => {
    const s = fresh(); const G = HR.use(s); s.player.r = 0; s.player.s = HR.wrap(-2 * HR.RINGS[0] + 10, 0);
    // leave one dot of the player's half, just ahead
    const [px] = HR.carXY(s.player), half = px < HR.CX ? 0 : 1; let last = -1, best = 1e9;
    G.dots.forEach((d, j) => { if (d.half !== half || d.power) return; const ds = HR.wrap(d.s - s.player.s, d.r); if (d.r === 0 && ds > 0 && ds < best) { best = ds; last = j; } });
    G.dots.forEach((d, j) => { if (d.half === half && !d.power) s.dots[j] = j === last; });
    if (until(() => s.events.some(e => e.type === 'halfclear'), 120) < 0) return null;
    const F = __game.feel; return { blink: F.clearFlash[half] > 0, drop: F.flagDrop[half] === s.tick, spark: F.fx.some(f => f.glide), flag: s.items.length };
  });
  ok('clearing a half blinks its barriers, drops the new flag in and sends a spark to it', hc && hc.blink && hc.drop && hc.spark && hc.flag === 1, hc);

  // 8. flag (speed up): the lane sweep starts and the new speed pip flashes
  const rf = await ev(() => {
    const s = fresh(); s.player.r = 1; s.player.s = 40; s.items.push({ half: 0, r: 1, s: 46 });
    if (until(() => s.events.some(e => e.type === 'refill'), 30) < 0) return null;
    return { sweep: __game.feel.sweeps.length, pip: __game.feel.pipFlash, tier: s.tier };
  });
  ok('taking a flag starts the outside-in lane sweep and flashes the new pip', rf && rf.sweep === 1 && rf.pip > 0 && rf.tier === 1, rf);

  // 9. countdown: the last five seconds pulse; six seconds out does not
  const cd = await ev(() => {
    const s = fresh(); s.timeLeft = 6 * 60 + 1; __game.tick(); const six = __game.feel.timePulse;
    s.timeLeft = 5 * 60 + 1; __game.tick(); const five = __game.feel.timePulse; return { six, five };
  });
  ok('only the last five seconds pulse the clock', cd.six === 0 && cd.five > 0, cd);

  // 10. a powered truck is blue like every edible car, with purple stripes; unpowered it is purple with no blue
  const tr = await ev(() => {
    const s = fresh(); s.player.r = 0; s.player.s = 20; s.cruisers = [{ id: 70, r: 3, s: HR.wrap(HR.gapS(3, 0) + 40, 3) }];
    const look = () => { __game.render(); const [x, y] = HR.pos(3, s.cruisers[0].s), d = document.getElementById('screen').getContext('2d').getImageData(Math.round(x) - 9, Math.round(y) - 9, 19, 19).data;
      const has = hex => { const n = parseInt(hex.slice(1), 16); for (let i = 0; i < d.length; i += 4) if (d[i] === n >> 16 && d[i + 1] === ((n >> 8) & 255) && d[i + 2] === (n & 255)) return true; return false; };
      return { blue: has(__game.feel.col.fright), purple: has(__game.feel.col.cruiser) }; };
    const off = look(); s.fright = 300; const on = look(); return { off, on };
  });
  ok('a powered truck turns blue and keeps purple stripes; unpowered it is plain purple', tr.on.blue && tr.on.purple && tr.off.purple && !tr.off.blue, tr);

  ok('no console errors', errs.length === 0, errs);
  console.log(n, 'feel checks passed');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
