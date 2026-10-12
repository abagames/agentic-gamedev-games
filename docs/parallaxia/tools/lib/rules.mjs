// The rules a saved replay was played on: the snapshot its `build` names, or
// the working copy for "dev" and for a build with no snapshot.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../serve.mjs";

export async function rulesFor(build) {
  const snapshot = path.join(ROOT, "snapshots", String(build), "src", "sim");
  const dir = build && build !== "dev" && fs.existsSync(snapshot) ? snapshot : path.join(ROOT, "src", "sim");
  const load = (name) => import(pathToFileURL(path.join(dir, name)).href);
  return { game: await load("sim.js"), replays: await load("replay.js"), where: path.relative(ROOT, dir) };
}

export const setupOf = (replay) => ({ seed: replay.seed, mode: replay.mode ?? "normal", startSector: replay.start ?? 1 });

// Every replay file named, or in a directory named.
export function replayFiles(args) {
  const files = [];
  for (const arg of args) {
    if (fs.statSync(arg).isDirectory()) {
      for (const name of fs.readdirSync(arg).sort()) if (name.endsWith(".json")) files.push(path.join(arg, name));
    } else files.push(arg);
  }
  return files;
}
