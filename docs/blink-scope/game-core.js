// BLINK SCOPE — deterministic simulation core. No DOM, no audio.
// The renderer and the tests both drive this module.

export const TAU = Math.PI * 2;

export const CFG = {
  cx: 300,
  cy: 300,
  scopeR: 280, // landing beyond this radius loses the ship
  jumpR: 110, // fixed blink distance along the sweep
  // Times and speeds below are at game speed 1; see speedFor().
  sweepPeriod: 1.8, // seconds per revolution
  // "landing": the shot leaves the landing point. "origin": it leaves the point
  // you blink from and sweeps the jump path before you arrive (so a hunter
  // there is shot, not crashed into), then carries on past the landing point.
  shotFrom: "landing",
  shotSpeed: 900, // the blink shot leaves the landing point along the sweep
  shotRange: 260, // shot distance beyond the landing point
  shotW0: 20, // shot half-width at the landing point…
  shotSpread: 0.14, // …widening with distance, so the aim window is ~constant in angle
  revealExtra: 45, // the wavefront paints hunters this far beyond its hit band
  burstR: 40, // a destroyed hunter destroys others this close
  burstDelay: 0.07, // seconds between chain links
  contactR: 11, // hunter touching the ship — the one hitbox, also when landing from a blink
  aheadR: 134, // hunters closer than this can't be shot, only escaped (jumpR + 24)
  nearR: 28, // hunters this close to the ship are visible without a paint
  blipLife: 3.2, // painted blip fade time
  trackOut: 0.25, // a destroyed hunter's blips go out over this many seconds
  readyTime: 1.4,
  dyingTime: 1.6,
  clearTime: 2.2,
  respawnClearR: 150,
  extendFirst: 10000, // first extra ship…
  extendEvery: 20000, // …then one every this many points (10k, 30k, 50k …)
  lives: 3,
  finalSector: 10, // clearing this sector completes the game
  quotaBase: 10, // hunters to destroy in sector 1…
  quotaStep: 3, // …plus this many per later sector
  liveBase: 5, // hunters alive at once in sector 1…
  liveMax: 8, // …rising by one per sector up to this
  hunterSpeed: 26, // hunter speed at game speed 1
  // Points for chain link n: square 100n² (capped at n = 7) | linear 100n |
  // steep 100 + 300(n-1) | double 100·2^(n-1). Square + refund is the only
  // tested combination where neither "shoot now" nor "wait for clusters"
  // dominates (see README, Scoring).
  chainScore: "square",
  chainRefund: 2, // seconds of par given back per chain link beyond the first
  bonusPerHunter: 250, // max time bonus = this × quota…
  parPerHunter: 16.0, // …draining to 0 over this × quota / game speed seconds of play,
  parDecay: 0.045, // …shortened by this fraction per sector after the first (later sectors clear faster per hunter)
  speedBase: 1.2, // game speed in sector 1 (sweep 1.5 s)…
  speedStep: 0.07, // …times this much more per sector…
  speedMax: 1.3, // …up to this multiple of the base (sweep 1.15 s)
};

// Game speed k scales every rate together — sweep, hunters, spawns, shot,
// blip fade — so the spatial rules of thumb (how far a hunter closes in half a
// turn) hold in every sector; only the time the player has shrinks.
export function speedFor(sector) {
  return CFG.speedBase * Math.min(CFG.speedMax, 1 + CFG.speedStep * (sector - 1));
}

export function sectorParams(sector, k = speedFor(sector)) {
  const s = sector - 1;
  return {
    k,
    quota: CFG.quotaBase + CFG.quotaStep * s,
    liveCap: Math.min(CFG.liveMax, CFG.liveBase + s),
    spawnInterval: 1.0 / k,
    speed: CFG.hunterSpeed * k,
    turn: 1.7 * k,
  };
}

// Remaining fraction of the sector's time bonus (1 at the start, 0 at par).
export function bonusFrac(g) {
  const p = sectorParams(g.sector, g.k);
  const par = (CFG.parPerHunter * Math.max(0.3, 1 - CFG.parDecay * (g.sector - 1)) * p.quota) / g.k;
  return Math.max(0, 1 - g.sectorT / par);
}

export function timeBonus(g) {
  const p = sectorParams(g.sector, g.k);
  return Math.round((CFG.bonusPerHunter * p.quota * bonusFrac(g)) / 10) * 10;
}

export function sweepOmega(g) {
  return (TAU / CFG.sweepPeriod) * g.k;
}

export function blipLife(g) {
  return CFG.blipLife / g.k;
}

// Small deterministic PRNG (mulberry32).
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (a) => ((a % TAU) + TAU) % TAU;

export function createGame(seed = 1, opts = {}) {
  const g = {
    seed,
    rng: makeRng(seed),
    t: 0,
    phase: "ready", // ready | play | dying | clear | over
    phaseT: 0,
    sector: opts.sector ?? 1,
    speedOverride: opts.speed ?? null, // fixed game speed (testing / A-B)
    k: 1,
    sectorT: 0, // seconds of play in this sector (drains the time bonus)
    score: 0,
    nextExtend: CFG.extendFirst,
    lives: opts.lives ?? CFG.lives,
    px: CFG.cx,
    py: CFG.cy,
    theta: -Math.PI / 2, // sweep angle, rotates clockwise on screen (increasing)
    hunters: [],
    blips: [],
    pending: [], // queued chain bursts
    shots: [],
    spawnT: 0.2,
    spawned: 0,
    killed: 0,
    nextId: 1,
    events: [],
    stats: { presses: 0, jumps: 0, kills: 0, misses: 0, bestChain: 0, deaths: [] },
    chainId: 0,
    chainCount: {},
    lastJumpT: -99,
  };
  g.k = g.speedOverride ?? speedFor(g.sector);
  return g;
}

function emit(g, type, data = {}) {
  g.events.push({ type, t: g.t, ...data });
}

function setPhase(g, phase) {
  g.phase = phase;
  g.phaseT = 0;
}

// The run has ended, lost or won.
export function isFinished(g) {
  return g.phase === "over" || g.phase === "complete";
}

export function tipPoint(g) {
  return {
    x: g.px + Math.cos(g.theta) * CFG.jumpR,
    y: g.py + Math.sin(g.theta) * CFG.jumpR,
  };
}

export function insideScope(x, y) {
  return Math.hypot(x - CFG.cx, y - CFG.cy) <= CFG.scopeR;
}

function spawnHunter(g) {
  const p = sectorParams(g.sector, g.k);
  // Pick an edge angle away from the ship so spawns never land on top of it.
  let best = null;
  for (let i = 0; i < 6; i++) {
    const a = g.rng() * TAU;
    const x = CFG.cx + Math.cos(a) * (CFG.scopeR - 8);
    const y = CFG.cy + Math.sin(a) * (CFG.scopeR - 8);
    const d = Math.hypot(x - g.px, y - g.py);
    if (!best || d > best.d) best = { x, y, d };
    if (d > 200) break;
  }
  const heading = Math.atan2(g.py - best.y, g.px - best.x) + (g.rng() - 0.5) * 1.2;
  g.hunters.push({
    id: g.nextId++,
    x: best.x,
    y: best.y,
    h: heading,
    speed: p.speed * (0.9 + g.rng() * 0.2),
    turn: p.turn,
    dead: false,
  });
  g.spawned++;
  emit(g, "spawn");
}

function killHunter(g, h, chainId, link) {
  if (h.dead) return;
  h.dead = true;
  // Its radar track goes out: a destroyed contact must not linger as a blip.
  for (const b of g.blips) if (b.id === h.id && b.out === undefined) b.out = g.t;
  g.killed++;
  g.stats.kills++;
  const n = (g.chainCount[chainId] = (g.chainCount[chainId] || 0) + 1);
  g.stats.bestChain = Math.max(g.stats.bestChain, n);
  const pts =
    CFG.chainScore === "double"
      ? 100 * 2 ** (Math.min(n, 7) - 1)
      : CFG.chainScore === "square"
        ? 100 * Math.min(n, 7) ** 2
        : CFG.chainScore === "steep"
          ? 100 + 300 * (n - 1)
          : 100 * n;
  if (n > 1 && CFG.chainRefund > 0) g.sectorT = Math.max(0, g.sectorT - CFG.chainRefund / g.k);
  addScore(g, pts);
  const quota = sectorParams(g.sector, g.k).quota;
  // slot: the bezel quota tick this kill extinguishes.
  emit(g, "kill", { id: h.id, x: h.x, y: h.y, chain: n, link, pts, slot: quota - g.killed, quota });
  g.pending.push({ x: h.x, y: h.y, at: g.t + CFG.burstDelay, chainId, link: link + 1 });
}

function addScore(g, pts) {
  g.score += pts;
  while (g.score >= g.nextExtend) {
    g.nextExtend += CFG.extendEvery;
    g.lives++;
    emit(g, "extend");
  }
}

function blink(g) {
  const from = { x: g.px, y: g.py };
  const to = tipPoint(g);
  g.stats.jumps++;
  g.px = to.x;
  g.py = to.y;
  g.lastJumpT = g.t;
  if (!insideScope(to.x, to.y)) {
    emit(g, "blink", { from, to, out: true });
    loseShip(g, "edge");
    return;
  }
  const dx = Math.cos(g.theta);
  const dy = Math.sin(g.theta);
  const chainId = ++g.chainId;
  let shot = null;
  if (CFG.shotFrom === "origin") {
    // The wavefront sweeps the jump path first (instantly), then flies on.
    shot = { x: from.x, y: from.y, ox: from.x, oy: from.y, dx, dy, travel: 0, range: CFG.jumpR + CFG.shotRange, chainId, painted: new Set() };
    if (advanceShot(g, shot, CFG.jumpR) !== "live") shot = null;
  }
  // Landing on a hunter is contact, never a kill.
  for (const h of g.hunters) {
    if (!h.dead && Math.hypot(h.x - to.x, h.y - to.y) <= CFG.contactR) {
      emit(g, "blink", { from, to, out: false });
      loseShip(g, "contact", h);
      return;
    }
  }
  if (CFG.shotFrom !== "origin") {
    shot = { x: to.x, y: to.y, ox: to.x, oy: to.y, dx, dy, travel: 0, range: CFG.shotRange, chainId, painted: new Set() };
  }
  if (shot) g.shots.push(shot);
  emit(g, "blink", { from, to, out: false, dx, dy });
}

export function shotHalfWidth(travel) {
  return CFG.shotW0 + CFG.shotSpread * travel;
}

// Move shots (a widening wavefront); each stops at the first hunter inside the
// swept band ahead of it. Hunters it passes within the wider reveal band are
// painted like a sweep contact — a miss still buys information.
function updateShots(g, dt) {
  g.shots = g.shots.filter((s) => advanceShot(g, s, Math.min(CFG.shotSpeed * g.k * dt, s.range - s.travel)) === "live");
}

// Move one shot `len` forward. Returns "hit", "end" or "live".
function advanceShot(g, s, len) {
  let best = null;
  for (const h of g.hunters) {
    if (h.dead) continue;
    const rx = h.x - s.x;
    const ry = h.y - s.y;
    const along = rx * s.dx + ry * s.dy;
    if (along < 0 || along > len) continue;
    const perp = Math.abs(rx * s.dy - ry * s.dx);
    if (perp <= shotHalfWidth(s.travel + along) && (!best || along < best.along)) best = { h, along };
  }
  const reach = best ? best.along : len;
  for (const h of g.hunters) {
    if (h.dead || h === best?.h || s.painted.has(h.id)) continue;
    const rx = h.x - s.x;
    const ry = h.y - s.y;
    const along = rx * s.dx + ry * s.dy;
    if (along < 0 || along > reach) continue;
    if (Math.abs(rx * s.dy - ry * s.dx) <= shotHalfWidth(s.travel + along) + CFG.revealExtra) {
      s.painted.add(h.id);
      paint(g, h, "shot", s.travel + along);
    }
  }
  if (best) {
    const hx = s.x + s.dx * best.along;
    const hy = s.y + s.dy * best.along;
    emit(g, "shotHit", { x: hx, y: hy, travel: s.travel + best.along });
    killHunter(g, best.h, s.chainId, 0);
    return "hit";
  }
  s.x += s.dx * len;
  s.y += s.dy * len;
  s.travel += len;
  if (s.travel >= s.range - 1e-9 || !insideScope(s.x, s.y)) {
    g.stats.misses++;
    emit(g, "shotEnd", { x: s.x, y: s.y });
    return "end";
  }
  return "live";
}

// range: for shot paints, how far the wavefront travelled to reach the hunter.
// closing: the hunter's speed toward the ship (positive = approaching).
function paint(g, h, src, range = 0) {
  const dist = Math.hypot(h.x - g.px, h.y - g.py) || 1;
  const closing = (h.speed * (Math.cos(h.h) * (g.px - h.x) + Math.sin(h.h) * (g.py - h.y))) / dist;
  g.blips.push({ x: h.x, y: h.y, age: 0, id: h.id, dist, src });
  emit(g, "paint", { id: h.id, dist, x: h.x, y: h.y, src, range, closing });
}

// killer: the hunter responsible (contact / landing), revealed on screen.
function loseShip(g, cause, killer = null) {
  g.stats.deaths.push({ cause, t: g.t, sinceJump: g.t - g.lastJumpT, sector: g.sector });
  const k = killer && { id: killer.id, x: killer.x, y: killer.y, h: killer.h, speed: killer.speed };
  emit(g, "death", { cause, x: g.px, y: g.py, killer: k });
  g.lives--;
  setPhase(g, "dying");
}

function respawn(g) {
  g.px = CFG.cx;
  g.py = CFG.cy;
  // Hunters near the respawn point retreat (not scored, returned to the quota).
  const keep = [];
  for (const h of g.hunters) {
    if (Math.hypot(h.x - CFG.cx, h.y - CFG.cy) < CFG.respawnClearR) g.spawned--;
    else keep.push(h);
  }
  g.hunters = keep;
  g.blips = [];
  g.pending = [];
  g.shots = [];
}

// Advance one fixed step. `press` is true when the button went down this step.
export function step(g, dt, press = false) {
  g.events.length = 0;
  g.t += dt;
  g.phaseT += dt;
  const prevTheta = g.theta;
  g.theta = wrap(g.theta + sweepOmega(g) * dt);

  if (press) g.stats.presses++;

  // READY ends on its own, or at once when the player presses: that press is
  // an ordinary blink, so nothing is gained while hunters are frozen.
  if (g.phase === "ready" && (press || g.phaseT >= CFG.readyTime)) setPhase(g, "play");
  if (g.phase === "dying") {
    if (g.phaseT >= CFG.dyingTime) {
      if (g.lives <= 0) {
        setPhase(g, "over");
        emit(g, "gameover");
      } else {
        respawn(g);
        setPhase(g, "ready");
      }
    }
    ageBlips(g, dt);
    return g.events;
  }
  if (g.phase === "clear") {
    if (g.phaseT >= CFG.clearTime && g.sector >= CFG.finalSector) {
      g.blips = [];
      g.shots = [];
      setPhase(g, "complete");
      emit(g, "complete");
    } else if (g.phaseT >= CFG.clearTime) {
      g.sector++;
      g.k = g.speedOverride ?? speedFor(g.sector);
      g.spawned = 0;
      g.killed = 0;
      g.sectorT = 0;
      g.spawnT = 0.2;
      g.blips = [];
      g.shots = [];
      setPhase(g, "ready");
    }
    ageBlips(g, dt);
    return g.events;
  }
  if (g.phase === "over" || g.phase === "complete") return g.events;

  const playing = g.phase === "play";
  if (playing) g.sectorT += dt;
  const p = sectorParams(g.sector, g.k);

  // Spawner keeps running while short of quota: stalling never relieves pressure.
  if (playing) {
    g.spawnT -= dt;
    const live = g.hunters.filter((h) => !h.dead).length;
    if (g.spawnT <= 0 && g.spawned < p.quota && live < p.liveCap) {
      spawnHunter(g);
      g.spawnT = p.spawnInterval;
    }
  }

  // Hunters: turn-limited homing toward the ship.
  if (playing) {
    for (const h of g.hunters) {
      if (h.dead) continue;
      const want = Math.atan2(g.py - h.y, g.px - h.x);
      let d = want - h.h;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const m = h.turn * dt;
      h.h += Math.max(-m, Math.min(m, d));
      h.x += Math.cos(h.h) * h.speed * dt;
      h.y += Math.sin(h.h) * h.speed * dt;
      // Keep hunters on the scope.
      const r = Math.hypot(h.x - CFG.cx, h.y - CFG.cy);
      if (r > CFG.scopeR - 4) {
        const k = (CFG.scopeR - 4) / r;
        h.x = CFG.cx + (h.x - CFG.cx) * k;
        h.y = CFG.cy + (h.y - CFG.cy) * k;
      }
    }
  }

  // Blink resolves before contact so a last-instant escape counts.
  if (press && playing) blink(g);
  if (g.phase !== "play" && g.phase !== "ready") return g.events;

  if (g.shots.length) updateShots(g, dt);

  // Chain bursts.
  if (g.pending.length) {
    const due = g.pending.filter((b) => b.at <= g.t);
    g.pending = g.pending.filter((b) => b.at > g.t);
    for (const b of due) {
      emit(g, "burst", { x: b.x, y: b.y, link: b.link });
      for (const h of g.hunters) {
        if (!h.dead && Math.hypot(h.x - b.x, h.y - b.y) <= CFG.burstR) {
          killHunter(g, h, b.chainId, b.link);
        }
      }
    }
  }
  g.hunters = g.hunters.filter((h) => !h.dead);

  // Sweep paints hunters it crosses this step (angle measured from the ship).
  const swept = wrap(g.theta - prevTheta);
  for (const h of g.hunters) {
    const a = Math.atan2(h.y - g.py, h.x - g.px);
    if (wrap(a - prevTheta) <= swept) paint(g, h, "sweep");
  }
  ageBlips(g, dt);

  // Contact.
  if (playing) {
    for (const h of g.hunters) {
      if (Math.hypot(h.x - g.px, h.y - g.py) <= CFG.contactR) {
        loseShip(g, "contact", h);
        return g.events;
      }
    }
    if (g.killed >= p.quota && !g.pending.length && !g.shots.length) {
      const bonus = timeBonus(g);
      const frac = bonusFrac(g);
      addScore(g, bonus);
      emit(g, "clear", { bonus, frac });
      setPhase(g, "clear");
    }
  }
  return g.events;
}

function ageBlips(g, dt) {
  for (const b of g.blips) b.age += dt;
  const life = blipLife(g);
  if (g.blips.length && (g.blips[0].age > life || g.blips.some((b) => b.out !== undefined))) {
    g.blips = g.blips.filter((b) => b.age <= life && (b.out === undefined || g.t - b.out < CFG.trackOut));
  }
}
