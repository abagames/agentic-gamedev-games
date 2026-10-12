// Flight patterns of small-enemy formations.
//
// A pattern is a list of legs. A leg is a piece of geometry (a straight line,
// a circular arc, or a straight line with a sine wave across it) plus how fast it is flown, given as the speed at its
// start and at its end. Shape and timing are kept apart: where an enemy is
// depends only on how far along the leg it has gone, and how fast it goes
// depends only on that distance too, so a formation's members trace the same
// track with the same slow-downs in the same places. A "hold" leg stands still
// for a number of frames.
//
// A leg's geometry is fixed at the moment the enemy starts it. That is the only
// time a pattern may look at the ship, and what it reads is stated on the leg:
// always the ship's x, never its y. (One leg, the cross's, also ends early when
// the enemy passes over the ship.)
//
// Where a choice is made for the whole formation, the first member to reach
// that leg makes it and the rest follow: pick() keeps it on the formation.
//
// Field units: x -14..14, y -16..16, the ship starts at y -8 and moves 0.6 a
// frame. Enemies enter at y 15.5.

import { sin, cos, PI } from "./math.js";
import { FIELD, ENEMY, SHIP } from "./constants.js";

const TOP = ENEMY.spawnY;
const BELOW = -FIELD.halfH - 1;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const line = (x, y, v0, v1 = v0) => ({ kind: "line", x, y, v0, v1 });
// pos = (cx, cy) + r (cos a, sin a), a from a0 over sweep radians.
const arc = (cx, cy, r, a0, sweep, v0, v1 = v0) => ({ kind: "arc", cx, cy, r, a0, sweep, v0, v1 });
// A line to (x, y) with a sine across it: amp to the side, cycles full waves
// over the leg. It starts and ends on the line. Speeds are along the line.
const wave = (x, y, amp, cycles, v0, v1 = v0) => ({ kind: "wave", x, y, amp, cycles, v0, v1 });
const hold = (frames) => ({ kind: "hold", frames });

// The formation's choice for a leg, made by whoever gets there first.
function pick(f, key, choose) {
  if (!f.picks) f.picks = {};
  if (!(key in f.picks)) f.picks[key] = choose();
  return f.picks[key];
}
// Which side of x the ship is on (the formation's own side if neither).
const shipSide = (sim, x, f) => (sim.ship.x > x ? 1 : sim.ship.x < x ? -1 : f.side);

// f is the formation: { anchor, side, planned, turn }. e is the enemy; its
// slot counts from 0 in the order the formation arrives.
//
// fires says on which legs a member may shoot (it still has to be on screen
// and above the cease-fire line). A pattern without it shoots all the way.
// The rule is part of the pattern: when a formation shoots should be as
// readable as where it flies.
export const PATTERNS = Object.freeze({
  // Straight down in single file, slowly. The plainest thing to shoot.
  column: Object.freeze({
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, BELOW, 0.22)],
  }),

  // A slanted line across the whole field, from one top corner to the far
  // side of the bottom edge, at one steady speed.
  diagonal: Object.freeze({
    start: (f) => [-f.side * 10, TOP],
    legs: [(sim, e, f) => line(f.side * 10, BELOW, 0.3)],
  }),

  // Fast down the middle, braking hard, then a square turn and away over a
  // side wall. The side is chosen once, by the first of the formation to
  // reach the corner: toward the ship's x at that moment. The rest follow it.
  // It shoots on the way in and through the corner, and not once it is on
  // its way to the wall. (On the way in alone it had 39 frames to shoot in,
  // and the first shot takes 30: one bullet, and none if anything took a
  // few frames off.)
  hook: Object.freeze({
    fires: (leg) => leg <= 1,
    anchor: (x) => clamp(x, -6, 6),
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 5.5, 0.45, 0.12),
      (sim, e, f) => {
        if (!f.turn) f.turn = sim.ship.x > f.anchor ? 1 : sim.ship.x < f.anchor ? -1 : f.side;
        return arc(f.anchor + f.turn * 1.5, 5.5, 1.5, f.turn > 0 ? PI : 0, (f.turn * PI) / 2, 0.12, 0.2);
      },
      (sim, e, f) => line(f.turn * (FIELD.halfW + 1), 4, 0.2, 0.42),
    ],
  }),

  // Down fast, fanning out into a row, braking to a stop. The row hangs
  // there, then each drops straight down, gathering speed, in the order it
  // arrived.
  // It shoots only while it hangs: they stop, then they shoot.
  hover: Object.freeze({
    fires: (leg) => leg === 1,
    anchor: (x) => clamp(x, -5, 5),
    start: (f) => [f.anchor, TOP],
    legs: [
      // The row forms over where the ship was when the first of them set out.
      (sim, e, f) => line(rowX(e, f, pick(f, "centre", () => sim.ship.x)), 8, 0.5, 0.06),
      () => hold(80),
      (sim, e, f) => line(e.x, BELOW, 0.06, 0.5),
    ],
  }),

  // Creeps in, stops short, comes round to one side of the ship and cuts
  // across it on a slant. Two aims, each taken once, at the ship where it is
  // then: when the stop ends, at a point 7 to the enemy's own side of the
  // ship and 6 above it; and on reaching that, at a line through the ship to
  // 5 beyond it and 4 below. Each enemy aims alone.
  // It never shoots. Its hull is the danger.
  // (Until 2026-10-12 it stopped 18 frames and dived straight down, 0.2 to
  // 0.62, at the ship's x of that moment, no further than 5 to the side.
  // Nothing was ever hit by one: it could seldom reach the ship, a ship that
  // had moved at all was missed, and one made to follow the ship straight
  // down only flew into its shots. Coming across on a slant it is in the
  // line of fire for a few frames only. The author's decisions.)
  // It keeps its own width in a WIDE section: its path is laid on the ship,
  // and drawn out sideways it crossed the ship at over twice its speed (2.0
  // a frame against 0.9).
  dive: Object.freeze({
    ownWidth: true,
    fires: () => false,
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 9.5, 0.16),
      () => hold(10),
      (sim, e) => line(clamp(sim.ship.x + (e.x >= sim.ship.x ? 7 : -7), -12.5, 12.5), Math.min(sim.ship.y + 6, 8), 0.4, 0.8),
      (sim, e) => line(sim.ship.x + (e.x >= sim.ship.x ? -5 : 5), sim.ship.y - 4, 0.8, 0.9),
    ],
  }),

  // Down to the middle of the screen, braking, a tight half turn toward the
  // centre of the field, and back up and out over the top edge. Two passes,
  // the second one leaving. The turn is kept above where the ship usually is.
  // It shoots on the way down, and not on the way out.
  hairpin: Object.freeze({
    fires: (leg) => leg === 0,
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 1, 0.42, 0.14),
      // It turns toward the side the ship is on when the first of them gets
      // to the turn; the rest follow.
      (sim, e, f) => {
        if (!f.turn) f.turn = shipSide(sim, f.anchor, f);
        return arc(f.anchor + f.turn * 1.6, 1, 1.6, f.turn > 0 ? PI : 0, f.turn * PI, 0.14);
      },
      (sim, e, f) => line(f.anchor + f.turn * 3.2, FIELD.halfH + 1.5, 0.14, 0.42),
    ],
  }),

  // One wide arc: in at a top corner, down across the middle of the field,
  // and up toward the other side, leaving over the side wall. Steady speed.
  sweep: Object.freeze({
    start: (f) => [-f.side * 12, TOP],
    legs: [(sim, e, f) => arc(f.side * 2, TOP, 14, f.side > 0 ? PI : 0, f.side * PI, 0.3)],
  }),

  // In from a side wall and down a staircase: along, down, along, down,
  // braking into every corner, and out of the bottom on the far side.
  stairs: Object.freeze({
    start: (f) => [-f.side * 13.5, 12],
    legs: [
      (sim, e, f) => line(-f.side * 5.5, 12, 0.55, 0.12),
      (sim, e, f) => line(-f.side * 5.5, 6, 0.55, 0.12),
      (sim, e, f) => line(f.side * 2.5, 6, 0.55, 0.12),
      (sim, e, f) => line(f.side * 2.5, 0, 0.55, 0.12),
      (sim, e, f) => line(f.side * 10.5, 0, 0.55, 0.12),
      (sim, e, f) => line(f.side * 10.5, BELOW, 0.12, 0.55),
    ],
  }),

  // Straight down the field in a sine: 3 to either side, two full waves on
  // the way. The whole file snakes along the same curve.
  wave: Object.freeze({
    anchor: (x) => clamp(x, -9, 9),
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => wave(f.anchor, BELOW, 3 * f.side, 2, 0.22)],
  }),

  // Down in slanted strokes, 5 across for every 5 down, braking into each
  // corner and turning back. The corners are always at the same heights, and
  // the last one is well above where the ship usually is.
  // Each stroke goes toward the side the ship is on when the first of them
  // starts it, so the formation closes in on the ship corner by corner.
  zigzag: Object.freeze({
    anchor: (x) => clamp(x, -7, 7),
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(zigX(sim, e, f, 0), 10.5, 0.45, 0.16),
      (sim, e, f) => line(zigX(sim, e, f, 1), 5.5, 0.45, 0.16),
      (sim, e, f) => line(zigX(sim, e, f, 2), 0.5, 0.45, 0.16),
      // The last stroke carries straight on, gathering speed, out of the field.
      (sim, e, f) => line(e.x + pick(f, "z3", () => shipSide(sim, e.x, f)) * (0.5 - BELOW), BELOW, 0.16, 0.45),
    ],
  }),

  // Across the field from one side wall to the other, high up and sinking a
  // little. It never comes down: it has to be caught as it passes.
  // A member that passes over the ship stops short, then drops straight down
  // on it. The rest carry on across. It shoots while it is crossing and
  // while it is stopped, not on the way down. (Crossing alone, the ones that
  // stopped over the ship early had not had time for a shot: half of all of
  // them left without one.)
  cross: Object.freeze({
    fires: (leg) => leg <= 1,
    start: (f) => [-f.side * 13.5, 10],
    legs: [
      (sim, e, f) => ({ ...line(f.side * (FIELD.halfW + 1), 6, 0.3), endOverShip: true }),
      () => hold(14),
      (sim, e, f) => line(e.x, BELOW, 0.2, 0.6),
    ],
  }),

  // Down, braking, once slowly round a full circle 6 across, and on down,
  // gathering speed. The circle is on the formation's own side. The file
  // bunches up as it goes round. It shoots on the way in and over the first
  // quarter of the circle (the way in alone left time for one bullet).
  loop: Object.freeze({
    fires: (leg, u) => leg === 0 || (leg === 1 && u < 0.25),
    anchor: (x) => clamp(x, -8, 8),
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 6, 0.42, 0.15),
      (sim, e, f) => arc(f.anchor + f.side * 3, 6, 3, f.side > 0 ? PI : 0, f.side * 2 * PI, 0.15),
      (sim, e, f) => line(f.anchor, BELOW, 0.15, 0.42),
    ],
  }),

  // Two files, one from each side of the lane, that cross in the middle of
  // the screen, braking, and go straight down on the far side. Members take
  // the files turn about. It shoots until the files have crossed.
  pincer: Object.freeze({
    fires: (leg) => leg === 0,
    anchor: (x) => clamp(x, -6, 6),
    start: (f, slot) => [f.anchor + (slot % 2 ? 6 : -6), TOP],
    legs: [(sim, e, f) => line(f.anchor + (e.slot % 2 ? -6 : 6), -1, 0.36, 0.1), (sim, e) => line(e.x, BELOW, 0.1, 0.42)],
  }),

  // Fast down past the middle of the screen, braking to a stop; a pause, then
  // a square turn and out over a side wall, low and not fast. It turns away
  // from the ship: to the side the ship is not on when the first of them
  // leaves the stop. It shoots on the way down only. What it brings low on
  // the screen is its hull.
  duck: Object.freeze({
    fires: (leg) => leg === 0,
    anchor: (x) => clamp(x, -5, 5),
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, -2, 0.5, 0.08),
      () => hold(36),
      (sim, e, f) => {
        if (!f.turn) f.turn = -shipSide(sim, f.anchor, f);
        return arc(f.anchor + f.turn * 1.5, -2, 1.5, f.turn > 0 ? PI : 0, (f.turn * PI) / 2, 0.1, 0.14);
      },
      (sim, e, f) => line(f.turn * (FIELD.halfW + 1), -4.5, 0.14, 0.3),
    ],
  }),

  // The file comes down the lane and parts: members go left and right turn
  // about, to two lanes 5 to either side, and on down them. Braking into the
  // parting, speeding up after it.
  split: Object.freeze({
    anchor: (x) => clamp(x, -7, 7),
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 8, 0.42, 0.14), (sim, e, f) => line(f.anchor + (e.slot % 2 ? 5 : -5), 3.5, 0.2, 0.09), (sim, e) => line(e.x, BELOW, 0.09, 0.4)],
  }),

  // In on a slant, braking, then one and a half times round a circle 6
  // across whose centre is where the ship was (x) when the first of them set
  // out, and straight on up and away over the top from the far side of it.
  // It shoots while it circles.
  orbit: Object.freeze({
    fires: (leg) => leg === 1,
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(pick(f, "cx", () => clamp(sim.ship.x, -8, 8)) - f.side * 3, 7.5, 0.42, 0.13),
      (sim, e, f) => arc(pick(f, "cx", () => 0), 7.5, 3, f.side > 0 ? PI : 0, f.side * 3 * PI, 0.16),
      (sim, e) => line(e.x, FIELD.halfH + 1.5, 0.16, 0.42),
    ],
  }),

  // Straight down in three drops with a stop after each. It shoots only
  // while it is stopped; the last drop goes on out of the bottom.
  ladder: Object.freeze({
    fires: (leg) => leg === 1 || leg === 3 || leg === 5,
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 11, 0.4, 0.07), () => hold(18), (sim, e, f) => line(f.anchor, 6.5, 0.4, 0.07), () => hold(18), (sim, e, f) => line(f.anchor, 2, 0.4, 0.07), () => hold(18), (sim, e, f) => line(f.anchor, BELOW, 0.1, 0.5)],
  }),

  // Two files that cross twice: out to the other side, back again, and down.
  // Members take the files turn about. Braking into both corners.
  lace: Object.freeze({
    fires: (leg) => leg <= 1,
    anchor: (x) => clamp(x, -7, 7),
    start: (f, slot) => [f.anchor + (slot % 2 ? 4 : -4), TOP],
    legs: [
      (sim, e, f) => line(f.anchor + (e.slot % 2 ? -4 : 4), 8, 0.36, 0.1),
      (sim, e, f) => line(f.anchor + (e.slot % 2 ? 4 : -4), 1.5, 0.3, 0.1),
      (sim, e) => line(e.x, BELOW, 0.1, 0.42),
    ],
  }),

  // Across the field from one side wall to the other in a shallow bowl: in
  // at y 9, down to y 3 over the middle, and up and out at y 9. Steady speed.
  swoop: Object.freeze({
    start: (f) => [-f.side * 13.5, 9],
    legs: [(sim, e, f) => arc(0, 21.1875, 18.1875, f.side > 0 ? -2.4069 : -0.7347, f.side * 1.6722, 0.3)],
  }),

  // Fast down to y 2, braking to a stop; it shoots from there, and goes back
  // up the way it came and out over the top.
  bounce: Object.freeze({
    fires: (leg) => leg === 1,
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 2, 0.46, 0.07), () => hold(34), (sim, e, f) => line(f.anchor, FIELD.halfH + 1.5, 0.08, 0.46)],
  }),

  // Straight down in two files side by side, 3 apart, members taking them
  // turn about: a column twice as wide.
  stagger: Object.freeze({
    anchor: (x) => clamp(x, -11, 11),
    start: (f, slot) => [f.anchor + (slot % 2 ? 1.5 : -1.5), TOP],
    legs: [(sim, e) => line(e.x, BELOW, 0.24)],
  }),

  // Down, braking, then a wide half turn to the formation's side that leaves
  // it heading up, a tighter half turn that brings it back heading down, and
  // away, gathering speed: a curl, flown slowly. It shoots on the way in
  // and over the first half of the wide turn.
  curl: Object.freeze({
    fires: (leg, u) => leg === 0 || (leg === 1 && u < 0.5),
    anchor: (x) => clamp(x, -6, 6),
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 6, 0.42, 0.15),
      (sim, e, f) => arc(f.anchor + f.side * 3, 6, 3, f.side > 0 ? PI : 0, f.side * PI, 0.15),
      (sim, e, f) => arc(f.anchor + f.side * 4, 6, 2, f.side > 0 ? 0 : PI, f.side * PI, 0.15),
      (sim, e) => line(e.x, BELOW, 0.15, 0.42),
    ],
  }),
});

// Where a zigzag stroke ends: 5 toward the ship's side, kept inside the field.
function zigX(sim, e, f, stroke) {
  const side = pick(f, `z${stroke}`, () => shipSide(sim, e.x, f));
  return clamp(e.x + side * 5, -12.5, 12.5);
}

// What middle enemies fly: slow, and built around standing still, because a
// middle enemy is something to pour shots into and to lock on to. Here f is
// the enemy's own plan (it does not fly in formation).
export const MIDDLE_FLIGHTS = Object.freeze({
  // Straight down, very slowly, firing all the way.
  sink: Object.freeze({
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, BELOW, 0.05)],
  }),

  // Down to a post, where it stays and fires, then back up and away.
  post: Object.freeze({
    fires: (leg) => leg === 1,
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 9, 0.2, 0.03), () => hold(240), (sim, e, f) => line(f.anchor, FIELD.halfH + 2, 0.03, 0.2)],
  }),

  // Down, then three slow slides toward the ship with a pause before each.
  // Each slide goes for the ship's x at the moment it starts, at most 6 to
  // the side, sinking a little. Then it drops away.
  stalk: Object.freeze({
    fires: (leg) => leg >= 1 && leg <= 6,
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 10, 0.2, 0.03),
      () => hold(40),
      (sim, e) => line(stalkX(sim, e), e.y - 1, 0.08),
      () => hold(40),
      (sim, e) => line(stalkX(sim, e), e.y - 1, 0.08),
      () => hold(40),
      (sim, e) => line(stalkX(sim, e), e.y - 1, 0.08),
      (sim, e) => line(e.x, BELOW, 0.05, 0.3),
    ],
  }),

  // Slowly across the top of the field from one wall to the other, firing.
  drift: Object.freeze({
    start: (f) => [-f.side * 12, 11],
    legs: [(sim, e, f) => line(f.side * (FIELD.halfW + 2), 8, 0.09)],
  }),

  // The four below arrive one loop at a time (constants.js, UNLOCK).

  // Down to the top of the screen, then three slow passes from side to side,
  // 4 either way, sinking a little; then it drops away. It fires throughout.
  sway: Object.freeze({
    anchor: (x) => clamp(x, -6, 6),
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 9.5, 0.2, 0.04),
      (sim, e, f) => line(f.anchor + f.side * 4, 9, 0.06),
      (sim, e, f) => line(f.anchor - f.side * 4, 8.5, 0.06),
      (sim, e, f) => line(f.anchor + f.side * 4, 8, 0.06),
      (sim, e) => line(e.x, BELOW, 0.05, 0.3),
    ],
  }),

  // Down, a pause, then once across to stand over where the ship is (its x
  // when the pause ends, at most 8 to the side), and it fires from there
  // before leaving over the top.
  guard: Object.freeze({
    fires: (leg) => leg === 3,
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 10, 0.2, 0.03), () => hold(40), (sim, e) => line(clamp(clamp(sim.ship.x, e.x - 8, e.x + 8), -11, 11), 9, 0.03, 0.1), () => hold(200), (sim, e) => line(e.x, FIELD.halfH + 2, 0.03, 0.2)],
  }),

  // A long slow slant from a top corner down across the field and out over
  // the far wall at y 2, firing all the way.
  slant: Object.freeze({
    start: (f) => [-f.side * 10, TOP],
    legs: [(sim, e, f) => line(f.side * (FIELD.halfW + 2), 2, 0.085)],
  }),

  // Quickly down to the middle of the screen, where it stays and fires, and
  // then sinks away out of the bottom.
  drop: Object.freeze({
    fires: (leg) => leg === 1,
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 5, 0.3, 0.03), () => hold(150), (sim, e, f) => line(f.anchor, BELOW, 0.04, 0.3)],
  }),
});

export const MIDDLE_FLIGHT_IDS = Object.freeze(Object.keys(MIDDLE_FLIGHTS));

// What large enemies fly. A large enemy is the one to charge a volley of
// lasers on, so each of these is a different answer to "where do I have to
// stand, and for how long". f is the enemy's own plan.
export const LARGE_FLIGHTS = Object.freeze({
  // Straight down, very slowly, firing all the way: the one it always had.
  descend: Object.freeze({
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, BELOW, 0.04)],
  }),

  // Down to the top of the screen, then back and forth across it three
  // times, sinking a little each time, firing all the way; then it drops out.
  patrol: Object.freeze({
    start: (f) => [f.anchor, TOP],
    legs: [
      (sim, e, f) => line(f.anchor, 11.5, 0.2, 0.04),
      (sim, e, f) => line(-f.side * 7, 11, 0.05),
      (sim, e, f) => line(f.side * 7, 10.5, 0.05),
      (sim, e, f) => line(-f.side * 7, 10, 0.05),
      (sim, e) => line(e.x, BELOW, 0.04, 0.3),
    ],
  }),

  // It takes up a post on one side and fires from there, crosses over, and
  // fires from the other side; then it drops out. It holds its fire while it
  // crosses.
  shift: Object.freeze({
    fires: (leg) => leg === 1 || leg === 3,
    start: (f) => [f.side * 7, TOP],
    legs: [(sim, e, f) => line(f.side * 7, 10.5, 0.2, 0.04), () => hold(200), (sim, e, f) => line(-f.side * 7, 9.5, 0.04, 0.12), () => hold(200), (sim, e) => line(e.x, BELOW, 0.04, 0.3)],
  }),

  // Down to the middle of the screen, where it stays and fires, then back up
  // and away over the top.
  retreat: Object.freeze({
    fires: (leg) => leg === 1,
    anchor: (x) => clamp(x, -8, 8),
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 6.5, 0.2, 0.04), () => hold(260), (sim, e, f) => line(f.anchor, FIELD.halfH + 2, 0.04, 0.2)],
  }),

  // The three below arrive one loop at a time (constants.js, UNLOCK).

  // Round a triangle near the top, twice: one top corner, the other, and a
  // point lower down in the middle. It fires all the way, then drops out.
  circuit: Object.freeze({
    start: (f) => [-f.side * 6, TOP],
    legs: [
      (sim, e, f) => line(-f.side * 6, 11, 0.2, 0.05),
      (sim, e, f) => line(f.side * 6, 11, 0.05),
      (sim, e) => line(0, 7, 0.05),
      (sim, e, f) => line(-f.side * 6, 11, 0.05),
      (sim, e, f) => line(f.side * 6, 11, 0.05),
      (sim, e) => line(0, 7, 0.05),
      (sim, e) => line(e.x, BELOW, 0.04, 0.3),
    ],
  }),

  // It fires from the top, comes forward to the middle of the screen and
  // fires from there, and goes back up and away. It holds its fire while it
  // moves.
  lunge: Object.freeze({
    fires: (leg) => leg === 1 || leg === 3,
    anchor: (x) => clamp(x, -8, 8),
    start: (f) => [f.anchor, TOP],
    legs: [(sim, e, f) => line(f.anchor, 11.5, 0.2, 0.04), () => hold(150), (sim, e, f) => line(f.anchor, 5.5, 0.04, 0.1), () => hold(150), (sim, e, f) => line(f.anchor, FIELD.halfH + 2, 0.04, 0.2)],
  }),

  // Straight across the top of the field from one wall to the other, slowly,
  // firing all the way.
  strafe: Object.freeze({
    start: (f) => [-f.side * 11, 10],
    legs: [(sim, e, f) => line(f.side * (FIELD.halfW + 4), 10, 0.06)],
  }),
});

export const LARGE_FLIGHT_IDS = Object.freeze(Object.keys(LARGE_FLIGHTS));

const stalkX = (sim, e) => clamp(clamp(sim.ship.x, e.x - 6, e.x + 6), -11, 11);

const patternOf = (f) => PATTERNS[f.pattern] ?? MIDDLE_FLIGHTS[f.pattern] ?? LARGE_FLIGHTS[f.pattern];

export const PATTERN_IDS = Object.freeze(Object.keys(PATTERNS));

// Patterns whose members travel sideways in the direction of f.side, for
// anything that wants to show which way.
export const SIDEWAYS = Object.freeze(["diagonal", "cross", "swoop"]);

// Where a member of the hover row comes to rest: a row centred on `centre`,
// moved in from the walls if it would not fit.
function rowX(e, f, centre) {
  const n = Math.max(f.planned, 1);
  const gap = n > 1 ? Math.min(2.6, 20 / (n - 1)) : 0;
  const half = ((n - 1) * gap) / 2;
  const limit = Math.max(12 - half, 0);
  return clamp(centre, -limit, limit) + (e.slot - (n - 1) / 2) * gap;
}

// Fixes a formation's anchor and side for its pattern.
export function settleFormation(f) {
  const pattern = patternOf(f);
  if (pattern.anchor) f.anchor = pattern.anchor(f.anchor);
  if (pattern.side) f.side = pattern.side(f);
}

// slot: the member's place in the formation, for patterns that start their
// members in different places.
export const patternStart = (f, slot = 0) => patternOf(f).start(f, slot);
// Whether a section's sideways stretch leaves this pattern alone.
export const keepsOwnWidth = (pattern) => Boolean(PATTERNS[pattern]?.ownWidth);

// (px, py): where the enemy is on its path as the pattern wrote it. That is
// where it is on the field too, unless its formation is warped.
export function createFlight(px = 0, py = 0) {
  // since: frames flown on the current leg.
  return { leg: -1, d: 0, len: 0, hold: 0, x0: 0, y0: 0, geo: null, since: 0, px, py };
}

// A formation's warp (constants.js, THEMES) draws its path out: downward from
// where the enemies come in, and sideways about the middle of the field. The
// sideways stretch eases to nothing at the walls, so that nothing is pushed
// off the field by it.
const WALL = FIELD.halfW;
const widenOnce = (x, k) => x * (k - ((k - 1) * Math.abs(x)) / WALL);
// The other way round: where on the written path a place on the field is.
function narrowOnce(x, k) {
  if (k === 1) return x;
  const a = (k - 1) / WALL;
  const m = Math.min(Math.abs(x), WALL);
  return (Math.sign(x) * (k - Math.sqrt(Math.max(k * k - 4 * a * m, 0)))) / (2 * a);
}
// A warp's `wide` is a list of such stretches, done one after the other (one
// alone cannot go past 2, where it stops rising at the wall).
const widen = (x, ks) => ks.reduce(widenOnce, x);
const narrow = (x, ks) => ks.reduceRight(narrowOnce, x);
export function warped(f, x, y) {
  const warp = f.warp;
  if (!warp) return [x, y];
  return [widen(clamp(x, -WALL, WALL), warp.wide) + (x - clamp(x, -WALL, WALL)), TOP - (TOP - y) * warp.tall];
}

function startLeg(sim, enemy, f) {
  const flight = enemy.flight;
  const legs = patternOf(f).legs;
  flight.leg++;
  flight.d = 0;
  flight.since = 0;
  flight.x0 = enemy.x;
  flight.y0 = enemy.y;
  // Past the last leg: straight on, the way it was going (it is on its way out).
  const geo = flight.leg < legs.length ? legs[flight.leg](sim, enemy, f) : line(enemy.x + (flight.hx ?? 0) * 99, enemy.y + (flight.hy ?? -1) * 99, flight.geo?.v1 ?? 0.3);
  flight.geo = geo;
  if (geo.kind === "hold") {
    flight.hold = geo.frames;
    flight.len = 0;
  } else if (geo.kind === "line" || geo.kind === "wave") {
    const dx = geo.x - enemy.x;
    const dy = geo.y - enemy.y;
    flight.len = Math.sqrt(dx * dx + dy * dy);
  } else {
    flight.len = Math.abs(geo.sweep) * geo.r;
  }
}

function place(enemy) {
  const { geo, d, len, x0, y0 } = enemy.flight;
  const u = len > 0 ? d / len : 1;
  let x;
  let y;
  if (geo.kind === "line") {
    x = x0 + (geo.x - x0) * u;
    y = y0 + (geo.y - y0) * u;
  } else if (geo.kind === "wave") {
    // Along the line, plus a sideways offset at right angles to it.
    const off = geo.amp * sin(geo.cycles * 2 * PI * u);
    x = x0 + (geo.x - x0) * u + ((geo.y - y0) / len) * off;
    y = y0 + (geo.y - y0) * u - ((geo.x - x0) / len) * off;
  } else {
    const a = geo.a0 + geo.sweep * u;
    x = geo.cx + geo.r * cos(a);
    y = geo.cy + geo.r * sin(a);
  }
  // The heading, kept for flying on past the last leg.
  const hx = x - enemy.x;
  const hy = y - enemy.y;
  const h = Math.sqrt(hx * hx + hy * hy);
  if (h > 1e-9) {
    enemy.flight.hx = hx / h;
    enemy.flight.hy = hy / h;
  }
  enemy.x = x;
  enemy.y = y;
}

// One frame of flight. Distance left over at the end of a leg is carried
// into the next one, so there is no pause and no jump at a join.
export function advanceFlight(sim, enemy, f) {
  const warp = f.warp;
  if (!warp) return fly(sim, enemy, f, 1);
  // The pattern is flown as written, from where the enemy is on the written
  // path and with the ship where it would be on it; then the place it comes
  // to is drawn out.
  const flight = enemy.flight;
  const shipX = sim.ship.x;
  const shipY = sim.ship.y;
  enemy.x = flight.px;
  enemy.y = flight.py;
  sim.ship.x = narrow(shipX, warp.wide);
  sim.ship.y = TOP - (TOP - shipY) / warp.tall;
  try {
    fly(sim, enemy, f, warp.pace);
  } finally {
    sim.ship.x = shipX;
    sim.ship.y = shipY;
  }
  flight.px = enemy.x;
  flight.py = enemy.y;
  [enemy.x, enemy.y] = warped(f, enemy.x, enemy.y);
}

function fly(sim, enemy, f, pace) {
  const flight = enemy.flight;
  if (flight.leg < 0) startLeg(sim, enemy, f);
  flight.since++;
  if (flight.geo.kind === "hold") {
    flight.hold--;
    if (flight.hold > 0) return;
    startLeg(sim, enemy, f);
    if (flight.geo.kind === "hold") return;
  }
  let step = null;
  for (let guard = 0; guard < 4; guard++) {
    const { geo, len } = flight;
    const u = len > 0 ? flight.d / len : 1;
    const speed = (geo.v0 + (geo.v1 - geo.v0) * u) * pace;
    if (step === null) step = speed;
    // Over the ship: this leg is done here and now.
    if (geo.endOverShip && sim.ship.respawn <= SHIP.respawnFrames - SHIP.absentFrames && Math.abs(enemy.x - sim.ship.x) < 0.6 && flight.d > 0) {
      startLeg(sim, enemy, f);
      if (flight.geo.kind === "hold") return;
      break;
    }
    if (flight.d + step < len) {
      flight.d += step;
      break;
    }
    step -= len - flight.d;
    flight.d = len;
    place(enemy);
    startLeg(sim, enemy, f);
    if (flight.geo.kind === "hold") return;
  }
  place(enemy);
}

// Whether the pattern lets this enemy shoot at this point of its flight.
export function flightMayFire(enemy, f) {
  const fires = patternOf(f).fires;
  // (The leg it is on, and how far along it, 0 to 1.)
  return fires ? fires(enemy.flight.leg, enemy.flight.len > 0 ? enemy.flight.d / enemy.flight.len : 1) : true;
}

// True while an enemy stands still before its next move: the cue to draw.
export const flightHolding = (enemy) => Boolean(enemy.flight && enemy.flight.geo && enemy.flight.geo.kind === "hold");
