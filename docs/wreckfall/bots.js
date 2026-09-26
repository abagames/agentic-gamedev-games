// WRECKFALL simulated players. Browser (window.WFBots) and node (require).
(function (root) {
  "use strict";
  const WF = typeof module !== "undefined" && module.exports ? require("./core.js") : root.WF;
  const { W, DT, CFG } = WF;

  function gauss(r) {
    let u = 0;
    for (let i = 0; i < 4; i++) u += r();
    return (u - 2) * 1.73;
  }
  function mkRand(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- plan simulation -------------------------------------------------------
  // plan: { x, wait, dodgeX } -> move to x, wait, fire, move to dodgeX until the shot and its wreck resolve.
  const opts_farmRoom = 14;
  let opts_lookPast = 0; // set per planning call (oracle: 0.6 s)
  function runPlan(s0, plan, maxT, mode) {
    const c = WF.clone(s0);
    const before = new Set(c.wrecks.map((w) => w.id));
    const score0 = c.score;
    const kills0 = c.stats.kills;
    let fired = false;
    let wait = plan.wait;
    let t = 0;
    let chain = 0;
    let tFire = 0;
    let plates = 0; // plates knocked off thick hulks: real progress with no points
    const steps = Math.ceil(maxT / DT);
    for (let i = 0; i < steps; i++) {
      const input = {};
      if (!fired) {
        input.targetX = plan.x;
        if (Math.abs(c.player.x - plan.x) < 1.5) {
          wait -= DT;
          if (wait <= 0 && !c.shot && c.mode === "play") input.fire = true;
        }
      } else input.targetX = plan.dodgeX;
      WF.step(c, input);
      t += DT;
      for (const e of c.events) {
        if (e.type === "bounce" && e.plate) plates++;
        if (e.type === "fire") { fired = true; tFire = t; }
        if (e.type === "land") chain = Math.max(chain, e.n);
      }
      if (c.mode === "dead" || c.mode === "over") return { dead: true, t, value: -1e6 + t * 1000 };
      if (c.mode === "clear") {
        if (mode === "farm") {
          const r = CFG.invadeY - WF.laneY(s0, 4);
          if (r > opts_farmRoom + 4) return { dead: false, t, value: -1e5, chain };
          return { dead: false, t, value: c.score - score0, clear: true, chain };
        }
        return { dead: false, t, value: 5000 + (c.score - score0) - (mode === "greedy" ? 200 * tFire : 0), clear: true, chain };
      }
      if (fired && !c.shot && c.wrecks.every((w) => before.has(w.id))) break;
    }
    // look a little past the plan: holding the dodge spot must stay safe from what is still falling
    if (opts_lookPast && c.mode === "play") {
      for (let i = 0; i < Math.round(opts_lookPast / DT); i++) {
        WF.step(c, { targetX: fired ? plan.dodgeX : plan.x });
        if (c.mode === "dead" || c.mode === "over") return { dead: true, t, value: -1e6 + t * 1000 };
        if (c.mode !== "play") break;
      }
    }
    const dk = c.stats.kills - kills0 + plates;
    const ds = c.score - score0;
    // urgency: when the formation is low, kills matter more than points
    let lowest = -1;
    for (const e of c.enemies) if (e.alive && e.lane > lowest) lowest = e.lane;
    const room = lowest < 0 ? 200 : CFG.invadeY - WF.laneY(c, lowest);
    const urgency = room < 40 ? 3 : 1;
    // farm (exploit probe): score as much as possible, crush the last hulk only near the line
    if (mode === "farm") {
      if (WF.hulksLeft(c) === 0 && room > opts_farmRoom) return { dead: false, t, value: -1e5, chain, fired };
      return { dead: false, t, value: ds - 20 * t + (fired ? 0 : -200), chain, fired };
    }
    // greedy control: any kill, as soon as possible; chains are incidental
    if (mode === "greedy") return { dead: false, t, value: (dk > 0 ? 1000 : 0) - 200 * (fired ? tFire : t) - (fired ? 0 : 500), chain, fired };
    return { dead: false, t, value: ds + 60 * dk * urgency - 45 * t + (fired ? 0 : -200), chain, fired };
  }

  function candidates(s, opts) {
    const out = [];
    const px = s.player.x;
    const reach = opts.reach || 999;
    for (let x = 8; x <= W - 8; x += opts.xStep || 8) {
      if (Math.abs(x - px) > reach) continue;
      for (const wait of opts.waits || [0, 0.3, 0.6]) {
        for (const d of opts.dodges || [-26, 26]) {
          const dodgeX = Math.max(8, Math.min(W - 8, x + d));
          out.push({ x, wait, dodgeX });
        }
      }
    }
    return out;
  }

  function planBest(s, opts, rand) {
    let best = null;
    const scored = [];
    for (const p of candidates(s, opts)) {
      opts_lookPast = opts.lookPast || 0;
      const r = runPlan(s, p, opts.maxT || 3.2, opts.mode);
      scored.push({ p, r });
    }
    scored.sort((a, b) => b.r.value - a.r.value);
    if (!scored.length) return null;
    if (opts.pickTop && rand) {
      // humans settle for one of the obviously good options
      const alive = scored.filter((q) => !q.r.dead);
      const top = alive.slice(0, opts.pickTop);
      if (top.length) best = top[Math.floor(rand() * top.length)];
    }
    return (best || scored[0]).p;
  }

  // ---- threat reading for reactive dodging ----------------------------------------
  function hitsAt(s, x, horizon, seenFilter) {
    const half = CFG.playerHalfW + 2;
    for (const b of s.bombs) {
      if (seenFilter && !seenFilter(b)) continue;
      const tt = (CFG.playerY - 4 - b.y) / CFG.bombSpeed;
      if (tt < -0.05 || tt > horizon) continue;
      if (Math.abs(b.x - x) <= half) return true;
    }
    for (const w of s.wrecks) {
      if (seenFilter && !seenFilter(w)) continue;
      const pl = WF.predictLanding(s, w);
      if (pl.t > horizon) continue;
      if (Math.abs(pl.x - x) <= w.w / 2 + half + 6) return true;
      const mid = w.x + (pl.x - w.x) * 0.9;
      if (Math.abs(mid - x) <= w.w / 2 + half + 4) return true;
    }
    return false;
  }

  function safeX(s, from, seenFilter) {
    if (!hitsAt(s, from, 1.4, seenFilter)) return from;
    let best = from;
    let bestD = Infinity;
    for (let x = 8; x <= W - 8; x += 4) {
      const d = Math.abs(x - from);
      const arrive = d / CFG.playerSpeed;
      if (hitsAt(s, x, 1.4, seenFilter)) continue;
      // path check: something landing on the path before we pass
      let blocked = false;
      for (let k = 1; k < 4; k++) {
        const xm = from + ((x - from) * k) / 4;
        if (hitsAt(s, xm, (arrive * k) / 4 + 0.1, seenFilter)) { blocked = true; break; }
      }
      const cost = d + (blocked ? 400 : 0);
      if (cost < bestD) { bestD = cost; best = x; }
    }
    return best;
  }

  // ---- policies -----------------------------------------------------------------------
  function idleBot() {
    return { name: "idle", update: () => ({}) };
  }

  function mashBot() {
    let k = 0;
    return { name: "mash", update: (s) => ({ targetX: W / 2, fire: k++ % 12 < 6 }) };
  }

  // Greedy: go under the enemy you can hit soonest, fire, dodge with perfect threat info.
  function nearestBot(opts) {
    opts = opts || {};
    let pressed = false;
    return {
      name: opts.name || "nearest",
      update(s) {
        if (s.mode !== "play") { pressed = false; return {}; }
        const px = s.player.x;
        const escape = safeX(s, px);
        if (escape !== px) { pressed = false; return { targetX: escape }; }
        // lowest living enemy per column: pick closest predicted x
        let best = null;
        let bestD = Infinity;
        for (const e of s.enemies) {
          if (!e.alive) continue;
          const y = WF.laneY(s, e.lane);
          const tShot = (CFG.playerY - y) / CFG.shotSpeed;
          const d0 = Math.abs(e.x - px);
          const tMove = d0 / CFG.playerSpeed;
          const ex = e.x + WF.laneV(s, e.lane) * (tMove + tShot);
          if (ex < 8 || ex > W - 8) continue;
          const d = Math.abs(ex - px) - e.lane * 3;
          if (d < bestD) { bestD = d; best = { x: ex, e }; }
        }
        if (!best) return {};
        const tx = best.x;
        const fire = !s.shot && Math.abs(tx - px) < 3 && !pressed && !hitsAt(s, px, 0.5);
        pressed = fire;
        return { targetX: tx, fire };
      },
    };
  }

  // Oracle: exact forward simulation of every candidate plan, perfect execution.
  function oracleBot(opts) {
    opts = Object.assign({ xStep: 8, waits: [0, 0.3, 0.6], dodges: [-26, 26], maxT: 3.2, lookPast: 0.6 }, opts || {});
    let plan = null;
    let fired = false;
    let wait = 0;
    let before = null;
    const waits = [];
    return {
      name: opts.name || "oracle",
      waits,
      update(s) {
        if (s.mode !== "play") { plan = null; return {}; }
        if (plan && fired && !s.shot && s.wrecks.every((w) => before.has(w.id))) plan = null;
        if (!plan) {
          plan = planBest(s, opts);
          fired = false;
          wait = plan ? plan.wait : 0;
          if (plan) waits.push(plan.wait);
          before = new Set(s.wrecks.map((w) => w.id));
          if (!plan) return {};
        }
        const input = {};
        if (!fired) {
          input.targetX = plan.x;
          if (Math.abs(s.player.x - plan.x) < 1.5) {
            wait -= DT;
            if (wait <= 0 && !s.shot) { input.fire = true; fired = true; }
          }
        } else input.targetX = plan.dodgeX;
        return input;
      },
    };
  }

  // Human-limited: plans from a noisy, stale read of the lanes, considers only nearby options,
  // settles for one of the good ones, fires with timing error, reacts late to new danger,
  // sometimes misses a secondary threat, and cannot fire faster than a person re-aims.
  function humanBot(opts) {
    opts = Object.assign(
      {
        seed: 1,
        reaction: 0.28, // s before a new bomb/wreck is noticed
        lapse: 0.15, // chance a threat is noticed late
        lapseExtra: 0.45,
        posErr: 4, // px sd in reading an enemy's position
        timeErr: 0.07, // s sd firing timing
        settle: 0.35, // min s between a shot resolving and the next plan
        reach: 64,
        reorient: 0.6, // s to re-read the board after a lane flips direction
        waits: [0, 0.4],
        dodges: [-24, 24],
        xStep: 8,
        pickTop: 3,
        dodgeLag: 0.18,
      },
      opts || {}
    );
    const rand = mkRand(opts.seed * 7919 + 13);
    const seenAt = new Map(); // object id/key -> time noticed
    let plan = null;
    let fired = false;
    let wait = 0;
    let firedAt = -9;
    let settleUntil = 0;
    let before = null;
    let dodgeGoal = null;
    let dodgeDecideAt = 0;
    let pressedLast = false;

    function noticeFilter(s) {
      return (o) => {
        const seen = seenAt.get(o.id);
        return seen != null && s.t >= seen;
      };
    }

    return {
      name: opts.name || "human",
      update(s) {
        if (s.mode !== "play") { plan = null; dodgeGoal = null; pressedLast = false; return {}; }
        for (const e of s.events) if (e.type === "reverse") { plan = null; settleUntil = Math.max(settleUntil, s.t + opts.reorient); }
        // notice new threats with latency (+ lapses)
        for (const w of s.wrecks) {
          if (!seenAt.has(w.id)) seenAt.set(w.id, s.t + opts.reaction * 0.6 + (rand() < opts.lapse ? opts.lapseExtra : 0));
        }
        for (const b of s.bombs) {
          if (!seenAt.has(b.id)) seenAt.set(b.id, s.t + opts.reaction + (rand() < opts.lapse ? opts.lapseExtra : 0));
        }
        const px = s.player.x;
        const seen = noticeFilter(s);
        // reactive dodge overrides planning, re-decided at human cadence
        if (hitsAt(s, px, 1.1, seen) || (dodgeGoal != null && Math.abs(px - dodgeGoal) > 1.5)) {
          if (dodgeGoal == null || s.t >= dodgeDecideAt) {
            dodgeGoal = safeX(s, px, seen) + gauss(rand) * 2;
            dodgeDecideAt = s.t + 0.25;
          }
          if (Math.abs(px - dodgeGoal) > 1.5) { plan = null; pressedLast = false; return { targetX: dodgeGoal }; }
        }
        dodgeGoal = null;
        if (plan && fired && !s.shot && s.wrecks.every((w) => before.has(w.id))) {
          plan = null;
          settleUntil = s.t + opts.settle;
        }
        if (!plan) {
          if (s.t < settleUntil || s.shot) return {};
          // noisy, reach-limited read of the formation
          const view = WF.clone(s);
          const laneErr = [0, 1, 2, 3, 4].map(() => gauss(rand) * opts.posErr);
          for (const e of view.enemies) e.x += laneErr[e.lane];
          plan = planBest(view, opts, rand);
          if (!plan) return {};
          plan = Object.assign({}, plan, { x: Math.max(8, Math.min(W - 8, plan.x + gauss(rand) * 1.5)) });
          fired = false;
          wait = Math.max(0, plan.wait + gauss(rand) * opts.timeErr);
          before = new Set(s.wrecks.map((w) => w.id));
        }
        const input = {};
        if (!fired) {
          input.targetX = plan.x;
          if (Math.abs(px - plan.x) < 1.5) {
            wait -= DT;
            if (wait <= 0 && !s.shot && !pressedLast) { input.fire = true; fired = true; firedAt = s.t; }
          }
        } else if (s.t - firedAt >= opts.dodgeLag) input.targetX = plan.dodgeX;
        pressedLast = !!input.fire;
        return input;
      },
    };
  }

  // run a whole game with a policy; returns summary
  function playGame(seed, bot, opts) {
    opts = opts || {};
    const s = WF.createGame(seed);
    const maxT = opts.maxT || 600;
    const log = [];
    while (s.mode !== "over" && s.t < maxT) {
      const input = bot.update(s) || {};
      WF.step(s, input);
      if (opts.log) for (const e of s.events) log.push(Object.assign({ t: s.t }, e));
      if (opts.maxWave && s.wave > opts.maxWave) break;
    }
    const ch = s.stats.chains;
    return {
      seed,
      bot: bot.name,
      score: s.score,
      wave: s.wave,
      wavesCleared: s.stats.wavesCleared,
      t: s.t,
      over: s.mode === "over",
      shots: s.stats.shots,
      kills: s.stats.kills,
      chains: ch,
      meanChain: ch.length ? ch.reduce((a, b) => a + b, 0) / ch.length : 0,
      maxChain: ch.length ? Math.max(...ch) : 0,
      deaths: s.stats.deaths,
      waveTimes: s.stats.waveTimes,
      log,
    };
  }

  const api = { runPlan, planBest, hitsAt, safeX, idleBot, mashBot, nearestBot, oracleBot, humanBot, playGame, mkRand };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WFBots = api;
})(typeof window !== "undefined" ? window : globalThis);
