// PILEUP — rules core (browser global PILEUP / Node module). Deterministic integer rules, 60 ticks per second.
// A getaway car in a city-block maze leaves tyre tracks. Patrol cars hunt it until they cross its tracks, then
// follow the tracks exactly, turn for turn, wherever they go. So the getaway car's route is the police's route:
// drive across your own tracks just ahead of the line, or double back after a junction, and the line meets
// itself. Cars meeting head-on or side-on wreck; a burning wreck blocks its tile, and a car following tracks
// through it drives in and joins the pileup. Wreck enough cars and the district's exits open: each leads to the
// neighbouring district on that side of a 7x7 city, and driving out of the outer ring escapes the city.
(function (root) {
  'use strict';
  const C = {
    W: 21, H: 18, TILE: 240,           // grid; positions are integer units, tile centres at TILE*i + TILE/2
    PSPD: 22,                          // getaway car, units per tick (5.5 tiles/s)
    CSPD0: 18, CSPD_MAX: 28, CSPD_STEP_T: 600, // patrol cars start slower and gain 1 unit/tick every STEP_T ticks
    CAP0: 4, CAP_MAX: 10, CAP_STEP_T: 600,      // patrol cars on the field: CAP0 at start, +1 every STEP_T ticks
    FIRST_T: 60, SPAWN_GAP0: 150, SPAWN_GAP_MIN: 40, SPAWN_RAMP: 1, WARN_T: 90, // first arrival; gap between arrivals (falls RAMP ticks per second); siren warning before one
    WRECK_T: 540,                      // a wreck burns this long, then is towed
    HIT_CC: 180,                       // two patrol cars closer than this (Manhattan units) collide
    HIT_PC: 170,                       // a patrol car this close to the getaway car catches it
    HIT_W: 200,                        // a car this close to a wreck's tile centre has driven into it
    TRAIL_N: 48,                       // tyre tracks kept, in tiles (older ones fade and are lost)
    PTS: 100,                          // the n-th car in a pileup scores PTS * n
    VAN_IMMUNE: 30,                    // a van that rams a car drives on; it cannot be hit again for this long
    VAN_HP: 3,                         // ...but each ram damages it; the third wrecks it. A burning wreck stops it at once
    READY_T: 90, DEAD_T: 100, CLEAR_T: 150,
    LIVES: 3, EXTEND_FIRST: 10000, EXTEND_EVERY: 40000,
    CLEAR_BONUS: 1000,                 // x (ring + 1), for getting out of a district for the first time
    CLEAR_LIFE: 1,                     // and an extra car, also the first time only
    ESCAPE_BONUS: 10000,               // for driving out of the city
    CAR_BONUS: 5000,                   // ...and this for each car you still have when you do
    REVISIT_HEAT: 2,                   // a district you have been through before is on alert: this much more heat
    RUN_HEAT_T: 7200,                  // and police everywhere get a step faster every this many ticks of the run
    CITY_R: 3,                         // the city is (2R+1) x (2R+1) districts around DOWNTOWN
  };
  const DX = [0, 0, 1, 0, -1], DY = [0, -1, 0, 1, 0]; // 1 up, 2 right, 3 down, 4 left
  const REV = [0, 3, 4, 1, 2];
  const HALF = C.TILE / 2;
  const START = [10, 7];
  // exits in the middle of each edge: the tile outside the wall, the road tile inside it, and the way out
  const EXITS = [[10, 0, 1], [20, 7, 2], [10, 17, 3], [0, 7, 4]].map(([x, y, d]) => ({ x, y, d, px: x - DX[d], py: y - DY[d] }));
  const GATES = [[1, 1], [19, 1], [1, 16], [19, 16]]; // patrol cars arrive at the four corners

  // ---- districts: a lattice of roads with some streets removed, and the element each one brings
  // H i,j: row j between col i and i+1; V i,j: col i between row j and j+1 (ROWS and COLS index the lattice)
  const ROWS = [1, 4, 7, 10, 13, 16], COLS = [1, 4, 7, 10, 13, 16, 19];
  // ---- the city: DOWNTOWN in the middle; every other district's zone is drawn for each run, the outer rings leaning
  // to the best-paying, hottest zones but often mixed with others. A zone sets which police come and how much a
  // pileup pays; the ring sets the quota.
  // heat: police on the field (cap) and their speed, up or down from the city's usual
  const ZONES = {
    DOWNTOWN: { mult: 1, heat: 0 },
    'OLD TOWN': { mult: 1, heat: -1 },
    MARKET: { van: true, mult: 1.5, heat: 0 },
    UPTOWN: { dog: true, mult: 1.5, heat: 0 },
    HARBOR: { van: true, dog: true, mult: 3, heat: 1 },
    INDUSTRY: { van: true, dog: true, mult: 3, heat: 1 },
  };
  // chance of each zone by ring: [OLD TOWN, MARKET, UPTOWN, HARBOR or INDUSTRY]
  const ZONE_ODDS = [null, [0.35, 0.30, 0.30, 0.05], [0.20, 0.275, 0.275, 0.25], [0.15, 0.20, 0.20, 0.45]];
  const ring = (cx, cy) => Math.max(Math.abs(cx), Math.abs(cy));
  const cityIndex = (cx, cy) => (cy + C.CITY_R) * (2 * C.CITY_R + 1) + cx + C.CITY_R;
  function drawCity(st) {
    const R = C.CITY_R, z = [];
    for (let cy = -R; cy <= R; cy++) for (let cx = -R; cx <= R; cx++) {
      const r = ring(cx, cy);
      if (!r) { z.push('DOWNTOWN'); continue; }
      const odds = ZONE_ODDS[r], u = rnd(st);
      let k = 0, acc = odds[0];
      while (u >= acc && k < 3) acc += odds[++k];
      z.push(k < 3 ? ['OLD TOWN', 'MARKET', 'UPTOWN'][k] : rnd(st) < 0.5 ? 'HARBOR' : 'INDUSTRY');
    }
    return z;
  }
  function districtAt(st, cx, cy) {
    const name = st.zones[cityIndex(cx, cy)], r = ring(cx, cy);
    return { name, cx, cy, ring: r, quota: 4 + r, ...ZONES[name], van: !!ZONES[name].van, dog: !!ZONES[name].dog };
  }
  // times the run has entered (cx, cy); the district you are in counts once
  const visits = (st, cx, cy) => st.route.filter(([a, b]) => a === cx && b === cy).length;
  const DOWNTOWN_CUT = ['V3,0', 'V3,4', 'H0,2', 'H5,2', 'H0,3', 'H5,3', 'V2,2', 'V4,2'];
  const SEGMENTS = [];
  for (let j = 0; j < ROWS.length; j++) for (let i = 0; i + 1 < COLS.length; i++) SEGMENTS.push(`H${i},${j}`);
  for (let i = 0; i < COLS.length; i++) for (let j = 0; j + 1 < ROWS.length; j++) SEGMENTS.push(`V${i},${j}`);
  function isRoad(M, tx, ty) { return tx >= 0 && ty >= 0 && tx < C.W && ty < C.H && M.road[ty * C.W + tx] === 1; }
  function buildMap(D) {
    const road = new Uint8Array(C.W * C.H), cut = D.cut || [];
    for (let j = 0; j < ROWS.length; j++) for (let i = 0; i + 1 < COLS.length; i++) if (!cut.includes(`H${i},${j}`)) for (let x = COLS[i]; x <= COLS[i + 1]; x++) road[ROWS[j] * C.W + x] = 1;
    for (let i = 0; i < COLS.length; i++) for (let j = 0; j + 1 < ROWS.length; j++) if (!cut.includes(`V${i},${j}`)) for (let y = ROWS[j]; y <= ROWS[j + 1]; y++) road[y * C.W + COLS[i]] = 1;
    const M = { name: D.name, road };
    // every road tile has two ways out, and every road tile can reach every other
    const tiles = [];
    for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) if (road[y * C.W + x]) {
      tiles.push(y * C.W + x);
      let n = 0; for (let d = 1; d <= 4; d++) if (isRoad(M, x + DX[d], y + DY[d])) n++;
      if (n < 2) throw new Error(`${D.name}: dead end at ${x},${y}`);
    }
    const seen = new Set([tiles[0]]), q = [tiles[0]];
    while (q.length) {
      const k = q.pop(), x = k % C.W, y = (k - x) / C.W;
      for (let d = 1; d <= 4; d++) { const nk = (y + DY[d]) * C.W + x + DX[d]; if (isRoad(M, x + DX[d], y + DY[d]) && !seen.has(nk)) { seen.add(nk); q.push(nk); } }
    }
    if (seen.size !== tiles.length) throw new Error(`${D.name}: the map is cut in two`);
    for (const g of GATES) if (!isRoad(M, g[0], g[1])) throw new Error(`${D.name}: gate ${g} is not a road`);
    if (!isRoad(M, START[0], START[1]) || EXITS.some(e => !isRoad(M, e.px, e.py))) throw new Error(`${D.name}: start or an exit is not on a road`);
    return M;
  }
  // every district's maze is fixed: DOWNTOWN is drawn by hand, the rest remove 6-9 streets chosen from a seed of
  // the district's position, keeping the rules buildMap checks (no dead end, one connected city, gates, exits)
  const MAPS = new Map();
  function mapAt(cx, cy) {
    const key = cx + ',' + cy;
    let M = MAPS.get(key);
    if (M) return M;
    if (!cx && !cy) M = buildMap({ name: 'DOWNTOWN', cut: DOWNTOWN_CUT });
    else {
      let s = ((cx + 11) * 7919 + (cy + 13) * 104729) | 0;
      const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (let tries = 0; !M; tries++) {
        const n = 6 + Math.floor(r() * 4), cut = [];
        while (cut.length < n) { const sg = SEGMENTS[Math.floor(r() * SEGMENTS.length)]; if (!cut.includes(sg)) cut.push(sg); }
        try { M = buildMap({ name: key, cut }); } catch (e) { if (tries > 500) throw e; }
      }
    }
    MAPS.set(key, M);
    return M;
  }
  for (let cy = -C.CITY_R; cy <= C.CITY_R; cy++) for (let cx = -C.CITY_R; cx <= C.CITY_R; cx++) mapAt(cx, cy);

  function rnd(st) { let a = st.rs = (st.rs + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const cen = (t) => t * C.TILE + HALF;
  const tileOf = (v) => Math.floor(v / C.TILE);
  const atCentre = (o) => (o.x - HALF) % C.TILE === 0 && (o.y - HALF) % C.TILE === 0;
  const map = (st) => mapAt(st.cx, st.cy);
  // the district you are in; back in one you have been through before, it is on alert
  function district(st) {
    const D = districtAt(st, st.cx, st.cy);
    if (visits(st, st.cx, st.cy) > 1) { D.heat += C.REVISIT_HEAT; D.alert = true; }
    return D;
  }
  const feature = (st, f) => !!district(st)[f] && !st.off[f];
  // where an exit leads: the neighbouring district, or out of the city
  function exitDest(st, d) {
    const cx = st.cx + DX[d], cy = st.cy + DY[d];
    return ring(cx, cy) > C.CITY_R ? { escape: true } : { cx, cy, ...districtAt(st, cx, cy), seen: st.cleared.includes(cx + ',' + cy), alert: visits(st, cx, cy) > 0 };
  }

  // opt.at: start in district [cx, cy] (as if it were the run's first), opt.zone: that district's zone;
  // opt.off: elements switched off ({ van, dog }),
  // for measuring what each one does
  function create(seed, opt) {
    const st = {
      t: 0, rs: (seed | 0) ^ 0x5bd1e995, score: 0, over: false, won: false, cause: null,
      d: 0, cx: (opt && opt.at && opt.at[0]) || 0, cy: (opt && opt.at && opt.at[1]) || 0, entry: 0, cleared: [], route: [], lives: C.LIVES, nextExtend: C.EXTEND_FIRST, off: (opt && opt.off) || {},
      wrecked: 0, exit: false, phase: 'ready', pt: C.READY_T, dt: 0,
      p: null, cops: [], wrecks: [], nextId: 1, spawnT: C.FIRST_T, warn: null,
      distP: new Int16Array(C.W * C.H), trail: null, trailBase: 0, events: [],
      stats: { crashes: 0, cars: 0, best: 0, spawned: 0, turns: 0, deaths: 0, districts: 0, vanHits: 0, fail: {} },
    };
    st.zones = drawCity(st);
    if (opt && opt.zone) st.zones[cityIndex(st.cx, st.cy)] = opt.zone;
    st.route.push([st.cx, st.cy]);
    enter(st);
    return st;
  }
  // put the actors back for the start of a district or a life
  // a district is entered at the edge opposite the side you left the last one by, rolling inwards; the run
  // starts in the middle of DOWNTOWN
  function enter(st) {
    const e = st.entry ? EXITS.find(x => x.d === REV[st.entry]) : null, sx = e ? e.px : START[0], sy = e ? e.py : START[1];
    st.p = { x: cen(sx), y: cen(sy), dir: 0, want: st.entry || 0 };
    st.cops = []; st.wrecks = []; st.spawnT = C.FIRST_T; st.dt = 0;
    st.trail = [[sx, sy, st.t]]; st.trailBase = 0;
    route(st); st.warn = { gate: pickGate(st), t: C.FIRST_T };
    st.phase = 'ready'; st.pt = C.READY_T;
  }

  const wreckAt = (st, tx, ty) => st.wrecks.some(w => w.tx === tx && w.ty === ty);
  const road = (st, tx, ty) => isRoad(map(st), tx, ty);
  const open = (st, tx, ty) => road(st, tx, ty) && !wreckAt(st, tx, ty);
  const canMove = (st, tx, ty, d) => open(st, tx + DX[d], ty + DY[d]);

  // shortest road distance to tile (sx, sy) from every tile, around wrecks
  function flood(st, D, sx, sy) {
    D.fill(-1);
    const q = [sx + sy * C.W];
    D[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % C.W, y = (k - x) / C.W;
      for (let d = 1; d <= 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!open(st, nx, ny)) continue;
        const nk = nx + ny * C.W;
        if (D[nk] < 0) { D[nk] = D[k] + 1; q.push(nk); }
      }
    }
  }
  function route(st) { flood(st, st.distP, tileOf(st.p.x), tileOf(st.p.y)); }

  // advance a car by spd units along the roads; choose(car) picks a direction at each tile centre (0 stops)
  function drive(car, spd, choose) {
    let rem = spd;
    while (rem > 0) {
      if (atCentre(car)) {
        const d = choose(car);
        if (!d) { car.dir = 0; return; }
        car.dir = d;
      } else if (!car.dir) return;
      const off = car.dir === 2 || car.dir === 4 ? (car.x - HALF) % C.TILE : (car.y - HALF) % C.TILE;
      const toC = off === 0 ? C.TILE : (car.dir === 2 || car.dir === 3 ? C.TILE - off : off);
      const s = rem < toC ? rem : toC;
      car.x += DX[car.dir] * s; car.y += DY[car.dir] * s; rem -= s;
    }
  }

  function choosePlayer(st) {
    return (p) => {
      const tx = tileOf(p.x), ty = tileOf(p.y), tr = st.trail, last = tr[tr.length - 1];
      if (last[0] !== tx || last[1] !== ty) {          // a new tile of tyre tracks
        tr.push([tx, ty, st.t]);
        if (tr.length > C.TRAIL_N) { tr.shift(); st.trailBase++; }
      }
      if (st.exit) for (const e of EXITS) if (p.want === e.d && tx === e.px && ty === e.py) return e.d; // out through an open exit
      if (p.want && canMove(st, tx, ty, p.want)) { if (p.want !== p.dir) st.stats.turns++; return p.want; }
      if (p.dir && canMove(st, tx, ty, p.dir)) return p.dir;
      return 0;
    };
  }
  // a car on the tracks drives to the next tile of them, even into a wreck and even back the way it came.
  // Off the tracks it hunts the getaway car by the shortest road, never reversing, and picks up the tracks at the
  // first tile of them it reaches (the newest visit to that tile). A dog unit never takes the tracks: it always hunts.
  function dirTo(tx, ty, nx, ny) { for (let d = 1; d <= 4; d++) if (tx + DX[d] === nx && ty + DY[d] === ny) return d; return 0; }
  function chooseCop(st) {
    const tr = st.trail, dogs = feature(st, 'dog');
    return (c) => {
      const tx = tileOf(c.x), ty = tileOf(c.y), hunter = c.kind === 'dog' && dogs;
      let rel = c.ti >= 0 && !hunter ? c.ti - st.trailBase : -1;
      if (rel >= 0 && (tr[rel][0] !== tx || tr[rel][1] !== ty)) rel = -1;
      if (rel < 0 && !hunter) {
        c.ti = -1;
        for (let i = tr.length - 2; i >= 0; i--) if (tr[i][0] === tx && tr[i][1] === ty) { rel = i; break; }
        if (rel >= 0) st.events.push({ type: 'scent', id: c.id, tx, ty });
      }
      if (rel >= 0 && rel + 1 < tr.length) {
        const d = dirTo(tx, ty, tr[rel + 1][0], tr[rel + 1][1]);
        if (d) { c.ti = st.trailBase + rel + 1; return d; }
      }
      c.ti = rel >= 0 ? st.trailBase + rel : -1;     // at the newest track tile: the getaway car is just ahead
      let best = 0, bd = 1e9;
      for (const d of c.pref) {
        if (d === REV[c.dir]) continue;
        if (!canMove(st, tx, ty, d)) continue;
        let v = st.distP[tx + DX[d] + (ty + DY[d]) * C.W]; if (v < 0) v = 999;
        if (v < bd) { bd = v; best = d; }
      }
      if (!best && c.dir && canMove(st, tx, ty, REV[c.dir])) best = REV[c.dir];
      if (!best) for (let d = 1; d <= 4; d++) if (canMove(st, tx, ty, d)) { best = d; break; }
      return best;
    };
  }

  const PREFS = [[1, 4, 3, 2], [4, 1, 2, 3], [2, 3, 4, 1], [3, 2, 1, 4], [1, 2, 3, 4], [4, 3, 2, 1]];
  function spawnCop(st, gate) {
    const [gx, gy] = GATES[gate];
    let kind = 'car';
    const r = rnd(st);
    if (feature(st, 'dog') && r < 0.25) kind = 'dog';
    else if (feature(st, 'van') && r > 0.7) kind = 'van';
    const c = { id: st.nextId++, x: cen(gx), y: cen(gy), dir: 0, pref: PREFS[Math.floor(rnd(st) * PREFS.length)].slice(), ti: -1, kind, hp: kind === 'van' ? C.VAN_HP : 1, immune: 0 };
    st.cops.push(c); st.stats.spawned++;
    st.events.push({ type: 'spawn', id: c.id, x: c.x, y: c.y, kind });
  }
  function pickGate(st) {
    // one of the two corners farthest from the getaway car, by road
    const g = GATES.map((t, i) => ({ i, d: st.distP[t[0] + t[1] * C.W] }))
      .filter(o => o.d >= 0 && !wreckAt(st, GATES[o.i][0], GATES[o.i][1])).sort((a, b) => b.d - a.d);
    if (!g.length) return -1;
    return g[Math.min(g.length - 1, Math.floor(rnd(st) * 2))].i;
  }
  // police on the field and their speed: the district's heat, every second district entered on this run, how long the run
  // has gone on, and time spent in this life
  const cap = (st) => Math.min(C.CAP_MAX + district(st).heat, C.CAP0 + district(st).heat + Math.floor(st.dt / C.CAP_STEP_T));
  const copSpeed = (st) => Math.min(C.CSPD_MAX, C.CSPD0 + district(st).heat + (st.d >> 1) + Math.floor(st.t / C.RUN_HEAT_T) + Math.floor(st.dt / C.CSPD_STEP_T));
  const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function addScore(st, pts) {
    st.score += pts;
    while (st.score >= st.nextExtend) { st.lives++; st.nextExtend += C.EXTEND_EVERY; st.events.push({ type: 'extend', lives: st.lives }); }
  }
  // a car joins wreck w; a van scores twice but is one car towards the exit
  function addToWreck(st, w, car) {
    st.wrecked++;
    for (let k = car.kind === 'van' && feature(st, 'van') ? 2 : 1; k > 0; k--) {
      w.n++;                                         // the fire burns from the first crash; joining cars do not prolong it
      const pts = Math.round(C.PTS * w.n * district(st).mult);
      addScore(st, pts); st.stats.cars++;
      if (w.n > st.stats.best) st.stats.best = w.n;
      st.events.push({ type: 'crash', id: w.id, n: w.n, pts, x: car.x, y: car.y, tx: w.tx, ty: w.ty, tracked: car.ti >= 0, kind: car.kind });
    }
  }
    // a heavy van rams: a car that hits it is wrecked and the van drives on, damaged. Its third ram, or any
  // burning wreck, stops it.
  function hurt(st, c, byWreck) {
    if (c.kind === 'van' && feature(st, 'van') && !byWreck && --c.hp > 0) {
      c.immune = C.VAN_IMMUNE; st.stats.vanHits++;
      st.events.push({ type: 'dent', id: c.id, x: c.x, y: c.y });
      return false;
    }
    return true;
  }

  // input: { d: 1..4 } sets the direction the getaway car takes at the next chance (kept until replaced)
  function step(st, input) {
    st.events = [];
    if (st.over || st.won) return;
    st.t++;
    const p = st.p;
    if (input && input.d >= 1 && input.d <= 4) {
      p.want = input.d;
      if (st.phase === 'play' && p.dir && input.d === REV[p.dir]) p.dir = input.d; // reversing is instant
    }
    if (st.phase !== 'play') {
      if (--st.pt > 0) return;
      if (st.phase === 'ready') { st.phase = 'play'; st.events.push({ type: 'go' }); }
      else if (st.phase === 'dead') {
        if (st.lives <= 0) { st.over = true; st.events.push({ type: 'gameover' }); }
        else enter(st);
      } else if (st.phase === 'clear') {
        if (st.escaped) { st.won = true; st.events.push({ type: 'won' }); return; }
        st.cx += DX[st.entry]; st.cy += DY[st.entry]; st.d++; st.wrecked = 0; st.exit = false;
        st.route.push([st.cx, st.cy]);
        enter(st);
      }
      return;
    }
    st.dt++;
    drive(p, C.PSPD, choosePlayer(st));
    if (p.x <= cen(0) || p.y <= cen(0) || p.x >= cen(C.W - 1) || p.y >= cen(C.H - 1)) { // out through an exit
      const dir = p.x <= cen(0) ? 4 : p.x >= cen(C.W - 1) ? 2 : p.y <= cen(0) ? 1 : 3, dest = exitDest(st, dir), key = st.cx + ',' + st.cy;
      const first = !st.cleared.includes(key);
      let bonus = first ? C.CLEAR_BONUS * (district(st).ring + 1) : 0;
      let cars = 0;
      if (dest.escape) { cars = st.lives * C.CAR_BONUS; bonus += C.ESCAPE_BONUS + cars; st.escaped = true; }
      addScore(st, bonus); st.stats.districts++;
      if (first) { st.cleared.push(key); if (C.CLEAR_LIFE && !dest.escape) { st.lives += C.CLEAR_LIFE; st.events.push({ type: 'extend', lives: st.lives }); } }
      st.entry = dir;
      st.phase = 'clear'; st.pt = C.CLEAR_T; st.events.push({ type: 'clear', d: st.d, bonus, dir, first, escape: !!dest.escape, cars });
      return;
    }
    route(st);
    const pick = chooseCop(st), base = copSpeed(st);
    for (const c of st.cops) {
      if (c.immune > 0) c.immune--;
      drive(c, base, pick);
    }

    // patrol cars meeting each other head-on or side-on (one running into the back of another does not count)
    const gone = new Set();
    for (let i = 0; i < st.cops.length; i++) for (let j = i + 1; j < st.cops.length; j++) {
      const a = st.cops[i], b = st.cops[j];
      if (gone.has(a) || gone.has(b) || man(a, b) >= C.HIT_CC || (a.dir === b.dir && a.dir)) continue;
      if (a.immune > 0 && b.immune > 0) continue;       // a van just hit takes no second hit until it drives on
      const ka = a.immune > 0 ? false : hurt(st, a), kb = b.immune > 0 ? false : hurt(st, b);
      if (!ka && !kb) continue;
      const w0 = ka ? a : b;
      let tx = ka && kb ? tileOf((a.x + b.x) >> 1) : tileOf(w0.x), ty = ka && kb ? tileOf((a.y + b.y) >> 1) : tileOf(w0.y);
      if (!road(st, tx, ty)) { tx = tileOf(w0.x); ty = tileOf(w0.y); }
      let w = st.wrecks.find(o => o.tx === tx && o.ty === ty);
      if (!w) { w = { id: st.nextId++, tx, ty, n: 0, t: C.WRECK_T }; st.wrecks.push(w); st.stats.crashes++; }
      if (ka) { addToWreck(st, w, a); gone.add(a); }
      if (kb) { addToWreck(st, w, b); gone.add(b); }
    }
    // patrol cars driving into a burning wreck
    for (const c of st.cops) {
      if (gone.has(c)) continue;
      for (const w of st.wrecks) {
        if (Math.abs(c.x - cen(w.tx)) + Math.abs(c.y - cen(w.ty)) >= C.HIT_W || c.immune > 0) continue;
        if (!hurt(st, c, true)) continue;
        addToWreck(st, w, c); gone.add(c); break;
      }
    }
    if (gone.size) st.cops = st.cops.filter(c => !gone.has(c));

    // wrecks burn out
    for (const w of st.wrecks) if (--w.t <= 0) st.events.push({ type: 'tow', id: w.id, tx: w.tx, ty: w.ty });
    st.wrecks = st.wrecks.filter(w => w.t > 0);

    // the exit opens once enough cars are wrecked
    if (!st.exit && st.wrecked >= district(st).quota) { st.exit = true; st.events.push({ type: 'exit' }); }

    // arrivals
    if (st.warn) {
      if (--st.warn.t <= 0) {
        const g = GATES[st.warn.gate];
        const busy = wreckAt(st, g[0], g[1]) || st.cops.some(c => Math.abs(c.x - cen(g[0])) + Math.abs(c.y - cen(g[1])) < C.TILE) || man(p, { x: cen(g[0]), y: cen(g[1]) }) < 3 * C.TILE;
        if (busy) st.warn.t = 20; else { spawnCop(st, st.warn.gate); st.warn = null; st.spawnT = st.cops.length < 3 ? 40 : Math.max(C.SPAWN_GAP_MIN, C.SPAWN_GAP0 - Math.floor(C.SPAWN_RAMP * st.dt / 60)); }
      }
    } else if (st.spawnT > 0) st.spawnT--;
    else if (st.cops.length < cap(st)) {
      const g = pickGate(st);
      if (g >= 0) { st.warn = { gate: g, t: C.WARN_T }; st.events.push({ type: 'warn', gate: g }); }
    }

    // the getaway car
    let cause = null;
    for (const w of st.wrecks) if (Math.abs(p.x - cen(w.tx)) + Math.abs(p.y - cen(w.ty)) < C.HIT_W) cause = 'wreck';
    if (!cause) for (const c of st.cops) if (man(p, c) < C.HIT_PC) { cause = 'caught'; break; }
    if (cause) {
      st.cause = cause; st.lives--; st.stats.deaths++; st.stats.fail[cause] = (st.stats.fail[cause] || 0) + 1;
      st.phase = 'dead'; st.pt = C.DEAD_T;
      st.events.push({ type: 'death', cause, x: p.x, y: p.y, lives: st.lives });
    }
  }

  function clone(st) {
    const s = JSON.parse(JSON.stringify({ ...st, distP: null }));
    s.distP = new Int16Array(st.distP);
    return s;
  }
  function hash(st) {
    const s = JSON.stringify([st.t, st.rs, st.score, st.over, st.won, st.escaped, st.zones, st.d, st.cx, st.cy, st.entry, st.cleared, st.lives, st.wrecked, st.exit, st.phase, st.pt, st.dt, st.p, st.cops, st.wrecks, st.spawnT, st.warn, st.nextId, st.trail, st.trailBase]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  const api = { C, DX, DY, REV, GATES, ROWS, COLS, START, EXITS, ZONES, ZONE_ODDS, districtAt, cityIndex, district, exitDest, mapAt, ring, map, feature, road, open, canMove,
    tileOf, cen, atCentre, create, step, flood, clone, hash, copSpeed, cap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PILEUP = api;
})(typeof self !== 'undefined' ? self : this);
