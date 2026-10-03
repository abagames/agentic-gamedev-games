// Records a 4 s title + 16 s play clip: canvas frames at 30 fps, and the game's own audio re-rendered offline
// from the commands the game sent to its sound chips. Usage: node tools/record-video.cjs [seed]
// Writes media/head-rush.mp4 (720x816, H.264 + AAC) and screenshot.gif (480x544). Needs Playwright and ffmpeg.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const S = require('../psg.js');
const root = path.resolve(__dirname, '..'), SEED = +process.argv[2] || 286; // 286: no crash, two powers, a 4-car chain
const TITLE = 240, PLAY = 960, STEP = 2, SR = 48000;
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 720, height: 816 } });
  // fixed clock and random numbers so a take is reproducible; frames advance only when the script steps them
  await page.addInitScript(seed => {
    Date.now = () => seed - 1; performance.now = () => 0;
    let r = seed >>> 0; Math.random = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    window.requestAnimationFrame = cb => { window.__raf = cb; return 0; };
  }, SEED);
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__game && window.__raf);
  const r = await page.evaluate(({ TITLE, PLAY, STEP, SEED }) => {
    const g = __game, A = HRAudio, cmds = [], last = {}, canvas = document.getElementById('screen'), frames = [];
    let tick = 0, now = 0;
    // record what the game asks of the sound chips instead of playing it
    const once = (key, m) => { const s = JSON.stringify(m); if (last[key] !== s) { last[key] = s; cmds.push({ tick, m }); } };
    A.init = () => {}; A.play = (name, arg) => cmds.push({ tick, m: { t: 'se', name, arg } });
    A.music = (on, tier, fright) => once('music', { t: 'music', on: !!on, tier: tier | 0, fright: !!fright });
    A.engine = (on, spd, boost, fright) => once('engine', { t: 'engine', on: !!on, spd: Number.isFinite(spd) ? Math.round(spd) : 0, boost: !!boost, fright: !!fright });
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    const stats = { crashes: 0, eats: 0, powers: 0 };
    for (; tick < TITLE + PLAY; tick++) {
      if (tick === TITLE) { g.pilot = HRBots.human(SEED); key('keydown', 'Enter'); key('keyup', 'Enter'); }
      now += 1000 / 60 + 1e-6; window.__raf(now); // exactly one game tick, then a render
      if (tick % STEP === 0) frames.push(canvas.toDataURL('image/png'));
    }
    const s = g.state;
    return { frames, cmds, mode: g.mode, phase: s.phase, score: s.score, crashes: s.stats.crashes, eats: s.stats.eats, maxChain: s.stats.maxChain, powers: s.stats.powers, gameTick: s.tick };
  }, { TITLE, PLAY, STEP, SEED });
  await browser.close();
  if (r.crashes > 0) throw Error('this take has a crash; try another seed');
  // offline audio: the same two-chip model, each command applied at its tick
  const snd = new S.Sound(SR), per = SR / 60, buf = new Float32Array((TITLE + PLAY) * per);
  let ci = 0, peak = 0;
  for (let t = 0; t < TITLE + PLAY; t++) { while (ci < r.cmds.length && r.cmds[ci].tick <= t) snd.command(r.cmds[ci++].m); snd.render(buf.subarray(t * per, (t + 1) * per)); }
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const wavBuf = Buffer.alloc(44 + buf.length * 2);
  wavBuf.write('RIFF', 0); wavBuf.writeUInt32LE(36 + buf.length * 2, 4); wavBuf.write('WAVEfmt ', 8); wavBuf.writeUInt32LE(16, 16); wavBuf.writeUInt16LE(1, 20); wavBuf.writeUInt16LE(1, 22);
  wavBuf.writeUInt32LE(SR, 24); wavBuf.writeUInt32LE(SR * 2, 28); wavBuf.writeUInt16LE(2, 32); wavBuf.writeUInt16LE(16, 34); wavBuf.write('data', 36); wavBuf.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) wavBuf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-frames-')), wav = path.join(dir, 'audio.wav'); fs.writeFileSync(wav, wavBuf);
  r.frames.forEach((f, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), Buffer.from(f.split(',')[1], 'base64')));
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  const fps = String(60 / STEP), png = path.join(dir, '%04d.png'), mp4 = path.join(root, 'media', 'head-rush.mp4'), gif = path.join(root, 'screenshot.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps, '-i', png, '-i', wav, '-vf', 'scale=720:816:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps, '-i', png, '-vf', 'scale=480:544:flags=neighbor,split[a][b];[a]palettegen=max_colors=32:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
  fs.rmSync(dir, { recursive: true, force: true });
  const { frames, cmds, ...info } = r;
  console.log(JSON.stringify({ seed: SEED, frames: frames.length, audioCommands: cmds.length, se: cmds.filter(c => c.m.t === 'se' && c.m.name !== 'dot').map(c => c.m.name + '@' + c.tick).join(' '), audioPeak: +peak.toFixed(3), ...info, mp4, gif }));
})().catch(e => { console.error(e); process.exit(1); });
