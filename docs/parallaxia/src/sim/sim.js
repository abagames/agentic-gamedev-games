// Simulation core. No DOM, no wall clock, no Math.random: everything that
// affects play lives in the plain-data state object and advances only through
// stepSim(), so the same seed and inputs give the same state in Node and in
// the browser.

import { createRng } from "./rng.js";
import { sanitizeInput, INPUT } from "./input.js";
import { SHIP, GAMEOVER, MODES, startSectorOk } from "./constants.js";
import { firstExtend, killMultiplier, scoringOf, updateMultiplier } from "./score.js";
import { createShip, updateShip, updateShots, shipAbsent, shipInvincible } from "./player.js";
import { createStage, updateStage, updateEnemies, hitEnemiesWithShots, ramShip } from "./enemies.js";
import { updateBullets, bulletArmed } from "./bullets.js";
import { updateLocks } from "./lock.js";
import { updateView } from "./camera.js";
import { createGround, updateGround, hitGroundWithShots } from "./ground.js";
import { KINDS } from "./constants.js";

export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

// What the sim currently implements. Instruments read this to decide whether a
// check can run or must be reported as skipped.
export const capabilities = Object.freeze({
  scoring: true,
  gameOver: true,
  bullets: true,
  mechanics: Object.freeze(["move", "shot", "enemy", "miss", "formation", "collision", "flight", "ground", "middle", "lock", "scroll", "large", "sections", "barrage", "boss", "modes"]),
});

function startRun(sim) {
  sim.phase = "play";
  sim.phaseFrames = 0;
  // Set once the game-over screen has been answered with shot.
  sim.dismissed = false;
  sim.score = 0;
  sim.lives = SHIP.startLives;
  sim.nextExtend = firstExtend(sim);
  // Formations wiped out in a row, where the chain scores (score.js).
  sim.chain = 0;
  // The multiplier earned by grazing, where that scores, and how long since
  // the last graze.
  sim.rate = 1;
  sim.rateIdle = 0;
  sim.formations = [];
  sim.ship = createShip();
  // Centre of the on-screen slice of the field.
  sim.viewX = 0;
  sim.shots = [];
  sim.enemies = [];
  sim.bullets = [];
  sim.locks = [];
  sim.lasers = [];
  sim.ground = createGround();
  sim.stage = createStage(sim.startSector);
  sim.stage.drill = sim.drill;
  sim.stage.sectionEnd = sim.frame;
}

// drill: { pattern, count, middle } plays one flight pattern on its own.
// course: which arrangement of sectors is played. What each sector holds (its
// enemy types and their barrages, its mix of enemies, the order of its flight
// patterns, its boss) follows from the course and the sector number alone;
// the seed only decides where and how many (enemies.js). Course 0 is the game.
// mode: one of MODES. startSector: the sector the run starts at, the first of
// any loop (1, 11, 21, ...); score, chain and ships start as they always do.
export function createSim({ seed = 1, drill = null, course = 0, mode = "normal", startSector = 1 } = {}) {
  if (!MODES[mode]) throw new Error(`createSim: no mode '${mode}'`);
  if (!startSectorOk(startSector)) throw new Error(`createSim: a run cannot start at sector ${startSector}`);
  const sim = {
    seed: seed >>> 0,
    course: course >>> 0,
    mode,
    startSector,
    frame: 0,
    rng: createRng(seed),
    input: 0,
    prevInput: 0,
    // Folded history of every input so far.
    inputDigest: 0,
    nextId: 1,
    drill,
    // What happened this frame, for presentation only. Nothing in the sim
    // reads it back.
    events: [],
  };
  startRun(sim);
  return sim;
}

export function stepSim(sim, input = 0) {
  const bits = sanitizeInput(input);
  sim.prevInput = sim.input;
  sim.input = bits;
  sim.inputDigest = (Math.imul(sim.inputDigest ^ bits, 0x01000193) + sim.frame) >>> 0;
  sim.events = [];

  if (sim.phase === "play") {
    updateStage(sim);
    updateShip(sim, bits);
    updateView(sim);
    updateShots(sim);
    updateEnemies(sim);
    updateGround(sim);
    // What is in the air is hit first; a shot left over may reach the ground.
    hitEnemiesWithShots(sim);
    hitGroundWithShots(sim);
    updateLocks(sim, bits);
    ramShip(sim);
    updateBullets(sim);
    updateMultiplier(sim);
  } else {
    // Game over: the field keeps moving. A fresh press of shot, once the
    // screen has stood a moment, says the player is done with it; the run is
    // not started again here (the page goes back to its title).
    updateEnemies(sim);
    updateGround(sim);
    updateBullets(sim);
    sim.phaseFrames++;
    const pressed = (bits & INPUT.SHOT) !== 0 && (sim.prevInput & INPUT.SHOT) === 0;
    if (sim.phaseFrames > GAMEOVER.lockFrames && pressed) sim.dismissed = true;
  }
  sim.frame++;
  return sim;
}

export function getScore(sim) {
  return sim.score;
}

// A run has ended. (The balance harness stops here.)
export function isEnded(sim) {
  return sim.phase === "gameover";
}

// What a player can see. Policies read this, not the raw state.
export function observe(sim) {
  return {
    ship: { x: sim.ship.x, y: sim.ship.y, absent: shipAbsent(sim.ship), invincible: shipInvincible(sim.ship), speed: MODES[sim.mode].shipSpeed },
    enemies: sim.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, kind: e.kind, lockable: KINDS[e.kind].lockable, formation: e.formation || 0 })),
    locks: sim.locks.length,
    viewX: sim.viewX,
    sector: sim.stage.section + 1,
    rank: sim.stage.rank,
    bullets: sim.bullets.map((b) => ({ x: b.x, y: b.y, dir: b.dir, speed: b.speed, armed: bulletArmed(b) })),
    chain: sim.chain,
    // How the mode scores, and what a kill right at the ship would pay now.
    scoring: scoringOf(sim),
    rate: sim.rate,
    // (A hidden target is not seen until a shot has shown it, and is not
    // there to be shot until it has come up.)
    ground: sim.ground.targets.filter((t) => t.hp > 0 && !t.unseen && !(t.rising > 0)).map((t) => ({ id: t.id, x: t.x, y: t.y, kind: t.kind, island: t.island })),
    score: sim.score,
    lives: sim.lives,
  };
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

// FNV-1a over the canonical JSON of the state, as 8 hex digits.
export function hashState(sim) {
  const text = canonical(sim);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
