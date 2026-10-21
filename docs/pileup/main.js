// PILEUP — page: input, top-down drawing, feedback, title / demo / high-score table. The rules live in core.js.
(function () {
  'use strict';
  const S = window.PILEUP, C = S.C, DX = S.DX, DY = S.DY;
  const BUILD = 'finished';
  const cv = document.getElementById('screen'), g = cv.getContext('2d');
  const TS = 24, OY = 32, VW = C.W * TS, VH = C.H * TS + OY;
  cv.width = VW; cv.height = VH;
  const q = new URLSearchParams(location.search);
  const U = TS / C.TILE;                        // screen pixels per rules unit
  const sx = (x) => x * U, sy = (y) => OY + y * U;
  const tc = (t) => t * TS + TS / 2;            // tile centre on screen

  // palette roles (VISUAL_DESIGN.md): amber = you, white + red/blue = police, red = where police will drive,
  // orange = fire (a pileup), green = the open exit, cyan = the dog unit
  const PAL = { bg: '#000', road: '#0b0b10', block: '#16306a', blockHi: '#3f6fd8', blockLo: '#0a1638', lane: '#2a2a36',
    me: '#ffcf2e', meDark: '#a8740a', cop: '#f2f2f2', van: '#1d2c66', dog: '#3ff0ff', mark: '#ff3b3b', fire: '#ff8a1c',
    hulk: '#3a3a3a', goal: '#4dff6a', text: '#fff', dim: '#7f9cff' };

  // ---- high scores
  const DEFAULT_TABLE = [[30000, 'ABA'], [20000, 'CPU'], [12000, 'KIT'], [6000, 'VAN'], [3000, 'K9 ']];
  let table = DEFAULT_TABLE.map(([s, n]) => ({ s, n }));
  try { const t = JSON.parse(localStorage.getItem('pileup.table') || 'null'); if (Array.isArray(t) && t.length === 5) table = t; } catch (e) { /* storage optional */ }
  const saveTable = () => { try { localStorage.setItem('pileup.table', JSON.stringify(table)); } catch (e) { /* optional */ } };

  // modes: title, demo, play, over (game over / city escaped), entry (initials)
  let st = null, mode = 'title', modeT = 0, seed = (Date.now() % 100000) | 0, pending = 0, lastLine = '';
  if (q.get('seed')) seed = +q.get('seed');
  let shake = 0, flash = 0, flashRGB = '255,240,200', frame = 0, demoK = 0;
  const fx = { pops: [], skids: [], debris: [], scents: [], smoke: [], banner: null };
  const faces = new Map(); // which way each car last pointed (drawing only; 0 is the getaway car)
  let entry = null;        // { rank, letters: [..], pos }
  // the first READY of a district names what it brings
  const INTRO = { DOWNTOWN: 'THEY DRIVE YOUR TRACKS. CROSS THEM.', MARKET: 'HEAVY VAN RAMS THROUGH. 3 RAMS OR A WRECK STOP IT.',
    UPTOWN: 'DOG UNIT IGNORES YOUR TRACKS. IT HUNTS.', HARBOR: 'VANS, DOG UNITS, MORE POLICE. PILEUPS PAY x3', INDUSTRY: 'VANS, DOG UNITS, MORE POLICE. PILEUPS PAY x3',
    'OLD TOWN': 'QUIET STREETS. PILEUPS PAY x1' };
  const introSeen = {};
  // each zone's look: its blocks' colours, what is on its rooftops, and the chip that names it on an exit and the map
  const THEME = {
    DOWNTOWN: { block: '#16306a', hi: '#3f6fd8', lo: '#0a1638', win: 'rgba(160,190,255,0.2)', deco: 'windows', tag: 'DTN', chip: '#3f6fd8' },
    'OLD TOWN': { block: '#4a2418', hi: '#9a5236', lo: '#24100a', win: 'rgba(255,190,140,0.28)', deco: 'tiles', tag: 'OLD', chip: '#c06a44' },
    MARKET: { block: '#33361a', hi: '#7c8640', lo: '#181a0a', win: 'rgba(225,235,160,0.3)', deco: 'awnings', tag: 'MKT', chip: '#9aa64c' },
    UPTOWN: { block: '#341a56', hi: '#7b4fc4', lo: '#190c2a', win: 'rgba(215,180,255,0.4)', deco: 'towers', tag: 'UPT', chip: '#9a6ae0' },
    HARBOR: { block: '#12343c', hi: '#2f7f8a', lo: '#081a1e', win: 'rgba(150,225,225,0.25)', deco: 'crates', tag: 'HBR', chip: '#3f9aa6' },
    INDUSTRY: { block: '#2a2a30', hi: '#64646e', lo: '#121216', win: 'rgba(200,200,200,0.18)', deco: 'stripes', tag: 'IND', chip: '#8a8a96' },
  };

  window.REVIEW && REVIEW.attach({ slug: 'pileup', build: BUILD, level: 'replay', key: 'KeyN', used: ['KeyM', 'Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'], hash: () => S.hash(st) });

  function clearFx() { for (const k of ['pops', 'skids', 'debris', 'scents', 'smoke']) fx[k].length = 0; fx.banner = null; faces.clear(); shake = 0; flash = 0; }
  function start() {
    SFX.init(); SFX.stopAll(); SFX.play('start');
    st = S.create(seed); mode = 'play'; modeT = 0; pending = 0; clearFx(); paintCity(st.cx, st.cy, S.district(st).name); for (const k in introSeen) delete introSeen[k];
    window.REVIEW && REVIEW.runStart({ seed });
    seed = (seed * 48271 + 11) % 2147483647 % 1000000;
  }
  function startDemo() {
    const D = window.PILEUP_DEMO;
    if (!D) { mode = 'title'; modeT = 0; return; }
    st = S.create(D.seed); mode = 'demo'; modeT = 0; demoK = 0; clearFx(); paintCity(st.cx, st.cy, S.district(st).name);
  }
  function toTitle() { mode = 'title'; modeT = 0; st = null; clearFx(); paintCity(0, 0); }

  // ---- input: a direction is remembered and taken at the next chance; the opposite one reverses at once
  const KEYS = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ. ';
  function press(d, fire) {
    SFX.init();
    if (mode === 'play') { if (d) pending = d; return; }
    if (mode === 'entry') {
      const L = entry.letters;
      if (d === 1 || d === 3) { L[entry.pos] = ALPHA[(ALPHA.indexOf(L[entry.pos]) + (d === 1 ? 1 : ALPHA.length - 1)) % ALPHA.length]; SFX.play('tick'); }
      else if (d === 4 && entry.pos > 0) entry.pos--;
      else if (d === 2 || fire) {
        if (entry.pos < 2) { entry.pos++; SFX.play('tick'); }
        else { table[entry.rank].n = L.join(''); saveTable(); SFX.play('tick'); entry = null; toTitle(); }
      }
      return;
    }
    if (fire && (mode === 'title' || mode === 'demo' || (mode === 'over' && modeT > 60))) start();
  }
  addEventListener('keydown', (e) => {
    if (KEYS[e.code] || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    if (e.code === 'KeyM') { SFX.init(); SFX.toggle(); return; }
    if (KEYS[e.code]) press(KEYS[e.code], false);
    else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) press(0, true);
  });
  // touch / mouse: swipe to steer, tap to start
  let touch0 = null, swiped = false;
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.init(); touch0 = [e.clientX, e.clientY]; swiped = false; });
  addEventListener('pointermove', (e) => {
    if (!touch0) return;
    const dx = e.clientX - touch0[0], dy = e.clientY - touch0[1];
    if (Math.abs(dx) + Math.abs(dy) < 18) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 4) : (dy > 0 ? 3 : 1), false);
    touch0 = [e.clientX, e.clientY]; swiped = true;
  });
  addEventListener('pointerup', () => { if (touch0 && !swiped) press(0, true); touch0 = null; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- rules tick and the feedback it produces
  function tick() {
    frame++; modeT++;
    if (mode !== 'play') SFX.music(null);
    if (mode === 'title') { if (modeT > 60 * 9) startDemo(); return; }
    if (mode === 'entry') return;
    if (mode === 'over') { if (entry && modeT > 60) mode = 'entry'; else if (!entry && modeT > 60 * 6) toTitle(); return; }
    if (mode === 'demo') {
      const D = window.PILEUP_DEMO;
      let input = {};
      while (demoK < D.inputs.length && D.inputs[demoK][0] <= st.t) { if (D.inputs[demoK][0] === st.t) input = { d: D.inputs[demoK][1] }; demoK++; }
      stepRules(input, false);
      SFX.music(null, { demo: true });
      if (st.t >= D.ticks || st.phase !== 'play' && st.phase !== 'ready') toTitle();
      return;
    }
    const input = pending ? { d: pending } : {};
    pending = 0;
    stepRules(input, true);
    clearTally();
    if (st.over || st.won) {
      const progress = (st.stats.districts + (st.won ? 0 : Math.min(1, st.wrecked / S.district(st).quota) * 0.99)).toFixed(2);
      const fails = Object.entries(st.stats.fail).map(([k, v]) => `${k}:${v}`).join(',');
      lastLine = `RUN v1 build=${BUILD} progress=${progress} score=${st.score} time=${Math.floor(st.t / 60)}${fails ? ' fail=' + fails : ''}`;
      console.log(lastLine);
      window.REVIEW && REVIEW.runEnd(lastLine);
      const rank = table.findIndex(r => st.score > r.s);
      if (rank >= 0) { table.splice(rank, 0, { s: st.score, n: '___' }); table.length = 5; entry = { rank, letters: ['A', 'A', 'A'], pos: 0 }; }
      mode = 'over'; modeT = 0;
      if (st.won) SFX.play('won'); else SFX.play('gameover');
    }
  }
  const sfx = (name, arg) => SFX.play(name, arg, { demo: mode === 'demo' }); // attract-mode sounds are off
  // what the music should be doing: nothing outside play; the getaway section once the exits are open, the alert
  // section back in a district you have been through, else the chase; tempo from the police speed; the counter
  // layer while three or more police are on your tracks
  function musicState() {
    if (!st || st.phase !== 'play' || st.over || st.won) return null;
    const D = S.district(st), onTracks = st.cops.filter(c => c.ti >= 0).length;
    return { section: st.exit ? 'getaway' : D.alert ? 'alert' : 'chase', heat: S.copSpeed(st) - C.CSPD0, line: onTracks >= 3 };
  }
  function stepRules(input, live) {
    const before = st.p.dir, d0 = st.d;
    S.step(st, input);
    SFX.music(musicState(), { demo: !live });
    if (live) window.REVIEW && REVIEW.step(input);
    if (before && st.p.dir === S.REV[before]) fx.skids.push({ x: st.p.x, y: st.p.y, d: before, life: 1 });   // skid marks; no sound (removed on request)
    for (const e of st.events) react(e);
    if (st.d !== d0 && !st.won) { paintCity(st.cx, st.cy, S.district(st).name); clearFx(); }
  }
  function clearTally() {
    const L = fx.lastClear;
    if (!L || !L.escape || st.phase !== 'clear') return;
    const n = L.cars / C.CAR_BONUS, since = C.CLEAR_T - st.pt;
    if (L.tallied < n && since > 45 + L.tallied * 18) sfx('tally', L.tallied++);
  }
  function react(e) {
    if (e.type === 'crash') {
      sfx('crash', e.n);
      const pop = fx.pops.find(o => o.id === e.id && o.life > 0.3);   // one tally per pileup, growing
      if (pop) { pop.pts += e.pts; pop.n = e.n; pop.life = 1; } else fx.pops.push({ id: e.id, x: S.cen(e.tx), y: S.cen(e.ty), pts: e.pts, n: e.n, life: 1 });
      shake = Math.max(shake, 2 + e.n * 1.5);
      for (let i = 0; i < 4 + e.n * 2; i++) {
        const a = Math.random() * 6.283, v = 40 + Math.random() * 60 * Math.min(e.n, 6);
        fx.debris.push({ x: sx(e.x), y: sy(e.y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, hot: Math.random() < 0.5 });
      }
      if (e.n >= 3) { flash = Math.min(0.4, 0.08 * e.n); flashRGB = '255,240,200'; fx.banner = { text: `${e.n}-CAR PILEUP`, life: 1.4, n: e.n, color: PAL.fire }; }
    } else if (e.type === 'warn') sfx('siren');
    else if (e.type === 'scent') { sfx('scent'); fx.scents.push({ x: S.cen(e.tx), y: S.cen(e.ty), life: 1 }); }
    else if (e.type === 'dent') { sfx('dent'); shake = Math.max(shake, 4); for (let i = 0; i < 6; i++) fx.smoke.push({ id: e.id, x: sx(e.x) + (Math.random() - 0.5) * 10, y: sy(e.y) + (Math.random() - 0.5) * 10, r: 3 + Math.random() * 3, life: 1 + Math.random() }); }
    else if (e.type === 'exit') { sfx('exit'); fx.banner = { text: 'EXITS OPEN', life: 1.6, n: 4, color: PAL.goal }; }
    else if (e.type === 'extend') { sfx('extend'); if (!fx.banner || fx.banner.life < 0.8) fx.banner = { text: 'EXTRA CAR', life: 1.4, n: 3, color: PAL.me }; }
    else if (e.type === 'clear') { sfx('clear'); fx.lastClear = { ...e, tallied: 0 }; }
    else if (e.type === 'go') { sfx('go'); introSeen[S.district(st).name] = true; }
    else if (e.type === 'death') {
      // caught: a cold blue-white flash, the police lights; wrecked: an orange burst of fire
      sfx('death'); shake = 12; flash = 0.5; flashRGB = e.cause === 'wreck' ? '255,150,60' : '170,200,255';
      if (e.cause === 'wreck') for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, v = 60 + Math.random() * 120; fx.debris.push({ x: sx(e.x), y: sy(e.y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hot: true }); }
    }
  }

  // ---- drawing: the district is painted once into a buffer
  const city = document.createElement('canvas'); city.width = VW; city.height = VH;
  function paintCity(cx, cy, zone) {
    const c = city.getContext('2d'), M = { cx, cy, off: {} }, road = (x, y) => S.road(M, x, y), T = THEME[zone || 'DOWNTOWN'];
    c.fillStyle = PAL.road; c.fillRect(0, OY, VW, VH - OY);
    for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) {
      if (road(x, y)) continue;
      const px = x * TS, py = OY + y * TS;
      c.fillStyle = T.block; c.fillRect(px, py, TS, TS);
      // a bevel on edges that face a road: lit from the top left
      c.fillStyle = T.hi;
      if (road(x, y - 1)) c.fillRect(px, py, TS, 3);
      if (road(x - 1, y)) c.fillRect(px, py, 3, TS);
      c.fillStyle = T.lo;
      if (road(x, y + 1)) c.fillRect(px, py + TS - 3, TS, 3);
      if (road(x + 1, y)) c.fillRect(px + TS - 3, py, 3, TS);
      // rooftops: what kind of district this is
      const h = (x * 7 + y * 13 + cx * 5 + cy * 3) & 7, edge = x === 0 || y === 0 || x === C.W - 1 || y === C.H - 1;
      if (edge) continue;
      c.fillStyle = T.win;
      if (T.deco === 'windows' && h < 2) c.fillRect(px + 10, py + 10, 3, 3);
      else if (T.deco === 'towers') { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((h + i + j) & 1) c.fillRect(px + 5 + i * 6, py + 5 + j * 6, 2, 3); }
      else if (T.deco === 'tiles' && h < 4) { c.fillRect(px + 5, py + 6, 6, 2); c.fillRect(px + 13, py + 14, 6, 2); }
      else if (T.deco === 'awnings' && road(x, y + 1)) { for (let i = 0; i < 4; i++) if (i & 1) c.fillRect(px + i * 6, py + TS - 7, 6, 4); }
      else if (T.deco === 'crates' && h < 3) { c.strokeStyle = T.win; c.lineWidth = 1; c.strokeRect(px + 6.5, py + 6.5, 7, 7); c.strokeRect(px + 12.5, py + 11.5, 6, 6); }
      else if (T.deco === 'stripes' && h < 2) { c.save(); c.beginPath(); c.rect(px + 4, py + 4, TS - 8, TS - 8); c.clip(); for (let i = -TS; i < TS; i += 6) { c.beginPath(); c.moveTo(px + i, py + TS); c.lineTo(px + i + TS, py); c.strokeStyle = T.win; c.lineWidth = 2; c.stroke(); } c.restore(); }
    }
    c.fillStyle = PAL.lane;                                     // lane dashes down straight road tiles
    for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) {
      if (!road(x, y)) continue;
      if (road(x - 1, y) && road(x + 1, y) && !road(x, y - 1) && !road(x, y + 1)) c.fillRect(x * TS + 6, OY + y * TS + TS / 2 - 1, 12, 2);
      if (road(x, y - 1) && road(x, y + 1) && !road(x - 1, y) && !road(x + 1, y)) c.fillRect(x * TS + TS / 2 - 1, OY + y * TS + 6, 2, 12);
    }
    // the exits: a barrier in each gap in the city wall
    for (const e of S.EXITS) { c.fillStyle = '#0b0b10'; c.fillRect(e.x * TS + 2, OY + e.y * TS + 2, TS - 4, TS - 4); c.fillStyle = '#5b5b70'; c.fillRect(e.x * TS + 4, OY + e.y * TS + 10, TS - 8, 4); }
  }
  paintCity(0, 0);

  // a car seen from above, pointing along d (1 up, 2 right, 3 down, 4 left); len and wid in pixels
  function car(x, y, d, body, roof, lights, len, wid, stripe) {
    len = len || 20; wid = wid || 14;
    g.save(); g.translate(Math.round(x), Math.round(y));
    g.rotate([0, 0, Math.PI / 2, Math.PI, -Math.PI / 2][d || 1]);
    const hl = len / 2, hw = wid / 2;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-hw + 1, -hl + 1, wid, len);
    g.fillStyle = body; g.fillRect(-hw, -hl, wid, len);
    if (stripe) { g.fillStyle = stripe; g.fillRect(-hw, -hl + 3, wid, 2); g.fillRect(-hw, hl - 5, wid, 2); }
    g.fillStyle = roof; g.fillRect(-hw + 2, -4, wid - 4, len > 22 ? 12 : 8);
    g.fillStyle = '#111'; g.fillRect(-hw - 1, -hl + 2, 2, 5); g.fillRect(hw - 1, -hl + 2, 2, 5); g.fillRect(-hw - 1, hl - 7, 2, 5); g.fillRect(hw - 1, hl - 7, 2, 5);
    if (lights) { g.fillStyle = lights[0]; g.fillRect(-hw + 2, -2, hw - 2, 3); g.fillStyle = lights[1]; g.fillRect(0, -2, hw - 2, 3); }
    g.fillStyle = '#fffbe0'; g.fillRect(-hw + 1, -hl - 1, 3, 2); g.fillRect(hw - 4, -hl - 1, 3, 2);  // headlamps
    g.restore();
  }
  // a sweeping cyan beam: the dog unit hunting
  function searchlight(x, y, d) {
    const a = [0, -Math.PI / 2, 0, Math.PI / 2, Math.PI][d] + Math.sin(frame * 0.12) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
    const grd = g.createRadialGradient(x, y, 4, x, y, 56);
    grd.addColorStop(0, 'rgba(63,240,255,0.45)'); grd.addColorStop(1, 'rgba(63,240,255,0)');
    g.fillStyle = grd; g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + (ca * 56 - sa * 16), y + (sa * 56 + ca * 16)); g.lineTo(x + (ca * 56 + sa * 16), y + (sa * 56 - ca * 16)); g.closePath(); g.fill();
  }
  // dents and smoke on a van that has rammed: one ram, a dent; two, dents and a trail of smoke
  function vanDamage(x, y, d, n) {
    if (!n) return;
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate([0, 0, Math.PI / 2, Math.PI, -Math.PI / 2][d || 1]);
    g.fillStyle = '#0a0a14'; g.fillRect(-8, -12, 5, 4); if (n >= 2) { g.fillRect(4, 2, 4, 6); g.fillRect(-8, 6, 4, 4); }
    g.fillStyle = '#ffb040'; if (n >= 2 && (frame >> 2) & 1) g.fillRect(-2, -14, 3, 3);   // sparks off the front
    g.restore();
    if (frame % (n >= 2 ? 4 : 10) === 0) fx.smoke.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, r: 2 + n, life: 1 + Math.random() * 0.5 });
  }
  function headlights(x, y, d, a) {
    const ux = DX[d], uy = DY[d];
    const grd = g.createLinearGradient(x, y, x + ux * 40, y + uy * 40);
    grd.addColorStop(0, `rgba(255,250,200,${a})`); grd.addColorStop(1, 'rgba(255,250,200,0)');
    g.fillStyle = grd; g.beginPath();
    g.moveTo(x + ux * 10 - uy * 5, y + uy * 10 + ux * 5); g.lineTo(x + ux * 40 - uy * 12, y + uy * 40 + ux * 12);
    g.lineTo(x + ux * 40 + uy * 12, y + uy * 40 - ux * 12); g.lineTo(x + ux * 10 + uy * 5, y + uy * 10 - ux * 5); g.fill();
  }

  function drawField() {
    const blink = (frame >> 3) & 1;
    // where each exit leads: the zone's chip and what its pileups pay, on the wall beside the gap
    for (const e of S.EXITS) {
      const dest = S.exitDest(st, e.d), side = e.d === 1 || e.d === 3;
      const lx = side ? tc(e.x + 1) + 4 : tc(e.x), ly = side ? OY + tc(e.y) : OY + tc(e.y + 1) + 4;
      const tag = dest.escape ? 'OUT' : THEME[dest.name].tag, col = dest.escape ? PAL.goal : THEME[dest.name].chip;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(side ? lx - 10 : lx - 11, side ? ly - 8 : ly - 10, side ? 46 : 22, side ? 16 : 30);
      g.fillStyle = col; g.fillRect(side ? lx - 8 : lx - 9, side ? ly - 6 : ly - 8, 4, side ? 12 : 4);
      text(tag, side ? lx - 2 : lx, side ? ly + 4 : ly + 3, 9, st.exit ? '#fff' : '#9aa', side ? 'left' : 'center');
      if (dest.alert) text('HOT', side ? lx + 18 : lx, side ? ly + 4 : ly + 13, 9, (frame >> 4) & 1 ? PAL.mark : '#fff', side ? 'left' : 'center');   // been there: on alert
      else if (!dest.escape) text('x' + dest.mult, side ? lx + 18 : lx, side ? ly + 4 : ly + 13, 9, dest.mult > 1 ? PAL.fire : '#9aa', side ? 'left' : 'center');
      else text('!', side ? lx + 18 : lx, side ? ly + 4 : ly + 13, 9, PAL.goal, side ? 'left' : 'center');
    }
    // the open exits: green chevrons pulsing outward through the gap
    if (st.exit) for (const e of S.EXITS) {
      const x = tc(e.x), y = OY + tc(e.y), k = (frame % 30) / 30;
      g.fillStyle = PAL.goal;
      for (let i = 0; i < 2; i++) {
        const o = ((k + i * 0.5) % 1) * 10 - 5, px = x + DX[e.d] * o, py = y + DY[e.d] * o;
        g.save(); g.translate(px, py); g.rotate([0, 0, Math.PI / 2, Math.PI, -Math.PI / 2][e.d]);
        g.beginPath(); g.moveTo(-8, 4); g.lineTo(0, -4); g.lineTo(8, 4); g.lineTo(8, 8); g.lineTo(0, 0); g.lineTo(-8, 8); g.closePath(); g.fill(); g.restore();
      }
    }
    for (const s of fx.skids) { g.fillStyle = `rgba(90,90,90,${s.life * 0.7})`; const vert = s.d === 1 || s.d === 3; g.fillRect(sx(s.x) - (vert ? 5 : 12), sy(s.y) - (vert ? 12 : 5), vert ? 3 : 24, vert ? 24 : 3); g.fillRect(sx(s.x) + (vert ? 2 : -12), sy(s.y) + (vert ? -12 : 2), vert ? 3 : 24, vert ? 24 : 3); }
    // arrival warning at a corner
    if (st.warn && blink && st.phase === 'play') {
      const gt = S.GATES[st.warn.gate];
      g.strokeStyle = (frame >> 4) & 1 ? PAL.mark : '#3b6bff'; g.lineWidth = 2; g.strokeRect(tc(gt[0]) - 10, OY + tc(gt[1]) - 10, 20, 20);
    }
    // tyre tracks: the route every patrol car on them will drive. Red where a car is still to drive them.
    const tr = st.trail;
    let from = tr.length;
    for (const c of st.cops) if (c.ti >= 0) from = Math.min(from, c.ti - st.trailBase - 1);
    g.lineCap = 'square';
    for (let i = 1; i < tr.length; i++) {
      const a0 = tr[i - 1], a1 = tr[i], age = Math.min(1, i / tr.length + 0.15), hot = i > from;
      if (Math.abs(a0[0] - a1[0]) + Math.abs(a0[1] - a1[1]) !== 1) continue;
      g.strokeStyle = hot ? `rgba(255,90,70,${0.25 + 0.5 * age})` : `rgba(150,150,170,${0.12 + 0.3 * age})`;
      g.lineWidth = hot ? 4 : 3;
      g.beginPath(); g.moveTo(tc(a0[0]), OY + tc(a0[1])); g.lineTo(tc(a1[0]), OY + tc(a1[1])); g.stroke();
      if (hot) {   // the stretch the police will still drive: bright dashes running along it toward you
        g.save(); g.setLineDash([4, 8]); g.lineDashOffset = -((frame + i * 12) % 12); g.strokeStyle = 'rgba(255,220,200,0.8)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(tc(a0[0]), OY + tc(a0[1])); g.lineTo(tc(a1[0]), OY + tc(a1[1])); g.stroke(); g.restore();
      }
    }
    for (const k of fx.scents) { g.strokeStyle = `rgba(255,90,70,${k.life})`; g.lineWidth = 2; const r = 6 + (1 - k.life) * 14; g.strokeRect(sx(k.x) - r, sy(k.y) - r, r * 2, r * 2); }
    // wrecks: a burnt hulk under a fire that grows with the pileup, blinking before the tow
    for (const w of st.wrecks) {
      const x = tc(w.tx), y = OY + tc(w.ty);
      if (w.t < 90 && blink) continue;
      g.fillStyle = PAL.hulk; g.fillRect(x - 10, y - 10, 20, 20);
      g.fillStyle = '#222'; g.fillRect(x - 6, y - 6, 12, 12);
      const f = 6 + Math.min(w.n, 6) * 2;
      for (let i = 0; i < 3 + Math.min(w.n, 8); i++) {
        const fx0 = x + Math.sin(frame * 0.4 + i * 2.1) * f * 0.5, fy0 = y + Math.cos(frame * 0.33 + i * 1.7) * f * 0.4 - 2;
        g.fillStyle = i % 2 ? PAL.fire : '#ffd23c'; g.fillRect(fx0 - 3, fy0 - 3 - (frame + i * 5) % 6, 6, 6);
      }
      if (w.n >= 3) { g.fillStyle = '#fff'; g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.fillText(String(w.n), x, y + TS - 6); }
    }
    // police: car, heavy van (long, navy), dog unit (short, cyan stripe)
    for (const c of st.cops) {
      const x = sx(c.x), y = sy(c.y), ph = (frame >> 3) & 1, lb = ph ? ['#ff2020', '#2040ff'] : ['#2040ff', '#ff2020'];
      if (c.dir) faces.set(c.id, c.dir);
      const f = faces.get(c.id) || 1;
      if (c.kind === 'dog') {
        // dog unit: a cyan car with a searchlight sweeping ahead instead of headlights; it never takes your tracks
        if (c.dir) searchlight(x, y, c.dir);
        car(x, y, f, PAL.dog, '#063a40', null, 18, 13, '#063a40');
        continue;
      }
      if (c.dir) headlights(x, y, c.dir, 0.18);
      if (c.kind === 'van') {
        // heavy van: damage shows as dents, a dead light bar and smoke; the third ram wrecks it
        const hurtBy = C.VAN_HP - c.hp;
        car(x, y, f, c.immune > 0 && blink ? '#e8e8f0' : PAL.van, hurtBy ? '#9a9aa8' : '#e8e8f0', hurtBy >= 2 ? (blink ? ['#ff2020', '#111'] : ['#111', '#111']) : lb, 26, 16);
        vanDamage(x, y, f, hurtBy);
      } else car(x, y, f, PAL.cop, '#202020', lb);
    }
    for (const s of fx.smoke) { g.fillStyle = `rgba(150,150,160,${Math.min(0.6, s.life * 0.4)})`; g.beginPath(); g.arc(s.x, s.y - (2 - s.life) * 10, s.r * (2.2 - s.life), 0, 6.283); g.fill(); }
    // the getaway car (blinks while busted)
    if (!(st.phase === 'dead' && blink) && st.phase !== 'clear') {
      const x = sx(st.p.x), y = sy(st.p.y);
      if (st.p.dir) { headlights(x, y, st.p.dir, 0.3); faces.set(0, st.p.dir); }
      car(x, y, faces.get(0) || 1, st.phase === 'dead' ? '#ff5a3a' : PAL.me, PAL.meDark, null);
    }
    for (const d of fx.debris) { g.fillStyle = d.hot ? `rgba(255,170,40,${d.life})` : `rgba(200,200,200,${d.life})`; g.fillRect(d.x - 2, d.y - 2, 4, 4); }
    g.textAlign = 'center';
    for (const p of fx.pops) {
      g.font = `bold ${p.n >= 3 ? 16 : 12}px monospace`;
      g.fillStyle = p.n >= 3 ? `rgba(255,255,255,${p.life})` : `rgba(255,210,90,${p.life})`;
      g.fillText(String(p.pts), p.x * U, OY + p.y * U - 14 - (1 - p.life) * 18);
    }
  }

  function draw() {
    g.save();
    g.fillStyle = PAL.bg; g.fillRect(0, 0, VW, VH);
    if (shake > 0) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    g.drawImage(city, 0, 0);
    if (st) drawField();
    g.restore();
    if (flash > 0) { g.fillStyle = `rgba(${flashRGB},${flash})`; g.fillRect(0, 0, VW, VH); }
    hud();
  }
  // the city: zones by colour, districts got out of brighter, the route so far, where you are (and where you are going)
  function cityMap(x0, y0, s, going, k) {
    const R = C.CITY_R, n = 2 * R + 1, done = new Set(st.cleared);
    g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(x0 - 4, y0 - 4, n * s + 8, n * s + 8);
    for (let cy = -R; cy <= R; cy++) for (let cx = -R; cx <= R; cx++) {
      const D = S.districtAt(st, cx, cy);
      g.globalAlpha = done.has(cx + ',' + cy) ? 1 : 0.45; g.fillStyle = THEME[D.name].chip; g.fillRect(x0 + (cx + R) * s, y0 + (cy + R) * s, s - 1, s - 1);
    }
    g.globalAlpha = 1; g.strokeStyle = PAL.me; g.lineWidth = 2; g.beginPath();
    st.route.forEach(([cx, cy], i) => { const px = x0 + (cx + R) * s + s / 2, py = y0 + (cy + R) * s + s / 2; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    if (going) g.lineTo(x0 + (st.cx + R) * s + s / 2 + DX[going] * s * (k === undefined ? 1 : k), y0 + (st.cy + R) * s + s / 2 + DY[going] * s * (k === undefined ? 1 : k));
    g.stroke();
    if ((frame >> 3) & 1) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x0 + (st.cx + R) * s - 0.5, y0 + (st.cy + R) * s - 0.5, s, s); }
  }
  function panel(h) { g.fillStyle = 'rgba(0,0,0,0.72)'; g.fillRect(0, VH / 2 - h / 2, VW, h); }
  function text(s, x, y, size, color, align) { g.font = `bold ${size}px monospace`; g.fillStyle = color; g.textAlign = align || 'center'; g.fillText(s, x, y); }
  function hud() {
    g.fillStyle = '#000'; g.fillRect(0, 0, VW, OY - 2);
    const best = Math.max(table[0].s, st && mode === 'play' ? st.score : 0);
    text(String(st && mode !== 'title' ? st.score : 0).padStart(7, '0'), 10, 21, 16, PAL.text, 'left');
    text('HI ' + String(best).padStart(7, '0'), VW - 10, 21, 16, PAL.dim, 'right');
    if (st && mode !== 'title') {
      // the district's quota as car icons: filled when wrecked, green when the exits are open
      const D = S.district(st), n = D.quota, w = 8, x0 = VW / 2 - n * w / 2;
      for (let i = 0; i < n; i++) { g.fillStyle = st.exit ? PAL.goal : i < st.wrecked ? PAL.fire : '#2a2f48'; g.fillRect(x0 + i * w + 1, 8, w - 2, 12); }
      text(D.name, x0 - 8, 20, 11, THEME[D.name].chip, 'right');
      text('x' + D.mult, x0 + n * w + 6, 20, 11, D.mult > 1 ? PAL.fire : PAL.dim, 'left');
      // spare cars along the bottom wall
      for (let i = 0; i < Math.min(st.lives - (st.phase === 'dead' ? 0 : 1), 8); i++) { g.fillStyle = PAL.me; g.fillRect(8 + i * 14, VH - 17, 10, 6); g.fillStyle = PAL.meDark; g.fillRect(10 + i * 14, VH - 16, 6, 4); }
    }
    if (fx.banner) { const b = fx.banner; text(b.text, VW / 2, OY + 100, 18 + Math.min(b.n, 7) * 3, (frame >> 2) & 1 ? '#fff' : b.color); }
    if (mode === 'play' || mode === 'demo') {
      const D = S.district(st);
      if (st.phase === 'ready') {
        panel(96); cityMap(VW - 84, VH / 2 - 36, 10, null);
        text(D.name, VW / 2 - 40, VH / 2 - 14, 22, THEME[D.name].chip); text(`PILEUPS x${D.mult}`, VW / 2 - 40, VH / 2 + 6, 12, D.mult > 1 ? PAL.fire : PAL.dim);
        text(D.alert ? 'BACK AGAIN: THEY ARE WAITING. MORE POLICE.' : INTRO[D.name] && !introSeen[D.name] ? INTRO[D.name] : 'READY', VW / 2 - 40, VH / 2 + 30, 12, D.alert ? PAL.mark : '#fff');
      } else if (st.phase === 'clear') {
        const last = fx.lastClear || {}, k = Math.min(1, (C.CLEAR_T - st.pt) / 40);   // the bonus counts up; the route steps on
        panel(96); cityMap(VW - 84, VH / 2 - 36, 10, st.entry, k);
        text(last.escape ? 'OUT OF THE CITY!' : 'GOT AWAY!', VW / 2 - 40, VH / 2 - 8, 26, PAL.goal);
        if (last.escape) {
          text(`BONUS ${Math.round((last.bonus - last.cars) * k)}`, VW / 2 - 40, VH / 2 + 20, 12, '#fff');
          for (let i = 0; i < last.cars / C.CAR_BONUS; i++) { const lit = i < last.tallied; g.fillStyle = lit ? PAL.me : '#333'; g.fillRect(VW / 2 - 100 + i * 16, VH / 2 + 30, 12, 7); }
          if (last.tallied) text(`CARS LEFT ${last.tallied * C.CAR_BONUS}`, VW / 2 + 30, VH / 2 + 38, 12, PAL.me);
        } else text(last.bonus ? `BONUS ${Math.round(last.bonus * k)}${last.first ? '   EXTRA CAR' : ''}` : 'BEEN HERE BEFORE: NO BONUS', VW / 2 - 40, VH / 2 + 20, 12, '#fff');
      }
      else if (st.phase === 'dead' && st.pt < C.DEAD_T - 30) { panel(50); text(st.cause === 'wreck' ? 'WRECKED' : 'BUSTED', VW / 2, VH / 2 + 10, 28, '#fff'); }
    }
    if (mode === 'demo') { text('DEMO', VW / 2, OY + 70, 16, PAL.dim); if ((frame >> 5) & 1) text('PUSH SPACE', VW / 2, VH - 40, 16, '#fff'); }
    if (mode === 'title') {
      panel(300);
      text('PILEUP', VW / 2, VH / 2 - 95, 56, PAL.me);
      text('YOUR TRACKS ARE THEIR ROUTE', VW / 2, VH / 2 - 66, 13, PAL.mark);
      for (let i = 0; i < 5; i++) text(`${i + 1}  ${String(table[i].s).padStart(7, ' ')}  ${table[i].n}`, VW / 2, VH / 2 - 26 + i * 20, 16, i === 0 ? PAL.me : '#fff');
      if ((frame >> 5) & 1) text('PUSH SPACE', VW / 2, VH / 2 + 110, 16, '#fff');
      text('ARROWS STEER   M SOUND', VW / 2, VH / 2 + 136, 11, PAL.dim);
    } else if (mode === 'over') {
      panel(entry ? 150 : 90);
      text(st.won ? 'CITY ESCAPED' : 'GAME OVER', VW / 2, VH / 2 - (entry ? 40 : 10), 30, st.won ? PAL.goal : '#fff');
      text(`${st.stats.cars} CARS  BEST PILEUP ${st.stats.best}`, VW / 2, VH / 2 + (entry ? -14 : 18), 13, PAL.dim);
      if (!entry && modeT > 60 && (frame >> 5) & 1) text('PUSH SPACE', VW / 2, VH / 2 + 38, 14, '#fff');
    }
    if (mode === 'entry') {
      panel(150);
      text(st.won ? 'CITY ESCAPED' : 'GAME OVER', VW / 2, VH / 2 - 40, 30, st.won ? PAL.goal : '#fff');
      text(`RANK ${entry.rank + 1}   ${st.score}`, VW / 2, VH / 2 - 12, 14, PAL.me);
      for (let i = 0; i < 3; i++) text(entry.letters[i], VW / 2 - 30 + i * 30, VH / 2 + 26, 28, i === entry.pos && (frame >> 3) & 1 ? PAL.me : '#fff');
      g.fillStyle = PAL.me; g.fillRect(VW / 2 - 40 + entry.pos * 30, VH / 2 + 32, 20, 3);
      text('UP/DOWN LETTER  SPACE NEXT', VW / 2, VH / 2 + 58, 11, PAL.dim);
    }
  }
  function age(dt) {
    for (const p of fx.pops) p.life -= dt * 0.9;
    fx.pops = fx.pops.filter(p => p.life > 0);
    for (const s of fx.skids) s.life -= dt * 0.8;
    fx.skids = fx.skids.filter(s => s.life > 0);
    for (const k of fx.scents) k.life -= dt * 2.5;
    fx.scents = fx.scents.filter(k => k.life > 0);
    for (const s of fx.smoke) s.life -= dt;
    fx.smoke = fx.smoke.filter(s => s.life > 0);
    for (const d of fx.debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.92; d.vy *= 0.92; d.life -= dt * 1.3; }
    fx.debris = fx.debris.filter(d => d.life > 0);
    if (fx.banner && (fx.banner.life -= dt) <= 0) fx.banner = null;
    shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt * 2);
  }

  function resize() {
    const k = Math.min(innerWidth / VW, innerHeight / VH);
    cv.style.width = (VW * k) + 'px'; cv.style.height = (VH * k) + 'px';
  }
  addEventListener('resize', resize); resize();

  let prev = performance.now(), acc = 0;
  function loop(now) {
    const dt = Math.min(100, now - prev); prev = now; acc += dt;
    while (acc >= 1000 / 60) { acc -= 1000 / 60; tick(); }
    age(dt / 1000);
    draw();
    requestAnimationFrame(loop);
  }
  if (q.get('manual') !== '1') requestAnimationFrame(loop); else draw();

  // test hooks
  window.__test = {
    get state() { return st; }, get mode() { return mode; }, get last() { return lastLine; }, get table() { return table; }, get fx() { return fx; },
    load(s) { st = s; mode = 'play'; paintCity(s.cx, s.cy, S.district(s).name); }, start, startDemo, toTitle, advance(n) { for (let i = 0; i < n; i++) tick(); age(n / 60); draw(); },
    steer(d) { pending = d; }, press, paint: paintCity,
  };
})();
