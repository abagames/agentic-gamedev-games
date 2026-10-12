// Tunable numbers of the game, in field units and frames. Starting values come
// from reference/mechanics.md (the original, lock mode); values marked
// "assumption" are ours and wait for a play report.

// The field is wider than the screen: the view scrolls sideways with the ship.
export const FIELD = Object.freeze({ halfW: 14, halfH: 16 });

// What the screen shows of the field, and how the view follows the ship. With
// the ship against a side wall the view rests against that wall too.
export const VIEW = Object.freeze({ halfW: 11, ease: 0.2 });

export const SHIP = Object.freeze({
  startX: 0,
  startY: -8,
  // The ship's speed is the mode's (MODES); this is the original's base value,
  // kept for reference.
  speed: 0.6,
  diagonal: 0.707,
  margin: 1.5,
  hitRadiusSq: 0.2,
  respawnFrames: 300,
  absentFrames: 72,
  // Bullets that finish arming this early in a respawn are removed.
  bulletShieldFrames: 186,
  startLives: 2,
  maxLives: 4,
});

// One wide shot, as wide as the ship and drawn as a twin shot from its wing
// tips. Few on screen at once: a far target is hit slowly, because the next
// shot waits for one to land or leave, and a near one as fast as the interval
// allows. (The original fires narrow shots every frame, 32 at once.)
export const SHOT = Object.freeze({
  speed: 1,
  max: 4,
  // Frames from one shot to the next.
  interval: 3,
  // From the shot's centre to each of the two bars it is drawn as.
  halfW: 0.5,
  edgeMargin: 1,
  damage: 1,
  // Added to the shot's own width when it is tested against an enemy.
  hitExtraW: 0.7,
});

export const ENEMY = Object.freeze({
  max: 32,
  spawnY: 15.5,
  // Enemies this low stop firing.
  ceaseFireY: -4,
});

// Enemy kinds: what stays the same about each size of enemy. How one fires is
// decided per run by the generated enemy types (barrage.js).
// halfW/halfH is the box shots hit; bodyW/bodyH is the smaller box that costs a
// ship on contact (assumption: the drawn hull without the wing tips).
export const KINDS = Object.freeze({
  // Dies to one shot and drifts down while swaying.
  small: Object.freeze({
    hp: 1,
    score: 100,
    halfW: 1.2,
    halfH: 0.45,
    bodyW: 0.6,
    bodyH: 0.45,
    lockable: false,
    fallSpeed: 0.22, // assumption
    swayAmp: 0.09, // assumption
    swayRate: 0.07, // assumption
    firstFireDelay: 30,
    wings: Object.freeze([]),
  }),
  // The common mid-sized target: soft enough to shoot down in a second or
  // two, lightly armed, and it flies (flight.js, MIDDLE_FLIGHTS). The original's
  // middle enemy has 32 hit points and a body barrage as well as wing guns.
  middle: Object.freeze({
    hp: 16,
    score: 500,
    halfW: 2.0,
    halfH: 0.7,
    bodyW: 0.75,
    bodyH: 0.55,
    lockable: true,
    fallSpeed: 0.05,
    swayAmp: 0,
    swayRate: 0,
    firstFireDelay: 50,
    wings: Object.freeze([1.5]),
  }),
  // The heavy one: an inner and an outer pair of wing guns.
  large: Object.freeze({
    hp: 48,
    score: 1000,
    halfW: 3.0,
    halfH: 0.9,
    bodyW: 1.25,
    bodyH: 0.55,
    lockable: true,
    fallSpeed: 0.04,
    swayAmp: 0,
    swayRate: 0,
    firstFireDelay: 60,
    wings: Object.freeze([1.5, 2.7]),
  }),
  // Bosses (boss.js). The body is one enemy; each wing is another that rides
  // on it, with its own hit points and its own gun. Hit points are our own:
  // the original's (300 to 449, wings 150 to 249) are for a much stronger shot.
  midboss: Object.freeze({
    hp: 240,
    score: 3000,
    halfW: 2.2,
    halfH: 1.0,
    bodyW: 1.8,
    bodyH: 0.8,
    lockable: true,
    fallSpeed: 0,
    swayAmp: 0,
    swayRate: 0,
    firstFireDelay: 30,
    wings: Object.freeze([3.6]),
  }),
  bigboss: Object.freeze({
    hp: 350,
    score: 5000,
    halfW: 2.6,
    halfH: 1.2,
    bodyW: 2.2,
    bodyH: 1.0,
    lockable: true,
    fallSpeed: 0,
    swayAmp: 0,
    swayRate: 0,
    firstFireDelay: 30,
    wings: Object.freeze([4.0, 6.6]),
  }),
  wing: Object.freeze({
    hp: 60,
    score: 500,
    halfW: 1.2,
    halfH: 0.8,
    bodyW: 1.0,
    bodyH: 0.6,
    lockable: true,
    fallSpeed: 0,
    swayAmp: 0,
    swayRate: 0,
    firstFireDelay: 60,
    wings: Object.freeze([]),
  }),
});

// Bosses: which sections of a loop are a boss's, and how one behaves.
// Following the original: it comes in over enterFrames and cannot be hit
// until it has; it tours a few points near the top; its body cycles through
// several barrages; a wing shot off stops that wing's gun and the body's fire
// for stunFrames; after leaveAfter frames (its kind's) it gives up and goes
// up off the top (no score), and says so warnFrames beforehand;
// destroyed, it takes every bullet with it and the section ends afterFrames
// later. assumption: no islands set out while a boss is here.
export const BOSS = Object.freeze({
  sections: Object.freeze({ 4: "midboss", 9: "bigboss" }),
  enterFrames: 90,
  enterY: 20,
  homeY: 11.5,
  tourX: 6,
  tourY: Object.freeze([8.5, 12]),
  speed: Object.freeze([0.03, 0.02]),
  // The ways a boss moves, in the order they arrive (UNLOCK.bossMoves):
  //   tour   round its points, as the original does
  //   chase  it keeps over the ship, slowly, never further out than tourX,
  //          rising and sinking between the tour's heights as it goes
  //   swoop  round its points, one of which is low on the screen (swoopY);
  //          it goes down to that one and back up at swoopSpeed times its pace
  moves: Object.freeze(["tour", "chase", "swoop"]),
  chaseSpeed: 0.045,
  swoopY: 4.5,
  swoopSpeed: 2.5,
  patterns: Object.freeze({ midboss: [2, 2], bigboss: [2, 3] }),
  interval: Object.freeze({ midboss: [200, 40], bigboss: [220, 60] }),
  // While a boss has a wing left, its wings shield its body: what hits the
  // body does only this share of its damage (author's decision, 2026-10-11).
  guard: 0.34,
  stunFrames: 70,
  kick: 0.6,
  // 15 seconds for the middle boss, 24 for the large one (author's values,
  // 2026-10-11; both were 30).
  leaveAfter: Object.freeze({ midboss: 900, bigboss: 1440 }),
  // assumption: how long before it goes the warning starts.
  warnFrames: 180,
  leaveSpeed: 0.12,
  afterFrames: 90,
});

// Difficulty of a run. Rank is fixed by progress: it rises once per loop of
// sections and feeds bullet count, bullet speed and how many times a bullet
// splits (assumption: one difficulty, starting gentler than the original's
// CLOSE, which begins at 10 and adds 8). perLoop was 6 until 2026-10-11: the
// author asked for the climb to be about half as steep.
export const RANK = Object.freeze({ base: 6, perLoop: 3 });

// How a rank becomes a bullet-speed multiplier: base + perRoot * sqrt(rank the
// enemy fires with), never under 1 nor over max, and varied by +-spread from
// one barrage to the next. Chosen, when a loop added 6 to the rank, to keep the first loop's speeds and the
// speeds of the tenth, with an even climb between (the original's formula,
// which this replaces, took small enemies from 1.13 to 1.72 in one loop).
export const SPEED_RANK = Object.freeze({ base: 0.62, perRoot: 0.215, max: 2.1, spread: 0.05 });

// Enemy types generated per loop, by kind.
export const TYPE_COUNTS = Object.freeze({ small: 3, middle: 4, large: 2 });

export const LOCK = Object.freeze({
  max: 4,
  interval: 10,
  rangeX: 2.5,
  damage: 7,
  // assumption: lasers released together hit harder, +50% each per extra
  // laser, so charging a full volley is worth the wait.
  volleyBonus: 0.5,
  hitRadius: 1.0,
  launchSpread: 0.5,
  launchBack: 0.8,
  accel: 0.07,
  maxSpeed: 1.8,
});

// The three ways the game can be played (author's decision, 2026-10-10).
// Each is named on screen after how it scores: CLOSE (id normal), CHAIN (id
// rapid), GRAZE (id dense). The ids are the older names and are what is
// stored, so a best score or a replay made before the renaming still counts. They
// share the sectors and everything in them; what differs is the enemy
// bullets and the ship that has to get through them:
//   bulletSpeed  multiplies every enemy bullet's speed (and the speed floor)
//   density      multiplies bullets per second (lanes of a fan first, then
//                the rhythm; a small enemy's single shots by rate alone)
//   shipSpeed    field units a frame. Fast bullets want a fast ship; slow,
//                dense ones want a ship that can stop in a gap.
// The original scales its ship the same way: 0.42 to 0.72 by difficulty.
export const MODES = Object.freeze({
  normal: Object.freeze({ name: "CLOSE", bulletSpeed: 1, density: 1, shipSpeed: 0.4, scoring: "close", extend: 500000 }),
  rapid: Object.freeze({ name: "CHAIN", bulletSpeed: 1.4, density: 0.5, shipSpeed: 0.52, scoring: "chain", extend: 800000 }),
  dense: Object.freeze({ name: "GRAZE", bulletSpeed: 0.65, density: 1.7, shipSpeed: 0.34, scoring: "graze", extend: 300000 }),
});

// The score multiplier (author's decision, 2026-10-10). Everything destroyed
// pays its points times a multiplier of 1 to RATE.max; how the multiplier is
// earned is the mode's (MODES[].scoring), so that each mode pays for the way
// it is played:
//   chain  +1 for every formation wiped out (and a boss taken apart wing by
//          wing); back to 1 when one of a formation gets away or a ship is lost
//   close  set at each kill by how near the ship is to what it destroys,
//          measured to the edge of its hit box so that big things are not
//          further away for being big: RATE.max within `near`, 1 from `far`
//          on, rising with the square of how far in the ship has come.
//          Nothing above topY pays more than 1, so sitting where the enemies come in earns nothing.
//          A laser's kill counts the distance at which it was let go.
//   graze  +gain for every enemy bullet that passes within `radius` of the
//          ship; after `idle` frames without one it sinks by `decay` a frame.
//          A ship lost: back to 1.
// extend: an extra ship every this many points, per mode (author's values,
// 2026-10-11).
export const RATE = Object.freeze({
  max: 16,
  // far: about half the height of the screen (author's instruction).
  // ground: the most a thing on the ground pays, however near. The ground
  // comes to the ship and does not fight back, so being near it is no risk;
  // the high multipliers are kept for what is.
  close: Object.freeze({ near: 3, far: 16, topY: 13.5, ground: 6 }),
  // radius: generous on purpose (author's instruction); the ship is hit at 0.45.
  graze: Object.freeze({ radius: 2, gain: 1, idle: 60, decay: 1 / 50 }),
});
export const MODE_IDS = Object.freeze(Object.keys(MODES));
// A run may start at the first sector of any loop.
export const startSectorOk = (sector) => Number.isInteger(sector) && sector >= 1 && (sector - 1) % 10 === 0;

// How hard a small enemy's fire is. Its barrage is always one bullet at a
// time, so these two are where its difficulty is set (author's instruction,
// 2026-10-10): how often it fires and how fast its bullets fly, as factors on
// what its rank gives it.
export const SMALL_FIRE = Object.freeze({ rate: 1.3, speed: 1.15 });

// The same for the bigger enemies (author's instruction, 2026-10-10): their
// bullets fly faster than the shapes are written, and there are fewer of them,
// so that they sit with the small enemies' fast single bullets and do not
// hang about the screen. speed multiplies bullet speed; density multiplies
// bullets per second (fans lose lanes first, the rest comes off the rhythm).
export const MIDDLE_FIRE = Object.freeze({ speed: 1.2, density: 0.67 });
export const LARGE_FIRE = Object.freeze({ speed: 1.25, density: 0.75 });
export const BOSS_FIRE = Object.freeze({ speed: 1.5, density: 0.5 });

export const BULLET = Object.freeze({
  max: 512,
  // Field units per frame for a pattern speed of 1 at speed rank 1: the
  // original's 0.161, times a factor of our own. The author found the
  // original's speed too slow for this game (play report, 2026-10-10).
  unitSpeed: 0.161 * 1.6,
  // No bullet flies slower than this many unit speeds, whatever its shape or
  // split says: a slow bullet stays on screen and closes off the field
  // (author's instruction, 2026-10-10). At the floor a bullet crosses the
  // whole field top to bottom in about two and a half seconds.
  minSpeed: 0.85,
  edgeMargin: 0.5,
  // assumption: a bullet first shows for this long as a harmless seed riding
  // on the enemy that fires it, then launches from wherever that enemy is.
  // (The original's bullets drift free while they form, for about 41 frames.)
  armFrames: 24,
  // Frames after launching within which a bullet has finished bursting into
  // its final parts (give or take a frame per burst), for a bullet flying at
  // splitSpeed unit speeds. A fuse is a distance, written as the frames it
  // takes at that speed: a faster bullet bursts sooner and a slower one
  // later, so that a barrage takes its shape as far from its enemy whatever
  // the rank and the mode (author's decision, 2026-10-12). splitSpeed is
  // about what a bullet did in CLOSE where bursting first appears.
  splitWindow: 16,
  splitSpeed: 1.8,
});

// Flight patterns a formation in the game may be given (flight.js has them
// all; docs/flight-eval.md has why each is in or out). "stairs" was rejected
// and is left to the drill. The order is the order they are introduced in: a
// run starts with the first PATTERN_START of them and each new section brings
// the next, which the section's first formation always flies.
export const ADOPTED_PATTERNS = Object.freeze([
  "column", "diagonal", "hover", "hook", "dive", "hairpin", "sweep", "wave", "zigzag",
  // From the second loop on, three a loop:
  "cross", "loop", "pincer",
  "duck", "split", "stagger",
  "ladder", "swoop", "orbit",
  "lace", "bounce", "curl",
]);
export const PATTERN_START = 2;

// What there is to meet grows loop by loop, so that every loop up to the
// sixth or so brings something not seen before (author's instruction,
// 2026-10-10). For each kind of thing: how many of its list are in play in
// the first loop, and how many more each later loop adds. The lists are in
// the order they arrive in.
//   patterns  flight patterns of small formations: the first loop deals its
//             own out one section at a time (PATTERN_START, then one more per
//             section that is not a boss's); later loops add `perLoop`, one in
//             each of their first sections
//   bossMoves ways a boss moves (boss.js)
export const UNLOCK = Object.freeze({
  patterns: Object.freeze({ first: 9, perLoop: 3 }),
  middleFlights: Object.freeze({ first: 4, perLoop: 1 }),
  largeFlights: Object.freeze({ first: 4, perLoop: 1 }),
  middleBases: Object.freeze({ first: 9, perLoop: 1 }),
  largeBases: Object.freeze({ first: 10, perLoop: 1 }),
  bossBases: Object.freeze({ first: 5, perLoop: 2 }),
  bossMoves: Object.freeze({ first: 1, perLoop: 1 }),
});
// How many of a list of `total` are in play in the given loop (0-based).
export const unlocked = (what, loop, total) => Math.min(total, UNLOCK[what].first + UNLOCK[what].perLoop * loop);

// Past the loops that bring new things, the game goes on growing: from the
// loop numbered `from` (0-based) every loop adds one to the size of every
// formation, up to `maxExtra`; and from `streamAfter` loops past that, a
// further stream of formations runs alongside the section's own.
export const GROWTH = Object.freeze({ from: 5, maxExtra: 4, streamAfter: 2 });

// Sections with a character of their own, from the second loop on: `perLoop`
// of a loop's sections (never its first, never a boss's) are one of these,
// no two of a loop the same.
//   swarm   nothing but formations, three streams of them
//   heavy   nothing but middle and large enemies
//   islands the usual mix over ground that comes thick and fast
// And four that change how the formations of small enemies fly, after Star
// Force (author's instruction, 2026-10-11). Their bullets are not changed.
//   slow    pace: they fly at this many times their speed, and so gather;
//           count: and there are this many times as many to a formation
//   fast    pace, the other way: less time to take each (the stretches where
//           a formation stands still are not shortened, so 1.6 takes about
//           a fifth off the time it is on the field)
//   long    tall: their paths are drawn out downward by this factor, from
//           where they come in; turns that were high come low
//   wide    wide: their paths are drawn out sideways about the middle of the
//           field by this factor (easing to nothing at the walls). One such
//           stretch cannot go past 2, and at 2 moves a formation two units
//           on average; so there are two, one after the other: a formation
//           takes up nearly twice the width, and is off the sides of the
//           screen about a fifth of the time
export const THEMES = Object.freeze({
  perLoop: 3,
  kinds: Object.freeze({
    swarm: Object.freeze({ name: "SWARM", mix: Object.freeze([3, 0, 0]) }),
    heavy: Object.freeze({ name: "HEAVY", mix: Object.freeze([0, 2, 1]) }),
    islands: Object.freeze({ name: "ISLANDS", mix: null, gap: Object.freeze([4, 4]) }),
    slow: Object.freeze({ name: "SLOW", mix: null, pace: 0.6, count: 1.5 }),
    fast: Object.freeze({ name: "FAST", mix: null, pace: 1.6 }),
    long: Object.freeze({ name: "LONG", mix: null, tall: 1.35 }),
    wide: Object.freeze({ name: "WIDE", mix: null, wide: Object.freeze([2, 1.5]) }),
  }),
});

// The ground (ground.js). Lengths are field units; an island's cells are
// `cell` across. Almost every target is a panel that one shot destroys; a core
// is the exception and sits on about one island in four of those large enough.
// (All of it assumption: the original has no ground.)
// The ground (ground.js): plated ground that drifts down under the fight, with
// things on it to shoot. After Star Force: more comes by than can be taken,
// some of it is worth far more than the rest, some of it is in the way, and
// letting any of it go costs nothing. It pays points and nothing else: no
// chain, no hold. So it can be laid out any way at all.
export const GROUND = Object.freeze({
  speed: 0.07,
  cell: 2,
  // The ground is laid on a grid this many cells across (the whole field,
  // less a margin).
  cols: 13,
  // Drift before the first piece of ground.
  firstIn: 6,
  // Drift between one piece's tail and the next: mostly `gap`, sometimes
  // `close` on its heels, sometimes a `long` stretch of nothing. Each is
  // [least, spread]; `rhythm` is how often each comes, out of the sum.
  gap: Object.freeze([7, 8]),
  close: Object.freeze([2, 3]),
  long: Object.freeze([22, 12]),
  rhythm: Object.freeze({ gap: 6, close: 3, long: 2 }),
  // half: half the side of the square a shot has to reach.
  kinds: Object.freeze({
    // The common target: one shot.
    // There is a lot of it, so each is worth little (author's instruction).
    panel: Object.freeze({ hp: 1, score: 50, half: 0.7 }),
    // The valuable one. They come in groups; taking the whole group pays
    // `set` on top.
    bonus: Object.freeze({ hp: 1, score: 300, half: 0.7 }),
    // A wall block: a few shots each, next to nothing in points, in a row.
    // Shots stop on it, so what is beyond it has to be reached from the
    // side, or with lasers.
    wall: Object.freeze({ hp: 4, score: 20, half: 0.95 }),
    // Not to be seen until a shot crosses it; then a target like the others,
    // worth what a bonus target is.
    hidden: Object.freeze({ hp: 1, score: 300, half: 0.7 }),
    // Several shots, or one laser; it takes everything on the ground within
    // coreRadius with it.
    core: Object.freeze({ hp: 6, score: 300, half: 0.9 }),
  }),
  set: 1500,
  coreRadius: 5,
  // The ways a piece of ground is laid out, and how often each comes (out of
  // the sum). Which comes when is fixed by the sector.
  layouts: Object.freeze({ row: 4, field: 3, twin: 2, strip: 2, scatter: 3, diagonal: 2, chevron: 2, column: 2, checker: 2, wall: 3, bonusRow: 2, bonusEnds: 2, bonusSquare: 1, core: 2 }),
  // Frames a hidden target takes to come up once a shot has shown it. Until
  // it is up nothing can destroy it: shots pass over it (author's instruction,
  // 2026-10-11).
  rise: 30,
  // How often a piece has a hidden target on it, out of `hiddenOf`.
  hidden: 3,
  hiddenOf: 10,
  // No ground in a drill: a drill is for looking at one flight pattern.
  on: (sim) => !sim.drill,
});



// A formation is one wave of small enemies. Destroying all of it pays a bonus
// that grows with every formation wiped out in a row (assumption).
export const FORMATION = Object.freeze({ bonus: 500, maxChain: 16 });

export const GAMEOVER = Object.freeze({ lockFrames: 60 });

// A run is a sequence of sections (shown as "sectors"): enemies arrive for a while,
// then a short lull. Each section runs a few streams of waves side by side.
export const SECTION = Object.freeze({
  spawnFrames: 600,
  lullFrames: 60,
  perLoop: 10,
  // Streams per section as [small, middle, large]; later sections draw from
  // further down the list.
  mixes: Object.freeze([
    Object.freeze([1, 0, 0]),
    Object.freeze([1, 1, 0]),
    Object.freeze([1, 1, 0]),
    Object.freeze([1, 0, 1]),
    Object.freeze([2, 1, 0]),
    Object.freeze([1, 1, 1]),
  ]),
});

export const SPAWN = Object.freeze({
  // Waves a stream of each kind can send:
  // [count min, count spread, interval min, interval spread, gap min, gap spread]
  kinds: Object.freeze({
    small: Object.freeze({
      firstDelay: 30,
      // A cleared field brings the next wave at once.
      rush: true,
      // Each wave is a formation.
      formation: true,
      groups: Object.freeze([
        Object.freeze([7, 5, 15, 5, 72, 15]),
        Object.freeze([5, 3, 20, 5, 56, 10]),
        Object.freeze([2, 2, 25, 5, 45, 20]),
      ]),
      // The order a stream sends its groups in, round and round: short ones
      // in quick succession, then a long column. (One long, one middling and
      // two short in every four, as it was when each was drawn by lot.)
      phrases: Object.freeze([
        Object.freeze([2, 2, 1, 0]),
        Object.freeze([2, 1, 2, 0]),
        Object.freeze([1, 2, 2, 0]),
        Object.freeze([2, 0, 2, 1]),
      ]),
    }),
    middle: Object.freeze({
      firstDelay: 60,
      rush: false,
      groups: Object.freeze([
        Object.freeze([4, 1, 80, 30, 240, 150]),
        Object.freeze([2, 1, 180, 20, 180, 60]),
        Object.freeze([1, 1, 100, 1, 150, 50]),
      ]),
    }),
    large: Object.freeze({
      firstDelay: 90,
      rush: false,
      groups: Object.freeze([
        Object.freeze([3, 1, 240, 40, 400, 100]),
        Object.freeze([2, 1, 300, 20, 400, 60]),
        Object.freeze([1, 1, 200, 1, 270, 50]),
      ]),
    }),
  }),
  order: Object.freeze(["small", "middle", "large"]),
  xRange: 0.88,
});
