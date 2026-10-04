// ZIG SABER — rules core (browser global ZS / Node module). Deterministic, 60 ticks per second, no rendering.
// One button: every press flips the ship's vertical direction AND fires along its row.
(function (root) {
  'use strict';
  const C = {
    W: 256, H: 224, HUD: 16, T: 8, ROWS: 26,
    SHIP_X: 44, NOSE: 8,          // ship centre x on screen, nose offset
    VY: 1.6, SCROLL: 1.2,         // px per tick
    SHOT_V: 14,       // wave speed, blade reach in front of the nose
    AHEAD: 30, BACK: 6, MID: 12,  // the swing covers the side the ship was heading for: 30 px ahead of its row, 6 behind
    LASER_MAX: 3, DECAY: [0, 900, 600, 420], // laser level 0-3: a capsule adds one; a level lasts 15 / 10 / 7 s, the higher the shorter
    REACH: [64, 96, 128, 160],    // blade reach in front of the nose by laser level
    CHAIN_MAX: 4, CHAIN_T: [0, 150, 120, 90, 60], // cutting swings raise the cut multiplier up to x5; without a cut it drops a step after 2.5 / 2 / 1.5 / 1 s, the higher the sooner
      // stock limit, shots per capsule
    MARK: 40, GUARD: 30,          // ticks an entry is announced at the right edge; ticks a spent laser charge shields the ship
    READY: 110, READY_BACK: 60, BACKUP: 144, DEAD: 80, CLEAR: 200, // BACKUP: px of scroll a lost ship is set back (2 s)
    LIVES: 3, EXTEND: [200000, 600000, 1400000, 3000000], EXTEND_EVERY: Infinity, // four extra ships at most; the gap doubles each time
    NO_MISS: 5, GEM_PERFECT: 100000, GATE_SEC: 5000, // zone bonus x5 without losing a ship in it; every gem of a zone; per second left on the gate
    HEAT: 0.08, CLOSE: 24,        // heat: every chain step makes new enemies 8 % faster and adds aimed drones; a cut within 24 px of the nose pays double
    LOOPS: 2, SHIP_BONUS: 50000,  // the game is two loops long; clearing it pays for every ship left
    GEM_CAP: 8, ZONE_BONUS: 10000, LOOP_BONUS: 20000, BOSS_BONUS: 20000,
    // the gate at the end of the loop: five core rows behind five steel plates
    BOSS: { FACE: 208, ROWS: 5, Y0: 50, DY: 35, HP: 24, HPR: 0, PLATE_V: 1.2, PLATES: 2, OPEN: 270, ARM: 30, LAUNCH: 70, EMIT: 100, ESCORT: 3, TIME: 4500, CUT: 3, AWAY: 100, AWAY_V: 0.7 },
  };
  const KIND = {
    drone: { w: 12, h: 10, v: 2.4, far: 100, cut: 300 },
    train: { w: 12, h: 10, v: 2.0, far: 100, cut: 300 },
    shell: { w: 14, h: 12, v: 1.6, far: 0, cut: 500, armor: true },
    plate: { w: 10, h: 30, v: 2.0, far: 0, cut: 500, armor: true }, // a plate thrown by the gate: cut it and its row of the core lies open
    plug: { w: 8, h: 56, v: 1.2, far: 0, cut: 500, armor: true },   // a seal across a side lane: part of the rock, opened only by the blade
    rusher: { w: 14, h: 8, v: 5.6, far: 200, cut: 600, warn: 20 },
  };
  const TRAIN_GAP = 18, trainLen = loop => 3 + (loop >= 1 ? 1 : 0) + (loop >= 3 ? 1 : 0); // one swing can take three; longer trains need two, or the laser

  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- course: terrain columns (8 px), enemy script, gems. Same every run (fixed course, learnable). ----------
  const courses = {};
  function buildCourse(loop) {
    if (courses[loop]) return courses[loop];
    const R = C.ROWS, ceil = [], flo = [], i0 = [], i1 = [], zones = [], cps = [], gems = [], events = [], forced = [];
    const rnd = mulberry(8128), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const push = (c, f, a, b) => { ceil.push(c); flo.push(f); i0.push(a || 0); i1.push(b || 0); };
    const flat = n => { for (let k = 0; k < n; k++) push(2, 2); };
    const ease = (c1, f1) => { // walk both surfaces to (c1, f1) one tile per column
      let c = ceil[ceil.length - 1], f = flo[flo.length - 1];
      while (c !== c1 || f !== f1) { c += Math.sign(c1 - c); f += Math.sign(f1 - f); push(c, f); }
    };
    const cp = () => cps.push(ceil.length + 2);
    flat(44); // lead-in: a full open screen

    // zone 1 CANYON: wide, rolling floor and hanging rock; gap >= 13 tiles
    let z0 = ceil.length; cp();
    {
      const MING = 13; let c = 2, f = 2, ct = 2, ft = 2, ch = 6, fh = 3;
      for (let n = 0; n < 400; n++) {
        if (n === 200) { ct = 2; ft = 2; ch = fh = 44; }
        if (n === 216) cp();
        if (c === ct && --ch <= 0) { ct = ri(1, Math.min(13, R - MING - Math.max(f, ft))); if (rnd() < 0.35) ct = ri(1, 2); ch = ri(4, 14); }
        if (f === ft && --fh <= 0) { ft = ri(1, Math.min(13, R - MING - Math.max(c, ct))); if (rnd() < 0.3) ft = ri(1, 2); fh = ri(4, 14); }
        c += Math.sign(ct - c); f += Math.sign(ft - f); push(c, f);
      }
      ease(2, 2); flat(10);
    }
    zones.push({ name: 'CANYON', c0: 0, c1: ceil.length });

    // zone 2 CAVERN: a winding tube, 9-12 tiles wide, 45-degree bends
    z0 = ceil.length; cp();
    {
      let g = 14, m = 13, mt = 13, hold = 4, slow = 0;
      for (let n = 0; n < 400; n++) {
        if (n === 194) { mt = 13; hold = 34; }
        if (n === 212) cp();
        const narrow = n > 24 && !(n > 186 && n < 236);
        if (m === mt && --hold <= 0) { g = narrow ? ri(11, 13) : 14; const h = Math.ceil(g / 2); mt = ri(h + 1, R - h - 1); hold = ri(4, 12); slow = rnd() < 0.3 ? 1 : 0; }
        if (!slow || n % 2) m += Math.sign(mt - m);
        const h = g / 2, c = Math.max(1, Math.round(m - h)), f = Math.max(1, R - Math.round(m + h));
        const pc = ceil[ceil.length - 1], pf = flo[flo.length - 1]; // never steeper than one tile per column
        push(pc + Math.max(-1, Math.min(1, c - pc)), pf + Math.max(-1, Math.min(1, f - pf)));
      }
      ease(2, 2); flat(10);
    }
    zones.push({ name: 'CAVERN', c0: z0, c1: ceil.length });

    // zone 3 FORTRESS: rectilinear gates, teeth and islands that split the way in two
    z0 = ceil.length; cp();
    {
      let open = 9, n = 0, mid = false, loose = true; // loose: the ship may be anywhere, so the next gate stays central and far
      const gate = () => { const far = loose ? ri(14, 18) : ri(9, 14), sw = Math.floor(far * 0.6); flat(far); const a = Math.max(4, Math.min(R - 13, (loose ? 8 : open) + ri(-(loose ? 3 : sw), loose ? 3 : sw))); for (let k = 0; k < 3; k++) push(a, R - a - 9); gems.push({ wx: (ceil.length - 2) * 8 + 4, y: C.HUD + (a + 4.5) * 8, zone: 2 }); open = a; n += far + 3; loose = false; }; // a gem in the middle of every gate
      // teeth: a gem 24 px off the tip of every tooth
      const teeth = () => { const up = rnd() < 0.5; for (let k = 0; k < 3; k++) { flat(13); const h = ri(9, 11); const cei = (k % 2 === 0) === up; for (let j = 0; j < 4; j++) cei ? push(h, 2) : push(2, h); gems.push({ wx: (ceil.length - 2) * 8, y: C.HUD + (cei ? h + 3 : R - h - 3) * 8, zone: 2 }); } flat(3); n += 54; loose = true; };
      const island = () => { // splits the way into a wide lane and a sealed 7-tile lane that holds gems and a capsule
        flat(13); const top = rnd() < 0.5, a = top ? 9 : 13, len = ri(22, 30), c0 = ceil.length, y = C.HUD + (top ? 5.5 : 20.5) * 8;
        for (let k = 0; k < len; k++) push(2, 2, a, a + 4);
        forced.push({ wx: (c0 + 1) * 8 + 4, type: 'plug', y });
        for (let k = 0; k < 4; k++) gems.push({ wx: (c0 + 6 + k * 4) * 8, y, zone: 2 }); // on the lane's centre line
        forced.push({ wx: (c0 + len - 3) * 8, type: 'capitem', y });
        flat(3); n += 16 + len; loose = true;
      };
      const feats = [gate, gate, teeth, island];
      while (n < 400) {
        if (!mid && n > 195) { flat(20); n += 20; cps.push(ceil.length - 16); mid = true; loose = true; }
        feats[ri(0, feats.length - 1)]();
      }
      flat(12);
    }
    zones.push({ name: 'FORTRESS', c0: z0, c1: ceil.length });
    const end = ceil.length; flat(760); // the gate's corridor: flat, and long enough for the whole fight

    const course = { loop, n: ceil.length, ceil, flo, i0, i1, zones, cps, gems, events, end };

    // gems: fixed bonus points hugging the rock, alternating sides so a full chain is a route
    {
      const g = mulberry(77); let side = 1, x = 50;
      while (x < zones[2].c0 - 4) { // canyon and cavern: hugging the rock; the fortress places its own, on the flight line
        const y = side > 0 ? C.HUD + (R - flo[x]) * 8 - 12 : C.HUD + ceil[x] * 8 + 12;
        const zi = zones.findIndex(z => x < z.c1);
        if (clearRow(course, x * 8 - 20, x * 8 + 28, y, 7) && !i1[x] && Math.abs(flo[x + 1] - flo[x - 1]) + Math.abs(ceil[x + 1] - ceil[x - 1]) <= 2) { gems.push({ wx: x * 8 + 4, y, zone: zi }); side = g() < 0.7 ? -side : side; x += 22 + Math.floor(g() * 14); } else x += 2;
      }
    }

    // enemy script: world column at which each wave enters at the right edge
    {
      const e = mulberry(4242 + loop * 131), rank = Math.min(loop, 6), spd = 1 + 0.1 * rank;
      const MIX = [ // weights per zone: drone, train, shell, aimed drone, rusher, convoy, pincer, chaser
        [5, 3, 1, 2 + rank, rank, loop ? 1 : 0, loop ? 1 : 0, 0], [4, 3, 2, 2 + rank, rank, 2, 2, 1], [3, 3, 3, 2 + rank, 1 + rank, 2, 2, 2]];
      const GAP = [[loop ? 9 : 12, loop ? 16 : 20], [10, 18], [9, 16]];
      let col = 60, trainNo = 0; // only every fourth train (convoys included) is a red carrier with a capsule
      while (col < end - 30) {
        const wx = col * 8, zi = Math.max(0, zones.findIndex(z => col < z.c1));
        const w = MIX[zi], tot = w.reduce((a, b) => a + b, 0); let r = e() * tot, k = 0; while (r >= w[k]) r -= w[k++];
        const type = ['drone', 'train', 'shell', 'aimed', 'rusher', 'convoy', 'pincer', 'chaser'][k];
        const dens = 1 / (1 + 0.18 * rank), ga = GAP[zi];
        if (type === 'aimed' || type === 'rusher') events.push({ wx, type, spd, n: type === 'aimed' ? Math.min(4, 1 + rank) : 1 }); // later loops: aimed drones come in volleys
        else {
          // compound waves are made of the same pieces: convoy = a shell leading a train in one row (the wave cannot
          // reach the train until the shell is cut), pincer = two trains at once, far apart, chaser = a train, then a rusher
          const base = type === 'drone' || type === 'shell' ? type : 'train';
          const K = KIND[base], v = K.v * spd, tn = trainLen(loop), extra = base === 'train' ? (tn - 1) * TRAIN_GAP + (type === 'convoy' ? 26 : 0) : 0;
          const span = (C.W + 24 + extra) * (v - C.SCROLL) / v; // world distance flown while on screen
          const rows = []; for (let y = C.HUD + 12; y <= C.H - 12; y += 4) if (clearRow(course, wx - span - 8, wx + extra + 16, y, 9)) rows.push(y);
          if (rows.length) {
            const y = rows[Math.floor(e() * rows.length)];
            events.push({ wx, type: type === 'convoy' ? 'convoy' : base, spd, n: tn, y, carrier: base === 'train' && trainNo++ % 4 === 0 });
            if (type === 'pincer') { const far = rows.filter(q => Math.abs(q - y) >= 64); if (far.length) events.push({ wx, type: 'train', spd, n: tn, y: far[Math.floor(e() * far.length)], carrier: false }); }
            if (type === 'chaser') events.push({ wx: wx + 40, type: 'rusher', spd, n: 1 });
          }
        }
        col += Math.max(5, Math.round((ga[0] + e() * (ga[1] - ga[0])) * dens)) + (type === 'train' ? 5 : 0);
      }
    }
    for (const f of forced) events.push(f);
    events.sort((a, b) => a.wx - b.wx); gems.sort((a, b) => a.wx - b.wx);
    courses[loop] = course; return course;
  }
  function solidCol(co, col, row) {
    if (row < 0 || row >= C.ROWS) return true;
    if (col < 0 || col >= co.n) return row < 2 || row >= C.ROWS - 2;
    return row < co.ceil[col] || row >= C.ROWS - co.flo[col] || (row >= co.i0[col] && row < co.i1[col]);
  }
  function solid(co, wx, y) { return solidCol(co, Math.floor(wx / 8), Math.floor((y - C.HUD) / 8)); }
  function clearRow(co, wx0, wx1, y, half) {
    const r0 = Math.floor((y - half - C.HUD) / 8), r1 = Math.floor((y + half - C.HUD) / 8);
    for (let col = Math.floor(wx0 / 8); col <= Math.floor(wx1 / 8); col++) for (let r = r0; r <= r1; r++) if (solidCol(co, col, r)) return false;
    return true;
  }
  // free distance along row y, from screen x to the first rock (or the right edge)
  function reach(st, x, y, max) {
    const co = st.course; let d = 0;
    while (d < max && x + d < C.W) { if (solid(co, st.camX + x + d, y)) break; d += 2; }
    return Math.min(d, max);
  }
  // the hull is smaller than the sprite: nose, tail and two points on the body
  function hitsRock(co, wx, y, m) { return solid(co, wx + 5 + m, y) || solid(co, wx - 4 - m, y - 2 - m) || solid(co, wx - 4 - m, y + 2 + m) || solid(co, wx + 1, y - 2 - m) || solid(co, wx + 1, y + 2 + m); }
  function gapMid(co, col) { return C.HUD + (co.ceil[col] + C.ROWS - co.flo[col]) * 4; }

  // ---------- state ----------
  function newGame(opts) {
    opts = opts || {};
    const st = {
      loop: opts.loop || 0, course: null, camX: 0, t: 0, phase: 'ready', phaseT: C.READY,
      ship: { y: 120, dir: -1 }, shot: null, laser: 0, zoneLost: 0, boss: null, enemies: [], items: [], pending: [], marks: [], guardT: 0, chain: 0, chainT: 0, laserT: 0, trains: {}, trainSeq: 0,
      nextEv: 0, gemTaken: null, gemChain: 0, nextGem: 0, zone: 0, cp: 0,
      score: 0, lives: C.LIVES, nextExtend: C.EXTEND[0], extends: 0, events: [],
      stats: { heatDrones: 0, closeCuts: 0, noMiss: 0, gemPerfect: 0, gateSec: 0, bossHits: 0, bossKills: 0, plates: 0, chainDrops: 0, rams: 0, guards: 0, maxChain: 0, decays: 0, longCuts: 0, presses: 0, dry: 0, far: 0, cut: 0, beam: 0, beamKills: 0, multi: 0, pings: 0, caps: 0, capDrops: 0, gems: 0, deaths: 0, deathBy: {}, zones: 0, loops: 0, maxCut: 0 },
    };
    setCourse(st, st.loop); placeAt(st, opts.cp || 0);
    if (opts.zone) placeAt(st, st.course.cps.findIndex(c => c >= st.course.zones[opts.zone].c0));
    return st;
  }
  function setCourse(st, loop) { st.loop = loop; st.course = buildCourse(loop); st.gemTaken = new Uint8Array(st.course.gems.length); }
  // tallest open run of tiles in a column: [height in px, centre y]
  function openRun(co, col) {
    let best = 0, mid = 120, r0 = -1;
    for (let r = 0; r <= C.ROWS; r++) { const open = r < C.ROWS && !solidCol(co, col, r); if (open && r0 < 0) r0 = r; if (!open && r0 >= 0) { if (r - r0 > best) { best = r - r0; mid = C.HUD + (r0 + r) * 4; } r0 = -1; } }
    return [best * 8, mid];
  }
  // A lost ship comes back a little before the place it was lost (about 2 s of flight), not at the start of the zone:
  // the nearest spot behind where the ship has 36 px of room above and below for the whole first second.
  function rewind(st) {
    const co = st.course, first = st.boss ? (co.end + 4) * 8 - C.SHIP_X : co.cps[0] * 8 - C.SHIP_X - 8; let cam = Math.max(first, Math.round((st.camX - C.BACKUP) / 8) * 8);
    const roomy = c => { const wx = c + C.SHIP_X, [h, y] = openRun(co, Math.floor(wx / 8)); return h >= 80 && clearRow(co, wx - 12, wx + 80, y, 36); }; // 36 px clear above and below, for the first second
    while (cam > first && !roomy(cam)) cam -= 8;
    if (st.boss) for (const p of st.boss.plates) if (p.s !== 'open') { p.s = 'on'; p.t = 0; }
    const z = st.zone; placeCam(st, cam); st.zone = Math.max(z, st.zone); // a zone bonus is paid once, even if the ship is set back across the line
  }
  function placeAt(st, cpi) { st.cp = cpi; placeCam(st, Math.max(0, st.course.cps[cpi] * 8 - C.SHIP_X - 8)); }
  function placeCam(st, cam) {
    const co = st.course;
    st.camX = cam;
    st.ship.y = openRun(co, Math.floor((st.camX + C.SHIP_X) / 8))[1]; st.ship.dir = -1;
    st.shot = null; st.laser = 0; st.enemies = []; st.items = []; st.pending = []; st.marks = []; st.guardT = 0; st.chain = 0; st.chainT = 0; st.laserT = 0; st.trains = {}; st.gemChain = 0;
    st.nextEv = co.events.findIndex(e => e.wx - C.MARK * C.SCROLL >= st.camX + C.W); if (st.nextEv < 0) st.nextEv = co.events.length;
    st.nextGem = co.gems.findIndex(g => g.wx >= st.camX + C.SHIP_X - 8); if (st.nextGem < 0) st.nextGem = co.gems.length;
    st.zone = zoneOf(st);
  }
  function zoneOf(st) { const col = (st.camX + C.SHIP_X) / 8, z = st.course.zones; for (let i = 0; i < z.length; i++) if (col < z[i].c1) return i; return z.length - 1; }
  function clone(st) {
    const s = Object.assign({}, st);
    s.ship = { y: st.ship.y, dir: st.ship.dir }; s.shot = st.shot ? { x: st.shot.x, y: st.shot.y, d: st.shot.d } : null;
    s.enemies = st.enemies.map(e => Object.assign({}, e)); s.pending = st.pending.slice(); s.marks = st.marks.slice(); if (st.boss) s.boss = Object.assign({}, st.boss, { plates: st.boss.plates.map(p => ({ s: p.s, t: p.t })) }); s.items = st.items.map(e => Object.assign({}, e));
    s.trains = {}; for (const k in st.trains) s.trains[k] = Object.assign({}, st.trains[k]);
    s.gemTaken = st.gemTaken.slice(); s.events = []; s.stats = Object.assign({}, st.stats, { deathBy: Object.assign({}, st.stats.deathBy) });
    return s;
  }

  function add(st, pts) {
    st.score += pts;
    while (st.score >= st.nextExtend) { st.lives++; st.extends++; st.nextExtend = st.extends < C.EXTEND.length ? C.EXTEND[st.extends] : st.nextExtend + C.EXTEND_EVERY; st.events.push({ type: 'extend' }); }
  }
  const heat = st => 1 + C.HEAT * st.chain;
  function spawn(st, type, y, spd, train, len, lag) {
    const K = KIND[type], n = train ? len : 1;
    for (let k = 0; k < n; k++) st.enemies.push({ type, x: C.W + 8 + (lag || 0) + k * TRAIN_GAP, y, v: K.v * spd * heat(st), w: K.w, h: K.h, train: train || 0, warn: K.warn || 0, age: 0 });
  }
  // nearest row to y that a new enemy can fly along from the right edge to the left
  function aimRow(st, y, type, spd) {
    const K = KIND[type], v = K.v * spd, wx = st.camX + C.W + 8, span = (C.W + 24) * (v - C.SCROLL) / v;
    for (let d = 0; d <= 48; d += 4) for (const s of d ? [1, -1] : [1]) { const yy = Math.round(y) + s * d; if (yy > C.HUD + 10 && yy < C.H - 10 && clearRow(st.course, wx - span - 8, wx + 8, yy, K.h / 2 + 3)) return yy; }
    return -1;
  }
  function kill(st, e, how, k, mult, near) {
    const K = KIND[e.type], close = how === 'cut';
    const base = close ? K.cut : (K.far || 200), pts = e.gate ? base : base * Math.min(8, 1 << k) * (close ? mult || 1 : 1) * (near ? 2 : 1); // the gate's own plates and drones pay plain value: the fight is not for milking
    e.dead = true; add(st, pts);
    if (e.type === 'plate' && st.boss) { const p = st.boss.plates[e.plate]; p.s = 'open'; p.t = C.BOSS.OPEN; st.stats.plates++; st.events.push({ type: 'opened', y: e.y }); }
    if (how === 'cut') st.stats.cut++; else if (how === 'far') st.stats.far++;
    st.events.push({ type: 'kill', x: e.x, y: e.y, kind: e.plain ? 'plain' : e.type, how, k, pts, near: !!near });
    if (e.train) {
      const tr = st.trains[e.train]; tr.killed++;
      if (tr.killed === tr.n && !tr.escaped && tr.carrier !== false) { st.items.push({ type: 'cap', x: e.x, y: e.y }); st.stats.capDrops++; st.events.push({ type: 'capdrop', x: e.x, y: e.y }); }
    }
  }
  // ---------- the gate (boss). It throws its own plates; nothing it sends out is a bullet, everything can be destroyed. ----------
  const rowY = i => C.BOSS.Y0 + i * C.BOSS.DY;
  function newBoss(st) { const B = C.BOSS, rank = Math.min(st.loop, 6); return { x: C.W + 60, t: 0, hp: B.HP + B.HPR * rank, hp0: B.HP + B.HPR * rank, plates: Array.from({ length: B.ROWS }, () => ({ s: 'on', t: 0 })), launchT: 60, emitT: B.EMIT, emitN: 0, left: B.TIME, flash: 0 }; }
  const bossIn = st => st.boss && !st.boss.dead && !st.boss.leaving && st.boss.x <= C.BOSS.FACE;
  // core rows covered by a swing or wave made at row y while heading d
  function coreRows(y, d) { const out = []; for (let i = 0; i < C.BOSS.ROWS; i++) { const t = (rowY(i) - y) * d; if (t >= -(C.BACK + 16) && t <= C.AHEAD + 16) out.push(i); } return out; }
  function hurtBoss(st, dmg, how) {
    const b = st.boss; b.hp -= dmg; b.flash = 8; st.stats.bossHits++;
    const rows = Math.max(1, b.plates.filter(p => p.s === 'open').length + (how === 'cut' ? 1 : 0)); // the cut has just shut its own row
    const pts = (how === 'cut' ? 1000 * (1 + st.chain) : 200) * rows; add(st, pts);
    st.events.push({ type: 'bosshit', how, x: C.BOSS.FACE, pts, rows, hp: Math.max(0, b.hp) });
    if (b.hp <= 0) { b.dead = true; st.stats.bossKills++; st.enemies = []; st.pending = []; st.shot = null; const sec = Math.floor(b.left / 60), pts = (C.BOSS_BONUS + sec * C.GATE_SEC) * (st.loop + 1); st.stats.gateSec += sec; add(st, pts); st.events.push({ type: 'bossdead', pts, sec }); endLoop(st, true); }
  }
  function endLoop(st, won) {
    st.phase = 'clear'; st.phaseT = C.CLEAR; st.stats.zones++; st.stats.loops++; st.enemies = []; st.pending = []; st.marks = []; st.shot = null; st.won = !!won;
    const pts = won ? C.LOOP_BONUS * (st.loop + 1) : 0; add(st, pts); st.events.push({ type: 'loop', loop: st.loop, pts, won: !!won });
    if (st.loop + 1 >= C.LOOPS) { st.final = true; st.cleared = !!won; if (won) { st.tally = st.lives; st.tallied = 0; st.events.push({ type: 'allclear', ships: st.lives }); } } // the ships are paid out one by one after the clear screen
  }
  function stepBoss(st) {
    const b = st.boss, B = C.BOSS, rank = Math.min(st.loop, 6), spd = 1 + 0.1 * rank; b.t++; if (b.flash > 0) b.flash--;
    if (b.x > B.FACE && !b.leaving) { b.x -= 2; return; }
    // it does not wait for ever. At zero it shuts every plate, calls its plates back and pulls away to the right;
    // nothing can hurt it any more, and when it is off the screen the loop ends with no bonus
    if (b.leaving) { b.x += B.AWAY_V; if (--b.leaving <= 0) { b.dead = true; endLoop(st, false); } return; }
    if (--b.left <= 0) {
      b.leaving = B.AWAY; for (const p of b.plates) { p.s = 'on'; p.t = 0; }
      for (const e of st.enemies) if (e.type === 'plate') e.dead = true;
      st.enemies = st.enemies.filter(e => !e.dead); st.events.push({ type: 'bossaway' }); return;
    }
    for (let i = 0; i < B.ROWS; i++) {
      const p = b.plates[i];
      if (p.s === 'arm' && --p.t <= 0) { const K = KIND.plate; p.s = 'fly'; st.enemies.push({ type: 'plate', x: B.FACE - 4, y: rowY(i), v: K.v * spd * (B.PLATE_V || 1) * heat(st), w: K.w, h: K.h, train: 0, warn: 0, age: 99, plate: i, gate: true }); st.events.push({ type: 'launch', y: rowY(i) });
        if (b.escortAt === b.t) continue; b.escortAt = b.t; // one escort per launch: a short file of drones out of another row
        let j = -1; for (let q = 0; q < B.ROWS; q++) if (q !== i && (j < 0 || Math.abs(rowY(q) - st.ship.y) < Math.abs(rowY(j) - st.ship.y))) j = q; // the next row nearest the ship
        const D = KIND.drone;
        for (let k = 0; k < B.ESCORT + Math.min(2, rank) + (b.over ? 1 : 0); k++) st.enemies.push({ type: 'drone', x: B.FACE + 10 + k * TRAIN_GAP, y: rowY(j), v: D.v * spd * heat(st), w: D.w, h: D.h, train: 0, warn: 0, age: 99, gate: true }); }
      else if (p.s === 'open' && --p.t <= 0) { p.s = 'on'; st.events.push({ type: 'regrow', y: rowY(i) }); }
    }
    // two plates at a time, the ones nearest the ship's row; below half strength the gate goes into overdrive
    const over = b.hp * 2 <= b.hp0; if (over && !b.over) { b.over = true; st.events.push({ type: 'overdrive' }); }
    if (!b.plates.some(p => p.s === 'arm' || p.s === 'fly') && --b.launchT <= 0) {
      const on = []; for (let i = 0; i < B.ROWS; i++) if (b.plates[i].s === 'on') on.push(i);
      on.sort((p, q) => Math.abs(rowY(p) - st.ship.y) - Math.abs(rowY(q) - st.ship.y));
      for (const i of on.slice(0, B.PLATES)) { b.plates[i].s = 'arm'; b.plates[i].t = B.ARM; }
      b.launchT = Math.max(40, Math.round(B.LAUNCH / spd * (over ? 0.6 : 1)));
    }
    // open rows let drones out, a short file at a time
    const open = []; for (let i = 0; i < B.ROWS; i++) if (b.plates[i].s === 'open') open.push(i);
    if (open.length && --b.emitT <= 0) {
      const i = open[b.emitN++ % open.length], K = KIND.drone, n = 2 + Math.min(2, rank);
      for (let k = 0; k < n; k++) st.enemies.push({ type: 'drone', x: B.FACE + k * TRAIN_GAP, y: rowY(i), v: K.v * spd, w: K.w, h: K.h, train: 0, warn: 0, age: 99, gate: true });
      b.emitT = Math.max(50, Math.round(B.EMIT / spd)); st.events.push({ type: 'emit', y: rowY(i) });
    }
  }
  const plateBack = (st, e) => { if (e.type === 'plate' && st.boss) st.boss.plates[e.plate].s = 'on'; };

  // The swing is not a line: it covers the side the ship was heading for, from BACK px behind its row to AHEAD px
  // beyond it. You strike what you are flying towards, and the same press turns you away from it.
  function inSwing(e, y, d, pad) { if (e.type === 'plug') return !e.dead && Math.abs(e.y - y) <= e.h / 2; const t = (e.y - y) * d; return !e.warn && !e.dead && t >= -(C.BACK + e.h / 2 + (pad || 0)) && t <= C.AHEAD + e.h / 2 + (pad || 0); }
  function press(st) {
    const sh = st.ship, nose = C.SHIP_X + C.NOSE, d = sh.dir, ym = sh.y + d * C.MID; sh.dir = -sh.dir; st.stats.presses++;
    if (st.shot) { st.stats.dry++; st.events.push({ type: 'turn' }); return; } // the one wave is still out: turn only
    // The laser is not a second weapon: each level makes the blade longer. Everything inside it is cut.
    const max = Math.min(C.REACH[st.laser], C.W - nose), len = reach(st, nose, ym, max);
    const cut = st.enemies.filter(e => inSwing(e, sh.y, d) && e.x + e.w / 2 >= nose - 4 && e.x - e.w / 2 <= nose + len).sort((a, b) => a.x - b.x);
    const core = bossIn(st) && nose + len >= C.BOSS.FACE ? coreRows(sh.y, d).filter(i => st.boss.plates[i].s === 'open') : [];
    if (cut.length || core.length) { // the blade bites: everything inside it is cut, and the energy is back at once
      const nearN = cut.filter(e => e.x - e.w / 2 <= nose + C.CLOSE).length; st.stats.closeCuts += nearN;
      cut.forEach((e, k) => kill(st, e, 'cut', k, 1 + st.chain, e.x - e.w / 2 <= nose + C.CLOSE));
      if (core.length && st.boss && !st.boss.dead) { const p = st.boss.plates[core[0]]; p.s = 'on'; p.t = 0; st.events.push({ type: 'regrow', y: rowY(core[0]) }); hurtBoss(st, C.BOSS.CUT, 'cut'); } // a cut into the core is worth three waves, and slams that row shut
      st.chain = Math.min(C.CHAIN_MAX, st.chain + 1); st.chainT = Math.round(C.CHAIN_T[st.chain] * (nearN ? 1.5 : 1)); st.stats.maxChain = Math.max(st.stats.maxChain, st.chain);
      if (cut.length > 1) st.stats.multi++; st.stats.maxCut = Math.max(st.stats.maxCut, cut.length);
      if (cut.length && cut[cut.length - 1].x - cut[0].w / 2 > nose + C.REACH[0]) st.stats.longCuts++;
      st.events.push({ type: 'slash', y: sh.y, d, len, lv: st.laser, n: cut.length + core.length, chain: st.chain, near: nearN });
    } else if (nose + len >= C.W) st.events.push({ type: 'swing', y: sh.y, d, len, lv: st.laser }); // full reach: nothing left for a wave to do
    else { // rock stops the blade but not the wave: it leaves from the blade's tip and flies through
      if (len < max) st.events.push({ type: 'spark', x: nose + len, y: ym, own: true });
      st.shot = { x: nose + len, y: sh.y, d }; st.events.push({ type: 'shot', y: sh.y, d, len, lv: st.laser });
    }
  }
  // leaving a zone: 10000, five times that if no ship was lost in it, and 100000 more for every one of its gems
  function zonePay(st, zi) {
    const co = st.course, noMiss = st.zoneLost === 0; let all = true, any = false;
    for (let i = 0; i < co.gems.length; i++) if (co.gems[i].zone === zi) { any = true; if (!st.gemTaken[i]) all = false; }
    const perfect = any && all, pts = C.ZONE_BONUS * (noMiss ? C.NO_MISS : 1) + (perfect ? C.GEM_PERFECT : 0);
    add(st, pts); st.zoneLost = 0; if (noMiss) st.stats.noMiss++; if (perfect) st.stats.gemPerfect++;
    return { pts, noMiss, perfect };
  }
  function die(st, cause) {
    st.phase = 'dead'; st.phaseT = C.DEAD; st.lives--; st.zoneLost++; st.stats.deaths++; st.stats.deathBy[cause] = (st.stats.deathBy[cause] || 0) + 1;
    st.events.push({ type: 'death', cause, x: C.SHIP_X, y: st.ship.y });
  }

  function step(st, pressed) {
    st.events.length = 0; st.t++;
    const co = st.course, sh = st.ship;
    if (st.phase === 'over') return st;
    if (st.phase === 'ready') {
      if (--st.phaseT <= 0) {
        st.phase = 'play';
        // every start and restart opens with one red carrier train, a little off the ship's row: the capsule is on offer from the first second
        if (!st.boss) st.pending.push({ at: st.t + 20, stage: 0, type: 'train', spd: 1 + 0.1 * Math.min(st.loop, 6), n: trainLen(st.loop), carrier: true, aim: true, off: st.ship.y > 120 ? -40 : 40, gift: true });
      }
      return st;
    }
    if (st.phase === 'dead') {
      if (--st.phaseT <= 0) { if (st.lives <= 0) { st.phase = 'over'; st.events.push({ type: 'over' }); } else { rewind(st); st.phase = 'ready'; st.phaseT = C.READY_BACK; st.events.push({ type: 'ready' }); } }
      return st;
    }
    if (st.phase === 'clear') {
      if (--st.phaseT <= 0 && st.final) {
        // ALL CLEAR: every ship left is counted off for 50000, one at a time (no extends are earned by this)
        if (st.tally > 0) { st.tally--; st.lives--; st.tallied++; st.score += C.SHIP_BONUS; st.phaseT = 26; st.events.push({ type: 'shipbonus', pts: C.SHIP_BONUS, n: st.tallied, left: st.tally }); return st; }
        if (st.cleared && !st.tallyEnd) { st.tallyEnd = true; st.phaseT = 110; return st; }
        st.phase = 'over'; st.events.push({ type: 'over', cleared: !!st.cleared }); return st;
      }
      if (st.phaseT <= 0) { st.boss = null; setCourse(st, st.loop + 1); placeAt(st, 0); st.phase = 'ready'; st.phaseT = C.READY; st.events.push({ type: 'ready' }); }
      return st;
    }
    if (pressed) press(st);
    sh.y += sh.dir * C.VY; st.camX += C.SCROLL;

    // scripted entries: every entry is announced by a marker on its row at the right edge, MARK ticks before it flies in
    while (st.nextEv < co.events.length && co.events[st.nextEv].wx - C.MARK * C.SCROLL <= st.camX + C.W) {
      const ev = co.events[st.nextEv++];
      if (ev.type === 'plug') { const K = KIND.plug; st.enemies.push({ type: 'plug', x: ev.wx - st.camX, y: ev.y, v: C.SCROLL, w: K.w, h: K.h, train: 0, warn: 0, age: 99 }); continue; }
      if (ev.type === 'capitem') { st.items.push({ type: 'cap', x: ev.wx - st.camX, y: ev.y, big: true }); continue; }
      if (ev.type === 'aimed' || ev.type === 'rusher') for (let k = 0; k < ev.n; k++) st.pending.push({ at: st.t + k * 12, stage: 0, type: ev.type === 'aimed' ? 'drone' : 'rusher', spd: ev.spd, aim: true });
      else st.pending.push({ at: st.t, stage: 0, type: ev.type, spd: ev.spd, y: ev.y, n: ev.n, carrier: ev.carrier });
      for (let k = 0; k < (st.chain >> 1); k++) { st.pending.push({ at: st.t + 14 + k * 12, stage: 0, type: 'drone', spd: ev.spd, aim: true }); st.stats.heatDrones++; } // heat: a hot chain draws aimed drones
    }
    if (st.pending.some(p => p.at <= st.t)) {
      const due = st.pending.filter(p => p.at <= st.t); st.pending = st.pending.filter(p => p.at > st.t);
      for (const p of due) {
        if (p.stage === 0) { // aimed entries take the ship's row at the moment they are announced
          const y = p.aim ? aimRow(st, sh.y + (p.off || 0), p.type, p.spd) : p.y; if (y < 0) continue;
          st.marks.push({ y, until: st.t + C.MARK, type: p.type === 'convoy' ? 'shell' : p.type === 'train' && !p.carrier ? 'drone' : p.type }); st.pending.push(Object.assign({}, p, { at: st.t + C.MARK, stage: 1, y }));
          if (p.type === 'rusher') st.events.push({ type: 'warn', y });
        } else {
          if (p.aim && Math.abs(aimRow(st, p.y, p.type, p.spd) - p.y) > 8) continue;
          if (p.type === 'convoy') { const id = ++st.trainSeq; st.trains[id] = { killed: 0, escaped: false, n: p.n, carrier: !!p.carrier }; spawn(st, 'shell', p.y, p.spd * KIND.train.v / KIND.shell.v); spawn(st, 'train', p.y, p.spd, id, p.n, 26); if (!p.carrier) for (const e of st.enemies) if (e.train === id) e.plain = true; }
          else if (p.type === 'train') { const id = ++st.trainSeq; st.trains[id] = { killed: 0, escaped: false, n: p.n, carrier: !!p.carrier }; spawn(st, 'train', p.y, p.spd, id, p.n); if (!p.carrier) for (const e of st.enemies) if (e.train === id) e.plain = true; } else spawn(st, p.type, p.y, p.spd);
        }
      }
    }
    if (st.marks.length && st.marks[0].until <= st.t) st.marks = st.marks.filter(m => m.until > st.t);
    if (st.guardT > 0) st.guardT--;
    if (st.boss && !st.boss.dead) { stepBoss(st); if (st.phase !== 'play') return st; }
    if (st.chain > 0 && --st.chainT <= 0) { st.chain--; st.chainT = C.CHAIN_T[st.chain]; st.stats.chainDrops++; st.events.push({ type: 'chaindown', chain: st.chain }); }
    if (st.laser > 0 && --st.laserT <= 0) { st.laser--; st.laserT = C.DECAY[st.laser]; st.stats.decays++; st.events.push({ type: 'decay' }); }
    // enemies fly straight left; a rusher waits at the edge, blinking, before it goes
    for (const e of st.enemies) {
      e.age++;
      if (e.warn > 0) { e.warn--; e.x = C.W - 6; continue; }
      e.x -= e.v;
      if (e.x < -12) { e.dead = true; e.gone = true; plateBack(st, e); if (e.train) st.trains[e.train].escaped = true; }
      else if (solid(co, st.camX + e.x - e.w / 2, e.y)) { e.dead = true; e.gone = true; if (e.train) st.trains[e.train].escaped = true; st.events.push({ type: 'spark', x: e.x, y: e.y }); }
    }
    // the single wave: it passes through rock; only armour and the gate's closed plates stop it
    if (st.shot) {
      const s = st.shot, x0 = s.x; s.x += C.SHOT_V; let hit = null;
      for (const e of st.enemies) if (inSwing(e, s.y, s.d) && e.x + e.w / 2 >= x0 && e.x - e.w / 2 <= s.x && (!hit || e.x < hit.x)) hit = e;
      if (hit) {
        st.shot = null;
        if (KIND[hit.type].armor) { st.stats.pings++; st.events.push({ type: 'ping', x: hit.x - hit.w / 2, y: s.y }); } else kill(st, hit, 'far', 0); // the wave neither feeds nor breaks the chain
      } else if (bossIn(st) && s.x >= C.BOSS.FACE) {
        const rows = coreRows(s.y, s.d), open = rows.filter(i => st.boss.plates[i].s === 'open'); st.shot = null;
        if (open.length) hurtBoss(st, 1, 'wave'); else { st.stats.pings++; st.events.push({ type: 'ping', x: C.BOSS.FACE, y: s.y + s.d * C.MID }); }
      } else if (s.x > C.W + 4) st.shot = null;
    }
    if (st.enemies.some(e => e.dead)) st.enemies = st.enemies.filter(e => !e.dead);
    // capsules drift with the rock; flying through one loads the laser
    for (const it of st.items) {
      it.x -= C.SCROLL;
      if (Math.abs(it.x - C.SHIP_X) < 14 && Math.abs(it.y - sh.y) < 13) {
        it.dead = true; st.stats.caps++; const full = st.laser >= C.LASER_MAX;
        st.laser = it.big ? C.LASER_MAX : Math.min(C.LASER_MAX, st.laser + 1); st.laserT = C.DECAY[st.laser]; if (it.big) { st.chain = C.CHAIN_MAX; st.chainT = C.CHAIN_T[st.chain]; } // the sealed lane's capsule: top level and a full chain at once
        add(st, full || it.big ? 1000 : 300);
        st.events.push({ type: 'cap', x: it.x, y: it.y, lv: st.laser, big: !!it.big, pts: full || it.big ? 1000 : 300 });
      } else if (it.x < -10) it.dead = true;
    }
    if (st.items.some(e => e.dead)) st.items = st.items.filter(e => !e.dead);
    // gems
    while (st.nextGem < co.gems.length && co.gems[st.nextGem].wx < st.camX - 8) { if (!st.gemTaken[st.nextGem]) st.gemChain = 0; st.nextGem++; }
    for (let i = st.nextGem; i < co.gems.length; i++) {
      const g = co.gems[i], gx = g.wx - st.camX; if (gx > C.SHIP_X + 14) break;
      if (!st.gemTaken[i] && Math.abs(gx - C.SHIP_X) < 12 && Math.abs(g.y - sh.y) < 11) {
        st.gemTaken[i] = 1; st.gemChain = Math.min(C.GEM_CAP, st.gemChain + 1); st.stats.gems++; const pts = 100 * st.gemChain * (1 + st.chain); add(st, pts);
        if (st.laser > 0) st.laserT = C.DECAY[st.laser]; // a gem winds the laser clock back up
        st.events.push({ type: 'gem', x: gx, y: g.y, chain: st.gemChain, pts, wound: st.laser > 0 });
      }
    }
    // ship against rock and enemies
    const wx = st.camX + C.SHIP_X;
    if (hitsRock(co, wx, sh.y, 0)) { die(st, 'rock'); return st; }
    const pad = st.pad || 0; // only a simulated player's imagined copy sets this: the berth it wants around enemies
    for (const e of st.enemies) if (!e.warn && !e.dead && Math.abs(e.x - C.SHIP_X) < e.w / 2 + 3 + pad * 2 && Math.abs(e.y - sh.y) < e.h / 2 + 1 + pad) {
      // the laser is also armour, at a price: touching an enemy burns every level, and for a moment the ship rams through
      if (st.guardT <= 0 && st.laser > 0 && !pad) { st.laser = 0; st.guardT = C.GUARD; st.stats.guards++; st.events.push({ type: 'guard', x: C.SHIP_X, y: sh.y }); }
      if (st.guardT > 0 && !pad) { st.stats.rams++; kill(st, e, 'ram', 0); continue; }
      die(st, e.type); return st;
    }
    if (st.enemies.some(e => e.dead)) st.enemies = st.enemies.filter(e => !e.dead);
    // progress: zones, checkpoints, the end of the course
    const col = wx / 8;
    while (st.cp + 1 < co.cps.length && col >= co.cps[st.cp + 1]) st.cp++;
    const z = zoneOf(st);
    if (z > st.zone) { const pts = zonePay(st, st.zone); st.zone = z; st.stats.zones++; st.events.push(Object.assign({ type: 'zone', zone: z }, pts)); }
    if (!st.boss && col >= co.end + 6) { const pts = zonePay(st, st.zone); st.events.push(Object.assign({ type: 'zone', zone: co.zones.length }, pts)); st.boss = newBoss(st); st.events.push({ type: 'boss' }); } // past the fortress: the gate
    return st;
  }

  const api = { rowY, newBoss, coreRows, openRun, rewind, inSwing, hitsRock, C, KIND, trainLen, TRAIN_GAP, mulberry, buildCourse, solid, solidCol, clearRow, reach, gapMid, newGame, placeAt, setCourse, zoneOf, clone, step, aimRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZS = api;
})(this);
