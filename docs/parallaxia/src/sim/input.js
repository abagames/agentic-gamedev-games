// One frame of player input is a bit set. The sim only ever sees these bits;
// keyboard, gamepad and touch are mapped to them outside the sim.

export const INPUT = Object.freeze({
  UP: 1,
  DOWN: 2,
  LEFT: 4,
  RIGHT: 8,
  SHOT: 16,
});

export const INPUT_MASK = 31;

export function sanitizeInput(bits) {
  return (bits | 0) & INPUT_MASK;
}
