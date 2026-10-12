// The game's sound kit: which moments make a sound, and the sounds themselves
// as plain data. Nothing here plays anything; the bus (bus.js) decides what
// may sound, and an adapter (webaudio.js) turns a program into output.
//
// The kit is era-inspired, not an emulation of a named board: four monophonic
// voices (two pulse, one triangle bass, one noise), hard-gated notes with
// linear pitch slides, mono output, no effects. The background music is a
// second sound source beside this one, with the five channels of a Famicom
// (music.js, musicplayer.js; docs/audio.md).

import { CUES } from "./music.js";

export const PROFILE = Object.freeze({
  id: "generic-four-voice",
  fidelity: "era-inspired",
  voiceLimit: 4,
  primitives: Object.freeze(["pulse", "triangle", "noise"]),
  // Voice name -> primitive. Each voice sounds one note at a time.
  voices: Object.freeze({ pulse1: "pulse", pulse2: "pulse", bass: "triangle", noise: "noise" }),
  // Two programs asking for the same voice in one frame: the one with the
  // higher priority sounds and the other is dropped.
  sameTickPolicy: "drop",
});

// Every voice at its loudest at once, with the music at its loudest under
// them, stays below full scale (tested).
export const MASTER = Object.freeze({ gain: 0.24 });
// The music's level. It has channels of its own (music.js): the effects above
// never take a channel from it, and it never takes one from them.
export const MUSIC = Object.freeze({ gain: 0.34 });

export const BUDGETS = Object.freeze({
  sfxMaxDurationSeconds: 0.6,
  jingleMaxDurationSeconds: 1.6,
  maxStepsPerProgram: 24,
});

// A step is one gated note on one voice: from/to are Hz for pulse and
// triangle, and playback rates for noise (1 = bright hiss, lower = rumble).
const step = (voice, offset, duration, from, to, gain) => Object.freeze({ voice, offset, duration, from, to, gain });
const notes = (voice, start, length, gap, pitches, gain) => pitches.map((hz, i) => step(voice, start + i * (length + gap), length, hz, hz, gain));
const program = (id, kind, steps) => Object.freeze({ id, kind, steps: Object.freeze(steps) });

const C5 = 523.25;
const A4 = 440;
const semis = (n) => 2 ** (n / 12);

export const PROGRAMS = Object.freeze({
  // Up to 20 a second: dry and very short, so it reads as a rattle.
  shot: program("shot", "sfx", [step("pulse1", 0, 0.04, 1250, 620, 0.22)]),
  // A shot landing on something that survives it: a knock under the rattle.
  hit: program("hit", "sfx", [step("bass", 0, 0.03, 210, 140, 0.55)]),
  // One dry tick per lock, on one pitch: a sight clicking on, not a chirp.
  // The bus raises it a step of the scale for each lock already held.
  lock: program("lock", "sfx", [step("pulse1", 0, 0.028, 1760, 1760, 0.3)]),
  // The lasers going: a short hard drop.
  release: program("release", "sfx", [step("pulse1", 0, 0.11, 1760, 220, 0.42)]),
  "laser-hit": program("laser-hit", "sfx", [step("bass", 0, 0.11, 330, 70, 0.75)]),
  "destroy-small": program("destroy-small", "sfx", [step("noise", 0, 0.12, 1, 0.45, 0.45)]),
  // Something on the ground going: duller and lower than anything in the air.
  // A whole group of bonus targets: four quick notes up the scale.
  "ground-bonus": program("ground-bonus", "sfx", notes("pulse2", 0, 0.045, 0.01, [A4 * 2, A4 * 2 * semis(3), A4 * 2 * semis(7), A4 * 4], 0.4)),
  // A hidden target showing itself: two notes close together.
  "ground-reveal": program("ground-reveal", "sfx", [step("pulse2", 0, 0.03, 1318.5, 1318.5, 0.3), step("pulse2", 0.04, 0.05, 1760, 1760, 0.3)]),
  "ground-destroy": program("ground-destroy", "sfx", [step("noise", 0, 0.1, 0.4, 0.2, 0.4)]),
  // A whole island cleared: three steady steps up.
  "destroy-middle": program("destroy-middle", "sfx", [step("noise", 0, 0.38, 0.7, 0.18, 0.7), step("bass", 0, 0.22, 170, 50, 0.6)]),
  "destroy-large": program("destroy-large", "sfx", [step("noise", 0, 0.58, 0.5, 0.1, 0.85), step("bass", 0, 0.42, 130, 34, 0.7)]),
  // Two rising notes; the bus raises the pair a semitone per formation in the
  // chain, so a long chain is heard climbing.
  formation: program("formation", "sfx", [step("pulse2", 0, 0.05, 440, 440, 0.4), step("pulse2", 0.05, 0.09, 659.3, 659.3, 0.4)]),
  // An island let go: a dull knock under the chain breaking.
  // A boss's last wing gone and its body open: a falling crack on the second pulse.
  "boss-open": program("boss-open", "sfx", [step("pulse2", 0, 0.16, 1320, 330, 0.4)]),
  // A boss about to give up and go: the same falling pair, twice.
  "boss-warn": program("boss-warn", "sfx", notes("pulse2", 0, 0.09, 0.03, [880, 659.3, 880, 659.3], 0.4)),
  // A boss going up: the longest blast the budget allows, with a falling tone
  // through it.
  "boss-destroy": program("boss-destroy", "sfx", [step("noise", 0, 0.6, 0.6, 0.06, 0.9), step("bass", 0, 0.6, 150, 28, 0.75), step("pulse2", 0, 0.5, 880, 110, 0.35)]),
  // A near miss that counted: the smallest tick there is, well above the shot.
  graze: program("graze", "sfx", [step("pulse1", 0, 0.025, 2400, 2400, 0.16)]),
  "chain-break": program("chain-break", "sfx", [step("pulse2", 0, 0.08, 392, 392, 0.35), step("pulse2", 0.08, 0.14, 277, 277, 0.35)]),
  // The loudest thing in the kit. It leaves the bass and the second pulse
  // free, so the game-over jingle can start on the same frame.
  miss: program("miss", "sfx", [step("noise", 0, 0.6, 1, 0.08, 0.9), step("pulse1", 0, 0.45, 760, 50, 0.45)]),
  section: program("section", "sfx", [step("pulse2", 0, 0.05, 659.3, 659.3, 0.3), step("pulse2", 0.08, 0.05, 659.3, 659.3, 0.3)]),
  // Up the five-note minor scale from A: at home over every tune.
  "jingle:extend": program("jingle:extend", "jingle", notes("pulse2", 0, 0.07, 0.01, [A4, A4 * semis(3), A4 * semis(5), A4 * semis(7), A4 * semis(10), A4 * 2], 0.45)),
  // A new loop: four notes up through the tune's scale, over a rising bass.
  "jingle:loop": program("jingle:loop", "jingle", [
    ...notes("pulse2", 0, 0.09, 0.02, [A4, A4 * semis(7), A4 * 2, A4 * 2 * semis(7)], 0.42),
    ...notes("bass", 0, 0.2, 0.02, [A4 / 4, A4 / 2], 0.6),
  ]),
  "jingle:start": program("jingle:start", "jingle", [
    ...notes("pulse2", 0, 0.1, 0.02, [C5 * semis(7), C5 * 2, C5 * semis(7), C5 * 2, C5 * 2 * semis(4), C5 * 2 * semis(7)], 0.42),
    ...notes("bass", 0, 0.22, 0.02, [C5 / 4, C5 / 4 * semis(7), C5 / 2], 0.6),
  ]),
  "jingle:gameover": program("jingle:gameover", "jingle", [
    ...notes("pulse2", 0, 0.2, 0.04, [C5 * semis(7), C5 * semis(3), C5, C5 / 2 * semis(8), C5 / 2 * semis(7)], 0.42),
    ...notes("bass", 0, 0.44, 0.04, [C5 / 4, C5 / 4 * semis(-4), C5 / 8 * semis(7)], 0.6),
  ]),
});

// Every moment the game can report, and what it sounds like. "none" is a
// decision, not an omission; each has its reason.
// keyed: the sound has a pitch of its own, written in A; the bus moves it to
// the key of the music that is playing, so that it does not sound against it.
export const EVENTS = Object.freeze([
  { name: "player:miss", classification: "sfx", priority: 100, program: "miss" },
  { name: "run:gameover", classification: "jingle", priority: 100, program: "jingle:gameover" },
  { name: "run:start", keyed: true, classification: "jingle", priority: 95, program: "jingle:start" },
  { name: "player:extend", keyed: true, classification: "jingle", priority: 90, program: "jingle:extend" },
  { name: "boss:destroy", classification: "sfx", priority: 92, program: "boss-destroy" },
  { name: "boss:open", classification: "sfx", priority: 82, program: "boss-open" },
  { name: "boss:warn", keyed: true, classification: "sfx", priority: 78, program: "boss-warn" },
  { name: "enemy:destroy-large", classification: "sfx", priority: 80, program: "destroy-large" },
  // A boss's wing sounds like a large enemy going.
  { name: "enemy:destroy-wing", classification: "sfx", priority: 80, program: "destroy-large" },
  { name: "enemy:destroy-middle", classification: "sfx", priority: 70, program: "destroy-middle" },
  { name: "player:release", classification: "sfx", priority: 70, program: "release" },
  { name: "formation:wiped", keyed: true, classification: "sfx", priority: 65, program: "formation" },
  { name: "enemy:laser-hit", classification: "sfx", priority: 60, program: "laser-hit" },
  { name: "player:lock", keyed: true, classification: "sfx", priority: 55, program: "lock" },
  { name: "formation:chain-break", keyed: true, classification: "sfx", priority: 50, program: "chain-break" },
  { name: "enemy:destroy-small", classification: "sfx", priority: 45, program: "destroy-small" },
  { name: "ground:bonus", keyed: true, classification: "sfx", priority: 62, program: "ground-bonus" },
  { name: "ground:reveal", keyed: true, classification: "sfx", priority: 44, program: "ground-reveal" },
  { name: "ground:destroy", classification: "sfx", priority: 40, program: "ground-destroy" },
  { name: "enemy:hit", classification: "sfx", priority: 35, program: "hit" },
  { name: "player:shot", classification: "sfx", priority: 30, program: "shot" },
  { name: "player:graze", classification: "sfx", priority: 32, program: "graze" },
  { name: "stage:section", keyed: true, classification: "sfx", priority: 20, program: "section" },
  { name: "stage:loop", keyed: true, classification: "jingle", priority: 88, program: "jingle:loop" },
  // Dozens a second under a barrage; the seed appearing on the muzzle is the cue.
  { name: "enemy:fire", classification: "none", priority: 0 },
  // As frequent as firing, and it would mask the sounds that matter more.
  { name: "bullet:split", classification: "none", priority: 0 },
  // The chain breaking is the sound of this; the formation being written off
  // afterwards adds nothing.
  { name: "formation:lost", classification: "none", priority: 0 },
  // A boss's body going is heard as boss:destroy, on the same frame.
  { name: "enemy:destroy-midboss", classification: "none", priority: 0 },
  { name: "enemy:destroy-bigboss", classification: "none", priority: 0 },
  // It goes without a sound of its own: boss:warn said so three seconds
  // before, and the next sector's cue follows.
  { name: "boss:left", classification: "none", priority: 0 },
  // The boss's own music starts as it arrives; an alarm over it is one sound
  // too many (author's decision, 2026-10-11).
  { name: "boss:arrive", classification: "none", priority: 0 },
].map(Object.freeze));

// A sim event -> the kit's name for it, and how it bends the program.
// transpose is in semitones and applies to the pitched voices.
// Things that climb (locks held, the chain) go up the five-note minor scale,
// not by semitones: every step is a note of the tune's key.
const SCALE = [0, 3, 5, 7, 10];
export const scaleStep = (n) => 12 * Math.floor(n / SCALE.length) + SCALE[n % SCALE.length];
const SIM_EVENTS = Object.freeze({
  shot: () => ({ name: "player:shot" }),
  hit: () => ({ name: "enemy:hit" }),
  destroy: (e) => ({ name: `enemy:destroy-${e.kind}` }),
  lock: (e) => ({ name: "player:lock", transpose: scaleStep(Math.min(e.count, 4) - 1) }),
  release: () => ({ name: "player:release" }),
  "laser-hit": () => ({ name: "enemy:laser-hit" }),
  // Two octaves of the scale, then it stays at the top.
  formation: (e) => ({ name: "formation:wiped", transpose: scaleStep(Math.min(Math.max(e.chain, 1), 11) - 1) }),
  "chain-break": () => ({ name: "formation:chain-break" }),
  miss: () => ({ name: "player:miss" }),
  // The first sector of a new loop has a jingle of its own.
  section: (e) => ({ name: e.number > 1 && (e.number - 1) % 10 === 0 ? "stage:loop" : "stage:section" }),
  extend: () => ({ name: "player:extend" }),
  fire: () => ({ name: "enemy:fire" }),
  split: () => ({ name: "bullet:split" }),
  "formation-lost": () => ({ name: "formation:lost" }),
  // A shot on a core that is still standing sounds like any hit that does not kill.
  "ground-hit": () => ({ name: "enemy:hit" }),
  "ground-destroy": () => ({ name: "ground:destroy" }),
  "ground-bonus": () => ({ name: "ground:bonus" }),
  "ground-reveal": () => ({ name: "ground:reveal" }),
  boss: () => ({ name: "boss:arrive" }),
  "boss-destroy": () => ({ name: "boss:destroy" }),
  "boss-warn": () => ({ name: "boss:warn" }),
  "boss-left": () => ({ name: "boss:left" }),
  "boss-open": () => ({ name: "boss:open" }),
  graze: () => ({ name: "player:graze" }),
});

export const SIM_EVENT_TYPES = Object.freeze(Object.keys(SIM_EVENTS));

export function fromSimEvent(event) {
  const map = SIM_EVENTS[event.type];
  return map ? map(event) : null;
}

export const programDuration = (p) => Math.max(...p.steps.map((s) => s.offset + s.duration));

// The music's channels, for the manifest.
export const MUSIC_PROFILE = Object.freeze({ id: "famicom-five-channel", voiceLimit: 5 });
const FPS = 60;
function cueManifest(cue) {
  const steps = [];
  for (const id of ["p1", "p2"]) for (const e of cue.channels[id]) steps.push({ offset: e.frame / FPS, duration: e.steps.length / FPS, voice: `music-${id}` });
  for (const e of cue.channels.tri) steps.push({ offset: e.frame / FPS, duration: Math.min(e.frames, cue.frames - e.frame) / FPS, voice: "music-tri" });
  for (const e of cue.channels.noise) steps.push({ offset: e.frame / FPS, duration: Math.min(e.steps.length, cue.frames - e.frame) / FPS, voice: "music-noise" });
  // (A sample's length is the kick's or the snare's; a frame short of the
  // next hit at the least.)
  for (const e of cue.channels.dpcm) steps.push({ offset: e.frame / FPS, duration: Math.min(4, cue.frames - e.frame) / FPS, voice: "music-dpcm" });
  // Whole frames, written so that a note ending on a frame and the next one
  // starting on it do not appear to overlap by a rounding error.
  const exact = (v) => Number(v.toFixed(6));
  return { id: cue.id, durationSeconds: exact(cue.frames / FPS), loopStartSeconds: exact(cue.loopFrame / FPS), loopEndSeconds: exact(cue.frames / FPS), steps: steps.map((st) => ({ offset: exact(st.offset), duration: exact(st.duration - 1e-4), voice: st.voice })) };
}

// The kit as the generic manifest the audio validator reads. Derived from the
// data above, never written by hand.
export function manifest() {
  const programs = {};
  for (const [id, p] of Object.entries(PROGRAMS)) {
    programs[id] = { id: p.id, kind: p.kind, steps: p.steps.map((s) => ({ offset: s.offset, duration: s.duration, voice: s.voice })) };
  }
  const aliases = {};
  for (const e of EVENTS) if (e.program) aliases[e.name] = { kind: "program", id: e.program };
  return {
    version: 1,
    audioMode: "active",
    // Two sound sources side by side: the effects' four voices and the music's
    // five channels.
    hardwareProfile: { id: `${PROFILE.id}+${MUSIC_PROFILE.id}`, fidelity: PROFILE.fidelity, voiceLimit: PROFILE.voiceLimit + MUSIC_PROFILE.voiceLimit, primitives: [...PROFILE.primitives, "dpcm"] },
    budgets: { ...BUDGETS, bgmLoopMaxDurationSeconds: 48, bgmLoopMaxTailSeconds: 0 },
    programs,
    aliases: { ...aliases, ...Object.fromEntries(Object.keys(CUES).map((id) => [`music:${id}`, { kind: "cue", id }])) },
    events: [...EVENTS.map((e) => ({ name: e.name, classification: e.classification, priority: e.priority })), ...Object.keys(CUES).map((id) => ({ name: `music:${id}`, classification: "bgm", priority: 1 }))],
    bgmCues: Object.fromEntries(Object.values(CUES).map((cue) => [cue.id, cueManifest(cue)])),
  };
}
