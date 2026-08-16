// Focused contract for one-slingshot chain scoring. These probes use real Sim transitions
// and stable target identities; they deliberately avoid course randomness.
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};

const course = () => ({
  traffic: [], totalLength: 999999,
  checkpoints: Array.from({ length: S.TOTAL_LEGS }, (_, i) => ({ leg: i + 1, z: (i + 1) * 1000 })),
  curveAt: () => 0, elevationAt: () => 0,
  segmentAt: (z) => ({ index: Math.floor(z / S.SEG_LEN), z, curve: 0, y: 0 }),
});
const events = () => ({
  bump: false, spin: false, release: null, chargeFull: false, overtake: 0,
  checkpoint: false, finish: false, timeout: false, gameover: false,
  boostEnd: false, passes: [], chainEnd: null,
});
const boost = (sim, sling = true, t = 1) => {
  sim.boost = { active: true, t, dur: t, gain: 1, sling, pending: 0, ending: false };
  if (sling) sim._startChainSession();
};
const target = (sim, kind, id, x = 1) => ({
  passId: id, z: sim.z + 1, x, speed: 0, overtaken: false, _passPrevRelZ: 1,
  ...(kind === 'rival' ? { targetX: x, baseSpeed: 0, brakeTimer: 999, lamp: 0, braking: 0 } : {}),
});
const cross = (sim, kind, o, ev = events()) => {
  o.z = sim.z - 1;
  sim.rivals = kind === 'rival' ? [o] : [];
  sim.traffic = kind === 'traffic' ? [o] : [];
  sim._overtakes(ev);
  return ev;
};
const fresh = () => { const sim = new Sim(course(), 1); sim.score = 0; return sim; };

// Rival and traffic base points are independent, and combine into one chain.
{
  const r = fresh(); boost(r); const er = cross(r, 'rival', target(r, 'rival', 'r:1'));
  ok('one rival pass scores 500 and chain 1', r.score === 500 && r.chain === 1
    && er.passes[0]?.kind === 'rival' && er.passes[0]?.points === 500);

  const t = fresh(); boost(t); const et = cross(t, 'traffic', target(t, 'traffic', 't:1'));
  ok('one traffic pass scores 200 and chain 1', t.score === 200 && t.chain === 1
    && et.passes[0]?.kind === 'traffic' && et.passes[0]?.points === 200);

  const both = fresh(); boost(both);
  cross(both, 'rival', target(both, 'rival', 'r:1'));
  cross(both, 'traffic', target(both, 'traffic', 't:1'));
  ok('rival plus traffic in one boost is chain 2 with immediate 700 base',
    both.score === 700 && both.chain === 2 && both.stats.maxChain === 2);
}

// Identity is per lifecycle: re-cross is rejected, a newly spawned identity is accepted.
{
  const sim = fresh(); boost(sim);
  const a = target(sim, 'rival', 'r:life-1');
  cross(sim, 'rival', a);
  a.overtaken = false; a._passPrevRelZ = 1;
  cross(sim, 'rival', a);
  const afterRepeat = sim.score;
  cross(sim, 'rival', target(sim, 'rival', 'r:life-2'));
  ok('same passId cannot score on a re-cross', afterRepeat === 500 && sim.chain === 2,
    `after repeat ${afterRepeat}, after new spawn ${sim.score}`);
  ok('a different spawned passId is a new opportunity', sim.score === 1000);
}

// The inverse cases: no slingshot session means no chain score.
{
  const normal = fresh(); boost(normal, false);
  const en = cross(normal, 'rival', target(normal, 'rival', 'r:n'));
  const outside = fresh();
  const eo = cross(outside, 'traffic', target(outside, 'traffic', 't:o'));
  ok('normal boost pass earns no chain score', normal.score === 0 && normal.chain === 0 && en.passes.length === 0);
  ok('outside-boost pass earns no chain score', outside.score === 0 && outside.chain === 0 && eo.passes.length === 0);
}

// Natural settlement is bounded and idempotent; the legacy 126,500 cross-run shape is gone.
{
  const sim = fresh(); boost(sim);
  cross(sim, 'rival', target(sim, 'rival', 'r:1'));
  cross(sim, 'traffic', target(sim, 'traffic', 't:1'));
  const ev = events(); sim._endChainSession(ev, 'natural', true);
  const once = sim.score; sim._endChainSession(ev, 'natural', true);
  ok('natural end banks one 250-point link bonus exactly once', once === 950 && sim.score === once
    && ev.chainEnd?.bonus === 250 && sim.chain === 0 && sim._chainSession === null);

  const capped = fresh(); boost(capped);
  for (let i = 0; i < 5; i++) cross(capped, 'rival', target(capped, 'rival', `r:cap-${i}`));
  const capEv = events(); capped._endChainSession(capEv, 'natural', true);
  ok('link bonus is capped at three links (750) from chain 4 onward',
    capEv.chainEnd?.chain === 5 && capEv.chainEnd?.bonus === 750 && capped.score === 5 * 500 + 750);

  const legacy = fresh();
  for (let i = 0; i < 22; i++) {
    boost(legacy);
    cross(legacy, 'rival', target(legacy, 'rival', `r:${i}`));
    legacy._endChainSession(events(), 'natural', true);
    legacy._clearBoost();
  }
  ok('22 separate boosts score 11,000, not the legacy 126,500 run-wide chain',
    legacy.score === 11000 && legacy.stats.maxChain === 1,
    `score ${legacy.score}, legacy shape ${500 * 22 * 23 / 2}`);
}

// Final-tick ordering: the pass is processed while the expiring boost is still eligible.
{
  const sim = fresh(); sim.speed = 100; boost(sim, true, 1 / 120);
  const r = target(sim, 'rival', 'r:final'); r.z = sim.z + 0.5; r._passPrevRelZ = 0.5;
  sim.rivals = [r]; sim.traffic = [];
  sim._updateRivals = () => {}; sim._updateTraffic = () => {};
  sim._collide = () => new Set(); sim._progress = () => {};
  const before = sim.score;
  const ev = sim.step(1 / 60, { steer: 0, throttle: 0, boost: false });
  ok('a crossing on the boost final tick scores before natural settlement',
    ev.passes.length === 1 && ev.passes[0].points === 500 && ev.chainEnd?.reason === 'natural'
      && sim.score - before >= 500 && !sim.boost.active && sim.chain === 0);
}

// Collision has priority, including a swept crossing. A bump does not end the session,
// but the contacted identity remains excluded from it.
{
  const hit = fresh(); hit.speed = S.VMAX * 1.2; boost(hit);
  const r = target(hit, 'rival', 'r:hit', 0); r.z = hit.z + 0.2; r._passPrevRelZ = 0.2;
  hit.rivals = [r]; hit._updateRivals = () => {}; hit._updateTraffic = () => {}; hit._progress = () => {};
  const ev = hit.step(1 / 30, { steer: 0, throttle: 1, boost: false });
  ok('collision plus crossing scores no pass and spin forfeits the link bonus',
    ev.spin && ev.passes.length === 0 && ev.chainEnd?.reason === 'spin' && ev.chainEnd.bonus === 0);

  const bump = fresh(); bump.speed = S.VMAX * 0.95; boost(bump);
  cross(bump, 'traffic', target(bump, 'traffic', 't:clean'));
  const contacted = target(bump, 'rival', 'r:bump', 0); contacted.speed = S.VMAX * 0.90;
  bump.rivals = [contacted]; bump.traffic = [];
  const cev = events(); const ids = bump._collide(cev);
  contacted.z = bump.z - 1; bump._overtakes(cev, ids);
  ok('bump keeps the session but the contacted target itself never scores',
    cev.bump && bump.boost.active && bump.chain === 1 && bump.score === 200 && cev.passes.length === 0);
}

// Spin keeps base points, and sequence ordering cannot change the total settlement.
{
  const spin = fresh(); boost(spin);
  cross(spin, 'rival', target(spin, 'rival', 'r:1'));
  cross(spin, 'traffic', target(spin, 'traffic', 't:1'));
  const ev = events(); spin._doSpin(ev);
  ok('spin preserves 700 base points but awards no link bonus', spin.score === 700
    && ev.chainEnd?.chain === 2 && ev.chainEnd.bonus === 0 && !spin.boost.active);

  const ordered = (order) => {
    const sim = fresh(); boost(sim);
    for (const kind of order) cross(sim, kind, target(sim, kind, `${kind}:${order.indexOf(kind)}`));
    sim._endChainSession(events(), 'natural', true);
    return sim.score;
  };
  ok('traffic then rival and rival then traffic settle to the same 950',
    ordered(['traffic', 'rival']) === 950 && ordered(['rival', 'traffic']) === 950);
}

// Lifecycle boundaries: checkpoint continues; finish settles; timeout and reset discard.
{
  const cp = fresh(); boost(cp); cross(cp, 'rival', target(cp, 'rival', 'r:cp'));
  const seen = cp._chainSession.seen; cp.z = cp.course.checkpoints[0].z; cp.timer = 10;
  const ecp = events(); cp._progress(0, ecp);
  ok('checkpoint advances the leg without ending or replacing the chain session',
    ecp.checkpoint && cp.chain === 1 && cp._chainSession?.seen === seen && cp.boost.active);

  const finish = fresh(); finish.leg = S.TOTAL_LEGS; finish.z = finish.course.checkpoints.at(-1).z;
  finish.timer = 10; boost(finish);
  cross(finish, 'rival', target(finish, 'rival', 'r:f'));
  cross(finish, 'traffic', target(finish, 'traffic', 't:f'));
  const before = finish.score; const ef = events(); finish._progress(0, ef);
  ok('finish normally settles one link and leaves no session state', ef.finish && finish.finished
    && finish.score - before === 250 + 10 * S.SCORE.finishTime
    && ef.chainEnd?.reason === 'finish' && finish.chain === 0 && finish._chainSession === null);

  const timeout = fresh(); boost(timeout); cross(timeout, 'rival', target(timeout, 'rival', 'r:t'));
  timeout.timer = 0; const et = events(); timeout._progress(0, et);
  ok('timeout/game-over keeps base points, gives no bonus and clears all session state',
    et.timeout && et.gameover && timeout.score === 500 && et.chainEnd?.bonus === 0
      && timeout.chain === 0 && timeout._chainSession === null && !timeout.boost.active);

  const reset = fresh(); boost(reset); cross(reset, 'rival', target(reset, 'rival', 'r:r'));
  reset.reset();
  ok('restart/reset cannot leak chain count or seen IDs', reset.chain === 0
    && reset._chainSession === null && !reset.boost.active && reset.score === 0);
}

// Presentation consumes causal events and arbitrates multi-pass audio once per tick.
{
  const noop = () => {};
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  const { Game } = await import('../src/game.js');
  const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
    get: (o, k) => (k in o ? o[k] : noop), set: (o, k, v) => { o[k] = v; return true; },
  });
  const game = new Game(ctx); const calls = [];
  game.sound = { sfx: (n) => calls.push(n), jingle: noop, music: noop, stopAll: noop,
    unlock: noop, setMuted: noop, setEngineRunning: noop, setEngine: noop, setDraft: noop };
  game._reactTo({ overtake: 2, passes: [
    { kind: 'traffic', points: 200, chain: 1 }, { kind: 'rival', points: 500, chain: 2 },
  ] });
  ok('same-tick multiple passes produce one overtake SE but one readout per car',
    calls.filter((n) => n === 'overtake').length === 1 && game.passReadouts.length === 2
      && game.passReadouts[0].text === 'TRAFFIC +200' && game.passReadouts[1].text === 'RIVAL +500');

  game._reactTo({ chainEnd: { chain: 2, bonus: 250, reason: 'natural', awarded: true } });
  const bonusCalls = calls.filter((n) => n === 'chainBonus').length;
  game._reactTo({ spin: true, chainEnd: { chain: 2, bonus: 0, reason: 'spin', awarded: false } });
  ok('natural end shows the bonus and spin shows loss without a bonus sound',
    bonusCalls === 1 && calls.filter((n) => n === 'chainBonus').length === 1
      && game.chainEndReadout?.text === 'CHAIN LOST');
  delete globalThis.localStorage;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
