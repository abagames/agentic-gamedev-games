#!/usr/bin/env node
// Captures a game's named scenes in a headless browser and writes a frame manifest for
// the screen-readability check.
//
//   node tools/shots.mjs <game-dir> [--out dir] [--scenes a,b] [--min-scale 1]
//
// The game exposes, in the page:
//   window.__test.scenes = { name: () => settleMs | void, ... }   arrange a moment
//   window.__test.frame  = () => ({ elements: [...] })            optional: what was drawn
// Scenes should include the moments and forced coincidences listed by the
// auditing-game-screen-readability skill. Elements follow its frame-manifest format.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { parseArgs } from "./lib/game.mjs";

const args = parseArgs(process.argv.slice(2));
const gameDir = args._[0];
if (!gameDir) {
  console.error("usage: shots.mjs <game-dir> [--out dir] [--scenes a,b] [--min-scale N]");
  process.exit(2);
}
const index = path.resolve(gameDir, "index.html");
if (!existsSync(index)) {
  console.error(`no index.html in ${gameDir}`);
  process.exit(2);
}
const out = path.resolve(args.out || path.join(gameDir, "evidence", "shots"));
mkdirSync(out, { recursive: true });

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(pathToFileURL(index).href);
  await page.waitForFunction(() => window.__test && window.__test.scenes, null, { timeout: 10000 }).catch(() => {
    throw new Error("the page did not expose window.__test.scenes within 10 s");
  });

  const all = await page.evaluate(() => Object.keys(window.__test.scenes));
  const wanted = args.scenes ? args.scenes.split(",") : all;
  const unknown = wanted.filter((s) => !all.includes(s));
  if (unknown.length) throw new Error(`unknown scene(s): ${unknown.join(", ")} (have: ${all.join(", ")})`);

  const viewport = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return c ? { w: c.width, h: c.height } : { w: innerWidth, h: innerHeight };
  });
  const manifest = { viewport, minScale: +(args["min-scale"] || 1), frames: [] };
  let withElements = 0;

  for (const name of wanted) {
    const settle = await page.evaluate((n) => window.__test.scenes[n](), name);
    await page.waitForTimeout(typeof settle === "number" ? settle : 150);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    const frame = await page.evaluate(() => (window.__test.frame ? window.__test.frame() : null));
    if (frame && Array.isArray(frame.elements)) {
      withElements++;
      manifest.frames.push({ id: name, elements: frame.elements });
    } else {
      manifest.frames.push({ id: name, elements: [] });
    }
  }

  const file = path.join(out, "frames.json");
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`captured ${wanted.length} scene(s) to ${out}`);
  console.log(`wrote ${file} (${withElements} of ${wanted.length} scenes reported their elements)`);
  if (withElements < wanted.length) {
    console.log("NOTE scenes without elements can only be inspected by eye; expose window.__test.frame to check them mechanically");
  }
  if (errors.length) {
    console.log(`page errors: ${errors.length}`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
