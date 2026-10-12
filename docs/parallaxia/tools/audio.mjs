#!/usr/bin/env node
// Checks the sound kit in two ways:
//   1. writes the kit as a manifest (artifacts/audio/manifest.json, derived
//      from src/audio/kit.js) and runs the audio kit validator on it
//   2. renders every program in a headless browser and measures the output:
//      none may be silent, none may clip, and the loudest moments the game can
//      produce (every voice at once) must stay below full scale
//
// Usage: node tools/audio.mjs            the checks above
//        node tools/audio.mjs --break    writes a kit that breaks its budget,
//                                        which the validator must reject

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { manifest, PROGRAMS } from "../src/audio/kit.js";
import { openGame } from "./lib/browser.mjs";
import { ROOT } from "./serve.mjs";

const broken = process.argv.includes("--break");
const outDir = path.join(ROOT, "artifacts", "audio");
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, broken ? "manifest-broken.json" : "manifest.json");
const data = manifest();
if (broken) data.programs.shot.steps[0].duration = 3;
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

const run = spawnSync(process.execPath, [path.join("tools", "vendor", "validate-audio-kit.mjs"), path.relative(ROOT, file)], { cwd: ROOT, encoding: "utf8" });
const output = (run.stdout ?? "") + (run.stderr ?? "");
process.stdout.write(output);
if (output.trim() === "") {
  console.error("FAIL: the validator printed nothing, so it did not run");
  process.exit(1);
}
if (run.status !== 0) {
  console.error(`FAIL kit manifest: validator exited ${run.status}`);
  process.exit(1);
}
if (broken) process.exit(0);

// Render through the same adapter the game uses, into an offline context.
const game = await openGame({ seed: 1 });
let report;
try {
  report = await game.page.evaluate(async () => {
    const kit = await import("/src/audio/kit.js");
    const { createWebAudioAdapter } = await import("/src/audio/webaudio.js");
    const rate = 44100;
    const render = async (programs, seconds) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
      const adapter = createWebAudioAdapter(ctx);
      for (const p of programs) adapter.playProgram(p, { when: 0.01 });
      const samples = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      let sum = 0;
      let last = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
        sum += a * a;
        if (a > 0.001) last = i;
      }
      return { peak, rms: Math.sqrt(sum / samples.length), soundsFor: last / rate - 0.01 };
    };
    // A cue, alone or under a set of effects that start two seconds in.
    const music = await import("/src/audio/music.js");
    const renderCue = async (id, seconds, programs = []) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
      const adapter = createWebAudioAdapter(ctx);
      adapter.playMusic(id, 0.01);
      adapter.pumpMusic(seconds);
      for (const p of programs) adapter.playProgram(p, { when: 2 });
      const samples = (await ctx.startRendering()).getChannelData(0);
      let peak = 0;
      let sum = 0;
      let quiet = 0;
      let longestQuiet = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > peak) peak = a;
        sum += a * a;
        quiet = a < 0.002 ? quiet + 1 : 0;
        if (quiet > longestQuiet) longestQuiet = quiet;
      }
      return { peak, rms: Math.sqrt(sum / samples.length), longestSilence: longestQuiet / rate };
    };
    const out = { programs: {}, groups: {}, cues: {}, under: {} };
    for (const id of Object.keys(music.CUES)) out.cues[id] = { ...(await renderCue(id, 20)), seconds: music.CUES[id].frames / 60, loopFrom: music.CUES[id].loopFrame / 60 };
    for (const p of Object.values(kit.PROGRAMS)) out.programs[p.id] = { ...(await render([p], kit.programDuration(p) + 0.2)), duration: kit.programDuration(p) };
    // The loudest things that can share a frame: one program per voice set.
    const P = kit.PROGRAMS;
    const groups = {
      "miss + game over": [P.miss, P["jingle:gameover"]],
      "miss + extend + laser-hit": [P.miss, P["jingle:extend"], P["laser-hit"]],
      "destroy-large + release + formation": [P["destroy-large"], P.release, P.formation],
      "destroy-middle + lock + chain-break": [P["destroy-middle"], P.lock, P["chain-break"]],
      "shot + hit + destroy-small + formation": [P.shot, P.hit, P["destroy-small"], P.formation],
    };
    for (const [name, list] of Object.entries(groups)) out.groups[name] = await render(list, 1);
    // The loudest effects over the loudest music.
    out.under["boss + miss + game over"] = await renderCue("boss", 4, [P.miss, P["jingle:gameover"]]);
    out.under["stage-a + destroy-large + release + formation"] = await renderCue("stage-a", 12, [P["destroy-large"], P.release, P.formation]);
    out.under["boss + boss-destroy + extend"] = await renderCue("boss", 4, [P["boss-destroy"], P["jingle:extend"]]);
    return out;
  });
} finally {
  await game.close();
}
fs.writeFileSync(path.join(outDir, "levels.json"), JSON.stringify(report, null, 2) + "\n");

const failures = [];
const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : "-inf");
console.log("program            peak     dBFS   sounds for / written");
for (const [id, r] of Object.entries(report.programs)) {
  console.log(`  ${id.padEnd(16)} ${r.peak.toFixed(3)}  ${db(r.peak).padStart(6)}   ${r.soundsFor.toFixed(3)}s / ${r.duration.toFixed(3)}s`);
  if (r.peak < 0.02) failures.push(`${id} is silent (peak ${r.peak.toFixed(4)})`);
  if (r.peak >= 0.99) failures.push(`${id} clips (peak ${r.peak.toFixed(3)})`);
  if (r.soundsFor > r.duration + 0.02) failures.push(`${id} rings ${(r.soundsFor - r.duration).toFixed(3)}s past its written end`);
  if (r.soundsFor < r.duration * 0.6) failures.push(`${id} falls silent long before its written end`);
}
console.log("together                                  peak     dBFS");
for (const [name, r] of Object.entries(report.groups)) {
  console.log(`  ${name.padEnd(38)} ${r.peak.toFixed(3)}  ${db(r.peak).padStart(6)}`);
  if (r.peak >= 0.99) failures.push(`"${name}" clips (peak ${r.peak.toFixed(3)})`);
}
console.log("music cue      peak     dBFS    rms    longest silence   loop");
for (const [id, r] of Object.entries(report.cues)) {
  console.log(`  ${id.padEnd(12)} ${r.peak.toFixed(3)}  ${db(r.peak).padStart(6)}  ${r.rms.toFixed(3)}   ${r.longestSilence.toFixed(2)}s          ${r.loopFrom.toFixed(1)}s to ${r.seconds.toFixed(1)}s`);
  if (r.peak < 0.02) failures.push(`cue ${id} is silent (peak ${r.peak.toFixed(4)})`);
  if (r.peak >= 0.99) failures.push(`cue ${id} clips (peak ${r.peak.toFixed(3)})`);
  if (r.longestSilence > 1.2) failures.push(`cue ${id} falls silent for ${r.longestSilence.toFixed(2)}s`);
}
console.log("effects over music                                peak     dBFS");
for (const [name, r] of Object.entries(report.under)) {
  console.log(`  ${name.padEnd(46)} ${r.peak.toFixed(3)}  ${db(r.peak).padStart(6)}`);
  if (r.peak >= 0.99) failures.push(`"${name}" clips (peak ${r.peak.toFixed(3)})`);
}
if (Object.keys(report.programs).length !== Object.keys(PROGRAMS).length) failures.push("not every program was rendered");
for (const f of failures) console.error(`FAIL ${f}`);
console.log(failures.length === 0 ? `PASS: ${Object.keys(report.programs).length} programs and ${Object.keys(report.cues).length} music cues rendered, none silent, none clipping` : `FAIL: ${failures.length} problem(s)`);
process.exit(failures.length === 0 ? 0 : 1);
