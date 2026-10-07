// OVERTURN — screen, input, feedback. The rules live in core.js; nothing here changes them.
(function () {
  'use strict';
  const C = OT.C, W = 224, H = 288, CX = 112, CY = 144, TOP = 32, BOT = 256, BUILD = '40-video';
  const cv = document.getElementById('screen'), g = cv.getContext('2d'); cv.width = W; cv.height = H;
  // whole-number scale where the window allows two or more; on a small screen (a phone) fill it instead of staying at 1x
  function fit() { const r = Math.min(innerWidth / W, innerHeight / H), k = r >= 2 ? Math.floor(r) : r; cv.style.width = Math.floor(W * k) + 'px'; cv.style.height = Math.floor(H * k) + 'px'; }
  addEventListener('resize', fit); fit();

  // every colour has one job
  const COL = {
    text: '#f4f4f4', dim: '#7c86b8', off: '#3a4070', panel: '#06060f',
    ground: '#143a36', grid: '#1f5a4c', plate: '#0f2d2c', mark: '#2f7a5e',       // the floor under the machine: only there to show the turn
    floor: '#0c1036', floorMulti: '#2a0c3c', spoke: '#1a2260', spokeMulti: '#4a1a66', // the table; purple while two balls are out
    rim: ['#000', '#ff3b30', '#ffb400', '#6fe8ff'], rimEdge: ['#000', '#7a1410', '#7a5200', '#1c6f8c'], // rim strength: 1 red, 2 amber, 3 cyan
    scar: '#5a1410',                                                              // a section torn out for good
    face: '#ff5ad2', faceHi: '#ffd0f4', steel: '#8a90a8', steelLo: '#4a4f66', slot: '#232a66', // target: live face, steel back
    net: '#9dfff0', netOff: '#2c5a56',                                            // the save light round the rim
    lit: '#fff04a', lamp: '#fff04a', lampOff: '#2a3270',                         // yellow: something is lit for you
    ball: '#ffffff', ballLo: '#9aa4c8',
    dmd: ['#2a1000', '#8a4200', '#ff9a1a', '#fff2c0'], dmdLo: ['#140700', '#4a2200', '#b85a00', '#ffb040'], dmdBg: '#0c0400', // the dot display: off, dim, lit, bright
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
    9: '.###.#...##...#.####....#...#..##..', '-': '...............#####...............', '+': '.......#....#..#####..#....#.......',
    '<': '...#...#...#...#.....#.....#.....#.', '>': '.#.....#.....#.....#...#...#...#...', '.': '................................#..',
    '=': '..........#####.....#####..........', ':': '.......#....#.........#....#.......',
  };
  function text(s, x, y, col, sc) {
    sc = sc || 1; g.fillStyle = col || COL.text; s = String(s).toUpperCase();
    for (let c = 0; c < s.length; c++) { const gl = FONT[s[c]]; if (gl) for (let i = 0; i < 35; i++) if (gl[i] === '#') g.fillRect(x + (c * 6 + i % 5) * sc, y + ((i / 5) | 0) * sc, sc, sc); }
  }
  const textC = (s, cx, y, col, sc) => text(s, Math.round(cx - String(s).length * 3 * (sc || 1)), y, col, sc);
  const textR = (s, rx, y, col) => text(s, rx - String(s).length * 6 + 1, y, col);
  const shadowC = (s, cx, y, col, sc) => { textC(s, cx + 1, y + 1, '#000', sc); textC(s, cx, y, col, sc); };

  // ---------- the two rotating layers: the ground under the machine, and the table ----------
  const ground = document.createElement('canvas'); ground.width = ground.height = 384;
  (function () {
    const q = ground.getContext('2d'); q.fillStyle = COL.ground; q.fillRect(0, 0, 384, 384);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 34; i++) { q.fillStyle = r() < 0.5 ? COL.plate : COL.grid; q.fillRect(((r() * 12) | 0) * 32 + 2, ((r() * 12) | 0) * 32 + 2, 28, 28); }
    q.fillStyle = COL.grid; for (let i = 0; i <= 384; i += 32) { q.fillRect(i, 0, 1, 384); q.fillRect(0, i, 384, 1); }
    q.fillStyle = COL.mark; for (let i = 16; i < 384; i += 64) for (let j = 16; j < 384; j += 64) q.fillRect(i - 2, j - 2, 4, 4);
  })();
  const table = document.createElement('canvas'); table.width = table.height = 224; const tq = table.getContext('2d');
  // a chevron on the table at radius r, angle a, pointing out (dir 1) or in (dir -1): "this is lit"
  function chevron(q, r, a, dir, col) {
    q.save(); q.rotate(a); q.translate(r, 0); q.fillStyle = col; q.beginPath(); q.moveTo(dir * 4, 0); q.lineTo(-dir * 3, -5); q.lineTo(-dir * 1, 0); q.lineTo(-dir * 3, 5); q.closePath(); q.fill(); q.restore();
  }
  function drawTable(st) {
    const q = tq, R = C.R, blink = (frame >> 3) & 1, multi = st.multi; q.clearRect(0, 0, 224, 224); q.save(); q.translate(112, 112);
    q.fillStyle = multi ? COL.floorMulti : COL.floor; q.beginPath(); q.arc(0, 0, R, 0, OT.TAU); q.fill();
    q.strokeStyle = multi ? COL.spokeMulti : COL.spoke; q.lineWidth = 1;
    for (let i = 0; i < C.SEGS; i++) { const a = i * OT.SEG_A; q.beginPath(); q.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); q.lineTo(Math.cos(a) * R, Math.sin(a) * R); q.stroke(); }
    q.beginPath(); q.arc(0, 0, 74, 0, OT.TAU); q.stroke();
    // the save light: a net round the outside of the rim, dark sockets when empty, a lit cyan line across every hole when a save is in store
    if (st.save || fx.net > 0) { q.strokeStyle = fx.net > 0 ? ((frame & 2) ? '#fff' : COL.net) : COL.net; q.lineWidth = 2; q.beginPath(); q.arc(0, 0, R + 9.5, 0, OT.TAU); q.stroke(); }
    else { q.strokeStyle = COL.netOff; q.lineWidth = 1; q.setLineDash([1, 5]); q.beginPath(); q.arc(0, 0, R + 9.5, 0, OT.TAU); q.stroke(); q.setLineDash([]); }
    for (let i = 0; i < C.SEGS; i++) {
      const hp = st.segs[i], a0 = i * OT.SEG_A + 0.025, a1 = (i + 1) * OT.SEG_A - 0.025, am = (i + 0.5) * OT.SEG_A;
      if (hp < 0) { q.strokeStyle = COL.scar; q.lineWidth = 2; q.setLineDash([2, 4]); q.beginPath(); q.arc(0, 0, R + 1, a0, a1); q.stroke(); q.setLineDash([]); continue; }
      // the section's lamp: lit by a landing, spent by the next finished bank
      const lx = Math.cos(am) * (R - 8), ly = Math.sin(am) * (R - 8);
      if (st.lamps[i]) { q.fillStyle = fx.lamp[i] > 0 ? '#fff' : COL.lamp; q.beginPath(); q.arc(lx, ly, fx.lamp[i] > 0 ? 4.5 : 3.5, 0, OT.TAU); q.fill(); }
      else { q.strokeStyle = COL.lampOff; q.lineWidth = 1; q.beginPath(); q.arc(lx, ly, 3, 0, OT.TAU); q.stroke(); }
      if (hp <= 0) continue;
      const fl = fx.seg[i] > 0, skill = st.skill === i;
      const give = fx.seg[i] > 3 ? 2 : fx.seg[i] > 1 ? 1 : 0; // the rubber gives under a landing and comes back
      q.lineWidth = 7; q.strokeStyle = COL.rimEdge[hp]; q.beginPath(); q.arc(0, 0, R + 3.5 + give, a0, a1); q.stroke();
      const lit = skill || st.ready === i || (st.round && st.round.kind === 'chase' && st.round.seg === i);
      const ac = skill ? COL.net : COL.lit; // the skill shot's arrows wear the save light's colour, since a save is what it gives; a round's are yellow
      q.lineWidth = 4; q.strokeStyle = fl ? '#fff' : lit && blink ? (skill ? '#fff' : ac) : hp === 1 && blink ? '#ff9a94' : COL.rim[hp]; q.beginPath(); q.arc(0, 0, R + 2.5 + give, a0, a1); q.stroke();
      if (lit) { chevron(q, R - 18, am, 1, ac); chevron(q, R - 27, am, 1, blink ? ac : '#fff'); }
    }
    for (let i = 0; i < OT.TARGETS.length; i++) {
      const T = OT.TARGETS[i]; q.save(); q.translate(T.x, T.y); q.rotate(T.a + Math.PI / 2); // +y now points at the centre
      if (st.up[i]) {
        q.fillStyle = COL.steelLo; q.fillRect(-C.T_HW, -C.T_HH - 1, C.T_HW * 2, C.T_HH + 1); q.fillStyle = COL.steel; q.fillRect(-C.T_HW, -C.T_HH - 1, C.T_HW * 2, 2);
        const solo = st.round && st.round.kind === 'solo' && st.round.tgt === i, pays = (multi && !st.jp[T.bank]) || (st.round && st.round.kind === 'rush');
        q.fillStyle = fx.tgt[i] > 0 && fx.tgtWait[i] === 0 ? '#fff' : solo ? (blink ? COL.lit : '#fff') : pays && blink ? COL.lit : COL.face; q.fillRect(-C.T_HW, 0, C.T_HW * 2, C.T_HH + 1); q.fillStyle = COL.faceHi; q.fillRect(-C.T_HW + 1, C.T_HH, C.T_HW * 2 - 2, 1);
        if (solo) { q.fillStyle = blink ? COL.lit : '#fff'; q.beginPath(); q.moveTo(0, 7); q.lineTo(-5, 14); q.lineTo(5, 14); q.closePath(); q.fill(); } // a chevron on the centre side, pointing at the one lit face
      } else {
        const back = st.bankT[T.bank] > 0 ? 1 - st.bankT[T.bank] / C.RESET : 0; // the slot fills as the bank winds back up
        q.fillStyle = COL.slot; q.fillRect(-C.T_HW, -1, C.T_HW * 2, 2); if (back > 0) { q.fillStyle = COL.face; q.fillRect(-C.T_HW, -1, Math.round(C.T_HW * 2 * back), 2); }
      }
      q.restore();
    }
    // the hub: dark when shut; lit, it wears a yellow ring and three chevrons pointing in. Two pips count the locks.
    const big = st.extraLit || st.superLit, hubOn = (st.hubLit && !multi) || big;
    if (hubOn && (blink || big)) for (let k = 0; k < 3; k++) chevron(q, 19, k * OT.TAU / 3 + OT.TAU / 12, -1, COL.lit);
    q.fillStyle = fx.hub > 0 ? '#fff' : big ? ((frame >> 2) & 1 ? '#fff' : COL.lit) : hubOn ? COL.lit : COL.spoke; q.beginPath(); q.arc(0, 0, big ? 9 : 8, 0, OT.TAU); q.fill();
    q.fillStyle = '#000'; q.beginPath(); q.arc(0, 0, 5, 0, OT.TAU); q.fill();
    for (let k = 0; k < 2; k++) { q.fillStyle = st.locks > k ? COL.lit : COL.lampOff; q.fillRect(k ? 9 : -11, -1, 2, 2); }
    // the multiplier ring: eight pink lights round the hub, one more for each bank finished with this ball (x2 ... x9); all out when the ball is lost
    for (let k = 0; k < C.MULT_MAX - 1; k++) {
      const a = -Math.PI / 2 + (k + 0.5) * OT.TAU / (C.MULT_MAX - 1), on = st.mult > k + 1, x = Math.cos(a) * 15, y = Math.sin(a) * 15;
      q.fillStyle = on ? (fx.mult > 0 && st.mult === k + 2 && (frame & 2) ? '#fff' : COL.face) : COL.slot; q.beginPath(); q.arc(x, y, on ? 2.2 : 1.4, 0, OT.TAU); q.fill();
    }
    q.restore();
  }

  // ---------- state ----------
  let st = Object.assign(OT.create(1), { skill: -1 }), mode = 'title', // the table behind the title asks for nothing: no skill-shot arrows before a game has begun
      frame = 0, modeT = 0, paused = false, freeze = 0, combo = 0, runSeed = (Date.now() & 0xffff) | 1;
  const DANGER_AT = 8; // landings left in the whole rim at which the music thins (a full rim holds 36)
  const OVER_T = 900; // frames the game-over screen is held (15 s)
  let attract = 'title', demo = null, demoBot = null, best = [20000, 15000, 10000, 5000, 2000], rank = -1;
  try { const b = JSON.parse(localStorage.getItem('overturn.best') || 'null'); if (Array.isArray(b) && b.length === 5) best = b.map(Number); } catch (e) { /* no storage: the table lasts for the visit */ }
  const fx = { seg: new Array(C.SEGS).fill(0), lamp: new Array(C.SEGS).fill(0), tgt: new Array(9).fill(0), tgtWait: new Array(9).fill(0), tgtRate: new Array(9).fill(1), shown: 0, obS: '', obT: 99, warnT: 0, parts: [], trail: [], fly: [], ghosts: [], wob: 0, sqN: [0, 1], lampT: 0, net: 0, mult: 0, shake: 0, hub: 0, zoom: 0, flash: 0, squash: 0, dflash: 0, show: null, award: null, log: [] };
  const pre = { segs: st.segs.slice(), lamps: st.lamps.slice(), speed: 0, dir: 0, notch: 0, held: [] }; // the rim and lamps before the step, so a repair can be drawn from where it came
  const keys = { l: false, r: false }; let touchDir = 0, pilot = null;
  // which words to show for the controls: follows the last kind of input used
  let touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); const fingers = new Map();
  const startLabel = () => (touch ? 'TAP TO START' : 'PUSH SPACE'), turnLabel = () => (touch ? 'HOLD LEFT OR RIGHT SIDE' : '< >  TURN THE TABLE');
  const view = () => (mode === 'title' && attract === 'demo' && demo ? demo : st);
  const sound = (name, rate, vol) => { if (mode === 'play') OTAudio.play(name, rate, vol); }; // the demo is silent

  function start() {
    st = OT.create(runSeed++); mode = 'play'; modeT = 0; combo = 0; rank = -1; paused = false; freeze = 0; resetFx(); show(2, [{ s: 'READY', dur: 60, eff: 'flash' }]);
    OTAudio.init(); OTAudio.play('start'); OTAudio.music('play');
  }
  function resetFx() { fx.parts.length = fx.trail.length = fx.fly.length = fx.ghosts.length = 0; fx.wob = 0; fx.seg.fill(0); fx.lamp.fill(0); fx.tgt.fill(0); fx.tgtWait.fill(0); fx.warnT = 0; fx.shake = fx.hub = fx.zoom = fx.flash = fx.dflash = fx.net = fx.mult = 0; fx.show = fx.award = null; }
  function button() { OTAudio.init(); if (mode === 'title' || (mode === 'over' && modeT > 60)) start(); }
  addEventListener('keydown', e => {
    touch = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = true; else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = true;
    else if (e.code === 'KeyP' && mode === 'play') { paused = !paused; return; } else if (e.code === 'KeyM') { OTAudio.toggleMute(); return; }
    else if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault(); if (!e.repeat) { if (paused) paused = false; else if (e.code === 'Space' || e.code === 'Enter') button(); }
  });
  addEventListener('keyup', e => { if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false; else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false; });
  // each finger (or the mouse button) turns the table while it is down; the newest one down wins, and lifting it hands back to one still held
  const lift = e => { fingers.delete(e.pointerId); let d = 0; for (const v of fingers.values()) d = v; touchDir = d; };
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') touch = true;
    const r = cv.getBoundingClientRect(), onTop = e.clientY < r.top + r.height * TOP / H;
    e.preventDefault();
    if (paused) { paused = false; return; }
    if (touch && mode === 'play' && onTop) { paused = true; return; } // a tap on the top display pauses, where there is no P key
    fingers.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1); touchDir = fingers.get(e.pointerId); button();
  });
  addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
  addEventListener('blur', () => { keys.l = keys.r = false; touchDir = 0; fingers.clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') { paused = true; keys.l = keys.r = false; touchDir = 0; fingers.clear(); } }); // put away mid-game: wait

  const toScreen = (s, x, y) => { const c = Math.cos(s.th), n = Math.sin(s.th); return [CX + c * x - n * y, CY + n * x + c * y]; };
  function burst(x, y, n, col, sp) { for (let i = 0; i < n && fx.parts.length < 160; i++) { const a = Math.random() * OT.TAU, v = sp * (0.4 + Math.random()); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.5, life: 14 + Math.random() * 14, col }); } }

  // every event of the rules gets its answer here: lights, sparks and sound on the table, words and figures on the dot display
  // (the table of events and answers is in VISUAL_DESIGN.md)
  function react(s, ev) {
    if (ev.type === 'rim') {
      fx.seg[ev.seg] = 6; combo = 0; fx.squash = 5; { const d = Math.hypot(ev.x, ev.y) || 1; fx.sqN = [ev.x / d, ev.y / d]; }
      const force = 0.82 + 0.4 * Math.min(1, pre.speed / 700); // a harder landing sounds higher and tighter
      buzz(ev.hp <= 0 ? 35 : 8);
      { // caught by the neighbouring section, at the very end of a hole: the escape gets its own small answer
        const c = Math.cos(s.th), n = Math.sin(s.th), own = OT.mod(Math.floor(Math.atan2(-n * ev.x + c * ev.y, c * ev.x + n * ev.y) / OT.SEG_A), C.SEGS);
        if (own !== ev.seg && s.segs[own] <= 0) { sound('edge'); burst(CX + ev.x * 1.03, CY + ev.y * 1.03, 9, '#fff', 1.7); }
      }
      if (Math.abs(ev.throw) > 30) { // the table was turning: the ball is thrown along the rim, and it shows
        const d = Math.hypot(ev.x, ev.y) || 1, sgn = ev.throw > 0 ? 1 : -1, tx = -ev.y / d * sgn, ty = ev.x / d * sgn, k = Math.min(1, Math.abs(ev.throw) / 92);
        for (let j = 0; j < 7 && fx.parts.length < 160; j++) fx.parts.push({ x: CX + ev.x * 0.98, y: CY + ev.y * 0.98, vx: tx * (1.2 + j * 0.45) * k - ev.x / d * 0.4, vy: ty * (1.2 + j * 0.45) * k - ev.y / d * 0.4 - 0.3, life: 10 + j * 2, col: j & 1 ? '#fff' : COL.rim[3] });
        sound('throw', 0.9 + 0.3 * k, 0.4 + 0.6 * k);
      }
      if (ev.lamp) { fx.lamp[ev.seg] = 12; fx.lampT = 24; } // a lamp lit: one more landing the next bank will put back
      if (ev.hp <= 0) { sound('rim:break'); burst(CX + ev.x * 1.05, CY + ev.y * 1.05, 14, COL.rim[1], 2.2); fx.shake = 5; }
      else { sound('rim:' + (ev.hp + 1), force); burst(CX + ev.x * 1.04, CY + ev.y * 1.04, 3, COL.rim[ev.hp + 1], 1); }
      if (ev.chase) { sound('skill'); burst(CX + ev.x * 0.95, CY + ev.y * 0.95, 10, COL.lit, 1.8); show(1, [{ n: ev.chase, dur: 40 }]); }
      if (ev.round) { sound('round'); fx.flash = 6; fx.dflash = 24; show(2, [{ s: ev.round.toUpperCase(), dur: 90, eff: 'flash' }]); }
      if (ev.skill) { sound('skill'); if (ev.save) fx.net = 30; burst(CX + ev.x * 0.95, CY + ev.y * 0.95, 12, COL.net, 1.8); show(2, [{ s: 'SKILLSHOT', dur: 40, eff: 'wipe' }, { n: ev.skill, dur: 35 }, { s: ev.letters ? 'ROTATE +' + ev.letters : '+SAVE', dur: 55, eff: 'flash' }]); }
    } else if (ev.type === 'back') {
      sound('back'); const T = OT.TARGETS[ev.i], p = toScreen(s, T.x, T.y); burst(p[0], p[1], 2, COL.steel, 0.8);
      if (ev.side) { // deflected: steel sparks run along the bank the way the ball is sent
        const c = Math.cos(s.th), n = Math.sin(s.th), qx = (c * T.et[0] - n * T.et[1]) * ev.side, qy = (n * T.et[0] + c * T.et[1]) * ev.side;
        for (let j = 0; j < 5 && fx.parts.length < 160; j++) fx.parts.push({ x: p[0], y: p[1], vx: qx * (1 + j * 0.5), vy: qy * (1 + j * 0.5) - 0.2, life: 8 + j * 2, col: j & 1 ? '#fff' : COL.steel });
      }
    }
    else if (ev.type === 'target') {
      const T = OT.TARGETS[ev.i], p = toScreen(s, T.x, T.y); sound('target:' + Math.min(combo++, OTAudio.PENTA.length - 1)); burst(p[0], p[1], ev.solo ? 16 : 8, ev.solo ? COL.lit : COL.face, 1.6);
      fx.award = { s: '+' + ev.pts, t: 50 };
      if (ev.solo) { sound('skill'); if (ev.solo >= C.SOLO_HITS) { fx.net = 30; show(2, [{ s: 'SOLO', dur: 30, eff: 'wipe' }, { n: ev.pts, dur: 35 }, { s: '+SAVE', dur: 45, eff: 'flash' }]); } else show(1, [{ s: 'SOLO ' + ev.solo, dur: 30, eff: 'wipe' }, { n: ev.pts, dur: 35 }]); }
    } else if (ev.type === 'bank') {
      freeze = ev.jackpot ? 8 : 5; fx.mult = 40;
      const from = [], to = []; for (let i = 0; i < C.SEGS; i++) { if (pre.lamps[i]) from.push(i); for (let k = pre.segs[i] < 0 ? 99 : Math.max(0, pre.segs[i]); k < s.segs[i]; k++) to.push(i); }
      to.forEach((seg, j) => fx.fly.push({ a0: (from[j % Math.max(1, from.length)] + 0.5) * OT.SEG_A, a1: (seg + 0.5) * OT.SEG_A, seg, t: -j * 3 }));
      if (ev.jackpot) { sound('jackpot'); fx.flash = 10; fx.dflash = 30; show(3, [{ s: 'JACKPOT', dur: 55, eff: 'flash' }, { n: ev.pts, dur: 60 }]); }
      else if (ev.rush) { sound('jackpot'); show(2, [{ s: 'RUSH', dur: 35, eff: 'flash' }, { n: ev.pts, dur: 50 }]); }
      else { sound('bank'); show(2, [{ s: 'RIM +' + ev.gain, dur: 45, eff: 'wipe' }, { n: ev.pts, dur: 45 }]); }
    } else if (ev.type === 'void') {
      sound('void'); fx.shake = 10; fx.dflash = 20; const a = s.th + (ev.seg + 0.5) * OT.SEG_A; burst(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100, 22, COL.scar, 2.6); burst(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100, 8, '#fff', 2);
      show(3, [{ s: 'TORN OUT', dur: 110, eff: 'shake' }]);
    } else if (ev.type === 'reset') { for (let j = 0; j < 3; j++) { const i = ev.bank * 3 + j; fx.tgt[i] = 8; fx.tgtWait[i] = 1 + j * 7; fx.tgtRate[i] = 1 + j * 0.12; } } // each target answers in turn: flash and a click, a step higher
    else if (ev.type === 'launch') sound('launch');
    else if (ev.type === 'ready') { sound('ready'); show(2, [{ s: 'ROUND', dur: 30, eff: 'wipe' }, { s: 'READY', dur: 60, eff: 'flash' }]); }
    else if (ev.type === 'roundEnd') { sound('roundEnd'); show(1, [{ s: 'TIME UP', dur: 60, eff: 'wipe' }]); }
    else if (ev.type === 'lock') { sound('lock'); fx.hub = 20; fx.zoom = 24; show(2, [{ s: 'LOCK ' + ev.n, dur: 70, eff: 'wipe' }]); }
    else if (ev.type === 'multiball') { sound('multiball'); fx.hub = 30; fx.zoom = 40; fx.flash = 12; fx.dflash = 40; show(3, [{ s: 'MULTIBALL', dur: 130, eff: 'scroll' }]); if (mode === 'play') OTAudio.music('multi'); }
    else if (ev.type === 'drain') { buzz(40); sound('drain'); fall(ev); burst(CX + ev.x, CY + ev.y, 6, COL.ballLo, 1.5); show(1, [{ s: '1 BALL', dur: 60, eff: 'wipe' }]); if (mode === 'play') OTAudio.music('play'); }
    else if (ev.type === 'saved') { sound('saved'); fall(ev); fx.hub = 24; fx.flash = 6; fx.net = 40; burst(CX + ev.x * 0.92, CY + ev.y * 0.92, 12, COL.net, 2); show(2, [{ s: 'SAVED', dur: 80, eff: 'flash' }]); }
    else if (ev.type === 'superLit') { sound('ready'); fx.hub = 30; fx.dflash = 30; show(3, [{ s: 'SUPER', dur: 40, eff: 'wipe' }, { s: 'IS LIT', dur: 70, eff: 'flash' }]); }
    else if (ev.type === 'super') { sound('super'); freeze = 10; fx.hub = 40; fx.zoom = 40; fx.flash = 16; fx.dflash = 50; fx.shake = 6; for (let k = 0; k < 12; k++) burst(CX + Math.cos(k * 0.52) * 40, CY + Math.sin(k * 0.52) * 40, 5, COL.lit, 2.4); show(4, [{ s: 'SUPER', dur: 45, eff: 'flash' }, { s: 'JACKPOT', dur: 55, eff: 'flash' }, { n: ev.pts, dur: 80 }]); }
    else if (ev.type === 'extraLit') { sound('ready'); fx.hub = 30; fx.dflash = 30; show(3, [{ s: 'EXTRA BALL', dur: 70, eff: 'scroll' }, { s: 'IS LIT', dur: 70, eff: 'flash' }]); }
    else if (ev.type === 'extend') { sound('extend'); fx.hub = 30; fx.zoom = 30; fx.flash = 8; fx.dflash = 30; show(3, [{ s: 'EXTRA', dur: 35, eff: 'wipe' }, { s: 'BALL', dur: 60, eff: 'flash' }]); }
    else if (ev.type === 'lost') {
      buzz(90); sound('lost'); fx.shake = 8; freeze = 9; fall(ev); burst(CX + ev.x, CY + ev.y, 10, '#fff', 2); /* the moment holds, and the ball is seen going */ if (mode === 'play') OTAudio.music(null);
      fx.show = null; show(3, [{ s: 'BONUS', dur: 30, eff: 'wipe' }, { s: ev.counted + 'X' + 100 * ev.mult, dur: 40, eff: 'wipe' }, { n: ev.bonus, dur: 70, tick: true }]); // the bonus is counted on the display, a tick a step
    } else if (ev.type === 'patch') { for (let i = 0; i < C.SEGS; i++) if (s.segs[i] > pre.segs[i] && pre.segs[i] >= 0) fx.seg[i] = 16; /* the sections built back up for the new ball flash */ if (s.save) fx.net = 40; if (mode === 'play') { OTAudio.music('play'); show(2, s.save ? [{ s: 'READY', dur: 50, eff: 'flash' }, { s: 'SAVE ON', dur: 60, eff: 'wipe' }] : [{ s: 'READY', dur: 60, eff: 'flash' }]); } }
    else if (ev.type === 'over' && mode === 'play') {
      mode = 'over'; modeT = 0; OTAudio.play('over'); OTAudio.music(null); fx.show = null;
      rank = best.findIndex(v => s.score > v); if (rank >= 0) { best.splice(rank, 0, s.score); best.length = 5; try { localStorage.setItem('overturn.best', JSON.stringify(best)); } catch (e) { /* see above */ } }
    }
  }

  // a ball that has left the table keeps falling on screen for a moment: drawing only, the rules have already let it go
  function fall(ev) { const d = Math.hypot(ev.x, ev.y) || 1; fx.ghosts.push({ x: ev.x, y: ev.y, vx: ev.x / d * 1.6, vy: ev.y / d * 1.6 + 0.6, t: 0 }); }

  // a phone answers in the hand too: short for a landing, longer for a section breaking or a ball going
  function buzz(ms) { if (touch && mode === 'play' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* not allowed here: do without */ } } }

  function tick() {
    frame++; modeT++;
    for (let i = 0; i < C.SEGS; i++) { if (fx.seg[i] > 0) fx.seg[i]--; if (fx.lamp[i] > 0) fx.lamp[i]--; }
    for (let i = 0; i < 9; i++) { if (fx.tgtWait[i] > 0) { if (--fx.tgtWait[i] === 0) sound('reset', fx.tgtRate[i]); } else if (fx.tgt[i] > 0) fx.tgt[i]--; }
    { const sv = view().score; if (fx.shown > sv) fx.shown = sv; else if (fx.shown < sv) fx.shown = Math.min(sv, fx.shown + Math.max(10, Math.ceil((sv - fx.shown) / 80) * 10)); } // the score rolls up to its value
    fx.obT++;
    for (const k of ['shake', 'hub', 'zoom', 'flash', 'squash', 'dflash', 'net', 'mult']) if (fx[k] > 0) fx[k]--;
    if (fx.award && --fx.award.t <= 0) fx.award = null;
    if (fx.show && fx.show.i < fx.show.stages.length) { const g0 = fx.show.stages[fx.show.i]; if (g0.tick && mode === 'play' && fx.show.t < g0.dur * 0.6 && fx.show.t % 4 === 0) OTAudio.play('count'); if (++fx.show.t >= g0.dur) { fx.show.i++; fx.show.t = 0; } }
    for (const p of fx.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; } fx.parts = fx.parts.filter(p => p.life > 0);
    if (fx.lampT > 0) fx.lampT--;
    for (const q of fx.ghosts) { const slow = freeze > 0 ? 0.35 : 1; q.x += q.vx * slow; q.y += q.vy * slow; q.vy += 0.16 * slow; q.t++; } fx.ghosts = fx.ghosts.filter(q => q.t < 70);
    fx.wob *= -0.55; if (Math.abs(fx.wob) < 0.0015) fx.wob = 0; // the brake's small overshoot, dying away
    for (const f of fx.fly) if (++f.t === 22) fx.seg[f.seg] = 10; fx.fly = fx.fly.filter(f => f.t < 22);
    if (mode === 'title') {
      // attract loop: title, how to play, a game playing itself, the best five
      const T = [['title', 420], ['rules', 900], ['demo', 1500], ['best', 360]]; let k = T.findIndex(a => a[0] === attract);
      if (modeT > T[k][1]) { modeT = 0; k = (k + 1) % T.length; attract = T[k][0]; resetFx(); if (attract === 'demo') { demo = OT.create(4 + (frame % 7)); demoBot = OTBots.policies.novice(frame); } }
      if (attract === 'demo' && demo) { pre.segs = demo.segs.slice(); pre.lamps = demo.lamps.slice(); OT.step(demo, demoBot(demo)); for (const ev of demo.events) react(demo, ev); if (demo.over) modeT = 1e9; }
      else if (attract === 'title') st.th += 0.006;
      return;
    }
    if (mode === 'over' && modeT > OVER_T) { mode = 'title'; attract = 'title'; modeT = 0; rank = -1; resetFx(); Object.assign(st, { ready: -1, skill: -1, hubLit: 0, extraLit: 0, superLit: 0, round: null, multi: 0 }); } // and the finished table stops asking for anything: its arrows and lit hub go out // left alone, the game-over screen gives way to the attract loop
    if (mode !== 'play') { OTAudio.danger(false); return; }
    if (freeze > 0) { freeze--; return; }
    const dir = pilot ? (pilot(st).dir || 0) : (keys.r ? 1 : 0) - (keys.l ? 1 : 0) || touchDir;
    pre.segs = st.segs.slice(); pre.lamps = st.lamps.slice(); pre.speed = st.bs.reduce((m, b) => Math.max(m, b.held > 0 ? 0 : Math.hypot(b.vx, b.vy)), 0); pre.held = st.bs.map(b => b.held);
    OT.step(st, { dir }); for (const ev of st.events) react(st, ev);
    // the table's own voice: a ratchet tick for every third of a section it turns, a stronger one as a section boundary goes by,
    // then a click and a slight overshoot when it is let go
    const notch = Math.floor(st.th / (OT.SEG_A / 3)); if (notch !== pre.notch) { const edge = OT.mod(notch, 3) === 0; sound('ratchet', edge ? 0.8 : 1, edge ? OTAudio.RATCHET.section : OTAudio.RATCHET.vol); pre.notch = notch; }
    if (pre.dir && !dir) { sound('turn:stop'); fx.wob = pre.dir * 0.012; } pre.dir = dir;
    { let left = 0; for (const h of st.segs) if (h > 0) left += h; const low = left <= DANGER_AT && st.phase === 'play'; OTAudio.danger(low); if (low && --fx.warnT <= 0) { sound('warn'); fx.warnT = 150; } if (!low) fx.warnT = 0; } // little rim left: the music thins and a warning repeats
    st.bs.forEach((b, n) => { const was = pre.held[n] || 0; for (const at of [60, 30]) if (was > at && b.held <= at && b.held > 0) sound('tick', at === 60 ? 1 : 1.26); }); // the hub counts the ball out
    fx.trail.push(st.bs.map(b => [b.x, b.y])); if (fx.trail.length > 3) fx.trail.shift();
  }

  // what the table is asking for right now, in the display's eighteen characters
  function objective(s) {
    if (s.phase === 'lost') return null;
    if (s.skill >= 0 && !(s.ready >= 0 && (frame / 90 | 0) % 2)) return s.save ? 'CYAN ARROW: ROTATE' : 'CYAN ARROW: +SAVE'; // the skill shot, said as what to do and what it gives; with a round waiting too, the two take turns
    if (s.round) return { solo: 'HIT THE LIT FACE', chase: 'LAND ON THE LIGHT', rush: 'FINISH A BANK NOW' }[s.round.kind];
    if (s.extraLit) return 'HUB: EXTRA BALL';
    if (s.superLit) return 'HUB: SUPER JACKPOT';
    if (s.multi) return 'JACKPOT: LIT BANKS';
    if (s.ready >= 0) return 'YELLOW ARROW:ROUND';
    if (s.hubLit) return s.locks ? 'HUB LIT: MULTIBALL' : 'HUB LIT: LOCK IT';
    return 'DROP PINK FACES';
  }

  // ---------- the dot display: two panels of 112 x 16 dots, four levels, as on a pinball backbox ----------
  const DW = 112, DH = 16, dTop = new Uint8Array(DW * DH), dBot = new Uint8Array(DW * DH);
  function dtext(d, str, x, y, lv) {
    str = String(str).toUpperCase();
    for (let c = 0; c < str.length; c++) { const gl = FONT[str[c]]; if (gl) for (let i = 0; i < 35; i++) if (gl[i] === '#') { const px = x + c * 6 + i % 5, py = y + ((i / 5) | 0); if (px >= 0 && px < DW && py >= 0 && py < DH) d[py * DW + px] = lv; } }
  }
  const dcentre = (d, str, y, lv) => dtext(d, str, Math.round((DW - String(str).length * 6 + 1) / 2), y, lv);
  function dblit(d, y0, invert) {
    g.fillStyle = COL.dmdBg; g.fillRect(0, y0, W, 32);
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) { let v = d[j * DW + i]; if (invert) v = v ? 0 : 2; g.fillStyle = COL.dmdLo[v]; g.fillRect(i * 2, y0 + j * 2, 2, 2); g.fillStyle = COL.dmd[v]; g.fillRect(i * 2, y0 + j * 2, 1, 1); }
  }
  // a show on the lower panel: stages of big lettering ({ s, eff }) or a figure counting up ({ n }); a stronger show replaces a weaker one
  function show(pri, stages) {
    fx.log.push(stages.map(g => g.s || g.n).join('|')); if (fx.log.length > 12) fx.log.shift(); // what the display was asked to show, kept for the tests
    if (fx.show && fx.show.pri > pri && fx.show.i < fx.show.stages.length) return; fx.show = { pri, stages, i: 0, t: 0 };
  }
  function dbig(d, str, x, y, lv) {
    str = String(str).toUpperCase();
    for (let c = 0; c < str.length; c++) { const gl = FONT[str[c]]; if (gl) for (let i = 0; i < 35; i++) if (gl[i] === '#') for (let k = 0; k < 4; k++) { const px = x + c * 12 + (i % 5) * 2 + (k & 1), py = y + ((i / 5) | 0) * 2 + (k >> 1); if (px >= 0 && px < DW && py >= 0 && py < DH) d[py * DW + px] = lv; } }
  }
  const bigX = str => Math.round((DW - String(str).length * 12 + 2) / 2);
  function drawDisplay(s) {
    dTop.fill(0); dBot.fill(0); const blink = (frame >> 3) & 1;
    // top panel: score and balls in hand; under them, what the table is asking for
    const title = mode === 'title' && attract !== 'demo'; // between games: the panels show the game's name and the best score, nothing left over from the last game
    dtext(dTop, fx.shown, 1, 0, 3); if (!title) dtext(dTop, 'BALL ' + s.balls, DW - 36, 0, 2);
    if (title) dcentre(dTop, 'HI ' + best[0], 9, 2);
    else if (mode !== 'over') {
      const ob = objective(s) || ''; if (ob !== fx.obS) { fx.obS = ob; fx.obT = 0; } // a new sentence is drawn in from the left, bright at first, so the change is seen
      if (ob) { dcentre(dTop, ob, 9, fx.obT < 30 ? 3 : 2); const w = fx.obT * 8; if (w < DW) for (let j = 9; j < DH; j++) for (let i = w; i < DW; i++) dTop[j * DW + i] = 0; }
    }
    // bottom panel: the show. A big event takes all sixteen rows; between events, the word or the round in play, and the last award
    let inv = false; const sh = fx.show && fx.show.i < fx.show.stages.length ? fx.show : null;
    if (title) dbig(dBot, 'OVERTURN', bigX('OVERTURN'), 1, 2);
    else if (mode === 'over') dbig(dBot, 'GAME OVER', bigX('GAME OVER'), 1, blink ? 3 : 2);
    else if (sh) {
      const g0 = sh.stages[sh.i], t = sh.t;
      if (g0.n !== undefined) { const v = Math.round(g0.n * Math.min(1, t / (g0.dur * 0.6)) / 10) * 10; dbig(dBot, v, bigX(v), 1, 3); } // a figure counts up, then holds
      else {
        const x0 = bigX(g0.s), x = g0.eff === 'scroll' ? Math.max(x0, DW - t * 5) : g0.eff === 'shake' && t < 40 ? x0 + ((t >> 1) & 1 ? 1 : -1) : x0;
        dbig(dBot, g0.s, x, 1, 3);
        if (g0.eff === 'wipe') { const w = Math.min(DW, t * 9); for (let j = 0; j < DH; j++) for (let i = w; i < DW; i++) dBot[j * DW + i] = 0; } // drawn in from the left
        inv = g0.eff === 'flash' && t < 24 && (t & 4) > 0;
      }
    } else {
      if (s.round) {
        const r = s.round, left = Math.ceil(r.t / 60);
        dtext(dBot, r.kind === 'solo' ? 'SOLO ' + r.n + ' OF ' + C.SOLO_HITS : r.kind === 'chase' ? 'CHASE ' + (r.n + 1) * C.PTS.chase * s.mult : 'RUSH ' + OT.rushValue(s), 1, 0, 3);
        dtext(dBot, (left < 10 ? '0' : '') + left, DW - 12, 0, left <= 5 && blink ? 1 : 3);
      } else if (s.ready >= 0) dcentre(dBot, 'ROUND READY', 0, blink ? 3 : 1);
      else { for (let k = 0; k < C.WORD.length; k++) dtext(dBot, C.WORD[k], 1 + k * 6, 0, k < s.spell ? 3 : 1); dtext(dBot, '= ROUND', 49, 0, 1); }
      dtext(dBot, 'X' + s.mult, 1, 9, fx.mult > 0 ? 3 : 1); dtext(dBot, 'RIM+' + OT.repairNow(s), 19, 9, fx.lampT > 0 ? 3 : 1); // the two figures the table shows as lights, for reference
      if (fx.award) { const a = fx.award.s; dtext(dBot, a, DW - a.length * 6, 9, fx.award.t > 30 ? 3 : 2); } // the last face's value
    }
    dblit(dTop, 0, fx.dflash > 0 && (frame & 4)); dblit(dBot, BOT, inv);
  }

  function drawBall(x, y, sq) {
    const bx = Math.round(x), by = Math.round(y);
    g.fillStyle = COL.ballLo;
    if (sq === 1) { g.fillRect(bx - 5, by - 3, 11, 7); g.fillStyle = COL.ball; g.fillRect(bx - 4, by - 2, 7, 4); return; } // flattened against a floor or ceiling for a moment
    if (sq === 2) { g.fillRect(bx - 3, by - 5, 7, 11); g.fillStyle = COL.ball; g.fillRect(bx - 2, by - 4, 4, 7); return; } // or against a side wall
    g.fillRect(bx - 2, by - 4, 5, 9); g.fillRect(bx - 4, by - 2, 9, 5); g.fillRect(bx - 3, by - 3, 7, 7);
    g.fillStyle = COL.ball; g.fillRect(bx - 2, by - 3, 4, 5); g.fillRect(bx - 3, by - 2, 5, 3);
  }
  const RULES = [[
    ['THE RIM RETURNS THE BALL.', COL.rim[3]], ['EACH SECTION TAKES 3 LANDINGS:', COL.text], ['', null],
    ['A LANDING LIGHTS THE SECTION LAMP:', COL.lamp], ['EACH LAMP: +1 RIM AT THE NEXT BANK.', COL.lamp], ['TURNING AS IT LANDS THROWS THE BALL.', COL.text], ['', null],
    ['PINK FACES DROP. STEEL BACKS DO NOT:', COL.face], ['A BACK KNOCKS THE BALL ASIDE.', COL.steel], ['3 DOWN: LAMPS REPAIR RIM. BONUS X UP', COL.faceHi], ['PINK RING AT THE HUB: X ALL SCORES.', COL.face],
    ['EVERY 4TH BANK TEARS OUT A SECTION.', COL.rim[1]], ['A NEW BALL: WEAK SECTIONS BACK TO 2.', COL.rim[2]], ['', null],
    ['ARROWS POINT AT WHAT IS LIT.', COL.lit], ['THE DISPLAY SAYS WHAT IT WANTS', COL.lit], ['AND COUNTS WHAT YOU WIN.', COL.lit],
  ], [
    ['SKILLSHOT: FIRST LANDING OF A BALL', COL.text], ['ON THE CYAN ARROWS GIVES ONE SAVE.', COL.net], ['WITH A SAVE ALREADY LIT: 2 LETTERS', COL.faceHi], ['OF ROTATE INSTEAD.', COL.faceHi], ['', null],
    ['SAVE: THE LIT RING ROUND THE RIM', COL.net], ['CATCHES THE NEXT BALL TO FALL OUT.', COL.net], ['BALLS 2 AND 3 START WITH IT LIT.', COL.net], ['', null],
    ['A BANK LIGHTS THE HUB. STRAIGHT UP', COL.lit], ['THE MIDDLE LOCKS. 2 LOCKS: MULTIBALL', COL.lit], ['MULTIBALL: EACH BANK A JACKPOT ONCE', COL.lit], ['ALL 3: SUPER JACKPOT AT THE HUB.', COL.lit],
  ], [
    ['6 FACES SPELL ROTATE. THEN LAND ON', COL.faceHi], ['THE YELLOW ARROWS FOR A ROUND:', COL.lit], ['', null],
    ['SOLO   HIT THE ONE LIT FACE. 3: SAVE', COL.text], ['CHASE  LAND ON THE RUNNING LIGHT', COL.text], ['RUSH   FINISH A BANK FOR THE VALUE', COL.text], ['', null],
    ['A ROUND ALSO ENDS ON ITS CLOCK OR', COL.dim], ['WITH THE BALL. IT COUNTS AS PLAYED.', COL.dim], ['', null],
    ['ALL 3 PLAYED: HUB LIGHTS EXTRA BALL.', COL.lit], ['STRAIGHT UP THE MIDDLE TAKES IT.', COL.lit], ['TWICE IN A GAME AT MOST.', COL.dim],
  ]];
  function drawRules(s, live) {
    const page = (modeT / 300 | 0) % RULES.length;
    g.fillStyle = 'rgba(0,0,8,0.86)'; g.fillRect(0, TOP, W, BOT - TOP);
    textC('HOW TO PLAY  ' + (page + 1) + ' OF ' + RULES.length, CX, TOP + 6, COL.text); textC(turnLabel(), CX, TOP + 20, COL.dim);
    let y = TOP + 36; for (const [l, c] of RULES[page]) { if (l) text(l, 4, y, c); y += l ? 10 : 5; if (l && l.indexOf('3 LANDINGS') > 0) for (let k = 0; k < 3; k++) { g.fillStyle = COL.rim[3 - k]; g.fillRect(186 + k * 12, y - 8, 10, 4); } }
    if (live) { text('BONUS X' + s.mult + '  NEXT REPAIR +' + OT.repairNow(s), 4, BOT - 36, COL.text); text('LOCKS ' + s.locks + '  SAVE ' + (s.save ? 'YES' : 'NO') + '  BANKS ' + s.level, 4, BOT - 26, COL.text); }
  }

  // the best five. After a game: this game's row flashes with an arrow if it made the table; if not, the score is shown under the table
  function drawBest(mine, score) {
    g.fillStyle = 'rgba(0,0,8,0.86)'; g.fillRect(0, TOP, W, BOT - TOP); textC('BEST FIVE', CX, 62, COL.lit);
    best.forEach((v, i) => {
      const y = 86 + i * 16, me = i === mine, col = me ? ((frame >> 3) & 1 ? '#fff' : COL.lit) : COL.text;
      text((i + 1) + '.', 58, y, me ? col : COL.dim); textR(v, 150, y, col); if (me) text('< YOU', 158, y, col);
    });
    if (mode !== 'over') return;
    if (mine >= 0) textC(mine === 0 ? 'NEW BEST SCORE' : 'YOU ARE NO.' + (mine + 1), CX, 180, COL.lit);
    else { textC('YOUR SCORE', CX, 176, COL.dim); textC(score, CX, 190, COL.text, 2); textC((best[4] - score) + ' SHORT OF NO.5', CX, 212, COL.dim); }
  }

  function draw() {
    const s = view(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const sx = fx.shake > 0 ? ((frame & 1) ? 1 : -1) * Math.ceil(fx.shake / 4) : 0;
    const z = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, fx.zoom / 40)); // the zoom half of rotate-and-zoom: a short push in on a lock
    g.save(); g.beginPath(); g.rect(0, TOP, W, BOT - TOP); g.clip(); g.imageSmoothingEnabled = false;
    g.save(); g.translate(CX + sx, CY); g.rotate(s.th + fx.wob); g.scale(z, z); g.drawImage(ground, -192, -192); g.restore();
    // a ball that has left the table falls away behind it: drawn over the ground and under the table, smaller and darker as it goes,
    // so it can never be seen crossing the playfield again
    for (const q of fx.ghosts) { const x = Math.round(CX + q.x * z + sx), y = Math.round(CY + q.y * z), r = q.t < 10 ? 4 : q.t < 25 ? 3 : 2; g.fillStyle = q.t < 10 ? COL.ballLo : '#5a648c'; g.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1); g.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1); }
    g.translate(CX + sx, CY); g.rotate(s.th + fx.wob); g.scale(z, z); drawTable(s); g.drawImage(table, -112, -112); g.restore();
    if (fx.flash > 0 && (frame & 1)) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, TOP, W, BOT - TOP); }
    // the balls are the only things that keep the screen's own up and down
    if (mode !== 'title' || attract === 'demo') {
      for (let k = 0; k < fx.trail.length - 1; k++) for (const p of fx.trail[k]) { g.fillStyle = k ? '#5a648c' : '#333a5c'; g.fillRect(Math.round(CX + p[0] * z) - 2, Math.round(CY + p[1] * z) - 2, 4, 4); }
      s.bs.forEach((b, n) => { if (b.held > 0 && !((frame >> 2) & 1)) return; drawBall(CX + b.x * z + sx, CY + b.y * z, n === 0 && fx.squash > 2 && b.held <= 0 ? (Math.abs(fx.sqN[1]) >= Math.abs(fx.sqN[0]) ? 1 : 2) : 0); });
      // a ball held in the hub: a white arc round it runs down to the moment it is fired
      for (const b of s.bs) if (b.held > 0) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(CX + sx, CY, 12 * z, -Math.PI / 2, -Math.PI / 2 + OT.TAU * Math.min(1, b.held / C.HOLD)); g.stroke(); }
    }
    for (const f of fx.fly) if (f.t >= 0) { // a spent lamp crossing the table to the section it rebuilds
      for (let k = 0; k < 3; k++) { const u = Math.max(0, (f.t - k * 2) / 22), d = OT.mod(f.a1 - f.a0 + Math.PI, OT.TAU) - Math.PI, a = s.th + f.a0 + d * u, r = (C.R - 8) + 10 * u - 34 * Math.sin(Math.PI * u); g.fillStyle = k ? COL.dmd[2] : COL.lamp; g.fillRect(Math.round(CX + Math.cos(a) * r * z) - (k ? 1 : 2), Math.round(CY + Math.sin(a) * r * z) - (k ? 1 : 2), k ? 2 : 4, k ? 2 : 4); }
    }
    for (const p of fx.parts) { g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, p.life > 8 ? 2 : 1, p.life > 8 ? 2 : 1); }
    drawDisplay(s);
    if (mode === 'title') {
      if (attract === 'title') { shadowC('OVERTURN', CX, 84, COL.rim[3], 3); shadowC('FLIPPERLESS PINBALL', CX, 114, COL.text); shadowC(turnLabel(), CX, 176, COL.text); if (touch) shadowC('TAP TOP DISPLAY: PAUSE', CX, 190, COL.text); else shadowC('P: PAUSE   M: MUTE', CX, 190, COL.text); }
      else if (attract === 'rules') drawRules(s, false);
      else if (attract === 'demo') shadowC('DEMO', CX, TOP + 4, COL.dim);
      else drawBest(-1, 0);
      if ((frame >> 5) & 1) shadowC(startLabel(), CX, 244, COL.rim[2]);
    } else if (mode === 'over') {
      drawBest(rank, st.score); if (modeT > 60 && (frame >> 5) & 1) shadowC(startLabel(), CX, 244, COL.rim[2]);
    } else if (paused) { drawRules(s, true); textC(touch ? 'PAUSED - TAP TO GO ON' : 'PAUSED - P TO GO ON', CX, BOT - 12, COL.rim[2]); }
  }

  let last = performance.now(), acc = 0;
  function loop(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= 1000 / 60) { acc -= 1000 / 60; if (!paused) tick(); }
    draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.__game = {
    get state() { return st; }, set state(v) { st = v; }, get mode() { return mode; }, get attract() { return attract; }, get paused() { return paused; }, get freeze() { return freeze; },
    get pilot() { return pilot; }, set pilot(f) { pilot = f; }, get demo() { return demo; }, setModeT(v) { modeT = v; }, setRank(v) { rank = v; },
    // tests only: put one ball into play in a known state, whatever the game was doing (a lost-ball pause, a ball already past the rim, a frame stop)
    place(props) { st.phase = 'play'; st.phaseT = 0; st.over = false; if (st.balls < 1) st.balls = 1; freeze = 0; st.bs = [Object.assign({ x: 0, y: 0, vx: 0, vy: 0, out: 0, held: 0, side: 0, arm: 1 }, props)]; return st.bs[0]; }, get best() { return best; },
    fx, tick, button, keys, DANGER_AT, startLabel, turnLabel, get touch() { return touch; }, audio: OTAudio, BUILD, objective, COL,
  };
})();
