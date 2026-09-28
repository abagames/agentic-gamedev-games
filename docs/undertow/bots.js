// UNDERTOW simulated players. All bots drive the game through the same input the keyboard does.
(function (root) {
  "use strict";
  const U = typeof module !== "undefined" && module.exports ? require("./core.js") : root.UT;
  const { DT, CFG, HOME, PORT, dx, step, newGame } = U;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function idleBot() {
    return { name: "idle", act: () => ({ x: 0, y: 0, fire: false }) };
  }

  // Mash: rides the surface toward the nearest raider and fires as fast as it can.
  function mashBot() {
    let n = 0;
    return {
      name: "mash",
      act(g) {
        n++;
        const p = g.player;
        let best = null;
        for (const e of g.enemies) if (!best || Math.abs(dx(p.x, e.x)) < Math.abs(dx(p.x, best.x))) best = e;
        const x = best ? Math.sign(dx(p.x, best.x)) : 0;
        return { x, y: -1, fire: n % 12 < 6 };
      },
    };
  }

  // Planner used for the oracle / human-limited rungs.
  //   gather   — leave a collector alone until it holds this many (0 = sink on sight). A
  //              collector close to the port is always attacked.
  //   race     — also pick up free survivors before the raiders do
  //   react / noise / think / lapse / dodge / aimErr / fireGap / reorient — human limits
  function planBot(opts) {
    const o = Object.assign(
      { name: "oracle", gather: 3, race: true, ferry: false, react: 0, noise: 0, think: DT, lapse: 0, dodge: 0, aimErr: 0, fireGap: 0.1, seed: 1, reorient: 0 },
      opts || {}
    );
    const rnd = U.mulberry32(o.seed * 7919 + 13);
    const hist = [];
    let held = { x: 0, y: 0, fire: false };
    let nextThink = 0;
    let lastFire = -9;
    let firePulse = 0;
    const seen = new Map(); // threat object -> time first seen
    let wasAlive = true;

    function snapshot(g) {
      return {
        t: g.t,
        p: { ...g.player },
        enemies: g.enemies.map((e) => ({ ...e })),
        captives: g.captives.map((c) => ({ ...c })),
        mines: g.mines.map((m) => ({ ...m, ref: m })),
        etorps: g.etorps.map((t) => ({ ...t, ref: t })),
        torp: g.torp ? { ...g.torp } : null,
      };
    }
    function remember(g) {
      hist.push(snapshot(g));
      const lag = Math.round(o.react / DT);
      while (hist.length > lag + 1) hist.shift();
    }
    function perceived(g) {
      remember(g);
      const s = hist[0];
      s.p = { ...g.player };
      const age = g.t - s.t;
      for (const c of s.captives) c.y += c.sink * age;
      if (o.noise) {
        for (const e of s.enemies) {
          e.x += (rnd() * 2 - 1) * o.noise;
          e.y += (rnd() * 2 - 1) * o.noise * 0.5;
        }
        for (const c of s.captives) {
          c.x += (rnd() * 2 - 1) * o.noise;
          c.y += (rnd() * 2 - 1) * o.noise * 0.6;
        }
        for (const m of s.mines) m.x += (rnd() * 2 - 1) * o.noise * 0.5;
      }
      return s;
    }

    const moveTo = (p, tx, ty) => ({ x: clamp(dx(p.x, tx) / 10, -1, 1), y: clamp((ty - p.y) / 6, -1, 1) });

    function catchPlan(s, spillsOnly) {
      const p = s.p;
      if (p.cargo >= CFG.capacity) return null;
      const vx = CFG.subVx * (1 - CFG.cargoSlow * p.cargo) * 0.85;
      let best = null;
      for (const c of s.captives) {
        if (spillsOnly && !c.spill) continue;
        let T = Math.abs(dx(p.x, c.x)) / vx;
        for (let k = 0; k < 3; k++) {
          const cy = c.y + c.sink * T;
          T = Math.max(Math.abs(dx(p.x, c.x)) / vx, Math.abs(cy - p.y) / (CFG.subVy * 0.85));
        }
        const cy = c.y + c.sink * T;
        if (cy > CFG.seabed - 3) continue;
        // spills first: raiders and mines are around them
        const score = T - (c.spill ? 3 : 0);
        if (!best || score < best.score) best = { c, T, cy, score };
      }
      return best;
    }

    // Which carrier to go after: the one about to reach its port first, among those we can still
    // catch in time. If its hold will not fit aboard, unload first when there is time for it.
    function pickAttack(s, g, unloadX) {
      const p = s.p;
      const vSub = CFG.subVx * (1 - CFG.cargoSlow * p.cargo) * 0.8;
      let best = null;
      for (const e of s.enemies) {
        if (e.load === 0) continue;
        const cap = e.kind === "ship" ? CFG.shipCap : CFG.esubCap;
        const homing = e.state === "home" || e.raider;
        const toPort = Math.abs(dx(e.x, PORT)) - CFG.escapeDX;
        if (!homing && e.load < Math.min(o.gather, cap) && toPort > 160) continue;
        const speed = (e.kind === "ship" ? g.spec.shipSpeed : g.spec.esubSpeed) * U.loadedFactor(e.load);
        const tPort = toPort / speed;
        const tReach = Math.abs(dx(p.x, e.x)) / Math.max(20, vSub - speed * 0.5) + 1.5;
        if (tReach > tPort + 1) continue; // lost cause
        const room = CFG.capacity - p.cargo;
        let unloadFirst = false;
        if (e.load > room && p.cargo > 0) {
          const tUnload = (Math.abs(dx(p.x, unloadX)) + Math.abs(dx(unloadX, e.x))) / vSub + 2.5;
          unloadFirst = tUnload < tPort - 1;
        }
        const score = tPort - tReach * 0.5 - e.load * 0.3;
        if (!best || score < best.score) best = { e, score, unloadFirst };
      }
      return best;
    }

    // Watched motion of each raider (a person sees how fast something is going).
    const seenVel = new Map();
    function velOf(e, t) {
      const m = seenVel.get(e.id);
      if (!m) {
        seenVel.set(e.id, { x: e.x, t, v: 0 });
        return 0;
      }
      if (t - m.t >= 0.1) {
        const v = dx(m.x, e.x) / (t - m.t);
        m.v = m.v * 0.5 + v * 0.5;
        m.x = e.x;
        m.t = t;
      }
      return m.v;
    }

    // The torpedo climbs 1 px per 2 px run, so from depth y it reaches depth ty after running
    // (y − ty)/rise px. Rather than chase a firing spot, set the depth to fit the current gap
    // (allowing for the target's motion during the run) and fire when the numbers agree.
    function attack(s, e, g, out) {
      const p = s.p;
      const v = velOf(e, s.t);
      const d0 = dx(p.x, e.x);
      const face = Math.sign(d0) || p.face;
      const surfaceHull = e.kind === "ship" || e.kind === "dd";
      const ty = surfaceHull ? CFG.surf + CFG.hullDepth - 3 : e.y;
      const k = 1 - (face * v) / CFG.torpSpeed;
      const R = (face * d0 - 8) / Math.max(0.3, k);
      // a destroyer is engaged from outside its charge range
      const minY = e.kind === "dd" ? ty + (CFG.ddSense + 14) * CFG.torpRise : surfaceHull ? CFG.exposed + 6 : ty + 6;
      const wantY = ty + R * CFG.torpRise;
      out.y = clamp((clamp(wantY, minY, CFG.subMaxY - 4) - p.y) / 6, -1, 1);
      if (p.face !== face) out.x = face * 0.5; // turn to it
      else if (wantY > CFG.subMaxY - 4) out.x = face; // too far even from the bottom: close in
      else if (wantY < minY) out.x = -face * 0.8; // too close for any safe depth: open the gap
      else out.x = face * 0.12 * Math.sign(R - 70); // drift toward a comfortable run
      // fire when this depth's run lands on where the target will be
      const r = (p.y - ty) / CFG.torpRise;
      if (r <= 4) return;
      const tt = (8 + r) / CFG.torpSpeed;
      const miss = dx(e.x + v * tt, p.x + face * (8 + r)) + (rnd() * 2 - 1) * o.aimErr * 0.5;
      const hw = e.kind === "ship" ? CFG.shipHW : e.kind === "dd" ? CFG.ddHW : CFG.esubHW;
      if (p.face === face && Math.abs(miss) < hw * 0.6 && tt < CFG.torpLife && !s.torp && g.t - lastFire > o.fireGap) out.fire = true;
    }

    function decide(g) {
      const s = perceived(g);
      const p = s.p;
      for (const m of g.mines) if (!seen.has(m)) seen.set(m, g.t);
      for (const t of g.etorps) if (!seen.has(t)) seen.set(t, g.t);
      for (const e of g.enemies) if (e.aim > 0 && !seen.has(e.id + ":" + Math.floor(e.t))) seen.set(e.id + ":" + Math.floor(e.t), g.t);
      for (const e of g.enemies) if (e.shellT > 0 && !seen.has("gun" + e.id + ":" + Math.floor(e.t))) seen.set("gun" + e.id + ":" + Math.floor(e.t), g.t);
      for (const e of g.enemies) if (e.dropT > 0 && !seen.has("dd" + e.id + ":" + Math.floor(e.t * 2))) seen.set("dd" + e.id + ":" + Math.floor(e.t * 2), g.t);
      let out = { x: 0, y: 0, fire: false };

      // where to take survivors: our harbour, or the ferry when it is nearer and has room
      const homeX = () => {
        const f = g.ferry;
        if (o.ferry && f.alive && f.load < CFG.ferryCap && Math.abs(dx(p.x, f.x)) < Math.abs(dx(p.x, HOME))) return f.x;
        return HOME;
      };
      // head for the harbour/ferry; a sub not using the ferry stays under it until home
      const goHome = () => {
        const hx = homeX();
        const near = Math.abs(dx(p.x, hx)) < CFG.homeDX * 1.5;
        return moveTo(p, hx, near || o.ferry ? CFG.subMinY + 4 : CFG.surf + CFG.handDY + 8);
      };
      // a raider shelling a loaded ferry
      let guard = null;
      if (o.ferry && g.ferry.alive && g.ferry.load > 0)
        for (const e of s.enemies)
          if (e.kind === "ship" && Math.abs(dx(e.x, g.ferry.x)) < CFG.shellRange + 10 && (!guard || Math.abs(dx(p.x, e.x)) < Math.abs(dx(p.x, guard.x)))) guard = e;
      const spill = catchPlan(s, true);
      const plan = pickAttack(s, g, homeX());
      const tgt = plan && !plan.unloadFirst ? plan.e : null;
      // an escort destroyer close by: sink it before it pins us down
      let dd = null;
      for (const e of s.enemies) if (e.kind === "dd" && Math.abs(dx(p.x, e.x)) < CFG.ddSense + 40 && (!dd || Math.abs(dx(p.x, e.x)) < Math.abs(dx(p.x, dd.x)))) dd = e;
      const mode = p.cargo >= CFG.capacity ? "full" : spill ? "spill" : dd && o.fightDD !== false ? "dd" : plan && plan.unloadFirst ? "unload" : tgt ? "attack" : guard ? "guard" : "other";
      if (o.trace) o.trace[mode] = (o.trace[mode] || 0) + 1;
      if (p.cargo >= CFG.capacity) out = goHome();
      else if (spill) out = moveTo(p, spill.c.x, spill.cy);
      else if (mode === "dd") attack(s, dd, g, out);
      else if (plan && plan.unloadFirst) out = goHome();
      else if (tgt) attack(s, tgt, g, out);
      else if (guard && p.cargo + guard.load <= CFG.capacity) attack(s, guard, g, out);
      else {
        // race the raiders for survivors still sinking in their jackets
        const cp = o.race ? catchPlan(s, false) : null;
        if (cp) out = moveTo(p, cp.c.x, cp.cy);
        else if (p.cargo > 0) out = goHome();
        else {
          // shadow the fullest collector from a safe depth
          let f = null;
          for (const e of s.enemies) if (!f || e.load > f.load) f = e;
          out = f ? moveTo(p, f.x - Math.sign(dx(p.x, f.x)) * 70, f.kind === "ship" ? CFG.subMinY : f.y + 24) : moveTo(p, HOME, CFG.surf + 40);
        }
      }

      // survive
      if (!(o.lapse && rnd() < o.lapse)) {
        const noticed = (obj) => g.t - (seen.get(obj) ?? g.t) >= o.dodge;
        for (const m of s.mines) {
          if (!noticed(m.ref)) continue;
          const ddx = dx(p.x, m.x);
          const ahead = Math.sign(ddx) === Math.sign(out.x || p.face) || Math.abs(ddx) < 14;
          const fy = m.y < m.stopY ? m.stopY : m.y;
          if (ahead && Math.abs(ddx) < 26 && Math.abs(fy - p.y) < CFG.mineR + 10) {
            out.y = fy > p.y ? -1 : 1;
            if (Math.abs(ddx) < 14) out.x = -Math.sign(ddx) || 1;
            out.fire = out.fire && false;
          }
        }
        // depth charges come in pairs: get clear of the pair's centre, not of one charge
        let sumX = 0;
        let nDanger = 0;
        let fuse = 0;
        for (const c of g.charges) {
          if (!seen.has(c)) seen.set(c, g.t);
          if (g.t - seen.get(c) < o.dodge) continue;
          const cdx = dx(p.x, c.x);
          const closing = Math.sign(cdx) === Math.sign(out.x) || Math.abs(cdx) < CFG.blastR + 22;
          if (Math.abs(cdx) < CFG.blastR + 44 && closing && Math.abs(c.fuse - p.y) < CFG.blastR + 14 && c.y < c.fuse) {
            sumX += dx(p.x, c.x);
            fuse += c.fuse;
            nDanger++;
          }
        }
        if (nDanger) {
          const cx = sumX / nDanger;
          out.x = cx > 0 ? -1 : 1;
          out.y = fuse / nDanger > p.y ? -1 : 1;
          out.fire = false;
        }
        for (const e of g.enemies)
          if (e.kind === "dd" && e.dropT > 0 && Math.abs(dx(e.x, p.x)) < CFG.ddSense && g.t - (seen.get("dd" + e.id + ":" + Math.floor(e.t * 2)) ?? g.t) >= o.dodge) out.x = Math.sign(dx(e.x, p.x)) || 1;
        for (const sh of g.shells) {
          if (Math.abs(dx(sh.x1, p.x)) < CFG.shellBlastR + 10 && p.y < CFG.surf + CFG.shellBlastR + 10) {
            out.y = 1;
            out.x = Math.sign(dx(sh.x1, p.x)) || 1;
          }
        }
        for (const e of g.enemies)
          if (e.kind === "ship" && e.shellT > 0 && e.shellAt === "sub" && Math.abs(dx(e.x, p.x)) < CFG.shellRange && g.t - (seen.get("gun" + e.id + ":" + Math.floor(e.t)) ?? g.t) >= o.dodge) out.y = 1;
        for (const t of s.etorps) {
          if (!noticed(t.ref)) continue;
          const ddx = dx(t.x, p.x);
          if (Math.sign(ddx) === Math.sign(t.vx) && Math.abs(ddx) < 90 && Math.abs(t.y - p.y) < 12) out.y = t.y > p.y ? -1 : 1;
        }
        for (const e of s.enemies) {
          if (e.kind !== "esub" || !(e.aim > 0)) continue;
          if (g.t - (seen.get(e.id + ":" + Math.floor(e.t)) ?? g.t) < o.dodge) continue;
          if (Math.abs(e.y - p.y) < CFG.esubDY + 6 && Math.abs(dx(e.x, p.x)) < CFG.esubRange + 20) out.y = e.y > p.y ? -1 : 1;
        }
      }
      return out;
    }

    return {
      name: o.name,
      act(g) {
        if (g.player.alive !== wasAlive) {
          wasAlive = g.player.alive;
          if (wasAlive) nextThink = g.t + o.reorient;
        }
        if (g.t >= nextThink) {
          held = decide(g);
          nextThink = g.t + o.think * (0.8 + rnd() * 0.4);
          if (held.fire) lastFire = g.t;
        } else remember(g);
        if (held.fire) {
          firePulse = 4;
          held.fire = false;
        }
        const f = firePulse > 0;
        if (firePulse > 0) firePulse--;
        return { x: held.x, y: held.y, fire: f };
      },
    };
  }

  // ---- lookahead planner ----------------------------------------------------------------
  // Every `every` seconds it clones the game and, for each candidate intent (sink raider X,
  // catch survivor Y, unload, hold deep), plays that intent's controller `horizon` seconds ahead
  // in the clone, then keeps the intent whose outcome scores best. Controllers see everything.
  function plannerBot(opts) {
    const o = Object.assign({ name: "planner", every: 0.2, horizon: 5, ferry: true, margin: 25, commit: 0.6 }, opts || {});
    const steer = (p, tx, ty) => ({ x: clamp(dx(p.x, tx) / 10, -1, 1), y: clamp((ty - p.y) / 6, -1, 1), fire: false });

    // perfect-information evasion layered over any controller
    function safety(g, out) {
      const p = g.player;
      let sx = 0, n = 0, fy = 0;
      for (const c of g.charges) {
        const cdx = dx(p.x, c.x);
        if (Math.abs(cdx) < CFG.blastR + 40 && Math.abs(c.fuse - p.y) < CFG.blastR + 14 && c.y < c.fuse) {
          sx += cdx;
          fy += c.fuse;
          n++;
        }
      }
      for (const e of g.enemies) {
        if (e.kind === "dd" && e.dropT > 0 && Math.abs(dx(e.x, p.x)) < CFG.ddSense + 10) {
          sx += dx(p.x, e.x);
          fy += e.dropY;
          n++;
        }
      }
      if (n) {
        out.x = sx / n > 0 ? -1 : 1;
        out.y = fy / n > p.y ? -1 : 1;
      }
      for (const t of g.etorps) {
        const ddx = dx(t.x, p.x);
        if (Math.sign(ddx) === Math.sign(t.vx) && Math.abs(ddx) < 100 && Math.abs(t.y - p.y) < 12) out.y = t.y > p.y ? -1 : 1;
      }
      for (const e of g.enemies)
        if (e.kind === "esub" && e.aim > 0 && Math.abs(e.y - p.y) < CFG.esubDY + 8 && Math.abs(dx(e.x, p.x)) < CFG.esubRange + 20) out.y = e.y > p.y ? -1 : 1;
      for (const sh of g.shells)
        if (Math.abs(dx(sh.x1, p.x)) < CFG.shellBlastR + 12 && p.y < CFG.surf + CFG.shellBlastR + 12) {
          out.y = 1;
          out.x = Math.sign(dx(sh.x1, p.x)) || 1;
        }
      for (const e of g.enemies)
        if (e.kind === "ship" && e.shellT > 0 && e.aimX != null && Math.abs(dx(e.aimX, p.x)) < CFG.shellBlastR + 16 && p.y < CFG.surf + CFG.shellBlastR + 12) out.y = 1;
      for (const e of g.enemies)
        if (e.kind === "esub" && e.stalking && Math.abs(dx(e.x, p.x)) < 36 && Math.abs(e.y - p.y) < 20) {
          out.x = Math.sign(dx(e.x, p.x)) || 1;
          out.y = e.y > p.y ? -1 : 1;
        }
      for (const e of g.enemies) if (e.kind === "ship" && e.shellT > 0 && e.shellAt === "sub") out.y = Math.max(out.y, 0.6);
      for (const m of g.mines) {
        const mdx = dx(p.x, m.x);
        const my = m.y < m.stopY ? m.stopY : m.y;
        if (Math.abs(mdx) < 22 && Math.abs(my - p.y) < CFG.mineR + 12) out.y = my > p.y ? -1 : 1;
      }
      for (const e of g.enemies)
        if (e.kind === "ship" && e.mineT > 0 && Math.abs(dx(e.x, p.x)) < CFG.mineSense + 6) out.x = Math.sign(dx(e.x, p.x)) || 1;
      if (n) out.fire = false;
      return out;
    }

    function attackCtl(id) {
      return (g) => {
        const p = g.player;
        const e = g.enemies.find((x) => x.id === id);
        if (!e || !p.alive) return null;
        const v = e.vx || 0;
        const d0 = dx(p.x, e.x);
        const face = Math.sign(d0) || p.face;
        const hull = e.kind === "ship" || e.kind === "dd";
        const ty = hull ? CFG.surf + CFG.hullDepth - 3 : e.y;
        const k = 1 - (face * v) / CFG.torpSpeed;
        const R = (face * d0 - 8) / Math.max(0.3, k);
        const minY = e.kind === "dd" ? ty + (CFG.ddSense + 14) * CFG.torpRise : hull ? CFG.exposed + 6 : ty + 6;
        const wantY = ty + R * CFG.torpRise;
        const out = { x: 0, y: clamp((clamp(wantY, minY, CFG.subMaxY - 4) - p.y) / 6, -1, 1), fire: false };
        if (p.face !== face) out.x = face * 0.5;
        else if (wantY > CFG.subMaxY - 4) out.x = face;
        else if (wantY < minY) out.x = -face * 0.8;
        else out.x = face * 0.1 * Math.sign(R - 70);
        const r = (p.y - ty) / CFG.torpRise;
        if (r > 4 && !g.torp && !g.prevFire && p.face === face) {
          const tt = (8 + r) / CFG.torpSpeed;
          const miss = dx(e.x + v * tt, p.x + face * (8 + r));
          const hw = e.kind === "ship" ? CFG.shipHW : e.kind === "dd" ? CFG.ddHW : CFG.esubHW;
          if (Math.abs(miss) < hw * 0.6 && tt < CFG.torpLife) out.fire = true;
        }
        return safety(g, out);
      };
    }
    function catchCtl(id) {
      return (g) => {
        const p = g.player;
        const c = g.captives.find((x) => x.id === id);
        if (!c || !p.alive || p.cargo >= CFG.capacity) return null;
        const vx = CFG.subVx * (1 - CFG.cargoSlow * p.cargo) * 0.9;
        const T = Math.abs(dx(p.x, c.x)) / vx;
        return safety(g, steer(p, c.x + c.drift * T, Math.min(CFG.seabed - 4, c.y + c.sink * T)));
      };
    }
    function unloadCtl(g) {
      const p = g.player;
      if (p.cargo === 0 || !p.alive) return null;
      const f = g.ferry;
      let hx = HOME;
      if (o.ferry && f.alive && f.load < CFG.ferryCap && Math.abs(dx(p.x, f.x)) < Math.abs(dx(p.x, HOME))) hx = f.x;
      const near = Math.abs(dx(p.x, hx)) < 30;
      return safety(g, steer(p, hx, near ? CFG.subMinY + 4 : CFG.exposed + 12));
    }
    function holdCtl(g) {
      const p = g.player;
      return safety(g, steer(p, p.x, 112));
    }

    function reachable(g, c) {
      const p = g.player;
      const left = (CFG.seabed - c.y) / Math.max(0.5, c.sink);
      return (Math.abs(dx(p.x, c.x)) + Math.abs(c.y - p.y) * 0.6) / 70 < left;
    }
    function defaultCtl(g) {
      const p = g.player;
      if (!p.alive) return { x: 0, y: 0, fire: false };
      if (p.cargo >= CFG.capacity) return unloadCtl(g);
      let best = null;
      for (const c of g.captives) {
        if (!c.spill || !reachable(g, c)) continue;
        const d = Math.abs(dx(p.x, c.x)) + Math.abs(c.y - p.y);
        if (!best || d < best.d) best = { c, d };
      }
      if (best) return catchCtl(best.c.id)(g);
      if (p.cargo >= 6) return unloadCtl(g);
      let urgent = null;
      for (const e of g.enemies) {
        if (!e.load) continue;
        const t = Math.abs(dx(e.x, PORT)) / Math.max(8, Math.abs(e.vx || 20));
        if (!urgent || t < urgent.t) urgent = { e, t };
      }
      if (urgent) return attackCtl(urgent.e.id)(g);
      for (const c of g.captives) if (reachable(g, c)) return catchCtl(c.id)(g);
      if (p.cargo > 0) return unloadCtl(g);
      return holdCtl(g);
    }

    function candidates(g) {
      const p = g.player;
      const list = [{ key: "hold", ctl: holdCtl }];
      if (p.cargo > 0) list.push({ key: "unload", ctl: unloadCtl });
      for (const e of g.enemies) {
        if (e.load > 0 || e.stalking || (e.kind === "dd" && Math.abs(dx(p.x, e.x)) < 180)) list.push({ key: "a" + e.id, ctl: attackCtl(e.id) });
      }
      if (p.cargo < CFG.capacity) {
        const cs = g.captives
          .map((c) => ({ c, d: Math.abs(dx(p.x, c.x)) + Math.abs(c.y - p.y) * 0.5 - (c.spill ? 60 : 0) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 4);
        for (const { c } of cs) list.push({ key: "c" + c.id, ctl: catchCtl(c.id) });
      }
      return list;
    }

    function deaths(g) {
      let n = 0;
      for (const k in g.stats.deaths) n += g.stats.deaths[k];
      return n;
    }
    function value(g, g0) {
      if (o.survivalOnly) return -500 * (deaths(g) - deaths(g0)) - (g.player.alive ? 0 : 100);
      const lost = g.stats.taken + g.stats.drowned + g.stats.blasted - (g0.stats.taken + g0.stats.drowned + g0.stats.blasted);
      let v = 100 * (g.stats.deliveredTotal - g0.stats.deliveredTotal) - 160 * lost - 500 * (deaths(g) - deaths(g0));
      const p = g.player;
      v += 75 * p.cargo;
      if (g.ferry.alive) v += 60 * g.ferry.load;
      // survivors in the water: worth something only if we can still reach them before the seabed
      const f = g.ferry;
      let unloadX = HOME;
      if (o.ferry && f.alive && f.load < CFG.ferryCap && Math.abs(dx(p.x, f.x)) < Math.abs(dx(p.x, HOME))) unloadX = f.x;
      const full = p.cargo >= CFG.capacity;
      const toUnload = Math.abs(dx(p.x, unloadX)) + Math.max(0, p.y - (CFG.surf + CFG.handDY)) * 0.6;
      // survivors aboard are safe only once unloaded: the farther from that, the less they are worth
      const work = g.enemies.some((e) => e.load > 0) || g.captives.length > 0;
      v -= p.cargo * toUnload * (full ? 0.5 : work ? 0.06 : 0.12);
      // Survivors in the water, visited in order of urgency along one route: each counts only if
      // the sub can still get to it in time after the ones before (with an unloading detour
      // whenever the hold fills).
      const order = g.captives
        .map((c) => ({ c, left: (CFG.seabed - c.y) / Math.max(0.5, c.sink) }))
        .sort((a, b) => a.left - b.left);
      let t = 0;
      let px = p.x;
      let py = p.y;
      let hold = p.cargo;
      for (const { c, left } of order) {
        if (hold >= CFG.capacity) {
          t += (Math.abs(dx(px, unloadX)) + Math.max(0, py - CFG.surf)) / 75 + hold * CFG.unloadEvery;
          px = unloadX;
          py = CFG.surf + 10;
          hold = 0;
        }
        const leg = (Math.abs(dx(px, c.x)) + Math.abs(c.y + c.sink * t - py) * 0.6) / 70;
        if (!p.alive || t + leg > left) {
          v -= c.jacket && left > 25 ? 40 : 110; // a slow sinker far off is not yet a loss
          continue;
        }
        t += leg;
        px = c.x;
        py = c.y + c.sink * t;
        hold++;
        v += 40 - leg * 4;
      }
      for (const e of g.enemies) {
        if (!e.load) continue;
        const toPort = Math.max(0, Math.abs(dx(e.x, PORT)) - CFG.escapeDX);
        const spd = Math.max(8, Math.abs(e.vx || 20));
        const urg = 1 - Math.min(1, toPort / spd / 14);
        v -= e.load * (20 + 60 * urg) + Math.abs(dx(p.x, e.x)) * 0.03 * e.load;
      }
      if (!p.alive) v -= 100;
      return v;
    }

    // play the intent until it is done, then the default policy, to the horizon
    function rollout(g, ctl) {
      const c = structuredClone(g);
      const n = Math.round(o.horizon / DT);
      let done = false;
      for (let i = 0; i < n && c.mode !== "over"; i++) {
        c.events.length = 0;
        let inp = done ? null : ctl(c);
        if (!inp) {
          done = true;
          inp = defaultCtl(c);
        }
        step(c, inp);
        if (c.mode === "clear") break;
      }
      return value(c, g);
    }

    let cur = { key: "hold", ctl: holdCtl };
    let next = 0;
    return {
      name: o.name,
      act(g) {
        if (g.t >= next && g.mode === "play" && g.player.alive) {
          next = g.t + o.every;
          if (g.t - (cur.since || 0) < o.commit && cur.key !== "hold") return cur.ctl(g) || defaultCtl(g);
          const cands = candidates(g);
          let best = null;
          for (const cd of cands) {
            let v = rollout(g, cd.ctl);
            if (cd.key === cur.key) v += o.margin; // commitment: do not dither between near-equals
            if (!best || v > best.v) best = { ...cd, v };
          }
          if (best.key !== cur.key) best.since = g.t;
          else best.since = cur.since;
          cur = best;
          if (o.log) o.log.push([+g.t.toFixed(1), best.key, Math.round(best.v), g.player.cargo]);
        }
        return cur.ctl(g) || defaultCtl(g);
      },
    };
  }

  const HUMAN = { react: 0.25, noise: 5, think: 0.12, lapse: 0.12, dodge: 0.3, aimErr: 18, fireGap: 0.3, reorient: 0.6 };
  const oracleBot = (o) => planBot(Object.assign({ name: "oracle" }, o));
  const humanBot = (o) => planBot(Object.assign({ name: "human" }, HUMAN, o));

  function playGame(seed, bot, opts) {
    opts = opts || {};
    const g = newGame(seed, opts);
    const maxT = opts.maxT || 600;
    while (g.mode !== "over" && g.t < maxT) {
      step(g, bot.act(g));
      if (opts.onEvents) for (const e of g.events) opts.onEvents(e, g);
    }
    return { seed, bot: bot.name, score: g.score, t: g.t, over: g.mode === "over", why: g.overWhy, wave: g.wave, wavesCleared: g.stats.wavesCleared, stats: g.stats, town: g.town, g };
  }

  const api = { idleBot, mashBot, planBot, oracleBot, humanBot, plannerBot, playGame, HUMAN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UTBots = api;
})(typeof window !== "undefined" ? window : globalThis);
