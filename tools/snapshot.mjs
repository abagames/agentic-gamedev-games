#!/usr/bin/env node
// Copies a game build to tmp/snapshots/<slug>/<NN>-<label>/ so that a play report can be
// reproduced on the build that was played.
//
//   node tools/snapshot.mjs <game-dir> <label> [--root dir]
//
// Skips dotfiles, node_modules, reports, and evidence. Dotfiles are skipped on purpose:
// sandbox placeholder files among them cannot be copied.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/game.mjs";

const SKIP = new Set(["node_modules", "reports", "evidence"]);
const args = parseArgs(process.argv.slice(2));
const [gameDir, label] = args._;
if (!gameDir || !label || !/^[a-z0-9][a-z0-9-]*$/.test(label)) {
  console.error("usage: snapshot.mjs <game-dir> <label> [--root dir]   (label: lowercase letters, digits, hyphens)");
  process.exit(2);
}
const src = path.resolve(gameDir);
if (!existsSync(path.join(src, "index.html"))) {
  console.error(`${src} has no index.html; not a game directory`);
  process.exit(2);
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(args.root || path.join(repo, "tmp", "snapshots"), path.basename(src));
mkdirSync(root, { recursive: true });
const taken = readdirSync(root).map((n) => parseInt(n, 10)).filter(Number.isFinite);
const index = String((taken.length ? Math.max(...taken) : 0) + 1).padStart(2, "0");
const dest = path.join(root, `${index}-${label}`);

const files = [];
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const a = path.join(from, name);
    const b = path.join(to, name);
    const st = statSync(a);
    if (st.isDirectory()) copyDir(a, b);
    else if (st.isFile()) {
      copyFileSync(a, b);
      files.push({ path: path.relative(src, a), sha1: createHash("sha1").update(readFileSync(a)).digest("hex") });
    }
  }
}
copyDir(src, dest);
writeFileSync(
  path.join(dest, "SNAPSHOT.json"),
  JSON.stringify({ label: `${index}-${label}`, source: src, created: new Date().toISOString(), files }, null, 2) + "\n",
);
console.log(`snapshot ${index}-${label}: ${files.length} files -> ${dest}`);
