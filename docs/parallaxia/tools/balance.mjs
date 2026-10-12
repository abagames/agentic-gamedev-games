#!/usr/bin/env node
// Runs the policy comparison on the game sim and writes the report to
// artifacts/balance/report.json. Until the sim has scoring this reports
// "skipped": there is nothing to compare, and an empty comparison must not
// read as a pass.
//
// Usage: node tools/balance.mjs [--ticks 3600] [--variants 8]

import fs from "node:fs";
import path from "node:path";
import * as game from "../src/sim/sim.js";
import { evaluate } from "./lib/balance.mjs";
import { ROOT } from "./serve.mjs";

const opts = { maxTicks: 3600, variants: 8 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--ticks") opts.maxTicks = Number(argv[++i]);
  else if (argv[i] === "--variants") opts.variants = Number(argv[++i]);
  else {
    console.error(`balance: unexpected argument '${argv[i]}'`);
    process.exit(2);
  }
}

const outDir = path.join(ROOT, "artifacts", "balance");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "report.json");

if (!game.capabilities.scoring) {
  fs.writeFileSync(outFile, JSON.stringify({ version: "1.0", status: "skipped", reason: "sim has no scoring yet" }, null, 2) + "\n");
  console.log("SKIP balance: sim has no scoring yet (capabilities.scoring is false)");
  process.exit(0);
}

const adapter = {
  createSim: game.createSim,
  stepSim: game.stepSim,
  getScore: game.getScore,
  isEnded: game.isEnded,
  observe: game.observe,
  capabilities: game.capabilities,
  fps: game.FPS,
};
const report = evaluate(adapter, opts);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
for (const [name, c] of Object.entries(report.monotonous.cases)) {
  console.log(`  ${name.padEnd(15)} score ${String(c.score).padStart(7)}  ${c.elapsed.toFixed(1)}s${c.ended ? "  ended" : ""}`);
}
const xb = report.exploratory.best;
console.log(`  ${report.exploratory.best_policy.padEnd(15)} score ${String(xb.score).padStart(7)}  ${xb.elapsed.toFixed(1)}s${xb.ended ? "  ended" : ""}  (${xb.input_changes_per_s.toFixed(1)} input changes/s)`);
const hl = report.profile_results.human_limited;
console.log(`  human-limited   mean score ${Math.round(hl.mean_score)}  mean ${hl.mean_elapsed.toFixed(1)}s`);
console.log(`monotonous max ${report.monotonous.max_score} (${report.monotonous.max_case}), exploratory best ${report.exploratory.best.score}`);
console.log(`exploratory_ratio ${report.exploratory_ratio} -> ${report.verdict}`);
console.log(`report: ${path.relative(process.cwd(), outFile)}`);
console.log("note: this detects degenerate play only; it does not measure fun.");
process.exit(report.verdict === "fail" ? 1 : 0);
