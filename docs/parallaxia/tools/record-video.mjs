#!/usr/bin/env node
// Records a clip of the game: 4 seconds of the title, then 16 seconds of play
// by the policy `keeper`. The picture is the game's own drawing, frame by
// frame; the sound is the game's own kit and music, rendered offline from the
// events the run produced, so neither depends on how fast this machine is.
//
// The first sectors of a loop have few bullets in them, so the 16 seconds are
// taken from further into a run: the policy plays --skip frames unseen (a real
// run from --start, nothing injected), and the clip cuts from the title to
// that point. The defaults are a stretch of CLOSE from the top of sector 3,
// 22 seconds into a run from sector 1, with no miss.
//
// Usage: node tools/record-video.mjs [--mode normal] [--start 1] [--seed 26] [--skip 1320]
//        (--mode normal|rapid|dense; --start 1, 11, 21, ...; --skip 0 records from the start of the run)
//        --out <name> writes artifacts/video/<name>.mp4 and .gif instead, for comparing takes
// Writes media/parallaxia.mp4 (3x the game's pixels, 30 fps, H.264 + AAC) and
//        screenshot.gif       (the game's own pixels, 15 fps, no sound).
// Needs Playwright and ffmpeg.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openGame } from "./lib/browser.mjs";
import { ROOT } from "./serve.mjs";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const MODE = arg("mode", "normal");
const START = Number(arg("start", 1));
const SEED = Number(arg("seed", 26));
const SKIP = Number(arg("skip", 1320));
const TITLE_FRAMES = 240;
const PLAY_FRAMES = 960;
const RATE = 48000;

// The page is opened stopped, so its own loop draws nothing more; the take is
// run here on a canvas of its own.
const game = await openGame({ seed: SEED, paused: true });
let take;
try {
  take = await game.page.evaluate(
    async ({ MODE, START, SEED, SKIP, TITLE_FRAMES, PLAY_FRAMES, RATE }) => {
      const { createSim, stepSim, observe } = await import("/src/sim/sim.js");
      const { MODES } = await import("/src/sim/constants.js");
      const { draw, drawTitle, CANVAS_WIDTH, CANVAS_HEIGHT } = await import("/src/render/canvas.js");
      const { createFx, fxStep } = await import("/src/render/fx.js");
      const { createAudioBus } = await import("/src/audio/bus.js");
      const { createWebAudioAdapter } = await import("/src/audio/webaudio.js");
      const { bossTuneAt, cueFor, loopForMusic } = await import("/src/audio/music.js");
      const { keeper } = await import("/tools/policies/keeper.mjs");

      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext("2d");

      const total = TITLE_FRAMES + PLAY_FRAMES;
      const audio = new OfflineAudioContext(2, Math.ceil((total / 60) * RATE), RATE);
      const output = createWebAudioAdapter(audio);
      // The bus as the page drives it, with every sound placed at the time of
      // the frame that asked for it.
      let tick = 0;
      const at = () => tick / 60 + 0.01;
      const bus = createAudioBus({
        playProgram: (program, options) => output.playProgram(program, { ...options, when: at() }),
        playMusic: (id) => id && output.playMusic(id, at()),
        pumpMusic: () => output.pumpMusic(at() + 0.5),
        stopAll: () => {},
        suspend: () => {},
        resume: () => {},
      });

      const mode = MODE;
      const sim = createSim({ seed: SEED, mode, startSector: START });
      const fx = createFx();
      const hud = { hiScore: 0, newRecord: false, label: MODES[mode].name, notice: null };
      const act = keeper.create({ seed: SEED, variant: 0 });
      const frames = [];
      const seen = { miss: 0, release: 0, destroy: 0 };
      // The part of the run nobody sees: played the same, neither drawn nor heard.
      for (let i = 0; i < SKIP; i++) {
        stepSim(sim, act(observe(sim), i));
        fxStep(fx, sim);
      }
      const from = { score: sim.score, sector: sim.stage.section + 1, lives: sim.lives };
      let bullets = 0;
      for (; tick < total; tick++) {
        const onTitle = tick < TITLE_FRAMES;
        if (onTitle) {
          drawTitle(ctx, { frame: tick, hiScore: 0, muted: false, modeName: MODES[mode].name, modeId: mode, start: START, reach: START });
        } else {
          const frame = tick - TITLE_FRAMES;
          if (frame === 0 && SKIP === 0) {
            bus.beginFrame(0);
            bus.emit("run:start");
            bus.endFrame();
          }
          stepSim(sim, act(observe(sim), SKIP + frame));
          bullets += sim.bullets.length;
          fxStep(fx, sim);
          bus.beginFrame(sim.frame);
          bus.emitSimEvents(sim.events);
          bus.endFrame();
          for (const e of sim.events) if (e.type in seen) seen[e.type] += e.type === "release" ? e.count : 1;
          draw(ctx, sim, fx, hud);
        }
        bus.setMusic(cueFor({ title: onTitle, playing: sim.phase === "play", boss: bossTuneAt(sim.stage.section, sim.stage.boss !== 0), loop: loopForMusic(sim.stage.section, sim.stage.boss !== 0) }));
        bus.pump();
        // 30 pictures a second.
        if (tick % 2 === 0) frames.push(canvas.toDataURL("image/png"));
      }
      const rendered = await audio.startRendering();
      const left = rendered.getChannelData(0);
      const right = rendered.getChannelData(1);
      let peak = 0;
      const pcm = new Int16Array(left.length * 2);
      for (let i = 0; i < left.length; i++) {
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        pcm[i * 2] = Math.max(-1, Math.min(1, left[i])) * 32767;
        pcm[i * 2 + 1] = Math.max(-1, Math.min(1, right[i])) * 32767;
      }
      let binary = "";
      const bytes = new Uint8Array(pcm.buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { frames, pcm: btoa(binary), peak, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, score: sim.score, sector: sim.stage.section + 1, chain: sim.chain, rate: sim.rate, phase: sim.phase, seen, from, bullets: bullets / PLAY_FRAMES };
    },
    { MODE, START, SEED, SKIP, TITLE_FRAMES, PLAY_FRAMES, RATE },
  );
  if (game.errors.length > 0) throw new Error(game.errors.join(" | "));
} finally {
  await game.close();
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parallaxia-video-"));
take.frames.forEach((url, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64")));
const pcm = path.join(dir, "audio.pcm");
fs.writeFileSync(pcm, Buffer.from(take.pcm, "base64"));

const OUT = arg("out", "");
const mp4 = OUT ? path.join(ROOT, "artifacts", "video", `${OUT}.mp4`) : path.join(ROOT, "media", "parallaxia.mp4");
const gif = OUT ? path.join(ROOT, "artifacts", "video", `${OUT}.gif`) : path.join(ROOT, "screenshot.gif");
fs.mkdirSync(path.dirname(mp4), { recursive: true });
const pictures = ["-framerate", "30", "-i", path.join(dir, "f%04d.png")];
const quiet = ["-y", "-v", "error"];
execFileSync("ffmpeg", [...quiet, ...pictures, "-f", "s16le", "-ar", String(RATE), "-ac", "2", "-i", pcm, "-vf", "scale=iw*3:ih*3:flags=neighbor", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", mp4]);
execFileSync("ffmpeg", [...quiet, ...pictures, "-vf", "fps=15,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none", gif]);
fs.rmSync(dir, { recursive: true });

const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`;
console.log(`${MODE} from sector ${START}, seed ${SEED}, ${SKIP} frames skipped: sector ${take.from.sector} to ${take.sector}, score ${take.from.score} to ${take.score}`);
console.log(`in the clip: ${take.seen.destroy} destroyed, ${take.seen.release} lasers, ${take.seen.miss} misses, ${take.bullets.toFixed(1)} enemy bullets in the field on average, ended in '${take.phase}'`);
console.log(`sound: peak ${take.peak.toFixed(3)} of full scale`);
console.log(`saved ${path.relative(ROOT, mp4)} (${take.width * 3}x${take.height * 3}, ${kb(mp4)}) and ${path.relative(ROOT, gif)} (${take.width}x${take.height}, ${kb(gif)})`);
