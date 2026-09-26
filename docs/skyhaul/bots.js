// SKYHAUL — simulated players. Used by the balance sims and the attract-mode demo.
// Every policy emits digital 8-way input like a keyboard player.
(function (root) {
  "use strict";
  const SKY = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SKY;
  const { CFG } = SKY;

  const sgn = (v, dead) => (v > dead ? 1 : v < -dead ? -1 : 0);

  // How far below the lander the chain tip hangs when the chain is straight.
  function hangDepth(g) {
    let d = CFG.landerHalfH + CFG.hookLen;
    for (let i = 1; i < g.chain.length; i++) d += SKY.linkLen(g.chain[i]);
    return d;
  }

  // pref: "none" takes whatever is nearest; "late" leaves heavies until the chain is nearly full
  // (then hauls); "avoid" never takes a heavy while walkers remain.
  function nearestTarget(g, fromX, allowFalling, pref, haulAt) {
    let best = null;
    let bd = 1e9;
    const w = SKY.chainWeight(g);
    const walkers = g.humans.some((h) => h.w === 1 && (h.state === "walk" || h.state === "fall"));
    for (const h of g.humans) {
      if (h.state === "walk" || (allowFalling && (h.state === "fall" || h.state === "carried"))) {
        // Airborne captives (falling, or carried off by the Rescuer) are worth a detour.
        let d = Math.abs(h.x - fromX) + (h.state !== "walk" ? -20 : 0);
        if (h.w > 1 && walkers) {
          if (pref === "avoid") continue;
          if (pref === "late" && w < haulAt - 2) d += 400;
        }
        if (d < bd) (bd = d), (best = h);
      }
    }
    return best;
  }

  function steerTo(L, x, y, dead) {
    return { dx: sgn(x - L.x, dead), dy: sgn(y - L.y, dead) };
  }

  // Climb over terrain in the way instead of pressing into a wall.
  function overTerrain(g, out) {
    const L = g.lander;
    if (!out.dx) return out;
    const ahead = SKY.groundUnder(g, L.x + out.dx * 4 - CFG.landerHalfW, L.x + out.dx * 14 + CFG.landerHalfW) - CFG.landerHalfH - CFG.hover - 2;
    return ahead < L.y ? { dx: out.dx, dy: -1 } : out;
  }

  function grabGoal(g, h) {
    // Aim a little ahead of a walker, and a few px deep so the tip actually drags into it.
    const lead = h.state === "walk" ? h.dir * 3 : 0;
    const y = Math.max(CFG.topY, h.y - hangDepth(g) + 3);
    return { x: h.x + lead, y };
  }

  // Hazard avoidance for still mines and the Bomber hull: score the 8 directions by predicted
  // closeness of the lander (and, unless lapsed, the chain) to hazards, keep the goal direction
  // when it is clean, otherwise take the cleanest direction nearest to it.
  function avoidHazards(g, out, lapsed, keepDy) {
    const L = g.lander;
    const haz = [];
    for (const m of g.mines) haz.push({ x: m.x, y: m.y, r: 13, rc: 8 });
    if (g.bomber) haz.push({ x: g.bomber.x, y: g.bomber.y, r: 22, rc: 14 });
    // A Rescuer on the hunt threatens only the chain's lower end, not the lander.
    const rs = g.rescuer;
    if (rs && rs.mode === "chase") haz.push({ x: rs.x, y: rs.y + 7, r: 0, rc: 16 });
    if (!haz.length) return out;
    const n = SKY.bodyCount(g);
    const sp = CFG.landerSpeed / (1 + CFG.landerSlowPerBody * SKY.chainWeight(g));
    const danger = (dx, dy) => {
      const m = Math.hypot(dx, dy) || 1;
      let dsum = 0;
      for (const T of [0.12, 0.3]) {
        const px = L.x + (dx / m) * sp * T;
        const py = L.y + (dy / m) * sp * T;
        for (const h of haz) {
          const d = Math.hypot(px - h.x, py - h.y);
          if (d < h.r) dsum += (h.r - d) * 10;
        }
        for (const h of haz) {
          if (!lapsed) {
            for (let i = 1; i < g.chain.length; i++) {
              const c = g.chain[i];
              const q = Math.hypot(c.x + (dx / m) * sp * T * 0.6 - h.x, c.y + (dy / m) * sp * T * 0.6 - h.y);
              if (q < h.rc) dsum += h.rc - q;
            }
          }
        }
      }
      return dsum;
    };
    const base = danger(out.dx, out.dy);
    if (base === 0) return out;
    let best = out;
    let bestScore = base;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (keepDy && out.dy !== 0 && dy !== out.dy) continue; // a dodge keeps its vertical escape
        const sc = danger(dx, dy) + (Math.abs(dx - out.dx) + Math.abs(dy - out.dy)) * 0.8;
        if (sc < bestScore) (bestScore = sc), (best = { dx, dy });
      }
    return best;
  }

  function deliverGoal(g) {
    // Hold just below a shut hatch rather than pressing into the ceiling.
    return { x: g.ship.x + g.ship.dir * 6, y: g.ship.open ? CFG.topY - 6 : CFG.topY + 14 };
  }

  // ------------------------------------------------------------ state-blind / greedy
  function idle() {
    return () => ({ dx: 0, dy: 0 });
  }

  // Deliver as soon as anything is attached (or at a fixed chain size), never dodge.
  function fixedHaul(k) {
    return (g) => {
      const L = g.lander;
      if (!L || !L.alive) return { dx: 0, dy: 0 };
      const n = SKY.bodyCount(g);
      const left = g.humans.filter((h) => h.state !== "held").length;
      if (n >= k || (n > 0 && left === 0)) {
        const d = deliverGoal(g);
        return steerTo(L, d.x, d.y, 2);
      }
      const h = nearestTarget(g, SKY.tip(g).x, true);
      if (!h) return { dx: 0, dy: -1 };
      const gl = grabGoal(g, h);
      return overTerrain(g, steerTo(L, gl.x, gl.y, 2));
    };
  }

  // ------------------------------------------------------------ state reader
  // opts.human: apply human limits (latency, noise, lapses, decision rate).
  // opts.haulAt: chain size it wants before hauling when unthreatened.
  function reader(opts) {
    const o = Object.assign({ human: false, heavyPref: "none", turret: "shield", haulAt: 5, latency: 0.24, noise: 2, lapseRate: 0.2, lapseLen: 0.7, decisionHz: 9, seed: 7 }, opts || {});
    const rand = SKY.rng(o.seed);
    const hist = []; // defender snapshots for latency
    let held = { dx: 0, dy: 0 };
    let nextDecision = 0;
    let lapseUntil = -1;
    let seenNoise = 0;
    let lastNoiseT = -1;
    let dodgeUntil = -1;
    let dodgeDir = 0;
    return (g) => {
      const L = g.lander;
      if (!L || !L.alive) return { dx: 0, dy: 0 };
      const d = g.def;
      hist.push({ t: g.t, x: d.x, y: d.y, dir: d.dir, vx: d.vx, tele: d.tele, cool: d.cool, mode: d.mode });
      while (hist.length > 2 && hist[1].t <= g.t - (o.human ? o.latency : 0)) hist.shift();
      if (o.human) {
        if (g.t < nextDecision) return held;
        nextDecision = g.t + 1 / o.decisionHz;
        if (lapseUntil < g.t && rand() < o.lapseRate / o.decisionHz) lapseUntil = g.t + o.lapseLen;
        if (g.t - lastNoiseT > 0.5) (seenNoise = (rand() * 2 - 1) * o.noise), (lastNoiseT = g.t);
      }
      const pd = o.human ? hist[0] : hist[hist.length - 1];
      const dy_ = o.human ? seenNoise : 0;
      const lapsed = o.human && g.t < lapseUntil;
      const n = SKY.bodyCount(g);
      const w = SKY.chainWeight(g);
      const tipY = SKY.tip(g).y;
      const ahead = SKY.wrapDelta(L.x - pd.x) * pd.dir;
      const facing = ahead > -10 && ahead < 240;
      const dRow = pd.y + dy_;
      const spanTop = L.y - CFG.landerHalfH - 4;
      const spanBot = (n > 0 ? tipY : L.y) + 5;
      const rowThreat = !lapsed && pd.mode === "hunt" && facing && dRow > spanTop && dRow < spanBot && (pd.tele > 0 || pd.cool < 0.5);
      // Lasers already in flight heading at the lander (read without latency: they are bright).
      let laserRow = null;
      if (!lapsed) {
        for (const l of g.lasers) {
          const sp = SKY.laserSpan(l);
          const front = l.dir > 0 ? sp[1] : sp[0];
          const toward = (L.x - front) * l.dir > -8;
          if (toward && l.y > spanTop - 2 && l.y < spanBot + 2) laserRow = l.y;
        }
      }
      const relX = SKY.wrapDelta(L.x - pd.x);
      const closing = relX * pd.vx > 0 || Math.abs(relX) < 14;
      const near = !lapsed && closing && Math.abs(relX) < 60 && Math.abs(L.y - pd.y) < 12;
      let out;
      let dodging = false;
      if (rowThreat || near || laserRow !== null) {
        // Leave the row: go up if it clears the chain sooner, else down.
        const row = laserRow !== null ? laserRow : dRow;
        const upNeed = spanBot - row;
        const downNeed = row - spanTop;
        // The lander itself must leave the row; the chain is secondary. Diving under a shot keeps
        // the chain (it hangs below), climbing over it costs the chain unless it clears entirely.
        const landerDown = row + CFG.landerHalfH + 5 - L.y; // distance to get the lander below the row
        const landerUp = L.y - (row - CFG.landerHalfH - 5); // distance to get it above
        const canDown = L.y + landerDown < SKY.groundUnder(g, L.x - CFG.landerHalfW, L.x + CFG.landerHalfW) - CFG.landerHalfH - CFG.hover;
        const canUp = L.y - landerUp > CFG.topY + 1;
        let vert;
        if (!canDown) vert = -1;
        else if (!canUp) vert = 1;
        else if (n > 0) vert = landerDown <= upNeed ? 1 : -1;
        else vert = landerDown < landerUp ? 1 : -1;
        // Commit to a dodge direction for a moment, as a person would, instead of re-deciding
        // every frame on a stale view of the row.
        if (!o.human || g.t > dodgeUntil) dodgeDir = vert;
        dodgeUntil = o.human ? g.t + 0.4 : -1;
        out = { dx: 0, dy: dodgeDir };
        dodging = true;
      } else if (g.t < dodgeUntil) {
        out = { dx: 0, dy: dodgeDir };
        dodging = true;
      } else {
        const left = g.humans.filter((h) => h.state === "walk" || h.state === "fall").length;
        const threat = !lapsed && pd.mode === "hunt" && facing && ahead < 140;
        const haul = n > 0 && (w >= o.haulAt || left === 0 || (threat && w >= Math.max(2, o.haulAt - 2)));
        if (haul) {
          const dg = deliverGoal(g);
          out = overTerrain(g, steerTo(L, dg.x, dg.y, 2));
        } else {
          const h = nearestTarget(g, SKY.tip(g).x, true, o.heavyPref, o.haulAt);
          if (!h) out = { dx: 0, dy: -1 };
          else {
            const gl = grabGoal(g, h);
            out = overTerrain(g, steerTo(L, gl.x, gl.y, 2));
          }
        }
      }
      // Turrets: a charging turret under the lander. With two or more captives hanging in the
      // column the chain takes the shot ("shield"); otherwise step sideways out of the column.
      if (!lapsed) {
        for (const t of g.turrets || []) {
          if (t.charge <= 0) continue;
          const inCol = Math.abs(L.x - t.x) < CFG.landerHalfW + 5;
          const shielded = o.turret === "shield" && n >= 2 && Math.abs(SKY.tip(g).x - t.x) < 8;
          if (inCol && !shielded) {
            out = { dx: L.x < t.x ? -1 : 1, dy: out.dy };
            dodging = true;
          }
        }
      }
      // Bomber hull: a slow ship at a fixed altitude — step out of its row when it is close.
      const b = g.bomber;
      if (!lapsed && b && Math.abs(b.x - L.x) < 44 && Math.abs(b.y - L.y) < 13 && (L.x - b.x) * b.dir > -14) {
        out = { dx: out.dx, dy: L.y < b.y ? -1 : 1 };
        dodging = true;
      }
      out = avoidHazards(g, out, lapsed, dodging);
      // A committed pass closing in just above: wait under it instead of climbing into it.
      if (!dodging && !lapsed && out.dy < 0 && pd.mode === "hunt" && Math.abs(relX) < 90 && closing) {
        const gap = L.y - CFG.landerHalfH - dRow;
        if (gap > 0 && gap < 18) out = { dx: out.dx, dy: 0 };
      }
      // Walls: visible laser rows still sweeping toward the lander, and a nearby or committed
      // Defender row. Goal steering never moves the lander (or its chain) back into one.
      if (!dodging && !lapsed && out.dy !== 0) {
        const walls = [];
        for (const l of g.lasers) {
          const sp = SKY.laserSpan(l);
          const back = l.dir > 0 ? sp[0] : sp[1];
          if ((L.x - back) * l.dir > -12) walls.push(l.y);
        }
        if (pd.mode === "hunt" && ((closing && Math.abs(relX) < 130) || pd.tele > 0)) walls.push(dRow);
        const top = L.y - CFG.landerHalfH - 7;
        const bot = (n > 0 ? tipY : L.y) + 7;
        for (const w of walls) {
          const enteringFromAbove = out.dy > 0 && bot < w && bot + 4 >= w;
          const enteringFromBelow = out.dy < 0 && top > w && top - 4 <= w;
          if (enteringFromAbove || enteringFromBelow) out = { dx: out.dx, dy: 0 };
        }
      }
      held = out;
      return out;
    };
  }

  const api = { idle, fixedHaul, reader, hangDepth };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SKYBOTS = api;
})(typeof window !== "undefined" ? window : globalThis);
