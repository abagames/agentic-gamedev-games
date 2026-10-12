#!/usr/bin/env node
// Measures the flight patterns one at a time, in drill mode (one endless
// stream of formations of a single pattern). Two kinds of numbers:
//
//   geometry  from the tracks alone, no player: how far ahead a straight-line
//             guess is wrong, how wide and long each member can be shot at,
//             how fast the ship must move to hit them all, how long a hull
//             has been on its course when it reaches the ship
//   play      from the limited-sight bot (tools/policies/flightbot.mjs):
//             how often a formation is wiped out, how often the ship is lost
//             and to what, and whether a wipe survives being played slightly
//             off
//
// What the numbers are checked against is fixed in docs/flight-eval.md.
// The runs are in CHAIN, the mode in which wiping a formation out is what
// scores (and so the only one that reports it).
//
// Usage: node tools/flight.mjs [--seeds design|final] [--pattern id] [--out file.json]

import fs from "node:fs";
import path from "node:path";
import * as game from "../src/sim/sim.js";
import { PATTERN_IDS } from "../src/sim/flight.js";
import { KINDS, SHOT, SHIP } from "../src/sim/constants.js";
import { flightBot } from "./policies/flightbot.mjs";
import { ROOT } from "./serve.mjs";

// final was used once, before the firing rules and the new small-enemy shots;
// final2 is the comparison after them (same criteria).
export const SEEDS = Object.freeze({
  design: [1, 2, 3, 4, 5, 6],
  final: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112],
  final2: [201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212],
  // For the three sideways patterns added later (wave, zigzag, cross), and
  // the shorter splits.
  final3: [301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312],
  // After the middle enemy was made soft and lightly armed, and hover,
  // hairpin, zigzag and cross were made to react to the ship.
  final4: [401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412],
});
const COUNT = 5;
const PLAY_FRAMES = 3600;
const REACH = KINDS.small.halfW + SHOT.halfW + SHOT.hitExtraW;

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const quantile = (xs, q) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] : null);
const round = (v, n = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** n) / 10 ** n);

// The tracks of the first formation, with the ship parked (and unable to be
// hit) at shipX. Bullets are not part of this.
function tracks(pattern, seed, shipX, shipY = SHIP.startY) {
  const sim = game.createSim({ seed, mode: "rapid", drill: { pattern, count: COUNT } });
  const members = new Map();
  let formation = 0;
  for (let t = 0; t < 900; t++) {
    sim.lives = 9;
    sim.ship.respawn = 250;
    sim.ship.x = shipX;
    sim.ship.y = shipY;
    game.stepSim(sim, 0);
    for (const e of sim.enemies) {
      if (e.kind !== "small") continue;
      if (!formation) formation = e.formation;
      if (e.formation !== formation) continue;
      if (!members.has(e.id)) members.set(e.id, []);
      members.get(e.id).push({ t, x: e.x, y: e.y, leg: e.flight.leg, since: e.flight.since });
    }
    if (formation && members.size === COUNT && !sim.enemies.some((e) => e.formation === formation)) break;
  }
  return [...members.values()];
}

// When, and from which ship x, a shot from height shipY hits a member: a shot
// fired at frame tau from x lands at frame t if the member is then within
// REACH of x, where t - tau is the climb.
function windows(track, shipY) {
  const out = [];
  for (const p of track) {
    if (p.y <= shipY + 1) continue;
    out.push({ tau: Math.round(p.t - (p.y - shipY) / SHOT.speed), x: p.x });
  }
  return out;
}

function geometry(pattern, seeds) {
  const guessErrors = [];
  let widthMin = Infinity;
  let speedNeeded = 0;
  let ramWarnMin = Infinity;
  let ramWarnForward = Infinity;
  let reachesShip = false;
  const brakes = [];
  for (const seed of seeds) {
    for (const shipX of [-8, 0, 8]) {
      const all = tracks(pattern, seed, shipX);
      for (const track of all) {
        // A straight-line guess from the last 6 frames, 20 frames ahead.
        for (let i = 6; i + 20 < track.length; i++) {
          const a = track[i - 6];
          const b = track[i];
          const c = track[i + 20];
          const err = Math.hypot(b.x + ((b.x - a.x) / 6) * 20 - c.x, b.y + ((b.y - a.y) / 6) * 20 - c.y);
          guessErrors.push(err);
        }
        // At each change of heading of more than 20 degrees: how much of its
        // speed over the 48 frames before did it still have? (A stop counts as 0.)
        const speed = (j) => Math.hypot(track[j].x - track[j - 1].x, track[j].y - track[j - 1].y);
        const heading = (j) => Math.atan2(track[j].x - track[j - 3].x, track[j].y - track[j - 3].y);
        for (let i = 49; i + 4 < track.length; i++) {
          if (speed(i) < 0.01 || speed(i + 4) < 0.01) continue;
          let turn = Math.abs(heading(i + 4) - heading(i));
          if (turn > Math.PI) turn = Math.PI * 2 - turn;
          if (turn < (20 * Math.PI) / 180) continue;
          let fastest = 0;
          for (let j = i - 48; j <= i; j++) fastest = Math.max(fastest, speed(j));
          brakes.push(speed(i) / fastest);
          i += 30;
        }
        // A stand-still before a move is the strongest cue there is.
        for (let i = 25; i < track.length; i++) if (speed(i) < 0.001 && speed(i - 1) >= 0.001) brakes.push(0);
        // From which ship x can it be shot, and for how long?
        const wins = windows(track, SHIP.startY);
        let widest = 0;
        let run = 0;
        for (let x = -12.5; x <= 12.5; x += 0.25) {
          const frames = wins.filter((w) => Math.abs(w.x - x) < REACH).length;
          run = frames >= 15 ? run + 0.25 : 0;
          widest = Math.max(widest, run);
        }
        widthMin = Math.min(widthMin, widest);
        // A hull arriving at the ship: how long had it been on that course?
        for (const p of track) {
          if (Math.abs(p.y - SHIP.startY) < KINDS.small.bodyH) {
            reachesShip = true;
            ramWarnMin = Math.min(ramWarnMin, p.since);
          }
          if (Math.abs(p.y) < KINDS.small.bodyH) ramWarnForward = Math.min(ramWarnForward, p.since);
        }
      }
      // The slowest sideways ship speed that still gets a shot at every
      // member, taking them in order of their last chance.
      const order = all.map((track) => windows(track, SHIP.startY)).filter((w) => w.length > 0).sort((a, b) => a[a.length - 1].tau - b[b.length - 1].tau);
      let lo = 0;
      let hi = 3;
      for (let step = 0; step < 16; step++) {
        const v = (lo + hi) / 2;
        let x0 = shipX;
        let x1 = shipX;
        let t = 0;
        let ok = true;
        for (const wins of order) {
          const hit = wins.find((w) => {
            if (w.tau < t) return false;
            const span = v * (w.tau - t);
            return w.x + REACH > x0 - span && w.x - REACH < x1 + span;
          });
          if (!hit) {
            ok = false;
            break;
          }
          const span = v * (hit.tau - t);
          x0 = Math.max(x0 - span, hit.x - REACH);
          x1 = Math.min(x1 + span, hit.x + REACH);
          t = hit.tau;
        }
        if (ok) hi = v;
        else lo = v;
      }
      speedNeeded = Math.max(speedNeeded, hi);
    }
  }
  return {
    guess_error_median: round(median(guessErrors)),
    guess_error_p95: round(quantile(guessErrors, 0.95)),
    guess_error_max: round(Math.max(...guessErrors)),
    turns: brakes.length,
    speed_kept_into_turn_max: brakes.length ? round(Math.max(...brakes)) : null,
    shootable_width_min: round(widthMin),
    ship_speed_needed: round(speedNeeded, 3),
    ram_warning_min: reachesShip ? ramWarnMin : null,
    ram_warning_forward: Number.isFinite(ramWarnForward) ? ramWarnForward : null,
  };
}

function play(pattern, seeds, { goal, skill, middle }) {
  const total = { wiped: 0, lost: 0, deaths: 0, ram: 0, bullet: 0, surprise: 0, own: 0, ownSurprise: 0, minutes: 0, y: 0, n: 0, warns: [] };
  for (const seed of seeds) {
    const sim = game.createSim({ seed, mode: "rapid", drill: { pattern, count: COUNT, middle } });
    const decide = flightBot({ goal, skill }).create({ seed });
    for (let t = 0; t < PLAY_FRAMES; t++) {
      sim.lives = 9;
      game.stepSim(sim, decide(game.observe(sim), t));
      for (const e of sim.events) {
        if (e.type === "formation") total.wiped++;
        if (e.type === "formation-lost") total.lost++;
        if (e.type === "miss") {
          total.deaths++;
          total[e.cause]++;
          total.warns.push(e.warn);
          if (e.warn < 20) total.surprise++;
          // Deaths the formation itself caused: its hulls and its bullets.
          if (e.from === "small") {
            total.own++;
            if (e.warn < 20) total.ownSurprise++;
          }
        }
      }
      total.y += sim.ship.y;
      total.n++;
    }
    total.minutes += PLAY_FRAMES / 3600;
  }
  const formations = total.wiped + total.lost;
  return {
    wipe_rate: formations ? round(total.wiped / formations) : null,
    formations,
    deaths_per_minute: round(total.deaths / total.minutes),
    deaths_per_formation: formations ? round(total.deaths / formations) : null,
    ram_share: total.deaths ? round(total.ram / total.deaths) : null,
    surprise_share: total.deaths ? round(total.surprise / total.deaths) : null,
    deaths: total.deaths,
    own_deaths: total.own,
    own_surprise_share: total.deaths ? round(total.ownSurprise / total.deaths) : null,
    warning_median: median(total.warns),
    mean_y: round(total.y / total.n, 1),
  };
}

// Take runs in which the high-skill wipe bot wiped out the first formation,
// then play the same inputs again late or early by 6 frames, or from a unit
// to either side. How many still wipe it out?
function jitter(pattern, seeds) {
  let base = 0;
  let tries = 0;
  let kept = 0;
  const firstFormation = (seed, inputs, { shift = 0, dx = 0 }) => {
    const sim = game.createSim({ seed, mode: "rapid", drill: { pattern, count: COUNT } });
    sim.ship.x += dx;
    const decide = inputs ? null : flightBot({ goal: "wipe", skill: "high" }).create({ seed });
    const record = [];
    for (let t = 0; t < 900; t++) {
      sim.lives = 9;
      const bits = inputs ? (inputs[t - shift] ?? 16) : decide(game.observe(sim), t);
      record.push(bits);
      game.stepSim(sim, bits);
      for (const e of sim.events) {
        if (e.type === "formation") return { wiped: true, record };
        if (e.type === "formation-lost" || e.type === "miss") return { wiped: false, record };
      }
    }
    return { wiped: false, record };
  };
  for (const seed of seeds) {
    const first = firstFormation(seed, null, {});
    if (!first.wiped) continue;
    base++;
    for (const variant of [{ shift: 6 }, { shift: -6 }, { dx: 1 }, { dx: -1 }]) {
      tries++;
      if (firstFormation(seed, first.record, variant).wiped) kept++;
    }
  }
  return { clean_wipes: base, of: seeds.length, kept_rate: tries ? round(kept / tries) : null };
}

// The criteria of docs/flight-eval.md, fixed before the final seeds were run.
// A pattern is rejected if it trips any reject mark, adopted if it meets every
// adopt mark, and held otherwise.
export function verdict(r) {
  const g = r.geometry;
  const hi = r.play["mixed:wipe:high"];
  const lo = r.play["mixed:wipe:low"];
  const soloLo = r.play["solo:wipe:low"];
  const safe = r.play["mixed:survive:high"];
  const reject = [];
  const short = [];
  const mark = (name, rejected, adopted) => {
    if (rejected) reject.push(name);
    else if (!adopted) short.push(name);
  };
  mark(`1 turns without braking (${g.speed_kept_into_turn_max})`, g.turns > 0 && g.speed_kept_into_turn_max > 0.7, g.turns === 0 || g.speed_kept_into_turn_max <= 0.5);
  mark(`1 straight-line guess off by ${g.guess_error_p95}`, g.guess_error_p95 > 8, g.guess_error_p95 <= 4);
  mark(`2 hull warning ${g.ram_warning_min} frames`, g.ram_warning_min !== null && g.ram_warning_min < 20, g.ram_warning_min === null || g.ram_warning_min >= 40);
  mark(`3 surprise deaths ${hi.own_surprise_share}`, hi.own_surprise_share !== null && hi.own_surprise_share >= 0.2, hi.own_surprise_share === null || hi.own_surprise_share <= 0.05);
  mark(`4 shootable width ${g.shootable_width_min}`, g.shootable_width_min < 2, true);
  mark(`5 wipe rate ${hi.wipe_rate}`, hi.wipe_rate < 0.1, hi.wipe_rate >= 0.5 && hi.wipe_rate <= 0.9);
  mark(`5 too safe (low skill wipes ${soloLo.wipe_rate} alone, ${lo.wipe_rate} mixed)`, soloLo.wipe_rate >= 0.9 && lo.wipe_rate >= 0.9, true);
  mark(`6 extra risk (${hi.deaths_per_minute} against ${safe.deaths_per_minute} deaths a minute, ${hi.deaths_per_formation} a formation)`, hi.deaths_per_minute <= safe.deaths_per_minute || hi.deaths_per_formation >= 1, true);
  mark(`7 played off: ${r.jitter.kept_rate} (${r.jitter.clean_wipes} clean wipes)`, r.jitter.kept_rate !== null && r.jitter.kept_rate < 0.2, r.jitter.clean_wipes >= 3 && r.jitter.kept_rate >= 0.5);
  mark(`ship speed needed ${g.ship_speed_needed}`, g.ship_speed_needed > 0.6, g.ship_speed_needed <= 0.42);
  return { result: reject.length ? "reject" : short.length ? "hold" : "adopt", reject, short };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, "tools", "flight.mjs")) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const which = arg("--seeds", "design");
  const seeds = SEEDS[which];
  if (!seeds) {
    console.error("flight: --seeds must be design, final, final2, final3 or final4");
    process.exit(2);
  }
  const only = arg("--pattern", null);
  const report = { seeds: which, seed_list: seeds, formation_size: COUNT, play_frames_per_seed: PLAY_FRAMES, patterns: {} };
  for (const pattern of PATTERN_IDS) {
    if (only && only !== pattern) continue;
    const r = { geometry: geometry(pattern, seeds.slice(0, 6)), play: {}, jitter: jitter(pattern, seeds) };
    for (const middle of [false, true]) {
      for (const goal of ["wipe", "survive"]) {
        for (const skill of ["high", "low"]) r.play[`${middle ? "mixed" : "solo"}:${goal}:${skill}`] = play(pattern, seeds, { goal, skill, middle });
      }
    }
    report.patterns[pattern] = r;
    const g = r.geometry;
    const p = (k) => r.play[k];
    console.log(`\n${pattern}`);
    console.log(`  guess error ${g.guess_error_median} / p95 ${g.guess_error_p95} / max ${g.guess_error_max}   turns ${g.turns}, speed kept into a turn ${g.speed_kept_into_turn_max ?? "-"}   shootable width ${g.shootable_width_min}   ship speed needed ${g.ship_speed_needed}   ram warning ${g.ram_warning_min ?? "never reaches the ship"} (forward ship: ${g.ram_warning_forward ?? "-"})`);
    for (const key of Object.keys(r.play)) {
      const v = p(key);
      console.log(`  ${key.padEnd(20)} wipe ${String(v.wipe_rate).padEnd(5)} of ${String(v.formations).padStart(3)}  deaths/min ${String(v.deaths_per_minute).padEnd(5)} per formation ${String(v.deaths_per_formation).padEnd(5)} own ${String(v.own_deaths).padStart(2)}/${String(v.deaths).padEnd(3)} own-surprise ${String(v.own_surprise_share).padEnd(5)} meanY ${v.mean_y}`);
    }
    console.log(`  jitter: ${r.jitter.clean_wipes}/${r.jitter.of} clean first wipes, ${r.jitter.kept_rate} still wiped when played off`);
  }
  console.log("\nverdicts (criteria: docs/flight-eval.md)");
  for (const [pattern, r] of Object.entries(report.patterns)) {
    r.verdict = verdict(r);
    console.log(`  ${pattern.padEnd(9)} ${r.verdict.result.padEnd(6)} ${r.verdict.reject.length ? "reject: " + r.verdict.reject.join("; ") : r.verdict.short.length ? "short of adopt: " + r.verdict.short.join("; ") : "meets every adopt mark"}`);
  }
  const out = arg("--out", path.join("artifacts", "flight", `${which}.json`));
  fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nreport: ${out}`);
}
