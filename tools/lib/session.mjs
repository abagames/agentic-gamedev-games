// A review zip as downloaded from the review kit (every run of one build kept in one browser), and
// the checks every agent-side tool applies to it: the build it names, and whether each replay
// still reproduces what was played.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readZip } from "./zip.mjs";

function readSession(zipFile) {
  const files = readZip(readFileSync(zipFile));
  const raw = files.get("session.json");
  if (!raw) throw new Error(`${zipFile} has no session.json; not a review-kit zip`);
  return { session: JSON.parse(raw.toString("utf8")), files };
}

// A run is the same run in two zips when its start time, seed and length match. (The kit puts every
// run of a build kept in the browser into each download, so a later zip repeats the earlier ones.)
const runKey = (r) => `${r.startedAt || ""}|${r.seed}|${r.ticks}`;

// exclude: zips received earlier for the same build; their runs are left out of this one.
export function loadSession(zipFile, { exclude = [] } = {}) {
  const { session, files } = readSession(zipFile);
  const seen = new Set();
  for (const z of exclude) for (const r of readSession(z).session.runs || []) seen.add(runKey(r));
  const all = session.runs || [];
  session.runs = all.filter((r) => !seen.has(runKey(r)));
  const excluded = all.length - session.runs.length;
  const replays = new Map();
  for (const r of session.runs) {
    const f = r.replay && files.get(r.replay);
    if (f) replays.set(r.run, JSON.parse(f.toString("utf8")));
  }
  return { session, replays, files, excluded };
}

// The --exclude option every session tool takes: comma-separated zips.
export const excludeList = (arg) => (arg ? String(arg).split(",").filter(Boolean) : []);
export function reportExcluded(excluded, arg) {
  if (excluded) console.log(`excluded ${excluded} run(s) already in ${excludeList(arg).join(", ")}`);
}

// The directory must be the snapshot the play names (calibrate, replay and replay-stats all check this).
export function checkBuild(dir, build, noun = "play") {
  const file = path.join(path.resolve(dir), "SNAPSHOT.json");
  const snapshot = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (snapshot && snapshot.label === build) return { ok: true, status: `verified (snapshot ${snapshot.label})` };
  const why = snapshot
    ? `this directory is snapshot "${snapshot.label}", but the ${noun} names build "${build}"`
    : `this directory is not a snapshot, so it cannot be shown to be build "${build}"`;
  return { ok: false, why };
}

// What a session can support, by the level the game declared.
export function replayable(session, adapter) {
  if (session.level === "non-deterministic") return "the game declares its rules non-deterministic; hash checks and replay-based figures are skipped";
  if (session.level === "no-adapter") return "the game declares no adapter; replay is unavailable";
  if (!adapter) return "the snapshot has no tests/adapter.cjs; replay is unavailable";
  if (typeof adapter.hash !== "function") return "the adapter has no hash(state); replays cannot be checked, so they are not used";
  return null;
}

// Every recorded hash of a run, by tick: periodic and the end.
export function expectedHashes(replay) {
  const want = new Map();
  for (const [tick, h] of replay.hashes || []) want.set(tick, h);
  if (replay.end) want.set(replay.end.tick, replay.end.hash);
  return want;
}

// Re-simulates one replay. observe(state, tick, input, events) is called after every step.
// Stops at the first hash that differs: what follows it is not evidence about the game.
export function replayRun(adapter, replay, observe) {
  const want = expectedHashes(replay);
  const state = adapter.create(replay.seed);
  const inputs = replay.inputs || [];
  let next = 0;
  let input = {};
  let checked = 0;
  for (let tick = 0; tick < replay.ticks; tick++) {
    while (next < inputs.length && inputs[next][0] <= tick) input = inputs[next++][1] ?? {};
    adapter.step(state, input);
    const t = tick + 1;
    if (observe) observe(state, t, input, adapter.events ? adapter.events(state) || [] : []);
    if (want.has(t)) {
      const got = String(adapter.hash(state));
      if (got !== want.get(t)) return { desync: { tick: t, expected: want.get(t), got }, checked, state };
      checked++;
    }
  }
  return { desync: null, checked, state };
}

// Inputs per tick of a replay, expanded, for figures that read the person's input stream.
export function inputAt(replay) {
  const inputs = replay.inputs || [];
  let next = 0;
  let input = {};
  return (tick) => {
    while (next < inputs.length && inputs[next][0] <= tick) input = inputs[next++][1] ?? {};
    return input;
  };
}
