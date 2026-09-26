// WRECKFALL core: deterministic, render-free simulation shared by the browser and node tests.
(function (root) {
  "use strict";

  const W = 224;
  const H = 256;
  const DT = 1 / 60;

  const CFG = {
    groundY: 244,
    playerY: 234,
    playerHalfW: 6,
    playerSpeed: 96,
    shotSpeed: 330,
    fireBuffer: 0.12,
    laneY0: 44,
    laneGap: 22,
    lanePoints: [50, 40, 30, 20, 10],
    hulkPoints: 150,
    laneBaseSpeed: [24, -32, 40, -22, 16],
    hulkSpeed: 17,
    escortRespawn: 2.4,
    enemyHalfW: 6,
    enemyHalfH: 4,
    wrap: W + 24,
    invadeY: 214,
    // The formation's descent is derived from a time allowance that grows with the work in the
    // wave: (base + per hulk + per thick) × pressure(wave). A landing is an immediate game over.
    timeBase: 24,
    timeHulk: 5,
    timeThick: 12,
    timeTwin: 10, // two hulk lanes: the upper one blocks shots at the lower
    convoyTime: 1.15, // CONVOY: alignments are rare
    pressurePerWave: 0.05,
    pressureMin: 0.55,
    // clear bonus per px of room left above the line, × wave; sized so that each second spent
    // farming respawning escorts costs more bonus than it earns
    heightBonus: 40, // × (wave + 1)
    wreckPop: -40,
    gravity: 360,
    wreckDrift: 0.5,
    wreckW0: 10,
    wreckGrow: 5,
    wreckWMax: 36,
    wreckHalfH: 4,
    bombSpeed: 100,
    bombTelegraph: 0.4,
    extendFirst: 30000,
    extendSecond: 100000,
    extendEvery: 100000, // after the second: 200000, 300000, …
    startLives: 3,
    respawnTime: 1.6,
    waveClearTime: 2.2,
    readyTime: 1.4,
    grazeGap: 6, // px beside the kill reach that still counts as a near miss
    endingTime: 4.5,
    shipsBonus: 10000, // per ship left (counting the one flying) when wave 12 is cleared
    // THICK hulk: a wreck that has swallowed fewer than thickMin craft breaks up on it and knocks
    // the extra plate off (the hulk becomes a plain one); a bigger wreck crushes it outright
    thickMin: 3,
    plateMin: 2,
    // MOTHERSHIP: crosses above the top lane now and then; its wreck is wide and counts as 3 craft
    ufoFirst: 9,
    ufoEvery: 20,
    ufoJitter: 6,
    ufoSpeed: 46,
    ufoHalfW: 8,
    ufoHalfH: 3,
    ufoAbove: 18,
    ufoPoints: 300,
    ufoN: 3,
    ufoW: 56,
    // SPLITTER: its wreck (or a wreck that swallows it) forks into two that spread apart
    splitV: 34,
  };

  // wave 1 plain, then plain and SPLITTER waves alternate (even waves carry splitters)
  // CAMPAIGN: 12 waves in 4 acts; clearing wave 12 ends the game (ALL CLEAR).
  //   act 1 (1-3)  one hulk lane: plain, then SPLITTER, then a THICK hulk
  //   act 2 (4-6)  TWIN LINE (two hulk lanes), then CONVOY, then REVERSE
  //   act 3 (7-9)  the behaviours again with two thick hulks and denser lanes
  //   act 4 (10-12) three thick hulks, then LAST STAND: four thick, splitters, mothership every ~10 s
  // Each wave adds at most one element not seen before; thick hulks sit in the bottom lane.
  // [name, hulk lanes, hulks per lane, thick, splitters, behaviour, escorts per lane, mothership every s]
  const CAMPAIGN = [
    ["", 1, 3, 0, false, "normal", 4, 20],
    ["", 1, 3, 0, true, "normal", 4, 20],
    ["", 1, 4, 1, false, "normal", 5, 20],
    ["TWIN LINE", 2, 3, 0, false, "normal", 5, 20],
    ["", 2, 4, 1, true, "convoy", 5, 20],
    ["", 2, 4, 1, false, "reverse", 5, 20],
    ["", 2, 4, 2, false, "convoy", 6, 18],
    ["", 2, 5, 2, true, "reverse", 6, 18],
    ["", 2, 5, 2, true, "normal", 6, 16],
    ["", 2, 5, 3, true, "convoy", 6, 16],
    ["", 2, 5, 3, false, "reverse", 6, 16],
    ["LAST STAND", 2, 5, 4, true, "normal", 6, 10],
  ];

  function waveDef(wave) {
    const r = CAMPAIGN[Math.min(wave, CAMPAIGN.length) - 1];
    return { name: r[0], lanes: r[1], hulks: r[2], thick: r[3], specials: r[4] ? ["split"] : [], behavior: r[5], perLane: r[6], ufoEvery: r[7] };
  }

  function timeAllowance(wave) {
    const d = waveDef(wave);
    const pressure = Math.max(CFG.pressureMin, 1 - CFG.pressurePerWave * (wave - 1));
    const work = CFG.timeBase + CFG.timeHulk * d.hulks * d.lanes + CFG.timeThick * d.thick + (d.lanes === 2 ? CFG.timeTwin : 0);
    return work * pressure * (d.behavior === "convoy" ? CFG.convoyTime : 1);
  }

  function waveParams(wave) {
    const w = wave - 1;
    const d = waveDef(wave);
    const startDrop = Math.min(2 * w, 10);
    const room0 = CFG.invadeY - (CFG.laneY0 + 4 * CFG.laneGap + startDrop + CFG.enemyHalfH);
    const T = timeAllowance(wave);
    return {
      name: d.name,
      perLane: d.perLane,
      hulks: d.hulks,
      thick: d.thick,
      ufoEvery: d.ufoEvery,
      speedMul: 1 + 0.06 * w,
      descent: room0 / T,
      timeAllowance: T,
      behavior: d.behavior,
      startDrop,
      bombInterval: Math.max(0.7, 1.7 - 0.12 * w),
      bombCap: Math.min(2 + Math.floor(w / 2), 5),
      armored: d.lanes === 2 ? [3, 4] : [4],
      specials: d.specials,
    };
  }

  function rng(s) {
    // mulberry32 on s.rng
    s.rng = (s.rng + 0x6d2b79f5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function createGame(seed, opts) {
    const s = {
      seed: seed >>> 0,
      rng: seed | 0,
      t: 0,
      mode: "ready", // ready | play | dead | clear | over
      modeT: 0,
      wave: 1,
      score: 0,
      lives: CFG.startLives,
      nextExtend: CFG.extendFirst,
      player: { x: W / 2, alive: true, vx: 0 },
      shot: null,
      fireHeld: false,
      fireBuf: 0,
      enemies: [],
      lanes: [],
      drop: 0,
      wrecks: [],
      bombs: [],
      bombT: 1.5,
      telegraphs: [],
      events: [],
      stats: { shots: 0, kills: 0, chains: [], deaths: { bomb: 0, wreck: 0, invade: 0 }, wavesCleared: 0, waveTimes: [] },
      waveStartT: 0,
      nextId: 1,
      opts: opts || {},
    };
    if (s.opts.startWave) s.wave = s.opts.startWave;
    setupWave(s);
    return s;
  }

  function setupWave(s) {
    const p = waveParams(s.wave);
    if (s.opts.specials) p.specials = s.opts.specials; // analysis override
    if (s.opts.behavior) p.behavior = s.opts.behavior; // analysis override
    s.params = p;
    s.enemies = [];
    s.lanes = [];
    for (let i = 0; i < 5; i++) {
      const armored = p.armored.indexOf(i) >= 0;
      let base = armored ? Math.sign(CFG.laneBaseSpeed[i]) * CFG.hulkSpeed : CFG.laneBaseSpeed[i];
      if (p.behavior === "convoy") base = Math.abs(base); // every lane streams the same way
      s.lanes.push({ v: base * p.speedMul, armored });
      // irregular spacing on the wrap circle
      const n = armored ? p.hulks : p.perLane;
      const slot = CFG.wrap / n;
      const phase = rng(s) * CFG.wrap;
      const kind = !armored && p.specials.length ? p.specials[i % p.specials.length] : "esc";
      for (let k = 0; k < n; k++) {
        const jitter = (rng(s) - 0.5) * slot * 0.5;
        const x = (phase + k * slot + jitter) % CFG.wrap;
        const thick = armored && i === 4 && !s.opts.noThick && k < p.thick; // bottom lane only
        s.enemies.push({ id: s.nextId++, lane: i, x: x - 12, alive: true, flash: 0, armored, thick, kind: armored ? "hulk" : k === 0 ? kind : "esc" });
      }
    }
    s.total = s.enemies.filter((e) => e.armored).length;
    s.respawns = [];
    s.drop = p.startDrop;
    s.wrecks = [];
    s.bombs = [];
    s.telegraphs = [];
    s.shot = null;
    s.bombT = 1.5;
    s.waveStartT = s.t;
    s.ufo = null;
    s.ufoT = CFG.ufoFirst;
  }

  // a lane's actual horizontal speed right now
  function laneV(s, lane) {
    return s.lanes[lane].v * tempo(s);
  }

  function ufoY(s) {
    return laneY(s, 0) - CFG.ufoAbove;
  }

  function moveUfo(s, dt, spawn) {
    if (s.ufo) {
      s.ufo.x += s.ufo.v * dt;
      if (s.ufo.x < -20 || s.ufo.x > W + 20) {
        s.ufo = null;
        emit(s, { type: "ufoGone" });
      }
    } else if (spawn) {
      s.ufoT -= dt;
      if (s.ufoT <= 0) {
        const dir = rng(s) < 0.5 ? 1 : -1;
        s.ufo = { x: dir > 0 ? -18 : W + 18, v: dir * CFG.ufoSpeed };
        s.ufoT = (s.params.ufoEvery || CFG.ufoEvery) + (rng(s) - 0.5) * 2 * CFG.ufoJitter;
        emit(s, { type: "ufo", dir });
      }
    }
  }

  function makeUfoWreck(s) {
    const u = s.ufo;
    s.ufo = null;
    const w = {
      id: s.nextId++,
      x: u.x,
      y: ufoY(s),
      vx: u.v * CFG.wreckDrift,
      vy: CFG.wreckPop,
      n: CFG.ufoN,
      w: CFG.ufoW,
      pts: CFG.ufoPoints,
      lanes: [],
      age: 0,
      ufo: true,
    };
    s.wrecks.push(w);
    s.stats.kills++;
    s.stats.ufos = (s.stats.ufos || 0) + 1;
    addScore(s, CFG.ufoPoints);
    emit(s, { type: "ufoHit", id: w.id, x: u.x, y: w.y, pts: CFG.ufoPoints });
  }

  function laneY(s, lane) {
    return CFG.laneY0 + lane * CFG.laneGap + s.drop;
  }

  function hulksLeft(s) {
    let n = 0;
    for (const e of s.enemies) if (e.alive && e.armored) n++;
    return n;
  }

  // lanes speed up as the hulks fall (the tempo the march sound follows)
  function tempo(s) {
    const left = hulksLeft(s) / s.total;
    return 1 + 0.6 * (1 - left);
  }

  function pointsOf(e) {
    return e.armored ? CFG.hulkPoints : CFG.lanePoints[e.lane];
  }

  // destroyed escorts re-enter from the edge they drift in from: a renewable wreck supply
  function queueRespawn(s, e) {
    if (!e.armored) s.respawns.push({ lane: e.lane, kind: e.kind, t: CFG.escortRespawn });
  }

  function doRespawns(s, dt) {
    for (let i = s.respawns.length - 1; i >= 0; i--) {
      const r = s.respawns[i];
      r.t -= dt;
      if (r.t > 0) continue;
      const v = s.lanes[r.lane].v;
      const x = v > 0 ? -12 : W + 11;
      let crowded = false;
      for (const e of s.enemies) if (e.alive && e.lane === r.lane && Math.abs(e.x - x) < 18) crowded = true;
      if (crowded) { r.t = 0.3; continue; }
      s.respawns.splice(i, 1);
      s.enemies.push({ id: s.nextId++, lane: r.lane, x, alive: true, flash: 0, armored: false, kind: r.kind || "esc" });
    }
  }

  function wrapX(x) {
    const lo = -12;
    let r = (x - lo) % CFG.wrap;
    if (r < 0) r += CFG.wrap;
    return r + lo;
  }

  function addScore(s, pts) {
    s.score += pts;
    while (s.score >= s.nextExtend) {
      s.lives++;
      s.nextExtend = s.nextExtend === CFG.extendFirst ? CFG.extendSecond : s.nextExtend + CFG.extendEvery;
      s.events.push({ type: "extend" });
    }
  }

  function emit(s, e) {
    s.events.push(e);
  }

  // `by` describes what killed the cannon (render uses it to point at the cause)
  function killPlayer(s, cause, by) {
    if (!s.player.alive) return;
    s.player.alive = false;
    s.stats.deaths[cause]++;
    s.mode = "dead";
    s.modeT = 0;
    s.shot = null;
    emit(s, { type: "death", cause, x: s.player.x, by: by || null });
  }

  function makeWreck(s, e, byShot) {
    e.alive = false;
    queueRespawn(s, e);
    const lv = laneV(s, e.lane);
    const w = {
      id: s.nextId++,
      x: e.x,
      y: laneY(s, e.lane),
      vx: lv * CFG.wreckDrift,
      vy: CFG.wreckPop,
      n: 1,
      w: CFG.wreckW0,
      pts: pointsOf(e),
      lanes: [e.lane],
      age: 0,
    };
    s.wrecks.push(w);
    s.stats.kills++;
    addScore(s, pointsOf(e));
    emit(s, { type: "hit", id: w.id, x: e.x, y: w.y, lane: e.lane, pts: pointsOf(e), byShot, armored: e.armored, kind: e.kind });
    if (e.kind === "split") fork(s, w);
    return w;
  }

  // the wreck splits: the original veers one way, a copy the other
  function fork(s, w) {
    const c = Object.assign({}, w, { id: s.nextId++, lanes: w.lanes.slice(), vx: w.vx + CFG.splitV });
    w.vx -= CFG.splitV;
    s.wrecks.push(c);
    emit(s, { type: "fork", id: w.id, child: c.id, x: w.x, y: w.y, n: w.n });
  }

  function step(s, input) {
    s.events = [];
    const dt = DT;
    s.t += dt;
    s.modeT += dt;
    input = input || {};

    if (s.mode === "over") return s;

    if (s.mode === "ready") {
      if (s.modeT >= CFG.readyTime) {
        s.mode = "play";
        s.modeT = 0;
        emit(s, { type: "go" });
      }
      movePlayer(s, input, dt);
      return s;
    }

    if (s.mode === "clear") {
      moveWrecks(s, dt);
      if (s.modeT >= (s.allClear ? CFG.endingTime : CFG.waveClearTime)) {
        if (s.allClear) {
          s.mode = "over";
          s.modeT = 0;
          emit(s, { type: "gameover", allClear: true });
          return s;
        }
        s.wave++;
        setupWave(s);
        s.mode = "ready";
        s.modeT = 0;
        emit(s, { type: "wave", wave: s.wave });
      }
      return s;
    }

    if (s.mode === "dead") {
      moveLanes(s, dt);
      moveUfo(s, dt, false);
      moveWrecks(s, dt);
      moveBombs(s, dt);
      if (s.modeT >= CFG.respawnTime && s.wrecks.length === 0) {
        s.lives--;
        if (s.lives <= 0) {
          s.mode = "over";
          s.modeT = 0;
          emit(s, { type: "gameover" });
          return s;
        }
        s.player = { x: W / 2, alive: true, vx: 0 };
        s.bombs = [];
        s.telegraphs = [];
        s.bombT = 1.2;
        s.mode = "ready";
        s.modeT = 0;
        emit(s, { type: "respawn" });
      }
      return s;
    }

    // play
    movePlayer(s, input, dt);
    handleFire(s, input, dt);
    moveLanes(s, dt);
    s.drop += s.params.descent * dt;
    doRespawns(s, dt);
    moveUfo(s, dt, !s.opts.noUfo);
    moveShot(s, dt);
    moveWrecks(s, dt);
    moveBombs(s, dt);
    bombAI(s, dt);

    // invasion: lowest living lane reaches the ground line
    let lowest = -1;
    for (const e of s.enemies) if (e.alive && e.lane > lowest) lowest = e.lane;
    if (lowest >= 0 && laneY(s, lowest) + CFG.enemyHalfH >= CFG.invadeY && s.player.alive) {
      // invasion ends the game outright: the explosion plays, then GAME OVER with no respawn
      s.invaded = true;
      s.lives = 1;
      const h = s.enemies.filter((e) => e.alive && e.lane === lowest).sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2))[0];
      killPlayer(s, "invade", h ? { x: h.x, y: laneY(s, lowest), w: 12 } : null);
      emit(s, { type: "invade" });
    }

    if (s.mode === "play" && hulksLeft(s) === 0) {
      const secs = s.t - s.waveStartT;
      const room = Math.max(0, Math.round(CFG.invadeY - (laneY(s, 4) + CFG.enemyHalfH)));
      for (const e of s.enemies) if (e.alive) { e.alive = false; emit(s, { type: "scatter", x: e.x, y: laneY(s, e.lane), lane: e.lane }); }
      s.respawns = [];
      s.ufo = null;
      const bonus = room * CFG.heightBonus * (s.wave + 1);
      addScore(s, bonus);
      s.stats.wavesCleared++;
      s.stats.waveTimes.push(secs);
      s.mode = "clear";
      s.modeT = 0;
      s.shot = null;
      s.bombs = [];
      s.telegraphs = [];
      emit(s, { type: "clear", bonus, room });
      if (s.wave >= CAMPAIGN.length) {
        s.allClear = true;
        const ships = s.lives;
        const shipsBonus = ships * CFG.shipsBonus;
        addScore(s, shipsBonus);
        emit(s, { type: "allclear", ships, bonus: shipsBonus });
      }
    }
    return s;
  }

  function movePlayer(s, input, dt) {
    const p = s.player;
    if (!p.alive) return;
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    if (typeof input.targetX === "number") {
      const d = input.targetX - p.x;
      dir = Math.abs(d) < 1 ? 0 : Math.sign(d) * Math.min(1, Math.abs(d) / (CFG.playerSpeed * dt));
    }
    p.vx = dir * CFG.playerSpeed;
    p.x += p.vx * dt;
    const m = CFG.playerHalfW + 2;
    if (p.x < m) p.x = m;
    if (p.x > W - m) p.x = W - m;
  }

  function handleFire(s, input, dt) {
    const pressed = input.fire && !s.fireHeld;
    s.fireHeld = !!input.fire;
    if (pressed) s.fireBuf = CFG.fireBuffer;
    else s.fireBuf = Math.max(0, s.fireBuf - dt);
    if (s.fireBuf > 0 && !s.shot && s.player.alive) {
      s.shot = { x: Math.round(s.player.x), y: CFG.playerY - 6 };
      s.fireBuf = 0;
      s.stats.shots++;
      emit(s, { type: "fire", x: s.shot.x });
    }
  }

  function moveLanes(s, dt) {
    const tm = tempo(s);
    for (const e of s.enemies) {
      if (!e.alive) continue;
      e.x = wrapX(e.x + s.lanes[e.lane].v * tm * dt);
      if (e.flash > 0) e.flash -= dt;
      if (e.ping > 0) e.ping -= dt;
    }
  }

  function moveShot(s, dt) {
    const sh = s.shot;
    if (!sh) return;
    const y0 = sh.y;
    const y1 = sh.y - CFG.shotSpeed * dt;
    // earliest hit along the swept segment (largest y first)
    let best = null;
    let bestY = -Infinity;
    for (const b of s.bombs) {
      if (Math.abs(b.x - sh.x) <= 2 && b.y + 3 >= y1 && b.y - 3 <= y0 && b.y > bestY) {
        best = { kind: "bomb", o: b };
        bestY = b.y;
      }
    }
    for (const w of s.wrecks) {
      if (Math.abs(w.x - sh.x) <= w.w / 2 && w.y + CFG.wreckHalfH >= y1 && w.y - CFG.wreckHalfH <= y0 && w.y > bestY) {
        best = { kind: "wreck", o: w };
        bestY = w.y;
      }
    }
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const ey = laneY(s, e.lane);
      if (Math.abs(e.x - sh.x) <= CFG.enemyHalfW && ey + CFG.enemyHalfH >= y1 && ey - CFG.enemyHalfH <= y0 && ey > bestY) {
        best = { kind: "enemy", o: e };
        bestY = ey;
      }
    }
    if (s.ufo) {
      const uy = ufoY(s);
      if (Math.abs(s.ufo.x - sh.x) <= CFG.ufoHalfW && uy + CFG.ufoHalfH >= y1 && uy - CFG.ufoHalfH <= y0 && uy > bestY) {
        best = { kind: "ufo", o: s.ufo };
        bestY = uy;
      }
    }
    if (best) {
      s.shot = null;
      if (best.kind === "ufo") {
        makeUfoWreck(s);
      } else if (best.kind === "bomb") {
        s.bombs.splice(s.bombs.indexOf(best.o), 1);
        addScore(s, 5);
        emit(s, { type: "bombshot", x: best.o.x, y: best.o.y });
      } else if (best.kind === "wreck") {
        emit(s, { type: "clink", x: sh.x, y: best.o.y });
      } else if (best.o.armored) {
        best.o.ping = 0.15;
        emit(s, { type: "clink", x: sh.x, y: bestY, armored: true });
      } else {
        makeWreck(s, best.o, true);
      }
      return;
    }
    sh.y = y1;
    if (sh.y < 18) {
      s.shot = null;
      emit(s, { type: "miss" });
    }
  }

  function moveWrecks(s, dt) {
    for (let i = s.wrecks.length - 1; i >= 0; i--) {
      const w = s.wrecks[i];
      w.age += dt;
      w.vy += CFG.gravity * dt;
      const yPrev = w.y;
      w.y += w.vy * dt;
      w.x += w.vx * dt;
      if (w.x < 4) { w.x = 4; w.vx = Math.abs(w.vx) * 0.5; }
      if (w.x > W - 4) { w.x = W - 4; w.vx = -Math.abs(w.vx) * 0.5; }
      // swallow enemies it falls through
      if (w.vy > 0) {
        for (const e of s.enemies) {
          if (!e.alive) continue;
          const ey = laneY(s, e.lane);
          if (Math.abs(e.x - w.x) <= w.w / 2 + CFG.enemyHalfW - 2 && ey + CFG.enemyHalfH >= yPrev - CFG.wreckHalfH && ey - CFG.enemyHalfH <= w.y + CFG.wreckHalfH) {
            if (e.thick && w.n < CFG.thickMin) {
              // too light: the wreck breaks up on the double plate; a 2-chain knocks the plate off,
              // a lone craft's wreck does nothing
              if (w.n >= CFG.plateMin) e.thick = false;
              e.ping = 0.2;
              w.broken = true;
              emit(s, { type: "bounce", id: w.id, x: w.x, ex: e.x, y: ey, n: w.n, plate: !e.thick });
              break;
            }
            e.alive = false;
            queueRespawn(s, e);
            w.n++;
            const ev = laneV(s, e.lane) * CFG.wreckDrift;
            w.vx = (w.vx * (w.n - 1) + ev) / w.n;
            if (!w.ufo) w.w = Math.min(CFG.wreckWMax, w.w + CFG.wreckGrow); // a mothership hull is already wider
            w.lanes.push(e.lane);
            const pts = pointsOf(e) * w.n;
            w.pts += pts;
            s.stats.kills++;
            addScore(s, pts);
            emit(s, { type: "swallow", id: w.id, x: e.x, y: ey, n: w.n, pts, lane: e.lane, wx: w.x, armored: e.armored, kind: e.kind });
            if (e.kind === "split") fork(s, w);
            // REVERSE: crushing a hulk flips the lane above it
            if (e.armored && s.params.behavior === "reverse" && e.lane > 0) {
              s.lanes[e.lane - 1].v *= -1;
              emit(s, { type: "reverse", lane: e.lane - 1 });
            }
          }
        }
        for (let j = s.bombs.length - 1; j >= 0; j--) {
          const b = s.bombs[j];
          if (Math.abs(b.x - w.x) <= w.w / 2 + 1 && Math.abs(b.y - w.y) <= CFG.wreckHalfH + 3) {
            s.bombs.splice(j, 1);
            emit(s, { type: "bombsmash", x: b.x, y: b.y });
          }
        }
      }
      if (w.broken) {
        s.wrecks.splice(i, 1);
        s.stats.chains.push(w.n);
        continue;
      }
      const p = s.player;
      const half = w.w / 2;
      if (p.alive && s.mode === "play" && w.y + CFG.wreckHalfH >= CFG.playerY - 4 && Math.abs(p.x - w.x) <= half + CFG.playerHalfW - 1) {
        killPlayer(s, "wreck", { x: w.x, y: w.y, w: w.w });
      }
      if (w.y + CFG.wreckHalfH >= CFG.groundY) {
        // near miss: it landed beside a live cannon
        const gap = Math.abs(p.x - w.x) - (half + CFG.playerHalfW - 1);
        if (p.alive && s.mode === "play" && gap > 0 && gap <= CFG.grazeGap) emit(s, { type: "graze", x: p.x, from: w.x, n: w.n });
        s.wrecks.splice(i, 1);
        s.stats.chains.push(w.n);
        emit(s, { type: "land", id: w.id, x: w.x, n: w.n, w: w.w, pts: w.pts });
      }
    }
  }

  function moveBombs(s, dt) {
    const p = s.player;
    for (let i = s.bombs.length - 1; i >= 0; i--) {
      const b = s.bombs[i];
      b.y += CFG.bombSpeed * dt;
      if (p.alive && Math.abs(b.x - p.x) <= CFG.playerHalfW && b.y + 3 >= CFG.playerY - 3 && b.y - 3 <= CFG.playerY + 4) {
        s.bombs.splice(i, 1);
        killPlayer(s, "bomb", { x: b.x, y: b.y, w: 3 });
        continue;
      }
      // near miss: a bomb passing the cannon's height just beside it
      if (p.alive && !b.grazed && b.y >= CFG.playerY - 2) {
        b.grazed = true;
        const gap = Math.abs(b.x - p.x) - CFG.playerHalfW;
        if (gap > 0 && gap <= CFG.grazeGap && s.mode === "play") emit(s, { type: "graze", x: p.x, from: b.x, n: 0 });
      }
      if (b.y >= CFG.groundY) {
        s.bombs.splice(i, 1);
        emit(s, { type: "bombland", x: b.x });
      }
    }
  }

  function bombAI(s, dt) {
    // telegraphed drops: an enemy flashes, then releases straight down
    for (let i = s.telegraphs.length - 1; i >= 0; i--) {
      const tg = s.telegraphs[i];
      tg.t -= dt;
      const e = s.enemies.find((q) => q.id === tg.id);
      if (!e || !e.alive) {
        s.telegraphs.splice(i, 1);
        continue;
      }
      e.flash = tg.t;
      if (tg.t <= 0) {
        s.telegraphs.splice(i, 1);
        s.bombs.push({ id: s.nextId++, x: Math.round(e.x), y: laneY(s, e.lane) + 5 });
        emit(s, { type: "bomb", x: e.x });
      }
    }
    s.bombT -= dt;
    if (s.bombT > 0) return;
    s.bombT = s.params.bombInterval * (0.75 + rng(s) * 0.5);
    if (s.bombs.length + s.telegraphs.length >= s.params.bombCap) return;
    // candidates: lowest enemy of each column that is near the player (where it will be at release)
    const px = s.player.x;
    const alive = s.enemies.filter((e) => e.alive);
    if (!alive.length) return;
    const near = alive.filter((e) => Math.abs(e.x + laneV(s, e.lane) * CFG.bombTelegraph - px) < 28);
    const pool = near.length && rng(s) < 0.7 ? near : alive;
    const e = pool[Math.floor(rng(s) * pool.length)];
    s.telegraphs.push({ id: e.id, t: CFG.bombTelegraph });
    emit(s, { type: "tell", x: e.x });
  }

  // landing prediction for the ground marker (constant drift, no further swallows)
  function predictLanding(s, w) {
    const a = CFG.gravity / 2;
    const b = w.vy;
    const c = w.y + CFG.wreckHalfH - CFG.groundY;
    const t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    return { x: Math.max(4, Math.min(W - 4, w.x + w.vx * t)), t };
  }

  function clone(s) {
    const c = JSON.parse(JSON.stringify(s));
    c.events = [];
    return c;
  }

  // ships waiting below the ground line. `lives` counts the ship in play and is only decremented
  // when the next one spawns, so the reserve is lives - 1 whether the cannon is alive or exploding.
  function reserveShips(s) {
    if (s.invaded) return 0;
    return Math.max(0, s.lives - 1);
  }

  function heightBonusNow(s) {
    const room = Math.max(0, Math.round(CFG.invadeY - (laneY(s, 4) + CFG.enemyHalfH)));
    return room * CFG.heightBonus * (s.wave + 1);
  }

  const api = { reserveShips, CAMPAIGN, waveDef, timeAllowance, laneV, ufoY, heightBonusNow, W, H, DT, CFG, waveParams, createGame, step, laneY, tempo, hulksLeft, pointsOf, predictLanding, clone };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WF = api;
})(typeof window !== "undefined" ? window : globalThis);
