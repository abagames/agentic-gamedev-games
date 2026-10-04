// ZIG SABER — sound hardware model. Era-inspired, hardware-modelled: two SN76489A PSGs (three square voices and one
// noise voice each) driven by a 60 Hz sound driver, as on early-80s boards such as Sega System 1.
// Chip A plays the BGM, chip B the effects and jingles. Chip behaviour follows MAME sn76496.cpp for the SN76489A:
// f = clock / (32 N), 10-bit N, 2 dB volume steps (15 = off), 17-bit noise LFSR. Not a copy of any one game's driver.
// The whole file is one self-contained factory so the browser can run it inside an AudioWorklet.
(function (root) {
  function ZSSoundFactory() {
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

    // ---------- BGM (chip A): an 8-bar march in E minor, 16ths; Em Em C D | Em Em C B ----------
    // ch0 = lead, ch1 = quiet chord arpeggio, ch2 = octave-jumping 8th bass, noise = hat / snare.
    // The zone changes key and arrangement, the loop changes tempo: canyon full, cavern a fourth down without the
    // arpeggio (emptier, darker), fortress a minor third up with 16th hats.
    const _ = -1;
    const LEAD = [
      76, _, _, _, 71, _, _, _, 76, _, 78, _, 79, _, _, _,
      78, _, _, _, 76, _, _, _, 71, _, _, _, _, _, 0, _,
      72, _, _, _, 76, _, _, _, 79, _, _, _, 76, _, 79, _,
      81, _, _, _, 78, _, _, _, 74, _, _, _, 78, _, 81, _,
      83, _, _, _, 79, _, _, _, 76, _, 79, _, 83, _, _, _,
      81, _, 79, _, 78, _, _, _, 76, _, _, _, _, _, 0, _,
      79, _, _, _, 76, _, _, _, 72, _, _, _, 76, _, 79, _,
      78, _, _, _, 75, _, 78, _, 75, _, _, _, 71, _, 75, _];
    const ROOT = [52, 52, 48, 50, 52, 52, 48, 47]; // the chip cannot go below A2 (110 Hz) at this clock
    const CHORD = [[64, 67, 71], [64, 67, 71], [60, 64, 67], [62, 66, 69], [64, 67, 71], [64, 67, 71], [60, 64, 67], [59, 63, 66]];
    const BASS = [0, 12, 0, 12, 0, 12, 7, 12], ARP = [0, 1, 2, 1];
    const KEY = [0, -5, 3], TEMPO = [5, 5, 4, 4];
    const STEPS = 128;
    // ---------- gate BGM (zone 3): a 4-bar pedal riff in 16ths, E E C B, with a chromatic fall; no arpeggio, the
    // bass does the driving. Entering the gate restarts the music on this cue; overdrive (hot) plays it a frame faster.
    const B_BASS = [
      52, 52, 64, 52, 52, 52, 63, 52, 52, 52, 62, 52, 52, 52, 58, 59,
      52, 52, 64, 52, 52, 52, 63, 52, 52, 52, 62, 52, 52, 52, 58, 59,
      48, 48, 60, 48, 48, 48, 59, 48, 48, 48, 58, 48, 48, 48, 55, 57,
      47, 47, 59, 47, 47, 47, 58, 47, 47, 47, 59, 47, 59, 58, 57, 54];
    const B_LEAD = [
      76, _, _, 0, _, _, 79, _, _, _, 0, _, 78, _, 76, _,
      75, _, _, 0, _, _, 76, _, _, _, 0, _, 71, _, _, _,
      72, _, _, 0, _, _, 76, _, _, _, 0, _, 79, _, 78, _,
      83, _, _, _, 82, _, _, _, 81, _, _, _, 80, _, 78, _];
    const B_STEPS = 64, GATE = 3;
    function stepEvents(step, zone, loop, hot) {
      if ((zone | 0) === GATE) {
        const q = step % B_STEPS, s = q & 15, bar = q >> 4;
        return { lead: B_LEAD[q], bass: B_BASS[q], arp: 0, drum: s === 4 || s === 12 || (bar === 3 && s >= 8 && s % 2 === 0) ? 'snare' : s % 2 === 1 ? 'tick' : s % 4 === 2 ? 'hat' : null, frames: hot ? 3 : 4 };
      }
      zone = Math.max(0, Math.min(2, zone | 0)); const bar = step >> 4, s = step & 15, k = KEY[zone];
      const l = LEAD[step];
      return {
        lead: l > 0 ? l + k : l, bass: s % 2 === 0 ? ROOT[bar] + BASS[s >> 1] + k + (zone === 1 ? 12 : 0) : 0,
        arp: zone === 1 ? 0 : CHORD[bar][ARP[s & 3]] + k,
        drum: s === 4 || s === 12 ? 'snare' : s % 4 === 2 ? 'hat' : zone === 2 && s % 2 === 1 ? 'tick' : null,
        frames: TEMPO[Math.max(0, Math.min(3, loop | 0))],
      };
    }
    function leadLen(step, zone) { const L = (zone | 0) === GATE ? B_LEAD : LEAD, N = L.length; let n = 1; while (n < 16 && L[(step + n) % N] === _) n++; return n; }
    const DRUM = { hat: [4, 9, 2, 3], tick: [4, 11, 1, 4], snare: [5, 5, 5, 2] }; // [noise mode, first attenuation, frames, decay per frame]

    class Music {
      constructor(p) { this.p = p; this.on = false; this.zone = 0; this.loop = 0; this.hot = false; this.step = 0; this.fi = 0; this.v = [null, null, null, null]; this.noiseMode = -1; }
      set(on, zone, loop, hot) { if ((on && !this.on) || ((zone | 0) === GATE) !== (this.zone === GATE)) { this.step = 0; this.fi = 0; } this.on = !!on; this.zone = zone | 0; this.loop = loop | 0; this.hot = !!hot; } // the gate cue starts from its first bar
      frame() {
        const p = this.p;
        if (!this.on) { for (let c = 0; c < 4; c++) p.vol(c, 15); this.v = [null, null, null, null]; return; }
        const spf = stepEvents(this.step, this.zone, this.loop, this.hot).frames;
        if (this.fi === 0) this.startStep(spf);
        const L = this.v[0]; // lead: firm attack, vibrato on held notes, slow decay
        if (L) { const k = L.t++; const n = L.n + (k > 10 ? ((k >> 2) & 1 ? 1 : -1) * Math.max(1, Math.round(L.n * 0.005)) : 0); p.tone(0, n); p.vol(0, Math.min(11, 5 + (k >> 3))); if (--L.g <= 0) this.v[0] = null; } else p.vol(0, 15);
        const A = this.v[1];
        if (A) { const k = A.t++; p.tone(1, A.n); p.vol(1, Math.min(15, 10 + k)); if (--A.g <= 0) this.v[1] = null; } else p.vol(1, 15);
        const B = this.v[2];
        if (B) { const k = B.t++; p.tone(2, B.n); p.vol(2, Math.min(13, 5 + (k >> 1))); if (--B.g <= 0) this.v[2] = null; } else p.vol(2, 15);
        const D = this.v[3];
        if (D) { const [mode, a0, len, dec] = DRUM[D.kind]; if (mode !== this.noiseMode) { p.noise(mode); this.noiseMode = mode; } p.vol(3, Math.min(15, a0 + D.t * dec)); if (++D.t >= len) this.v[3] = null; } else p.vol(3, 15);
        if (++this.fi >= spf) { this.fi = 0; this.step = (this.step + 1) % STEPS; }
      }
      startStep(spf) {
        const e = stepEvents(this.step, this.zone, this.loop, this.hot), p = this.p;
        if (e.lead > 0) this.v[0] = { n: p.nOf(midiHz(e.lead)), t: 0, g: leadLen(this.step, this.zone) * spf - 1 }; else if (e.lead === 0) this.v[0] = null;
        if (e.arp) this.v[1] = { n: p.nOf(midiHz(e.arp)), t: 0, g: spf - 1 };
        if (e.bass) this.v[2] = { n: p.nOf(midiHz(e.bass)), t: 0, g: this.zone === GATE ? spf - 1 : spf * 2 - 2 };
        if (e.drum) this.v[3] = { kind: e.drum, t: 0 };
      }
    }

    // ---------- SE programs (chip B): per-frame [Hz, attenuation] for tone voices, [mode, attenuation] for noise ----------
    const tn = (f, n, a0, a1) => Array.from({ length: n }, (_, i) => [f, Math.round(a0 + ((a1 == null ? a0 : a1) - a0) * i / Math.max(1, n - 1))]);
    const sweep = (f0, f1, n, a0, a1) => Array.from({ length: n }, (_, i) => [f0 * Math.pow(f1 / f0, i / Math.max(1, n - 1)), Math.round(a0 + (a1 - a0) * i / Math.max(1, n - 1))]);
    const seq = (fs, lens, a, decay) => fs.flatMap((f, i) => { const n = Array.isArray(lens) ? lens[i] : lens; return tn(f, n, a, a + (decay || 0)); });
    const nz = (mode, n, a0, a1) => Array.from({ length: n }, (_, i) => [mode, Math.round(a0 + (a1 - a0) * i / Math.max(1, n - 1))]);
    const low = (fs, k) => fs.map(f => f * k);
    const EM = [659, 740, 784, 988, 1175, 1319, 1480, 1568, 1976]; // E minor, for everything that rewards
    const JINGLE = 4;
    const PROGRAMS = {
      turn: () => ({ prio: 0, tones: [tn(294, 3, 6, 10)] }),                                   // the shot is still out: a dull click, no fire
      shot: () => ({ prio: 1, tones: [sweep(1500, 620, 6, 3, 9)] }),                          // dry narrow zap
      spark: () => ({ prio: 0, noise: nz(4, 3, 6, 12) }),                                      // shot or blade on rock
      far: () => ({ prio: 2, noise: nz(5, 7, 4, 13), tones: [sweep(520, 180, 6, 5, 10)] }),    // small distant pop
      // blade cut: a hard noise chop with a rising ring; every further enemy in the same swing rings a step higher
      cut: k => { const b = EM[Math.min(8, (k | 0) * 2)]; return { prio: 3, noise: nz(4, 5, 0, 9), tones: [seq([b, b * 1.5, b * 2], [2, 2, 5], 2, 3)] }; },
      heavy: () => ({ prio: 3, noise: nz(6, 12, 0, 12), tones: [sweep(330, 110, 12, 2, 9), seq([988, 1480], [3, 6], 3, 3)] }), // armour splitting
      ping: () => ({ prio: 2, tones: [seq([2637, 2093, 2637], [2, 2, 3], 5, 4)] }),              // deflected by a shell
      beam: n => ({ prio: 3, tones: [sweep(2600, 300, 16, 2, 9), sweep(2640, 310, 16, 5, 11)], noise: (n | 0) > 0 ? nz(5, 14, 1, 13) : null }),
      capdrop: () => ({ prio: 2, tones: [seq([988, 1319, 1976], [3, 3, 5], 5, 2)] }),
      cap: () => ({ prio: 3, tones: [seq([659, 988, 1319, 1976, 2637], [3, 3, 3, 3, 8], 3, 2), seq([330, 494, 659, 988, 1319], [3, 3, 3, 3, 8], 7, 2)] }),
      gem: c => ({ prio: 1, tones: [seq([EM[Math.min(8, Math.max(1, c | 0))], EM[Math.min(8, Math.max(1, c | 0))] * 2], [2, 4], 6, 3)] }),
      guard: () => ({ prio: 3, noise: nz(6, 10, 1, 12), tones: [seq([1976, 988, 1976, 2637], [2, 2, 2, 6], 3, 3)] }),                 // a laser charge burnt as armour
      warn: () => ({ prio: 2, tones: [seq([1319, 0, 1319, 0, 1319, 0, 1319], 3, 4)] }),
      death: () => ({ prio: 5, tones: [sweep(420, 55, 44, 2, 12)], noise: nz(6, 60, 0, 15) }),
      start: () => { const m = [330, 494, 659, 494, 659, 784, 988], l = [7, 7, 7, 7, 7, 7, 26]; return { prio: JINGLE, tones: [seq(m, l, 3, 2), seq(low(m, 0.5), l, 7, 2)] }; },
      zone: () => { const m = [784, 988, 1175, 1568], l = [5, 5, 5, 16]; return { prio: JINGLE, tones: [seq(m, l, 3, 2), seq(low(m, 0.75), l, 7, 2)] }; },
      loop: () => { const m = [659, 784, 988, 1319, 988, 1319, 1568, 1976], l = [6, 6, 6, 6, 6, 6, 6, 30]; return { prio: JINGLE, tones: [seq(m, l, 2, 2), seq(low(m, 0.5), l, 6, 2)] }; },
      extend: () => ({ prio: JINGLE, tones: [seq([1568, 1976, 1568, 1976, 1568, 1976, 2637], [4, 4, 4, 4, 4, 4, 12], 2), seq([784, 988, 784, 988, 784, 988, 1319], [4, 4, 4, 4, 4, 4, 12], 6)] }),
      gameover: () => { const m = [659, 622, 587, 494, 392, 330], l = [10, 10, 10, 10, 10, 32]; return { prio: 5, tones: [seq(m, l, 3, 3), seq(low(m, 0.5), l, 7, 3)] }; },
      entry: () => { const m = [494, 659, 784, 988, 784, 988, 1319], l = [6, 6, 6, 6, 6, 6, 20]; return { prio: JINGLE, tones: [seq(m, l, 3, 2), seq(low(m, 0.5), l, 7, 2)] }; },
    };
    const REPEAT_CAP = { turn: 3, spark: 3, gem: 2 }; // frames between two starts of the same program

    class SE {
      constructor(p) { this.p = p; this.slot = [null, null]; this.nslot = null; this.queue = []; this.noiseMode = -1; this.log = []; this.lastAt = {}; this.frameNo = 0; }
      request(name, arg) {
        const mk = PROGRAMS[name]; if (!mk) return false;
        if (REPEAT_CAP[name] && this.frameNo - (this.lastAt[name] == null ? -99 : this.lastAt[name]) < REPEAT_CAP[name]) return false;
        this.lastAt[name] = this.frameNo;
        const prog = mk(arg); prog.name = name; this.queue.push(prog); return true;
      }
      // allocate everything requested in this frame at once, highest priority first; losers are dropped
      allocate() {
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
          if (this.log.length > 400) this.log.shift();
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
        const n = this.nslot;
        if (n) { const [mode, a] = n.data[n.i]; if (mode !== this.noiseMode) { p.noise(mode); this.noiseMode = mode; } p.vol(3, a); if (++n.i >= n.data.length) this.nslot = null; } else p.vol(3, 15);
        p.vol(2, 15);
        this.frameNo++;
      }
      busy() { return this.slot.filter(Boolean).length + (this.nslot ? 1 : 0); }
      jingle() { return this.slot.some(s => s && s.prio >= JINGLE); }
    }

    class Sound {
      constructor(sr) { this.sr = sr; this.A = new PSG(3579545); this.B = new PSG(3579545); this.music = new Music(this.A); this.se = new SE(this.B); this.spf = sr / FPS; this.fAcc = 0; this.muted = false; this.gain = 2.0; }
      command(m) {
        if (m.t === 'se') this.se.request(m.name, m.arg);
        else if (m.t === 'music') this.music.set(m.on, m.zone, m.loop, m.hot);
        else if (m.t === 'mute') this.muted = !!m.muted;
      }
      render(out) {
        for (let i = 0; i < out.length; i++) {
          if (this.fAcc <= 0) { this.music.frame(); this.se.frame(); this.fAcc += this.spf; }
          this.fAcc--;
          const v = (0.42 * this.A.sample(this.sr) + 0.58 * this.B.sample(this.sr)) * this.gain;
          out[i] = this.muted ? 0 : v;
        }
      }
    }
    return { GATE, B_STEPS, Sound, PSG, Music, SE, PROGRAMS, REPEAT_CAP, VOL, TEMPO, KEY, STEPS, stepEvents, midiHz, FPS, JINGLE };
  }
  const api = ZSSoundFactory();
  api.factorySource = '(' + ZSSoundFactory.toString() + ')()';
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZSSound = api;
})(this);
