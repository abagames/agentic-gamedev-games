// Score, the multiplier, and extra ships.

import { MODES, RATE, SHIP } from "./constants.js";

export const scoringOf = (sim) => MODES[sim.mode].scoring;

export function addScore(sim, points) {
  sim.score += points;
  while (sim.score >= sim.nextExtend) {
    if (sim.lives < SHIP.maxLives) {
      sim.lives++;
      sim.events.push({ type: "extend" });
    }
    sim.nextExtend += MODES[sim.mode].extend;
  }
}

export const firstExtend = (sim) => MODES[sim.mode].extend;

// What a kill at this distance from the ship pays in the "close" mode.
export function closeMultiplier(dist, y) {
  const { near, far, topY } = RATE.close;
  if (y > topY) return 1;
  // It rises faster the nearer the ship is (the square of how far in it has
  // come), so that the last few units, where the danger is, pay the most.
  const t = Math.max(0, Math.min(1, (far - dist) / (far - near)));
  return Math.max(1, Math.min(RATE.max, Math.round(1 + (RATE.max - 1) * t * t)));
}

// From the ship to the nearest edge of a box of the given half size at (x, y).
export function distanceTo(sim, x, y, box = null) {
  const dx = Math.max(Math.abs(sim.ship.x - x) - (box ? box.halfW : 0), 0);
  const dy = Math.max(Math.abs(sim.ship.y - y) - (box ? box.halfH : 0), 0);
  return Math.sqrt(dx * dx + dy * dy);
}

// The multiplier a kill at (x, y) is paid at. box is the hit box of what was
// destroyed. dist, when given, is the distance to count instead of the ship's
// present one (a laser's).
// onGround: the thing destroyed is on the ground.
export function killMultiplier(sim, x, y, dist = null, box = null, onGround = false) {
  const scoring = scoringOf(sim);
  if (scoring === "chain") return Math.min(1 + sim.chain, RATE.max);
  if (scoring === "graze") return Math.max(1, Math.min(RATE.max, Math.floor(sim.rate + 1e-9)));
  const mult = closeMultiplier(dist ?? distanceTo(sim, x, y, box), y);
  return onGround ? Math.min(mult, RATE.close.ground) : mult;
}

// Pays for something destroyed. Returns [points paid, multiplier].
export function scoreKill(sim, base, x, y, dist = null, box = null, onGround = false) {
  const mult = killMultiplier(sim, x, y, dist, box, onGround);
  addScore(sim, base * mult);
  return [base * mult, mult];
}

// A formation wiped out, or a boss taken apart: one more in the chain, where
// the chain is what scores. Returns the chain's length afterwards.
export function wipeOut(sim) {
  if (scoringOf(sim) === "chain") sim.chain++;
  return sim.chain;
}

// A ship lost.
export function dropMultiplier(sim) {
  sim.rate = 1;
  sim.rateIdle = 0;
}

// An enemy bullet passing close: once a bullet.
export function grazeBullet(sim, bullet) {
  if (scoringOf(sim) !== "graze" || bullet.grazed) return;
  bullet.grazed = true;
  sim.rate = Math.min(RATE.max, sim.rate + RATE.graze.gain);
  sim.rateIdle = 0;
  sim.events.push({ type: "graze", x: bullet.x, y: bullet.y, rate: sim.rate });
}

// One frame of the grazing multiplier sinking back.
export function updateMultiplier(sim) {
  if (scoringOf(sim) !== "graze") return;
  sim.rateIdle++;
  if (sim.rateIdle > RATE.graze.idle) sim.rate = Math.max(1, sim.rate - RATE.graze.decay);
}
