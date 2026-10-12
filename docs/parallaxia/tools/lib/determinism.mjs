// Determinism and purity checks for a sim adapter
// ({ createSim, stepSim, hashState }). Kept separate from the tests so the
// checks themselves can be pointed at deliberately broken fixtures.

import fs from "node:fs";
import path from "node:path";

// Deterministic pseudo-random input sequence, independent of the sim's own rng.
export function sampleInputs(length, salt = 1) {
  const inputs = [];
  let s = (0x2545f491 ^ salt) >>> 0;
  let held = 0;
  for (let i = 0; i < length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    if (s % 7 === 0) held = (s >>> 8) & 31;
    inputs.push(held);
  }
  return inputs;
}

function runHash(adapter, seed, inputs) {
  const sim = adapter.createSim({ seed });
  for (const bits of inputs) adapter.stepSim(sim, bits);
  return adapter.hashState(sim);
}

// Same seed and inputs must give the same hash on every run, and the hash must
// actually depend on the seed and on the inputs.
export function checkDeterminism(adapter, { seed = 12345, frames = 600, runs = 3 } = {}) {
  const inputs = sampleInputs(frames);
  const hashes = [];
  for (let i = 0; i < runs; i++) hashes.push(runHash(adapter, seed, inputs));
  const problems = [];
  if (new Set(hashes).size !== 1) problems.push(`same seed and inputs gave different hashes: ${hashes.join(", ")}`);
  if (runHash(adapter, seed + 1, inputs) === hashes[0]) problems.push("hash does not depend on the seed");
  if (runHash(adapter, seed, sampleInputs(frames, 2)) === hashes[0]) problems.push("hash does not depend on the inputs");
  return { ok: problems.length === 0, problems, hash: hashes[0] };
}

const FORBIDDEN = [
  [/\bMath\.random\b/, "Math.random"],
  [/\bMath\.(sin|cos|tan|asin|acos|atan|atan2|hypot|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh)\b/, "an engine-dependent Math function (use src/sim/math.js)"],
  [/\bDate\b/, "Date"],
  [/\bperformance\b/, "performance"],
  [/\bwindow\b/, "window"],
  [/\bdocument\b/, "document"],
  [/\brequestAnimationFrame\b/, "requestAnimationFrame"],
  [/\bsetTimeout\b|\bsetInterval\b/, "timers"],
  [/\blocalStorage\b/, "localStorage"],
];

// Static scan: sim sources must not reach for the DOM, the clock or
// Math.random. Comments are ignored.
export function checkPurity(dir) {
  const problems = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) {
      problems.push(...checkPurity(file).problems);
      continue;
    }
    if (!/\.m?js$/.test(name)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      for (const [re, label] of FORBIDDEN) {
        if (re.test(code)) problems.push(`${name}:${i + 1}: uses ${label}`);
      }
    });
  }
  return { ok: problems.length === 0, problems };
}
