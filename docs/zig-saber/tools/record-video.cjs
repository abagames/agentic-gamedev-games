// Records a 4 s title + 16 s play clip: canvas frames at 30 fps, and the game's own audio re-rendered offline
// from the commands the game sent to its sound chips. Usage: node tools/record-video.cjs [seed]
// Without a seed it tries seeds until a take has no lost ship, a capsule and a multi-cut.
// Writes media/zig-saber.mp4 (768x672, H.264 + AAC) and screenshot.gif (512x448). Needs Playwright and ffmpeg.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const S = require('../psg.js');
const root = path.resolve(__dirname, '..'), TITLE = 240, PLAY = 960, STEP = 2, SR = 48000;
async function take(browser, SEED, keep) {
  const page = await browser.newPage({ viewport: { width: 768, height: 672 } });
  // fixed clock and random numbers so a take is reproducible; frames advance only when the script steps them
  await page.addInitScript(seed => {
    Date.now = () => seed - 1; performance.now = () => 0;
    let r = seed >>> 0; Math.random = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    window.requestAnimationFrame = cb => { window.__raf = cb; return 0; };
  }, SEED);
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__game && window.__raf);
  const r = await page.evaluate(({ TITLE, PLAY, STEP, SEED, keep }) => {
    const g = __game, A = ZSAudio, cmds = [], last = {}, canvas = document.getElementById('screen'), frames = [];
    let tick = 0, now = 0;
    // record what the game asks of the sound chips instead of playing it
    A.init = () => {}; A.play = (name, arg) => cmds.push({ tick, m: { t: 'se', name, arg } });
    A.music = (on, zone, loop, hot) => { const m = { t: 'music', on: !!on, zone: zone | 0, loop: loop | 0, hot: !!hot }, s = JSON.stringify(m); if (last.music !== s) { last.music = s; cmds.push({ tick, m }); } };
    for (; tick < TITLE + PLAY; tick++) {
      if (tick === TITLE) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); const bot = ZSBots.expert(SEED); g.pilot = s => bot(s); }
      now += 1000 / 60 + 1e-6; window.__raf(now); // exactly one game tick, then a render
      if (keep && tick % STEP === 0) frames.push(canvas.toDataURL('image/png'));
    }
    const s = g.state, st = s.stats;
    return { frames, cmds, mode: g.mode, phase: s.phase, name: g.entry.name, score: s.score, lost: st.deaths, caps: st.caps, cuts: st.cut, multi: st.multi, maxChain: st.maxChain, closeCuts: st.closeCuts, gems: st.gems, laser: s.laser, zone: s.zone };
  }, { TITLE, PLAY, STEP, SEED, keep });
  await page.close(); return r;
}
(async () => {
  const browser = await chromium.launch(); let SEED = +process.argv[2] || 0, r = null;
  if (!SEED) for (let s = 101; s < 141; s++) { const q = await take(browser, s, false); if (q.lost === 0 && q.caps >= 1 && q.multi >= 2 && q.maxChain >= 3 && (!r || q.score > r.score)) { r = q; SEED = s; } }
  if (!SEED) throw Error('no clean take found');
  r = await take(browser, SEED, true); await browser.close();
  // offline audio: the same two-chip model, each command applied at its tick
  const snd = new S.Sound(SR), per = SR / 60, buf = new Float32Array((TITLE + PLAY) * per);
  let ci = 0, peak = 0;
  for (let t = 0; t < TITLE + PLAY; t++) { while (ci < r.cmds.length && r.cmds[ci].tick <= t) snd.command(r.cmds[ci++].m); snd.render(buf.subarray(t * per, (t + 1) * per)); }
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const wavBuf = Buffer.alloc(44 + buf.length * 2);
  wavBuf.write('RIFF', 0); wavBuf.writeUInt32LE(36 + buf.length * 2, 4); wavBuf.write('WAVEfmt ', 8); wavBuf.writeUInt32LE(16, 16); wavBuf.writeUInt16LE(1, 20); wavBuf.writeUInt16LE(1, 22);
  wavBuf.writeUInt32LE(SR, 24); wavBuf.writeUInt32LE(SR * 2, 28); wavBuf.writeUInt16LE(2, 32); wavBuf.writeUInt16LE(16, 34); wavBuf.write('data', 36); wavBuf.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) wavBuf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-frames-')), wav = path.join(dir, 'audio.wav'); fs.writeFileSync(wav, wavBuf);
  r.frames.forEach((f, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), Buffer.from(f.split(',')[1], 'base64')));
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  const fps = String(60 / STEP), png = path.join(dir, '%04d.png'), mp4 = path.join(root, 'media', 'zig-saber.mp4'), gif = path.join(root, 'screenshot.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps, '-i', png, '-i', wav, '-vf', 'scale=768:672:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps, '-i', png, '-vf', 'scale=512:448:flags=neighbor,split[a][b];[a]palettegen=max_colors=32:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
  fs.rmSync(dir, { recursive: true, force: true });
  const { frames, cmds, ...info } = r;
  console.log(JSON.stringify({ seed: SEED, frames: frames.length, audioCommands: cmds.length, audioPeak: +peak.toFixed(3), ...info, mp4, gif }));
})().catch(e => { console.error(e); process.exit(1); });
