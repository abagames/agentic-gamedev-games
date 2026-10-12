#!/usr/bin/env node
// Could a miss have been got out of? A simulated player plays (its ships kept
// topped up); at every miss the run is taken back 0.5, 1, 2 and 3 seconds and
// searched for any way of moving that lives through the moment of the miss
// and a second beyond it. A miss with no way out from a second or more
// before is one the barrage left little or no room for, whoever was playing.
//
// The search moves the ship in steps of five frames in the nine directions,
// shot held, and never looks twice at the same place at the same time (the
// field in squares of one unit). It is a search of where the ship can be, not
// of what the player could have shot down earlier, so "no way out" is said
// only of the last three seconds.
//
// Usage:
//   node tools/dodge.mjs [--modes normal,rapid,dense] [--starts 31,61,91] [--seeds 3] [--seconds 150]
//                        [--policy keeper|author] [--save 6] [--game-hits] [--room 2]
// A way out that passes through a bullet is not counted (the game's hit test
// lets a ship that flies into a bullet step over it; see tools/lib/dodge.mjs).
// --game-hits counts such ways too. --room 2 asks for a way out that passes
// every bullet at twice the distance that would hit.
// --save N writes the first N trapped misses as replays (to artifacts/dodge/),
// for `node tools/screenshot.mjs --replay <file> --frame <n>`.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./serve.mjs";
import { createSim, stepSim, observe } from "../src/sim/sim.js";
import { MODES } from "../src/sim/constants.js";
import { baseName, splitName } from "../src/sim/barrage.js";
import { bulletArmed } from "../src/sim/bullets.js";
import { encodeReplay } from "../src/sim/replay.js";
import { keeper } from "./policies/keeper.mjs";
import { author } from "./policies/author.mjs";
import { wayOut } from "./lib/dodge.mjs";

const opts = { modes: ["normal", "rapid", "dense"], starts: [31, 61, 91], seeds: 3, seconds: 150, policy: "keeper", save: 0, strict: true, room: 1 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--modes") opts.modes = argv[++i].split(",");
  else if (argv[i] === "--starts") opts.starts = argv[++i].split(",").map(Number);
  else if (argv[i] === "--seeds") opts.seeds = Number(argv[++i]);
  else if (argv[i] === "--seconds") opts.seconds = Number(argv[++i]);
  else if (argv[i] === "--policy") opts.policy = argv[++i];
  else if (argv[i] === "--save") opts.save = Number(argv[++i]);
  else if (argv[i] === "--game-hits") opts.strict = false;
  else if (argv[i] === "--room") opts.room = Number(argv[++i]);
  else {
    console.error(`dodge: unexpected argument '${argv[i]}'`);
    process.exit(2);
  }
}
const policy = { keeper, author }[opts.policy];
if (!policy) {
  console.error(`dodge: no policy '${opts.policy}'`);
  process.exit(2);
}

const BACK = [30, 60, 120, 180];
const KEEP = 30; // frames between the states kept to go back to
const BEYOND = 60;

// Which barrage a bullet belongs to, noted as it appears.
function patternOf(sim, bullet, known) {
  const sign = `${bullet.from}|${bullet.r}|${bullet.shape}|${bullet.chain.join(",")}`;
  if (!bullet.owner) return `${known.get(sign) ?? "?"} > ${bullet.depth > 0 ? splitName(bullet.chain[bullet.depth - 1]) : "part"}`;
  const enemy = sim.enemies.find((e) => e.id === bullet.owner);
  const type = enemy ? sim.stage.types[enemy.type] : null;
  const muzzle = type?.muzzles.find((m) => m.ox === bullet.ox) ?? type?.muzzles[0];
  const barrage = muzzle ? sim.stage.barrages[muzzle.barrage] : null;
  const name = barrage ? `${bullet.from}: ${baseName(barrage.group, barrage.base)}` : `${bullet.from}: ?`;
  known.set(sign, name);
  return name;
}

const tally = {};
const trapped = [];
let saved = 0;
for (const mode of opts.modes) {
  for (const start of opts.starts) {
    const row = (tally[`${MODES[mode].name} from ${start}`] = { minutes: 0, misses: 0, rams: 0, out: { 30: 0, 60: 0, 120: 0, 180: 0 }, none: 0, unsure: 0 });
    for (let n = 0; n < opts.seeds; n++) {
      const seed = 5101 + n;
      const sim = createSim({ seed, mode, startSector: start });
      const decide = policy.create({ seed, variant: n });
      const kept = [];
      const inputs = [];
      const names = new Map(); // bullet id -> pattern
      const known = new Map();
      for (let t = 0; t < opts.seconds * 60; t++) {
        if (t % KEEP === 0) {
          kept.push(structuredClone(sim));
          if (kept.length > BACK[BACK.length - 1] / KEEP + 2) kept.shift();
        }
        const before = sim.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, armed: bulletArmed(b) }));
        const at = { x: sim.ship.x, y: sim.ship.y };
        const bits = decide(observe(sim), t);
        inputs.push(bits);
        stepSim(sim, bits);
        for (const b of sim.bullets) if (!names.has(b.id)) names.set(b.id, patternOf(sim, b, known));
        const miss = sim.events.find((e) => e.type === "miss");
        if (sim.lives < 2) sim.lives = 2;
        if (!miss) continue;
        row.misses++;
        if (miss.cause === "ram") row.rams++;
        // The latest point from which there was still a way out.
        let found = null;
        let unsure = false;
        for (const back of BACK) {
          const state = [...kept].reverse().find((k) => k.frame <= sim.frame - back);
          if (!state) continue;
          const result = wayOut(state, sim.frame + BEYOND, { strict: opts.strict, room: opts.room });
          if (result === null) unsure = true;
          if (result === true) found = back;
          if (result !== false) break;
        }
        if (unsure) row.unsure++;
        else if (found !== null) row.out[found]++;
        else row.none++;
        // No way out from a second back: a trap. What was around.
        if (!unsure && (found === null || found >= 120)) {
          const near = before.filter((b) => b.armed && (b.x - at.x) ** 2 + (b.y - at.y) ** 2 < 25).map((b) => names.get(b.id) ?? "?");
          const hit = before.filter((b) => b.armed).sort((a, b) => (a.x - at.x) ** 2 + (a.y - at.y) ** 2 - ((b.x - at.x) ** 2 + (b.y - at.y) ** 2))[0];
          const item = { mode: MODES[mode].name, start, seed, frame: sim.frame, sector: sim.stage.section + 1, cause: miss.cause, from: miss.from, lastWayOut: found, hit: miss.cause === "ram" ? `ram: ${miss.from}` : hit ? names.get(hit.id) : "?", near: [...new Set(near)], nearCount: near.length, flying: before.filter((b) => b.armed).length };
          trapped.push(item);
          if (saved < opts.save) {
            const dir = path.join(ROOT, "artifacts", "dodge");
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${mode}-${start}-seed${seed}-frame${sim.frame}.json`);
            fs.writeFileSync(file, JSON.stringify(encodeReplay(seed, inputs, { mode, startSector: start })));
            item.replay = path.relative(ROOT, file);
            saved++;
          }
        }
      }
      row.minutes += opts.seconds / 60;
    }
    const r = row;
    console.log(`${`${MODES[mode].name} from sector ${start}`.padEnd(24)} ${r.minutes.toFixed(0)} min, ${String(r.misses).padStart(3)} misses (${r.rams} rams) | still a way out 0.5 s before: ${r.out[30]}, 1 s before but not 0.5: ${r.out[60]}, 2 s but not 1: ${r.out[120]}, 3 s but not 2: ${r.out[180]}, none even 3 s before: ${r.none}, search gave up: ${r.unsure}`);
  }
}

console.log(`\nmisses with no way out from a second before (${trapped.length}), by the barrage that hit:`);
const by = {};
for (const t of trapped) {
  const key = `${t.mode}  ${t.hit}`;
  (by[key] ??= []).push(t);
}
for (const [key, list] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  const others = {};
  for (const t of list) for (const name of t.near) if (name !== t.hit) others[name] = (others[name] ?? 0) + 1;
  const top = Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${name} (${n})`).join(", ");
  console.log(`  ${String(list.length).padStart(3)}  ${key}   [mean ${(list.reduce((s, t) => s + t.nearCount, 0) / list.length).toFixed(1)} bullets within 5; also near: ${top || "nothing else"}]`);
}
for (const t of trapped.filter((t) => t.replay)) console.log(`  saved: ${t.replay}  (miss at frame ${t.frame}, sector ${t.sector}: ${t.hit})`);
if (opts.room !== 1) console.log(`\nnote: a way out here keeps ${opts.room} times the hitting distance from every bullet.`);
console.log(`\nnote: ${opts.strict ? "passing through a bullet counts as a hit in the search" : "the search uses the game's own hit test, which a ship can step through"}.`);
console.log(`note: ${policy.name} plays; "no way out" is about where the ship could have gone in the last 3 seconds, not about what could have been shot down before.`);
