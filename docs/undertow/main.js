// UNDERTOW browser shell: rendering, input, radar, attract loop, effects.
(function () {
  "use strict";
  const { W, H, DT, WORLD, HOME, PORT, CFG, dx, wrap } = UT;
  const A = UTAudio;
  const cv = document.getElementById("screen");
  const g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;

  // ---- palette ---------------------------------------------------------------------------
  const COL = {
    sky: "#000000",
    surf: "#3fe0ff",
    band: "#0a3a8c", // firing band: the only water where a torpedo can strike a hull
    sea: ["#06246a", "#051d57", "#041746", "#031136", "#020b27", "#01061a"],
    bed: "#6b4a26",
    bedDark: "#3a2612",
    sub: "#ffe23f",
    subDark: "#b08a10",
    lamp: "#ffffff",
    lampOff: "#5a4a10",
    transport: "#ff6a1f",
    transportDark: "#8a2a08",
    escort: "#a9b3c4",
    escortDark: "#4b5465",
    esub: "#c060ff",
    esubDark: "#5a2080",
    captive: "#ffffff",
    charge: "#ff3030",
    chargeLit: "#ffe23f",
    home: "#44ff66",
    port: "#ff2a2a",
    text: "#ffffff",
    dim: "#7f8aa3",
    radarBg: "#000c24",
    radarLine: "#1f4fa0",
  };

  // ---- 5x7 font (same glyph set as WRECKFALL, this repository) ----------------------------
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
    9: "01110100011000101111000010001001100", "-": "00000000000000011111000000000000000", "+": "00000001000010011111001000010000000",
    "!": "00100001000010000100001000000000100", ".": "00000000000000000000000000110001100", ":": "00000011000110000000011000110000000",
    "=": "00000000001111100000111110000000000", "?": "01110100010000100010001000000000100", "'": "00100001000100000000000000000000000",
    "/": "00001000100001000100010000100010000", "<": "00010001000100010000010000010000010", ">": "01000001000001000001000100010001000",
    "×": "00000100010101000100010101000100000",
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
  const rect = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  };

  // ---- input -----------------------------------------------------------------------------
  const keys = {};
  const FIRE_KEYS = ["KeyZ", "KeyX", "Space", "KeyJ"];
  let anyPress = false;
  let firePresses = 0; // presses not yet delivered to the core
  let lastFire = false;
  addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    if (!keys[e.code]) {
      anyPress = true;
      if (FIRE_KEYS.includes(e.code)) firePresses++;
      if (e.code === "Enter") anyPress = true;
    }
    keys[e.code] = true;
    A.init();
    if (e.code === "KeyM") A.toggleMute();
  });
  addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });
  addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
  });

  // touch: left 60% is a floating stick, right 40% is the trigger
  const touch = { stick: null, sx: 0, sy: 0, x: 0, y: 0, fire: null, tap: 0 };
  function toGame(t) {
    const r = cv.getBoundingClientRect();
    return { x: ((t.clientX - r.left) / r.width) * W, y: ((t.clientY - r.top) / r.height) * H };
  }
  cv.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      A.init();
      anyPress = true;
      for (const t of e.changedTouches) {
        const p = toGame(t);
        if (p.x < W * 0.6 && touch.stick === null) {
          touch.stick = t.identifier;
          touch.sx = p.x;
          touch.sy = p.y;
          touch.x = touch.y = 0;
        } else if (touch.fire === null) {
          touch.fire = t.identifier;
          touch.tap = 3;
        }
      }
    },
    { passive: false }
  );
  cv.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches)
        if (t.identifier === touch.stick) {
          const p = toGame(t);
          const f = (d) => (Math.abs(d) < 4 ? 0 : Math.max(-1, Math.min(1, d / 18)));
          touch.x = f(p.x - touch.sx);
          touch.y = f(p.y - touch.sy);
        }
    },
    { passive: false }
  );
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stick) {
        touch.stick = null;
        touch.x = touch.y = 0;
      }
      if (t.identifier === touch.fire) touch.fire = null;
    }
  };
  cv.addEventListener("touchend", endTouch);
  cv.addEventListener("touchcancel", endTouch);
  cv.addEventListener("mousedown", () => {
    A.init();
    anyPress = true;
  });

  let padFirePrev = false;
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = Math.abs(p.axes[0]) > 0.25 ? p.axes[0] : 0;
      const ay = Math.abs(p.axes[1]) > 0.25 ? p.axes[1] : 0;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const fire = b(0) || b(1) || b(2) || b(3);
      if ((fire && !padFirePrev) || b(9)) anyPress = true;
      padFirePrev = fire;
      return {
        x: ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0),
        y: ay + (b(13) ? 1 : 0) - (b(12) ? 1 : 0),
        fire,
      };
    }
    return null;
  }

  function readInput() {
    let x = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    let y = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    let fire = FIRE_KEYS.some((k) => keys[k]) || touch.tap > 0;
    const pad = readPad();
    if (pad) {
      x += pad.x;
      y += pad.y;
      fire = fire || pad.fire;
    }
    x += touch.x;
    y += touch.y;
    // a press always reaches the core as a rising edge, even when it lands within one tick of
    // the previous release: send one released tick first, then the press
    if (firePresses > 0) {
      if (lastFire) fire = false;
      else {
        fire = true;
        firePresses = 0;
      }
    }
    lastFire = fire;
    if (touch.tap > 0) touch.tap--;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), fire };
  }

  // ---- app state -------------------------------------------------------------------------
  let hi = 0;
  try {
    hi = +localStorage.getItem("undertow.hi") || 0;
  } catch (e) {
    hi = 0;
  }
  let app = "title";
  let appT = 0;
  let game = null;
  let demoBot = null;
  let fx = null;
  let seedN = (Date.now() & 0xffff) | 1;
  let newHi = false;
  let autopilot = null; // video recorder hook: replays precomputed inputs in a normal, audible game

  function resetFx() {
    fx = {
      cam: HOME,
      lead: 40,
      shake: 0,
      flash: 0,
      flashCol: "#fff",
      hitstop: 0,
      parts: [],
      pops: [],
      bubbles: [],
      banner: null,
      pingT: 0.5,
      sweep: 0,
      radarBlips: [],
      townPulse: 0,
      fullT: 0,
      unloadGlow: 0,
      cargoFlash: 0,
      dispScore: 0,
      lastCargo: 0,
      bedMarks: [],
      spillMarks: [],
      saveFly: [], // green figures flying from where people were brought home to the extend gauge
      shownSaved: 0, // people shown as counted in the gauge
      gaugeFlash: 0,
      lostFly: [], // red figures flying from where someone was lost to the loss counter
      shownLost: 0, // counter slots already crossed out
      lostHold: 0, // keep the full row showing briefly after it costs a sub
      lifeFlash: 0,
      kick: { x: 0, y: 0 }, // directional camera push (decays to rest)
      rings: [], // expanding light rings for the biggest rewards
      toss: new Map(), // spilled survivor id -> toss start time (render-only arc)
      turn: 0, // sub turning animation timer
      lastFace: 1,
      wakeT: 0,
    };
  }
  resetFx();

  function startGame(demo) {
    game = UT.newGame(seedN++);
    resetFx();
    fx.cam = game.player.x;
    demoBot = demo ? UTBots.plannerBot({ seed: seedN }) : null;
    app = demo ? "demo" : "play";
    appT = 0;
    newHi = false;
    if (!demo) A.sfx.start();
  }

  // ---- world -> screen -------------------------------------------------------------------
  const sx = (wx) => W / 2 + dx(fx.cam, wx);
  const onScreen = (x, m) => x > -(m || 24) && x < W + (m || 24);

  // seabed profile: integer harmonics keep it seamless around the ring
  const bedH = (x) => {
    const a = (x / WORLD) * Math.PI * 2;
    return Math.round(3 + 2.2 * Math.sin(a * 7) + 1.6 * Math.sin(a * 19 + 1) + 1.1 * Math.sin(a * 41 + 2));
  };

  // ---- effects ---------------------------------------------------------------------------
  function burst(x, y, n, col, spd, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.3 + Math.random() * 0.7);
      fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: life * (0.6 + Math.random() * 0.4), col });
    }
  }
  function pop(x, y, str, col, big) {
    // big announcements that overlap in time stack instead of printing over each other
    if (big) y += fx.pops.filter((q) => q.big).length * 10;
    fx.pops.push({ x, y, str, col, t: 0, big: !!big });
  }
  function bubble(x, y, n, rise) {
    for (let i = 0; i < n; i++) fx.bubbles.push({ x: x + (Math.random() * 2 - 1) * 4, y: y + Math.random() * 4, vy: -(14 + Math.random() * 18) * (rise || 1), ph: Math.random() * 6 });
  }
  function kick(dirX, dirY, amount) {
    fx.kick.x += dirX * amount;
    fx.kick.y += dirY * amount;
    const m = Math.hypot(fx.kick.x, fx.kick.y);
    if (m > 6) {
      fx.kick.x *= 6 / m;
      fx.kick.y *= 6 / m;
    }
  }

  function handleEvents(gm, audible) {
    const p = gm.player;
    for (const e of gm.events) {
      const x = e.x != null ? sx(e.x) : null;
      const snd = audible ? A.sfx : null;
      switch (e.type) {
        case "fire":
          snd && snd.fire(x, e.band);
          bubble(e.x, e.y, 3);
          break;
        case "sink": {
          const col = e.kind === "ship" ? COL.transport : e.kind === "dd" ? COL.escort : COL.esub;
          if (e.kind === "dd") pop(e.x, e.y + 8, "" + CFG.pts.dd, COL.escort);
          snd && snd.sink(x, e.n, e.kind);
          // the core moment: weight grows with how many were aboard
          fx.hitstop = 2 + Math.min(4, e.n);
          const dirX = Math.sign(dx(p.x, e.x)) || 1; // push along the torpedo's run
          kick(dirX, 0.3, 2 + Math.min(3, e.n));
          burst(e.x, e.y - 2, 10 + e.n * 3, col, 70, 0.6);
          burst(e.x, e.y - 2, 4 + e.n * 2, "#ffe23f", 50, 0.4);
          bubble(e.x, e.y + 4, 8 + e.n * 2);
          if (e.n > 0) {
            pop(e.x, e.y + 8, "" + CFG.pts.perLoad * e.n, col);
            fx.spillMarks.push({ x: e.x, y: e.y, n: e.n, t: 0 });
            // everyone aboard is thrown clear in a short arc before they start to sink
            for (const c of gm.captives) if (c.spill === e.spill) fx.toss.set(c.id, { t0: gm.t, dir: Math.sign(dx(e.x, c.x)) || (Math.random() < 0.5 ? -1 : 1) });
          }
          break;
        }
        case "catch":
          snd && snd.catch(x, e.cargo);
          burst(e.x, e.y, 4, "#ffffff", 26, 0.25);
          fx.cargoFlash = 0.25;
          break;
        case "allSaved":
          snd && snd.allSaved(x, e.n);
          fx.flash = 0.1;
          fx.flashMax = 0.15;
          fx.flashCol = "#ffe23f";
          pop(e.x, e.y + 10, "ALL SAVED +" + e.bonus, "#ffe23f", true);
          fx.rings.push({ x: e.x, y: e.y, t: 0, life: 0.7, r: 46, col: "#ffe23f" });
          fx.rings.push({ x: e.x, y: e.y, t: -0.12, life: 0.7, r: 30, col: "#ffffff" });
          fx.radarBlips.push({ x: e.x, y: e.y, t: 0, col: "#ffe23f", big: true });
          burst(e.x, e.y, 26, "#ffe23f", 80, 0.8);
          break;
        case "deliver":
          snd && snd.deliver(e.left);
          fx.townPulse = 0.3;
          fx.unloadGlow = 0.3;
          // one running total per unloading, not a pile of "+100"s
          if (fx.deliverPop && fx.deliverPop.t < 0.6 && fx.pops.includes(fx.deliverPop)) {
            fx.deliverPop.sum += CFG.pts.deliver;
            fx.deliverPop.str = "+" + fx.deliverPop.sum;
            fx.deliverPop.t = 0;
          } else {
            pop(HOME, CFG.surf + CFG.homeDY + 4, "+" + CFG.pts.deliver, COL.home); // just under the unloading window
            fx.deliverPop = fx.pops[fx.pops.length - 1];
            fx.deliverPop.sum = CFG.pts.deliver;
          }
          break;
        case "extend":
          snd && A.sfx.extend();
          fx.banner = { str: "EXTRA SUB", col: COL.home, t: 0, life: 1.6 };
          break;
        case "drown":
          snd && snd.drown(x);
          bubble(e.x, CFG.seabed - 2, 6);
          fx.bedMarks.push({ x: e.x, t: 0 });
          fx.radarBlips.push({ x: e.x, y: CFG.seabed, t: 0, col: COL.port });
          break;
        case "captiveBlasted":
          snd && snd.captiveBlasted(x);
          burst(e.x, e.y, 5, "#ff8080", 25, 0.3);
          break;
        case "mineTell":
          snd && onScreen(x) && snd.tell(x);
          break;
        case "mineDrop":
          snd && onScreen(x) && snd.drop(x);
          break;
        case "grab":
          snd && onScreen(x) && snd.grab(x, e.load);
          fx.radarBlips.push({ x: e.x, y: e.y, t: 0, col: e.kind === "ship" ? COL.transport : COL.esub });
          break;
        case "chargeTell":
          snd && onScreen(x, 60) && snd.tell(x);
          break;
        case "chargeDrop":
          snd && onScreen(x, 60) && snd.drop(x);
          break;
        case "saved": {
          const onMain = onScreen(sx(e.x), 0);
          const x0 = onMain ? sx(e.x) : rx(e.x);
          const y0 = onMain ? e.y : ry(e.y);
          for (let k = 0; k < e.n; k++) fx.saveFly.push({ x0, y0, t: -k * 0.07 });
          break;
        }
        case "lostCount": {
          // from the spot on screen (or its radar blip if it is off screen) to the counter
          const onMain = onScreen(sx(e.x), 0) && e.y > 36;
          const x0 = onMain ? sx(e.x) : rx(e.x);
          const y0 = onMain ? e.y : ry(e.y);
          for (let k = 0; k < e.n; k++) fx.lostFly.push({ x0, y0, t: -k * 0.1 });
          break;
        }
        case "bump":
          snd && snd.bump(x);
          fx.shake = Math.max(fx.shake, 1.5);
          break;
        case "wave":
          fx.cam = gm.player.x; // the new wave opens at our harbour
          fx.lead = 40;
          break;
        case "flee":
          snd && snd.flee(x);
          fx.radarBlips.push({ x: e.x, y: e.y, t: 0, col: COL.port, big: true });
          break;
        case "launch":
          snd && snd.launch();
          fx.radarBlips.push({ x: e.x, y: e.y, t: 0, col: COL.port });
          break;
        case "eaim":
          snd && onScreen(x, 60) && snd.aim(x);
          break;
        case "efire":
          snd && onScreen(x, 60) && snd.efire(x);
          break;
        case "breach":
          snd && onScreen(x) && snd.splash(x);
          burst(e.x, CFG.surf - 1, 5, "#6fb8ff", 30, 0.3);
          break;
        case "hand":
          snd && snd.catch(sx(e.x), Math.min(6, e.load));
          fx.cargoFlash = 0.2;
          break;
        case "ferryTurn":
          snd && snd.ferryTurn();
          break;
        case "ferryHome":
          snd && snd.ferryHome(e.n);
          fx.townPulse = 0.5;
          pop(HOME, CFG.surf + CFG.homeDY + 4, "+" + CFG.pts.deliver * e.n, COL.home);
          break;
        case "shellTell":
          snd && onScreen(x, 80) && (e.at === "sub" ? snd.tell(x) : snd.aim(x));
          break;
        case "shellFire":
          snd && snd.shellFire(x);
          break;
        case "ferryHit":
          snd && snd.ferryHit(x);
          fx.ferryHitT = 0.4;
          fx.shake = Math.max(fx.shake, 2);
          burst(e.x, CFG.surf - 4, 12, "#ff8a1f", 50, 0.5);
          break;
        case "ferrySink":
          snd && snd.sink(x, e.n, "ship");
          fx.shake = Math.max(fx.shake, 4);
          burst(e.x, CFG.surf - 2, 24, COL.home, 70, 0.7);
          bubble(e.x, CFG.surf + 6, 12);
          fx.radarBlips.push({ x: e.x, y: CFG.surf, t: 0, col: COL.home, big: true });
          if (e.n) fx.banner = { str: "FERRY SUNK", col: COL.port, t: 0, life: 1.4 };
          break;
        case "ferryLaunch":
          fx.radarBlips.push({ x: e.x, y: CFG.surf, t: 0, col: COL.home });
          break;
        case "splash":
          snd && onScreen(x) && snd.splash(x);
          bubble(e.x, CFG.surf + 2, 5);
          burst(e.x, CFG.surf - 2, 6, "#6fb8ff", 40, 0.4);
          break;
        case "mineFizzle":
          bubble(e.x, e.y, 3);
          break;
        case "blast": {
          snd && onScreen(x, 60) && snd.blast(x);
          const d = Math.abs(dx(e.x, p.x));
          if (d < 90) fx.shake = Math.max(fx.shake, d < 30 ? 3 : 1.5);
          bubble(e.x, e.y, 6);
          break;
        }
        case "taken":
          fx.portFlash = 0.6;
          snd && snd.escape();
          fx.radarBlips.push({ x: e.x, y: CFG.surf, t: 0, col: COL.port, big: true });
          fx.banner = { str: e.n + " TAKEN", col: COL.port, t: 0, life: 1.4 };
          break;
        case "death":
          if (e.cause === "lost") {
            // recalled, not sunk: no explosion; the sub blinks and rises away in a trail of bubbles
            fx.banner = { str: CFG.lostPerMiss + " LOST", col: COL.port, t: 0, life: 1.8 };
            fx.lostHold = 1.4;
            fx.lifeFlash = 1.4;
            fx.recall = { x: e.x, y: e.y, face: p.face, t: 0 };
            snd && snd.recall();
            break;
          }
          snd && snd.death(x);
          fx.shake = 6;
          fx.flash = 0.18;
          fx.flashMax = 0.4;
          fx.flashCol = "#ff5a3a";
          burst(e.x, e.y, 36, COL.sub, 90, 1.0);
          burst(e.x, e.y, 20, "#ffffff", 60, 0.6);
          bubble(e.x, e.y, 14);
          break;
        case "clear":
          audible && A.sfx.clear(e.perfect);
          break;
        case "over":
          audible && e.why !== "allclear" && A.sfx.over();
          break;
      }
    }
    if (p.cargo >= CFG.capacity && fx.lastCargo < CFG.capacity) {
      audible && A.sfx.full(sx(p.x));
      fx.fullT = 1.2;
    }
    fx.lastCargo = p.cargo;
  }

  function updateFx(dt, gm, audible) {
    fx.shake = Math.max(0, fx.shake - dt * 14);
    const kd = Math.exp(-dt * 14);
    fx.kick.x *= kd;
    fx.kick.y *= kd;
    for (const r of fx.rings) r.t += dt;
    fx.rings = fx.rings.filter((r) => r.t < r.life);
    for (const [id, v] of fx.toss) if (gm.t - v.t0 > 0.6) fx.toss.delete(id);
    // sub: turning animation and a wake that gets heavier with the load aboard
    {
      const p = gm.player;
      if (p.face !== fx.lastFace) {
        fx.turn = 0.12;
        fx.lastFace = p.face;
      }
      fx.turn = Math.max(0, fx.turn - dt);
      if (p.alive) {
        const speed = Math.hypot(p.vx, p.vy);
        fx.wakeT += dt * speed * 0.18;
        while (fx.wakeT >= 1) {
          fx.wakeT -= 1;
          const load = p.cargo / CFG.capacity;
          bubble(p.x - p.face * 11, p.y + 1, 1, 1 - 0.6 * load);
        }
      }
    }
    fx.ferryHitT = Math.max(0, (fx.ferryHitT || 0) - dt);
    fx.flash = Math.max(0, fx.flash - dt);
    fx.townPulse = Math.max(0, fx.townPulse - dt);
    fx.lostFlash = Math.max(0, (fx.lostFlash || 0) - dt);
    fx.lostHold = Math.max(0, fx.lostHold - dt);
    fx.lifeFlash = Math.max(0, fx.lifeFlash - dt);
    fx.portFlash = Math.max(0, (fx.portFlash || 0) - dt);
    if (fx.recall) {
      fx.recall.t += dt;
      if (Math.random() < 0.6) bubble(fx.recall.x + (Math.random() * 2 - 1) * 6, fx.recall.y - fx.recall.t * 40, 1);
      if (fx.recall.t > 1.1) fx.recall = null;
    }
    fx.gaugeFlash = Math.max(0, fx.gaugeFlash - dt);
    for (const f of fx.saveFly) {
      f.t += dt;
      if (f.t >= SAVE_FLY && !f.done) {
        f.done = true;
        fx.shownSaved++;
        fx.gaugeFlash = fx.shownSaved % CFG.extendEvery === 0 ? 1.2 : Math.max(fx.gaugeFlash, 0.15);
      }
    }
    fx.saveFly = fx.saveFly.filter((f) => !f.done);
    for (const f of fx.lostFly) {
      f.t += dt;
      if (f.t >= LOST_FLY && !f.done) {
        f.done = true;
        fx.shownLost = Math.min(CFG.lostPerMiss, fx.shownLost + 1);
        fx.lostFlash = 0.3;
      }
    }
    fx.lostFly = fx.lostFly.filter((f) => !f.done);
    if (gm.lostRun < fx.shownLost && fx.lostFly.length === 0 && fx.lostHold <= 0) fx.shownLost = gm.lostRun;
    fx.unloadGlow = Math.max(0, fx.unloadGlow - dt);
    fx.cargoFlash = Math.max(0, fx.cargoFlash - dt);
    fx.fullT = Math.max(0, fx.fullT - dt);
    for (const q of fx.parts) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.96;
      q.vy = q.vy * 0.96 + 20 * dt;
    }
    fx.parts = fx.parts.filter((q) => q.t < q.life);
    for (const b of fx.bubbles) {
      b.y += b.vy * dt;
      b.ph += dt * 8;
    }
    fx.bubbles = fx.bubbles.filter((b) => b.y > CFG.surf + 1);
    for (const q of fx.pops) q.t += dt;
    fx.pops = fx.pops.filter((q) => q.t < (q.big ? 1.6 : 0.8));
    for (const m of fx.bedMarks) m.t += dt;
    fx.bedMarks = fx.bedMarks.filter((m) => m.t < 3);
    for (const b of fx.radarBlips) b.t += dt;
    for (const q of fx.spillMarks) q.t += dt;
    fx.spillMarks = fx.spillMarks.filter((q) => q.t < 1);
    fx.radarBlips = fx.radarBlips.filter((b) => b.t < 1.2);
    if (fx.banner) {
      fx.banner.t += dt;
      if (fx.banner.t > fx.banner.life) fx.banner = null;
    }
    // camera: look ahead of the bow, ease when turning
    const p = gm.player;
    fx.lead += (p.face * 52 - fx.lead) * (1 - Math.exp(-2.2 * dt));
    const target = wrap(p.x + fx.lead);
    fx.cam = wrap(fx.cam + dx(fx.cam, target) * (1 - Math.exp(-8 * dt)));
    // sonar ping: faster and higher while someone is sinking near the bottom
    let urgency = 0;
    for (const c of gm.captives) urgency = Math.max(urgency, (c.y - CFG.surf) / (CFG.seabed - CFG.surf));
    fx.pingT -= dt;
    fx.sweep += dt / (gm.captives.length ? 1.2 : 2.4);
    if (fx.pingT <= 0 && gm.mode === "play") {
      fx.pingT = gm.captives.length ? 1.2 : 2.4;
      fx.sweep = 0;
      audible && A.sfx.ping(urgency);
    }
    fx.dispScore += (gm.score - fx.dispScore) * Math.min(1, dt * 12);
    if (Math.abs(gm.score - fx.dispScore) < 1) fx.dispScore = gm.score;
  }

  // ---- drawing: world --------------------------------------------------------------------
  const SEA_TOP = CFG.surf;
  function drawSea(gm) {
    // sky strip
    rect(0, 36, W, SEA_TOP - 36, COL.sky);
    // port and home surface zones
    const bandH = gm.spec.gunReach; // the deck guns' reach
    rect(0, SEA_TOP, W, bandH, COL.band);
    const depthRows = COL.sea.length;
    const rows = (CFG.seabed - SEA_TOP - bandH) / depthRows;
    for (let i = 0; i < depthRows; i++) rect(0, SEA_TOP + bandH + i * rows, W, Math.ceil(rows), COL.sea[i]);
    // surface ripple: scrolls with the world so the field reads as moving
    const t = gm.t;
    for (let x = 0; x < W; x += 2) {
      const wx = wrap(fx.cam - W / 2 + x);
      const k = Math.floor(wx / 6 + t * 1.5) % 4;
      rect(x, SEA_TOP - (k === 0 ? 1 : 0), 2, 1, COL.surf);
    }
    // band lower edge: a dotted line marks the torpedo depth
    for (let x = 0; x < W; x += 4) {
      const wx = Math.floor(wrap(fx.cam - W / 2 + x));
      if ((wx >> 2) % 2 === 0) rect(x, SEA_TOP + gm.spec.gunReach, 2, 1, "#1b5ab8");
    }
    // seabed
    for (let x = 0; x < W; x += 2) {
      const wx = wrap(fx.cam - W / 2 + x);
      const h = bedH(wx);
      rect(x, CFG.seabed - h + 3, 2, H - CFG.seabed + h, COL.bedDark);
      rect(x, CFG.seabed - h + 3, 2, 1, COL.bed);
    }
    rect(0, CFG.seabed, W, 1, "#8a1a1a");
  }

  function drawHome(gm) {
    const x = sx(HOME);
    if (!onScreen(x, 40)) return;
    const y = SEA_TOP;
    // jetty and houses of the town
    rect(x - 22, y - 3, 44, 3, "#2f7a3f");
    const houses = 8;
    for (let i = 0; i < 8; i++) {
      const hx = x - 20 + i * 5;
      if (i < houses) {
        rect(hx, y - 7, 4, 4, "#2f7a3f");
        rect(hx + 1, y - 6, 2, 2, fx.townPulse > 0 && i === houses - 1 ? "#ffffff" : "#ffe23f");
      } else rect(hx, y - 4, 4, 1, "#1a3a22");
    }
    // lighthouse: a beam turning over the sky (theirs sweeps the water for prey; ours shows the
    // way home). Brighter while survivors are aboard; a flash for each one brought home.
    rect(x - 1, y - 15, 3, 12, "#ffffff");
    rect(x - 2, y - 17, 5, 2, COL.home);
    {
      const ang = gm.t * 1.6;
      const reach = 70;
      const bx = Math.cos(ang) * reach;
      const by = -Math.abs(Math.sin(ang)) * 2; // nearly level: the sky strip is only 16 px tall
      const carrying = gm.player.alive && gm.player.cargo > 0;
      const glow = Math.max(fx.unloadGlow > 0 ? 0.55 : 0, carrying ? 0.35 : 0.18);
      g.globalAlpha = glow * (0.5 + 0.5 * Math.abs(Math.cos(ang)));
      g.fillStyle = "#ffffa0";
      g.beginPath();
      g.moveTo(x + 0.5, y - 14);
      g.lineTo(x + bx, y - 14 + by - 4);
      g.lineTo(x + bx, y - 14 + by + 4);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      rect(x - 1, y - 15, 3, 2, fx.unloadGlow > 0 ? "#ffffff" : "#ffffa0");
    }
    // unloading window
    const p = gm.player;
    const inside = p.cargo > 0 && Math.abs(dx(p.x, HOME)) < CFG.homeDX && p.y < CFG.surf + CFG.homeDY;
    if (inside || fx.unloadGlow > 0) {
      g.globalAlpha = 0.35;
      rect(x - CFG.homeDX, y, CFG.homeDX * 2, CFG.homeDY, COL.home);
      g.globalAlpha = 1;
    } else if (p.cargo > 0) {
      for (let i = 0; i < 4; i++) rect(x - CFG.homeDX + (i % 2) * (CFG.homeDX * 2 - 2), y + (i >> 1) * (CFG.homeDY - 1), 2, 1, COL.home);
    }
  }

  // our ferry: waits out on the sub's side of the ring, carries hand-overs home
  function drawFerry(gm) {
    const f = gm.ferry;
    if (!f.alive) return;
    const x = sx(f.x);
    if (!onScreen(x, 40)) return;
    const y = SEA_TOP;
    const hit = fx.ferryHitT > 0 && Math.floor(fx.ferryHitT * 20) % 2 === 0;
    const hull = hit ? "#ffffff" : COL.home;
    rect(x - 13, y - 3, 26, 5, hull);
    rect(x - 11, y + 2, 22, 2, "#1f6a2f");
    rect(x + f.dir * 13 - (f.dir < 0 ? 2 : 0), y - 5, 2, 4, hull);
    rect(x - 8, y - 9, 14, 6, hit ? "#ffffff" : "#d8ffe0");
    // one window per seat; lit = someone aboard
    for (let i = 0; i < CFG.ferryCap; i++) rect(x - 7 + (i % 4) * 3, y - 8 + (i >> 2) * 3, 2, 2, i < f.load ? "#ffe23f" : "#2f7a3f");
    // hull plates left
    for (let i = 0; i < CFG.ferryHP; i++) rect(x - 12 + i * 3, y + 5, 2, 1, i < f.hp ? COL.home : "#ff3030");
    // homeward pennant
    if (f.state === "return") rect(x - f.dir * 3, y - 14, 1, 5, "#ffffff"), rect(x - f.dir * 3 - (f.dir > 0 ? 3 : -1), y - 14, 3, 2, COL.home);
    // hand-over window
    const p = gm.player;
    if (p.alive && p.cargo > 0 && f.load < CFG.ferryCap) {
      const inside = Math.abs(dx(p.x, f.x)) < CFG.handDX && p.y < CFG.surf + CFG.handDY;
      if (inside) {
        g.globalAlpha = 0.3;
        rect(x - CFG.handDX, y, CFG.handDX * 2, CFG.handDY, COL.home);
        g.globalAlpha = 1;
      } else for (let i = 0; i < 4; i++) rect(x - CFG.handDX + (i % 2) * (CFG.handDX * 2 - 2), y + (i >> 1) * (CFG.handDY - 1), 2, 1, COL.home);
    }
  }

  // escort destroyer: long grey hull, raked bow, twin depth-charge racks astern
  function drawDestroyer(e, x, t) {
    const d = e.dir;
    const y = SEA_TOP;
    rect(x - 12, y - 3, 24, 4, COL.escort);
    rect(x - 10, y + 1, 20, 2, COL.escortDark);
    rect(x + d * 12 - (d < 0 ? 3 : 0), y - 4, 3, 3, COL.escort);
    rect(x - 4, y - 8, 8, 5, COL.escort);
    rect(x - 1 + d * 2, y - 12, 2, 4, COL.escortDark);
    const telling = e.dropT > 0 && Math.floor(t * 16) % 2 === 0;
    const rack = telling ? "#ffe23f" : e.state === "hunt" ? "#ff3030" : "#6a1010";
    rect(x - d * 11 - 1, y - 5, 3, 2, rack);
    rect(x - d * 8 - 1, y - 5, 3, 2, rack);
  }

  function drawCharge(c, t) {
    const x = sx(c.x);
    const lit = Math.floor(t * 12) % 2 === 0;
    rect(x - 2, c.y - 2, 4, 4, "#3a3a3a");
    rect(x - 1, c.y - 1, 2, 2, lit ? "#ffe23f" : "#ff3030");
  }

  // the blast zone a shell will cover: a half-disc under the surface, dotted
  function drawShellZone(x, col) {
    const R = CFG.shellBlastR;
    for (let a = 0; a <= Math.PI; a += Math.PI / 14) rect(x + Math.cos(a) * R, SEA_TOP + Math.sin(a) * R, 1, 1, col);
    rect(x - R, SEA_TOP, 2 * R + 1, 1, col);
  }

  function drawShell(sh, t) {
    const x = sx(sh.x);
    rect(x - 1, sh.y - 1, 3, 3, "#ffe23f");
    rect(x, sh.y, 1, 1, "#ff3030");
    // locked: the zone blinks faster as the shell comes down
    const tx = sx(sh.x1);
    const k = sh.t / CFG.shellFlight;
    if (onScreen(tx, 30)) drawShellZone(tx, Math.floor(t * (6 + 18 * k)) % 2 === 0 ? "#ff3030" : "#801818");
  }

  // gun laying on: a crosshair on the surface that follows its target, in step with the gun flash
  function drawShellAim(e, t) {
    const x = sx(e.aimX);
    if (!onScreen(x, 30)) return;
    const on = Math.floor(t * 16) % 2 === 0; // same beat as the deck-gun flash
    const c = on ? "#ffe23f" : "#ff8a1f";
    rect(x - 5, SEA_TOP - 1, 3, 1, c);
    rect(x + 3, SEA_TOP - 1, 3, 1, c);
    rect(x, SEA_TOP - 6, 1, 3, c);
    rect(x, SEA_TOP + 2, 1, 3, c);
    drawShellZone(x, on ? "#ff8a1f" : "#7a4010");
  }

  // Their port mirrors our harbour: the same jetty, block and tower, in their colours. Where our
  // town has houses and a lighthouse, theirs has a barred holding block and a crane with a
  // searchlight. One barred window lights for every person carried in this wave.
  function drawPort(gm) {
    const x = sx(PORT);
    if (!onScreen(x, 60)) return;
    const y = SEA_TOP;
    // jetty (same footprint as ours)
    rect(x - 22, y - 3, 44, 3, "#5a1018");
    // holding block: eight cells, lit (barred) as people are brought in
    const held = Math.min(8, gm.waveStats ? gm.waveStats.taken : 0);
    for (let i = 0; i < 8; i++) {
      const hx = x - 20 + i * 5;
      rect(hx, y - 7, 4, 4, "#5a1018");
      const lit = i < held;
      const flash = lit && i === held - 1 && fx.portFlash > 0 && Math.floor(fx.portFlash * 12) % 2 === 0;
      rect(hx + 1, y - 6, 2, 2, flash ? "#ffffff" : lit ? "#ff5a3a" : "#2a0508");
      if (lit) rect(hx + 1, y - 6, 1, 2, "#5a1018"); // bars
    }
    // crane tower where our lighthouse stands, with a searchlight sweeping the water
    rect(x - 1, y - 15, 3, 12, "#8a2a2a");
    rect(x - 2, y - 17, 5, 2, COL.port);
    rect(x + 1, y - 22, 1, 5, "#8a2a2a");
    rect(x + 1, y - 22, 9, 1, "#8a2a2a"); // jib
    rect(x + 9, y - 21, 1, 3, "#8a2a2a"); // hook line
    const sweep = Math.sin(gm.t * 1.3);
    g.globalAlpha = 0.25;
    g.fillStyle = "#ff8a6a";
    g.beginPath();
    g.moveTo(x, y - 16);
    g.lineTo(x + sweep * 40 - 6, y + 2);
    g.lineTo(x + sweep * 40 + 6, y + 2);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }


  // raider grab-ship: a low hull with a crane arm that reaches down into the water
  function drawShip(e, x, t) {
    const d = e.dir;
    const y = SEA_TOP;
    rect(x - 11, y - 3, 22, 5, COL.transport);
    rect(x - 9, y + 2, 18, 2, COL.transportDark);
    rect(x + d * 11 - (d < 0 ? 2 : 0), y - 5, 2, 4, COL.transport);
    rect(x - 7, y - 8, 11, 5, COL.transportDark);
    // deck gun: flashes before a shell is fired at our ferry
    if (e.shellT > 0 && Math.floor(t * 16) % 2 === 0) rect(x + d * 6 - 1, y - 11, 3, 3, "#ffffff");
    // stern lamp: flashes while a mine is being readied
    if (e.mineT > 0 && Math.floor(t * 16) % 2 === 0) rect(x - d * 10 - 1, y - 6, 3, 3, COL.chargeLit);
    // hold windows: one lit per survivor aboard
    // hold windows: lit per person aboard; grey = already counted in an earlier miss
    for (let i = 0; i < CFG.shipCap; i++) rect(x - 6 + i * 2, y - 6, 1, 2, i < e.load ? (i < (e.forfeit || 0) ? "#7a7a7a" : "#ffffff") : "#40140a");
    // crane
    rect(x + 4, y - 12, 1, 9, "#ffb070");
    rect(x, y - 12, 5, 1, "#ffb070");
    // arm
    if (e.arm > 0) {
      const tip = y + 4 + e.arm;
      for (let yy = y + 2; yy < tip; yy += 2) rect(x, yy, 1, 1, "#ffb070");
      rect(x - 2, tip, 5, 1, "#ffb070");
      rect(x - 2, tip - 2, 1, 2, "#ffb070");
      rect(x + 2, tip - 2, 1, 2, "#ffb070");
      if (e.held) {
        rect(x, tip - 4, 1, 3, "#ffffff");
        rect(x - 1, tip - 5, 1, 1, "#ffffff");
        rect(x + 1, tip - 5, 1, 1, "#ffffff");
      }
    }
  }

  // raider grab-sub: a dark violet hull with a lit hold and a bow tube that glows before firing
  function drawEsub(e, x, t) {
    const d = e.dir;
    const y = Math.round(e.y);
    rect(x - 8, y - 2, 16, 5, COL.esub);
    rect(x - 7, y + 3, 14, 1, COL.esubDark);
    rect(x - 2 + d, y - 5, 5, 3, COL.esub);
    rect(x - d * 9 - (d > 0 ? 1 : 0), y - 3, 1, 7, COL.esubDark);
    for (let i = 0; i < CFG.esubCap; i++) rect(x - 3 + i * 2, y, 1, 1, i < e.load ? (i < (e.forfeit || 0) ? "#7a7a7a" : "#ffffff") : COL.esubDark);
    if (e.stalking && Math.floor(t * 6) % 2 === 0) rect(x - 2 + d, y - 5, 5, 1, "#ff3030"); // hunting us
    const aiming = e.aim > 0;
    const tube = aiming ? (Math.floor(t * 20) % 2 ? "#ffffff" : "#ff3030") : COL.esubDark;
    rect(x + d * 8 - (d < 0 ? 1 : 0), y, 2, 1, tube);
    if (aiming) {
      // a dotted sight line along its depth: this depth is about to be dangerous
      for (let i = 12; i < 12 + 60 * (1 - e.aim / CFG.esubAim); i += 4) rect(x + d * i, y, 1, 1, "#ff3030");
    }
  }

  function drawSub(p, t, blink) {
    if (blink) return;
    const x = sx(p.x);
    const y = Math.round(p.y);
    const f = p.face;
    const inBand = p.y <= SEA_TOP + game.spec.gunReach; // up where deck guns can see us
    // pitch from vertical speed (render only): bow up when climbing, down when diving
    const pitch = Math.max(-1, Math.min(1, -p.vy / 30));
    // turning: the hull narrows for a moment as it swings round
    const w = fx.turn > 0 ? 10 : 16;
    const hw = w / 2;
    for (let i = 0; i < w; i += 4) {
      const along = (i + 2 - hw) / hw; // -1 stern .. 1 bow (in facing direction)
      const off = -Math.round(pitch * along * 1.5);
      const sxp = f > 0 ? x - hw + i : x + hw - i - 4;
      rect(sxp, y - 2 + off, Math.min(4, w - i), 5, COL.sub);
      rect(sxp, y + 3 + off, Math.min(4, w - i), 1, COL.subDark);
    }
    const bowOff = -Math.round(pitch * 1.5);
    rect(x + f * hw - (f < 0 ? 1 : 0), y - 1 + bowOff, 1, 3, COL.sub); // nose
    // tower + periscope; periscope up when within the deck guns' reach
    rect(x - 2 - f, y - 5, 5, 3, COL.sub);
    if (inBand) {
      rect(x + f * 1, y - 8, 1, 3, "#ffffff");
      rect(x + f * 1 + (f > 0 ? 0 : -1), y - 8, 2, 1, "#ffffff");
    }
    // tail fin + prop
    const sternOff = Math.round(pitch * 1.5);
    rect(x - f * (hw + 1) - (f > 0 ? 1 : 0), y - 3 + sternOff, 1, 7, COL.subDark);
    if (Math.floor(t * 20) % 2 === 0) rect(x - f * (hw + 3), y + sternOff, 1, 1, "#ffffff");
    // portholes = cargo
    const full = p.cargo >= CFG.capacity;
    if (fx.turn > 0) return;
    for (let i = 0; i < CFG.capacity; i++) {
      const lit = i < p.cargo;
      const hx = x - 7 + i * 2 + (f > 0 ? 0 : 1);
      const along = (hx - x) / 8 * f;
      let c = lit ? COL.lamp : COL.lampOff;
      if (full && Math.floor(t * 8) % 2 === 0) c = "#ff5a3a";
      if (fx.cargoFlash > 0 && i === p.cargo - 1) c = "#ffe23f";
      rect(hx, y - Math.round(pitch * along * 1.5), 1, 1, c);
    }
  }

  function drawCaptive(c, t) {
    const x = Math.round(sx(c.x));
    let y = Math.round(c.y);
    let x0 = x;
    const toss = fx.toss.get(c.id);
    if (toss) {
      const a = Math.min(1, (game.t - toss.t0) / 0.5);
      y -= Math.round(Math.sin(Math.PI * a) * 7);
      x0 += Math.round(toss.dir * a * 6);
    }
    const k = (c.y - SEA_TOP) / (CFG.seabed - SEA_TOP);
    let col = k < 0.5 ? "#ffffff" : k < 0.75 ? "#a0f0ff" : "#3fa0ff";
    if (CFG.seabed - c.y < 24 && Math.floor(t * 10) % 2 === 0) col = "#ff5a5a";
    const wave = Math.floor(c.ph * 1.3) % 2;
    rect(x0, y - 2, 1, 1, col); // head
    rect(x0, y, 1, 2, col); // body
    if (c.jacket) rect(x0, y, 1, 1, "#ff8a1f"); // life jacket: sinks slowly
    rect(x0 - 1, y + 2, 1, 1, col);
    rect(x0 + 1, y + 2, 1, 1, col);
    // arms up, flailing
    rect(x0 - 1, y - (wave ? 2 : 1), 1, 1, col);
    rect(x0 + 1, y - (wave ? 1 : 2), 1, 1, col);
  }

  function drawMine(m, t) {
    const x = sx(m.x);
    const y = Math.round(m.y);
    const lit = Math.floor(t * 4 + m.id) % 2 === 0;
    const fading = CFG.mineLife - m.t < 2 && Math.floor(t * 10) % 2;
    if (fading) return;
    rect(x - 2, y - 2, 5, 5, COL.charge);
    rect(x - 3, y, 7, 1, COL.charge);
    rect(x, y - 3, 1, 7, COL.charge);
    rect(x, y, 1, 1, lit ? COL.chargeLit : "#801010");
    if (m.y < m.stopY) rect(x, y - 6, 1, 3, "#6fb8ff");
  }

  function drawEtorp(tp) {
    const x = sx(tp.x);
    const d = Math.sign(tp.vx);
    rect(x - (d > 0 ? 4 : 0), tp.y, 5, 1, "#ff5a5a");
    rect(x - d * 6, tp.y, 1, 1, "#6fb8ff");
  }

  // While a blast is lethal it is drawn at its full lethal size, filled; only after that does it
  // spread and fade. (It used to grow from 40 %, so the deadly part was partly invisible.)
  function drawBlast(b) {
    const x = sx(b.x);
    const R = b.r || CFG.blastR;
    const lethal = b.t <= CFG.blastLethal;
    if (lethal) {
      g.globalAlpha = 0.55;
      g.fillStyle = "#ffe23f";
      g.beginPath();
      g.arc(x, b.y, R, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, b.y, R, 0, Math.PI * 2);
      g.stroke();
    } else {
      const k = (b.t - CFG.blastLethal) / (CFG.blastT - CFG.blastLethal);
      g.globalAlpha = 1 - k;
      g.strokeStyle = "#ff8a1f";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, b.y, R * (1 + 0.3 * k), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }


  function drawWreck(w) {
    const x = sx(w.x);
    if (!onScreen(x)) return;
    const k = w.t / 2;
    const y = (w.y != null ? w.y : SEA_TOP) + k * 40;
    if (w.t < 0.06) {
      // struck: the whole hull flashes white before it breaks
      rect(x - 12, y - 4, 24, 7, "#ffffff");
      return;
    }
    g.globalAlpha = 1 - k;
    const c = w.kind === "ferry" ? "#1f6a2f" : w.kind === "ship" ? COL.transportDark : w.kind === "dd" ? COL.escortDark : COL.esubDark;
    const split = 3 + k * 10;
    rect(x - 12 - split, y - 2 + k * 6, 11, 4, c);
    rect(x + 1 + split, y - 2 + k * 10, 11, 4, c);
    g.globalAlpha = 1;
    if (Math.random() < 0.3) bubble(w.x + (Math.random() * 2 - 1) * 10, y, 1);
  }

  function drawWorld(gm) {
    const t = gm.t;
    drawSea(gm);
    drawPort(gm);
    drawHome(gm);
    drawFerry(gm);
    for (const m of fx.bedMarks) {
      const x = sx(m.x);
      if (!onScreen(x)) continue;
      if (Math.floor(m.t * 6) % 2 === 0) {
        rect(x - 2, CFG.seabed - 3, 1, 1, COL.port);
        rect(x + 2, CFG.seabed - 3, 1, 1, COL.port);
        rect(x - 1, CFG.seabed - 2, 3, 1, COL.port);
        rect(x - 2, CFG.seabed - 1, 1, 1, COL.port);
        rect(x + 2, CFG.seabed - 1, 1, 1, COL.port);
      }
    }
    for (const w of gm.wrecks) drawWreck(w);
    for (const e of gm.enemies) {
      const x = sx(e.x);
      if (!onScreen(x, 30)) continue;
      if (e.kind === "ship") drawShip(e, x, t);
      else if (e.kind === "dd") drawDestroyer(e, x, t);
      else drawEsub(e, x, t);
    }
    for (const b of fx.bubbles) {
      const x = sx(b.x) + Math.sin(b.ph) * 1;
      if (onScreen(x)) rect(x, b.y, 1, 1, "#6fb8ff");
    }
    for (const c of gm.captives) if (onScreen(sx(c.x))) drawCaptive(c, t);
    for (const m of gm.mines) if (onScreen(sx(m.x))) drawMine(m, t);
    for (const sh of gm.shells) drawShell(sh, t);
    for (const e of gm.enemies) if (e.kind === "ship" && e.shellT > 0 && e.aimX != null) drawShellAim(e, t);
    for (const c of gm.charges) if (onScreen(sx(c.x))) drawCharge(c, t);
    for (const tp of gm.etorps) if (onScreen(sx(tp.x))) drawEtorp(tp);
    if (gm.torp) {
      const tp = gm.torp;
      const x = sx(tp.x);
      const L = Math.hypot(tp.vx, tp.vy);
      const ux = tp.vx / L;
      const uy = tp.vy / L;
      for (let i = 0; i < 6; i++) rect(x - ux * i, tp.y - uy * i, 1, 1, i < 2 ? "#ffffff" : "#c0e0ff");
      if (Math.random() < 0.6) bubble(tp.x - ux * 7, tp.y - uy * 7, 1);
    }
    // where a torpedo fired now would reach the hulls: depth sets range
    {
      const p = gm.player;
      if (p.alive && !gm.torp && gm.mode === "play") {
        const run = (p.y - (CFG.surf + CFG.hullDepth - 3)) / CFG.torpRise;
        if (run > 6) {
          const bx = sx(p.x + p.face * (8 + run));
          const lit = Math.floor(gm.t * 4) % 2 === 0;
          rect(bx - 2, SEA_TOP - 4, 5, 1, lit ? "#ffe23f" : "#b08a10");
          rect(bx, SEA_TOP - 3, 1, 2, lit ? "#ffe23f" : "#b08a10");
          // a faint dotted run from the bow
          for (let d = 12; d < run; d += 10) rect(sx(p.x + p.face * (8 + d)), p.y - d * CFG.torpRise, 1, 1, "#27508f");
        }
      }
    }
    const p = gm.player;
    if (p.alive) drawSub(p, t, p.inv > 0 && Math.floor(t * 12) % 2 === 0);
    if (fx.recall && Math.floor(fx.recall.t * 14) % 2 === 0) {
      // the recalled sub: a white silhouette rising toward the surface
      const r = fx.recall;
      const x = sx(r.x);
      const y = Math.max(SEA_TOP + 4, r.y - r.t * 40);
      rect(x - 8, y - 2, 16, 5, "#ffffff");
      rect(x - 2 - r.face, y - 5, 5, 3, "#ffffff");
    }
    for (const b of gm.blasts) drawBlast(b);
    for (const r of fx.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.life;
      g.strokeStyle = r.col;
      g.globalAlpha = 1 - k;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(sx(r.x), r.y, 4 + r.r * k, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    for (const q of fx.parts) {
      const x = sx(q.x);
      if (onScreen(x)) rect(x, q.y, 1, 1, q.col);
    }
    for (const q of fx.pops) {
      const x = sx(q.x);
      const y = Math.max(CFG.surf + 3, Math.min(CFG.seabed - 12, q.y + q.t * 10));
      if (q.big) {
        if (Math.floor(q.t * 10) % 2 === 0 || q.t < 0.8) text(q.str, Math.max(40, Math.min(W - 40, x)), y, q.col, 1, "c");
      } else text(q.str, x, y, q.col, 1, "c");
    }
    if (fx.fullT > 0 && p.alive && Math.floor(fx.fullT * 8) % 2 === 0) text("FULL", sx(p.x), p.y - 16, "#ff5a3a", 1, "c");
  }

  const LOST_FLY = 0.6;
  const SAVE_FLY = 0.55;
  const GAUGE_X = W - 42; // the next extra sub, filling as people are brought home

  function drawSaveFly() {
    for (const f of fx.saveFly) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / SAVE_FLY);
      const e = k * k * (3 - 2 * k);
      const x = f.x0 + (GAUGE_X + 4 - f.x0) * e;
      const y = f.y0 + (4 - f.y0) * e - Math.sin(Math.PI * k) * 14;
      const c = Math.floor(f.t * 20) % 2 ? COL.home : "#ffffff";
      rect(x - 1, y - 4, 2, 2, c);
      rect(x - 2, y - 2, 4, 1, c);
      rect(x - 1, y - 1, 2, 3, c);
    }
  }

  // hollow sub filling from the stern as people are brought home; full = the next extra sub
  function drawExtendGauge(gm) {
    const per = CFG.extendEvery;
    const full = fx.gaugeFlash > 0.3 && fx.shownSaved > 0 && fx.shownSaved % per === 0;
    const prog = full ? per : fx.shownSaved % per;
    const x = GAUGE_X;
    const fill = Math.round((prog / per) * 8);
    const edge = fx.gaugeFlash > 0 && Math.floor(fx.gaugeFlash * 12) % 2 === 0 ? "#ffffff" : COL.home;
    // outline
    rect(x, 3, 9, 1, edge);
    rect(x, 6, 9, 1, edge);
    rect(x, 3, 1, 4, edge);
    rect(x + 8, 3, 1, 4, edge);
    rect(x + 3, 1, 2, 2, edge);
    // fill
    if (fill > 0) rect(x + 1, 4, Math.min(7, fill), 2, full ? "#ffffff" : COL.sub);
    // how many more to bring home for it: counts down as each one lands
    const left = full ? 0 : per - prog;
    const numCol = fx.gaugeFlash > 0 && Math.floor(fx.gaugeFlash * 12) % 2 === 0 ? "#ffffff" : COL.home;
    text(String(left), x - 2, 1, numCol, 1, "r");
  }
  const lostSlotX = (i) => W - 90 + i * 6;

  // someone lost: a red figure arcs up to the counter and crosses out the next slot
  function drawLostFly() {
    for (const f of fx.lostFly) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / LOST_FLY);
      const e = k * k * (3 - 2 * k);
      const slot = CFG.lostPerMiss - fx.shownLost - 1;
      const tx = lostSlotX(Math.max(0, slot));
      const x = f.x0 + (tx - f.x0) * e;
      const y = f.y0 + (4 - f.y0) * e - Math.sin(Math.PI * k) * 18;
      const c = Math.floor(f.t * 20) % 2 ? "#ff5a5a" : "#ffffff";
      // a figure at double size so the flight reads
      rect(x - 1, y - 6, 2, 2, c);
      rect(x - 3, y - 4, 6, 2, c);
      rect(x - 1, y - 2, 2, 4, c);
      rect(x - 3, y + 2, 2, 2, c);
      rect(x + 1, y + 2, 2, 2, c);
    }
  }

  // ---- drawing: radar + HUD --------------------------------------------------------------
  const RX = 0;
  const RY = 10;
  const RW = 256;
  const RH = 24;
  // the whole ring, scrolled so the main view sits in the middle: left/right on the radar is the
  // same way round the ring as on the main screen, and there is no seam near the sub
  const rx = (wx) => RX + RW / 2 + (dx(fx.cam, wx) / WORLD) * RW;
  const ry = (y) => RY + 2 + ((y - 36) / (CFG.seabed - 36)) * (RH - 4);

  function drawRadar(gm) {
    rect(RX, RY, RW, RH, COL.radarBg);
    rect(RX, RY, RW, 1, COL.radarLine);
    rect(RX, RY + RH - 1, RW, 1, COL.radarLine);
    rect(RX, ry(SEA_TOP), RW, 1, "#123a70");
    // home + port marks
    rect(rx(HOME) - 1, RY + 1, 3, 3, COL.home);
    if (gm.ferry.alive) {
      const fxr = Math.floor(rx(gm.ferry.x));
      rect(fxr - 1, ry(SEA_TOP) - 1, 3, 2, COL.home);
      for (let i = 0; i < gm.ferry.load; i++) rect(fxr - 3 + i, ry(SEA_TOP) - 3, 1, 1, "#ffe23f");
    }
    for (const sh of gm.shells) rect(rx(sh.x), ry(sh.y), 1, 1, "#ffe23f");
    // their port: when it sits across the ring from the view it is at both ends of the radar
    // (raiders can leave it either way), so mark both ends
    // a raider leaving it the other way appears across the radar's seam, so near an edge the port
    // is also drawn wrapped at the other edge
    {
      const px = rx(PORT);
      const seam = ((CFG.escapeDX + 40) / WORLD) * RW;
      const mark = (x) => {
        const l = Math.max(RX, x - 1);
        const r = Math.min(RX + RW, x + 2);
        if (r > l) rect(l, RY + 1, r - l, 3, COL.port);
      };
      mark(px);
      // the continuation across the seam: pinned to the far edge so it is always visible
      if (px > RX + RW - seam) mark(Math.max(RX + 1, px - RW));
      if (px < RX + seam) mark(Math.min(RX + RW - 2, px + RW));
    }
    // sweep line (the sonar ping)
    const swx = RX + ((RW / 2 + fx.sweep * RW) % RW);
    g.globalAlpha = 0.25;
    rect(swx, RY + 1, 1, RH - 2, "#3fe0ff");
    g.globalAlpha = 1;
    // viewport bracket
    const vx = RX + RW / 2 - (W / 2 / WORLD) * RW;
    const vw = (W / WORLD) * RW;
    const br = (x) => {
      rect(x, RY + 1, 1, 3, "#ffffff");
      rect(x, RY + RH - 4, 1, 3, "#ffffff");
    };
    br(vx);
    br(vx + vw);
    for (const e of gm.enemies) {
      const x = Math.floor(rx(e.x));
      if (e.kind === "dd") {
        rect(x - 1, ry(SEA_TOP) - 1, 3, 1, COL.escort);
      } else if (e.kind === "ship") {
        rect(x - 1, ry(SEA_TOP) - 1, 3, 2, COL.transport);
        for (let i = 0; i < e.load; i++) rect(x - 2 + i, ry(SEA_TOP) - 3, 1, 1, i < (e.forfeit || 0) ? "#5a5a5a" : "#ffffff");
      } else {
        const y = Math.floor(ry(e.y));
        rect(x - 1, y, 3, 1, COL.esub);
        for (let i = 0; i < e.load; i++) rect(x - 1 + i, y - 1, 1, 1, i < (e.forfeit || 0) ? "#5a5a5a" : "#ffffff");
      }
    }
    for (const c of gm.captives) {
      const near = CFG.seabed - c.y < 24;
      if (near && Math.floor(gm.t * 10) % 2) continue;
      rect(rx(c.x), ry(c.y), 1, 1, near ? "#ff5a5a" : c.jacket ? "#ffb070" : "#ffffff");
    }
    for (const m of gm.mines) rect(rx(m.x), ry(m.y), 1, 1, COL.charge);
    for (const c of gm.charges) rect(rx(c.x), ry(c.y), 1, 1, COL.chargeLit);
    for (const b of fx.radarBlips) {
      const r = b.t * (b.big ? 10 : 6);
      g.strokeStyle = b.col;
      g.globalAlpha = 1 - b.t / 1.2;
      g.lineWidth = 1;
      g.strokeRect(rx(b.x) - r, ry(b.y) - r * 0.5, r * 2, r);
      g.globalAlpha = 1;
    }
    const p = gm.player;
    if (p.alive && Math.floor(gm.t * 6) % 3 !== 0) {
      const x = Math.floor(rx(p.x));
      const y = Math.floor(ry(p.y));
      rect(x - 1, y, 3, 1, COL.sub);
      rect(x, y - 1, 1, 3, COL.sub);
    }
  }

  function drawHud(gm, demo) {
    rect(0, 0, W, 10, "#000");
    text(String(Math.floor(fx.dispScore)).padStart(6, "0"), 2, 1, "#ffffff");
    text("HI " + String(Math.max(hi, demo ? 0 : gm.score)).padStart(6, "0"), W / 2, 1, COL.dim, 1, "c");
    // survivors lost since the last miss or wave clear: five little figures, red as they are lost;
    // the fifth costs the sub
    const remaining = CFG.lostPerMiss - fx.shownLost;
    for (let i = 0; i < CFG.lostPerMiss; i++) {
      const x = lostSlotX(i);
      if (i >= remaining) {
        // crossed out: this many already lost
        const c = fx.lostFlash > 0 && i === remaining ? "#ffffff" : COL.port;
        for (let k = 0; k < 5; k++) {
          rect(x - 2 + k, 2 + k, 1, 1, c);
          rect(x + 2 - k, 2 + k, 1, 1, c);
        }
        continue;
      }
      const warn = remaining === 1 && Math.floor(gm.t * 4) % 2 === 0;
      const tally = gm.mode === "clear" && gm.modeT > 0.6 && gm.modeT < 1.6 && Math.floor(gm.modeT * 10) % 2 === 0;
      const c = tally ? "#ffffff" : warn ? "#ffe23f" : COL.home;
      rect(x, 2, 1, 1, c);
      rect(x - 1, 3, 3, 1, c);
      rect(x, 4, 1, 2, c);
      rect(x - 1, 6, 1, 1, c);
      rect(x + 1, 6, 1, 1, c);
    }
    // spare subs
    let lv = gm.lives - 1;
    if (!gm.player.alive) lv = gm.lives;
    drawExtendGauge(gm);
    const lifeCol = fx.lifeFlash > 0 && Math.floor(fx.lifeFlash * 10) % 2 === 0 ? COL.port : COL.sub;
    for (let i = 0; i < Math.min(4, Math.max(0, lv)); i++) {
      const x = W - 6 - i * 7;
      rect(x - 2, 3, 6, 3, lifeCol);
      rect(x, 1, 2, 2, lifeCol);
    }
    if (demo && Math.floor(appT * 2) % 2 === 0) text("DEMO", W / 2, 40, COL.dim, 1, "c");
    if (fx.banner) {
      const b = fx.banner;
      if (Math.floor(b.t * 8) % 2 === 0 || b.t < 0.5) text(b.str, W / 2, 146, b.col, 2, "c"); // below the wave captions
    }
    // wave number, tucked on the seabed strip
    text("WAVE " + gm.wave + "/" + UT.FINAL_WAVE, 2, H - 8, "#8a6a40");
  }

  function drawModes(gm) {
    const cx = W / 2;
    if (gm.mode === "ready") {
      text(gm.wave === UT.FINAL_WAVE ? "FINAL WAVE" : "WAVE " + gm.wave, cx, 80, COL.surf, 2, "c");
      if (Math.floor(gm.modeT * 4) % 2 === 0) text("RAIDERS INBOUND", cx, 104, COL.port, 1, "c");
    } else if (gm.mode === "clear") {
      const ev = fx.clearInfo || { saved: 0, lost: 0 };
      text("WAVE " + gm.wave + " CLEAR", cx, 76, COL.surf, 2, "c");
      text("SAVED " + ev.saved, cx - 36, 100, COL.home, 1, "c");
      text("LOST " + ev.lost, cx + 36, 100, ev.lost ? COL.port : COL.dim, 1, "c");
      if (gm.modeT > 0.6) text("FIGURES LEFT " + ev.standing + "  +" + ev.standBonus, cx, 116, ev.standing ? COL.home : COL.dim, 1, "c");
      if (ev.perfect && gm.modeT > 1.1) text("NO ONE LOST +" + ev.bonus, cx, 128, "#ffe23f", 1, "c");
    } else if (gm.mode === "over") {
      if (gm.overWhy === "allclear") {
        const a = fx.allclear || { lives: gm.lives, bonus: 0 };
        text("ALL CLEAR", cx, 72, "#ffe23f", 2, "c");
        text("SUBS " + a.lives, cx, 96, COL.home, 1, "c");
        if (gm.modeT > 0.8) text("BONUS " + a.bonus, cx, 108, "#ffffff", 1, "c");
        if (a.allPerfect && Math.floor(gm.modeT * 3) % 2 === 0) text("NOBODY LOST", cx, 120, "#ffe23f", 1, "c");
      } else {
        text("GAME OVER", cx, 80, COL.port, 2, "c");
        text("NO SUBS LEFT", cx, 102, "#ffffff", 1, "c");
      }
      if (newHi && Math.floor(gm.modeT * 3) % 2 === 0) text("NEW HIGH SCORE", cx, gm.overWhy === "allclear" ? 136 : 118, "#ffe23f", 1, "c");
    }
  }

  // ---- title ---------------------------------------------------------------------------
  // The logo sits half under the surface, and below it a small looping scene shows the whole
  // game in one breath: a grab-ship lifts a survivor, our sub fires a climbing torpedo from depth,
  // the ship breaks, the survivors sink, the sub catches them and brings them home.
  let titleT = 0;
  let logo = null;
  function makeLogo() {
    const word = "UNDERTOW";
    const c = document.createElement("canvas");
    c.width = word.length * 24 - 4;
    c.height = 28;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    for (let i = 0; i < word.length; i++) x.drawImage(glyph(word[i], i % 2 ? COL.surf : "#ffffff"), i * 24, 0, 20, 28);
    return c;
  }

  const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
  function tSub(x, y, face, cargo) {
    rect(x - 8, y - 2, 16, 5, COL.sub);
    rect(x - 7, y + 3, 14, 1, COL.subDark);
    rect(x + face * 8 - (face < 0 ? 1 : 0), y - 1, 1, 3, COL.sub);
    rect(x - 2 - face, y - 5, 5, 3, COL.sub);
    rect(x - face * 9 - (face > 0 ? 1 : 0), y - 3, 1, 7, COL.subDark);
    for (let i = 0; i < 8; i++) rect(x - 7 + i * 2, y, 1, 1, i < cargo ? COL.lamp : COL.lampOff);
  }
  function tPerson(x, y, jacket, t) {
    const w = Math.floor(t * 4) % 2;
    rect(x, y - 2, 1, 1, "#ffffff");
    rect(x, y, 1, 2, "#ffffff");
    if (jacket) rect(x, y, 1, 1, "#ff8a1f");
    rect(x - 1, y - (w ? 2 : 1), 1, 1, "#ffffff");
    rect(x + 1, y - (w ? 1 : 2), 1, 1, "#ffffff");
  }

  function drawTitle() {
    rect(0, 0, W, H, "#000");
    const t = titleT;
    if (!logo) logo = makeLogo();
    // logo: the top rides above the surface, the rest is under water, dim and rippling
    const LX = Math.round((W - logo.width) / 2);
    const LY = 20;
    const cut = 17; // rows above the surface
    const surfY = LY + cut;
    g.drawImage(logo, 0, 0, logo.width, cut, LX, LY, logo.width, cut);
    // under the surface: the letters go dim and blue and sway
    for (let r = cut; r < 28; r++) {
      const off = Math.round(Math.sin(r * 0.8 + t * 3) * 1.5);
      g.globalAlpha = 0.5 - (r - cut) * 0.03;
      g.drawImage(logo, 0, r, logo.width, 1, LX + off, LY + r + 1, logo.width, 1);
    }
    g.globalAlpha = 0.35;
    rect(LX - 4, surfY + 1, logo.width + 8, 12, "#1b5ab8");
    g.globalAlpha = 1;
    for (let x = 0; x < W; x += 2) rect(x, surfY - (Math.floor(x / 6 + t * 1.5) % 4 === 0 ? 1 : 0), 2, 1, COL.surf);

    // the scene
    const S = 76; // surface
    const B = 132; // seabed
    rect(0, S, W, B - S, "#041746");
    rect(0, S, W, 16, COL.band);
    for (let x = 0; x < W; x += 2) rect(x, S - (Math.floor(x / 6 + t * 1.5) % 4 === 0 ? 1 : 0), 2, 1, COL.surf);
    rect(0, B, W, 2, "#8a1a1a");
    rect(0, B + 2, W, 6, COL.bedDark);
    const T = t % 9.5;
    // our harbour on the left: jetty, houses, lighthouse
    const HX = 30;
    rect(HX - 18, S - 3, 36, 3, "#2f7a3f");
    for (let i = 0; i < 6; i++) {
      rect(HX - 16 + i * 5, S - 7, 4, 4, "#2f7a3f");
      rect(HX - 15 + i * 5, S - 6, 2, 2, T > 7.4 && T < 8.4 && i < 2 ? "#ffffff" : "#ffe23f");
    }
    rect(HX - 1, S - 15, 3, 12, "#ffffff");
    rect(HX - 2, S - 17, 5, 2, COL.home);
    rect(HX + 3 - (Math.floor(t * 2) % 2) * 11, S - 17, 6, 1, "#ffffa0");

    // grab-ship: sails in, lowers its arm, lifts the survivor, turns for home (to the right)
    const shipX = T < 1.5 ? lerp(262, 170, T / 1.5) : T < 3.5 ? lerp(170, 176, (T - 2.6) / 0.9) : 176;
    const armLen = T < 1.5 ? 0 : T < 2.0 ? lerp(0, 10, (T - 1.5) / 0.5) : T < 2.6 ? lerp(10, 0, (T - 2.0) / 0.6) : 0;
    const sunk = T >= 3.55;
    if (!sunk) {
      const x = Math.round(shipX);
      const flash = T > 3.5;
      const hull = flash ? "#ffffff" : COL.transport;
      rect(x - 11, S - 3, 22, 5, hull);
      rect(x - 9, S + 2, 18, 2, flash ? "#ffffff" : COL.transportDark);
      rect(x + 11, S - 5, 2, 4, hull);
      rect(x - 7, S - 8, 11, 5, flash ? "#ffffff" : COL.transportDark);
      const aboard = T >= 2.0 ? 2 : 1;
      for (let i = 0; i < 5; i++) rect(x - 6 + i * 2, S - 6, 1, 2, i < aboard ? "#ffffff" : "#40140a");
      rect(x + 4, S - 12, 1, 9, "#ffb070");
      rect(x, S - 12, 5, 1, "#ffb070");
      if (armLen > 0) {
        for (let yy = S + 2; yy < S + 4 + armLen; yy += 2) rect(x, yy, 1, 1, "#ffb070");
        rect(x - 2, S + 4 + armLen, 5, 1, "#ffb070");
        if (T > 2.0) tPerson(x, S + 2 + armLen, true, t);
      }
    } else if (T < 5) {
      // the wreck breaks and goes down
      const k = (T - 3.55) / 1.45;
      g.globalAlpha = 1 - k;
      rect(176 - 12 - k * 10, S - 2 + k * 18, 11, 4, COL.transportDark);
      rect(176 + 1 + k * 10, S - 2 + k * 24, 11, 4, COL.transportDark);
      g.globalAlpha = 1;
    }
    // the survivor waiting in the water before the arm takes them
    if (T < 2.0) tPerson(172, S + 1, true, t);

    // our sub: waits deep, fires, catches the spill, brings it home
    let subX = 106, subY = 116, face = 1, cargo = 0;
    if (T >= 3.6 && T < 4.8) {
      subX = lerp(106, 175, (T - 3.6) / 1.2);
      subY = lerp(116, 98, (T - 3.6) / 1.2);
    } else if (T >= 4.8 && T < 7.4) {
      subX = lerp(175, HX + 2, (T - 4.8) / 2.6);
      subY = lerp(98, S + 8, (T - 4.8) / 2.6);
      face = -1;
      cargo = 2;
    } else if (T >= 7.4) {
      subX = HX + 2;
      subY = S + 8;
      face = -1;
      cargo = T < 7.6 ? 1 : 0;
    }
    if (T >= 4.5 && T < 4.8) cargo = 1;
    tSub(Math.round(subX), Math.round(subY), face, cargo);
    // the torpedo: climbs 1 px for every 2 px it runs
    if (T >= 3.0 && T < 3.55) {
      const k = (T - 3.0) / 0.55;
      const tx = 114 + 62 * k;
      const ty = 116 - 31 * k;
      rect(tx - 4, ty + 2, 1, 1, "#c0e0ff");
      rect(tx - 2, ty + 1, 1, 1, "#c0e0ff");
      rect(tx, ty, 2, 1, "#ffffff");
    }
    // the spill: tossed clear, then sinking fast, until the sub takes them aboard
    if (T >= 3.55 && T < 4.8) {
      const k = T - 3.55;
      const toss = Math.sin(Math.PI * Math.min(1, k / 0.5)) * 6;
      const y = S + 3 + Math.max(0, k - 0.5) * 18 - toss;
      if (T < 4.5) tPerson(171 - Math.min(1, k / 0.5) * 3, Math.round(y), false, t);
      tPerson(179 + Math.min(1, k / 0.5) * 3, Math.round(y + 2), false, t);
      if (k < 0.3) {
        g.globalAlpha = 0.6;
        rect(166, S - 10, 20, 14, "#ffe23f");
        g.globalAlpha = 1;
      }
    }
    if (T >= 7.4 && T < 8.8) text("+200", HX + 6, S + 16 + (T - 7.4) * 6, COL.home, 1, "c");

    text("SINK THE RAIDERS  SAVE WHO FALLS", W / 2, 144, "#ffffff", 1, "c");
    if (Math.floor(t * 2) % 2 === 0) text("PUSH SPACE", W / 2, 160, COL.sub, 1, "c");
    text("ARROWS MOVE  Z FIRE", W / 2, 176, COL.dim, 1, "c");
    text("HI " + String(hi).padStart(6, "0"), W / 2, 4, COL.dim, 1, "c");
  }

  // ---- main loop -------------------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      tick();
    }
    render();
    requestAnimationFrame(frame);
  }

  function tick() {
    appT += DT;
    if (app === "title") {
      titleT += DT;
      readInput();
      if (anyPress && titleT > 0.3) {
        anyPress = false;
        startGame(false);
      } else if (titleT > 9) startGame(true);
      anyPress = false;
      return;
    }
    const demo = app === "demo";
    const inp = readInput();
    if (demo && (anyPress || appT > 45)) {
      anyPress = false;
      app = "title";
      titleT = 0;
      return;
    }
    anyPress = false;
    if (fx.hitstop > 0) {
      fx.hitstop--;
      return;
    }
    const input = demo ? demoBot.act(game) : autopilot ? autopilot(game) || {} : inp;
    UT.step(game, input);
    for (const e of game.events) {
      if (e.type === "clear") fx.clearInfo = e;
      if (e.type === "allclear") {
        fx.allclear = e;
        if (!demo) A.sfx.allclear();
      }
    }
    handleEvents(game, !demo);
    updateFx(DT, game, !demo);
    if (game.mode === "over") {
      if (!demo && game.score > hi) {
        hi = game.score;
        newHi = true;
        try {
          localStorage.setItem("undertow.hi", String(hi));
        } catch (e) {
          /* storage unavailable */
        }
      }
      if (game.modeT > (game.overWhy === "allclear" ? 8 : 4) || (demo && game.modeT > 2)) {
        app = "title";
        titleT = 0;
      }
    }
  }

  function render() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    rect(0, 0, W, H, "#000");
    if (app === "title") {
      drawTitle();
      return;
    }
    const s = fx.shake;
    const ox = (s ? Math.round((Math.random() * 2 - 1) * s) : 0) + Math.round(fx.kick.x);
    const oy = (s ? Math.round((Math.random() * 2 - 1) * s) : 0) + Math.round(fx.kick.y);
    g.save();
    g.beginPath();
    g.rect(0, 36, W, H - 36);
    g.clip();
    g.translate(ox, oy);
    drawWorld(game);
    g.restore();
    drawRadar(game);
    drawHud(game, app === "demo");
    drawLostFly();
    drawSaveFly();
    drawModes(game);
    if (fx.flash > 0) {
      g.globalAlpha = Math.min(fx.flashMax || 0.4, fx.flash * 3);
      rect(0, 36, W, H - 36, fx.flashCol);
      g.globalAlpha = 1;
    }
  }

  // ---- fit to window ---------------------------------------------------------------------
  function fit() {
    const s = Math.max(1, Math.min(innerWidth / W, innerHeight / H));
    const k = s >= 2 ? Math.floor(s) : s;
    cv.style.width = W * k + "px";
    cv.style.height = H * k + "px";
  }
  addEventListener("resize", fit);
  fit();

  // test hook
  window.__ut = {
    get app() {
      return app;
    },
    get game() {
      return game;
    },
    start: (demo) => {
      autopilot = null;
      startGame(!!demo);
    },
    // recorder hooks
    titleFromStart() {
      autopilot = null;
      app = "title";
      titleT = 0;
    },
    replay(seed, inputs) {
      seedN = seed;
      startGame(false);
      let i = 0;
      autopilot = () => inputs[i++] || {};
    },
    fx: () => fx,
  };
  requestAnimationFrame(frame);
})();
