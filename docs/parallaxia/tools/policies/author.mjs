// A simulated player fitted to the author's own play: three replays, one in
// each mode, all played for score (replays/, measured with
// tools/replay-stats.mjs and fitted with tools/human-fit.mjs).
//
// It plans like the keeper (keeper.mjs): jobs with deadlines, the multiplier
// of the mode it is in. What makes it a person and not a strong policy:
//   - it sees late: it decides on the field as it was `latency` frames ago,
//     carried forward along the way things were moving then. What has
//     appeared or turned since is not known to it
//   - it reads positions roughly: a bullet's place is off by `noise` times
//     its distance from the ship, anew at every look
//   - it loses things in a crowd: a few bullets in flight (`free`) are all
//     followed, and past that a growing share of them (up to `lapse`) goes
//     unnoticed until it is nearly on the ship. The other half of the
//     author's misses are of this kind: bullets that had been coming for
//     more than half a second, where there are many of them
//   - it decides at a person's pace: a move is held for `think` frames or a
//     little more before the next one
//   - it knows the beat of a seed: so long after one shows, it goes off at
//     wherever the ship is then. The author is never hit by a bullet in its
//     first quarter second; a player who only reacts is, all the time. But
//     only for seeds within `focus` of the ship: a shot from further off is
//     seen late, and the faster the bullets, the more often too late. Half
//     of the author's misses are to bullets a third to a half second old
//   - it keeps the author's distances: how far from the bullets (`berth`),
//     how far up the screen in each mode (`restY`, `below`, `ceilY`)
// The numbers are fitted, not measured one by one: see docs/human-bot.md for
// what each was fitted to and how close it came.

import { INPUT } from "../../src/sim/input.js";
import { BULLET, FIELD, GROUND, KINDS, SHIP, SHOT } from "../../src/sim/constants.js";

const MOVES = [0, INPUT.LEFT, INPUT.RIGHT, INPUT.UP, INPUT.DOWN, INPUT.LEFT | INPUT.UP, INPUT.RIGHT | INPUT.UP, INPUT.LEFT | INPUT.DOWN, INPUT.RIGHT | INPUT.DOWN];

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// common: every mode. The three below it: what differs by how the mode scores.
export const AUTHOR_DEFAULTS = Object.freeze({
  common: Object.freeze({
    latency: 18,
    noise: 0.02,
    // How many bullets in flight it follows without losing any; the share
    // that goes unnoticed once there are twice as many; and how near one of
    // those has to come before it is seen after all.
    free: 6,
    lapse: 0.5,
    wake: 2,
    think: 6,
    thinkJitter: 5,
    horizon: 30,
    caution: 5,
    // Shot is let go for this many frames to send the lasers off.
    tap: 5,
    // Lasers go with this many locks, or when no more have come for a while.
    volley: 3,
    stall: 12,
    weightX: 1,
    weightY: 0.3,
    // How much a seed's coming shot counts beside a bullet in flight.
    foresee: 1,
    // How far from the ship a seed can be and still have its beat followed.
    // One further off is known only once it has gone off and been seen.
    focus: 12,
    // What standing still costs while there is something to shoot at: the
    // author keeps moving across what he is shooting.
    sweep: 0,
  }),
  // below: how far under a formation it shoots from. belowBig, belowBoss:
  // the same for a big enemy and for a boss, where nearness is what pays.
  close: Object.freeze({ berth: 2.2, restY: 3, below: 5, belowBig: 8, belowBoss: 11, ceilY: 9, floorY: -7, weightX: 1.25, weightY: 1.3, sweep: 0.5 }),
  chain: Object.freeze({ berth: 2.8, restY: -13, below: 12, ceilY: -2, floorY: -14.5, sweep: 0.5 }),
  // lure: what a bullet that will pass close without hitting is worth.
  graze: Object.freeze({ berth: 1.6, restY: -13, below: 13, ceilY: -6, floorY: -14.5, weightX: 1.25, lure: 0.12 }),
});

export const authorWith = (overrides = {}) => ({
  name: "author",
  profile: "human-calibrated",
  create({ seed, variant = 0 }) {
    const rand = lcg(seed * 4409 + variant * 2713 + 17);
    const salt = Math.floor(rand() * 0x7fffffff);
    // Whether this bullet is one of those that go unnoticed. A bullet in
    // flight keeps its course and speed, which is what it is known by here,
    // so the same bullet gets the same answer at every look.
    const unnoticed = (b, share) => {
      let h = Math.imul(Math.round(b.dir * 10000) ^ salt, 0x9e3779b1) ^ Math.imul(Math.round(b.speed * 100000), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      return ((h ^ (h >>> 13)) >>> 0) / 0x100000000 < share;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
    const tracks = new Map(); // enemy id -> where it was last frame
    const seen = []; // what was on the field, newest last
    let seedsBefore = []; // the seeds of the frame before, with their ages
    const trail = []; // where the ship has been, newest last
    let bits = INPUT.SHOT;
    let move = 0;
    let nextThink = 0;
    let tapUntil = -1;
    let lockAge = 0;
    let lastLocks = 0;
    let working = 0;
    return (obs, tick) => {
      if (!obs) return bits;
      const style = obs.scoring ?? "chain";
      const p = { ...AUTHOR_DEFAULTS.common, ...AUTHOR_DEFAULTS[style], ...overrides.common, ...overrides[style] };
      const enemiesNow = obs.enemies.map((e) => {
        const last = tracks.get(e.id);
        return { ...e, vx: last ? e.x - last.x : 0, vy: last ? e.y - last.y : -0.2 };
      });
      tracks.clear();
      for (const e of obs.enemies) tracks.set(e.id, { x: e.x, y: e.y });
      // A seed is followed from frame to frame (it rides its enemy, so it has
      // not gone far), which gives how long it has been out and how it moves.
      const seedsNow = [];
      for (const b of obs.bullets) {
        if (b.armed) continue;
        let last = null;
        let gap = 1.5;
        // (One seed of before is one seed of now: an enemy can carry two.)
        for (const q of seedsBefore) {
          const d = Math.abs(q.x - b.x) + Math.abs(q.y - b.y);
          // (Nor one that was about to go off: that one has gone, and this
          // is the next in its place.)
          if (!q.taken && q.age + 1 < BULLET.armFrames && d < gap) {
            gap = d;
            last = q;
          }
        }
        if (last) last.taken = true;
        seedsNow.push({ x: b.x, y: b.y, dir: b.dir, speed: b.speed, age: last ? last.age + 1 : 1, vx: last ? b.x - last.x : 0, vy: last ? b.y - last.y : 0 });
      }
      seedsBefore = seedsNow;
      trail.push([obs.ship.x, obs.ship.y]);
      if (trail.length > 40) trail.shift();
      seen.push({ enemies: enemiesNow, bullets: obs.bullets, seeds: seedsNow, ground: obs.ground ?? [] });
      if (seen.length > p.latency + 1) seen.shift();
      // The ship's own state and its locks are felt, not watched: known now.
      lockAge = obs.locks > 0 && obs.locks === lastLocks ? lockAge + 1 : 0;
      lastLocks = obs.locks;
      if (obs.locks >= p.volley || (obs.locks > 0 && lockAge >= p.stall)) {
        if (tapUntil < tick) tapUntil = tick + p.tap;
      }
      if (tick >= nextThink) {
        nextThink = tick + p.think + Math.floor(rand() * (p.thinkJitter + 1));
        const then = seen[0];
        const late = seen.length - 1;
        const ship = obs.ship;
        const speed = ship.speed ?? SHIP.speed;
        const enemies = then.enemies.map((e) => ({ ...e, x: e.x + e.vx * late, y: e.y + e.vy * late }));
        // Up to `free` bullets in flight are all followed. Past that, a share
        // of them is lost sight of, growing to `lapse` at twice as many.
        let flying = 0;
        for (const b of then.bullets) if (b.armed) flying++;
        const lost = p.lapse * Math.min(1, Math.max(0, flying - p.free) / Math.max(p.free, 1));
        const bullets = [];
        for (const b of then.bullets) {
          const x = b.armed ? b.x + Math.sin(b.dir) * b.speed * late : b.x;
          const y = b.armed ? b.y + Math.cos(b.dir) * b.speed * late : b.y;
          const far = Math.sqrt((x - ship.x) ** 2 + (y - ship.y) ** 2);
          // One that went unnoticed is seen only once it is right there.
          if (b.armed && far > p.wake && unnoticed(b, lost)) continue;
          const off = p.noise * far;
          bullets.push({ ...b, x: x + gauss() * off, y: y + gauss() * off });
        }

        let job = null;
        const consider = (j) => {
          const trip = Math.abs(j.x + j.vx * 10 - ship.x) / speed;
          let slack = j.left - trip;
          if (slack < -15) return;
          if (j.group === working) slack -= 25;
          if (job === null || slack < job.slack) job = { ...j, slack };
        };
        for (const e of enemies) {
          if (!e.formation) continue;
          const tx = e.vx > 0.01 ? (FIELD.halfW - e.x) / e.vx : e.vx < -0.01 ? (-FIELD.halfW - e.x) / e.vx : 1e6;
          const ty = e.vy > 0.01 ? (FIELD.halfH + 1 - e.y) / e.vy : e.vy < -0.01 ? (-13 - e.y) / e.vy : 1e6;
          consider({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, left: Math.max(Math.min(tx, ty), 0), group: e.formation });
        }
        for (const t of then.ground) {
          if (t.kind !== "bonus" && t.kind !== "core") continue;
          const y = t.y - GROUND.speed * late;
          const left = (y + 13) / GROUND.speed;
          if (left <= 0) continue;
          consider({ x: t.x, y, vx: 0, vy: -GROUND.speed, left, group: -t.island });
        }
        working = job ? job.group : 0;
        let aimX = null;
        let wantY = p.restY;
        if (job) {
          const climb = Math.max((job.y - ship.y) / Math.max(SHOT.speed - job.vy, 0.2), 0);
          aimX = job.x + job.vx * Math.min(climb, 30);
          wantY = Math.max(p.floorY, Math.min(job.y - p.below, p.ceilY));
        } else {
          let low = null;
          const wing = (e) => e.kind === "wing";
          for (const e of enemies) {
            if (!e.lockable || e.y <= ship.y) continue;
            if (low === null || (wing(e) && !wing(low)) || (wing(e) === wing(low) && (wing(e) ? Math.abs(e.x - ship.x) < Math.abs(low.x - ship.x) : e.y < low.y))) low = e;
          }
          if (low) {
            aimX = low.x;
            // Where nearness pays, the big things are still kept further off
            // than a formation, and a boss further again.
            if (style === "close") wantY = Math.max(p.floorY, Math.min(low.y - (KINDS[low.kind].lockable && /boss|wing/.test(low.kind) ? p.belowBoss : p.belowBig), p.ceilY));
          }
        }

        let best = Infinity;
        const reach = speed * p.think;
        const near = p.berth;
        // Seeds not yet launched. The player knows the beat: a seed goes
        // off so long after it shows, aimed at wherever the ship is then. So
        // each is a bullet to come: where it goes depends on where this move,
        // kept up, has taken the ship by then.
        // One that must have gone off since it was last seen was aimed at
        // where the ship was then, which the player knows. A seed may also
        // not be aimed at all, and fly the way it points: both are counted.
        const seeds = [];
        const flown = [];
        if (p.foresee > 0) {
          for (const q of then.seeds) {
            const wait = BULLET.armFrames - (q.age + late);
            const x = q.x + q.vx * Math.min(late + wait, late);
            const y = q.y + q.vy * Math.min(late + wait, late);
            if (wait > p.horizon) continue;
            // Only the seeds near enough to be watching are counted down.
            if ((x - ship.x) ** 2 + (y - ship.y) ** 2 > p.focus * p.focus) continue;
            if (wait > 0) seeds.push({ x: x + q.vx * wait, y: y + q.vy * wait, dir: q.dir, speed: q.speed, wait });
            else {
              const at = trail[Math.max(trail.length - 1 + wait, 0)];
              for (const dir of [Math.atan2(at[0] - x, at[1] - y) + q.dir, q.dir]) flown.push({ x: x + Math.sin(dir) * q.speed * -wait, y: y + Math.cos(dir) * q.speed * -wait, dir, speed: q.speed });
            }
          }
        }
        for (const m of MOVES) {
          const dx = (m & INPUT.RIGHT ? 1 : m & INPUT.LEFT ? -1 : 0) * reach;
          const dy = (m & INPUT.UP ? 1 : m & INPUT.DOWN ? -1 : 0) * reach;
          const x = Math.max(-12.5, Math.min(12.5, ship.x + dx));
          const y = Math.max(-14.5, Math.min(14.5, ship.y + dy));
          let danger = 0;
          const vx = (m & INPUT.RIGHT ? 1 : m & INPUT.LEFT ? -1 : 0) * speed;
          const vy = (m & INPUT.UP ? 1 : m & INPUT.DOWN ? -1 : 0) * speed;
          const going = (t) => [Math.max(-12.5, Math.min(12.5, ship.x + vx * t)), Math.max(-14.5, Math.min(14.5, ship.y + vy * t))];
          for (const q of seeds) {
            const [ax, ay] = going(q.wait);
            for (const aim of [Math.atan2(ax - q.x, ay - q.y) + q.dir, q.dir]) {
              const sx = Math.sin(aim) * q.speed;
              const sy = Math.cos(aim) * q.speed;
              for (let t = q.wait + 3; t <= p.horizon + 12; t += 3) {
                const [fx, fy] = going(t);
                const d2 = (q.x + sx * (t - q.wait) - fx) ** 2 + (q.y + sy * (t - q.wait) - fy) ** 2;
                // (Not made less of for being a moment off: it will be fired.)
                if (d2 < near * near) danger += p.foresee * (near * near - d2);
              }
            }
          }
          for (const b of flown) {
            for (let t = 0; t <= p.horizon; t += 3) {
              const [fx, fy] = going(t);
              const d2 = (b.x + Math.sin(b.dir) * b.speed * t - fx) ** 2 + (b.y + Math.cos(b.dir) * b.speed * t - fy) ** 2;
              if (d2 < near * near) danger += p.foresee * (near * near - d2);
            }
          }
          for (let t = 0; t <= p.horizon; t += 3) {
            const k = Math.min(t / p.think, 1);
            const fx = ship.x + (x - ship.x) * k;
            const fy = ship.y + (y - ship.y) * k;
            for (const b of bullets) {
              const bx = b.armed ? b.x + Math.sin(b.dir) * b.speed * t : b.x;
              const by = b.armed ? b.y + Math.cos(b.dir) * b.speed * t : b.y;
              const d2 = (bx - fx) ** 2 + (by - fy) ** 2;
              if (d2 < near * near) danger += ((b.armed ? 1 : 0.3) * (near * near - d2)) / (1 + t / 6);
              else if (p.lure && b.armed && d2 < 4) danger -= p.lure / (1 + t / 6);
            }
            for (const e of enemies) {
              const kind = KINDS[e.kind];
              const gx = Math.abs(e.x + e.vx * t - fx) - kind.bodyW;
              const gy = Math.abs(e.y + e.vy * t - fy) - kind.bodyH;
              if (gx < 1 && gy < 1) danger += 40 / (1 + t / 6);
            }
          }
          let cost = danger * p.caution + Math.abs(wantY - y) * p.weightY;
          if (aimX !== null && x === ship.x) cost += p.sweep;
          if (aimX !== null) cost += Math.abs(aimX - x) * p.weightX;
          // A tie goes to the move already held.
          if (cost < best - (m === move ? 0 : 1e-9)) {
            best = cost;
            move = m;
          }
        }
      }
      bits = tick <= tapUntil ? move : move | INPUT.SHOT;
      return bits;
    };
  },
});

export const author = authorWith();
