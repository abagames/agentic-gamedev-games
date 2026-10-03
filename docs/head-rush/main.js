// HEAD RUSH — rendering, input, arcade flow.
(function () {
  'use strict';
  const { W, H, CX, CY, C, NR } = HR;
  const cv = document.getElementById('screen');
  const g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const COL = { bg: '#000', wall: '#2040c0', wall2: '#101c58', dot: '#f0f0f0', power: '#f8b000', me: '#f8e800', rival: '#f83000', rival2: '#b82000',
    fright: '#3070f8', oneway: '#70a8f8', path: '#9c8c20', cruiser: '#b048f0', flash: '#f0f0f0', dorm: '#686868', text: '#f0f0f0', dim: '#7890b8', pts: '#50f0f0', flag: '#f0f0f0', blink: '#f8b000' };
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');

  // ---------- 3x5 font ----------
  // 5x7 arcade bitmap font, 6 px advance
  const FONT = {}, FD = {
    A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
    D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
    G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
    J: '..###...#....#....#.#..#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
    M: '#...###.###.#.##.#.##...##...##...#', N: '#...###..##.#.##..###...##...##...#', O: '.###.#...##...##...##...##...#.###.',
    P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
    S: '.###.#...##.....###.....##...#.###.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
    V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.###.###...#', X: '#...##...#.#.#...#...#.#.#...##...#',
    Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
    0: '.###.#..###.#.##.#.##.#.###..#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#..##..#...#....#####',
    3: '.###.#...#....#..##.....##...#.###.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
    6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
    9: '.###.#...##...#.####....#...#..##..', ':': '.......#....#.........#....#.......', '-': '...............#####...............',
    '!': '..#....#....#....#....#.........#..', x: '..........#...#.#.#...#...#.#.#...#', '.': '................................#..',
    '<': '...#...#...#...#.....#.....#.....#.', '>': '.#.....#.....#.....#...#...#...#...', '+': '.......#....#..#####..#....#.......',
    '/': '....#....#...#...#...#...#....#....', '_': '..............................#####',
  };
  for (const k in FD) FONT[k] = FD[k];
  function text(s, x, y, col, sc) {
    sc = sc || 1; g.fillStyle = col || COL.text; s = String(s).toUpperCase().replace(/X(?=\d)/g, 'x');
    for (let c = 0; c < s.length; c++) {
      const gl = FONT[s[c]] || (s[c] === 'x' ? FONT.x : null); if (gl) for (let i = 0; i < 35; i++) if (gl[i] === '#') g.fillRect(x + (c * 6 + i % 5) * sc, y + ((i / 5) | 0) * sc, sc, sc);
    }
  }
  const tw = (s, sc) => (String(s).length * 6 - 1) * (sc || 1);
  const ctext = (s, y, col, sc) => { const w = tw(s, sc), x = Math.round((W - w) / 2); g.fillStyle = COL.bg; g.fillRect(x - 2, y - 2, w + 4, 7 * (sc || 1) + 4); text(s, x, y, col, sc); };

  // ---------- car sprite ----------
  // cars 13x9 facing right: t tyre (shimmers with travel), b body, s twin stripe, g windshield, h headlight
  const CAR = ['..tt.....tt..', '.bbbbbbbbbbb.', 'bbbbbbbbggbbh', 'bssssssbggbbb', 'bbbbbbbbggbbb', 'bssssssbggbbb', 'bbbbbbbbggbbh', '.bbbbbbbbbbb.', '..tt.....tt..'];
  // cruiser: 17x9 box truck with a separate cab, so its silhouette differs from the homing cars
  const TRUCK = ['..tt.......tt.tt.', 'bbbbbbbbbbbb.bbb.', 'bbbbbbbbbbbb.bggh', 'bssssssssssb.bggb', 'bbbbbbbbbbbb.bggb', 'bssssssssssb.bggb', 'bbbbbbbbbbbb.bggh', 'bbbbbbbbbbbb.bbb.', '..tt.......tt.tt.'];
  const shadeCache = {};
  function shade(hex, k) { const key = hex + k; if (shadeCache[key]) return shadeCache[key]; const n = parseInt(hex.slice(1), 16), f = c => Math.round(((n >> c) & 255) * k).toString(16).padStart(2, '0'); return (shadeCache[key] = '#' + f(16) + f(8) + f(0)); }
  let tyre = 0;
  // 7x5 reserve-car icon for the lives counter
  function miniCar(x, y) { g.fillStyle = COL.me; g.fillRect(x - 3, y - 2, 7, 5); g.fillStyle = '#60d0f8'; g.fillRect(x + 1, y - 1, 1, 3); g.fillStyle = '#202020'; g.fillRect(x - 2, y - 3, 2, 1); g.fillRect(x + 1, y - 3, 2, 1); g.fillRect(x - 2, y + 3, 2, 1); g.fillRect(x + 1, y + 3, 2, 1); }
  // lean: [lx, ly] screen offset for the front of the car, so a lane change reads as steering into the new lane
  function car(x, y, dx, dy, col, glass, spr, stripe, lean) {
    spr = spr || CAR; x = Math.round(x); y = Math.round(y);
    const hor = Math.abs(dx) >= Math.abs(dy), sgn = hor ? Math.sign(dx) || 1 : Math.sign(dy) || 1, cw = spr[0].length, ch = spr.length, c0 = (cw - 1) >> 1, r0 = (ch - 1) >> 1;
    const st = stripe || shade(col, 0.55), gl = glass || '#60d0f8', ty = ((x + y + tyre) >> 1) & 1 ? '#202020' : '#585858';
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const k = spr[j][i]; if (k === '.') continue;
      let u = i - c0, v = j - r0; if (sgn < 0) { u = -u; v = -v; }
      let px = hor ? x + u : x - v, py = hor ? y + v : y + u;
      if (lean && i - c0 >= 2) { px += lean[0]; py += lean[1]; }
      g.fillStyle = k === 't' ? ty : k === 'g' ? gl : k === 'h' ? '#f8f8c0' : k === 's' ? st : col;
      g.fillRect(px, py, 1, 1);
    }
  }

  // ---------- state ----------
  let st = null, mode = 'title', demo = null, demoPolicy = null, overT = 0, paused = false, hi = 0;
  // title menu: choose the starting course of the 3:00 run
  const sel = { course: 0 }; // the run always starts on CLASSIC (kept as a field for tests and the ?course= debug parameter)
  // top-5 per starting course; defaults merge at read time and are never written
  const DEF = [['ACE', 50000], ['RUN', 35000], ['ZIP', 22000], ['CAR', 12000], ['DOT', 6000]];
  const rankKey = () => 'head-rush-rank-s' + sel.course;
  const modeName = () => '3:00 SCORE ATTACK';
  function savedRank() { try { const a = JSON.parse(localStorage.getItem(rankKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function readRank() {
    const d = DEF.map(([n, v]) => ({ n, s: v, def: true }));
    return savedRank().concat(d).sort((a, b) => b.s - a.s).slice(0, 5);
  }
  function loadHi() { hi = readRank()[0].s; }
  // a new score ties in its own favour
  const rankOf = sc => { const t = readRank(); let i = 0; while (i < t.length && t[i].s > sc) i++; return i; };
  function saveRank(name, sc) {
    const a = savedRank(); a.push({ n: name, s: sc, t: Date.now() }); a.sort((x, y) => y.s - x.s || y.t - x.t);
    try { localStorage.setItem(rankKey(), JSON.stringify(a.slice(0, 5))); } catch (e) { }
  }
  const BOARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.-'.split('').concat(['DEL', 'END']);
  const entry = { name: '', cur: 0, t: 0, rank: 0, newRank: -1 };
  loadHi();
  const fx = [], pops = [], rings = [];
  let wreck = null, nameT = [0, 0], baseFlash = 0, shake = 0, flashHalf = [0, 0], lastTier = 0, lastInp = {};
  // feel: knocked-off cars, crash debris, skid marks, lane sweep on speed-up, flag drop, blinker phase, dot run, power wave
  const knocked = [], skids = [], sweeps = [];
  let shakeDir = null, crashHide = -1, clearFlash = [0, 0], flagDrop = [-99, -99], blink0 = -99, lastQ = 0, wasArmed = false, lastBoost = false,
    dotRun = 0, lastDotT = -99, powerT0 = -99, frPrev = false, pipFlash = 0, timePulse = 0;

  function newGame() { loadHi(); st = HR.create((Date.now() & 0xffff) + 1, { course: params.has('course') ? +params.get('course') : sel.course }); fx.length = 0; pops.length = 0; knocked.length = 0; skids.length = 0; sweeps.length = 0; wreck = null; mode = 'play'; lastTier = 0; }
  function newDemo() { demo = HR.create(((Math.random() * 1e6) | 0) + 1); demoPolicy = HRBots.human(((Math.random() * 1e6) | 0) + 1); }
  newDemo();

  // ---------- input ----------
  const held = {}, edge = {};
  const DIRK = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const BOOSTK = { Space: 1, ShiftLeft: 1, ShiftRight: 1, KeyZ: 1, KeyX: 1 };
  addEventListener('keydown', e => {
    if (DIRK[e.code] || BOOSTK[e.code] || e.code === 'Enter') e.preventDefault();
    HRAudio.init();
    if (e.repeat) return;
    const k = DIRK[e.code]; if (k) { held[k] = true; edge[k] = true; }
    if (BOOSTK[e.code]) held.b = (held.b || 0) + 1, edge.start = true;
    if (e.code === 'Enter') edge.start = true;
    if (e.code === 'KeyP' && mode === 'play') paused = !paused;
    if (e.code === 'KeyM') HRAudio.toggleMute();
    if (paused && e.code !== 'KeyP' && e.code !== 'KeyM') paused = false;
  });
  addEventListener('keyup', e => { const k = DIRK[e.code]; if (k) held[k] = false; if (BOOSTK[e.code]) held.b = Math.max(0, (held.b || 1) - 1); });
  addEventListener('blur', () => { for (const k in held) held[k] = false; held.b = 0; if (mode === 'play') paused = true; });
  document.addEventListener('visibilitychange', () => { HRAudio.setHidden(document.hidden); if (document.hidden && mode === 'play') paused = true; });
  // touch: tap inside your lane ring = in, outside = out; a second finger held = boost
  const touches = new Map();
  function toLogical(t) { const r = cv.getBoundingClientRect(); return [(t.clientX - r.left) / r.width * W, (t.clientY - r.top) / r.height * H]; }
  cv.addEventListener('touchstart', e => {
    e.preventDefault(); HRAudio.init(); edge.start = true;
    for (const t of e.changedTouches) {
      touches.set(t.identifier, 1);
      if (st && mode === 'play') { const [x, y] = toLogical(t); const Gm = HR.use(st), r = st.player.r; edge[Math.abs(x - CX) < Gm.hw[r] && Math.abs(y - CY) < Gm.hh[r] ? 'tin' : 'tout'] = true; }
    }
    held.tb = touches.size >= 2;
  }, { passive: false });
  const tend = e => { for (const t of e.changedTouches) touches.delete(t.identifier); held.tb = touches.size >= 2; };
  cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);

  // arrow keys mean "toward / away from the centre" at the gap the car reaches next
  const MAP = [{ d: 1, u: -1 }, { r: 1, l: -1 }, { u: 1, d: -1 }, { l: 1, r: -1 }];
  function readInput() {
    HR.use(st); const p = st.player, k = HR.nextGapK(p.r, p.s, 1), m = MAP[HR.gapSide(k)] || {};
    const inp = { boost: !!held.b || !!held.tb || !!pad.b };
    for (const d of 'udlr') {
      const v = m[d]; if (!v) continue;
      if (edge[d]) inp[v > 0 ? 'in' : 'out'] = true;
      if (held[d] || pad[d]) inp[v > 0 ? 'inHeld' : 'outHeld'] = true;
    }
    if (edge.tin) inp.in = true; if (edge.tout) inp.out = true;
    return inp;
  }
  function clearEdges() { for (const k in edge) edge[k] = false; }
  // gamepad: d-pad or left stick = arrows, A / B / R1 = accelerate (and start), Start = start / pause
  const pad = {}, padPrev = {};
  function pollPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(q => q && q.connected) : null;
    const b = i => !!(gp && gp.buttons[i] && gp.buttons[i].pressed), ax = i => (gp && gp.axes[i]) || 0;
    const now = { u: b(12) || ax(1) < -0.5, d: b(13) || ax(1) > 0.5, l: b(14) || ax(0) < -0.5, r: b(15) || ax(0) > 0.5, b: b(0) || b(1) || b(5), st: b(9) };
    for (const k in now) { if (now[k] && !padPrev[k]) { if ('udlr'.includes(k)) edge[k] = true; else { edge.start = true; HRAudio.init(); if (k === 'st' && mode === 'play') paused = !paused; else if (paused) paused = false; } } padPrev[k] = now[k]; pad[k] = now[k]; }
  }

  // ---------- events → audio / fx ----------
  const SILENT = { park: 1, morph: 1 }; // parking is visual only; a morph rides on the refill fanfare // parking is visual only
  // the player's travel direction and the outward normal of the side it is on
  function outward(x, y) { const ox = x - CX, oy = y - CY; return Math.abs(ox) * H > Math.abs(oy) * W ? [Math.sign(ox), 0] : [0, Math.sign(oy) || 1]; }
  function handleEvents(s, audible) {
    const p = s.player;
    for (const e of s.events) {
      // a dot run climbs the scale; it breaks when a lane change or a stretch with no dot comes between two dots
      if (e.type === 'dot') { const sp = HR.speed(s) * (p.boost ? C.BOOST : 1) / 60; dotRun = s.tick - lastDotT > 30 / sp ? 0 : dotRun + 1; lastDotT = s.tick; }
      if (e.type === 'shift' && e.who === 'p') dotRun = -1, lastDotT = -99;
      const arg = e.type === 'eat' ? (e.truck ? e.base : e.chain) : e.type === 'count' ? e.n : e.type === 'shift' ? e.n : e.type === 'dot' ? s.tier + 10 * Math.max(0, dotRun) : s.tier;
      if (audible && !SILENT[e.type] && !(e.type === 'go' && e.first)) HRAudio.play(e.type === 'shift' ? (e.who === 'p' ? 'shift' : 'rshift') : e.type === 'eat' && e.truck ? 'truck' : e.type, arg);
      if (e.type === 'eat') {
        // a truck raises the base multiplier: show the new multiplier big, in the truck's colour
        if (e.truck) { pops.push({ x: e.x, y: e.y, t: 0, s: 'BASE x' + (e.base + 1), big: false, c: COL.cruiser }); rings.push({ x: e.x, y: e.y, t: 0, T: 22, max: 20, c: COL.cruiser }); baseFlash = 40; }
        else {
          pops.push({ x: e.x, y: e.y, t: 0, s: String(e.pts), big: e.chain >= 5 });
          // the exact multiplier on a line above the points; purple when a truck-built base is in it
          pops.push({ x: e.x, y: e.y - (e.chain >= 5 ? 18 : 11), t: 0, s: 'x' + e.mult, big: false, c: e.boosted ? COL.cruiser : COL.fright });
        }
        if (e.sw) pops.push({ x: e.x, y: e.y + 12, t: 0, s: 'SWITCH', big: false, c: COL.me });
        // the bitten car is knocked off the track: it holds on the impact frame through the hit-stop, then flies on along
        // the player's travel and outward, spinning; a longer chain hits harder
        const tg = HR.tan(p.r, p.s), [ox, oy] = outward(e.x, e.y), k = Math.min(e.chain, 8), v = 1.6 + 0.3 * k;
        knocked.push({ x: e.x, y: e.y, vx: tg[0] * v + ox * v * 0.7, vy: tg[1] * v + oy * v * 0.7, rot: 0, spin: Math.max(2, 6 - (k >> 1)), dir: [-tg[0], -tg[1]], t: 0, T: 34,
          col: COL.flash, stripe: e.truck ? COL.cruiser : COL.fright, spr: e.truck || e.truckFull ? TRUCK : null }); // white: already out of play
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; fx.push({ x: e.x, y: e.y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, t: 18, c: COL.fright }); }
        if (e.chain >= 4) shake = Math.max(shake, 4), shakeDir = null;
        rings.push({ x: e.x, y: e.y, t: 0, T: 14 + e.chain * 3, max: 8 + e.chain * 5, c: e.chain >= 5 ? COL.flash : COL.fright });
      } else if (e.type === 'crash') { rpath = null; path = null; cpaths = [];
        // both cars are thrown back the way they came after a short freeze; the shake runs along the line of impact
        const tg = HR.tan(p.r, p.s), [px, py] = HR.carXY(p);
        let hit = null, bd = 1e9; for (const c of HR.rivals(s)) { const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; hit = c; } }
        crashHide = hit ? hit.id : -1;
        wreck = { x: px, y: py, vx: -tg[0] * 1.5, vy: -tg[1] * 1.5, dir: tg, rot: 0, t: 0 };
        if (hit) knocked.push({ x: hit.x, y: hit.y, vx: tg[0] * 1.5, vy: tg[1] * 1.5, rot: 0, spin: 5, dir: [hit.dx, hit.dy], t: 0, T: C.CRASH, col: hit.cruiser ? COL.cruiser : COL.rival, spr: hit.cruiser ? TRUCK : null, freeze: 4, wreck: true });
        shake = 14; shakeDir = tg;
        rings.push({ x: e.x, y: e.y, t: 0, T: 24, max: 30, c: COL.rival });
        for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, v = 0.4 + Math.random() * 2.2; fx.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 30 + Math.random() * 20, c: i & 1 ? COL.me : COL.rival }); }
      } else if (e.type === 'shift' && e.who === 'p') {
        // tyre marks where the car left its lane: the gap you used stays marked for a moment
        const [x, y] = HR.carXY(p), tg = HR.tan(p.r, p.s);
        for (const q of [-3, 3]) skids.push({ x: Math.round(x - tg[0] * 4 - tg[1] * q), y: Math.round(y - tg[1] * 4 + tg[0] * q), t: 30 });
      } else if (e.type === 'halfclear') {
        // the cleared half's barriers flash white once, a spark runs from the car to the new flag, and the flag drops in
        clearFlash[e.half] = 12; flagDrop[e.half] = s.tick;
        const it = s.items.find(q => q.half === e.half);
        if (it) { const [fx0, fy0] = HR.pos(it.r, it.s), [px, py] = HR.carXY(p); for (let i = 0; i < 4; i++) fx.push({ x: px, y: py, vx: (fx0 - px) / 16, vy: (fy0 - py) / 16, t: 16 - i * 2, c: COL.flag, glide: true }); }
      } else if (e.type === 'refill') {
        flashHalf[e.half] = 60; nameT[e.half] = 180; rings.push({ x: e.x, y: e.y, t: 0, T: 20, max: 24, c: COL.me }); pops.push({ x: e.x, y: e.y, t: 0, s: String(e.pts), big: true });
        // speed up: a light runs across the lanes from the outside in, and the new pip flashes
        sweeps.push({ t: 0, c: pipCol(e.tier - 1) }); pipFlash = 48;
      } else if (e.type === 'power') {
        for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; fx.push({ x: e.x, y: e.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, t: 12, c: COL.power }); }
        if (!frPrev) powerT0 = s.tick; // a fresh power turns the convoy blue from its head to its tail, so its length reads at a glance
      } else if (e.type === 'baselost') {
        const [px, py] = HR.carXY(s.player); pops.push({ x: px, y: py - 12, t: 0, s: 'BASE x1', big: false, c: COL.dim }); baseFlash = 40;
      } else if (e.type === 'extend') {
        const [px, py] = HR.carXY(s.player); pops.push({ x: px, y: py - 10, t: 0, s: '1UP', big: true, c: COL.me }); rings.push({ x: 18, y: 268, t: 0, T: 30, max: 14, c: COL.me });
      } else if (e.type === 'feast') {
        pops.push({ x: e.half ? CX + 60 : CX - 60, y: CY - 30, t: 0, s: 'FEAST', big: true, c: COL.power });
      } else if (e.type === 'count') {
        if (e.n <= 5) timePulse = 12;
      }
    }
    frPrev = s.fright > 0;
  }
  const pipCol = i => i >= C.TIER_MAX - 2 ? COL.rival : i >= C.TIER_MAX - 4 ? COL.power : COL.me;
  // frame-locked feel animation (runs with the game tick, frozen by hit-stop)
  // wasStopped: the hit-stop held this tick even if it ran out during it (the core spends the last frozen tick bringing stop to 0)
  function stepFeel(s, wasStopped) {
    const frozen = s && (s.stop > 0 || wasStopped);
    for (let i = knocked.length - 1; i >= 0; i--) {
      const q = knocked[i]; if (frozen || (q.freeze && q.freeze-- > 0)) continue;
      if (++q.t > q.T) { knocked.splice(i, 1); continue; }
      q.x += q.vx; q.y += q.vy; const dr = q.wreck ? 0.88 : 0.97; q.vx *= dr; q.vy *= dr;
      if (q.t % q.spin === 0 && (!q.wreck || q.t < 20)) q.rot++;
    }
    if (wreck && s && s.phase === 'crash') { wreck.t++; if (wreck.t > 4) { wreck.x += wreck.vx; wreck.y += wreck.vy; wreck.vx *= 0.88; wreck.vy *= 0.88; if (wreck.t < 24 && wreck.t % 5 === 0) wreck.rot++; } }
    if (s && s.phase !== 'crash') crashHide = -1;
    for (let i = skids.length - 1; i >= 0; i--) if (--skids[i].t <= 0) skids.splice(i, 1);
    for (let i = sweeps.length - 1; i >= 0; i--) if (++sweeps[i].t > NR * 3 + 8) sweeps.splice(i, 1);
    for (let h = 0; h < 2; h++) if (clearFlash[h] > 0) clearFlash[h]--;
    if (pipFlash > 0) pipFlash--; if (timePulse > 0) timePulse--;
    if (shake > 0 && !frozen) shake--; else if (!shake) shakeDir = null;
  }
  // a quarter-turn rotation of a facing vector
  const turn = (d, n) => { let [x, y] = d; for (let i = 0; i < (n & 3); i++) [x, y] = [-y, x]; return [x, y]; };

  // path indicator: near or in a gap, show where the current input takes the car, up to the next gap
  let path = null;
  function updatePath(inp) {
    path = null; if (st.phase !== 'play') return;
    const p = st.player, o = HR.gapOf(p.r, p.s).o, near = Math.abs(o) < C.GAPW || (HR.distToGap(p.r, p.s, 1) - C.GAPW < 48 && o < 0);
    if (near) path = HR.predictPath(st, { inHeld: inp.inHeld, outHeld: inp.outHeld, boost: inp.boost });
    // the rival's committed route, from its blinker to the gap after (while it is near a gap and not fleeing)
    rpath = null; const L = st.leader;
    if (L && st.fright === 0) { const lo = HR.gapOf(L.r, L.s).o; if (Math.abs(lo) < C.GAPW || HR.distToGap(L.r, L.s, -1) - C.GAPW < C.LOCK) rpath = HR.predictRival(st); }
    // cruisers never turn: show 1.5 s of their lane ahead, at decision time or when one shares the player's lane
    cpaths = [];
    if (st.fright === 0) {
      const reach = HR.rivalSpeed(st) * C.CRUISE_SPD * 1.5;
      for (const c of st.cruisers) if (near || c.r === p.r) {
        const pts = []; for (let d = 10; d <= reach; d += 3) pts.push(HR.pos(c.r, c.s - d));
        cpaths.push({ id: c.id, r: c.r, pts });
      }
    }
  }
  let rpath = null, cpaths = [];
  function drawCruiserPaths(t) {
    const ph = (t >> 1) % 3; g.fillStyle = COL.cruiser;
    for (const cp of cpaths) for (let i = ph; i < cp.pts.length; i += 3) g.fillRect(Math.round(cp.pts[i][0]) - 1, Math.round(cp.pts[i][1]) - 1, 2, 2);
  }
  function drawRivalPath(t) {
    if (!rpath) return; const pts = rpath.pts, ph = (t >> 1) % 3; g.fillStyle = COL.rival;
    for (let i = 4 + ph; i < pts.length - 2; i += 3) g.fillRect(Math.round(pts[i][0]) - 1, Math.round(pts[i][1]) - 1, 2, 2);
  }
  function drawPath(s, t) {
    if (!path || s.phase !== 'play') return;
    // marching 2x2 dashes in the player's colour, moving the way the car will go
    const pts = path.pts, ph = (t >> 1) & 3; g.fillStyle = COL.me;
    for (let i = 4 + (ph % 3); i < pts.length - 2; i += 3) g.fillRect(Math.round(pts[i][0]) - 1, Math.round(pts[i][1]) - 1, 2, 2);
    // end mark: a bar across the lane where the next decision comes
    const e = pts[pts.length - 1], f = pts[Math.max(0, pts.length - 3)], dx = Math.sign(Math.round(e[0] - f[0])), dy = Math.sign(Math.round(e[1] - f[1]));
    for (let k = -3; k <= 3; k++) g.fillRect(Math.round(e[0] + (dx ? 0 : k)) - (dx ? 1 : 0), Math.round(e[1] + (dy ? 0 : k)) - (dy ? 1 : 0), dx ? 2 : 1, dy ? 2 : 1);
  }

  // ---------- draw ----------
  // lane walls come from the course's gap data; one-way gaps carry a chevron pointing the allowed way
  function drawWalls(Gm) {
    for (let w = 0; w <= NR; w++) {
      const hw = Math.round(w === 0 ? Gm.hw[0] + 10 : w === NR ? Gm.hw[NR - 1] - 10 : (Gm.hw[w - 1] + Gm.hw[w]) / 2);
      const hh = Math.round(w === 0 ? Gm.hh[0] + 10 : w === NR ? Gm.hh[NR - 1] - 10 : (Gm.hh[w - 1] + Gm.hh[w]) / 2);
      const holes = [[], [], [], []];
      if (w > 0 && w < NR) for (const q of Gm.gaps) if (q.lo <= w - 1 && w - 1 < q.hi && Math.abs(q.off) < (q.side & 1 ? hh : hw) - 8) holes[q.side].push(q);
      // a freshly changed half flashes its walls so the new layout is noticed
      const feastH = [HR.HALVES[Gm.pl].feast, HR.HALVES[Gm.pr].feast];
      const wc = h => clearFlash[h] > 0 && ((clearFlash[h] >> 1) & 1) ? '#a8b8e8' : flashHalf[h] > 0 && ((flashHalf[h] >> 2) & 1) ? COL.me : feastH[h] ? COL.power : COL.wall; // a feast half has gold barriers
      const run = (a, b, hs, f) => { let p = a; for (const q of hs.slice().sort((m, n) => m.off - n.off)) { const c = Math.round(q.off); if (c - 12 > p) f(p, c - 12); p = Math.max(p, c + 12); } if (b > p) f(p, b); };
      // double-line barrier: an outer and an inner line 2 px apart, joined by a cap where an opening starts
      const hseg = (y, out) => (a, b) => {
        const ca = a <= -hw, cb = b >= hw + 1;
        for (const [u, v, h] of [[a, Math.min(b, 0), 0], [Math.max(a, 0), b, 1]]) if (v > u) {
          g.fillStyle = wc(h);
          g.fillRect(CX + u - (ca && u === a ? 1 : 0), y - out, v - u + (ca && u === a ? 1 : 0) + (cb && v === b ? 1 : 0), 1);
          g.fillRect(CX + u + (ca && u === a ? 1 : 0), y + out, v - u - (ca && u === a ? 1 : 0) - (cb && v === b ? 1 : 0), 1);
          if (!ca && u === a) g.fillRect(CX + u, y - 1, 1, 3);
          if (!cb && v === b) g.fillRect(CX + v - 1, y - 1, 1, 3);
        }
      };
      const vseg = (x, out, h) => (a, b) => {
        const ca = a <= -hh, cb = b >= hh + 1; g.fillStyle = wc(h);
        g.fillRect(x - out, CY + a - (ca ? 1 : 0), 1, b - a + (ca ? 1 : 0) + (cb ? 1 : 0));
        g.fillRect(x + out, CY + a + (ca ? 1 : 0), 1, b - a - (ca ? 1 : 0) - (cb ? 1 : 0));
        if (!ca) g.fillRect(x - 1, CY + a, 3, 1);
        if (!cb) g.fillRect(x - 1, CY + b - 1, 3, 1);
      };
      run(-hw, hw + 1, holes[0], hseg(CY - hh, 1));
      run(-hw, hw + 1, holes[2], hseg(CY + hh, -1));
      run(-hh, hh + 1, holes[1], vseg(CX - hw, 1, 0));
      run(-hh, hh + 1, holes[3], vseg(CX + hw, -1, 1));
      g.fillStyle = COL.oneway;
      for (let side = 0; side < 4; side++) for (const q of holes[side]) {
        if (!q.dir) continue;
        const ix = side === 0 || side === 2 ? CX + Math.round(q.off) : side === 1 ? CX - hw : CX + hw;
        const iy = side === 1 || side === 3 ? CY + Math.round(q.off) : side === 0 ? CY - hh : CY + hh;
        const nx = side === 1 ? 1 : side === 3 ? -1 : 0, ny = side === 0 ? 1 : side === 2 ? -1 : 0; // inward normal
        const k = q.dir; // +1 inward, -1 outward
        for (let i = -3; i <= 3; i++) { const back = Math.abs(i); for (let d = 0; d < 2; d++) g.fillRect(ix + ny * i + nx * k * (2 - back + d), iy + nx * i + ny * k * (2 - back + d), 1, 1); }
      }
    }
  }
  function drawField(s, t) {
    const Gm = HR.use(s);
    drawWalls(Gm);
    g.fillStyle = '#585858'; for (const k of skids) if (k.t > 10 || (k.t & 1)) g.fillRect(k.x, k.y, 2, 1 + (k.t > 20 ? 1 : 0));
    // speed-up sweep: each lane's centre line lights in turn, outermost first
    for (const w of sweeps) for (let r = 0; r < NR; r++) {
      const d = w.t - r * 3; if (d < 0 || d > 6) continue;
      const hw = Gm.hw[r], hh = Gm.hh[r]; g.fillStyle = d > 3 ? shade(w.c, 0.5) : w.c;
      for (let x = -hw; x <= hw; x += 3) { g.fillRect(CX + x, CY - hh, 2, 1); g.fillRect(CX + x, CY + hh, 2, 1); }
      for (let y = -hh; y <= hh; y += 3) { g.fillRect(CX - hw, CY + y, 1, 2); g.fillRect(CX + hw, CY + y, 1, 2); }
    }
    // dots
    const blink = (t >> 3) & 1;
    for (let i = 0; i < Gm.dots.length; i++) {
      if (!s.dots[i]) continue; const d = Gm.dots[i], x = Math.round(d.x), y = Math.round(d.y);
      if (d.power) { g.fillStyle = blink ? COL.power : '#a06000'; g.fillRect(x - 3, y - 2, 6, 4); g.fillRect(x - 2, y - 3, 4, 6); }
      else { g.fillStyle = flashHalf[d.half] > 0 && ((flashHalf[d.half] >> 2) & 1) ? COL.me : COL.dot; g.fillRect(x - 1, y - 1, 3, 3); }
    }
    // flags
    for (const it of s.items) {
      const df = s.tick - flagDrop[it.half], drop = df >= 0 && df < 14 ? Math.round(30 * ((14 - df) / 14) ** 2) : 0; // a new flag falls into place
      const [x0, y0] = HR.pos(it.r, it.s), x = Math.round(x0) - 4, y = Math.round(y0) - 6 - drop, wave = (t >> 3) & 1;
      g.fillStyle = COL.flag; g.fillRect(x, y, 2, 12);
      for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { g.fillStyle = ((i >> 1) + (j >> 1)) & 1 ? COL.flag : '#303030'; g.fillRect(x + 2 + i, y + j + (wave && i > 3 ? 1 : 0), 1, 1); }
    }
    // parked cars (dim, slow blink)
    for (const dm of s.dormant) {
      const sp = HR.spotPos(dm.spot), [x, y] = HR.pos(sp.r, sp.s), tg = HR.tan(sp.r, sp.s);
      car(x, y, -tg[0], -tg[1], ((t + dm.id * 17) % 90) < 8 ? '#909090' : COL.dorm, '#202020', null, '#404040');
    }
    const fr = s.fright > 0, fcol0 = fr ? (s.fright < 60 && ((s.fright >> 3) & 1) ? COL.flash : COL.fright) : null;
    for (const f of s.flying) { const [x, y] = HR.flyingXY(s, f); car(x, y, 1, 0, fcol0 || COL.rival2, fcol0 ? '#f0f0f0' : null, null, fcol0 ? '#f0f0f0' : null); }
    const rv = HR.rivals(s), wave = s.tick - powerT0;
    let ci = 0; const order = rv.map(c => (c.cruiser ? -1 : ci++));
    for (let i = rv.length - 1; i >= 0; i--) {
      const c = rv[i];
      if (s.phase === 'crash' && c.id === crashHide) continue; // drawn as debris instead
      const fcol = fr && !c.cruiser && wave >= 0 && wave < order[i] * 3 ? null : fcol0; // a fresh power turns the convoy blue head to tail
      const lean = c.lead && s.leader && s.leader.slT > 2 ? [-Math.sign(s.leader.slx), -Math.sign(s.leader.sly)] : null;
      const warm = c.lead && s.leader && s.leader.warm > 0; // a new leader flashes while it waits to set off
      if (warm && ((t >> 2) & 1)) { car(c.x, c.y, c.dx, c.dy, COL.flash, null, null, COL.rival); continue; }
      if (c.cruiser && fr) { // while powered a truck turns blue like every edible car, keeping purple stripes: the special target that lifts the base multiplier
        car(c.x, c.y, c.dx, c.dy, fcol0, '#f0f0f0', TRUCK, COL.cruiser);
        if (s.base < C.TRUCK_MAX) text('+1', Math.round(c.x) - 5, Math.round(c.y) - 15, COL.cruiser);
        continue;
      }
      car(c.x, c.y, c.dx, c.dy, fcol || (c.cruiser ? COL.cruiser : c.lead ? COL.rival : COL.rival2), fcol ? '#f0f0f0' : null, c.cruiser ? TRUCK : null, fcol ? '#f0f0f0' : null, lean);
    }
    // blinker: rival shows which way it will turn at the coming gap
    const L = s.leader;
    if (L && L.intent && s.phase === 'play' && ((t >> 2) & 1)) {
      const [x, y] = HR.carXY(L), tg = HR.tan(L.r, L.s);
      const nx = -tg[1], ny = tg[0]; // perpendicular; pick the one pointing toward centre for "in"
      const toC = (CX - x) * nx + (CY - y) * ny > 0 ? 1 : -1, k = toC * L.intent;
      // an arrow beside the car pointing to the lane it will take
      g.fillStyle = COL.blink; const ax = x + nx * k * 7, ay = y + ny * k * 7;
      for (let i = -2; i <= 2; i++) for (let d = 0; d <= 2 - Math.abs(i); d++) g.fillRect(Math.round(ax - tg[0] * i + nx * k * d) , Math.round(ay - tg[1] * i + ny * k * d), 1, 1);
    }
  }
  function drawPlayer(s, t) {
    const p = s.player; if (!p) return;
    if (s.phase === 'crash') {
      if (wreck) { const d = turn(wreck.dir, wreck.rot); car(wreck.x, wreck.y, d[0], d[1], wreck.t < 5 || (wreck.t & 2) ? COL.me : COL.flash, null, null, '#b89800'); }
      return;
    }
    if (s.phase === 'ready' && ((t >> 3) & 1)) return;
    const [x, y] = HR.carXY(p), tg = HR.tan(p.r, p.s);
    if (p.boost && s.phase === 'play') {
      // full throttle: twin exhaust streaks from the rear corners, longer at higher speed
      const len = 6 + s.tier * 2, nx = -tg[1], ny = tg[0];
      for (const q of [-3, 3]) for (let i = 0; i < len; i++) {
        if (((i + t) & 3) === 3) continue; g.fillStyle = i < 3 ? COL.flash : i < len >> 1 ? COL.power : '#a06000';
        g.fillRect(Math.round(x - tg[0] * (7 + i) + nx * q), Math.round(y - tg[1] * (7 + i) + ny * q), 1, 1);
      }
    }
    const gr = s.grace > 0 && s.fright === 0 && ((t >> 1) & 1); // after a bite: flashing while other cars pass through
    const lean = p.slT > 2 ? [-Math.sign(p.slx), -Math.sign(p.sly)] : null; // nose into the new lane while sliding across
    car(x, y, tg[0], tg[1], gr ? COL.flash : COL.me, null, null, gr ? COL.me : '#b89800', lean);
    // turn signal: queued or held turn; red and fast while full throttle blocks it
    const q = p.req ? p.req : lastInp.inHeld ? 1 : lastInp.outHeld ? -1 : 0;
    // the blink starts lit the moment a turn is asked for (its phase restarts on each press)
    if (q !== lastQ) { lastQ = q; if (q) blink0 = t; }
    const bt = t - blink0;
    if (q && s.phase === 'play') {
      if (bt < 8 || !((bt >> 2) & 1)) {
        const nx = -tg[1], ny = tg[0], toC = (CX - x) * nx + (CY - y) * ny > 0 ? 1 : -1, k = toC * q;
        g.fillStyle = COL.blink;
        g.fillRect(Math.round(x + nx * k * 5 + tg[0] * 3) - 1, Math.round(y + ny * k * 5 + tg[1] * 3) - 1, 2, 2);
        // double signal: held long enough to keep crossing lanes in the gap
        if (p.holdDir === q && p.holdT >= C.HOLD_MIN && !p.boost) g.fillRect(Math.round(x + nx * k * 5 - tg[0] * 1) - 1, Math.round(y + ny * k * 5 - tg[1] * 1) - 1, 2, 2);
      }
    }
  }
  function drawHUD(s, t) {
    const sc = String(s ? s.score : 0), hs = String(Math.max(hi, s ? s.score : 0));
    text('SCORE', 4, 2, COL.dim); text(sc, 4, 11, COL.text);
    text('HIGH', W - 4 - tw('HIGH'), 2, COL.dim); text(hs, W - 4 - tw(hs), 11, COL.text);
    if (!s) return;
    // time, large, top centre
    const sec = Math.ceil(s.timeLeft / 60), mm = (sec / 60) | 0, ss = sec % 60;
    const tstr = mm + ':' + String(ss).padStart(2, '0');
    const warn = sec <= 10 && ((t >> 3) & 1);
    // speed tier pips, just under the time; the newest one flashes after a speed-up
    for (let i = 0; i < C.TIER_MAX; i++) { g.fillStyle = i < s.tier ? (i === s.tier - 1 && pipFlash > 0 && (pipFlash & 4) ? COL.flash : pipCol(i)) : '#202840'; g.fillRect(CX - C.TIER_MAX * 4 + i * 8, 20, 7, 3); }
    // the last five seconds: each second lands big, then settles back
    const tsc = timePulse > 6 ? 3 : 2, tx = CX - (tw(tstr, tsc) >> 1);
    if (tsc === 3) { g.fillStyle = COL.bg; g.fillRect(tx - 2, 2, tw(tstr, 3) + 4, 25); }
    text(tstr, tx, tsc === 3 ? 3 : 4, warn || timePulse > 0 ? COL.rival : COL.text, tsc);
    // reserve cars, bottom left (up to 4 icons; from 5, one icon and a count)
    const res = Math.max(0, s.lives - (s.phase === 'crash' || s.phase === 'over' ? 0 : 1));
    if (res <= 4) for (let i = 0; i < res; i++) miniCar(8 + i * 10, 268);
    else { miniCar(8, 268); text('x' + res, 16, 265, COL.me); } // five or more: one icon and a count
    // chain count in the centre box while powered
    // centre box: the multiplier the next red car will score (raised by trucks); a carried truck bonus shows dimly between powers
    // centre box: while powered, the multiplier the next red car scores; otherwise the base multiplier the trucks built (purple)
    if (s.fright > 0) { const cs = 'x' + HR.mult(s, s.chain + 1), sc2 = cs.length <= 3 ? 2 : 1; text(cs, CX - (tw(cs, sc2) >> 1), CY - (sc2 === 2 ? 7 : 3), s.base > 0 ? COL.cruiser : COL.fright, sc2); }
    else if (s.base > 0) { const cs = 'x' + (s.base + 1), c2 = baseFlash > 0 && ((baseFlash >> 2) & 1) ? COL.flash : COL.cruiser; text('BASE', CX - (tw('BASE') >> 1), CY - 13, c2); text(cs, CX - (tw(cs, 2) >> 1), CY - 3, c2, 2); }
    if (baseFlash > 0) baseFlash--;
  }
  function drawKnocked() {
    for (const q of knocked) {
      if (q.t > q.T - 10 && (q.t & 1)) continue;
      const d = turn(q.dir, q.rot); car(q.x, q.y, d[0], d[1], q.col, q.wreck ? null : '#202020', q.spr, q.stripe || shade(q.col, 0.55));
    }
  }
  function drawFx() {
    for (let i = rings.length - 1; i >= 0; i--) {
      const q = rings[i]; if (++q.t > q.T) { rings.splice(i, 1); continue; }
      const h = Math.round(q.max * Math.sqrt(q.t / q.T)); if ((q.t > q.T * 0.6) && (q.t & 1)) continue;
      g.fillStyle = q.c; const x = Math.round(q.x), y = Math.round(q.y);
      g.fillRect(x - h, y - h, 2 * h + 1, 1); g.fillRect(x - h, y + h, 2 * h + 1, 1); g.fillRect(x - h, y - h, 1, 2 * h + 1); g.fillRect(x + h, y - h, 1, 2 * h + 1);
    }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.x += f.vx; f.y += f.vy; if (!f.glide) { f.vx *= 0.94; f.vy *= 0.94; } if (--f.t <= 0) { fx.splice(i, 1); continue; } g.fillStyle = f.c; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t++; if (p.t > 50) { pops.splice(i, 1); continue; }
      const sc = p.big ? 2 : 1, s = p.s;
      text(s, Math.max(2, Math.min(W - 2 - tw(s, sc), Math.round(p.x - tw(s, sc) / 2))), Math.round(p.y - 8 - Math.min(p.t, 12) * 0.5), p.c || (p.t & 2 ? COL.pts : COL.text), sc);
    }
    for (let h = 0; h < 2; h++) if (flashHalf[h] > 0) flashHalf[h]--;
  }

  function render(s, t, overlay) {
    tyre = t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    // a crash shakes along the line of impact and dies away; a long chain gives a short random jolt
    let sx = 0, sy = 0;
    if (shake && shakeDir) { const a = Math.min(3, Math.ceil(shake / 4)) * (shake & 2 ? 1 : -1); sx = shakeDir[0] * a; sy = shakeDir[1] * a; }
    else if (shake) { sx = Math.round((Math.random() - 0.5) * Math.min(shake, 4)); sy = Math.round((Math.random() - 0.5) * Math.min(shake, 4)); }
    g.setTransform(1, 0, 0, 1, sx, sy);
    drawField(s, t); if (!overlay || overlay === 'over') { drawCruiserPaths(t); drawRivalPath(t); drawPath(s, t); } drawKnocked(); drawPlayer(s, t); drawFx();
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawHUD(overlay === 'title' ? null : s, t);
    if (s.phase === 'ready' && overlay !== 'title') {
      ctext(s.first ? 'READY' : 'GO AGAIN', CY + 12, COL.me);
    }
    // the current half-patterns, under the half they belong to
    if (overlay === 'demo') { if ((t >> 5) & 1) ctext('PUSH SPACE', 264, COL.text); else ctext('DEMO PLAY', 264, COL.dim); } // pure demo: the bottom line always says it is not your game
    // a half's pattern name shows for 3 s after it changes (FEAST stays named while it lasts)
    else if (overlay !== 'title') for (const h of [0, 1]) { const pat = HR.HALVES[h ? s.pr : s.pl]; if (nameT[h] > 0 || pat.feast) { const n = pat.name; text(n, h ? CX + 6 : CX - 4 - tw(n), 265, flashHalf[h] ? COL.me : pat.feast ? COL.power : COL.dim); } if (nameT[h] > 0) nameT[h]--; }
    if (paused) ctext('PAUSE', CY + 12, COL.me);
    if (overlay === 'title' && attractPhase() === 'best') { g.fillStyle = COL.bg; g.fillRect(40, CY - 60, 160, 110); ctext('BEST 5', CY - 50, COL.me, 2); ctext(modeName(), CY - 30, COL.dim); drawTable(CY - 14, false); return; }
    if (overlay === 'title') {
      { const lx = Math.round((W - tw('HEAD RUSH', 4)) / 2), ly = CY - 90; g.fillStyle = COL.bg; g.fillRect(lx - 4, ly - 4, tw('HEAD RUSH', 4) + 12, 40); text('HEAD RUSH', lx + 4, ly + 4, COL.rival, 4); text('HEAD RUSH', lx, ly, COL.me, 4); }
      // cast table, arcade style: the real sprites, one line each
      g.fillStyle = COL.bg; g.fillRect(30, CY - 48, 180, 112);
      ctext('3:00 SCORE ATTACK', CY - 44, COL.dim);
      const rows = [
        [() => car(56, CY - 22, 1, 0, COL.me, null, null, '#b89800'), 'YOU', COL.me],
        [() => car(56, CY - 6, -1, 0, COL.rival), 'HEAD-ON CRASHES', COL.rival],
        [() => { g.fillStyle = (t >> 3) & 1 ? COL.power : '#a06000'; g.fillRect(44, CY + 8, 6, 4); g.fillRect(45, CY + 7, 4, 6); car(62, CY + 10, -1, 0, COL.fright, '#f0f0f0', null, '#f0f0f0'); }, 'POWER: EAT THEM', COL.fright],
        [() => car(54, CY + 26, -1, 0, COL.cruiser, null, TRUCK), 'TRUCK: BASE +1', COL.cruiser],
        [() => { const x = 50, y = CY + 37; g.fillStyle = COL.flag; g.fillRect(x, y, 2, 12); for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { g.fillStyle = ((i >> 1) + (j >> 1)) & 1 ? COL.flag : '#303030'; g.fillRect(x + 2 + i, y + j, 1, 1); } }, 'FLAG: REFILL + SPEED UP', COL.flag],
      ];
      rows.forEach(([icon, label, col], i) => { icon(); text(label, 78, CY - 25 + i * 16, col); });
      if ((t >> 5) & 1) ctext('PUSH SPACE', CY + 72, COL.text);
      ctext('ARROWS  CHANGE LANE   SPACE  BOOST', CY + 88, COL.dim);
    }
    if (overlay === 'over') {
      ctext(s.overReason === 'lives' ? 'GAME OVER' : 'TIME UP', CY - 60, s.overReason === 'lives' ? COL.rival : COL.me, 2);
      ctext('MAX CHAIN ' + s.stats.maxChain + '   FLAGS ' + s.stats.refills, CY + 20, COL.dim);
      if (s.score > hi && s.score > 0) ctext('NEW HIGH SCORE', CY + 30, (t >> 3) & 1 ? COL.rival : COL.me);

    }
  }

  // ---------- name entry / ranking screens ----------
  function drawTable(y0, preview) {
    const t = readRank(); let rows = t.map(r => ({ n: r.n, s: r.s }));
    if (preview) { rows.splice(entry.rank, 0, { n: (entry.name + '___').slice(0, 3), s: st.score, me: true }); rows = rows.slice(0, 5); }
    rows.forEach((r, i) => {
      const me = r.me || (!preview && i === entry.newRank && mode === 'table');
      const col = me ? ((frame >> 3) & 1 ? COL.me : COL.text) : COL.dim;
      text(String(i + 1), 60, y0 + i * 12, col); text(r.n, 76, y0 + i * 12, col); text(String(r.s).padStart(7, ' '), 140, y0 + i * 12, col);
    });
  }
  function renderRank(t) {
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    drawHUD(null, t);
    if (mode === 'entry') {
      ctext('TOP 5  ' + modeName(), 30, COL.me);
      ctext(String(st.score), 44, COL.text, 2);
      ctext((entry.name + '___').slice(0, 3), 66, COL.me, 3);
      BOARD.forEach((c, i) => {
        const x = 12 + (i % 10) * 22, y = 100 + ((i / 10) | 0) * 14, on = i === entry.cur;
        if (on) { g.fillStyle = COL.wall; g.fillRect(x - 3, y - 3, tw(c) + 6, 11); }
        text(c, x, y, on ? COL.me : c === 'END' ? COL.pts : COL.text);
      });
      drawTable(160, true);
      ctext('ARROWS SELECT  SPACE ENTER', 236, COL.dim);
      ctext(String(Math.max(0, 20 - ((entry.t / 60) | 0))), 250, COL.dim);
    } else {
      ctext('BEST 5', 60, COL.me, 2);
      ctext(modeName(), 82, COL.dim);
      drawTable(110, false);
    }
  }

  // ---------- main loop ----------
  let acc = 0, last = performance.now(), frame = 0, titleT = 0;
  // attract cycle: title + cast (7 s) -> pure demo play (20 s, restarted from READY) -> best 5 (4 s)
  const ATTRACT = [['title', 420], ['demo', 1200], ['best', 240]], CYCLE = ATTRACT.reduce((a, b) => a + b[1], 0);
  function attractPhase() { let k = titleT % CYCLE; for (const [name, len] of ATTRACT) { if (k < len) return name; k -= len; } return 'title'; }
  function tick() {
    pollPad();
    if (mode === 'title') {
      const dz = demo.stop > 0; HR.step(demo, demoPolicy(demo)); handleEvents(demo, false); stepFeel(demo, dz); titleT++;
      if (titleT % CYCLE === ATTRACT[0][1]) newDemo(); // the demo scene always starts from a fresh READY
      if (demo.phase === 'over' || demo.tick > 60 * 50) newDemo();
      if (edge.start) { newGame(); HRAudio.play('start'); }
    } else if (mode === 'play') {
      if (paused) { HRAudio.engine(false, 0, false, false); HRAudio.music(false); clearEdges(); return; }
      const inp = window.__game.pilot ? window.__game.pilot(st) : readInput(); lastInp = inp; // pilot: a recording tool can drive the car
      if (inp.in || inp.out) blink0 = frame; // every press relights the blinker at once
      const sz = st.stop > 0; HR.step(st, inp); handleEvents(st, true); stepFeel(st, sz);
      { const p = st.player, live = st.phase === 'play';
        // the double blinker lighting (held long enough to keep crossing) and full throttle each get a short cue
        const armed = live && p.holdDir !== 0 && p.holdT >= C.HOLD_MIN && !p.boost; if (armed && !wasArmed) HRAudio.play('arm'); wasArmed = armed;
        if (live && p.boost && !lastBoost) HRAudio.play('boost'); lastBoost = live && p.boost; }
      updatePath(inp);
      if (st.tier !== lastTier) lastTier = st.tier;
      if (st.phase === 'over') { mode = 'over'; overT = 0; }
      HRAudio.engine(st.phase === 'play', HR.speed(st), st.player.boost, st.fright > 0);
      HRAudio.music(st.phase === 'play', st.tier, st.fright > 0);
    } else if (mode === 'over') {
      overT++; HRAudio.engine(false, 0, false, false); HRAudio.music(false);
      if (overT > 150 || (overT > 60 && edge.start)) {
        entry.rank = rankOf(st.score); entry.newRank = -1; overT = 0;
        if (st.score > 0 && entry.rank < 5) { mode = 'entry'; entry.name = ''; entry.cur = 0; entry.t = 0; HRAudio.play('entry'); }
        else mode = 'table';
      }
    } else if (mode === 'entry') {
      entry.t++;
      if (entry.t > 20) { // grace: the key that closed TIME UP cannot type a letter
        if (edge.l) entry.cur = (entry.cur + BOARD.length - 1) % BOARD.length;
        if (edge.r) entry.cur = (entry.cur + 1) % BOARD.length;
        if (edge.u) entry.cur = (entry.cur + BOARD.length - 10) % BOARD.length;
        if (edge.d) entry.cur = (entry.cur + 10) % BOARD.length;
        if (edge.l || edge.r || edge.u || edge.d) HRAudio.play('dot', 0);
        if (edge.start) {
          const c = BOARD[entry.cur];
          if (c === 'DEL') entry.name = entry.name.slice(0, -1);
          else if (c === 'END') entry.t = 1e9;
          else if (entry.name.length < 3) { entry.name += c; if (entry.name.length === 3) entry.cur = BOARD.length - 1; }
          HRAudio.play('wake');
        }
      }
      if (entry.t > 60 * 20) { // END or 20 s timeout; short names pad with dots
        saveRank((entry.name + '...').slice(0, 3), st.score); entry.newRank = entry.rank; loadHi();
        mode = 'table'; overT = 0; HRAudio.play('courseclear');
      }
    } else if (mode === 'table') {
      overT++;
      if (overT > 60 * 7 || (overT > 40 && edge.start)) { mode = 'title'; newDemo(); titleT = 0; }
    }
    clearEdges();
  }
  function loop(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; frame++; }
    const s = mode === 'title' ? demo : st;
    if (mode === 'entry' || mode === 'table') renderRank(frame); else render(s, frame, mode === 'title' ? (attractPhase() === 'demo' ? 'demo' : 'title') : mode === 'over' ? 'over' : null);
    requestAnimationFrame(loop);
  }
  function fit() {
    const sc = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    const s2 = Math.min(innerWidth / W, innerHeight / H) < 1 ? Math.min(innerWidth / W, innerHeight / H) : sc;
    cv.style.width = W * s2 + 'px'; cv.style.height = H * s2 + 'px';
  }
  addEventListener('resize', fit); fit();
  requestAnimationFrame(loop);

  window.__game = {
    get state() { return st; }, get demo() { return demo; }, get mode() { return mode; }, get paused() { return paused; },
    newGame, tick, sel, entry, readRank, get attract() { return mode === 'title' ? attractPhase() : null; }, setTitleT(v) { titleT = v; }, get path() { return path; }, get cpaths() { return cpaths; },
    visual: { palette: COL, hud: { score: [4, 11], high: 'right', time: ['centre', 4, 2], pips: [CX - 30, 266], halves: 265 }, sprite: { car: [CAR[0].length, CAR.length], truck: [TRUCK[0].length, TRUCK.length], font: [5, 7, 6] } }, render: () => render(mode === 'title' ? demo : st, frame, mode === 'title' ? 'title' : mode === 'over' ? 'over' : null),
    setState(s) { st = s; }, audio: HRAudio, pilot: null,
    get feel() { return { knocked, skids, sweeps, wreck, crashHide, clearFlash, flagDrop, blink0, dotRun, powerT0, pipFlash, timePulse, frame, fx, col: COL }; },
  };
})();
