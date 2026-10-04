// Adapter for the fixture game. See tools/README.md for the contract.
const core = require("../core.cjs");

function mulberry(seed) {
  let a = seed | 0;
  return () => {
    let t = (a = (a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One skill axis: t=0 reacts late and overlooks half the bolts, t=1 reacts at once and sees all.
function skillPolicy(t, seed, { collect = true } = {}) {
  const r = mulberry(seed * 7919 + 13);
  const delay = Math.round((1 - t) * 20);
  const lapse = (1 - t) * 0.5;
  const seen = new Map();
  return (st) => {
    const danger = new Set();
    for (const b of st.bolts) {
      if (!seen.has(b.id)) seen.set(b.id, r() >= lapse);
      if (seen.get(b.id) && st.tick - b.firedAt >= delay) danger.add(b.lane);
    }
    let target = st.lane;
    if (collect && st.coin && !danger.has(st.coin.lane)) target = st.coin.lane;
    if (danger.has(target)) target = [1, 0, 2].find((l) => !danger.has(l)) ?? st.lane;
    return { move: Math.sign(target - st.lane) };
  };
}

module.exports = {
  tickS: 1 / 60,
  intent: { core: "collect", primaryThreat: "bolt", regions: ["top", "mid", "bottom"], threats: ["bolt", "dud"] },
  create: core.create,
  step: core.step,
  ended: core.ended,
  clone: (st) => structuredClone(st),
  events: (st) => st.events,
  region: (st) => ["top", "mid", "bottom"][st.lane],
  threatPresent: (st) => st.bolts.length > 0,
  result: (st) => ({ score: st.score, progress: st.coins, success: st.lives > 0 && st.tick >= core.TICKS, failures: st.hits ? { bolt: st.hits } : {} }),
  skillPolicy,
  policies: {
    idle: { profile: "baseline", make: () => () => ({}) },
    survivor: { profile: "precise", role: "survive_only", make: (seed) => skillPolicy(1, seed, { collect: false }) },
    human: { profile: "human-limited", make: (seed) => skillPolicy(0.5, seed) },
    strong: { profile: "precise", make: (seed) => skillPolicy(1, seed) },
  },
};
