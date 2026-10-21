// Thin wrapper for tools/ladder.mjs, audit.mjs, calibrate.mjs and the replay tools.
const S = require('../core.js'), B = require('../bots.js');
module.exports = {
  tickS: 1 / 60,
  intent: { core: 'pileup', primaryThreat: 'patrol', threats: ['patrol', 'wreck'] },
  create: (seed) => S.create(seed),
  step: (st, input) => S.step(st, input),
  ended: (st) => st.over || st.won || st.t >= 60 * 1200,
  // progress: districts got out of, plus the share of the current district's quota
  result: (st) => ({ score: st.score, progress: +(st.stats.districts + (st.won ? 0 : Math.min(1, st.wrecked / S.district(st).quota) * 0.99)).toFixed(2), success: st.won, failures: { ...st.stats.fail } }),
  events(st) {
    const out = [];
    for (const e of st.events) {
      if (e.type === 'crash') { out.push({ type: 'score', source: e.n >= 3 ? 'pileup' : 'headon', amount: e.pts }); if (e.n === 1) out.push({ type: 'threat_appear', id: 'wreck' }, { type: 'threat_fire', id: 'wreck' }); }
      else if (e.type === 'spawn') out.push({ type: 'threat_appear', id: 'patrol' }, { type: 'threat_fire', id: 'patrol' });
      else if (e.type === 'death') out.push({ type: 'threat_hit', id: e.cause === 'wreck' ? 'wreck' : 'patrol' }, { type: 'failure', cause: e.cause });
    }
    return out;
  },
  // start in the district that introduces an element, with it (name) or switched off (name-plain); one life
  variants: Object.fromEntries([['market', [0, -1], 'van', 'MARKET'], ['uptown', [1, 0], 'dog', 'UPTOWN']].flatMap(([n, at, el, z]) => [
    [n, (st) => { st.cx = at[0]; st.cy = at[1]; st.zones[S.cityIndex(at[0], at[1])] = z; st.lives = 1; }],
    [n + '-plain', (st) => { st.cx = at[0]; st.cy = at[1]; st.zones[S.cityIndex(at[0], at[1])] = z; st.lives = 1; st.off = { [el]: true }; }],
  ])),
  threatPresent: (st) => st.cops.length > 0,
  clone: (st) => S.clone(st),
  hash: (st) => S.hash(st),
  player: (st) => ({ x: st.p.x, y: st.p.y }),
  threats: (st) => st.cops.map(c => ({ id: 'patrol', x: c.x, y: c.y })),
  policies: {
    idle: { profile: 'baseline', make: B.idle },
    turner: { profile: 'baseline', make: B.turner },
    random: { profile: 'baseline', make: B.random },
    flee: { profile: 'precise', role: 'survive_only', make: B.flee },
    human: { profile: 'human-limited', make: (seed) => B.human(seed) },
    // quicker and further-sighted than human: on build 02-tracks it brackets the person's session s2 from above
    // (68 s / 4,700 median against the person's ~40 s / 2,600; human: 47 s / 1,000)
    skilled: { profile: 'human-limited', make: (seed) => B.human(seed, { react: 4, horizon: 120, slip: 0.03 }) },
    strong: { profile: 'oracle', make: (seed) => B.strong(seed) },
    // the same look-ahead with no value on crashes, fewer police or herding: survival only (aimability probe)
    // the look-ahead planning as if an element were not there (content check: does knowing it change the best action?)
    blindvan: { profile: 'oracle', make: (seed) => B.strong(seed, { blind: { van: true } }) },
    blinddog: { profile: 'oracle', make: (seed) => B.strong(seed, { blind: { dog: true } }) },
    noaim: { profile: 'precise', role: 'survive_only', make: (seed) => B.strong(seed, { pts: 0, crowd: 0, herd: 0 }) },
  },
};
