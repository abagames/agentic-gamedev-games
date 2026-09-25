import { CFG, TAU, createGame, step, tipPoint, insideScope, sectorParams, makeRng, shotHalfWidth, blipLife, bonusFrac } from "./game-core.js";
import { makeDemoBot } from "./demo-bot.js";
import { drawText } from "./vector-font.js";
import * as sfx from "./audio.js";

const W = 600;
const DT = 1 / 120;
const canvas = document.getElementById("scope");
const ctx = canvas.getContext("2d");

const COL = {
  bg: "#010603",
  face: "#021108",
  grid: "rgba(60, 255, 130, 0.10)",
  phos: "#3dff86",
  phosDim: "rgba(61, 255, 134, 0.35)",
  ship: "#e6fff0",
  hot: "#ffffff",
  danger: "#ff4d3a",
};

let HI = 0;
try {
  HI = Number(localStorage.getItem("blink-scope-hi")) || 0;
} catch {}

const app = {
  mode: "title", // title | game
  game: null,
  demo: null,
  demoBot: null,
  pressQueued: false,
  overT: 0,
  fx: [], // transient render-only effects
  wobble: 0, // horizontal beam deflection (kills)
  surge: 0, // phosphor overload brightness (big chains, loss)
  surgeCol: COL.phos,
  tear: 0, // raster tearing (ship lost)
  metro: 0, // metronome clicks played (test hook)
  echoes: [], // scheduled echoes (test hook)
  tally: null, // sector-clear time-bonus count-up
  barFlash: 0, // time bar refilled by a chain
  powerT: 99, // time since the tube powered on (after a dark game-over screen)
  newHi: false,
  titleT: 0,
  hitstop: 0,
  pilot: null,
  lastPressAt: -1e9,
};

function newDemo() {
  app.demoEv = [];
  const seed = (Math.random() * 1e9) | 0;
  app.demo = createGame(seed, { lives: 1 });
  app.demoBot = makeDemoBot(makeRng(seed ^ 0x5bd1));
}

// Play-test overrides: ?speed=1.3 fixes the game speed, ?sector=5 starts later.
const params = new URLSearchParams(location.search);
const numParam = (name, lo, hi) => {
  const v = Number(params.get(name));
  return params.has(name) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;
};
const START_OPTS = { speed: numParam("speed", 0.5, 2), sector: numParam("sector", 1, 30) };
if (START_OPTS.sector) START_OPTS.sector = Math.round(START_OPTS.sector);

function startGame(seed = (Math.random() * 1e9) | 0) {
  app.mode = "game";
  app.game = createGame(seed, START_OPTS);
  app.fx = [];
  app.overT = 0;
  app.newHi = false;
  sfx.sfxStart();
}

// Leaving the dark game-over screen switches the tube back on.
function powerOn() {
  app.powerT = 0;
  sfx.sfxPowerOn();
}

// ---- input: one button (any ordinary key, or a click/tap anywhere) ----
// Presses closer together than this are one press: a rolled pair of keys or a
// two-finger tap must not fire two blinks (no one aims twice within 50 ms).
const MERGE_MS = 50;
function press() {
  const now = performance.now();
  if (now - app.lastPressAt < MERGE_MS) return;
  app.lastPressAt = now;
  sfx.unlockAudio();
  if (app.mode === "title") {
    startGame();
    return;
  }
  const g = app.game;
  if (g.phase === "over" || g.phase === "complete") {
    if (app.overT > 1.2) {
      startGame();
      if (g.phase === "over") powerOn(); // the tube was off
    }
    return;
  }
  app.pressQueued = true;
}
// Every key is the button except modifiers, shortcuts, and system/navigation keys.
const NOT_BUTTON = new Set([
  "Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock", "ScrollLock", "Fn", "FnLock",
  "Tab", "Escape", "ContextMenu", "PrintScreen", "Pause", "Insert", "OS", "Hyper", "Super",
  "Dead", "Process", "Unidentified", "Compose", "Convert", "NonConvert", "KanaMode", "HiraganaKatakana",
  "Hankaku", "Zenkaku", "ZenkakuHankaku", "Eisu", "Alphanumeric", "Romaji", "KanjiMode",
]);
function isButtonKey(e) {
  if (e.repeat || e.isComposing || e.keyCode === 229) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false; // a shortcut, not a press
  const k = e.key;
  if (NOT_BUTTON.has(k)) return false;
  if (/^F\d{1,2}$/.test(k)) return false;
  if (/^(Audio|Media|Browser|Launch|Volume|Brightness|Power|Wake|Sleep)/.test(k)) return false;
  return true;
}
window.addEventListener("keydown", (e) => {
  if (!isButtonKey(e)) return;
  e.preventDefault();
  press();
});
// The whole screen is the button, including the bands around the square scope.
window.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  press();
});
window.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- events → feedback ----
function handleEvents(g, events, audible) {
  for (const ev of events) {
    switch (ev.type) {
      case "paint": {
        if (!audible) break;
        if (ev.src === "shot") {
          // The echo comes back over the same range the ping went out: the
          // extra wait tells the distance, the pitch tells the approach.
          const delay = ev.range / (CFG.shotSpeed * g.k);
          const doppler = 1 + Math.max(-0.15, Math.min(0.15, ev.closing * 0.0025));
          sfx.sfxEcho(delay, doppler);
          app.echoes.push({ id: ev.id, range: ev.range, delay, doppler });
        } else {
          sfx.sfxPaint(ev.dist, ev.dist < CFG.aheadR);
        }
        break;
      }
      case "blink":
        app.fx.push({ k: "streak", x0: ev.from.x, y0: ev.from.y, x1: ev.to.x, y1: ev.to.y, t: 0, life: 0.28 });
        app.fx.push({ k: "ghost", x: ev.from.x, y: ev.from.y, t: 0, life: 0.35 });
        if (!ev.out) app.fx.push({ k: "arrive", x: ev.to.x, y: ev.to.y, t: 0, life: 0.22 });
        if (audible) sfx.sfxBlink(ev.out);
        break;
      case "shotEnd":
        app.fx.push({ k: "fizzle", x: ev.x, y: ev.y, t: 0, life: 0.25 });
        break;
      case "kill": {
        app.fx.push({ k: "burst", x: ev.x, y: ev.y, t: 0, life: 0.45, chain: ev.chain });
        app.fx.push({ k: "pts", x: ev.x, y: ev.y, t: 0, life: 0.9, pts: ev.pts, chain: ev.chain });
        // The kill travels to the bezel and puts out its quota tick.
        if (audible) app.fx.push({ k: "spark", x: ev.x, y: ev.y, slot: ev.slot, quota: ev.quota, t: 0, life: 0.42 });
        app.wobble = Math.max(app.wobble, 1.5 + ev.chain);
        if (ev.chain > 1 && CFG.chainRefund > 0) app.barFlash = 0.35;
        if (audible) app.hitstop = Math.max(app.hitstop, Math.min(0.11, 0.035 + 0.015 * ev.chain));
        if (ev.chain >= 3) {
          app.surge = Math.max(app.surge, Math.min(1, 0.22 * ev.chain));
          app.surgeCol = COL.phos;
        }
        if (audible) sfx.sfxKill(ev.chain);
        break;
      }
      case "death":
        app.fx.push({ k: "wreck", x: ev.x, y: ev.y, t: 0, life: 1.2, cause: ev.cause });
        if (ev.killer) app.fx.push({ k: "killer", ...ev.killer, t: 0, life: CFG.dyingTime });
        app.tear = 0.5;
        app.surge = 1;
        app.surgeCol = COL.danger;
        if (audible) sfx.sfxDeath(ev.cause);
        break;
      case "clear":
        app.fx.push({ k: "clearRing", t: 0, life: 1.0 });
        if (audible) app.tally = { bonus: ev.bonus, frac: ev.frac, t: 0, ticks: 0 };
        if (audible) sfx.sfxClear();
        break;
      case "extend":
        app.fx.push({ k: "extend", t: 0, life: 1.4 });
        if (audible) sfx.sfxExtend();
        break;
      case "gameover":
        if (audible) sfx.sfxGameOver();
        saveHi(g);
        break;
      case "complete":
        if (!audible) break;
        sfx.sfxComplete();
        saveHi(g);
        app.fx.push({ k: "clearRing", t: 0, life: 1.6 });
        app.surge = 0.8;
        app.surgeCol = COL.phos;
        break;
    }
  }
}

function saveHi(g) {
  if (g.score > HI) {
    app.newHi = g.score > 0;
    HI = g.score;
    try {
      localStorage.setItem("blink-scope-hi", String(HI));
    } catch {}
  }
}

// ---- simulation driver ----
let last = performance.now();
let acc = 0;
function frame(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  if (app.hitstop > 0) {
    app.hitstop -= dt;
    acc = 0;
  }
  while (acc >= DT) {
    acc -= DT;
    tick();
    if (app.hitstop > 0) {
      acc = 0;
      break;
    }
  }
  updateFx(dt);
  render();
  requestAnimationFrame(frame);
}

function tick() {
  if (app.mode === "title") {
    app.titleT += DT;
    if (!app.demo || app.demo.phase === "over" || app.demo.t > 40) newDemo();
    // The pilot reads the scope through the events (paints), like a player.
    const ev = step(app.demo, DT, app.demoBot(app.demo, app.demoEv));
    app.demoEv = ev.slice();
    handleEvents(app.demo, ev, false);
    return;
  }
  const g = app.game;
  const p = app.pressQueued || (app.pilot ? app.pilot(g, app.pilotEv) : false);
  app.pressQueued = false;
  const phaseBefore = g.phase;
  const th0 = g.theta;
  const ev = step(g, DT, p);
  if (app.pilot) app.pilotEv = ev.slice();
  if (g.phase === "play" || g.phase === "ready") metronome(th0, g.theta);
  handleEvents(g, ev, true);
  if (phaseBefore !== "ready" && g.phase === "ready") sfx.sfxReady();
  if (g.phase === "over" || g.phase === "complete") {
    app.overT += DT;
    if (app.overT > 12) {
      app.mode = "title";
      newDemo();
      if (g.phase === "over") powerOn();
    }
  }
}

// Eight clicks per sweep turn, accented at 12 o'clock: the beam's rhythm
// becomes audible, and it quickens with game speed.
function metronome(th0, th1) {
  const d = (((th1 - th0) % TAU) + TAU) % TAU;
  for (let m = 0; m < 8; m++) {
    const a = -Math.PI / 2 + (m * TAU) / 8;
    const r = (((a - th0) % TAU) + TAU) % TAU;
    if (r > 0 && r <= d) {
      sfx.sfxMetro(m === 0);
      app.metro++;
    }
  }
}

function tickPos(slot, quota, r = CFG.scopeR + 8.5) {
  const a = -Math.PI / 2 + (slot / quota) * TAU;
  return { x: CFG.cx + Math.cos(a) * r, y: CFG.cy + Math.sin(a) * r, a };
}

function updateFx(dt) {
  for (const f of app.fx) {
    f.t += dt;
    if (f.k === "spark" && f.t >= f.life && !f.done) {
      f.done = true;
      app.fx.push({ k: "tickFlash", slot: f.slot, quota: f.quota, t: 0, life: 0.35 });
      sfx.sfxTick();
    }
  }
  app.fx = app.fx.filter((f) => f.t < f.life);
  app.wobble = Math.max(0, app.wobble - dt * 28);
  app.surge = Math.max(0, app.surge - dt * 2.2);
  app.tear = Math.max(0, app.tear - dt);
  app.powerT += dt;
  app.barFlash = Math.max(0, app.barFlash - dt);
  if (app.tally) {
    const T = app.tally;
    T.t += dt;
    // Count-up clicks while the bar drains into the score.
    const u = tallyU(T);
    const want = Math.floor(u * 14);
    while (T.ticks < want && T.bonus > 0) {
      T.ticks++;
      sfx.sfxTick();
    }
    if (app.game?.phase !== "clear") app.tally = null;
  }
}

// ---- rendering ----
// The scope fills the largest square inside the safe area (notches, home bar).
function resize() {
  const cs = getComputedStyle(document.body);
  const px = (v) => parseFloat(v) || 0;
  const w = window.innerWidth - px(cs.paddingLeft) - px(cs.paddingRight);
  const h = window.innerHeight - px(cs.paddingTop) - px(cs.paddingBottom);
  const s = Math.max(100, Math.floor(Math.min(w, h)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = canvas.style.height = `${s}px`;
  canvas.width = canvas.height = Math.round(s * dpr);
}
window.addEventListener("resize", resize);
resize();

function glow(color, blur) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function edgeDistance(x, y, a) {
  // Distance from (x,y) along angle a to the scope circle.
  const dx = x - CFG.cx;
  const dy = y - CFG.cy;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const b = dx * c + dy * s;
  const q = dx * dx + dy * dy - CFG.scopeR * CFG.scopeR;
  return -b + Math.sqrt(Math.max(0, b * b - q));
}

function render() {
  const g = app.mode === "title" ? app.demo : app.game;
  const k = canvas.width / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Kills deflect the beam sideways only, like a vector monitor's X coil.
  const sx = Math.sin(performance.now() * 0.09) * app.wobble;
  ctx.setTransform(k, 0, 0, k, sx * k, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (app.mode === "game" && g.phase === "over" && app.overT >= COLLAPSE) {
    drawDark(g);
    return;
  }
  drawFace();
  if (g) drawWorld(g);
  drawHud(g);

  if (app.tear > 0) tearRaster();
  if (app.mode === "game" && g.phase === "over" && app.overT < COLLAPSE) collapse(app.overT);
  if (app.powerT < POWER_ON) powerOnFx(app.powerT);
}

// After the collapse the tube stays off: only the result is lit, over a
// fading ghost of the bezel.
function drawDark(g) {
  const t = app.overT - COLLAPSE;
  const ghost = Math.max(0, 0.22 * (1 - t / 2.5));
  if (ghost > 0) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = ghost;
    ctx.strokeStyle = COL.phos;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CFG.cx, CFG.cy, CFG.scopeR, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = 2;
  glow(COL.danger, 14);
  drawText(ctx, "GAME OVER", W / 2, 220, 18, "center");
  glow(COL.ship, 10);
  ctx.lineWidth = 1.5;
  drawText(ctx, String(g.score).padStart(6, "0"), W / 2, 290, 14, "center");
  glow(COL.phos, 6);
  drawText(ctx, "HI " + String(HI).padStart(6, "0"), W / 2, 330, 8, "center");
  if (app.newHi && Math.floor(t * 4) % 2 === 0) {
    glow(COL.hot, 12);
    drawText(ctx, "NEW HI", W / 2, 360, 9, "center");
  }
  if (app.overT > 1.2 && Math.floor(app.overT * 2) % 2 === 0) {
    glow(COL.phos, 8);
    drawText(ctx, "PUSH BUTTON", W / 2, 420, 9, "center");
  }
}

// Power on: a dot, a line, then the picture opens vertically.
const POWER_ON = 0.35;
function powerOnFx(t) {
  const n = canvas.width;
  const c = n / 2;
  grabFrame();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, n, n);
  ctx.shadowColor = COL.ship;
  ctx.fillStyle = COL.ship;
  if (t < 0.08) {
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(c, c, 3 * (n / 600), 0, TAU);
    ctx.fill();
  } else if (t < 0.18) {
    const sx = (t - 0.08) / 0.1;
    ctx.shadowBlur = 12;
    ctx.fillRect(c - (n * sx) / 2, c - 1.5, n * sx, 3);
  } else {
    const u = (t - 0.18) / (POWER_ON - 0.18);
    const sy = Math.max(0.006, 1 - Math.pow(1 - u, 3));
    ctx.drawImage(buf, 0, c - (n * sy) / 2, n, n * sy);
    ctx.globalAlpha = 1 - u;
    ctx.fillRect(0, c - 1, n, 2);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

// ---- CRT post effects (operate on the finished frame) ----
const buf = document.createElement("canvas");
const bctx = buf.getContext("2d");
function grabFrame() {
  if (buf.width !== canvas.width) buf.width = buf.height = canvas.width;
  bctx.clearRect(0, 0, buf.width, buf.height);
  bctx.drawImage(canvas, 0, 0);
}

// Ship lost: horizontal bands slip sideways and a few noise lines cross.
function tearRaster() {
  grabFrame();
  const n = canvas.width;
  const amp = (app.tear / 0.5) * n * 0.05;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowBlur = 0;
  let y = 0;
  while (y < n) {
    const h = Math.max(2, Math.round((4 + Math.random() * 26) * (n / 600)));
    const dx = (Math.random() - 0.5) * 2 * amp * (Math.random() < 0.6 ? 1 : 0.15);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, y, n, h);
    ctx.drawImage(buf, 0, y, n, h, dx, y, n, h);
    y += h;
  }
  ctx.fillStyle = "rgba(255,120,100,0.35)";
  for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.random() * n, n, Math.max(1, n / 600));
}

// Game over: the picture collapses to a line, then a dot, like a tube switching off.
const COLLAPSE = 0.9;
function collapse(t) {
  const n = canvas.width;
  const c = n / 2;
  if (t < 0.55) grabFrame();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, n, n);
  if (t < 0.3) {
    const sy = Math.max(0.006, 1 - Math.pow(t / 0.3, 2));
    ctx.drawImage(buf, 0, c - (n * sy) / 2, n, n * sy);
    ctx.globalAlpha = t / 0.3;
    ctx.fillStyle = COL.ship;
    ctx.fillRect(0, c - 1, n, 2);
    ctx.globalAlpha = 1;
  } else if (t < 0.55) {
    const sx = 1 - (t - 0.3) / 0.25;
    ctx.shadowColor = COL.ship;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COL.ship;
    ctx.fillRect(c - (n * sx) / 2, c - 1.5, n * sx, 3);
  } else {
    const a = 1 - (t - 0.55) / (COLLAPSE - 0.55);
    ctx.globalAlpha = a;
    ctx.shadowColor = COL.ship;
    ctx.shadowBlur = 18;
    ctx.fillStyle = COL.ship;
    ctx.beginPath();
    ctx.arc(c, c, 3 * (n / 600), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

function drawFace() {
  ctx.shadowBlur = 0;
  ctx.fillStyle = COL.face;
  ctx.beginPath();
  ctx.arc(CFG.cx, CFG.cy, CFG.scopeR, 0, TAU);
  ctx.fill();
  // Overload: the whole graticule blooms instead of a flat screen flash.
  const sg = app.surge;
  if (sg > 0) {
    ctx.globalAlpha = sg * 0.1;
    ctx.fillStyle = app.surgeCol;
    ctx.fill();
    ctx.globalAlpha = 1;
    glow(app.surgeCol, 10 * sg);
    ctx.globalAlpha = 0.12 + 0.6 * sg;
  } else {
    ctx.strokeStyle = COL.grid;
  }
  ctx.lineWidth = 1 + sg;
  for (let r = 70; r < CFG.scopeR; r += 70) {
    ctx.beginPath();
    ctx.arc(CFG.cx, CFG.cy, r, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(CFG.cx - CFG.scopeR, CFG.cy);
  ctx.lineTo(CFG.cx + CFG.scopeR, CFG.cy);
  ctx.moveTo(CFG.cx, CFG.cy - CFG.scopeR);
  ctx.lineTo(CFG.cx, CFG.cy + CFG.scopeR);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Bezel: the lethal edge.
  glow(sg > 0.3 ? app.surgeCol : COL.phos, 6 + 14 * sg);
  ctx.lineWidth = 2 + 2 * sg;
  ctx.beginPath();
  ctx.arc(CFG.cx, CFG.cy, CFG.scopeR, 0, TAU);
  ctx.stroke();
}

function drawWorld(g) {
  const alive = g.phase !== "dying" && g.phase !== "over" && g.phase !== "complete";
  const tp = tipPoint(g);
  const tipIn = insideScope(tp.x, tp.y);

  // Afterglow wedge behind the sweep, clipped to the scope face.
  ctx.save();
  ctx.beginPath();
  ctx.arc(CFG.cx, CFG.cy, CFG.scopeR - 1, 0, TAU);
  ctx.clip();
  if (alive) {
    const wedge = 1.1;
    const grad = ctx.createConicGradient(g.theta - wedge, g.px, g.py);
    grad.addColorStop(0, "rgba(61,255,134,0)");
    grad.addColorStop(wedge / TAU, "rgba(61,255,134,0.22)");
    grad.addColorStop(wedge / TAU + 0.0005, "rgba(61,255,134,0)");
    grad.addColorStop(1, "rgba(61,255,134,0)");
    ctx.shadowBlur = 0;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, W);
  }

  // Tracks: successive paints of one hunter, oldest to newest.
  const tracks = new Map();
  for (const b of g.blips) {
    if (b.out !== undefined) continue; // a destroyed contact's track is not drawn
    if (!tracks.has(b.id)) tracks.set(b.id, []);
    tracks.get(b.id).push(b);
  }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(61,255,134,0.28)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  for (const list of tracks.values()) {
    for (let i = 1; i < list.length; i++) {
      ctx.moveTo(list[i - 1].x, list[i - 1].y);
      ctx.lineTo(list[i].x, list[i].y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Painted blips.
  for (const b of g.blips) {
    const life = 1 - b.age / blipLife(g);
    if (life <= 0) continue;
    if (b.out !== undefined) {
      // Destroyed: the contact flashes and goes out.
      const u = Math.min(1, (g.t - b.out) / CFG.trackOut);
      ctx.globalAlpha = 1 - u;
      glow(COL.hot, 10);
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4 + 3 * u, 0, TAU);
      ctx.fill();
      continue;
    }
    const fresh = b.age < 0.12;
    ctx.globalAlpha = (0.22 + 0.78 * life * life) * Math.min(1, life * 6);
    // Too close to shoot (the blink would land on or past it): escape only.
    const inside = Math.hypot(b.x - g.px, b.y - g.py) < CFG.aheadR;
    const col = inside ? COL.danger : COL.phos;
    glow(fresh ? (inside ? "#ffd0c8" : COL.hot) : col, fresh ? 18 : 8);
    ctx.beginPath();
    ctx.arc(b.x, b.y, fresh ? 6 : 3.5 + life * 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (alive) {
    // Jump ring: every point the next blink can reach.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = COL.phosDim;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(g.px, g.py, CFG.jumpR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sweep line to the bezel.
    const len = edgeDistance(g.px, g.py, g.theta);
    glow(COL.phos, 10);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.px, g.py);
    ctx.lineTo(g.px + Math.cos(g.theta) * len, g.py + Math.sin(g.theta) * len);
    ctx.stroke();
    if (tipIn) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(g.px, g.py);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      // Firing cone: exactly the band a shot fired now would sweep.
      const c = Math.cos(g.theta);
      const s = Math.sin(g.theta);
      const w0 = shotHalfWidth(0);
      const w1 = shotHalfWidth(CFG.shotRange);
      const ex = tp.x + c * CFG.shotRange;
      const ey = tp.y + s * CFG.shotRange;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(230,255,240,0.22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(tp.x - s * w0, tp.y + c * w0);
      ctx.lineTo(ex - s * w1, ey + c * w1);
      ctx.moveTo(tp.x + s * w0, tp.y - c * w0);
      ctx.lineTo(ex + s * w1, ey - c * w1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Shots: a widening sonar wavefront, drawn at its true hit width.
  for (const sh of g.shots) {
    const K = 60;
    const cx = sh.ox - sh.dx * K;
    const cy = sh.oy - sh.dy * K;
    const a0 = Math.atan2(sh.dy, sh.dx);
    for (let i = 0; i < 3; i++) {
      const tr = sh.travel - i * 14;
      if (tr < 0) break;
      const r = K + tr;
      const span = shotHalfWidth(tr) / r;
      glow(COL.hot, i ? 6 : 16);
      ctx.globalAlpha = 1 - i * 0.35;
      ctx.lineWidth = i ? 1.5 : 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0 - span, a0 + span);
      ctx.stroke();
      if (i === 0) {
        // Faint flanks: the reveal band that paints hunters the shot passes.
        const rs = (shotHalfWidth(tr) + CFG.revealExtra) / r;
        glow(COL.phos, 6);
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0 + span, a0 + rs);
        ctx.moveTo(cx + Math.cos(a0 - rs) * r, cy + Math.sin(a0 - rs) * r);
        ctx.arc(cx, cy, r, a0 - rs, a0 - span);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (alive) {
    // Landing diamond; turns red and hollow when it lies off the scope.
    const a = g.theta;
    const r = tipIn ? 8 : 9;
    glow(tipIn ? COL.hot : COL.danger, tipIn ? 12 : 8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tp.x + Math.cos(a) * r, tp.y + Math.sin(a) * r);
    ctx.lineTo(tp.x + Math.cos(a + 1.5708) * r * 0.6, tp.y + Math.sin(a + 1.5708) * r * 0.6);
    ctx.lineTo(tp.x - Math.cos(a) * r, tp.y - Math.sin(a) * r);
    ctx.lineTo(tp.x - Math.cos(a + 1.5708) * r * 0.6, tp.y - Math.sin(a + 1.5708) * r * 0.6);
    ctx.closePath();
    ctx.stroke();
    if (!tipIn) {
      ctx.beginPath();
      ctx.moveTo(tp.x - 5, tp.y - 5);
      ctx.lineTo(tp.x + 5, tp.y + 5);
      ctx.moveTo(tp.x + 5, tp.y - 5);
      ctx.lineTo(tp.x - 5, tp.y + 5);
      ctx.stroke();
    }

    // Close range: a hunter this near shows as a bare dim dot, unpainted.
    ctx.shadowBlur = 0;
    ctx.fillStyle = COL.danger;
    ctx.globalAlpha = 0.7;
    for (const h of g.hunters) {
      if (Math.hypot(h.x - g.px, h.y - g.py) <= CFG.nearR) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Ship.
    const blinkAge = g.t - g.lastJumpT;
    const flick = g.phase === "ready" && Math.floor(g.phaseT * 10) % 2 === 0;
    if (!flick) {
      glow(COL.ship, 14);
      ctx.lineWidth = 2;
      const s = 7 + Math.max(0, 0.12 - blinkAge) * 40;
      ctx.beginPath();
      ctx.moveTo(g.px - s, g.py);
      ctx.lineTo(g.px + s, g.py);
      ctx.moveTo(g.px, g.py - s);
      ctx.lineTo(g.px, g.py + s);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.px, g.py, 3, 0, TAU);
      ctx.stroke();
    }
  }

  drawFx();
}

function drawFx() {
  for (const f of app.fx) {
    const u = f.t / f.life;
    const inv = 1 - u;
    if (f.k === "streak") {
      glow(COL.ship, 10);
      ctx.globalAlpha = inv * 0.8;
      ctx.lineWidth = 1 + inv * 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(f.x0 + (f.x1 - f.x0) * u * 0.9, f.y0 + (f.y1 - f.y0) * u * 0.9);
      ctx.lineTo(f.x1, f.y1);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.k === "ghost") {
      glow(COL.phos, 8);
      ctx.globalAlpha = inv * 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3 + inv * 10, 0, TAU);
      ctx.stroke();
    } else if (f.k === "arrive") {
      glow(COL.ship, 12);
      ctx.globalAlpha = inv;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4 + u * CFG.contactR, 0, TAU);
      ctx.stroke();
    } else if (f.k === "burst") {
      // Ring grows to the burst radius: shows what the chain can reach.
      const e = 1 - Math.pow(1 - Math.min(1, u * 2.2), 3);
      glow(COL.hot, 20);
      ctx.globalAlpha = inv;
      ctx.lineWidth = 2 + inv * 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 4 + e * CFG.burstR, 0, TAU);
      ctx.stroke();
      if (u < 0.2) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 9, 0, TAU);
        ctx.fill();
      }
      // Shards.
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + f.x;
        const r0 = 6 + e * 18;
        const r1 = r0 + 6 * inv;
        ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
        ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
      }
      ctx.stroke();
    } else if (f.k === "spark") {
      // Accelerates from the kill to its bezel tick, trailing phosphor.
      const end = tickPos(f.slot, f.quota);
      const pos = (v) => {
        const e = v * v * v;
        return { x: f.x + (end.x - f.x) * e, y: f.y + (end.y - f.y) * e };
      };
      glow(COL.hot, 10);
      ctx.lineWidth = 2;
      const a = pos(Math.max(0, u - 0.18));
      const b = pos(u);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, TAU);
      ctx.fill();
    } else if (f.k === "tickFlash") {
      const p = tickPos(f.slot, f.quota);
      glow(COL.hot, 14);
      ctx.globalAlpha = inv;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CFG.cx + Math.cos(p.a) * (CFG.scopeR + 3), CFG.cy + Math.sin(p.a) * (CFG.scopeR + 3));
      ctx.lineTo(CFG.cx + Math.cos(p.a) * (CFG.scopeR + 14 + 6 * inv), CFG.cy + Math.sin(p.a) * (CFG.scopeR + 14 + 6 * inv));
      ctx.stroke();
    } else if (f.k === "fizzle") {
      glow(COL.phos, 6);
      ctx.globalAlpha = inv * 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3 + u * 8, 0, TAU);
      ctx.stroke();
    } else if (f.k === "pts") {
      glow(f.chain >= 3 ? COL.hot : COL.phos, 8);
      ctx.globalAlpha = Math.min(1, inv * 2);
      ctx.lineWidth = f.chain >= 3 ? 2 : 1.5;
      const size = 6 + Math.min(f.chain, 6) * 1.5;
      drawText(ctx, String(f.pts), f.x, f.y - CFG.burstR - 14 - u * 22, size, "center");
    } else if (f.k === "wreck") {
      glow(COL.danger, 14);
      ctx.globalAlpha = inv;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3;
        const r = 4 + u * 60;
        ctx.moveTo(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r);
        ctx.lineTo(f.x + Math.cos(a + 0.25) * (r + 8), f.y + Math.sin(a + 0.25) * (r + 8));
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x, f.y, u * 90, 0, TAU);
      ctx.stroke();
    } else if (f.k === "killer") {
      // What got you: true position and heading, held while the wreck fades.
      const len = f.speed * 0.6;
      glow(COL.danger, 6);
      ctx.globalAlpha = Math.min(1, inv * 1.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(f.x - Math.cos(f.h) * 5, f.y - Math.sin(f.h) * 5);
      ctx.lineTo(f.x - Math.cos(f.h) * (5 + len), f.y - Math.sin(f.h) * (5 + len));
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.k === "clearRing") {
      glow(COL.hot, 16);
      ctx.globalAlpha = inv;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CFG.cx, CFG.cy, CFG.scopeR * (1 - u * 0.9), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

const TALLY_DELAY = 0.35;
const TALLY_DUR = 0.9;
function tallyU(T) {
  return Math.max(0, Math.min(1, (T.t - TALLY_DELAY) / TALLY_DUR));
}

function drawHud(g) {
  const p = g ? sectorParams(g.sector, g.k) : null;
  // Quota ticks around the bezel: one per hunter left in the sector.
  if (g && app.mode === "game") {
    const left = Math.max(0, p.quota - g.killed);
    // A tick stays lit until the spark carrying its kill arrives.
    const inFlight = new Set();
    for (const f of app.fx) if (f.k === "spark" && f.quota === p.quota) inFlight.add(f.slot);
    ctx.lineWidth = 2;
    for (let i = 0; i < p.quota; i++) {
      const a = -Math.PI / 2 + (i / p.quota) * TAU;
      const lit = i < left || inFlight.has(i);
      glow(lit ? COL.phos : "rgba(61,255,134,0.15)", lit ? 6 : 0);
      ctx.beginPath();
      ctx.moveTo(CFG.cx + Math.cos(a) * (CFG.scopeR + 5), CFG.cy + Math.sin(a) * (CFG.scopeR + 5));
      ctx.lineTo(CFG.cx + Math.cos(a) * (CFG.scopeR + 12), CFG.cy + Math.sin(a) * (CFG.scopeR + 12));
      ctx.stroke();
    }

    // Time bar: the sector's remaining time bonus, draining clockwise-back to
    // 12 o'clock. Chains refill it (white flash); on clear it drains into the score.
    let frac = g.phase === "complete" ? 0 : bonusFrac(g);
    if (app.tally) frac = app.tally.frac * (1 - tallyU(app.tally));
    if (frac > 0.002) {
      const hot = app.barFlash > 0;
      glow(hot ? COL.hot : COL.phos, hot ? 12 : 4);
      ctx.globalAlpha = hot ? 1 : 0.75;
      ctx.lineWidth = hot ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(CFG.cx, CFG.cy, CFG.scopeR + 17, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  glow(COL.phos, 6);
  ctx.lineWidth = 1.5;
  let score = app.mode === "game" ? g.score : 0;
  if (app.mode === "game" && app.tally) score -= Math.round((app.tally.bonus * (1 - tallyU(app.tally))) / 10) * 10;
  drawText(ctx, String(score).padStart(6, "0"), 14, 14, 9);
  drawText(ctx, "HI " + String(Math.max(HI, score)).padStart(6, "0"), W - 14, 14, 9, "right");

  if (app.mode === "game") {
    // Remaining ships.
    glow(COL.ship, 6);
    for (let i = 0; i < Math.min(Math.max(0, g.lives - 1), 6); i++) {
      const x = 22 + i * 20;
      const y = W - 22;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }
    glow(COL.phos, 6);
    drawText(ctx, "SECTOR " + g.sector, W - 14, W - 28, 7, "right");
  }

  // Center messages.
  ctx.lineWidth = 2;
  if (app.mode === "title") {
    const pulse = 0.6 + 0.4 * Math.sin(app.titleT * 3);
    glow(COL.hot, 18);
    drawText(ctx, "BLINK SCOPE", W / 2, 236, 22, "center");
    ctx.globalAlpha = pulse;
    glow(COL.phos, 10);
    ctx.lineWidth = 1.5;
    drawText(ctx, "PUSH BUTTON", W / 2, 350, 10, "center");
    ctx.globalAlpha = 1;
    return;
  }
  if (g.phase === "ready") {
    glow(COL.hot, 12);
    drawText(ctx, "SECTOR " + g.sector, W / 2, 160, 14, "center");
  } else if (g.phase === "complete") {
    const t = app.overT;
    glow(COL.hot, 16);
    drawText(ctx, "ALL SECTORS CLEAR", W / 2, 200, 14, "center");
    glow(COL.ship, 10);
    ctx.lineWidth = 1.5;
    drawText(ctx, String(g.score).padStart(6, "0"), W / 2, 280, 14, "center");
    glow(COL.phos, 6);
    drawText(ctx, "HI " + String(HI).padStart(6, "0"), W / 2, 320, 8, "center");
    if (app.newHi && Math.floor(t * 4) % 2 === 0) {
      glow(COL.hot, 12);
      drawText(ctx, "NEW HI", W / 2, 350, 9, "center");
    }
    if (t > 1.2 && Math.floor(t * 2) % 2 === 0) {
      glow(COL.phos, 8);
      drawText(ctx, "PUSH BUTTON", W / 2, 410, 9, "center");
    }
  } else if (g.phase === "clear") {
    glow(COL.hot, 14);
    drawText(ctx, "SECTOR CLEAR", W / 2, 250, 14, "center");
    glow(COL.phos, 8);
    const T = app.tally;
    const shown = T ? Math.round((T.bonus * tallyU(T)) / 10) * 10 : 0;
    drawText(ctx, "TIME BONUS " + shown, W / 2, 300, 9, "center");
  }
  for (const f of app.fx) {
    if (f.k === "extend") {
      glow(COL.hot, 12);
      ctx.globalAlpha = Math.floor(f.t * 8) % 2 ? 0.4 : 1;
      drawText(ctx, "EXTRA SHIP", W / 2, 380, 10, "center");
      ctx.globalAlpha = 1;
    }
  }
}

newDemo();
requestAnimationFrame(frame);

// Debug/test handle.
window.__blink = {
  app,
  CFG,
  get game() {
    return app.game;
  },
  startGame,
  press,
  peak: () => sfx.peakLevel(),
  // Tool hook: start a game and record its sound from that exact moment.
  // Resolves to the recording (base64 webm/opus) when stopRecording() is called.
  startRecordedGame(seed, pilotSeed) {
    sfx.unlockAudio();
    const stream = sfx.captureStream();
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 128000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = () => res(new Blob(chunks, { type: "audio/webm" }))));
    rec.start();
    startGame(seed);
    app.pilot = makeDemoBot(makeRng(pilotSeed));
    window.__blinkRec = { rec, done };
  },
  async stopRecording() {
    const { rec, done } = window.__blinkRec;
    rec.stop();
    const blob = await done;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  flatness: () => sfx.flatness(),
  // Test hook: let the attract pilot play a real game.
  autopilot(seed = 1) {
    app.pilot = makeDemoBot(makeRng(seed));
  },
};
