#!/usr/bin/env node
// How near the fitted policy (tools/policies/author.mjs) comes to the author's
// own play, and a search for the numbers that bring it nearer.
//
// Each replay in replays/ is measured, then the policy plays the same run
// (seed, mode, start) for as long, several times over, and the numbers that
// matter for a model of the person are set side by side.
//
// The policy plays with its ships kept topped up (--no-pin turns that off),
// so that a run that would have ended early still says how often it is hit
// later on, where the person got to. Misses per minute are then comparable;
// how far a run gets is not, and is reported from the unpinned runs.
//
// Usage:
//   node tools/human-fit.mjs [replays...] [--variants 8] [--first 0] [--no-pin]
//        [--params '{"common":{"latency":14}}' | --params file.json] [--policy author|keeper|seeker]
//        [--tune 3 [--only close|chain|graze|common] [--out file.json]]
//        [--free 12]
//
// --tune N: N rounds of trying each number a step up and a step down and
// keeping what brings the policy nearer (coordinate descent on `loss` below).
// --free N: instead of the comparison, whole runs with the ships the game
// gives, to their end (20 minutes at most): N on the person's seed and N on
// other seeds, against where the person's one run ended.
// --first: the first variant to play; a fit is checked on variants it was not
// made on.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./serve.mjs";
import { rulesFor, setupOf, replayFiles } from "./lib/rules.mjs";
import { seeker } from "./policies/index.mjs";
import { keeper } from "./policies/keeper.mjs";
import { authorWith, AUTHOR_DEFAULTS } from "./policies/author.mjs";
import { createPlayStats, playStatsStep, playStatsSummary, countsText } from "./lib/playstats.mjs";

const opts = { variants: 8, first: 0, pin: true, params: {}, policy: "author", files: [], tune: 0, only: null, out: null, free: 0 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--variants") opts.variants = Number(argv[++i]);
  else if (argv[i] === "--first") opts.first = Number(argv[++i]);
  else if (argv[i] === "--no-pin") opts.pin = false;
  else if (argv[i] === "--params") {
    const value = argv[++i];
    opts.params = JSON.parse(value.trim().startsWith("{") ? value : fs.readFileSync(value, "utf8"));
  } else if (argv[i] === "--policy") opts.policy = argv[++i];
  else if (argv[i] === "--tune") opts.tune = Number(argv[++i]);
  else if (argv[i] === "--only") opts.only = argv[++i];
  else if (argv[i] === "--out") opts.out = argv[++i];
  else if (argv[i] === "--free") opts.free = Number(argv[++i]);
  else if (argv[i].startsWith("--")) {
    console.error(`human-fit: unexpected argument '${argv[i]}'`);
    process.exit(2);
  } else opts.files.push(argv[i]);
}
const policyFor = (params) => ({ author: authorWith(params), keeper, seeker })[opts.policy];
if (!policyFor({})) {
  console.error(`human-fit: no policy '${opts.policy}'`);
  process.exit(2);
}

// What is compared, and how much each counts in the search. [key, weight,
// scale]: the difference is taken as a share of the person's value, or, with a
// scale, in units of that scale. A pair's index picks one end of a range.
const TERMS = [
  ["misses/min", 3, null],
  ["sudden misses/min", 2, 0.3],
  ["late-seen misses/min", 2, 0.4],
  ["lost-bullet misses/min", 2, 0.4],
  // How the misses rise with the rank is what a difficulty will be set on.
  ["misses/min, first loop", 2, 0.4],
  ["misses/min, later loops", 2, null],
  ["score/min", 2, null],
  ["multiplier at a kill, mean", 1, null],
  ["rate, mean", 1, null],
  ["kills/min", 1, null],
  ["chain, mean", 1, null],
  ["chain breaks/min", 1, null],
  ["grazes/min", 1, null],
  ["ship y, median", 1, 3],
  ["ship y, 10%..90%", 0.5, 3, 0],
  ["ship y, 10%..90%", 0.5, 3, 1],
  ["ship x, spread (sd)", 0.5, 1.5],
  ["nearest bullet, median", 0.5, null],
  ["nearest bullet, closest 10%", 1, null],
  ["input changes/s", 0.5, null],
  ["move hold, median frames", 0.5, null],
  ["still, share", 0.5, 0.15],
  ["shot releases/min", 0.5, null],
  ["locks per volley", 0.5, null],
];
const SHOWN = ["seconds", "sector", ...new Set(TERMS.map((t) => t[0]))];

const cell = (value) => {
  if (Array.isArray(value)) return value.map(cell).join("..");
  if (!Number.isFinite(value)) return "-";
  return Math.abs(value) >= 1000 ? String(Math.round(value)) : Number.isInteger(value) ? String(value) : value.toFixed(2);
};
const avg = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN;
};

// The replays, each with the person's numbers.
const cases = [];
for (const file of replayFiles(opts.files.length ? opts.files : [path.join(ROOT, "replays")])) {
  const replay = JSON.parse(fs.readFileSync(file, "utf8"));
  const { game, replays } = await rulesFor(replay.build);
  const inputs = replays.expandReplay(replay);
  const setup = setupOf(replay);
  const run = (inputAt, frames, pin) => {
    const sim = game.createSim(setup);
    const stats = createPlayStats();
    for (let t = 0; t < frames; t++) {
      game.stepSim(sim, inputAt(sim, t));
      if (pin && sim.lives < 2) sim.lives = 2;
      playStatsStep(stats, sim, game.observe(sim));
    }
    return stats;
  };
  const person = run((sim, t) => inputs[t], inputs.length, false);
  if (replay.end && replay.end.score !== person.score) {
    console.log(`${path.basename(file)}: does not replay to its recorded end; skipped`);
    continue;
  }
  cases.push({ file, game, setup, run, person, mine: playStatsSummary(person), style: game.observe(game.createSim(setup)).scoring });
}

function play(c, params) {
  const policy = policyFor(params);
  const theirs = [];
  const causes = {};
  for (let variant = opts.first; variant < opts.first + opts.variants; variant++) {
    const decide = policy.create({ seed: c.setup.seed, variant });
    const stats = c.run((sim, t) => decide(c.game.observe(sim), t), c.person.frames, opts.pin);
    for (const key in stats.misses) causes[key] = (causes[key] ?? 0) + stats.misses[key];
    theirs.push(playStatsSummary(stats));
  }
  const mean = {};
  for (const key of SHOWN) mean[key] = Array.isArray(c.mine[key]) ? c.mine[key].map((_, i) => avg(theirs.map((s) => s[key][i]))) : avg(theirs.map((s) => s[key]));
  let loss = 0;
  for (const [key, weight, scale, index] of TERMS) {
    const a = index === undefined ? c.mine[key] : c.mine[key][index];
    const b = index === undefined ? mean[key] : mean[key][index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    // (A number the mode does not use is the same on both sides: 0 or 1.)
    const d = scale === null ? (b - a) / Math.max(Math.abs(a), 1e-6) : (b - a) / scale;
    loss += weight * d * d;
  }
  return { theirs, mean, causes, loss };
}

function show(c, result, name) {
  const spread = (key) => {
    const values = result.theirs.map((s) => s[key]).filter(Number.isFinite);
    return values.length ? `${cell(Math.min(...values))}..${cell(Math.max(...values))}` : "-";
  };
  console.log(`\n${c.setup.mode} (${c.style}), seed ${c.setup.seed}: person against ${name}, ${opts.variants} runs from variant ${opts.first}${opts.pin ? ", ships kept topped up" : ""}; loss ${result.loss.toFixed(3)}`);
  console.log(`  ${"".padEnd(30)}${"person".padStart(16)}${"policy mean".padStart(16)}   lowest..highest run`);
  for (const key of SHOWN) console.log(`  ${key.padEnd(30)}${cell(c.mine[key]).padStart(16)}${cell(result.mean[key]).padStart(16)}   ${Array.isArray(c.mine[key]) ? "" : spread(key)}`);
  console.log(`  misses, person: ${countsText(c.person.misses)}`);
  console.log(`  misses, policy (${opts.variants} runs together): ${countsText(result.causes)}`);
}

// What the search may change: [group, key, step, lowest, highest].
const STYLE = [
  ["berth", 0.2, 1, 5],
  ["caution", 1, 1, 12],
  ["restY", 1, -14, 8],
  ["below", 1, 2, 18],
  ["ceilY", 1, -12, 12],
  ["floorY", 1, -14.5, 0],
  ["weightX", 0.25, 0.25, 3],
  ["weightY", 0.1, 0.05, 1.5],
  ["foresee", 0.5, 0, 6],
  ["sweep", 0.25, 0, 3],
];
const KNOBS = [
  ["common", "latency", 2, 4, 24],
  ["common", "noise", 0.02, 0, 0.3],
  ["common", "free", 1, 0, 16],
  ["common", "focus", 1, 2, 20],
  ["common", "lapse", 0.05, 0, 1],
  ["common", "wake", 0.5, 1, 6],
  ["common", "think", 1, 3, 10],
  ["common", "thinkJitter", 1, 0, 8],
  ["common", "volley", 1, 1, 4],
  ["common", "stall", 3, 3, 30],
  ...["close", "chain", "graze"].flatMap((style) => STYLE.map((k) => [style, ...k])),
  ["graze", "lure", 0.04, 0, 0.6],
  ["close", "belowBig", 1, 3, 16],
  ["close", "belowBoss", 1, 3, 16],
];

const params = { common: { ...opts.params.common }, close: { ...opts.params.close }, chain: { ...opts.params.chain }, graze: { ...opts.params.graze } };
const valueOf = (group, key) => params[group][key] ?? AUTHOR_DEFAULTS[group][key] ?? AUTHOR_DEFAULTS.common[key];
// A number of one mode only touches that mode's replays.
const lossOf = (group) => cases.filter((c) => group === "common" || c.style === group).reduce((sum, c) => sum + play(c, params).loss, 0);

if (opts.free > 0) {
  const policy = policyFor(params);
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const line = (runs) => `${cell(Math.min(...runs))} / ${cell(median(runs))} / ${cell(Math.max(...runs))}`;
  for (const c of cases) {
    console.log(`\n${c.setup.mode} (${c.style}): the person's run ended at ${cell(c.mine.seconds)} s, sector ${c.mine.sector}, ${c.mine.score} points`);
    for (const [name, seedOf] of [["the person's seed", () => c.setup.seed], ["other seeds", (i) => 9001 + i]]) {
      const runs = [];
      for (let i = 0; i < opts.free; i++) {
        const setup = { ...c.setup, seed: seedOf(i) };
        const sim = c.game.createSim(setup);
        const decide = policy.create({ seed: setup.seed, variant: opts.first + i });
        let t = 0;
        while (t < 72000 && !c.game.isEnded(sim)) c.game.stepSim(sim, decide(c.game.observe(sim), t++));
        runs.push({ seconds: t / 60, sector: sim.stage.section + 1, score: sim.score });
      }
      console.log(`  ${policy.name}, ${opts.free} runs on ${name} (lowest / median / highest): ${line(runs.map((r) => r.seconds))} s, sector ${line(runs.map((r) => r.sector))}, ${line(runs.map((r) => r.score))} points; ${runs.filter((r) => r.seconds < c.mine.seconds).length} ended sooner than the person's`);
    }
  }
  process.exit(0);
}

if (opts.tune > 0) {
  for (let round = 1; round <= opts.tune; round++) {
    let changed = 0;
    for (const [group, key, step, low, high] of KNOBS) {
      if (opts.only && opts.only !== group) continue;
      if (group !== "common" && !cases.some((c) => c.style === group)) continue;
      const start = valueOf(group, key);
      let best = lossOf(group);
      let bestValue = start;
      for (const dir of [1, -1]) {
        // Keep going the way that helps.
        for (let n = 1; n <= 4; n++) {
          const value = Math.round((start + dir * step * n) * 1000) / 1000;
          if (value < low || value > high) break;
          params[group][key] = value;
          const loss = lossOf(group);
          if (loss < best * 0.99) {
            best = loss;
            bestValue = value;
          } else break;
        }
        if (bestValue !== start) break;
      }
      params[group][key] = bestValue;
      if (bestValue !== start) {
        changed++;
        console.log(`round ${round}: ${group}.${key} ${start} -> ${bestValue}  (loss ${best.toFixed(3)})`);
      }
    }
    if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(params, null, 2));
    console.log(`round ${round}: ${changed} changed, loss ${lossOf("common").toFixed(3)}`);
    if (changed === 0) break;
  }
  console.log(`\nfitted: ${JSON.stringify(params)}`);
}

let total = 0;
for (const c of cases) {
  const result = play(c, params);
  total += result.loss;
  show(c, result, policyFor(params).name);
}
console.log(`\ntotal loss ${total.toFixed(3)}`);
