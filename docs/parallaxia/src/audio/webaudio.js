// Web Audio adapter: turns a kit program into oscillators. It knows no game
// names. One note per voice: a new note on a voice cuts the one before it.

import { MASTER, MUSIC, PROFILE } from "./kit.js";
import { createMusicPlayer } from "./musicplayer.js";

const RAMP = 0.002; // seconds; just enough to gate a note without a click

// One second of noise from a 15-bit shift register, the same every time.
function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let reg = 0x4a3f;
  let hold = 0;
  let value = 0;
  // The register steps at a fixed rate, whatever the output rate is.
  const samplesPerStep = ctx.sampleRate / 22050;
  for (let i = 0; i < data.length; i++) {
    if (hold <= 0) {
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

// ctx may be an OfflineAudioContext (the level check renders through one).
export function createWebAudioAdapter(ctx) {
  const master = ctx.createGain();
  master.gain.value = Math.min(Math.max(MASTER.gain, 0), 1);
  master.connect(ctx.destination);
  const noise = noiseBuffer(ctx);
  // The music: its own channels, into the same output at its own level.
  const musicOut = ctx.createGain();
  musicOut.gain.value = Math.min(Math.max(MUSIC.gain, 0), 1);
  musicOut.connect(ctx.destination);
  const music = createMusicPlayer(ctx, musicOut);
  const active = Object.fromEntries(Object.keys(PROFILE.voices).map((v) => [v, []]));

  function cut(voice, when) {
    for (const node of active[voice]) {
      node.gain.gain.cancelScheduledValues(when);
      node.gain.gain.setValueAtTime(0, when);
      try {
        node.source.stop(when + RAMP);
      } catch {
        // already stopped
      }
    }
    active[voice] = [];
  }

  function playProgram(program, { transpose = 0, when = ctx.currentTime } = {}) {
    const ratio = 2 ** (transpose / 12);
    for (const voice of new Set(program.steps.map((s) => s.voice))) cut(voice, when);
    for (const s of program.steps) {
      const primitive = PROFILE.voices[s.voice];
      const start = when + s.offset;
      const end = start + s.duration;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(Math.min(s.gain, 1), start + RAMP);
      gain.gain.setValueAtTime(Math.min(s.gain, 1), Math.max(end - RAMP, start + RAMP));
      gain.gain.linearRampToValueAtTime(0, end);
      gain.connect(master);
      let source;
      if (primitive === "noise") {
        source = ctx.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        source.playbackRate.setValueAtTime(s.from, start);
        source.playbackRate.linearRampToValueAtTime(s.to, end);
      } else {
        source = ctx.createOscillator();
        source.type = primitive === "pulse" ? "square" : "triangle";
        source.frequency.setValueAtTime(s.from * ratio, start);
        source.frequency.linearRampToValueAtTime(s.to * ratio, end);
      }
      source.connect(gain);
      source.start(start);
      source.stop(end + RAMP);
      const node = { source, gain };
      active[s.voice].push(node);
      source.onended = () => {
        gain.disconnect();
        active[s.voice] = active[s.voice].filter((n) => n !== node);
      };
    }
  }

  return {
    playProgram,
    // id "" stops the music. pumpMusic keeps it scheduled ahead of the clock.
    playMusic: (id, when) => (id ? music.play(id, when) : music.stop()),
    pumpMusic: (until) => music.pump(until),
    get musicCue() {
      return music.cue;
    },
    stopAll: () => {
      for (const voice of Object.keys(active)) cut(voice, ctx.currentTime);
    },
    suspend: () => ctx.suspend?.().catch(() => {}),
    resume: () => ctx.resume?.().catch(() => {}),
  };
}
