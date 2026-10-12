// Enemies: sections of streams of waves, movement, firing, and taking damage.

import { sin, PI } from "./math.js";
import { BOSS, FIELD, ENEMY, GROWTH, KINDS, RANK, SECTION, SHOT, SPAWN, THEMES, UNLOCK, unlocked } from "./constants.js";
import { spawnBoss, updateBossPart, bossPartDestroyed } from "./boss.js";
import { generateTypes, typesOfKind, fireMuzzles } from "./barrage.js";
import { contentRng, nextFloat, nextInt } from "./rng.js";
import { shipAbsent, shipInvincible, missShip } from "./player.js";
import { onScreen } from "./camera.js";
import { openFormation, joinFormation, closeFormation, closeFormations, formationKill, formationEscape, findFormation } from "./formation.js";
import { ADOPTED_PATTERNS, PATTERN_START } from "./constants.js";
import { settleFormation, patternStart, createFlight, advanceFlight, warped, flightMayFire, keepsOwnWidth, MIDDLE_FLIGHT_IDS, LARGE_FLIGHT_IDS } from "./flight.js";
import { scoreKill } from "./score.js";

// startSector: where the run starts (the first sector of a loop). The stage is
// set as if everything before it had been played.
export function createStage(startSector = 1) {
  const before = startSector - 1;
  return {
    // Sections played this run; shown to the player as the sector number.
    section: before - 1,
    sectionEnd: 0,
    spawnEnd: 0,
    streams: [],
    // This loop's cast: generated enemy types and the barrages they fire.
    rank: 0,
    types: [],
    barrages: [],
    // Whether this section's new flight pattern has been shown yet.
    debuted: false,
    // No new sections or spawns while set (checks use it to isolate a case).
    frozen: false,
    // A drill: one endless section of small formations of one pattern, for
    // looking at a pattern by itself. { pattern, count, middle }
    drill: null,
    // The id of the boss whose section this is, while it is here.
    boss: 0,
    // Sections so far that were not a boss's, less one: how far the flight
    // patterns have been dealt out.
    rollout: before - Math.floor(before / SECTION.perLoop) * Object.keys(BOSS.sections).length - 1,
    // The lane (x) of the formation that arrived last, for placing islands.
    lane: null,
    // The character of this section, if it has one (constants.js, THEMES).
    theme: "",
  };
}

// What a sector holds is fixed (sim.js, createSim): these are the pieces, each
// drawn from a generator of its own.
const CONTENT = Object.freeze({ cast: 1, mix: 2, boss: 3, stream: 4, themes: 5 });

const loopOf = (section) => Math.floor(section / SECTION.perLoop);
// A section's place among those of its loop that are not a boss's: 0 to 7.
function placeInLoop(section) {
  const at = section % SECTION.perLoop;
  let bosses = 0;
  for (const key of Object.keys(BOSS.sections)) if (Number(key) < at) bosses++;
  return at - bosses;
}

// How many flight patterns are in play in a section, and whether the section
// is the one that brings the newest of them.
export function patternsKnown(section) {
  const loop = loopOf(section);
  const place = placeInLoop(section);
  if (loop === 0) {
    const known = Math.min(PATTERN_START + place, UNLOCK.patterns.first, ADOPTED_PATTERNS.length);
    return { known, debut: place > 0 && PATTERN_START + place <= UNLOCK.patterns.first };
  }
  const before = UNLOCK.patterns.first + UNLOCK.patterns.perLoop * (loop - 1);
  const known = Math.min(before + Math.min(place + 1, UNLOCK.patterns.perLoop), ADOPTED_PATTERNS.length);
  return { known, debut: place < UNLOCK.patterns.perLoop && before + place < ADOPTED_PATTERNS.length };
}

// Which of a loop's sections have a character of their own: { place: kind }.
function themesOfLoop(sim, loop) {
  const out = {};
  if (loop === 0) return out;
  fixed(sim, CONTENT.themes, loop, () => {
    const kinds = Object.keys(THEMES.kinds);
    const places = [1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < THEMES.perLoop; i++) out[places.splice(nextInt(sim.rng, places.length), 1)[0]] = kinds.splice(nextInt(sim.rng, kinds.length), 1)[0];
  });
  return out;
}

// Runs fn with the sim's generator swapped for one of fixed content.
function fixed(sim, tag, n, fn) {
  const run = sim.rng;
  sim.rng = contentRng(sim.course, tag, n);
  try {
    return fn();
  } finally {
    sim.rng = run;
  }
}

function newStream(kind, startFrame) {
  return { kind, nextSpawn: startFrame + SPAWN.kinds[kind].firstDelay, waves: 0, phrase: null, left: 0, interval: 0, gap: 0, side: 1, x: 0, alternate: false, type: -1, formation: 0 };
}

// Which mix of streams a section runs: the first is the lightest, and the
// choice drifts toward the heavy end as the loop goes on.
function pickMix(sim, index) {
  if (index === 0) return 0;
  const low = Math.floor((index * 3) / 7) + 1;
  const high = 3 + Math.floor((index * 3) / 10);
  return low + nextInt(sim.rng, high - low + 1);
}

function startSection(sim) {
  const stage = sim.stage;
  stage.section++;
  stage.debuted = false;
  // A new loop brings a new cast at a higher rank.
  const loop = Math.floor(stage.section / SECTION.perLoop);
  if (stage.section % SECTION.perLoop === 0) fixed(sim, CONTENT.cast, loop, () => generateTypes(sim, RANK.base + RANK.perLoop * loop));
  const bossKind = stage.drill ? null : BOSS.sections[stage.section % SECTION.perLoop];
  if (bossKind) {
    // A boss's section: nothing else arrives, and it lasts until the boss is
    // destroyed or gives up.
    stage.theme = "";
    stage.streams = [];
    stage.spawnEnd = sim.frame;
    stage.sectionEnd = 1e9;
    sim.events.push({ type: "section", number: stage.section + 1, theme: "" });
    stage.boss = fixed(sim, CONTENT.boss, stage.section, () => spawnBoss(sim, bossKind));
    return;
  }
  stage.rollout++;
  stage.theme = stage.drill ? "" : (themesOfLoop(sim, loop)[placeInLoop(stage.section)] ?? "");
  if (stage.theme === "islands") sim.ground.nextIn = Math.min(sim.ground.nextIn, THEMES.kinds.islands.gap[0]);
  const usual = SECTION.mixes[fixed(sim, CONTENT.mix, stage.section, () => pickMix(sim, stage.section % SECTION.perLoop))];
  const mix = stage.drill ? [1, stage.drill.middle ? 1 : 0, stage.drill.large ? 1 : 0] : ((stage.theme ? THEMES.kinds[stage.theme].mix : null) ?? usual);
  stage.streams = [];
  // Far into a run, one more stream of formations than the section calls for.
  const grown = stage.drill ? 0 : Math.max(0, loop - GROWTH.from + 1);
  // (Not on top of a swarm, which is three streams of them already.)
  const counts = [mix[0] + (grown > GROWTH.streamAfter && mix[0] > 0 && stage.theme !== "swarm" ? 1 : 0), mix[1], mix[2]];
  SPAWN.order.forEach((kind, i) => {
    for (let n = 0; n < counts[i]; n++) {
      const stream = newStream(kind, sim.frame + n * 40);
      // What this stream sends, wave after wave, is the sector's: which type,
      // which way of flying. Where and how many is the run's.
      stream.rng = contentRng(sim.course, CONTENT.stream, stage.section * 16 + stage.streams.length);
      stage.streams.push(stream);
    }
  });
  stage.spawnEnd = sim.frame + (stage.drill ? 1e9 : SECTION.spawnFrames);
  stage.sectionEnd = stage.spawnEnd + SECTION.lullFrames;
  sim.events.push({ type: "section", number: stage.section + 1, theme: stage.theme });
}

function planWave(sim, stream, def) {
  // How many, how close together and how long until the next is the
  // sector's, like what flies (author's decision, 2026-10-11): the third
  // formation of a stream is the same size every time the sector is played.
  // A stream of formations sends its sizes in a set order, round and round.
  if (def.phrases && !stream.phrase) stream.phrase = def.phrases[nextInt(stream.rng, def.phrases.length)];
  const g = def.groups[stream.phrase ? stream.phrase[stream.waves % stream.phrase.length] : nextInt(stream.rng, def.groups.length)];
  stream.left = g[0] + nextInt(stream.rng, g[1]);
  stream.interval = g[2] + nextInt(stream.rng, g[3]);
  stream.gap = g[4] + nextInt(stream.rng, g[5]);
  stream.alternate = nextInt(sim.rng, 2) === 0;
  stream.side = nextInt(sim.rng, 2) * 2 - 1;
  stream.x = nextFloat(sim.rng);
  const types = typesOfKind(sim, stream.kind);
  stream.type = types[nextInt(stream.rng, types.length)];
  stream.formation = 0;
  stream.slot = 0;
  // A wave of middle enemies shares one way of flying.
  if (stream.kind === "middle") stream.flight = sim.stage.drill?.middleFlight || MIDDLE_FLIGHT_IDS[nextInt(stream.rng, unlocked("middleFlights", loopOf(sim.stage.section), MIDDLE_FLIGHT_IDS.length))];
  // And so does a wave of large ones.
  if (stream.kind === "large") stream.flight = sim.stage.drill?.largeFlight || LARGE_FLIGHT_IDS[nextInt(stream.rng, unlocked("largeFlights", loopOf(sim.stage.section), LARGE_FLIGHT_IDS.length))];
  if (def.formation) {
    const drill = sim.stage.drill;
    // Far into a run the formations are bigger.
    if (!drill) stream.left += Math.min(Math.max(0, loopOf(sim.stage.section) - GROWTH.from + 1), GROWTH.maxExtra);
    if (!drill && THEMES.kinds[sim.stage.theme]?.count) stream.left = Math.round(stream.left * THEMES.kinds[sim.stage.theme].count);
    if (drill && drill.count) stream.left = drill.count;
    const pattern = drill ? drill.pattern : pickPattern(sim, stream);
    const formation = openFormation(sim, { pattern, anchor: (stream.x * 0.6 + 0.2) * FIELD.halfW * stream.side * SPAWN.xRange, side: stream.side, planned: stream.left });
    // A section may change how its formations fly (flight.js, advanceFlight).
    const theme = drill ? null : THEMES.kinds[sim.stage.theme];
    if (theme && (theme.pace || theme.tall || theme.wide)) formation.warp = { pace: theme.pace ?? 1, tall: theme.tall ?? 1, wide: keepsOwnWidth(pattern) ? [] : [...(theme.wide ?? [])] };
    settleFormation(formation);
    stream.formation = formation.id;
    sim.stage.lane = formation.anchor;
  }
  stream.waves++;
}

// Which pattern a new formation flies: any of those introduced so far, except
// that the first formation of a section that introduces one flies that one.
function pickPattern(sim, stream) {
  const stage = sim.stage;
  const { known, debut } = patternsKnown(stage.section);
  const picked = nextInt(stream.rng, known);
  if (debut && !stage.debuted) {
    stage.debuted = true;
    return ADOPTED_PATTERNS[known - 1];
  }
  return ADOPTED_PATTERNS[picked];
}

function spawnEnemy(sim, stream) {
  if (sim.enemies.length >= ENEMY.max) return;
  const kind = KINDS[stream.kind];
  const side = stream.alternate && stream.left % 2 === 0 ? -stream.side : stream.side;
  const formation = stream.formation ? findFormation(sim, stream.formation) : null;
  const baseX = (stream.x * 0.6 + 0.2) * FIELD.halfW * side * SPAWN.xRange;
  // A middle or a large enemy flies by its own plan. The ones of a wave are
  // set 7 apart, so that two that stop do not stop on the same spot.
  let plan = null;
  if (!formation && stream.flight) {
    const shift = (stream.slot % 3) * 7 * (baseX > 0 ? -1 : 1);
    plan = { pattern: stream.flight, anchor: Math.max(-10, Math.min(10, baseX + shift)), side: stream.side, planned: 1, turn: 0, picks: {} };
    settleFormation(plan);
  }
  const guide = formation ?? plan;
  const slot = guide ? stream.slot++ : 0;
  const [px, py] = guide ? patternStart(guide, slot) : [baseX, ENEMY.spawnY];
  const [x, y] = guide ? warped(guide, px, py) : [px, py];
  sim.enemies.push({
    id: sim.nextId++,
    kind: stream.kind,
    x,
    y,
    // Place in the formation, in order of arrival, and where it is on its path.
    slot,
    flight: guide ? createFlight(px, py) : null,
    plan,
    hp: kind.hp,
    age: 0,
    phase: nextFloat(sim.rng, PI * 2),
    // The formation this enemy belongs to, or 0.
    formation: stream.formation,
    // Index into this loop's types; an enemy with no type never fires.
    type: stream.type,
    fireIn: kind.firstFireDelay,
    burst: 0,
    // One turning angle per muzzle, for patterns that rotate.
    angles: sim.stage.types[stream.type].muzzles.map(() => nextFloat(sim.rng, PI * 2)),
  });
  if (stream.formation) joinFormation(sim, stream.formation);
}

export function updateStage(sim) {
  const stage = sim.stage;
  if (stage.frozen) return;
  if (stage.boss && !sim.enemies.some((e) => e.id === stage.boss)) {
    stage.boss = 0;
    stage.sectionEnd = sim.frame + BOSS.afterFrames;
  }
  if (sim.frame >= stage.sectionEnd) startSection(sim);
  if (sim.frame >= stage.spawnEnd) {
    // A wave cut short by the end of the section is complete as it stands.
    closeFormations(sim);
    return;
  }
  for (const stream of stage.streams) {
    const def = SPAWN.kinds[stream.kind];
    if (def.rush && stream.waves > 0 && stream.left === 0 && stream.nextSpawn > sim.frame + 1) {
      if (!sim.enemies.some((e) => e.kind === stream.kind)) stream.nextSpawn = sim.frame + 1;
    }
    if (sim.frame < stream.nextSpawn) continue;
    if (stream.left === 0) planWave(sim, stream, def);
    spawnEnemy(sim, stream);
    stream.left--;
    if (stream.left === 0 && stream.formation) closeFormation(sim, stream.formation);
    stream.nextSpawn = sim.frame + (stream.left > 0 ? stream.interval : stream.gap);
  }
}

export function updateEnemies(sim) {
  const kept = [];
  for (const enemy of sim.enemies) {
    const kind = KINDS[enemy.kind];
    enemy.age++;
    if (enemy.boss || enemy.parent) {
      if (updateBossPart(sim, enemy)) kept.push(enemy);
      continue;
    }
    const guide = enemy.flight ? (enemy.plan ?? findFormation(sim, enemy.formation)) : null;
    if (guide) {
      advanceFlight(sim, enemy, guide);
    } else {
      enemy.y -= kind.fallSpeed;
      enemy.x += sin(enemy.age * kind.swayRate + enemy.phase) * kind.swayAmp;
    }
    if (enemy.y < -FIELD.halfH || enemy.y > FIELD.halfH + 1 || Math.abs(enemy.x) > FIELD.halfW) {
      if (enemy.formation && sim.phase === "play") formationEscape(sim, enemy);
      continue;
    }
    // Off-screen enemies hold their fire (and their firing clock).
    if (enemy.y > ENEMY.ceaseFireY && !shipAbsent(sim.ship) && onScreen(sim, enemy.x) && (!guide || flightMayFire(enemy, guide))) fire(sim, enemy);
    kept.push(enemy);
  }
  sim.enemies = kept;
}

// Bursts: fire for the type's period, rest until its interval is up.
function fire(sim, enemy) {
  const type = sim.stage.types[enemy.type];
  if (!type) return;
  enemy.fireIn--;
  if (enemy.fireIn <= 0) {
    enemy.burst = type.period;
    enemy.fireIn = type.interval;
  }
  if (enemy.burst <= 0) return;
  fireMuzzles(sim, enemy, type, type.period - enemy.burst);
  enemy.burst--;
}

// Whether a shot, over the distance it has just flown, reached a box of the
// given half height centred at y. A shot covers a whole unit a frame, and the
// smallest things it can hit are less than a unit tall: looked at only where
// it ends up, a shot steps clean over a thing that stands at the wrong height
// (and so does every shot after it, if neither the ship nor the thing moves).
export const shotReached = (shot, y, halfH) => y > shot.y - shot.vy - halfH && y < shot.y + halfH;

export function hitEnemiesWithShots(sim) {
  const shots = [];
  for (const shot of sim.shots) {
    // Of everything in its path this frame, the first it comes to (the lowest).
    let struck = null;
    for (const enemy of sim.enemies) {
      if (enemy.hp <= 0 || enemy.entering) continue;
      const kind = KINDS[enemy.kind];
      if (Math.abs(shot.x - enemy.x) < kind.halfW + SHOT.halfW + SHOT.hitExtraW && shotReached(shot, enemy.y, kind.halfH) && (struck === null || enemy.y < struck.y)) struck = enemy;
    }
    if (struck) {
      sim.events.push({ type: "hit", x: shot.x, y: Math.min(shot.y, struck.y), target: struck.id });
      damageEnemy(sim, struck, SHOT.damage);
    } else shots.push(shot);
  }
  sim.shots = shots;
  removeDestroyed(sim);
}

// dist: for a laser, the distance it was let go at (score.js).
export function damageEnemy(sim, enemy, damage, dist = null) {
  if (enemy.hp <= 0) return;
  // A boss's body behind its wings takes only a share.
  enemy.hp -= enemy.boss && enemy.boss.wings > 0 ? damage * BOSS.guard : damage;
  if (enemy.hp > 0) return;
  const kind = KINDS[enemy.kind];
  const [score, mult] = scoreKill(sim, kind.score, enemy.x, enemy.y, dist, kind);
  sim.events.push({ type: "destroy", x: enemy.x, y: enemy.y, kind: enemy.kind, score, mult });
  if (enemy.formation) formationKill(sim, enemy);
  if (enemy.boss || enemy.parent) bossPartDestroyed(sim, enemy, score, mult);
}

// Running into an enemy's hull costs a ship. The enemy is unharmed.
export function ramShip(sim) {
  const ship = sim.ship;
  if (shipInvincible(ship)) return;
  for (const enemy of sim.enemies) {
    const kind = KINDS[enemy.kind];
    if (Math.abs(ship.x - enemy.x) < kind.bodyW && Math.abs(ship.y - enemy.y) < kind.bodyH) {
      missShip(sim, "ram", enemy.id, enemy.flight ? enemy.flight.since : enemy.age, enemy.kind);
      return;
    }
  }
}

export function removeDestroyed(sim) {
  sim.enemies = sim.enemies.filter((e) => e.hp > 0);
}
