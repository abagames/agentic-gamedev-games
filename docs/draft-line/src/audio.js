// DRAFT LINE — src/audio.js
// Pure WebAudio synthesis, no assets, no reverb, 1985-arcade voice budget.
//
// Architecture (four layers):
//   1. Event boundary  : sfx()/jingle()/music() take abstract names only.
//   2. Program table   : each name maps to a small synthesis routine.
//   3. Voices          : persistent beds (engine, wind/draft) + one-shot voices.
//   4. Master chain    : fixed, clamped -> lowpass "cabinet" tone -> soft clip -> out.
//
// Audio identity: the wind bed is GATED DOWN by setDraft(); deep slipstream is
// near-silence plus a low muffled boom. sfx('release') is the audible inverse.

const clamp01 = (v) => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);
const clampPan = (v) => (Number.isFinite(v) ? (v < -1 ? -1 : v > 1 ? 1 : v) : 0);
const num = (v, d) => (Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------- note table
const A4 = 440;
const semi = (n) => A4 * Math.pow(2, n / 12); // n = semitones from A4
const N = {
  C3: semi(-21), E3: semi(-17), G3: semi(-14), A3: semi(-12), B3: semi(-10),
  C4: semi(-9), D4: semi(-7), E4: semi(-5), F4: semi(-4), G4: semi(-2),
  A4: semi(0), B4: semi(2), C5: semi(3), D5: semi(5), E5: semi(7),
  G5: semi(10), C6: semi(15),
  F2: semi(-28), G2: semi(-26), A2: semi(-24), C2: semi(-33), E2: semi(-29),
  D3: semi(-19), F3: semi(-16),
};

// ---------------------------------------------------------------- music data
// 16th-note grids. Bass = root pattern; arp = 3-note figure over it.
const MUSIC = {
  attract: {
    bpm: 96, stepsPerBeat: 4,
    bass: [N.C2, 0, 0, 0, N.C2, 0, 0, 0, N.F2, 0, 0, 0, N.G2, 0, 0, 0],
    arp: [N.C4, 0, N.E4, 0, N.G4, 0, N.E4, 0,
          N.F4, 0, N.A4, 0, N.G4, 0, N.D4, 0],
    arpGain: 0.07, bassGain: 0.11, drive: 0,
  },
};

// checkpoint motif: rising major triad. finish develops the same three notes.
const MOTIF = [N.C5, N.E5, N.G5];

export class Sound {
  constructor() {
    // NOTE: no AudioContext here — browsers block construction outside a gesture.
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this._pageVisible = true;
    this._draft = 0;
    this._engine = { speed01: 0, boosting: false };
    // P2. Whether the car's own voices (engine bed + wind/boom bed) should be audible at
    // all. Distinct from `muted`, which is the player's switch over the whole mix, and
    // distinct from mode: the visual ATTRACT demo drives its simulation but is silent.
    this._engineOn = true;
    this._musicName = null;
    this._timer = null;
    this._windTimer = null;
    this._activeSources = new Set();
    this._nextStepTime = 0;
    this._step = 0;
    this._windBase = 0; // extra wind gain from a release burst
  }

  // ------------------------------------------------------------ lifecycle
  async unlock() {
    if (this.ready) {
      try {
        if (this._pageVisible && this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      } catch (e) { /* ignore */ }
      return;
    }
    const AC = (typeof window !== 'undefined' &&
      (window.AudioContext || window.webkitAudioContext)) || null;
    if (!AC) return; // headless / unsupported -> permanent silent no-op
    try {
      this.ctx = new AC();
      this._build();
      this.ready = true;
      if (!this._pageVisible && this.ctx.state !== 'suspended') await this.ctx.suspend();
      else if (this._pageVisible && this.ctx.state === 'suspended') await this.ctx.resume();
      // re-apply state requested before unlock
      this.setMuted(this.muted);
      this.setEngineRunning(this._engineOn);
      this.setEngine(this._engine);
      this.setDraft(this._draft);
      if (this._musicName) this.music(this._musicName);
    } catch (e) {
      this.ctx = null;
      this.ready = false;
    }
  }

  _build() {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // ---- master chain (fixed, clamped) --------------------------------
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(this.muted ? 0 : 0.75, t);
    this.tone = ctx.createBiquadFilter();       // cabinet speaker roll-off
    this.tone.type = 'lowpass';
    this.tone.frequency.setValueAtTime(7200, t);
    this.tone.Q.setValueAtTime(0.4, t);
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.setValueAtTime(45, t);
    this.clip = ctx.createWaveShaper();
    this.clip.curve = softClipCurve();
    this.clip.oversample = '2x';
    this.master.connect(this.tone);
    this.tone.connect(this.hp);
    this.hp.connect(this.clip);
    this.clip.connect(ctx.destination);

    // ---- buses ---------------------------------------------------------
    this.busEngine = ctx.createGain(); this.busEngine.gain.value = 0.55;
    this.busWind = ctx.createGain(); this.busWind.gain.value = 0.9;
    this.busSfx = ctx.createGain(); this.busSfx.gain.value = 0.9;
    this.busMusic = ctx.createGain(); this.busMusic.gain.value = 0.55;
    // Overtakes briefly lower only the persistent player-car beds. Keeping these as unity
    // inserts preserves every ordinary frame's shipped bus levels, while giving the panned
    // passing car a small foreground window even under boost wind and the high-Q engine.
    this.duckEngine = ctx.createGain(); this.duckEngine.gain.value = 1;
    this.duckWind = ctx.createGain(); this.duckWind.gain.value = 1;
    this.busEngine.connect(this.duckEngine); this.duckEngine.connect(this.master);
    this.busWind.connect(this.duckWind); this.duckWind.connect(this.master);
    this.busSfx.connect(this.master);
    this.busMusic.connect(this.master);

    // ---- shared noise buffer (LFSR-ish white) ---------------------------
    this.noiseBuf = makeNoise(ctx, 2.0);

    // ---- engine voice: 2 detuned saws + 1 square sub + boost square -----
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.setValueAtTime(400, t);
    this.engFilter.Q.setValueAtTime(6, t);
    // -> engLevel -> busEngine (built below; engLevel is the P2 on/off switch).

    this.engOsc = [];
    const mk = (type, detune, gain) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(this.engFilter); o.start(t);
      this.engOsc.push({ o, g, mul: 1 });
      return { o, g };
    };
    const a = mk('sawtooth', -7, 0.20); a.mul = 1;
    const b = mk('sawtooth', +9, 0.20);
    const c = mk('square', 0, 0.16);
    this.engOsc[0].mul = 1;      // fundamental
    this.engOsc[1].mul = 1.005;  // beating
    this.engOsc[2].mul = 0.5;    // sub octave
    // boost harmonic layer (silent unless boosting)
    const d = mk('square', +4, 0.0);
    this.engOsc[3].mul = 2;
    this.engBoostGain = this.engOsc[3].g;
    void a; void b; void c; void d;

    // P2. The engine oscillators are a permanent bed — they start once and never stop, which
    // is correct for a WebAudio graph (restarting them would click) but means SOMETHING has
    // to be able to silence the voice. Until now nothing could: engFilter went straight to
    // the bus, so the bed sounded for as long as the page lived. engLevel is that switch,
    // and it is unity while the car is running, so nothing about the shipped engine timbre
    // or level changes on any frame where the engine is supposed to be heard.
    this.engLevel = ctx.createGain();
    this.engLevel.gain.setValueAtTime(this._engineOn ? 1 : 0, t);
    this.engFilter.connect(this.engLevel);
    this.engLevel.connect(this.busEngine);

    // ---- wind bed: looping noise, two bands ----------------------------
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.noiseBuf;
    this.windSrc.loop = true;

    this.windBand = ctx.createBiquadFilter();  // the "rush": bright, gated by draft
    this.windBand.type = 'lowpass';
    this.windBand.frequency.setValueAtTime(5000, t);
    this.windBand.Q.setValueAtTime(0.9, t);
    this.windGain = ctx.createGain(); this.windGain.gain.setValueAtTime(0, t);

    this.boomBand = ctx.createBiquadFilter(); // the muffled boom of the deep tow
    this.boomBand.type = 'lowpass';
    this.boomBand.frequency.setValueAtTime(120, t);
    this.boomBand.Q.setValueAtTime(2.2, t);
    this.boomGain = ctx.createGain(); this.boomGain.gain.setValueAtTime(0, t);

    this.windSrc.connect(this.windBand); this.windBand.connect(this.windGain);
    this.windGain.connect(this.busWind);
    this.windSrc.connect(this.boomBand); this.boomBand.connect(this.boomGain);
    this.boomGain.connect(this.busWind);
    this.windSrc.start(t);

    // ---- music voices ---------------------------------------------------
    this.musBassFilt = ctx.createBiquadFilter();
    this.musBassFilt.type = 'lowpass';
    this.musBassFilt.frequency.value = 900;
    this.musBassFilt.connect(this.busMusic);
  }

  _ok() { return !!(this.ctx && this.ready); }

  async setPageVisible(visible) {
    this._pageVisible = !!visible;
    if (!this._ok()) return;
    try {
      if (!this._pageVisible && this.ctx.state !== 'suspended') {
        await this.ctx.suspend();
        // A fast hide/show can change the desired state while suspend() is pending.
        if (this._pageVisible && this.ctx.state === 'suspended') await this.ctx.resume();
      } else if (this._pageVisible && this.ctx.state === 'suspended') {
        await this.ctx.resume();
        // Likewise, a show/hide race must finish silent.
        if (!this._pageVisible && this.ctx.state !== 'suspended') await this.ctx.suspend();
      }
    } catch (e) { /* a browser may reject lifecycle changes while closing */ }
  }

  setMuted(b) {
    this.muted = !!b;
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.75, t, 0.02);
  }

  // Stop every game-owned sound at a state boundary without rebuilding AudioContext.
  // Persistent beds are gated; scheduled one-shots are explicitly stopped so notes whose
  // start time is still in the future cannot leak into the next screen.
  stopAll() {
    this.music(null);
    if (this._windTimer) { clearTimeout(this._windTimer); this._windTimer = null; }
    this._windBase = 0;
    for (const source of this._activeSources) {
      try { source.stop(this.ctx ? this.ctx.currentTime : 0); } catch { /* already ended */ }
    }
    this._activeSources.clear();
    this._engineOn = false;
    this._engineApplied = false;
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    for (const p of [this.engLevel.gain, this.windGain.gain, this.boomGain.gain]) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(0, t);
    }
    // A restart during a pass must not inherit its temporary mix window.
    for (const p of [this.duckEngine?.gain, this.duckWind?.gain]) {
      if (!p) continue;
      p.cancelScheduledValues(t);
      p.setValueAtTime(1, t);
    }
  }

  _trackSource(source) {
    this._activeSources.add(source);
    const prior = source.onended;
    source.onended = (...args) => {
      this._activeSources.delete(source);
      if (typeof prior === 'function') prior.apply(source, args);
    };
    return source;
  }

  // ------------------------------------------------------------ engine
  // P2. The car stopped, so its voices must stop. The bed is a persistent graph, so this is
  // a level ramp rather than a stop(): 0.12 s, long enough not to click, short enough that
  // the finish jingle is not sung over by a car that is no longer moving. Symmetric on the
  // way back in, and unity when on — the shipped engine sound is unchanged wherever it is
  // meant to be heard.
  setEngineRunning(on) {
    const b = !!on;
    // Called every frame by game.js, so it must be an edge, not a per-frame re-ramp: a
    // setTargetAtTime restarted 60x a second from its own current value never lands.
    const applied = this._engineApplied;
    this._engineOn = b;
    if (!this._ok()) return;
    if (applied === b) return;
    this._engineApplied = b;
    const t = this.ctx.currentTime;
    this.engLevel.gain.cancelScheduledValues(t);
    this.engLevel.gain.setTargetAtTime(b ? 1 : 0, t, 0.12);
    this._applyWind();   // the wind/boom bed is part of the same voice
  }

  setEngine(opts) {
    const o = opts || {};
    const speed01 = clamp01(o.speed01);
    const boosting = !!o.boosting;
    this._engine = { speed01, boosting };
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const TAU = 0.06; // smoothing — never abrupt .value writes

    // 48 Hz idle -> ~230 Hz flat out, slight extra on boost
    const f = 48 + 182 * Math.pow(speed01, 0.85) + (boosting ? 26 : 0);
    for (const v of this.engOsc) {
      v.o.frequency.setTargetAtTime(f * v.mul, t, TAU);
    }
    const cut = 260 + 2600 * Math.pow(speed01, 0.8) + (boosting ? 1800 : 0);
    this.engFilter.frequency.setTargetAtTime(cut, t, TAU);
    this.engFilter.Q.setTargetAtTime(boosting ? 9 : 6, t, TAU);
    this.engBoostGain.gain.setTargetAtTime(boosting ? 0.13 : 0.0, t, 0.05);

    // wind rides speed too, but the draft gate has the last word
    this._applyWind();
  }

  // ------------------------------------------------------------ draft gate
  // 0 = clean air (full rush), 1 = deep tow (rush dies, low boom remains).
  setDraft(level01) {
    this._draft = clamp01(level01);
    if (!this._ok()) return;
    this._applyWind();
  }

  _applyWind() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const d = this._draft;
    // P2: a stopped car makes no rush and no tow boom either. `on` is a plain multiplier so
    // the running case is bit-for-bit the shipped curve.
    const on = this._engineOn ? 1 : 0;
    const sp = this._engine.speed01;
    const TAU = 0.10; // deliberately slow: the silence "arrives"

    // Clean air tops out at 0.03375 gain; the rush then collapses superlinearly as the
    // tow deepens so the pitched engine reads above it without losing the draft contrast.
    const gate = Math.pow(1 - d, 1.9);
    const rush = ((0.00625 + 0.0275 * Math.pow(sp, 1.3)) * gate + this._windBase) * on;
    this.windGain.gain.setTargetAtTime(rush, t, TAU);
    // and it gets muffled on the way down: 5k clean-air ceiling -> 500 Hz deep-draft floor
    this.windBand.frequency.setTargetAtTime(500 + 4500 * gate, t, TAU);

    // the reward: a low, close, muffled boom that only exists deep in the tow
    const boom = (0.012 + 0.085 * Math.pow(sp, 1.2)) * Math.pow(d, 1.4) * on;
    this.boomGain.gain.setTargetAtTime(boom, t, TAU);
    this.boomBand.frequency.setTargetAtTime(95 + 70 * d, t, TAU);
  }

  // ------------------------------------------------------------ one-shots
  sfx(name, options = undefined) {
    if (!this._ok() || this.muted) return;
    const fn = this._SFX[name];
    if (fn) { try { fn.call(this, this.ctx.currentTime + 0.001, options); } catch (e) { /* ignore */ } }
  }

  jingle(name) {
    if (!this._ok() || this.muted) return;
    const fn = this._JINGLE[name];
    if (fn) { try { fn.call(this, this.ctx.currentTime + 0.02); } catch (e) { /* ignore */ } }
  }

  // ---- primitive: pitched one-shot voice ------------------------------
  _tone(t0, { type = 'square', f0, f1, dur, gain = 0.2, atk = 0.005, dest = null, detune = 0, curve = 'exp' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    const g = ctx.createGain();
    const f_0 = Math.max(20, f0);
    o.frequency.setValueAtTime(f_0, t0);
    if (Number.isFinite(f1) && f1 !== f0) {
      const f_1 = Math.max(20, f1);
      if (curve === 'lin') o.frequency.linearRampToValueAtTime(f_1, t0 + dur);
      else o.frequency.exponentialRampToValueAtTime(f_1, t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.busSfx);
    this._trackSource(o);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return { o, g };
  }

  // ---- primitive: noise burst with a swept filter ----------------------
  _noise(t0, { dur, gain = 0.2, type = 'lowpass', f0 = 1200, f1 = 200, q = 1, dest = null, atk = 0.004 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = type; bp.Q.value = q;
    bp.frequency.setValueAtTime(Math.max(30, f0), t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp); bp.connect(g); g.connect(dest || this.busSfx);
    this._trackSource(s);
    s.start(t0); s.stop(t0 + dur + 0.02);
    return { s, g };
  }

  // One destination per overtake program call, shared by its noise and pitched voices.
  // Older WebAudio implementations and headless mocks may not expose StereoPannerNode;
  // returning the ordinary SFX bus preserves a centred mono graph without throwing.
  _overtakeDestination(pan, t) {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.createStereoPanner !== 'function') return this.busSfx;
    try {
      const panner = ctx.createStereoPanner();
      if (!panner || !panner.pan || typeof panner.connect !== 'function') return this.busSfx;
      const value = clampPan(pan);
      if (typeof panner.pan.setValueAtTime === 'function') panner.pan.setValueAtTime(value, t);
      else panner.pan.value = value;
      panner.connect(this.busSfx);
      return panner;
    } catch (e) {
      return this.busSfx;
    }
  }

  // The passing car needs a compact engine body without turning into a second persistent
  // engine bed. A low-Q falling lowpass leaves the oscillator fundamentals intact, trims
  // their buzzy upper harmonics, and still converges with the air layer at the one panner.
  // Missing/partial BiquadFilter support degrades to the ordinary destination just like the
  // StereoPanner fallback above.
  _overtakeBodyDestination(dest, t, dur = 0.48) {
    const downstream = dest || this.busSfx;
    const ctx = this.ctx;
    if (!ctx || typeof ctx.createBiquadFilter !== 'function') return downstream;
    try {
      const filter = ctx.createBiquadFilter();
      if (!filter || !filter.frequency || !filter.Q || typeof filter.connect !== 'function') return downstream;
      filter.type = 'lowpass';
      if (typeof filter.frequency.setValueAtTime === 'function') {
        filter.frequency.setValueAtTime(2600, t);
        if (typeof filter.frequency.exponentialRampToValueAtTime === 'function') {
          filter.frequency.exponentialRampToValueAtTime(1100, t + dur);
        } else filter.frequency.value = 1100;
      } else filter.frequency.value = 2600;
      if (typeof filter.Q.setValueAtTime === 'function') filter.Q.setValueAtTime(1.2, t);
      else filter.Q.value = 1.2;
      filter.connect(downstream);
      return filter;
    } catch (e) {
      return downstream;
    }
  }

  // Make a short mix window for the physical pass-by. This ducks only the player's
  // persistent engine/wind beds; release, collision and every other SFX retain their level.
  // Repeated nearby passes restart the same two envelopes rather than creating gain nodes.
  _duckOvertakeBeds(t) {
    const automate = (node, floor) => {
      const p = node && node.gain;
      if (!p || typeof p.cancelScheduledValues !== 'function') return;
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        if (typeof p.setValueAtTime === 'function') p.setValueAtTime(p.value, t);
      }
      if (typeof p.linearRampToValueAtTime !== 'function' || typeof p.setValueAtTime !== 'function') {
        p.value = 1;
        return;
      }
      p.linearRampToValueAtTime(floor, t + 0.012);
      p.setValueAtTime(floor, t + 0.12);
      p.linearRampToValueAtTime(1, t + 0.40);
    };
    automate(this.duckEngine, 0.55); // about -5 dB: rival RPM crosses the player's RPM
    automate(this.duckWind, 0.40);   // about -8 dB: pass air survives the boost rush
  }
}

// ================================================================= programs
// SFX: short gameplay feedback, all <= ~0.6 s.
Sound.prototype._SFX = {
  // bump: dull thud + short noise slap
  bump(t) {
    this._tone(t, { type: 'triangle', f0: 170, f1: 55, dur: 0.16, gain: 0.30 });
    this._noise(t, { dur: 0.11, gain: 0.16, f0: 1400, f1: 220, q: 0.8 });
  },
  // spin: descending square wail + tyre-scrub noise
  spin(t) {
    this._tone(t, { type: 'square', f0: 420, f1: 70, dur: 0.55, gain: 0.20 });
    this._tone(t, { type: 'square', f0: 424, f1: 66, dur: 0.55, gain: 0.14, detune: 12 });
    this._noise(t, { dur: 0.55, gain: 0.14, type: 'bandpass', f0: 2400, f1: 700, q: 3 });
  },
  // release (SLINGSHOT): the inverse of the draft gate.
  // upward doppler sweep + the wind rush snapping violently back in.
  release(t) {
    const D = 0.58;
    // doppler: pitch sweeps UP and past, two detuned saws
    this._tone(t, { type: 'sawtooth', f0: 110, f1: 1500, dur: D, gain: 0.20 });
    this._tone(t, { type: 'sawtooth', f0: 112, f1: 1460, dur: D, gain: 0.16, detune: -14 });
    // square octave stab on the front for arcade bite
    this._tone(t, { type: 'square', f0: 220, f1: 880, dur: 0.22, gain: 0.13 });
    // RISING CUE. The sweep alone is a texture; a pitched figure is what the ear reads as
    // "an event fired". Four rapid square notes climbing the same C-E-G motif the
    // checkpoint jingle uses, so the slingshot sounds like it belongs to this cabinet.
    // 40 ms apart: the whole figure lands inside the impulse's own 0.2 s window.
    [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => {
      this._tone(t + i * 0.04, { type: 'square', f0: f, dur: 0.10, gain: 0.15 });
      this._tone(t + i * 0.04, { type: 'square', f0: f * 2, dur: 0.07, gain: 0.06, detune: 8 });
    });
    // the air returning: noise opening from muffled to bright
    this._noise(t, { dur: D, gain: 0.30, type: 'lowpass', f0: 200, f1: 9000, q: 1.1, atk: 0.02 });
    // and physically shove the persistent wind bed back up, then let the
    // normal draft gate reclaim it.
    const now = this.ctx.currentTime;
    this._windBase = 0.16;
    this._applyWind();
    this.windGain.gain.cancelScheduledValues(now);
    this.windGain.gain.setValueAtTime(this.windGain.gain.value, now);
    this.windGain.gain.linearRampToValueAtTime(0.22, now + 0.16);
    this._windBase = 0;
    this.windGain.gain.setTargetAtTime(0.03, now + 0.18, 0.35);
    if (this._windTimer) clearTimeout(this._windTimer);
    this._windTimer = setTimeout(() => { this._windTimer = null; this._applyWind(); }, 700);
  },
  // boostOut: the dash ending, heard. Inverse of release — a short falling doublet plus
  // the air closing back down. Without it the boost simply stopped and the player never
  // registered that a finite resource had run out.
  boostOut(t) {
    this._tone(t, { type: 'square', f0: N.G5, f1: N.C5, dur: 0.16, gain: 0.13 });
    this._tone(t + 0.05, { type: 'sawtooth', f0: 700, f1: 150, dur: 0.24, gain: 0.11, detune: -10 });
    this._noise(t, { dur: 0.22, gain: 0.13, type: 'lowpass', f0: 5200, f1: 400, q: 1.0 });
  },
  // chargeFull: two-note bright ping, "ready"
  chargeFull(t) {
    this._tone(t, { type: 'square', f0: N.E5, dur: 0.09, gain: 0.16 });
    this._tone(t + 0.09, { type: 'square', f0: N.C6, dur: 0.16, gain: 0.16 });
  },
  // Sound target — overtake: a low engine body passes once at the player's side, then a
  // broad tyre/wind wash falls away behind it; physical car-and-air, never a reward chime.
  overtake(t, { pan } = {}) {
    if (typeof this._duckOvertakeBeds === 'function') this._duckOvertakeBeds(t);
    const panDest = typeof this._overtakeDestination === 'function'
      ? this._overtakeDestination(pan, t) : null;
    const bodyDest = typeof this._overtakeBodyDestination === 'function'
      ? this._overtakeBodyDestination(panDest, t, 0.48) : panDest;
    // A non-musical engine burst: the player's two-saw-plus-sub structure, but short,
    // panned and falling across the player's RPM so it reads as a different car passing.
    this._tone(t, { type: 'sawtooth', f0: 330, f1: 185, dur: 0.48, gain: 0.16, atk: 0.007, detune: -7, dest: bodyDest });
    this._tone(t, { type: 'sawtooth', f0: 336, f1: 189, dur: 0.47, gain: 0.13, atk: 0.009, detune: 9, dest: bodyDest });
    this._tone(t, { type: 'triangle', f0: 165, f1: 92, dur: 0.44, gain: 0.10, atk: 0.010, detune: 4, dest: bodyDest });
    // Low resonance keeps this broad and air-like instead of turning the filter sweep into
    // the pitched "pyon" of the old Q=3.2 program.
    this._noise(t, { dur: 0.48, gain: 0.22, type: 'bandpass', f0: 4200, f1: 850, q: 0.75, atk: 0.012, dest: panDest });
  },
  // chainBonus: one compact bank cue per completed session, never per link. Keeping it
  // separate from overtake means multi-car same-tick passes do not stack voices, and a
  // spin can forfeit the bonus simply by never emitting this event.
  chainBonus(t) {
    [N.C5, N.G5, N.C6].forEach((f, i) => {
      this._tone(t + i * 0.055, { type: 'square', f0: f, dur: 0.13, gain: 0.12 });
    });
  },
  // (B5, 2026-08-11) An SE half of the checkpoint used to live here — a single G5 blip
  // alongside the jingle. Nothing ever called it: game.js fires `jingle('checkpoint')`
  // only, so the blip had never been heard and could not be removed by feel. Deleted with
  // the contract line that advertised it. The jingle is the whole checkpoint sound.
  // timeLow: heartbeat pulse, meant to be re-triggered under 10 s
  timeLow(t) {
    this._tone(t, { type: 'triangle', f0: 96, f1: 58, dur: 0.11, gain: 0.34, atk: 0.004, curve: 'lin' });
    this._tone(t + 0.15, { type: 'triangle', f0: 80, f1: 48, dur: 0.14, gain: 0.24, atk: 0.004, curve: 'lin' });
  },
};

// JINGLES: rare musical phrases. checkpoint = the motif; finish develops it.
Sound.prototype._JINGLE = {
  // rising three-note major triad — the motif
  checkpoint(t) {
    const step = 0.11;
    MOTIF.forEach((f, i) => {
      this._tone(t + i * step, { type: 'square', f0: f, dur: 0.16, gain: 0.17 });
      this._tone(t + i * step, { type: 'square', f0: f / 2, dur: 0.16, gain: 0.09, detune: 6 });
    });
    this._tone(t + 3 * step, { type: 'square', f0: MOTIF[2] * 2, dur: 0.26, gain: 0.15 });
  },
  // finish: the same C-E-G motif, developed — motif, motif up a fourth,
  // inversion, then a held tonic chord. Deliberately longer than the SE cap.
  finish(t) {
    const s = 0.125;
    const line = [
      N.C5, N.E5, N.G5,          // motif
      N.F4 * 2, N.A4 * 2, N.C5 * 2, // motif transposed up a fourth
      N.E5, N.C5, N.G5,          // inversion
      N.G5, N.B4 * 2, N.D5 * 2,  // dominant lift
    ];
    line.forEach((f, i) => {
      this._tone(t + i * s, { type: 'square', f0: f, dur: 0.17, gain: 0.16 });
    });
    // bass walk under it
    [N.C3, N.C3, N.F3, N.G3].forEach((f, i) => {
      this._tone(t + i * 3 * s, { type: 'triangle', f0: f, dur: 0.34, gain: 0.22 });
    });
    // final tonic chord
    const tEnd = t + line.length * s;
    [N.C5, N.E5, N.G5, N.C4].forEach((f, i) => {
      this._tone(tEnd, { type: 'square', f0: f, dur: 0.50, gain: 0.13, detune: i * 4 });
    });
  },
  // gameover: the motif turned minor and falling
  gameover(t) {
    const s = 0.18;
    const line = [N.G5, N.E5, N.C5, semi(-10), semi(-13), semi(-17)];
    line.forEach((f, i) => {
      this._tone(t + i * s, { type: 'square', f0: f, dur: 0.24, gain: 0.16 });
    });
    this._tone(t + line.length * s, { type: 'triangle', f0: N.C3, f1: N.C3 / 2, dur: 0.9, gain: 0.24 });
  },
  // entry: name-entry / confirm chime, motif compressed to two notes
  entry(t) {
    this._tone(t, { type: 'square', f0: N.C5, dur: 0.08, gain: 0.15 });
    this._tone(t + 0.08, { type: 'square', f0: N.G5, dur: 0.20, gain: 0.15 });
  },
};

// ================================================================= sequencer
Sound.prototype.music = function music(name) {
  const valid = name === 'attract';
  this._musicName = valid ? name : null;
  if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  if (!this._ok()) return;
  if (!this._musicName) return;
  this._step = 0;
  this._nextStepTime = this.ctx.currentTime + 0.08;
  this._tick();
};

Sound.prototype._tick = function _tick() {
  if (!this._ok() || !this._musicName) return;
  const cfg = MUSIC[this._musicName];
  if (!cfg) return;
  const spb = (60 / cfg.bpm) / cfg.stepsPerBeat; // seconds per 16th
  const lookahead = 0.18;
  const now = this.ctx.currentTime;
  // AudioContext-clock driven: schedule every step that falls inside the window.
  while (this._nextStepTime < now + lookahead) {
    if (this._nextStepTime < now) this._nextStepTime = now + 0.01;
    this._scheduleStep(this._step % 16, this._nextStepTime, cfg, spb);
    this._step++;
    this._nextStepTime += spb;
  }
  this._timer = setTimeout(() => { this._timer = null; this._tick(); }, 40);
};

Sound.prototype._scheduleStep = function _scheduleStep(i, t, cfg, spb) {
  if (this.muted) return;
  const bass = cfg.bass[i];
  if (bass) {
    this._tone(t, {
      type: 'square', f0: bass, dur: Math.min(0.22, spb * 1.6),
      gain: cfg.bassGain, dest: this.musBassFilt, atk: 0.004,
    });
  }
  const arp = cfg.arp[i];
  if (arp) {
    this._tone(t, {
      type: cfg.drive ? 'sawtooth' : 'square', f0: arp,
      dur: Math.min(0.16, spb * 1.2), gain: cfg.arpGain,
      dest: this.busMusic, atk: 0.003, detune: cfg.drive ? 6 : 0,
    });
  }
  // hats/kick: single noise voice, era-cheap
  if (cfg.drive ? (i % 2 === 0) : (i % 4 === 0)) {
    this._noise(t, { dur: 0.05, gain: 0.05, type: 'highpass', f0: 5000, f1: 4000, q: 0.7, dest: this.busMusic });
  }
  if (i === 0 || i === 8) {
    this._tone(t, { type: 'triangle', f0: 110, f1: 45, dur: 0.10, gain: 0.22, dest: this.busMusic, curve: 'lin' });
  }
};

// ================================================================= helpers
function makeNoise(ctx, seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // deterministic LCG so the bed is identical every run
  let s = 22222;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return buf;
}

function softClipCurve() {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
  }
  return c;
}

// keep `num` referenced for future tuning helpers without tripping linters
void num;

export default Sound;
