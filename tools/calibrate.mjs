#!/usr/bin/env node
// Places a play report on the game's skill axis, on the build that was played.
//
//   node tools/calibrate.mjs <snapshot-dir> --summary "RUN v1 build=... progress=..."
//        [--metrics progress,failures,score,time] [--seeds 12] [--steps 10] [--allow-unverified-build]
//
// Needs adapter.skillPolicy(t, seed): one family of policies from t=0 (weakest modelled
// player) to t=1 (strongest policy). One report cannot fix several parameters, so the
// only thing fitted is t.
//
// Exit codes: 0 a skill range was identified; 1 the report cannot be placed
// (wrong or unverified build, or no metric tells the policies apart); 2 usage.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadAdapter, parseArgs, runOne, summarize } from "./lib/game.mjs";
import { parseRunSummary } from "./lib/run-summary.mjs";

const METRICS = {
  progress: { sim: (s) => s.median_progress, rep: (r) => r.progress },
  score: { sim: (s) => s.median_score, rep: (r) => r.score },
  time: { sim: (s) => s.mean_elapsed_s, rep: (r) => r.timeS },
  failures: {
    sim: (s) => Object.values(s.failures_per_run).reduce((a, b) => a + b, 0),
    rep: (r) => r.totalFailures,
  },
};

const args = parseArgs(process.argv.slice(2), { "allow-unverified-build": "bool" });
const dir = args._[0];
if (!dir || !args.summary) {
  console.error('usage: calibrate.mjs <snapshot-dir> --summary "RUN v1 ..." [--metrics a,b] [--seeds N] [--steps N] [--allow-unverified-build]');
  process.exit(2);
}
const wanted = (args.metrics || "progress,failures,score").split(",");
const unknown = wanted.filter((m) => !METRICS[m]);
if (unknown.length) {
  console.error(`unknown metric(s): ${unknown.join(", ")} (have: ${Object.keys(METRICS).join(", ")})`);
  process.exit(2);
}

const report = parseRunSummary(args.summary);

// A report is evidence about the build that was played. Check that this directory is it.
const snapshotFile = path.join(path.resolve(dir), "SNAPSHOT.json");
const snapshot = existsSync(snapshotFile) ? JSON.parse(readFileSync(snapshotFile, "utf8")) : null;
let buildStatus;
if (snapshot && snapshot.label === report.build) buildStatus = `verified (snapshot ${snapshot.label})`;
else {
  const why = snapshot
    ? `this directory is snapshot "${snapshot.label}", but the report names build "${report.build}"`
    : `this directory is not a snapshot, so it cannot be shown to be build "${report.build}"`;
  if (!args["allow-unverified-build"]) {
    console.log(`BUILD NOT VERIFIED: ${why}.`);
    console.log("Run this on the snapshot that was played, or pass --allow-unverified-build to fit anyway.");
    process.exit(1);
  }
  buildStatus = `NOT VERIFIED (${why})`;
}

const adapter = loadAdapter(dir);
if (typeof adapter.skillPolicy !== "function") {
  console.error("adapter has no skillPolicy(t, seed); calibration needs a single skill axis");
  process.exit(2);
}
const seeds = Array.from({ length: +(args.seeds || 12) }, (_, i) => i + 1);
const steps = +(args.steps || 10);

const rows = [];
for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  const runs = seeds.map((seed) => runOne(adapter, adapter.skillPolicy(t, seed), seed, { maxS: +(args["max-s"] || 600) }));
  const s = summarize(runs);
  const row = { t };
  for (const m of wanted) row[m] = +METRICS[m].sim(s).toFixed(2);
  rows.push(row);
}

// A metric that is the same for every skill level cannot place anyone. Drop it and say so.
const spread = (m) => Math.max(...rows.map((r) => r[m])) - Math.min(...rows.map((r) => r[m]));
const used = wanted.filter((m) => spread(m) > 0);
const flat = wanted.filter((m) => spread(m) === 0);

console.log(`report: build ${report.build}; ${wanted.map((m) => `${m} ${METRICS[m].rep(report)}`).join(", ")}`);
console.log(`build: ${buildStatus}`);
console.log(["t   ", ...wanted.map((m) => m.padEnd(9)), "distance"].join("  "));

if (!used.length) {
  for (const r of rows) console.log([r.t.toFixed(2), ...wanted.map((m) => String(r[m]).padEnd(9)), "-"].join("  "));
  console.log(`NOT IDENTIFIED: ${flat.join(", ")} ${flat.length > 1 ? "are" : "is"} the same at every skill level, so the report cannot be placed.`);
  console.log("Choose a metric that separates the policies with --metrics, or accept that this game's outcome does not depend on the modelled skill.");
  process.exit(1);
}

// Distance in units of each metric's spread across the axis, so the metrics weigh alike.
for (const r of rows) {
  r.distance = +used.reduce((d, m) => d + Math.abs(r[m] - METRICS[m].rep(report)) / spread(m), 0).toFixed(3);
}
const bestD = Math.min(...rows.map((r) => r.distance));
// Candidates that fit about as well as the best are all reported: a tie is not a result.
const tolerance = 0.05 * used.length;
const fits = rows.filter((r) => r.distance <= bestD + tolerance);
for (const r of rows) {
  console.log([r.t.toFixed(2), ...wanted.map((m) => String(r[m]).padEnd(9)), r.distance + (fits.includes(r) ? "  <- fits" : "")].join("  "));
}
if (flat.length) console.log(`NOTE ${flat.join(", ")} did not vary with skill and ${flat.length > 1 ? "were" : "was"} ignored`);

const lo = fits[0].t;
const hi = fits[fits.length - 1].t;
const contiguous = fits.every((r, i) => i === 0 || Math.round((r.t - fits[i - 1].t) * steps) === 1);
if (!contiguous || fits.length > rows.length / 2) {
  console.log(`NOT IDENTIFIED: ${fits.length} of ${rows.length} skill levels fit equally well (t in ${fits.map((r) => r.t.toFixed(2)).join(", ")}).`);
  console.log("The chosen metrics do not separate them. Add a metric that does, or use more seeds.");
  process.exit(1);
}
console.log(lo === hi ? `skill t=${lo.toFixed(2)} over ${seeds.length} seeds, using ${used.join(", ")}` : `skill t between ${lo.toFixed(2)} and ${hi.toFixed(2)} over ${seeds.length} seeds, using ${used.join(", ")}`);

const beyond = (m, sign) => used.includes(m) && sign * (METRICS[m].rep(report) - rows[sign > 0 ? rows.length - 1 : 0][m]) > 0;
if (hi === 1 && (beyond("progress", 1) || beyond("score", 1))) {
  console.log("NOTE the reporter outperforms the strongest policy. Read that policy's failures: bad choices mean weak decisions, late or imprecise execution means limits that are too harsh.");
} else if (lo === 0 && (beyond("progress", -1) || beyond("score", -1))) {
  console.log("NOTE the reporter is below the weakest modelled player. Add a weaker rung, or a limit the report's failures point to.");
}
if (Object.keys(report.failures).length) {
  console.log(`NOTE the report's failures by cause (${Object.entries(report.failures).map(([c, n]) => `${c} ${n}`).join(", ")}) are not fitted; compare them with the policy's failures by hand.`);
}
console.log("NOTE this places one player on one build. Re-run the ladder on the current build before changing difficulty.");
