// The background music as data: what each cue is made of, that it keeps to
// the channels' limits, and that the bus starts and stops it when it should.

import test from "node:test";
import assert from "node:assert/strict";
import { CUES, SONGS, STAGE_CUES, bossTuneAt, compile, cueFor, loopForMusic, pulseHz, pulsePeriod, noteNumber, NOISE_PERIODS } from "../src/audio/music.js";
import { createAudioBus, createMockAdapter } from "../src/audio/bus.js";
import { triangleHarmonics } from "../src/audio/musicplayer.js";

const ids = Object.keys(CUES);

test("music: six cues, one for each scene, each a different kind of electronic music", () => {
  assert.deepEqual(ids.sort(), ["boss", "over", "stage-a", "stage-b", "stage-c", "title"]);
  assert.equal(new Set(Object.values(SONGS).map((s) => s.genre)).size, 6);
  assert.deepEqual([...STAGE_CUES], ["stage-a", "stage-b", "stage-c"]);
});

test("music: the scene picks the cue", () => {
  assert.equal(cueFor({ title: true, playing: false, boss: false, loop: 0 }), "title");
  assert.equal(cueFor({ title: false, playing: true, boss: false, loop: 0 }), "stage-a");
  assert.equal(cueFor({ title: false, playing: true, boss: false, loop: 1 }), "stage-b");
  assert.equal(cueFor({ title: false, playing: true, boss: false, loop: 2 }), "stage-c");
  assert.equal(cueFor({ title: false, playing: true, boss: false, loop: 3 }), "stage-a");
  assert.equal(cueFor({ title: false, playing: true, boss: true, loop: 1 }), "boss");
  assert.equal(cueFor({ title: false, playing: false, boss: false, loop: 1 }), "over");
});

test("music: compiling a cue twice gives the same cue", () => {
  for (const song of Object.values(SONGS)) assert.equal(JSON.stringify(compile(song)), JSON.stringify(CUES[song.id]));
});

test("music: every channel sounds one thing at a time, inside the cue, within the machine's ranges", () => {
  for (const cue of Object.values(CUES)) {
    for (const id of ["p1", "p2"]) {
      let end = 0;
      for (const e of cue.channels[id]) {
        assert.ok(e.frame >= end, `${cue.id} ${id}: a note starts at ${e.frame} before the last ends at ${end}`);
        end = e.frame + e.steps.length;
        assert.ok(end <= cue.frames, `${cue.id} ${id}: a note runs past the end`);
        for (const [period, vol, duty] of e.steps) {
          assert.ok(Number.isInteger(period) && period >= 8 && period <= 2047, `${cue.id} ${id}: period ${period}`);
          assert.ok(Number.isInteger(vol) && vol >= 0 && vol <= 15, `${cue.id} ${id}: volume ${vol}`);
          assert.ok([0, 1, 2].includes(duty), `${cue.id} ${id}: duty ${duty}`);
        }
      }
    }
    let end = 0;
    for (const e of cue.channels.tri) {
      assert.ok(e.frame >= end && e.frame + e.frames <= cue.frames, `${cue.id} tri at ${e.frame}`);
      end = e.frame + e.frames;
      assert.ok(Number.isInteger(e.period) && e.period >= 2 && e.period <= 2047);
    }
    end = 0;
    for (const e of cue.channels.noise) {
      assert.ok(e.frame >= end, `${cue.id} noise at ${e.frame}`);
      end = e.frame + e.steps.length;
      assert.ok(e.period >= 0 && e.period < NOISE_PERIODS.length && e.steps.every((v) => Number.isInteger(v) && v >= 0 && v <= 15));
    }
    for (const e of cue.channels.dpcm) assert.ok(["kick", "snare"].includes(e.sample) && e.frame < cue.frames);
    assert.ok(cue.loopFrame >= 0 && cue.loopFrame < cue.frames);
    assert.ok(cue.beatFrames >= 20 && cue.beatFrames <= 36, `${cue.id}: a beat of ${cue.beatFrames} frames`);
  }
});

test("music: every cue has a bass line and drums throughout; the fast ones have a kick on the sample channel in every bar", () => {
  for (const cue of Object.values(CUES)) {
    const sounding = cue.channels.tri.reduce((a, e) => a + e.frames, 0);
    assert.ok(sounding > cue.frames * 0.25, `${cue.id}: the triangle sounds for ${sounding} of ${cue.frames} frames`);
    assert.ok(cue.channels.noise.length > 0 && cue.channels.dpcm.length > 0, `${cue.id}: no drums`);
  }
  for (const id of ["stage-a", "stage-b", "stage-c", "boss"]) {
    const cue = CUES[id];
    const song = SONGS[id];
    const barFrames = (16 * song.speed.reduce((a, b) => a + b, 0)) / song.speed.length;
    const bars = Math.round(cue.frames / barFrames);
    let withKick = 0;
    for (let b = 0; b < bars; b++) if (cue.channels.dpcm.some((e) => e.sample === "kick" && e.frame >= b * barFrames && e.frame < (b + 1) * barFrames)) withKick++;
    assert.ok(withKick >= bars * 0.8, `${id}: a kick in ${withKick} of ${bars} bars`);
    assert.ok(3600 / ((4 * song.speed.reduce((a, b) => a + b, 0)) / song.speed.length) >= 135, `${id} is slower than 135 beats a minute`);
  }
});

// The two tricks the music is built on, as they come out of the data.
function pairs(cue) {
  const byFrame = new Map(cue.channels.p1.map((e) => [e.frame, e]));
  let detuned = 0;
  let late = 0;
  const beats = [];
  for (const e of cue.channels.p2) {
    const same = byFrame.get(e.frame);
    // (Less than half a semitone apart: one note, not two.)
    if (same && same.steps[0][0] !== e.steps[0][0] && Math.abs(same.steps[0][0] - e.steps[0][0]) / same.steps[0][0] < 0.028) {
      detuned++;
      beats.push(Math.abs(pulseHz(same.steps[0][0]) - pulseHz(e.steps[0][0])));
    }
    for (const lag of [1, 2, 3]) {
      const before = byFrame.get(e.frame - lag);
      if (before && before.steps[0][0] === e.steps[0][0] && e.steps[0][1] < before.steps[0][1]) late++;
    }
  }
  return { detuned, late, beats };
}

test("music: the two pulses in unison a period or more apart, so that they beat", () => {
  for (const id of ids) {
    const { detuned, beats } = pairs(CUES[id]);
    assert.ok(detuned >= 8, `${id}: ${detuned} detuned unisons`);
    // A few cycles a second up to a rough few dozen: heard as movement, not as two notes.
    assert.ok(Math.min(...beats) >= 0.5 && Math.max(...beats) < 30, `${id}: beating at ${Math.min(...beats).toFixed(2)} to ${Math.max(...beats).toFixed(2)} cycles a second`);
  }
});

test("music: the same line again a frame or three late and quieter, in the two sector tunes that double it", () => {
  for (const id of ["stage-a", "stage-c"]) assert.ok(pairs(CUES[id]).late >= 16, `${id}: ${pairs(CUES[id]).late} doubled notes`);
});

test("music: a period apart is the smallest step there is, and it is not the same pitch", () => {
  const a4 = pulsePeriod(noteNumber("a4"));
  assert.ok(Math.abs(pulseHz(a4) - 440) < 1.5);
  assert.notEqual(pulseHz(a4), pulseHz(a4 + 1));
});

test("music: only a loop's last boss has the boss tune; the middle boss keeps the sector's", () => {
  assert.equal(bossTuneAt(4, true), false, "the middle boss");
  assert.equal(bossTuneAt(9, true), true, "the last boss");
  assert.equal(bossTuneAt(9, false), false, "gone");
  assert.equal(bossTuneAt(14, true), false);
  assert.equal(bossTuneAt(19, true), true);
  assert.equal(cueFor({ title: false, playing: true, boss: bossTuneAt(14, true), loop: loopForMusic(14, true) }), "stage-b");
  assert.equal(cueFor({ title: false, playing: true, boss: bossTuneAt(19, true), loop: loopForMusic(19, true) }), "boss");
});

test("music: once a boss is gone the tune is the next sector's, so a finished loop's tune does not come back", () => {
  // (Sectors here count from 0: 4 and 9 are a loop's bosses.)
  assert.equal(loopForMusic(-1, false), 0);
  assert.equal(loopForMusic(3, false), 0);
  assert.equal(loopForMusic(4, true), 0);
  assert.equal(loopForMusic(4, false), 0, "after the middle boss: the same loop goes on");
  assert.equal(loopForMusic(9, true), 0);
  assert.equal(loopForMusic(9, false), 1, "after the last boss: the next loop's tune, not this loop's again");
  assert.equal(loopForMusic(10, false), 1);
  assert.equal(loopForMusic(19, false), 2);
});

test("music: the bus plays what the game asks for, and stops it when muted or hidden", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  const music = () => adapter.calls.filter((c) => c.op === "music").map((c) => c.id);
  bus.setMusic("title");
  bus.setMusic("title");
  assert.deepEqual(music(), ["title"], "asking again for the same cue does not restart it");
  bus.setMusic("stage-a");
  bus.setMuted(true);
  bus.setMuted(false);
  assert.deepEqual(music(), ["title", "stage-a", "", "stage-a"]);
  bus.setMusic("boss");
  assert.deepEqual(music().slice(4), ["boss"]);
  bus.setHostVisible(false);
  bus.setHostVisible(true);
  assert.deepEqual(music().slice(5), ["", "boss"], "back from hidden, the cue starts once");
  bus.setMusic("");
  assert.equal(music().at(-1), "");
});

test("music: the triangle is a triangle: its upper harmonics are faint, not as loud as the note", () => {
  const [real, imag] = triangleHarmonics(40);
  const size = (n) => Math.hypot(real[n], imag[n]);
  assert.ok(size(1) > 0.8, `the note itself: ${size(1)}`);
  assert.ok(size(3) < size(1) * 0.15 && size(5) < size(1) * 0.05);
  // The steps add a little at the 31st and 33rd, far below the note.
  for (const n of [29, 31, 33, 35]) assert.ok(size(n) < size(1) * 0.05, `harmonic ${n} is ${(size(n) / size(1)).toFixed(3)} of the note`);
});

test("music: no bass note is below c2 (lower, the triangle is more whine than note)", () => {
  // c2 is 65.4 cycles a second: a triangle period of 854.
  for (const cue of Object.values(CUES)) for (const e of cue.channels.tri) assert.ok(e.period <= 855, `${cue.id}: a bass note with period ${e.period}`);
});
