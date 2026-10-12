// Lock-on lasers. Holding shot charges: one lock at a time settles on the
// nearest big enemy ahead of the ship. Letting go of shot releases every lock
// as a homing laser, and lasers released together hit harder.

import { FIELD, KINDS, LOCK } from "./constants.js";
import { INPUT } from "./input.js";
import { shipAbsent } from "./player.js";
import { damageEnemy, removeDestroyed } from "./enemies.js";
import { GROUND } from "./constants.js";
import { damageGroundTarget, lockableGround } from "./ground.js";
import { distanceTo } from "./score.js";

export function laserDamage(volley) {
  return LOCK.damage * (1 + LOCK.volleyBonus * (volley - 1));
}

// The nearest lockable thing in the column above the ship: a big enemy, a
// boss's wing, or a core on the ground. One lock is all a core takes, so a
// core that has one is passed over, and so is one that has not yet come onto
// the field from above. Of things level with each other (a boss
// and its wings), it is the one most nearly straight ahead.
function findTarget(sim) {
  const ship = sim.ship;
  let best = null;
  const nearer = (a) => best === null || a.y < best.y || (a.y === best.y && Math.abs(a.x - ship.x) < Math.abs(best.x - ship.x));
  for (const enemy of sim.enemies) {
    const kind = KINDS[enemy.kind];
    if (!kind.lockable || enemy.y <= ship.y || enemy.entering) continue;
    if (Math.abs(enemy.x - ship.x) >= kind.halfW + LOCK.rangeX) continue;
    if (nearer(enemy)) best = enemy;
  }
  for (const core of lockableGround(sim)) {
    if (core.y <= ship.y || core.y > FIELD.halfH || sim.locks.some((lock) => lock.target === core.id)) continue;
    if (Math.abs(core.x - ship.x) >= GROUND.kinds.core.half + LOCK.rangeX) continue;
    if (nearer(core)) best = core;
  }
  return best;
}

// What a lock or a laser is on, while it still stands: [target, on the ground].
function findLocked(sim, id) {
  const enemy = sim.enemies.find((e) => e.id === id && e.hp > 0);
  if (enemy) return [enemy, false];
  const core = sim.ground.targets.find((t) => t.id === id && t.hp > 0);
  return core ? [core, true] : [null, false];
}

export function updateLocks(sim, input) {
  const ship = sim.ship;
  sim.locks = sim.locks.filter((lock) => findLocked(sim, lock.target)[0] !== null);

  if (shipAbsent(ship)) {
    sim.locks = [];
    ship.lockClock = 0;
  } else if (input & INPUT.SHOT) {
    ship.lockClock++;
    if (ship.lockClock % LOCK.interval === 0 && sim.locks.length < LOCK.max) {
      const target = findTarget(sim);
      if (target) {
        sim.locks.push({ target: target.id });
        sim.events.push({ type: "lock", x: target.x, y: target.y, count: sim.locks.length });
      }
    }
  } else {
    ship.lockClock = 0;
    if (sim.locks.length > 0) release(sim);
  }
  updateLasers(sim);
}

function release(sim) {
  const ship = sim.ship;
  const volley = sim.locks.length;
  sim.locks.forEach((lock, i) => {
    const [target, onGround] = findLocked(sim, lock.target);
    const box = !target ? null : onGround ? { halfW: GROUND.kinds.core.half, halfH: GROUND.kinds.core.half } : KINDS[target.kind];
    sim.lasers.push({
      id: sim.nextId++,
      target: lock.target,
      x: ship.x,
      y: ship.y,
      px: ship.x,
      py: ship.y,
      // Lasers kick out sideways and back before they turn in.
      vx: (i - (volley - 1) / 2) * LOCK.launchSpread,
      vy: -LOCK.launchBack,
      age: 0,
      damage: laserDamage(volley),
      // How far off its target was when it was let go: what a kill by it
      // counts as, where being close scores.
      dist: target ? distanceTo(sim, target.x, target.y, box) : 99,
    });
  });
  sim.events.push({ type: "release", x: ship.x, y: ship.y, count: volley });
  sim.locks = [];
}

function updateLasers(sim) {
  const kept = [];
  for (const laser of sim.lasers) {
    const [target, onGround] = findLocked(sim, laser.target);
    if (!target) continue;
    laser.age++;
    laser.px = laser.x;
    laser.py = laser.y;
    const dx = target.x - laser.x;
    const dy = target.y - laser.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.min(laser.age * LOCK.accel, LOCK.maxSpeed);
    if (dist <= LOCK.hitRadius + speed) {
      sim.events.push({ type: "laser-hit", x: target.x, y: target.y, target: target.id, damage: laser.damage });
      if (onGround) damageGroundTarget(sim, target, laser.damage, target.x, laser.dist);
      else damageEnemy(sim, target, laser.damage, laser.dist);
      continue;
    }
    laser.vx *= 0.9;
    laser.vy *= 0.9;
    laser.x += laser.vx + (dx / dist) * speed;
    laser.y += laser.vy + (dy / dist) * speed;
    kept.push(laser);
  }
  sim.lasers = kept;
  removeDestroyed(sim);
}
