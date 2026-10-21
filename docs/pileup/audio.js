// PILEUP — sound. An era-inspired small wavetable board in the manner of Namco's 1980 WSG (not an emulation):
// three voices playing 32-step 4-bit waveforms at 16 volume levels, plus one LFSR noise voice for crashes and tyres.
// One fixed master chain: gain -> soft clipper -> mono output.
//
// Game code calls SFX.play(event, arg, { demo }) and SFX.music(state) once a frame; nothing else. The music is a
// layered chase loop in A minor pentatonic: the police speed sets the tempo, a counter-melody joins while three or
// more police are on your tracks, the exits opening switch it to the getaway section and a revisited district to
// the alert section; changes land on bar lines. Effects take the lead or counter voice from the music while they
// play (the bass is never taken by an effect); the noise voice belongs to effects.
(function (root) {
  'use strict';
  const PROFILE = { id: 'namco-wsg-inspired', fidelity: 'era-inspired', voiceLimit: 4, voices: ['bass', 'lead', 'counter', 'noise'],
    primitives: ['wave32x4', 'lfsr-noise'], waveSteps: 32, waveLevels: 16, volumeLevels: 16 };
  const MASTER = 0.3;                              // asked for after s8: 0.55 → 0.4 → 0.3

  // ---- waveforms: 32 steps of 0..15
  const W = (f) => Array.from({ length: 32 }, (_, i) => Math.max(0, Math.min(15, Math.round(f(i / 32)))));
  const WAVES = {
    pulse: W(t => (t < 0.375 ? 15 : 0)),                               // lead: hollow pulse
    saw: W(t => 15 * (1 - t)),                                         // counter and blips: thin and bright
    soft: W(t => 7.5 + 7.5 * (t < 0.5 ? 4 * t - 1 : 3 - 4 * t)),       // bass: triangle
    organ: W(t => 7.5 + 4 * (t < 0.5 ? 1 : -1) + 3.5 * (((t * 2) % 1) < 0.5 ? 1 : -1)), // jingles: two-octave square
  };

  // ---- pitch
  const SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const hz = (n) => 440 * Math.pow(2, (SEMI[n[0]] + (n[1] === '#' ? 1 : 0) + 12 * (+n[n.length - 1] - 4)) / 12);
  const KEY = new Set(['C', 'D', 'E', 'G', 'A']);                       // A minor pentatonic

  // ---- effects and jingles: steps { t, d, voice: 'tone' | 'tone2' | 'bass' | 'noise', wave, n0, n1 (note names) or f0, f1 (Hz), v 0..15 }
  // tone/tone2 take the lead or counter voice from the music; bass is used only by jingles, which stop the music.
  const T = (t, d, n0, n1, v, wave, voice) => ({ t, d, n0, n1: n1 || n0, v, wave: wave || 'pulse', voice: voice || 'tone' });
  const N = (t, d, f0, f1, v) => ({ t, d, f0, f1, v, voice: 'noise' });
  const UP = ['C', 'D', 'E', 'G', 'A'];
  const step = (base, k) => UP[((k % 5) + 5) % 5] + (base + Math.floor(k / 5));  // k-th note of the scale above C<base>
  // an arpeggio on one voice: each note ends where the next begins, the last one rings a little longer
  const arp = (notes, gap, last, v, wave) => notes.map((n, i) => T(i * gap, i === notes.length - 1 ? last : gap, n, null, v, wave));
  const PROGRAMS = {
    // a crunch of noise, longer with the pileup, then a tally note one scale step higher per car
    crash: (n) => ({ kind: 'sfx', steps: [N(0, 0.2 + 0.04 * Math.min(n, 6), 9000, 900, 14), T(0.08, 0.1, step(5, Math.min(n, 9) - 2), null, 11), T(0.15, 0.12, step(5, Math.min(n, 9)), null, 10, 'pulse', 'tone2')] }),
    // a car picks up your tracks: a short high double blip above the music
    scent: () => ({ kind: 'sfx', steps: [T(0, 0.04, 'E6', null, 15, 'pulse'), T(0.05, 0.04, 'G6', null, 15, 'pulse')] }),
    // an arrival: two-tone siren (an alarm, deliberately out of key)
    siren: () => ({ kind: 'sfx', steps: [0, 1].flatMap(i => [{ ...T(i * 0.22, 0.1, null, null, 14), f0: 740, f1: 740 }, { ...T(i * 0.22 + 0.11, 0.1, null, null, 14), f0: 587, f1: 587 }]) }),
    // a van rams: metallic clank (out of key on purpose)
    dent: () => ({ kind: 'sfx', steps: [{ ...T(0, 0.08, null, null, 13, 'saw'), f0: 310, f1: 290 }, N(0, 0.06, 12000, 12000, 9)] }),
    go: () => ({ kind: 'sfx', steps: [T(0, 0.09, 'C5', null, 11), T(0.1, 0.16, 'G5', null, 11)] }),
    tick: () => ({ kind: 'sfx', steps: [T(0, 0.03, 'E6', null, 9, 'saw')] }),
    // counting the cars left on escape: one tick per car, a step higher each
    tally: (k) => ({ kind: 'sfx', steps: [T(0, 0.06, step(5, 2 + (k | 0)), null, 11, 'organ')] }),
    exit: () => ({ kind: 'jingle', steps: arp(['C5', 'E5', 'G5', 'C6'], 0.08, 0.14, 12, 'organ') }),
    extend: () => ({ kind: 'jingle', steps: arp(['G5', 'A5', 'C6', 'E6', 'C6', 'E6'], 0.06, 0.1, 11, 'organ') }),
    clear: () => ({ kind: 'jingle', steps: [...arp(['G4', 'C5', 'E5', 'G5', 'E5', 'C6'], 0.1, 0.16, 11, 'organ'), T(0, 0.3, 'C3', null, 13, 'soft', 'bass'), T(0.3, 0.3, 'G2', null, 13, 'soft', 'bass')] }),
    start: () => ({ kind: 'jingle', steps: arp(['G4', 'C5', 'E5', 'G5', 'E5', 'G5'], 0.07, 0.1, 11, 'organ') }),
    // busted: a crash and a falling tone (a fall, not a scale)
    death: () => ({ kind: 'jingle', steps: [N(0, 0.9, 8000, 300, 15), { ...T(0, 0.8, null, null, 13), f0: 330, f1: 40 }] }),
    gameover: () => ({ kind: 'jingle', steps: [...arp(['E5', 'D5', 'C5', 'A4', 'E4'], 0.22, 0.2, 12, 'soft'), T(0, 1.08, 'A2', null, 11, 'soft', 'bass')] }),
    won: () => ({ kind: 'jingle', steps: [...arp(['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6'], 0.12, 0.3, 11, 'organ'), T(0, 0.5, 'C3', null, 13, 'soft', 'bass'), T(0.6, 0.6, 'C4', null, 13, 'soft', 'bass')] }),
  };
  // events whose pitches are out of key on purpose, with the reason
  const OUT_OF_KEY = { siren: 'alarm two-tone', dent: 'metallic clank', death: 'falling tone' };
  // who keeps a voice when two want it: control feedback, danger, consequence, then rewards and chimes
  const PRIORITY = { death: 98, siren: 90, crash: 85, dent: 84, scent: 80, exit: 62, clear: 61, go: 60, extend: 58, start: 55, gameover: 55, won: 55, tally: 50, tick: 40 };

  // ---- music: four bars of sixteenths per section; tokens are notes, '-' holds, '.' rests
  const bar = (s) => s.trim().split(/\s+/);
  const SECTIONS = {
    chase: {
      bass: bar('A2 . A3 . A2 . A3 . A2 . A3 . G2 . G3 . A2 . A3 . A2 . A3 . C3 . C4 . D3 . D4 . A2 . A3 . A2 . A3 . A2 . A3 . G2 . G3 . E2 . E3 . E2 . E3 . G2 . G3 . A2 A2 A3 .'),
      lead: bar('E5 - . E5 D5 - C5 - A4 - - . . . C5 D5 E5 - . E5 G5 - E5 - D5 - C5 - D5 - . . E5 - . E5 D5 - C5 - A4 - - . C5 - D5 - E5 - G5 - E5 - D5 - C5 - A4 - - - . . . .'),
      counter: bar('A4 C5 E5 C5 A4 C5 E5 C5 G4 C5 E5 C5 G4 C5 E5 C5 A4 C5 E5 C5 A4 C5 E5 C5 C5 E5 G5 E5 D5 G5 A5 G5 A4 C5 E5 C5 A4 C5 E5 C5 G4 C5 E5 C5 G4 C5 E5 C5 E4 G4 C5 G4 E4 G4 C5 G4 G4 C5 D5 C5 A4 . . .'),
    },
    getaway: {
      bass: bar('C3 . C4 . C3 . C4 . G2 . G3 . G2 . G3 . A2 . A3 . A2 . A3 . G2 . G3 . G2 . G3 . C3 . C4 . C3 . C4 . E3 . E4 . E3 . E4 . D3 . D4 . G2 . G3 . C3 C3 C4 . G2 . G3 .'),
      lead: bar('G5 - E5 - G5 A5 G5 E5 C6 - - - A5 - G5 - E5 - G5 - A5 - C6 - D6 - C6 - A5 - G5 - . . G5 - E5 - G5 A5 G5 E5 C6 - - - A5 - G5 - E5 - D5 - E5 - G5 - E5 - C5 - - - . . . .'),
      counter: bar('C5 E5 G5 E5 C5 E5 G5 E5 D5 G5 A5 G5 D5 G5 A5 G5 C5 E5 A5 E5 C5 E5 A5 E5 D5 G5 A5 G5 D5 G5 C6 G5 C5 E5 G5 E5 C5 E5 G5 E5 E5 G5 C6 G5 E5 G5 C6 G5 D5 G5 A5 G5 D5 G5 A5 G5 C5 E5 G5 E5 C5 . . .'),
    },
    alert: {
      bass: bar('A2 - A2 . A2 - A2 . G2 - G2 . G2 - E2 . A2 - A2 . A2 - A2 . C3 - C3 . D3 - E3 . A2 - A2 . A2 - A2 . G2 - G2 . G2 - E2 . E2 - E2 . G2 - G2 . A2 - - . A2 . A1 .'),
      lead: bar('A4 - - - . . G4 - A4 - - - . . . . C5 - - - . . A4 - G4 - E4 - . . . . A4 - - - . . G4 - A4 - - - . . E5 - D5 - - - C5 - - - A4 - - - . . . .'),
      counter: bar('E5 . E5 . E5 . E5 . D5 . D5 . D5 . D5 . E5 . E5 . E5 . E5 . G5 . G5 . A5 . A5 . E5 . E5 . E5 . E5 . D5 . D5 . D5 . D5 . C5 . C5 . C5 . C5 . D5 . D5 . E5 . . .'),
    },
  };
  const BPM0 = 132, BPM_STEP = 6, BPM_MAX = 168;
  const MUSIC_VOL = { bass: 9, lead: 6, counter: 4 };
  const MUSIC_WAVE = { bass: 'soft', lead: 'pulse', counter: 'saw' };
  // a section as a timeline of notes { voice, t, d, n, v } for one loop at a tempo
  function timeline(name, bpm, withCounter) {
    const S = SECTIONS[name], dt = 60 / bpm / 4, out = [];
    for (const voice of ['bass', 'lead', 'counter']) {
      if (voice === 'counter' && !withCounter) continue;
      const toks = S[voice];
      for (let i = 0; i < toks.length; i++) {
        const n = toks[i];
        if (n === '.' || n === '-') continue;
        let len = 1; while (i + len < toks.length && toks[i + len] === '-') len++;
        out.push({ voice, t: i * dt, d: len * dt * 0.92, n, v: MUSIC_VOL[voice], wave: MUSIC_WAVE[voice] });
      }
    }
    return { notes: out, loop: S.bass.length * dt };
  }
  const tempoFor = (heat) => Math.min(BPM_MAX, BPM0 + BPM_STEP * Math.max(0, Math.min(6, heat | 0)));

  // ---- the board
  let ac = null, out = null, muted = false, hidden = false, bufs = null;
  const log = [];                                   // emission log: { name, voices } or { name, skipped }
  const newVoices = () => ({ bass: { until: 0, owner: null }, lead: { until: 0, owner: null }, counter: { until: 0, owner: null }, noise: { until: 0, owner: null } });
  const voices = newVoices(), playing = {}, effect = {};   // the music's current note on each voice; an effect's notes on each voice
  function chain(ctx) {
    const gain = ctx.createGain(), clip = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }   // rounds peaks only
    clip.curve = curve; gain.gain.value = MASTER; gain.connect(clip); clip.connect(ctx.destination);
    return gain;
  }
  // one cycle of each waveform as a 32-sample buffer, and one second of 15-bit LFSR noise
  function buffers(ctx) {
    const wb = {};
    for (const [k, w] of Object.entries(WAVES)) { const b = ctx.createBuffer(1, 32, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < 32; i++) d[i] = w[i] / 7.5 - 1; wb[k] = b; }
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0);
    let r = 1; for (let i = 0; i < d.length; i++) { const bit = (r ^ (r >> 1)) & 1; r = (r >> 1) | (bit << 14); d[i] = r & 1 ? 0.8 : -0.8; }
    return { wb, nb };
  }
  // one note on a voice at time t: a looped wave or noise, its pitch, and a 4-bit volume with a short release
  function note(ctx, dest, B, s, t) {
    const g = ctx.createGain(), src = ctx.createBufferSource(), vol = (s.v / 15) * 0.32;
    g.gain.value = 0;                                // silent until its envelope starts: no first-sample spike
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.setValueAtTime(vol, t + Math.max(0.005, s.d - 0.02)); g.gain.linearRampToValueAtTime(0, t + s.d);
    src.loop = true;
    if (s.voice === 'noise') {
      src.buffer = B.nb;
      src.playbackRate.setValueAtTime(s.f0 / 22050, t); if (s.f1 !== s.f0) src.playbackRate.exponentialRampToValueAtTime(s.f1 / 22050, t + s.d);
    } else {
      src.buffer = B.wb[s.wave || 'pulse'];
      const base = ctx.sampleRate / 32, f0 = s.f0 || hz(s.n0 || s.n), f1 = s.f1 || hz(s.n1 || s.n0 || s.n);
      src.playbackRate.setValueAtTime(f0 / base, t); if (f1 !== f0) src.playbackRate.exponentialRampToValueAtTime(f1 / base, t + s.d);
    }
    src.connect(g); g.connect(dest); src.start(t); src.stop(t + s.d + 0.01);
    return src;
  }
  // which voice each part of an effect gets, or null. An effect may take a voice from the music or from a
  // lower-priority effect; a loser moves to the other tone voice or is dropped (the log says which)
  function allocate(name, prog, now, V) {
    const pr = PRIORITY[name] || 10, got = {};
    const free = (k) => V[k].until <= now || (PRIORITY[V[k].owner] || 0) < pr;
    for (const s of prog.steps) {
      if (got[s.voice] !== undefined) continue;
      if (s.voice === 'noise' || s.voice === 'bass') { got[s.voice] = free(s.voice) ? s.voice : null; continue; }
      const order = s.voice === 'tone2' ? ['counter', 'lead'] : ['lead', 'counter'];
      got[s.voice] = order.find(k => free(k) && !Object.values(got).includes(k)) || null;
    }
    const len = Math.max(...prog.steps.map(s => s.t + s.d));
    for (const k of Object.values(got)) if (k) { V[k].until = now + len; V[k].owner = name; }
    return got;
  }

  // ---- music scheduler: plans a little ahead; tempo, counter layer and section change only at a bar line
  const music = { want: null, cur: null, bpm: BPM0, counter: false, step: 0, next: 0, timer: null };
  function startMusic(state) { music.cur = state.section; music.bpm = tempoFor(state.heat); music.counter = !!state.line; music.step = 0; music.next = ac.currentTime + 0.05; }
  function schedule() {
    if (!ac || !music.cur || hidden) return;
    const ahead = ac.currentTime + 0.15;
    while (music.cur && music.next < ahead) {
      if (music.step % 16 === 0) {                     // a bar line: take up what the game asks for now
        if (!music.want) { music.cur = null; break; }
        if (music.want.section !== music.cur) music.step = 0;
        music.cur = music.want.section; music.bpm = tempoFor(music.want.heat); music.counter = !!music.want.line;
      }
      const S = SECTIONS[music.cur], len = S.bass.length, dt = 60 / music.bpm / 4, i = music.step % len;
      for (const voice of ['bass', 'lead', 'counter']) {
        if (voice === 'counter' && !music.counter) continue;
        const toks = S[voice], n = toks[i];
        if (n === '.' || n === '-') continue;
        if (voices[voice].until > music.next) continue;  // an effect has this voice
        let k = 1; while (i + k < len && toks[i + k] === '-') k++;
        if (!muted) playing[voice] = note(ac, out, bufs, { voice, n, d: k * dt * 0.92, v: MUSIC_VOL[voice], wave: MUSIC_WAVE[voice] }, music.next);
      }
      music.next += dt; music.step++;
    }
  }

  function init() {
    if (ac) { if (ac.state === 'suspended' && !hidden) ac.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ac = new AC(); out = chain(ac); bufs = buffers(ac);
    music.timer = setInterval(schedule, 25);
    if (root.document) root.document.addEventListener('visibilitychange', () => SFX.setHostVisible(root.document.visibilityState === 'visible'));
  }
  const length = (prog) => Math.max(...prog.steps.map(s => s.t + s.d));

  const SFX = root.SFX = {
    PROFILE, WAVES, PROGRAMS, PRIORITY, OUT_OF_KEY, SECTIONS, KEY, hz, timeline, tempoFor, allocate, length, log, newVoices,
    init, get muted() { return muted; }, get hidden() { return hidden; }, get musicSection() { return music.cur; }, get musicWanted() { return music.want; },
    toggle() { muted = !muted; if (out) out.gain.value = muted ? 0 : MASTER; },
    // opt.demo: sounds from the attract loop, which are off (demo sound off)
    play(name, arg, opt) {
      if (!PROGRAMS[name]) return;
      if ((opt && opt.demo) || muted || hidden || !ac) { log.push({ name, skipped: true }); if (log.length > 200) log.shift(); return; }
      try {
        const prog = PROGRAMS[name](arg), now = ac.currentTime, got = allocate(name, prog, now, voices);
        if (prog.kind === 'jingle') { music.want = null; music.cur = null; }
        for (const k of Object.values(got)) if (k) {             // take the voice: stop the music's note and any earlier effect on it
          for (const src of [playing[k], ...(effect[k] || [])]) if (src) { try { src.stop(now); } catch (e) { /* already stopped */ } }
          playing[k] = null; effect[k] = [];
        }
        for (const s of prog.steps) {
          const k = got[s.voice];
          if (k) effect[k].push(note(ac, out, bufs, { ...s, voice: k }, now + s.t));
        }
        log.push({ name, voices: got });
        if (log.length > 200) log.shift();
      } catch (e) { /* audio is optional */ }
    },
    // the game's state, every frame: null for no music, or { section: 'chase' | 'getaway' | 'alert', heat, line }
    music(state, opt) {
      if (opt && opt.demo) state = null;
      music.want = state;
      if (state && !music.cur && ac && !hidden) startMusic(state);
    },
    stopAll() {
      music.want = null; music.cur = null;
      for (const k in playing) { try { playing[k] && playing[k].stop(); } catch (e) { /* already stopped */ } playing[k] = null; }
      Object.assign(voices, newVoices());
    },
    // a hidden page goes quiet at once and plays nothing; back in view, only the music the game still asks for resumes
    setHostVisible(visible) {
      if (hidden === !visible) return;
      hidden = !visible;
      if (!ac) return;
      if (hidden) { music.cur = null; ac.suspend(); }
      else { ac.resume(); if (music.want) startMusic(music.want); }
    },
    // renders [name, arg, time] effects and optionally a music section through the same chain offline: { peak, rms }
    async render(events, seconds, mus) {
      const OAC = root.OfflineAudioContext, ctx = new OAC(1, Math.ceil(44100 * seconds), 44100), dest = chain(ctx), B = buffers(ctx);
      const V = newVoices(), taken = [];
      for (const [name, arg, t] of events) {
        const prog = PROGRAMS[name](arg), got = allocate(name, prog, t, V);
        for (const s of prog.steps) if (got[s.voice]) note(ctx, dest, B, { ...s, voice: got[s.voice] }, t + s.t);
        for (const k of Object.values(got)) if (k) taken.push([k, t, t + length(prog)]);
      }
      if (mus) {
        const tl = timeline(mus.section, tempoFor(mus.heat), mus.line);
        for (let rep = 0; rep * tl.loop < seconds; rep++) for (const n of tl.notes) {
          const t = rep * tl.loop + n.t;
          if (!taken.some(([k, a, b]) => k === n.voice && t + n.d > a && t < b)) note(ctx, dest, B, n, t);
        }
      }
      const buf = await ctx.startRendering(), d = buf.getChannelData(0);
      let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
      return { peak, rms: Math.sqrt(sum / d.length) };
    },
  };
})(this);
