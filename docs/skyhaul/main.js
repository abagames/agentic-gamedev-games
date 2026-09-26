// SKYHAUL — renderer, input, attract/game flow. Drives the deterministic core.
(function () {
  "use strict";
  const { CFG } = SKY;
  const W = CFG.W;
  const H = CFG.H;
  const cv = document.getElementById("screen");
  const cx = cv.getContext("2d");
  cx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------------ palette
  const P = {
    bg: "#000000",
    star: "#2a2a44",
    lander: "#3cff5a",
    landerEye: "#ffe23c",
    beam: "#2fe0ff",
    beamDim: "#136a80",
    human: "#ff3ccf",
    heavy: "#ff8a2a",
    heavyBelt: "#ffe23c",
    bomber: "#5a6cff",
    bomberDark: "#2a2a88",
    mine: "#ff4040",
    mineCore: "#ffe23c",
    rescuer: "#ffd23c",
    turret: "#8aa0c8",
    rescuerDark: "#8a6a10",
    humanHead: "#ffffff",
    def: "#ff6a4a", // the hero is the enemy here: enemy red, not the genre's white
    defStripe: "#ffffff",
    defAce: "#d8202a",
    defHot: "#ff2020",
    flame: "#ff9a1a",
    ship: "#8a8aa8", // neutral hull: it must never be mistaken for the craft you fly
    shipDark: "#3c3c5a",
    hatch: "#3cff5a",
    fuse: "#e0902a",
    text: "#f4f4f4",
    dim: "#6a6a8a",
    score: "#ffe23c",
    warn: "#ff4040",
  };

  // Validation only (intent-legibility control): `?degrade=1` collapses the palette to one grey,
  // draws every sprite as the same block and hides the hatch, payout and HOT gauge. The game
  // simulation is untouched.
  const DEGRADE = /[?&]degrade=1/.test(location.search);
  if (DEGRADE) for (const k of Object.keys(P)) if (k !== "bg") P[k] = "#909090";

  // ------------------------------------------------------------------ font (3x5)
  const GLYPH = {
    0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111",
    4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001010010010",
    8: "111101111101111", 9: "111101111001111",
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110",
    E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101",
    I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111",
    M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100",
    Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101",
    Y: "101101010010010", Z: "111001010100111",
    "-": "000000111000000", "=": "000111000111000", ":": "000010000010000", ".": "000000000000010", "+": "000010111010000",
    "x": "000101010101000", "!": "010010010000010", "/": "001001010100100", " ": "000000000000000",
  };
  function text(s, x, y, color, scale, align) {
    scale = scale || 1;
    s = String(s).toUpperCase();
    const w = s.length * 4 * scale - scale;
    if (align === "center") x = Math.round(x - w / 2);
    else if (align === "right") x = Math.round(x - w);
    cx.fillStyle = color;
    for (let i = 0; i < s.length; i++) {
      const g = GLYPH[s[i]] || GLYPH[" "];
      for (let b = 0; b < 15; b++) if (g[b] === "1") cx.fillRect(x + i * 4 * scale + (b % 3) * scale, y + ((b / 3) | 0) * scale, scale, scale);
    }
  }

  // ------------------------------------------------------------------ sprites
  // Like spr, but leans: upper rows shift up to `lean` px (the lander banking into its motion).
  function sprLean(rows, x, y, colors, lean) {
    if (DEGRADE || !lean) return spr(rows, x, y, colors, false);
    const h = rows.length;
    const w = rows[0].length;
    const ox = Math.round(x - w / 2);
    const oy = Math.round(y - h / 2);
    for (let r = 0; r < h; r++) {
      const shift = Math.round((lean * (h - 1 - r)) / (h - 1));
      for (let c = 0; c < w; c++) {
        const ch = rows[r][c];
        if (ch === ".") continue;
        cx.fillStyle = colors[ch];
        cx.fillRect(ox + c + shift, oy + r, 1, 1);
      }
    }
  }

  function spr(rows, x, y, colors, flip) {
    if (DEGRADE) {
      cx.fillStyle = "#909090";
      cx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      return;
    }
    const h = rows.length;
    const w = rows[0].length;
    const ox = Math.round(x - w / 2);
    const oy = Math.round(y - h / 2);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const ch = rows[r][flip ? w - 1 - c : c];
        if (ch === ".") continue;
        cx.fillStyle = colors[ch];
        cx.fillRect(ox + c, oy + r, 1, 1);
      }
  }
  const LANDER = [
    "...ggggg...",
    "..gyygyygg.",
    ".ggggggggg.",
    "ggggggggggg",
    ".g..g.g..g.",
    "g...g.g...g",
    "g.........g",
  ];
  const LANDER2 = [
    "...ggggg...",
    "..ggyygyyg.",
    ".ggggggggg.",
    "ggggggggggg",
    ".g..g.g..g.",
    ".g..g.g..g.",
    "g.........g",
  ];
  const DEF = [
    "........www..........",
    "ff...wwwwwwwwww......",
    "fffwwwwwwwwwwwwwwwww.",
    "ff...rrrrrrrrr.......",
  ];
  const DEF_BURN = [
    "..........www..........",
    "ffff...wwwwwwwwww......",
    "fffffwwwwwwwwwwwwwwwww.",
    "ffff...rrrrrrrrr.......",
  ];
  const BOMBER = [
    "....bbbbbbb....",
    ".bbbbkbkbkbbbb.",
    "bbbbbbbbbbbbbbb",
    ".bb.........bb.",
    "......ooo......",
  ];
  const RESCUER = [
    "...yyyyy...",
    ".yywwwwwyy.",
    "yyyyyyyyyyy",
    "...k...k...",
  ];
  const CLAW_OPEN = ["k.....k", ".k...k."];
  const CLAW_SHUT = ["..k.k..", "..k.k.."];
  const TURRET = ["...b...", "...b...", ".sssss.", "sssssss"];
  const MINE = ["m.m.m", ".mmm.", "mmMmm", ".mmm.", "m.m.m"];
  const SHIP = [
    "..........ssssssssssss..........",
    "......ssssddssddssddssddssss....",
    "ssssssssssssssssssssssssssssssss",
    "..dddddddddd........dddddddddd..",
  ];

  function drawHuman(x, y, state, t, id, heavy) {
    const X = Math.round(x);
    const Y = Math.round(y);
    if (DEGRADE) {
      cx.fillStyle = "#909090";
      cx.fillRect(X - 2, Y - 2, 5, 5);
      return;
    }
    if (app.bodyFlash.has(id)) {
      cx.fillStyle = "#ffffff";
      cx.fillRect(X - (heavy ? 3 : 2), Y - 5, heavy ? 7 : 5, 10);
      return;
    }
    if (heavy) {
      // A heavy: broad, squat, slow — reads as "twice the body" at a glance.
      const ph = (t * (state === "fall" ? 12 : state === "held" ? 4 : 2.5) + id * 0.37) % 2 < 1;
      cx.fillStyle = P.humanHead;
      cx.fillRect(X - 1, Y - 5, 3, 2);
      cx.fillStyle = P.heavy;
      cx.fillRect(X - 3, Y - 3, 7, 4);
      cx.fillStyle = P.heavyBelt;
      cx.fillRect(X - 3, Y - 1, 7, 1);
      cx.fillStyle = P.heavy;
      if (state === "held") {
        cx.fillRect(X - 4, Y - 5, 1, 2);
        cx.fillRect(X + 4, Y - 5, 1, 2);
      }
      cx.fillRect(X - 2 - (ph ? 1 : 0), Y + 1, 2, 3);
      cx.fillRect(X + 1 + (ph ? 1 : 0), Y + 1, 2, 3);
      return;
    }
    const ph = (t * (state === "fall" ? 10 : state === "held" ? 6 : 4) + id * 0.37) % 2 < 1;
    cx.fillStyle = P.humanHead;
    cx.fillRect(X, Y - 4, 1, 2);
    cx.fillStyle = P.human;
    cx.fillRect(X - 1, Y - 2, 3, 3);
    if (state === "held" || state === "carried") {
      // arms up toward the beam (or the Rescuer's claw), legs dangling
      cx.fillRect(X - 2, Y - 4, 1, 2);
      cx.fillRect(X + 2, Y - 4, 1, 2);
      cx.fillRect(X - (ph ? 1 : 0), Y + 1, 1, 3);
      cx.fillRect(X + (ph ? 1 : 2) - 1, Y + 1, 1, 3);
    } else if (state === "fall") {
      // flailing
      cx.fillRect(X - 2, Y - (ph ? 3 : 1), 1, 1);
      cx.fillRect(X + 2, Y - (ph ? 1 : 3), 1, 1);
      cx.fillRect(X - 1, Y + 1, 1, 3);
      cx.fillRect(X + 1, Y + 1, 1, 3);
    } else {
      cx.fillRect(X - (ph ? 1 : 0), Y + 1, 1, 3);
      cx.fillRect(X + (ph ? 1 : 0), Y + 1, 1, 3);
    }
  }

  // ------------------------------------------------------------------ static backdrop
  const stars = [];
  {
    const r = SKY.rng(99);
    for (let i = 0; i < 40; i++) stars.push([Math.floor(r() * W), 34 + Math.floor(r() * 150)]);
  }
  const ridge = [];
  {
    const r = SKY.rng(5);
    let y = 212;
    for (let x = 0; x < W; x++) {
      y += (r() - 0.5) * 3;
      y = Math.max(200, Math.min(218, y));
      ridge.push(Math.round(y));
    }
  }

  // ------------------------------------------------------------------ app state
  const app = {
    mode: "title", // attract: title → demo → table → title; game: play → over → entry? → table → title
    modeT: 0, // frames since the mode began (confirm input is ignored for the first GRACE frames)
    game: null,
    entry: null, // initials entry state
    newRank: -1, // highlighted row in the table after an entry
    demo: null,
    demoBot: null,
    hi: 0,
    fx: [], // particles/popups
    yank: new Map(), // human id → seconds of the grab "yank" left (render only)
    shipFlash: 0, // mothership windows flash per body reeled in
    shipGlow: 0, // whole mothership glow for a big haul
    hotPulse: 0, // red screen-edge pulse when the Defender goes HOT
    shownScore: 0, // HUD score rolls up toward the real one
    lean: 0, // lander bank, -1.4..1.4 (render only)
    bodyFlash: new Map(), // human id → seconds of white flash left
    shake: 0,
    flash: 0,
    overT: 0,
    last: 0,
    acc: 0,
    frame: 0,
  };
  const GRACE = 20;

  // ------------------------------------------------------------------ rankings
  // Only real entries are stored; the factory table is merged in at read time.
  const DEFAULT_TABLE = [
    { score: 30000, name: "SKY" },
    { score: 20000, name: "HAL" },
    { score: 12000, name: "UFO" },
    { score: 7000, name: "ABD" },
    { score: 3000, name: "LND" },
  ];
  function readStored() {
    try {
      const v = JSON.parse(localStorage.getItem("skyhaul.table") || "[]");
      return Array.isArray(v) ? v.filter((r) => r && typeof r.score === "number" && typeof r.name === "string") : [];
    } catch (e) {
      return [];
    }
  }
  // Newer entries first among equal scores (ties go to the newer run).
  function readTable() {
    const all = readStored()
      .slice()
      .reverse()
      .concat(DEFAULT_TABLE);
    return all.sort((a, b) => b.score - a.score).slice(0, 5);
  }
  function rankFor(score) {
    if (score <= 0) return -1;
    const t = readTable();
    for (let i = 0; i < t.length; i++) if (score >= t[i].score) return i;
    return t.length < 5 ? t.length : -1;
  }
  function saveEntry(score, name) {
    const stored = readStored();
    stored.push({ score, name });
    stored.sort((a, b) => b.score - a.score);
    try {
      localStorage.setItem("skyhaul.table", JSON.stringify(stored.slice(0, 5)));
    } catch (e) {}
  }
  app.hi = readTable()[0].score;

  // ------------------------------------------------------------------ input
  const keys = new Set();
  const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    keys.add(e.code);
    SKYAUDIO.unlock();
    if (e.code === "KeyM") SKYAUDIO.toggle();
    if (app.mode === "entry") entryKey(e.code);
    else if ((e.code === "Space" || e.code === "Enter") && ATTRACT.includes(app.mode) && app.modeT > GRACE) startGame();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  cv.addEventListener("pointerdown", (e) => {
    SKYAUDIO.unlock();
    touch.id = e.pointerId;
    touch.ox = touch.x = e.clientX;
    touch.oy = touch.y = e.clientY;
    if (app.mode === "entry") entryTap(e.clientX, e.clientY);
    else if (ATTRACT.includes(app.mode) && app.modeT > GRACE) startGame();
  });
  addEventListener("pointermove", (e) => {
    if (e.pointerId === touch.id) (touch.x = e.clientX), (touch.y = e.clientY);
  });
  addEventListener("pointerup", (e) => {
    if (e.pointerId === touch.id) touch.id = null;
  });
  addEventListener("pointercancel", () => (touch.id = null));

  function readInput() {
    // (test/recording boundary) an autopilot supplies the input tick-synchronously
    if (app.autopilot && app.game) return app.autopilot(app.game);
    let dx = 0;
    let dy = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) dy += 1;
    if (touch.id !== null) {
      // Relative stick: drag from where the finger landed.
      const vx = touch.x - touch.ox;
      const vy = touch.y - touch.oy;
      const m = Math.hypot(vx, vy);
      if (m > 8) {
        dx = vx / Math.max(m, 36);
        dy = vy / Math.max(m, 36);
      }
      // Let the origin follow a long drag so reversing is quick.
      if (m > 48) {
        touch.ox = touch.x - (vx / m) * 48;
        touch.oy = touch.y - (vy / m) * 48;
      }
    }
    return { dx, dy };
  }

  // ------------------------------------------------------------------ flow
  const ATTRACT = ["title", "demo", "table"];
  function setMode(m) {
    app.mode = m;
    app.modeT = 0;
  }
  function startGame(seed) {
    setMode("play");
    app.shownScore = 0;
    app.game = SKY.createGame(seed === undefined ? (Math.random() * 2 ** 31) | 0 : seed);
    app.fx = [];
    app.demo = null;
    app.newRank = -1;
  }

  // ------------------------------------------------------------------ initials entry (board)
  const BOARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZ.-".split("").concat(["DEL", "END"]);
  const BCOLS = 10;
  const BX = 60;
  const BY = 150;
  const BCW = 20;
  const BCH = 14;
  function startEntry(score, rank) {
    setMode("entry");
    app.entry = { score, rank, name: "", cursor: 0, t: 25 };
    SKYAUDIO.play({ t: "hiscore" });
  }
  function entryFinish() {
    const e = app.entry;
    const name = (e.name + "---").slice(0, 3);
    saveEntry(e.score, name);
    app.newRank = readTable().findIndex((r) => r.score === e.score && r.name === name);
    app.hi = readTable()[0].score;
    app.entry = null;
    SKYAUDIO.play({ t: "entryDone" });
    setMode("table");
  }
  function entrySelect(i) {
    const e = app.entry;
    const c = BOARD[i];
    if (c === "END") return entryFinish();
    if (c === "DEL") e.name = e.name.slice(0, -1);
    else if (e.name.length < 3) e.name += c;
    // A full name moves the cursor to END so finishing is one more press.
    if (e.name.length >= 3) e.cursor = BOARD.length - 1;
    SKYAUDIO.play({ t: "ui" });
  }
  function entryKey(code) {
    const e = app.entry;
    if (!e || app.modeT <= GRACE) return;
    const n = BOARD.length;
    const col = e.cursor % BCOLS;
    if (code === "ArrowLeft" || code === "KeyA") e.cursor = (e.cursor + n - 1) % n;
    else if (code === "ArrowRight" || code === "KeyD") e.cursor = (e.cursor + 1) % n;
    else if (code === "ArrowUp" || code === "KeyW") e.cursor = e.cursor - BCOLS >= 0 ? e.cursor - BCOLS : Math.min(n - 1, col + BCOLS * 2);
    else if (code === "ArrowDown" || code === "KeyS") e.cursor = e.cursor + BCOLS < n ? e.cursor + BCOLS : col;
    else if (code === "Space" || code === "Enter" || code === "KeyZ") return entrySelect(e.cursor);
    else if (code === "Backspace") e.name = e.name.slice(0, -1);
    else return;
    SKYAUDIO.play({ t: "uiMove" });
  }
  function entryTap(cxp, cyp) {
    if (!app.entry || app.modeT <= GRACE) return;
    const r = cv.getBoundingClientRect();
    const x = ((cxp - r.left) / r.width) * W;
    const y = ((cyp - r.top) / r.height) * H;
    const c = Math.floor((x - BX) / BCW);
    const row = Math.floor((y - BY) / BCH);
    const i = row * BCOLS + c;
    if (c >= 0 && c < BCOLS && row >= 0 && i < BOARD.length) {
      app.entry.cursor = i;
      entrySelect(i);
    }
  }
  function startDemo() {
    const seed = (Math.random() * 2 ** 31) | 0;
    app.demo = SKY.createGame(seed);
    // The demo hauls small and early so the loop (grab → hatch → score) is on screen within seconds.
    app.demoBot = SKYBOTS.reader({ haulAt: 2, seed });
  }

  // ------------------------------------------------------------------ fx
  function burst(x, y, color, n, sp, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = sp * (0.4 + Math.random() * 0.6);
      app.fx.push({ k: "p", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, t: 0, color });
    }
  }
  function popup(x, y, s, color, scale, life) {
    app.fx.push({ k: "t", x, y, s, color, scale: scale || 1, life: life || 0.9, t: 0 });
  }

  function handleEvents(g, audible) {
    for (const e of g.events) {
      if (audible) SKYAUDIO.play(e);
      switch (e.t) {
        case "attach":
          if (e.hid) app.bodyFlash.set(e.hid, 0.12);
          if (e.hid) app.yank.set(e.hid, 0.14);
          burst(e.x, e.y, e.air ? P.beam : P.human, e.air ? 8 : 4, e.air ? 50 : 30, 0.3);
          if (e.air) popup(e.x, e.y - 8, "CATCH", P.beam, 1, 0.6);
          break;
        case "cut":
          if (e.cause !== "death") {
            if (e.hid) app.bodyFlash.set(e.hid, 0.18);
            burst(e.x, e.y, P.beam, 10, 70, 0.35);
            app.fx.push({ k: "cut", x: e.x, y: e.y, t: 0, life: 0.25 });
          }
          break;
        case "reel": {
          app.shipFlash = 0.08;
          popup(e.x + ((e.k % 2) * 2 - 1) * 16, CFG.shipY + 10, String(e.pts), P.score, 1, 0.7);
          break;
        }
        case "delivered":
          if (e.n >= 5) app.shipGlow = 0.6;
          if (e.n >= 5) {
            app.flash = 0.35;
            popup(e.x, 70, e.pts + "", P.score, 3, 1.6);
          } else if (e.n >= 3) {
            popup(e.x, 64, e.pts + "", P.score, 2, 1.2);
          }
          break;
        case "snatch":
          if (e.hid) app.bodyFlash.set(e.hid, 0.15);
          popup(e.x, e.y - 8, "SNATCH", P.rescuer, 1, 0.6);
          break;
        case "stealBack":
          app.landerFlash = 0.15;
          burst(e.x, e.y + 8, P.beam, 10, 60, 0.35);
          popup(e.x, e.y - 8, "BACK", P.lander, 1, 0.7);
          break;
        case "rescue":
          popup(e.x, e.y - 8, "SAVED", P.def, 1, 0.6);
          break;
        case "turretFire":
          burst(e.x, e.y - 5, P.warn, 8, 40, 0.25);
          if (e.shielded) {
            popup(e.x, e.top - 6, "SHIELD", P.beam, 1, 0.5);
            burst(e.x, e.top, "#ffffff", 8, 70, 0.2);
          }
          burst(e.x, e.top, P.warn, 6, 50, 0.25);
          break;
        case "graze":
          // a streak of sparks along the passing shot / hull
          for (let k = 0; k < 7; k++)
            app.fx.push({ k: "p", x: e.x + (Math.random() - 0.5) * 6, y: e.y + (Math.random() - 0.5) * 3, vx: e.dir * (60 + Math.random() * 80), vy: (Math.random() - 0.5) * 20, life: 0.25, t: 0, color: k % 2 ? "#ffffff" : P.score });
          break;
        case "boom":
          burst(e.x, e.y, P.mine, 12, 70, 0.4);
          burst(e.x, e.y, P.mineCore, 6, 40, 0.3);
          break;
        case "alert":
          app.hotPulse = 1.4;
          break;
        case "death":
          burst(e.x, e.y, P.lander, 26, 110, 0.9);
          burst(e.x, e.y, P.landerEye, 14, 60, 0.7);
          app.shake = 0.4;
          break;
        case "fire":
          burst(e.x, e.y, P.def, 3, 30, 0.12);
          break;
        case "extend":
          popup(W / 2, 110, "EXTRA LANDER", P.lander, 1, 1.6);
          break;
      }
    }
    g.events.length = 0;
  }

  function updateFx(dt) {
    for (let i = app.fx.length - 1; i >= 0; i--) {
      const f = app.fx[i];
      f.t += dt;
      if (f.k === "p") {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 0.96;
        f.vy *= 0.96;
      } else if (f.k === "t") f.y -= 14 * dt;
      if (f.t >= f.life) app.fx.splice(i, 1);
    }
    for (const [k, v] of app.bodyFlash) v - dt <= 0 ? app.bodyFlash.delete(k) : app.bodyFlash.set(k, v - dt);
    for (const [k, v] of app.yank) v - dt <= 0 ? app.yank.delete(k) : app.yank.set(k, v - dt);
    app.shipFlash = Math.max(0, app.shipFlash - dt);
    app.shipGlow = Math.max(0, app.shipGlow - dt);
    app.hotPulse = Math.max(0, app.hotPulse - dt);
    app.shake = Math.max(0, app.shake - dt);
    app.flash = Math.max(0, app.flash - dt);
    app.landerFlash = Math.max(0, (app.landerFlash || 0) - dt);
  }

  // Per-planet ground colours: [surface line, fill, far ridge]. Only the ground changes colour;
  // every actor keeps its colour on every planet.
  const PLANET_COLORS = [
    ["#2fbf8f", "#06261c", "#1c4a5a"], // VERDA
    ["#d8841c", "#2a1604", "#5a2a6a"], // OCHRE
    ["#e04a2a", "#2a0804", "#5a1a1a"], // CINDER
    ["#9a6aff", "#120a2a", "#2a2a5a"], // VOID
  ];

  // ------------------------------------------------------------------ render
  function drawWorld(g) {
    const t = g.t;
    const pc = DEGRADE ? ["#909090", "#202020", "#303030"] : PLANET_COLORS[(g.rules && g.rules.planet) || 0];
    // backdrop
    cx.fillStyle = P.star;
    for (const [x, y] of stars) cx.fillRect(x, y, 1, 1);
    cx.fillStyle = pc[2];
    for (let x = 0; x < W; x++) cx.fillRect(x, ridge[x] - 16, 1, 1);
    // terrain: filled below the surface, bright surface line (the surface is what matters)
    if (g.ground) {
      cx.fillStyle = pc[1];
      for (let x = 0; x < W; x++) cx.fillRect(x, g.ground[x] + 1, 1, H - g.ground[x] - 1);
      cx.fillStyle = pc[0];
      for (let x = 0; x < W; x++) {
        const y0 = g.ground[x] + 1;
        const y1 = x + 1 <= W ? g.ground[x + 1] + 1 : y0;
        cx.fillRect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1);
      }
    }

    // mothership + hatch
    const s = g.ship;
    const n = SKY.bodyCount(g);
    // Each body reeled in lights the windows; a big haul lights the whole hull.
    const glow = app.shipGlow > 0 && g === app.game && (t * 12) % 1 < 0.6;
    const winLit = app.shipFlash > 0 && g === app.game;
    spr(SHIP, s.x, CFG.shipY, { s: glow ? "#ffffff" : P.ship, d: glow ? P.hatch : winLit ? "#ffffff" : P.shipDark }, false);
    const hatchOn = !DEGRADE && (n > 0 || (g.lander && g.lander.docked));
    const hx = Math.round(s.x - CFG.hatchHalfW);
    const hw = CFG.hatchHalfW * 2;
    if (!DEGRADE) {
      // The hatch is a doorway cut into the hull (not a bar): dark opening, lit frame.
      cx.fillStyle = "#000";
      cx.fillRect(hx, CFG.shipY + 1, hw, 4);
      if (!s.open) {
        // Shut: red doors across the opening.
        cx.fillStyle = P.warn;
        cx.fillRect(hx, CFG.shipY + 3, hw, 2);
        cx.fillStyle = "#000";
        cx.fillRect(Math.round(s.x), CFG.shipY + 3, 1, 2);
      } else {
        const warn = s.warn && (t * 10) % 1 < 0.5;
        if (warn) {
          cx.fillStyle = P.warn;
          cx.fillRect(hx, CFG.shipY + 4, hw, 1);
        }
        if (hatchOn && !warn) {
          // Carrying: the opening glows (the home arrow beside the lander points here).
          cx.fillStyle = (t * 4) % 1 < 0.6 ? P.hatch : "#1a7a2a";
          cx.fillRect(hx + 1, CFG.shipY + 2, hw - 2, 2);
        }
      }
    } else {
      cx.fillStyle = P.shipDark;
      cx.fillRect(hx, CFG.shipY + 3, hw, 2);
    }

    // humans on the ground / falling
    for (const h of g.humans) if (h.state !== "held") drawHuman(h.x, h.y, h.state, t, h.id, h.w > 1);

    // mines: hollow and dim while arming; blink faster as they expire
    for (const m of g.mines) {
      const armed = m.t >= CFG.mineArm;
      const left = CFG.mineLife - m.t;
      if (left < 2 && (t * (left < 0.8 ? 16 : 8)) % 1 < 0.4) continue;
      if (armed) spr(MINE, m.x, m.y, { m: P.mine, M: P.mineCore }, false);
      else {
        cx.fillStyle = "#6a2020";
        cx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 3, 3);
      }
    }

    // chain
    const L = g.lander;
    if (L && L.alive && g.chain.length) {
      let px = L.x;
      let py = L.y + CFG.landerHalfH;
      for (let i = 0; i < g.chain.length; i++) {
        const nd = g.chain[i];
        const ex = nd.x;
        const hv = i > 0 && nd.w > 1;
        const ey = i === 0 ? nd.y : nd.y - (hv ? 5 : 4);
        const steps = Math.max(1, Math.round(Math.hypot(ex - px, ey - py)));
        // Tension: a link stretched to its full length glows bright; a slack one dims.
        const prevN = i === 0 ? { x: L.x, y: L.y + CFG.landerHalfH } : g.chain[i - 1];
        const rest = i === 0 ? CFG.hookLen : SKY.linkLen(nd);
        const taut = Math.hypot(nd.x - prevN.x, nd.y - prevN.y) > rest * 0.96;
        for (let k = 0; k < steps; k++) {
          const f = k / steps;
          // beam energy flows downward
          const on = ((k - Math.floor(t * 24)) % 3 + 3) % 3 !== 0;
          cx.fillStyle = DEGRADE ? P.beam : taut ? (on ? "#c8fbff" : P.beam) : on ? P.beamDim : "#0a3440";
          cx.fillRect(Math.round(px + (ex - px) * f), Math.round(py + (ey - py) * f), 1, 1);
        }
        px = nd.x;
        py = nd.y + (hv ? 4 : 4);
        if (i === 0) {
          cx.fillStyle = P.beam;
          cx.fillRect(Math.round(nd.x) - 1, Math.round(nd.y), 3, 1);
          cx.fillRect(Math.round(nd.x), Math.round(nd.y) - 1, 1, 3);
          px = nd.x;
          py = nd.y;
        }
      }
      for (let i = 1; i < g.chain.length; i++) {
        const nd = g.chain[i];
        // (a just-grabbed body is drawn yanked up toward the lander for a moment)
        const yk = app.yank.get(nd.hid) || 0;
        drawHuman(nd.x, nd.y - Math.round((yk / 0.14) * 4), "held", t, nd.hid, nd.w > 1);
      }
      // the hook end glows: whatever it touches comes aboard
      const tp = g.chain[g.chain.length - 1];
      if ((t * 8) % 1 < 0.5) {
        cx.fillStyle = P.beam;
        const ty = Math.round(tp.y) + (g.chain.length > 1 ? 5 : 2);
        cx.fillRect(Math.round(tp.x) - 2, ty, 1, 1);
        cx.fillRect(Math.round(tp.x) + 2, ty, 1, 1);
      }
    }

    // lander
    if (L && L.alive) {
      const vis = L.invuln <= 0 || (t * 12) % 1 < 0.6;
      const lc = app.landerFlash > 0 ? "#ffffff" : P.lander;
      if (vis) sprLean((t * 6) % 1 < 0.5 ? LANDER : LANDER2, L.x, L.y, { g: lc, y: P.landerEye }, g === app.game ? app.lean * 2 : 0);
      // Carrying: a small arrow beside the lander points home to the hatch.
      if (!DEGRADE && n > 0 && !L.docked && g.ship.open && (t * 3) % 1 < 0.7) {
        const vx = s.x - L.x;
        const vy = CFG.shipY + 6 - L.y;
        const m = Math.hypot(vx, vy) || 1;
        if (m > 24) {
          const ux = vx / m;
          const uy = vy / m;
          const ax = L.x + ux * 17;
          const ay = L.y + uy * 17;
          cx.fillStyle = P.hatch;
          for (let k = 0; k < 8; k++) cx.fillRect(Math.round(ax - ux * k), Math.round(ay - uy * k), 2, 2);
          // arrowhead: two barbs sweeping back from the tip
          for (let k = 1; k <= 3; k++) {
            cx.fillRect(Math.round(ax - ux * k - uy * k), Math.round(ay - uy * k + ux * k), 2, 2);
            cx.fillRect(Math.round(ax - ux * k + uy * k), Math.round(ay - uy * k - ux * k), 2, 2);
          }
        }
      }
      // "YOU" over the lander at the start of each life.
      // (Beside it, pointing in: the lander spawns right under the mothership.)
      if (!DEGRADE && (g.phase === "ready" || L.invuln > 0.6) && (t * 4) % 1 < 0.75) {
        const side = L.x < W - 40 ? 1 : -1;
        const ax = Math.round(L.x + side * 9);
        const ay = Math.round(L.y) - 1;
        cx.fillStyle = P.lander;
        cx.fillRect(ax, ay, 1, 1);
        cx.fillRect(ax + side, ay - 1, 1, 3);
        text("YOU", ax + side * 4, ay - 2, P.lander, 1, side > 0 ? "left" : "right");
      }
    }

    // defender
    const d = g.bonus || g.phase === "complete" || g.cleared ? null : g.def; // grounded during a bonus stage and the ending
    if (d) {
      const hot = g.alert;
      // ACE rounds fly a deeper red with a gold stripe: the same pilot, better.
      const ace = g.rules && g.rules.def && g.rules.def.speed >= 1.3; // ACE pilot (rounds 6 and 8)
      // Every Defender is red now (it is the enemy), so HOT needs its own signal: the hull strobes
      // red/yellow and drags two dark afterimages.
      const body = hot ? ((t * 8) % 1 < 0.5 ? P.defHot : P.score) : ace ? P.defAce : P.def;
      const nose = d.tele > 0 && (t * 20) % 1 < 0.5;
      const flame = (t * 15) % 1 < 0.5 ? P.flame : P.landerEye;
      const dx = Math.round(d.x);
      const dy = Math.round(d.y);
      if (dx > -12 && dx < W + 12) {
        // A committed pass burns harder: longer exhaust, the ship will not change rows.
        const locked = d.lock !== null && d.mode === "hunt";
        if (hot)
          for (const k of [2, 1]) {
            const c = k === 2 ? "#3a0808" : "#701010";
            spr(DEF, dx - d.dir * k * 7, dy, { w: c, f: c, r: c }, d.dir < 0);
          }
        const rolling = g.phase === "dying" && (t * 10) % 1 < 0.5;
        spr(rolling ? DEF.slice().reverse() : locked ? DEF_BURN : DEF, dx - (locked ? d.dir : 0), dy, { w: body, f: flame, r: hot || ace ? P.score : P.defStripe }, d.dir < 0);
        if (nose) {
          cx.fillStyle = "#ffffff";
          cx.fillRect(dx + d.dir * 10 - 1, dy - 1, 3, 3);
        }
      } else {
        // off-screen: edge marker at its altitude
        cx.fillStyle = body;
        const ex = dx <= -12 ? 0 : W - 2;
        cx.fillRect(ex, dy - 2, 2, 5);
      }
      // A locked pass: row ticks at both screen edges, so the committed row reads at a glance.
      if (d.lock !== null && d.mode === "hunt") {
        cx.fillStyle = hot ? P.defHot : "#8a8aa8";
        const ly = Math.round(d.lock);
        cx.fillRect(0, ly, 5, 1);
        cx.fillRect(W - 5, ly, 5, 1);
      }
      if (d.tele > 0) {
        // Telegraph: a sparse sight line ahead along the committed row.
        cx.fillStyle = hot ? P.defHot : "#5a5a7a";
        const y = Math.round(d.y);
        for (let x = dx + d.dir * 12; x >= 0 && x < W; x += d.dir * 6) cx.fillRect(x, y, 2, 1);
      }
    }

    // turrets: the barrel blinks and a dotted column shows the line it will fire along; the
    // beam itself stops where it hit
    for (const tu of g.turrets || []) {
      const tx = Math.round(tu.x);
      const ty = Math.round(tu.y);
      const charging = tu.charge > 0;
      spr(TURRET, tx, ty - 2, { s: P.turret, b: charging && (t * 16) % 1 < 0.5 ? P.warn : P.turret }, false);
      if (charging) {
        cx.fillStyle = "#5a2a2a";
        for (let y = ty - 8; y > CFG.topY - 8; y -= 6) cx.fillRect(tx, y, 1, 2);
      }
      if (tu.beam > 0) {
        const top = Math.round(tu.top || 0);
        const a = tu.beam / CFG.turretBeam;
        cx.fillStyle = a > 0.5 ? P.warn : "#801818";
        cx.fillRect(tx - 1, top, 3, ty - 5 - top);
        cx.fillStyle = "#ffffff";
        if (a > 0.4) cx.fillRect(tx, top, 1, ty - 5 - top);
      }
    }

    // rescuer: claw opens while it hunts a chain end; a lamp blinks
    const rs = g.rescuer;
    if (rs) {
      const rx = Math.round(rs.x);
      const ry = Math.round(rs.y);
      if (rx > -8 && rx < W + 8) {
        spr(RESCUER, rx, ry, { y: P.rescuer, w: "#ffffff", k: P.rescuerDark }, rs.dir < 0);
        const hunting = rs.mode === "chase";
        spr(hunting ? CLAW_OPEN : CLAW_SHUT, rx, ry + 4, { k: hunting ? P.rescuer : P.rescuerDark }, false);
        if (hunting && (t * 6) % 1 < 0.5) {
          cx.fillStyle = P.warn;
          cx.fillRect(rx, ry - 3, 1, 1);
        }
      }
    }

    // bomber
    const b = g.bomber;
    if (b) {
      const bx = Math.round(b.x);
      if (bx > -10 && bx < W + 10) spr(BOMBER, bx, Math.round(b.y), { b: P.bomber, k: P.bomberDark, o: (t * 6) % 1 < 0.5 ? P.mine : P.bomberDark }, b.dir < 0);
      else {
        cx.fillStyle = P.bomber;
        cx.fillRect(bx <= -10 ? 0 : W - 2, Math.round(b.y) - 2, 2, 5);
      }
    }

    // lasers
    for (const l of g.lasers) {
      const [x0, x1] = SKY.laserSpan(l);
      const y = Math.round(l.y);
      const cols = ["#ffffff", "#ffe23c", "#ff3ccf", "#2fe0ff", "#3cff5a"];
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W, x1); x += 3) {
        const dist = l.dir > 0 ? x1 - x : x - x0;
        cx.fillStyle = DEGRADE ? "#909090" : dist < 12 ? "#ffffff" : cols[(Math.floor(x / 3) + Math.floor(l.t * 30)) % cols.length];
        cx.fillRect(x, y, dist < 12 ? 3 : 2, 1);
      }
    }
  }

  function drawFx() {
    for (const f of app.fx) {
      const a = 1 - f.t / f.life;
      if (f.k === "p") {
        if (a > 0.15 || (f.t * 30) % 2 < 1) {
          cx.fillStyle = f.color;
          cx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
        }
      } else if (f.k === "t") {
        if (a > 0.3 || (f.t * 20) % 2 < 1) text(f.s, f.x, Math.round(f.y), f.color, f.scale, "center");
      } else if (f.k === "cut") {
        cx.fillStyle = "#ffffff";
        const r = Math.round(2 + f.t * 30);
        cx.fillRect(Math.round(f.x) - r, Math.round(f.y), r * 2 + 1, 1);
      }
    }
  }

  // Clear-screen time bonus count-up: 0 → 1 over one second, starting after the clear jingle
  // (its tick sound in audio.js starts at 0.95 s and spans 1 s).
  function timeCountK(g) {
    if (g.phase !== "clear" || !g.clearInfo || !(g.clearInfo.secsLeft > 0)) return -1;
    const shown = CFG.clearTime + 0.8 - g.phaseT;
    return Math.max(0, Math.min(1, (shown - 0.95) / 1.0));
  }

  function drawHud(g, demo) {
    // Arcade layout: 1UP, your score, your reserve landers and what your chain would add, all on
    // the left in your colour — so the green craft reads as "you" without a word of explanation.
    text("1UP", 4, 3, P.lander, 1);
    const shown = g === app.game ? app.shownScore : g.score;
    text(String(shown).padStart(6, "0"), 20, 3, P.text, 1);
    for (let i = 0; i < Math.min(5, g.lives - (g.phase === "dying" ? 0 : 1)); i++) {
      const lx = 4 + i * 7;
      cx.fillStyle = P.lander;
      cx.fillRect(lx + 1, 10, 3, 1);
      cx.fillRect(lx, 11, 5, 1);
      cx.fillRect(lx, 12, 1, 2);
      cx.fillRect(lx + 2, 12, 1, 2);
      cx.fillRect(lx + 4, 12, 1, 2);
    }
    if (!DEGRADE && g.lander && g.lander.alive && !g.lander.docked && SKY.bodyCount(g) > 0) {
      const w = SKY.chainWeight(g);
      text("+" + w * w * CFG.scoreUnit, 46, 3, w >= 5 ? P.score : P.lander, 1);
    }
    text("HI " + String(Math.max(app.hi, g.score)).padStart(6, "0"), W / 2, 3, P.dim, 1, "center");
    text(g.bonus ? "BONUS" : "R" + g.round, W - 4, 3, P.dim, 1, "right");
    // Time until the Defender goes HOT: a shrinking bar under HI (green, yellow for the last 10 s,
    // blinking red for the last 5 s); once HOT it becomes the word itself.
    if (!g.bonus && g.rules && !DEGRADE && !g.cleared) {
      const total = SKY.hotTime(g);
      const kT = timeCountK(g);
      // On the clear screen the fuse drains into the time bonus as it is counted.
      const draining = kT >= 0 && kT < 1;
      const left = kT >= 0 ? g.clearInfo.secsLeft * (1 - kT) : Math.max(0, total - g.roundT);
      if (g.alert) {
        if (g.phase !== "play" || (g.t * 3) % 1 < 0.6) text("HOT", W / 2, 10, P.warn, 1, "center");
      } else {
        const bw = 64;
        const x0 = Math.round(W / 2 - bw / 2);
        const fill = Math.round((bw * left) / total);
        const warn = kT < 0 && left <= 5; // (no warning while it drains into the bonus)
        // Amber, never the player's green: it is the Defender's fuse, and a tiny Defender sits at its
        // end to say so.
        const col = draining ? ((g.t * 16) % 1 < 0.5 ? "#ffffff" : P.score) : kT >= 0 ? P.fuse : warn ? P.warn : left <= 10 ? P.score : P.fuse;
        cx.fillStyle = "#1a1a2a";
        cx.fillRect(x0, 11, bw, 2);
        if (!warn || (g.t * 4) % 1 < 0.6) {
          cx.fillStyle = col;
          cx.fillRect(x0, 11, fill, 2);
        }
        cx.fillStyle = warn ? P.warn : P.def;
        cx.fillRect(x0 + bw + 3, 11, 6, 1);
        cx.fillRect(x0 + bw + 4, 10, 2, 1);
        cx.fillRect(x0 + bw + 5, 12, 3, 1);
        cx.fillStyle = P.flame;
        cx.fillRect(x0 + bw + 2, 11, 1, 1);
      }
    }
    // Captives still to haul: a small figure and a count, under the score.
    const left = g.bonus ? g.bonus.total - g.bonus.spawned + g.humans.length : g.humans.length;
    {
      const tx = W - 4 - String(left).length * 4 + 1;
      cx.fillStyle = P.human;
      cx.fillRect(tx - 4, 11, 1, 4);
      cx.fillStyle = P.humanHead;
      cx.fillRect(tx - 4, 10, 1, 1);
      text(String(left), W - 4, 10, P.human, 1, "right");
    }
    if (g.bonus && g.phase === "play") text(String(Math.ceil(g.bonus.t)), W / 2, 12, g.bonus.t < 5 ? P.warn : P.score, 2, "center");
    if (demo) return;
    if (g.bonus && g.phase === "ready") {
      text("BONUS STAGE", W / 2, 90, P.score, 2, "center");
      text("CATCH " + g.bonus.total, W / 2, 110, P.beam, 1, "center");
    } else if (g.bonus && g.phase === "clear") {
      const b = g.bonus;
      text(b.delivered + " / " + b.total, W / 2, 90, P.human, 2, "center");
      if (b.delivered >= b.total && (g.t * 4) % 1 < 0.7) text("PERFECT " + CFG.bonusPerfect * (g.rules.tour + 1), W / 2, 110, P.score, 2, "center");
    } else if (g.phase === "ready" && g.roundT === 0) {
      if (g.rules.firstOfPlanet) text("PLANET " + g.rules.planetName, W / 2, 78, PLANET_COLORS[g.rules.planet][0], 2, "center");
      text("ROUND " + g.round, W / 2, 96, P.text, 2, "center");
      text("HAUL " + g.humans.length, W / 2, 114, P.human, 1, "center");
      if (g.rules.tag) text(g.rules.tag, W / 2, 126, g.rules.tag === "ACE" ? P.warn : P.score, 1, "center");
    } else if (g.phase === "ready") {
      text("READY", W / 2, 100, P.lander, 2, "center");
    } else if (g.phase === "clear") {
      text("SKY CLEAR", W / 2, 84, P.lander, 2, "center");
      const ci = g.clearInfo || { bonus: CFG.roundBonus * (g.rules.tour + 1), secsLeft: 0, timeBonus: 0 };
      text("BONUS " + ci.bonus, W / 2, 104, P.score, 1, "center");
      if (ci.secsLeft > 0) {
        // Count the fuse's seconds up into points while the fuse itself drains (see the HUD).
        const k = timeCountK(g);
        const secs = Math.round(ci.secsLeft * k);
        const per = ci.timeBonus / ci.secsLeft;
        text("TIME " + secs + " x " + per + " = " + secs * per, W / 2, 116, P.fuse, 1, "center");
      }
    } else if (g.phase === "complete") {
      const c = g.complete;
      const shown = CFG.completeTime - g.phaseT;
      text("MISSION", W / 2, 70, P.lander, 3, "center");
      text("COMPLETE", W / 2, 92, P.lander, 3, "center");
      if (shown > 1.2) {
        const k = Math.min(1, (shown - 1.2) / 1.2);
        const ships = Math.round(c.lives * k);
        text("SHIPS " + ships + " x " + CFG.livesBonus + " = " + ships * CFG.livesBonus, W / 2, 126, P.score, 1, "center");
        // reserve landers march across as they are counted
        for (let i = 0; i < ships; i++) spr(LANDER, W / 2 - (c.lives - 1) * 8 + i * 16, 146, { g: P.lander, y: P.landerEye }, false);
      }
      if (shown > 3) text("SCORE " + String(g.score).padStart(6, "0"), W / 2, 164, P.text, 1, "center");
    } else if (g.phase === "over") {
      if (g.cleared) {
        text("MISSION COMPLETE", W / 2, 96, P.lander, 2, "center");
        text("SCORE " + String(g.score).padStart(6, "0"), W / 2, 116, P.text, 1, "center");
      } else text("GAME OVER", W / 2, 100, P.warn, 2, "center");
    }
  }

  function drawTitle() {
    text("SKYHAUL", W / 2, 62, P.lander, 4, "center");
    // The whole game inverts a genre everyone knows: say who you are, once.
    spr(LANDER, W / 2 - 50, 100, { g: P.lander, y: P.landerEye }, false);
    text("YOU ARE THE LANDER", W / 2 + 6, 98, P.lander, 1, "center");
    if ((app.frame / 30) % 2 < 1.4) text("PRESS SPACE", W / 2, 124, P.text, 1, "center");
    text("HI " + String(app.hi).padStart(6, "0"), W / 2, 140, P.dim, 1, "center");
  }

  // Ranking rows; `preview` shows the current run at its rank without writing storage.
  function drawTable(y0, preview) {
    let rows = readTable();
    let hi = app.newRank;
    if (preview) {
      rows = rows.slice();
      rows.splice(preview.rank, 0, { score: preview.score, name: (preview.name + "___").slice(0, 3) });
      rows = rows.slice(0, 5);
      hi = preview.rank;
    }
    text("BEST HAULERS", W / 2, y0, P.score, 1, "center");
    rows.forEach((r, i) => {
      const on = i === hi && (preview || (app.frame / 8) % 2 < 1.5);
      const col = i === hi ? P.lander : P.text;
      if (i === hi && !on) return;
      const y = y0 + 14 + i * 11;
      text(i + 1 + ".", 100, y, col, 1);
      text(r.name, 118, y, col, 1);
      text(String(r.score).padStart(6, "0"), 220, y, col, 1, "right");
    });
  }

  function drawEntry() {
    const e = app.entry;
    text("GREAT HAUL", W / 2, 28, P.score, 2, "center");
    drawTable(52, { rank: e.rank, score: e.score, name: e.name });
    BOARD.forEach((c, i) => {
      const x = BX + (i % BCOLS) * BCW;
      const y = BY + Math.floor(i / BCOLS) * BCH;
      const sel = i === e.cursor;
      if (sel) {
        cx.fillStyle = (app.frame / 6) % 2 < 1 ? P.lander : "#1a7a2a";
        cx.fillRect(x + 1, y - 2, BCW - 2, BCH - 3);
      }
      text(c, x + BCW / 2, y + 1, sel ? "#000" : c === "END" ? P.score : c === "DEL" ? P.warn : P.text, 1, "center");
    });
    text(String(Math.ceil(e.t)), W - 8, H - 12, P.dim, 1, "right");
  }

  // ------------------------------------------------------------------ loop
  function resize() {
    const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    cv.style.width = W * s + "px";
    cv.style.height = H * s + "px";
  }
  addEventListener("resize", resize);
  resize();

  function tick(now) {
    const dt = app.paused ? 0 : Math.min(0.1, (now - (app.last || now)) / 1000);
    app.last = now;
    app.acc += dt;
    app.frame++;
    while (app.acc >= CFG.dt) {
      app.acc -= CFG.dt;
      stepOnce();
    }
    render();
    requestAnimationFrame(tick);
  }

  // Render-only motion feel, updated per tick: the lander banks into its horizontal motion (slower
  // to settle the heavier the haul) and puffs exhaust opposite to the held direction.
  function feelTick(g, inp) {
    const L = g.lander;
    // While the lander goes down, the Defender rolls in triumph and sheds stars.
    if (g.phase === "dying" && g.def && app.modeT % 3 === 0 && g.def.x > 0 && g.def.x < W)
      app.fx.push({ k: "p", x: g.def.x - g.def.dir * 8, y: g.def.y + (Math.random() - 0.5) * 6, vx: -g.def.dir * 20, vy: (Math.random() - 0.5) * 20, life: 0.5, t: 0, color: Math.random() < 0.5 ? "#ffffff" : P.score });
    if (!L || !L.alive || L.docked || g.phase !== "play") {
      app.lean *= 0.8;
      return;
    }
    const w = SKY.chainWeight(g);
    const target = Math.max(-1, Math.min(1, L.vx / CFG.landerSpeed)) * 1.4;
    app.lean += (target - app.lean) * Math.min(1, (10 / (1 + 0.3 * w)) * CFG.dt);
    const m = Math.hypot(inp.dx || 0, inp.dy || 0);
    app.puffT = (app.puffT || 0) - 1;
    if (m > 0.3 && app.puffT <= 0) {
      app.puffT = 3;
      const ux = inp.dx / m;
      const uy = inp.dy / m;
      app.fx.push({ k: "p", x: L.x - ux * 5, y: L.y + 3 - uy * 3, vx: -ux * 40 + (Math.random() - 0.5) * 10, vy: 25 - uy * 30, life: 0.22, t: 0, color: Math.random() < 0.5 ? P.flame : P.landerEye });
    }
  }

  function stepDemo() {
    if (!app.demo || app.demo.phase === "over") startDemo();
    SKY.step(app.demo, app.demoBot(app.demo));
    handleEvents(app.demo, false);
  }

  function stepOnce() {
    app.modeT++;
    const secs = app.modeT * CFG.dt;
    if (app.mode === "play") {
      const g = app.game;
      const inp = readInput();
      SKY.step(g, inp);
      handleEvents(g, true);
      feelTick(g, inp);
      // HUD score rolls up (fast enough that a big haul spins for about a second). On the clear
      // screen the time bonus is held back until the fuse has drained it in.
      const kT = timeCountK(g);
      const pending = kT >= 0 ? Math.round((g.clearInfo.timeBonus * (1 - kT)) / 10) * 10 : 0;
      const target = g.score - pending;
      if (app.shownScore > g.score) app.shownScore = g.score;
      else if (app.shownScore < target) app.shownScore = Math.min(target, app.shownScore + Math.max(10, Math.ceil((target - app.shownScore) * 0.08 / 10) * 10));
      const w = g.phase === "play" && g.lander.alive && !g.lander.docked ? SKY.chainWeight(g) : 0;
      SKYAUDIO.engine(w);
      if (g.phase === "over") {
        SKYAUDIO.engine(0);
        setMode("over");
      }
    } else if (app.mode === "over") {
      handleEvents(app.game, false);
      if (secs > 3) {
        const rank = rankFor(app.game.score);
        if (rank >= 0) startEntry(app.game.score, rank);
        else setMode("table");
      }
    } else if (app.mode === "entry") {
      app.entry.t -= CFG.dt;
      if (app.entry.t <= 0) entryFinish();
    } else {
      // attract cycle
      stepDemo();
      if (app.mode === "title" && secs > 6) {
        startDemo();
        setMode("demo");
      } else if (app.mode === "demo" && (secs > 30 || app.demo.phase === "over")) setMode("table");
      else if (app.mode === "table" && secs > 6) {
        app.newRank = -1;
        setMode("title");
      }
    }
    updateFx(CFG.dt);
  }

  function render() {
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.fillStyle = app.flash > 0 && (app.flash * 20) % 2 < 1 ? "#1a2a1a" : P.bg;
    cx.fillRect(0, 0, W, H);
    if (app.shake > 0) cx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
    if (app.mode === "title" || app.mode === "table") {
      drawWorld(app.demo || SKY.createGame(1));
      drawFx();
      cx.fillStyle = "rgba(0,0,0,0.7)";
      cx.fillRect(0, 40, W, 120);
      if (app.mode === "title") drawTitle();
      else drawTable(58, null);
    } else if (app.mode === "demo") {
      drawWorld(app.demo);
      drawFx();
      drawHud(app.demo, true);
      if ((app.frame / 30) % 2 < 1.4) text("PRESS SPACE", W / 2, 100, P.text, 1, "center");
    } else if (app.mode === "entry") {
      cx.fillStyle = P.bg;
      cx.fillRect(0, 0, W, H);
      drawEntry();
    } else {
      drawWorld(app.game);
      drawFx();
      if (app.hotPulse > 0 && (app.hotPulse * 8) % 1 < 0.55) {
        // HOT: the screen edge throbs red for a moment.
        cx.fillStyle = P.warn;
        cx.fillRect(0, 0, W, 2);
        cx.fillRect(0, H - 2, W, 2);
        cx.fillRect(0, 0, 2, H);
        cx.fillRect(W - 2, 0, 2, H);
      }
      drawHud(app.game, false);
    }
  }

  // Test boundary: pause the real-time loop and advance/draw explicit ticks (frame capture).
  window.__sky = { app, readInput, startGame, keys, readTable, rankFor, setMode, stepOnce, render };
  requestAnimationFrame(tick);
})();
