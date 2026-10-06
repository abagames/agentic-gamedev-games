// OVERTURN — rules core (browser global OT / Node module). Deterministic, 60 ticks per second, no rendering.
// One control: turn the table. Gravity always points down the screen; everything else is bolted to the table.
(function (root) {
  'use strict';
  const C = {
    TICK: 1 / 60, SUB: 4,
    R: 96, BR: 4,                  // inner radius of the rim, ball radius (px)
    G: 700, KICK: 400,             // gravity (px/s^2); speed the rim's rubber returns along its normal (px/s)
    OMEGA: 2.4, ACC: 0.5,          // table turn rate (rad/s) and how fast it gets there (rad/s per tick)
    GRIP: 0.4,                     // share of the rim's own sideways speed a bounce hands to the ball
    SEGS: 12, HP: 3,               // rim sections, bounces each one takes when new
    EDGE: 0.07,                    // rad: a ball this close to a standing section's end still lands on it
    BANKS: 3, BANK_R: 54, T_GAP: 19, T_HW: 8, T_HH: 3, T_E: 0.85, // three banks of three drop targets
    BUMP_R: 26, BUMP_RAD: 7, POP: 430, BUMPERS: 0, // pop bumpers: tried and switched off (see REVISION_HISTORY)
    DEFLECT: 300, DEFLECT_OUT: 50, // a steel back sends the ball along the bank at DEFLECT px/s, with DEFLECT_OUT away from it (DEFLECT 0: the back only bounces it straight back)
    RESET: 240,                    // ticks before a completed bank stands up again
    HUB_R: 7, HOLD: 100, FIRE_GAP: 40, // the hub catches a ball within HUB_R of the centre and holds it; second ball of a multiball follows FIRE_GAP later
    LAMPS: true, HUB: true, SAVE: true, SKILL: true, VOID_EVERY: 4, // features, switchable for comparison runs
    BALLS: 3, READY: 70, LOST: 150, OUT: 10, SAVE_HOLD: 45,
    LAMP_STEP: 0, // lit lamps per step of a bank's value: tried at 4 and switched off (see REVISION_HISTORY, build 27 notes)
    FACE: 0.5, TARGET_REPAIR: 0, // FACE: how squarely a target must be hit on its inner face to fall (cosine; lower accepts more glancing hits). TARGET_REPAIR: landings a single fallen face puts back
    START_SAVE: 2, SKILL_AWARD: 'either', SKILL_LETTERS: 2, // START_SAVE: 0 no ball starts with a save, 1 every ball does, 2 every ball after the first; what a skill shot gives ('either': a save when none is stored, otherwise SKILL_LETTERS letters of the word)
    NEW_BALL_HP: 2, // a new ball finds every standing-or-broken section with at least this many landings
    EXTRA_MAX: 2, // extra balls that can be lit in one game (0: no limit)
    STOCK_MAX: 5, VOID_FLOOR: 1, // most balls in hand; sections that are never torn out
    PTS: { target: 100, bank: 1000, jackpot: 5000, super: 15000, skill: 2000, lock: 500, chase: 2000, solo: 3000, rushHi: 8000, rushLo: 1000, bonus: 100, bump: 10 }, MULT_MAX: 9,
    ROUNDS: ['solo', 'chase', 'rush'], SPELL: 6, WORD: 'ROTATE', ROUND_T: 1200, CHASE_T: 600, CHASE_HITS: 0, CHASE_STEP: 75, SOLO_HITS: 3, // rounds, in order; faces that spell the word; a round's length; how often the chase light moves
    REPAIR: [8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1], // used only when LAMPS is off
  };
  const TAU = Math.PI * 2, SEG_A = TAU / C.SEGS;
  const BANK_A = k => (k + 0.5) * TAU / C.BANKS, BUMP_A = k => k * TAU / C.BANKS;
  // furniture in table coordinates
  const TARGETS = [], BUMPERS = [];
  for (let k = 0; k < C.BANKS; k++) {
    const a = BANK_A(k), er = [Math.cos(a), Math.sin(a)], et = [-er[1], er[0]];
    for (let j = -1; j <= 1; j++) TARGETS.push({ bank: k, x: er[0] * C.BANK_R + et[0] * j * C.T_GAP, y: er[1] * C.BANK_R + et[1] * j * C.T_GAP, er, et, a });
    const b = BUMP_A(k); BUMPERS.push({ x: Math.cos(b) * C.BUMP_R, y: Math.sin(b) * C.BUMP_R });
  }

  function rnd(st) { let a = st.rs = (st.rs + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const mod = (a, n) => ((a % n) + n) % n;
  const repairFor = lv => C.REPAIR[Math.min(lv, C.REPAIR.length - 1)];
  const newBall = held => ({ x: 0, y: 0, vx: 0, vy: 0, out: 0, held, side: 0, arm: 0 });
  const lit = st => { let n = 0; for (let i = 0; i < C.SEGS; i++) n += st.lamps[i]; return n; };
  // what the next finished bank will put back into the rim
  const lampFactor = st => (C.LAMP_STEP ? 1 + Math.floor(lit(st) / C.LAMP_STEP) : 1);
  const repairNow = st => C.LAMPS ? lit(st) : repairFor(st.level);

  function create(seed) {
    const st = {
      seed: seed | 0, rs: Math.imul(seed | 0, 2654435761) | 0, t: 0, th: 0, om: 0,
      bs: [newBall(C.READY)], segs: new Array(C.SEGS).fill(C.HP), lamps: new Array(C.SEGS).fill(0), up: TARGETS.map(() => 1), bankT: [0, 0, 0],
      hubLit: 0, locks: 0, multi: 0, save: 0, skill: -1, spell: 0, ready: -1, round: null, roundIdx: 0, level: 0, mult: 1, ballTargets: 0, extraLit: 0, extraGiven: 0, jp: [0, 0, 0], superLit: 0,
      score: 0, balls: C.BALLS, phase: 'play', phaseT: 0, over: false,
      events: [], causes: {}, stats: { bounces: 0, backs: 0, targets: 0, banks: 0, bumps: 0, locks: 0, multiballs: 0, jackpots: 0, supers: 0, saves: 0, skills: 0, extends: 0, rounds: 0, rushes: 0, chases: 0, solos: 0, voids: 0, turns: 0, lastDir: 0 },
    };
    pickSkill(st); if (C.START_SAVE === 1 && C.SAVE) st.save = 1; return st;
  }
  function clone(s) {
    return {
      seed: s.seed, rs: s.rs, t: s.t, th: s.th, om: s.om, bs: s.bs.map(b => Object.assign({}, b)),
      segs: s.segs.slice(), lamps: s.lamps.slice(), up: s.up.slice(), bankT: s.bankT.slice(),
      hubLit: s.hubLit, locks: s.locks, multi: s.multi, save: s.save, skill: s.skill, spell: s.spell, ready: s.ready, round: s.round ? Object.assign({}, s.round) : null, roundIdx: s.roundIdx, level: s.level, mult: s.mult, ballTargets: s.ballTargets, extraLit: s.extraLit, extraGiven: s.extraGiven, jp: s.jp.slice(), superLit: s.superLit,
      score: s.score, balls: s.balls, phase: s.phase, phaseT: s.phaseT, over: s.over,
      events: [], causes: Object.assign({}, s.causes), stats: Object.assign({}, s.stats),
    };
  }
  function add(st, pts) { st.score += pts; }
  // the rim section under a table-frame angle, or -1 where the rim is gone (a standing neighbour within EDGE still catches)
  function segAt(st, a) {
    const i = mod(Math.floor(a / SEG_A), C.SEGS); if (st.segs[i] > 0) return i;
    const f = mod(a, SEG_A);
    if (f < C.EDGE) { const j = mod(i - 1, C.SEGS); if (st.segs[j] > 0) return j; }
    if (f > SEG_A - C.EDGE) { const j = mod(i + 1, C.SEGS); if (st.segs[j] > 0) return j; }
    return -1;
  }
  // a standing section in the open (never under a bank), away from the bottom of the screen: the table has to be turned to it
  function openSeg(st, not) {
    const ok = []; for (let i = 0; i < C.SEGS; i++) if (st.segs[i] > 0 && i % 4 !== 1 && i % 4 !== 2 && i !== not) ok.push(i);
    const far = ok.filter(i => Math.abs(mod(st.th + (i + 0.5) * SEG_A - Math.PI / 2 + Math.PI, TAU) - Math.PI) > 1), pool = far.length ? far : ok;
    return pool.length ? pool[(rnd(st) * pool.length) | 0] : -1;
  }
  // a new ball's skill shot: one such section, picked for the launch
  function pickSkill(st) { st.skill = C.SKILL ? openSeg(st, st.ready) : -1; }
  // rounds: the word is spelled by falling faces; then a section flashes, and landing on it starts the next round
  function soloPick(st) { const ok = []; for (let i = 0; i < TARGETS.length; i++) if (st.up[i]) ok.push(i); st.round.tgt = ok.length ? ok[(rnd(st) * ok.length) | 0] : -1; }
  function chaseNext(st) { const r = st.round; for (let k = 1; k <= C.SEGS; k++) { const j = mod(r.seg + k, C.SEGS); if (st.segs[j] > 0) { r.seg = j; return; } } }
  const rushValue = st => Math.round((C.PTS.rushLo + (C.PTS.rushHi - C.PTS.rushLo) * st.round.t / C.ROUND_T) / 100) * 100 * st.mult; // falls through the round
  // one more letter of the word; the last one makes a round ready on a flashing section
  function spellOne(st) {
    if (C.ROUNDS.length && !st.round && st.ready < 0 && st.spell < C.SPELL && ++st.spell >= C.SPELL) { st.ready = openSeg(st, st.skill); if (st.ready < 0) st.spell--; else st.events.push({ type: 'ready', seg: st.ready }); }
  }
  function endRound(st) {
    st.events.push({ type: 'roundEnd', kind: st.round.kind, n: st.round.n }); st.round = null;
    // every round of the cycle played: the hub lights for an extra ball
    if (st.roundIdx % C.ROUNDS.length === 0 && !st.extraLit && (!C.EXTRA_MAX || st.extraGiven < C.EXTRA_MAX)) { st.extraLit = 1; st.extraGiven++; st.events.push({ type: 'extraLit' }); }
  }
  function fire(st, b) { b.held = 0; b.x = 0; b.y = 0; b.vx = (b.side || (rnd(st) < 0.5 ? -1 : 1)) * (20 + rnd(st) * 40); b.vy = -160; b.out = 0; b.side = 0; b.arm = 0; st.events.push({ type: 'launch' }); }

  // a completed bank rebuilds the rim one bounce at a time, weakest standing-or-broken section first; a void section is gone for good
  function restore(st) {
    let n = repairNow(st), gain = 0;
    while (n-- > 0) { let j = -1; for (let i = 0; i < C.SEGS; i++) if (st.segs[i] >= 0 && st.segs[i] < C.HP && (j < 0 || st.segs[i] < st.segs[j])) j = i; if (j < 0) break; st.segs[j]++; gain++; }
    return gain;
  }

  function sub(st, b, dt) {
    const om = st.om;
    b.vy += C.G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    const c = Math.cos(st.th), s = Math.sin(st.th);
    if (b.out) return;
    // the hub: lit, it catches a ball that comes through the centre
    const r0 = Math.hypot(b.x, b.y); if (!b.arm && r0 > C.HUB_R + 6) b.arm = 1; // a ball fired from the hub has to leave it before it can be caught
    if (C.HUB && b.arm && r0 < C.HUB_R && (st.extraLit || st.superLit || (st.hubLit && !st.multi))) {
      b.x = b.y = b.vx = b.vy = 0; b.held = C.HOLD;
      if (st.superLit) { // all three banks' jackpots taken in this multiball: the hub pays three jackpots at once, and the banks light again
        const pts = C.PTS.super * st.mult; add(st, pts); st.superLit = 0; st.jp = [0, 0, 0]; st.stats.supers++; st.events.push({ type: 'super', pts });
      }
      if (st.extraLit) { // the extra ball is collected here, whatever else the hub is doing
        st.extraLit = 0; if (st.balls < C.STOCK_MAX) st.balls++; st.stats.extends++; st.events.push({ type: 'extend', balls: st.balls });
      }
      if (st.hubLit && !st.multi) {
        st.hubLit = 0; st.locks++; st.stats.locks++;
        const pts = C.PTS.lock * st.mult; add(st, pts);
        if (st.locks >= 2) { // second lock: both balls come back out, one after the other
          st.locks = 0; st.multi = 1; st.jp = [0, 0, 0]; st.superLit = 0; st.stats.multiballs++; b.side = -1; const b2 = newBall(C.HOLD + C.FIRE_GAP); b2.side = 1; st.bs.push(b2);
          st.events.push({ type: 'multiball', pts });
        } else st.events.push({ type: 'lock', n: st.locks, pts });
      }
      return;
    }
    // pop bumpers: thrown off along the normal, on top of the bumper's own motion
    for (let k = 0; k < C.BUMPERS; k++) {
      const B = BUMPERS[k], bx = c * B.x - s * B.y, by = s * B.x + c * B.y, dx = b.x - bx, dy = b.y - by, d = Math.hypot(dx, dy), lim = C.BR + C.BUMP_RAD;
      if (d >= lim) continue;
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1, ux = -om * by, uy = om * bx;
      let rx = b.vx - ux, ry = b.vy - uy; const vn = rx * nx + ry * ny;
      rx += (C.POP - vn) * nx; ry += (C.POP - vn) * ny; b.vx = rx + ux; b.vy = ry + uy; b.x = bx + nx * lim; b.y = by + ny * lim;
      const pts = C.PTS.bump * st.mult; add(st, pts); st.stats.bumps++; st.events.push({ type: 'bump', k, x: bx, y: by, pts });
    }
    // drop targets: the ball rebounds off the moving target; hit on its inner face, the target goes down
    const tx = c * b.x + s * b.y, ty = -s * b.x + c * b.y;
    for (let i = 0; i < TARGETS.length; i++) {
      if (!st.up[i]) continue;
      const T = TARGETS[i], dx = tx - T.x, dy = ty - T.y, lx = dx * T.et[0] + dy * T.et[1], ly = dx * T.er[0] + dy * T.er[1];
      const qx = Math.max(-C.T_HW, Math.min(C.T_HW, lx)), qy = Math.max(-C.T_HH, Math.min(C.T_HH, ly));
      let ex = lx - qx, ey = ly - qy; const d = Math.hypot(ex, ey); if (d >= C.BR) continue;
      if (d > 1e-6) { ex /= d; ey /= d; } else { ex = 0; ey = ly >= 0 ? 1 : -1; }
      const ntx = ex * T.et[0] + ey * T.er[0], nty = ex * T.et[1] + ey * T.er[1], nx = c * ntx - s * nty, ny = s * ntx + c * nty;
      const ux = -om * b.y, uy = om * b.x; let rx = b.vx - ux, ry = b.vy - uy; const vn = rx * nx + ry * ny;
      if (vn < 0) { rx -= (1 + C.T_E) * vn * nx; ry -= (1 + C.T_E) * vn * ny; b.vx = rx + ux; b.vy = ry + uy; }
      // only the face turned to the centre gives way; the back and the ends are steel
      if (ey > -C.FACE) {
        st.stats.backs++; const m = d > 1e-6 ? C.BR - d : C.BR; b.x += nx * m; b.y += ny * m; let off = 0;
        if (C.DEFLECT && ey > 0.5) { // the steel back is a deflector: it sends the ball along the bank toward the nearer end, out from under the roof
          const Tc = TARGETS[T.bank * 3 + 1], side = (tx - Tc.x) * T.et[0] + (ty - Tc.y) * T.et[1] >= 0 ? 1 : -1, qx = c * T.et[0] - s * T.et[1], qy = s * T.et[0] + c * T.et[1];
          // it does not bounce the ball back at the rim: the ball leaves sideways under the bank, with only a little speed away from it
          b.vx = side * C.DEFLECT * qx + C.DEFLECT_OUT * nx + ux; b.vy = side * C.DEFLECT * qy + C.DEFLECT_OUT * ny + uy; off = side;
        }
        st.events.push({ type: 'back', i, bank: T.bank, side: off }); break;
      }
      st.up[i] = 0; st.stats.targets++; st.ballTargets++;
      let mend = -1; if (C.TARGET_REPAIR) { for (let q = 0; q < C.SEGS; q++) if (st.segs[q] >= 0 && st.segs[q] < C.HP && (mend < 0 || st.segs[q] < st.segs[mend])) mend = q; if (mend >= 0) st.segs[mend]++; } // every face that falls puts one landing back into the weakest section
      let pts = C.PTS.target * st.mult, solo = 0;
      if (st.round && st.round.kind === 'solo' && st.round.tgt === i) { // the one lit face
        const r = st.round; solo = ++r.n; pts += C.PTS.solo * r.n * st.mult; st.stats.solos++;
        if (r.n >= C.SOLO_HITS) { if (C.SAVE) st.save = 1; endRound(st); } else soloPick(st);
      }
      add(st, pts);
      if (!solo) spellOne(st);
      st.events.push({ type: 'target', i, bank: T.bank, pts, solo, spell: st.spell, mend });
      const k = T.bank;
      if (!st.up[k * 3] && !st.up[k * 3 + 1] && !st.up[k * 3 + 2]) {
        const jackpot = st.multi && !st.jp[k] ? 1 : 0; // in a multiball each bank is a jackpot once
        const lamps = lit(st), lampX = lampFactor(st); // the lamps lit when the bank falls raise what it pays: x2 from four, x3 from eight, x4 with all twelve
        let bp = (jackpot ? C.PTS.jackpot : C.PTS.bank) * st.mult * lampX, rush = 0;
        if (st.round && st.round.kind === 'rush') { rush = rushValue(st); bp += rush; st.stats.rushes++; st.round.n++; endRound(st); } // the falling value is taken by the first bank finished
        add(st, bp);
        if (jackpot) { st.stats.jackpots++; st.jp[k] = 1; }
        const gain = restore(st); st.lamps.fill(0);
        st.level++; st.stats.banks++; st.bankT[k] = C.RESET; if (st.mult < C.MULT_MAX) st.mult++;
        if (C.HUB && !st.multi) st.hubLit = 1;
        st.events.push({ type: 'bank', bank: k, pts: bp, level: st.level, gain, lamps, lampX, jackpot, rush });
        if (jackpot && st.jp[0] && st.jp[1] && st.jp[2]) { st.superLit = 1; st.events.push({ type: 'superLit' }); }
        // the table hardens as banks fall: every so often the weakest section is torn out for good
        if (C.VOID_EVERY && st.level % C.VOID_EVERY === 0) {
          let j = -1; for (let i = 0; i < C.SEGS; i++) if (st.segs[i] >= 0 && (j < 0 || st.segs[i] < st.segs[j])) j = i;
          if (j >= 0 && st.segs.filter(h => h >= 0).length > C.VOID_FLOOR) { st.segs[j] = -1; st.lamps[j] = 0; st.stats.voids++; st.events.push({ type: 'void', seg: j }); }
        }
      }
      break;
    }
    // the rim: a standing section throws the ball back toward the centre, drags it sideways if the table is turning, and wears
    const r = Math.hypot(b.x, b.y), lim = C.R - C.BR;
    if (r > lim) {
      const px = b.x / r, py = b.y / r, vn = b.vx * px + b.vy * py;
      if (vn > 0) {
        const i = segAt(st, Math.atan2(ty, tx));
        if (i < 0) { b.out = 1; st.events.push({ type: 'through', x: b.x, y: b.y }); return; }
        const qx = -py, qy = px, vt = (b.vx * qx + b.vy * qy) * (1 - C.GRIP) + om * C.R * C.GRIP;
        b.vx = -C.KICK * px + vt * qx; b.vy = -C.KICK * py + vt * qy; b.x = px * lim; b.y = py * lim;
        st.segs[i]--; st.stats.bounces++;
        const ev = { type: 'rim', seg: i, hp: st.segs[i], x: b.x, y: b.y, throw: om * C.R * C.GRIP, lamp: 0 };
        if (st.skill >= 0) { // the first landing of a new ball
          if (i === st.skill) { const pts = C.PTS.skill * st.mult; add(st, pts); st.stats.skills++; ev.skill = pts; if (C.SKILL_AWARD === 'letters' || (C.SKILL_AWARD === 'either' && st.save)) { st.skill = -1; for (let k = 0; k < C.SKILL_LETTERS; k++) spellOne(st); ev.letters = C.SKILL_LETTERS; } else if (C.SAVE) { st.save = 1; ev.save = 1; } } // made: one save, or letters of the word
          st.skill = -1;
        }
        if (C.LAMPS && !st.lamps[i]) { st.lamps[i] = 1; ev.lamp = 1; }
        if (st.round && st.round.kind === 'chase' && st.round.seg === i) { // caught the running light
          const r = st.round, pts = C.PTS.chase * ++r.n * st.mult; add(st, pts); st.stats.chases++; ev.chase = pts; chaseNext(st); r.next = C.CHASE_STEP; if (C.CHASE_HITS && r.n >= C.CHASE_HITS) endRound(st); // caught often enough: the round is done
        }
        if (st.ready === i && !st.round) { // the flashing section: the round begins
          const kind = C.ROUNDS[st.roundIdx++ % C.ROUNDS.length]; st.ready = -1; st.spell = 0; st.stats.rounds++;
          st.round = { kind, t: kind === 'chase' && C.CHASE_T ? C.CHASE_T : C.ROUND_T, n: 0, seg: i, tgt: -1, next: C.CHASE_STEP };
          if (kind === 'chase') chaseNext(st); else if (kind === 'solo') soloPick(st);
          ev.round = kind;
        }
        st.events.push(ev);
      }
    }
  }

  // input: { dir: -1 | 0 | 1 }  (+1 turns the table clockwise on screen)
  function step(st, input) {
    st.events = []; if (st.over) return st;
    st.t++;
    const dir = input && input.dir ? (input.dir > 0 ? 1 : -1) : 0;
    if (dir !== st.stats.lastDir) { st.stats.lastDir = dir; if (dir) st.stats.turns++; }
    const want = dir * C.OMEGA; st.om += Math.max(-C.ACC, Math.min(C.ACC, want - st.om));
    const dt = C.TICK / C.SUB;
    for (let k = 0; k < C.BANKS; k++) if (st.bankT[k] > 0 && --st.bankT[k] === 0) {
      // stand the bank back up, unless a ball is in the way
      const c = Math.cos(st.th), s = Math.sin(st.th); let clear = true;
      for (const b of st.bs) { const tx = c * b.x + s * b.y, ty = -s * b.x + c * b.y; for (let j = 0; j < 3; j++) { const T = TARGETS[k * 3 + j]; if (Math.hypot(tx - T.x, ty - T.y) < 16) clear = false; } }
      if (!clear) st.bankT[k] = 6; else { for (let j = 0; j < 3; j++) st.up[k * 3 + j] = 1; st.events.push({ type: 'reset', bank: k }); }
    }
    if (st.phase === 'lost') {
      for (let i = 0; i < C.SUB; i++) st.th += st.om * dt;
      if (--st.phaseT <= 0) {
        if (st.balls <= 0) { st.over = true; st.phase = 'over'; st.events.push({ type: 'over' }); }
        else { // the next ball finds every hole and every last-landing section built back up to two landings
          for (let i = 0; i < C.SEGS; i++) if (st.segs[i] >= 0 && st.segs[i] < C.NEW_BALL_HP) st.segs[i] = C.NEW_BALL_HP;
          st.phase = 'play'; st.bs = [newBall(C.READY)]; pickSkill(st); if (C.START_SAVE && C.SAVE) st.save = 1; st.events.push({ type: 'patch' });
        }
      }
      return st;
    }
    for (const b of st.bs) if (b.held > 0 && --b.held === 0) fire(st, b);
    if (st.ready >= 0 && st.segs[st.ready] <= 0) st.ready = openSeg(st, st.skill); // the flashing section broke: another takes over
    if (st.round) {
      const r = st.round;
      if (r.kind === 'chase' && (--r.next <= 0 || st.segs[r.seg] <= 0)) { chaseNext(st); r.next = C.CHASE_STEP; }
      if (r.kind === 'solo' && (r.tgt < 0 || !st.up[r.tgt])) soloPick(st);
      if (--r.t <= 0) endRound(st);
    }
    for (let i = 0; i < C.SUB; i++) {
      st.th += st.om * dt;
      for (let n = 0; n < st.bs.length; n++) {
        const b = st.bs[n]; if (b.held > 0) continue;
        sub(st, b, dt);
        if (b.out && Math.hypot(b.x, b.y) > C.R + C.OUT) {
          const cause = Math.abs(Math.atan2(b.x, b.y)) < Math.PI / 4 ? 'drop' : 'fling'; // out through the bottom quarter, or thrown out elsewhere
          st.bs.splice(n--, 1);
          if (st.bs.length) { st.multi = 0; st.jp = [0, 0, 0]; st.superLit = 0; st.events.push({ type: 'drain', cause, x: b.x, y: b.y }); } // one of two: the multiball is over, the ball in hand is not
          else if (st.save) { st.save = 0; st.stats.saves++; st.bs.push(newBall(C.SAVE_HOLD)); st.events.push({ type: 'saved', cause, x: b.x, y: b.y }); }
          else {
            st.balls--; st.causes[cause] = (st.causes[cause] || 0) + 1; st.multi = 0; st.locks = 0; st.hubLit = 0; st.jp = [0, 0, 0]; st.superLit = 0; if (st.round) endRound(st);
            const bonus = st.ballTargets * C.PTS.bonus * st.mult, counted = st.ballTargets, mult = st.mult;
            st.events.push({ type: 'lost', cause, x: b.x, y: b.y, balls: st.balls, bonus, counted, mult });
            add(st, bonus); st.ballTargets = 0; st.mult = 1; st.phase = 'lost'; st.phaseT = C.LOST;
          }
        }
      }
      if (st.phase !== 'play') break;
    }
    return st;
  }

  const api = { C, TAU, SEG_A, TARGETS, BUMPERS, BANK_A, create, clone, step, segAt, repairFor, repairNow, lampFactor, rushValue, lit, mod };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OT = api;
})(this);
