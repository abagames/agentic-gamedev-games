#!/usr/bin/env node
// Checks the page around the game, opened the way a player opens it:
//   - it starts on the title and a press of shot starts a run
//   - that press opens the sound output, and the bus reports what it played
//   - M mutes, and the choice is kept
//   - a gamepad's stick, d-pad and buttons reach the sim as the same input bits
//   - the best score is kept when a run ends, and shown on the title again
//   - the session can be read back as a replay that reproduces it, and
//     ?rec=1 saves a run as a file when it ends
//
// Usage: node tools/check-shell.mjs

import fs from "node:fs";
import { hashState } from "../src/sim/sim.js";
import { runReplay } from "../src/sim/replay.js";
import { openGame } from "./lib/browser.mjs";

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) failures.push(name);
};

const game = await openGame({ title: true, query: "&rec=1" });
const page = game.page;
const g = (fn, arg) => page.evaluate(fn, arg);
try {
  await page.waitForTimeout(300);
  const before = await g(() => ({ mode: window.__game.mode, frame: window.__game.frame, unlocked: window.__game.audio.unlocked }));
  check("opens on the title, with the sim not running", before.mode === "title" && before.frame === 0, JSON.stringify(before));
  check("the title's music is wanted from the start (it sounds once a key opens the output)", (await g(() => window.__game.audio.music)) === "title");
  check("no sound output before the first key or touch", before.unlocked === false);
  check("a first visit starts on CHAIN", (await g(() => window.__game.title.mode)) === "rapid");

  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(150);
  await page.keyboard.up("ArrowLeft");
  check("moving does not start a run", (await g(() => window.__game.mode)) === "title");
  // Left and right choose the mode, in the order CHAIN, CLOSE, GRAZE and
  // round again; the choice is kept. Up cannot go past what has been reached
  // (nothing, on a first visit).
  const chosen = await g(() => ({ ...window.__game.title, kept: localStorage.getItem("parallaxia.mode") }));
  check("left of CHAIN is GRAZE, and the choice is kept", chosen.mode === "dense" && chosen.kept === "dense", JSON.stringify(chosen));
  // Held for a few frames, as a person's key press is.
  const tap = async (key) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(80);
    await page.keyboard.up(key);
    await page.waitForTimeout(80);
  };
  await tap("ArrowRight");
  await tap("ArrowRight");
  const close = await g(() => window.__game.title.mode);
  check("right of GRAZE is CHAIN again, and right of that CLOSE", close === "normal", close);
  await tap("ArrowLeft");
  await tap("ArrowUp");
  const rapid = await g(() => window.__game.title);
  check("left of CLOSE is CHAIN; up does nothing while only sector 1 is open", rapid.mode === "rapid" && rapid.start === 1 && rapid.reach === 1, JSON.stringify(rapid));

  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyZ");
  const started = await g(() => ({ mode: window.__game.mode, frame: window.__game.frame, seed: window.__game.state.seed, audio: window.__game.audio, played: window.__game.state.mode }));
  check("the run is in the mode chosen", started.played === "rapid", started.played);
  check("shot starts a run", started.mode === "play" && started.frame > 0, `frame ${started.frame}`);
  check("the run's seed is not the fixed default", started.seed !== 1, `seed ${started.seed}`);
  check("the key press opened the sound output", started.audio.unlocked === true);
  check("the music changed from the title's to the first sector tune", started.audio.music === "stage-a" && started.audio.log.some((l) => l.name === "music:title") && started.audio.log.some((l) => l.name === "music:stage-a"), started.audio.music);
  const played = (log) => log.filter((l) => l.result === "played").map((l) => l.name);
  check("the start jingle and the shot were sent to the output", played(started.audio.log).includes("run:start") && started.audio.log.some((l) => l.name === "player:shot"), played(started.audio.log).slice(0, 6).join(" "));

  await page.keyboard.press("KeyM");
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(200);
  await page.keyboard.up("KeyZ");
  const muted = await g(() => ({ muted: window.__game.audio.muted, last: window.__game.audio.log.at(-1), kept: localStorage.getItem("parallaxia.muted") }));
  check("M mutes: later sounds are logged as muted", muted.muted === true && muted.last.result === "muted", JSON.stringify(muted.last));
  check("the mute is kept", muted.kept === "1");
  check("M stops the music too", (await g(() => window.__game.audio.music)) === "");
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(60);
  check("M again unmutes, and the music is back", (await g(() => ({ ...window.__game.audio }))).muted === false && (await g(() => window.__game.audio.music)) === "stage-a");

  // P holds the run where it is, and lets it go again.
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(80);
  const heldAt = await g(() => ({ held: window.__game.audio.held, frame: window.__game.frame }));
  await page.waitForTimeout(200);
  const stillAt = await g(() => window.__game.frame);
  check("P holds the run: the frame count stands still", heldAt.held === true && stillAt === heldAt.frame, `${heldAt.frame} -> ${stillAt}`);
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(200);
  const going = await g(() => ({ held: window.__game.audio.held, frame: window.__game.frame }));
  check("P again lets it go on", going.held === false && going.frame > stillAt, `${stillAt} -> ${going.frame}`);

  // A gamepad: replace what the browser reports with a pad of our own.
  const pad = async (axes, pressed) => {
    await g(([ax, on]) => {
      const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: on.includes(i) }));
      navigator.getGamepads = () => [null, { connected: true, axes: ax, buttons }];
    }, [axes, pressed]);
    await page.waitForTimeout(120);
    return g(() => window.__game.state.input);
  };
  check("gamepad: stick right and a face button", (await pad([0.9, 0], [0])) === (8 | 16));
  check("gamepad: stick up-left, no button", (await pad([-0.9, -0.9], [])) === (1 | 4));
  check("gamepad: d-pad down and another face button", (await pad([0, 0], [13, 2])) === (2 | 16));
  check("gamepad: a shoulder button, and a trigger", (await pad([0, 0], [5])) === 16 && (await pad([0, 0], [6])) === 16);
  check("gamepad: the buttons past the triggers do not shoot", (await pad([0, 0], [8, 9, 10, 11])) === 0);
  check("gamepad: a stick inside the dead zone does nothing", (await pad([0.3, -0.3], [])) === 0);
  check("gamepad: nothing connected", (await g(() => ((navigator.getGamepads = () => [null, null]), 0))) === 0);

  // The session so far, read back and replayed in Node, must land on the same state.
  const session = await g(() => {
    window.__game.pause();
    return { replay: window.__game.replay(), hash: window.__game.hash(), frame: window.__game.frame };
  });
  const again = runReplay(session.replay);
  check("the recorded session replays to the same state", again.frame === session.frame && hashState(again) === session.hash, `${session.frame} frames, ${session.hash}`);

  // The same session as the file ?rec=1 would save: with the build, how it
  // was played and the state it stands on.
  const saved = await g(() => window.__game.replayFile());
  check("the session as a file names the build, the devices and the end state", saved.build === "dev" && saved.via.join() === "gamepad,keyboard" && saved.end.frames === session.frame && saved.end.hash === session.hash && hashState(runReplay(saved)) === saved.end.hash, JSON.stringify({ ...saved, frames: undefined }));

  // Reaching the first sector of the next loop opens it as a start, in every
  // mode.
  const opened = await g(() => {
    const game = window.__game;
    const s = game.state;
    s.enemies = [];
    s.stage.streams = [];
    s.stage.boss = 0;
    s.stage.section = 9;
    s.stage.sectionEnd = s.frame;
    game.step(2, 0);
    return { sector: s.stage.section + 1, reach: localStorage.getItem("parallaxia.reach") };
  });
  check("reaching sector 11 opens it as a start", opened.sector === 11 && opened.reach === "11", JSON.stringify(opened));

  // End the run: no ships left, and a bullet on the ship. With ?rec=1 the
  // page saves the run as a file at that moment.
  const downloading = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  const end = await g(() => {
    const game = window.__game;
    const s = game.state;
    s.stage.frozen = true;
    s.enemies = [];
    s.bullets = [{ id: 99999, x: s.ship.x, y: s.ship.y + 1, dir: Math.PI, speed: 0.2, age: 100 }];
    s.ship.respawn = 0;
    s.lives = 0;
    s.score = 123400;
    game.step(12, 0);
    return { phase: s.phase, kept: localStorage.getItem("parallaxia.hi.rapid.1"), other: localStorage.getItem("parallaxia.hi.normal.1"), log: game.audio.log.filter((l) => l.result === "played").map((l) => l.name) };
  });
  check("the run ends", end.phase === "gameover");
  const download = await downloading;
  const file = download ? JSON.parse(fs.readFileSync(await download.path(), "utf8")) : null;
  check("?rec=1: the run is saved as a file when it ends", file !== null && /^parallaxia-dev-rapid-1-123400-\d{14}\.json$/.test(download.suggestedFilename()), download?.suggestedFilename() ?? "no download");
  check("?rec=1: the file holds the replay and where it ended", file?.version === 1 && file.mode === "rapid" && file.build === "dev" && file.end.score === 123400 && file.end.sector === 11 && /^[0-9a-f]{8}$/.test(file.end.hash), JSON.stringify({ ...file, frames: undefined }));
  check("the best score is kept, under the mode and the start sector it was made in", end.kept === "123400" && end.other === null, `stored ${end.kept} / ${end.other}`);
  check("the miss and the game-over jingle were sent to the output", end.log.includes("player:miss") && end.log.includes("run:gameover"));

  // A press of shot on the game-over screen goes back to the title, and does
  // not start a run.
  await g(() => window.__game.step(70, 0));
  await g(() => window.__game.resume());
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(200);
  const toTitle = await g(() => window.__game.mode);
  await page.waitForTimeout(200);
  await page.keyboard.up("KeyZ");
  check("shot on the game-over screen goes back to the title, and held there it starts nothing", toTitle === "title" && (await g(() => window.__game.mode)) === "title", toTitle);

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__game !== undefined);
  // The title ignores a shot that is already down when it appears.
  await page.waitForTimeout(300);
  const back = await g(() => ({ mode: window.__game.mode, kept: localStorage.getItem("parallaxia.hi.rapid.1") }));
  check("after a reload the title is back and the best score is still there", back.mode === "title" && back.kept === "123400");

  // The opened start can now be chosen, and a run from it begins there.
  // The start opened in CHAIN is open in the other modes as well.
  await tap("ArrowRight");
  await tap("ArrowUp");
  const shared = await g(() => window.__game.title);
  check("the start is open in another mode too", shared.mode === "normal" && shared.start === 11 && shared.reach === 11, JSON.stringify(shared));
  await tap("ArrowLeft");
  await tap("ArrowUp");
  const pick = await g(() => window.__game.title);
  check("up chooses sector 11, and no further", pick.mode === "rapid" && pick.start === 11 && pick.reach === 11, JSON.stringify(pick));

  // A run from a later sector, and what its replay records.
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(200);
  await page.keyboard.up("KeyZ");
  check("shot starts a run again", (await g(() => window.__game.mode)) === "play");
  const from11 = await g(() => ({ sector: window.__game.state.stage.section + 1, rank: window.__game.state.stage.rank, score: window.__game.state.score, lives: window.__game.state.lives, replay: window.__game.replay() }));
  check("the run starts at sector 11 (rank 9) with no score and the usual ships", from11.sector === 11 && from11.rank === 9 && from11.lives === 2, JSON.stringify({ ...from11, replay: undefined }));
  check("its replay says which mode and which start", from11.replay.mode === "rapid" && from11.replay.start === 11);

  check("no page errors", game.errors.length === 0, game.errors.join(" | "));
} finally {
  await game.close();
}
// What the URL can ask for must not reach the record: ?start= by itself opens
// nothing, and a run with a fixed seed keeps neither a best score nor a start.
{
  const plain = await openGame({ title: true, query: "&start=41" });
  try {
    const at = await plain.page.evaluate(() => ({ ...window.__game.title, mode: window.__game.mode }));
    check("?start= without ?seed= is ignored: the title offers sector 1 only", at.mode === "title" && at.start === 1 && at.reach === 1, JSON.stringify(at));
  } finally {
    await plain.close();
  }
  const seeded = await openGame({ seed: 5, query: "&mode=rapid&start=11" });
  try {
    const kept = await seeded.page.evaluate(() => {
      const game = window.__game;
      const s = game.state;
      game.step(2, 0);
      const from = s.stage.section + 1;
      // On to sector 21, then out of ships with a score.
      s.enemies = [];
      s.stage.streams = [];
      s.stage.boss = 0;
      s.stage.section = 19;
      s.stage.sectionEnd = s.frame;
      game.step(2, 0);
      const sector = s.stage.section + 1;
      s.stage.frozen = true;
      s.enemies = [];
      s.bullets = [{ id: 99999, x: s.ship.x, y: s.ship.y + 1, dir: Math.PI, speed: 0.2, age: 100 }];
      s.ship.respawn = 0;
      s.lives = 0;
      s.score = 777700;
      game.step(12, 0);
      return { from, sector, phase: s.phase, hi: localStorage.getItem("parallaxia.hi.rapid.11"), reach: localStorage.getItem("parallaxia.reach") };
    });
    check("?seed= with ?start= plays from that sector", kept.from === 11, JSON.stringify(kept));
    check("a run with a fixed seed keeps no best score and opens no start", kept.sector === 21 && kept.phase === "gameover" && kept.hi === null && kept.reach === null, JSON.stringify(kept));
  } finally {
    await seeded.close();
  }
}

console.log(failures.length === 0 ? "PASS: title, sound, best score, gamepad and replay" : `FAIL: ${failures.length} shell check(s) failed`);
process.exit(failures.length === 0 ? 0 : 1);
