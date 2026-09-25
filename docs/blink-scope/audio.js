// Procedural sound: game code emits core events; this maps them to voices.
let ac = null;
let master = null;
let water = null; // shared reverb bus: a damped feedback delay
let meter = null; // test hook: analyser after the limiter
let output = null; // final node before the speakers (for capture)
let noiseBuf = null;
let grit = null; // waveshaper curve for the blast's distortion

export function unlockAudio() {
  if (ac) {
    if (ac.state === "suspended") ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0.48;
  // A limiter keeps overlapping pings, echoes and blasts from clipping.
  const limit = ac.createDynamicsCompressor();
  limit.threshold.value = -10;
  limit.knee.value = 6;
  limit.ratio.value = 12;
  limit.attack.value = 0.003;
  limit.release.value = 0.15;
  master.connect(limit);
  limit.connect(ac.destination);
  output = limit;
  meter = ac.createAnalyser();
  meter.fftSize = 2048;
  limit.connect(meter);
  // Hull reverb: two damped taps feeding back, for the sonar tail.
  water = ac.createGain();
  water.gain.value = 1;
  const d1 = ac.createDelay(1);
  const d2 = ac.createDelay(1);
  d1.delayTime.value = 0.097;
  d2.delayTime.value = 0.143;
  const fb = ac.createGain();
  fb.gain.value = 0.62;
  const damp = ac.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2200;
  water.connect(d1);
  water.connect(d2);
  d1.connect(damp);
  d2.connect(damp);
  damp.connect(fb);
  fb.connect(d1);
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  damp.connect(wet).connect(master);
  grit = new Float32Array(1024);
  for (let i = 0; i < grit.length; i++) {
    const x = (i / (grit.length - 1)) * 2 - 1;
    grit[i] = Math.tanh(x * 6) * 0.8;
  }
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// A MediaStream of the final mix, for recording a video's soundtrack (tool hook).
export function captureStream() {
  if (!ac || !output) return null;
  const dest = ac.createMediaStreamDestination();
  output.connect(dest);
  return dest.stream;
}

// Peak output level over the analyser window (test hook).
export function peakLevel() {
  if (!meter) return 0;
  const a = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(a);
  let m = 0;
  for (const v of a) m = Math.max(m, Math.abs(v));
  return m;
}

// Spectral flatness of the current output, 0 (pure tone) .. 1 (white noise),
// over 100 Hz – 8 kHz (test hook).
export function flatness() {
  if (!meter) return 0;
  const bins = new Float32Array(meter.frequencyBinCount);
  meter.getFloatFrequencyData(bins);
  const hz = ac.sampleRate / meter.fftSize;
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let i = Math.ceil(100 / hz); i < Math.floor(8000 / hz); i++) {
    const p = Math.pow(10, bins[i] / 10) + 1e-20;
    logSum += Math.log(p);
    sum += p;
    n++;
  }
  return Math.exp(logSum / n) / (sum / n);
}

// A sonar voice: sine with a soft attack and a long exponential tail, sent
// partly to the reverb bus.
function sonar(f, dur, vol, delay = 0, send = 0.5, drop = 0.985) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * drop, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  if (send > 0) {
    const s = ac.createGain();
    s.gain.value = send;
    g.connect(s).connect(water);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Dry voices get a light reverb send so they sit in the same space as the ping.
const ROOM = 0.22;

function sendToWater(node, amount) {
  if (amount <= 0) return;
  const s = ac.createGain();
  s.gain.value = amount;
  node.connect(s).connect(water);
}

function tone(type, f0, f1, dur, vol, delay = 0, send = ROOM) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  sendToWater(g, send);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(
  dur,
  vol,
  freq = 1200,
  delay = 0,
  q = 0.8,
  send = ROOM,
  type = "bandpass",
) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  sendToWater(g, send);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

// Sweep paint: a short, soft contact blip (frequent, so no long tail).
// Pitch rises as the hunter is closer; too close to shoot adds a harsh partial.
export function sfxPaint(dist, tooClose) {
  const k = Math.max(0, Math.min(1, 1 - dist / 380));
  const f = 620 + 700 * k * k;
  sonar(f, 0.07, 0.035, 0, 0.3, 0.99);
  if (tooClose) tone("square", f * 0.5, f * 0.48, 0.06, 0.025, 0.01);
}

const PING_F = 1480;

// Blink + active ping: a dry blink zap, then the long sonar "ping".
export function sfxBlink(out) {
  tone("square", 1900, 240, 0.05, 0.035);
  noise(0.04, 0.04, 5000, 0, 2);
  if (!out) sonar(PING_F, 1.3, 0.11, 0.01, 0.7, 0.99);
}

// Echo from a hunter the ping passed: returns after `delay` (proportional to
// range), Doppler-shifted by its closing speed.
export function sfxEcho(delay, doppler) {
  sonar(PING_F * doppler, 0.32, 0.045, delay, 0.5, 0.995);
}

// Distorted, filtered noise burst — the body of a blast.
function crunch(
  dur,
  vol,
  freq,
  delay = 0,
  send = 0.4,
  type = "lowpass",
  q = 0.7,
  drive = true,
) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.12), t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let head = s;
  if (drive) {
    const pre = ac.createGain();
    pre.gain.value = 33;
    const w = ac.createWaveShaper();
    w.curve = grit;
    s.connect(pre).connect(w);
    head = w;
  }
  head.connect(f).connect(g).connect(master);
  sendToWater(g, send);
  s.start(t, Math.random() * 0.8);
  s.stop(t + dur + 0.02);
}

// Blast: mostly noise. A distorted crunch, a scatter of debris crackles, a
// long rumble, and only a short sub push underneath (no audible pitch, so it
// doesn't read as a drum). Chain links get brighter, not higher.
export function sfxKill(chain) {
  const c = Math.min(chain - 1, 8);
  const bright = Math.pow(1.15, c);
  const len = Math.max(0.5, 0.85 - 0.04 * c);
  crunch(0.09, 0.3, 6000 * bright, 0, 0.25, "highpass", 0.5);
  crunch(0.35, 0.34, 2600 * bright, 0.004, 0.4);
  crunch(len, 0.26, 900 * bright, 0.02, 0.6, "lowpass", 0.7, false);
  for (let i = 0; i < 7; i++) {
    const at = 0.03 + Math.random() * 0.4;
    crunch(
      0.02 + Math.random() * 0.03,
      0.12 * (1 - at),
      (2500 + Math.random() * 4000) * bright,
      at,
      0.3,
      "bandpass",
      3,
    );
  }
  tone("sine", 70, 32, 0.18, 0.22, 0, 0.1);
}

export function sfxDeath(cause) {
  noise(0.9, 0.35, cause === "edge" ? 3000 : 1600, 0, 0.5);
  tone("sawtooth", cause === "edge" ? 900 : 420, 40, 0.9, 0.12);
}

function seq(notes, step, type = "square", vol = 0.06, delay = 0) {
  notes.forEach((n, i) => {
    if (n) tone(type, n, n, step * 0.9, vol, delay + i * step);
  });
}

// A spark reaching its bezel tick: a dry relay click.
export function sfxTick() {
  tone("square", 2600, 2200, 0.025, 0.035);
}

// Sweep metronome: a dry filtered click, accented once per turn.
export function sfxMetro(accent) {
  noise(0.018, accent ? 0.07 : 0.03, accent ? 1800 : 3200, 0, 4, 0.12);
}

// Tube warming up: a rising whine with a click.
export function sfxPowerOn() {
  noise(0.02, 0.08, 2000, 0, 3);
  tone("sine", 60, 1600, 0.35, 0.06);
}

export function sfxClear() {
  seq([523, 659, 784, 1047, 0, 784, 1047], 0.08);
  seq([262, 0, 392, 0, 523], 0.11, "triangle", 0.09);
}

export function sfxExtend() {
  seq([1319, 1568, 1319, 1568, 2093], 0.06, "square", 0.05);
}

// Game complete: a rising fanfare over a held ping.
export function sfxComplete() {
  sonar(988, 2.4, 0.06, 0, 0.6, 1);
  seq([523, 659, 784, 1047, 0, 784, 1047, 1319, 1568], 0.11, "square", 0.05, 0.1);
  seq([262, 0, 392, 0, 523, 0, 659, 0, 784], 0.11, "triangle", 0.08, 0.1);
}

export function sfxGameOver() {
  // Tube switching off, then the jingle once the picture has gone.
  tone("sine", 1400, 50, 0.6, 0.08);
  seq([392, 330, 262, 196], 0.22, "triangle", 0.12, 0.95);
}

export function sfxStart() {
  seq([196, 262, 330, 392, 523], 0.07, "square", 0.05);
}

export function sfxReady() {
  tone("sine", 880, 880, 0.06, 0.05);
}
