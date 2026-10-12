// Bosses: a body that tours the top of the field, and wings that ride on it.
// Each part is an enemy like any other as far as shots, lasers and running
// into it go; this file is what is different about them (constants.js, BOSS).

import { BOSS, FIELD, KINDS, SECTION, unlocked } from "./constants.js";
import { sin } from "./math.js";
import { fireMuzzles, makeBossTypes } from "./barrage.js";
import { nextFloat, nextInt } from "./rng.js";
import { shipAbsent } from "./player.js";
import { onScreen } from "./camera.js";
import { scoringOf, wipeOut } from "./score.js";

const part = (sim, kind, type, more) => ({
  id: sim.nextId++,
  kind,
  x: 0,
  y: BOSS.enterY,
  slot: 0,
  flight: null,
  plan: null,
  hp: KINDS[kind].hp,
  age: 0,
  phase: 0,
  formation: 0,
  type,
  fireIn: KINDS[kind].firstFireDelay,
  burst: 0,
  angles: sim.stage.types[type].muzzles.map(() => nextFloat(sim.rng, Math.PI * 2)),
  // Coming in: not yet to be hit, locked or fired from.
  entering: true,
  ...more,
});

// Puts a boss of the given kind above the field. Returns the body's id.
export function spawnBoss(sim, kind) {
  const { body, wings } = makeBossTypes(sim, kind, sim.stage.rank);
  // The points it tours, after the one it arrives at.
  const points = [[0, BOSS.homeY]];
  const count = 2 + nextInt(sim.rng, 3);
  for (let i = 1; i < count; i++) {
    const side = i % 2 === 1 ? 1 : -1;
    points.push([side * (2 + nextFloat(sim.rng, BOSS.tourX - 2)), BOSS.tourY[0] + nextFloat(sim.rng, BOSS.tourY[1] - BOSS.tourY[0])]);
  }
  // How it moves: one of those in play in this loop.
  const move = BOSS.moves[nextInt(sim.rng, unlocked("bossMoves", Math.floor(Math.max(sim.stage.section, 0) / SECTION.perLoop), BOSS.moves.length))];
  if (move === "swoop") points.splice(1 + nextInt(sim.rng, points.length), 0, [nextFloat(sim.rng, BOSS.tourX * 2) - BOSS.tourX, BOSS.swoopY]);
  const boss = part(sim, kind, body, {
    boss: { move, points, at: 0, speed: BOSS.speed[0] + nextFloat(sim.rng, BOSS.speed[1]), pattern: -1, leaving: false, wings: KINDS[kind].wings.length * 2 },
  });
  sim.enemies.push(boss);
  KINDS[kind].wings.forEach((ox, i) => {
    for (const side of [1, -1]) sim.enemies.push(part(sim, "wing", wings[i * 2 + (side === 1 ? 0 : 1)], { parent: boss.id, ox: ox * side, oy: 0 }));
  });
  sim.events.push({ type: "boss", kind, id: boss.id });
  return boss.id;
}

// Frames until a boss's body gives up and goes, counted from when it has come in.
export const bossFramesLeft = (body) => BOSS.enterFrames + BOSS.leaveAfter[body.kind] - body.age;
// Whether it is about to: the last warnFrames of its stay.
export const bossWarning = (body) => !body.entering && !body.boss.leaving && bossFramesLeft(body) <= BOSS.warnFrames;

// One frame of a boss's body or wing. Returns false once it is gone.
export function updateBossPart(sim, enemy) {
  if (enemy.parent) {
    const body = sim.enemies.find((e) => e.id === enemy.parent);
    if (!body) return false;
    enemy.x = body.x + enemy.ox;
    enemy.y = body.y + enemy.oy;
    enemy.entering = body.entering;
    if (!body.entering && !body.boss.leaving) fire(sim, enemy);
    return true;
  }
  const boss = enemy.boss;
  if (boss.leaving) {
    enemy.y += BOSS.leaveSpeed;
    if (enemy.y > FIELD.halfH + 5) {
      sim.events.push({ type: "boss-left", kind: enemy.kind });
      return false;
    }
    return true;
  }
  if (enemy.entering) {
    // Down from above the field to its first point, easing in.
    const t = Math.min(enemy.age / BOSS.enterFrames, 1);
    enemy.y = BOSS.enterY + (BOSS.homeY - BOSS.enterY) * (1 - (1 - t) * (1 - t));
    if (t >= 1) enemy.entering = false;
    return true;
  }
  if (bossFramesLeft(enemy) === BOSS.warnFrames) sim.events.push({ type: "boss-warn", kind: enemy.kind, x: enemy.x, y: enemy.y });
  if (bossFramesLeft(enemy) <= 0) {
    boss.leaving = true;
    enemy.burst = 0;
    return true;
  }
  if (boss.move === "chase") {
    // Over the ship (while there is one), and slowly up and down.
    const want = shipAbsent(sim.ship) ? enemy.x : Math.max(-BOSS.tourX, Math.min(BOSS.tourX, sim.ship.x));
    const step = Math.max(-BOSS.chaseSpeed, Math.min(BOSS.chaseSpeed, want - enemy.x));
    enemy.x += step;
    const mid = (BOSS.tourY[0] + BOSS.tourY[1]) / 2;
    const wantY = mid + sin((enemy.age - BOSS.enterFrames) * 0.008) * (BOSS.tourY[1] - mid);
    enemy.y += Math.max(-boss.speed, Math.min(boss.speed, wantY - enemy.y));
  } else {
    const [px, py] = boss.points[boss.at];
    const dx = px - enemy.x;
    const dy = py - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Down to its low point and back up from it, it hurries.
    const from = boss.points[(boss.at + boss.points.length - 1) % boss.points.length];
    const pace = boss.speed * (py === BOSS.swoopY || from[1] === BOSS.swoopY ? BOSS.swoopSpeed : 1);
    if (dist <= pace) {
      enemy.x = px;
      enemy.y = py;
      boss.at = (boss.at + 1) % boss.points.length;
    } else {
      enemy.x += (dx / dist) * pace;
      enemy.y += (dy / dist) * pace;
    }
  }
  fire(sim, enemy);
  return true;
}

// Bursts, like any enemy's; the body moves on to its next barrage each time.
function fire(sim, enemy) {
  if (shipAbsent(sim.ship) || !onScreen(sim, enemy.x)) return;
  const type = sim.stage.types[enemy.type];
  enemy.fireIn--;
  if (enemy.fireIn <= 0) {
    enemy.burst = type.period;
    enemy.fireIn = type.interval;
    if (enemy.boss) enemy.boss.pattern = (enemy.boss.pattern + 1) % type.muzzles.length;
  }
  if (enemy.burst <= 0) return;
  fireMuzzles(sim, enemy, type, type.period - enemy.burst, enemy.boss ? enemy.boss.pattern : -1);
  enemy.burst--;
}

// Called when a body or a wing has just been destroyed.
// score, mult: what it was just paid at.
export function bossPartDestroyed(sim, enemy, score, mult) {
  if (enemy.parent) {
    // A wing shot off: its gun is gone, the body is knocked back and holds
    // its fire for a while.
    const body = sim.enemies.find((e) => e.id === enemy.parent);
    if (!body) return;
    body.boss.wings--;
    // The last wing gone: the body is open.
    if (body.boss.wings === 0) sim.events.push({ type: "boss-open", x: body.x, y: body.y });
    body.burst = 0;
    body.fireIn = Math.max(body.fireIn, BOSS.stunFrames);
    if (!body.boss.leaving) body.y = Math.min(body.y + BOSS.kick, FIELD.halfH - 2);
    return;
  }
  // The body: the wings go with it (unpaid), and so does every bullet.
  for (const wing of sim.enemies) if (wing.parent === enemy.id) wing.hp = 0;
  sim.bullets = [];
  // Taken apart completely, every wing shot off before the body: that is a
  // wipe-out, and where the chain scores it carries the chain on.
  const clean = enemy.boss.wings === 0 && scoringOf(sim) === "chain";
  if (clean) wipeOut(sim);
  sim.events.push({ type: "boss-destroy", x: enemy.x, y: enemy.y, kind: enemy.kind, score, mult, clean, chain: sim.chain });
}
