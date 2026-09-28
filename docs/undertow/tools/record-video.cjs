// Records a promo clip with sound: the title screen, then a game played by the lookahead planner.
// The planner's inputs are computed here in node first (the core is deterministic), then replayed
// in the page tick by tick, so the planner's rollouts never stall the recording. The canvas and
// the game's own WebAudio mix are captured together by one in-page MediaRecorder, so picture and
// sound are in sync by construction.
//
// Usage: node tools/record-video.cjs [outDir] [titleSeconds] [playSeconds] [seed|auto]
// Writes media/undertow-play.mp4 (with sound) and screenshot.gif.
// Needs Playwright (repo root node_modules) and ffmpeg on PATH.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const U = require("../core.js");
const B = require("../bots.js");

const root = path.resolve(__dirname, "..");
const [outDir = path.join(root, "media"), titleS = "4", playS = "16", seedArg = "auto"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

// Play `secs` of game time with the planner; return its inputs and what happened.
function precompute(seed, secs) {
  const g = U.newGame(seed);
  const bot = B.plannerBot({ seed });
  const inputs = [];
  const st = { sinks: 0, spilled: 0, allSaved: 0, caught: 0, delivered: 0, deaths: 0, shots: 0 };
  // a little extra past the clip so the replay never runs dry
  for (let i = 0; i < Math.round((secs + 6) / U.DT); i++) {
    const inp = bot.act(g) || {};
    inputs.push({ x: inp.x || 0, y: inp.y || 0, fire: !!inp.fire });
    U.step(g, inp);
    if (g.t > secs) continue;
    for (const e of g.events) {
      if (e.type === "sink" && e.n > 0) {
        st.sinks++;
        st.spilled += e.n;
      }
      if (e.type === "allSaved") st.allSaved++;
      if (e.type === "catch") st.caught++;
      if (e.type === "saved") st.delivered += e.n;
      if (e.type === "death") st.deaths++;
      if (e.type === "fire") st.shots++;
    }
  }
  // what makes a good 16 s: raiders sunk with people aboard, whole spills caught, people brought
  // home, and no lost sub
  const score = st.sinks * 3 + st.allSaved * 5 + st.caught + st.delivered * 0.5 - st.deaths * 20;
  return { seed, inputs, st, score };
}

(async () => {
  // hit-stops make the replay run slightly behind game time, so judge a bit short
  const secs = Number(playS) - 1;
  let pick;
  if (seedArg === "auto") {
    for (let seed = 1; seed <= 40; seed++) {
      const r = precompute(seed, secs);
      if (!pick || r.score > pick.score) pick = r;
    }
  } else pick = precompute(Number(seedArg), secs);
  console.error("seed", pick.seed, JSON.stringify(pick.st));

  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 768, height: 576 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto("file://" + path.join(root, "index.html"));
  await page.waitForFunction(() => window.__ut && window.__ut.app === "title");
  await page.evaluate(() => {
    UTAudio.init();
    const bus = UTAudio.bus();
    const actx = bus.context;
    const dest = actx.createMediaStreamDestination();
    bus.connect(dest);
    const canvas = document.getElementById("screen");
    const stream = new MediaStream([...canvas.captureStream(60).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 8e6 });
    window.__chunks = [];
    rec.ondataavailable = (e) => e.data.size && window.__chunks.push(e.data);
    rec.start(250);
    window.__rec = rec;
    window.__ut.titleFromStart(); // the title from its first frame
  });
  await page.waitForTimeout(Number(titleS) * 1000);
  await page.evaluate(({ seed, inputs }) => window.__ut.replay(seed, inputs), { seed: pick.seed, inputs: pick.inputs });
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
    const g = window.__ut.game;
    return { seed: g.seed, score: g.score, wave: g.wave, lives: g.lives, mode: g.mode, delivered: g.stats.deliveredTotal };
  });
  await browser.close();
  const cap = path.join(outDir, "capture.webm");
  fs.writeFileSync(cap, Buffer.from(b64, "base64"));

  const total = Number(titleS) + Number(playS);
  const mp4 = path.join(outDir, "undertow-play.mp4");
  const gif = path.join(root, "screenshot.gif"); // the README image
  // The canvas is 256×192: scale 3× (mp4) / 2× (gif) with nearest-neighbour so pixels stay crisp.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", cap,
    "-t", String(total),
    "-vf", "fps=30,scale=768:576:flags=neighbor",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", mp4,
  ]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", cap, "-t", String(total),
    "-vf", "fps=15,scale=512:384:flags=neighbor,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
    gif,
  ]);
  fs.rmSync(cap);
  console.log(JSON.stringify({ mp4, gif, seed: pick.seed, clip: pick.st, summary, errors: errs }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
