import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as game from "../src/sim/sim.js";
import { encodeReplay, expandReplay, runReplay, replayLength } from "../src/sim/replay.js";
import { checkDeterminism, checkPurity, sampleInputs } from "../tools/lib/determinism.mjs";
import { nondeterministic, seedBlind, inputBlind } from "./fixtures/toy-sims.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("sim: same seed and inputs give the same state hash", () => {
  const result = checkDeterminism(game);
  assert.deepEqual(result.problems, []);
});

test("determinism check fails on a sim that uses Math.random", () => {
  assert.equal(checkDeterminism(nondeterministic).ok, false);
});

test("determinism check fails on a sim that ignores the seed", () => {
  assert.match(checkDeterminism(seedBlind).problems.join(), /seed/);
});

test("determinism check fails on a sim that ignores the inputs", () => {
  assert.match(checkDeterminism(inputBlind).problems.join(), /inputs/);
});

test("sim sources do not touch the DOM, the clock or Math.random", () => {
  assert.deepEqual(checkPurity(path.join(here, "..", "src", "sim")).problems, []);
});

test("purity scan fails on a sim that reads the clock and the DOM", () => {
  const problems = checkPurity(path.join(here, "fixtures", "impure-sim")).problems.join("\n");
  assert.match(problems, /performance/);
  assert.match(problems, /window/);
  assert.match(problems, /Math\.random/);
  assert.match(problems, /engine-dependent/);
});

test("sim math matches the built-in functions closely", async () => {
  const m = await import("../src/sim/math.js");
  for (let i = -400; i <= 400; i++) {
    const x = i * 0.0377;
    assert.ok(Math.abs(m.sin(x) - Math.sin(x)) < 1e-10, `sin ${x}`);
    assert.ok(Math.abs(m.cos(x) - Math.cos(x)) < 1e-10, `cos ${x}`);
    const y = Math.sin(i * 0.731) * 20;
    const z = Math.cos(i * 0.317) * 20;
    assert.ok(Math.abs(m.atan2(y, z) - Math.atan2(y, z)) < 1e-10, `atan2 ${y} ${z}`);
  }
  assert.equal(m.atan2(0, 0), 0);
  assert.equal(m.atan2(1, 0), m.PI / 2);
  assert.equal(m.atan2(0, -1), m.PI);
  assert.equal(m.sin(0), 0);
});

test("replay: encode, expand and run reproduce direct stepping", () => {
  const inputs = sampleInputs(300);
  const replay = encodeReplay(42, inputs);
  assert.equal(replayLength(replay), 300);
  assert.deepEqual(expandReplay(replay), inputs);

  const direct = game.createSim({ seed: 42 });
  for (const bits of inputs) game.stepSim(direct, bits);
  assert.equal(game.hashState(runReplay(replay)), game.hashState(direct));
});

test("replay: maxFrames stops at the requested frame", () => {
  const replay = encodeReplay(42, sampleInputs(300));
  assert.equal(runReplay(replay, { maxFrames: 120 }).frame, 120);
});

test("replay: a changed input changes the final hash", () => {
  const inputs = sampleInputs(300);
  const changed = inputs.slice();
  changed[150] ^= 16;
  assert.notEqual(
    game.hashState(runReplay(encodeReplay(42, inputs))),
    game.hashState(runReplay(encodeReplay(42, changed)))
  );
});

test("replay: malformed replays are rejected", () => {
  assert.throws(() => expandReplay({ version: 99, seed: 1, frames: [] }));
  assert.throws(() => expandReplay(null));
});

test("extends: an extra ship every so many points, evenly, by mode", async () => {
  const { addScore } = await import("../src/sim/score.js");
  for (const [mode, every] of [["normal", 500000], ["rapid", 1000000], ["dense", 300000]]) {
    const sim = game.createSim({ seed: 1, mode });
    const lives = sim.lives;
    addScore(sim, every - 10);
    assert.equal(sim.lives, lives, `${mode}: none before ${every}`);
    addScore(sim, 10);
    assert.equal(sim.lives, lives + 1, `${mode}: one at ${every}`);
    addScore(sim, every - 10);
    assert.equal(sim.lives, lives + 1, `${mode}: none before ${2 * every}`);
    addScore(sim, 10);
    assert.equal(sim.lives, lives + 2, `${mode}: the second at ${2 * every}`);
  }
});
