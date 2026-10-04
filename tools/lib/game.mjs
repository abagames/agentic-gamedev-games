// Loads a game's adapter (tests/adapter.cjs) and runs policies against it.
// The adapter contract is described in tools/README.md.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const REQUIRED = ["tickS", "create", "step", "ended", "result", "policies"];

export function loadAdapter(gameDir) {
  const file = path.resolve(gameDir, "tests", "adapter.cjs");
  if (!existsSync(file)) throw new Error(`no adapter at ${file} (see tools/README.md)`);
  const adapter = require(file);
  const missing = REQUIRED.filter((k) => adapter[k] === undefined);
  if (missing.length) throw new Error(`adapter ${file} is missing: ${missing.join(", ")}`);
  return adapter;
}

export function runOne(adapter, policy, seed, { maxS = 600, opts } = {}) {
  const state = adapter.create(seed, opts);
  const maxTicks = Math.ceil(maxS / adapter.tickS);
  const u = { actions: {}, score: {}, regions: {}, fires: {}, hits: {}, failures: {} };
  const primary = adapter.intent && adapter.intent.primaryThreat;
  let ticks = 0;
  let absent = 0;
  let longestAbsent = 0;
  const bump = (bag, key, by = 1) => { bag[key] = (bag[key] || 0) + by; };

  while (!adapter.ended(state) && ticks < maxTicks) {
    adapter.step(state, policy(state) || {});
    ticks++;
    for (const e of adapter.events ? adapter.events(state) || [] : []) {
      if (e.type === "action") bump(u.actions, e.source);
      else if (e.type === "score") bump(u.score, e.source, e.amount);
      else if (e.type === "threat_fire") bump(u.fires, e.id);
      else if (e.type === "threat_hit") bump(u.hits, e.id);
      else if (e.type === "failure") bump(u.failures, e.cause);
    }
    if (adapter.region) bump(u.regions, adapter.region(state));
    if (primary && adapter.threatPresent) {
      absent = adapter.threatPresent(state, primary) ? 0 : absent + 1;
      if (absent > longestAbsent) longestAbsent = absent;
    }
  }

  const r = adapter.result(state);
  const out = {
    seed,
    score: r.score,
    progress: r.progress,
    success: !!r.success,
    timedOut: !adapter.ended(state),
    elapsedS: +(ticks * adapter.tickS).toFixed(3),
    failures: r.failures || u.failures,
    usage: u,
    longestNoPrimaryThreatS: primary && adapter.threatPresent ? +(longestAbsent * adapter.tickS).toFixed(3) : null,
  };
  // Identical fingerprints before and after a presentation-only change mean the rules were not touched.
  out.fingerprint = createHash("sha1")
    .update(JSON.stringify([out.score, out.progress, out.success, ticks, out.failures, u]))
    .digest("hex")
    .slice(0, 12);
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round = (x, d = 3) => +x.toFixed(d);

function share(bags) {
  const total = {};
  for (const bag of bags) for (const [k, v] of Object.entries(bag)) total[k] = (total[k] || 0) + v;
  const sum = Object.values(total).reduce((a, b) => a + b, 0);
  const out = {};
  for (const [k, v] of Object.entries(total)) out[k] = sum ? round(v / sum) : 0;
  return out;
}

export function summarize(runs) {
  const minutes = runs.reduce((a, r) => a + r.elapsedS, 0) / 60 || 1;
  const perMin = (pick) => {
    const total = {};
    for (const r of runs) for (const [k, v] of Object.entries(pick(r))) total[k] = (total[k] || 0) + v;
    return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, round(v / minutes, 2)]));
  };
  const fires = perMin((r) => r.usage.fires);
  const hits = perMin((r) => r.usage.hits);
  const threats = {};
  for (const id of new Set([...Object.keys(fires), ...Object.keys(hits)])) {
    threats[id] = { fires_per_min: fires[id] || 0, hits_per_min: hits[id] || 0 };
  }
  const absences = runs.map((r) => r.longestNoPrimaryThreatS).filter((x) => x !== null);
  return {
    runs: runs.length,
    mean_score: round(mean(runs.map((r) => r.score)), 1),
    median_score: median(runs.map((r) => r.score)),
    mean_progress: round(mean(runs.map((r) => r.progress)), 2),
    median_progress: median(runs.map((r) => r.progress)),
    success_rate: round(mean(runs.map((r) => (r.success ? 1 : 0)))),
    timed_out_rate: round(mean(runs.map((r) => (r.timedOut ? 1 : 0)))),
    mean_elapsed_s: round(mean(runs.map((r) => r.elapsedS)), 1),
    failures_per_run: Object.fromEntries(
      Object.entries(perMin((r) => r.failures)).map(([k, v]) => [k, round((v * minutes) / runs.length, 2)]),
    ),
    usage_analysis: {
      action_share: share(runs.map((r) => r.usage.actions)),
      score_share: share(runs.map((r) => r.usage.score)),
      region_time_share: share(runs.map((r) => r.usage.regions)),
      threats,
      longest_no_primary_threat_s: absences.length ? Math.max(...absences) : null,
    },
    fingerprints: Object.fromEntries(runs.map((r) => [r.seed, r.fingerprint])),
  };
}

export function runPolicy(adapter, name, seeds, options) {
  const def = adapter.policies[name];
  if (!def) throw new Error(`unknown policy "${name}" (have: ${Object.keys(adapter.policies).join(", ")})`);
  const runs = seeds.map((seed) => runOne(adapter, def.make(seed), seed, options));
  return { profile: def.profile || "unspecified", role: def.role || null, ...summarize(runs) };
}

export function parseArgs(argv, flags = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (flags[key] === "bool") out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}
