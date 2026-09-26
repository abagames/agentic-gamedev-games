// WRECKFALL browser shell: rendering, input, attract loop, effects.
(function () {
  "use strict";
  const { W, H, DT, CFG } = WF;
  const A = WFAudio;
  const cv = document.getElementById("screen");
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;

  // ---- palette -------------------------------------------------------------------------
  const COL = {
    lane: ["#ff4fd8", "#3fe0ff", "#ffe23f", "#7dff4f"],
    hulk: "#a9b3c4",
    hulkDark: "#5b6475",
    plate: "#ff8a1f",
    player: "#44ff66",
    white: "#ffffff",
    bomb: "#ff3030",
    ground: "#2a5cff",
    text: "#ffffff",
    dim: "#7f8aa3",
    danger: "#ff2a2a",
  };

  // ---- sprites -------------------------------------------------------------------------
  const SPR = {
    esc0: [
      ["....XXXX....", "..XXXXXXXX..", ".XX.XXXX.XX.", "XXXXXXXXXXXX", "..XX.XX.XX..", ".XX......XX.", "XX........XX", "............"],
      ["....XXXX....", "..XXXXXXXX..", ".XX.XXXX.XX.", "XXXXXXXXXXXX", "..XX.XX.XX..", "..XX....XX..", "...XX..XX...", "............"],
    ],
    esc1: [
      ["X....XX....X", "X...XXXX...X", "XX.XX..XX.XX", "XXXXXXXXXXXX", ".XXXXXXXXXX.", "...X....X...", "..X......X..", "............"],
      ["....XXXX....", "X..XX..XX..X", "XXXXXXXXXXXX", "XXXXXXXXXXXX", ".X.XXXXXX.X.", "..X......X..", "...X....X...", "............"],
    ],
    // yellow: a diamond gyro core; the rotor blades turn between frames
    esc2: [
      [".....XX.....", "....XXXX....", "XX.XX..XX.XX", "XXXX.XX.XXXX", "XX.XX..XX.XX", "....XXXX....", ".....XX.....", "............"],
      [".....XX.....", "X...XXXX...X", ".X.XX..XX.X.", "..XX.XX.XX..", ".X.XX..XX.X.", "X...XXXX...X", ".....XX.....", "............"],
    ],
    // green: a delta sled, point down; wing tips and exhaust flicker
    esc3: [
      ["XXXXXXXXXXXX", ".X.XXXXXX.X.", "..XXX..XXX..", "...XXXXXX...", "....XXXX....", ".....XX.....", "............", "............"],
      ["XXXXXXXXXXXX", "X..XXXXXX..X", "..XXX..XXX..", "...XXXXXX...", "....XXXX....", "....X..X....", "............", "............"],
    ],
    hulk: [
      ["..HHHHHHHH..", ".HDHHHHHHDH.", "HHHHHHHHHHHH", "HDHDDHHDDHDH", "HHHHHHHHHHHH", ".PPPPPPPPPP.", "PPPPPPPPPPPP", "P.P.P.P.P.P."],
      ["..HHHHHHHH..", ".HDHHHHHHDH.", "HHHHHHHHHHHH", "HDHDDHHDDHDH", "HHHHHHHHHHHH", ".PPPPPPPPPP.", "PPPPPPPPPPPP", ".P.P.P.P.P.P"],
    ],
    // SPLITTER: two pods held by a thin spine
    spl: [
      ["XXX......XXX", "XXXX....XXXX", "X.XXX..XXX.X", "XXXXXXXXXXXX", ".XXX.XX.XXX.", "..X..XX..X..", ".X...XX...X.", "............"],
      ["XXX......XXX", "XXXX....XXXX", "X.XXX..XXX.X", "XXXXXXXXXXXX", ".XXX.XX.XXX.", "..X..XX..X..", "..X..XX..X..", "............"],
    ],
    // thick hulk: the belly plate doubled up the flank, riveted
    // fully plated: orange all over with dark rivets; it turns grey once the plate is knocked off
    hulkT: [
      ["..PPPPPPPP..", ".PWPPPPPPWP.", "PPPPPPPPPPPP", "PDPDDPPDDPDP", "PPPPPPPPPPPP", ".PPPPPPPPPP.", "PPPPPPPPPPPP", "P.P.P.P.P.P."],
      ["..PPPPPPPP..", ".PWPPPPPPWP.", "PPPPPPPPPPPP", "PDPDDPPDDPDP", "PPPPPPPPPPPP", ".PPPPPPPPPP.", "PPPPPPPPPPPP", ".P.P.P.P.P.P"],
    ],
    // mothership: a flat carrier, cockpit on top, engine pods at both ends, belly windows
    ufo: [".......WW.......", "......WCCW......", "WWW..WWWWWW..WWW", "WWWWWWWWWWWWWWWW", "WWW.C.C..C.C.WWW", ".W............W.", "................"],
    player: ["......W......", ".....WWW.....", ".....WWW.....", ".GGGGGGGGGGG.", "GGGGGGGGGGGGG", "GGGGGGGGGGGGG", "GG.GGGGGGG.GG", "............."],
  };

  function bake(rows, map) {
    const c = document.createElement("canvas");
    c.width = rows[0].length;
    c.height = rows.length;
    const x = c.getContext("2d");
    for (let j = 0; j < rows.length; j++)
      for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i];
        if (ch === "." || !map[ch]) continue;
        x.fillStyle = map[ch];
        x.fillRect(i, j, 1, 1);
      }
    return c;
  }

  const IMG = {};
  function laneImgs(lane, color) {
    const key = "esc" + lane;
    return SPR[key].map((r) => bake(r, { X: color }));
  }
  for (let i = 0; i < 4; i++) {
    IMG["esc" + i] = laneImgs(i, COL.lane[i]);
    IMG["esc" + i + "w"] = laneImgs(i, "#ffffff");
    IMG["esc" + i + "r"] = laneImgs(i, "#ff5a3a");
    for (const k of ["spl"]) {
      IMG[k + i] = SPR[k].map((r) => bake(r, { X: COL.lane[i] }));
      IMG[k + i + "w"] = SPR[k].map((r) => bake(r, { X: "#ffffff" }));
      IMG[k + i + "r"] = SPR[k].map((r) => bake(r, { X: "#ff5a3a" }));
    }
  }
  IMG.hulk = SPR.hulk.map((r) => bake(r, { H: COL.hulk, D: COL.hulkDark, P: COL.plate }));
  IMG.hulkw = SPR.hulk.map((r) => bake(r, { H: "#fff", D: "#fff", P: "#fff" }));
  IMG.hulkr = SPR.hulk.map((r) => bake(r, { H: "#ff9a3a", D: "#b23a10", P: "#ffe23f" }));
  IMG.hulkT = SPR.hulkT.map((r) => bake(r, { D: "#7a3a08", P: COL.plate, W: "#ffffff" }));
  IMG.hulkTw = SPR.hulkT.map((r) => bake(r, { H: "#fff", D: "#fff", P: "#fff", W: "#fff" }));
  IMG.hulkTr = SPR.hulkT.map((r) => bake(r, { H: "#ff9a3a", D: "#b23a10", P: "#ffe23f", W: "#fff" }));
  IMG.ufo = [bake(SPR.ufo, { W: "#ffffff", C: "#3fe0ff" })];
  IMG.ufor = [bake(SPR.ufo, { W: "#ff5a3a", C: "#ffe23f" })];
  IMG.player = bake(SPR.player, { W: COL.white, G: COL.player });
  IMG.playerEmpty = bake(SPR.player, { W: "#2f7a3f", G: COL.player });

  // ---- 5x7 font ------------------------------------------------------------------------
  const FONT = {
    A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110", C: "01110100011000010000100001000101110",
    D: "11110100011000110001100011000111110", E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000",
    G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001", I: "01110001000010000100001000010001110",
    J: "00111000100001000010000101001001100", K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111",
    M: "10001110111010110101100011000110001", N: "10001100011100110101100111000110001", O: "01110100011000110001100011000101110",
    P: "11110100011000111110100001000010000", Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001",
    S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100", U: "10001100011000110001100011000101110",
    V: "10001100011000110001100010101000100", W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001",
    Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111",
    0: "01110100011001110101110011000101110", 1: "00100011000010000100001000010001110", 2: "01110100010000100010001000100011111",
    3: "11111000100010000010000011000101110", 4: "00010001100101010010111110001000010", 5: "11111100001111000001000011000101110",
    6: "00110010001000011110100011000101110", 7: "11111000010001000100010000100001000", 8: "01110100011000101110100011000101110",
    9: "01110100011000101111000010001001100", "-": "00000000000000011111000000000000000", "×": "00000000001000101010001000101010001",
    "!": "00100001000010000100001000000000100", ".": "00000000000000000000000000110001100", ":": "00000011000110000000011000110000000",
    "=": "00000000001111100000111110000000000", "?": "01110100010000100010001000000000100", "'": "00100001000100000000000000000000000",
    "/": "00001000100001000100010000100010000", "<": "00010001000100010000010000010000010", ">": "01000001000001000001000100010001000",
  };
  const glyphCache = {};
  function glyph(ch, color) {
    const k = ch + color;
    if (glyphCache[k]) return glyphCache[k];
    const bits = FONT[ch];
    const c = document.createElement("canvas");
    c.width = 5;
    c.height = 7;
    const x = c.getContext("2d");
    x.fillStyle = color;
    if (bits) for (let i = 0; i < 35; i++) if (bits[i] === "1") x.fillRect(i % 5, Math.floor(i / 5), 1, 1);
    glyphCache[k] = c;
    return c;
  }
  function text(str, x, y, color, scale, align) {
    str = String(str).toUpperCase();
    scale = scale || 1;
    const w = str.length * 6 * scale - scale;
    if (align === "c") x -= Math.floor(w / 2);
    else if (align === "r") x -= w;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch !== " ") g.drawImage(glyph(ch, color || COL.text), Math.round(x + i * 6 * scale), Math.round(y), 5 * scale, 7 * scale);
    }
  }

  // ---- input ---------------------------------------------------------------------------
  const keys = {};
  const FIRE_KEYS = ["KeyZ", "Space", "KeyX", "ArrowUp", "KeyW"];
  let anyPress = false;
  let fireLatch = false; // a tap shorter than one tick still fires
  addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    if (!keys[e.code]) {
      anyPress = true;
      if (FIRE_KEYS.includes(e.code)) fireLatch = true;
    }
    keys[e.code] = true;
    A.init();
    if (e.code === "KeyM") A.toggleMute();
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

  const touch = { id: null, sx: 0, shipX: 0, t0: 0, moved: false, targetX: null, tapFire: 0 };
  function toGameX(clientX) {
    const r = cv.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  }
  cv.addEventListener("touchstart", (e) => {
    e.preventDefault();
    A.init();
    anyPress = true;
    for (const t of e.changedTouches) {
      if (touch.id === null) {
        touch.id = t.identifier;
        touch.sx = toGameX(t.clientX);
        touch.shipX = game ? game.player.x : W / 2;
        touch.t0 = performance.now();
        touch.moved = false;
      } else touch.tapFire = 6; // a second finger fires at once
    }
  }, { passive: false });
  cv.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches)
      if (t.identifier === touch.id) {
        const dx = toGameX(t.clientX) - touch.sx;
        if (Math.abs(dx) > 3) touch.moved = true;
        if (touch.moved) touch.targetX = touch.shipX + dx * 1.4;
      }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches)
      if (t.identifier === touch.id) {
        if (!touch.moved && performance.now() - touch.t0 < 250) touch.tapFire = 6;
        touch.id = null;
        touch.targetX = null;
      }
  };
  cv.addEventListener("touchend", endTouch);
  cv.addEventListener("touchcancel", endTouch);
  cv.addEventListener("mousedown", () => { A.init(); anyPress = true; });

  function readInput() {
    const inp = {
      left: keys.ArrowLeft || keys.KeyA,
      right: keys.ArrowRight || keys.KeyD,
      fire: FIRE_KEYS.some((k) => keys[k]) || fireLatch || touch.tapFire > 0,
    };
    fireLatch = false; // consumed: next tick reads the real key state, giving the core a clean edge
    if (touch.targetX != null) inp.targetX = Math.max(8, Math.min(W - 8, touch.targetX));
    if (touch.tapFire > 0) touch.tapFire--;
    return inp;
  }

  // ---- app state -----------------------------------------------------------------------
  let hi = 0;
  try { hi = +localStorage.getItem("wreckfall.hi") || 0; } catch (e) { hi = 0; }
  let app = "title";
  let appT = 0;
  let game = null;
  let demoBot = null;
  let fx = null;
  let seedN = (Date.now() & 0xffff) | 1;
  let newHi = false;
  let autopilot = null; // recorder hook: replaces the player's input in a normal (audible) game

  function resetFx() {
    fx = { extendT: 0, recoil: 0, muzzle: 0, lean: 0, slow: 0, grazeCool: 0, flips: {}, parts: [], pops: [], pieces: {}, shake: 0, flash: 0, hitstop: 0, marchT: 0, marchStep: 0, scorch: [], dispScore: 0, banner: null };
  }
  resetFx();

  function startGame(demo, opts) {
    game = WF.createGame(seedN++, opts);
    resetFx();
    newHi = false;
    if (demo) {
      demoBot = WFBots.humanBot({ seed: seedN, lapse: 0.05, posErr: 2 });
      app = "demo";
    } else {
      demoBot = null;
      app = "play";
      A.sfx.start();
    }
    appT = 0;
  }

  // ---- effects -------------------------------------------------------------------------
  function spark(x, y, n, colors, speed, life, gy) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, life: life * (0.5 + Math.random() * 0.5), c: colors[i % colors.length], gy: gy == null ? 200 : gy });
    }
  }
  function pop(x, y, str, color, life) {
    fx.pops.push({ x, y, str, c: color, life: life || 0.8, t: 0 });
  }
  function spriteKey(kind, lane, armored) {
    if (armored || kind === "hulk") return "hulk";
    return (kind === "split" ? "spl" : "esc") + lane;
  }
  function laneColor(lane, armored) {
    return armored ? COL.plate : COL.lane[lane];
  }
  function heat(n) {
    return ["#ff5a3a", "#ff8a1f", "#ffb21f", "#ffe23f", "#fff27a", "#ffffff"][Math.min(5, n - 1)];
  }

  const evLog = [];
  function handleEvents(evts) {
    const live = app === "play";
    for (const e of evts) { evLog.push(Object.assign({ t: game ? +game.t.toFixed(2) : 0 }, e)); if (evLog.length > 200) evLog.shift(); }
    for (const e of evts) {
      switch (e.type) {
        case "fire":
          fx.recoil = 2;
          fx.muzzle = 0.06;
          if (live) A.sfx.fire(e.x);
          break;
        case "graze":
          // near miss: a spark streak on the side it passed, weaker than any hit
          if (fx.grazeCool <= 0) {
            const dir = e.from < e.x ? -1 : 1;
            for (let i = 0; i < 6; i++) fx.parts.push({ x: e.x + dir * (7 + Math.random() * 3), y: CFG.playerY - 3 + Math.random() * 6, vx: -dir * (30 + Math.random() * 40), vy: -10 - Math.random() * 20, life: 0.25, c: i % 2 ? "#fff" : "#3fe0ff", gy: 0 });
            fx.grazeCool = 0.25;
            if (live) A.sfx.graze(e.x);
          }
          break;
        case "clink":
          spark(e.x, e.y + 4, e.armored ? 6 : 3, ["#fff", "#ffe23f"], 60, 0.25, 0);
          if (live) A.sfx.clink(e.x);
          break;
        case "hit":
          fx.pieces[e.id] = [{ key: spriteKey(e.kind, e.lane, e.armored), ang: 0, spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 4), ox: 0 }];
          spark(e.x, e.y, 10, [laneColor(e.lane, e.armored), "#fff"], 70, 0.35);
          if (e.armored) pop(e.x, e.y - 6, e.pts, "#fff", 0.6);
          if (live) A.sfx.hit(e.x);
          break;
        case "swallow": {
          const ps = fx.pieces[e.id] || (fx.pieces[e.id] = []);
          ps.push({ key: spriteKey(e.kind, e.lane, e.armored), ang: Math.random() * 6, spin: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5), ox: e.x - e.wx });
          const c = heat(e.n);
          spark(e.x, e.y, e.armored ? 26 : 8 + e.n * 2, e.armored ? [COL.plate, "#fff", "#ffe23f"] : [c, laneColor(e.lane, false)], e.armored ? 120 : 80, e.armored ? 0.6 : 0.4);
          const side = e.x < W / 2 ? 14 : -14;
          if (e.armored) pop(e.x + side, e.y - 2, e.pts, COL.plate, 1.0);
          else pop(e.x + side, e.y - 2, "×" + e.n, c, 0.5);
          if (e.armored) {
            fx.hitstop = Math.max(fx.hitstop || 0, 0.035 + 0.012 * Math.min(5, e.n));
            fx.shake = Math.max(fx.shake, 2 + Math.min(4, e.n));
            fx.flash = Math.max(fx.flash, 0.06 + 0.02 * Math.min(4, e.n));
          }
          if (live) A.sfx.swallow(e.x, e.n, e.armored);
          break;
        }
        case "ufo": fx.ufoSound = 0; break;
        case "reverse":
          fx.flips[e.lane] = 0.6;
          if (live) A.sfx.reverse();
          break;
        case "ufoHit":
          fx.pieces[e.id] = [
            { key: "ufo", ang: 0, spin: -3, ox: -14 },
            { key: "ufo", ang: 0, spin: 3, ox: 14 },
          ];
          spark(e.x, e.y, 40, ["#fff", "#3fe0ff", "#ffe23f"], 130, 0.7);
          pop(e.x, e.y - 8, e.pts, "#3fe0ff", 1.2);
          fx.shake = Math.max(fx.shake, 3);
          fx.flash = Math.max(fx.flash, 0.1);
          if (live) A.sfx.ufoHit(e.x);
          break;
        case "bounce":
          // the wreck breaks up on the double plate; a 2-chain knocks the plate off
          delete fx.pieces[e.id];
          spark(e.x, e.y - 4, 14, [heat(e.n), "#777", "#fff"], 70, 0.4);
          if (e.plate) {
            spark(e.ex, e.y + 2, 10, [COL.plate, "#fff"], 90, 0.4, 260);
            for (let i = 0; i < 7; i++) fx.parts.push({ x: e.ex - 6 + i * 2, y: e.y + 1, vx: (i - 3) * 14 + (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, life: 1.4, c: i % 3 ? COL.plate : "#7a3a08", gy: 320, s: 2 });
          }
          pop(e.x, e.y - 12, e.plate ? "CRACK" : "×" + e.n + " NO", e.plate ? COL.plate : COL.dim, 0.8);
          if (live) A.sfx.bounce(e.x, e.plate);
          break;
        case "fork":
          // the child wreck carries a copy of the parent's tumbling pieces
          fx.pieces[e.child] = (fx.pieces[e.id] || []).map((p) => Object.assign({}, p, { spin: -p.spin }));
          spark(e.x, e.y, 12, ["#fff", heat(e.n)], 90, 0.3, 0);
          if (live) A.sfx.fork(e.x);
          break;
        case "land":
          delete fx.pieces[e.id];
          spark(e.x, CFG.groundY - 1, 6 + e.n * 5, [heat(e.n), "#ff5a3a", "#777"], 50 + e.n * 18, 0.5, 260);
          fx.scorch.push({ x: e.x, w: e.w, life: 1.2 });
          if (e.n >= 2) pop(e.x, CFG.groundY - 14, e.pts, heat(e.n), 1.2);
          if (e.n >= 5) fx.shake = Math.max(fx.shake, 1.5);
          if (live) A.sfx.land(e.x, e.n);
          break;
        case "tell": if (live) A.sfx.bombTell(e.x); break;
        case "bomb": if (live) A.sfx.bomb(e.x); break;
        case "bombshot":
          spark(e.x, e.y, 5, [COL.bomb, "#fff"], 50, 0.25, 0);
          if (live) A.sfx.bombshot(e.x);
          break;
        case "bombsmash": spark(e.x, e.y, 4, [COL.bomb], 40, 0.2, 0); break;
        case "bombland": spark(e.x, CFG.groundY - 1, 3, [COL.bomb, "#f80"], 30, 0.25, 200); break;
        case "death":
          // a moment of slow motion, so the death reads as cause and effect
          fx.slow = 0.5;
          spark(e.x, CFG.playerY, 40, [COL.player, "#fff", "#ffe23f", COL.bomb], 110, 1.0, 120);
          fx.shake = 5;
          fx.flash = 0.06; // kept low: the slow motion stretches it
          if (live) A.sfx.death(e.x);
          break;
        case "invade":
          fx.banner = { str: "INVADED", c: COL.danger, life: 3 };
          if (live) A.sfx.invade();
          break;
        case "scatter": spark(e.x, e.y, 5, [COL.lane[Math.min(3, e.lane)], "#fff"], 60, 0.4, -80); break;
        case "clear":
          fx.banner = { str: "WAVE CLEAR", c: "#fff", sub: "HEIGHT BONUS 0", life: 2.1, tally: { v: 0, to: e.bonus, tick: 0 } };
          if (live) A.sfx.clear();
          break;
        case "allclear":
          fx.banner = { str: "ALL CLEAR", c: "#ffe23f", sub: "SHIPS " + e.ships + " × " + WF.CFG.shipsBonus + " = " + e.bonus, life: 4.4 };
          fx.flash = 0.15;
          if (live) A.sfx.allclear();
          break;
        case "extend":
          // its own line (not the banner): an extend often lands on the same tick as WAVE CLEAR,
          // whose banner and jingle would otherwise swallow it
          fx.extendT = 2.0;
          if (live) A.sfx.extend(evts.some((q) => q.type === "clear" || q.type === "allclear") ? 0.9 : 0);
          break;
        case "gameover": if (live) A.sfx.over(); break;
      }
    }
  }

  function updateFx(dt) {
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.life -= dt;
      if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
      p.vy += p.gy * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > CFG.groundY - 1 && p.vy > 0) { p.y = CFG.groundY - 1; p.vy *= -0.3; p.vx *= 0.6; }
    }
    for (let i = fx.pops.length - 1; i >= 0; i--) {
      const q = fx.pops[i];
      q.t += dt;
      if (q.t >= q.life) fx.pops.splice(i, 1);
    }
    for (let i = fx.scorch.length - 1; i >= 0; i--) if ((fx.scorch[i].life -= dt) <= 0) fx.scorch.splice(i, 1);
    for (const id in fx.pieces) for (const p of fx.pieces[id]) p.ang += p.spin * dt;
    for (const k in fx.flips) if ((fx.flips[k] -= dt) <= 0) delete fx.flips[k];
    fx.recoil = Math.max(0, fx.recoil - dt * 24);
    fx.extendT = Math.max(0, fx.extendT - dt);
    fx.muzzle = Math.max(0, fx.muzzle - dt);
    fx.grazeCool -= dt;
    // cannon lean eases toward its velocity and settles back when it stops
    const vx = game && game.player.alive ? game.player.vx / CFG.playerSpeed : 0;
    fx.lean += (vx - fx.lean) * Math.min(1, dt * 14);
    fx.shake = Math.max(0, fx.shake - dt * 14);
    fx.flash = Math.max(0, fx.flash - dt);
    if (fx.banner && fx.banner.tally) {
      // the height bonus counts up (the score itself already rolls up in the HUD)
      const tl = fx.banner.tally;
      if (tl.v < tl.to) {
        tl.v = Math.min(tl.to, tl.v + (tl.to / 0.9) * dt);
        fx.banner.sub = "HEIGHT BONUS " + Math.floor(tl.v);
        if ((tl.tick -= dt) <= 0) {
          tl.tick = 0.045;
          if (app === "play") A.sfx.tick(tl.v / tl.to);
        }
      }
    }
    if (fx.banner && (fx.banner.life -= dt) <= 0) fx.banner = null;
    // trail embers behind falling wrecks: they show which wrecks are live
    if (game) for (const w of game.wrecks) {
      if (Math.random() < 0.5 + w.n * 0.1) fx.parts.push({ x: w.x + (Math.random() - 0.5) * w.w, y: w.y - 3, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 20, life: 0.25 + Math.random() * 0.2, c: heat(w.n), gy: 0 });
    }
    // roll the displayed score
    if (game) {
      const d = game.score - fx.dispScore;
      fx.dispScore += d > 0 ? Math.max(1, Math.ceil(d * 0.18)) : d;
    }
    // march: tempo follows the formation; it gets urgent when the hulks are close to the line
    // mothership warble while it crosses
    if (game && game.ufo && app === "play" && (fx.ufoSound = (fx.ufoSound || 0) - dt) <= 0) {
      fx.ufoSound = 0.09;
      fx.ufoStep = (fx.ufoStep || 0) + 1;
      A.sfx.ufo(game.ufo.x, fx.ufoStep);
    }
    if (game && game.mode === "play") {
      const room = roomLeft(game);
      const urgent = room < 36;
      const interval = Math.max(0.16, (urgent ? 0.36 : 0.62) / WF.tempo(game));
      fx.marchT -= dt;
      if (fx.marchT <= 0) {
        fx.marchT = interval;
        fx.marchStep++;
        fx.bob = 0.09; // the formation steps down a pixel on the beat (render only)
        if (app === "play") {
          A.sfx.march(fx.marchStep, urgent);
          if (urgent && fx.marchStep % 2 === 0) A.sfx.heart();
        }
      }
      fx.danger = Math.max(0, Math.min(1, (40 - room) / 40));
      // big falling wrecks whistle, rising as they near the ground
      let big = null;
      for (const w of game.wrecks) if (w.n >= 3 && w.vy > 0 && (!big || w.n > big.n)) big = w;
      if (big && app === "play" && (fx.whistleT = (fx.whistleT || 0) - dt) <= 0) {
        fx.whistleT = 0.06;
        const k = Math.max(0, Math.min(1, (big.y - 40) / (CFG.groundY - 40)));
        A.sfx.whistle(big.x, k);
      }
    } else fx.danger = 0;
    fx.bob = Math.max(0, (fx.bob || 0) - dt);
  }

  function roomLeft(s) {
    let lowest = -1;
    for (const e of s.enemies) if (e.alive && e.lane > lowest) lowest = e.lane;
    if (lowest < 0) return 99;
    return CFG.invadeY - (WF.laneY(s, lowest) + CFG.enemyHalfH);
  }

  // ---- tick ----------------------------------------------------------------------------
  function tick() {
    appT += DT;
    const pressed = anyPress;
    anyPress = false;
    if (app === "title") {
      if (pressed && appT > 0.3) { startGame(false); return; }
      if (appT > 14) startGame(true);
      return;
    }
    if (app === "demo") {
      if (pressed) { app = "title"; appT = 0; game = null; resetFx(); return; }
      WF.step(game, demoBot.update(game));
      handleEvents(game.events);
      if (game.mode === "over" || appT > 45) { app = "title"; appT = 0; game = null; resetFx(); }
      return;
    }
    if (app === "play") {
      if (fx.hitstop > 0) { fx.hitstop -= DT; return; }
      WF.step(game, autopilot ? autopilot(game) || {} : readInput());
      handleEvents(game.events);
      if (game.score > hi) {
        hi = game.score;
        newHi = true;
      }
      if (game.mode === "over") {
        app = "over";
        appT = 0;
        try { localStorage.setItem("wreckfall.hi", String(hi)); } catch (e) { /* storage unavailable */ }
      }
      return;
    }
    if (app === "over") {
      if (game) WF.step(game, {});
      if ((pressed && appT > 1.5) || appT > 8) { app = "title"; appT = 0; game = null; resetFx(); }
    }
  }

  // ---- render --------------------------------------------------------------------------
  const STARS = [];
  for (let i = 0; i < 40; i++) STARS.push({ x: Math.floor(Math.random() * W), y: 20 + Math.floor(Math.random() * 200), p: Math.random() * 6 });

  function drawEnemy(s, e, t) {
    const y = WF.laneY(s, e.lane);
    const frame = Math.floor(t * 3 * WF.tempo(s) + e.lane) % 2;
    const base = e.thick ? "hulkT" : spriteKey(e.kind, e.lane, e.armored);
    // one tint at a time: a hit flash (white) outranks the bomb telegraph blink (red)
    let tint = "";
    if (e.ping > 0) tint = "w";
    else if (e.flash > 0 && Math.floor(e.flash * 20) % 2 === 0) tint = "r";
    const imgs = IMG[base + tint] || IMG[base];
    g.drawImage(imgs[frame], Math.round(e.x - 6), Math.round(y - 4) + (fx.bob > 0 ? 1 : 0));
  }

  function drawWreck(s, w, t) {
    // heat halo: grows and brightens with the chain, flickering like a fire
    if (w.n >= 2) {
      const a = Math.min(0.45, 0.08 + 0.06 * w.n) * (0.8 + 0.2 * Math.sin(t * 40 + w.id));
      g.fillStyle = heat(w.n);
      for (const [grow, k] of [[w.n + 3, 0.45], [1, 1]]) {
        const hw = Math.round(w.w / 2 + grow);
        const hh = Math.round(4 + grow * 0.6);
        g.globalAlpha = a * k;
        g.fillRect(Math.round(w.x - hw), Math.round(w.y - hh), hw * 2, hh * 2);
      }
      g.globalAlpha = 1;
    }
    const ps = fx.pieces[w.id] || [{ key: "esc0", ang: t * 8, ox: 0 }];
    const n = ps.length;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const spread = n > 1 ? ((i / (n - 1)) - 0.5) * (w.w - 8) : 0;
      const ox = p.ox * 0.25 + spread * 0.75;
      g.save();
      g.translate(Math.round(w.x + ox), Math.round(w.y + (i % 2) * 2 - 1));
      g.rotate(Math.round(p.ang / (Math.PI / 4)) * (Math.PI / 4)); // 8-way tumble, like hardware sprite flips
      const img = IMG[p.key + "r"] || IMG[p.key];
      g.drawImage(img[0], -Math.floor(img[0].width / 2), -4);
      g.restore();
    }
    // hot core
    g.fillStyle = heat(w.n);
    g.fillRect(Math.round(w.x - 1), Math.round(w.y - 1), 2, 2);
  }

  function drawGroundMarker(s, w, t) {
    const pl = WF.predictLanding(s, w);
    const half = Math.round(w.w / 2 + CFG.playerHalfW - 1);
    const x0 = Math.round(pl.x - half);
    const blink = pl.t < 0.4 ? Math.floor(t * 20) % 2 === 0 : true;
    if (!blink) return;
    g.fillStyle = pl.t < 0.4 ? COL.danger : "#a01818";
    g.fillRect(x0, CFG.groundY + 1, half * 2, 1);
    g.fillRect(x0, CFG.groundY - 2, 1, 3);
    g.fillRect(x0 + half * 2 - 1, CFG.groundY - 2, 1, 3);
  }

  function render() {
    const t = performance.now() / 1000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    if (fx.shake > 0) g.translate(Math.round((Math.random() - 0.5) * fx.shake), Math.round((Math.random() - 0.5) * fx.shake));

    for (const st of STARS) {
      g.fillStyle = "#16224a";
      g.fillRect(st.x, st.y, 1, 1);
    }

    // ground and the invasion line
    g.fillStyle = COL.ground;
    g.fillRect(0, CFG.groundY, W, 1);
    g.fillStyle = "#0b1a55";
    g.fillRect(0, CFG.groundY + 1, W, 2);
    for (const sc of fx.scorch) {
      g.fillStyle = sc.life > 0.6 ? "#ff8a1f" : "#5a2a10";
      g.fillRect(Math.round(sc.x - sc.w / 2), CFG.groundY, Math.round(sc.w), 1);
    }

    const s = game;
    if (s) {
      const room = roomLeft(s);
      const lineA = room < 40 ? (Math.floor(t * (room < 16 ? 8 : 3)) % 2 ? COL.danger : "#6a1010") : "#3a0c0c";
      g.fillStyle = lineA;
      for (let x = 0; x < W; x += 4) g.fillRect(x, CFG.invadeY + 1, 2, 1);
      // the clear bonus still on offer sits on the line it is measured against, draining as the
      // formation comes down: the price of waiting for a bigger chain
      if (s.mode === "play" || s.mode === "ready") {
        const hb = WF.heightBonusNow(s);
        text(String(hb), W - 4, CFG.invadeY - 8, room < 40 ? lineA : "#a08a3a", 1, "r");
      }

      for (const e of s.enemies) if (e.alive) drawEnemy(s, e, t);
      if (s.ufo) g.drawImage(IMG.ufo[0], Math.round(s.ufo.x - 8), Math.round(WF.ufoY(s) - 3));
      // a flipped lane: arrows at both edges point its new way
      for (const k in fx.flips) {
        const lane = +k;
        const arrow = s.lanes[lane].v > 0 ? ">" : "<";
        const y = WF.laneY(s, lane) - 3;
        text(arrow + arrow, 2, y, "#fff");
        text(arrow + arrow, W - 13, y, "#fff");
      }
      for (const w of s.wrecks) drawGroundMarker(s, w, t);
      for (const w of s.wrecks) drawWreck(s, w, t);

      if (s.shot) {
        g.fillStyle = "#fff";
        g.fillRect(s.shot.x, Math.round(s.shot.y), 1, 5);
      }
      for (const b of s.bombs) {
        const f = Math.floor(t * 12) % 2;
        g.fillStyle = COL.bomb;
        for (let k = 0; k < 6; k++) g.fillRect(b.x - 1 + ((k + f) % 2) * 2 - 1 + 1, Math.round(b.y - 3 + k), 1, 1);
        g.fillRect(b.x, Math.round(b.y - 3), 1, 6);
      }
      const p = s.player;
      if (p.alive && !(s.mode === "ready" && Math.floor(s.modeT * 8) % 2 === 1 && s.modeT < 0.8)) {
        // the barrel is white only while a shot is loaded; the cannon leans into its motion and
        // kicks down when it fires (render only)
        g.save();
        g.translate(Math.round(p.x), CFG.playerY + Math.round(fx.recoil));
        g.transform(1, 0, -fx.lean * 0.3, 1, 0, 0);
        g.drawImage(s.shot ? IMG.playerEmpty : IMG.player, -6, -4);
        g.restore();
        if (fx.muzzle > 0) {
          const mx = Math.round(p.x), my = CFG.playerY - 7;
          g.fillStyle = "#ffe23f";
          g.fillRect(mx - 1, my - 1, 3, 1);
          g.fillRect(mx, my - 3, 1, 3);
          g.fillStyle = "#fff";
          g.fillRect(mx, my - 1, 1, 1);
        }
      }
    }

    for (const q of fx.parts) {
      g.fillStyle = q.c;
      g.fillRect(Math.round(q.x), Math.round(q.y), q.s || 1, q.s || 1);
    }
    for (const q of fx.pops) {
      if (q.t < q.life * 0.75 || Math.floor(q.t * 20) % 2) text(q.str, q.x, q.y - q.t * 10, q.c, 1, "c");
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.danger > 0 && app === "play") {
      const a = fx.danger * (fx.bob > 0 ? 0.35 : 0.2);
      g.fillStyle = "rgba(255,30,30," + a.toFixed(3) + ")";
      g.fillRect(0, 0, 3, H);
      g.fillRect(W - 3, 0, 3, H);
      g.fillStyle = "rgba(255,30,30," + (a * 0.5).toFixed(3) + ")";
      g.fillRect(3, 0, 3, H);
      g.fillRect(W - 6, 0, 3, H);
    }
    if (fx.flash > 0) {
      g.fillStyle = "rgba(255,240,200," + Math.min(0.22, fx.flash * 1.6) + ")";
      g.fillRect(0, 0, W, H);
    }
    drawHud(t);
  }

  function drawHud(t) {
    const s = game;
    text("1UP", 8, 2, app === "play" && Math.floor(t * 2) % 2 ? "#ff4040" : "#ff4040");
    text(String(s ? Math.floor(fx.dispScore) : 0).padStart(6, "0"), 8, 11, "#fff");
    text("HI", W / 2, 2, "#ff4040", 1, "c");
    text(String(hi).padStart(6, "0"), W / 2, 11, newHi && Math.floor(t * 4) % 2 ? COL.plate : "#fff", 1, "c");
    if (s) {
      text("WAVE", W - 8, 2, "#ff4040", 1, "r");
      text(s.wave + "/" + WF.CAMPAIGN.length, W - 8, 11, "#fff", 1, "r");
      // lives below the ground
      const reserve = Math.min(6, WF.reserveShips(s));
      for (let i = 0; i < reserve; i++) {
        // the ship just earned blinks while EXTEND shows
        if (fx.extendT > 0 && i === reserve - 1 && Math.floor(fx.extendT * 8) % 2) continue;
        g.drawImage(IMG.player, 4 + i * 15, 248, 13, 8);
      }
      if (fx.extendT > 0 && Math.floor(fx.extendT * 6) % 2 === 0) text("EXTEND", W / 2, 200, COL.player, 1, "c");
      // hulks left, right-aligned below the ground
      const hs = s.enemies.filter((e) => e.alive && e.armored).sort((a, b) => (b.thick ? 1 : 0) - (a.thick ? 1 : 0));
      hs.forEach((e, i) => g.drawImage((e.thick ? IMG.hulkT : IMG.hulk)[0], W - 16 - i * 14, 248));
    }

    if (app === "title") drawTitle(t);
    if (app === "demo") {
      text("DEMO  PRESS SPACE", W / 2, 200, Math.floor(t * 2) % 2 ? "#fff" : COL.dim, 1, "c");
    }
    if (s && app !== "title") {
      if (s.mode === "ready" && app === "play") {
        text("WAVE " + s.wave, W / 2, 168, "#fff", 1, "c");
        const sp = s.params.specials || [];
        const names = { split: ["spl", "SPLITTER"] };
        sp.forEach((k, i) => {
          const y = 184 + i * 12;
          g.drawImage(IMG[names[k][0] + 1][0], W / 2 - 34, y);
          text(names[k][1], W / 2 - 18, y, "#fff");
        });
        if (s.wave === 1) text("READY", W / 2, 180, COL.player, 1, "c");
        const bh = s.params.behavior;
        if (s.params.name) text(s.params.name, W / 2, bh === "normal" ? 156 : 144, "#ff8a1f", 1, "c");
        if (bh === "convoy") text(">> CONVOY >>", W / 2, 156, "#ffe23f", 1, "c");
        if (bh === "reverse") text("<> REVERSE <>", W / 2, 156, "#ffe23f", 1, "c");
        if (s.params.thick > 0) {
          const y = 184 + sp.length * 12;
          g.drawImage(IMG.hulkT[0], W / 2 - 34, y);
          text("×3 TO CRUSH", W / 2 - 18, y, "#fff");
        }
      }
      if (fx.banner) {
        text(fx.banner.str, W / 2, 160, fx.banner.c, 2, "c");
        if (fx.banner.sub) text(fx.banner.sub, W / 2, 180, "#ffe23f", 1, "c");
      }
      if (app === "over") {
        if (s.allClear) {
          text("ALL CLEAR", W / 2, 110, "#ffe23f", 2, "c");
          text("THE CITY LINE HELD", W / 2, 130, "#fff", 1, "c");
        } else text("GAME OVER", W / 2, 120, "#ff4040", 2, "c");
        if (newHi) text("NEW HIGH SCORE", W / 2, 142, COL.plate, 1, "c");
      }
    }
  }

  function drawTitle(t) {
    text("WRECKFALL", W / 2, 40, "#ff8a1f", 3, "c");
    const rows = [
      ["esc0", "= 50", COL.lane[0]],
      ["esc1", "= 40", COL.lane[1]],
      ["esc2", "= 30", COL.lane[2]],
      ["esc3", "= 20", COL.lane[3]],
    ];
    let y = 80;
    g.drawImage(IMG.ufo[0], 68, y);
    text("= 300", 90, y, "#3fe0ff");
    y += 12;
    for (const [k, str, c] of rows) {
      g.drawImage(IMG[k][Math.floor(t * 3) % 2], 70, y);
      text(str, 90, y, c);
      y += 12;
    }
    g.drawImage(IMG.hulk[Math.floor(t * 3) % 2], 70, y);
    text("= 150", 90, y, COL.plate);
    y += 16;
    text("SHOTS BOUNCE OFF HULKS", W / 2, y, "#fff", 1, "c");
    text("DROP WRECKS ON THEM", W / 2, y + 11, "#ffe23f", 1, "c");
    text("A WRECK CRUSHES ALL BELOW", W / 2, y + 26, COL.dim, 1, "c");
    text("EACH ONE SCORES ×N", W / 2, y + 37, COL.dim, 1, "c");
    if (Math.floor(t * 2) % 2) text("PRESS SPACE", W / 2, 214, "#fff", 1, "c");
    text("< > MOVE   Z FIRE", W / 2, 228, COL.dim, 1, "c");
  }

  // ---- loop ----------------------------------------------------------------------------
  function fit() {
    const k = Math.max(1, Math.min(innerWidth / W, innerHeight / H));
    const ki = k >= 2 ? Math.floor(k) : k;
    cv.style.width = W * ki + "px";
    cv.style.height = H * ki + "px";
  }
  addEventListener("resize", fit);
  fit();

  let acc = 0;
  let last = performance.now();
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += fx.slow > 0 ? real * 0.3 : real;
    fx.slow = Math.max(0, fx.slow - real);
    while (acc >= DT) {
      tick();
      updateFx(DT);
      acc -= DT;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test hooks (read-only views + deterministic start)
  window.__wf = {
    get app() { return app; },
    get game() { return game; },
    start(seed, opts) { seedN = seed || 1; autopilot = null; startGame(false, opts); },
    // start a normal game fed by a precomputed input list, one entry per core step
    replay(seed, inputs) {
      seedN = seed;
      let i = 0;
      startGame(false);
      autopilot = () => inputs[i++] || {};
    },
    titleFromStart() { app = "title"; appT = 0; game = null; resetFx(); },
    demo(seed) { seedN = seed || 1; startGame(true); },
    fx: () => fx,
    events: () => evLog.slice(),
  };
})();
