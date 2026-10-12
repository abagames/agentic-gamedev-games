// A simulated player for comparing flight patterns. Unlike humanLimited (which
// delays what it does), this one is limited in what it sees:
//   - it sees the screen `delay` frames late
//   - it re-decides only every `interval` frames
//   - every position it reads is off by up to `noise` units
// It knows nothing about flight patterns. Where a thing will be is guessed by
// carrying on in a straight line from the last two looks at it, and it never
// sees a bullet before it has launched.
//
// goal "wipe": go after the formation member that is closest to getting away,
//              and move up toward it to shoot faster; give danger a small berth
// goal "survive": shoot what happens to be overhead, stay low, give danger a
//              wide berth
// Its results compare patterns with each other. They are not a forecast of
// what a person would do.

import { INPUT } from "../../src/sim/input.js";
import { KINDS, FIELD, SHOT } from "../../src/sim/constants.js";

export const SKILLS = Object.freeze({
  high: Object.freeze({ delay: 6, interval: 3, noise: 0.15 }),
  low: Object.freeze({ delay: 14, interval: 8, noise: 0.5 }),
});

const MOVES = [0, INPUT.LEFT, INPUT.RIGHT, INPUT.UP, INPUT.DOWN, INPUT.LEFT | INPUT.UP, INPUT.RIGHT | INPUT.UP, INPUT.LEFT | INPUT.DOWN, INPUT.RIGHT | INPUT.DOWN];

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function flightBot({ goal, skill }) {
  const { delay, interval, noise } = SKILLS[skill];
  const berth = goal === "wipe" ? 1.6 : 3.2;
  return {
    name: `flightbot:${goal}:${skill}`,
    create({ seed, variant = 0 }) {
      const rand = lcg(seed * 9973 + variant * 131 + 7);
      const jitter = () => (rand() * 2 - 1) * noise;
      const seen = []; // what the screen showed, oldest first
      const tracks = new Map(); // enemy id -> its last two noisy sightings
      let bits = INPUT.SHOT;
      return (obs, tick) => {
        seen.push({ tick, enemies: obs.enemies.map((e) => ({ ...e })), bullets: obs.bullets.filter((b) => b.armed).map((b) => ({ ...b })) });
        if (seen.length > delay + 1) seen.shift();
        if (tick % interval !== 0) return bits;
        const look = seen[0];
        const lag = tick - look.tick;
        // Its own ship it knows exactly: it feels the stick.
        const ship = obs.ship;
        const targets = [];
        for (const e of look.enemies) {
          const x = e.x + jitter();
          const y = e.y + jitter();
          const last = tracks.get(e.id);
          const vx = last ? (x - last.x) / Math.max(look.tick - last.tick, 1) : 0;
          const vy = last ? (y - last.y) / Math.max(look.tick - last.tick, 1) : -0.2;
          tracks.set(e.id, { x, y, tick: look.tick });
          targets.push({ id: e.id, kind: e.kind, formation: e.formation, x: x + vx * lag, y: y + vy * lag, vx, vy });
        }
        for (const id of [...tracks.keys()]) if (!look.enemies.some((e) => e.id === id)) tracks.delete(id);
        const bullets = look.bullets.map((b) => ({ x: b.x + jitter() + Math.sin(b.dir) * b.speed * lag, y: b.y + jitter() + Math.cos(b.dir) * b.speed * lag, vx: Math.sin(b.dir) * b.speed, vy: Math.cos(b.dir) * b.speed }));

        // What to shoot: the formation member nearest to leaving the field
        // (wipe), or simply the nearest thing ahead (survive).
        let target = null;
        for (const t of targets) {
          if (t.y <= ship.y + 0.5) continue;
          let urgency;
          if (goal === "wipe" && t.formation) {
            const tx = t.vx > 0.01 ? (FIELD.halfW - t.x) / t.vx : t.vx < -0.01 ? (-FIELD.halfW - t.x) / t.vx : 1e9;
            const ty = t.vy > 0.01 ? (FIELD.halfH + 1 - t.y) / t.vy : t.vy < -0.01 ? (ship.y - t.y) / t.vy : 1e9;
            urgency = Math.min(tx, ty);
          } else {
            urgency = 1000 + Math.abs(t.x - ship.x) * 4 + (t.y - ship.y);
          }
          if (target === null || urgency < target.urgency) target = { ...t, urgency };
        }
        let aimX = ship.x;
        let wantY = goal === "wipe" ? -8 : -10;
        if (target) {
          // Lead it: the shot takes a frame per unit to climb to it.
          const climb = Math.max((target.y - ship.y) / Math.max(SHOT.speed - target.vy, 0.2), 0);
          aimX = target.x + target.vx * climb;
          if (goal === "wipe") wantY = Math.min(Math.max(target.y - 7, -10), 2);
        }

        let best = Infinity;
        let move = 0;
        const reach = (obs.ship.speed ?? 0.6) * interval * 2;
        for (const m of MOVES) {
          const dx = (m & INPUT.RIGHT ? 1 : m & INPUT.LEFT ? -1 : 0) * reach;
          const dy = (m & INPUT.UP ? 1 : m & INPUT.DOWN ? -1 : 0) * reach;
          const x = Math.max(-12.5, Math.min(12.5, ship.x + dx));
          const y = Math.max(-14.5, Math.min(14.5, ship.y + dy));
          let danger = 0;
          for (let t = 0; t <= 30; t += 3) {
            const k = Math.min(t / (interval * 2), 1);
            const fx = ship.x + (x - ship.x) * k;
            const fy = ship.y + (y - ship.y) * k;
            for (const b of bullets) {
              const d2 = (b.x + b.vx * t - fx) ** 2 + (b.y + b.vy * t - fy) ** 2;
              if (d2 < berth * berth) danger += (berth * berth - d2) / (1 + t / 6);
            }
            for (const e of targets) {
              const kind = KINDS[e.kind];
              const gx = Math.abs(e.x + e.vx * t - fx) - kind.bodyW;
              const gy = Math.abs(e.y + e.vy * t - fy) - kind.bodyH;
              if (gx < berth * 0.6 && gy < berth * 0.6) danger += 30 / (1 + t / 6);
            }
          }
          const cost = danger * (goal === "wipe" ? 1 : 3) + Math.abs(aimX - x) + Math.abs(wantY - y) * 0.3;
          if (cost < best) {
            best = cost;
            move = m;
          }
        }
        bits = move | INPUT.SHOT;
        return bits;
      };
    },
  };
}
