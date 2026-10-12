import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scan } from "../tools/check-paths.mjs";

// Sample paths are assembled at run time so this file stays clean itself.
const posix = ["", "home", "someone", "project", "file.txt"].join("/");
const windows = "C:" + "\\" + "Users" + "\\" + "someone";

function withTempDir(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p47-paths-"));
  try {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("path check passes a tree with only relative paths and URLs", () => {
  withTempDir({ "a.md": "see reference/mechanics.md and https://example.com/home/page\n" }, (dir) => {
    assert.deepEqual(scan(dir), []);
  });
});

test("path check fails on an absolute POSIX path", () => {
  withTempDir({ "a.md": `stored in ${posix}\n` }, (dir) => {
    assert.equal(scan(dir).length, 1);
  });
});

test("path check fails on an absolute Windows path", () => {
  withTempDir({ "a.json": JSON.stringify({ dir: windows }) + "\n" }, (dir) => {
    assert.ok(scan(dir).length >= 1);
  });
});

test("path check fails on this machine's home directory", () => {
  withTempDir({ "a.txt": `cache at ${path.join(os.homedir(), "x")}\n` }, (dir) => {
    assert.ok(scan(dir).length >= 1);
  });
});
