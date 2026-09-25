// Attract-mode pilot and test bots. A blink shot flies along the sweep line
// beyond the landing point, so aiming = pressing as the beam crosses a hunter
// that is far enough away to be ahead of the landing point.
import { CFG, TAU, tipPoint, insideScope, shotHalfWidth, sweepOmega, bonusFrac } from "./game-core.js";

const wrap = (a) => ((a % TAU) + TAU) % TAU;
// Closest shootable distance: from the landing point, a hunter must be ahead
// of it; from the origin, anything a little ahead of the ship.
const minAhead = () => (CFG.shotFrom === "origin" ? 20 : CFG.aheadR);
const maxAhead = () => (CFG.shotFrom === "origin" ? 0 : CFG.jumpR) + CFG.shotRange * 0.9 + (CFG.shotFrom === "origin" ? CFG.jumpR : 0);
const SAFE_LAND = 30;

// Would a press right now hit something in `hs`?
export function shotWouldHit(g, hs) {
  const tp0 = tipPoint(g);
  if (!insideScope(tp0.x, tp0.y)) return false;
  const tp = CFG.shotFrom === "origin" ? { x: g.px, y: g.py } : tp0;
  const dx = Math.cos(g.theta);
  const dy = Math.sin(g.theta);
  for (const h of hs) {
    const rx = h.x - tp.x;
    const ry = h.y - tp.y;
    const along = rx * dx + ry * dy;
    if (along < 12 || along > CFG.shotRange + (CFG.shotFrom === "origin" ? CFG.jumpR : 0)) continue;
    if (Math.abs(rx * dy - ry * dx) <= shotHalfWidth(along) * 0.8) return true;
  }
  return false;
}

export function landingSafe(g, hs, theta = g.theta) {
  const x = g.px + Math.cos(theta) * CFG.jumpR;
  const y = g.py + Math.sin(theta) * CFG.jumpR;
  if (!insideScope(x, y)) return false;
  for (const h of hs) if (Math.hypot(h.x - x, h.y - y) < SAFE_LAND) return false;
  return true;
}

// info: "true" reads real hunter positions; "radar" only painted blips,
// extrapolated toward the ship at a nominal speed.
// patientAbove: fire only into clusters (a target with a neighbour inside
// burst range) while the time-bonus bar is above this fraction; 1 = never
// patient, 0 = always patient.
// Human-error knobs (all off by default):
//   lapse   — chance a decision skips checking around the landing point
//   react   — seconds a danger must be seen before the escape press
//   percept — px of error in reading each painted blip's position
//   settle  — sweep turns after a blink before an aimed shot is possible:
//             the pivot has jumped, so the picture must be re-read first
// (Aim error in direction is the same thing as `sigma`: the beam's angle is
// set by when you press. HUMAN's 70 ms is about 17° at sector-1 speed.)
export function makePilot(
  rng,
  { sigma = 0.045, info = "true", escapeR = 75, patientAbove = 1, lapse = 0, react = 0, percept = 0, settle = 0 } = {},
) {
  let scheduled = null;
  let dangerSince = null;
  const seen = new Map();
  const gauss = () => rng() + rng() + rng() - 1.5; // ~N(0, 0.5)
  // pilot.last: kind of the most recent press ("aimed" / "escape"), for diagnostics.
  const pilot = (g, events = []) => {
    if (info === "radar") {
      for (const e of events)
        if (e.type === "paint") seen.set(e.id, { x: e.x + gauss() * 2 * percept, y: e.y + gauss() * 2 * percept, t: g.t });
      for (const e of events) if (e.type === "kill") seen.delete(e.id);
    }
    if (g.phase !== "play") {
      scheduled = null;
      dangerSince = null;
      if (g.phase === "dying") seen.clear();
      return false;
    }
    if (scheduled !== null && g.t >= scheduled) {
      scheduled = null;
      pilot.last = "aimed";
      return true;
    }
    if (scheduled !== null) return false;

    let hs = g.hunters;
    if (info === "radar") {
      hs = [];
      // A live hunter is repainted every turn, so a blip older than 1.5 turns
      // is forgotten, and no blip is extrapolated more than one turn ahead
      // (otherwise stale blips all "arrive" at the ship and fake a danger).
      const turn = (Math.PI * 2) / sweepOmega(g);
      for (const [id, b] of seen) {
        if (g.t - b.t > 1.5 * turn) {
          seen.delete(id);
          continue;
        }
        const dx = g.px - b.x;
        const dy = g.py - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const v = CFG.hunterSpeed * g.k;
        const m = Math.min(d * 0.9, v * Math.min(turn, g.t - b.t));
        hs.push({ x: b.x + (dx / d) * m, y: b.y + (dy / d) * m, speed: v });
      }
      for (const h of g.hunters) if (Math.hypot(h.x - g.px, h.y - g.py) <= CFG.nearR) hs.push(h);
    }

    let near = Infinity;
    for (const h of hs) near = Math.min(near, Math.hypot(h.x - g.px, h.y - g.py));
    // Judging danger also needs the picture re-read after a blink.
    const settled = g.t >= g.lastJumpT + (settle * Math.PI * 2) / sweepOmega(g);
    if (near < escapeR && (settled || near < CFG.nearR)) {
      if (dangerSince === null) dangerSince = g.t;
      const checks = rng() >= lapse;
      if (g.t - dangerSince >= react && (checks ? landingSafe(g, hs) : landingSafe(g, []))) {
        dangerSince = null;
        pilot.last = "escape";
        return true;
      }
    } else dangerSince = null;

    // Soonest hunter the beam will cross while it is ahead of the landing point.
    const patient = bonusFrac(g) > patientAbove;
    const checkLanding = rng() >= lapse; // a lapse: fixated on the target, not its surroundings
    let bestT = Infinity;
    for (const h of hs) {
      if (patient && !hs.some((o) => o !== h && Math.hypot(o.x - h.x, o.y - h.y) < CFG.burstR * 0.85)) continue;
      const t = wrap(Math.atan2(h.y - g.py, h.x - g.px) - g.theta) / sweepOmega(g);
      const d = Math.hypot(h.x - g.px, h.y - g.py) - (h.speed ?? CFG.hunterSpeed * g.k) * t;
      if (d < minAhead() || d > maxAhead()) continue;
      if (!landingSafe(g, checkLanding ? hs : [], g.theta + t * sweepOmega(g))) continue;
      if (t < bestT) bestT = t;
    }
    // Re-orientation: no aimed press until `settle` turns after the last blink.
    const ready = g.lastJumpT + (settle * Math.PI * 2) / sweepOmega(g);
    if (bestT < 0.6 && g.t + bestT >= ready) {
      const noise = (rng() + rng() + rng() - 1.5) * sigma * 2;
      scheduled = g.t + Math.max(0, bestT + noise);
    }
    return false;
  };
  return pilot;
}

// A fallible human: radar-only, sloppier timing, slow to notice danger,
// often doesn't look around the landing point, reads blips a little off,
// waits for clusters only early in a sector.
export const HUMAN = { info: "radar", sigma: 0.07, lapse: 0.5, react: 0.25, percept: 6, escapeR: 60, patientAbove: 0.8, settle: 0.5 };

// Attract-mode pilot: acts only on what the scope shows (so a viewer can follow
// it), with human pacing (re-orients for half a turn after each blink,
// moderate timing error) but no attention lapses, so it rarely dies stupidly.
// It shoots when it can; chains arise as hunters bunch up.
// In demo conditions (1 ship, 40 s): survives 85%, first kill ~4 s, a chain in
// ~73% of demos.
export const DEMO = { info: "radar", sigma: 0.05, lapse: 0, react: 0.2, percept: 3, escapeR: 70, settle: 0.5, patientAbove: 1 };

export function makeDemoBot(rng) {
  return makePilot(rng, DEMO);
}
