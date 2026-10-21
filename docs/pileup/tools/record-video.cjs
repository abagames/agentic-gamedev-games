// node tools/record-video.cjs [--seed 24] — records a clip of the game: 4 seconds of the title, then 16 seconds of a
// strong-bot run from its start. The picture is the page's own drawing, tick by tick (?manual=1); the sound is the
// page's own board and music scheduler, run against an OfflineAudioContext whose clock is the tick count, so neither
// depends on how fast this machine is.
// The default seed's run makes a 4-car pileup and opens the exits within the 16 seconds.
// Writes media/pileup.mp4 (2x the canvas, 30 fps, H.264 + AAC) and screenshot.gif (the canvas, 15 fps, no sound).
// Needs Playwright and ffmpeg.
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const S = require('../core.js'), B = require('../bots.js');

const arg = (name, fallback) => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] : fallback; };
const SEED = +arg('seed', 24), TITLE = 240, PLAY = 960, RATE = 48000;
const GAME = path.join(__dirname, '..');

// the run, decided in Node by the same rules the page runs: the input for each rules tick
const inputs = {};
{
  const st = S.create(SEED), f = B.strong(SEED);
  while (st.t < PLAY + 10 && !st.over) { const i = f(st); if (i.d) inputs[st.t] = i.d; S.step(st, i); }
}

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1008, height: 928 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // the board's AudioContext becomes an offline one whose clock is set by the recorder; its 25 ms scheduler is
  // called once a tick instead of by a timer
  await p.addInitScript(({ seconds, rate }) => {
    window.__clock = 0; window.__sched = [];
    const si = window.setInterval;
    window.setInterval = (fn, ms) => (ms === 25 ? (window.__sched.push(fn), 0) : si(fn, ms));
    window.AudioContext = function () {
      const off = window.__off = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      return new Proxy(off, { get(t, k) {
        if (k === 'currentTime') return window.__clock;
        if (k === 'resume' || k === 'suspend') return () => Promise.resolve();
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      } });
    };
  }, { seconds: (TITLE + PLAY) / 60 + 1, rate: RATE });
  await p.goto('file://' + path.join(GAME, 'index.html') + `?manual=1&seed=${SEED}`);
  await p.evaluate(() => localStorage.clear());

  const take = await p.evaluate(({ TITLE, PLAY, inputs }) => {
    const cv = document.getElementById('screen'), frames = [], seen = {};
    SFX.init();
    for (let k = 0; k < TITLE + PLAY; k++) {
      window.__clock = k / 60;
      if (k === TITLE) __test.start();
      const st = __test.state;
      if (st && inputs[st.t]) __test.steer(inputs[st.t]);
      __test.advance(1);
      for (const fn of window.__sched) fn();
      if (__test.state) for (const e of __test.state.events) seen[e.type] = (seen[e.type] || 0) + 1;
      if (k % 2 === 0) frames.push(cv.toDataURL('image/png'));
    }
    const st = __test.state;
    return { frames, w: cv.width, h: cv.height, score: st.score, best: st.stats.best, phase: st.phase, exit: st.exit, mode: __test.mode, seen };
  }, { TITLE, PLAY, inputs });
  const pcm = await p.evaluate(async () => {
    const buf = await window.__off.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0; const out = new Int16Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { peak = Math.max(peak, Math.abs(L[i])); out[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; out[i * 2 + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    let s = ''; const by = new Uint8Array(out.buffer);
    for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode(...by.subarray(i, i + 0x8000));
    return { data: btoa(s), peak };
  });
  await b.close();
  if (errs.length) throw new Error(errs.join(' | '));

  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'pileup-video-'));
  take.frames.forEach((u, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(u.split(',')[1], 'base64')));
  fs.writeFileSync(path.join(dir, 'audio.pcm'), Buffer.from(pcm.data, 'base64'));
  const mp4 = path.join(GAME, 'media', 'pileup.mp4'), gif = path.join(GAME, 'screenshot.gif');
  fs.mkdirSync(path.dirname(mp4), { recursive: true });
  const pics = ['-framerate', '30', '-i', path.join(dir, 'f%04d.png')], quiet = ['-y', '-v', 'error'];
  execFileSync('ffmpeg', [...quiet, ...pics, '-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', path.join(dir, 'audio.pcm'),
    '-vf', 'scale=iw*2:ih*2:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', mp4]);
  execFileSync('ffmpeg', [...quiet, ...pics, '-vf', 'fps=15,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none', gif]);
  fs.rmSync(dir, { recursive: true });

  const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;
  console.log(`seed ${SEED}: score ${take.score}, best pileup ${take.best}, exits ${take.exit ? 'open' : 'shut'}, ended in ${take.mode}/${take.phase}`);
  console.log('events in the clip:', JSON.stringify(take.seen));
  console.log(`sound: peak ${pcm.peak.toFixed(3)} of full scale`);
  console.log(`saved ${path.relative(GAME, mp4)} (${take.w * 2}x${take.h * 2}, ${kb(mp4)}) and ${path.relative(GAME, gif)} (${take.w}x${take.h}, ${kb(gif)})`);
})().catch((e) => { console.error(e); process.exit(1); });
