// A simulated player that plays for the chain: it tries to let nothing that
// counts get away. The author keeps the chain almost without fail, and the
// seeker (index.mjs) drops it about five times a minute, so the seeker says
// nothing about how the chain or the score behaves in good hands.
//
// It sees the state exactly and re-decides every other frame (a strong
// policy, not a model of a person). What it does differently from the seeker:
//   - everything worth catching before it leaves is a job with a deadline:
//     a formation member (when it will leave the field, carrying on as it
//     has been moving), and a bonus target or a core on the ground (when it
//     will pass the bottom)
//   - it goes for the job that is nearest to its deadline once the trip
//     there is counted, not for whatever is lowest
//   - it climbs toward its target, since four shots on screen fire faster
//     from close up
//   - a core is locked on to and the laser let go at once
//   - of a boss, it shoots the wings off first
// With nothing to do it lines up under the big enemies, like the seeker.
//
// It plays for the multiplier of the mode it is in (obs.scoring):
//   chain  as above
//   close  it gets nearer to its target, and holds its fire while the only
//          thing it could hit is still above the line where kills pay 1
//   graze  it gives bullets a narrow berth and leans toward the ones that
//          will pass close without hitting

import { INPUT } from "../../src/sim/input.js";
import { FIELD, GROUND, KINDS, SHIP, SHOT } from "../../src/sim/constants.js";

const MOVES = [0, INPUT.LEFT, INPUT.RIGHT, INPUT.UP, INPUT.DOWN, INPUT.LEFT | INPUT.UP, INPUT.RIGHT | INPUT.UP, INPUT.LEFT | INPUT.DOWN, INPUT.RIGHT | INPUT.DOWN];
const STEP = 2;

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// wings: false leaves a boss's wings alone and goes for the body.
export const keeperWith = ({ wings = true } = {}) => ({
  name: wings ? "keeper" : "keeper:body-only",
  profile: "precise",
  create({ seed, variant = 0 }) {
    const rand = lcg(seed * 7919 + variant * 613 + 11);
    const berth = 1.5 + rand() * 0.5;
    const caution = 3 + rand() * 3;
    const tracks = new Map(); // enemy id -> where it was last frame
    let bits = INPUT.SHOT;
    let lockAge = 0;
    let lastLocks = 0;
    let working = 0; // the formation (or, negative, the island) it is on
    return (obs, tick) => {
      if (!obs) return bits;
      // Velocities, from one frame to the next.
      const enemies = obs.enemies.map((e) => {
        const last = tracks.get(e.id);
        return { ...e, vx: last ? e.x - last.x : 0, vy: last ? e.y - last.y : -0.2 };
      });
      tracks.clear();
      for (const e of obs.enemies) tracks.set(e.id, { x: e.x, y: e.y });
      lockAge = obs.locks > 0 && obs.locks === lastLocks ? lockAge + 1 : 0;
      lastLocks = obs.locks;
      if (tick % STEP !== 0) return bits;
      const ship = obs.ship;
      const speed = ship.speed ?? SHIP.speed;
      const style = obs.scoring ?? "chain";
      // (Grazing reaches out to 2, so it needs no narrower berth than usual.)
      const near = berth;

      // Jobs: [x, y, vx, vy, frames left, core].
      let job = null;
      const consider = (j) => {
        // Frames to get under it, against the frames it has left. One that
        // can no longer be caught is let go; the group it was working on is
        // kept unless another is clearly more pressing, so that it does not
        // run back and forth between two and lose both.
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
        consider({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, left: Math.max(Math.min(tx, ty), 0), core: false, group: e.formation });
      }
      for (const t of obs.ground ?? []) {
        // Of the ground, only what is worth a trip: bonus targets and cores.
        // Panels are taken as they come; walls are gone round.
        if (t.kind !== "bonus" && t.kind !== "core") continue;
        // It can be shot for as long as the ship can still get below it.
        const left = (t.y + 13) / GROUND.speed;
        if (left <= 0) continue;
        consider({ x: t.x, y: t.y, vx: 0, vy: -GROUND.speed, left, core: t.kind === "core", group: -t.island });
      }
      working = job ? job.group : 0;
      let aimX = null;
      let wantY = -8;
      if (job) {
        const climb = Math.max((job.y - ship.y) / Math.max(SHOT.speed - job.vy, 0.2), 0);
        aimX = job.x + job.vx * Math.min(climb, 30);
        // Below it, and close: a formation from a few units under, a ground
        // target from just under.
        wantY = Math.max(-13.5, Math.min(job.y - (style === "close" ? 5 : job.vy < -GROUND.speed - 0.01 || job.vx !== 0 ? 6 : 3), style === "close" ? 8 : 3));
      } else {
        // Nothing with a deadline: the lowest big thing ahead.
        // Of a boss, the wings first: with all of them off, the body counts
        // in the chain.
        let low = null;
        const wing = (e) => wings && e.kind === "wing";
        for (const e of enemies) {
          if (!e.lockable || e.y <= ship.y) continue;
          if (low === null || (wing(e) && !wing(low)) || (wing(e) === wing(low) && (wing(e) ? Math.abs(e.x - ship.x) < Math.abs(low.x - ship.x) : e.y < low.y))) low = e;
        }
        if (low) aimX = low.x;
      }

      let best = Infinity;
      let move = 0;
      const reach = speed * STEP * 3;
      for (const m of MOVES) {
        const dx = (m & INPUT.RIGHT ? 1 : m & INPUT.LEFT ? -1 : 0) * reach;
        const dy = (m & INPUT.UP ? 1 : m & INPUT.DOWN ? -1 : 0) * reach;
        const x = Math.max(-12.5, Math.min(12.5, ship.x + dx));
        const y = Math.max(-14.5, Math.min(14.5, ship.y + dy));
        let danger = 0;
        for (let t = 0; t <= 30; t += 3) {
          const k = Math.min(t / (STEP * 3), 1);
          const fx = ship.x + (x - ship.x) * k;
          const fy = ship.y + (y - ship.y) * k;
          for (const b of obs.bullets) {
            // A seed has not launched: its aim is not known, only where it is.
            const bx = b.armed ? b.x + Math.sin(b.dir) * b.speed * t : b.x;
            const by = b.armed ? b.y + Math.cos(b.dir) * b.speed * t : b.y;
            const d2 = (bx - fx) ** 2 + (by - fy) ** 2;
            if (d2 < near * near) danger += ((b.armed ? 1 : 0.3) * (near * near - d2)) / (1 + t / 6);
            // Grazing: a bullet that will pass just outside is worth going to.
            else if (style === "graze" && b.armed && d2 < 4) danger -= 0.12 / (1 + t / 6);
          }
          for (const e of enemies) {
            const kind = KINDS[e.kind];
            const gx = Math.abs(e.x + e.vx * t - fx) - kind.bodyW;
            const gy = Math.abs(e.y + e.vy * t - fy) - kind.bodyH;
            if (gx < 1 && gy < 1) danger += 40 / (1 + t / 6);
          }
        }
        let cost = danger * caution + Math.abs(wantY - y) * 0.3;
        if (aimX !== null) cost += Math.abs(aimX - x);
        if (cost < best) {
          best = cost;
          move = m;
        }
      }
      // Lasers: let go once the locks have stopped coming (a core takes one),
      // or with a full hand.
      const letGo = obs.locks >= 4 || (obs.locks > 0 && lockAge >= 12);
      bits = letGo ? move : move | INPUT.SHOT;
      return bits;
    };
  },
});

export const keeper = keeperWith();
