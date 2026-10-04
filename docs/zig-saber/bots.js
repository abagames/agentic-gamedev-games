// ZIG SABER — simulated players (browser global ZSBots / Node module).
// Ladder: idle / mash / survivor (rock only) / shooter (fires at anything in its row)
//         <  human-limited planner  <  precise planner (visible state)  <  oracle planner (knows the entry script).
(function (root) {
  'use strict';
  const ZS = root.ZS || (typeof require !== 'undefined' ? require('./core.js') : null);
  const { C } = ZS;
  function gauss(r) { return (r() + r() + r() + r() - 2) * 1.7; }

  // ---------- rock table: from which (scroll step, height, heading) can the ship still reach the end of the course,
  // if two presses are at least G ticks apart and the hull keeps `margin` px off the rock? Enemies are not in it. ----------
  const Q = 0.4, NY = Math.round(C.H / Q) + 1, DQ = Math.round(C.VY / Q);
  const kOf = st => Math.round(st.camX / C.SCROLL), yOf = y => Math.round(y / Q);
  function table(co, G, margin) {
    const key = 'tab' + G + '_' + margin; if (co[key]) return co[key];
    const K = Math.round(co.n * 8 / C.SCROLL) - Math.round((C.SHIP_X + 16) / C.SCROLL), free = new Uint8Array((K + 1) * NY), m = margin;
    for (let k = 0; k <= K; k++) {
      const wx = k * C.SCROLL + C.SHIP_X;
      for (let q = 0; q < NY; q++) { const y = q * Q; free[k * NY + q] = (y > C.HUD + 3 && y < C.H - 3 && !ZS.hitsRock(co, wx, y, m) && !(m && (ZS.solid(co, wx + 5 + m, y - 2 - m) || ZS.solid(co, wx + 5 + m, y + 2 + m)))) ? 1 : 0; }
    }
    const A = [new Uint8Array((K + 1) * NY), new Uint8Array((K + 1) * NY)]; // [heading up, heading down]
    for (let q = 0; q < NY; q++) A[0][K * NY + q] = A[1][K * NY + q] = free[K * NY + q];
    for (let k = K - 1; k >= 0; k--) for (let d = 0; d < 2; d++) {
      const dq = d ? DQ : -DQ, row = k * NY;
      for (let q = 0; q < NY; q++) {
        if (!free[row + q]) continue;
        const q1 = q + dq; let ok = q1 >= 0 && q1 < NY && A[d][row + NY + q1];
        if (!ok) { // press now: fly G ticks the other way, then be alive there
          ok = 1; let j = 1;
          for (; j <= G && k + j <= K; j++) { const qq = q - dq * j; if (qq < 0 || qq >= NY || !free[(k + j) * NY + qq]) { ok = 0; break; } }
          if (ok) { j--; ok = A[1 - d][(k + j) * NY + q - dq * j]; }
        }
        A[d][row + q] = ok ? 1 : 0;
      }
    }
    return (co[key] = { A, free, K, G });
  }
  function alive(tab, k, q, dir) { if (k >= tab.K) return 1; if (q < 0 || q >= NY) return 0; return tab.A[dir > 0 ? 1 : 0][k * NY + q]; }
  // would a press now still leave a way through the rock?
  function pressAlive(st, tab) {
    const k = kOf(st), q = yOf(st.ship.y), dq = st.ship.dir * DQ; let j = 1;
    for (; j <= tab.G && k + j <= tab.K; j++) { const qq = q - dq * j; if (qq < 0 || qq >= NY || !tab.free[(k + j) * NY + qq]) return false; }
    j--; return !!alive(tab, k + j, q - dq * j, -st.ship.dir);
  }
  // does the rock ask for a press now? True when flying straight for `look` more ticks leaves the alive set
  // and turning here is itself safe (otherwise the turn has to wait).
  function mustTurn(st, tab, look) {
    const k = kOf(st), q = yOf(st.ship.y), dq = st.ship.dir * DQ;
    for (let j = 1; j <= look; j++) if (!alive(tab, k + j, q + dq * j, st.ship.dir)) return j === 1 || pressAlive(st, tab);
    return false;
  }
  const doomed = (st, tab) => !alive(tab, kOf(st), yOf(st.ship.y), st.ship.dir);

  // Roll out "press after d1, then after d2 more, then only when the rock demands it" and value it.
  function rollout(st0, d1, d2, H, tab, look, fear) {
    const st = ZS.clone(st0), s0 = st.score; let p1 = d1, p2 = -1, last = -99;
    for (let t = 0; t < H; t++) {
      if (st.phase !== 'play') break;
      let pr = false;
      if (p1 >= 0) { if (t === p1) { pr = true; p1 = -1; p2 = d2 < 0 ? -2 : t + d2; } }
      else if (p2 >= 0) { if (t === p2) { pr = true; p2 = -2; } }
      else if (t - last >= tab.G && mustTurn(st, tab, look)) pr = true;
      if (pr) last = t;
      ZS.step(st, pr);
      if (st.phase === 'dead') return st.score - s0 - (fear || 6000) + t * 12;
    }
    return st.score - s0 + st.laser * 60 + (st.laser ? st.laserT * 0.15 : 0) - (st.phase === 'play' && doomed(st, tab) ? 4000 : 0);
  }
  const D1 = [0, 3, 6, 9, 12, 16, 20, 25, 30, 36, 44, -1], D2 = [6, 12, 20, 32, -1];
  // slack > 0: a plan is worth only what it still yields when its presses land `slack` ticks early or late
  function plan(st, H, tab, look, minFirst, fear, slack) {
    let best = -1e9, bd = -1;
    for (const d1 of D1) {
      if (d1 >= 0 && d1 < minFirst) continue;
      for (const d2 of d1 < 0 ? [-1] : D2) {
        if (d2 >= 0 && d2 < tab.G) continue;
        let v = rollout(st, d1, d2, H, tab, look, fear) - (d1 < 0 ? 0 : 1);
        if (slack && d1 >= 0 && v > best) v = Math.min(v, rollout(st, d1 + slack, d2, H, tab, look, fear), rollout(st, Math.max(minFirst, d1 - slack), d2 < 0 ? d2 : d2 + slack, H, tab, look, fear));
        if (v > best) { best = v; bd = d1; }
      }
    }
    return { d: bd, v: best };
  }

  const simple = {
    idle: () => () => false,
    mash: n => { let k = 0; return () => (++k % n) === 0; },
    // rock only, turning as late as is safe
    survivor: () => { let last = -99; return st => { const tab = table(st.course, 6, 1); if (st.t - last >= 6 && mustTurn(st, tab, 3)) { last = st.t; return true; } return false; }; },
    // survivor that also fires as soon as anything shootable is in its row: never waits for the blade
    shooter: () => {
      let last = -99; return st => {
        const tab = table(st.course, 6, 1); if (st.t - last < 6) return false;
        const y = st.ship.y, tgt = !st.shot && st.enemies.some(e => ZS.inSwing(e, y, st.ship.dir) && e.x > C.SHIP_X + 10 && e.type !== 'shell');
        const k = kOf(st), q = yOf(y), ok = alive(tab, k + 1, q - st.ship.dir * DQ, -st.ship.dir);
        if (mustTurn(st, tab, 3) || (tgt && ok)) { last = st.t; return true; } return false;
      };
    },
  };
  // what is on screen: enemies, and the entries already announced by a marker (seen `react` ticks after it lights)
  function blind(st, react) { const v = ZS.clone(st); v.nextEv = v.course.events.length; v.pending = v.pending.filter(p => p.stage === 1 && p.at - ZS.C.MARK <= st.t - (react || 0)); return v; }
  // precise: visible state only (no knowledge of entries still off screen), perfect timing, presses >= 4 ticks apart
  function precise(o) {
    o = o || {}; const every = o.every || 3, G = o.G || 4; let at = -1, last = -99;
    return st => {
      const tab = table(st.course, G, 0);
      if (st.t % every === 0) { const p = plan(o.oracle ? st : blind(st), o.H || 90, tab, 1, Math.max(0, G - (st.t - last))); at = p.d < 0 ? -1 : st.t + p.d; }
      if (st.t - last >= G && (at >= 0 ? st.t >= at : mustTurn(st, tab, 1))) { at = -1; last = st.t; return true; }
      return false;
    };
  }
  const oracle = o => precise(Object.assign({ oracle: true }, o));

  // human-limited: sees an enemy only `react` ticks after it enters, misreads positions (a target's height against its own by about 7 px), replans a few times a second,
  // cannot retract a press that is about to happen, presses with timing error, keeps presses >= minGap ticks apart,
  // turns from rock `look` ticks early, and sometimes watches only the rock for a while.
  function human(seed, o) {
    o = Object.assign({ react: 16, every: 9, commit: 7, jitter: 4, xErr: 8, yErr: 7, minGap: 9, lapse: 0.05, lapseLen: 45, look: 14, margin: 2, fear: 6000, berth: 2, slack: 5 }, o || {});
    const r = ZS.mulberry(seed * 7919 + 13); let at = -1, last = -99, lapseTo = -1, phase = '', turnAt = -1;
    return st => {
      if (st.phase !== phase) { phase = st.phase; at = -1; turnAt = -1; }
      if (st.phase !== 'play') return false;
      const tab = table(st.course, o.minGap, o.margin);
      if (st.t % 60 === 0 && r() < o.lapse * 4) lapseTo = st.t + o.lapseLen;
      if (st.t % o.every === 0 && !(at >= 0 && at - st.t < o.commit)) {
        const v = blind(st, o.react), lapse = st.t < lapseTo;
        if (lapse) v.pending = [];
        v.enemies = lapse ? [] : v.enemies.filter(e => e.age >= o.react || e.warn);
        if (lapse) v.items = [];
        v.pad = o.berth;
        for (const e of v.enemies) { e.x += gauss(r) * o.xErr; e.y += gauss(r) * o.yErr; } // people judge the height of a target against their own badly
        const p = plan(v, 90, tab, o.look, Math.max(0, o.minGap - (st.t - last)), o.fear, o.slack);
        at = p.d < 0 ? -1 : st.t + Math.max(0, Math.round(p.d + gauss(r) * o.jitter));
      }
      // the rock turn is also a timed press: decided `look` ticks ahead, executed with the same timing error
      if (at < 0 && turnAt < 0 && mustTurn(st, tab, o.look)) turnAt = st.t + Math.max(0, Math.round(o.look * 0.25 + gauss(r) * o.jitter));
      if (st.t - last >= o.minGap && (at >= 0 ? st.t >= at : turnAt >= 0 && st.t >= turnAt)) { at = -1; turnAt = -1; last = st.t; return true; }
      return false;
    };
  }

  // expert: the same limits, practised: quicker to notice, steadier hands, no lapses. Same press rate and planning cadence.
  const expert = (seed, o) => human(seed, Object.assign({ react: 10, jitter: 2, xErr: 4, yErr: 4, lapse: 0, slack: 3 }, o || {}));

  function run(bot, opts) {
    opts = opts || {};
    const st = ZS.newGame(opts), max = opts.maxFrames || 60 * 60 * 12, gaps = []; let lastP = -1; const loopAt = [];
    while (st.phase !== 'over' && st.t < max) {
      const pr = st.phase === 'play' && !!bot(st);
      if (pr) { if (lastP >= 0) gaps.push(st.t - lastP); lastP = st.t; }
      ZS.step(st, pr);
      for (const e of st.events) if (e.type === 'loop') loopAt.push(st.t);
      if (opts.loops && st.stats.loops >= opts.loops) break;
    }
    gaps.sort((a, b) => a - b);
    return { cleared: !!st.cleared, gates: st.stats.bossKills, score: st.score, t: st.t, loop: st.loop, zone: st.zone, zones: st.stats.zones, stats: st.stats, lives: st.lives, loopAt, minGap: gaps[0] || 0, p10Gap: gaps[Math.floor(gaps.length * 0.1)] || 0, perSec: st.stats.presses / (st.t / 60) };
  }

  const api = { expert, pressAlive, simple, precise, oracle, human, run, table, alive, mustTurn, doomed, kOf, yOf, plan, rollout, NY, Q };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZSBots = api;
})(this);
