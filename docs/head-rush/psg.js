// HEAD RUSH — sound hardware model. Target: Sega System 1 (1983) sound section, i.e. two SN76489A PSGs
// (2 MHz and 4 MHz, mixed mono 0.40 / 0.60, per MAME system1.cpp), driven by a 60 Hz sound driver.
// Chip behaviour follows MAME sn76496.cpp for the SN76489A: f = clock / (32 N), 10-bit N (0 means 1024),
// 2 dB volume steps (15 = off), noise LFSR feedback 0x10000 with taps 0x04 / 0x08, shift every 512 / 1024 /
// 2048 clocks or once per tone-3 cycle. The 60 Hz driver cadence is an assumption, not taken from a game ROM.
// The whole file is one self-contained factory so the browser can run it inside an AudioWorklet.
(function (root) {
  function HRSoundFactory() {
    'use strict';
    const FPS = 60;
    const VOL = []; { let v = 1; for (let i = 0; i < 15; i++) { VOL.push(v); v /= 1.258925412; } VOL.push(0); }

    class PSG {
      constructor(clock) {
        this.clock = clock; this.tickRate = clock / 16;
        this.period = [0x400, 0x400, 0x400, 32]; this.count = [1, 1, 1, 1]; this.out = [0, 0, 0, 0];
        this.att = [15, 15, 15, 15]; this.noiseReg = 0; this.rng = 0x10000; this.acc = 0;
      }
      nOf(f) { return Math.max(1, Math.min(1023, Math.round(this.clock / (32 * f)))); } // the only pitches the chip can make
      tone(ch, n) { n &= 0x3ff; this.period[ch] = n === 0 ? 0x400 : n; if (ch === 2 && (this.noiseReg & 3) === 3) this.period[3] = this.period[2] * 2; }
      vol(ch, a) { this.att[ch] = Math.max(0, Math.min(15, a | 0)); }
      noise(mode) { // writing the noise register resets the shift register, as on the chip
        this.noiseReg = mode & 7; this.rng = 0x10000; const n = mode & 3;
        this.period[3] = n === 3 ? this.period[2] * 2 : (1 << (5 + n));
      }
      tick() {
        for (let i = 0; i < 3; i++) if (--this.count[i] <= 0) { this.out[i] ^= 1; this.count[i] = this.period[i]; }
        if (--this.count[3] <= 0) {
          this.count[3] = this.period[3];
          const white = (this.noiseReg & 4) !== 0;
          if (((this.rng & 0x04) !== 0) !== (((this.rng & 0x08) !== 0) && white)) { this.rng >>= 1; this.rng |= 0x10000; } else this.rng >>= 1;
          this.out[3] = this.rng & 1;
        }
      }
      level() { let s = 0; for (let i = 0; i < 4; i++) s += (this.out[i] ? VOL[this.att[i]] : -VOL[this.att[i]]); return s / 4; }
      // average of all chip ticks that fall inside one output sample (a box filter against aliasing)
      sample(sr) {
        this.acc += this.tickRate / sr; let s = 0, n = 0;
        while (this.acc >= 1) { this.acc -= 1; this.tick(); s += this.level(); n++; }
        return n ? s / n : this.level();
      }
    }

    const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

    // ---------- BGM (chip A): trance-techno, 8 bars of 16ths, Am F C G | Am F G E, 128 steps ----------
    // ch2 = four-on-the-floor kick (pitch dive on the beat) + off-beat pumping bass, one channel taking turns
    // ch1 = trance-gate arpeggio (chord tones in 16ths, 3-3-2 accents)       ch0 = soft half-bar pad; the bright lead is the power's alone
    // noise = off-beat open hat, clap on 2 and 4, 16th hats from tier 4, snare roll build in bar 8, breakdown in bar 7
    const _ = -1; // hold the previous lead note
    const PAD = [[69, 69], [69, 64], [67, 67], [71, 67], [69, 69], [69, 64], [74, 67], [68, 76]]; // two long notes per bar, in the arpeggio's register
    const ROOT = [45, 41, 48, 43, 45, 41, 43, 40];                      // A F C G | A F G E (bass, octave 2-3)
    const CHORD = [[69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74], [69, 72, 76], [65, 69, 72], [67, 71, 74], [64, 68, 71]];
    const ARP = [0, 2, 3, 2, 1, 2, 3, 2, 0, 2, 3, 2, 1, 3, 2, 3];         // index into [root, third, fifth, octave]
    const GATE = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];        // 3-3-2 accents of the trance gate
    const TEMPO = [7, 7, 6, 6, 5, 5, 4, 4];                              // frames per 16th by tier: 129 / 150 / 180 / 225 BPM
    const BREAK = 6, BUILD = 7;                                          // bar 7 drops the kick, bar 8 rolls the snare

    function leadAt(step, tier, fright) {
      const bar = step >> 4, s = step & 15;
      // powered: a bright 8th-note run up the bar's chord, an octave above the arpeggio (stays in key with everything else)
      if (fright) return s % 2 === 0 ? CHORD[bar][(s >> 1) % 3] + 12 : _;
      if (tier < 2) return s === 0 ? 0 : _;                             // tiers 0-1: groove only
      return s % 8 === 0 ? PAD[bar][s >> 3] : _;                        // from tier 2: a quiet pad under the groove
    }
    function leadLen(step, tier, fright) { let n = 1; while (n < 16 && leadAt((step + n) % 128, tier, fright) === _) n++; return n; }
    function kickAt(step) { const bar = step >> 4, s = step & 15; return bar !== BREAK && s % 4 === 0; }
    function bassAt(step) { const bar = step >> 4, s = step & 15; if (bar === BREAK) return s % 8 === 2 ? ROOT[bar] : 0; return s % 4 === 2 ? ROOT[bar] + (s === 14 ? 12 : 0) : 0; }
    function arpAt(step, tier, fright) {
      const bar = step >> 4, s = step & 15;
      const c = CHORD[bar], tones = [c[0], c[1], c[2], c[0] + 12];
      let m = tones[ARP[s]];
      if (tier >= 6 && bar >= 4 && m + 12 <= 88) m += 12;                // top speed: second half an octave up (not above E6)
      return { note: m, accent: !!GATE[s] };
    }
    function drumAt(step, tier) {
      const bar = step >> 4, s = step & 15;
      if (bar === BUILD) { if (s >= 8 || s % 2 === 0) return 'snare'; return null; } // snare roll into the loop
      if (tier >= 2 && (s === 4 || s === 12)) return 'clap';
      if (s % 4 === 2) return 'open';
      return tier >= 4 ? 'hat' : null;
    }
    // pure description of one step, for tests and diagnostics
    function stepEvents(step, tier, fright) {
      tier = Math.max(0, Math.min(7, tier | 0));
      return { lead: leadAt(step, tier, fright), kick: kickAt(step), bass: bassAt(step), arp: arpAt(step, tier, fright), drum: drumAt(step, tier), frames: TEMPO[tier] };
    }
    const DRUM = { hat: [4, 8, 1, 4], open: [4, 6, 4, 2], clap: [5, 3, 6, 2], snare: [5, 4, 4, 2] }; // [noise mode, first attenuation, frames, decay per frame]

    class Music {
      constructor(p) { this.p = p; this.on = false; this.tier = 0; this.fright = false; this.step = 0; this.fi = 0; this.v = [null, null, null, null]; this.noiseMode = -1; }
      set(on, tier, fright) {
        tier = Math.max(0, Math.min(7, tier | 0));
        if (on && !this.on) { this.step = 0; this.fi = 0; }
        this.on = !!on; this.tier = tier; this.fright = !!fright;
      }
      frame() {
        const p = this.p;
        if (!this.on) { for (let c = 0; c < 4; c++) p.vol(c, 15); this.v = [null, null, null, null]; return; }
        const spf = TEMPO[this.tier];
        if (this.fi === 0) this.startStep(spf);
        // lead: slow swell, vibrato after 8 frames; the unpowered pad stays far below it, so a bright melody always means power
        const L = this.v[0];
        if (L) { const k = L.t++; const n = L.n + (k > 8 ? ((k >> 1) & 1 ? 1 : -1) * Math.max(1, Math.round(L.n * 0.006)) : 0); p.tone(0, n); p.vol(0, L.soft ? Math.max(9, 12 - (k >> 2)) : Math.max(3, 7 - (k >> 1))); if (--L.g <= 0) this.v[0] = null; } else p.vol(0, 15);
        // arpeggio: one gated 16th, accents louder, a short tail
        const A = this.v[1];
        if (A) { const k = A.t++; p.tone(1, A.n); p.vol(1, Math.min(15, (A.accent ? 4 : 8) + k * 2)); if (--A.g <= 0) this.v[1] = null; } else p.vol(1, 15);
        // ch2: kick dives in pitch for 3 frames, the bass holds a flat off-beat note
        const B = this.v[2];
        if (B && B.kick) { const k = B.t++; p.tone(2, B.n[Math.min(k, 2)]); p.vol(2, [1, 3, 7][Math.min(k, 2)]); if (k >= 2) this.v[2] = null; }
        else if (B) { p.tone(2, B.n); p.vol(2, 4); if (--B.g <= 0) this.v[2] = null; } else p.vol(2, 15);
        // drums on the noise channel
        const D = this.v[3];
        if (D) { const [mode, a0, len, dec] = DRUM[D.kind]; if (mode !== this.noiseMode) { p.noise(mode); this.noiseMode = mode; } p.vol(3, Math.min(15, a0 + D.t * dec)); if (++D.t >= len) this.v[3] = null; } else p.vol(3, 15);
        if (++this.fi >= spf) { this.fi = 0; this.step = (this.step + 1) % 128; }
      }
      startStep(spf) {
        const e = stepEvents(this.step, this.tier, this.fright), p = this.p;
        if (e.lead > 0) this.v[0] = { n: p.nOf(midiHz(e.lead)), t: 0, g: leadLen(this.step, this.tier, this.fright) * spf - 1, soft: !this.fright };
        else if (e.lead === 0) this.v[0] = null;
        this.v[1] = { n: p.nOf(midiHz(e.arp.note)), accent: e.arp.accent, t: 0, g: spf - 1 };
        if (e.kick) this.v[2] = { kick: true, n: [p.nOf(196), p.nOf(98), p.nOf(62)], t: 0 };
        else if (e.bass) this.v[2] = { n: p.nOf(midiHz(e.bass)), g: spf - 1 };
        if (e.drum) this.v[3] = { kind: e.drum, t: 0 };
      }
    }

    // ---------- SE programs (chip B): per-frame [Hz, attenuation] for tone voices, [mode, attenuation] for noise ----------
    const tn = (f, n, a0, a1) => Array.from({ length: n }, (_, i) => [f, Math.round(a0 + ((a1 == null ? a0 : a1) - a0) * i / Math.max(1, n - 1))]);
    const sweep = (f0, f1, n, a0, a1) => Array.from({ length: n }, (_, i) => [f0 * Math.pow(f1 / f0, i / Math.max(1, n - 1)), Math.round(a0 + (a1 - a0) * i / Math.max(1, n - 1))]);
    const seq = (fs, lens, a, decay) => fs.flatMap((f, i) => { const n = Array.isArray(lens) ? lens[i] : lens; return tn(f, n, a, a + (decay || 0)); });
    const nz = (mode, n, a0, a1) => Array.from({ length: n }, (_, i) => [mode, Math.round(a0 + (a1 - a0) * i / Math.max(1, n - 1))]);
    const rest = n => tn(0, n, 15);
    const low = (fs, k) => fs.map(f => f * k);
    // every pitched SE stays in the BGM's key (A natural minor) so the music is never muddied
    const AMIN = [220, 247, 262, 294, 330, 349, 392, 440, 494, 523, 587, 659, 698, 784];
    // A minor from A5 up, above the BGM's register: speed sets the starting step, an unbroken run of dots climbs from there
    const DOT_SCALE = [880, 988, 1047, 1175, 1319, 1397, 1568, 1760, 1976, 2093, 2349, 2637, 2794, 3136], DOT_CLIMB = 6;
    const JINGLE = 3;
    const PROGRAMS = {
      // arg = tier + 10 x (dots eaten in a row): one scale step per dot, then a two-note shimmer at the top of the climb
      dot: a => { a = a | 0; const t = Math.min(7, a % 10), run = (a / 10) | 0, k = run <= DOT_CLIMB ? run : DOT_CLIMB - (run & 1); return { prio: 0, tones: [tn(DOT_SCALE[t + k], 3, 6, 11)] }; },
      shift: n => (n >= 2 ? { prio: 1, noise: nz(4, 6, 2, 11), tones: [seq([1319, 1760], [2, 4], 4, 3)] } : { prio: 1, noise: nz(4, 6, 2, 11) }), // the second lane of one gap rings higher
      arm: () => ({ prio: 1, tones: [tn(1760, 2, 6)] }), // held long enough to keep crossing: the double blinker lights
      boost: () => ({ prio: 1, noise: nz(5, 8, 4, 12) }),
      rshift: () => ({ prio: 1, tones: [sweep(180, 125, 4, 6, 9)] }),
      power: () => ({ prio: 2, tones: [seq([440, 523, 659, 880], [2, 2, 2, 6], 5, 2)] }), // A minor arpeggio: in key with the BGM
      eat: chain => { const i = Math.min(9, Math.max(1, chain) - 1), b = AMIN[i]; return { prio: 3, tones: [seq([b, AMIN[i + 4], b * 2], [4, 4, 7], 2, 2)], noise: nz(4, 6, 3, 13) }; }, // each bite one scale step higher: root, diatonic fifth, octave
      crash: () => ({ prio: 4, tones: [sweep(220, 123, 36, 2, 12)], noise: nz(6, 54, 0, 15) }),
      wake: () => ({ prio: 1, tones: [seq([659, 0, 659], [3, 2, 3], 3)] }),
      join: () => ({ prio: 1, tones: [sweep(131, 123, 6, 4, 8)] }),
      halfclear: () => ({ prio: 2, tones: [seq([523, 659, 784], 4, 4)] }),
      refill: () => { const m = [523, 659, 784, 1047, 784, 1047]; return { prio: JINGLE, tones: [seq(m, 4, 3), seq(low(m, 0.75), 4, 7)] }; },
      frightEnd: () => ({ prio: 1, tones: [sweep(400, 200, 8, 3, 8)] }),
      count: n => ({ prio: 2, tones: [tn(n <= 3 ? 1318 : 988, 4, 5)] }),
      // game start: a soft rise up the A minor chord to a held E, each note fading; quieter and lower than the other jingles
      start: () => ({ prio: JINGLE, tones: [seq([330, 440, 523, 659], [6, 6, 6, 20], 5, 3), seq([165, 220, 262, 330], [6, 6, 6, 20], 9, 3)] }),
      go: () => ({ prio: JINGLE, tones: [seq([392, 392, 784], [7, 7, 18], 3), seq([196, 196, 392], [7, 7, 18], 6)] }),
      timeover: () => ({ prio: JINGLE, tones: [seq([784, 659, 523, 392], 8, 3), seq([392, 330, 262, 196], 8, 6)] }),
      courseclear: () => ({ prio: JINGLE, tones: [seq([523, 659, 784, 1047, 1319, 1047, 1319, 1568], [5, 5, 5, 5, 5, 5, 5, 18], 3), seq([262, 330, 392, 523, 659, 523, 659, 784], [5, 5, 5, 5, 5, 5, 5, 18], 7)] }),
      cruiser: () => ({ prio: 1, tones: [seq([123, 0, 123], [7, 1, 12], 5)] }),
      entry: () => ({ prio: JINGLE, tones: [seq([392, 523, 659, 784, 659, 784, 1047], 6, 3), seq([196, 262, 330, 392, 330, 392, 523], 6, 7)] }),
      feast: () => ({ prio: 2, delay: 27, tones: [seq([659, 784, 988, 1319, 988, 1319, 1568], 4, 3)] }),
      extend: () => ({ prio: JINGLE, tones: [seq([784, 988, 1175, 1568, 1175, 1568], 5, 2), seq([392, 494, 587, 784, 587, 784], 5, 6)] }),
      gameover: () => ({ prio: 4, tones: [seq([523, 494, 466, 440, 415, 392], [10, 10, 10, 10, 10, 30], 3, 3), seq([262, 247, 233, 220, 208, 196], [10, 10, 10, 10, 10, 30], 7, 3)] }),
      leader: () => ({ prio: 1, tones: [sweep(150, 300, 8, 4, 8)] }),
      truck: () => ({ prio: 3, tones: [seq([392, 523, 784, 1047], [3, 3, 3, 9], 2, 1), seq([196, 262, 392, 523], [3, 3, 3, 9], 7)] }), // base multiplier up
      baselost: () => ({ prio: 2, tones: [seq([392, 262], [6, 14], 4, 4)] }),
    };
    const NOISE_ENGINE = 3; // periodic noise clocked by tone 3: the low engine buzz

    class SE {
      constructor(p) { this.p = p; this.slot = [null, null]; this.nslot = null; this.queue = []; this.later = []; this.engine = { on: false, spd: 0, boost: false, fright: false, ph: 0 }; this.noiseMode = -1; this.log = []; this.lastDot = -9; this.frameNo = 0; }
      request(name, arg) {
        const mk = PROGRAMS[name]; if (!mk) return false;
        if (name === 'dot' && this.frameNo - this.lastDot < 2) return false; // repeat cap
        if (name === 'dot') this.lastDot = this.frameNo;
        const prog = mk(arg); prog.name = name;
        if (prog.delay) this.later.push({ at: this.frameNo + prog.delay, prog }); else this.queue.push(prog);
        return true;
      }
      // allocate everything requested in this frame at once, highest priority first; losers are dropped
      allocate() {
        for (let i = this.later.length - 1; i >= 0; i--) if (this.later[i].at <= this.frameNo) { this.queue.push(this.later[i].prog); this.later.splice(i, 1); }
        if (!this.queue.length) return;
        const reqs = this.queue.sort((a, b) => b.prio - a.prio); this.queue = [];
        for (const prog of reqs) {
          const got = [];
          for (const v of prog.tones || []) {
            let best = -1;
            for (let c = 0; c < 2; c++) { if (got.includes(c)) continue; const s = this.slot[c]; if (!s) { best = c; break; } if (s.prio <= prog.prio && s.fresh !== this.frameNo && (best < 0 || s.prio < this.slot[best].prio)) best = c; }
            if (best < 0) break;
            got.push(best); this.slot[best] = { prio: prog.prio, data: v, i: 0, name: prog.name, fresh: this.frameNo };
          }
          let noiseOk = false;
          if (prog.noise && (!this.nslot || (this.nslot.prio <= prog.prio && this.nslot.fresh !== this.frameNo))) { this.nslot = { prio: prog.prio, data: prog.noise, i: 0, name: prog.name, fresh: this.frameNo }; noiseOk = true; }
          this.log.push({ f: this.frameNo, name: prog.name, voices: got.length, wanted: (prog.tones || []).length, noise: noiseOk });
        }
      }
      frame() {
        const p = this.p; this.allocate();
        for (let c = 0; c < 2; c++) {
          const s = this.slot[c];
          if (!s) { p.vol(c, 15); continue; }
          const [f, a] = s.data[s.i];
          if (f > 0) { p.tone(c, p.nOf(f)); p.vol(c, a); } else p.vol(c, 15);
          if (++s.i >= s.data.length) this.slot[c] = null;
        }
        const n = this.nslot, E = this.engine;
        if (n) {
          const [mode, a] = n.data[n.i]; if (mode !== this.noiseMode) { p.noise(mode); this.noiseMode = mode; } p.vol(3, a);
          if (++n.i >= n.data.length) this.nslot = null;
        } else if (E.on) {
          E.ph += 0.25;
          const f2 = 300 + E.spd * 2.4 * (E.boost ? 1.35 : 1);
          p.tone(2, p.nOf(f2)); p.vol(2, 15);
          if (this.noiseMode !== NOISE_ENGINE) { p.noise(NOISE_ENGINE); this.noiseMode = NOISE_ENGINE; }
          p.vol(3, E.boost ? 9 : 11);
        } else p.vol(3, 15);
        p.vol(2, 15);
        this.frameNo++;
      }
      busy() { return this.slot.filter(Boolean).length; }
    }

    class Sound {
      constructor(sr) {
        this.sr = sr; this.A = new PSG(2000000); this.B = new PSG(4000000);
        this.music = new Music(this.A); this.se = new SE(this.B); this.spf = sr / FPS; this.fAcc = 0; this.muted = false; this.gain = 2.2; // master: as loud as the densest mix allows without clipping
      }
      command(m) {
        if (m.t === 'se') this.se.request(m.name, m.arg);
        else if (m.t === 'music') this.music.set(m.on, m.tier, m.fright);
        else if (m.t === 'engine') Object.assign(this.se.engine, { on: !!m.on, spd: m.spd || 0, boost: !!m.boost, fright: !!m.fright });
        else if (m.t === 'mute') this.muted = !!m.muted;
      }
      render(out) {
        for (let i = 0; i < out.length; i++) {
          if (this.fAcc <= 0) { this.music.frame(); this.se.frame(); this.fAcc += this.spf; }
          this.fAcc--;
          const v = (0.40 * this.A.sample(this.sr) + 0.60 * this.B.sample(this.sr)) * this.gain; // System 1 mix
          out[i] = this.muted ? 0 : v;
        }
      }
    }
    return { Sound, PSG, Music, SE, PROGRAMS, VOL, TEMPO, stepEvents, midiHz, FPS, JINGLE };
  }
  const api = HRSoundFactory();
  api.factorySource = '(' + HRSoundFactory.toString() + ')()';
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HRSound = api;
})(this);
