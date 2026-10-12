#!/usr/bin/env node
// Bullet-pattern bench: runs one generated enemy type on its own and writes
// every bullet's path as a trace (format in src/sim/trace.js).
//
// Usage: node tools/trace.mjs [--seed 1] [--loop 0] [--type 3] [--frames 300] [--out file.jsonl]
//
// --loop picks the rank (loop 0 is the first ten sections), --type the index in
// that loop's cast. Without --out, prints a summary only.

import fs from "node:fs";
import { createSim, stepSim, FPS } from "../src/sim/sim.js";
import { createTraceWriter, validateTrace } from "../src/sim/trace.js";
import { baseName, splitName } from "../src/sim/barrage.js";
import { SECTION } from "../src/sim/constants.js";

const opts = { seed: 1, loop: 0, type: 3, frames: 300, out: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i].replace(/^--/, "");
  if (!(key in opts) || argv[i + 1] === undefined) {
    console.error("usage: node tools/trace.mjs [--seed n] [--loop n] [--type n] [--frames n] [--out file]");
    process.exit(2);
  }
  opts[key] = key === "out" ? argv[i + 1] : Number(argv[i + 1]);
}

const sim = createSim({ seed: opts.seed });
// Start the wanted loop, then stop arrivals and keep the cast.
sim.stage.section = opts.loop * SECTION.perLoop - 1;
stepSim(sim, 0);
sim.stage.frozen = true;
sim.enemies = [];
sim.bullets = [];
const type = sim.stage.types[opts.type];
if (!type) {
  console.error(`trace: no type ${opts.type} (this loop has ${sim.stage.types.length})`);
  process.exit(2);
}
// Far from the ship and too tough to die; the ship is invincible and idle.
sim.enemies.push({ id: sim.nextId++, kind: type.kind, x: 0, y: 12, hp: 1e9, age: 0, phase: 0, type: opts.type, fireIn: 1, burst: 0, angles: type.muzzles.map(() => 0) });

console.log(`seed ${opts.seed}, loop ${opts.loop} (rank ${sim.stage.rank}), type ${opts.type}: ${type.kind}, bursts of ${type.period} every ${type.interval} frames`);
for (const m of type.muzzles) {
  const b = sim.stage.barrages[m.barrage];
  const chain = b.chain.map(splitName).join(" > ") || "none";
  console.log(`  muzzle x${m.ox >= 0 ? "+" : ""}${m.ox}: ${baseName(b.group, b.base)}, count rank ${b.r.toFixed(2)}, speed rank ${b.speedRank.toFixed(2)}, splits: ${chain}`);
}

const writer = createTraceWriter({ fps: FPS, seed: opts.seed, source: `loop ${opts.loop} type ${opts.type}` });
let peak = 0;
let fired = 0;
const seen = new Set();
for (let f = 0; f < opts.frames; f++) {
  sim.ship.respawn = 0;
  sim.lives = 9;
  sim.enemies[0].y = 12;
  stepSim(sim, 0);
  sim.ship.respawn = 1;
  for (const b of sim.bullets) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      fired++;
    }
    writer.record(f, { id: b.id, x: b.x, y: b.y, dir: b.dir, speed: b.speed });
  }
  peak = Math.max(peak, sim.bullets.length);
}
const text = writer.toString();
const problems = validateTrace(text);
console.log(`${opts.frames} frames: ${fired} bullets created, at most ${peak} at once (${(fired / (opts.frames / FPS)).toFixed(1)} per second)`);
if (problems.length > 0) {
  console.error("trace is malformed: " + problems.slice(0, 3).join("; "));
  process.exit(1);
}
if (opts.out) {
  fs.writeFileSync(opts.out, text);
  console.log(`trace written to ${opts.out}`);
}
