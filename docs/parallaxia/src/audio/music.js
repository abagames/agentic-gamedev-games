// Background music as plain data, written for the sound channels of a
// Famicom: two pulse channels, a triangle, a noise channel and a delta-coded
// sample channel (DPCM). Nothing here plays anything; musicplayer.js turns a
// compiled cue into sound.
//
// It is Famicom-inspired, not an emulation, but the limits that give that
// machine its sound are kept:
//   - every pitch is a whole timer period, so two channels on "the same" note
//     can be set one or two periods apart and beat against each other
//   - pulse: three duty cycles, sixteen volume steps, one note at a time
//   - triangle: one fixed volume, on or off. Its steps put a faint whine a
//     long way above the note, and the lower the note the more the whine is
//     what is heard; so the bass lines stay at or above the c two octaves
//     below middle c (c2), as that machine's bass lines mostly do
//   - noise: sixteen pitches, sixteen volume steps
//   - DPCM: one-bit delta samples through a seven-bit converter, one at a time
//   - nothing changes more often than once a frame (60 a second)
//
// A cue is a list of patterns, a pattern a set of tracks, a track a row of
// tokens, one per sixteenth note:
//   pitched   "a4" "c#5" (a note), "-" (carry on), "." (silence)
//   noise     "h" closed hat, "o" open hat, "s" snare, "c" crash, "." nothing
//   dpcm      "k" kick, "s" snare, "." nothing
// How a pitched track sounds is set beside it:
//   duty      0, 1, 2 (12.5%, 25%, 50%), or a list to step through every frame
//   vol       0 to 15
//   env       "hold", or "pluck": it drops a step every `fall` frames to `floor`
//   gate      frames a note sounds before it is cut (0: until the next token)
//   arp       semitones to step through every frame: a chord on one channel
// The second pulse may be a copy of the first instead of a line of its own:
//   { from: "p1", detune: 2 }           the same notes two periods flat: the
//                                       two beat, and the sound spreads
//   { from: "p1", detuneRatio: 0.02 }   flat by a share of the period, for a
//                                       low line that jumps octaves
//   { from: "p1", delay: 2, vol: -4 }   the same notes two frames late and
//                                       quieter: a doubling, like a chorus
//   { from: "p1", delay: 15, vol: -6 }  later still: an echo
//   transpose: 12                        an octave up

import { BOSS, SECTION } from "../sim/constants.js";

export const NES = Object.freeze({ cpu: 1789773, fps: 60 });
export const DUTIES = Object.freeze([0.125, 0.25, 0.5]);
export const NOISE_PERIODS = Object.freeze([4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]);
export const ROWS_PER_PATTERN = 32;

const SEMITONES = { c: 0, "c#": 1, d: 2, "d#": 3, e: 4, f: 5, "f#": 6, g: 7, "g#": 8, a: 9, "a#": 10, b: 11 };
// "a4" -> semitones above c0.
export function noteNumber(token) {
  const m = /^([a-g]#?)(\d)$/.exec(token);
  if (!m) throw new Error(`music: '${token}' is not a note`);
  return SEMITONES[m[1]] + 12 * Number(m[2]);
}
const hz = (n) => 16.351597831287414 * 2 ** (n / 12);
// The timer period a channel is set to for a pitch, and the pitch that gives.
export const pulsePeriod = (n) => Math.max(8, Math.min(2047, Math.round(NES.cpu / (16 * hz(n)) - 1)));
export const pulseHz = (period) => NES.cpu / (16 * (period + 1));
export const trianglePeriod = (n) => Math.max(2, Math.min(2047, Math.round(NES.cpu / (32 * hz(n)) - 1)));
export const triangleHz = (period) => NES.cpu / (32 * (period + 1));

// What the noise channel plays: [period index, volume, frames, frames a step down].
const NOISE_HITS = Object.freeze({ h: [1, 6, 2, 1], o: [2, 7, 9, 2], s: [5, 12, 7, 1], c: [3, 10, 22, 2] });

const rows = (text) => text.trim().split(/\s+/);
const bars = (...list) => list.join(" ");
const times = (text, n) => Array.from({ length: n }, () => text).join(" ");

// --- The cues ---------------------------------------------------------------
// Each scene takes a kind of electronic dance music that suits it. All are
// written to drive: a bass on every part of the beat that the kick leaves
// free, and drums throughout.

const KICKS = "k . . . k . . . k . . . k . . .";
const HATS_OFF = ". . h . s . h . . . h . s . h .";
const HATS_16 = "h h h h s h h h h h h h s h o h";

// Sectors, first tune: trance, A minor, 150 beats a minute. A rolling bass
// under the kick, an arpeggio to open, a hook doubled a hair late, and then
// the same hook with the two pulses a shade apart, where it opens out.
function stageA() {
  const gallop = (r, R) => `. ${r} ${r} ${r} . ${r} ${r} ${r} . ${r} ${r} ${r} . ${r} ${r} ${R}`;
  const bass = { AmF: bars(gallop("a2", "a3"), gallop("f2", "f3")), CG: bars(gallop("c3", "c4"), gallop("g2", "g3")) };
  const arp = { AmF: bars(times("a3 e4 a4 e4", 4), times("f3 c4 f4 c4", 4)), CG: bars(times("c4 g4 c5 g4", 4), times("g3 d4 g4 d4", 4)) };
  const hook1 = {
    AmF: bars("e5 . e5 d5 . c5 . a4 . a4 c5 . d5 . e5 .", "f5 . f5 e5 . c5 . a4 . a4 c5 . e5 . d5 ."),
    CG: bars("g5 . g5 e5 . c5 . g4 . g4 c5 . e5 . g5 .", "d5 . d5 b4 . g4 . d5 . b4 d5 . e5 . d5 ."),
  };
  const hook2 = {
    AmF: bars("a5 . a5 g5 . e5 . c5 . c5 e5 . g5 . a5 .", "a5 . a5 f5 . c5 . a4 . c5 f5 . a5 . g5 ."),
    CG: bars("g5 . g5 e5 . c5 . e5 . e5 g5 . c6 . b5 .", "b5 . b5 g5 . d5 . g5 . g5 a5 . b5 . d6 ."),
  };
  const pad = { AmF: bars("a4 - - - - - - - e5 - - - - - - -", "a4 - - - - - - - f5 - - - - - - -"), CG: bars("g4 - - - - - - - e5 - - - - - - -", "g4 - - - - - - - d5 - - - b4 - - -") };
  const drone = { AmF: bars("a2 - - - - - - - - - - - - - - -", "f2 - - - - - - - - - - - - - - -"), CG: bars("c3 - - - - - - - - - - - - - - -", "g2 - - - - - - - - - - - g2 g2 g2 g2") };
  const tri = { gate: 4 };
  const intro = (k) => ({ p1: { notes: arp[k], duty: 0, vol: 8, env: "pluck", fall: 2, floor: 3 }, p2: { from: "p1", delay: 9, vol: -4 }, tri: { notes: bass[k], ...tri }, noise: bars(". . h . . . h . . . h . . . h .", ". . h . . . h . . . h . . . h o"), dpcm: bars(KICKS, KICKS) });
  const verse = (k) => ({ p1: { notes: hook1[k], duty: 1, vol: 11, env: "pluck", fall: 3, floor: 6 }, p2: { from: "p1", delay: 2, vol: -4 }, tri: { notes: bass[k], ...tri }, noise: bars(HATS_OFF, HATS_OFF), dpcm: bars(KICKS, KICKS) });
  const lift = (k, hook) => ({ p1: { notes: hook[k], duty: 2, vol: 12, env: "pluck", fall: 4, floor: 8 }, p2: { from: "p1", detune: 2 }, tri: { notes: bass[k], ...tri }, noise: bars(HATS_16, HATS_16), dpcm: bars(KICKS, k === "CG" ? "k . . . k . . . k . . . k . s s" : KICKS) });
  const breakdown = (k) => ({ p1: { notes: pad[k], duty: 1, vol: 9, env: "hold", arp: [0, 0, 7, 7, 12, 12] }, p2: { from: "p1", detune: 1 }, tri: { notes: drone[k] }, noise: bars(". . . . . . h . . . . . . . h .", k === "CG" ? ". . . . . . h . s . s . s s s s" : ". . . . . . h . . . . . . . h ."), dpcm: bars(times(".", 16), k === "CG" ? ". . . . . . . . k . k . k k k k" : times(".", 16)) });
  return {
    id: "stage-a",
    key: 0,
    genre: "trance",
    speed: [6],
    patterns: { i1: intro("AmF"), i2: intro("CG"), a1: verse("AmF"), a2: verse("CG"), b1: lift("AmF", hook1), b2: lift("CG", hook1), c1: lift("AmF", hook2), c2: lift("CG", hook2), k1: breakdown("AmF"), k2: breakdown("CG") },
    order: ["i1", "i2", "a1", "a2", "a1", "a2", "b1", "b2", "c1", "c2", "k1", "k2", "c1", "c2", "b1", "b2"],
    // Where it comes back to: after the introduction.
    loopTo: 2,
  };
}

// Sectors, second tune: drum and bass, D minor, 180 beats a minute. A broken
// beat on the sample channel, a rolling triangle, chords stabbed on one pulse
// with the other answering late; then a long line with the pulses a shade
// apart over the same beat.
function stageB() {
  const beat = "k . . . s . . . . . k . s . . .";
  const fill = "k . . . s . . . . . k . s s s s";
  const hats = "h . h . . . h . h . h . . . h o";
  const roll = { Dm: "d3 - - d3 . d3 - . f3 - . d3 . c3 d3 .", Bb: "a#2 - - a#2 . a#2 - . d3 - . a#2 . a2 a#2 .", C: "c3 - - c3 . c3 - . e3 - . c3 . g2 c3 ." };
  const stab = { Dm: ". . . d4 . . d4 . . . . d4 . . . .", Bb: ". . . a#3 . . a#3 . . . . a#3 . . . .", C: ". . . c4 . . c4 . . . . c4 . . e4 ." };
  const line = { Dm1: "a4 - - - - - f4 - a4 - - - d5 - - -", Dm2: "c5 - - - - - a4 - g4 - - - f4 - e4 -", Bb: "d5 - - - - - a#4 - d5 - - - f5 - - -", C: "e5 - - - - - c5 - g4 - - - e5 - g5 -" };
  const minor = [0, 3, 7, 12];
  const major = [0, 4, 7, 12];
  const stabs = (a, b, arp, end) => ({ p1: { notes: bars(stab[a], stab[b]), duty: 1, vol: 11, env: "pluck", fall: 2, floor: 2, gate: 9, arp }, p2: { from: "p1", delay: 15, vol: -6 }, tri: { notes: bars(roll[a], roll[b]) }, noise: bars(hats, hats), dpcm: bars(beat, end ? fill : beat) });
  const lead = (a, b, ra, rb, end) => ({ p1: { notes: bars(line[a], line[b]), duty: 2, vol: 12, env: "hold" }, p2: { from: "p1", detune: 2 }, tri: { notes: bars(roll[ra], roll[rb]) }, noise: bars(hats, hats), dpcm: bars(beat, end ? fill : beat) });
  return {
    id: "stage-b",
    key: 5,
    genre: "drum and bass",
    speed: [5],
    patterns: {
      i1: { tri: { notes: bars(roll.Dm, roll.Dm) }, noise: bars(hats, hats), dpcm: bars(times(".", 16), "k . . . . . . . . . k . s . s s") },
      a1: stabs("Dm", "Dm", minor, false),
      a2: { ...stabs("Bb", "C", major, true) },
      b1: lead("Dm1", "Dm2", "Dm", "Dm", false),
      b2: lead("Bb", "C", "Bb", "C", true),
    },
    order: ["i1", "a1", "a2", "a1", "a2", "b1", "b2", "b1", "b2"],
    loopTo: 1,
  };
}

// Sectors, third tune: acid techno, E phrygian, about 138 beats a minute with
// a slight shuffle (rows of seven and six frames turn about). One line of
// sixteenths on a pulse whose duty cycle is stepped every frame, the way a
// filter is opened and closed; the other pulse trails it, then sits a shade
// off it, then doubles it an octave up.
function stageC() {
  const line = [
    "e2 e2 e3 e2 g2 e2 e3 f2 e2 e2 d3 e2 g2 e3 f2 e2",
    "e2 e3 e2 e2 a2 e2 g2 f2 e2 e3 e2 b2 a2 g2 f2 e2",
    "e2 e2 e3 e3 g2 e2 b2 e2 e3 e2 d3 e2 f2 e3 f2 d2",
    "e2 g2 e3 e2 a2 e3 g2 e2 b2 e3 a2 g2 f2 e2 d2 f2",
  ];
  const sub = ". . e2 - . . e2 - . . e2 - . . e2 -";
  const open = ". . o . s . o . . . o . s . o .";
  const busy = "h h o h s h o h h h o h s h o h";
  const acid = { duty: [0, 0, 1, 1, 2, 2, 1, 1], vol: 12, env: "pluck", fall: 2, floor: 5, gate: 5 };
  const part = (a, b, p2, noise, tri) => ({ p1: { notes: bars(line[a], line[b]), ...acid }, p2, tri: tri ? { notes: bars(sub, sub) } : undefined, noise: bars(noise, noise), dpcm: bars(KICKS, b === 3 ? "k . . . k . . . k . . . k . k k" : KICKS) });
  return {
    id: "stage-c",
    key: -5,
    genre: "acid techno",
    speed: [7, 6],
    patterns: {
      i1: { p1: { notes: bars(line[0], line[1]), ...acid, vol: 8, floor: 3 }, noise: bars(times(".", 16), ". . . . . . . . . . . . s . s s"), dpcm: bars(KICKS, KICKS) },
      a1: part(0, 1, { from: "p1", delay: 3, vol: -4 }, open, true),
      a2: part(2, 3, { from: "p1", delay: 3, vol: -4 }, open, true),
      // (Down here a period is a small step, and the line jumps octaves: the
      // second pulse is set flat by a share of each note's period instead.)
      b1: part(0, 1, { from: "p1", detuneRatio: 0.02 }, open, true),
      b2: part(2, 3, { from: "p1", detuneRatio: 0.02 }, busy, true),
      c1: part(0, 1, { from: "p1", transpose: 12, delay: 1, vol: -3 }, busy, true),
      c2: part(2, 3, { from: "p1", transpose: 12, delay: 1, vol: -3 }, busy, true),
    },
    order: ["i1", "a1", "a2", "b1", "b2", "c1", "c2", "b1", "b2"],
    loopTo: 1,
  };
}

// A boss: hard techno, C minor leaning on its flat second, about 164 beats a
// minute. A triangle hammering sixteenths, a kick on every beat, a two-note
// alarm with the pulses far enough apart to grind, and a line over the top.
function boss() {
  const drive = ["c2 c2 c3 c2 c2 c2 c3 c2 c2 c2 c3 c2 c#2 c#2 c#3 c#2", "c2 c2 c3 c2 c2 c2 c3 c2 d#2 d#2 d#3 d#2 c#2 c#2 c#3 c#2"];
  const kicks = ["k . . . k . . . k . . . k . . .", "k . . . k . . . k . . . k . k k"];
  const hats = "h h o h s h o h h h o h s h o h";
  const siren = "g5 - - - f#5 - - - g5 - - - f#5 - - -";
  const stab = "c4 . . c4 . . c4 . . . c4 . c4 . . .";
  const line = ["c5 - d#5 - g5 - - f5 - d#5 - d5 - c5 - a#4", "c5 - d#5 - g5 - - g#5 - g5 - f5 - d#5 - d5"];
  const tri = { notes: bars(drive[0], drive[1]), gate: 4 };
  const base = { tri, noise: bars(hats, hats), dpcm: bars(kicks[0], kicks[1]) };
  return {
    id: "boss",
    key: 3,
    genre: "hard techno",
    speed: [6, 5],
    patterns: {
      s1: { ...base, p1: { notes: bars(siren, siren), duty: 1, vol: 11, env: "hold" }, p2: { from: "p1", detune: 4 } },
      x1: { ...base, p1: { notes: bars(stab, stab), duty: 0, vol: 12, env: "pluck", fall: 2, floor: 3, gate: 8, arp: [0, 3, 6, 9] }, p2: { from: "p1", delay: 11, vol: -5 } },
      l1: { ...base, p1: { notes: bars(line[0], line[1]), duty: 2, vol: 12, env: "pluck", fall: 5, floor: 8 }, p2: { from: "p1", detune: 2 } },
    },
    // No introduction: a boss is over in ten seconds or so, and the line with
    // the pulses a shade apart is what should be heard in them. The alarm
    // comes last, for a fight that goes on.
    order: ["l1", "l1", "x1", "x1", "l1", "l1", "s1", "s1"],
    loopTo: 0,
  };
}

// The title: ambient techno, A minor, about 112 beats a minute. Long notes
// with the two pulses one period apart, so that they beat slowly; a low
// triangle; a broken kick that comes in half way.
function title() {
  const pad = {
    Am: "e4 - - - - - - - - - - - a4 - - - c5 - - - - - - - b4 - - - - - - -",
    Em: "g4 - - - - - - - - - - - b4 - - - e5 - - - - - - - d5 - - - - - - -",
    F: "a4 - - - - - - - - - - - c5 - - - f5 - - - - - - - e5 - - - - - - -",
    G: "b4 - - - - - - - - - - - d5 - - - g5 - - - - - - - d5 - - - b4 - - -",
  };
  const low = (r) => bars(`${r} - - - - - - - - - - - - - - -`, `${r} - - - - - - - - - ${r} - - - - -`);
  const part = (chord, r, kick) => ({ p1: { notes: pad[chord], duty: 1, vol: 9, env: "hold" }, p2: { from: "p1", detune: 1 }, tri: { notes: low(r) }, noise: bars(". . . . h . . . . . . . h . . .", ". . . . h . . . . . . . h . o ."), dpcm: kick ? bars("k . . . . . . . . . k . . . . .", "k . . . . . . . . . k . . . . .") : bars(times(".", 16), times(".", 16)) });
  return {
    id: "title",
    key: 0,
    genre: "ambient techno",
    speed: [8],
    patterns: { a1: part("Am", "a2", false), a2: part("Em", "e2", false), a3: part("F", "f2", true), a4: part("G", "g2", true) },
    order: ["a1", "a2", "a3", "a4"],
    loopTo: 0,
  };
}

// The run is over: a slow fall through A minor with the pulses a period
// apart, and then one low chord held and beating, with a heartbeat of a kick
// under it, for as long as the screen stays.
function over() {
  const fall = "e5 - - - - - - - d5 - - - - - - - c5 - - - - - - - a4 - - - - - - -";
  const rest = "a4 - - - - - - - - - - - - - - - e4 - - - - - - - - - - - - - - -";
  const low = (r) => bars(`${r} - - - - - - - - - - - - - - -`, `${r} - - - - - - - - - - - - - - -`);
  const part = (notes, r, kick) => ({ p1: { notes, duty: 1, vol: 8, env: "hold" }, p2: { from: "p1", detune: 1 }, tri: { notes: low(r) }, noise: bars(times(".", 16), ". . . . . . . . . . . . h . . ."), dpcm: kick ? bars("k . . . . . . . . . . . . . . .", times(".", 16)) : bars(times(".", 16), times(".", 16)) });
  return { id: "over", key: 0, genre: "ambient", speed: [9], patterns: { o1: part(fall, "a2", false), o2: part(rest, "f2", true), o3: part(rest, "e2", true) }, order: ["o1", "o2", "o3"], loopTo: 1 };
}

export const SONGS = Object.freeze(Object.fromEntries([stageA(), stageB(), stageC(), boss(), title(), over()].map((s) => [s.id, s])));

// How far a cue's key is from A, in semitones (the nearer way round). The
// effects that have a pitch of their own are written in A and moved by this,
// so that they sound in the key of whatever is playing (kit.js, `keyed`).
export const keyOf = (id) => (SONGS[id] ? SONGS[id].key : 0);

// Which cue a moment of the game calls for. The three sector tunes take the
// loops in turn.
export const STAGE_CUES = Object.freeze(["stage-a", "stage-b", "stage-c"]);
// Which loop's tune a sector (0-based) calls for. bossHere: its boss is still
// there. Once a boss is gone, what follows is the next sector's tune: the
// sector number has not moved on yet, and after a loop's last boss the tune
// of the loop just finished would otherwise start up again for a moment.
export function loopForMusic(section, bossHere) {
  const at = Math.max(section, 0);
  const bossGone = !bossHere && BOSS.sections[at % SECTION.perLoop] !== undefined;
  return Math.floor((at + (bossGone ? 1 : 0)) / SECTION.perLoop);
}
// Whether a sector's boss has the boss tune. Only a loop's last boss does:
// the middle boss is met with the sector's tune still going (author's
// decision, 2026-10-11; there is no tune of its own for it).
export const bossTuneAt = (section, bossHere) => bossHere && BOSS.sections[Math.max(section, 0) % SECTION.perLoop] === "bigboss";
// boss: a boss that has the boss tune is here (bossTuneAt).
export function cueFor({ title: onTitle, playing, boss: bossHere, loop }) {
  if (onTitle) return "title";
  if (!playing) return "over";
  if (bossHere) return "boss";
  return STAGE_CUES[loop % STAGE_CUES.length];
}

// --- Compiling a cue into what each channel does, frame by frame --------------

// The frame each row of the cue starts on, and the length of the cue.
function rowFrames(song) {
  const starts = [];
  let frame = 0;
  for (let i = 0; i < song.order.length * ROWS_PER_PATTERN; i++) {
    starts.push(frame);
    frame += song.speed[i % song.speed.length];
  }
  return { starts, total: frame };
}

// A pitched track's notes: [{ frame, frames, note }].
function notesOf(track, at, startOf, total) {
  const tokens = rows(track.notes);
  if (tokens.length !== ROWS_PER_PATTERN) throw new Error(`music: a track has ${tokens.length} rows, not ${ROWS_PER_PATTERN}`);
  const out = [];
  let open = null;
  const rowEnd = (row) => (at + row + 1 < startOf.length ? startOf[at + row + 1] : total);
  tokens.forEach((token, row) => {
    if (token === "-") {
      if (open) open.frames = rowEnd(row) - open.frame;
      return;
    }
    open = null;
    if (token === ".") return;
    open = { frame: startOf[at + row], frames: rowEnd(row) - startOf[at + row], note: noteNumber(token) };
    out.push(open);
  });
  if (track.gate) for (const n of out) n.frames = Math.min(n.frames, track.gate);
  return out;
}

// What a pulse channel does on each frame of a note: [period, volume, duty].
function pulseFrames(note, track, { detune = 0, detuneRatio = 0, transpose = 0, volume = 0 } = {}) {
  const frames = [];
  for (let k = 0; k < note.frames; k++) {
    const arp = track.arp ? track.arp[k % track.arp.length] : 0;
    const base = track.vol ?? 10;
    const vol = track.env === "pluck" ? Math.max(track.floor ?? 0, base - Math.floor(k / (track.fall ?? 2))) : base;
    const duty = Array.isArray(track.duty) ? track.duty[k % track.duty.length] : (track.duty ?? 1);
    const period = pulsePeriod(note.note + arp + transpose);
    frames.push([Math.min(2047, period + detune + (detuneRatio ? Math.max(1, Math.round(period * detuneRatio)) : 0)), Math.max(0, Math.min(15, vol + volume)), duty]);
  }
  return frames;
}

// A cue as events per channel. Every frame number is within the cue; the
// cue's loop (from `loopFrame`) is the player's business.
//   p1, p2: { frame, steps: [[period, vol, duty], ...] }  one step a frame
//   tri:    { frame, frames, period }
//   noise:  { frame, period, steps: [vol, ...] }
//   dpcm:   { frame, sample }
export function compile(song) {
  const { starts, total } = rowFrames(song);
  // beatFrames: the length of a beat (four rows), for changing cue in time.
  const cue = { id: song.id, frames: total, loopFrame: starts[song.loopTo * ROWS_PER_PATTERN], beatFrames: starts[4], channels: { p1: [], p2: [], tri: [], noise: [], dpcm: [] } };
  song.order.forEach((name, index) => {
    const pattern = song.patterns[name];
    if (!pattern) throw new Error(`music: ${song.id} has no pattern '${name}'`);
    const at = index * ROWS_PER_PATTERN;
    const p1Notes = pattern.p1 ? notesOf(pattern.p1, at, starts, total) : [];
    for (const n of p1Notes) cue.channels.p1.push({ frame: n.frame, steps: pulseFrames(n, pattern.p1) });
    if (pattern.p2 && pattern.p2.from === "p1") {
      const { detune = 0, detuneRatio = 0, delay = 0, vol = 0, transpose = 0 } = pattern.p2;
      for (const n of p1Notes) cue.channels.p2.push({ frame: n.frame + delay, steps: pulseFrames(n, pattern.p1, { detune, detuneRatio, transpose, volume: vol }) });
    } else if (pattern.p2) {
      for (const n of notesOf(pattern.p2, at, starts, total)) cue.channels.p2.push({ frame: n.frame, steps: pulseFrames(n, pattern.p2) });
    }
    if (pattern.tri) for (const n of notesOf(pattern.tri, at, starts, total)) cue.channels.tri.push({ frame: n.frame, frames: n.frames, period: trianglePeriod(n.note) });
    const hits = (text, into, make) => {
      if (!text) return;
      const tokens = rows(text);
      if (tokens.length !== ROWS_PER_PATTERN) throw new Error(`music: a drum track has ${tokens.length} rows, not ${ROWS_PER_PATTERN}`);
      tokens.forEach((token, row) => {
        if (token !== ".") into.push(make(token, starts[at + row]));
      });
    };
    hits(pattern.noise, cue.channels.noise, (token, frame) => {
      const hit = NOISE_HITS[token];
      if (!hit) throw new Error(`music: no noise hit '${token}'`);
      const [period, vol, frames, fall] = hit;
      return { frame, period, steps: Array.from({ length: frames }, (_, k) => Math.max(0, vol - Math.floor(k / fall) * Math.ceil(vol / (frames / fall)))) };
    });
    hits(pattern.dpcm, cue.channels.dpcm, (token, frame) => {
      if (token !== "k" && token !== "s") throw new Error(`music: no sample '${token}'`);
      return { frame, sample: token === "k" ? "kick" : "snare" };
    });
  });
  // One thing at a time on a channel: a note is cut where the next begins,
  // and what a delay pushes past the end of the cue is dropped.
  for (const id of ["p1", "p2"]) {
    const list = cue.channels[id].filter((e) => e.frame < total).sort((a, b) => a.frame - b.frame);
    list.forEach((e, i) => {
      const room = (i + 1 < list.length ? list[i + 1].frame : total) - e.frame;
      if (e.steps.length > room) e.steps = e.steps.slice(0, room);
    });
    cue.channels[id] = list.filter((e) => e.steps.length > 0);
  }
  for (const id of ["tri", "noise"]) {
    const list = cue.channels[id].sort((x, y) => x.frame - y.frame);
    list.forEach((e, i) => {
      const room = (i + 1 < list.length ? list[i + 1].frame : total) - e.frame;
      if (e.steps) e.steps = e.steps.slice(0, room);
      else e.frames = Math.min(e.frames, room);
    });
  }
  return cue;
}

export const CUES = Object.freeze(Object.fromEntries(Object.values(SONGS).map((s) => [s.id, compile(s)])));
