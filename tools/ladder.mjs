#!/usr/bin/env node
// Runs a game's simulated players over the same seeds and writes one report with
// results and usage telemetry per policy.
//
//   node tools/ladder.mjs <game-dir> [--policies a,b] [--seeds 16] [--seed-start 1]
//                                    [--max-s 600] [--out file] [--compare file]
//
// --compare <earlier report>: exit 1 unless every shared policy/seed has the same
// fingerprint. Use it around a presentation-only change.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadAdapter, parseArgs, runPolicy } from "./lib/game.mjs";

const args = parseArgs(process.argv.slice(2));
const gameDir = args._[0];
if (!gameDir) {
  console.error("usage: ladder.mjs <game-dir> [--policies a,b] [--seeds N] [--seed-start N] [--max-s S] [--out file] [--compare file]");
  process.exit(2);
}

// Read the comparison baseline before anything is written, and never let the new report
// replace it: comparing a file with itself always "passes".
const out = path.resolve(args.out || path.join(gameDir, "reports", "ladder.json"));
let before = null;
if (args.compare) {
  if (path.resolve(args.compare) === out) {
    console.error(`--compare and the output are the same file (${out}); pass --out for the new report so the baseline is kept`);
    process.exit(2);
  }
  before = JSON.parse(readFileSync(args.compare, "utf8"));
}

const adapter = loadAdapter(gameDir);
const names = args.policies ? args.policies.split(",") : Object.keys(adapter.policies);
const count = +(args.seeds || 16);
const start = +(args["seed-start"] || 1);
const seeds = Array.from({ length: count }, (_, i) => start + i);
const maxS = +(args["max-s"] || 600);

const report = {
  version: "1.0",
  game: path.basename(path.resolve(gameDir)),
  run_config: { seed_set: seeds, tick_s: adapter.tickS, max_s: maxS },
  intent: adapter.intent || null,
  policies: {},
};

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("policy", 16)}${pad("profile", 15)}${pad("score", 10)}${pad("progress", 10)}${pad("success", 9)}${pad("time(s)", 9)}failures/run`);
for (const name of names) {
  const r = runPolicy(adapter, name, seeds, { maxS });
  report.policies[name] = r;
  const fails = Object.entries(r.failures_per_run).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  console.log(
    `${pad(name, 16)}${pad(r.profile, 15)}${pad(r.mean_score, 10)}${pad(r.mean_progress, 10)}${pad(Math.round(r.success_rate * 100) + "%", 9)}${pad(r.mean_elapsed_s, 9)}${fails}`,
  );
}

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(`wrote ${out} (${names.length} policies x ${seeds.length} seeds)`);

if (before) {
  const diffs = [];
  let compared = 0;
  for (const [name, now] of Object.entries(report.policies)) {
    const was = before.policies[name];
    if (!was) continue;
    for (const [seed, fp] of Object.entries(now.fingerprints)) {
      if (!(seed in was.fingerprints)) continue;
      compared++;
      if (was.fingerprints[seed] !== fp) diffs.push(`${name} seed ${seed}`);
    }
  }
  if (!compared) {
    console.log(`compare: no shared policy/seed with ${args.compare}; nothing was checked`);
    process.exit(1);
  }
  if (diffs.length) {
    console.log(`compare: ${diffs.length} of ${compared} runs differ from ${args.compare}: ${diffs.slice(0, 8).join("; ")}${diffs.length > 8 ? " ..." : ""}`);
    process.exit(1);
  }
  console.log(`compare: all ${compared} runs identical to ${args.compare}`);
}
