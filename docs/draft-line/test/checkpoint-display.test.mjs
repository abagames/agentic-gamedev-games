// Focused contract for checkpoint clock replacement and remaining-time score messaging.
import assert from 'node:assert/strict';
import * as S from '../src/spec.js';
import { Course } from '../src/course.js';
import { Sim } from '../src/sim.js';
import { Game } from '../src/game.js';

const DT = 1 / 60;
const course = new Course(4242);
const sim = new Sim(course, 4242);
sim.z = course.checkpoints[0].z - 1;
sim.speed = 100;
sim.timer = 12.345;
sim.rivals = [];
sim.traffic = [];
const scoreBefore = sim.score;
const event = sim.step(DT, { steer: 0, throttle: 0, boost: false });

assert.ok(event.checkpoint);
assert.ok(sim.lastCheckpoint);
assert.equal(sim.lastCheckpoint.checkpoint, 1);
assert.ok(Math.abs(sim.lastCheckpoint.remaining - (12.345 - DT)) < 1e-9);
assert.equal(sim.lastCheckpoint.timeSet, S.legExtension(1));
assert.ok(Math.abs(sim.lastCheckpoint.bonusScore
  - sim.lastCheckpoint.remaining * S.SCORE.checkpoint) < 1e-9);
// Distance score is also earned on the crossing frame, so isolate the recorded causal
// checkpoint contribution rather than treating the total score delta as checkpoint-only.
assert.ok(sim.score - scoreBefore >= sim.lastCheckpoint.bonusScore);

const noop = () => {};
const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
  get: (target, key) => (key in target ? target[key] : noop),
  set: (target, key, value) => { target[key] = value; return true; },
});
globalThis.localStorage = { getItem: () => null, setItem: noop };
const game = new Game(ctx);
game.checkpointAward = sim.lastCheckpoint;
game.sim = sim;
assert.deepEqual(game.checkpointReadout(), {
  timeText: '33.2 SEC',
  bonusText: 'TIME LEFT BONUS +001232 SCORE',
});

console.log('  PASS  checkpoint sets the configured clock and records the old remainder');
console.log('  PASS  display identifies TIME SET and the remaining-time bonus score');
console.log('\n2 passed, 0 failed');
