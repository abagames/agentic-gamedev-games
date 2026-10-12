#!/usr/bin/env node
// Runs every check in one go:  npm run check
//
// Each instrument is run twice where that makes sense: once on the project,
// and once on a deliberately broken fixture that it must reject ("self-test").
// Checks that have nothing to examine yet are reported as SKIP, not PASS.
// The full output is also written to artifacts/check-log.txt.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./serve.mjs";

const node = process.execPath;
const tool = (name) => path.join("tools", name);

const steps = [
  { name: "unit tests (determinism, replay, trace, balance, path check + their self-tests)", cmd: [node, "--test", "test/*.test.mjs"] },
  { name: "no absolute paths", cmd: [node, tool("check-paths.mjs")] },
  { name: "smoke test (load, idle, input)", cmd: [node, tool("smoke.mjs"), "index.html", "--idle", "2", "--input", "4"] },
  {
    name: "self-test: smoke test rejects a page that crashes on input",
    cmd: [node, tool("smoke.mjs"), "test/fixtures/fixture-input-crash.html", "--idle", "1", "--input", "3"],
    expectExit: 1,
    expectOutput: /\[input\] pageerror/,
  },
  { name: "key bindings, browser determinism and screenshots", cmd: [node, tool("check-browser.mjs")] },
  { name: "mechanic probes", cmd: [node, tool("probe.mjs")], countSkips: true },
  {
    name: "self-test: probe runner rejects a wrong expectation",
    cmd: [node, tool("probe.mjs"), "--dir", "test/fixtures/probes"],
    expectExit: 1,
    expectOutput: /FAIL fixture: wrong expectation/,
  },
  { name: "title, sound, best score, gamepad and replay", cmd: [node, tool("check-shell.mjs")] },
  { name: "sound kit: manifest and rendered levels", cmd: [node, tool("audio.mjs")] },
  {
    name: "self-test: the kit validator rejects a sound over its budget",
    cmd: [node, tool("audio.mjs"), "--break"],
    expectExit: 1,
    expectOutput: /exceeds 0\.6s budget/,
  },
  { name: "policy comparison (exploratory_ratio)", cmd: [node, tool("balance.mjs")], skipIfReported: true },
];

const logDir = path.join(ROOT, "artifacts");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "check-log.txt");
fs.writeFileSync(logFile, "");
const log = (text) => {
  process.stdout.write(text);
  fs.appendFileSync(logFile, text);
};

const results = [];
for (const step of steps) {
  log(`\n=== ${step.name}\n$ ${step.cmd.map((c) => (c === node ? "node" : c)).join(" ")}\n`);
  const run = spawnSync(step.cmd[0], step.cmd.slice(1), { cwd: ROOT, encoding: "utf8" });
  const output = (run.stdout ?? "") + (run.stderr ?? "");
  log(output.endsWith("\n") || output === "" ? output : output + "\n");
  const expected = step.expectExit ?? 0;
  // A self-test must fail for the intended reason, not for any reason.
  const outputOk = step.expectOutput ? step.expectOutput.test(output) : true;
  let status = run.status === expected && outputOk ? "PASS" : "FAIL";
  let note = "";
  const skips = output.split("\n").filter((l) => l.startsWith("SKIP "));
  if (status === "PASS" && step.skipIfReported && skips.length > 0) {
    status = "SKIP";
    note = skips[0].slice(5);
  } else if (status === "PASS" && step.countSkips && skips.length > 0) {
    note = `${skips.length} skipped: ${skips.map((s) => s.slice(5)).join("; ")}`;
  } else if (status === "FAIL") {
    note = outputOk ? `exit ${run.status}, expected ${expected}` : `did not fail for the expected reason (${step.expectOutput})`;
  } else if (step.expectExit) {
    note = `exited ${run.status} as expected`;
  }
  results.push({ name: step.name, status, note });
}

log("\n=== summary\n");
for (const r of results) log(`${r.status.padEnd(4)}  ${r.name}${r.note ? `  (${r.note})` : ""}\n`);
const failed = results.filter((r) => r.status === "FAIL").length;
const skipped = results.filter((r) => r.status === "SKIP").length;
log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}` + (skipped ? `, ${skipped} skipped (not yet applicable)` : "") + "\n");
process.exit(failed === 0 ? 0 : 1);
