// Formations: a wave of small enemies. In the mode that scores by the chain,
// wiping one out whole raises the multiplier, and letting one enemy leave the
// field, or losing a ship, puts it back to 1 (score.js). The other modes keep
// no chain: there a formation is only the enemies in it.

import { killMultiplier, scoringOf, wipeOut } from "./score.js";

// A formation stays open while its wave is still arriving.
// pattern is its flight pattern; anchor and side place it; planned is how many
// are meant to arrive; turn is a choice a pattern may make once for all of it.
export function openFormation(sim, { pattern, anchor, side, planned }) {
  const formation = { id: sim.nextId++, open: true, spawned: 0, killed: 0, escaped: 0, x: 0, y: 0, pattern, anchor, side, planned, turn: 0, picks: {} };
  sim.formations.push(formation);
  return formation;
}

export const findFormation = (sim, id) => sim.formations.find((f) => f.id === id);
const find = findFormation;

export function joinFormation(sim, id) {
  const formation = find(sim, id);
  if (formation) formation.spawned++;
}

export function closeFormation(sim, id) {
  const formation = find(sim, id);
  if (!formation) return;
  formation.open = false;
  settle(sim, formation);
}

export function closeFormations(sim) {
  for (const formation of sim.formations.slice()) {
    if (!formation.open) continue;
    formation.open = false;
    settle(sim, formation);
  }
}

export function formationKill(sim, enemy) {
  const formation = find(sim, enemy.formation);
  if (!formation) return;
  formation.killed++;
  formation.x = enemy.x;
  formation.y = enemy.y;
  settle(sim, formation);
}

export function formationEscape(sim, enemy) {
  const formation = find(sim, enemy.formation);
  if (!formation) return;
  formation.escaped++;
  breakChain(sim, "escape");
  settle(sim, formation);
}

// (Only the mode that scores by the chain ever has one to break.)
export function breakChain(sim, cause) {
  if (sim.chain === 0) return;
  sim.events.push({ type: "chain-break", cause, chain: sim.chain });
  sim.chain = 0;
}

// Once the whole wave has arrived and none of it is left, the formation is
// over: it pays exactly once if nothing got away, and is forgotten either way.
function settle(sim, formation) {
  if (formation.open || formation.killed + formation.escaped < formation.spawned) return;
  sim.formations = sim.formations.filter((f) => f !== formation);
  if (formation.spawned === 0) return;
  if (formation.escaped > 0) {
    sim.events.push({ type: "formation-lost", pattern: formation.pattern, size: formation.spawned, escaped: formation.escaped });
    return;
  }
  if (scoringOf(sim) !== "chain") return;
  const chain = wipeOut(sim);
  sim.events.push({ type: "formation", x: formation.x, y: formation.y, chain, mult: killMultiplier(sim, formation.x, formation.y), size: formation.spawned, pattern: formation.pattern });
}
