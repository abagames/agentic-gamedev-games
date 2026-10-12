#!/usr/bin/env node
// Mechanic probes: opens the game paused in a headless browser, injects state
// through window.__game, and asserts concrete expected values. Derived from the
// probing-web-game-mechanics template (tools/vendor/probe-template.mjs).
//
// Usage: node tools/probe.mjs [--dir probes]
//
// A probe is a module  export default { name, requires, run({ page, check }) }.
// `requires` lists capabilities (capabilities.mechanics entries, or a boolean
// capability such as "scoring"). A probe whose requirements the build does not
// meet is reported as SKIP, never as PASS.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openGame } from "./lib/browser.mjs";
import { ROOT } from "./serve.mjs";

const argv = process.argv.slice(2);
let dir = path.join(ROOT, "probes");
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dir") dir = path.resolve(argv[++i]);
  else {
    console.error(`probe: unexpected argument '${argv[i]}'`);
    process.exit(2);
  }
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".probe.mjs")).sort();
if (files.length === 0) {
  console.error(`probe: no *.probe.mjs files in ${path.relative(process.cwd(), dir) || "."}`);
  process.exit(2);
}

const totals = { passed: 0, failed: 0, skipped: 0 };
for (const file of files) {
  const probe = (await import(pathToFileURL(path.join(dir, file)).href)).default;
  const game = await openGame({ seed: 1 });
  try {
    const caps = await game.page.evaluate(() => window.__game.capabilities);
    const missing = (probe.requires ?? []).filter((r) => !(caps.mechanics.includes(r) || caps[r] === true));
    if (missing.length > 0) {
      console.log(`SKIP ${probe.name}: not implemented yet (${missing.join(", ")})`);
      totals.skipped++;
      continue;
    }
    const failures = [];
    let asserted = 0;
    // check(name, actual, expected value or predicate)
    const check = (name, actual, expected) => {
      const ok = typeof expected === "function" ? expected(actual) : actual === expected;
      asserted++;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
      if (!ok) failures.push(name);
    };
    try {
      await probe.run({ page: game.page, check });
    } catch (err) {
      failures.push(`threw: ${err.message}`);
    }
    if (asserted === 0) failures.push("asserted nothing (a probe must check at least one concrete value)");
    failures.push(...game.errors);
    if (failures.length > 0) {
      console.log(`FAIL ${probe.name}: ${failures.join("; ")}`);
      totals.failed++;
    } else {
      console.log(`PASS ${probe.name}`);
      totals.passed++;
    }
  } finally {
    await game.close();
  }
}

console.log(`probes: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped`);
process.exit(totals.failed > 0 ? 1 : 0);
