#!/usr/bin/env node
// How a person played, from the replays in a review zip on the snapshot they played, beside the
// same figures for chosen policies on the same seeds. For building or correcting a human-like
// policy (evaluating-gameplay-balance, "Calibrating against play reports").
//
//   node tools/replay-stats.mjs <review.zip> <snapshot-dir> [--policies human,strong] [--fit rung] [--exclude earlier.zip]
//        [--tolerance 0.25] [--min-n 8] [--react-max-s 2] [--max-s 600] [--json out.json]
//
// Figures: results per run; input rate and hold durations; reaction latency from a threat's first
// appearance to the next input change; the rate of each rules event; share of time per region;
// distance to threats at the moment of failure; failure causes; results per life. Each figure says
// how many events it rests on. Figures whose adapter hooks are missing are named and left out.
// Desynchronised replays are left out.
//
// --fit names the policy fitted to this person (a rung). It is compared with the person figure by
// figure: a FIT line says how many figures agree within the tolerance, and an OFF line names each
// that does not. A rung fitted on results alone usually agrees on results and is OFF on the figures
// that say how the person plays; those lines are what REVISION_HISTORY records as where the fit fails.
//
// Exit codes: 0 figures printed; 1 the build was refused or no replay could be used; 2 usage.
import { writeFileSync } from "node:fs";
import { loadAdapter, parseArgs } from "./lib/game.mjs";
import { checkBuild, excludeList, loadSession, replayRun, replayable, reportExcluded } from "./lib/session.mjs";

const args = parseArgs(process.argv.slice(2));
const [zipFile, dir] = args._;
if (!zipFile || !dir) {
  console.error("usage: replay-stats.mjs <review.zip> <snapshot-dir> [--policies a,b] [--fit rung] [--exclude a.zip] [--tolerance 0.25] [--min-n 8] [--react-max-s 2] [--max-s 600] [--json out.json]");
  process.exit(2);
}
const { session, replays, excluded } = loadSession(zipFile, { exclude: excludeList(args.exclude) });
console.log(`${session.runs.length} run(s) of ${session.slug}, build ${session.build}`);
reportExcluded(excluded, args.exclude);
const build = checkBuild(dir, session.build);
if (!build.ok) {
  console.log(`BUILD NOT VERIFIED: ${build.why}.`);
  console.log("Run this on the snapshot that was played.");
  process.exit(1);
}
console.log(`build: ${build.status}`);
let adapter = null;
try { adapter = loadAdapter(dir); } catch { adapter = null; }
const unavailable = replayable(session, adapter);
if (unavailable) {
  console.log(`NOTE ${unavailable}. Only the run summaries can be compared: use calibrate.mjs --zip.`);
  process.exit(1);
}
const tickS = adapter.tickS;
const reactMax = Math.round(+(args["react-max-s"] || 2) / tickS);

const neutral = (input) => !input || Object.values(input).every((v) => !v);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r2 = (x) => (x === null ? null : +x.toFixed(2));

// One figure collector per player; fed the same way for a replay and for a policy.
function collector() {
  const c = { runs: 0, results: [], events: {}, ticks: 0, changes: 0, holds: [], appears: [], latencies: [], noResponse: 0, regions: {}, failDist: [], causes: {}, lives: [], usedAppear: null };
  let last = null, holdLen = 0, pending = [], prevDist = null, lifeStart = 0, lifeScore = 0, life = 0;
  return {
    c,
    begin(state) { last = null; holdLen = 0; pending = []; prevDist = null; lifeStart = 0; life = 0; lifeScore = adapter.result(state).score; },
    step(state, t, input, events) {
      c.ticks++;
      const s = JSON.stringify(input || {});
      const changed = last !== null && s !== last;
      if (changed) {
        c.changes++;
        for (const a of pending) c.latencies.push(t - a);
        pending = [];
        if (holdLen && !neutral(JSON.parse(last))) c.holds.push(holdLen);
        holdLen = 0;
      }
      last = s;
      holdLen++;
      pending = pending.filter((a) => { if (t - a > reactMax) { c.noResponse++; return false; } return true; });
      for (const e of events) {
        const ek = e.source !== undefined ? `${e.type}:${e.source}` : e.cause !== undefined ? `${e.type}:${e.cause}` : e.type;
        c.events[ek] = (c.events[ek] || 0) + 1;
        if (e.type === "threat_appear") { c.usedAppear = true; pending.push(t); c.appears.push(t); }
        else if (e.type === "threat_fire" && c.usedAppear !== true && !appearSupported) { pending.push(t); c.appears.push(t); }
        if (e.type === "failure") {
          c.causes[e.cause] = (c.causes[e.cause] || 0) + 1;
          if (prevDist !== null) c.failDist.push(prevDist);
          const score = adapter.result(state).score;
          c.lives.push({ s: (t - lifeStart) * tickS, score: score - lifeScore, idx: life++ });
          lifeStart = t; lifeScore = score;
        }
      }
      if (adapter.region) { const g = adapter.region(state); c.regions[g] = (c.regions[g] || 0) + 1; }
      if (adapter.player && adapter.threats) {
        const p = adapter.player(state), ts = adapter.threats(state) || [];
        prevDist = ts.length ? Math.min(...ts.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) : null;
      }
    },
    end(state, t, ended) {
      const res = adapter.result(state);
      c.runs++; c.results.push({ score: res.score, progress: res.progress, s: t * tickS });
      if (holdLen && last !== null && !neutral(JSON.parse(last))) c.holds.push(holdLen);
      // a run that ended other than by a failure closes its last life at the end; one ended by a
      // failure (within the last 5 s: games hold a moment before game over) has already closed it
      const byFailure = life > 0 && (t - lifeStart) * tickS <= 5 && adapter.result(state).score === lifeScore;
      if (ended && t > lifeStart && !byFailure) { const score = adapter.result(state).score; c.lives.push({ s: (t - lifeStart) * tickS, score: score - lifeScore, idx: life++ }); }
    },
  };
}

// Whether this adapter emits threat_appear at all, found from a short policy run, so the person
// and the policies use the same appearance event.
let appearSupported = false;
{
  const any = Object.values(adapter.policies)[0];
  const st = adapter.create(1);
  const pol = any.make(1);
  for (let t = 0; t < Math.round(120 / tickS) && !adapter.ended(st) && !appearSupported; t++) {
    adapter.step(st, pol(st) || {});
    if ((adapter.events ? adapter.events(st) || [] : []).some((e) => e.type === "threat_appear")) appearSupported = true;
  }
}

const person = collector();
const seeds = [];
let used = 0;
const skipped = [];
for (const run of session.runs) {
  const replay = replays.get(run.run);
  if (!replay || replay.seed === null || replay.seed === undefined) { skipped.push(`run ${run.run}: no replay or seed`); continue; }
  // Check the whole replay before reading anything from it.
  const check = replayRun(adapter, replay);
  if (check.desync) { skipped.push(`run ${run.run}: DESYNCHRONISED at tick ${check.desync.tick}`); continue; }
  if (!check.checked) { skipped.push(`run ${run.run}: no recorded hash to check (${replay.ticks} ticks)`); continue; }
  person.begin(adapter.create(replay.seed));
  let lastState = null, lastT = 0;
  replayRun(adapter, replay, (state, t, input, events) => { person.step(state, t, input, events); lastState = state; lastT = t; });
  if (lastState) person.end(lastState, lastT, adapter.ended(lastState));
  seeds.push(replay.seed);
  used++;
}
for (const s of skipped) console.log(`SKIP ${s}`);
if (!used) { console.log("No replay could be used."); process.exit(1); }

const names = args.policies ? args.policies.split(",") : Object.entries(adapter.policies).filter(([, p]) => !p.role && p.profile !== "baseline").map(([n]) => n);
if (args.fit && !names.includes(args.fit)) names.push(args.fit);
const bad = names.filter((n) => !adapter.policies[n]);
if (bad.length) { console.error(`unknown policy: ${bad.join(", ")} (have: ${Object.keys(adapter.policies).join(", ")})`); process.exit(2); }
const maxTicks = Math.ceil(+(args["max-s"] || 600) / tickS);
const players = { person: person.c };
for (const name of names) {
  const col = collector();
  for (const seed of seeds) {
    const st = adapter.create(seed);
    const pol = adapter.policies[name].make(seed);
    col.begin(st);
    let t = 0;
    while (!adapter.ended(st) && t < maxTicks) {
      const input = pol(st) || {};
      adapter.step(st, input);
      t++;
      col.step(st, t, input, adapter.events ? adapter.events(st) || [] : []);
    }
    col.end(st, t, adapter.ended(st));
  }
  players[name] = col.c;
}

const missing = [];
if (!adapter.events) missing.push("events(state): reaction latency, failure causes, per-life results");
else if (!appearSupported) missing.push('a "threat_appear" event: reaction latency is measured from threat_fire instead');
if (!adapter.region) missing.push("region(state): time per region");
if (!adapter.player || !adapter.threats) missing.push("player(state) and threats(state): distance to threats at failure");

// Rows: [label, (c) => value, (c) => n events it rests on]
const regions = [...new Set(Object.values(players).flatMap((c) => Object.keys(c.regions)))];
const causes = [...new Set(Object.values(players).flatMap((c) => Object.keys(c.causes)))];
const eventKinds = [...new Set(Object.values(players).flatMap((c) => Object.keys(c.events)))].sort();
const lifeCount = Math.min(5, Math.max(0, ...Object.values(players).flatMap((c) => c.lives.map((l) => l.idx + 1))));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rows = [
  ["seconds played", (c) => r2(c.ticks * tickS), () => null],
  ["seconds per run", (c) => r2(mean(c.results.map((x) => x.s))), (c) => c.runs],
  ["progress per run", (c) => r2(mean(c.results.map((x) => x.progress ?? 0))), (c) => c.runs],
  ["score per run", (c) => r2(mean(c.results.map((x) => x.score ?? 0))), (c) => c.runs],
  ["input changes per s", (c) => r2(c.changes / (c.ticks * tickS || 1)), (c) => c.changes],
  ["hold median s", (c) => r2(median(c.holds) === null ? null : median(c.holds) * tickS), (c) => c.holds.length],
  ["hold p90 s", (c) => r2(pct(c.holds, 0.9) === null ? null : pct(c.holds, 0.9) * tickS), (c) => c.holds.length],
];
if (adapter.events) {
  rows.push(
    ["reaction median s", (c) => r2(median(c.latencies) === null ? null : median(c.latencies) * tickS), (c) => c.latencies.length],
    ["reaction p25 s", (c) => r2(pct(c.latencies, 0.25) === null ? null : pct(c.latencies, 0.25) * tickS), (c) => c.latencies.length],
    [`no input change within ${+(reactMax * tickS).toFixed(2)} s`, (c) => r2(c.noResponse / (c.appears.length || 1)), (c) => c.appears.length],
  );
}
for (const k of eventKinds) rows.push([`${k} per min`, (c) => r2(((c.events[k] || 0) / (c.ticks * tickS || 1)) * 60), (c) => c.events[k] || 0]);
for (const g of regions) rows.push([`time in ${g}`, (c) => r2((c.regions[g] || 0) / (c.ticks || 1)), () => null]);
if (adapter.player && adapter.threats) {
  rows.push(["threat distance at failure, median", (c) => r2(median(c.failDist)), (c) => c.failDist.length]);
  rows.push(["threat distance at failure, p25", (c) => r2(pct(c.failDist, 0.25)), (c) => c.failDist.length]);
}
for (const k of causes) rows.push([`failures: ${k} per run`, (c) => r2((c.causes[k] || 0) / seeds.length), (c) => c.causes[k] || 0]);
for (let i = 0; i < lifeCount; i++) {
  // lives are numbered within each run: they end at its failures, and the last one at the run's end
  const of = (c) => c.lives.filter((l) => l.idx === i);
  rows.push([`life ${i + 1}: mean s`, (c) => (of(c).length ? r2(of(c).reduce((a, b) => a + b.s, 0) / of(c).length) : null), (c) => of(c).length]);
  rows.push([`life ${i + 1}: mean score`, (c) => (of(c).length ? r2(of(c).reduce((a, b) => a + b.score, 0) / of(c).length) : null), (c) => of(c).length]);
}

console.log(`${used} replay(s) on seeds ${seeds.join(", ")}; policies run on the same seeds.`);
const cols = Object.keys(players);
const cell = (v, n) => (v === null ? "-" : String(v)) + (n === null || n === undefined ? "" : ` (${n})`);
const width = Math.max(...rows.map((r) => r[0].length));
console.log(["".padEnd(width), ...cols.map((c) => c.padStart(14))].join("  "));
const table = [];
for (const [label, f, n] of rows) {
  const vals = cols.map((c) => [f(players[c]), n(players[c])]);
  table.push({ figure: label, ...Object.fromEntries(cols.map((c, i) => [c, { value: vals[i][0], n: vals[i][1] }])) });
  console.log([label.padEnd(width), ...vals.map(([v, k]) => cell(v, k).padStart(14))].join("  "));
}
console.log("(n) is the number of events a figure rests on. A figure on few events is weak evidence.");
for (const m of missing) console.log(`MISSING ${m}`);

// The rung against the person, figure by figure. A figure counts when the person's value rests on
// enough events (results per run count runs); totals that only measure how long was played do not.
let fit = null;
if (args.fit) {
  const tol = +(args.tolerance || 0.25);
  const minN = +(args["min-n"] || 8);
  fit = { rung: args.fit, tolerance: tol, minN, within: [], off: [], thin: [] };
  for (const row of table) {
    if (row.figure === "seconds played") continue;
    const p = row.person, b = row[args.fit];
    const isRun = /per run$/.test(row.figure);
    if (p.value === null || b.value === null) { fit.thin.push(row.figure); continue; }
    if (!isRun && p.n !== null && p.n < minN) { fit.thin.push(row.figure); continue; }
    const diff = b.value - p.value;
    const scale = Math.max(Math.abs(p.value), Math.abs(b.value));
    // shares and small rates: a difference under 0.05 is within, whatever its ratio
    const ok = Math.abs(diff) <= 0.05 || Math.abs(diff) <= tol * scale;
    const entry = { figure: row.figure, person: p.value, rung: b.value, change: p.value ? +(diff / Math.abs(p.value)).toFixed(2) : null };
    (ok ? fit.within : fit.off).push(entry);
  }
  const total = fit.within.length + fit.off.length;
  console.log("");
  console.log(`FIT ${args.fit} against the person: ${fit.within.length} of ${total} figures within ${Math.round(tol * 100)}%`);
  for (const o of fit.off) console.log(`OFF ${o.figure}: person ${o.person}, ${args.fit} ${o.rung}${o.change === null ? "" : ` (${o.change > 0 ? "+" : ""}${Math.round(o.change * 100)}%)`}`);
  if (fit.thin.length) console.log(`THIN too few events to compare (person n < ${minN}): ${fit.thin.join("; ")}`);
  if (seeds.length < 3) console.log(`NOTE the rung ran on ${seeds.length} seed(s), those the person played; results per run on so few seeds are weak evidence.`);
}
if (args.json) writeFileSync(args.json, JSON.stringify({ build: session.build, seeds, skipped, missing, table, fit }, null, 2) + "\n");
