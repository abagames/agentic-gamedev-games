#!/usr/bin/env node
// Checks that the runs in a review zip reproduce on the build they were played on.
//
//   node tools/replay.mjs <review.zip> <snapshot-dir> [--exclude earlier.zip[,...]] [--json out.json]
//
// Verifies the build as calibrate.mjs does and refuses any other. Replays each run through the
// snapshot's tests/adapter.cjs and checks every recorded state hash; a mismatch is a
// desynchronised replay, reported with its first mismatching tick and not read as evidence.
// It never re-records, edits or migrates a replay.
//
// Exit codes: 0 every run checked out; 1 the build was refused or a replay is desynchronised; 2 usage.
import { writeFileSync } from "node:fs";
import { loadAdapter, parseArgs } from "./lib/game.mjs";
import { checkBuild, excludeList, loadSession, replayRun, replayable, reportExcluded } from "./lib/session.mjs";
import { engineMathInRules } from "./lib/review-kit.mjs";

const args = parseArgs(process.argv.slice(2));
const [zipFile, dir] = args._;
if (!zipFile || !dir) {
  console.error("usage: replay.mjs <review.zip> <snapshot-dir> [--exclude earlier.zip[,...]] [--json out.json]");
  process.exit(2);
}
const { session, replays, excluded } = loadSession(zipFile, { exclude: excludeList(args.exclude) });

console.log(`${session.runs.length} run(s) of ${session.slug}, build ${session.build}, level ${session.level}`);
reportExcluded(excluded, args.exclude);
const build = checkBuild(dir, session.build);
if (!build.ok) {
  console.log(`BUILD NOT VERIFIED: ${build.why}.`);
  console.log("Run this on the snapshot that was played. A replay is evidence only about the build it was played on.");
  process.exit(1);
}
console.log(`build: ${build.status}`);
if (session.buildConstant && session.buildConstant !== session.build) {
  console.log(`NOTE the game called itself ${session.buildConstant} while served from snapshot ${session.build}; the snapshot label is used.`);
}

let adapter = null;
try { adapter = loadAdapter(dir); } catch { adapter = null; }
const unavailable = replayable(session, adapter);
if (unavailable) console.log(`NOTE ${unavailable}.`);

const clock = (tick) => {
  const s = Math.round(tick * (adapter ? adapter.tickS : 1 / 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const report = { slug: session.slug, build: session.build, level: session.level, runs: [] };
let desynced = 0;
for (const run of session.runs) {
  const replay = replays.get(run.run);
  const r = { run: run.run, startedAt: run.startedAt || null, seed: run.seed, ticks: run.ticks, summary: run.summary, status: null };
  report.runs.push(r);
  if (unavailable || !replay) r.status = unavailable ? "not replayed" : "no replay in the zip";
  else if (replay.seed === null || replay.seed === undefined) r.status = "no seed recorded; not replayed";
  else {
    const res = replayRun(adapter, replay);
    if (res.desync) {
      desynced++;
      r.status = `DESYNCHRONISED at tick ${res.desync.tick} (recorded ${res.desync.expected}, replayed ${res.desync.got})`;
    } else if (!res.checked) r.status = "no recorded hash to check; not verified, and not used as evidence";
    else r.status = `replayed, ${res.checked} hash(es) match`;
  }
  console.log("");
  console.log(`run ${run.run}: ${run.startedAt ? `started ${run.startedAt}, ` : ""}seed ${run.seed}, ${run.ticks} ticks (${clock(run.ticks)})${run.abandoned ? ", left before the end" : ""}`);
  console.log(`  summary: ${run.summary || "(none)"}`);
  console.log(`  ${r.status}${r.status.startsWith("DESYNC") ? ". Not used as evidence about the game." : ""}`);
}

if (desynced) {
  console.log(`\n${desynced} desynchronised replay(s): find out why before reading anything from them.`);
  const used = Object.keys(engineMathInRules(adapter, { seeds: [1], maxTicks: 1800 }));
  if (used.length) console.log(`A likely cause: the rules call ${used.map((f) => `Math.${f}`).join(", ")} in step, which differ between JS engines (see tools/README.md, "Review kit").`);
  else console.log("The rules call no engine-dependent Math function in step; look for state the page changes outside step, or input the rules read that the kit did not record.");
}
if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2) + "\n");
process.exit(desynced ? 1 : 0);
