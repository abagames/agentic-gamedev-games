// Input replay: a seed plus run-length encoded input bits, one entry per frame.
//   { version: 1, seed: 123, frames: [[bits, count], ...] }
// A run in another mode, or from a later sector, also carries
//   mode: "rapid", start: 11
// A replay without them is a normal run from sector 1.
// A replay saved by the page (?rec=1) also says which build played it and where
// it ended; nothing here reads those:
//   build: "2026-10-11-tuned", via: ["keyboard"],
//   end: { frames: 5400, score: 123400, sector: 7, hash: "1a2b3c4d" }

import { createSim, stepSim } from "./sim.js";
import { sanitizeInput } from "./input.js";

export const REPLAY_VERSION = 1;

export function encodeReplay(seed, inputs, { mode = "normal", startSector = 1 } = {}) {
  const frames = [];
  for (const raw of inputs) {
    const bits = sanitizeInput(raw);
    const last = frames[frames.length - 1];
    if (last && last[0] === bits) last[1]++;
    else frames.push([bits, 1]);
  }
  const replay = { version: REPLAY_VERSION, seed: seed >>> 0, frames };
  if (mode !== "normal") replay.mode = mode;
  if (startSector !== 1) replay.start = startSector;
  return replay;
}

export function expandReplay(replay) {
  if (!replay || replay.version !== REPLAY_VERSION || !Array.isArray(replay.frames)) {
    throw new Error("replay: unsupported or malformed replay");
  }
  const inputs = [];
  for (const [bits, count] of replay.frames) {
    for (let i = 0; i < count; i++) inputs.push(sanitizeInput(bits));
  }
  return inputs;
}

// What createSim needs, besides the seed, to play this replay.
export const replaySetup = (replay) => ({ mode: replay.mode ?? "normal", startSector: replay.start ?? 1 });

export function replayLength(replay) {
  return replay.frames.reduce((n, [, count]) => n + count, 0);
}

// Runs a replay from a fresh sim. maxFrames stops early (for "state at frame N").
export function runReplay(replay, { maxFrames = Infinity, onFrame } = {}) {
  const sim = createSim({ seed: replay.seed, ...replaySetup(replay) });
  const inputs = expandReplay(replay);
  const n = Math.min(inputs.length, maxFrames);
  for (let i = 0; i < n; i++) {
    stepSim(sim, inputs[i]);
    if (onFrame) onFrame(sim);
  }
  return sim;
}
