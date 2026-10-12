// The view: which slice of the field is on screen. It is part of the rules,
// not only of the picture, because enemies that are off screen hold their fire.

import { FIELD, VIEW, SHIP } from "./constants.js";

const RATIO = (FIELD.halfW - VIEW.halfW) / (FIELD.halfW - SHIP.margin);

// Where the view wants to be for a ship at x.
export const viewTargetX = (shipX) => shipX * RATIO;

// Field distance for one unit of on-screen ship movement (the view moves the
// same way the ship does, so the ship crosses the screen slower than the field).
export const FIELD_PER_SCREEN = 1 / (1 - RATIO);

export function updateView(sim) {
  sim.viewX += (viewTargetX(sim.ship.x) - sim.viewX) * VIEW.ease;
}

export function onScreen(sim, x) {
  return Math.abs(x - sim.viewX) <= VIEW.halfW;
}
