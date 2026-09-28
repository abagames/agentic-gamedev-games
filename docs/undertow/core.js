// UNDERTOW core: deterministic, render-free simulation shared by the browser and node tests.
//
// Survivors of a wreck sink slowly through a sea that is a ring. Raider collectors sortie from
// their port and carry survivors away: grab-ships reach down with an arm from the surface,
// grab-subs hunt the deep water. Sinking a collector spills everyone aboard back into the sea,
// where they sink again. Survivors brought to our harbour are saved.
(function (root) {
  "use strict";

  const W = 256; // screen
  const H = 192;
  const DT = 1 / 60;
  const WORLD = 768; // the sea is a ring, three screens round
  const HOME = 0; // our harbour
  const PORT = 384; // the raiders' port, opposite side of the ring

  const CFG = {
    surf: 52, // water surface y
    seabed: 172, // survivors that reach this drown
    subMinY: 58,
    subMaxY: 164,
    exposed: 92, // a sub this close under the surface (40 px) draws grab-ships' deck-gun fire
    fireBand: 66, // kept for rendering: the lighter surface layer
    subAccel: 7,
    subVx: 88,
    subVy: 62,
    cargoSlow: 0.035, // max speed lost per survivor aboard
    cargoSink: 2.5, // px/s of downward drift per survivor aboard (a full hold of 8 can still climb)
    capacity: 8,
    torpSpeed: 190,
    torpRise: 0.5, // the torpedo climbs 1 px for every 2 px it runs: depth sets range
    torpLife: 1.8,
    hullDepth: 10, // a hull reaches this far under the surface
    pickDX: 10,
    pickDY: 8,
    homeDX: 22,
    homeDY: 22,
    unloadEvery: 0.12,
    // grab-ship
    shipHW: 13,
    shipCap: 5,
    turnFromHome: 75,
    // our ferry: takes survivors from the sub and carries them home; raiders shell it
    ferrySpeed: 28,
    ferryCap: 8,
    ferryHP: 2,
    ferryStation: 200, // waits this far out from our harbour, on the side the sub is working
    ferryRespawn: 8,
    ferryWait: 1.0, // after the last hand-over, it turns for home once this long passes
    handDX: 16,
    handDY: 22,
    handEvery: 0.12,
    shellRange: 140,
    shellTell: 0.7, // muzzle flash before the shot
    shellBlastR: 22, // a shell bursts at the surface; its blast reaches this far into the water
    shellFlight: 1.2,
    shellHitDX: 13, // grab-ships sail out empty to here, then trawl back toward their port
    armReach: 78, // below the surface
    armSpeed: 70,
    mineSense: 30, // lays a mine when the sub passes below within this
    // grab-sub
    esubHW: 8,
    esubHH: 4,
    esubCap: 3,
    // escort destroyers: ride with fleeing raiders and depth-charge our sub at any depth
    ddHW: 11,
    ddSense: 80, // drops charges on a sub within this, horizontally
    ddTell: 0.6, // stern rack flashes first
    ddGuard: 22, // keeps station this far astern of its charge
    ddHunt: 8, // seconds it hunts our sub after its charge is sunk
    chargeVy: 46,
    chargeSpread: 16,
    ddChase: 130, // an escort runs at a sub this close
    loadedFirst: 0.45, // a raider with anyone aboard drops to this share of its speed...
    loadedPer: 0.07, // ...and loses this much more for each further person...
    loadedMin: 0.25, // ...down to this: a carrier can always be run down
    spreadFromPort: 110, // wreck survivors lie from this far off their port...
    spreadFromHome: 85, // ...to this far off our harbour
    esubPortY: 62, // grab-subs leave and enter their port at this depth, just under the surface
    esubSurfaceDX: 140, // homeward grab-subs start rising this far out from the port
    esubAim: 0.7,
    esubLoadedDepth: 45, // a loaded grab-sub heads home this far under the surface
    esubHuntDX: 150, // a patrolling grab-sub closes on our sub inside this // telegraph before an enemy torpedo leaves the tube
    esubRange: 140,
    esubDY: 9, // it only shoots along its own depth
    etorpSpeed: 105,
    etorpLife: 2,
    // mines
    mineVy: 28,
    mineTell: 0.5,
    mineMinDepth: 30, // no mines on a sub this close under the hulls
    mineLife: 14,
    mineR: 5,
    blastR: 16,
    blastT: 0.35,
    blastLethal: 0.22,
    escapeDX: 30, // a collector this close to the port is home
    homeFree: 70, // raiders do not work inside our harbour waters
    lostPerMiss: 3, // losing this many survivors (since the last miss or wave clear) costs a sub
    startLives: 3,
    extendEvery: 30,
    maxLives: 5,
    pts: { standing: 200, subLeft: 3000, allPerfect: 20000, dd: 50, perLoad: 50, mine: 20, deliver: 100, spillSq: 100 }, // a raider is worth what it carries
    respawnT: 2.2,
    readyT: 1.8,
    clearT: 3.2,
  };

  // An 8-wave campaign. Each early wave brings in one new element, and 5–8 tighten what is
  // there. Every wave stays fully rescuable by good play (the lookahead planner has saved
  // everyone at every wave; see tests/perfect.sim.cjs).
  //   1 grab-ships only   2 + grab-subs   3 + escort destroyers   4 + deck guns reach 40 px deep
  const FINAL_WAVE = 8;
  function waveSpec(n) {
    n = Math.min(n, FINAL_WAVE);
    return {
      survivors: Math.min(14, 8 + 2 * n),
      escortP: n < 3 ? 0 : Math.min(0.35, 0.1 * (n - 1)), // share of grab-ships sailing with an escort
      ddCd: Math.max(1.1, 2.3 - 0.12 * n),
      floatSink: Math.min(3.4, 2.6 + 0.15 * n), // survivors in life jackets sink slowly
      sinkSpeed: Math.min(16, 13 + 0.6 * n), // spilled from a carrier: no jacket, sinks fast
      shipMax: Math.min(3, 1 + Math.ceil(n / 2)),
      esubMax: n < 2 ? 0 : Math.min(2, 1 + Math.floor((n - 2) / 3)),
      gunReach: n < 4 ? 18 : 40, // deck guns fire at a sub this close under the surface
      launchEvery: Math.max(6, 7 - 0.2 * n),
      shipSpeed: Math.min(40, 30 + 2 * n),
      esubSpeed: Math.min(34, 22 + 2 * n),
      mineCd: Math.max(1.1, 2.6 - 0.15 * n),
      shellCd: Math.max(3, 4.5 - 0.15 * n),
      esubCd: Math.max(1.6, 3.6 - 0.2 * n),
    };
  }

  // ---- helpers ---------------------------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // mulberry32 stepping the state held in g.rs
  function rnd(g) {
    let a = (g.rs = (g.rs + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const wrap = (x) => ((x % WORLD) + WORLD) % WORLD;
  const dx = (a, b) => {
    let d = wrap(b - a);
    if (d > WORLD / 2) d -= WORLD;
    return d;
  };
  const sgn = (v) => (v < 0 ? -1 : 1);

  // ---- game ------------------------------------------------------------------------------
  function newGame(seed, opts) {
    opts = opts || {};
    const g = {
      seed: seed >>> 0,
      rs: seed >>> 0, // random state lives in the game so a game can be cloned (lookahead bots)
      t: 0,
      mode: "ready",
      modeT: 0,
      wave: opts.wave || 1,
      score: 0,
      lives: CFG.startLives,
      lostRun: 0, // survivors lost since the last miss or wave clear
      delivered: 0,
      nextExtend: CFG.extendEvery,
      player: null,
      ferry: null,
      shells: [],
      charges: [],
      torp: null,
      enemies: [],
      etorps: [],
      captives: [],
      mines: [],
      blasts: [],
      wrecks: [],
      spills: {},
      launchT: 0,
      unloadT: 0,
      prevFire: false,
      nextId: 1,
      events: [],
      waveStats: null,
      stats: {
        shots: 0,
        shipsSunk: 0,
        esubsSunk: 0,
        minesShot: 0,
        taken: 0, // survivors carried into the port
        drowned: 0,
        blasted: 0,
        caught: 0,
        handed: 0,
        ferryHome: 0,
        ferrySunk: 0,
        ferrySpilled: 0,
        ferryHits: 0,
        shells: 0,
        deliveredTotal: 0,
        spills: 0,
        spillSizes: [],
        spillBonus: 0,
        allSaved: 0,
        deaths: { mine: 0, etorp: 0, ram: 0, shell: 0, charge: 0 },
        ddSunk: 0,
        lostWithSub: 0,
        waveTimes: [],
        wavesCleared: 0,
      },
    };
    spawnPlayer(g, HOME);
    g.ferry = newFerry();
    beginWave(g, g.wave);
    return g;
  }

  function newFerry() {
    return { x: HOME, alive: true, state: "out", load: 0, hp: CFG.ferryHP, lastHand: -9, handT: 0, respawnT: 0, dir: 1, v: 0 };
  }

  function spawnPlayer(g, x) {
    g.player = { x: wrap(x), y: CFG.exposed + 6, // starts below the deck guns' farthest reach
      vx: 0, vy: 0, face: 1, cargo: 0, alive: true, inv: 1.5 };
  }

  // Everything that can hurt, or is still going off, goes when a wave is cleared and again when the
  // next one starts. Time stands still on the clear and READY screens, so anything left over
  // would come back to life with the new wave.
  function clearHazards(g) {
    g.mines = [];
    g.charges = [];
    g.shells = [];
    g.etorps = [];
    g.blasts = [];
    g.wrecks = [];
    g.torp = null;
  }

  function beginWave(g, n) {
    g.wave = n;
    g.spec = waveSpec(n);
    g.mode = "ready";
    g.modeT = 0;
    g.enemies = [];
    clearHazards(g);
    g.launchT = 0.8; // first sortie right after the start
    g.waveStats = { t: 0, lost: 0, saved: 0, people: 0, taken: 0 };
    g.lostRun = 0; // a new wave: the loss count starts over
    // The wreck has scattered its survivors all around the sea: from just off our harbour to just
    // off their port, some at the surface, some already sinking through mid-water. Raiders will
    // sortie from their port to take them.
    const s = g.spec;
    const total = s.survivors;
    g.waveStats.people = total;
    g.raidQueue = [];
    const perSide = Math.ceil(total / 2);
    for (let k = 0; k < total; k++) {
      const side = k % 2 ? -1 : 1;
      const u = perSide > 1 ? (k >> 1) / (perSide - 1) : 0.5;
      const dPort = CFG.spreadFromPort + u * (WORLD / 2 - CFG.spreadFromPort - CFG.spreadFromHome) + (rnd(g) * 2 - 1) * 8;
      const y = rnd(g) < 0.45 ? CFG.surf + 3 + rnd(g) * 5 : CFG.surf + 12 + rnd(g) * 43;
      addSurvivor(g, PORT + side * dPort, y);
    }
    g.burst = s.shipMax + s.esubMax; // the port empties at once when the wave starts
    g.raidT = 0;
    g.events.push({ type: "wave", n });
  }

  // Every survivor drowned, blasted or carried into their port counts against the sub. Too many
  // since the last miss or wave clear and the sub is recalled: that is a miss like any other.
  function loseSurvivors(g, n, x, y, fromSub, uncounted) {
    g.stats.lost = (g.stats.lost || 0) + n;
    // Not counted toward a miss: losses while our sub is down, the people thrown out of a sub that
    // was sunk, and people who were already aboard a raider when our sub was lost (all part of
    // that miss). One mistake costs one sub.
    if (!g.player.alive || g.mode !== "play" || fromSub) return;
    n -= uncounted || 0;
    if (n <= 0) return;
    g.lostRun += n;
    g.events.push({ type: "lostCount", run: g.lostRun, n, x, y });
    if (g.lostRun >= CFG.lostPerMiss && g.player.alive && (g.mode === "play" || g.mode === "dead")) killPlayer(g, "lost");
  }
  // n survivors reach our harbour (from the sub, the ferry, or at wave clear)
  function saveN(g, n, x, y) {
    if (n <= 0) return;
    g.events.push({ type: "saved", n, x: x != null ? x : HOME, y: y != null ? y : CFG.surf + 8, before: g.delivered });
    g.delivered += n;
    g.stats.deliveredTotal += n;
    g.waveStats.saved += n;
    g.score += n * CFG.pts.deliver;
    while (g.delivered >= g.nextExtend) {
      g.nextExtend += CFG.extendEvery;
      if (g.lives < CFG.maxLives) {
        g.lives++;
        g.events.push({ type: "extend" });
      }
    }
  }

  function loadedFactor(n) {
    return n > 0 ? Math.max(CFG.loadedMin, CFG.loadedFirst - CFG.loadedPer * (n - 1)) : 1;
  }

  function population(g) {
    return g.lives;
  }

  // a wreck survivor in a life jacket: starts at the surface and sinks slowly
  function addSurvivor(g, x, y) {
    const sp = g.spec.floatSink;
    g.captives.push({ id: g.nextId++, x: wrap(x), y: y != null ? y : CFG.surf + 3 + rnd(g) * 6, sink: sp * (0.85 + rnd(g) * 0.3), drift: (rnd(g) * 2 - 1) * 3, ph: rnd(g) * 6.28, jacket: true, spill: null });
  }

  function addCaptive(g, x, y, spill) {
    const base = g.spec.sinkSpeed;
    g.captives.push({
      id: g.nextId++,
      x: wrap(x),
      y: Math.max(CFG.surf + 3, Math.min(CFG.seabed - 4, y)),
      sink: base * (0.85 + rnd(g) * 0.3),
      drift: (rnd(g) * 2 - 1) * 4,
      ph: rnd(g) * 6.28,
      spill,
    });
  }

  function blast(g, x, y, cause, r) {
    g.blasts.push({ x, y, t: 0, cause, r: r || CFG.blastR });
    g.events.push({ type: "blast", x, y, cause });
  }

  function killPlayer(g, cause) {
    const p = g.player;
    if (!p.alive) return;
    p.alive = false;
    g.stats.deaths[cause] = (g.stats.deaths[cause] || 0) + 1;
    g.lostRun = 0; // a miss clears the count
    // whoever the raiders already hold now belongs to this miss: if they are carried into port
    // later it does not count against the next sub
    for (const e of g.enemies) if (e.load > 0) e.forfeit = e.load;
    if (cause === "lost" && p.cargo > 0) {
      // recalled, not sunk: whoever is aboard goes home with it
      saveN(g, p.cargo, p.x, p.y);
      p.cargo = 0;
    }
    if (p.cargo > 0) {
      const id = "sub" + g.nextId++;
      g.spills[id] = { total: p.cargo, caught: 0, lost: 0, fromSub: true };
      for (let i = 0; i < p.cargo; i++) {
        addCaptive(g, p.x + (i - (p.cargo - 1) / 2) * 5, p.y, id);
        g.captives[g.captives.length - 1].safeT = CFG.blastT + 0.05; // thrown clear of the blast that sank the sub
      }
      g.stats.lostWithSub += p.cargo;
      p.cargo = 0;
    }
    g.lives--;
    g.mode = "dead";
    g.modeT = 0;
    g.torp = null;
    g.events.push({ type: "death", x: p.x, y: p.y, cause });
  }

  function sinkEnemy(g, e) {
    e.alive = false;
    const y = e.kind === "ship" ? CFG.surf + 3 : e.y;
    g.wrecks.push({ x: e.x, y, kind: e.kind, dir: e.dir, t: 0 });
    // an arm caught mid-lift lets go too
    const n = e.load;
    g.score += CFG.pts.perLoad * n;
    if (e.kind === "ship") g.stats.shipsSunk++;
    else if (e.kind === "dd") {
      g.stats.ddSunk++;
      g.score += CFG.pts.dd;
    } else g.stats.esubsSunk++;
    if (n > 0) {
      const id = "e" + e.id;
      g.spills[id] = { total: n, caught: 0, lost: 0 };
      g.stats.spills++;
      g.stats.spillSizes.push(n);
      for (let i = 0; i < n; i++) addCaptive(g, e.x + (i - (n - 1) / 2) * 5, y + (e.kind === "ship" ? 0 : (rnd(g) * 2 - 1) * 3), id);
    }
    e.load = 0;
    g.events.push({ type: "sink", kind: e.kind, x: e.x, y, n, id: e.id, spill: n > 0 ? "e" + e.id : null });
  }

  // a whole spill caught: n^2 × 100, so letting a collector gather is worth the risk
  function settleSpill(g, id) {
    const sp = g.spills[id];
    if (!sp || sp.done) return;
    if (sp.caught + sp.lost < sp.total) return;
    sp.done = true;
    if (sp.lost === 0 && !sp.fromSub) {
      const bonus = CFG.pts.spillSq * sp.total * sp.total;
      g.score += bonus;
      g.stats.allSaved++;
      g.stats.spillBonus += bonus;
      g.events.push({ type: "allSaved", x: g.player.x, y: g.player.y, bonus, n: sp.total });
    }
  }

  function loseCaptive(g, c, how) {
    const sp = c.spill && g.spills[c.spill];
    if (sp) sp.lost++;
    g.waveStats.lost++;
    loseSurvivors(g, 1, c.x, c.y, !!(sp && sp.fromSub && c.spill && c.spill.startsWith("sub")));
    if (how === "blast") g.stats.blasted++;
    else g.stats.drowned++;
    g.events.push({ type: how === "blast" ? "captiveBlasted" : "drown", x: c.x, y: c.y });
    if (c.spill) settleSpill(g, c.spill);
  }

  // input: {x:-1..1, y:-1..1, fire:bool}
  function step(g, input) {
    input = input || { x: 0, y: 0, fire: false };
    g.events.length = 0;
    g.t += DT;
    g.modeT += DT;
    const firePressed = !!input.fire && !g.prevFire;
    g.prevFire = !!input.fire;

    if (g.mode === "over") return g;
    if (g.mode === "ready") {
      if (g.modeT >= CFG.readyT) {
        g.mode = "play";
        g.modeT = 0;
      }
      return g;
    }
    if (g.mode === "clear") {
      if (g.modeT >= CFG.clearT) {
        if (g.wave >= FINAL_WAVE) {
          // the campaign is over: the sub comes home and lies at the jetty, steady (no respawn
          // invulnerability blinking on the ALL CLEAR screen)
          const p = g.player;
          p.inv = 0;
          p.x = wrap(HOME);
          p.y = CFG.subMinY + 2;
          p.vx = p.vy = 0;
          p.face = 1;
          // the campaign is won: the subs in hand are worth points
          const bonus = g.lives * CFG.pts.subLeft + ((g.perfectWaves || 0) >= FINAL_WAVE ? CFG.pts.allPerfect : 0);
          g.score += bonus;
          g.events.push({ type: "allclear", bonus, lives: g.lives, allPerfect: (g.perfectWaves || 0) >= FINAL_WAVE });
          return gameOver(g, "allclear");
        }
        g.player.inv = 1;
        // every wave sorties from our harbour: the sub and the ferry start there
        spawnPlayer(g, HOME);
        g.player.inv = 1;
        g.ferry = newFerry();
        g.torp = null;
        beginWave(g, g.wave + 1);
      }
      return g;
    }

    g.waveStats.t += DT;
    if (g.mode === "play") updatePlayer(g, input, firePressed);
    updateFerry(g);
    updateLaunch(g);
    updateEnemies(g);
    updateTorp(g);
    updateEtorps(g);
    updateCharges(g);
    updateShells(g);
    updateMines(g);
    updateCaptives(g);
    updateBlasts(g);
    for (const w of g.wrecks) w.t += DT;
    g.wrecks = g.wrecks.filter((w) => w.t < 2);

    if (g.mode === "dead" && g.modeT >= CFG.respawnT) {
      if (g.lives <= 0) return gameOver(g, "lives");
      spawnPlayer(g, HOME);
      g.mode = "play";
      g.modeT = 0;
    }


    // wave clear: every survivor has reached a port — ours or theirs. Nobody in the water,
    // aboard a raider, aboard our sub or aboard our ferry.
    if (g.mode === "play" && !(g.raidQueue && g.raidQueue.length) && g.captives.length === 0 && !g.enemies.some((e) => e.load > 0) && g.player.cargo === 0 && !(g.ferry.alive && g.ferry.load > 0)) {
      g.stats.waveTimes.push(g.waveStats.t);
      g.stats.wavesCleared++;
      const perfect = g.waveStats.lost === 0 && g.waveStats.people > 0;
      // the loss figures still standing are worth points; the count itself resets when the next
      // wave starts, so the clear screen still shows what was lost
      const standing = Math.max(0, CFG.lostPerMiss - g.lostRun);
      const standBonus = standing * CFG.pts.standing * g.wave;
      g.score += standBonus;
      const bonus = perfect ? 1000 * g.wave : 0;
      if (perfect) g.perfectWaves = (g.perfectWaves || 0) + 1;
      g.score += bonus;
      g.mode = "clear";
      g.modeT = 0;
      clearHazards(g);
      g.events.push({ type: "clear", perfect, bonus, standing, standBonus, saved: g.waveStats.saved, lost: g.waveStats.lost });
    }
    return g;
  }

  function gameOver(g, why) {
    g.mode = "over";
    g.modeT = 0;
    g.overWhy = why;
    g.events.push({ type: "over", why });
    return g;
  }

  function updatePlayer(g, input, firePressed) {
    const p = g.player;
    if (!p.alive) return;
    if (p.inv > 0) p.inv -= DT;
    const slow = 1 - CFG.cargoSlow * p.cargo;
    const ix = Math.max(-1, Math.min(1, input.x || 0));
    const iy = Math.max(-1, Math.min(1, input.y || 0));
    if (ix > 0.2) p.face = 1;
    else if (ix < -0.2) p.face = -1;
    const tvx = ix * CFG.subVx * slow;
    const tvy = iy * CFG.subVy * slow + p.cargo * CFG.cargoSink;
    const k = 1 - Math.exp(-CFG.subAccel * DT);
    p.vx += (tvx - p.vx) * k;
    p.vy += (tvy - p.vy) * k;
    p.x = wrap(p.x + p.vx * DT);
    p.y += p.vy * DT;
    if (p.y < CFG.subMinY) {
      p.y = CFG.subMinY;
      if (p.vy < 0) p.vy = 0;
    }
    if (p.y > CFG.subMaxY) {
      p.y = CFG.subMaxY;
      if (p.vy > 0) p.vy = 0;
    }
    if (firePressed && !g.torp) {
      g.torp = { x: wrap(p.x + p.face * 8), y: p.y, vx: p.face * CFG.torpSpeed, vy: -CFG.torpSpeed * CFG.torpRise, t: 0 };
      g.stats.shots++;
      g.events.push({ type: "fire", x: p.x, y: p.y, band: p.y <= CFG.fireBand });
    }
    if (p.cargo > 0 && Math.abs(dx(p.x, HOME)) < CFG.homeDX && p.y < CFG.surf + CFG.homeDY) {
      g.unloadT += DT;
      if (g.unloadT >= CFG.unloadEvery) {
        g.unloadT = 0;
        p.cargo--;
        saveN(g, 1, p.x, p.y);
        g.events.push({ type: "deliver", x: p.x, y: p.y, left: p.cargo });
      }
    } else g.unloadT = CFG.unloadEvery * 0.5;
  }

  // ---- our ferry -------------------------------------------------------------------------
  function updateFerry(g) {
    const f = g.ferry;
    const p = g.player;
    if (!f.alive) {
      f.respawnT -= DT;
      if (f.respawnT <= 0) {
        Object.assign(f, newFerry());
        g.events.push({ type: "ferryLaunch", x: f.x });
      }
      return;
    }
    let goal;
    if (f.state === "return") goal = HOME;
    else {
      // hold station out on the side of the ring where the sub is
      if (p.alive && Math.abs(dx(HOME, p.x)) > CFG.homeDX) f.side = Math.sign(dx(HOME, p.x));
      goal = wrap(HOME + (f.side || 1) * CFG.ferryStation);
    }
    const d = dx(f.x, goal);
    // nothing left at sea: full steam home, so the wave is not left waiting on the ferry
    const settled = g.captives.length === 0 && !g.enemies.some((e) => e.load > 0);
    const v = Math.max(-1, Math.min(1, d / 12)) * CFG.ferrySpeed * (settled && f.state === "return" ? 2 : 1);
    f.v = v;
    if (Math.abs(v) > 1) f.dir = Math.sign(v);
    f.x = wrap(f.x + v * DT);
    // hand-over: the sub surfaces under the ferry (not inside our harbour, where it unloads itself)
    const atHome = Math.abs(dx(p.x, HOME)) < CFG.homeDX;
    if (p.alive && g.mode === "play" && p.cargo > 0 && f.load < CFG.ferryCap && !atHome && Math.abs(dx(p.x, f.x)) < CFG.handDX && p.y < CFG.surf + CFG.handDY) {
      f.handT += DT;
      if (f.handT >= CFG.handEvery) {
        f.handT = 0;
        p.cargo--;
        f.load++;
        f.lastHand = g.t;
        g.stats.handed++;
        g.events.push({ type: "hand", x: f.x, load: f.load, left: p.cargo });
      }
    } else f.handT = CFG.handEvery * 0.5;
    if (f.state === "out" && f.load > 0 && (f.load >= CFG.ferryCap || g.t - f.lastHand > CFG.ferryWait)) {
      f.state = "return";
      g.events.push({ type: "ferryTurn", x: f.x });
    }
    if (f.state === "return" && Math.abs(dx(f.x, HOME)) < 3) {
      const n = f.load;
      f.load = 0;
      f.state = "out";
      saveN(g, n, f.x, CFG.surf);
      g.stats.ferryHome += n;
      if (n) g.events.push({ type: "ferryHome", x: f.x, n });
    }
  }

  function updateShells(g) {
    const f = g.ferry;
    for (const sh of g.shells) {
      sh.t += DT;
      const k = sh.t / CFG.shellFlight;
      sh.x = wrap(sh.x0 + dx(sh.x0, sh.x1) * k);
      sh.y = CFG.surf - 4 - Math.sin(Math.PI * Math.min(1, k)) * 34;
      if (k >= 1) {
        sh.dead = true;
        // the shell bursts at the surface; the blast reaches down into the water
        blast(g, sh.x1, CFG.surf, "shell", CFG.shellBlastR);
        if (f.alive && Math.abs(dx(sh.x1, f.x)) < CFG.shellHitDX) {
          f.hp--;
          g.stats.ferryHits++;
          g.events.push({ type: "ferryHit", x: f.x, hp: f.hp });
          if (f.hp <= 0) sinkFerry(g);
        } else g.events.push({ type: "splash", x: sh.x1 });
      }
    }
    g.shells = g.shells.filter((sh) => !sh.dead);
  }

  function sinkFerry(g) {
    const f = g.ferry;
    f.alive = false;
    f.respawnT = CFG.ferryRespawn;
    g.stats.ferrySunk++;
    g.wrecks.push({ x: f.x, y: CFG.surf + 3, kind: "ferry", dir: f.dir, t: 0 });
    const n = f.load;
    g.stats.ferrySpilled += n;
    if (n > 0) {
      // like any carrier: everyone aboard goes into the sea and sinks (no bonus for re-catching)
      const id = "ferry" + g.nextId++;
      g.spills[id] = { total: n, caught: 0, lost: 0, fromSub: true };
      for (let i = 0; i < n; i++) {
        addCaptive(g, f.x + (i - (n - 1) / 2) * 5, CFG.surf + 3, id);
        g.captives[g.captives.length - 1].safeT = CFG.blastT + 0.05; // clear of the burst that sank it
      }
    }
    f.load = 0;
    g.events.push({ type: "ferrySink", x: f.x, n });
  }

  // ---- raiders ---------------------------------------------------------------------------
  const reachable = (e, c) => (e.kind === "ship" ? c.y <= CFG.surf + CFG.armReach - 6 : c.y > CFG.surf + 20);
  const inHomeWater = (x) => Math.abs(dx(x, HOME)) < CFG.homeFree;

  function updateRaid(g) {
    if (!g.raidQueue || !g.raidQueue.length) return;
    g.raidT += DT;
    while (g.raidQueue.length && g.raidQueue[0].at <= g.raidT) {
      const q = g.raidQueue.shift();
      const e = launchEnemy(g, q.kind, -q.side, wrap(HOME + q.side * q.d));
      e.load = q.load;
      e.state = "home";
      e.raider = true;
      if (q.kind === "esub") e.y = CFG.surf + 30 + rnd(g) * 30; // shallow enough to be shot at from below
      g.events.push({ type: "flee", kind: q.kind, x: e.x, y: e.y, load: q.load });
      if (q.escort) {
        const d = launchEnemy(g, "dd", -q.side, wrap(e.x + q.side * CFG.ddGuard));
        d.state = "escort";
        d.of = e.id;
        d.y = CFG.surf;
        d.cd = 1.2;
      }
    }
  }

  function updateLaunch(g) {
    if (g.mode !== "play" && g.mode !== "dead") return;
    updateRaid(g);
    g.launchT -= DT;
    if (g.launchT > 0) return;
    if (g.burst > 0) {
      g.burst--;
      g.launchT = 0.6;
    } else g.launchT = g.spec.launchEvery;
    // only sortie while there is someone out there to take — or a sub of ours still carrying
    // survivors when the sea is otherwise settled (then grab-subs come after the sub itself)
    const free = g.captives.filter((c) => !inHomeWater(c.x));
    const ships = g.enemies.filter((e) => e.kind === "ship").length;
    const subs = g.enemies.filter((e) => e.kind === "esub").length;
    if (!free.length) {
      if (g.player.alive && g.player.cargo > 0 && subs < Math.max(1, g.spec.esubMax)) launchEnemy(g, "esub", rnd(g) < 0.5 ? -1 : 1);
      return;
    }
    // grab-ships work the upper water with their arms; grab-subs ride along under them, taking
    // anyone who sinks past the arms' reach
    let kind = null;
    if (ships < g.spec.shipMax && (subs >= g.spec.esubMax || subs >= ships)) kind = "ship";
    else if (subs < g.spec.esubMax && ships > 0) kind = "esub";
    else if (ships < g.spec.shipMax) kind = "ship";
    if (!kind) return;
    // a grab-ship takes the side of the ring with more survivors in the water (ties at random)
    let side = rnd(g) < 0.5 ? -1 : 1;
    if (kind === "ship") {
      let a = 0;
      for (const c of free) a += dx(PORT, c.x) > 0 ? 1 : -1;
      if (a !== 0 && rnd(g) < 0.75) side = a > 0 ? 1 : -1;
    }
    const e = launchEnemy(g, kind, side);
    // an escort destroyer may sail with a grab-ship
    if (kind === "ship" && rnd(g) < g.spec.escortP) {
      const d = launchEnemy(g, "dd", side, wrap(e.x - side * CFG.ddGuard));
      d.state = "escort";
      d.of = e.id;
      d.y = CFG.surf;
      d.cd = 1.5;
    }
  }

  function launchEnemy(g, kind, side, atX) {
    const e = {
      id: g.nextId++,
      kind,
      route: side,
      turnX: wrap(PORT + side * (WORLD / 2 - CFG.turnFromHome)),
      x: atX != null ? atX : wrap(PORT + side * (CFG.escapeDX + 6)),
      y: kind === "ship" ? CFG.surf : CFG.esubPortY, // a grab-sub dives from the harbour mouth
      dir: 1,
      load: 0,
      alive: true,
      state: kind === "ship" ? "out" : "hunt",
      target: null,
      arm: 0, // ship: arm length below the hull
      held: null,
      cd: kind === "ship" ? 1.5 : 2,
      aim: 0,
      t: 0,
    };
    g.enemies.push(e);
    if (atX == null) g.events.push({ type: "launch", kind, x: e.x, y: e.y });
    return e;
  }

  function pickTarget(g, e) {
    let best = null;
    let bd = 1e9;
    const claimed = new Set(g.enemies.filter((o) => o !== e && o.alive && o.target).map((o) => o.target));
    for (const c of g.captives) {
      if (claimed.has(c.id) || !reachable(e, c) || inHomeWater(c.x)) continue;
      // a trawling ship only works the water between itself and its port (and just behind)
      if (e.kind === "ship" && dx(e.x, c.x) * -e.route < -20) continue;
      const d = Math.abs(dx(e.x, c.x)) + (e.kind === "esub" ? Math.abs(c.y - e.y) : 0);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  function updateEnemies(g) {
    const p = g.player;
    const s = g.spec;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      e.t += DT;
      e.cd -= DT;
      e.px = e.x; // velocity is read back after the move (vx)
      if (e.kind === "dd") {
        updateDestroyer(g, e);
        continue;
      }
      const cap = e.kind === "ship" ? CFG.shipCap : CFG.esubCap;
      const speed = (e.kind === "ship" ? s.shipSpeed : s.esubSpeed) * loadedFactor(e.load);
      let tgt = e.target != null ? g.captives.find((c) => c.id === e.target) : null;
      if (tgt && (!reachable(e, tgt) || inHomeWater(tgt.x)) && e.state !== "lift") tgt = null;
      if (!tgt && (e.state === "hunt" || (e.state === "patrol" && e.t % 0.5 < DT))) {
        tgt = e.load < cap ? pickTarget(g, e) : null;
        e.target = tgt ? tgt.id : null;
        if (tgt) e.state = "hunt";
        else if (e.kind === "esub" && e.load === 0 && (g.enemies.some((o) => o.kind === "ship" && o.alive) || (p.alive && p.cargo > 0))) e.state = "patrol";
        else e.state = "home";
      }
      if (e.state === "hunt" && e.load >= cap) e.state = "home";

      if (e.kind === "ship") {
        if (e.state === "out") {
          // sail out just past the farthest survivor on this side, then trawl back toward the port
          let far = -1;
          for (const c of g.captives) {
            if (!reachable(e, c) || inHomeWater(c.x)) continue;
            const d = dx(PORT, c.x) * e.route;
            if (d > 0 && d > far) far = d;
          }
          const limit = WORLD / 2 - CFG.turnFromHome;
          const turnD = far < 0 ? 0 : Math.min(limit, far + 8);
          e.turnX = wrap(PORT + e.route * turnD);
          e.dir = e.route;
          e.x = wrap(e.x + e.dir * speed * DT);
          if (dx(PORT, e.x) * e.route >= turnD - 2) e.state = "hunt";
        } else if (e.state === "hunt") {
          const d = dx(e.x, tgt.x);
          if (Math.abs(d) > 2) {
            e.dir = sgn(d);
            e.x = wrap(e.x + e.dir * Math.min(Math.abs(d), speed * DT));
            e.arm = Math.max(0, e.arm - CFG.armSpeed * 2 * DT);
          } else {
            // over it: lower the arm
            e.x = wrap(e.x + Math.max(-1, Math.min(1, d)) * 10 * DT);
            e.arm += CFG.armSpeed * DT;
            const tipY = CFG.surf + 4 + e.arm;
            if (tipY >= tgt.y - 2 && e.arm >= 5 && Math.abs(dx(e.x, tgt.x)) < 5) {
              g.captives = g.captives.filter((c) => c !== tgt);
              e.load++;
              e.held = true;
              e.state = "lift";
              e.target = null;
              g.events.push({ type: "grab", kind: "ship", x: e.x, y: tgt.y, load: e.load });
            } else if (e.arm > CFG.armReach) e.target = null;
          }
        } else if (e.state === "lift") {
          e.arm -= CFG.armSpeed * 1.3 * DT;
          if (e.arm <= 0 && (e.liftT = (e.liftT || 0) + DT) > 0.5) {
            e.liftT = 0;
            e.arm = 0;
            e.held = null;
            e.state = e.load >= cap ? "home" : "hunt";
          }
        } else if (e.state === "home") {
          e.arm = Math.max(0, e.arm - CFG.armSpeed * 2 * DT);
          const d = dx(e.x, PORT);
          e.dir = sgn(d);
          e.x = wrap(e.x + e.dir * speed * DT);
          if (e.load < cap && e.t % 1 < DT) {
            const t2 = pickTarget(g, e);
            if (t2 && Math.abs(dx(e.x, t2.x)) < 120) {
              e.state = "hunt";
              e.target = t2.id;
            }
          }
        }
        // mines on the sub passing well below: the stern lamp flashes first, then the mine drops
        if (e.mineT > 0) {
          e.mineT -= DT;
          if (e.mineT <= 0) {
            g.mines.push({ x: e.x, y: CFG.surf + 4, stopY: Math.min(CFG.seabed - 10, Math.max(CFG.surf + CFG.mineMinDepth, e.mineY)), t: 0, id: g.nextId++ });
            g.events.push({ type: "mineDrop", x: e.x });
          }
        } else if (p.alive && g.mode === "play" && e.cd <= 0 && Math.abs(dx(e.x, p.x)) < CFG.mineSense && p.y > CFG.surf + CFG.mineMinDepth) {
          e.cd = s.mineCd;
          e.mineT = CFG.mineTell;
          e.mineY = p.y + (rnd(g) * 2 - 1) * 5;
          g.events.push({ type: "mineTell", x: e.x });
        }
        // deck gun: shells our sub when it is up near the surface, or a loaded ferry; the gun
        // flashes first, and the shell is aimed where the target will be when it lands
        const f = g.ferry;
        if (e.shellT > 0) {
          e.shellT -= DT;
          // while the gun flashes it is still laying on: the aim point follows the target
          const tgtSub = e.shellAt === "sub";
          if (tgtSub && p.alive) e.aimX = wrap(p.x + p.vx * CFG.shellFlight * 0.6);
          else if (!tgtSub && f.alive) e.aimX = wrap(f.x + f.v * CFG.shellFlight);
          if (e.shellT <= 0) {
            const ok = tgtSub ? p.alive : f.alive;
            if (ok) {
              const tx = e.aimX; // locked when it fires
              g.shells.push({ x0: e.x, x1: tx, t: 0, x: e.x, y: CFG.surf - 4, at: e.shellAt });
              g.stats.shells++;
              g.events.push({ type: "shellFire", x: e.x, tx, at: e.shellAt });
            }
          }
        } else if (g.mode === "play" && (e.scd = (e.scd == null ? 1.2 : e.scd) - DT) <= 0) {
          const subUp = p.alive && p.inv <= 0 && p.y <= CFG.surf + s.gunReach && Math.abs(dx(e.x, p.x)) < CFG.shellRange;
          const ferryUp = f.alive && f.load > 0 && Math.abs(dx(e.x, f.x)) < CFG.shellRange;
          if (subUp || ferryUp) {
            e.shellAt = subUp ? "sub" : "ferry";
            e.scd = s.shellCd;
            e.shellT = CFG.shellTell;
            e.aimX = subUp ? p.x : f.x;
            g.events.push({ type: "shellTell", x: e.x, at: e.shellAt });
          } else e.scd = 0.1;
        }
      } else {
        // grab-sub
        if (e.state !== "patrol") e.stalking = false;
        if (e.state === "hunt") {
          const ddx = dx(e.x, tgt.x);
          const ddy = tgt.y - e.y;
          const L = Math.hypot(ddx, ddy) || 1;
          if (Math.abs(ddx) > 1) e.dir = sgn(ddx);
          if (e.aim <= 0) {
            e.x = wrap(e.x + (ddx / L) * speed * DT);
            e.y += (ddy / L) * speed * DT;
          }
          if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) {
            g.captives = g.captives.filter((c) => c !== tgt);
            e.load++;
            e.target = null;
            g.events.push({ type: "grab", kind: "esub", x: e.x, y: e.y, load: e.load });
          }
        } else if (e.state === "patrol" && p.alive && p.inv <= 0 && Math.abs(dx(e.x, p.x)) < CFG.esubHuntDX && e.aim <= 0 && g.enemies.some((o) => o.kind === "ship" && o.alive)) {
          // our sub is close: get on its depth line, at torpedo range, and shoot
          const side = Math.sign(dx(p.x, e.x)) || 1;
          const ddx = dx(e.x, wrap(p.x + side * 80));
          const ddy = p.y - e.y;
          e.dir = -side;
          e.x = wrap(e.x + Math.max(-1, Math.min(1, ddx / 20)) * speed * DT);
          e.y += Math.max(-1, Math.min(1, ddy / 8)) * speed * 0.8 * DT;
        } else if (e.state === "patrol") {
          // shadow the fullest grab-ship from below
          let f = null;
          for (const o of g.enemies) if (o.kind === "ship" && o.alive && (!f || o.load > f.load)) f = o;
          // stalk only a sub sitting on survivors once the sea is settled (nobody left in the water,
          // no raider carrying anyone)
          e.stalking = !f && p.alive && p.cargo > 0 && g.captives.length === 0 && !g.enemies.some((o) => o.load > 0);
          if (e.stalking) {
            // nothing left to shadow: stalk our loaded sub along its depth line
            if (e.aim <= 0) {
              // close in on it; torpedo it along its depth, or ram it
              const ddx = dx(e.x, p.x);
              const ddy = p.y - e.y;
              if (Math.abs(ddx) > 1) e.dir = sgn(ddx);
              e.x = wrap(e.x + Math.max(-1, Math.min(1, ddx / 20)) * speed * DT);
              e.y += Math.max(-1, Math.min(1, ddy / 10)) * speed * 0.6 * DT;
            }
          } else if (!f) e.state = "home";
          else if (e.aim <= 0) {
            const ddx = dx(e.x, f.x);
            const ddy = CFG.surf + 58 - e.y;
            if (Math.abs(ddx) > 1) e.dir = sgn(ddx);
            e.x = wrap(e.x + Math.max(-1, Math.min(1, ddx / 20)) * speed * DT);
            e.y += Math.max(-1, Math.min(1, ddy / 10)) * speed * 0.5 * DT;
          }
        } else if (e.state === "home") {
          const d = dx(e.x, PORT);
          e.dir = sgn(d);
          // rise toward the harbour mouth on the way in; it can only enter near the surface. With
          // people aboard it runs shallow the whole way.
          const toPort = Math.abs(d);
          if (e.aim <= 0) {
            const wantY = toPort < CFG.esubSurfaceDX ? CFG.esubPortY : e.load > 0 ? CFG.surf + CFG.esubLoadedDepth : e.y;
            e.y += Math.max(-1, Math.min(1, (wantY - e.y) / 6)) * speed * 0.7 * DT;
            if (toPort > CFG.escapeDX - 4 || e.y <= CFG.esubPortY + 4) e.x = wrap(e.x + e.dir * Math.min(toPort, speed * DT));
          }
          if (e.load < cap && e.t % 1 < DT) {
            const t2 = pickTarget(g, e);
            if (t2 && Math.abs(dx(e.x, t2.x)) < 100) {
              e.state = "hunt";
              e.target = t2.id;
            }
          }
        }
        e.y = Math.max(CFG.esubPortY, Math.min(CFG.seabed - 8, e.y));
        // torpedo along its own depth, after a visible aim
        if (e.aim > 0) {
          e.aim -= DT;
          if (e.aim <= 0) {
            const d = p.alive ? sgn(dx(e.x, p.x)) : e.dir;
            e.dir = d;
            g.etorps.push({ x: wrap(e.x + d * 9), y: e.y, vx: d * CFG.etorpSpeed, t: 0 });
            g.events.push({ type: "efire", x: e.x, y: e.y });
            e.cd = s.esubCd;
          }
        } else if (p.alive && g.mode === "play" && e.cd <= 0 && Math.abs(p.y - e.y) < CFG.esubDY && Math.abs(dx(e.x, p.x)) < CFG.esubRange && Math.abs(dx(e.x, p.x)) > 20) {
          e.aim = CFG.esubAim;
          e.dir = sgn(dx(e.x, p.x));
          g.events.push({ type: "eaim", x: e.x, y: e.y });
        }
        // contact: a grab-sub stalking our loaded sub rams it; otherwise the hulls just bump apart
        if (e.bumpT > 0) e.bumpT -= DT;
        if (p.alive && g.mode === "play" && p.inv <= 0 && Math.abs(dx(e.x, p.x)) < CFG.esubHW + 6 && Math.abs(e.y - p.y) < CFG.esubHH + 5) {
          if (e.stalking) {
            killPlayer(g, "ram");
            sinkEnemy(g, e);
            continue;
          }
          if (!(e.bumpT > 0)) {
            e.bumpT = 0.4;
            p.vx = sgn(dx(e.x, p.x)) * 90;
            p.vy = sgn(p.y - e.y) * 50;
            g.events.push({ type: "bump", x: p.x, y: p.y });
          }
        }
      }
      // home: carried survivors are gone
      const docked = e.kind === "ship" || e.y <= CFG.esubPortY + 4;
      if ((e.state === "home" || e.load >= cap) && Math.abs(dx(e.x, PORT)) < CFG.escapeDX && docked) {
        e.alive = false;
        if (e.load > 0) {
          g.stats.taken += e.load;
          g.waveStats.taken += e.load;
          g.waveStats.lost += e.load;
          loseSurvivors(g, e.load, e.x, e.y, false, Math.min(e.load, e.forfeit || 0));
          g.events.push({ type: "taken", x: e.x, n: e.load, kind: e.kind });
        }
        e.load = 0;
      }
    }
    for (const e of g.enemies) if (e.px != null) e.vx = dx(e.px, e.x) / DT;
    g.enemies = g.enemies.filter((e) => e.alive);
  }

  function updateTorp(g) {
    const t = g.torp;
    if (!t) return;
    t.t += DT;
    t.x = wrap(t.x + t.vx * DT);
    t.y += t.vy * DT;
    if (t.t >= CFG.torpLife) {
      g.torp = null;
      return;
    }
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const hit =
        e.kind === "ship" || e.kind === "dd"
          ? t.y <= CFG.surf + CFG.hullDepth && Math.abs(dx(e.x, t.x)) < (e.kind === "dd" ? CFG.ddHW : CFG.shipHW)
          : Math.abs(dx(e.x, t.x)) < CFG.esubHW && Math.abs(e.y - t.y) < CFG.esubHH + 2;
      if (hit) {
        sinkEnemy(g, e);
        g.torp = null;
        return;
      }
    }
    if (t.y <= CFG.surf) {
      // broke the surface without finding a hull
      g.events.push({ type: "breach", x: t.x });
      g.torp = null;
      return;
    }
    for (const m of g.mines) {
      if (m.dead) continue;
      if (Math.abs(dx(m.x, t.x)) < 4 && Math.abs(m.y - t.y) < CFG.mineR + 1) {
        m.dead = true;
        g.score += CFG.pts.mine;
        g.stats.minesShot++;
        blast(g, m.x, m.y, "mine");
        g.torp = null;
        return;
      }
    }
  }

  // Escort destroyer: keeps station astern of its charge; when that is sunk it hunts our sub for
  // a while, then goes home. Whenever our sub is under water within range it drops a pair of
  // depth charges set to the sub's depth, after the rack flashes.
  function updateDestroyer(g, e) {
    const p = g.player;
    const s = g.spec;
    const speed = s.shipSpeed * (e.sortieT > 0 || e.state === "hunt" ? 1.35 : 1.1);
    const charge = e.of != null ? g.enemies.find((o) => o.id === e.of && o.alive) : null;
    if (e.state === "escort" && !charge) {
      e.state = "hunt";
      e.huntT = CFG.ddHunt;
    }
    let goal;
    // an escort breaks station to run at a sub that comes close, for a few seconds at a time
    if (e.state === "escort") {
      e.sortieT = (e.sortieT || 0) - DT;
      if (e.sortieT < -3 && p.alive && p.inv <= 0 && Math.abs(dx(e.x, p.x)) < CFG.ddChase) e.sortieT = 3;
    }
    if (e.state === "escort" && e.sortieT > 0 && p.alive) goal = p.x;
    else if (e.state === "escort") goal = wrap(charge.x - charge.dir * CFG.ddGuard);
    else if (e.state === "hunt") {
      e.huntT -= DT;
      goal = p.alive ? p.x : e.x;
      if (e.huntT <= 0) e.state = "home";
    }
    if (e.state === "home") goal = PORT;
    const d = dx(e.x, goal);
    const v = Math.max(-1, Math.min(1, d / 10)) * speed;
    if (Math.abs(v) > 2) e.dir = sgn(v);
    e.x = wrap(e.x + v * DT);
    if (e.state === "home" && Math.abs(dx(e.x, PORT)) < CFG.escapeDX) {
      e.alive = false;
      return;
    }
    // depth charges
    if (e.dropT > 0) {
      e.dropT -= DT;
      if (e.dropT <= 0) {
        for (const k of [-1, 0, 1]) g.charges.push({ x: wrap(e.x + k * CFG.chargeSpread), y: CFG.surf + 4, fuse: e.dropY + (rnd(g) * 2 - 1) * 4 });
        g.events.push({ type: "chargeDrop", x: e.x });
      }
    } else if (p.alive && g.mode === "play" && p.inv <= 0 && e.cd <= 0 && p.y > CFG.surf + 10 && Math.abs(dx(e.x, p.x)) < CFG.ddSense) {
      e.cd = s.ddCd;
      e.dropT = CFG.ddTell;
      e.dropY = Math.min(CFG.seabed - 6, p.y);
      g.events.push({ type: "chargeTell", x: e.x });
    }
  }

  function updateCharges(g) {
    const p = g.player;
    for (const c of g.charges) {
      c.y += CFG.chargeVy * DT;
      const touch = p.alive && Math.abs(dx(c.x, p.x)) < 8 && Math.abs(c.y - p.y) < 6;
      if (c.y >= c.fuse || touch) {
        c.dead = true;
        blast(g, c.x, c.y, "charge");
      }
    }
    g.charges = g.charges.filter((c) => !c.dead);
  }

  function updateEtorps(g) {
    const p = g.player;
    for (const t of g.etorps) {
      t.t += DT;
      t.x = wrap(t.x + t.vx * DT);
      if (t.t > CFG.etorpLife) t.dead = true;
      if (!t.dead && p.alive && g.mode === "play" && p.inv <= 0 && Math.abs(dx(t.x, p.x)) < 8 && Math.abs(t.y - p.y) < 5) {
        t.dead = true;
        blast(g, t.x, t.y, "etorp");
      }
      if (!t.dead)
        for (const c of g.captives)
          if (Math.abs(dx(t.x, c.x)) < 4 && Math.abs(t.y - c.y) < 4) {
            t.dead = true;
            blast(g, t.x, t.y, "etorp");
            break;
          }
    }
    g.etorps = g.etorps.filter((t) => !t.dead);
  }

  function updateMines(g) {
    const p = g.player;
    for (const m of g.mines) {
      if (m.dead) continue;
      m.t += DT;
      if (m.y < m.stopY) m.y = Math.min(m.stopY, m.y + CFG.mineVy * DT);
      if (m.t > CFG.mineLife) {
        m.dead = true;
        g.events.push({ type: "mineFizzle", x: m.x, y: m.y });
        continue;
      }
      let boom = p.alive && g.mode === "play" && p.inv <= 0 && Math.abs(dx(m.x, p.x)) < CFG.mineR + 7 && Math.abs(m.y - p.y) < CFG.mineR + 3;
      if (!boom) for (const c of g.captives) if (Math.abs(dx(m.x, c.x)) < CFG.mineR && Math.abs(m.y - c.y) < CFG.mineR) boom = true;
      if (boom) {
        m.dead = true;
        blast(g, m.x, m.y, "mine");
      }
    }
    g.mines = g.mines.filter((m) => !m.dead);
  }

  function updateBlasts(g) {
    const p = g.player;
    for (const b of g.blasts) {
      if (!b.r) b.r = CFG.blastR;
      const fresh = b.t === 0;
      b.t += DT;
      if (b.t <= CFG.blastLethal) {
        if (p.alive && g.mode === "play" && p.inv <= 0) {
          const ddx = dx(b.x, p.x);
          const ddy = p.y - b.y;
          if (ddx * ddx + ddy * ddy < (b.r + 3) * (b.r + 3)) killPlayer(g, b.cause === "etorp" || b.cause === "charge" || b.cause === "shell" ? b.cause : "mine");
        }
        for (const c of g.captives) {
          if (c.dead || c.safeT > 0) continue;
          const ddx = dx(b.x, c.x);
          const ddy = c.y - b.y;
          if (ddx * ddx + ddy * ddy < b.r * b.r) {
            c.dead = true;
            loseCaptive(g, c, "blast");
          }
        }
        if (fresh)
          for (const m of g.mines) {
            if (m.dead) continue;
            const ddx = dx(b.x, m.x);
            const ddy = m.y - b.y;
            if (ddx * ddx + ddy * ddy < (b.r + 4) * (b.r + 4)) {
              m.dead = true;
              m.chain = true;
            }
          }
      }
    }
    // sympathetic detonations start next tick
    for (const m of g.mines) if (m.chain) blast(g, m.x, m.y, "mine");
    g.mines = g.mines.filter((m) => !m.dead);
    g.blasts = g.blasts.filter((b) => b.t < CFG.blastT);
    g.captives = g.captives.filter((c) => !c.dead);
  }

  function updateCaptives(g) {
    const p = g.player;
    for (const c of g.captives) {
      c.ph += DT * 3;
      if (c.safeT > 0) c.safeT -= DT;
      c.y += c.sink * DT;
      c.x = wrap(c.x + (c.drift + Math.sin(c.ph) * 3) * DT);
      if (p.alive && g.mode === "play" && p.cargo < CFG.capacity && Math.abs(dx(p.x, c.x)) < CFG.pickDX && Math.abs(p.y - c.y) < CFG.pickDY) {
        c.dead = true;
        p.cargo++;
        g.stats.caught++;
        const sp = c.spill && g.spills[c.spill];
        if (sp) sp.caught++;
        g.events.push({ type: "catch", x: c.x, y: c.y, cargo: p.cargo, spill: !!c.spill });
        if (c.spill) settleSpill(g, c.spill);
        continue;
      }
      if (c.y >= CFG.seabed) {
        c.dead = true;
        loseCaptive(g, c, "drown");
      }
    }
    g.captives = g.captives.filter((c) => !c.dead);
  }

  const api = { W, H, DT, WORLD, HOME, PORT, CFG, FINAL_WAVE, waveSpec, newGame, step, wrap, dx, population, mulberry32, rnd, loadedFactor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UT = api;
})(typeof window !== "undefined" ? window : globalThis);
