// Plays a compiled cue (music.js) through Web Audio: five channels that stand
// in for a Famicom's, each sounding one thing at a time, changed no more often
// than once a frame.
//
// A cue is scheduled a little ahead of the clock, a stretch at a time (pump),
// so that the timing is the audio clock's and not the display's.

import { CUES, DUTIES, NES, NOISE_PERIODS, pulseHz, triangleHz } from "./music.js";

const FRAME = 1 / NES.fps;
const AHEAD = 0.35; // seconds scheduled ahead of the clock
const EDGE = 0.004; // seconds over which the triangle is opened and closed
// How loud each channel is at its loudest, against full scale before the
// music's own level (kit.js, MUSIC.gain): roughly the machine's own balance.
export const MIX = Object.freeze({ pulse: 0.2, triangle: 0.26, noise: 0.2, dpcm: 0.34 });
const HARMONICS = 48;

// A pulse wave of the given duty cycle, as a periodic wave.
function pulseWave(ctx, duty) {
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  for (let n = 1; n <= HARMONICS; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty);
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

// The machine's triangle: thirty-two steps of sixteen levels, not a smooth
// one. Its harmonics, as [cosine parts, sine parts]. The steps are held, so
// the wave is measured finely along each step: measured at one point a step,
// the 31st and 33rd harmonics come out as loud as the note itself, which is
// a buzz the real wave does not have.
export function triangleHarmonics(count = HARMONICS) {
  const table = [];
  for (let i = 0; i < 32; i++) table.push(((i < 16 ? 15 - i : i - 16) - 7.5) / 7.5);
  const FINE = 4096;
  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);
  for (let n = 1; n <= count; n++) {
    for (let i = 0; i < FINE; i++) {
      const a = (2 * Math.PI * n * (i + 0.5)) / FINE;
      const v = table[Math.floor((i * 32) / FINE)];
      real[n] += (v * Math.cos(a) * 2) / FINE;
      imag[n] += (v * Math.sin(a) * 2) / FINE;
    }
  }
  return [real, imag];
}

function steppedTriangle(ctx) {
  const [real, imag] = triangleHarmonics();
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

// A second of the noise channel's shift register, stepped at the given rate.
function noiseBuffer(ctx, stepsPerSecond) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let reg = 1;
  let hold = 0;
  let value = 0;
  const samplesPerStep = ctx.sampleRate / stepsPerSecond;
  for (let i = 0; i < data.length; i++) {
    while (hold <= 0) {
      const bit = (reg ^ (reg >> 1)) & 1;
      reg = (reg >> 1) | (bit << 14);
      value = reg & 1 ? 1 : -1;
      hold += samplesPerStep;
    }
    hold--;
    data[i] = value;
  }
  return buffer;
}

// A drum as the sample channel plays it: the wanted shape is followed one bit
// at a time, two levels up or down a sample, through a seven-bit converter.
// That is where its dull, gritty sound comes from.
function deltaSample(ctx, seconds, shape) {
  const rate = 33144; // the channel's fastest rate
  const count = Math.floor(seconds * rate);
  const levels = new Float32Array(count);
  let level = 64;
  for (let i = 0; i < count; i++) {
    const want = 64 + 62 * shape(i / rate);
    level = Math.max(0, Math.min(126, level + (want > level ? 2 : -2)));
    levels[i] = (level - 64) / 64;
  }
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = levels[Math.min(count - 1, Math.floor((i / ctx.sampleRate) * rate))];
  return buffer;
}

function drumSamples(ctx) {
  let seed = 0x2f6e2b1;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x80000000 - 1;
  };
  return {
    // A sine that falls from 170 to 45 cycles as it dies away.
    kick: deltaSample(ctx, 0.13, (t) => Math.sin(2 * Math.PI * (45 * t + (125 / 22) * (1 - Math.exp(-22 * t)))) * Math.exp(-t * 16)),
    // Noise over a short tone.
    snare: deltaSample(ctx, 0.11, (t) => (noise() * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.5) * Math.exp(-t * 26)),
  };
}

export function createMusicPlayer(ctx, destination) {
  let built = null;
  const build = () => {
    const pulse = () => {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(destination);
      const duties = DUTIES.map((duty) => {
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(pulseWave(ctx, duty));
        const pick = ctx.createGain();
        pick.gain.value = 0;
        osc.connect(pick);
        pick.connect(out);
        osc.start();
        return { osc, pick };
      });
      return { out, duties };
    };
    const tri = ctx.createOscillator();
    tri.setPeriodicWave(steppedTriangle(ctx));
    const triOut = ctx.createGain();
    triOut.gain.value = 0;
    tri.connect(triOut);
    triOut.connect(destination);
    tri.start();
    const noiseStep = NES.cpu / NOISE_PERIODS[5];
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, noiseStep);
    noise.loop = true;
    const noiseOut = ctx.createGain();
    noiseOut.gain.value = 0;
    noise.connect(noiseOut);
    noiseOut.connect(destination);
    noise.start();
    const dpcmOut = ctx.createGain();
    dpcmOut.gain.value = MIX.dpcm;
    dpcmOut.connect(destination);
    return { p1: pulse(), p2: pulse(), tri, triOut, noise, noiseOut, noiseStep, dpcmOut, samples: drumSamples(ctx), drums: [] };
  };

  // What is playing: the cue, when its frame 0 was, and how far it is scheduled.
  let now = null;

  function schedulePulse(ch, event, t0) {
    event.steps.forEach(([period, vol, duty], k) => {
      const t = t0 + k * FRAME;
      const f = pulseHz(period);
      ch.duties.forEach((d, i) => {
        d.osc.frequency.setValueAtTime(f, t);
        d.pick.gain.setValueAtTime(i === duty ? 1 : 0, t);
      });
      ch.out.gain.setValueAtTime((vol / 15) * MIX.pulse, t);
    });
    ch.out.gain.setValueAtTime(0, t0 + event.steps.length * FRAME);
  }

  // Schedules everything of the cue that starts in [from, to) frames of
  // absolute cue time (frames since it began, the loop unrolled).
  function scheduleSpan(from, to) {
    const cue = now.cue;
    const span = cue.frames - cue.loopFrame;
    // Each pass through the cue that the span touches.
    for (let pass = 0; ; pass++) {
      const offset = pass === 0 ? 0 : cue.frames + (pass - 1) * span - cue.loopFrame;
      const first = pass === 0 ? 0 : cue.loopFrame;
      if (offset + first >= to) break;
      const each = (list, fn) => {
        for (const e of list) {
          if (e.frame < first) continue;
          const at = e.frame + offset;
          if (at >= from && at < to) fn(e, now.start + at * FRAME);
        }
      };
      each(cue.channels.p1, (e, t) => schedulePulse(built.p1, e, t));
      each(cue.channels.p2, (e, t) => schedulePulse(built.p2, e, t));
      each(cue.channels.tri, (e, t) => {
        // The machine's triangle is not switched off: it is stopped where it
        // stands and carries on from there, so a note neither starts nor ends
        // with a jump. An oscillator cannot be stopped in place; opening and
        // closing it over a few thousandths of a second is the nearest thing,
        // and without it every bass note begins and ends with a click.
        const end = t + e.frames * FRAME;
        built.tri.frequency.setValueAtTime(triangleHz(e.period), t);
        built.triOut.gain.setValueAtTime(0, t);
        built.triOut.gain.linearRampToValueAtTime(MIX.triangle, t + EDGE);
        built.triOut.gain.setValueAtTime(MIX.triangle, Math.max(end - EDGE, t + EDGE));
        built.triOut.gain.linearRampToValueAtTime(0, end);
      });
      each(cue.channels.noise, (e, t) => {
        built.noise.playbackRate.setValueAtTime(NES.cpu / NOISE_PERIODS[e.period] / built.noiseStep, t);
        e.steps.forEach((vol, k) => built.noiseOut.gain.setValueAtTime((vol / 15) * MIX.noise, t + k * FRAME));
        built.noiseOut.gain.setValueAtTime(0, t + e.steps.length * FRAME);
      });
      each(cue.channels.dpcm, (e, t) => {
        // One sample at a time: the one before is cut.
        for (const d of built.drums) {
          try {
            d.stop(t);
          } catch {
            // already ended
          }
        }
        const source = ctx.createBufferSource();
        source.buffer = built.samples[e.sample];
        source.connect(built.dpcmOut);
        source.start(t);
        built.drums.push(source);
        source.onended = () => {
          built.drums = built.drums.filter((d) => d !== source);
        };
      });
    }
  }

  function silence(when) {
    if (!built) return;
    for (const param of [built.p1.out.gain, built.p2.out.gain, built.triOut.gain, built.noiseOut.gain]) {
      param.cancelScheduledValues(when);
      param.setValueAtTime(0, when);
    }
    // (Which duty a pulse channel sounds is scheduled too: left standing, the
    // old cue's choices would colour the first notes of the new one.)
    for (const ch of [built.p1, built.p2]) {
      for (const d of ch.duties) {
        d.osc.frequency.cancelScheduledValues(when);
        d.pick.gain.cancelScheduledValues(when);
      }
    }
    built.tri.frequency.cancelScheduledValues(when);
    built.noise.playbackRate.cancelScheduledValues(when);
    for (const d of built.drums) {
      try {
        d.stop(when);
      } catch {
        // already ended
      }
    }
    built.drums = [];
  }

  const player = {
    get cue() {
      return now ? now.cue.id : "";
    },
    // Starts a cue from its beginning. If another is playing, it is cut on
    // its next beat and the new one comes in there, so that a change of
    // scene does not trip the rhythm (at most a third of a second later).
    play(id, when) {
      const cue = CUES[id];
      if (!cue) throw new Error(`music: no cue '${id}'`);
      if (!built) built = build();
      if (when === undefined) {
        when = ctx.currentTime + 0.03;
        if (now) {
          const beat = now.cue.beatFrames * FRAME;
          const since = when - now.start;
          if (since > 0) when = now.start + Math.ceil(since / beat) * beat;
        }
      }
      silence(when);
      now = { cue, start: when, done: 0 };
      player.pump();
    },
    stop(when = ctx.currentTime) {
      silence(when);
      now = null;
    },
    // Schedules as far ahead as AHEAD (or, for a render, up to `until` seconds).
    pump(until = ctx.currentTime + AHEAD) {
      if (!now) return;
      const to = Math.ceil((until - now.start) / FRAME);
      if (to <= now.done) return;
      scheduleSpan(now.done, to);
      now.done = to;
    },
  };
  return player;
}
