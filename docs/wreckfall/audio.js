// WRECKFALL procedural sound: square/triangle/noise voices in the spirit of early-80s discrete + PSG boards.
(function (root) {
  "use strict";
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let mixOut = null; // final node before the speakers (the recorder taps it)
  // overall level; a soft clipper after it keeps stacked explosions from hard-clipping
  const VOLUME = 4.0;
  const CLIP_RANGE = 3; // the shaper covers amplitudes up to ±3 before the tanh knee flattens

  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME / CLIP_RANGE;
    // soft clipper (tanh): transparent at normal levels, rounds off stacked peaks. A
    // DynamicsCompressor was tried and ducked the short blips to a quarter of their level.
    const clip = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * CLIP_RANGE; // actual amplitude
      curve[i] = Math.tanh(x);
    }
    clip.curve = curve;
    master.connect(clip);
    clip.connect(ctx.destination);
    mixOut = clip;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function pan(x) {
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = Math.max(-0.8, Math.min(0.8, (x / 224) * 1.6 - 0.8));
    return p;
  }

  function out(node, x) {
    const p = x == null ? null : pan(x);
    if (p) {
      node.connect(p);
      p.connect(master);
    } else node.connect(master);
  }

  function tone(type, f0, f1, dur, vol, x, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    out(g, x);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, fc0, fc1, x, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(fc0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, fc1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f);
    f.connect(g);
    out(g, x);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  // pentatonic ladder for chain steps
  const CHAIN = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
  const semi = (base, k) => base * Math.pow(2, k / 12);

  const sfx = {
    fire(x) { tone("square", 1400, 520, 0.07, 0.10, x); },
    clink(x) {
      tone("square", 2637, 2600, 0.05, 0.08, x);
      tone("square", 3520, 3400, 0.09, 0.05, x, 0.012);
    },
    hit(x) {
      noise(0.12, 0.28, 3000, 400, x);
      tone("square", 330, 110, 0.12, 0.08, x);
    },
    swallow(x, n, armored) {
      const f = semi(262, CHAIN[Math.min(CHAIN.length - 1, n - 1)]);
      tone("square", f, f, 0.09, 0.09, x);
      tone("triangle", f * 2, f * 2, 0.07, 0.06, x, 0.03);
      if (armored) {
        noise(0.45, 0.5, 1800, 60, x);
        tone("triangle", 110, 40, 0.5, 0.35, x);
        tone("square", 55, 30, 0.35, 0.12, x);
      }
    },
    land(x, n) {
      noise(0.18 + n * 0.05, 0.18 + Math.min(0.3, n * 0.05), 900, 60, x);
      tone("triangle", 90, 45, 0.2 + n * 0.03, 0.2, x);
    },
    fork(x) {
      tone("square", 700, 1400, 0.08, 0.07, x == null ? null : x - 20);
      tone("square", 700, 350, 0.08, 0.07, x == null ? null : x + 20);
    },
    ufo(x, step) {
      const f = step % 2 ? 620 : 780;
      tone("triangle", f, f * 0.97, 0.08, 0.06, x);
    },
    ufoHit(x) {
      noise(0.7, 0.5, 4000, 80, x);
      [0, 5, 9, 12].forEach((k, i) => tone("square", semi(330, k), semi(330, k), 0.07, 0.07, x, i * 0.05));
    },
    bounce(x, plate) {
      noise(0.12, 0.25, 900, 200, x);
      if (plate) { tone("square", 1760, 1500, 0.12, 0.08, x); tone("square", 2350, 2000, 0.1, 0.05, x, 0.02); }
      else tone("square", 140, 90, 0.1, 0.1, x);
    },
    reverse() {
      tone("square", 520, 520, 0.05, 0.06);
      tone("square", 390, 390, 0.05, 0.06, null, 0.06);
    },
    graze(x) {
      noise(0.16, 0.12, 4000, 700, x);
      tone("triangle", 1800, 900, 0.1, 0.03, x);
    },
    whistle(x, k) {
      const f = 500 + 1300 * k;
      tone("triangle", f, f * 1.03, 0.07, 0.025 + 0.02 * k, x);
    },
    heart() {
      tone("sine", 60, 40, 0.12, 0.3);
      tone("sine", 55, 38, 0.1, 0.22, null, 0.14);
    },
    tick(k) {
      const f = 900 + 900 * k;
      tone("square", f, f, 0.025, 0.04);
    },
    bombTell(x) { tone("square", 880, 880, 0.03, 0.04, x); },
    bomb(x) { tone("triangle", 1200, 300, 0.5, 0.06, x); },
    bombshot(x) { noise(0.07, 0.15, 5000, 1500, x); tone("square", 1800, 900, 0.05, 0.05, x); },
    death(x) {
      noise(1.1, 0.55, 2500, 50, x);
      tone("square", 440, 40, 1.0, 0.15, x);
    },
    invade() {
      for (let i = 0; i < 6; i++) tone("square", 160 - i * 18, 150 - i * 18, 0.12, 0.13, null, i * 0.13);
    },
    clear() {
      [0, 4, 7, 12, 16, 19, 24].forEach((k, i) => tone("square", semi(392, k), semi(392, k), 0.1, 0.08, null, i * 0.07));
    },
    extend(delay) {
      [0, 12, 7, 19, 12, 24].forEach((k, i) => tone("triangle", semi(523, k), semi(523, k), 0.08, 0.14, null, (delay || 0) + i * 0.06));
    },
    start() {
      [0, 7, 12, 7, 0, 12].forEach((k, i) => tone("square", semi(196, k), semi(196, k), 0.1, 0.07, null, i * 0.09));
    },
    allclear() {
      [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((k, i) => tone("square", semi(262, k), semi(262, k), 0.14, 0.09, null, i * 0.11));
      [0, 7, 12].forEach((k, i) => tone("triangle", semi(131, k), semi(131, k), 0.4, 0.14, null, 0.99 + i * 0.3));
    },
    over() {
      [12, 7, 3, 0, -5].forEach((k, i) => tone("triangle", semi(220, k), semi(220, k), 0.22, 0.16, null, i * 0.2));
    },
    march(step, urgent) {
      const notes = [98, 87, 78, 73];
      tone("square", notes[step % 4] * (urgent ? 1.06 : 1), notes[step % 4] * 0.9, 0.09, 0.13);
    },
  };

  root.WFAudio = {
    init,
    __reset() { ctx = null; master = null; }, // test hook: rebuild the graph on the next init
    sfx,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : VOLUME / CLIP_RANGE;
      return muted;
    },
    get muted() { return muted; },
    bus() { return mixOut; }, // for the video recorder: the full mix, after the soft clipper
  };
})(window);
