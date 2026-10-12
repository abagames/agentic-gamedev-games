// Simulated players for the balance comparison. A policy is
//   { name, profile, create({ seed, variant }) -> (obs, tick) => input bits }
// obs is whatever the game adapter's observe() exposes (null until the game
// defines it). Game-specific policies are added here as mechanics land.

import { INPUT } from "../../src/sim/input.js";
import { KINDS } from "../../src/sim/constants.js";

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Monotonous baselines: what a player does without making any decision.
export const monotonous = {
  no_input: { name: "no_input", profile: "baseline", create: () => () => 0 },
  hold_shot: { name: "hold_shot", profile: "baseline", create: () => () => INPUT.SHOT },
  spam_shot: {
    name: "spam_shot",
    profile: "baseline",
    create: () => (obs, tick) => (tick % 6 < 3 ? INPUT.SHOT : 0),
  },
  // Lets go as soon as a lock could be there: lasers without any judgement.
  pulse_shot: {
    name: "pulse_shot",
    profile: "baseline",
    create: () => (obs, tick) => (tick % 12 === 11 ? 0 : INPUT.SHOT),
  },
  // Sits against a side wall, so that enemies on the far side are off screen
  // and never fire.
  hug_wall_shot: {
    name: "hug_wall_shot",
    profile: "baseline",
    create: () => () => INPUT.SHOT | INPUT.LEFT,
  },
  // Sits on the top edge, where enemies arrive: kills them as they appear,
  // before they have fired.
  hold_up_shot: {
    name: "hold_up_shot",
    profile: "baseline",
    create: () => () => INPUT.SHOT | INPUT.UP,
  },
};

const MOVES = [
  0,
  INPUT.LEFT,
  INPUT.RIGHT,
  INPUT.UP,
  INPUT.DOWN,
  INPUT.LEFT | INPUT.UP,
  INPUT.RIGHT | INPUT.UP,
  INPUT.LEFT | INPUT.DOWN,
  INPUT.RIGHT | INPUT.DOWN,
];

// Reads the visible state: keeps shooting, lines up under the lowest enemy,
// and steps out of the way of armed bullets and of enemy hulls. It re-decides
// every few frames. Variants differ in how much they value each goal.
// ground: "ignore" lines up under enemies only (shots still stop on any
// ground target in the way); "only" lines up under ground targets only;
// "both" goes for whichever is lowest; "spare" goes for the ground only
// while nothing in the air is within reach to line up under.
export const seekerWith = ({ ground = "ignore" } = {}) => ({
  name: ground === "ignore" ? "seeker" : `seeker:ground-${ground}`,
  profile: "precise",
  create({ seed, variant }) {
    const rand = lcg(seed * 131 + variant * 977 + 3);
    rand(); // keeps the weights below on the numbers they drew before
    const enemyWeight = 0.2 + rand() * 0.8;
    const caution = 2 + rand() * 6;
    // Lets go of shot for a moment once this many locks are held.
    const volley = 1 + Math.floor(rand() * 4);
    let bits = INPUT.SHOT;
    return (obs, tick) => {
      if (!obs || tick % 3 !== 0) return bits;
      const ship = obs.ship;
      // How far the ship gets in the six frames a move is judged over.
      const reach = (ship.speed ?? 0.6) * 6;
      let target = null;
      for (const e of ground === "only" ? [] : obs.enemies) {
        if (e.y <= ship.y) continue;
        // A big enemy is worth lining up under even when it is further up.
        const rank = e.y - (e.lockable ? 6 : 0);
        if (target === null || rank < target.rank) target = { x: e.x, y: e.y, rank };
      }
      // With time to spare: nothing in the air yet, or only far overhead.
      const idle = target === null || target.y > ship.y + 16;
      for (const t of ground === "ignore" || (ground === "spare" && !idle) ? [] : (obs.ground ?? [])) {
        if (t.y <= ship.y + 1) continue;
        if (ground === "spare") {
          // The nearest one sideways, so as not to wander.
          const rank = Math.abs(t.x - ship.x);
          if (target === null || target.spare !== true || rank < target.rank) target = { x: t.x, y: t.y, rank, spare: true };
        } else if (target === null || t.y < target.rank) target = { x: t.x, y: t.y, rank: t.y };
      }
      let best = Infinity;
      let move = 0;
      for (const m of MOVES) {
        const dx = (m & INPUT.RIGHT ? 1 : m & INPUT.LEFT ? -1 : 0) * reach;
        const dy = (m & INPUT.UP ? 1 : m & INPUT.DOWN ? -1 : 0) * reach;
        const x = Math.max(-12.5, Math.min(12.5, ship.x + dx));
        const y = Math.max(-14.5, Math.min(14.5, ship.y + dy));
        let cost = 0;
        for (const b of obs.bullets) {
          for (let t = 0; t <= 24; t += 4) {
            const bx = b.x + Math.sin(b.dir) * b.speed * t;
            const by = b.y + Math.cos(b.dir) * b.speed * t;
            const fx = ship.x + (x - ship.x) * Math.min(t / 6, 1);
            const fy = ship.y + (y - ship.y) * Math.min(t / 6, 1);
            const d2 = (bx - fx) ** 2 + (by - fy) ** 2;
            if (d2 < 4) cost += (caution * (4 - d2)) / (1 + t / 8);
          }
        }
        // Hulls: where each enemy will be while the ship gets there.
        for (const e of obs.enemies) {
          const kind = KINDS[e.kind];
          for (let t = 0; t <= 24; t += 4) {
            const fx = ship.x + (x - ship.x) * Math.min(t / 6, 1);
            const fy = ship.y + (y - ship.y) * Math.min(t / 6, 1);
            const gapX = Math.abs(fx - e.x) - kind.bodyW;
            const gapY = Math.abs(fy - (e.y - kind.fallSpeed * t)) - kind.bodyH;
            if (gapX < 1 && gapY < 1) cost += 60 / (1 + t / 8);
          }
        }
        if (target) cost += Math.abs(target.x - x) * enemyWeight;
        cost += Math.abs(y + 8) * 0.05;
        if (cost < best) {
          best = cost;
          move = m;
        }
      }
      bits = (obs.locks ?? 0) >= volley ? move : move | INPUT.SHOT;
      return bits;
    };
  },
});

export const seeker = seekerWith();


// Blind random search: holds a random combination of movement and shot
// for a random stretch, then picks another. Each variant is a different plan;
// the evaluator keeps the best one. It reads no state, so it is a weak
// exploratory policy: enough to exercise the harness, not to judge a game.
export const randomSegments = {
  name: "random_segments",
  profile: "precise",
  create({ seed, variant }) {
    const rand = lcg(seed * 7919 + variant * 104729 + 1);
    let bits = 0;
    let until = 0;
    return (obs, tick) => {
      if (tick >= until) {
        const moves = [0, INPUT.LEFT, INPUT.RIGHT, INPUT.UP, INPUT.DOWN];
        bits = moves[Math.floor(rand() * moves.length)];
        if (rand() < 0.5) bits |= moves[Math.floor(rand() * moves.length)];
        if (rand() < 0.8) bits |= INPUT.SHOT;
        until = tick + 10 + Math.floor(rand() * 50);
      }
      return bits;
    };
  },
};

export const HUMAN_DEFAULTS = Object.freeze({
  reaction_ms: 250,
  timing_sigma_ms: 60,
  attention_lapse: 0.1,
  reorientation_ms: 450,
});

// Wraps a policy with human execution limits: every change of input takes
// effect after a reaction delay with timing error, and some changes are
// noticed late. It cannot change inputs faster than a person could.
export function humanLimited(policy, params = HUMAN_DEFAULTS, fps = 60) {
  const toFrames = (ms) => (ms / 1000) * fps;
  return {
    name: `${policy.name}+human`,
    profile: "human-limited",
    params,
    create(ctx) {
      const inner = policy.create(ctx);
      const rand = lcg(ctx.seed * 31337 + ctx.variant * 271 + 5);
      const gauss = () => {
        const u = Math.max(rand(), 1e-9);
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
      };
      const pending = [];
      let wanted = 0;
      let applied = 0;
      let lastDue = 0;
      return (obs, tick) => {
        const next = inner(obs, tick);
        if (next !== wanted) {
          wanted = next;
          let delay = toFrames(params.reaction_ms) + gauss() * toFrames(params.timing_sigma_ms);
          if (rand() < params.attention_lapse) delay += toFrames(params.reorientation_ms);
          const due = Math.max(lastDue, tick + Math.max(1, Math.round(delay)));
          lastDue = due;
          pending.push({ due, bits: next });
        }
        while (pending.length > 0 && pending[0].due <= tick) applied = pending.shift().bits;
        return applied;
      };
    },
  };
}
