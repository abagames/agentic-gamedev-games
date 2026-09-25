// Records a play video with sound: title/attract, then a game flown by the demo
// pilot. The soundtrack is the game's own WebAudio mix, captured in the page
// from the moment the game starts; the video is synced to it by finding the
// frame where the title text disappears. The game core is deterministic, so a (game seed, pilot seed) pair
// found in the simulator replays identically here.
//
// Usage: node tools/record-video.mjs [outDir] [titleSeconds] [playSeconds] [gameSeed] [pilotSeed]
// Writes <outDir>/blink-scope-play.mp4 (default outDir: media/) and screenshot.gif.
// Needs Playwright (repo root) and ffmpeg on PATH.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const [outDir = join(root, "media"), titleS = "5", playS = "21", gameSeed = "47", pilotSeed = "332"] = process.argv.slice(2);
const SIZE = 720;
const raw = join(outDir, "raw");
mkdirSync(raw, { recursive: true });

// Headless Chromium keeps WebAudio suspended without a user gesture unless told otherwise.
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, recordVideo: { dir: raw, size: { width: SIZE, height: SIZE } } });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(pathToFileURL(join(root, "index.html")).href);
await page.waitForFunction(() => window.__blink?.app.mode === "title");
const titleAt = (Date.now() - t0) / 1000;
await page.waitForTimeout(Number(titleS) * 1000);
await page.evaluate(([gs, ps]) => window.__blink.startRecordedGame(gs, ps), [Number(gameSeed), Number(pilotSeed)]);
await page.waitForTimeout(Number(playS) * 1000);
const audio64 = await page.evaluate(() => window.__blink.stopRecording());
writeFileSync(join(outDir, "audio.webm"), Buffer.from(audio64, "base64"));
const summary = await page.evaluate(() => {
  const g = window.__blink.game;
  return { score: g.score, sector: g.sector, kills: g.stats.kills, bestChain: g.stats.bestChain, deaths: g.stats.deaths.length };
});
await ctx.close();
await browser.close();

const webm = readdirSync(raw).find((f) => f.endsWith(".webm"));
renameSync(join(raw, webm), join(outDir, "capture.webm"));
rmSync(raw, { recursive: true });

// Find the game-start frame: the title text region goes dark when the game starts.
const cap = join(outDir, "capture.webm");
const probe = execFileSync("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${cap},crop=420:40:150:283,signalstats`, "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"]).toString();
const frames = probe.trim().split("\n").map((l) => l.split(",").map(Number)).filter((f) => f.length === 2 && !Number.isNaN(f[0]));
const titleLuma = frames.filter(([t]) => t > titleAt + 0.5 && t < titleAt + Number(titleS) - 0.5).map(([, y]) => y).sort((a, b) => a - b);
const lit = titleLuma[titleLuma.length >> 1];
const startFrame = frames.find(([t, y]) => t > titleAt + Number(titleS) - 0.5 && y < lit * 0.5);
if (!startFrame) throw new Error("could not find the game-start frame in the video");
const gameStartAt = startFrame[0];

// Trim the page load: the recording starts on a white blank page, so start at
// the first frame the (dark) game has actually drawn — found in the video
// itself, not estimated from Node-side timing.
const whole = execFileSync("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${cap},signalstats`, "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"]).toString();
const firstDark = whole.trim().split("\n").map((l) => l.split(",").map(Number)).find(([t, y]) => !Number.isNaN(y) && y < 60);
if (!firstDark) throw new Error("the game never appeared in the recording");
// Start one frame after the first dark one, so no partly painted frame remains.
const ss = (firstDark[0] + 0.05).toFixed(3);
const audioOffset = (gameStartAt - Number(ss)).toFixed(3);
const mp4 = join(outDir, "blink-scope-play.mp4");
const gif = join(root, "screenshot.gif"); // the gallery image, at the game root
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-ss", ss, "-i", cap,
  "-i", join(outDir, "audio.webm"),
  "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", "30",
  // Real leading silence, not a start-time offset: many players ignore an
  // audio track's start offset / edit list and would play the sound from 0.
  "-c:a", "aac", "-b:a", "160k", "-af", `adelay=${Math.round(audioOffset * 1000)}:all=1,apad`,
  "-shortest", "-movflags", "+faststart", mp4,
]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", ss, "-i", join(outDir, "capture.webm"), "-vf", "fps=12,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", gif]);
rmSync(cap);
rmSync(join(outDir, "audio.webm"));
console.log(JSON.stringify({ mp4, gif, trimmedAt: ss, gameStartAt, audioOffset, summary }));
