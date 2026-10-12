// Browser entry: fixed-timestep loop, the title screen, input mapping
// (keyboard, pointer, gamepad), sound, the best score, and the
// debug handle window.__game that every browser-side check goes through
// (contract in README.md).

import { createSim, stepSim, hashState, capabilities, FRAME_MS } from "./sim/sim.js";
import { INPUT } from "./sim/input.js";
import { FIELD, VIEW, SHIP, MODES, MODE_IDS, startSectorOk } from "./sim/constants.js";
import { PATTERN_IDS } from "./sim/flight.js";
import { FIELD_PER_SCREEN } from "./sim/camera.js";
import { shipAbsent } from "./sim/player.js";
import { expandReplay, encodeReplay, replaySetup } from "./sim/replay.js";
import { draw as drawFrame, drawTitle, drawPaused, CANVAS_WIDTH, CANVAS_HEIGHT } from "./render/canvas.js";
import { createFx, fxStep } from "./render/fx.js";
import { createAudioBus } from "./audio/bus.js";
import { createWebAudioAdapter } from "./audio/webaudio.js";
import { bossTuneAt, cueFor, loopForMusic } from "./audio/music.js";

const MAX_STEPS_PER_TICK = 5;

const KEY_BITS = {
  ArrowUp: INPUT.UP,
  ArrowDown: INPUT.DOWN,
  ArrowLeft: INPUT.LEFT,
  ArrowRight: INPUT.RIGHT,
  KeyW: INPUT.UP,
  KeyS: INPUT.DOWN,
  KeyA: INPUT.LEFT,
  KeyD: INPUT.RIGHT,
  KeyZ: INPUT.SHOT,
};

const params = new URLSearchParams(location.search);
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
// Fill the window as far as the aspect ratio allows, keeping hard pixels.
canvas.style.aspectRatio = `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`;
canvas.style.width = `min(100vw, calc(100dvh * ${CANVAS_WIDTH / CANVAS_HEIGHT}))`;

// What the page keeps between visits. Storage can be missing or blocked, and
// the game must run the same without it.
const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // not kept; nothing depends on it
    }
  },
};
const MUTE_KEY = "parallaxia.muted";

// Sound. The bus exists from the start; the output it drives can only be
// opened by a key press or a touch, and until then nothing sounds.
let output = null;
const bus = createAudioBus({
  playProgram: (program, options) => output?.playProgram(program, options),
  playMusic: (id) => output?.playMusic(id),
  pumpMusic: () => output?.pumpMusic(),
  stopAll: () => output?.stopAll(),
  suspend: () => output?.suspend(),
  resume: () => output?.resume(),
});
bus.setMuted(store.get(MUTE_KEY, "0") === "1");
function unlockAudio() {
  if (output) {
    wakeAudio();
    return;
  }
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    output = createWebAudioAdapter(context);
    if (document.visibilityState !== "visible") output.suspend();
    // The output has only now opened: whatever music is wanted starts here.
    if (bus.playing) output.playMusic(bus.playing);
  } catch {
    output = null;
  }
}
// An output opened by a touch going down may start out stopped: some browsers
// (iOS Safari) count only the touch coming up as the player's doing. So every
// later key and touch, down or up, asks it to run, unless the page is hidden
// or the player is holding the run.
function wakeAudio() {
  if (output && !held && document.visibilityState === "visible") output.resume();
}
document.addEventListener("visibilitychange", () => {
  bus.setHostVisible(document.visibilityState === "visible");
  // Back on a run the player is holding: the sound stays stopped with it.
  if (held) output?.suspend();
});

// A given seed (as the tools pass) skips the title and plays that run.
// Which build this page is: the label of a snapshot when it is served from
// snapshots/<label>/, "dev" for the working copy. A saved replay names it.
const BUILD = /\/snapshots\/([\w.-]+)\//.exec(location.pathname)?.[1] ?? "dev";
// ?rec=1 saves every run as a file when it ends, for measuring how a person
// plays (tools/replay-stats.mjs). There is no key for it.
const autoSave = params.get("rec") === "1";
const fixedSeed = params.has("seed") ? Number(params.get("seed")) : null;
// ?drill=hook plays one flight pattern on its own, over and over (&count=5 for
// the size of the formation, &middle=1 to add a middle enemy). The digit keys
// switch pattern. It is for looking at a pattern, not part of the game.
let drill = PATTERN_IDS.includes(params.get("drill")) ? { pattern: params.get("drill"), count: Number(params.get("count") ?? 0), middle: params.get("middle") === "1" || params.has("mflight"), middleFlight: params.get("mflight") ?? "", large: params.get("large") === "1" || params.has("lflight"), largeFlight: params.get("lflight") ?? "" } : null;
// The mode and the start sector chosen on the title. The furthest start (the
// first sector of every loop reached) is shared by the modes, so that a
// sector too hard in one mode can be passed in another; the best score is
// kept per mode and start. ?mode= and ?start= set them for the tools.
const MODE_KEY = "parallaxia.mode";
// The modes as the title offers them, left to right: from the fastest enemy
// bullets to the slowest. The first is what a first visit starts on: CHAIN is
// the gentlest to begin in and the plainest to score in (author's decision,
// 2026-10-12). The sim and the tools go on defaulting to "normal".
const TITLE_MODES = Object.freeze(["rapid", "normal", "dense"]);
const REACH_KEY = "parallaxia.reach";
const hiKey = (id, start) => `parallaxia.hi.${id}.${start}`;
const reachNow = () => {
  // (A build that kept one per mode: the furthest of those counts.)
  const kept = [REACH_KEY, ...MODE_IDS.map((id) => `${REACH_KEY}.${id}`)].map((key) => Number(store.get(key, "1"))).filter(startSectorOk);
  return Math.max(1, ...kept);
};
const select = { mode: MODE_IDS.includes(params.get("mode") ?? store.get(MODE_KEY, TITLE_MODES[0])) ? (params.get("mode") ?? store.get(MODE_KEY, TITLE_MODES[0])) : TITLE_MODES[0], start: 1 };
// (?start= counts only beside ?seed=, as the tools give it: by itself it would
// open a sector that has not been reached.)
if (params.has("seed") && startSectorOk(Number(params.get("start")))) select.start = Number(params.get("start"));
// Whether this page's runs go on the record (the best score, the starts
// opened). Not a run whose seed the URL fixed, which can be played over and
// over the same; not a snapshot, which may have other rules and shares the
// game's storage; not a drill.
const onRecord = fixedSeed === null && BUILD === "dev";
let sim = createSim({ seed: fixedSeed ?? 1, drill, mode: select.mode, startSector: select.start });
let fx = createFx();
let mode = fixedSeed === null && !drill && params.get("paused") !== "1" ? "title" : "play";
let titleFrame = 0;
let titleShotWasDown = true;
const hiOf = (id, start) => Math.max(0, Number(store.get(hiKey(id, start), "0")) || 0);
// label: the mode being played (or the drill). notice: { text, life } a line
// shown for a while, for a new start sector opening.
const hud = { hiScore: hiOf(select.mode, select.start), newRecord: false, label: "", notice: null };
const labelNow = () => (drill ? `DRILL ${drill.pattern.toUpperCase()}` : MODES[sim.mode].name);
hud.label = labelNow();
let titlePrevBits = 0;
// Every input since the sim was created: with the seed, the whole session.
// via: which of keyboard, pointer and gamepad moved the ship in it.
let recording = { seed: sim.seed, inputs: [], via: new Set() };
const GAMEOVER_TO_TITLE_FRAMES = 900;

const draw = (c, s) =>
  mode === "title"
    ? drawTitle(c, { frame: titleFrame, hiScore: hiOf(select.mode, select.start), muted: bus.muted, modeName: MODES[select.mode].name, modeId: select.mode, start: select.start, reach: reachNow() })
    : drawFrame(c, s, fx, hud);
// Every sim step goes through here so the effects and the sound see every
// event. A replay played back at once is silent.
const advance = (input, { sound = true } = {}) => {
  const phaseBefore = sim.phase;
  stepSim(sim, input);
  fxStep(fx, sim);
  recording.inputs.push(sim.input);
  const ended = phaseBefore === "play" && sim.phase === "gameover";
  if (sound) {
    bus.beginFrame(sim.frame);
    bus.emitSimEvents(sim.events);
    if (ended) bus.emit("run:gameover");
    bus.endFrame();
    if (ended && autoSave) saveReplay();
  }
  if (hud.notice && --hud.notice.life <= 0) hud.notice = null;
  if (onRecord && !drill) {
    // Reaching the first sector of a loop opens it as a place to start from,
    // in every mode.
    for (const e of sim.events) {
      if (e.type !== "section" || !startSectorOk(e.number) || e.number <= reachNow()) continue;
      store.set(REACH_KEY, e.number);
      hud.notice = { text: `START ${e.number} OPEN`, life: 240 };
    }
    if (ended && sim.score > hud.hiScore) {
      hud.hiScore = sim.score;
      hud.newRecord = true;
      store.set(hiKey(sim.mode, sim.startSector), sim.score);
    }
  }
};
function newSim(seed, { course = 0, mode: id = select.mode, startSector = select.start } = {}) {
  sim = createSim({ seed, drill, course, mode: id, startSector });
  fx = createFx();
  // The bus counts in the sim's frames, and those start again from 0: voices
  // still held from the run before would drop every sound of this one.
  bus.stopAll();
  recording = { seed: sim.seed, inputs: [], via: new Set() };
  hud.newRecord = false;
  hud.notice = null;
  if (held) {
    held = false;
    output?.resume();
  }
  hud.hiScore = hiOf(sim.mode, sim.startSector);
  hud.label = labelNow();
}
// On the title: left and right change the mode, up and down the start sector
// (only those reached, in whichever mode).
function titleSelect(dMode, dStart) {
  if (dMode !== 0) {
    select.mode = TITLE_MODES[(TITLE_MODES.indexOf(select.mode) + dMode + TITLE_MODES.length) % TITLE_MODES.length];
    store.set(MODE_KEY, select.mode);
  }
  if (dStart !== 0) select.start = Math.max(1, Math.min(reachNow(), select.start + dStart * 10));
}
// From the title: a run nobody has seen, unless the URL fixed the seed.
function startFromTitle() {
  newSim(fixedSeed ?? (Date.now() ^ Math.imul(titleFrame + 1, 2654435761)) >>> 0);
  mode = "play";
  bus.beginFrame(0);
  bus.emit("run:start");
  bus.endFrame();
}
let paused = params.get("paused") === "1";
// The player's own pause (P). `paused` above is the tools' and is theirs alone.
let held = false;
let keyboardBits = 0;
let injectedBits = null;
let accumulator = 0;
let lastTime = null;

// Pointer control (touch or mouse), meant for phones:
//   - drag anywhere: the ship follows the finger's movement (not its position),
//     at the ship's own speed, and fires the whole time; lifting the finger
//     lets go of shot, which releases the lock-on lasers
// It only produces the same input bits the keyboard does, so replays and the
// sim know nothing about it.
const pointers = new Map();
const drag = { id: null, anchorX: 0, anchorY: 0, shipX: 0, shipY: 0 };

function anchorDrag(p) {
  drag.anchorX = p.x;
  drag.anchorY = p.y;
  drag.shipX = sim.ship.x;
  drag.shipY = sim.ship.y;
}

function pointerBits() {
  if (drag.id === null || !pointers.has(drag.id)) return 0;
  const p = pointers.get(drag.id);
  const ship = sim.ship;
  if (shipAbsent(ship)) {
    anchorDrag(p);
    drag.shipX = SHIP.startX;
    drag.shipY = SHIP.startY;
    return INPUT.SHOT;
  }
  const unitsPerPixel = (VIEW.halfW * 2) / canvas.clientWidth;
  // Sideways, the view scrolls with the ship; scale the drag so the ship still
  // tracks the finger on screen.
  const xUnitsPerPixel = unitsPerPixel * FIELD_PER_SCREEN;
  const limitX = FIELD.halfW - SHIP.margin;
  const limitY = FIELD.halfH - SHIP.margin;
  let tx = drag.shipX + (p.x - drag.anchorX) * xUnitsPerPixel;
  let ty = drag.shipY - (p.y - drag.anchorY) * unitsPerPixel;
  // Dragging past an edge must not bank up distance to be dragged back.
  if (Math.abs(tx) > limitX) {
    drag.anchorX += (tx - Math.sign(tx) * limitX) / xUnitsPerPixel;
    tx = Math.sign(tx) * limitX;
  }
  if (Math.abs(ty) > limitY) {
    drag.anchorY -= (ty - Math.sign(ty) * limitY) / unitsPerPixel;
    ty = Math.sign(ty) * limitY;
  }
  let bits = INPUT.SHOT;
  const dead = MODES[sim.mode].shipSpeed / 2;
  if (tx - ship.x > dead) bits |= INPUT.RIGHT;
  else if (ship.x - tx > dead) bits |= INPUT.LEFT;
  if (ty - ship.y > dead) bits |= INPUT.UP;
  else if (ship.y - ty > dead) bits |= INPUT.DOWN;
  return bits;
}

// The title's two rows of choices, in canvas pixels (drawTitle puts them there).
// The start row has an arrow above its line and one below: `startMid` is the
// line between the two.
const TITLE_ROWS = Object.freeze({ mode: [104, 126], start: [126, 152], startMid: 139 });
window.addEventListener("pointerdown", (e) => {
  if (mode === "title") {
    // A touch on a row changes that choice and does not start the run: the
    // mode by the left and right halves of its row, the start sector by the
    // upper and lower halves of its own, as the arrows point.
    const box = canvas.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * CANVAS_WIDTH;
    const y = ((e.clientY - box.top) / box.height) * CANVAS_HEIGHT;
    const step = x < CANVAS_WIDTH / 2 ? -1 : 1;
    const row = y >= TITLE_ROWS.mode[0] && y < TITLE_ROWS.mode[1] ? "mode" : y >= TITLE_ROWS.start[0] && y < TITLE_ROWS.start[1] ? "start" : null;
    if (row) {
      titleSelect(row === "mode" ? step : 0, row === "start" ? (y < TITLE_ROWS.startMid ? 1 : -1) : 0);
      e.preventDefault();
      return;
    }
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (drag.id === null) {
    drag.id = e.pointerId;
    anchorDrag(pointers.get(e.pointerId));
  }
  e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
});
function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (drag.id !== e.pointerId) return;
  // If another finger is still down, it takes over the drag.
  drag.id = pointers.size > 0 ? pointers.keys().next().value : null;
  if (drag.id !== null) anchorDrag(pointers.get(drag.id));
}
window.addEventListener("pointerup", pointerEnd);
window.addEventListener("pointercancel", pointerEnd);

// Any connected pad: left stick or d-pad to move, any of the four face
// buttons to shoot.
function gamepadBits() {
  let bits = 0;
  const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    const pressed = (i) => Boolean(pad.buttons?.[i]?.pressed);
    const x = pad.axes?.[0] ?? 0;
    const y = pad.axes?.[1] ?? 0;
    if (x < -0.5 || pressed(14)) bits |= INPUT.LEFT;
    if (x > 0.5 || pressed(15)) bits |= INPUT.RIGHT;
    if (y < -0.5 || pressed(12)) bits |= INPUT.UP;
    if (y > 0.5 || pressed(13)) bits |= INPUT.DOWN;
    if (pressed(0) || pressed(1) || pressed(2) || pressed(3)) bits |= INPUT.SHOT;
  }
  return bits;
}

const currentInput = () => {
  if (injectedBits !== null) return injectedBits;
  const from = { keyboard: keyboardBits, pointer: pointerBits(), gamepad: gamepadBits() };
  if (mode === "play") for (const name in from) if (from[name] !== 0) recording.via.add(name);
  return from.keyboard | from.pointer | from.gamepad;
};

const currentReplay = () => encodeReplay(recording.seed, recording.inputs, { mode: sim.mode, startSector: sim.startSector });

// The run as a file a tool can read: the replay,
// which build played it, and where it ended, so that a tool replaying it can
// tell whether it has the same rules.
const replayFile = () => ({
  ...currentReplay(),
  build: BUILD,
  via: [...recording.via].sort(),
  end: { frames: recording.inputs.length, score: sim.score, sector: sim.stage.section + 1, hash: hashState(sim) },
});
// Hands the run to the browser as a download. Not for a drill: a replay does
// not say which one.
function saveReplay() {
  if (drill || recording.inputs.length === 0) return false;
  const file = replayFile();
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
  link.download = `parallaxia-${BUILD}-${sim.mode}-${sim.startSector}-${sim.score}-${stamp}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  hud.notice = { text: "REPLAY SAVED", life: 120 };
  return true;
}

window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("pointerup", unlockAudio);
window.addEventListener("touchend", unlockAudio);
window.addEventListener("keydown", (e) => {
  unlockAudio();
  if (!e.repeat && e.code === "KeyM") {
    bus.setMuted(!bus.muted);
    store.set(MUTE_KEY, bus.muted ? "1" : "0");
  }
  // P holds a run where it is and lets it go again: the game stands still and
  // the sound stops with it (the music carries on from the same note).
  if (!e.repeat && e.code === "KeyP" && mode === "play" && sim.phase === "play") {
    held = !held;
    if (held) output?.suspend();
    else output?.resume();
  }
  // Digits pick one of the first nine patterns; the brackets step through all.
  const stepTo = e.code === "BracketRight" ? 1 : e.code === "BracketLeft" ? -1 : 0;
  if (drill && (/^Digit[1-9]$/.test(e.code) || stepTo !== 0)) {
    const at = stepTo !== 0 ? (PATTERN_IDS.indexOf(drill.pattern) + stepTo + PATTERN_IDS.length) % PATTERN_IDS.length : Number(e.code.slice(5)) - 1;
    drill = { ...drill, pattern: PATTERN_IDS[at] };
    hud.label = `DRILL ${drill.pattern.toUpperCase()}`;
    newSim(sim.seed);
  }
  const bit = KEY_BITS[e.code];
  if (bit === undefined) return;
  keyboardBits |= bit;
  e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  const bit = KEY_BITS[e.code];
  if (bit === undefined) return;
  keyboardBits &= ~bit;
  e.preventDefault();
});
window.addEventListener("blur", () => {
  keyboardBits = 0;
  pointers.clear();
  drag.id = null;
});

function tick(now) {
  if (lastTime === null) lastTime = now;
  const elapsed = now - lastTime;
  lastTime = now;
  if (held) accumulator = 0;
  else if (!paused) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FRAME_MS && steps < MAX_STEPS_PER_TICK) {
      if (mode === "title") {
        // A fresh press of shot starts; one held over from the last run does not.
        const bits = currentInput();
        const shotDown = (bits & INPUT.SHOT) !== 0;
        const fresh = bits & ~titlePrevBits;
        titlePrevBits = bits;
        titleSelect(fresh & INPUT.RIGHT ? 1 : fresh & INPUT.LEFT ? -1 : 0, fresh & INPUT.UP ? 1 : fresh & INPUT.DOWN ? -1 : 0);
        titleFrame++;
        if (shotDown && !titleShotWasDown) startFromTitle();
        titleShotWasDown = shotDown;
      } else {
        advance(currentInput());
        // A finished run goes back to the title: at a press of shot, or
        // left alone for a while.
        if (sim.phase === "gameover" && (sim.dismissed || sim.phaseFrames > GAMEOVER_TO_TITLE_FRAMES)) {
          mode = "title";
          titleShotWasDown = true;
          titlePrevBits = ~0;
        }
      }
      accumulator -= FRAME_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_TICK) accumulator = 0;
  }
  // The music follows the scene: the title, the sector's loop, a loop's last boss; none
  // once the run is over.
  bus.setMusic(cueFor({ title: mode === "title", playing: sim.phase === "play", boss: bossTuneAt(sim.stage.section, sim.stage.boss !== 0), loop: loopForMusic(sim.stage.section, sim.stage.boss !== 0) }));
  bus.pump();
  draw(ctx, sim);
  if (held) drawPaused(ctx);
  requestAnimationFrame(tick);
}

// Anything a check does through the handle is about the game, not the title.
const leaveTitle = () => {
  mode = "play";
};

window.__game = {
  contractVersion: 2,
  capabilities,
  get mode() {
    return mode;
  },
  // What is chosen on the title, and the furthest start that is open.
  get title() {
    return { mode: select.mode, start: select.start, reach: reachNow() };
  },
  // What the bus decided, newest last, and whether sound is muted.
  get audio() {
    return { log: bus.log, muted: bus.muted, unlocked: output !== null, music: bus.playing, held };
  },
  // Every input since the last reset, as a replay.
  replay() {
    return currentReplay();
  },
  // What ?rec=1 saves when a run ends, as it would be now.
  replayFile() {
    return replayFile();
  },
  get state() {
    return sim;
  },
  get frame() {
    return sim.frame;
  },
  get paused() {
    return paused;
  },
  pause() {
    paused = true;
  },
  resume() {
    paused = false;
    accumulator = 0;
    lastTime = null;
  },
  reset({ seed = sim.seed, course = 0, mode: id = "normal", startSector = 1 } = {}) {
    leaveTitle();
    newSim(seed, { course, mode: id, startSector });
    accumulator = 0;
    draw(ctx, sim);
    return sim;
  },
  // Advances exactly n frames and stops the real-time loop, so a check owns
  // the clock. `input` overrides the held input for these frames only.
  step(n = 1, input) {
    paused = true;
    leaveTitle();
    for (let i = 0; i < n; i++) advance(input === undefined ? currentInput() : input);
    draw(ctx, sim);
    return sim.frame;
  },
  // Holds these input bits instead of the keyboard; null gives it back.
  setInput(bits) {
    injectedBits = bits === null || bits === undefined ? null : bits;
  },
  runReplay(replay, { maxFrames = Infinity } = {}) {
    paused = true;
    leaveTitle();
    newSim(replay.seed, replaySetup(replay));
    const inputs = expandReplay(replay);
    const n = Math.min(inputs.length, maxFrames);
    for (let i = 0; i < n; i++) advance(inputs[i], { sound: false });
    draw(ctx, sim);
    return hashState(sim);
  },
  hash() {
    return hashState(sim);
  },
  render() {
    draw(ctx, sim);
  },
};

draw(ctx, sim);
requestAnimationFrame(tick);
