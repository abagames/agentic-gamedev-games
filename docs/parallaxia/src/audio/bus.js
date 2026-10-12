// The audio bus: the only thing the game talks to about sound. It takes the
// sim's events, names them through the kit, and decides which may sound:
// mute, a hidden page, one of each name per frame, and one note per voice with
// the higher priority winning. What survives goes to the adapter.
//
// It keeps a log of every decision, so a check can tell a dropped sound from
// one that was never asked for.

import { EVENTS, PROGRAMS, PROFILE, fromSimEvent } from "./kit.js";
import { keyOf } from "./music.js";

const FPS = 60;
const BY_NAME = new Map(EVENTS.map((e) => [e.name, e]));

export function createAudioBus(adapter, { logLimit = 400 } = {}) {
  const voices = Object.fromEntries(Object.keys(PROFILE.voices).map((v) => [v, { until: -1, priority: 0, started: -1 }]));
  // music: the cue the game wants; playing: what is sounding.
  const bus = { muted: false, visible: true, frame: 0, log: [], queue: [], music: "", playing: "" };
  const note = (entry) => {
    bus.log.push({ frame: bus.frame, ...entry });
    if (bus.log.length > logLimit) bus.log.shift();
  };

  // Ask for a sound by its kit name. Nothing sounds until endFrame().
  bus.emit = (name, { transpose = 0 } = {}) => {
    const event = BY_NAME.get(name);
    if (!event) return note({ name, result: "unknown" });
    if (event.classification === "none") return;
    if (bus.queue.some((q) => q.event === event)) return note({ name, result: "repeat" });
    bus.queue.push({ event, transpose });
  };

  bus.emitSimEvents = (events) => {
    for (const e of events) {
      const mapped = fromSimEvent(e);
      if (mapped) bus.emit(mapped.name, mapped);
      else note({ name: `sim:${e.type}`, result: "unknown" });
    }
  };

  bus.beginFrame = (frame) => {
    bus.frame = frame;
    bus.queue = [];
  };

  // Voices go to the highest priority first. A program needs all its voices:
  // each must be idle, or held by something of no higher priority that did not
  // start this very frame.
  bus.endFrame = () => {
    const queue = bus.queue.sort((a, b) => b.event.priority - a.event.priority);
    bus.queue = [];
    for (const { event, transpose } of queue) {
      if (bus.muted) {
        note({ name: event.name, result: "muted" });
        continue;
      }
      if (!bus.visible) {
        note({ name: event.name, result: "hidden" });
        continue;
      }
      const program = PROGRAMS[event.program];
      const needed = [...new Set(program.steps.map((s) => s.voice))];
      const blocked = needed.some((v) => {
        const voice = voices[v];
        return voice.started === bus.frame || (bus.frame < voice.until && voice.priority > event.priority);
      });
      if (blocked) {
        note({ name: event.name, result: "dropped" });
        continue;
      }
      for (const v of needed) {
        const last = Math.max(...program.steps.filter((s) => s.voice === v).map((s) => s.offset + s.duration));
        voices[v] = { until: bus.frame + Math.ceil(last * FPS), priority: event.priority, started: bus.frame };
      }
      // A sound with a pitch of its own goes to the key of the music playing.
      const shifted = transpose + (event.keyed && bus.playing ? keyOf(bus.playing) : 0);
      note({ name: event.name, result: "played", program: program.id, transpose: shifted, voices: needed });
      adapter.playProgram(program, { transpose: shifted });
    }
  };

  // The music follows what the game asks for, unless it is muted or hidden. A change of cue starts the new one from its beginning.
  const syncMusic = () => {
    const want = bus.muted || !bus.visible ? "" : bus.music;
    if (want === bus.playing) return;
    bus.playing = want;
    note({ name: `music:${want || "off"}`, result: "played" });
    adapter.playMusic?.(want);
  };
  bus.setMusic = (id) => {
    bus.music = id ?? "";
    syncMusic();
  };
  // Called every frame: keeps the music scheduled ahead of the audio clock.
  bus.pump = () => {
    if (bus.playing) adapter.pumpMusic?.();
  };

  bus.setMuted = (muted) => {
    bus.muted = Boolean(muted);
    if (bus.muted) bus.stopAll();
    syncMusic();
  };

  // The page being hidden is not a mute: it comes back by itself. There is no
  // continuous sound to restore, and one-shots asked for while hidden are gone.
  bus.setHostVisible = (visible) => {
    if (bus.visible === Boolean(visible)) return;
    bus.visible = Boolean(visible);
    if (bus.visible) adapter.resume();
    else {
      bus.stopAll();
      adapter.suspend();
    }
    // The music stops with the page and starts again, from the top of its
    // cue, when the page is back and the game still wants it.
    syncMusic();
  };

  bus.stopAll = () => {
    for (const v of Object.keys(voices)) voices[v] = { until: -1, priority: 0, started: -1 };
    adapter.stopAll();
  };

  return bus;
}

// Records what it is asked to play. For checks, and for running without sound.
export function createMockAdapter() {
  const calls = [];
  return {
    calls,
    playProgram: (program, options) => calls.push({ op: "play", id: program.id, ...options }),
    playMusic: (id) => calls.push({ op: "music", id }),
    pumpMusic: () => {},
    stopAll: () => calls.push({ op: "stopAll" }),
    suspend: () => calls.push({ op: "suspend" }),
    resume: () => calls.push({ op: "resume" }),
  };
}
