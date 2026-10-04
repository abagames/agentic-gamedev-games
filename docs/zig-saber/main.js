// ZIG SABER — presentation, input and cabinet flow. Rules live in core.js; this file never decides an outcome.
(function () {
  'use strict';
  const { C } = ZS, W = C.W, H = C.H, HUD = C.HUD;
  const cv = document.getElementById('screen'), g = cv.getContext('2d'); cv.width = W; cv.height = H;
  const params = new URLSearchParams(location.search);

  // palette roles: cyan = the player's energy, red/orange = things to shoot, steel = things only the blade opens,
  // pink = bonus, yellow = laser. Rock takes one hue per zone and nothing else uses it at full brightness.
  const COL = {
    bg: '#000', text: '#fcfcfc', hudRed: '#f83800', ship: '#fcfcfc', shipDark: '#a4a4b4', canopy: '#3cbcfc', flame: '#fca044', flame2: '#f83800',
    energy: '#3cbcfc', energyHot: '#fcfcfc', laser: '#fce4a0', laserHot: '#fcfcfc',
    drone: '#fca044', droneLit: '#fce4a0', train: '#f83800', trainLit: '#fca044', shell: '#6888fc', shellDark: '#2038ec', shield: '#fcfcfc', rusher: '#f878f8', rusherLit: '#fcfcfc',
    cap: '#f83800', capLit: '#fce4a0', gem: '#f878f8', gemLit: '#fcfcfc',
    rock: [['#a81000', '#fca044', '#58100c'], ['#007800', '#58f898', '#003800'], ['#2038ec', '#3cbcfc', '#10188c']],
    star: ['#6888fc', '#fcfcfc', '#fca044', '#58f898'],
  };

  // ---------- 5x7 arcade bitmap font, 6 px advance ----------
  const FONT = {
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
    '!': '..#....#....#....#....#.........#..', '.': '................................#..', '+': '.......#....#..#####..#....#.......',
    '=': '..........#####.....#####..........', '_': '..............................#####',
  };
  function text(s, x, y, col, sc) {
    sc = sc || 1; g.fillStyle = col || COL.text; s = String(s).toUpperCase();
    for (let c = 0; c < s.length; c++) { const gl = FONT[s[c]]; if (gl) for (let i = 0; i < 35; i++) if (gl[i] === '#') g.fillRect(x + (c * 6 + i % 5) * sc, y + ((i / 5) | 0) * sc, sc, sc); }
  }
  const tw = (s, sc) => (String(s).length * 6 - 1) * (sc || 1);
  const ctext = (s, y, col, sc) => text(s, Math.round((W - tw(s, sc)) / 2), y, col, sc);
  const pad6 = n => String(n).padStart(7, '0');

  // ---------- sprites: rows of palette keys ----------
  const SPR = {
    ship: ['..ww............', '..wwww..........', 'r.wwwwwwcc......', 'frwwwwwwcccwww..', 'r.wwwddwwwwwwwwe', '..wwwwrr........', '..ww............'],
    drone: ['....aaaa....', '..aaaaaaaa..', '.aabbaaaaaa.', 'aabwwbaaaaaa', 'aabwwbaaaaaa', '.aabbaaaaaa.', '..aaaaaaaa..', '....aaaa....'],
    drone2: ['...aaaaaa...', '..aaaaaaaa..', '.aabbaaaaaa.', 'aabwwbaaaaa.', 'aabwwbaaaaa.', '.aabbaaaaaa.', '..aaaaaaaa..', '...aaaaaa...'],
    shell: ['...wwaaaaa....', '..wwaaaaaaaa..', '.wwaaaaaaaaaa.', 'wwaaabbaaaaaaa', 'wwaabbbbaaaaaa', 'wwaabbbbaaaaaa', 'wwaaabbaaaaaaa', '.wwaaaaaaaaaa.', '..wwaaaaaaaa..', '...wwaaaaa....'],
    rusher: ['......aaaaaa..', '...aaaaaaaaaab', 'aaaaaaaaaaaabb', '...aaaaaaaaaab', '......aaaaaa..'],
    cap: ['.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'aabaaaaaaaaa', 'aabaaaaaaaaa', 'aabaaaaaaaaa', 'aabaaaaaaaaa', 'aabbbbbaaaaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.'],
    gem: ['...a...', '..aba..', '.abbba.', 'abbwbba', '.abbba.', '..aba..', '...a...'],
    life: ['.ww.....', 'rwwwcc..', 'rwwwwwww', '.ww.....'],
  };
  const PX = {}; for (const k in SPR) { const a = []; SPR[k].forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') a.push([x, y, r[x]]); }); PX[k] = { a, w: SPR[k][0].length, h: SPR[k].length }; }
  function spr(name, cx, cy, pal, shear) {
    const s = PX[name], x0 = Math.round(cx - s.w / 2), y0 = Math.round(cy - s.h / 2);
    for (const [x, y, k] of s.a) { const c = pal[k]; if (!c) continue; g.fillStyle = c; g.fillRect(x0 + x, y0 + y + (shear ? Math.round((x - s.w / 2) * shear) : 0), 1, 1); }
  }
  const PAL = {
    drone: { a: COL.drone, b: COL.droneLit, w: '#000' }, train: { a: COL.train, b: COL.trainLit, w: '#000' },
    shell: { a: COL.shell, b: COL.shellDark, w: COL.shield }, rusher: { a: COL.rusher, b: COL.rusherLit },
    cap: { a: COL.cap, b: COL.capLit }, cap2: { a: COL.capLit, b: COL.cap }, capBig: { a: '#fcfcfc', b: COL.cap }, gem: { a: COL.gem, b: COL.gemLit, w: '#fff' }, gem2: { a: COL.gemLit, b: COL.gem, w: '#fff' },
    life: { w: COL.ship, r: COL.hudRed, c: COL.canopy }, white: { a: '#fff', b: '#fff', w: '#fff', r: '#fff', c: '#fff', d: '#fff', e: '#fff', f: '#fff' },
  };

  // ---------- ranking: top five, defaults merged at read time and never written ----------
  // default table: the bottom places are low on purpose, so a first game can get on it (bots score far above people here)
  const DEF = [['ZIG', 500000], ['SAB', 200000], ['ERR', 80000], ['CUT', 30000], ['ONE', 10000]], RANK_KEY = 'zig-saber-rank';
  function savedRank() { try { const a = JSON.parse(localStorage.getItem(RANK_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function readRank() { return savedRank().concat(DEF.map(([n, s]) => ({ n, s, def: true }))).sort((a, b) => b.s - a.s || (b.t || 0) - (a.t || 0)).slice(0, 5); }
  const rankOf = sc => { const t = readRank(); let i = 0; while (i < t.length && t[i].s > sc) i++; return i; };
  function saveRank(n, s) { const a = savedRank(); a.push({ n, s, t: Date.now() }); a.sort((x, y) => y.s - x.s || y.t - x.t); try { localStorage.setItem(RANK_KEY, JSON.stringify(a.slice(0, 5))); } catch (e) { } }

  // ---------- state ----------
  let mode = 'title', st = null, demo = null, demoBot = null, frame = 0, titleT = 0, overT = 0, paused = false, pressQ = 0, edgeStart = false, freeze = 0, hi = readRank()[0].s;
  const entry = { name: '', rank: -1 }; // the pilot's three letters are dealt at the start of each game; there is no name entry
  const fx = { gate: null, chainBreak: 0, parts: [], pops: [], blade: null, beam: null, trail: [], shake: 0, banner: null, flashShip: 0, extendT: 0, hudLaser: 0, rings: [] };
  const ATTRACT = [480, 1500, 1920]; // title page, demo, best five
  const attract = () => titleT < ATTRACT[0] ? 'title' : titleT < ATTRACT[1] ? 'demo' : 'best';
  function resetFx() { fx.parts.length = 0; fx.pops.length = 0; fx.trail.length = 0; fx.rings.length = 0; fx.blade = fx.beam = fx.banner = null; fx.shake = 0; freeze = 0; }
  function newGame() { st = ZS.newGame({ zone: +params.get('zone') || 0, loop: +params.get('loop') || 0 }); resetFx(); mode = 'play'; pressQ = 0; hi = readRank()[0].s; entry.name = dealName(); entry.rank = -1; ZSAudio.play('start'); }
  function newDemo() { demo = ZS.newGame({ zone: (Math.random() * 3) | 0 }); demoBot = ZSBots.human(((Math.random() * 1e6) | 0) + 1); resetFx(); }

  // ---------- input: one button ----------
  const BTN = { Space: 1, KeyZ: 1, KeyX: 1, Enter: 1, ArrowUp: 1, ArrowDown: 1 };
  function button() { ZSAudio.init(); if (paused) { paused = false; return; } edgeStart = true; if (mode === 'play' && st.phase === 'play') pressQ = Math.min(3, pressQ + 1); }
  addEventListener('keydown', e => {
    if (BTN[e.code]) e.preventDefault();
    if (e.repeat) return;

    if (BTN[e.code]) button();
    else if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') paused = !paused; }
    else if (e.code === 'KeyM') ZSAudio.toggleMute();
  });
  addEventListener('pointerdown', e => { e.preventDefault(); button(); }, { passive: false });
  addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  addEventListener('blur', () => { if (mode === 'play') paused = true; });
  document.addEventListener('visibilitychange', () => { ZSAudio.setHidden(document.hidden); if (document.hidden && mode === 'play') paused = true; });

  // ---------- events -> feedback. Strongest feedback goes to the multi-cut; a far kill is deliberately small. ----------
  const KCOL = { plate: [COL.shell, COL.shield, COL.shellDark], plain: [COL.drone, COL.droneLit], plug: [COL.shell, COL.shield, COL.shellDark], drone: [COL.drone, COL.droneLit], train: [COL.train, COL.trainLit], shell: [COL.shell, COL.shield], rusher: [COL.rusher, COL.rusherLit] };
  function burst(x, y, n, cols, sp, life) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = sp * (0.4 + Math.random()); fx.parts.push({ x, y, vx: Math.cos(a) * v - C.SCROLL, vy: Math.sin(a) * v, t: (life || 18) * (0.6 + Math.random() * 0.6), c: cols[i % cols.length], s: i % 3 === 0 ? 2 : 1 }); } if (fx.parts.length > 260) fx.parts.splice(0, fx.parts.length - 260); }
  function pop(x, y, txt, col, big) { fx.pops.push({ x: Math.max(2, Math.min(W - tw(txt) - 2, x - tw(txt) / 2)), y: y - 10, txt: String(txt), col, t: 0, big }); if (fx.pops.length > 14) fx.pops.shift(); }
  function consume(s, sound) {
    const play = (n, a) => { if (sound) ZSAudio.play(n, a); };
    for (const e of s.events) {
      switch (e.type) {
        case 'chaindown': if (e.chain === 0) fx.chainBreak = 30; break;
        case 'turn': play('turn'); burst(C.SHIP_X - 6, s.ship.y, 2, [COL.shipDark], 0.7, 6); break;
        case 'shot': case 'swing': if (e.type === 'swing') play('beam', 0); else play('shot'); fx.blade = { y: e.y, d: e.d, len: e.len || 18, lv: e.lv || 0, n: 0, t: 0 }; break;
        case 'slash': fx.blade = { y: e.y, d: e.d, len: e.len, lv: e.lv, n: e.n, near: e.near, t: 0 }; play('cut', e.n - 1 + e.chain - 1); if (e.lv > 0) play('beam', 1); freeze = Math.min(10, 2 + e.n * 2 + (e.near ? 2 : 0)); if (e.n >= 3 || e.near) fx.shake = 6; break;
        case 'kill': {
          const cut = e.how === 'cut';
          burst(e.x, e.y, e.kind === 'plug' ? 30 : cut ? 16 : 7, KCOL[e.kind], cut ? 2.4 : 1.2, cut ? 22 : 12);
          if (cut) { fx.rings.push({ x: e.x, y: e.y, t: 0 }); pop(Math.min(e.x, C.SHIP_X + 60), s.ship.y - e.k * 9, e.near ? e.pts + ' X2' : e.pts, e.near ? COL.hudRed : e.k > 0 ? COL.laser : COL.text, true); if (e.near) burst(e.x, e.y, 8, [COL.text, COL.hudRed], 3, 14); } else pop(e.x, e.y, e.pts, COL.shipDark);
          if (e.how === 'far' || e.how === 'ram') play('far'); else if ((e.kind === 'shell' || e.kind === 'plug') && e.how === 'cut') play('heavy');
          break;
        }
        case 'ping': play('ping'); burst(e.x, e.y, 5, [COL.shield, COL.shell], 1.6, 8); break;
        case 'decay': fx.hudLaser = 20; break;
        case 'spark': play('spark'); burst(e.x, e.y, 3, [COL.energy, COL.text], 1, 6); break;
        case 'capdrop': play('capdrop'); fx.rings.push({ x: e.x, y: e.y, t: 0, c: COL.capLit }); break;
        case 'cap': play('cap'); pop(e.x, e.y, e.big ? 'MAX' : e.pts === 1000 ? '1000' : 'LASER ' + e.lv, COL.laser, true); if (e.big) { fx.shake = 4; fx.rings.push({ x: C.SHIP_X, y: s.ship.y, t: 0, c: COL.laserHot }); } fx.flashShip = 20; fx.hudLaser = 40; break;
        case 'gem': play('gem', e.chain); pop(e.x, e.y, e.pts, COL.gem); if (e.wound) fx.hudLaser = 16; burst(e.x, e.y, 5, [COL.gem, COL.gemLit], 1.2, 10); break;
        case 'warn': play('warn'); break;
        case 'boss': play('warn'); fx.banner = { a: 'GATE', b: 'CUT THE PLATE - FIRE INTO THE GAP', t: 0 }; break;
        case 'overdrive': play('warn'); fx.shake = 8; break;
        case 'bossaway': play('warn'); fx.shake = 10; fx.banner = { a: 'THE GATE IS LEAVING', b: '', t: 0 }; break;
        case 'opened': fx.rings.push({ x: C.BOSS.FACE, y: e.y, t: 0, c: COL.capLit }); break;
        case 'bosshit': play('heavy'); burst(e.x, s.ship.y, e.how === 'cut' ? 20 : 8, [COL.cap, COL.capLit, COL.text], 2.2, 16); if (e.how === 'cut') { pop(e.x - 20, s.ship.y - 18, e.pts, COL.laser, true); fx.shake = 5; } else if (e.rows > 1) pop(e.x - 24, s.ship.y - 14, 'X' + e.rows, COL.laser); break;
        case 'bossdead': play('death'); for (let i = 0; i < C.BOSS.ROWS; i++) burst(C.BOSS.FACE + 14, ZS.rowY(i), 30, [COL.cap, COL.capLit, COL.shell, COL.text], 3.2, 46); pop(150, 110, e.pts, COL.laser, true); fx.gate = { pts: e.pts, sec: e.sec }; fx.shake = 24; freeze = 10; break;
        case 'guard': play('guard'); fx.flashShip = C.GUARD; fx.rings.push({ x: e.x, y: e.y, t: 0, c: COL.laser }); fx.shake = 3; freeze = 3; fx.hudLaser = 30; break;
        case 'death': play('death'); burst(e.x, e.y, 46, [COL.ship, COL.flame, COL.flame2, COL.canopy], 3, 40); fx.shake = 16; freeze = 6; break;
        case 'zone': { play('zone'); const zn = s.course.zones[e.zone - 1].name, tag = (e.noMiss ? ' NO MISS' : '') + (e.perfect ? ' ALL GEMS' : ''); if (e.zone >= s.course.zones.length) pop(128, 44, zn + ' ' + e.pts + tag, COL.laser, true); else fx.banner = { a: zn + ' CLEAR' + tag, b: String(e.pts), t: 0 }; break; }
        case 'loop': if (e.won) play('loop'); else play('gameover'); break;
        case 'shipbonus': play('capdrop'); fx.extendT = 14; pop(W - 40, 60, '+' + e.pts, COL.laser, true); break;
        case 'extend': play('extend'); fx.extendT = 120; break;
        case 'ready': play('start'); fx.trail.length = 0; fx.parts.length = 0; break;
        case 'over': if (!e.cleared) play('gameover'); break;
      }
    }
    if (s.phase === 'play' && s.t % 2 === 0) { fx.trail.push({ wx: s.camX + C.SHIP_X - 7, y: s.ship.y }); if (fx.trail.length > 22) fx.trail.shift(); }
  }
  function stepFx() {
    for (const p of fx.parts) { p.x += p.vx; p.y += p.vy; p.t--; } fx.parts = fx.parts.filter(p => p.t > 0);
    for (const p of fx.pops) p.t++; fx.pops = fx.pops.filter(p => p.t < (p.big ? 50 : 30));
    for (const r of fx.rings) r.t++; fx.rings = fx.rings.filter(r => r.t < 10);
    if (fx.blade && ++fx.blade.t > 7) fx.blade = null;
    
    if (fx.banner && ++fx.banner.t > 130) fx.banner = null;
    if (fx.chainBreak > 0) fx.chainBreak--; if (fx.shake > 0) fx.shake--; if (fx.flashShip > 0) fx.flashShip--; if (fx.extendT > 0) fx.extendT--; if (fx.hudLaser > 0) fx.hudLaser--;
  }

  // ---------- pilot name: one of a fixed roster of call signs, drawn at the start of each game ----------
  const NAMES = ('ACE ARC AXE BOW COG DOT EDG FIN FOX GUN HEX INK ION JAM JET KIT LUX MAX NEO NOV ORB PIX RAM RAY REX SKY SOL TAU VEX VIC WIZ ZAG ZAP ZED ' +
    'ASH BAY COL DAX ELM FAY GUS HAL IVY JOE KAI LEO MIA NED OTT PAM').split(' ');
  function dealName() { return NAMES[(Math.random() * NAMES.length) | 0]; }

  function tick() {
    frame++;
    if (paused) { edgeStart = false; return; }
    stepFx();
    if (mode === 'title') {
      titleT = (titleT + 1) % ATTRACT[2];
      if (titleT === ATTRACT[0]) newDemo();
      if (attract() === 'demo') { ZS.step(demo, demo.phase === 'play' && demoBot(demo)); consume(demo, false); if (demo.phase === 'over') titleT = ATTRACT[1]; }
      ZSAudio.music(false, 0, 0);
      if (edgeStart) newGame();
    } else if (mode === 'play') {
      if (freeze > 0) freeze--;
      else {
        const pilot = window.__game.pilot, pr = st.phase === 'play' && (pilot ? !!pilot(st) : pressQ > 0);
        if (st.phase !== 'play') pressQ = 0; else if (pr && pressQ > 0) pressQ--;
        ZS.step(st, pr); consume(st, true);
      }
      { const b = st.boss, gate = b && !b.dead && b.x <= C.BOSS.FACE; ZSAudio.music(st.phase === 'play', gate ? 3 : st.zone, st.loop, gate && b.over); } // the gate has its own cue; overdrive speeds it up
      if (st.score > hi) hi = st.score;
      if (st.phase === 'over') { mode = 'over'; overT = 0; }
    } else if (mode === 'over') {
      ZSAudio.music(false, 0, 0);
      if (++overT > 170 || (overT > 60 && edgeStart)) {
        entry.rank = st.score > 0 ? rankOf(st.score) : 5; mode = 'table'; overT = 0;
        if (entry.rank < 5) { saveRank(entry.name, st.score); hi = readRank()[0].s; ZSAudio.play('entry'); } else entry.rank = -1; // a ranking score is written down under the dealt name
      }
    } else if (mode === 'table') {
      if (++overT > 60 * 7 || (overT > 40 && edgeStart)) { mode = 'title'; titleT = 0; entry.rank = -1; resetFx(); }
    }
    edgeStart = false;
  }

  // ---------- drawing ----------
  const STARS = []; { const r = ZS.mulberry(5); for (let i = 0; i < 44; i++) STARS.push({ x: r() * W, y: HUD + r() * (H - HUD), v: [0.12, 0.2, 0.34][i % 3], c: i % 4, ph: (r() * 96) | 0 }); }
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return (h ^ (h >> 16)) >>> 0; };
  function zoneOfCol(co, col) { for (let i = 0; i < co.zones.length; i++) if (col < co.zones[i].c1) return i; return co.zones.length - 1; }
  function drawWorld(s) {
    const co = s.course, cam = Math.floor(s.camX), c0 = Math.floor(cam / 8), ox = -(cam - c0 * 8);
    for (const t of STARS) { if ((frame + t.ph) % 96 < 70) { g.fillStyle = COL.star[t.c]; g.fillRect(((t.x - cam * t.v) % W + W) % W | 0, t.y | 0, 1, 1); } }
    for (let i = 0; i <= 32; i++) {
      const col = c0 + i, x = ox + i * 8, [base, edge, dark] = COL.rock[zoneOfCol(co, col)], fort = zoneOfCol(co, col) === 2;
      for (let r = 0; r < C.ROWS; r++) {
        if (!ZS.solidCol(co, col, r)) continue;
        const y = HUD + r * 8; g.fillStyle = base; g.fillRect(x, y, 8, 8);
        const h = hash(col, r);
        g.fillStyle = dark;
        if (fort) { g.fillRect(x, y + 7, 8, 1); g.fillRect(x + ((r & 1) ? 3 : 7), y, 1, 7); } else { if (h % 3 === 0) g.fillRect(x + (h >> 4) % 6, y + (h >> 8) % 6, 2, 2); if (h % 5 === 0) g.fillRect(x + (h >> 12) % 7, y + (h >> 16) % 7, 1, 1); }
        g.fillStyle = edge;
        if (!ZS.solidCol(co, col, r - 1)) g.fillRect(x, y, 8, 2);
        if (!ZS.solidCol(co, col, r + 1)) g.fillRect(x, y + 6, 8, 2);
        if (!ZS.solidCol(co, col - 1, r)) g.fillRect(x, y, 2, 8);
        if (!ZS.solidCol(co, col + 1, r)) g.fillRect(x + 6, y, 2, 8);
      }
    }
    // gems
    for (let i = s.nextGem; i < co.gems.length; i++) { const gm = co.gems[i], x = gm.wx - cam; if (x > W + 8) break; if (!s.gemTaken[i]) spr('gem', x, gm.y, (frame >> 3) % 4 === 0 ? PAL.gem2 : PAL.gem); }
  }
  function drawShip(s) {
    const sh = s.ship, x = C.SHIP_X, y = Math.round(sh.y);
    if (s.phase === 'dead' || s.phase === 'over') return;
    if (s.phase === 'ready' && (frame >> 2) % 2) return;
    for (let i = 0; i < fx.trail.length; i++) { const t = fx.trail[i], tx = t.wx - Math.floor(s.camX); if (tx < 0) continue; g.fillStyle = s.chain > 0 ? (i > 14 ? COL.energyHot : COL.energy) : i > 14 ? COL.flame : COL.flame2; g.fillRect(tx | 0, t.y | 0, s.chain >= C.CHAIN_MAX ? 2 : 1, 1); }
    const loaded = s.laser > 0, home = !s.shot;
    const pal = fx.flashShip > 0 && (frame >> 1) % 2 ? PAL.white : {
      w: COL.ship, d: COL.shipDark, c: COL.canopy, r: COL.hudRed, f: (frame >> 1) % 2 ? COL.flame : null,
      e: loaded ? ((frame >> 2) % 2 ? COL.laser : COL.laserHot) : home ? COL.energy : COL.shipDark, // nose light: the energy is home
    };
    spr('ship', x, y, pal, 0.2 * sh.dir);
    if (s.phase === 'play' && !s.shot) { const cx = x + C.NOSE + C.CLOSE, cy = y + sh.dir * C.MID; g.fillStyle = COL.hudRed; g.fillRect(cx - 1, Math.round(cy - 18), 3, 1); g.fillRect(cx - 1, Math.round(cy + 18), 3, 1); g.fillRect(cx, Math.round(cy - 17), 1, 2); g.fillRect(cx, Math.round(cy + 16), 1, 2); } // point-blank marks: cut inside these for double
    if (s.phase === 'play' && !s.shot) { const rx = x + C.NOSE + C.REACH[s.laser], by = y + sh.dir * C.MID; if (rx < W - 2) { g.fillStyle = loaded ? COL.laser : COL.energy; for (const q of [-17, -15, 15, 17]) g.fillRect(rx, Math.round(by + q), 1, 1); g.fillRect(rx - 1, Math.round(by - 18), 3, 1); g.fillRect(rx - 1, Math.round(by + 18), 3, 1); } } // reach marks: the blade ends here
    if (loaded) { g.fillStyle = (frame >> 2) % 2 ? COL.laser : COL.laserHot; for (let a = -6; a <= 6; a++) g.fillRect(x + 12 - ((a * a) >> 3), y + a, 1, 1); } // armour: a loaded laser bows in front of the nose
  }
  const MARKCOL = { drone: COL.drone, train: COL.train, shell: COL.shell, rusher: COL.rusher };
  function mark(y, c) { g.fillStyle = c; g.fillRect(W - 7, y - 4, 5, 2); g.fillRect(W - 7, y + 3, 5, 2); g.fillRect(W - 3, y - 1, 2, 3); g.fillRect(W - 10, y, 3, 1); }
  // the swing band of a press made at row y while heading d
  const band = (y, d) => { const a = y - d * C.BACK, b = y + d * C.AHEAD; return [Math.min(a, b), Math.max(a, b)]; };
  // the gate: five plates over five core rows. Plate on = steel, arming = blinking, thrown = dark shutter, cut = glowing core
  function drawBoss(s) {
    const b = s.boss, B = C.BOSS; if (!b || b.dead) return;
    const x = Math.round(b.x), leaving = (b.left < 300 || b.leaving) && (frame >> 2) % 2;
    if (b.leaving) { // pulling away: the wall shudders and throws sparks off its face
      if (frame % 2 === 0) burst(x + 4, HUD + 20 + Math.random() * (H - HUD - 40), 2, [COL.flame, COL.text, COL.shell], 2.2, 12);
      if (frame % 12 === 0 && mode === 'play') ZSAudio.play('spark');
    }
    g.fillStyle = COL.rock[2][2]; g.fillRect(x + 12, HUD, W - x - 12, H - HUD);
    g.fillStyle = leaving ? COL.hudRed : COL.rock[2][0]; g.fillRect(x + 6, HUD + 16, 8, H - HUD - 32);
    for (let i = 0; i < B.ROWS; i++) {
      const p = b.plates[i], y = ZS.rowY(i) - 15;
      if (p.s === 'open') { g.fillStyle = b.flash > 0 ? COL.text : (frame >> 2) % 2 ? COL.cap : COL.capLit; g.fillRect(x + 2, y + 3, 10, 24); g.fillStyle = COL.text; g.fillRect(x + 5, y + 11, 4, 8); if (p.t < 60 && (frame >> 1) % 2) { g.fillStyle = COL.shell; g.fillRect(x - 4, y, 10, 30 - Math.round(p.t / 2)); } }
      else if (p.s === 'fly') { g.fillStyle = COL.shellDark; g.fillRect(x + 2, y, 8, 30); }
      else { g.fillStyle = p.s === 'arm' && (frame >> 1) % 2 ? COL.text : COL.shell; g.fillRect(x - 4, y, 10, 30); g.fillStyle = COL.shield; g.fillRect(x - 4, y, 2, 30); }
    }
    if (b.over && (frame >> 1) % 2) { g.fillStyle = COL.hudRed; g.fillRect(x + 6, HUD + 16, 2, H - HUD - 32); } // overdrive: the wall's edge burns
    // what is left of the core, on the gate itself
    const hp = Math.max(0, b.hp) / b.hp0; g.fillStyle = '#30303c'; g.fillRect(x + 18, HUD + 24, 4, H - HUD - 48); g.fillStyle = b.flash > 0 ? COL.text : COL.cap; g.fillRect(x + 18, HUD + 24 + Math.round((H - HUD - 48) * (1 - hp)), 4, Math.round((H - HUD - 48) * hp));
  }
  function drawThings(s) {
    for (const m of s.marks) if ((frame >> 2) % 2 || m.until - s.t < 12) mark(m.y, MARKCOL[m.type]);
    for (const it of s.items) { spr('cap', it.x, it.y, it.big ? ((frame >> 1) % 2 ? PAL.capBig : PAL.cap2) : (frame >> 2) % 2 ? PAL.cap : PAL.cap2); if (it.big) { g.fillStyle = COL.laserHot; const r = 9 + ((frame >> 2) % 3); for (let a = 0; a < 8; a++) g.fillRect(Math.round(it.x + Math.cos(a * 0.785) * r), Math.round(it.y + Math.sin(a * 0.785) * r), 1, 1); } }
    for (const e of s.enemies) {
      if (e.warn > 0) { if ((frame >> 1) % 2) mark(e.y, COL.rusher); continue; }
      if (e.type === 'plug' || e.type === 'plate') { // a seal or a thrown plate: steel like the shell, because only the blade opens it
        const x = Math.round(e.x - e.w / 2), y = Math.round(e.y - e.h / 2); g.fillStyle = COL.shell; g.fillRect(x, y, e.w, e.h); g.fillStyle = COL.shield; g.fillRect(x, y, 2, e.h); g.fillStyle = COL.shellDark; for (let q = 6; q < e.h; q += 8) g.fillRect(x + 2, y + q, e.w - 2, 1);
        continue;
      }
      const name = e.type === 'train' ? 'drone' : e.type;
      spr(name === 'drone' && ((frame + (e.x | 0)) >> 3) % 2 ? 'drone2' : name, e.x, e.y, e.plain ? PAL.drone : PAL[e.type]); // only a red train carries a capsule
      if (e.type === 'rusher' && frame % 2) { g.fillStyle = COL.flame; g.fillRect(e.x + 8, e.y - 1, 4, 1); }
    }
    if (s.shot) { // the wave: a tall crescent as high as the swing
      const [y0, y1] = band(s.shot.y, s.shot.d), ym = (y0 + y1) / 2, hf = (y1 - y0) / 2;
      for (let yy = Math.round(y0); yy <= y1; yy++) { const k = (yy - ym) / hf, xx = Math.round(s.shot.x - 9 * k * k); g.fillStyle = COL.energyHot; g.fillRect(xx - 2, yy, 3, 1); g.fillStyle = COL.energy; g.fillRect(xx - 5, yy, 3, 1); }
    }
  }
  function drawFx(s) {
    const nose = C.SHIP_X + C.NOSE;
    if (fx.blade) { // the stroke is as tall as the swing band and as long as the blade; cream when the laser lengthens it
      const b = fx.blade, t = b.t, live = b.n > 0, f = live ? [1, 1, 0.8, 0.6, 0.4, 0.25, 0.12, 0.06][t] : [0.5, 0.35, 0.2, 0.1, 0, 0, 0, 0][t];
      if (f) {
        const [y0, y1] = band(b.y, b.d), ym = (y0 + y1) / 2, hf = (y1 - y0) / 2 * f, hot = b.lv > 0 ? COL.laserHot : COL.energyHot, cool = b.lv > 0 ? COL.laser : COL.energy;
        g.fillStyle = t < 3 ? hot : cool;
        for (let dx = 0; dx < b.len; dx++) { const k = dx / b.len, hh = Math.max(1, Math.round(hf * Math.sin(Math.PI * Math.min(1, 0.15 + k * 0.85)))); if (live && t < 2 && dx % 3 === 0) g.fillRect(nose + dx, Math.round(ym - hh), 1, hh * 2); else if (live || dx % 2 === 0) { g.fillRect(nose + dx, Math.round(ym - hh), 1, 2); g.fillRect(nose + dx, Math.round(ym + hh) - 2, 1, 2); } }
        // the first 24 px are the point-blank zone: the root of every stroke is red, filled when it actually bit there
        g.fillStyle = t < 3 ? COL.text : COL.hudRed;
        for (let dx = 0; dx < Math.min(C.CLOSE, b.len); dx++) { const k = dx / b.len, hh = Math.max(1, Math.round(hf * Math.sin(Math.PI * Math.min(1, 0.15 + k * 0.85)))); g.fillStyle = b.near && t < 5 ? (dx % 2 ? COL.text : COL.hudRed) : COL.hudRed; if (b.near && t < 5) g.fillRect(nose + dx, Math.round(ym - hh), 1, hh * 2); else if (live || dx % 2 === 0) { g.fillRect(nose + dx, Math.round(ym - hh), 1, 2); g.fillRect(nose + dx, Math.round(ym + hh) - 2, 1, 2); } }
        if (b.near && t < 6) { g.fillStyle = t < 3 ? COL.text : COL.hudRed; for (let yy = Math.round(y0); yy <= y1; yy++) { const k = (yy - ym) / ((y1 - y0) / 2); g.fillRect(Math.round(nose + C.CLOSE + 6 + t * 2 - 7 * k * k), yy, 3, 1); } }
        if (live && t < 4 && nose + b.len < W - 8) { g.fillStyle = cool; for (let yy = Math.round(y0); yy <= y1; yy++) { const k = (yy - ym) / ((y1 - y0) / 2); g.fillRect(Math.round(nose + b.len + 4 - 9 * k * k), yy, 2, 1); } }
      }
    }
    for (const r of fx.rings) { const rad = 3 + r.t * 1.6; g.fillStyle = r.c || COL.energyHot; for (let a = 0; a < 12; a++) g.fillRect(Math.round(r.x + Math.cos(a * 0.5236) * rad), Math.round(r.y + Math.sin(a * 0.5236) * rad), 1, 1); }
    for (const p of fx.parts) { g.fillStyle = p.c; g.fillRect(p.x | 0, p.y | 0, p.s, p.s); }
    for (const p of fx.pops) { if (p.t > 30 && (p.t >> 1) % 2) continue; text(p.txt, Math.round(p.x), Math.round(p.y - Math.min(p.t, 16) * 0.6), p.col); }
  }
  // the gate's clock: ordinary-size digits on a black plate set into the corridor ceiling, with a bar that runs down; red and blinking for the last 10 s
  let lastGateSec = -1;
  function drawGateTime(s) {
    const b = s.boss; if (!b || b.dead || b.leaving || b.x > C.BOSS.FACE || s.phase === 'clear') return;
    const sec = Math.ceil(b.left / 60), low = sec <= 10, col = low ? ((frame >> 2) % 2 ? COL.hudRed : COL.text) : COL.laser, label = 'TIME ' + String(sec).padStart(2, '0');
    const w = tw(label) + 12, x = Math.round((W - w) / 2) - 20;
    g.fillStyle = '#000'; g.fillRect(x, HUD + 2, w, 13); // inside the ceiling band: it covers no flying space
    text(label, x + 6, HUD + 4, col);
    g.fillStyle = '#30303c'; g.fillRect(x + 3, HUD + 13, w - 6, 1); g.fillStyle = col; g.fillRect(x + 3, HUD + 13, Math.round((w - 6) * b.left / C.BOSS.TIME), 1);
    if (low && sec !== lastGateSec && mode === 'play') ZSAudio.play('turn'); // a tick for each of the last ten seconds
    lastGateSec = sec;
  }
  function drawHud(s) {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, HUD);
    text(mode === 'title' || !entry.name ? '1UP' : entry.name, 4, 1, COL.hudRed); text(pad6(s.score), 26, 1); text('HI', 88, 1, COL.hudRed); text(pad6(Math.max(hi, s.score)), 104, 1);
    const lives = Math.max(0, s.lives - (s.phase === 'dead' || s.phase === 'over' || (s.phase === 'clear' && s.cleared) ? 0 : 1)); // at ALL CLEAR every ship is shown, and counted off
    for (let i = 0; i < Math.min(6, lives); i++) if (!(fx.extendT > 0 && i === lives - 1 && (frame >> 2) % 2)) spr('life', W - 10 - i * 10, 5, PAL.life);
    // laser stock
    for (let i = 0; i < C.LASER_MAX; i++) { const on = i < s.laser, fading = i === s.laser - 1 && s.laserT < 120 && (frame >> 2) % 2; g.fillStyle = on && !fading ? ((fx.hudLaser > 0 && (frame >> 2) % 2) ? COL.laserHot : COL.laser) : '#30303c'; g.fillRect(4 + i * 16, 10, 14, on ? 4 : 1); if (!on) g.fillRect(4 + i * 16, 13, 14, 1); }
    if (s.laser > 0) { g.fillStyle = s.laserT < 120 && (frame >> 2) % 2 ? COL.hudRed : COL.laser; g.fillRect(4, 15, Math.ceil(46 * s.laserT / C.DECAY[s.laser]), 1); } // time left on the last charge
    // cut chain gauge: one segment per level, the multiplier beside it; red blink when it has just run out
    const broke = s.chain === 0 && fx.chainBreak > 0 && (frame >> 2) % 2, top = s.chain >= C.CHAIN_MAX && (frame >> 2) % 2;
    for (let i = 0; i < C.CHAIN_MAX; i++) { const on = i < s.chain; g.fillStyle = broke ? COL.hudRed : on ? (top ? COL.energyHot : COL.energy) : '#30303c'; g.fillRect(58 + i * 6, on || broke ? 10 : 12, 5, on || broke ? 5 : 1); }
    if (s.chain > 0) { g.fillStyle = s.chainT < 30 && (frame >> 1) % 2 ? COL.hudRed : COL.energy; g.fillRect(58, 15, Math.ceil(23 * s.chainT / C.CHAIN_T[s.chain]), 1); } // time left before the multiplier drops a step
    text('X' + (s.chain + 1), 84, 9, broke ? COL.hudRed : s.chain > 0 ? (top ? COL.energyHot : COL.energy) : '#50505c');
    // course map: one box per zone, the one being flown blinks; then the loop count
    for (let i = 0; i < 3; i++) { const done = i < s.zone, cur = i === s.zone; g.fillStyle = COL.rock[i][done || (cur && (frame >> 4) % 2) ? 1 : 0]; g.fillRect(104 + i * 10, 10, 8, 5); }
    if (s.loop > 0) text('L' + (s.loop + 1), 138, 9, COL.laser);
    drawGateTime(s);
  }
  function render() {
    const page = mode === 'title' ? attract() : mode, s = mode === 'title' ? demo : st;
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    if (page === 'table' || page === 'best') { drawRank(page); return; }
    if (page === 'title') { drawTitle(); return; }
    g.save();
    if (fx.shake > 0) g.translate(Math.round((Math.random() - 0.5) * Math.min(4, fx.shake / 2)), Math.round((Math.random() - 0.5) * Math.min(4, fx.shake / 2)));
    drawWorld(s); drawBoss(s); drawThings(s); drawShip(s); drawFx(s);
    g.restore();
    drawHud(s);
    if (page === 'demo') { if ((frame >> 5) % 2) ctext('PUSH BUTTON', 104, COL.text); ctext('GAME OVER', 60, COL.hudRed); return; }
    if (s.phase === 'ready') { ctext(s.course.zones[s.zone].name, 84, COL.rock[s.zone][1]); ctext(page === 'demo' ? 'READY' : 'READY ' + entry.name, 100, COL.text); }
    if (s.phase === 'clear' && s.cleared && s.tallied !== undefined && (s.tallied > 0 || s.tallyEnd)) { ctext('ALL CLEAR', 76, COL.laser); ctext('SHIP BONUS', 96, COL.text); ctext(C.SHIP_BONUS + ' X ' + s.tallied, 110, COL.laser); if (s.tallyEnd) ctext('= ' + C.SHIP_BONUS * s.tallied, 124, (frame >> 2) % 2 ? COL.text : COL.laser); }
    else if (s.phase === 'clear') { ctext(s.won ? 'LOOP ' + (s.loop + 1) + ' CLEAR' : 'THE GATE GOT AWAY', 84, s.won ? COL.laser : COL.hudRed); if (s.phaseT < C.CLEAR - 50) ctext(s.won && fx.gate ? 'GATE ' + fx.gate.pts + '  ' + fx.gate.sec + ' SEC LEFT' : 'NO BONUS', 100, COL.text); if (s.won && s.phaseT < C.CLEAR - 90) ctext('LOOP BONUS ' + C.LOOP_BONUS * (s.loop + 1), 114, COL.text); }
    if (fx.banner && s.phase === 'play') { const b = fx.banner; if (b.t < 100 || (b.t >> 2) % 2) { ctext(b.a, 28, COL.text); if (b.t > 20) ctext(b.b, 40, COL.laser); } }
    if (mode === 'over') { if (st.cleared) { ctext('ALL CLEAR', 84, COL.laser); ctext('SHIP BONUS ' + C.SHIP_BONUS * st.tallied, 100, COL.text); } else ctext('GAME OVER', 100, COL.hudRed); }
    if (paused) { g.fillStyle = '#000'; g.fillRect(96, 96, 64, 15); ctext('PAUSE', 100, COL.text); }
  }
  function drawTitle() {
    for (const t of STARS) { if ((frame + t.ph) % 96 < 70) { g.fillStyle = COL.star[t.c]; g.fillRect(((t.x - frame * t.v) % W + W) % W | 0, t.y | 0, 1, 1); } }
    text('1UP', 4, 1, COL.hudRed); text(pad6(st ? st.score : 0), 26, 1); text('HI', 88, 1, COL.hudRed); text(pad6(hi), 104, 1);
    // logo. ZIG: the three letters stand on a zigzag, in the ship's cyan. SABER: cut in two by a slash, the lower half
    // slipped aside, in the laser's cream. Both carry the banded colouring and hard drop shadow of an early-80s marquee.
    const SC = 4, k = Math.min(1, titleT / 36), slashY = px => 62 - (px - 100) * 0.27; // the cut runs up to the right
    const glyph = (ch, x, y, bands, cut) => {
      const gl = FONT[ch]; if (!gl) return;
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 35; i++) if (gl[i] === '#') {
        const row = (i / 5) | 0; let px = x + (i % 5) * SC, py = y + row * SC;
        if (cut && py + SC / 2 > slashY(px + SC / 2)) { px += 3; py += 2; }
        g.fillStyle = pass ? bands[row] : '#58100c'; g.fillRect(px + (pass ? 0 : 2), py + (pass ? 0 : 2), SC, SC);
      }
    };
    const ZB = ['#fcfcfc', '#fcfcfc', COL.energy, COL.energy, COL.energy, '#2038ec', '#2038ec'], SB = ['#fcfcfc', '#fcfcfc', COL.laser, COL.laser, COL.flame, COL.flame, COL.hudRed];
    'ZIG'.split('').forEach((ch, n) => glyph(ch, 24 + n * 24, 24 + (n === 1 ? 10 : 0), ZB, false));
    'SABER'.split('').forEach((ch, n) => glyph(ch, 108 + n * 24, 28, SB, k >= 1));
    // the slash itself: it crosses once, leaves the cut, and the exhaust of the ship that made it zigzags under ZIG
    const x0 = 100, x1 = 100 + Math.round(138 * k);
    if (k < 1 || (frame >> 3) % 8 === 0) { g.fillStyle = COL.energyHot; for (let px = x0; px < x1; px++) g.fillRect(px, Math.round(slashY(px)), 1, k < 1 ? 3 : 1); }
    for (let n = 0; n < 34; n++) { const zx = 20 + n * 2.4, zy = 66 + Math.abs(((n + 6) % 24) - 12) * 0.9; if (zx < 20 + 80 * Math.min(1, titleT / 24)) { g.fillStyle = n > 26 ? COL.flame : COL.flame2; g.fillRect(Math.round(zx), Math.round(zy), 1, 1); } }
    spr('ship', k < 1 ? x1 + 4 : 238, k < 1 ? slashY(x1) : slashY(238), { w: COL.ship, d: COL.shipDark, c: COL.canopy, r: COL.hudRed, f: frame % 2 ? COL.flame : null, e: COL.energy }, -0.2);
    ctext('ONE BUTTON = TURN + FIRE', 82, COL.shipDark);
    const y0 = 98, row = (i, name, pal, a, b, colB) => { spr(name, 56, y0 + i * 18 + 3, pal); text(a, 76, y0 + i * 18, COL.text); if (b) text(b, 142, y0 + i * 18, colB || COL.energy); };
    row(0, 'drone', PAL.drone, 'FAR 100', 'CUT 300');
    for (let k = 0; k < 3; k++) spr(k === 1 ? 'drone2' : 'drone', 56 + k * 16, y0 + 21, PAL.train);
    text('ALL', 106, y0 + 18, COL.text); text('= LASER', 142, y0 + 18, COL.laser);
    ctext('LASER = LONGER BLADE + ARMOR', y0 + 74, COL.laser); spr('cap', 196, y0 + 21, (frame >> 2) % 2 ? PAL.cap : PAL.cap2);
    row(2, 'shell', PAL.shell, 'FAR ---', 'CUT 500');
    row(3, 'gem', PAL.gem, '100 - 800');
    if ((frame >> 5) % 2) ctext('PUSH BUTTON', 186, COL.text);
    ctext('1ST BONUS ' + C.EXTEND[0] + ' PTS', 204, COL.hudRed);
  }
  function drawRank(page) {
    const t = readRank();
    ctext('BEST 5', 30, COL.hudRed);
    if (page === 'table' && st) ctext(entry.name + '  ' + st.score, 46, entry.rank >= 0 ? COL.laser : COL.shipDark);
    const y0 = 70;
    for (let i = 0; i < t.length; i++) {
      const mine = page !== 'best' && st && !t[i].def && t[i].s === st.score && i === entry.rank;
      const col = mine && (frame >> 3) % 2 ? COL.laser : [COL.hudRed, COL.text, COL.text, COL.shipDark, COL.shipDark][i];
      text((i + 1) + ['ST', 'ND', 'RD', 'TH', 'TH'][i], 56, y0 + i * 16, col); text(pad6(t[i].s), 96, y0 + i * 16, col); text(t[i].n, 164, y0 + i * 16, col);
    }
  }

  let acc = 0, lastT = performance.now();
  function loop(now) {
    acc += Math.min(100, now - lastT); lastT = now;
    while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; }
    render(); requestAnimationFrame(loop);
  }
  function fit() {
    const m = Math.min(innerWidth / W, innerHeight / H), sc = m < 1 ? m : Math.floor(m);
    cv.style.width = W * sc + 'px'; cv.style.height = H * sc + 'px';
  }
  addEventListener('resize', fit); fit();
  newDemo();

  window.__game = {
    get state() { return st; }, get demo() { return demo; }, get mode() { return mode; }, get paused() { return paused; }, get attract() { return mode === 'title' ? attract() : null; },
    get fx() { return fx; }, get freeze() { return freeze; }, get frame() { return frame; }, get pressQ() { return pressQ; }, entry, names: NAMES, readRank, newGame, tick, render, button,
    setTitleT(v) { titleT = v; if (attract() !== 'title' && !demo) newDemo(); }, setState(s) { st = s; }, setOverT(v) { overT = v; }, pilot: null, audio: ZSAudio,
    visual: { palette: COL, hud: { score: [26, 1], high: [120, 1], laser: [4, 10], zones: [104, 10] }, sprite: { ship: [16, 7], font: [5, 7, 6] } },
  };
  requestAnimationFrame(loop);
})();
