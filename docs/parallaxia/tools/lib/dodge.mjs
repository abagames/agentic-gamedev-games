// Is there any way for the ship to live from a given state until a given
// frame? Used by tools/dodge.mjs to tell a miss the player could have got out
// of from one the barrage left no room for.
//
// The ship is moved in steps of five frames in the nine directions, shot
// held, and the same place at the same time (the field in squares of one
// unit) is never looked at twice. Depth first, the roomiest place first.

import { stepSim } from "../../src/sim/sim.js";
import { INPUT } from "../../src/sim/input.js";
import { bulletArmed } from "../../src/sim/bullets.js";
import { shipInvincible } from "../../src/sim/player.js";
import { SHIP } from "../../src/sim/constants.js";

const STEP = 5;
const BUDGET = 5000; // states looked at before giving a search up
const MOVES = [0, INPUT.LEFT, INPUT.RIGHT, INPUT.UP, INPUT.DOWN, INPUT.LEFT | INPUT.UP, INPUT.RIGHT | INPUT.UP, INPUT.LEFT | INPUT.DOWN, INPUT.RIGHT | INPUT.DOWN];

// How near the nearest bullet in flight is: what a search tries first.
function clearance(sim) {
  let best = 1e9;
  for (const b of sim.bullets) {
    if (!bulletArmed(b)) continue;
    const d = (b.x - sim.ship.x) ** 2 + (b.y - sim.ship.y) ** 2;
    if (d < best) best = d;
  }
  return best;
}

// The least distance (squared) between the ship and a bullet over one frame,
// both taken to move in straight lines.
function nearest(ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) {
  const rx = bx0 - ax0;
  const ry = by0 - ay0;
  const vx = bx1 - bx0 - (ax1 - ax0);
  const vy = by1 - by0 - (ay1 - ay0);
  const vv = vx * vx + vy * vy;
  const t = vv > 1e-12 ? Math.max(0, Math.min(1, -(rx * vx + ry * vy) / vv)) : 0;
  return (rx + vx * t) ** 2 + (ry + vy * t) ** 2;
}

// Did the ship and a bullet in flight cross within the ship's radius this
// frame? The game's own test looks only at the stretch the bullet covered,
// not at where the ship came from, so a ship flying into a bullet can step
// over it. A way out that depends on that is not one a player can see.
export function crossed(before, sim, room = 1) {
  if (shipInvincible(sim.ship)) return false;
  for (const b of sim.bullets) {
    const was = before.bullets.get(b.id);
    if (was && nearest(before.x, before.y, sim.ship.x, sim.ship.y, was[0], was[1], b.x, b.y) <= SHIP.hitRadiusSq * room * room) return true;
  }
  return false;
}
export const noteBefore = (sim) => ({ x: sim.ship.x, y: sim.ship.y, bullets: new Map(sim.bullets.filter(bulletArmed).map((b) => [b.id, [b.x, b.y]])) });

// Returns true, false, or null when the budget ran out. strict: passing
// through a bullet counts as being hit by it. room: the ship counts as this
// many times its size, for a way out with room to spare (2: every bullet is
// passed at twice the distance that would hit).
export function wayOut(from, until, { strict = true, room = 1 } = {}) {
  const seen = new Set();
  const stack = [from];
  let looked = 0;
  while (stack.length > 0) {
    const state = stack.pop();
    if (state.frame >= until) return true;
    if (++looked > BUDGET) return null;
    const next = [];
    for (const move of MOVES) {
      const sim = structuredClone(state);
      let alive = true;
      for (let i = 0; i < STEP && alive; i++) {
        const before = strict ? noteBefore(sim) : null;
        stepSim(sim, move | INPUT.SHOT);
        for (const e of sim.events) if (e.type === "miss") alive = false;
        if (alive && strict && crossed(before, sim, room)) alive = false;
      }
      if (!alive) continue;
      const key = `${sim.frame}:${Math.round(sim.ship.x)}:${Math.round(sim.ship.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push([clearance(sim), sim]);
    }
    // (The last pushed is the first tried.)
    next.sort((a, b) => a[0] - b[0]);
    for (const [, sim] of next) stack.push(sim);
  }
  return false;
}
