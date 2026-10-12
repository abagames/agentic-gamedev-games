#!/usr/bin/env node
// Fails when a file in the repo contains an absolute path. The repo gets moved,
// so everything must be written relative to the root.
//
// Usage: node tools/check-paths.mjs [dir]     (default: repo root)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Not ours to keep path-free: dependencies, the original's material, outputs.
const SKIP_DIRS = new Set(["node_modules", "original", "artifacts", ".git", ".claude"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const TEXT_EXT = new Set([
  ".md", ".js", ".mjs", ".cjs", ".ts", ".json", ".html", ".css", ".txt", ".xml", ".yml", ".yaml", ".toml", ".sh", "",
]);

const PATTERNS = [
  [/(?<![\w.:\/~-])\/(?:home|Users|root|mnt|tmp)\/[\w.-]+/, "absolute POSIX path"],
  [/\b[A-Za-z]:\\\\?(?:Users|Documents|Program)/, "absolute Windows path"],
  [/file:\/\/\//, "file:// URL"],
];

export function scan(dir, base = dir) {
  const findings = [];
  const machine = [ROOT, os.homedir()].filter((p) => p && p.length > 1);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findings.push(...scan(full, base));
      continue;
    }
    if (SKIP_FILES.has(entry.name) || !TEXT_EXT.has(path.extname(entry.name))) continue;
    if (!fs.lstatSync(full).isFile()) continue;
    const text = fs.readFileSync(full, "utf8");
    if (text.includes("\u0000")) continue;
    text.split("\n").forEach((line, i) => {
      const where = `${path.relative(base, full)}:${i + 1}`;
      for (const p of machine) {
        if (line.includes(p)) findings.push(`${where}: path on this machine`);
      }
      for (const [re, label] of PATTERNS) {
        if (re.test(line)) findings.push(`${where}: ${label}`);
      }
    });
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.resolve(process.argv[2] ?? ROOT);
  const findings = scan(target);
  for (const f of findings) console.error(f);
  if (findings.length > 0) {
    console.error(`FAIL: ${findings.length} absolute path(s) found`);
    process.exit(1);
  }
  console.log("PASS: no absolute paths");
}
