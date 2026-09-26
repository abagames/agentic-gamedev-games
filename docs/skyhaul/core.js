// SKYHAUL — deterministic simulation core. No DOM, no audio.
// Loaded as a classic script in the browser (window.SKY) and via require() in Node tests.
(function (root) {
  "use strict";

  const CFG = {
    W: 320,
    H: 240,
    dt: 1 / 60,
    groundY: 224, // feet of walking humans
    topY: 36, // highest lander centre
    // Lander
    landerSpeed: 104,
    landerSlowPerBody: 0.1, // speed / (1 + k·n)
    landerAccel: 14, // velocity response (1/s)
    landerHalfW: 6,
    landerHalfH: 4,
    hover: 4, // the lander hovers at least this far above the ground (its hook still reaches)
    // Tractor chain
    hookLen: 7, // lander → hook
    linkLen: 10, // body → body
    gravity: 320,
    damping: 0.985,
    iterations: 8,
    grabR: 7, // tip ↔ human centre distance that attaches
    regrabDelay: 0.35,
    cutRecoil: 2.2, // px/tick of upward snap given to the chain end left hanging after a cut
    // Humans
    walkSpeed: 7,
    fallSpeed: 24,
    // Mothership / delivery
    shipY: 24,
    shipHalfW: 22,
    hatchHalfW: 10,
    shipSpeed: 18,
    reelStep: 0.075, // seconds per body reeled in
    scoreUnit: 100, // delivery of n bodies = unit · n²
    // Defender (the AI "hero")
    defSpeed: 74,
    defAccel: 150,
    defClimb: 32,
    defStoop: 1, // descending speed as a multiple of climb
    defTurnCooldown: 1.2,
    defPassMargin: 44, // lander this far behind → turn around
    defFireRange: 230,
    defRowWindow: 7, // |Δy| to lander that triggers a shot
    defFireCool: 2.0,

    defTelegraph: 0.4,
    defRescueRange: 150,
    defCommitRange: 120,
    defPointBlank: 44, // inside this range (without a pass) it holds its altitude
    defCalm: 0.9, // after a rescue the Defender flies flat and holds fire
    defHalfW: 10,
    defHalfH: 3,
    laserSpeed: 430,
    laserLen: 110,
    laserHalfH: 2.5,
    grazeMargin: 6, // px beyond a hit that still counts as a near miss (feedback only)
    wrapPad: 40,
    // Pressure
    alertTime: 60, // fallback HOT time (each stage sets its own, see STAGES)
    hotPerTour: 10, // later tours have more captives, so a little more time
    // HOT pilot multipliers
    hotSpeed: 1.7, // speed (and acceleration)
    hotClimb: 2.0,
    hotFire: 0.5, // × fire interval
    // Round flow
    readyTime: 1.6,
    dyingTime: 1.7,
    clearTime: 2.6,
    spawnInvuln: 2.0,
    lives: 3,
    extendFirst: 10000,
    extendEvery: 30000,
    humansBase: 8,
    humansStep: 2,
    humansMax: 16,
    roundBonus: 1000, // × (tour + 1) on each round clear
    timeBonusPerSec: 50,
    finalRound: 8, // clearing this round (and its bonus stage) completes the mission
    livesBonus: 5000, // per ship left at mission complete
    completeTime: 7, // × (tour + 1) per whole second left on the HOT fuse at a round clear
    // Bonus stage after each planet: no enemies, captives parachute down, catch them before time.
    bonusTime: 24,
    bonusDrop: 1.3, // seconds between parachutists
    bonusCount: 12, // + 2 per tour
    bonusPerfect: 5000, // × (tour + 1) for delivering every one
    // Heavies: count double in the haul, drag the lander twice as much, hang on a longer link,
    // and drop like stones when cut.
    heavyLink: 14,
    heavyFall: 52,
    // Rescuer: an unarmed hero craft. It plucks the lowest captive off a hanging chain (or a
    // falling one) and flies it back to the ground far from the lander. A carried captive can be
    // hooked back with the chain tip.
    rescuerCarrySpeed: 34,
    rescuerGrabR: 7,
    rescuerPatrolY: 96,
    rescuerMinChain: 2, // only chains of this many bodies (or more) are worth a pass
    // Ground turrets: fire straight up at a lander passing over them. The beam stops at the first
    // thing it meets — so a hanging chain shields the lander, at the cost of its lowest captives.
    turretSense: 26, // |Δx| of the lander that wakes a turret
    turretCharge: 0.6,
    turretCool: 2.6,
    turretBeam: 0.22, // how long the column is drawn
    turretBeamHalfW: 2,
    turretLanderHalfW: 4, // the hull's core: a chain hanging straight beneath it always covers it
    // Bomber: lays still mines across the sky.
    bomberSpeed: 34,
    bomberHalfW: 8,
    bomberHalfH: 4,
    bomberDrop: 2.0, // seconds between mines while on screen
    mineMax: 5,
    mineLife: 12,
    mineArm: 0.6, // harmless (and drawn hollow) until armed
    mineR: 3, // chain / hull contact radius
    mineSafeR: 34, // never laid this close to the lander
  };

  // The campaign: four planets (terrain and colour) of two rounds each, then the tour repeats at
  // a higher rank. Each round has its own personality — a mix of the existing pieces rather than
  // an ever-growing pile — with a Defender-only duel (ACE) as the spike and bonus stages as the
  // breathers between planets.
  const PLANETS = [
    { name: "VERDA", terrain: "flat" },
    { name: "OCHRE", terrain: "hills" },
    { name: "CINDER", terrain: "mesas" },
    { name: "VOID", terrain: "canyons" },
  ];
  const ROUNDS_PER_PLANET = 2;
  // def: Defender multipliers (speed, climb, fire = interval). rescuer: speed / rest.
  // hot: seconds of play before the Defender goes HOT — about 1.5 × a strong player's clear time
  // for that round, so it punishes a slow round rather than being part of every round.
  // bomber: mine cap / drop interval. turrets: x positions as fractions of the screen width.
  const PLAIN = { speed: 1, climb: 1, fire: 1 };
  // The ace pilot: round 6's duel, and back for the final round.
  const ACE_DEF = { speed: 1.5, climb: 1.7, fire: 0.65 };
  const STAGES = [
    { tag: "", def: { speed: 1, climb: 1, fire: 1.6 }, heavyEvery: 0, rescuer: null, bomber: null, turrets: [], shutter: null, hot: 50 },
    { tag: "", def: PLAIN, heavyEvery: 0, rescuer: { speed: 42, rest: 5 }, bomber: null, turrets: [], shutter: null, hot: 55 },
    { tag: "", def: PLAIN, heavyEvery: 4, rescuer: { speed: 44, rest: 5 }, bomber: null, turrets: [], shutter: null, hot: 60 },
    { tag: "MINES", def: PLAIN, heavyEvery: 4, rescuer: null, bomber: { max: 3, drop: 2.8 }, turrets: [], shutter: null, hot: 85 },
    { tag: "GUNS", def: PLAIN, heavyEvery: 5, rescuer: null, bomber: null, turrets: [0.25, 0.5, 0.75], shutter: { open: 3.2, shut: 1.6 }, hot: 85 },
    { tag: "ACE", def: ACE_DEF, heavyEvery: 0, rescuer: null, bomber: null, turrets: [], shutter: null, hot: 85 },
    { tag: "CROSSFIRE", def: PLAIN, heavyEvery: 4, rescuer: null, bomber: { max: 3, drop: 2.8 }, turrets: [0.2, 0.52, 0.8], shutter: { open: 2.8, shut: 1.8 }, hot: 115 },
    { tag: "SIEGE", def: ACE_DEF, heavyEvery: 0, rescuer: { speed: 50, rest: 5 }, bomber: { max: 3, drop: 2.8 }, turrets: [0.2, 0.8], shutter: null, hot: 115 },
  ];

  function roundRules(round) {
    const k = Math.floor((round - 1) / ROUNDS_PER_PLANET);
    const p = PLANETS[k % PLANETS.length];
    const st = STAGES[(round - 1) % STAGES.length];
    return {
      planet: k % PLANETS.length,
      planetName: p.name,
      stage: (round - 1) % STAGES.length,
      tag: st.tag,
      tour: Math.floor(k / PLANETS.length),
      firstOfPlanet: (round - 1) % ROUNDS_PER_PLANET === 0,
      lastOfPlanet: (round - 1) % ROUNDS_PER_PLANET === ROUNDS_PER_PLANET - 1,
      terrain: p.terrain,
      heavyEvery: st.heavyEvery,
      bomber: st.bomber || false,
      shutter: st.shutter,
      rescuer: st.rescuer,
      turrets: st.turrets,
      def: st.def,
      hotTime: st.hot + CFG.hotPerTour * Math.floor(k / PLANETS.length),
    };
  }

  // Terrain as a height map: ground[x] is the y of the surface (feet level) at column x.
  function buildGround(kind, rand) {
    const W = CFG.W;
    const G = new Array(W + 1);
    const base = CFG.groundY;
    for (let x = 0; x <= W; x++) G[x] = base;
    if (kind === "hills") {
      const ph = rand() * 6.28;
      // Broad, shallow swells: they hide a lander from a long shot, not from a pilot overhead.
      for (let x = 0; x <= W; x++) G[x] = Math.round(base - 5 - 5 * Math.sin((x / W) * 6.28 * 1.5 + ph));
    } else if (kind === "mesas") {
      // Flat-topped plateaus with steep walls: shelter from level shots on the far side.
      // Two plateaus with wide open ground between and beside them.
      const tops = [
        [70 + rand() * 20, 48],
        [230 + rand() * 20, 48],
      ];
      for (const [c, w] of tops)
        for (let x = 0; x <= W; x++) {
          const d = Math.abs(x - c) - w / 2;
          const h = d <= 0 ? 24 : Math.max(0, 24 - d * 3);
          G[x] = Math.min(G[x], Math.round(base - h));
        }
    } else if (kind === "canyons") {
      // A high plain cut by two deep canyons.
      // A high plain cut by one wide canyon, open enough for the Defender to drop into.
      const cs = [150 + rand() * 20];
      for (let x = 0; x <= W; x++) {
        let h = 30;
        for (const c of cs) {
          const d = Math.abs(x - c);
          if (d < 86) h = Math.min(h, Math.max(0, (d - 74) * 2.5));
        }
        G[x] = Math.round(base - h);
      }
    }
    return G;
  }

  // Local steepness (px of rise per px) and which way is downhill.
  function slopeAt(g, x) {
    const a = groundAt(g, x - 1);
    const b = groundAt(g, x + 1);
    return { steep: Math.abs(b - a) / 2, down: b > a ? 1 : -1 };
  }
  // Nobody stands on a cliff: slide a position down to the nearest foothold.
  function footholdX(g, x) {
    for (let k = 0; k < 80 && slopeAt(g, x).steep > 2; k++) x += slopeAt(g, x).down;
    return x;
  }

  function groundAt(g, x) {
    const i = Math.max(0, Math.min(CFG.W, Math.round(x)));
    return g.ground[i];
  }
  // Highest surface under a horizontal span (for hulls wider than one column).
  function groundUnder(g, x0, x1) {
    // Off-screen, the terrain continues as its edge column.
    const a = clamp(Math.floor(x0), 0, CFG.W);
    const b = clamp(Math.ceil(x1), 0, CFG.W);
    let m = 1e9;
    for (let x = a; x <= b; x++) m = Math.min(m, g.ground[x]);
    return m;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Defender rank. Within a tour the challenge comes from each planet's new system, so the pilot
  // only sharpens slightly per planet; each completed tour sharpens it properly.
  function roundScale(round) {
    const k = Math.floor((round - 1) / ROUNDS_PER_PLANET);
    const rank = Math.min(12, (k % PLANETS.length) + 4 * Math.floor(k / PLANETS.length));
    return {
      speed: 1 + 0.04 * rank,
      cool: 1 / (1 + 0.07 * rank),
      climb: 1 + 0.06 * rank,
    };
  }

  function createGame(seed, opts) {
    const g = {
      seed: seed >>> 0,
      rand: rng(seed || 1),
      opts: Object.assign({}, opts || {}),
      t: 0,
      round: 0,
      score: 0,
      lives: CFG.lives,
      nextExtend: CFG.extendFirst,
      phase: "ready",
      phaseT: 0,
      roundT: 0,
      alert: false,
      events: [],
      nextId: 1,
      humans: [], // {id, x, y, state: 'walk'|'held'|'fall', dir, vy}
      lander: null,
      chain: [], // nodes {x,y,px,py,hid} — chain[0] is the hook (hid = 0)
      def: null,
      lasers: [],
      mines: [],
      bomber: null,
      rescuer: null,
      turrets: [],
      rules: null,
      ship: { x: CFG.W / 2, dir: 1, open: true, cycle: 0 },
      ground: null,
      reel: null, // {t, total, gained}
      bonus: null, // bonus stage state, or null in a normal round
      stats: { delivered: 0, deliveries: [], cuts: 0, deaths: 0, rescues: 0, maxChain: 0, recatches: 0, mineCuts: 0, covered: 0, snatches: 0, stealBacks: 0, grazes: 0, deathBy: {} },
      gameOver: false,
    };
    startRound(g, 1);
    return g;
  }

  function startRound(g, round) {
    g.round = round;
    g.roundT = 0;
    g.alert = false;
    g.humans = [];
    g.rules = Object.assign(roundRules(round), g.opts.rules || {});
    g.ground = buildGround(g.rules.terrain, g.rand);
    g.ship.open = true;
    g.ship.cycle = 0;
    // Round length stays steady within a tour (8, then 10, on each planet); each tour adds two.
    const n = Math.min(CFG.humansMax, CFG.humansBase + CFG.humansStep * (((round - 1) % ROUNDS_PER_PLANET) + g.rules.tour));
    const every = g.rules.heavyEvery;
    for (let i = 0; i < n; i++) {
      // Spread along the ground with jitter so the first sweep is readable.
      let x = 20 + ((i + 0.5) / n) * (CFG.W - 40) + (g.rand() - 0.5) * 14;
      const kind = every > 0 && i % every === Math.floor(every / 2) ? "heavy" : "walker";
      x = footholdX(g, x);
      g.humans.push({ id: g.nextId++, kind, w: kind === "heavy" ? 2 : 1, x, y: groundAt(g, x) - 3, state: "walk", dir: g.rand() < 0.5 ? -1 : 1, vy: 0, walkT: g.rand() * 3 });
    }
    g.mines = [];
    g.bomber = g.rules.bomber ? newBomber(g, 1) : null;
    g.rescuer = g.rules.rescuer ? newRescuer(g) : null;
    g.turrets = (g.rules.turrets || []).map((f, i) => {
      const x = footholdX(g, f * CFG.W);
      return { x, y: groundAt(g, x), cool: 1.2 + i * 0.7, charge: 0, beam: 0, top: 0 };
    });
    g.ship.x = CFG.W / 2;
    g.lasers = [];
    spawnLander(g);
    resetDefender(g);
    g.phase = "ready";
    g.phaseT = CFG.readyTime;
    g.events.push({ t: "round", round, planet: g.rules.planetName, first: g.rules.firstOfPlanet });
  }

  // Mission complete: every remaining ship (the one flying included) is worth a bonus.
  function completeGame(g) {
    const livesBonus = g.lives * CFG.livesBonus;
    g.cleared = true;
    g.complete = { lives: g.lives, livesBonus };
    g.humans = [];
    g.lasers = [];
    g.mines = [];
    g.bomber = null;
    g.rescuer = null;
    g.turrets = [];
    g.def.x = -CFG.wrapPad;
    g.def.vx = 0;
    g.lander.alive = false; // the lander has gone home; nothing flies during the ending
    g.chain = [];
    addScore(g, livesBonus);
    g.phase = "complete";
    g.phaseT = CFG.completeTime;
    g.events.push({ t: "complete", lives: g.lives, livesBonus });
  }

  function startBonus(g) {
    const tour = g.rules.tour;
    g.bonus = { t: CFG.bonusTime, total: CFG.bonusCount + 2 * tour, spawned: 0, drop: 0.4, delivered: 0 };
    g.rules = Object.assign({}, g.rules, { shutter: null, bomber: false });
    g.humans = [];
    g.mines = [];
    g.bomber = null;
    g.rescuer = null;
    g.turrets = [];
    g.lasers = [];
    g.alert = false;
    g.roundT = 0;
    g.ship.open = true;
    spawnLander(g);
    resetDefender(g);
    g.def.x = -CFG.wrapPad; // grounded for the bonus stage
    g.def.vx = 0;
    g.phase = "ready";
    g.phaseT = CFG.readyTime;
    g.events.push({ t: "bonusStart", total: g.bonus.total });
  }

  function updateBonus(g, dt) {
    const b = g.bonus;
    b.t = Math.max(0, b.t - dt);
    b.drop -= dt;
    if (b.drop <= 0 && b.spawned < b.total && b.t > 0) {
      b.drop = CFG.bonusDrop;
      const x = 24 + g.rand() * (CFG.W - 48);
      const heavy = b.spawned % 5 === 4;
      g.humans.push({ id: g.nextId++, kind: heavy ? "heavy" : "walker", w: heavy ? 2 : 1, x, y: CFG.topY + 4, state: "fall", dir: 1, vy: 0, walkT: 1 });
      b.spawned++;
      g.events.push({ t: "chute", x });
    }
    const allOut = b.spawned >= b.total && g.humans.length === 0;
    if (!g.reel && !g.lander.docked && (b.t <= 0 || allOut)) {
      const perfect = b.delivered >= b.total;
      const pts = perfect ? CFG.bonusPerfect * (g.rules.tour + 1) : 0;
      if (pts) addScore(g, pts);
      // Whoever was not hauled in drifts away with the stage.
      g.humans = [];
      g.chain = g.chain.slice(0, 1);
      g.phase = "clear";
      g.phaseT = CFG.clearTime + 0.6;
      g.events.push({ t: "bonusEnd", delivered: b.delivered, total: b.total, perfect, bonus: pts });
    }
  }

  function spawnLander(g) {
    const x = g.ship.x;
    const y = CFG.topY + 8;
    g.lander = { x, y, vx: 0, vy: 0, invuln: CFG.spawnInvuln, alive: true, docked: false };
    g.chain = [{ x, y: y + CFG.landerHalfH + CFG.hookLen, px: x, py: y + CFG.landerHalfH + CFG.hookLen, hid: 0 }];
  }

  function resetDefender(g) {
    // Enter from the side farther from the lander, low, heading inward.
    const fromLeft = g.lander.x > CFG.W / 2;
    const s = roundScale(g.round);
    g.def = {
      x: fromLeft ? -CFG.wrapPad + 4 : CFG.W + CFG.wrapPad - 4,
      y: 150 + g.rand() * 40,
      dir: fromLeft ? 1 : -1,
      vx: (fromLeft ? 1 : -1) * CFG.defSpeed * s.speed,
      turnCool: 0.8,
      cool: 1.2,
      tele: 0,
      mode: "hunt",
      targetId: 0,
      lock: null,
      calm: 0,
    };
  }

  function newRescuer(g) {
    return { x: CFG.W + CFG.wrapPad, y: CFG.rescuerPatrolY, vx: 0, vy: 0, dir: -1, mode: "patrol", carryId: 0, rest: 3, dropX: 0 };
  }

  function newBomber(g, dir) {
    return { x: dir > 0 ? -CFG.wrapPad : CFG.W + CFG.wrapPad, y: 70 + g.rand() * 80, dir, drop: 0.8 };
  }

  function humanById(g, id) {
    for (const h of g.humans) if (h.id === id) return h;
    return null;
  }

  const wrapW = () => CFG.W + CFG.wrapPad * 2;
  function wrapDelta(dx) {
    const w = wrapW();
    while (dx > w / 2) dx -= w;
    while (dx < -w / 2) dx += w;
    return dx;
  }

  function landerAnchor(g) {
    return { x: g.lander.x, y: g.lander.y + CFG.landerHalfH };
  }

  // ---------------------------------------------------------------- update
  function step(g, input) {
    const dt = CFG.dt;
    g.t += dt;
    input = input || { dx: 0, dy: 0 };
    if (g.phase === "over") return;
    if (g.phase === "complete") {
      g.phaseT -= dt;
      updateShip(g, dt);
      if (g.phaseT <= 0) {
        g.phase = "over";
        g.gameOver = true;
        g.events.push({ t: "gameover", cleared: true });
      }
      return;
    }

    if (g.phase === "ready") {
      g.phaseT -= dt;
      updateShip(g, dt);
      settleChainToLander(g);
      updateHumans(g, dt);
      if (g.phaseT <= 0) {
        g.phase = "play";
        g.events.push({ t: "go" });
      }
      return;
    }
    if (g.phase === "dying") {
      g.phaseT -= dt;
      updateHumans(g, dt);
      updateDefender(g, dt, true);
      updateLasers(g, dt, false);
      updateBomber(g, dt, false);
      updateRescuer(g, dt);
      updateTurrets(g, dt, false);
      if (g.phaseT <= 0) {
        if (g.lives <= 0) {
          g.phase = "over";
          g.gameOver = true;
          g.events.push({ t: "gameover" });
        } else {
          spawnLander(g);
          g.lasers = [];
          // Clear mines around the respawn point so the restart is fair.
          g.mines = g.mines.filter((m) => Math.hypot(m.x - g.lander.x, m.y - g.lander.y) > 50);
          resetDefender(g);
          g.phase = "ready";
          g.phaseT = CFG.readyTime * 0.7;
        }
      }
      return;
    }
    if (g.phase === "clear") {
      g.phaseT -= dt;
      updateShip(g, dt);
      if (g.phaseT <= 0) {
        // No bonus stage after the final round: the mission ends straight from SIEGE.
        const finalClear = g.round >= CFG.finalRound && !g.opts.endless;
        if (!g.bonus && g.rules.lastOfPlanet && !g.opts.noBonus && !finalClear) startBonus(g);
        else {
          g.bonus = null;
          // The campaign ends after the last round (and its bonus stage). `endless` keeps
          // touring, for simulations only.
          if (g.round >= CFG.finalRound && !g.opts.endless) completeGame(g);
          else startRound(g, g.round + 1);
        }
      }
      return;
    }

    // phase === "play"
    g.roundT += dt;
    if (!g.alert && !g.bonus) {
      // Last five seconds before HOT: one warning tick per second.
      const left = hotTime(g) - g.roundT;
      const prev = left + CFG.dt;
      if (left > 0 && left <= 5 && Math.ceil(left) !== Math.ceil(prev)) g.events.push({ t: "hotTick", left: Math.ceil(left) });
    }
    if (!g.alert && !g.bonus && g.roundT >= hotTime(g)) {
      g.alert = true;
      g.events.push({ t: "alert" });
    }
    updateShip(g, dt);
    updateLander(g, dt, input);
    updateChain(g, dt);
    updateHumans(g, dt);
    checkAttach(g);
    updateReel(g, dt);
    if (g.bonus) {
      updateBonus(g, dt);
      return;
    }
    updateDefender(g, dt, false);
    updateLasers(g, dt, true);
    updateBomber(g, dt, true);
    updateRescuer(g, dt);
    updateTurrets(g, dt, true);
    checkMines(g);
    checkDefenderBody(g);
    checkRoundClear(g);
  }

  function hotTime(g) {
    return (g.rules && g.rules.hotTime) || CFG.alertTime;
  }

  function updateShip(g, dt) {
    const s = g.ship;
    const sh = g.rules && g.rules.shutter;
    if (sh && g.phase === "play") {
      s.cycle += dt;
      const period = sh.open + sh.shut;
      const ph = s.cycle % period;
      const open = ph < sh.open;
      if (open !== s.open) {
        s.open = open;
        g.events.push({ t: open ? "hatchOpen" : "hatchShut", x: s.x });
      }
      s.warn = open && ph > sh.open - 0.6; // about to shut
    } else {
      s.open = true;
      s.warn = false;
    }
    s.x += s.dir * CFG.shipSpeed * dt;
    if (s.x > CFG.W - CFG.shipHalfW - 6) (s.x = CFG.W - CFG.shipHalfW - 6), (s.dir = -1);
    if (s.x < CFG.shipHalfW + 6) (s.x = CFG.shipHalfW + 6), (s.dir = 1);
  }

  function bodyCount(g) {
    return g.chain.length - 1;
  }

  // Haul weight: what the n² payout and the lander's drag count. A heavy counts 2.
  function chainWeight(g) {
    let w = 0;
    for (let i = 1; i < g.chain.length; i++) w += g.chain[i].w || 1;
    return w;
  }

  function linkLen(node) {
    return node.w > 1 ? CFG.heavyLink : CFG.linkLen;
  }

  function updateLander(g, dt, input) {
    const L = g.lander;
    if (L.invuln > 0) L.invuln -= dt;
    if (L.docked) {
      // Locked in the hatch while the chain reels in; the hatch carries the lander.
      L.x = g.ship.x;
      L.y = CFG.topY - 2;
      L.vx = L.vy = 0;
      return;
    }
    let dx = clamp(input.dx || 0, -1, 1);
    let dy = clamp(input.dy || 0, -1, 1);
    const m = Math.hypot(dx, dy);
    if (m > 1) (dx /= m), (dy /= m);
    const sp = CFG.landerSpeed / (1 + CFG.landerSlowPerBody * chainWeight(g));
    const k = 1 - Math.exp(-CFG.landerAccel * dt);
    L.vx += (dx * sp - L.vx) * k;
    L.vy += (dy * sp - L.vy) * k;
    const ox = L.x;
    L.x += L.vx * dt;
    // Terrain walls are solid sideways: moving into a wall stops the lander instead of lifting it.
    const hullFloor = (x) => groundUnder(g, x - CFG.landerHalfW, x + CFG.landerHalfW) - CFG.landerHalfH - CFG.hover;
    // (Gentle slopes, rising less than 1.5 px per px travelled, still lift it over.)
    const rise = L.y - hullFloor(L.x);
    if (rise > 1.5 * Math.abs(L.x - ox) + 0.5 && hullFloor(L.x) < hullFloor(ox)) {
      L.x = ox;
      L.vx = 0;
    }
    L.y += L.vy * dt;
    const minX = CFG.landerHalfW + 2;
    const maxX = CFG.W - CFG.landerHalfW - 2;
    if (L.x < minX) (L.x = minX), (L.vx = 0);
    if (L.x > maxX) (L.x = maxX), (L.vx = 0);
    // Terrain: the hull rides up a wall rather than passing through it.
    const maxY = hullFloor(L.x);
    if (L.y > maxY) (L.y = maxY), (L.vy = Math.min(0, L.vy));
    // Dock: reaching the hatch with at least one body aboard.
    const inHatch = Math.abs(L.x - g.ship.x) <= CFG.hatchHalfW && L.y <= CFG.topY + 1;
    if (L.y < CFG.topY) {
      if (inHatch && bodyCount(g) > 0 && !g.reel && g.ship.open) {
        L.docked = true;
        g.reel = { t: 0, gained: 0, n: 0, w: 0 };
        g.events.push({ t: "dock", n: bodyCount(g) });
      } else {
        L.y = CFG.topY;
        L.vy = Math.max(0, L.vy);
      }
    }
  }

  function updateChain(g, dt) {
    const a = landerAnchor(g);
    const gdt2 = CFG.gravity * dt * dt;
    for (const n of g.chain) {
      const vx = (n.x - n.px) * CFG.damping;
      const vy = (n.y - n.py) * CFG.damping;
      n.px = n.x;
      n.py = n.y;
      n.x += vx;
      n.y += vy + gdt2;
    }
    for (let it = 0; it < CFG.iterations; it++) {
      for (let i = 0; i < g.chain.length; i++) {
        const n = g.chain[i];
        const p = i === 0 ? a : g.chain[i - 1];
        const len = i === 0 ? CFG.hookLen : linkLen(n);
        const dx = n.x - p.x;
        const dy = n.y - p.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d > len) {
          const diff = (d - len) / d;
          if (i === 0) {
            n.x -= dx * diff;
            n.y -= dy * diff;
          } else {
            n.x -= dx * diff * 0.5;
            n.y -= dy * diff * 0.5;
            p.x += dx * diff * 0.5;
            p.y += dy * diff * 0.5;
          }
        }
      }
      for (const n of g.chain) {
        const floor = groundAt(g, n.x) - 3;
        if (n.y > floor) {
          n.y = floor;
          // Ground friction: bodies drag rather than skate.
          n.px += (n.x - n.px) * 0.4;
        }
        if (n.x < 2) n.x = 2;
        if (n.x > CFG.W - 2) n.x = CFG.W - 2;
      }
    }
    // Held humans follow their node.
    for (let i = 1; i < g.chain.length; i++) {
      const h = humanById(g, g.chain[i].hid);
      if (h) (h.x = g.chain[i].x), (h.y = g.chain[i].y);
    }
  }

  function settleChainToLander(g) {
    const a = landerAnchor(g);
    let y = a.y;
    for (let i = 0; i < g.chain.length; i++) {
      y += i === 0 ? CFG.hookLen : linkLen(g.chain[i]);
      const n = g.chain[i];
      n.x = n.px = a.x;
      n.y = n.py = y;
    }
  }

  function updateHumans(g, dt) {
    for (const h of g.humans) {
      if (h.loose > 0) h.loose -= dt;
      if (h.state === "carried") continue; // the Rescuer positions it
      if (h.state === "walk" && slopeAt(g, h.x).steep > 2) {
        // Landed on a cliff face: slide down to the foot.
        h.x += slopeAt(g, h.x).down * 30 * dt;
        h.y = groundAt(g, h.x) - 3;
      } else if (h.state === "walk") {
        h.walkT -= dt;
        if (h.walkT <= 0) {
          h.walkT = 1.5 + g.rand() * 3;
          h.dir = g.rand() < 0.5 ? -1 : 1;
        }
        const nx = h.x + h.dir * CFG.walkSpeed * (h.w > 1 ? 0.6 : 1) * dt;
        // Walls steeper than 2 px per px turn walkers around.
        if (Math.abs(groundAt(g, nx) - groundAt(g, h.x)) > 2 * Math.abs(nx - h.x) + 0.6) h.dir = -h.dir;
        else h.x = nx;
        if (h.x < 8) (h.x = 8), (h.dir = 1);
        if (h.x > CFG.W - 8) (h.x = CFG.W - 8), (h.dir = -1);
        h.y = groundAt(g, h.x) - 3;
      } else if (h.state === "fall") {
        h.y += (h.w > 1 ? CFG.heavyFall : CFG.fallSpeed) * dt;
        h.x += Math.sin(g.t * 3 + h.id) * 6 * dt;
        h.x = clamp(h.x, 6, CFG.W - 6);
        const floor = groundAt(g, h.x) - 3;
        if (h.y >= floor) {
          h.y = floor;
          h.state = "walk";
          h.walkT = 0.8;
          g.events.push({ t: "land", x: h.x });
        }
      }
    }
  }

  function tip(g) {
    return g.chain[g.chain.length - 1];
  }

  function checkAttach(g) {
    if (!g.lander.alive || g.lander.docked) return;
    // Attach can cascade within one frame during a ground sweep, but each new body
    // must be touched by the *new* tip, so at most a couple per frame in practice.
    for (let guard = 0; guard < 4; guard++) {
      const t = tip(g);
      let best = null;
      let bd = CFG.grabR;
      for (const h of g.humans) {
        if (h.state !== "walk" && h.state !== "fall" && h.state !== "carried") continue;
        if (h.loose > 0) continue;
        const d = Math.hypot(h.x - t.x, h.y - t.y);
        if (d < bd) (bd = d), (best = h);
      }
      if (!best) return;
      const wasFalling = best.state === "fall" || best.state === "carried";
      if (best.state === "carried") stealBack(g);
      best.state = "held";
      g.chain.push({ x: best.x, y: best.y, px: best.x - (t.x - t.px) * 0.5, py: best.y - (t.y - t.py) * 0.5, hid: best.id, w: best.w });
      const n = bodyCount(g);
      g.stats.maxChain = Math.max(g.stats.maxChain, n);
      if (wasFalling) g.stats.recatches++;
      g.events.push({ t: "attach", n, w: chainWeight(g), heavy: best.w > 1, x: best.x, y: best.y, air: wasFalling, hid: best.id });
    }
  }

  function updateReel(g, dt) {
    const r = g.reel;
    if (!r) return;
    r.t += dt;
    while (r.t >= CFG.reelStep && g.chain.length > 1) {
      r.t -= CFG.reelStep;
      // Reel from the top: the body nearest the hatch goes in first.
      const node = g.chain.splice(1, 1)[0];
      const h = humanById(g, node.hid);
      if (h) {
        g.humans.splice(g.humans.indexOf(h), 1);
      }
      // Each weight unit pays the next odd step: 100, 300, 500 … so a haul of weight W sums to 100·W².
      const w = node.w || 1;
      let pts = 0;
      for (let u = 0; u < w; u++) {
        r.w++;
        pts += CFG.scoreUnit * (2 * r.w - 1);
      }
      r.n++;
      if (g.bonus) g.bonus.delivered++;
      r.gained += pts;
      addScore(g, pts);
      g.stats.delivered++;
      g.events.push({ t: "reel", k: r.n, w: r.w, heavy: w > 1, pts, x: g.ship.x });
    }
    if (g.chain.length <= 1 && r.t >= CFG.reelStep) {
      g.stats.deliveries.push(r.w);
      g.events.push({ t: "delivered", n: r.w, bodies: r.n, pts: r.gained, x: g.ship.x });
      g.reel = null;
      const L = g.lander;
      L.docked = false;
      L.y = CFG.topY + 6;
      L.vy = 30;
      L.invuln = Math.max(L.invuln, 0.5);
      settleChainToLander(g);
    }
  }

  function addScore(g, pts) {
    g.score += pts;
    while (g.score >= g.nextExtend) {
      g.lives++;
      g.nextExtend += CFG.extendEvery;
      g.events.push({ t: "extend" });
    }
  }

  // Row test used by lasers and the Defender's hull: returns the first chain index the band crosses.
  // The tractor link above each body is part of the chain, so the vulnerable surface is the whole
  // vertical span of the chain, not just the bodies.
  function chainCutIndex(g, y0, y1, x0, x1) {
    const a = landerAnchor(g);
    for (let i = 1; i < g.chain.length; i++) {
      const p = i === 1 ? g.chain[0] : g.chain[i - 1];
      const n = g.chain[i];
      const top = Math.min(p.y, n.y) - 1;
      const bot = Math.max(p.y, n.y) + 3;
      if (bot < y0 || top > y1) continue;
      // x of the link at the band centre
      const yc = clamp((y0 + y1) / 2, Math.min(p.y, n.y), Math.max(p.y, n.y));
      const f = Math.abs(n.y - p.y) < 1e-3 ? 0.5 : (yc - p.y) / (n.y - p.y);
      const x = p.x + (n.x - p.x) * clamp(f, 0, 1);
      if (x >= x0 - 2 && x <= x1 + 2) return i;
    }
    // The hook link (anchor → hook) — cutting it drops everything.
    if (g.chain.length > 1) {
      const h = g.chain[0];
      const top = Math.min(a.y, h.y);
      const bot = Math.max(a.y, h.y);
      if (!(bot < y0 || top > y1) && h.x >= x0 - 2 && h.x <= x1 + 2) return 1;
    }
    return -1;
  }

  function cutChain(g, idx, cause) {
    if (idx < 1 || idx >= g.chain.length) return;
    const dropped = g.chain.splice(idx);
    // Recoil: the part left hanging springs up, hardest at the cut end.
    if (cause !== "death") {
      for (let i = 0; i < g.chain.length; i++) {
        const n = g.chain[i];
        n.py = n.y + (CFG.cutRecoil * (i + 1)) / g.chain.length;
      }
    }
    for (const n of dropped) {
      const h = humanById(g, n.hid);
      if (h) {
        h.state = "fall";
        h.x = n.x;
        h.y = n.y;
        h.loose = CFG.regrabDelay; // a body just cut loose cannot be re-grabbed instantly
      }
    }
    g.stats.cuts++;
    g.events.push({ t: "cut", n: dropped.length, x: dropped[0].x, y: dropped[0].y, cause, hid: dropped[0].hid });
  }

  function updateDefender(g, dt, passive) {
    const d = g.def;
    const L = g.lander;
    const s = roundScale(g.round);
    const hs = g.alert ? CFG.hotSpeed : 1;
    const hc = g.alert ? CFG.hotClimb : 1;
    const hf = g.alert ? CFG.hotFire : 1;
    const dm = g.rules.def || { speed: 1, climb: 1, fire: 1 };
    const speed = CFG.defSpeed * s.speed * dm.speed * hs;
    const climb = CFG.defClimb * s.climb * dm.climb * hc;

    // Choose goal: rescue a falling human if one is reachable, else hunt the lander.
    let target = null;
    d.mode = "hunt";
    let bestD = CFG.defRescueRange;
    for (const h of g.humans) {
      if (h.state !== "fall") continue;
      const dd = Math.abs(wrapDelta(h.x - d.x)) + Math.abs(h.y - d.y) * 0.5;
      if (dd < bestD) (bestD = dd), (target = h);
    }
    let tx, ty;
    if (target) {
      d.mode = "rescue";
      d.lock = null;
      d.targetId = target.id;
      tx = target.x;
      ty = target.y;
      // A rescuing pilot does not fly through the lander to reach a captive: while the lander
      // is in the way it holds its altitude.
      if (L.alive && Math.abs(wrapDelta(L.x - d.x)) < 30 && Math.abs(L.y - d.y) < 22) ty = d.y;
    } else if (!passive && L.alive) {
      tx = L.x;
      // On approach the pilot lines up on the lander, or — with captives aboard — on the middle of
      // the tractor chain, to cut them free.
      // (A chain dragging on the ground frees no one: then it lines up on the lander itself.)
      const tp = tip(g);
      const hanging = g.chain.length > 1 && tp.y < groundAt(g, tp.x) - 6;
      ty = hanging ? (L.y + tp.y) / 2 + 3 : L.y;
      // A pass is a commitment: once the lander is inside commit range ahead, the pilot locks the
      // row it is flying and holds it dead straight until the lander is behind it.
      const ahead = wrapDelta(L.x - d.x) * d.dir;
      const rel = Math.abs(wrapDelta(L.x - d.x));
      // Only a ship at full speed can commit; while swinging round it lines up again.
      const atSpeed = d.vx * d.dir > speed * 0.8;
      if (d.calm > 0 || (d.lock === null && rel < CFG.defPointBlank)) {
        // Just rescued someone, or already on top of the lander without a pass: fly flat.
        ty = d.y;
      } else if (d.lock === null && atSpeed && ahead > 0 && ahead < CFG.defCommitRange && Math.abs(d.y - ty) < 8 && d.y <= floorAhead(g, d, ahead + 20)) {
        // (It commits only once lined up; until then it keeps visibly diving or climbing.)
        d.lock = d.y;
        g.events.push({ t: "lock", y: d.lock });
      } else if (d.lock !== null && ahead < -CFG.defHalfW - 6) {
        d.lock = null;
      }
      // Terrain rising into a committed row aborts the pass: it pulls up rather than being
      // shoved off the line.
      if (d.lock !== null && floorAhead(g, d, 8) < d.lock) d.lock = null;
      if (d.lock !== null) ty = d.lock;
    } else {
      tx = d.x + d.dir * 100;
      ty = 150;
    }

    const dx = wrapDelta(tx - d.x);
    d.turnCool -= dt;
    if (d.calm > 0) d.calm -= dt;
    const passMargin = d.mode === "rescue" ? 6 : CFG.defPassMargin;
    if (d.dir * dx < -passMargin && d.turnCool <= 0 && d.tele <= 0) {
      d.dir = -d.dir;
      d.lock = null;
      d.turnCool = CFG.defTurnCooldown;
      g.events.push({ t: "defTurn" });
    }
    // Rescue: slow down over the target instead of overshooting.
    let want = d.dir * speed;
    if (d.mode === "rescue" && Math.abs(dx) < 30) want = d.dir * speed * (0.25 + Math.abs(dx) / 40);
    const acc = CFG.defAccel * hs; // (accel follows speed so a hot pilot reaches its pace)
    if (d.vx < want) d.vx = Math.min(want, d.vx + acc * dt);
    else d.vx = Math.max(want, d.vx - acc * dt);
    const oxD = d.x;
    d.x += d.vx * dt;
    // Terrain is solid for the Defender too: it stops against a wall and turns, never lifted.
    const fl = groundUnder(g, d.x - 3, d.x + 3) - CFG.defHalfH - 3;
    if (fl < d.y - 0.5 && d.y - fl <= 1.5 * Math.abs(d.x - oxD) + 0.5) {
      d.y = fl; // a gentle rise is simply flown up
      if (d.lock !== null) d.lock = null;
    } else if (fl < d.y - 0.5) {
      d.x = oxD;
      d.vx = 0;
      d.dir = -d.dir;
      d.lock = null;
      d.turnCool = CFG.defTurnCooldown * 0.6;
    }
    const w = wrapW();
    if (d.x > CFG.W + CFG.wrapPad) d.x -= w;
    if (d.x < -CFG.wrapPad) d.x += w;

    // Terrain is read a short way ahead, so the pilot can dive into valleys after the lander. A
    // wall it could not out-climb before reaching it turns it around instead; it never gets
    // shoved up a wall, so a committed pass stays a straight line.
    ty = Math.min(ty, floorAhead(g, d, 6));
    const reach = 44; // roughly its braking distance plus hull
    const canClimb = (reach / Math.max(20, Math.abs(d.vx))) * climb;
    if (floorAhead(g, d, reach) < d.y - canClimb && d.turnCool <= 0 && d.tele <= 0) {
      d.dir = -d.dir;
      d.lock = null;
      d.turnCool = CFG.defTurnCooldown * 0.6;
      g.events.push({ t: "defTurn" });
    }
    const dy = ty - d.y;
    // While the nose flashes, or during a locked pass, the row does not change.
    // It stoops fast and climbs slowly: dropping into a valley after the lander is a quick,
    // visible swoop made before it is close; climbing back out is laboured.
    const vy = d.tele > 0 || d.lock !== null ? 0 : clamp(dy * 4, -climb, climb * CFG.defStoop);
    // It flies over the terrain beneath it, dipping into valleys as it crosses them.
    const floorY = groundUnder(g, d.x - 3, d.x + 3) - CFG.defHalfH - 3;
    d.y = clamp(d.y + vy * dt, CFG.topY - 4, Math.max(CFG.topY, floorY));

    // Rescue contact.
    if (target && Math.abs(wrapDelta(target.x - d.x)) < 10 && Math.abs(target.y - d.y) < 9) {
      target.state = "walk";
      target.y = groundAt(g, target.x) - 3;
      target.walkT = 1;
      g.stats.rescues++;
      d.calm = CFG.defCalm;
      d.lock = null;
      g.events.push({ t: "rescue", x: target.x, y: d.y });
    }

    // Firing.
    d.cool -= dt;
    if (d.tele > 0) {
      d.tele -= dt;
      if (d.tele <= 0) {
        const nose = d.x + d.dir * CFG.defHalfW;
        g.lasers.push({ y: d.y, x0: nose, dir: d.dir, t: 0, stop: terrainStop(g, nose, d.y, d.dir) });
        d.cool = CFG.defFireCool * s.cool * dm.fire * hf;
        g.events.push({ t: "fire", x: nose, y: d.y });
      }
    } else if (!passive && d.mode === "hunt" && d.calm <= 0 && d.cool <= 0 && L.alive && !L.docked) {
      const onScreen = d.x > 4 && d.x < CFG.W - 4;
      const ahead = wrapDelta(L.x - d.x) * d.dir;
      const facingSpeed = d.vx * d.dir > speed * 0.5;
      // A pilot does not waste a shot into a hillside.
      const clear = Math.abs(terrainStop(g, d.x, d.y, d.dir) - d.x) > ahead;
      if (onScreen && facingSpeed && ahead > 0 && ahead < CFG.defFireRange) {
        const rowLander = Math.abs(L.y - d.y) < CFG.defRowWindow;
        // A Defender pilot also shoots the tractor chain to free the captives.
        let rowChain = false;
        if (!rowLander && g.chain.length > 1) {
          rowChain = chainCutIndex(g, d.y - 2, d.y + 2, -1e9, 1e9) > 0;
        }
        if ((rowLander || rowChain) && !clear) g.stats.covered++;
        if ((rowLander || rowChain) && clear) {
          d.tele = CFG.defTelegraph;
          g.events.push({ t: "tele", x: d.x, y: d.y, dir: d.dir });
        }
      }
    }
  }

  // Lowest safe altitude for the Defender over the next `span` px of its path.
  // Measured along its centre line: the wings may skim a slope, but the ship can follow the
  // lander down into a valley as deep as the lander can go.
  function floorAhead(g, d, span) {
    const a = d.x - d.dir * 3;
    const b = d.x + d.dir * span;
    return groundUnder(g, Math.min(a, b), Math.max(a, b)) - CFG.defHalfH - 3;
  }

  // Where a level shot from (x, y) heading dir first meets the ground (or the far edge).
  function terrainStop(g, x, y, dir) {
    if (!g.ground) return dir > 0 ? 1e9 : -1e9;
    for (let c = Math.round(x); c >= 0 && c <= CFG.W; c += dir) if (g.ground[c] < y + CFG.laserHalfH) return c;
    return dir > 0 ? 1e9 : -1e9;
  }

  function laserSpan(l) {
    let head = l.x0 + l.dir * l.t * CFG.laserSpeed;
    let tail = l.x0 + l.dir * Math.max(0, l.t * CFG.laserSpeed - CFG.laserLen);
    if (l.stop !== undefined) {
      if ((head - l.stop) * l.dir > 0) head = l.stop;
      if ((tail - l.stop) * l.dir > 0) tail = l.stop;
    }
    return l.dir > 0 ? [tail, head] : [head, tail];
  }

  function updateLasers(g, dt, live) {
    const L = g.lander;
    for (let i = g.lasers.length - 1; i >= 0; i--) {
      const l = g.lasers[i];
      l.t += dt;
      const [x0, x1] = laserSpan(l);
      if (x1 < -10 || x0 > CFG.W + 10 || x1 - x0 < 0.5) {
        g.lasers.splice(i, 1);
        continue;
      }
      if (!live) continue;
      const y0 = l.y - CFG.laserHalfH;
      const y1 = l.y + CFG.laserHalfH;
      const ci = chainCutIndex(g, y0, y1, x0, x1);
      if (ci > 0) cutChain(g, ci, "laser");
      if (L.alive && !L.docked && L.invuln <= 0) {
        if (Math.abs(L.y - l.y) < CFG.landerHalfH + CFG.laserHalfH - 0.5 && L.x + CFG.landerHalfW >= x0 && L.x - CFG.landerHalfW <= x1) {
          killLander(g, "laser");
        }
      }
      // Near miss (feedback only): the beam sweeps past the hull or the chain within a few px.
      if (!l.grazed && L.alive && !L.docked && ci < 0) {
        const hitY = CFG.landerHalfH + CFG.laserHalfH - 0.5;
        const dyL = Math.abs(L.y - l.y);
        if (dyL >= hitY && dyL < hitY + CFG.grazeMargin && L.x >= x0 - 2 && L.x <= x1 + 2) {
          l.grazed = true;
          g.stats.grazes++;
          g.events.push({ t: "graze", x: L.x, y: l.y, dir: l.dir, src: "laser" });
        } else {
          for (let k = 1; k < g.chain.length; k++) {
            const n = g.chain[k];
            const dyN = Math.abs(n.y - l.y);
            if (dyN >= 4 && dyN < 4 + CFG.grazeMargin && n.x >= x0 - 2 && n.x <= x1 + 2) {
              l.grazed = true;
              g.stats.grazes++;
              g.events.push({ t: "graze", x: n.x, y: l.y, dir: l.dir, src: "chain" });
              break;
            }
          }
        }
      }
    }
  }

  function checkDefenderBody(g) {
    const d = g.def;
    const L = g.lander;
    if (!L.alive) return;
    const ci = chainCutIndex(g, d.y - CFG.defHalfH, d.y + CFG.defHalfH, d.x - CFG.defHalfW, d.x + CFG.defHalfW);
    if (ci > 0) cutChain(g, ci, "ram");
    if (d.grazeT > 0) d.grazeT -= CFG.dt;
    if (L.docked || L.invuln > 0) return;
    const hitY = CFG.landerHalfH + CFG.defHalfH - 1;
    const dyD = Math.abs(L.y - d.y);
    if (Math.abs(L.x - d.x) < CFG.landerHalfW + CFG.defHalfW - 1 && dyD < hitY) {
      killLander(g, "ram");
    } else if (!(d.grazeT > 0) && Math.abs(L.x - d.x) < CFG.landerHalfW + CFG.defHalfW && dyD < hitY + CFG.grazeMargin - 2) {
      // The hull skimming past (feedback only).
      d.grazeT = 1;
      g.stats.grazes++;
      g.events.push({ t: "graze", x: L.x, y: (L.y + d.y) / 2, dir: d.dir, src: "hull" });
    }
  }

  function killLander(g, cause) {
    const L = g.lander;
    L.alive = false;
    cutChain(g, 1, "death");
    g.chain = [];
    g.lives--;
    g.stats.deaths++;
    g.stats.deathBy[cause] = (g.stats.deathBy[cause] || 0) + 1;
    g.phase = "dying";
    g.phaseT = CFG.dyingTime;
    g.events.push({ t: "death", x: L.x, y: L.y, cause });
  }

  function updateBomber(g, dt, live) {
    for (const m of g.mines) m.t += dt;
    g.mines = g.mines.filter((m) => m.t < CFG.mineLife);
    const b = g.bomber;
    if (!b) return;
    b.x += b.dir * CFG.bomberSpeed * dt;
    // Each pass crosses at a new altitude, so the minefield layer shifts.
    if (b.x > CFG.W + CFG.wrapPad || b.x < -CFG.wrapPad) {
      const nb = newBomber(g, -b.dir);
      Object.assign(b, nb);
    }
    const onScreen = b.x > 8 && b.x < CFG.W - 8;
    b.drop -= dt;
    const bp = typeof g.rules.bomber === "object" ? g.rules.bomber : { max: CFG.mineMax, drop: CFG.bomberDrop };
    if (live && onScreen && b.drop <= 0 && g.mines.length < bp.max) {
      const L = g.lander;
      if (!L || !L.alive || Math.hypot(L.x - b.x, L.y - b.y) > CFG.mineSafeR) {
        g.mines.push({ x: b.x, y: b.y + CFG.bomberHalfH + 3, t: 0 });
        g.events.push({ t: "mine", x: b.x, y: b.y });
      }
      b.drop = bp.drop;
    }
    if (!live) return;
    // The Bomber's hull behaves like the Defender's: it cuts chains and kills the lander.
    const ci = chainCutIndex(g, b.y - CFG.bomberHalfH, b.y + CFG.bomberHalfH, b.x - CFG.bomberHalfW, b.x + CFG.bomberHalfW);
    if (ci > 0) cutChain(g, ci, "bomber");
    const L = g.lander;
    if (L.alive && !L.docked && L.invuln <= 0 && Math.abs(L.x - b.x) < CFG.landerHalfW + CFG.bomberHalfW - 1 && Math.abs(L.y - b.y) < CFG.landerHalfH + CFG.bomberHalfH - 1) {
      killLander(g, "bomber");
    }
  }

  function updateTurrets(g, dt, live) {
    const L = g.lander;
    for (const t of g.turrets) {
      if (t.beam > 0) t.beam -= dt;
      t.cool -= dt;
      if (t.charge > 0) {
        t.charge -= dt;
        if (t.charge <= 0) fireTurret(g, t);
        continue;
      }
      if (!live || t.cool > 0 || !L.alive || L.docked) continue;
      if (Math.abs(L.x - t.x) < CFG.turretSense && L.y < t.y) {
        t.charge = CFG.turretCharge;
        g.events.push({ t: "turretCharge", x: t.x, y: t.y });
      }
    }
  }

  // The column rises from the turret; the first chain link or body it meets stops it (and is cut
  // loose with everything below it); only with nothing in the way does it reach the lander.
  function fireTurret(g, t) {
    t.cool = CFG.turretCool;
    t.beam = CFG.turretBeam;
    t.top = 0;
    const L = g.lander;
    const x = t.x;
    const bw = CFG.turretBeamHalfW;
    // Lowest thing in the column first: bodies (by their width), then the links between them.
    let hit = -1;
    let hitY = -1;
    for (let i = g.chain.length - 1; i >= 1 && hit < 0; i--) {
      const n = g.chain[i];
      const p = g.chain[i - 1];
      const half = (n.w > 1 ? 4 : 3) + bw;
      if (Math.abs(n.x - x) < half) (hit = i), (hitY = n.y);
      else if (x >= Math.min(p.x, n.x) - bw - 1.5 && x <= Math.max(p.x, n.x) + bw + 1.5) (hit = i), (hitY = (p.y + n.y) / 2);
    }
    if (hit < 0 && g.chain.length > 1) {
      const h = g.chain[0];
      if (x >= Math.min(h.x, L.x) - bw - 1.5 && x <= Math.max(h.x, L.x) + bw + 1.5) (hit = 1), (hitY = h.y);
    }
    if (hit > 0 && L.alive && !L.docked) {
      t.top = hitY;
      cutChain(g, hit, "turret");
    } else if (L.alive && !L.docked && Math.abs(L.x - x) < CFG.turretLanderHalfW + bw && L.y < t.y) {
      t.top = L.y;
      if (L.invuln <= 0) killLander(g, "turret");
    }
    g.events.push({ t: "turretFire", x, y: t.y, top: t.top, shielded: hit > 0 });
  }

  function stealBack(g) {
    const r = g.rescuer;
    if (!r) return;
    r.mode = "patrol";
    r.carryId = 0;
    r.rest = g.rules.rescuer.rest;
    g.stats.stealBacks++;
    g.events.push({ t: "stealBack", x: r.x, y: r.y });
  }

  function updateRescuer(g, dt) {
    const r = g.rescuer;
    if (!r) return;
    const P = g.rules.rescuer;
    const L = g.lander;
    if (r.rest > 0) r.rest -= dt;
    let tx, ty, sp;
    if (r.mode === "carry") {
      const h = humanById(g, r.carryId);
      if (!h || h.state !== "carried") {
        r.mode = "patrol";
        r.carryId = 0;
      } else {
        // Carry it low toward the far side, then set it down.
        tx = r.dropX;
        ty = groundAt(g, r.dropX) - 22;
        sp = CFG.rescuerCarrySpeed;
        if (Math.abs(r.x - tx) < 6 && Math.abs(r.y - ty) < 6) {
          h.state = "fall";
          h.loose = 0.5;
          r.mode = "patrol";
          r.carryId = 0;
          r.rest = P.rest;
          g.events.push({ t: "drop", x: h.x, y: h.y });
        }
      }
    }
    if (r.mode !== "carry") {
      // Choose a target: a falling captive first, else the lowest body of a hanging chain.
      let target = null;
      if (r.rest <= 0 && L && L.alive && !L.docked) {
        let best = 150;
        for (const h of g.humans) {
          if (h.state !== "fall" || h.loose > 0) continue;
          const d = Math.hypot(h.x - r.x, h.y - r.y);
          if (d < best) (best = d), (target = h);
        }
        const tp = tip(g);
        if (!target && bodyCount(g) >= CFG.rescuerMinChain && tp.y < groundAt(g, tp.x) - 8) target = tp;
      }
      if (target) {
        r.mode = "chase";
        tx = target.x;
        ty = target.y - 7; // claw hangs below the hull
        sp = P.speed;
        // Claw contact.
        if (Math.hypot(r.x - target.x, r.y + 7 - target.y) < CFG.rescuerGrabR) {
          let h = null;
          if (target === tip(g) && target.hid) {
            h = humanById(g, target.hid);
            cutChain(g, g.chain.length - 1, "rescuer");
          } else if (target.state === "fall") h = target;
          if (h) {
            h.state = "carried";
            h.loose = CFG.regrabDelay;
            r.mode = "carry";
            r.carryId = h.id;
            r.dropX = L && L.x < CFG.W / 2 ? CFG.W - 30 : 30;
            g.stats.snatches++;
            g.events.push({ t: "snatch", x: r.x, y: r.y, hid: h.id });
          }
        }
      } else if (r.mode === "chase" || r.mode === "patrol") {
        // Patrol: a slow sweep across the middle of the sky, wrapping at the edges.
        r.mode = "patrol";
        tx = r.x + r.dir * 60;
        ty = CFG.rescuerPatrolY;
        sp = P.speed * 0.7;
      }
    }
    // Steer (smoothly) toward the goal.
    const dx = tx - r.x;
    const dy = ty - r.y;
    const m = Math.hypot(dx, dy) || 1;
    const k = 1 - Math.exp(-4 * dt);
    r.vx += ((dx / m) * sp - r.vx) * k;
    r.vy += ((dy / m) * sp - r.vy) * k;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (Math.abs(r.vx) > 2) r.dir = Math.sign(r.vx);
    r.y = clamp(r.y, CFG.topY, groundAt(g, r.x) - 10);
    if (r.mode === "patrol") {
      const w = wrapW();
      if (r.x > CFG.W + CFG.wrapPad) r.x -= w;
      if (r.x < -CFG.wrapPad) r.x += w;
    } else r.x = clamp(r.x, 4, CFG.W - 4);
    if (r.mode === "carry") {
      const h = humanById(g, r.carryId);
      if (h) {
        h.x = r.x;
        h.y = r.y + 9;
      }
    }
  }

  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const l2 = vx * vx + vy * vy || 1e-9;
    const f = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
    return Math.hypot(px - (ax + vx * f), py - (ay + vy * f));
  }

  // Mines: the lander hull dies on contact; the chain is cut at the first link or body that touches.
  function checkMines(g) {
    const L = g.lander;
    if (!L.alive || L.docked) return;
    const a = landerAnchor(g);
    for (let k = g.mines.length - 1; k >= 0; k--) {
      const m = g.mines[k];
      if (m.t < CFG.mineArm) continue;
      if (L.invuln <= 0 && Math.abs(L.x - m.x) < CFG.landerHalfW + CFG.mineR - 1 && Math.abs(L.y - m.y) < CFG.landerHalfH + CFG.mineR - 1) {
        g.mines.splice(k, 1);
        g.events.push({ t: "boom", x: m.x, y: m.y });
        killLander(g, "mine");
        return;
      }
      if (g.chain.length < 2) continue;
      let hit = -1;
      for (let i = 1; i < g.chain.length && hit < 0; i++) {
        const p = i === 1 ? g.chain[0] : g.chain[i - 1];
        const n = g.chain[i];
        if (segDist(m.x, m.y, p.x, p.y, n.x, n.y - 4) < CFG.mineR || Math.hypot(m.x - n.x, m.y - n.y) < CFG.mineR + 2) hit = i;
      }
      if (hit < 0 && segDist(m.x, m.y, a.x, a.y, g.chain[0].x, g.chain[0].y) < CFG.mineR) hit = 1;
      if (hit > 0) {
        g.mines.splice(k, 1);
        g.stats.mineCuts++;
        g.events.push({ t: "boom", x: m.x, y: m.y });
        cutChain(g, hit, "mine");
      }
    }
  }

  function checkRoundClear(g) {
    if (g.reel) return;
    if (g.humans.length === 0) {
      const bonus = CFG.roundBonus * (g.rules.tour + 1);
      // Time bonus: whole seconds left on the HOT fuse, so beating the fuse pays (never negative;
      // nothing once the Defender has gone HOT).
      const secsLeft = g.alert ? 0 : Math.max(0, Math.floor(hotTime(g) - g.roundT));
      const timeBonus = secsLeft * CFG.timeBonusPerSec * (g.rules.tour + 1);
      g.clearInfo = { bonus, secsLeft, timeBonus };
      addScore(g, bonus + timeBonus);
      g.phase = "clear";
      g.phaseT = CFG.clearTime + (secsLeft > 0 ? 0.8 : 0);
      g.events.push({ t: "clear", bonus, timeBonus, secsLeft, round: g.round });
    }
  }

  const api = { CFG, PLANETS, STAGES, hotTime, createGame, startRound, startBonus, step, groundAt, slopeAt, groundUnder, terrainStop, bodyCount, chainWeight, linkLen, tip, wrapDelta, laserSpan, chainCutIndex, roundScale, roundRules, rng, segDist };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SKY = api;
})(typeof window !== "undefined" ? window : globalThis);
