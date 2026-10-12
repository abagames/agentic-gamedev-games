// The player's ship: movement, shooting, miss and respawn.

import { FIELD, MODES, SHIP, SHOT } from "./constants.js";
import { INPUT } from "./input.js";
import { breakChain } from "./formation.js";
import { dropMultiplier } from "./score.js";

export function createShip() {
  return {
    x: SHIP.startX,
    y: SHIP.startY,
    // Where it was a frame ago.
    px: SHIP.startX,
    py: SHIP.startY,
    fireCount: 0,
    // Frames until the next shot can leave.
    shotCool: 0,
    // Frames left of the miss sequence: absent first, then invincible.
    respawn: 0,
    // Frames shot has been held; a lock is tried at every interval.
    lockClock: 0,
  };
}

export const shipAbsent = (ship) => ship.respawn > SHIP.respawnFrames - SHIP.absentFrames;
export const shipInvincible = (ship) => ship.respawn > 0;

export function updateShip(sim, input) {
  const ship = sim.ship;
  // Where it was before this frame's move: a bullet is tested against the
  // whole of the move (bullets.js).
  ship.px = ship.x;
  ship.py = ship.y;
  if (ship.respawn > 0) ship.respawn--;
  if (ship.shotCool > 0) ship.shotCool--;
  if (shipAbsent(ship)) return;

  let vx = 0;
  let vy = 0;
  const speed = MODES[sim.mode].shipSpeed;
  if (input & INPUT.UP) vy = speed;
  else if (input & INPUT.DOWN) vy = -speed;
  if (input & INPUT.RIGHT) vx = speed;
  else if (input & INPUT.LEFT) vx = -speed;
  if (vx !== 0 && vy !== 0) {
    vx *= SHIP.diagonal;
    vy *= SHIP.diagonal;
  }
  const limitX = FIELD.halfW - SHIP.margin;
  const limitY = FIELD.halfH - SHIP.margin;
  ship.x = Math.max(-limitX, Math.min(limitX, ship.x + vx));
  ship.y = Math.max(-limitY, Math.min(limitY, ship.y + vy));

  if (input & INPUT.SHOT) fireShot(sim);
}

// Straight ahead: one shot per interval, and none while the screen already
// holds as many as it may.
function fireShot(sim) {
  const ship = sim.ship;
  if (ship.shotCool > 0 || sim.shots.length >= SHOT.max) return;
  ship.shotCool = SHOT.interval;
  sim.shots.push({ x: ship.x, y: ship.y, vy: SHOT.speed });
  sim.events.push({ type: "shot", x: ship.x, y: ship.y });
  ship.fireCount++;
}

export function updateShots(sim) {
  const limitY = FIELD.halfH - SHOT.edgeMargin;
  const kept = [];
  for (const shot of sim.shots) {
    shot.y += shot.vy;
    if (Math.abs(shot.y) <= limitY) kept.push(shot);
  }
  sim.shots = kept;
}

// cause is "bullet" or "ram"; by is the enemy that was run into; warn is how
// many frames the thing that hit had been coming (a bullet since it launched,
// an enemy since it took its present course); from is the size of the enemy
// responsible.
export function missShip(sim, cause = "bullet", by = 0, warn = 0, from = "") {
  const ship = sim.ship;
  if (sim.phase !== "play" || shipInvincible(ship)) return;
  sim.events.push({ type: "miss", x: ship.x, y: ship.y, cause, by, warn, from });
  sim.bullets = [];
  sim.locks = [];
  breakChain(sim, "miss");
  dropMultiplier(sim);
  sim.lives--;
  if (sim.lives < 0) {
    sim.phase = "gameover";
    sim.phaseFrames = 0;
    sim.shots = [];
    sim.lasers = [];
    return;
  }
  ship.x = SHIP.startX;
  ship.y = SHIP.startY;
  ship.fireCount = 0;
  ship.shotCool = 0;
  ship.lockClock = 0;
  ship.respawn = SHIP.respawnFrames;
}
