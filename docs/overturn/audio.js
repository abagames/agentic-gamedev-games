// OVERTURN — sound. Game code names events; this file owns what each one sounds like.
// Every sound is a program: a list of two-operator FM notes and noise bursts, rendered to samples by one
// fixed chain (sum -> gain -> soft clip), after the FM boards of the late 1980s. The same render runs in Node for the tests.
(function (root) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91]; // A minor pentatonic: reward sounds step along it, so they sit in the music's key
  // step: { t start s, n midi note | f Hz, f1 slide-to Hz, r modulator ratio, i index, i1 end index, len s, v level, noise: lowpass Hz }
  const seq = (notes, dt, o) => notes.map((n, k) => Object.assign({ t: k * dt, n }, o));
  const SE = {
    // --- effects (short, repeated) ---
    'rim:3': [{ f: 131, r: 1.41, i: 3, i1: 0.3, len: 0.11, v: 0.8 }],                      // rubber thump on a sound section
    'rim:2': [{ f: 98, r: 1.41, i: 3.5, i1: 0.3, len: 0.12, v: 0.8 }],                     // duller on a worn one
    'rim:1': [{ f: 70, r: 1.41, i: 4.5, i1: 0.4, len: 0.14, v: 0.85 }],                    // dullest on its last bounce
    'rim:break': [{ noise: 2600, len: 0.3, v: 0.8 }, { f: 82, f1: 41, r: 0.5, i: 6, i1: 1, len: 0.3, v: 0.7 }], // a section gives way
    'back': [{ f: 520, r: 3.53, i: 2.5, i1: 0.2, len: 0.06, v: 0.45 }],                    // steel: no reward
    'ratchet': [{ f: 2600, r: 1.7, i: 2.5, i1: 0.2, len: 0.012, v: 0.5 }],                       // the table turning: one dry tick per step of angle
    'edge': [{ n: 93, r: 3.5, i: 1.5, i1: 0.2, len: 0.09, v: 0.45 }],                            // caught on the very end of a section, beside a hole: a thin high ping
    'warn': [{ f: 233, r: 1.01, i: 4, i1: 1, len: 0.16, v: 0.5 }, { t: 0.2, f: 220, r: 1.01, i: 4, i1: 1, len: 0.22, v: 0.5 }], // the rim is nearly gone: two sour low notes, deliberately out of key
    'turn:stop': [{ f: 190, r: 2.7, i: 3, i1: 0.2, len: 0.035, v: 0.42 }],                    // the table's brake: a small dry click
    'throw': [{ noise: 5200, len: 0.2, v: 0.6 }, { f: 240, f1: 480, r: 1, i: 1.5, i1: 0.3, len: 0.16, v: 0.25 }], // a landing thrown sideways: air and a short rise
    'tick': [{ n: 81, r: 2, i: 1.2, i1: 0.2, len: 0.05, v: 0.4 }],                             // the hub counting down to its shot
    'reset': [{ n: 57, r: 2, i: 1.5, i1: 0.2, len: 0.07, v: 0.4 }, { t: 0.06, n: 64, r: 2, i: 1.5, i1: 0.2, len: 0.09, v: 0.4 }], // a bank stands up
    'launch': [{ f: 220, f1: 660, r: 1, i: 2, i1: 0.5, len: 0.25, v: 0.55 }],
    'lock': [{ f: 660, f1: 165, r: 1, i: 3, i1: 0.3, len: 0.3, v: 0.7 }, { t: 0.3, n: 57, r: 1, i: 2, i1: 0.3, len: 0.2, v: 0.6 }], // swallowed, then a thud
    'ready': [{ n: 76, r: 3, i: 1.2, i1: 0.2, len: 0.07, v: 0.5 }, { t: 0.08, n: 81, r: 3, i: 1.2, i1: 0.2, len: 0.07, v: 0.5 }, { t: 0.16, n: 88, r: 3, i: 1.2, i1: 0.2, len: 0.14, v: 0.5 }], // a round is waiting
    'roundEnd': [{ n: 76, r: 1, i: 1.5, i1: 0.3, len: 0.12, v: 0.45 }, { t: 0.12, n: 69, r: 1, i: 1.5, i1: 0.3, len: 0.2, v: 0.45 }],
    'skill': seq([76, 81, 88], 0.06, { r: 2, i: 2, i1: 0.3, len: 0.14, v: 0.6 }),
    'saved': [{ f: 110, f1: 880, r: 1, i: 4, i1: 0.5, len: 0.35, v: 0.75 }],               // kicked back up
    'drain': [{ f: 330, f1: 82, r: 1.5, i: 3, i1: 0.5, len: 0.4, v: 0.55 }],               // one of two balls gone
    'void': [{ noise: 4000, len: 0.5, v: 0.85 }, { f: 55, f1: 28, r: 0.5, i: 8, i1: 2, len: 0.55, v: 0.8 }], // a section torn out for good
    'count': [{ n: 84, r: 2, i: 1, i1: 0.2, len: 0.04, v: 0.35 }],
    // --- jingles (rare) ---
    'start': seq([57, 64, 69, 72, 76], 0.09, { r: 2, i: 1.6, i1: 0.3, len: 0.16, v: 0.55 }),
    'bank': seq([69, 72, 76, 81, 84], 0.07, { r: 1, i: 1.8, i1: 0.4, len: 0.16, v: 0.6 }),  // rising: the rim is coming back
    'jackpot': seq([81, 84, 88, 84, 88, 91, 93], 0.08, { r: 2, i: 2.4, i1: 0.4, len: 0.2, v: 0.7 }),
    'super': seq([69, 72, 76, 81, 84, 88, 93, 88, 93, 96], 0.1, { r: 2, i: 3, i1: 0.5, len: 0.26, v: 0.75 }).concat([{ t: 0, noise: 1200, len: 1.0, v: 0.35 }]), // the biggest award: the jackpot's rise, twice as far
    'multiball': seq([57, 57, 64, 64, 69, 69, 76, 81], 0.1, { r: 1, i: 3, i1: 0.5, len: 0.18, v: 0.7 }).concat([{ t: 0, noise: 800, len: 0.9, v: 0.3 }]),
    'round': seq([69, 76, 81, 76, 81, 88], 0.07, { r: 2, i: 2.6, i1: 0.4, len: 0.16, v: 0.65 }),
    'extend': seq([76, 79, 76, 79, 84, 88], 0.09, { r: 3, i: 1.4, i1: 0.3, len: 0.15, v: 0.6 }),
    'lost': [{ f: 440, f1: 55, r: 1.5, i: 3, i1: 0.5, len: 0.7, v: 0.7 }, { t: 0.1, noise: 900, len: 0.5, v: 0.3 }],
    'over': seq([76, 72, 69, 64, 57], 0.24, { r: 1, i: 1.5, i1: 0.3, len: 0.4, v: 0.6 }),
  };
  for (let k = 0; k < PENTA.length; k++) SE['target:' + k] = [{ n: PENTA[k], r: 2, i: 2.2, i1: 0.2, len: 0.2, v: 0.6 }]; // bell, a step higher for each face since the last rim bounce
  const JINGLES = ['start', 'round', 'bank', 'jackpot', 'super', 'multiball', 'extend', 'lost', 'over'];
  const IN_KEY = Object.keys(SE).filter(k => /^(target:|bank|jackpot|super|skill|extend|start|reset|count|ready|round)/.test(k)); // meant to agree with the music; the rest are noises and slides
  const OUT_GAIN = 0.7, OUT_DRIVE = 1.4; // output stage: gain into tanh(drive * x). A single sound passes almost unchanged (0.7 * 1.4 = 0.98); a pile-up is rounded off below 0.89
  const master = x => Math.tanh(OUT_DRIVE * Math.max(-1, Math.min(1, x * OUT_GAIN)));
  const DANGER_HP = 320; // Hz: the cut that takes the bass line (110-165 Hz) out of the music
  const MASTER = 0.9, RATCHET = { vol: 0.2, section: 0.36 }; // how loud the table's ratchet is played: a step, and the stronger click as a section boundary passes

  function render(prog, sr) {
    let end = 0; for (const s of prog) end = Math.max(end, (s.t || 0) + s.len);
    const out = new Float32Array(Math.ceil((end + 0.02) * sr)); let seed = 1;
    for (const s of prog) {
      const i0 = Math.floor((s.t || 0) * sr), n = Math.floor(s.len * sr), v = s.v || 0.5, k = Math.log(1000) / n; // level falls 60 dB over the note
      if (s.noise) { let lp = 0; for (let j = 0; j < n; j++) { seed = (seed * 16807) % 2147483647; const w = seed / 1073741824 - 1, cut = 200 + (s.noise - 200) * (1 - j / n), a = Math.min(1, 6.283 * cut / sr); lp += a * (w - lp); out[i0 + j] += lp * v * Math.exp(-k * j) * Math.min(1, j / 40); } continue; }
      const f0 = s.f || NOTE(s.n), f1 = s.f1 || f0, r = s.r || 1; let pc = 0, pm = 0;
      for (let j = 0; j < n; j++) {
        const u = j / n, f = f0 * Math.pow(f1 / f0, u), idx = s.i * Math.pow(Math.max(0.01, s.i1) / s.i, u);
        pc += 6.283185 * f / sr; pm += 6.283185 * f * r / sr;
        out[i0 + j] += Math.sin(pc + idx * Math.sin(pm)) * v * Math.exp(-k * j) * Math.min(1, j / 40);
      }
    }
    for (let j = 0; j < out.length; j++) out[j] = Math.tanh(out[j] * MASTER * 1.2) / 1.2; // fixed master: gain into a soft clip, never past 0.84
    return out;
  }

  // ---------- music: one four-bar loop in A minor, bass and a broken chord; the multiball plays it a fourth up and faster ----------
  const CH = [[45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62], [40, 55, 59, 64]]; // Am F G Em: bass, then the chord
  function musicProg(tempo, shift) {
    const st = 60 / tempo / 4, p = []; // sixteenth notes
    for (let bar = 0; bar < 4; bar++) for (let k = 0; k < 16; k++) {
      const c = CH[bar], t = (bar * 16 + k) * st;
      if (k % 4 === 0 || k === 6 || k === 14) p.push({ t, n: c[0] + shift + (k === 14 ? 7 : 0), r: 0.5, i: 2.5, i1: 0.6, len: st * 1.8, v: 0.46 });
      if (k % 2 === 1) p.push({ t, n: c[1 + ((k >> 1) % 3)] + shift + 12, r: 2, i: 1.1, i1: 0.2, len: st * 1.4, v: 0.2 });
    }
    return { prog: p, len: 64 * st };
  }
  const MUSIC = { play: musicProg(132, 0), multi: musicProg(160, 5) };

  // ---------- playback ----------
  let ctx = null, out = null, muted = false, musicNode = null, musicGain = null, musicHp = null, musicName = null, thin = false; const buf = {};
  // the rim is nearly gone: the music loses its bass until it is rebuilt
  function danger(on) { on = !!on; if (on === thin) return; thin = on; if (musicHp) musicHp.frequency.setTargetAtTime(on ? DANGER_HP : 20, ctx.currentTime, 0.25); }
  function buffer(name, data) { const b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.getChannelData(0).set(data); return (buf[name] = b); }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC(); out = ctx.createGain(); out.gain.value = muted ? 0 : OUT_GAIN;
    // the output stage: several sounds landing together sum past full scale, so the sum is rounded off by a soft clip instead of being cut square by the device
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(2049); for (let i = 0; i < 2049; i++) curve[i] = Math.tanh(OUT_DRIVE * (i / 1024 - 1)); shaper.curve = curve; out.connect(shaper); shaper.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 1; musicHp = ctx.createBiquadFilter(); musicHp.type = 'highpass'; musicHp.frequency.value = 20; musicGain.connect(musicHp); musicHp.connect(out);
    for (const k in SE) buffer(k, render(SE[k], ctx.sampleRate));
    for (const k in MUSIC) { const d = render(MUSIC[k].prog, ctx.sampleRate), n = Math.round(MUSIC[k].len * ctx.sampleRate), loop = new Float32Array(n); for (let j = 0; j < d.length; j++) loop[j % n] += d[j]; buffer('music:' + k, loop); }
    if (musicName) { const n = musicName; musicName = null; music(n); }
  }
  // rate: playback speed (pitch), for a landing's force or a rising count; vol: level, for a throw's strength
  function play(name, rate, vol) {
    if (!ctx || muted || !buf[name]) return; const s = ctx.createBufferSource(); s.buffer = buf[name]; if (rate) s.playbackRate.value = rate;
    if (vol !== undefined && vol !== 1) { const g = ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(out); } else s.connect(out);
    s.start();
  }
  function music(name) {
    if (name === musicName) return; musicName = name; if (!ctx) return;
    if (musicNode) { try { musicNode.stop(); } catch (e) { /* already stopped */ } musicNode = null; }
    if (!name) return; musicNode = ctx.createBufferSource(); musicNode.buffer = buf['music:' + name]; musicNode.loop = true; musicNode.connect(musicGain); musicNode.start();
  }
  const api = {
    init, play, master, OUT_GAIN, OUT_DRIVE, RATCHET, DANGER_HP, danger, get thin() { return thin; }, music, toggleMute() { muted = !muted; if (out) out.gain.value = muted ? 0 : OUT_GAIN; return muted; },
    get state() { return ctx ? ctx.state : 'none'; }, get musicName() { return musicName; },
    SE, JINGLES, IN_KEY, PENTA, MUSIC, render, NOTE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OTAudio = api;
})(this);
