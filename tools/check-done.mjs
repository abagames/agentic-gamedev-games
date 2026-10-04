#!/usr/bin/env node
// Checks that a game slice carries the records AGENTS.md asks for before a completion
// report is written. It checks that things exist, not that the game is good.
//
//   node tools/check-done.mjs <game-dir> [--stage slice|finished] [--snapshots dir]
//
// --stage slice (default): the first playable version, before the user decides to finish it.
// --stage finished: after the refinement loop; also needs the revision log.
//
// MISSING items fail the check. ABSENT items are optional evidence: say in the README why
// each is absent, or produce it.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/game.mjs";

const args = parseArgs(process.argv.slice(2));
const gameDir = args._[0];
const stage = args.stage || "slice";
if (!gameDir || !["slice", "finished"].includes(stage)) {
  console.error("usage: check-done.mjs <game-dir> [--stage slice|finished] [--snapshots dir]");
  process.exit(2);
}
const dir = path.resolve(gameDir);
const slug = path.basename(dir);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshots = path.resolve(args.snapshots || path.join(repo, "tmp", "snapshots"), slug);
const read = (f) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), "utf8") : null);

const missing = [];
const absent = [];
const ok = [];
const need = (cond, label) => (cond ? ok : missing).push(label);
const want = (cond, label) => (cond ? ok : absent).push(label);

need(existsSync(path.join(dir, "index.html")), "index.html");

// Contents are not checked by keyword: these files may be written in any language and
// under any headings. Existence is checked here; the reminders at the end list the rest.
const readme = read("README.md");
need(readme !== null && readme.trim().length > 0, "README.md");

// The revision log belongs to finishing; a slice has no revisions yet.
const history = read("REVISION_HISTORY.md");
if (stage === "finished") need(history !== null && history.trim().length > 0, "REVISION_HISTORY.md");

const snaps = existsSync(snapshots) ? readdirSync(snapshots).filter((n) => /^\d+-/.test(n)) : [];
need(snaps.length > 0, `a snapshot of the first playable build under ${path.relative(repo, snapshots)}`);

// Optional evidence. AGENTS.md does not prescribe how a game is tested or measured.
const pkg = read("package.json");
const hasTests = (pkg !== null && /"test"\s*:/.test(pkg)) || existsSync(path.join(dir, "tests")) || existsSync(path.join(dir, "test"));
want(hasTests, "a test entry point (a package.json test script, or a tests/ directory)");
want(existsSync(path.join(dir, "tests", "adapter.cjs")), "tests/adapter.cjs (simulated players through tools/ladder.mjs)");
const ladder = path.join(dir, "reports", "ladder.json");
if (existsSync(ladder)) {
  const newest = ["core.js", "bots.js", "main.js"]
    .map((f) => path.join(dir, f))
    .filter(existsSync)
    .reduce((t, f) => Math.max(t, statSync(f).mtimeMs), 0);
  want(statSync(ladder).mtimeMs >= newest, "reports/ladder.json newer than the game's source");
} else want(false, "reports/ladder.json");
want(existsSync(path.join(dir, "evidence", "shots", "frames.json")), "evidence/shots/frames.json (tools/shots.mjs)");
want(readme !== null && /RUN v1/.test(readme + (read("main.js") || "") + (read("core.js") || "")), "end-of-run summary line (RUN v1 ...)");

console.log(`checked ${slug} as ${stage}: ${ok.length} present`);
for (const m of missing) console.log(`MISSING ${m}`);
for (const a of absent) console.log(`ABSENT  ${a}`);
console.log(missing.length ? `${missing.length} missing, ${absent.length} absent` : `nothing missing; ${absent.length} optional item(s) absent`);
console.log("REMIND  read these yourself; the tool does not check wording:");
console.log("REMIND  README covers every item in AGENTS.md's README list, and explains each ABSENT item above");
if (stage === "finished") {
  console.log("REMIND  REVISION_HISTORY states the intent, what was not adopted, what was never measured, and whether difficulty is calibrated (and on which build)");
} else {
  console.log("REMIND  the completion report lists the structural weaknesses that remain, and does not rate how promising the slice is");
}
process.exit(missing.length ? 1 : 0);
