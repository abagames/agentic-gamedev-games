// OVERTURN — simulated players (browser global OTBots / Node module). A policy is make(seed) -> (state) -> { dir }.
(function (root) {
  'use strict';
  const OT = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.OT;
  const C = OT.C;
  function rng(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = r => (r() + r() + r() + r() - 2) * 1.73; // ~N(0,1)
  const LAMP_W = typeof process !== 'undefined' && process.env && process.env.OT_LAMP_W !== undefined ? +process.env.OT_LAMP_W : 0.5; // how much an imagined future is worth per lit lamp (overridable for experiments)
  const wrap = a => { a = OT.mod(a + Math.PI, OT.TAU) - Math.PI; return a; };

  // value of an imagined future: staying alive first, then what the rim is worth and what was knocked down
  // greed: how much points count against the state of the rim. 1 plays for score; a cautious person plays below that
  function value(s0, s, lostAt, greed) {
    let hp = 0, holes = 0; for (const h of s.segs) { if (h > 0) hp += h; else holes++; }
    const g = greed === undefined ? 1 : greed;
    const v = hp - 3 * holes + g * (s.score - s0.score) / (100 * s0.mult) + LAMP_W * OT.lit(s) + 10 * (s.bs.length - s0.bs.length) - 40 * (s.stats.saves - s0.stats.saves) + 3 * (s.save - s0.save) + 30 * (s.balls - s0.balls);
    return lostAt >= 0 ? -10000 + lostAt + v * 0.1 : v;
  }
  // roll one plan out at the game's own tick: `lead` ticks of the input already committed, a1 for n1 ticks, then a2
  function rollout(st, cur, lead, a1, n1, a2, H, greed) {
    const s = OT.clone(st); let lostAt = -1;
    for (let k = 0; k < H; k++) {
      OT.step(s, { dir: k < lead ? cur : k < lead + n1 ? a1 : a2 });
      if (s.phase !== 'play') { lostAt = k; break; }
    }
    return value(st, s, lostAt, greed);
  }
  function choose(st, cur, lead, o, noise, r) {
    let best = -Infinity, pick = 0;
    for (const a1 of [0, -1, 1]) for (const n1 of o.n1) for (const a2 of [0, -1, 1]) {
      const v = rollout(st, cur, lead, a1, n1, a2, o.H, o.greed) + (noise ? gauss(r) * noise : 0) - (a1 !== cur ? 0.01 : 0);
      if (v > best) { best = v; pick = a1; }
    }
    return pick;
  }

  // precise look-ahead over copied states: sees everything, acts at once, re-plans every few ticks
  const strong = (o) => seed => { o = Object.assign({ every: 3, n1: [5, 12, 24, 45], H: 170 }, o); let cur = 0;
    return st => { if (st.phase !== 'play') return { dir: 0 }; if (st.t % o.every === 0) cur = choose(st, cur, 0, o, 0, null); return { dir: cur }; }; };

  // a modelled person: decides a few times a second, acts late, misreads the ball's speed and the table's angle, sometimes does not look
  const human = (o) => seed => {
    o = Object.assign({ every: 12, lat: 11, n1: [12, 28], H: 110, read: 0.1, ang: 0.07, noise: 2.5, lapse: 0.08 }, o);
    const r = rng(seed * 7 + 3); let cur = 0; const pend = [];
    return st => {
      while (pend.length && pend[0].at <= st.t) cur = pend.shift().dir;
      if (st.phase !== 'play') return { dir: cur = 0 };
      if (st.t % o.every === 0 && r() >= o.lapse) {
        const seen = OT.clone(st); for (const b of seen.bs) { b.vx *= 1 + gauss(r) * o.read; b.vy *= 1 + gauss(r) * o.read; } seen.th += gauss(r) * o.ang;
        const last = pend.length ? pend[pend.length - 1].dir : cur;
        pend.push({ at: st.t + o.lat, dir: choose(seen, last, o.lat, o, o.noise, r) });
      }
      return { dir: cur };
    };
  };

  const policies = {
    idle: seed => st => ({ dir: 0 }),
    hold: seed => st => ({ dir: 1 }),
    // one rim section on after every bounce
    stepper: seed => { let until = 0, seen = 0; const n = Math.round(OT.SEG_A / C.OMEGA / C.TICK) + 2;
      return st => { if (st.stats.bounces !== seen) { seen = st.stats.bounces; until = st.t + n; } return { dir: st.t < until ? 1 : 0 }; }; },
    // bring the nearest standing target to the bottom of the screen, whatever the rim under it looks like
    greedy: seed => st => {
      let best = 9, d = 0;
      for (let i = 0; i < OT.TARGETS.length; i++) if (st.up[i]) { const T = OT.TARGETS[i], a = wrap(Math.PI / 2 - (st.th + Math.atan2(T.y, T.x))); if (Math.abs(a) < Math.abs(best)) best = a; }
      if (best !== 9 && Math.abs(best) > 0.05) d = best > 0 ? 1 : -1;
      return { dir: d };
    },
    // back and forth on a fixed beat, and random stabbing: input patterns that read nothing
    wiggle: seed => st => ({ dir: (st.t / 24 | 0) % 2 ? 1 : -1 }),
    mash: seed => { const r = rng(seed + 11); let d = 0; return st => { if (st.t % 8 === 0) d = ((r() * 3) | 0) - 1; return { dir: d }; }; },
    // fitted to three later play reports (builds 27, 31, 34): quick, steady reactions, but the table's angle is misjudged enough that faces are missed while landings still find a section
    regular: human({ ang: 0.22, every: 10, lat: 9, lapse: 0.04 }),
    human: human({}),
    player: human({ every: 20, lat: 18, read: 0.22, ang: 0.15, noise: 8, lapse: 0.25, H: 70 }), // fitted to the play report on build 02-slice
    novice: human({ every: 16, lat: 16, read: 0.18, ang: 0.12, noise: 5, lapse: 0.18, H: 80 }),
    strong: strong({}),
  };
  const api = { policies, strong, human, rollout, value };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OTBots = api;
})(this);
