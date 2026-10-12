import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as game from "../src/sim/sim.js";
import { KINDS } from "../src/sim/constants.js";
import { PROFILE, MASTER, BUDGETS, PROGRAMS, EVENTS, SIM_EVENT_TYPES, fromSimEvent, programDuration, manifest } from "../src/audio/kit.js";
import { createAudioBus, createMockAdapter } from "../src/audio/bus.js";
import { seeker } from "../tools/policies/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const byName = new Map(EVENTS.map((e) => [e.name, e]));
const plays = (adapter) => adapter.calls.filter((c) => c.op === "play").map((c) => c.id);
const frame = (bus, n, names) => {
  bus.beginFrame(n);
  for (const name of names) bus.emit(name);
  bus.endFrame();
};

test("audio: every event the sim can emit is named in the kit, as a sound or as a stated none", () => {
  const simDir = path.join(here, "..", "src", "sim");
  const types = new Set();
  for (const file of fs.readdirSync(simDir)) {
    if (file === "trace.js") continue; // a file format, not game events
    for (const m of fs.readFileSync(path.join(simDir, file), "utf8").matchAll(/events\.push\(\{ type: "([a-z-]+)"/g)) types.add(m[1]);
  }
  assert.ok(types.size >= 10, `found only ${[...types]}`);
  for (const type of types) assert.ok(SIM_EVENT_TYPES.includes(type), `sim event "${type}" has no entry in the kit`);
  for (const type of SIM_EVENT_TYPES) assert.ok(types.has(type), `the kit maps "${type}", which the sim never emits`);
  for (const kind of Object.keys(KINDS)) assert.ok(byName.has(fromSimEvent({ type: "destroy", kind }).name), `destroy ${kind}`);
  for (const type of SIM_EVENT_TYPES) {
    if (type === "destroy") continue;
    assert.ok(byName.has(fromSimEvent({ type, count: 1, chain: 1 }).name), type);
  }
});

test("audio: every audible event resolves to a program, and every program is used", () => {
  const used = new Set();
  for (const e of EVENTS) {
    if (e.classification === "none") {
      assert.equal(e.program, undefined, e.name);
      assert.equal(e.priority, 0, e.name);
      continue;
    }
    assert.ok(PROGRAMS[e.program], `${e.name} -> ${e.program}`);
    assert.equal(PROGRAMS[e.program].kind, e.classification, e.name);
    used.add(e.program);
  }
  for (const id of Object.keys(PROGRAMS)) assert.ok(used.has(id), `program ${id} is never played`);
  assert.equal(new Set(EVENTS.map((e) => e.name)).size, EVENTS.length);
});

test("audio: programs stay inside the profile and the budgets", () => {
  const loudest = {};
  for (const [id, p] of Object.entries(PROGRAMS)) {
    assert.equal(p.id, id);
    assert.ok(p.steps.length <= BUDGETS.maxStepsPerProgram, id);
    const cap = p.kind === "jingle" ? BUDGETS.jingleMaxDurationSeconds : BUDGETS.sfxMaxDurationSeconds;
    assert.ok(programDuration(p) <= cap + 1e-9, `${id} lasts ${programDuration(p)}`);
    for (const s of p.steps) {
      assert.ok(s.voice in PROFILE.voices, `${id}: voice ${s.voice}`);
      assert.ok(s.offset >= 0 && s.duration > 0 && s.from > 0 && s.to > 0 && s.gain > 0 && s.gain <= 1, id);
      loudest[s.voice] = Math.max(loudest[s.voice] ?? 0, s.gain);
    }
    for (const voice of Object.keys(PROFILE.voices)) {
      const mine = p.steps.filter((s) => s.voice === voice).sort((a, b) => a.offset - b.offset);
      for (let i = 1; i < mine.length; i++) assert.ok(mine[i].offset >= mine[i - 1].offset + mine[i - 1].duration - 1e-9, `${id}: notes overlap on ${voice}`);
    }
  }
  assert.equal(Object.keys(PROFILE.voices).length, PROFILE.voiceLimit);
  const worst = Object.values(loudest).reduce((a, b) => a + b, 0) * MASTER.gain;
  assert.ok(worst < 1, `every voice at its loudest sums to ${worst}`);
});

test("audio: the manifest is the kit, not a copy of it", () => {
  const m = manifest();
  assert.deepEqual(Object.keys(m.programs), Object.keys(PROGRAMS));
  // The kit's events, and one for each music cue.
  assert.equal(m.events.length, EVENTS.length + Object.keys(m.bgmCues).length);
  assert.equal(Object.keys(m.bgmCues).length, 6);
  assert.equal(m.programs.miss.steps.length, PROGRAMS.miss.steps.length);
});

test("audio bus: one of each name per frame", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  frame(bus, 1, ["enemy:destroy-small", "enemy:destroy-small", "enemy:destroy-small"]);
  assert.deepEqual(plays(adapter), ["destroy-small"]);
  assert.equal(bus.log.filter((l) => l.result === "repeat").length, 2);
});

test("audio bus: one note per voice per frame, the higher priority first", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  // All three want the noise voice; the middle-sized blast is asked for last.
  frame(bus, 1, ["enemy:destroy-small", "enemy:destroy-middle", "player:shot"]);
  assert.deepEqual(plays(adapter), ["destroy-middle", "shot"]);
  assert.equal(bus.log.find((l) => l.name === "enemy:destroy-small").result, "dropped");
});

test("audio bus: a lower priority waits for the voice, a higher one takes it", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  frame(bus, 1, ["player:release"]); // 0.2 s on pulse1
  frame(bus, 4, ["player:shot"]);
  assert.deepEqual(plays(adapter), ["release"]);
  frame(bus, 14, ["player:shot"]);
  assert.deepEqual(plays(adapter), ["release", "shot"]);
  frame(bus, 15, ["player:miss"]);
  assert.deepEqual(plays(adapter), ["release", "shot", "miss"]);
  frame(bus, 20, ["player:shot", "enemy:destroy-large", "player:lock"]);
  assert.deepEqual(plays(adapter), ["release", "shot", "miss"], "nothing talks over the miss on its own voices");
  frame(bus, 21, ["run:gameover"]);
  assert.deepEqual(plays(adapter).at(-1), "jingle:gameover", "the game-over jingle has voices of its own");
});

test("audio bus: a new run, counting its frames from 0 again, is not held up by the run before", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  frame(bus, 5000, ["player:miss", "run:gameover"]); // every voice, at the top priority
  frame(bus, 0, ["run:start"]);
  assert.deepEqual(plays(adapter), ["miss", "jingle:gameover"], "without a stop, the old run's voices still hold");
  bus.stopAll(); // what the page does when it makes a new sim
  frame(bus, 0, ["run:start"]);
  frame(bus, 100, ["player:shot", "enemy:destroy-small", "formation:wiped"]);
  assert.deepEqual(plays(adapter).slice(2), ["jingle:start", "formation", "destroy-small", "shot"]);
});

test("audio bus: the extend jingle wins over the formation bonus that caused it", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  bus.beginFrame(1);
  bus.emitSimEvents([{ type: "formation", chain: 3, bonus: 1500 }, { type: "extend" }]);
  bus.endFrame();
  assert.deepEqual(plays(adapter), ["jingle:extend"]);
});

test("audio bus: sim events carry their pitch", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  bus.beginFrame(1);
  bus.emitSimEvents([{ type: "formation", chain: 40 }, { type: "lock", count: 3 }, { type: "fire" }, { type: "split" }]);
  bus.endFrame();
  // Up the five-note minor scale: the chain stops two octaves up (its 11th
  // step), the third lock is the scale's third note.
  assert.deepEqual(adapter.calls.filter((c) => c.op === "play").map((c) => [c.id, c.transpose]), [["formation", 24], ["lock", 5]]);
});

test("audio bus: a sound with a pitch of its own moves to the key of the music playing; the others do not", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  const played = () => adapter.calls.filter((c) => c.op === "play").map((c) => [c.id, c.transpose]);
  bus.setMusic("stage-b"); // D minor: five semitones above A
  bus.beginFrame(1);
  bus.emitSimEvents([{ type: "lock", count: 1 }, { type: "destroy", kind: "small" }]);
  bus.endFrame();
  assert.deepEqual(played(), [["lock", 5], ["destroy-small", 0]]);
  bus.setMusic("boss"); // C minor: three above
  bus.beginFrame(2);
  bus.emitSimEvents([{ type: "formation", chain: 1 }]);
  bus.endFrame();
  assert.deepEqual(played().at(-1), ["formation", 3]);
  bus.setMusic("");
  bus.beginFrame(3);
  bus.emitSimEvents([{ type: "lock", count: 1 }]);
  bus.endFrame();
  assert.deepEqual(played().at(-1), ["lock", 0]);
});

test("audio bus: mute and a hidden page silence it, and nothing is replayed afterwards", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  bus.setMuted(true);
  frame(bus, 1, ["player:shot"]);
  assert.deepEqual(plays(adapter), []);
  bus.setMuted(false);
  bus.setHostVisible(false);
  bus.setHostVisible(false);
  frame(bus, 2, ["player:shot", "player:miss"]);
  assert.deepEqual(plays(adapter), []);
  assert.equal(adapter.calls.filter((c) => c.op === "suspend").length, 1, "hidden twice suspends once");
  bus.setHostVisible(true);
  bus.setHostVisible(true);
  assert.equal(adapter.calls.filter((c) => c.op === "resume").length, 1);
  assert.deepEqual(plays(adapter), [], "one-shots asked for while hidden are gone");
  frame(bus, 3, ["player:shot"]);
  assert.deepEqual(plays(adapter), ["shot"]);
  bus.setMuted(true);
  bus.setHostVisible(false);
  bus.setHostVisible(true);
  frame(bus, 4, ["player:shot"]);
  assert.deepEqual(plays(adapter), ["shot"], "coming back into view does not undo the mute");
});

test("audio bus: an unknown name is logged, not played", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter);
  frame(bus, 1, ["player:nonsense"]);
  assert.deepEqual(plays(adapter), []);
  assert.equal(bus.log[0].result, "unknown");
});

test("audio: a minute of real play never starts two notes on a voice in one frame", () => {
  const adapter = createMockAdapter();
  const bus = createAudioBus(adapter, { logLimit: 1e9 });
  const sim = game.createSim({ seed: 2001, mode: "rapid" }); // the mode with every sound: a chain to keep
  const decide = seeker.create({ seed: 2001, variant: 0 });
  for (let t = 0; t < 3600 && !game.isEnded(sim); t++) {
    game.stepSim(sim, decide(game.observe(sim), t));
    bus.beginFrame(sim.frame);
    bus.emitSimEvents(sim.events);
    bus.endFrame();
  }
  const played = bus.log.filter((l) => l.result === "played");
  const perFrame = new Map();
  for (const l of played) {
    for (const v of l.voices) {
      const key = `${l.frame}:${v}`;
      assert.ok(!perFrame.has(key), `two notes on ${v} in frame ${l.frame}`);
      perFrame.set(key, true);
    }
  }
  assert.equal(bus.log.filter((l) => l.result === "unknown").length, 0);
  const names = new Set(played.map((l) => l.name));
  for (const name of ["player:shot", "enemy:destroy-small", "formation:wiped", "stage:section"]) assert.ok(names.has(name), `${name} was never heard`);
  assert.ok(bus.log.some((l) => l.result === "dropped"), "arbitration never had to drop anything, which a minute of play should");
});
