#!/usr/bin/env node
// Browser-side checks of the keyboard bindings, the deterministic run and the
// screenshot command:
//   - every key bound to an action reaches the sim as that action's input bit
//   - a replay gives the same state hash in the browser as in Node
//   - the same seed and frame always render the same image
//   - a different frame renders a different image
//
// Usage: node tools/check-browser.mjs

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { hashState } from "../src/sim/sim.js";
import { encodeReplay, runReplay } from "../src/sim/replay.js";
import { sampleInputs } from "./lib/determinism.mjs";
import { openGame } from "./lib/browser.mjs";
import { capture } from "./screenshot.mjs";
import { ROOT } from "./serve.mjs";

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) failures.push(name);
};

const replay = encodeReplay(4711, sampleInputs(600));
const nodeHash = hashState(runReplay(replay));

// Every binding of every action must reach the sim as the same input bit.
const BINDINGS = {
  1: ["ArrowUp", "KeyW"],
  2: ["ArrowDown", "KeyS"],
  4: ["ArrowLeft", "KeyA"],
  8: ["ArrowRight", "KeyD"],
  16: ["KeyZ"],
};

const game = await openGame({ seed: 1 });
let browserHash;
try {
  for (const [bit, keys] of Object.entries(BINDINGS)) {
    for (const key of keys) {
      await game.page.keyboard.down(key);
      const held = await game.page.evaluate(() => (window.__game.step(1), window.__game.state.input));
      await game.page.keyboard.up(key);
      const released = await game.page.evaluate(() => (window.__game.step(1), window.__game.state.input));
      check(`${key} sets input bit ${bit} and releases it`, held === Number(bit) && released === 0, `${held} / ${released}`);
    }
  }
  // Pointer drag: the ship follows the drag at its own speed and fires.
  const box = await game.page.locator("#game").boundingBox();
  const unit = box.width / 22;
  const state = () => game.page.evaluate(() => ({ x: window.__game.state.ship.x, view: window.__game.state.viewX, y: window.__game.state.ship.y, shots: window.__game.state.shots.length, input: window.__game.state.input }));
  await game.page.evaluate(() => (window.__game.reset({ seed: 1 }), (window.__game.state.stage.frozen = true)));
  await game.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await game.page.mouse.down();
  await game.page.mouse.move(box.x + box.width / 2 + unit * 3, box.y + box.height / 2 - unit * 1.5);
  await game.page.evaluate(() => window.__game.step(2));
  const early = await state();
  check("pointer drag: the ship moves at its own speed, not the finger's", Math.abs(early.x - 2 * 0.4 * 0.707) < 1e-6, `x ${early.x}`);
  check("pointer drag: fires while held", early.shots === 1 && (early.input & 16) === 16, `${early.shots} shots`);
  await game.page.evaluate(() => window.__game.step(30));
  const settled = await state();
  check("pointer drag: the ship ends where the drag points on screen", Math.abs(settled.x - settled.view - 3) <= 0.31 && Math.abs(settled.y + 6.5) <= 0.31, `on screen ${settled.x - settled.view}, ${settled.y}`);
  await game.page.mouse.move(box.x + box.width / 2 + unit * 30, box.y + box.height / 2);
  await game.page.evaluate(() => window.__game.step(40));
  await game.page.mouse.move(box.x + box.width / 2 + unit * 29, box.y + box.height / 2);
  await game.page.evaluate(() => window.__game.step(10));
  const edge = await state();
  check("pointer drag: no slack to drag back after hitting an edge", edge.x < 12.5 - 0.5, `x ${edge.x}`);
  await game.page.mouse.up();
  await game.page.evaluate(() => window.__game.step(1));
  check("pointer released: no input", (await state()).input === 0);

  browserHash = await game.page.evaluate((r) => window.__game.runReplay(r), replay);
  check("no page errors", game.errors.length === 0, game.errors.join("; "));
} finally {
  await game.close();
}
check("replay hash matches between Node and the browser", nodeHash === browserHash, `${nodeHash} / ${browserHash}`);

const dir = path.join(ROOT, "artifacts", "screenshots");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const a = path.join(dir, "check-a.png");
const b = path.join(dir, "check-b.png");
const c = path.join(dir, "check-c.png");
const ra = await capture({ frame: 120, seed: 9, input: 16, out: a });
await capture({ frame: 120, seed: 9, input: 16, out: b });
await capture({ frame: 121, seed: 9, input: 16, out: c });
check("screenshot stops at the requested frame", ra.frame === 120, `frame ${ra.frame}`);
check("screenshot file is a PNG", fs.readFileSync(a).subarray(1, 4).toString() === "PNG");
check("same seed and frame render the same image", sha(a) === sha(b));
check("a different frame renders a different image", sha(a) !== sha(c));

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} browser check(s) failed`);
  process.exit(1);
}
console.log("PASS: browser determinism and screenshots");
