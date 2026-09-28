// UNDERTOW procedural sound: square/triangle/noise voices in the spirit of early-80s PSG boards.
(function (root) {
  "use strict";
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let mixOut = null; // the final node before the speakers (the video recorder taps it)
  const VOLUME = 3.2;
  const CLIP = 3;

  function init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME / CLIP;
    const clip = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * CLIP);
    clip.curve = curve;
    master.connect(clip);
    clip.connect(ctx.destination);
    mixOut = clip;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // x is a screen x (0..256) or null for centre
  function out(node, x) {
    if (x != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.8, Math.min(0.8, (x / 256) * 1.6 - 0.8));
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

  const semi = (base, k) => base * Math.pow(2, k / 12);
  const LADDER = [0, 2, 4, 7, 9, 12, 14]; // cargo 1..6 climbs a major pentatonic

  const sfx = {
    fire(x, band) {
      noise(0.18, 0.1, 1800, 300, x);
      tone("triangle", band ? 520 : 300, band ? 260 : 150, 0.16, 0.08, x);
    },
    sink(x, n, kind) {
      noise(0.5 + n * 0.05, 0.45, 2400, 60, x);
      tone("square", kind === "ship" ? 150 : 110, 40, 0.45, 0.12, x);
      // everyone aboard spills out: one plink each, climbing
      for (let i = 0; i < n; i++) tone("square", semi(660, i * 3), semi(660, i * 3) * 0.98, 0.05, 0.06, x, 0.1 + i * 0.06);
    },
    grab(x, load) {
      tone("square", 300, 180, 0.09, 0.05, x);
      tone("square", semi(220, load * 2), semi(220, load * 2), 0.05, 0.04, x, 0.07);
    },
    launch() {
      tone("sawtooth", 196, 190, 0.18, 0.05);
      tone("sawtooth", 147, 140, 0.25, 0.05, null, 0.12);
    },
    aim(x) {
      for (let i = 0; i < 4; i++) tone("square", 1760, 1760, 0.03, 0.05, x, i * 0.16);
    },
    efire(x) {
      noise(0.2, 0.12, 2400, 400, x);
      tone("square", 700, 350, 0.15, 0.06, x);
    },
    catch(x, cargo) {
      const f = semi(523, LADDER[Math.min(6, cargo) - 1]);
      tone("square", f, f, 0.06, 0.08, x);
      tone("triangle", f * 2, f * 2, 0.05, 0.05, x, 0.04);
    },
    full(x) {
      tone("square", 330, 330, 0.05, 0.06, x);
      tone("square", 330, 330, 0.05, 0.06, x, 0.08);
    },
    allSaved(x, n) {
      const steps = [0, 4, 7, 12, 16, 19, 24].slice(0, Math.max(3, n + 1));
      steps.forEach((k, i) => tone("square", semi(523, k), semi(523, k), 0.09, 0.09, x, i * 0.06));
      tone("triangle", semi(262, 12), semi(262, 12), 0.5, 0.12, x, steps.length * 0.06);
    },
    deliver(left) {
      const f = semi(784, left % 5);
      tone("triangle", f, f * 1.02, 0.05, 0.1);
    },
    raftSink(x, n) {
      noise(0.4, 0.15, 900, 200, x);
      for (let i = 0; i < n; i++) tone("triangle", 600 - i * 60, 300 - i * 30, 0.12, 0.05, x, i * 0.05);
    },
    drown(x) {
      tone("triangle", 180, 90, 0.25, 0.14, x);
      noise(0.2, 0.08, 800, 200, x, 0.05);
    },
    captiveBlasted(x) { tone("square", 240, 80, 0.2, 0.09, x); },
    tell(x) {
      tone("square", 1400, 1400, 0.04, 0.04, x);
      tone("square", 1400, 1400, 0.04, 0.04, x, 0.12);
    },
    recall() {
      [7, 4, 0, -5].forEach((k, i) => tone("triangle", semi(440, k), semi(440, k), 0.14, 0.12, null, i * 0.12));
    },
    bump(x) {
      tone("triangle", 140, 90, 0.12, 0.12, x);
      noise(0.1, 0.1, 900, 200, x);
    },
    flee(x) {
      // our harbour's alarm: a raider is making off with people
      for (let i = 0; i < 3; i++) tone("square", 880, 660, 0.12, 0.06, x, i * 0.16);
    },
    ferryTurn() {
      tone("triangle", 392, 392, 0.08, 0.08);
      tone("triangle", 523, 523, 0.1, 0.08, null, 0.09);
    },
    ferryHome(n) {
      for (let i = 0; i < Math.min(8, n); i++) tone("triangle", semi(523, i * 2), semi(523, i * 2), 0.06, 0.1, null, i * 0.05);
    },
    shellFire(x) {
      noise(0.15, 0.25, 3000, 600, x);
      tone("square", 220, 110, 0.12, 0.08, x);
    },
    ferryHit(x) {
      noise(0.35, 0.4, 2000, 100, x);
      tone("square", 180, 60, 0.3, 0.12, x);
    },
    splash(x) {
      noise(0.25, 0.12, 1500, 300, x);
    },
    drop(x) { tone("square", 1200, 1100, 0.03, 0.04, x); },
    blast(x) {
      noise(0.45, 0.4, 1400, 50, x);
      tone("triangle", 90, 40, 0.4, 0.25, x);
    },
    escape() {
      tone("sawtooth", 110, 104, 0.5, 0.1);
      tone("sawtooth", 82, 78, 0.6, 0.1, null, 0.05);
    },
    spawn(x) { tone("triangle", 660, 660, 0.03, 0.03, x); },
    death(x) {
      noise(1.2, 0.6, 2500, 40, x);
      tone("square", 420, 35, 1.1, 0.16, x);
    },
    ping(k) {
      // sonar ping: k 0..1 = urgency (captives near the seabed)
      tone("sine", 1300 + k * 500, 1250 + k * 500, 0.25, 0.04 + k * 0.03);
    },
    extend() {
      [0, 12, 7, 19, 12, 24].forEach((k, i) => tone("triangle", semi(523, k), semi(523, k), 0.08, 0.14, null, i * 0.06));
    },
    start() {
      [0, 5, 7, 12, 7, 12, 17].forEach((k, i) => tone("square", semi(196, k), semi(196, k), 0.1, 0.07, null, i * 0.1));
    },
    clear(perfect) {
      const seq = perfect ? [0, 4, 7, 12, 16, 19, 24, 28] : [0, 4, 7, 12, 7];
      seq.forEach((k, i) => tone("square", semi(392, k), semi(392, k), 0.1, 0.08, null, i * 0.08));
    },
    allclear() {
      [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((k, i) => tone("square", semi(262, k), semi(262, k), 0.14, 0.09, null, i * 0.11));
      [0, 7, 12].forEach((k, i) => tone("triangle", semi(131, k), semi(131, k), 0.4, 0.14, null, 0.99 + i * 0.3));
    },
    over() {
      [12, 7, 3, 0, -5].forEach((k, i) => tone("triangle", semi(220, k), semi(220, k), 0.22, 0.16, null, i * 0.2));
    },
  };

  root.UTAudio = {
    init,
    sfx,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : VOLUME / CLIP;
      return muted;
    },
    get muted() {
      return muted;
    },
    bus() {
      return mixOut;
    },
  };
})(window);
