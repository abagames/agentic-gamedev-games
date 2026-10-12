#!/usr/bin/env node
// Smoke test: serves the repo and runs the smoke-testing-web-games harness
// (tools/vendor/smoke-test.mjs) against it, then exercises the game's own keys,
// which that harness does not press.
//
// Usage: node tools/smoke.mjs [page path, default index.html] [--idle s] [--input s]

import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { startServer, ROOT } from "./serve.mjs";

const args = process.argv.slice(2);
const pagePath = args[0] && !args[0].startsWith("--") ? args.shift() : "index.html";
const GAME_KEYS = ["KeyZ", "KeyW", "KeyD"];

const server = await startServer(0);
let code = 0;
try {
  const url = `${server.url}/${pagePath}`;
  // Async spawn: the server runs in this process and must keep answering.
  code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(ROOT, "tools", "vendor", "smoke-test.mjs"), url, ...args],
      { cwd: ROOT, stdio: "inherit" }
    );
    child.on("exit", (status) => resolve(status ?? 2));
    child.on("error", () => resolve(2));
  });

  if (code === 0) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push("console.error: " + m.text());
    });
    page.on("crash", () => errors.push("crash: page crashed"));
    await page.goto(url, { waitUntil: "load" });
    for (let round = 0; round < 3; round++) {
      for (const key of GAME_KEYS) {
        await page.keyboard.press(key);
        await page.waitForTimeout(60);
      }
      await page.keyboard.down("KeyZ");
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(400);
      await page.keyboard.up("ArrowUp");
      await page.keyboard.up("KeyZ");
      await page.waitForTimeout(200);
    }
    await browser.close();
    for (const e of errors) console.error(`[game-keys] ${e}`);
    if (errors.length > 0) {
      console.error(`FAIL: ${errors.length} error(s) on game keys (${GAME_KEYS.join(", ")})`);
      code = 1;
    } else {
      console.log(`PASS: game keys (${GAME_KEYS.join(", ")} tap and hold)`);
    }
  }
} finally {
  await server.close();
}
process.exit(code);
