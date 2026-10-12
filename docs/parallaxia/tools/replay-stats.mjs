#!/usr/bin/env node
// Reads replays saved from the page (?rec=1) and says what the play in
// them looks like in numbers: how often the input changes, where the ship
// stays, how close the bullets come, where the misses come from. With
// --policies, simulated players play the same run (same seed, mode and start,
// for as long) and are measured the same way, so a policy can be seen to
// differ from the person, and where.
//
// A replay is played on the rules of the build that saved it
// (snapshots/<build>/, or the working copy for "dev"), and must end on the
// state hash the page recorded. One that does not is reported and not measured.
//
// Usage:
//   node tools/replay-stats.mjs <replay.json | directory>... [--policies author,keeper,seeker,seeker+human,keeper+human]

import fs from "node:fs";
import path from "node:path";
import { rulesFor, setupOf, replayFiles } from "./lib/rules.mjs";
import { seeker, humanLimited } from "./policies/index.mjs";
import { keeper } from "./policies/keeper.mjs";
import { author } from "./policies/author.mjs";
import { createPlayStats, playStatsStep, playStatsSummary, countsText } from "./lib/playstats.mjs";

const POLICIES = [author, keeper, seeker, humanLimited(keeper), humanLimited(seeker)];
const VARIANTS = 4;

const files = [];
let policyNames = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--policies") policyNames = (argv[++i] ?? "").split(",").filter(Boolean);
  else if (argv[i].startsWith("--")) {
    console.error(`replay-stats: unexpected argument '${argv[i]}'`);
    process.exit(2);
  } else files.push(...replayFiles([argv[i]]));
}
if (files.length === 0) {
  console.error("usage: node tools/replay-stats.mjs <replay.json | directory>... [--policies author,keeper,seeker,keeper+human,seeker+human]");
  process.exit(2);
}
const policies = policyNames.map((name) => {
  const policy = POLICIES.find((p) => p.name === name);
  if (!policy) {
    console.error(`replay-stats: no policy '${name}' (have ${POLICIES.map((p) => p.name).join(", ")})`);
    process.exit(2);
  }
  return policy;
});

function measure(game, setup, inputAt, frames) {
  const sim = game.createSim(setup);
  const stats = createPlayStats();
  for (let t = 0; t < frames; t++) {
    game.stepSim(sim, inputAt(sim, t));
    playStatsStep(stats, sim, game.observe(sim));
  }
  return { stats, sim };
}

const cell = (value) => {
  if (Array.isArray(value)) return value.map(cell).join("..");
  if (!Number.isFinite(value)) return "-";
  return Math.abs(value) >= 1000 ? String(Math.round(value)) : Number.isInteger(value) ? String(value) : value.toFixed(2);
};
// Policies are run several times; their numbers are the mean over the runs.
const meanOf = (summaries) => {
  const out = {};
  for (const key of Object.keys(summaries[0])) {
    const column = summaries.map((s) => s[key]);
    const avg = (values) => {
      const finite = values.filter(Number.isFinite);
      return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN;
    };
    out[key] = Array.isArray(column[0]) ? column[0].map((_, i) => avg(column.map((v) => v[i]))) : avg(column);
  }
  return out;
};

let bad = 0;
for (const file of files) {
  const replay = JSON.parse(fs.readFileSync(file, "utf8"));
  const { game, replays, where } = await rulesFor(replay.build);
  const inputs = replays.expandReplay(replay);
  const setup = setupOf(replay);
  const person = measure(game, setup, (sim, t) => inputs[t], inputs.length);
  const hash = game.hashState(person.sim);
  console.log(`\n${path.basename(file)}`);
  console.log(`  build ${replay.build ?? "(not recorded)"}, rules from ${where}/, ${setup.mode} from sector ${setup.startSector}, seed ${setup.seed}, played by ${(replay.via ?? []).join("+") || "(not recorded)"}`);
  if (!replay.end) console.log("  note: no end state in the file, so the rules could not be checked against the build that played it");
  else if (replay.end.hash !== hash) {
    console.log(`  NOT MEASURED: replaying it ends on ${hash} (score ${person.sim.score}), the page recorded ${replay.end.hash} (score ${replay.end.score}). These are not the rules it was played on.`);
    bad++;
    continue;
  } else console.log(`  replays to the recorded end (${hash})`);

  const columns = [{ name: "person", summary: playStatsSummary(person.stats), misses: countsText(person.stats.misses), breaks: countsText(person.stats.breaks) }];
  for (const policy of policies) {
    const runs = [];
    const misses = {};
    const breaks = {};
    for (let variant = 0; variant < VARIANTS; variant++) {
      const decide = policy.create({ seed: setup.seed, variant });
      const run = measure(game, setup, (sim, t) => decide(game.observe(sim), t), person.stats.frames);
      runs.push(playStatsSummary(run.stats));
      for (const key in run.stats.misses) misses[key] = (misses[key] ?? 0) + run.stats.misses[key];
      for (const key in run.stats.breaks) breaks[key] = (breaks[key] ?? 0) + run.stats.breaks[key];
    }
    columns.push({ name: policy.name, summary: meanOf(runs), misses: countsText(misses), breaks: countsText(breaks) });
  }
  const keys = Object.keys(columns[0].summary);
  const labelWidth = Math.max(...keys.map((k) => k.length));
  const width = Math.max(12, ...columns.map((c) => c.name.length)) + 2;
  console.log(`  ${"".padEnd(labelWidth)}${columns.map((c) => c.name.padStart(width)).join("")}`);
  for (const key of keys) console.log(`  ${key.padEnd(labelWidth)}${columns.map((c) => cell(c.summary[key]).padStart(width)).join("")}`);
  for (const c of columns) console.log(`  ${c.name}${c.name === "person" ? "" : ` (${VARIANTS} runs together)`}: misses from ${c.misses}; chain breaks from ${c.breaks}`);
}
if (policies.length > 0) console.log(`\nnote: each policy column is the mean of ${VARIANTS} runs over the same seed, for as long as the person's run lasted (or until the policy's own game over; 'ended' is the share that ended early or at the end).`);
console.log("note: not measured here: what the person was looking at, and how long after a threat appears the input answers it.");
process.exit(bad === 0 ? 0 : 1);
