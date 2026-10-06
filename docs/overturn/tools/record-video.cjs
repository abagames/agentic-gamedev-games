// Records a 4 s title + 16 s play clip: canvas frames at 30 fps, and the game's own audio re-rendered offline
// from the sound events the game asked for. Usage: node tools/record-video.cjs [seed] [policy]
// Without a seed it tries seeds and keeps the take with no ball lost, at least two banks and a lock, and the highest score.
// Writes media/overturn.mp4 (672x864, H.264 + AAC) and screenshot.gif (224x288, the game's own resolution, 15 fps). Needs Playwright and ffmpeg.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const A = require('../audio.js');
const root = path.resolve(__dirname, '..'), TITLE = 240, PLAY = 960, STEP = 2, SR = 48000, POLICY = process.argv[3] || 'human';
async function take(browser, SEED, keep) {
  const page = await browser.newPage({ viewport: { width: 672, height: 864 } });
  // fixed clock and random numbers so a take is reproducible; frames advance only when the script steps them
  await page.addInitScript(seed => {
    Date.now = () => seed; performance.now = () => 0;
    let r = seed >>> 0; Math.random = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    window.requestAnimationFrame = cb => { window.__raf = cb; return 0; };
  }, SEED);
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__game && window.__raf);
  const r = await page.evaluate(({ TITLE, PLAY, STEP, SEED, POLICY, keep }) => {
    const g = __game, cmds = [], canvas = document.getElementById('screen'), frames = [];
    let tick = 0, now = 0, music = null, thin = false; const seen = {}, marks = [];
    // record what the game asks of the sound module instead of playing it
    OTAudio.init = () => {}; OTAudio.play = (name, rate, vol) => cmds.push({ tick, t: 'se', name, rate: rate || 1, vol: vol === undefined ? 1 : vol });
    OTAudio.music = name => { if (name !== music) { music = name; cmds.push({ tick, t: 'music', name }); } };
    OTAudio.danger = on => { on = !!on; if (on !== thin) { thin = on; cmds.push({ tick, t: 'danger', on }); } };
    for (; tick < TITLE + PLAY; tick++) {
      if (tick === TITLE) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); const bot = OTBots.policies[POLICY](SEED); g.pilot = s => bot(s); }
      now += 1000 / 60 + 1e-6; window.__raf(now); // exactly one game tick, then a render
      if (keep && tick % STEP === 0) frames.push(canvas.toDataURL('image/png'));
      for (const k of ['multiballs', 'jackpots', 'supers']) if (g.state.stats[k] !== (seen[k] || 0)) { seen[k] = g.state.stats[k]; marks.push(k + ' ' + seen[k] + ' at ' + ((tick - TITLE) / 60).toFixed(1) + ' s'); } if (g.state.superLit && !seen.lit) { seen.lit = 1; marks.push('super lit at ' + ((tick - TITLE) / 60).toFixed(1) + ' s'); }
    }
    const s = g.state, st = s.stats;
    return { frames, cmds, marks, mode: g.mode, score: s.score, balls: s.balls, lost: Object.values(s.causes).reduce((a, b) => a + b, 0), banks: st.banks, targets: st.targets, locks: st.locks, multiballs: st.multiballs, jackpots: st.jackpots, supers: st.supers, superLit: s.superLit, multiNow: s.multi, skills: st.skills, rounds: st.rounds, saves: st.saves, voids: st.voids };
  }, { TITLE, PLAY, STEP, SEED, POLICY, keep });
  await page.close(); return r;
}
(async () => {
  const browser = await chromium.launch(); let SEED = +process.argv[2] || 0, r = null;
  if (!SEED) for (let s = 101; s < 141; s++) { const q = await take(browser, s, false); if (q.lost === 0 && q.saves === 0 && q.banks >= 2 && q.locks >= 1 && (!r || q.score > r.score)) { r = q; SEED = s; } }
  if (!SEED) throw Error('no clean take found');
  r = await take(browser, SEED, true); await browser.close();
  // offline audio: the same programs through the same render, each event mixed in at its tick; the music loops under them
  const per = SR / 60, N = (TITLE + PLAY) * per, buf = new Float32Array(N), mus = new Float32Array(N), SE = {}, LOOP = {};
  for (const k in A.SE) SE[k] = A.render(A.SE[k], SR);
  for (const k in A.MUSIC) { const d = A.render(A.MUSIC[k].prog, SR), n = Math.round(A.MUSIC[k].len * SR), l = new Float32Array(n); for (let j = 0; j < d.length; j++) l[j % n] += d[j]; LOOP[k] = l; }
  let cur = null, pos = 0, thin = false, ci = 0, hpA = 0, hpX = 0, hpY = 0; const cut = Math.exp(-2 * Math.PI * A.DANGER_HP / SR);
  for (let t = 0; t < TITLE + PLAY; t++) {
    while (ci < r.cmds.length && r.cmds[ci].tick <= t) {
      const c = r.cmds[ci++];
      if (c.t === 'music') { cur = c.name; pos = 0; } else if (c.t === 'danger') thin = c.on;
      else if (SE[c.name]) { const d = SE[c.name], o = Math.round(t * per); for (let j = 0; ; j++) { const src = j * c.rate, i0 = src | 0; if (i0 >= d.length - 1 || o + j >= N) break; buf[o + j] += (d[i0] + (d[i0 + 1] - d[i0]) * (src - i0)) * c.vol; } } // played faster or slower, as the game asked
    }
    for (let j = 0; j < per; j++) { const i = Math.round(t * per) + j; if (i >= N) break; const x = cur ? LOOP[cur][pos++ % LOOP[cur].length] : 0; hpA += (thin ? 1 : -1) * 0.0005; hpA = Math.max(0, Math.min(1, hpA)); hpY = cut * (hpY + x - hpX); hpX = x; mus[i] = x * (1 - hpA) + hpY * hpA; } // the bass drops out while the rim is nearly gone
  }
  let raw = 0; for (let i = 0; i < N; i++) { buf[i] += mus[i]; raw = Math.max(raw, Math.abs(buf[i])); }
  let peak = 0; for (let i = 0; i < N; i++) { buf[i] = A.master(buf[i]); peak = Math.max(peak, Math.abs(buf[i])); } // through the game's own output stage
  const wavBuf = Buffer.alloc(44 + N * 2);
  wavBuf.write('RIFF', 0); wavBuf.writeUInt32LE(36 + N * 2, 4); wavBuf.write('WAVEfmt ', 8); wavBuf.writeUInt32LE(16, 16); wavBuf.writeUInt16LE(1, 20); wavBuf.writeUInt16LE(1, 22);
  wavBuf.writeUInt32LE(SR, 24); wavBuf.writeUInt32LE(SR * 2, 28); wavBuf.writeUInt16LE(2, 32); wavBuf.writeUInt16LE(16, 34); wavBuf.write('data', 36); wavBuf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) wavBuf.writeInt16LE(Math.round(buf[i] * 32767), 44 + i * 2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-frames-')), wav = path.join(dir, 'audio.wav'); fs.writeFileSync(wav, wavBuf);
  r.frames.forEach((f, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), Buffer.from(f.split(',')[1], 'base64')));
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  const fps = String(60 / STEP), png = path.join(dir, '%04d.png'), mp4 = path.join(root, 'media', 'overturn.mp4'), gif = path.join(root, 'screenshot.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps, '-i', png, '-i', wav, '-vf', 'scale=672:864:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-shortest', mp4]);
  // the gif is 15 fps: every frame of a turning table differs from the last, so its size follows the frame count
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps, '-i', png, '-vf', 'fps=15,split[a][b];[a]palettegen=max_colors=40:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', gif]);
  fs.rmSync(dir, { recursive: true, force: true });
  const { frames, cmds, ...info } = r, kinds = {}; for (const c of cmds) { const k = c.t === 'se' ? c.name.split(':')[0] : c.t; kinds[k] = (kinds[k] || 0) + 1; }
  console.log(JSON.stringify({ seed: SEED, policy: POLICY, frames: frames.length, audioEvents: cmds.length, audioPeak: +peak.toFixed(3), mixPeakBeforeOutputStage: +raw.toFixed(2), sounds: kinds, ...info, mp4MB: +(fs.statSync(mp4).size / 1048576).toFixed(2), gifMB: +(fs.statSync(gif).size / 1048576).toFixed(2) }));
})().catch(e => { console.error(e); process.exit(1); });
