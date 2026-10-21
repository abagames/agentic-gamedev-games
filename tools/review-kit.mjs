#!/usr/bin/env node
// Copies the review kit into a game as review/review.js, or checks the copy.
//
//   node tools/review-kit.mjs <game-dir>            copy the kit and print the wiring the game needs
//   node tools/review-kit.mjs <game-dir> --check    report whether it is wired in, and at which level;
//                                                   on a snapshot, also the play link to hand over
//
// The kit lives in the game's directory so that snapshots and promoted copies carry it.
// Wiring is described in tools/README.md ("Review kit").
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadAdapter, parseArgs } from "./lib/game.mjs";
import { KIT_SOURCE, engineMathInRules, kitStatus, playLinks } from "./lib/review-kit.mjs";

const args = parseArgs(process.argv.slice(2), { check: "bool" });
const dir = args._[0];
const unknown = Object.keys(args).filter((k) => k !== "_" && k !== "check");
if (!dir || args._.length > 1 || unknown.length || !existsSync(path.join(dir, "index.html"))) {
  if (unknown.length) console.error(`unknown option: ${unknown.map((k) => `--${k}`).join(", ")}`);
  console.error("usage: review-kit.mjs <game-dir> [--check]   (the directory must hold index.html)");
  process.exit(2);
}
// A snapshot is the build as played: only --check may look at it.
if (!args.check && existsSync(path.join(dir, "SNAPSHOT.json"))) {
  console.error(`${dir} is a snapshot; install the kit in the game under tmp/games/ and take a new snapshot (or pass --check)`);
  process.exit(2);
}
if (!args.check) {
  mkdirSync(path.join(dir, "review"), { recursive: true });
  copyFileSync(KIT_SOURCE, path.join(dir, "review", "review.js"));
  console.log(`copied the review kit to ${path.join(dir, "review", "review.js")}`);
}
const s = kitStatus(dir);
console.log(s.present ? `review kit: PRESENT, level ${s.level || "(not declared)"}${s.current ? "" : ", copy differs from tools/review/review.js"}` : "review kit: ABSENT");
for (const p of s.problems) console.log(`  - ${p}`);
if (s.present && existsSync(path.join(dir, "SNAPSHOT.json"))) for (const l of playLinks(dir)) console.log(`play link: ${l}`);
if (s.level === "replay" && existsSync(path.join(dir, "tests", "adapter.cjs"))) {
  const used = engineMathInRules(loadAdapter(dir), { seeds: [1], maxTicks: 1800 });
  if (Object.keys(used).length) {
    console.log(`WARN the rules call ${Object.keys(used).map((f) => `Math.${f}`).join(", ")} inside step; these differ between JS engines,`);
    console.log("     so runs played in a browser will desynchronise under Node. See tools/README.md, \"Review kit\".");
  }
}
if (!args.check && !s.present) {
  console.log(`
Wire it in (see tools/README.md, "Review kit"):
  index.html, before the game's scripts:
    <script>/[?&]review=1(&|$)/.test(location.search) && document.write('<script src="review/review.js"><\\/script>')</script>
  the game:
    window.REVIEW && REVIEW.attach({ slug, build, level: 'replay', key: 'KeyN', used: [...], hash: () => rules.hash(state) });
    window.REVIEW && REVIEW.runStart({ seed });        // a run begins
    window.REVIEW && REVIEW.step(input);               // right after each rules step
    window.REVIEW && REVIEW.runEnd(summaryLine);       // a run ends`);
}
process.exit(args.check && !s.present ? 1 : 0);
