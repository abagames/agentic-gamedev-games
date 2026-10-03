// HEAD RUSH — deterministic simulation core (browser global HR / Node module).
(function (root) {
  'use strict';
  const W = 240, H = 272, CX = 120, CY = 144;
  const NR = 5; // lanes, 0 = outer
  const TPS = 60, DT = 1 / TPS, SUB = 2;
  const C = {
    GAPW: 10,            // half-width of a crossover zone
    SLIDE: 8,            // ticks of visual lateral slide
    SPEED0: 115, STEP: 0.11, TIER_MAX: 7, BOOST: 1.6,
    RIVAL: 0.75, RIVAL_STEP: 0.01, FRIGHT_SPD: 0.72, SPAWN_BEHIND: 1, SPAWN_MIN: 70, SPAWN_LATE: 2.5, FRIGHT0: 5.2, FRIGHT_STEP: 0.12, FRIGHT_MIN: 4.0, EAT_GRACE: 50, SAFE_D: 110, SAFE_AHEAD: 200, WARM: 45,
    HIT: 8, DOT_R: 6, LOCK: 60, AGG0: 0.3, AGG_STEP: 0.05, DOT_GAP: 14, DOT_CLEAR: 16 /* dots stay clear of the 12 px wall opening around each gap */, CRASH_DROP: 0, BOOST_LOCK: 1, MULTI: 1, CROSS: 6, CROSS_STEP: 0.3, BOOST_LANES: 1, MAX_LANES: 2, HOLD_MIN: 12,
    FOLLOW: 14,
    MAX_CARS: 8, START_CARS: 4,
    TIME: 180 * TPS,
    READY0: 90, CRASH: 45, READY: 30, // the clock keeps running through a crash, so keep that gap short
    HITSTOP: 5, RETURN: 150, LEADER_DELAY: 50,
    FLY: 22,
    CRUISE: 1, TRUCK_CHAIN: 1, TRUCK_MAX: 99, MULT_MAX: 64, CHAIN_LINEAR: 0, CRUISE_T1: 3, CRUISE_T2: 6, CRUISE_SPD: 0.8, CRUISE_BACK: 300,
    LIVES: 3, EXTEND_FIRST: 3000, EXTEND_EVERY: 5000, MAX_LIVES: 6,
    MORPH: 1, FEAST: 1, FEAST_FIRST: 3, FEAST_EVERY: 4, FEAST_T: 0.5,
  };
  // every tuning constant must be a finite number (catches a value lost to a bad edit or override)
  const REQUIRED = ['GAPW', 'SLIDE', 'SPEED0', 'STEP', 'TIER_MAX', 'BOOST', 'RIVAL', 'RIVAL_STEP', 'SPAWN_BEHIND', 'SPAWN_MIN', 'SPAWN_LATE', 'FRIGHT0', 'FRIGHT_STEP', 'FRIGHT_MIN', 'EAT_GRACE', 'SAFE_D', 'SAFE_AHEAD', 'WARM', 'FRIGHT_SPD', 'HIT', 'DOT_R', 'LOCK', 'AGG0', 'AGG_STEP', 'DOT_GAP', 'DOT_CLEAR',
    'CRASH_DROP', 'BOOST_LOCK', 'MULTI', 'CROSS', 'CROSS_STEP', 'BOOST_LANES', 'MAX_LANES', 'HOLD_MIN', 'FOLLOW', 'MAX_CARS', 'START_CARS', 'TIME', 'READY0', 'CRASH', 'READY', 'HITSTOP',
    'RETURN', 'LEADER_DELAY', 'FLY', 'CRUISE', 'TRUCK_CHAIN', 'TRUCK_MAX', 'MULT_MAX', 'CHAIN_LINEAR', 'CRUISE_T1', 'CRUISE_T2', 'CRUISE_SPD', 'CRUISE_BACK', 'LIVES', 'EXTEND_FIRST', 'EXTEND_EVERY', 'MAX_LIVES', 'MORPH', 'FEAST', 'FEAST_FIRST', 'FEAST_EVERY', 'FEAST_T'];
  function checkC() { const bad = REQUIRED.filter(k => !Number.isFinite(C[k])); if (bad.length) throw new Error('HEAD RUSH: invalid tuning constants ' + bad.join(', ')); }
  // tuning override for Node sweeps only
  if (typeof process !== 'undefined' && process.env && process.env.HR_C) Object.assign(C, JSON.parse(process.env.HR_C));

  // ---------- courses: data only ----------
  // gap: side 0 top / 1 left / 2 bottom / 3 right, off = lateral px from the side's centre (x for top/bottom, y for left/right),
  // lo..hi = the lanes it joins (a car on lane r may go in if lo <= r < hi), dir 0 both / 1 inward only / -1 outward only.
  const SQ = [108, 88, 68, 48, 28];
  // A layout is two half-patterns. A pattern lists the left half's gaps, including the top-centre gap where the
  // player (counter-clockwise) enters the left half; on the right half the same pattern is rotated 180 degrees.
  // power = [lane, corner] on the left (corner 0 top-left / 1 bottom-left); rpower overrides it on the right.
  const HALVES = [
    { name: 'CLASSIC', gaps: [{ side: 0, off: 0, lo: 0, hi: 4 }, { side: 1, off: 0, lo: 0, hi: 4 }], power: [1, 0], rpower: [3, 2] },
    { name: 'TWIN GATES', gaps: [{ side: 0, off: -36, lo: 0, hi: 3 }, { side: 1, off: 0, lo: 0, hi: 4 }, { side: 2, off: -36, lo: 0, hi: 3 }], power: [2, 1] },
    // one-way entrance (dive in only), two-way side: keeps the flow without trapping the car
    { name: 'UNDERTOW', gaps: [{ side: 0, off: 0, lo: 0, hi: 4, dir: 1 }, { side: 1, off: 0, lo: 0, hi: 4 }], power: [1, 0], rpower: [3, 2] },
    // side gap for every lane, plus an entrance gap for the inner three lanes only
    { name: 'LONG STRAIGHT', gaps: [{ side: 1, off: 0, lo: 0, hi: 4 }, { side: 0, off: 0, lo: 2, hi: 4 }], power: [1, 1], rpower: [3, 3] },
    // bonus half: a power pellet on every lane corner, sparse dots, short stacking power (see C.FEAST_*)
    { name: 'FEAST', feast: true, gaps: [{ side: 0, off: 0, lo: 0, hi: 4 }, { side: 1, off: 0, lo: 0, hi: 4 }], power: [0, 0],
      powers: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [4, 1]] },
    { name: 'LADDER', gaps: [{ side: 0, off: 0, lo: 0, hi: 4 }, { side: 1, off: -30, lo: 0, hi: 3 }, { side: 1, off: 30, lo: 0, hi: 3 }], power: [3, 0] },
  ];
  const rot = q => Object.assign({}, q, { side: (q.side + 2) % 4, off: -q.off });
  // selectable starting layouts (both halves the same pattern)
  const COURSES = HALVES.slice(0, 4).map((h, i) => ({ name: h.name, l: i, r: i }));
  const PARK = [0, 2, 4];
  // order the halves change into, easiest first (human-limited bot crashes/min: CLASSIC 2.0, TWIN 3.0, UNDERTOW 3.0, LONG 3.9, LADDER 4.1)
  const SEQUENCE = [0, 1, 2, 3, 5];
  const GEO = [];
  let G = null; // geometry of the course currently simulated / drawn
  function perOf(g, r) { return 4 * g.hw[r] + 4 * g.hh[r]; }
  // arc position of a point on a side of lane r
  function sideS(g, r, side, off) {
    const w = g.hw[r], h = g.hh[r];
    if (side === 0) return -off;
    if (side === 1) return w + h + off;
    if (side === 2) return 2 * w + 2 * h + off;
    return 3 * w + 3 * h - off;
  }
  function cornerS(g, r, c) { const w = g.hw[r], h = g.hh[r]; return [w, w + 2 * h, 3 * w + 2 * h, 3 * w + 4 * h][c]; }
  function canUse(gp, r, d) {
    if (d > 0) return r + 1 < NR && gp.lo <= r && r < gp.hi && gp.dir !== -1;
    if (d < 0) return r - 1 >= 0 && gp.lo <= r - 1 && r - 1 < gp.hi && gp.dir !== 1;
    return false;
  }
  function build(pl, pr) {
    const L = HALVES[pl], R = HALVES[pr];
    const rp = q => [q[0], (q[1] + 2) % 4];
    const c = { power: (L.powers || [L.power]).concat(R.powers ? R.powers.map(rp) : [R.rpower || rp(R.power)]), park: PARK };
    const feast = [!!L.feast, !!R.feast];
    const g = { id: pl * 10 + pr, pl, pr, hw: SQ, hh: SQ, ring: [],
      gaps: L.gaps.map(q => Object.assign({ dir: 0, half: 0 }, q)).concat(R.gaps.map(q => Object.assign({ dir: 0, half: 1 }, rot(q)))) };
    for (let r = 0; r < NR; r++) {
      const P = perOf(g, r), lim = (q) => (q.side & 1 ? g.hh[r] : g.hw[r]) - 6;
      g.ring[r] = g.gaps.map((q, gi) => ({ gi, s: ((sideS(g, r, q.side, q.off) % P) + P) % P, q }))
        .filter(e => Math.abs(e.q.off) < lim(e.q) && (canUse(e.q, r, 1) || canUse(e.q, r, -1)))
        .sort((a, b) => a.s - b.s);
    }
    G = g;
    // dots: evenly spaced between gap exclusions; the half boundary (top and bottom centre) always splits a run,
    // so each half's dots depend only on its own pattern. Power pellets snap to their corner.
    const dots = [], byRing = [];
    for (let r = 0; r < NR; r++) {
      const P = perOf(g, r);
      const pts = g.ring[r].map(e => ({ s: e.s, c: C.DOT_CLEAR }));
      // same clearance with or without a gap there, so one half's pattern never moves the other half's dots
      for (const b of [0, 2 * g.hw[r] + 2 * g.hh[r]]) if (!pts.some(q => Math.abs(q.s - b) < 1)) pts.push({ s: b, c: C.DOT_CLEAR });
      pts.sort((x, y) => x.s - y.s);
      byRing[r] = [];
      const segs = [];
      for (let i = 0; i < pts.length; i++) { const nx = i + 1 < pts.length ? pts[i + 1] : { s: pts[0].s + P, c: pts[0].c }; const a = pts[i].s + pts[i].c, b = nx.s - nx.c; if (b > a) segs.push([a, b]); }
      for (const [a, b] of segs) {
        const [mx] = pos(r, (a + b) / 2), dg = feast[mx < CX ? 0 : 1] ? C.DOT_GAP * 2 : C.DOT_GAP; // a feast half has sparse dots
        const L = b - a, n = Math.max(1, 2 * Math.round(L / (2 * dg)) + 1);
        for (let i = 0; i < n; i++) {
          const s0 = n === 1 ? a + L / 2 : a + i * L / (n - 1);
          byRing[r].push(dots.length); dots.push({ r, s: s0, power: false });
        }
      }
    }
    for (const [r, cn] of c.power) {
      const cs = cornerS(g, r, cn); let best = -1, bd = 1e9;
      for (const i of byRing[r]) { const P = perOf(g, r); let d = Math.abs(dots[i].s - cs); d = Math.min(d, P - d); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) { dots[best].s = cs; dots[best].power = true; }
    }
    for (const d of dots) { const [x, y] = pos(d.r, d.s); d.x = x; d.y = y; d.half = x < CX - 0.5 ? 0 : x > CX + 0.5 ? 1 : (y < CY ? 1 : 0); d.alive = true; }
    g.dots = dots; g.byRing = byRing;
    // parking spots at the quarter points of the park lanes, clear of gaps
    g.spots = [];
    for (const r of c.park) for (let side = 0; side < 4; side++) {
      const half = (side & 1 ? g.hh[r] : g.hw[r]) / 2;
      for (const off of [-half, half]) {
        const sp = ((sideS(g, r, side, off) % perOf(g, r)) + perOf(g, r)) % perOf(g, r);
        if (g.ring[r].some(e => { let d = Math.abs(e.s - sp); d = Math.min(d, perOf(g, r) - d); return d < C.GAPW + 2; })) continue;
        g.spots.push({ r, s: sp });
      }
    }
    g.spots.sort((a, b) => c.park.indexOf(a.r) - c.park.indexOf(b.r) || a.s - b.s);
    const n = g.spots.length; g.startSpots = [4, 13, 22].map(f => Math.round(n * f / 24));
    return g;
  }
  function geoLR(pl, pr) { const k = pl * 10 + pr; return GEO[k] || (GEO[k] = build(pl, pr)); }
  function geo(ci) { return geoLR(COURSES[ci].l, COURSES[ci].r); }
  function use(st) { const pl = st && st.pl != null ? st.pl : 0, pr = st && st.pr != null ? st.pr : 0; if (!G || G.id !== pl * 10 + pr) G = geoLR(pl, pr); return G; }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rnd(st) { const f = mulberry(st.seed); const v = f(); st.seed = (st.seed + 0x6D2B79F5) | 0; return v; }

  const per = r => perOf(G, r);
  function wrap(s, r) { const p = per(r); s %= p; return s < 0 ? s + p : s; }
  function pos(r, s) {
    const w = G.hw[r], h = G.hh[r], u = wrap(s, r);
    if (u < w) return [CX - u, CY - h];
    if (u < w + 2 * h) return [CX - w, CY - h + (u - w)];
    if (u < 3 * w + 2 * h) return [CX - w + (u - w - 2 * h), CY + h];
    if (u < 3 * w + 4 * h) return [CX + w, CY + h - (u - 3 * w - 2 * h)];
    return [CX + w - (u - 3 * w - 4 * h), CY - h];
  }
  // unit tangent in +s (counter-clockwise) direction
  function tan(r, s) {
    const w = G.hw[r], h = G.hh[r], u = wrap(s, r);
    if (u < w) return [-1, 0];
    if (u < w + 2 * h) return [0, 1];
    if (u < 3 * w + 2 * h) return [1, 0];
    if (u < 3 * w + 4 * h) return [0, -1];
    return [-1, 0];
  }
  // nearest gap on lane r: k = gap index, o = signed offset along +s
  function gapOf(r, s) {
    const P = per(r), u = wrap(s, r); let best = { k: -1, o: 1e9 };
    for (const e of G.ring[r]) { let o = u - e.s; if (o > P / 2) o -= P; if (o < -P / 2) o += P; if (Math.abs(o) < Math.abs(best.o)) best = { k: e.gi, o }; }
    return best;
  }
  // distance to the next gap centre travelling in direction dir (+1 ccw, -1 cw)
  function distToGap(r, s, dir) {
    const P = per(r), u = wrap(s, r); let best = Infinity;
    for (const e of G.ring[r]) { let d = dir > 0 ? e.s - u : u - e.s; d = ((d % P) + P) % P; if (d === 0) d = P; if (d < best) best = d; }
    return best;
  }
  function nextGapK(r, s, dir) {
    const inz = gapOf(r, s);
    if (Math.abs(inz.o) < C.GAPW) return inz.k;
    const P = per(r), u = wrap(s, r); let best = Infinity, k = -1;
    for (const e of G.ring[r]) { let d = dir > 0 ? e.s - u : u - e.s; d = ((d % P) + P) % P; if (d === 0) d = P; if (d < best) { best = d; k = e.gi; } }
    return k;
  }
  function gapS(r, k) { const q = G.gaps[k]; return wrap(sideS(G, r, q.side, q.off), r); }
  function gapSide(k) { return k >= 0 ? G.gaps[k].side : -1; }
  function canShift(r, k, d) { return k >= 0 && canUse(G.gaps[k], r, d); }
  function spotPos(i) { return G.spots[i]; }

  function speed(st) { return C.SPEED0 * (1 + C.STEP * st.tier); }
  // rivals start clearly slower than the player and close the gap as the race speeds up
  function rivalSpeed(st) { return speed(st) * Math.min(1, C.RIVAL + C.RIVAL_STEP * st.tier); }
  // power lasts FRIGHT0 seconds, shrinking by FRIGHT_STEP per speed tier down to FRIGHT_MIN
  function frightTicks(tier) { return Math.round(TPS * Math.max(C.FRIGHT_MIN, C.FRIGHT0 - C.FRIGHT_STEP * tier)); }

  function create(seed, opts) {
    opts = opts || {};
    const course = opts.course || 0; G = geo(course);
    const pl = COURSES[course].l, pr = COURSES[course].r;
    const st = {
      course, pl, pr, hold: false, morphs: 0, feastDue: false, seqIdx: 0, base: 0,
      lives: opts.lives != null ? opts.lives : C.LIVES, nextExtend: C.EXTEND_FIRST, overReason: null,
      seed: seed | 0 || 1, tick: 0, phase: 'ready', phaseT: C.READY0, first: true,
      timeLeft: opts.time || C.TIME, tier: 0, grace: 0, score: 0, stop: 0,
      convoyOn: opts.convoy !== false, powerOn: opts.power !== false,
      player: null, leader: null, cruisers: [], cruiseWait: 0, trail: [], trailD: 0, followers: [], flying: [], dormant: [], returning: [],
      carsTotal: C.START_CARS, fright: 0, chain: 0, leaderWait: 0,
      dots: G.dots.map(() => true), items: [], halfDone: [false, false],
      events: [], stats: { dots: 0, eats: 0, maxChain: 0, crashes: 0, refills: 0, wakes: 0, powers: 0, wasted: 0, chainScore: 0 },
      nextId: 1,
    };
    resetActors(st, true);
    return st;
  }

  function newCar(st) { return st.nextId++; }
  function spawnPlayer(st) {
    st.player = { r: 0, s: 2 * G.hw[0] + 2 * G.hh[0] + 14, zk: -1, can: false, req: 0, reqN: 0, reqT: 0, zinT: 0, nShift: 0, lastShiftT: 0, holdDir: 0, holdT: 0, slT: 0, slx: 0, sly: 0, boost: false };
  }
  function prefillTrail(st, r, s) {
    st.trail = []; st.trailD = 0;
    for (let i = 20; i >= 0; i--) {
      const ss = s + i * 8; const [x, y] = pos(r, ss);
      st.trail.push({ d: -i * 8, x, y, r, s: ss });
    }
  }
  function makeLeader(st, r, s, id, slx, sly) {
    st.leader = { id, r, s, zk: gapOf(r, s).o < C.GAPW ? -2 : -1, can: false, slT: slx || sly ? C.SLIDE : 0, slx: slx || 0, sly: sly || 0, intent: 0 };
    const g = gapOf(r, s); st.leader.zk = Math.abs(g.o) < C.GAPW ? g.k : -1;
  }
  function resetActors(st, initial) {
    spawnPlayer(st);
    if (st.cruisers) st.cruisers = st.cruisers.map(c => placeCruiser(st, c.id));
    st.followers = []; st.flying = []; st.returning = []; st.fright = 0; st.chain = 0;
    const used = new Set(); st.dormant = [];
    if (initial) {
      makeLeader(st, 2, wrap(-14, 2), newCar(st));
      prefillTrail(st, 2, st.leader.s);
      if (st.convoyOn) for (let i = 0; i < st.carsTotal - 1; i++) { st.dormant.push({ id: newCar(st), spot: G.startSpots[i % 3] + (i >= 3 ? 1 : 0) }); }
      return;
    }
    // all rival cars park; farthest parked car becomes leader
    const ids = [];
    for (let i = 0; i < st.carsTotal; i++) ids.push(newCar(st));
    const [px, py] = carXY(st.player);
    const spots = G.spots.map((_, i) => i).filter(i => { const p = spotPos(i), [x, y] = pos(p.r, p.s); return Math.hypot(x - px, y - py) > 70 && p.r !== st.player.r; });
    shuffle(st, spots);
    let far = -1, fd = -1;
    for (const i of spots) { const p = spotPos(i), [x, y] = pos(p.r, p.s); const d = Math.hypot(x - px, y - py); if (d > fd) { fd = d; far = i; } }
    const lp = spotPos(far); makeLeader(st, lp.r, lp.s, ids[0]); prefillTrail(st, lp.r, lp.s); used.add(far);
    if (st.convoyOn) {
      let j = 1;
      for (const i of spots) { if (j >= ids.length) break; if (used.has(i)) continue; st.dormant.push({ id: ids[j++], spot: i }); used.add(i); }
    }
  }
  // cruiser: a lane-keeping truck, placed on the far side in a lane other than the player's
  function placeCruiser(st, id) {
    const p = st.player, taken = new Set((st.cruisers || []).map(c => c.r));
    let lanes = []; for (let r = 0; r < NR; r++) if (r !== p.r && !taken.has(r)) lanes.push(r);
    if (!lanes.length) lanes = [(p.r + 2) % NR];
    const r = lanes[Math.floor(rnd(st) * lanes.length)];
    const [px, py] = carXY(p); let best = 0, bd = -1;
    for (let i = 0; i < 16; i++) { const s = per(r) * i / 16, [x, y] = pos(r, s), d = Math.hypot(x - px, y - py); if (d > bd) { bd = d; best = s; } }
    return { id, r, s: best };
  }
  function shuffle(st, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

  function carXY(e) { const [x, y] = pos(e.r, e.s); const f = e.slT / C.SLIDE; return [x + e.slx * f, y + e.sly * f]; }

  function sampleAt(st, d) {
    const t = st.trail; if (!t.length) return null;
    if (d <= t[0].d) return t[0];
    if (d >= t[t.length - 1].d) return t[t.length - 1];
    let lo = 0, hi = t.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m].d <= d) lo = m; else hi = m; }
    const a = t[lo], b = t[hi], f = (d - a.d) / ((b.d - a.d) || 1);
    return { d, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: f < 0.5 ? a.r : b.r, s: f < 0.5 ? a.s : b.s, dx: b.x - a.x, dy: b.y - a.y };
  }
  function followerXY(st, f) { const p = sampleAt(st, st.trailD - f.lag); return p ? [p.x, p.y] : [0, 0]; }
  function tailLag(st) { return C.FOLLOW * (st.followers.length + 1 + st.flying.length); }

  function shiftEnt(e, d, g) {
    const [ox, oy] = carXY(e);
    const nr = e.r + d;
    e.r = nr; e.s = wrap(gapS(nr, g.k) + g.o, nr);
    const [nx, ny] = pos(e.r, e.s);
    e.slx = ox - nx; e.sly = oy - ny; e.slT = C.SLIDE; e.can = false;
  }
  function zoneStep(e) {
    const g = gapOf(e.r, e.s);
    if (Math.abs(g.o) < C.GAPW) { if (e.zk !== g.k) { e.zk = g.k; e.can = true; } return g; }
    e.zk = -1; e.can = false; return null;
  }
  function leaderWant(st, L) {
    const p = st.player; if (!p || st.phase !== 'play') return 0;
    const pr = p.r;
    if (st.fright > 0) {
      if (L.r === pr) return L.r < 2 ? 1 : -1;
      if (L.r < pr) return L.r > 0 ? -1 : 0;
      return L.r < NR - 1 ? 1 : 0;
    }
    return Math.sign(pr - L.r);
  }

  // aggression rises with speed tier; a skipped turn shows no blinker
  function lockTurn(st, L, k) {
    L.locked = true; L.intent = st.aiBlind ? 0 : leaderWant(st, L); // aiBlind: a planning copy that does not foresee the rival's next turns
    if (L.intent && !canShift(L.r, k, L.intent)) L.intent = 0; // one-way or partial gaps limit the rival too
    if (L.intent && rnd(st) > Math.min(1, C.AGG0 + C.AGG_STEP * st.tier)) L.intent = 0;
  }
  // a tap queues one lane (repeat taps do not stack); holding the key keeps crossing
  function queueTurn(st, p, d) { p.req = d; p.reqN = 1; p.reqT = st.tick; }
  function ev(st, type, o) { const e = Object.assign({ type }, o || {}); st.events.push(e); return e; }

  function step(st, inp) {
    use(st);
    st.events.length = 0;
    inp = inp || {};
    if (st.phase === 'over') return st;
    if (st.stop > 0) { st.stop--; return st; }
    st.tick++;
    if ((!st.first && !st.hold) || st.phase === 'play') { if (st.timeLeft > 0) st.timeLeft--; }
    // extends: one more car at EXTEND_FIRST points, then every EXTEND_EVERY points (up to MAX_LIVES)
    while (C.EXTEND_FIRST > 0 && st.score >= st.nextExtend) { if (st.lives < C.MAX_LIVES) { st.lives++; ev(st, 'extend', { lives: st.lives }); } st.nextExtend += C.EXTEND_EVERY; }
    if (st.timeLeft <= 0 && st.phase !== 'over') { st.phase = 'over'; st.overReason = 'time'; ev(st, 'timeover'); return st; }
    if (st.timeLeft % TPS === 0 && st.timeLeft <= 10 * TPS && st.timeLeft > 0) ev(st, 'count', { n: st.timeLeft / TPS });
    const p = st.player;
    if (st.phase === 'ready') {
      if (inp.in) queueTurn(st, p, 1); if (inp.out) queueTurn(st, p, -1);
      if (--st.phaseT <= 0) { const first = st.first; st.phase = 'play'; st.first = false; st.hold = false; ev(st, 'go', { first }); }
      return st;
    }
    if (st.phase === 'crash') {
      if (--st.phaseT <= 0) {
        if (st.lives <= 0) { st.phase = 'over'; st.overReason = 'lives'; ev(st, 'gameover'); return st; } // out of cars
        resetActors(st, false); st.phase = 'ready'; st.phaseT = C.READY;
      }
      return st;
    }
    // --- play ---
    // a tapped turn stays queued until the next gap; a gap passed without using it discards it
    if (inp.in) queueTurn(st, p, 1); else if (inp.out) queueTurn(st, p, -1);
    p.boost = !!inp.boost;
    // how long the current direction has been held: a short press only ever moves one lane
    const hd = inp.inHeld ? 1 : inp.outHeld ? -1 : 0;
    if (hd && hd === p.holdDir) p.holdT++; else { p.holdDir = hd; p.holdT = hd ? 1 : 0; }
    const pv = speed(st) * (p.boost ? C.BOOST : 1) * DT / SUB;
    const rv = rivalSpeed(st) * (st.fright > 0 ? C.FRIGHT_SPD : 1) * DT / SUB;
    if (st.grace > 0) st.grace--;
    for (let sub = 0; sub < SUB; sub++) {
      // player
      p.s = wrap(p.s + pv, p.r); if (sub === 0 && p.slT > 0) p.slT--;
      const wasZ = p.zk;
      let g = zoneStep(p);
      if (g && wasZ === -1) { p.zinT = st.tick; p.nShift = 0; }
      if (!g && wasZ !== -1 && p.req && p.reqT <= p.zinT) { p.req = 0; p.reqN = 0; }
      // normal speed: keep crossing one lane every C.CROSS ticks while still in the gap (slower = more lanes);
      // full throttle: C.BOOST_LANES lanes at most
      const maxN = p.boost && C.BOOST_LOCK ? C.BOOST_LANES : C.MULTI ? C.MAX_LANES : 1; // full throttle 1 lane, otherwise up to MAX_LANES
      const cross = Math.max(3, Math.round(C.CROSS - C.CROSS_STEP * st.tier)); // quicker hands as the race speeds up: 3 lanes early, 2 at top tiers
      const ready = p.can || (p.nShift > 0 && st.tick - p.lastShiftT >= cross && p.holdT >= C.HOLD_MIN);
      if (g && ready && p.nShift < maxN) {
        let d = 0;
        if (p.req) d = p.req; else if (inp.inHeld) d = 1; else if (inp.outHeld) d = -1;
        if (d && canShift(p.r, g.k, d)) {
          shiftEnt(p, d, g); p.nShift++; p.lastShiftT = st.tick; st.shiftSinceEat = true;
          if (p.req && --p.reqN <= 0) { p.req = 0; p.reqN = 0; }
          ev(st, 'shift', { d, who: 'p', n: p.nShift });
        }
      }
      // leader
      const L = st.leader;
      if (L && L.warm > 0) { if (sub === 0) L.warm--; } // a new leader waits in place, flashing, before it sets off
      else if (L) {
        L.s = wrap(L.s - rv, L.r); if (sub === 0 && L.slT > 0) L.slT--;
        const lg = zoneStep(L);
        // the rival locks its turn C.LOCK px before a gap (blinker), then executes it in the gap
        if (!lg) { const dg = distToGap(L.r, L.s, -1); if (dg < C.LOCK + C.GAPW) { if (!L.locked) lockTurn(st, L, nextGapK(L.r, L.s, -1)); } else { L.locked = false; L.intent = 0; } }
        else if (!L.locked) lockTurn(st, L, lg.k);
        if (lg && L.can) { const d = L.intent; if (d && canShift(L.r, lg.k, d)) { shiftEnt(L, d, lg); ev(st, 'shift', { d, who: 'r' }); } else L.can = false; L.intent = 0; }
        const [lx, ly] = carXY(L);
        st.trailD += rv;
        st.trail.push({ d: st.trailD, x: lx, y: ly, r: L.r, s: L.s });
        const keep = st.trailD - (C.FOLLOW * (C.MAX_CARS + 2) + 20);
        let cut = 0; while (cut < st.trail.length - 2 && st.trail[cut + 1].d < keep) cut++;
        if (cut) st.trail.splice(0, cut);
      }
      for (const c of st.cruisers) c.s = wrap(c.s - rv * C.CRUISE_SPD, c.r);
      for (let i = 0; i < st.followers.length; i++) {
        const f = st.followers[i], tgt = C.FOLLOW * (i + 1);
        if (f.lag > tgt) f.lag = Math.max(tgt, f.lag - 40 * DT / SUB);
        if (f.lag < tgt) f.lag = tgt;
      }
      if (collide(st)) return st;
    }
    // flying cars join the convoy tail
    for (let i = st.flying.length - 1; i >= 0; i--) {
      const f = st.flying[i];
      if (++f.t >= C.FLY) {
        st.flying.splice(i, 1);
        if (f.lead && !st.leader) { const p = spotPos(f.spot); makeLeader(st, p.r, p.s, f.id); prefillTrail(st, p.r, p.s); st.leader.warm = C.WARM; ev(st, 'leader', { relocated: true }); }
        else if (f.spot != null) { st.dormant.push({ id: f.id, spot: f.spot }); ev(st, 'park'); }
        else if (st.leader) { st.followers.push({ id: f.id, lag: C.FOLLOW * (st.followers.length + 1) }); ev(st, 'join'); }
        else st.dormant.push({ id: f.id, spot: farSpot(st) });
      }
    }
    // returning cars re-park
    for (let i = st.returning.length - 1; i >= 0; i--) {
      if (--st.returning[i].t <= 0) { const id = st.returning[i].id; st.returning.splice(i, 1); parkCar(st, id); }
    }
    // fright timer
    // power ends on its timer, or as soon as nothing edible is left: the whole convoy and every truck eaten
    if (st.fright > 0 && !st.leader && !st.followers.length && !st.cruisers.length && !st.flying.some(f => f.spot == null)) { st.fright = 1; }
    if (st.fright > 0) { if (--st.fright === 0) { st.chain = 0; st.shiftSinceEat = false; ev(st, 'frightEnd'); } }
    // cruisers join as the race speeds up; an eaten one comes back after C.CRUISE_BACK ticks
    const want = !C.CRUISE ? 0 : st.tier >= C.CRUISE_T2 ? 2 : st.tier >= C.CRUISE_T1 ? 1 : 0;
    if (st.cruisers.length < want && st.fright === 0) { if (++st.cruiseWait >= (st.cruiseBack || 60)) { st.cruisers.push(placeCruiser(st, newCar(st))); st.cruiseWait = 0; st.cruiseBack = 0; ev(st, 'cruiser'); } }
    else st.cruiseWait = 0;
    // new leader when none
    // only a car already on its way to lead holds the countdown; parking flights and wakes do not
    if (!st.leader && !st.flying.some(f => f.lead) && st.fright === 0) {
      if (++st.leaderWait >= C.LEADER_DELAY) promoteDormant(st);
    } else st.leaderWait = 0;
    return st;
  }

  // CE-style refresh: the refilled half takes a different half-pattern; the other half keeps its gaps and dots
  function morphHalf(st, half) {
    const old = G, cur = half ? st.pr : st.pl;
    // feast schedule: the flag numbered FEAST_FIRST, FEAST_FIRST + FEAST_EVERY, ... always turns the refilled half into FEAST.
    // If that would put FEAST on both halves or twice running on this half, it moves to the next flag (no randomness).
    const other = half ? st.pl : st.pr, fi = HALVES.findIndex(h => h.feast), k = st.morphs + 1;
    if (C.FEAST && fi >= 0 && k >= C.FEAST_FIRST && (k - C.FEAST_FIRST) % C.FEAST_EVERY === 0) st.feastDue = true;
    let nx;
    if (st.feastDue && !HALVES[other].feast && !HALVES[cur].feast) { nx = fi; st.feastDue = false; }
    else { // fixed order, easiest first: the next pattern in SEQUENCE after the starting course, skipping this half's current one
      const L = SEQUENCE.length, start = SEQUENCE.indexOf(COURSES[st.course].l);
      do { nx = SEQUENCE[(start + 1 + st.seqIdx++) % L]; } while (nx === cur);
    }
    if (half) st.pr = nx; else st.pl = nx;
    G = geoLR(st.pl, st.pr); st.morphs++;
    const alive = new Map(); old.dots.forEach((d, i) => alive.set(d.r + ':' + d.s.toFixed(2), st.dots[i]));
    st.dots = G.dots.map(d => d.half === half ? true : (alive.has(d.r + ':' + d.s.toFixed(2)) ? alive.get(d.r + ':' + d.s.toFixed(2)) : true));
    // parked / homing-to-park cars keep their place: map each old spot to the nearest free spot of the new layout
    const taken = new Set();
    const remap = i => { const o = old.spots[i]; let best = 0, bd = 1e9; G.spots.forEach((q, j) => { if (taken.has(j)) return; const [ax, ay] = pos(o.r, o.s), [bx, by] = pos(q.r, q.s), d = Math.hypot(ax - bx, ay - by); if (d < bd) { bd = d; best = j; } }); taken.add(best); return best; };
    G = old; const oldSpots = st.dormant.map(d => d.spot), oldFly = st.flying.map(f => f.spot); G = geoLR(st.pl, st.pr);
    st.dormant.forEach((d, i) => { d.spot = remap(oldSpots[i]); });
    st.flying.forEach((f, i) => { if (oldFly[i] != null) f.spot = remap(oldFly[i]); });
    // gap ids change with the layout: re-read the zone each car is in (a gap already used stays used)
    for (const e of [st.player, st.leader]) if (e) { const g = gapOf(e.r, e.s); e.zk = Math.abs(g.o) < C.GAPW ? g.k : -1; e.can = false; e.locked = false; e.intent = 0; }
    ev(st, 'morph', { half, pattern: nx });
    if (HALVES[nx].feast) { st.stats.feasts = (st.stats.feasts || 0) + 1; ev(st, 'feast', { half }); }
  }
  function parkCar(st, id) {
    const [px, py] = carXY(st.player);
    const taken = new Set(st.dormant.map(d => d.spot));
    const free = G.spots.map((_, i) => i).filter(i => !taken.has(i) && safeAt(st, spotPos(i).r, spotPos(i).s));
    if (!free.length || !st.convoyOn) { st.returning.push({ id, t: 30 }); return; }
    st.dormant.push({ id, spot: free[Math.floor(rnd(st) * free.length)] });
    ev(st, 'park');
  }
  // where a car may appear: well away from the player, and never in the player's lane just ahead of it
  function safeAt(st, r, s0) {
    const p = st.player, [px, py] = carXY(p), [x, y] = pos(r, s0);
    if (Math.hypot(x - px, y - py) < C.SAFE_D) return false;
    if (r === p.r) { let d = (s0 - p.s) % per(r); if (d < 0) d += per(r); if (d < C.SAFE_AHEAD) return false; }
    return true;
  }
  // how late the player reaches a place: 0 = just ahead of it, 1 = just behind it (rivals drive the other way,
  // so a car appearing behind the player only comes round to meet it after most of a lap)
  function lateness(st, r, s0) { const p = st.player; let f = s0 / per(r) - p.s / per(p.r); f -= Math.floor(f); return f; }
  // estimated seconds until a rival starting at (r, s0) and the player come round to each other
  function meetTime(st, r, s0) { const p = st.player, wp = speed(st) / per(p.r), wr = rivalSpeed(st) / per(r); return lateness(st, r, s0) / (wp + wr); }
  function spawnOK(st, r, s0) { const [px, py] = carXY(st.player), [x, y] = pos(r, s0); return Math.hypot(x - px, y - py) >= C.SPAWN_MIN; }
  function spawnScore(st, r, s0) { return C.SPAWN_BEHIND ? (spawnOK(st, r, s0) ? 100 + meetTime(st, r, s0) : -1) : (safeAt(st, r, s0) ? 1e4 : 0) + Math.hypot(...((a, b) => [a[0] - b[0], a[1] - b[1]])(pos(r, s0), carXY(st.player))); }
  function farSpot(st) {
    const [px, py] = carXY(st.player);
    const taken = new Set(st.dormant.map(d => d.spot).concat(st.flying.map(f => f.spot)));
    let bi = 0, bd = -1;
    // farthest safe spot; the farthest of all only if none is safe
    G.spots.forEach((_, i) => { if (taken.has(i)) return; const p = spotPos(i), d = spawnScore(st, p.r, p.s); if (d > bd) { bd = d; bi = i; } });
    return bi;
  }
  function promoteDormant(st) {
    if (!st.dormant.length) {
      if (st.convoyOn) {
        // nobody parked: the next car due back skips the rest of its wait and appears far away
        if (!st.returning.length) return;
        const r = st.returning.shift(), p = spotPos(farSpot(st));
        makeLeader(st, p.r, p.s, r.id); prefillTrail(st, p.r, p.s); st.leader.warm = C.WARM; ev(st, 'leader'); return;
      }
      const id = st.returning.length ? st.returning.shift().id : newCar(st);
      const [px, py] = carXY(st.player);
      // convoy off: re-enter far from the player
      let best = null, bd = -1;
      for (let r = 0; r < NR; r++) for (let k = 0; k < 4; k++) { const s = cornerS(G, r, k); const [x, y] = pos(r, s); const d = Math.hypot(x - px, y - py); if (d > bd) { bd = d; best = { r, s }; } }
      makeLeader(st, best.r, best.s, id); prefillTrail(st, best.r, best.s); st.leader.warm = C.WARM; ev(st, 'leader'); return;
    }
    const [px, py] = carXY(st.player);
    let bi = -1, bd = -1, fi = 0, fd = -1;
    st.dormant.forEach((d, i) => { const p = spotPos(d.spot), [x, y] = pos(p.r, p.s); const dd = Math.hypot(x - px, y - py); if (dd > fd) { fd = dd; fi = i; }
      const ok = C.SPAWN_BEHIND ? spawnOK(st, p.r, p.s) && meetTime(st, p.r, p.s) >= C.SPAWN_LATE : safeAt(st, p.r, p.s), sc = C.SPAWN_BEHIND ? meetTime(st, p.r, p.s) : dd;
      if (ok && sc > bd) { bd = sc; bi = i; } });
    if (bi < 0) { // no parked car is in a safe place: the farthest one drives off to the far side first
      const d = st.dormant.splice(fi, 1)[0], p = spotPos(d.spot), [x, y] = pos(p.r, p.s);
      st.flying.push({ id: d.id, x0: x, y0: y, t: 0, spot: farSpot(st), lead: true }); return; // it leads from where it lands
    }
    const d = st.dormant.splice(bi, 1)[0], p = spotPos(d.spot);
    makeLeader(st, p.r, p.s, d.id); prefillTrail(st, p.r, p.s); st.leader.warm = C.WARM; ev(st, 'leader');
  }

  function crash(st, x, y) {
    st.phase = 'crash'; st.phaseT = C.CRASH; st.stats.crashes++; st.lives--;
    st.tier = Math.max(0, st.tier - C.CRASH_DROP);
    if (st.base > 0) { ev(st, 'baselost', { base: st.base }); st.base = 0; } // the truck bonus is the stake you drive with
    ev(st, 'crash', { x, y });
  }

  // a truck scores nothing itself but raises the base factor for the rest of the run (x1 -> x2 -> x3 ..., up to x(1 + TRUCK_MAX);
  // a crash loses it): with x2 every power's red cars score x2, x4, x8 ... Once the base is full, a truck simply scores like a red car.
  function eatTruck(st, x, y) {
    st.stats.truckEats = (st.stats.truckEats || 0) + 1;
    if (st.base >= C.TRUCK_MAX) { eat(st, x, y, true); return; }
    st.base++;
    ev(st, 'eat', { x, y, pts: 0, chain: st.chain, truck: true, base: st.base, mult: mult(st, st.chain + 1) });
    st.stop = C.HITSTOP; st.grace = C.EAT_GRACE;
  }
  // exact multiplier of the n-th red car of a power: base factor (x1 + one per truck, no cap by default) times the doubling chain x1, x2, x4 ...,
  // the product capped at MULT_MAX (x64);
  // CHAIN_LINEAR (off) would make the chain part x1, x2, x3 ...
  function mult(st, n) { const chain = C.CHAIN_LINEAR ? n : Math.pow(2, Math.min(n, 7) - 1); return Math.min(C.MULT_MAX, (1 + st.base) * chain); } // the total is capped (x64 = 12,800 per car)
  function eat(st, x, y, truck) {
    const sw = st.chain > 0 && st.shiftSinceEat; st.shiftSinceEat = false;
    st.chain++; st.stats.eats++; st.stats.maxChain = Math.max(st.stats.maxChain, st.chain);
    // following the convoy's snake through a lane change doubles that hit
    // chain value: doubling 200, 400, 800 ... (capped at x7), or linear 200 x multiplier when CHAIN_LINEAR
    const m = mult(st, st.chain), pts = 200 * m * (sw ? 2 : 1);
    if (sw) st.stats.switches = (st.stats.switches || 0) + 1;
    st.score += pts; st.stats.chainScore += pts;
    if (HALVES[x < CX ? st.pl : st.pr].feast) st.stats.feastScore = (st.stats.feastScore || 0) + pts;
    ev(st, 'eat', { x, y, pts, chain: st.chain, mult: m, sw, boosted: st.base > 0, truckFull: !!truck });
    st.stop = C.HITSTOP + Math.min(st.chain, 6);
    st.grace = C.EAT_GRACE; // the next car in line cannot hit you right after a bite, even if the power just ran out
  }

  function collide(st) {
    const p = st.player; const [px, py] = carXY(p), [qx, qy] = pos(p.r, p.s);
    // pickups count where the car is drawn or where it is on its lane, so the sideways slide after a turn never skips a dot
    const near = (x, y, r) => (Math.abs(x - px) < r && Math.abs(y - py) < r) || (Math.abs(x - qx) < r && Math.abs(y - qy) < r);
    // dots on the player's lane
    for (const i of G.byRing[p.r]) {
      if (!st.dots[i]) continue; const d = G.dots[i];
      if (near(d.x, d.y, C.DOT_R)) {
        st.dots[i] = false;
        if (d.power) {
          st.score += 50; st.stats.powers++;
          if (st.powerOn) {
            if (!st.leader && !st.followers.length) st.stats.wasted++;
            const onFeast = HALVES[d.half ? st.pr : st.pl].feast;
            // feast pellets give short power that stacks (the chain carries on while it lasts)
            st.fright = onFeast ? Math.min(frightTicks(st.tier), st.fright + Math.round(frightTicks(st.tier) * C.FEAST_T)) : frightTicks(st.tier);
            ev(st, 'power', { x: d.x, y: d.y, feast: onFeast });
          }
        } else {
          st.score += 10; st.stats.dots++; ev(st, 'dot', { x: d.x, y: d.y });
          checkHalf(st, d.half);
        }
      }
    }
    // refill flags
    for (let i = st.items.length - 1; i >= 0; i--) {
      const it = st.items[i]; const [ix, iy] = pos(it.r, it.s);
      if (Math.hypot(ix - px, iy - py) < C.HIT || Math.hypot(ix - qx, iy - qy) < C.HIT) {
        st.items.splice(i, 1); st.tier = Math.min(C.TIER_MAX, st.tier + 1);
        if (C.MORPH) morphHalf(st, it.half);
        const pts = 500 * (st.tier + 1); st.score += pts; st.stats.refills++;
        G.dots.forEach((d, j) => { if (d.half === it.half) st.dots[j] = true; });
        st.halfDone[it.half] = false;
        if (st.convoyOn && st.carsTotal < C.MAX_CARS) { st.carsTotal++; parkCar(st, newCar(st)); }
        ev(st, 'refill', { x: ix, y: iy, pts, tier: st.tier, half: it.half });
      }
    }
    // parked cars wake when driven over
    for (let i = st.dormant.length - 1; i >= 0; i--) {
      const dm = st.dormant[i], sp = spotPos(dm.spot), [x, y] = pos(sp.r, sp.s);
      if (Math.hypot(x - px, y - py) < C.HIT) {
        st.dormant.splice(i, 1); st.stats.wakes++;
        // with no convoy to join, the woken car flies to the far side and waits to lead
        if (st.leader) st.flying.push({ id: dm.id, x0: x, y0: y, t: 0 });
        else st.flying.push({ id: dm.id, x0: x, y0: y, t: 0, spot: farSpot(st), lead: !st.flying.some(f => f.lead) }); // with no leader, it goes off to lead
        ev(st, 'wake', { x, y });
      }
    }
    // rival cars (planning copies with ghost set ignore them; after a bite, unpowered contact passes through)
    if (st.ghost) return false;
    const safe = st.fright === 0 && st.grace > 0;
    const L = st.leader;
    if (L && !safe && !(L.warm > 0)) {
      const [lx, ly] = carXY(L);
      if (Math.hypot(lx - px, ly - py) < C.HIT) {
        if (st.fright > 0) {
          eat(st, lx, ly); st.returning.push({ id: L.id, t: C.RETURN });
          if (st.followers.length) {
            const f = st.followers.shift(); const smp = sampleAt(st, st.trailD - f.lag);
            const [ex, ey] = pos(smp.r, smp.s);
            makeLeader(st, smp.r, smp.s, f.id, smp.x - ex, smp.y - ey);
            st.leader.slT = C.SLIDE;
            // drop trail beyond the new leader
            const cutD = st.trailD - f.lag;
            while (st.trail.length > 2 && st.trail[st.trail.length - 1].d > cutD) st.trail.pop();
            st.trail.push({ d: cutD, x: smp.x, y: smp.y, r: smp.r, s: smp.s });
            st.trailD = cutD;
            for (const o of st.followers) o.lag = Math.max(0, o.lag - f.lag);
          } else st.leader = null;
          return false;
        }
        crash(st, (lx + px) / 2, (ly + py) / 2); return true;
      }
    }
    if (safe) return false;
    for (let i = 0; i < st.cruisers.length; i++) {
      const c = st.cruisers[i], [cx, cy] = pos(c.r, c.s);
      if (Math.hypot(cx - px, cy - py) < C.HIT) {
        if (st.fright > 0) { (C.TRUCK_CHAIN ? eatTruck : eat)(st, cx, cy); st.cruisers.splice(i, 1); st.cruiseBack = C.CRUISE_BACK; return false; }
        crash(st, (cx + px) / 2, (cy + py) / 2); return true;
      }
    }
    for (let i = 0; i < st.followers.length; i++) {
      const f = st.followers[i]; const [fx, fy] = followerXY(st, f);
      if (Math.hypot(fx - px, fy - py) < C.HIT) {
        if (st.fright > 0) { eat(st, fx, fy); st.returning.push({ id: f.id, t: C.RETURN }); st.followers.splice(i, 1); return false; }
        crash(st, (fx + px) / 2, (fy + py) / 2); return true;
      }
    }
    return false;
  }

  function checkHalf(st, half) {
    if (st.halfDone[half]) return;
    for (let i = 0; i < G.dots.length; i++) { const d = G.dots[i]; if (d.half === half && !d.power && st.dots[i]) return; }
    st.halfDone[half] = true;
    // the flag stands in a gap on the other half (or on a dot spot there if that half has no gap)
    const cand = [];
    for (let r = 0; r < NR; r++) for (const e of G.ring[r]) { const [x] = pos(r, e.s); if (half === 0 ? x > CX + 1 : x < CX - 1) cand.push({ r, s: e.s }); }
    if (!cand.length) G.dots.forEach(d => { if (d.half !== half && !d.power) cand.push({ r: d.r, s: d.s }); });
    const c = cand[Math.floor(rnd(st) * cand.length)];
    st.items.push({ half, r: c.r, s: c.s });
    ev(st, 'halfclear', { half });
  }

  function clone(st) {
    return {
      ...st, player: { ...st.player }, leader: st.leader && { ...st.leader },
      cruisers: st.cruisers.map(c => ({ ...c })), trail: st.trail.slice(), followers: st.followers.map(f => ({ ...f })), flying: st.flying.map(f => ({ ...f })),
      dormant: st.dormant.map(d => ({ ...d })), returning: st.returning.map(d => ({ ...d })), dots: st.dots.slice(),
      items: st.items.map(i => ({ ...i })), halfDone: st.halfDone.slice(), events: [], stats: { ...st.stats },
    };
  }

  // positions of all live rival cars (for rendering / bots)
  function rivals(st) {
    const out = [];
    if (st.leader) { const [x, y] = carXY(st.leader); const t = tan(st.leader.r, st.leader.s); out.push({ id: st.leader.id, x, y, dx: -t[0], dy: -t[1], lead: true, r: st.leader.r }); }
    for (const c of st.cruisers) { const [x, y] = pos(c.r, c.s), t = tan(c.r, c.s); out.push({ id: c.id, x, y, dx: -t[0], dy: -t[1], lead: false, cruiser: true, r: c.r }); }
    st.followers.forEach(f => { const p = sampleAt(st, st.trailD - f.lag); const q = sampleAt(st, st.trailD - f.lag + 4); out.push({ id: f.id, x: p.x, y: p.y, dx: q.x - p.x, dy: q.y - p.y, lead: false, r: p.r }); });
    return out;
  }
  function flyingXY(st, f) {
    let tl;
    if (f.spot != null) { const p = spotPos(f.spot), [x, y] = pos(p.r, p.s); tl = { x, y }; }
    else tl = sampleAt(st, st.trailD - tailLag(st)) || { x: f.x0, y: f.y0 };
    const k = f.t / C.FLY, e = k * k * (3 - 2 * k);
    return [f.x0 + (tl.x - f.x0) * e, f.y0 + (tl.y - f.y0) * e - Math.sin(k * Math.PI) * 14];
  }
  // Predicted path of the player's own car if the current input is kept: through the gap it is at (or about to
  // reach) and on to the next gap. Uses the real step on a copy with every other car removed, so it cannot disagree
  // with the simulation about lanes crossed.
  function predictPath(st, inp, maxT) {
    const q = clone(st); q.leader = null; q.followers = []; q.flying = []; q.dormant = []; q.returning = []; q.cruisers = [];
    q.items = []; q.leaderWait = -1e9; q.cruiseWait = -1e9; q.phase = 'play'; q.stop = 0; q.timeLeft = 1e9; q.fright = 0; q.powerOn = false;
    const keep = { inHeld: !!inp.inHeld, outHeld: !!inp.outHeld, boost: !!inp.boost };
    const pts = [carXY(q.player)];
    let seen = Math.abs(gapOf(q.player.r, q.player.s).o) < C.GAPW, stage = 0; // 0 up to / in the first gap, 1 after it, 2 at the next gap
    for (let t = 0; t < (maxT || 240) && stage < 2; t++) {
      // stop at the edge of the next gap, before any crossing there
      if (stage === 1 && distToGap(q.player.r, q.player.s, 1) - C.GAPW < 6) { stage = 2; break; }
      step(q, keep); use(q);
      const p = q.player, inz = Math.abs(gapOf(p.r, p.s).o) < C.GAPW;
      if (stage === 0) { if (inz) seen = true; else if (seen) stage = 1; }
      if (t % 2 === 0) pts.push(carXY(p));
    }
    pts.push(carXY(q.player));
    use(st);
    return { pts, lane: q.player.r, done: stage === 2 };
  }
  // Predicted path of the leading rival: through its next gap using the turn it has already signalled, on to the
  // gap after. Later turns are not guessed (aiBlind), and the copy ignores collisions (ghost).
  function predictRival(st, maxT) {
    if (!st.leader) return null;
    const q = clone(st); q.aiBlind = true; q.ghost = true; q.items = []; q.dormant = []; q.cruisers = []; q.leaderWait = -1e9; q.cruiseWait = -1e9;
    q.stop = 0; q.timeLeft = 1e9; q.phase = 'play';
    const pts = [carXY(q.leader)]; let seen = Math.abs(gapOf(q.leader.r, q.leader.s).o) < C.GAPW, stage = 0, id = q.leader.id;
    for (let t = 0; t < (maxT || 240) && stage < 2; t++) {
      const L = q.leader; if (!L || L.id !== id) break;
      if (stage === 1 && distToGap(L.r, L.s, -1) - C.GAPW < 6) break;
      step(q, {}); use(q);
      const M = q.leader; if (!M) break;
      const inz = Math.abs(gapOf(M.r, M.s).o) < C.GAPW;
      if (stage === 0) { if (inz) seen = true; else if (seen) stage = 1; }
      if (t % 2 === 0) pts.push(carXY(M));
    }
    if (q.leader) pts.push(carXY(q.leader));
    use(st);
    return { pts, lane: q.leader ? q.leader.r : -1 };
  }
  function dotsLeft(st, half) { use(st); let n = 0; G.dots.forEach((d, i) => { if (st.dots[i] && !d.power && (half == null || d.half === half)) n++; }); return n; }

  checkC();
  G = geo(0);
  const HR = { W, H, CX, CY, NR, TPS, C, checkC, COURSES, HALVES, SEQUENCE, geo, geoLR, findGap: (side, off) => G.gaps.findIndex(q => q.side === side && q.off === (off || 0)), use, gapS, gapSide, canShift, cornerS: (r, c) => cornerS(G, r, c), get G() { return G; }, get RINGS() { return G.hw; }, get DOTS() { return G; }, create, step, clone, pos, tan, gapOf, wrap, per, carXY, rivals, flyingXY, spotPos, speed, distToGap, nextGapK, dotsLeft, mult, meetTime: (st, r, s0) => meetTime(st, r, s0), predictPath, predictRival, rivalSpeed, frightTicks };
  if (typeof module !== 'undefined' && module.exports) module.exports = HR; else root.HR = HR;
})(this);
