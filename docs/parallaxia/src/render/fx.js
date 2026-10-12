// Presentation effects: sparks, explosions, flashes, shake. They are driven by
// the sim's per-frame event list and live entirely on the render side. Nothing
// here is read by the sim, so effects can never change play or a replay.
//
// Randomness comes from a private generator stepped only by events, so the
// same run always draws the same effects (screenshots stay repeatable).
import { MODES, THEMES } from "../sim/constants.js";
import { shipAbsent } from "../sim/player.js";

const MAX_PARTICLES = 220;
const MAX_MUZZLES = 48;
const MAX_BLASTS = 48;
const MAX_WRECKS = 8;
// Smoke is left behind: it slides down the screen with the near stars.
const SMOKE_DRIFT = -0.05;
// Where a hull comes apart, as parts of its width (the cuts are jittered).
const WRECK_CUTS = { middle: [1 / 3, 2 / 3], large: [0.2, 0.4, 0.6, 0.8] };
// How wide the hulls are drawn, in units.
const WRECK_SPAN = { middle: 2.3, large: 3.3 };
// A roll goes from -2 (hard left) to 2 (hard right). An enemy is fully over
// at this sideways speed (units a frame); the ship at most of its own speed,
// so that a diagonal still banks it all the way.
const ENEMY_ROLL_SPEED = 0.14;
const SHIP_ROLL_PART = 0.6;

export function createFx() {
  return {
    seed: 0x1234567,
    particles: [], // { x, y, vx, vy, life, max, color, size }
    rings: [], // { x, y, r, grow, life, max, color }
    flashes: new Map(), // enemy id -> frames left drawn white
    brackets: [], // { target, life } a lock snapping onto its target
    popups: [], // { x, y, text, life }
    shake: 0,
    screenFlash: 0,
    shipBlast: 0,
    banner: null, // { text, life } the section number, shown briefly
    culprit: null, // { id, life } the enemy the ship ran into
    shields: new Map(), // boss body id -> frames its shield stays lit after turning a shot
    loopBanner: null, // { text, life } a new loop, said above the sector's line
    ratePop: null, // { mult, life } the grazing multiplier just reached, shown by the ship
    chainLost: 0, // frames the chain readout blinks after the chain breaks
    rolls: new Map(), // "ship" or enemy id -> { x, bank } how far it leans into its sideways move
    muzzles: [], // { x, y, life } an enemy's muzzle, lit by a bullet leaving it
    shotFlash: 0, // frames the ship's barrels stay lit after a shot
    blasts: [], // { x, y, vx, vy, r, delay, age, flash, hold, burn, smoke, ... } an explosion going through its stages
    wrecks: [], // { kind, pattern, pieces: [{ x, y, vx, vy, from, to, life, max }] } a hull in pieces
    tracks: new Map(), // middle or large enemy id -> { kind, pattern, x, y, vx, vy } where it was and how it moved
  };
}

function rand(fx) {
  fx.seed = (Math.imul(fx.seed, 1664525) + 1013904223) >>> 0;
  return fx.seed / 0x100000000;
}

function burst(fx, x, y, count, speed, life, color, size = 1, up = 0) {
  for (let i = 0; i < count && fx.particles.length < MAX_PARTICLES; i++) {
    const a = rand(fx) * Math.PI * 2;
    const v = speed * (0.35 + rand(fx) * 0.65);
    const max = Math.round(life * (0.6 + rand(fx) * 0.4));
    fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up, life: max, max, color, size });
  }
}

// An explosion in stages, the way the old hand-animated ones go: white light
// that grows and is held a moment, fire that draws in, smoke that stays.
// r is the widest it gets, in pixels. It starts after `delay` frames, and
// only then throws its sparks and ring (and shakes the screen, if it does).
function blast(fx, x, y, r, delay = 0, extra = {}) {
  if (fx.blasts.length >= MAX_BLASTS) return;
  const b = {
    x, y, r, delay, age: 0, vx: 0, vy: 0,
    flash: r >= 8 ? 3 : r >= 5 ? 2 : 1,
    hold: r >= 8 ? 2 : 0,
    burn: Math.round(3 + r * 0.5),
    smoke: Math.round(6 + r * 1.6),
    sparks: [], ring: null, shake: 0, screenFlash: 0,
    ...extra,
  };
  fx.blasts.push(b);
  if (delay === 0) blastStart(fx, b);
}

export function blastFrames(b) {
  return b.flash + b.hold + b.burn + b.smoke;
}

function blastStart(fx, b) {
  for (const [count, speed, life, color, size] of b.sparks) burst(fx, b.x, b.y, count, speed, life, color, size);
  if (b.ring) fx.rings.push({ x: b.x, y: b.y, ...b.ring });
  fx.shake = Math.max(fx.shake, b.shake);
  fx.screenFlash = Math.max(fx.screenFlash, b.screenFlash);
}

// The middle or large enemy an event says was destroyed: the tracked one of
// that kind, no longer flying, nearest to where the event happened.
function trackOf(fx, sim, e) {
  let best = null;
  for (const [id, t] of fx.tracks) {
    if (t.kind !== e.kind || sim.enemies.some((enemy) => enemy.id === id && enemy.hp > 0)) continue;
    const d = Math.abs(t.x - e.x) + Math.abs(t.y - e.y);
    if (d < 1.5 && (best === null || d < best.d)) best = { ...t, d };
  }
  return best;
}

// The hull comes apart along its width; each piece keeps the way the craft
// was going and is thrown outward, the outer ones harder.
function wreck(fx, e, track) {
  if (fx.wrecks.length >= MAX_WRECKS) fx.wrecks.shift();
  const cuts = [0, ...WRECK_CUTS[e.kind].map((c) => c + (rand(fx) - 0.5) * 0.08), 1];
  const pieces = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const side = (cuts[i] + cuts[i + 1]) / 2 - 0.5;
    const max = Math.round(28 + rand(fx) * 16 + Math.abs(side) * 12);
    pieces.push({
      x: e.x, y: e.y,
      vx: (track ? track.vx : 0) + side * (0.3 + rand(fx) * 0.2),
      vy: (track ? track.vy : 0) + (rand(fx) - 0.5) * 0.2,
      from: cuts[i], to: cuts[i + 1], side, life: max, max,
    });
  }
  fx.wrecks.push({ kind: e.kind, pattern: track ? track.pattern : null, span: WRECK_SPAN[e.kind], pieces });
}

// One call per sim step, after stepSim, with that step's events.
// Where being close scores: what a kill was paid at, said on the spot, and
// said large when it is large. Below x4 it is not worth the clutter.
function closePopup(fx, sim, e, dy) {
  if (MODES[sim.mode].scoring !== "close" || e.mult < 4) return;
  fx.popups.push({ x: e.x, y: e.y + dy, text: `X${e.mult}`, life: e.mult >= 12 ? 40 : 26, color: "reward", scale: e.mult >= 12 ? 2 : 1 });
}

// A shot or a laser landing on a boss's body while a wing is left: most of it
// is turned, and the shield shows it.
function shieldTurns(fx, sim, e) {
  const body = sim.enemies.find((x) => x.id === e.target);
  if (!body || !body.boss || body.boss.wings === 0) return;
  fx.shields.set(body.id, 5);
  fx.rings.push({ x: e.x, y: e.y, r: 0.3, grow: 0.22, life: 6, max: 6, color: "shot" });
}

// Leans a thing toward the side it moved to this step, a part of the way at
// a time, so that a roll is seen going over rather than switching.
function lean(fx, key, x, full, ease) {
  const roll = fx.rolls.get(key);
  if (!roll) {
    fx.rolls.set(key, { x, bank: 0 });
    return;
  }
  const target = Math.max(-2, Math.min(2, ((x - roll.x) / full) * 2));
  roll.bank += (target - roll.bank) * ease;
  roll.x = x;
}

// The roll to draw: 0 level, 1 leaning, 2 hard over; the sign is the side.
export function rollStage(fx, key) {
  const roll = fx.rolls.get(key);
  return roll ? Math.round(roll.bank) : 0;
}

export function fxStep(fx, sim) {
  for (const p of fx.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.life--;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const r of fx.rings) {
    r.r += r.grow;
    r.life--;
  }
  fx.rings = fx.rings.filter((r) => r.life > 0);
  for (const b of fx.blasts) {
    if (b.delay > 0) {
      if (--b.delay === 0) blastStart(fx, b);
      continue;
    }
    b.age++;
    b.x += b.vx;
    b.y += b.vy + (b.age > b.flash + b.hold + b.burn ? SMOKE_DRIFT : 0);
    b.vx *= 0.9;
    b.vy *= 0.9;
  }
  fx.blasts = fx.blasts.filter((b) => b.age < blastFrames(b));
  for (const w of fx.wrecks) {
    for (const p of w.pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      // Each piece goes up in its turn, where it has got to.
      if (--p.life === 0) blast(fx, p.x + p.side * w.span, p.y, 5, 0, { sparks: [[4, 0.3, 12, w.kind === "large" ? "large" : "big", 1]] });
    }
    w.pieces = w.pieces.filter((p) => p.life > 0);
  }
  fx.wrecks = fx.wrecks.filter((w) => w.pieces.length > 0);
  for (const [id, left] of fx.flashes) left <= 1 ? fx.flashes.delete(id) : fx.flashes.set(id, left - 1);
  for (const b of fx.brackets) b.life--;
  fx.brackets = fx.brackets.filter((b) => b.life > 0);
  for (const p of fx.popups) {
    p.y += 0.06;
    p.life--;
  }
  fx.popups = fx.popups.filter((p) => p.life > 0);
  if (fx.shake > 0) fx.shake--;
  if (fx.screenFlash > 0) fx.screenFlash--;
  if (fx.shipBlast > 0) fx.shipBlast--;
  if (fx.banner && --fx.banner.life <= 0) fx.banner = null;
  if (fx.culprit && --fx.culprit.life <= 0) fx.culprit = null;
  for (const [id, left] of fx.shields) left <= 1 ? fx.shields.delete(id) : fx.shields.set(id, left - 1);
  if (fx.ratePop && --fx.ratePop.life <= 0) fx.ratePop = null;
  if (fx.loopBanner && --fx.loopBanner.life <= 0) fx.loopBanner = null;
  if (fx.chainLost > 0) fx.chainLost--;
  if (fx.shotFlash > 0) fx.shotFlash--;
  for (const m of fx.muzzles) m.life--;
  fx.muzzles = fx.muzzles.filter((m) => m.life > 0);

  // Rolls. A boss does not roll: it is a platform, not a craft.
  const flying = new Set();
  if (sim.phase === "play" && !shipAbsent(sim.ship)) {
    flying.add("ship");
    lean(fx, "ship", sim.ship.x, MODES[sim.mode].shipSpeed * SHIP_ROLL_PART, 0.3);
  }
  for (const enemy of sim.enemies) {
    if (enemy.boss || enemy.parent) continue;
    flying.add(enemy.id);
    lean(fx, enemy.id, enemy.x, ENEMY_ROLL_SPEED, 0.2);
  }
  for (const key of fx.rolls.keys()) if (!flying.has(key)) fx.rolls.delete(key);

  // Where each middle and large enemy is and how it moves, so that what is
  // left of it can go on the same way. (Kept through the step it dies in.)
  for (const enemy of sim.enemies) {
    if (enemy.boss || enemy.parent || (enemy.kind !== "middle" && enemy.kind !== "large")) continue;
    const t = fx.tracks.get(enemy.id);
    fx.tracks.set(enemy.id, { kind: enemy.kind, pattern: enemy.plan ? enemy.plan.pattern : null, x: enemy.x, y: enemy.y, vx: t ? enemy.x - t.x : 0, vy: t ? enemy.y - t.y : 0 });
  }

  for (const e of sim.events) {
    switch (e.type) {
      case "hit":
        // Confirmation only: every shot that lands, so it must stay small.
        burst(fx, e.x, e.y, 2, 0.28, 7, "shot", 1, 0.12);
        fx.flashes.set(e.target, 2);
        shieldTurns(fx, sim, e);
        break;
      case "destroy":
        closePopup(fx, sim, e, e.kind === "small" ? 0 : -1.2);
        // A boss's body has its own, larger answer (boss-destroy).
        if (e.kind === "midboss" || e.kind === "bigboss") break;
        if (e.kind === "large" || e.kind === "wing") {
          // The biggest thing that can be destroyed so far. It goes at the
          // middle first, then along its span, one blast after another; the
          // shake and the score are at once.
          const track = e.kind === "large" ? trackOf(fx, sim, e) : null;
          const drift = track ? { vx: track.vx, vy: track.vy } : {};
          blast(fx, e.x, e.y, 13, 0, { ...drift, sparks: [[24, 0.35, 56, "hot", 2], [14, 0.6, 40, "large", 2]], ring: { r: 0.3, grow: 0.55, life: 24, max: 24, color: "large" } });
          [-2.2, 2.2, -1.1, 1.1, 0].forEach((dx, i) => {
            const delay = 5 + i * 5;
            blast(fx, e.x + dx + (track ? track.vx * delay * 0.6 : 0), e.y + (rand(fx) - 0.5) * 0.8 + (track ? track.vy * delay * 0.6 : 0), i < 2 ? 11 : 9, delay, {
              ...drift,
              sparks: [[i < 2 ? 16 : 8, 0.6, 36, "large", 2]],
              ring: i < 2 ? { r: 0.4, grow: 0.36, life: 20, max: 26, color: "hot" } : null,
              shake: 4,
            });
          });
          if (e.kind === "large") wreck(fx, e, track);
          fx.popups.push({ x: e.x, y: e.y, text: String(e.score), life: 50 });
          fx.shake = Math.max(fx.shake, 16);
          fx.screenFlash = 3;
        } else if (e.kind === "middle") {
          const track = trackOf(fx, sim, e);
          const drift = track ? { vx: track.vx, vy: track.vy } : {};
          blast(fx, e.x, e.y, 11, 0, { ...drift, sparks: [[26, 0.55, 34, "big", 2], [14, 0.3, 46, "hot", 2]], ring: { r: 0.6, grow: 0.42, life: 14, max: 14, color: "hot" } });
          [-1.2, 1.2].forEach((dx, i) => {
            const delay = 5 + i * 5;
            blast(fx, e.x + dx + (track ? track.vx * delay * 0.6 : 0), e.y + (rand(fx) - 0.5) * 0.6 + (track ? track.vy * delay * 0.6 : 0), 7, delay, { ...drift, sparks: [[6, 0.45, 24, "big", 1]], ring: i === 1 ? { r: 0.2, grow: 0.25, life: 16, max: 16, color: "big" } : null });
          });
          wreck(fx, e, track);
          fx.popups.push({ x: e.x, y: e.y, text: String(e.score), life: 40 });
          fx.shake = Math.max(fx.shake, 10);
          fx.screenFlash = 2;
        } else {
          blast(fx, e.x, e.y, 5, 0, { smoke: 8, sparks: [[9, 0.34, 14, "enemy", 1]], ring: { r: 0.3, grow: 0.22, life: 6, max: 6, color: "hot" } });
        }
        break;
      case "lock":
        fx.brackets.push({ target: null, x: e.x, y: e.y, life: 7 });
        break;
      case "release":
        fx.rings.push({ x: e.x, y: e.y, r: 0.4, grow: 0.3 + e.count * 0.06, life: 8, max: 8, color: "laser" });
        burst(fx, e.x, e.y, 3 * e.count, 0.3, 10, "laser", 1, -0.1);
        break;
      case "laser-hit":
        burst(fx, e.x, e.y, 6 + Math.round(e.damage), 0.5, 14, "laser", 2);
        fx.rings.push({ x: e.x, y: e.y, r: 0.5, grow: 0.3, life: 7, max: 7, color: "hot" });
        fx.flashes.set(e.target, 5);
        fx.shake = Math.max(fx.shake, 2 + Math.round(e.damage / 6));
        shieldTurns(fx, sim, e);
        break;
      case "ground-hit":
        burst(fx, e.x, e.y, 2, 0.25, 7, "ground", 1, 0.1);
        fx.flashes.set(e.target, 2);
        break;
      case "ground-destroy":
        closePopup(fx, sim, e, 0);
        // Flatter and shorter than anything in the air: it is under the fight.
        burst(fx, e.x, e.y, e.kind === "core" ? 26 : 8, e.kind === "core" ? 0.45 : 0.3, e.kind === "core" ? 28 : 12, "ground", e.kind === "core" ? 2 : 1);
        if (e.kind === "core") {
          // It takes what is round it: a ring out to its reach (5 units).
          fx.rings.push({ x: e.x, y: e.y, r: 0.4, grow: 0.3, life: 12, max: 12, color: "ground" });
          fx.rings.push({ x: e.x, y: e.y, r: 0.6, grow: 0.36, life: 12, max: 12, color: "hot" });
          fx.popups.push({ x: e.x, y: e.y, text: String(e.score), life: 40 });
        } else if (e.kind === "bonus" || e.kind === "hidden") {
          // The valuable ones say what they paid, in the colour of a bonus.
          burst(fx, e.x, e.y, 8, 0.35, 16, "reward", 1);
          fx.popups.push({ x: e.x, y: e.y, text: String(e.score), life: 40, color: "reward" });
        }
        break;
      case "ground-reveal":
        // A hidden target shows itself: a quick double ring.
        fx.rings.push({ x: e.x, y: e.y, r: 0.3, grow: 0.2, life: 10, max: 10, color: "reward" });
        fx.rings.push({ x: e.x, y: e.y, r: 0.9, grow: 0.2, life: 10, max: 10, color: "hot" });
        break;
      case "ground-bonus":
        // The whole row taken: the bonus, said large.
        fx.rings.push({ x: e.x, y: e.y, r: 0.6, grow: 0.4, life: 18, max: 18, color: "reward" });
        burst(fx, e.x, e.y, 24, 0.5, 26, "reward", 2);
        fx.popups.push({ x: e.x, y: Math.min(e.y + 1.4, 13.5), text: String(e.score), life: 70, color: "reward", scale: 2 });
        break;
      case "formation": {
        // A whole formation gone: stronger the longer the chain.
        const level = Math.min(e.chain, 16);
        burst(fx, e.x, e.y, 8 + level * 2, 0.4 + level * 0.02, 22, "reward", level >= 4 ? 2 : 1);
        fx.rings.push({ x: e.x, y: e.y, r: 0.4, grow: 0.3 + level * 0.02, life: 12, max: 12, color: "reward" });
        // Kept below the top edge, where most formations are finished off.
        fx.popups.push({ x: e.x, y: Math.min(e.y + 1, 13.5), text: `X${e.mult}`, life: 60, color: "reward", scale: level >= 4 ? 2 : 1 });
        if (level >= 8) fx.screenFlash = Math.max(fx.screenFlash, 2);
        break;
      }
      case "graze":
        // A near miss that counted: a spark where the bullet was.
        burst(fx, e.x, e.y, 2, 0.2, 8, "reward", 1);
        // Each step up is said by the ship.
        if (Math.floor(e.rate + 1e-9) > (fx.ratePop ? fx.ratePop.mult : 1) || !fx.ratePop) fx.ratePop = { mult: Math.floor(e.rate + 1e-9), life: 40 };
        break;
      case "chain-break":
        fx.chainLost = 48;
        break;
      case "miss":
        burst(fx, e.x, e.y, 60, 0.7, 50, "ship", 2);
        burst(fx, e.x, e.y, 30, 0.4, 60, "danger", 1);
        fx.rings.push({ x: e.x, y: e.y, r: 0.5, grow: 0.5, life: 26, max: 26, color: "ship" });
        fx.shake = 24;
        fx.screenFlash = 4;
        fx.shipBlast = 30;
        if (e.cause === "ram") fx.culprit = { id: e.by, life: 60 };
        break;
      case "section":
        // The first sector of a loop after the first: a new loop, a new sky,
        // a white frame.
        if (e.number > 1 && (e.number - 1) % 10 === 0) {
          fx.loopBanner = { text: `LOOP ${(e.number - 1) / 10 + 1}`, life: 150 };
          fx.screenFlash = Math.max(fx.screenFlash, 3);
        }
        // A section with a character of its own says so.
        fx.banner = { text: e.theme ? `SECTOR ${e.number} ${THEMES.kinds[e.theme].name}` : `SECTOR ${e.number}`, life: e.theme ? 110 : 80 };
        break;
      case "boss":
        // After the sector number has had its moment.
        fx.banner = { text: "WARNING", life: 90 };
        break;
      case "boss-destroy":
        // The biggest thing there is. It breaks up from the middle outward
        // over most of a second, goes on bursting across the hull, and ends
        // in the largest blast of all.
        for (let i = -3; i <= 3; i++) {
          blast(fx, e.x + i * 1.4, e.y + (i % 2) * 0.6, 12, Math.abs(i) * 6, {
            sparks: [[22, 0.75, 60, i % 2 ? "large" : "hot", 2]],
            ring: { r: 0.3, grow: 0.3 + Math.abs(i) * 0.04, life: 34, max: 34, color: "reward" },
            shake: 8,
          });
        }
        for (let i = 0; i < 6; i++) blast(fx, e.x + (rand(fx) - 0.5) * 8, e.y + (rand(fx) - 0.5) * 2, 9, 22 + i * 4, { sparks: [[6, 0.5, 30, "large", 2]], shake: 6 });
        blast(fx, e.x, e.y, 24, 46, { sparks: [[40, 0.9, 60, "hot", 2]], ring: { r: 0.5, grow: 0.6, life: 30, max: 30, color: "hot" }, shake: 24, screenFlash: 4 });
        fx.popups.push({ x: e.x, y: e.y, text: String(e.score), life: 90, color: "reward", scale: 2 });
        // Taken apart completely: the chain goes on, said under the score.
        if (e.clean) fx.popups.push({ x: e.x, y: e.y - 2, text: `X${Math.min(e.chain + 1, 16)}`, life: 90, color: "reward" });
        fx.shake = Math.max(fx.shake, 30);
        fx.screenFlash = 4;
        break;
      case "boss-open":
        // The last wing gone: the shield bursts outward and the body is open.
        for (let i = 0; i < 3; i++) fx.rings.push({ x: e.x, y: e.y, r: 2 + i * 0.6, grow: 0.3 + i * 0.08, life: 16, max: 16, color: "shot" });
        burst(fx, e.x, e.y, 30, 0.6, 26, "shot", 2);
        fx.popups.push({ x: e.x, y: e.y - 2.4, text: "OPEN", life: 70, color: "reward", scale: 2 });
        fx.screenFlash = Math.max(fx.screenFlash, 2);
        break;
      case "boss-warn":
        // About to give up and go: said where the arrival was said.
        fx.banner = { text: "ESCAPING", life: 90 };
        break;
      case "boss-left":
        break;
      case "extend":
        fx.popups.push({ x: 7.5, y: 14, text: "1UP", life: 90 });
        break;
      case "split":
        // A carrier bursting: a small flash where it was.
        burst(fx, e.x, e.y, 3, 0.22, 6, "danger", 1);
        break;
      case "fire": {
        // A bullet leaves a muzzle: it lights for a moment. (A fan leaves
        // one muzzle at once; that is one flash.)
        const last = fx.muzzles[fx.muzzles.length - 1];
        if (fx.muzzles.length < MAX_MUZZLES && !(last && last.life === 4 && last.x === e.x && last.y === e.y)) fx.muzzles.push({ x: e.x, y: e.y, life: 4 });
        break;
      }
      case "shot":
        fx.shotFlash = 2;
        break;
      default:
        break;
    }
  }
  for (const id of fx.tracks.keys()) if (!sim.enemies.some((enemy) => enemy.id === id)) fx.tracks.delete(id);
}

// Screen offset in pixels for this frame.
export function shakeOffset(fx) {
  if (fx.shake <= 0) return [0, 0];
  const amp = Math.min(Math.ceil(fx.shake / 4), 4);
  const phase = fx.shake % 4;
  return [phase < 2 ? amp : -amp, phase % 2 === 0 ? -amp : amp].map((v) => Math.round(v * 0.75));
}
