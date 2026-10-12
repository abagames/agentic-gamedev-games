import test from "node:test";
import assert from "node:assert/strict";
import { createTraceWriter, validateTrace } from "../src/sim/trace.js";

function sampleTrace() {
  const w = createTraceWriter({ fps: 60, seed: 1, source: "fixture" });
  for (let f = 0; f < 3; f++) {
    w.record(f, { id: 1, x: 0, y: 8 - f * 0.1, dir: Math.PI, speed: 0.1 });
    w.record(f, { id: 2, x: 1, y: 8 - f * 0.2, dir: Math.PI, speed: 0.2 });
  }
  return w.toString();
}

test("trace: writer output is well formed", () => {
  assert.deepEqual(validateTrace(sampleTrace()), []);
});

test("trace validator rejects an empty trace", () => {
  assert.notDeepEqual(validateTrace(""), []);
});

test("trace validator rejects a trace without a header", () => {
  const body = sampleTrace().split("\n").slice(1).join("\n");
  assert.notDeepEqual(validateTrace(body), []);
});

test("trace validator rejects non-finite fields", () => {
  const broken = sampleTrace().replace('"speed":0.1', '"speed":null');
  assert.match(validateTrace(broken).join(), /speed/);
});

test("trace validator rejects frames that go backwards", () => {
  const lines = sampleTrace().trim().split("\n");
  lines.push(lines[1]);
  assert.match(validateTrace(lines.join("\n")).join(), /backwards/);
});

test("trace validator rejects a bullet listed twice in one frame", () => {
  const lines = sampleTrace().trim().split("\n");
  lines.splice(2, 0, lines[1]);
  assert.match(validateTrace(lines.join("\n")).join(), /twice/);
});
