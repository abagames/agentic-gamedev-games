// Thin wrapper for tools/ladder.mjs, audit.mjs and calibrate.mjs.
const OT = require('../core.js'), B = require('../bots.js'), P = B.policies;
module.exports = {
  tickS: OT.C.TICK,
  intent: { core: 'target', primaryThreat: 'hole', threats: ['hole', 'void'] },
  create: (seed) => OT.create(seed),
  step: (s, input) => OT.step(s, input),
  ended: (s) => s.over || s.t * OT.C.TICK >= 1500,
  result: (s) => ({ score: s.score, progress: s.level, success: false, failures: Object.assign({}, s.causes) }),
  events(s) {
    const out = [];
    for (const e of s.events) {
      if (e.type === 'rim') { out.push({ type: 'action', source: 'bounce' }); if (e.hp <= 0) out.push({ type: 'threat_fire', id: 'hole' }); }
      else if (e.type === 'target') out.push({ type: 'action', source: 'target' }, { type: 'score', source: 'target', amount: e.pts });
      else if (e.type === 'bank') out.push({ type: 'score', source: e.jackpot ? 'jackpot' : 'bank', amount: e.pts });
      else if (e.type === 'lock' || e.type === 'multiball') out.push({ type: 'action', source: 'lock' }, { type: 'score', source: 'lock', amount: e.pts });
      else if (e.type === 'void') out.push({ type: 'threat_fire', id: 'void' });
      else if (e.type === 'lost') out.push({ type: 'threat_hit', id: 'hole' }, { type: 'failure', cause: e.cause });
    }
    return out;
  },
  threatPresent: (s) => s.segs.some(h => h <= 0),
  clone: (s) => OT.clone(s),
  policies: {
    idle: { profile: 'baseline', make: P.idle }, hold: { profile: 'baseline', make: P.hold }, stepper: { profile: 'baseline', make: P.stepper },
    wiggle: { profile: 'baseline', make: P.wiggle }, mash: { profile: 'baseline', make: P.mash }, greedy: { profile: 'baseline', make: P.greedy },
    player: { profile: 'human-limited', make: P.player }, novice: { profile: 'human-limited', make: P.novice }, regular: { profile: 'human-limited', make: P.regular }, human: { profile: 'human-limited', make: P.human },
    strong: { profile: 'oracle', make: P.strong },
  },
};
