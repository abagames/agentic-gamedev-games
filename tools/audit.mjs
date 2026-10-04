#!/usr/bin/env node
// Reads a ladder report and prints what deserves a look. Every line is a SIGNAL to
// examine, not a verdict: the tool cannot know what the design intends.
//
//   node tools/audit.mjs <ladder.json>
//
// Always exits 0 when the report can be read. Decide what to do with each signal.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: audit.mjs <ladder.json>");
  process.exit(2);
}
const report = JSON.parse(readFileSync(file, "utf8"));
const intent = report.intent || {};
const T = { coreShare: 0.5, regionShare: 0.05, absentS: 5, closeRatio: 0.9, minSeeds: 16, ...(intent.thresholds || {}) };
const policies = Object.entries(report.policies);
const skilled = policies.filter(([, p]) => p.profile !== "baseline" && !p.role);
const byProfile = (profile) => policies.filter(([, p]) => p.profile === profile && !p.role);
const signals = [];
const notes = [];
const pct = (x) => `${Math.round(x * 100)}%`;

if (!skilled.length) notes.push("no skilled policy in the report; usage checks need one");

// Core interaction share.
if (intent.core) {
  for (const [name, p] of skilled) {
    const a = p.usage_analysis.action_share[intent.core];
    const s = p.usage_analysis.score_share[intent.core];
    // Frequent filler actions (collecting dots) can outnumber the core without displacing it,
    // so a low action share alone is only a note; low on both counts is a signal.
    const lowA = a !== undefined && a < T.coreShare;
    const lowS = s !== undefined && s < T.coreShare;
    if (a === undefined && s === undefined) notes.push(`${name}: no action or score event tagged "${intent.core}"`);
    else if (lowA && lowS) signals.push(`core "${intent.core}" is ${pct(a)} of ${name}'s actions and ${pct(s)} of its score`);
    else if (lowS && a === undefined) signals.push(`core "${intent.core}" is ${pct(s)} of ${name}'s score`);
    else if (lowA && s === undefined) signals.push(`core "${intent.core}" is ${pct(a)} of ${name}'s actions`);
    else if (lowA) notes.push(`core "${intent.core}" is ${pct(a)} of ${name}'s actions but ${pct(s)} of its score`);
    else if (lowS) notes.push(`core "${intent.core}" is ${pct(a)} of ${name}'s actions but only ${pct(s)} of its score`);
  }
} else notes.push("adapter declares no intent.core; core share not checked");

// Play space.
for (const region of intent.regions || []) {
  for (const [name, p] of skilled) {
    const share = p.usage_analysis.region_time_share[region] || 0;
    if (share < T.regionShare) signals.push(`region "${region}" holds ${pct(share)} of ${name}'s time`);
  }
}

// Threats: a threat that fires and never lands, for any skilled policy, may not be a danger.
const threatIds = new Set([...(intent.threats || [])]);
for (const [, p] of policies) for (const id of Object.keys(p.usage_analysis.threats)) threatIds.add(id);
for (const id of threatIds) {
  const rows = policies.map(([, p]) => p.usage_analysis.threats[id] || { fires_per_min: 0, hits_per_min: 0 });
  const fires = Math.max(...rows.map((r) => r.fires_per_min));
  const hits = Math.max(...rows.map((r) => r.hits_per_min));
  if (fires === 0) signals.push(`threat "${id}" never fires for any policy`);
  else if (hits === 0) signals.push(`threat "${id}" fires (up to ${fires}/min) and never hits any policy`);
}

// Primary threat presence.
for (const [name, p] of skilled) {
  const s = p.usage_analysis.longest_no_primary_threat_s;
  if (s !== null && s > T.absentS) signals.push(`primary threat absent for up to ${s}s under ${name}`);
}

// Objective-ignoring policies.
const best = skilled.reduce((a, [, p]) => Math.max(a, p.mean_score), 0);
for (const [name, p] of policies) {
  if (p.role === "stall" && p.mean_score > best) {
    signals.push(`stalling (${name}) scores ${p.mean_score} against ${best} for the best goal-seeking policy over whole runs; check whether the gain is capped and what waiting costs before calling it an exploit`);
  }
  if (p.role === "survive_only" && p.success_rate > 0) {
    signals.push(`survive-only (${name}) reaches the success state in ${pct(p.success_rate)} of runs`);
  }
}

// Simple play.
const humans = byProfile("human-limited");
const humanBest = humans.reduce((a, [, p]) => Math.max(a, p.mean_score), 0);
for (const [name, p] of byProfile("baseline")) {
  if (humans.length && p.mean_score >= humanBest) signals.push(`baseline ${name} scores ${p.mean_score}, at or above the best human-limited policy (${humanBest})`);
}

// Ceiling question: closeness alone proves nothing, so say what would explain it.
const strong = [...byProfile("oracle"), ...byProfile("precise")];
for (const [sName, s] of strong) {
  for (const [hName, h] of humans) {
    if (s.mean_score > 0 && h.mean_score / s.mean_score >= T.closeRatio) {
      const saturated = s.success_rate === 1 && h.success_rate === 1;
      notes.push(
        `${sName} and ${hName} score within ${pct(1 - T.closeRatio)} of each other` +
          (saturated ? "; both always succeed, so the metric is saturated and this says nothing about the policy" : "; rule out a game that does not reward precision, then read the strong policy's failures"),
      );
    }
  }
}

if (report.run_config.seed_set.length < T.minSeeds) {
  notes.push(`only ${report.run_config.seed_set.length} seeds; double them before using a rate as a target`);
}

console.log(`read ${file}: ${policies.length} policies, ${report.run_config.seed_set.length} seeds`);
for (const s of signals) console.log(`SIGNAL ${s}`);
for (const n of notes) console.log(`NOTE   ${n}`);
console.log(`${signals.length} signal(s), ${notes.length} note(s)`);
