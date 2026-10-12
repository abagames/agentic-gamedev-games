// Barrages: how enemies fire. Nothing here is a fixed attack. Each loop of
// sections generates a fresh set of enemy types; a type's barrage is put
// together from three things:
//   - a base pattern, the rhythm and layout of what leaves the muzzle
//   - a rank split into bullet count, bullet speed, and a number of splits
//   - a chain of splits: a bullet that still has splits left is a carrier,
//     which bursts into more bullets on the way, and those may burst again
// Higher rank therefore adds structure to a pattern more than it adds bulk.

import { PI, atan2, sin } from "./math.js";
import { BOSS, BOSS_FIRE, BULLET, KINDS, LARGE_FIRE, MIDDLE_FIRE, MODES, SECTION, SMALL_FIRE, SPEED_RANK, TYPE_COUNTS, unlocked } from "./constants.js";
import { nextFloat, nextInt } from "./rng.js";

// Base patterns. r is the bullet-count rank, 0 to 1.
//   aimed: a fan centred on the ship;  down: a fan centred on straight down;
//          otherwise streams from a turning angle
//   weave: every other beat is shifted by half a gap, so the lanes alternate
//   ways:  [a, b] -> floor(a + b r) bullets per beat
//   every: [a, b, min] -> max(min, round(a - b r)) frames between beats
//   beats: [a, b] -> at most floor(a + b r) beats per burst (optional)
//   spread: angle between neighbours of a fan;  turn: angle added per beat
//   speed: pattern speed;  step: speed added per way, for staggered fans
//   scatter: random speed spread, for sprays
//   swing: [amp, rate] -> a down fan whose centre swings from side to side
//   alt: the centre of a fan is this far to one side on one beat and to the
//        other on the next
//   walk: the centre of a fan moves on by this much every beat of a run, the
//        middle beat being dead centre
//   gap: the lanes nearest the centre of a fan are left out, this many to
//        each side of it: a doorway
//   counter: a turning pattern fires its mirror image as well, so two sets of
//        arms turn against each other
// The lists are in the order the shapes arrive in: later loops bring more of
// each (constants.js, UNLOCK).
const BASES = Object.freeze({
  // What a small enemy fires: one bullet at a time and nothing else. A small
  // enemy is made harder by firing more often and faster, never by shape.
  single: Object.freeze([
    // Aimed at the ship.
    { name: "single", aimed: true, ways: [1, 0], every: [40, 26, 12], spread: 0, speed: 1 },
    // Straight down, never aimed: a rain to be walked between.
    { name: "drop", down: true, ways: [1, 0], every: [30, 18, 10], spread: 0, speed: 1.1 },
  ]),
  // A short aimed run from a wing gun.
  sub: Object.freeze([{ aimed: true, ways: [1, 0], every: [24, 8, 8], beats: [1, 4.4], spread: 0, speed: 1 }]),
  middle: Object.freeze([
    { name: "twin roll", aimed: false, ways: [2, 0], every: [24, 13, 6], turn: 0.4, speed: 1 },
    { name: "cross roll", aimed: false, ways: [4, 0], every: [42, 21, 10], turn: 0.26, speed: 1 },
    { name: "rings", aimed: false, ways: [6, 2], every: [32, 12, 12], turn: 0.52, speed: 1.2 },
    { name: "aimed fan", aimed: true, ways: [3, 3.2], every: [45, 15, 16], spread: 0.22, speed: 1 },
    { name: "shotgun", aimed: true, ways: [2, 4.7], every: [50, 20, 18], spread: 0.09, speed: 0.8, scatter: 0.5 },
    { name: "comb", aimed: true, ways: [2, 2.5], every: [20, 9.5, 8], spread: 0.5, speed: 1 },
    // A fan that falls straight down wherever the ship is.
    { name: "curtain", down: true, ways: [3, 2.4], every: [34, 14, 14], spread: 0.3, speed: 0.9 },
    // Short, fast, aimed runs with long gaps.
    { name: "burst", aimed: true, ways: [1, 0], every: [7, 2, 5], beats: [3, 4.5], spread: 0, speed: 1.25 },
    // Aimed shots that fall now to one side of the ship and now to the other.
    { name: "sidewinder", aimed: true, alt: 0.26, ways: [1, 1.6], every: [20, 8, 10], spread: 0.16, speed: 1.1 },
    // From the second loop on, one a loop:
    // Tight aimed threes in pairs of quick beats.
    { name: "tri burst", aimed: true, ways: [3, 0], every: [8, 2, 6], beats: [2, 2], spread: 0.12, speed: 1.15 },
    // Two columns straight down, one to either side of it.
    { name: "twin drop", down: true, ways: [2, 1], every: [16, 6, 9], spread: 0.5, speed: 1.1 },
    // A quick aimed run that creeps sideways as it goes.
    { name: "stutter", aimed: true, walk: 0.05, ways: [1, 0], every: [5, 1, 4], beats: [4, 3], spread: 0, speed: 1.2 },
  ]),
  large: Object.freeze([
    { name: "wide fans", aimed: true, ways: [5, 2.5], every: [62, 32, 18], spread: 0.3, speed: 0.8 },
    { name: "all round", aimed: false, ways: [6, 7.6], every: [42, 14, 16], turn: 0.31, speed: 1 },
    { name: "sweep", aimed: false, ways: [3, 0], every: [10, 5, 4], turn: 0.14, speed: 1 },
    { name: "stair fan", aimed: true, ways: [3, 5.2], every: [50, 18, 18], spread: 0.16, speed: 0.75, step: 0.12 },
    { name: "spray", aimed: true, ways: [2, 2], every: [14, 8, 5], spread: 0.45, speed: 0.6, scatter: 0.8 },
    { name: "pinwheel", aimed: false, ways: [5, 3], every: [16, 6, 8], turn: 0.09, speed: 0.9 },
    // Aimed fans whose lanes swap places beat by beat.
    { name: "weave", aimed: true, weave: true, ways: [4, 3], every: [26, 10, 12], spread: 0.26, speed: 0.85 },
    // A wide fan straight down: the gaps stay where they are.
    { name: "rain", down: true, ways: [5, 4], every: [30, 12, 12], spread: 0.24, speed: 0.8 },
    // A run of aimed shots that walks across the ship from one side to the other.
    { name: "walker", aimed: true, walk: 0.1, ways: [1, 0], every: [7, 2, 5], beats: [5, 4], spread: 0, speed: 1.1 },
    // Two rings in quick succession, the second in the gaps of the first.
    { name: "double ring", aimed: false, ways: [8, 6], every: [10, 2, 8], beats: [2, 0], turn: 0.3, speed: 0.95 },
    // From the second loop on, one a loop:
    // A wide curtain straight down with a doorway under the enemy.
    { name: "gatefall", down: true, gap: 1, ways: [8, 4], every: [24, 8, 12], spread: 0.2, speed: 0.9 },
    // Arms that turn one way and their mirror images that turn the other.
    { name: "crossfire", aimed: false, counter: true, ways: [3, 2], every: [12, 4, 8], turn: 0.15, speed: 0.95 },
    // An aimed fan that walks across the ship over a run of beats.
    { name: "fan walk", aimed: true, walk: 0.14, ways: [3, 2], every: [12, 3, 8], beats: [4, 2], spread: 0.2, speed: 0.95 },
    // A ring whose bullets leave at stepped speeds, turning between rings.
    { name: "pulse ring", aimed: false, ways: [10, 6], every: [40, 12, 20], turn: 0.31, speed: 0.85, step: 0.04 },
  ]),
  // What a boss's body fires: shapes that fill the width of the field, which
  // nothing smaller has.
  boss: Object.freeze([
    // A wide curtain straight down whose lanes swap places beat by beat.
    { name: "lattice", down: true, weave: true, ways: [8, 4], every: [30, 10, 16], spread: 0.17, speed: 0.75 },
    // Two arms turning quickly: a double spiral.
    { name: "spiral", aimed: false, ways: [2, 1.6], every: [6, 2, 4], turn: 0.23, speed: 0.85 },
    // Rings whose bullets leave at stepped speeds, so each opens like a flower.
    { name: "petals", aimed: false, ways: [8, 6], every: [44, 14, 22], turn: 0.2, speed: 0.6, step: 0.05 },
    // Aimed fans in quick runs with a rest between.
    { name: "volley", aimed: true, ways: [3, 2.4], every: [10, 3, 7], beats: [3, 3.5], spread: 0.3, speed: 1 },
    // A narrow fan straight down that swings across the field like a pendulum.
    { name: "pendulum", down: true, swing: [0.7, 0.045], ways: [2, 1.6], every: [7, 2, 5], spread: 0.16, speed: 0.9 },
    // From the second loop on, two a loop:
    // Four arms turning slowly: a cross that sweeps the field.
    { name: "cross", aimed: false, ways: [4, 0], every: [8, 2, 6], turn: 0.09, speed: 0.95 },
    // A curtain straight down with a doorway in it that swings from side to side.
    { name: "gate", down: true, swing: [0.5, 0.03], gap: 1, ways: [8, 3], every: [9, 2, 6], spread: 0.2, speed: 0.85 },
    // Aimed fans thrown now to one side of the ship and now to the other.
    { name: "fork", aimed: true, alt: 0.4, ways: [3, 2], every: [16, 4, 10], spread: 0.14, speed: 1 },
    // Two aimed lanes, one either side of the ship, that walk across it together.
    { name: "sweepers", aimed: true, walk: 0.12, ways: [2, 1], every: [6, 1, 5], beats: [7, 4], spread: 0.5, speed: 1.05 },
    // Three rings one after another, each turned from the last.
    { name: "burst rings", aimed: false, ways: [10, 6], every: [9, 2, 7], beats: [3, 0], turn: 0.2, speed: 0.9 },
    // A loose scatter straight down at uneven speeds.
    { name: "hail", down: true, ways: [3, 3], every: [10, 3, 6], spread: 0.5, speed: 0.75, scatter: 0.5 },
    // Two arms and their mirror images turning against each other.
    { name: "braid", aimed: false, counter: true, ways: [2, 1], every: [7, 2, 5], turn: 0.17, speed: 0.85 },
  ]),
});

// Splits. A carrier flies `fuse` frames after launching, then becomes `parts`.
// Fuses are short, and a whole chain is over within BULLET.splitWindow frames
// of the launch: a barrage takes its final shape close to the enemy that fired
// it, and from there on every bullet flies straight.
// Each part is [angle offset, speed factor]; counts scale with r where noted.
//   keep: the carrier itself flies on as one of the bullets
//   retarget: the parts turn to face the ship at the moment of the burst
const SPLITS = Object.freeze([
  { name: "three", fuse: 6, parts: (r) => [[-0.3, 1], [0, 1], [0.3, 1]] },
  { name: "fan", fuse: 8, parts: (r) => spreadParts(2 + Math.floor(r * 3.2), 0.24, 1) },
  { name: "column", fuse: 0, parts: (r) => speedParts(2 + Math.floor(r * 1.7), 0.16) },
  { name: "twin", fuse: 0, parts: (r) => [[-0.12, 1], [0.12, 1]] },
  { name: "wide", fuse: 10, parts: (r) => [[-0.95, 0.9], [0, 1.1], [0.95, 0.9]] },
  { name: "side drop", fuse: 5, keep: true, parts: (r) => [[-PI / 2, 0.85], [PI / 2, 0.85]] },
  { name: "wide burst", fuse: 10, parts: (r) => spreadParts(3 + Math.floor(r * 2), 0.5, 0.9) },
  { name: "lead and trail", fuse: 0, parts: (r) => [[0, 1.5], [0, 1.25], [0, 1]] },
  // A ring in every direction.
  { name: "ring", fuse: 8, parts: (r) => ringParts(5 + Math.floor(r * 3), 0.9) },
  // The carrier stops being a bullet and becomes a second aim at the ship.
  { name: "retarget", fuse: 8, retarget: true, parts: (r) => (r > 0.5 ? [[-0.14, 1.1], [0.14, 1.1]] : [[0, 1.1]]) },
]);

function spreadParts(n, step, speed) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push([(i - (n - 1) / 2) * step, speed]);
  return parts;
}

function ringParts(n, speed) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push([(i * PI * 2) / n, speed]);
  return parts;
}

// One behind the other: each faster than the carrier was, none slower.
function speedParts(n, step) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push([0, 1 + i * step]);
  return parts;
}

// assumption: how much of the firing-rate rank (0 to 1) a small enemy gets
// for each split its rank would otherwise have bought.
const SMALL_RATE_PER_SPLIT = 0.15;

export const baseCount = (group) => BASES[group].length;
export const splitCount = SPLITS.length;
export const baseName = (group, index) => BASES[group][index].name ?? group;
export const splitName = (index) => SPLITS[index].name;

// Splits rank into count, speed and number of splits. `weak` halves the
// count; `noSplits` is for middle enemies, whose bullets never burst;
// `rateOnly` is for small enemies, whose bullets never burst either, and
// whose rank that would have gone into splits goes into firing more often;
// `fewerSplits` takes one burst off the chain, for large enemies.
export function splitRank(sim, rank, { weak = false, noSplits = false, rateOnly = false, fewerSplits = false } = {}) {
  if (rank <= 0) return null;
  let r = Math.sqrt(rank) / (8 - nextInt(sim.rng, 3));
  if (r > 0.8) r = 0.8 + nextFloat(sim.rng, 0.2);
  const rest = rank / (r + 2);
  if (weak) r /= 2;
  // The original's share for speed. It still decides what is left over for
  // splits, but it is no longer the speed: it climbs to its ceiling within
  // two loops and then stands still.
  const roll = nextFloat(sim.rng, 0.2);
  let share = Math.sqrt(rest * 0.66) * (0.8 + roll);
  if (share < 1) share = 1;
  if (share > 2) share = Math.sqrt(share) + 0.27;
  let left = rest / share;
  // The speed itself rises with the square root of the rank, so that no loop
  // brings a jump (author's instruction, 2026-10-11).
  const speedRank = Math.min(SPEED_RANK.max, Math.max(1, (SPEED_RANK.base + SPEED_RANK.perRoot * Math.sqrt(rank)) * (1 - SPEED_RANK.spread + roll * SPEED_RANK.spread * 10)));
  let depth = 0;
  while (left > 1) {
    depth++;
    left /= 3;
  }
  if (rateOnly) {
    r = Math.min(1, r + SMALL_RATE_PER_SPLIT * Math.floor(depth / 1.7));
    depth = 0;
  }
  if (fewerSplits) depth = Math.max(depth - 1, 0);
  if (noSplits) depth = 0;
  return { r, speedRank, depth };
}

// How many of a group's shapes are in play in the loop being generated.
const UNLOCKED_BY = Object.freeze({ middle: "middleBases", large: "largeBases", boss: "bossBases" });
function basesInPlay(sim, group) {
  const total = BASES[group].length;
  return UNLOCKED_BY[group] ? unlocked(UNLOCKED_BY[group], Math.floor(Math.max(sim.stage.section, 0) / SECTION.perLoop), total) : total;
}

function makeBarrage(sim, group, rank, options) {
  const split = splitRank(sim, rank, options);
  if (!split) return -1;
  // A chain of distinct splits, used in order as a bullet bursts again.
  const pool = SPLITS.map((_, i) => i);
  const chain = [];
  for (let i = 0; i < Math.min(split.depth, 4); i++) chain.push(pool.splice(nextInt(sim.rng, pool.length), 1)[0]);
  sim.stage.barrages.push({
    group,
    base: nextInt(sim.rng, basesInPlay(sim, group)),
    r: split.r,
    speedRank: split.speedRank,
    chain,
    mirror: nextInt(sim.rng, 2) * 2 - 1,
    shape: nextInt(sim.rng, 3),
    // Whose barrage it is decides how fast and how thick it comes.
    fire: options?.fire ?? null,
  });
  return sim.stage.barrages.length - 1;
}

// An enemy type: which barrage each muzzle fires and how the bursts are timed.
function makeType(sim, kind, rank) {
  const def = KINDS[kind];
  const muzzles = [];
  let interval;
  let period;
  if (kind === "small") {
    muzzles.push({ ox: 0, barrage: makeBarrage(sim, "single", rank, { rateOnly: true }), mirror: 1 });
    interval = 99999;
    period = 150 + nextInt(sim.rng, 40);
  } else if (kind === "middle") {
    // Lightly armed: either a pair of wing guns or one light body pattern,
    // never both, and nothing that bursts. It fires for less than half the time.
    if (nextInt(sim.rng, 2) === 0) addWings(sim, muzzles, def.wings[0], rank / 3, { noSplits: true, fire: MIDDLE_FIRE });
    else muzzles.push({ ox: 0, barrage: makeBarrage(sim, "middle", rank / 4, { noSplits: true, fire: MIDDLE_FIRE }), mirror: 1 });
    interval = 72 + nextInt(sim.rng, 30);
    period = Math.floor(interval / (2.2 + nextFloat(sim.rng, 0.4)));
  } else {
    const roll = nextInt(sim.rng, 9);
    const body = roll === 0 ? (rank * 3) / 4 : roll <= 4 ? rank / 2 : 0;
    const inner = roll === 1 || roll === 2 || roll >= 5 ? (rank * 2) / 3 : 0;
    const outer = roll === 3 || roll === 4 || roll >= 5 ? (rank * 2) / 3 : 0;
    const large = { fewerSplits: true, fire: LARGE_FIRE };
    muzzles.push({ ox: 0, barrage: makeBarrage(sim, "large", body, { weak: true, ...large }), mirror: 1 });
    addWings(sim, muzzles, def.wings[0], inner, large);
    addWings(sim, muzzles, def.wings[1], outer, large);
    interval = 100 + nextInt(sim.rng, 50);
    period = Math.floor(interval / (1.2 + nextFloat(sim.rng, 0.2)));
  }
  if (rank < 10) period = Math.floor(period / (2 - rank * 0.1));
  return { kind, look: nextInt(sim.rng, 3), interval, period, muzzles: muzzles.filter((m) => m.barrage >= 0) };
}

// A boss's types, added to the loop's cast when the boss arrives: one for the
// body, whose muzzles are the barrages it cycles through one burst at a time,
// and one for each wing, a pair sharing a barrage in mirror image.
export function makeBossTypes(sim, kind, rank) {
  const stage = sim.stage;
  const [least, spread] = BOSS.patterns[kind];
  const muzzles = [];
  const used = new Set();
  for (let i = 0; i < least + nextInt(sim.rng, spread); i++) {
    const barrage = makeBarrage(sim, "boss", rank / 2, { weak: true, fewerSplits: true, fire: BOSS_FIRE });
    // Each of its barrages has a base of its own.
    for (let tries = 0; tries < 8 && used.has(stage.barrages[barrage].base); tries++) stage.barrages[barrage].base = nextInt(sim.rng, basesInPlay(sim, "boss"));
    used.add(stage.barrages[barrage].base);
    muzzles.push({ ox: 0, barrage, mirror: 1 });
  }
  const interval = BOSS.interval[kind][0] + nextInt(sim.rng, BOSS.interval[kind][1]);
  const body = stage.types.length;
  stage.types.push({ kind, look: 0, interval, period: Math.floor(interval / (1.2 + nextFloat(sim.rng, 0.4))), muzzles });
  const wings = [];
  KINDS[kind].wings.forEach(() => {
    const barrage = makeBarrage(sim, "sub", rank / 3, { fewerSplits: true, fire: BOSS_FIRE });
    const gap = 90 + nextInt(sim.rng, 40);
    for (const mirror of [1, -1]) {
      wings.push(stage.types.length);
      stage.types.push({ kind: "wing", look: 0, interval: gap, period: Math.floor(gap / 2.4), muzzles: [{ ox: 0, barrage, mirror }] });
    }
  });
  return { body, wings };
}

// A pair of wing guns share one barrage; the left one is its mirror image.
function addWings(sim, muzzles, ox, rank, options) {
  const barrage = makeBarrage(sim, "sub", rank, options);
  muzzles.push({ ox, barrage, mirror: 1 }, { ox: -ox, barrage, mirror: -1 });
}

// A fresh cast of enemies for one loop of sections.
export function generateTypes(sim, rank) {
  const stage = sim.stage;
  stage.rank = rank;
  stage.barrages = [];
  stage.types = [];
  for (const kind of Object.keys(TYPE_COUNTS)) {
    for (let i = 0; i < TYPE_COUNTS[kind]; i++) stage.types.push(makeType(sim, kind, rank));
  }
}

export function typesOfKind(sim, kind) {
  const found = [];
  sim.stage.types.forEach((t, i) => {
    if (t.kind === kind) found.push(i);
  });
  return found;
}

// A fuse or the window, written in frames at BULLET.splitSpeed, as the frames
// it takes a bullet of this speed to fly as far.
const framesAt = (frames, speed) => Math.round((frames * BULLET.splitSpeed * BULLET.unitSpeed) / speed);
const flightSpeed = (sim, speed) => Math.max(speed, BULLET.minSpeed * BULLET.unitSpeed * MODES[sim.mode].bulletSpeed);

function addBullet(sim, bullet) {
  if (sim.bullets.length >= BULLET.max) return;
  bullet.speed = flightSpeed(sim, bullet.speed);
  bullet.id = sim.nextId++;
  sim.bullets.push(bullet);
}

// One frame of an enemy's burst. tick counts frames since the burst began.
// `only` picks one muzzle (a boss's body fires one of its barrages at a time).
export function fireMuzzles(sim, enemy, type, tick, only = -1) {
  type.muzzles.forEach((muzzle, m) => {
    if (only >= 0 && m !== only) return;
    const barrage = sim.stage.barrages[muzzle.barrage];
    const base = BASES[barrage.group][barrage.base];
    const small = barrage.group === "single";
    // Thinning: a fan gives up lanes first (never below two, or the one it
    // had); what that does not cover is taken off the rhythm.
    const written = Math.floor(base.ways[0] + base.ways[1] * barrage.r);
    const mode = MODES[sim.mode];
    const density = (barrage.fire ? barrage.fire.density : 1) * mode.density;
    // (A small enemy's shot stays single: its density is all rhythm.)
    const ways = small ? written : Math.max(Math.min(written, 2), Math.round(written * density));
    const slower = (ways / written) / density;
    const speedUp = (small ? SMALL_FIRE.speed : barrage.fire ? barrage.fire.speed : 1) * mode.bulletSpeed;
    // A small enemy's quickest rhythm quickens with the mode's density too,
    // or a dense mode would stop being denser once the rank is high.
    const quickest = small && mode.density > 1 ? Math.round(base.every[2] / mode.density) : base.every[2];
    const every = Math.max(quickest, Math.round(((base.every[0] - base.every[1] * barrage.r) * slower) / (small ? SMALL_FIRE.rate : 1)));
    if (tick % every !== 0) return;
    if (base.beats && tick / every >= Math.floor(base.beats[0] + base.beats[1] * barrage.r)) return;
    const mirror = muzzle.mirror * barrage.mirror;
    // How far the whole fan is turned aside on this beat.
    const beat = tick / every;
    const run = base.beats ? Math.floor(base.beats[0] + base.beats[1] * barrage.r) : 1;
    const aside = (base.alt ? (beat % 2 === 1 ? base.alt : -base.alt) : 0) + (base.walk ? (beat - (run - 1) / 2) * base.walk : 0);
    for (let i = 0; i < ways; i++) {
      const lane = i - (ways - 1) / 2 + (base.weave && (tick / every) % 2 === 1 ? 0.5 : 0);
      if (base.gap && Math.abs(lane) < base.gap) continue;
      const centre = base.swing ? PI + sin(tick * base.swing[1]) * base.swing[0] * mirror : PI;
      const dir = base.aimed ? (lane * base.spread + aside) * mirror : base.down ? centre + (lane * base.spread + aside) * mirror : enemy.angles[m] + (i * PI * 2) / ways;
      let speed = base.speed + (base.step ?? 0) * i;
      if (base.scatter) speed += nextFloat(sim.rng, base.scatter);
      const flight = flightSpeed(sim, speed * BULLET.unitSpeed * barrage.speedRank * speedUp);
      const launch = (way) =>
        addBullet(sim, {
          x: enemy.x + muzzle.ox,
          y: enemy.y,
          dir: way,
          speed: flight,
          age: 0,
          owner: enemy.id,
          // The size of enemy it came from, kept for the record of a miss.
          from: enemy.kind,
          ox: muzzle.ox,
          aimed: base.aimed,
          shape: barrage.shape,
          // Splitting: which chain, how far along it, and when the next burst is.
          chain: barrage.chain,
          depth: 0,
          r: barrage.r,
          mirror,
          fuse: barrage.chain.length > 0 ? BULLET.armFrames + framesAt(Math.min(SPLITS[barrage.chain[0]].fuse, BULLET.splitWindow), flight) : -1,
        });
      launch(dir);
      // The mirror image, turning the other way.
      if (base.counter) launch(-dir);
    }
    if (!base.aimed && !base.down) enemy.angles[m] += base.turn * mirror;
    sim.events.push({ type: "fire", x: enemy.x + muzzle.ox, y: enemy.y });
  });
}

// A carrier whose fuse has run out bursts into its parts. Returns true when
// the carrier itself is used up.
export function splitBullet(sim, bullet) {
  const split = SPLITS[bullet.chain[bullet.depth]];
  const depth = bullet.depth + 1;
  const more = depth < bullet.chain.length;
  const heading = split.retarget ? atan2(sim.ship.x - bullet.x, sim.ship.y - bullet.y) : bullet.dir;
  for (const [offset, factor] of split.parts(bullet.r)) {
    const flight = flightSpeed(sim, bullet.speed * factor);
    addBullet(sim, {
      x: bullet.x,
      y: bullet.y,
      dir: heading + offset * bullet.mirror,
      speed: flight,
      age: bullet.age,
      owner: 0,
      from: bullet.from,
      ox: 0,
      aimed: false,
      shape: bullet.shape,
      chain: bullet.chain,
      depth,
      r: bullet.r,
      mirror: bullet.mirror,
      // No later than the window allows, and no sooner than the next frame.
      fuse: more ? Math.max(Math.min(bullet.age + framesAt(SPLITS[bullet.chain[depth]].fuse, flight), BULLET.armFrames + framesAt(BULLET.splitWindow, flight)), bullet.age + 1) : -1,
    });
  }
  sim.events.push({ type: "split", x: bullet.x, y: bullet.y });
  if (split.keep) {
    bullet.fuse = -1;
    return false;
  }
  return true;
}
