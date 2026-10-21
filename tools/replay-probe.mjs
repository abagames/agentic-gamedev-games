#!/usr/bin/env node
// Runs a small probe over every run of a review zip, on the build that was played, for questions
// replay-stats.mjs does not answer (what killed the person, the shape of their moves, how often a
// state held). The probe only reads state; the replays are checked as replay.mjs checks them and a
// desynchronised run is left out.
//
//   node tools/replay-probe.mjs <review.zip> <snapshot-dir> <probe.cjs|mjs> [--exclude earlier.zip] [--json out.json]
//
// A probe module exports some of:
//   begin(run, state)                         a run starts (run: its entry in session.json)
//   step(state, tick, input, events, run)     after every step; events from adapter.events
//   end(state, run)                           the run's last step
//   report()                                  -> any value; printed as JSON, and written by --json
//
// Exit codes: 0 the probe ran on at least one run; 1 the build was refused or no run could be used; 2 usage.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadAdapter, parseArgs } from "./lib/game.mjs";
import { checkBuild, excludeList, loadSession, replayRun, replayable, reportExcluded } from "./lib/session.mjs";

const args = parseArgs(process.argv.slice(2));
const [zipFile, dir, probeFile] = args._;
if (!zipFile || !dir || !probeFile) {
  console.error("usage: replay-probe.mjs <review.zip> <snapshot-dir> <probe.cjs|mjs> [--exclude earlier.zip] [--json out.json]");
  process.exit(2);
}
const { session, replays, excluded } = loadSession(zipFile, { exclude: excludeList(args.exclude) });
console.log(`${session.runs.length} run(s) of ${session.slug}, build ${session.build}`);
reportExcluded(excluded, args.exclude);
const build = checkBuild(dir, session.build);
if (!build.ok) {
  console.log(`BUILD NOT VERIFIED: ${build.why}.`);
  process.exit(1);
}
let adapter = null;
try { adapter = loadAdapter(dir); } catch { adapter = null; }
const unavailable = replayable(session, adapter);
if (unavailable) { console.log(`NOTE ${unavailable}.`); process.exit(1); }

const mod = await import(pathToFileURL(path.resolve(probeFile)).href);
const probe = mod.default && typeof mod.default === "object" ? mod.default : mod;
let used = 0;
for (const run of session.runs) {
  const replay = replays.get(run.run);
  if (!replay || replay.seed == null) { console.log(`SKIP run ${run.run}: no replay or seed`); continue; }
  const check = replayRun(adapter, replay);
  if (check.desync) { console.log(`SKIP run ${run.run}: DESYNCHRONISED at tick ${check.desync.tick}`); continue; }
  if (probe.begin) probe.begin(run, adapter.create(replay.seed));
  let last = null;
  replayRun(adapter, replay, (state, tick, input, events) => { last = state; if (probe.step) probe.step(state, tick, input, events, run); });
  if (probe.end && last) probe.end(last, run);
  used++;
}
if (!used) { console.log("No run could be used."); process.exit(1); }
const out = probe.report ? probe.report() : null;
console.log(`probe ran on ${used} run(s):`);
console.log(JSON.stringify(out, null, 2));
if (args.json) writeFileSync(args.json, JSON.stringify(out, null, 2) + "\n");
