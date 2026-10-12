// Trigonometry for the sim. Math.sin, Math.cos and Math.atan2 are not required
// to give the same last bit on every JavaScript engine (Node and Chromium
// already disagree on atan2), and one differing bit breaks replays. These use
// only + - * / and Math.sqrt, which are exact everywhere. Accurate to about
// 1e-11, which is far finer than the game needs.

export const PI = 3.141592653589793;
const TWO_PI = PI * 2;
const HALF_PI = PI / 2;

export function sin(x) {
  let a = x - TWO_PI * Math.round(x / TWO_PI);
  if (a > HALF_PI) a = PI - a;
  else if (a < -HALF_PI) a = -PI - a;
  const a2 = a * a;
  // Taylor series to a^17, evaluated inside out.
  let sum = 1 / 355687428096000;
  sum = sum * -a2 + 1 / 1307674368000;
  sum = sum * -a2 + 1 / 6227020800;
  sum = sum * -a2 + 1 / 39916800;
  sum = sum * -a2 + 1 / 362880;
  sum = sum * -a2 + 1 / 5040;
  sum = sum * -a2 + 1 / 120;
  sum = sum * -a2 + 1 / 6;
  sum = sum * -a2 + 1;
  return a * sum;
}

export function cos(x) {
  return sin(x + HALF_PI);
}

// atan for |z| <= tan(pi/8), by series.
function atanSmall(z) {
  const z2 = z * z;
  let sum = 0;
  for (let k = 14; k >= 0; k--) sum = sum * -z2 + 1 / (2 * k + 1);
  return z * sum;
}

function atanUnit(a) {
  // a in [0, 1]
  return a > 0.41421356237309503 ? PI / 4 + atanSmall((a - 1) / (a + 1)) : atanSmall(a);
}

// Same argument order and result range as Math.atan2.
export function atan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let angle = ax >= ay ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  if (x < 0) angle = PI - angle;
  return y < 0 ? -angle : angle;
}

export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}
