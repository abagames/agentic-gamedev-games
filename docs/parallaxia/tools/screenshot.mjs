#!/usr/bin/env node
// Captures the canvas at an exact frame of a seeded run.
//
// Usage:
//   node tools/screenshot.mjs --frame 120 [--seed 1] [--input 16] [--replay file.json] [--out file.png]
//
// --input holds the given input bits for every frame; --replay plays a replay
// file (its seed wins) up to --frame. Default output: artifacts/screenshots/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openGame } from "./lib/browser.mjs";
import { ROOT } from "./serve.mjs";

export async function capture({ frame = 0, seed = 1, input = 0, replay = null, out }) {
  const game = await openGame({ seed: replay ? replay.seed : seed });
  try {
    const reached = await game.page.evaluate(
      ({ frame, seed, input, replay }) => {
        const g = window.__game;
        if (replay) {
          g.runReplay(replay, { maxFrames: frame });
        } else {
          g.reset({ seed });
          g.step(frame, input);
        }
        g.render();
        return { frame: g.frame, hash: g.hash() };
      },
      { frame, seed, input, replay }
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await game.page.locator("#game").screenshot({ path: out });
    if (game.errors.length > 0) throw new Error("page errors: " + game.errors.join("; "));
    return reached;
  } finally {
    await game.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = { frame: 0, seed: 1, input: 0, replay: null, out: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--frame") opts.frame = Number(argv[++i]);
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--input") opts.input = Number(argv[++i]);
    else if (a === "--replay") opts.replay = JSON.parse(fs.readFileSync(argv[++i], "utf8"));
    else if (a === "--out") opts.out = argv[++i];
    else {
      console.error(`screenshot: unexpected argument '${a}'`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(opts.frame) || opts.frame < 0) {
    console.error("usage: node tools/screenshot.mjs --frame <n> [--seed n] [--input bits] [--replay file] [--out file]");
    process.exit(2);
  }
  opts.out = path.resolve(
    opts.out ?? path.join(ROOT, "artifacts", "screenshots", `seed${opts.replay ? opts.replay.seed : opts.seed}-frame${opts.frame}.png`)
  );
  const reached = await capture(opts);
  console.log(`saved ${path.relative(process.cwd(), opts.out)} (frame ${reached.frame}, state ${reached.hash})`);
}
