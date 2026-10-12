// Enemy bullets: movement, arming, and hitting the ship.

import { sin, cos, atan2 } from "./math.js";
import { FIELD, BULLET, SHIP } from "./constants.js";
import { shipAbsent, shipInvincible, missShip } from "./player.js";
import { splitBullet } from "./barrage.js";
import { grazeBullet } from "./score.js";
import { RATE } from "./constants.js";

export const bulletArmed = (bullet) => bullet.age >= BULLET.armFrames;

export function updateBullets(sim) {
  const ship = sim.ship;
  const limitX = FIELD.halfW - BULLET.edgeMargin;
  const limitY = FIELD.halfH - BULLET.edgeMargin;
  const kept = [];
  let hit = null;
  const owners = new Map(sim.enemies.map((e) => [e.id, e]));
  const count = sim.bullets.length;
  for (let i = 0; i < count; i++) {
    const bullet = sim.bullets[i];
    const armedBefore = bulletArmed(bullet);
    const px = bullet.x;
    const py = bullet.y;
    if (armedBefore) {
      bullet.x += sin(bullet.dir) * bullet.speed;
      bullet.y += cos(bullet.dir) * bullet.speed;
    } else if (bullet.owner) {
      // A seed rides on its enemy, and goes with it if the enemy is gone.
      const owner = owners.get(bullet.owner);
      if (!owner) continue;
      bullet.x = owner.x + bullet.ox;
      bullet.y = owner.y;
    }
    bullet.age++;
    // Aimed bullets take their aim at the moment they launch.
    if (!armedBefore && bulletArmed(bullet) && bullet.aimed) {
      bullet.dir = atan2(ship.x - bullet.x, ship.y - bullet.y) + bullet.dir;
    }
    if (Math.abs(bullet.x) > limitX || Math.abs(bullet.y) > limitY) continue;
    // A carrier bursts when its fuse runs out. Its parts are appended to the
    // list being walked, so they move (and can burst) from the next frame on.
    if (bullet.fuse >= 0 && bullet.age >= bullet.fuse && bulletArmed(bullet)) {
      if (ship.respawn > SHIP.respawnFrames - SHIP.bulletShieldFrames) continue;
      if (splitBullet(sim, bullet)) continue;
    }
    // Fresh from a miss: bullets that would become dangerous are cleared.
    if (!armedBefore && bulletArmed(bullet) && ship.respawn > SHIP.respawnFrames - SHIP.bulletShieldFrames) continue;
    // (Once the run is over there is no ship to hit or to pass close to.)
    if (armedBefore && sim.phase === "play" && !shipAbsent(ship) && !shipInvincible(ship)) {
      if (sweptHit(px - ship.px, py - ship.py, bullet.x - ship.x, bullet.y - ship.y)) hit = bullet;
      // A near miss (it has to be one that could have hit).
      else if ((bullet.x - ship.x) ** 2 + (bullet.y - ship.y) ** 2 < RATE.graze.radius ** 2) grazeBullet(sim, bullet);
    }
    kept.push(bullet);
  }
  // Parts born this frame come after the bullets that were walked.
  sim.bullets = kept.concat(sim.bullets.slice(count));
  if (hit) missShip(sim, "bullet", 0, hit.age - BULLET.armFrames, hit.from ?? "");
}

// Did the bullet come within the ship's radius at any moment of the frame?
// Both moved in a straight line, so seen from the ship the bullet moved
// along one segment, from (ax, ay) to (bx, by): the test is that segment's
// least distance from the ship. (Testing only the stretch the bullet itself
// covered let a ship flying into a bullet step over it.)
function sweptHit(ax, ay, bx, by) {
  const mx = bx - ax;
  const my = by - ay;
  const lenSq = mx * mx + my * my;
  const t = lenSq > 0.0000001 ? Math.max(0, Math.min(1, -(ax * mx + ay * my) / lenSq)) : 0;
  const cx = ax + mx * t;
  const cy = ay + my * t;
  return cx * cx + cy * cy <= SHIP.hitRadiusSq;
}
