#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let count = 2;
let format = "text";

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--count") {
    count = Number(args[++i]);
  } else if (args[i] === "--json") {
    format = "json";
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log("Usage: node tools/pick-tags.mjs [--count N] [--json]");
    process.exit(0);
  } else {
    throw new Error(`Unknown argument: ${args[i]}`);
  }
}

if (!Number.isSafeInteger(count) || count < 1) {
  throw new Error("--count must be a positive integer");
}

const csv = await readFile(resolve(root, "tags.csv"), "utf8");
const tags = [...new Set(csv.split(/[,\r\n]+/u).map((tag) => tag.trim()).filter(Boolean))];

if (tags.length < count) {
  throw new Error(`tags.csv contains only ${tags.length} unique non-empty tags`);
}

// Partial Fisher-Yates shuffle: unbiased, without replacement, and no dependency.
for (let i = 0; i < count; i += 1) {
  const j = i + randomInt(tags.length - i);
  [tags[i], tags[j]] = [tags[j], tags[i]];
}

const picked = tags.slice(0, count);
console.log(format === "json" ? JSON.stringify(picked) : picked.join("\n"));
