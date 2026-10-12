#!/usr/bin/env node
// Keeps a playable copy of the current build, so a play report can later be
// matched to the exact build that was played.
//
// Usage: node tools/snapshot.mjs <label>     -> snapshots/<label>/index.html

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./serve.mjs";

const label = process.argv[2];
if (!label || !/^[\w.-]+$/.test(label)) {
  console.error("usage: node tools/snapshot.mjs <label>   (letters, digits, '.', '_', '-')");
  process.exit(2);
}
const dest = path.join(ROOT, "snapshots", label);
if (fs.existsSync(dest)) {
  console.error(`snapshot: snapshots/${label} already exists; pick another label`);
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(ROOT, "index.html"), path.join(dest, "index.html"));
fs.cpSync(path.join(ROOT, "src"), path.join(dest, "src"), { recursive: true });
console.log(`saved snapshots/${label}/  (serve the repo and open snapshots/${label}/index.html)`);
