// Seeded PRNG (xorshift32). The whole generator state is one integer kept in
// the sim state, so it is serialized, hashed and restored with everything else.

export function createRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return { s };
}

export function nextUint(rng) {
  let s = rng.s;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  rng.s = s;
  return s;
}

// Float in [0, n).
export function nextFloat(rng, n = 1) {
  return (nextUint(rng) / 0x100000000) * n;
}

// Float in [-n, n).
export function nextSignedFloat(rng, n = 1) {
  return nextFloat(rng, n * 2) - n;
}

// Integer in [0, n).
export function nextInt(rng, n) {
  return Math.floor(nextFloat(rng, n));
}

// A generator for a piece of the game's fixed content: what it yields depends
// only on which course is being played, what the piece is (tag) and which one
// (n), never on the run's seed or on anything that has happened in the run.
export function contentRng(course, tag, n) {
  let h = 0x811c9dc5;
  for (const v of [course, tag, n]) {
    h = Math.imul(h ^ (v >>> 0), 0x01000193) >>> 0;
    h ^= h >>> 15;
  }
  const rng = createRng(h);
  // Shake out the first few values, which follow the seed closely.
  for (let i = 0; i < 4; i++) nextUint(rng);
  return rng;
}
