// HEAD RUSH — simulated players (browser global HRBots / Node module).
// Ladder: idle / hold-boost / mash / greedy-lane  <  human-limited planner  <  oracle planner.
(function (root) {
  'use strict';
  const HR = root.HR || (typeof require !== 'undefined' ? require('./core.js') : null);
  const { C, NR } = HR;

  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { return (r() + r() + r() + r() - 2) * 1.7; }

  function inZone(p) { return Math.abs(HR.gapOf(p.r, p.s).o) < C.GAPW; }
  // within the gap zone, or less than `lead` px before one
  function nearGap(p, lead) { const o = HR.gapOf(p.r, p.s).o; return o > -C.GAPW - lead && o < C.GAPW; }

  // Roll out a plan [d1, d2] with boost mode 0 off / 1 on / 2 on until first gap.
  function rollout(st0, plan, boostMode, horizon, w, lead) {
    lead = lead == null ? 6 : lead;
    const st = HR.clone(st0);
    const s0 = st.score, t0 = st.stats.crashes;
    let done = 0, was = inZone(st.player) && st.player.can, crashedAt = -1, n = 0;
    for (let t = 0; t < horizon; t++) {
      if (st.phase !== 'play') { if (st.phase === 'crash') { crashedAt = t; break; } if (st.phase === 'over') break; }
      const d0 = done < plan.length ? plan[done] : 0, d = n < Math.abs(d0) ? Math.sign(d0) : 0;
      const b = boostMode === 1 || (boostMode === 2 && !nearGap(st.player, lead));
      HR.step(st, { inHeld: d > 0, outHeld: d < 0, boost: b });
      for (const e of st.events) if (e.type === 'shift' && e.who === 'p') n++;
      const now = inZone(st.player);
      if (was && !now) { done++; n = 0; }
      was = now;
    }
    let v = st.score - s0;
    if (st.stats.crashes > t0 || crashedAt >= 0) return v - w.crash + crashedAt * 5;
    // shaping: head for dots / flag, and while powered for the convoy
    const [px, py] = HR.carXY(st.player);
    let nd = 1e9;
    const Gm = HR.use(st), ring = Gm.byRing;
    for (let r = 0; r < NR; r++) for (const i of ring[r]) if (st.dots[i] && !Gm.dots[i].power) { const d = Gm.dots[i]; const dd = Math.abs(d.x - px) + Math.abs(d.y - py); if (dd < nd) nd = dd; }
    if (nd < 1e9) v -= nd * w.dot;
    for (const it of st.items) { const [ix, iy] = HR.pos(it.r, it.s); v -= (Math.abs(ix - px) + Math.abs(iy - py)) * w.item; }
    if (st.fright > 20) {
      let nr = 1e9; for (const c of HR.rivals(st)) nr = Math.min(nr, Math.hypot(c.x - px, c.y - py) + (c.r === st.player.r ? 0 : 40));
      if (nr < 1e9) v -= nr * w.chase;
    }
    return v;
  }

  const PLANS = [];
  for (const a of [0, 1, -1, 2, -2]) for (const b of [0, 1, -1]) PLANS.push([a, b]);

  function plan(st, opts) {
    let best = null, bv = -Infinity;
    const plans = opts.plans || PLANS, boosts = opts.boosts || [0, 1, 2];
    for (const pl of plans) {
      if (st.player.r + pl[0] < 0 || st.player.r + pl[0] >= NR) continue;
      for (const bm of boosts) {
        if (bm === 1 && Math.abs(pl[0]) > (C.BOOST_LOCK ? C.BOOST_LANES : 9)) continue; // a turn plan never holds full throttle
        const v = rollout(st, pl, bm, opts.horizon, opts.w, opts.lead) + (opts.noise ? opts.noise() : 0);
        if (v > bv) { bv = v; best = { pl, bm }; }
      }
    }
    HR.use(st); // a rollout may have morphed its clone's layout
    return best;
  }

  const W_ORACLE = { crash: 6000, dot: 0.6, item: 2.5, chase: 6 };

  // Strong policy: exact state, 2-gap plans, 1.8 s horizon, replans every 6 ticks.
  function oracle(opts) {
    opts = Object.assign({ horizon: 200, every: 6, w: W_ORACLE }, opts || {});
    let cur = null, next = 0, done = 0, was = false, n = 0;
    return function (st) {
      if (st.phase !== 'play') { cur = null; return {}; }
      for (const e of st.events) if (e.type === 'shift' && e.who === 'p') n++;
      if (st.tick >= next || !cur) { cur = plan(st, opts); next = st.tick + opts.every; done = 0; n = 0; was = inZone(st.player) && st.player.can; }
      const now = inZone(st.player); if (was && !now) { done++; n = 0; } was = now;
      const d0 = cur ? (done < 2 ? cur.pl[done] : 0) : 0, d = n < Math.abs(d0) ? Math.sign(d0) : 0;
      return { inHeld: d > 0, outHeld: d < 0, boost: !!cur && (cur.bm === 1 || (cur.bm === 2 && !nearGap(st.player, 6))) };
    };
  }

  // Human-limited: stale lane-change perception (reaction ~0.27 s), position error,
  // attention lapses (ignores the convoy tail), one-gap plans, shorter horizon,
  // tap timing error against the gap window, lagged boost with minimum hold, 4-5 decisions/s.
  function human(seed, opts) {
    opts = Object.assign({ react: 16, posErr: 5, lapse: 0.3, blind: 0, horizon: 130, every: 13, tapSd: 4.5, boostLag: 9, early: 12, w: W_ORACLE }, opts || {});
    const r = mulberry(seed * 7919 + 13);
    const hist = [];
    let mode = 0, next = 0, press = null, lastPress = -99, boostWant = false, boost = false, boostAt = 0, boostSince = 0;
    const plans = opts.plans || (C.MULTI ? [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [1, 1], [-1, -1]] : [[0, 0], [1, 0], [-1, 0], [1, 1], [-1, -1]]);
    return function (st) {
      if (st.phase !== 'play') { press = null; hist.length = 0; return { boost: false }; }
      hist.push(st.leader ? { id: st.leader.id, r: st.leader.r } : null); if (hist.length > 60) hist.shift();
      const out = { boost };
      if (st.tick >= next) {
        next = st.tick + opts.every + Math.floor(r() * 4);
        const ps = HR.clone(st);
        // perception: lane changes seen late, positions misread, tail sometimes unchecked
        const old = hist[Math.max(0, hist.length - 1 - opts.react)];
        if (ps.leader && old && old.id === ps.leader.id && old.r !== ps.leader.r) {
          const g = HR.gapOf(ps.leader.r, ps.leader.s); ps.leader.r = old.r; ps.leader.s = HR.wrap(HR.gapS(old.r, g.k) + g.o, old.r); ps.leader.slT = 0;
          ps.leader.zk = g.k; ps.leader.can = false;
        }
        if (ps.leader) ps.leader.s = HR.wrap(ps.leader.s + gauss(r) * opts.posErr, ps.leader.r);
        if (r() < opts.lapse) ps.followers = [];
        if (r() < opts.blind) ps.aiBlind = true; // plans as if the rival keeps its lane after the blinker it shows now
        const b = plan(ps, { plans, boosts: opts.boosts || [0, 1, 2], horizon: opts.horizon, w: opts.w, lead: HR.speed(st) * C.BOOST / 60 * (opts.boostLag + opts.early), noise: () => gauss(r) * 40 });
        if (b) {
          mode = b.bm;
          const d = b.pl[0];
          if (d && st.tick - lastPress > 8) {
            const p = st.player;
            const v = HR.speed(st) * (boost ? C.BOOST : 1) / 60;
            const inz = inZone(p) && p.can;
            const used = inZone(p) && !p.can;
            const dist = used ? HR.distToGap(p.r, p.s + C.GAPW, 1) + C.GAPW : HR.distToGap(p.r, p.s, 1);
            const untilZone = inz ? 0 : Math.max(0, (dist - C.GAPW) / v);
            const t = st.tick + Math.max(2, Math.round(untilZone - 3 - (Math.abs(d) > 1 ? C.HOLD_MIN + 4 : 0) + gauss(r) * opts.tapSd)); // a multi-lane move starts holding early
            // re-aim the tap each decision; a tap already due keeps its (possibly erroneous) time
            if (!press || press.d !== d || press.t > t + 6) press = { t, d, hold: 0 };
          }
          if (!d) press = null;
        }
      }
            if (press && st.tick >= press.t && !press.hold) {
        out[press.d > 0 ? 'in' : 'out'] = true; lastPress = st.tick;
        if (Math.abs(press.d) > 1) { press.hold = 1; press.start = st.tick; } else press = null;
      }
      // two lanes: keep holding into the gap and let go by rhythm after the second crossing
      if (press && press.hold) {
        const p = st.player, dir = Math.sign(press.d);
        if (press.hold === 1 && inZone(p)) { press.hold = 2; press.until = Math.max(st.tick + Math.max(3, Math.round(C.CROSS - C.CROSS_STEP * st.tier)), press.start + C.HOLD_MIN) + 2 + Math.round(gauss(r) * 2); }
        if (press.hold === 2 && st.tick >= press.until) { press = null; }
        else out[dir > 0 ? 'inHeld' : 'outHeld'] = true;
        if (press && press.hold === 1 && st.tick - lastPress > 80) press = null;
      }
      // straights-only boost: let go a reaction-time ahead of the gap, with timing error
      const lead = HR.speed(st) * C.BOOST / 60 * (opts.boostLag + opts.early) + gauss(r) * 4;
      boostWant = mode === 1 || (mode === 2 && !nearGap(st.player, lead));
      if (boostWant !== boost) {
        if (!boostAt) boostAt = st.tick + opts.boostLag + Math.floor(r() * 6);
        if (st.tick >= boostAt && st.tick - boostSince > 18) { boost = boostWant; boostSince = st.tick; boostAt = 0; }
      } else boostAt = 0;
      out.boost = boost;
      return out;
    };
  }

  const simple = {
    idle: () => () => ({}),
    holdBoost: () => () => ({ boost: true }),
    mash: seed => { const r = mulberry(seed); return st => { const o = {}; if (st.tick % 9 === 0) { const x = r(); if (x < 0.4) o.in = true; else if (x < 0.8) o.out = true; } o.boost = r() < 0.5; return o; }; },
    // go to the lane with most dots, never looks at rivals
    greedy: () => st => {
      let best = st.player.r, bn = -1;
      for (let r = 0; r < NR; r++) { let n = 0; for (const i of HR.use(st).byRing[r]) if (st.dots[i]) n++; n -= Math.abs(r - st.player.r) * 2; if (n > bn) { bn = n; best = r; } }
      if (st.items.length) best = st.items[0].r;
      return { inHeld: best > st.player.r, outHeld: best < st.player.r };
    },
  };

  function run(policy, seed, opts) {
    const st = HR.create(seed, opts);
    let presses = 0, lastIn = false, lastOut = false;
    while (st.phase !== 'over') {
      const inp = policy(st) || {};
      if ((inp.in || (inp.inHeld && !lastIn)) || (inp.out || (inp.outHeld && !lastOut))) presses++;
      lastIn = !!inp.inHeld; lastOut = !!inp.outHeld;
      HR.step(st, inp);
    }
    return { score: st.score, tier: st.tier, stats: st.stats, presses, perMin: presses / 3 };
  }

  const HRBots = { oracle, human, simple, run, rollout, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = HRBots; else root.HRBots = HRBots;
})(this);
