// Records a promo clip with sound: the title screen, then a round flown by the demo pilot.
// The canvas and the game's own WebAudio mix are captured together by one in-page
// MediaRecorder, so picture and sound are in sync by construction. The game core is
// deterministic and the autopilot is fed tick-synchronously, so a seed found in the
// simulator replays the same here.
//
// Usage: node tools/record-video.cjs [outDir] [titleSeconds] [playSeconds] [gameSeed] [pilotHaulAt]
// Needs Playwright (repo root node_modules) and ffmpeg on PATH.
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const [outDir = path.join(root, "media"), titleS = "4", playS = "16", seed = "201", haulAt = "3"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("file://" + path.join(root, "index.html"));
  await page.waitForFunction(() => window.__sky && window.__sky.app.mode === "title");
  // Audio needs a context: unlock it, then record canvas + master bus into one stream.
  await page.evaluate(() => {
    SKYAUDIO.unlock();
    const bus = SKYAUDIO.bus();
    const actx = bus.context;
    const dest = actx.createMediaStreamDestination();
    bus.connect(dest);
    const canvas = document.querySelector("canvas");
    const stream = new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 8e6 });
    window.__chunks = [];
    rec.ondataavailable = (e) => e.data.size && window.__chunks.push(e.data);
    rec.start(250);
    window.__rec = rec;
    window.__sky.app.modeT = 0; // title from its first frame
  });
  await page.waitForTimeout(Number(titleS) * 1000);
  await page.evaluate(
    ({ seed, haulAt }) => {
      const S = window.__sky;
      const bot = SKYBOTS.reader({ haulAt, seed });
      S.startGame(seed);
      S.app.autopilot = (g) => {
        const i = bot(g);
        return { dx: Math.sign(i.dx), dy: Math.sign(i.dy) };
      };
    },
    { seed: Number(seed), haulAt: Number(haulAt) }
  );
  await page.waitForTimeout(Number(playS) * 1000);
  const b64 = await page.evaluate(
    () =>
      new Promise((res) => {
        const rec = window.__rec;
        rec.onstop = async () => {
          const blob = new Blob(window.__chunks, { type: "video/webm" });
          const buf = new Uint8Array(await blob.arrayBuffer());
          let s = "";
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          res(btoa(s));
        };
        rec.stop();
      })
  );
  const summary = await page.evaluate(() => {
    const g = window.__sky.app.game;
    return { score: g.score, round: g.round, lives: g.lives, delivered: g.stats.delivered, cuts: g.stats.cuts, deaths: g.stats.deaths };
  });
  await browser.close();
  const cap = path.join(outDir, "capture.webm");
  fs.writeFileSync(cap, Buffer.from(b64, "base64"));

  const total = Number(titleS) + Number(playS);
  const mp4 = path.join(outDir, "skyhaul-play.mp4");
  const gif = path.join(outDir, "skyhaul-play.gif");
  // Canvas is 320×240: scale 3× with nearest-neighbour so pixels stay crisp.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", cap,
    "-t", String(total),
    "-vf", "fps=30,scale=960:720:flags=neighbor",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", mp4,
  ]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", cap, "-t", String(total),
    "-vf", "fps=15,scale=480:360:flags=neighbor,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
    gif,
  ]);
  fs.rmSync(cap);
  console.log(JSON.stringify({ mp4, gif, summary, errors: errs }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
