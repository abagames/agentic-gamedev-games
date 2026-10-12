// Flight patterns of small formations (docs/spec-draft.md §5, src/sim/flight.js).

export default {
  name: "flight: the patterns fly what they are written to fly",
  requires: ["enemy", "formation", "flight"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      // The first formation of a pattern, with the ship held out of play at
      // shipX (it can still be read by the patterns that look at it).
      // present: the ship is there (invincible) rather than away.
      const fly = (pattern, shipX, { moveShipAt = -1, moveShipTo = 0, present = false } = {}) => {
        g.reset({ seed: 3 });
        const s = g.state;
        s.drill = { pattern, count: 5 };
        s.stage.drill = s.drill;
        const tracks = new Map();
        let formation = null;
        let maxStep = 0;
        for (let t = 0; t < 700; t++) {
          s.lives = 9;
          s.ship.respawn = present ? 100 : 250;
          s.bullets = [];
          s.ship.x = t >= moveShipAt && moveShipAt >= 0 ? moveShipTo : shipX;
          g.step(1, 0);
          for (const e of s.enemies) {
            if (!formation) formation = s.formations.find((f) => f.id === e.formation);
            if (e.formation !== formation.id) continue;
            if (!tracks.has(e.slot)) tracks.set(e.slot, []);
            const track = tracks.get(e.slot);
            const last = track[track.length - 1];
            if (last) maxStep = Math.max(maxStep, Math.hypot(e.x - last.x, e.y - last.y));
            track.push({ x: e.x, y: e.y, leg: e.flight.leg });
          }
          if (formation && tracks.size === 5 && !s.enemies.some((e) => e.formation === formation.id)) break;
        }
        return { tracks: [...tracks.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]), f: { ...formation }, maxStep };
      };
      const r3 = (v) => Math.round(v * 1000) / 1000;
      const out = {};
      const names = ["column", "diagonal", "hook", "hover", "dive", "hairpin", "sweep", "stairs", "wave", "zigzag", "cross", "loop", "pincer", "duck", "split", "stagger", "ladder", "swoop", "orbit", "lace", "bounce", "curl"];
      out.steps = names.map((p) => [p, r3(fly(p, 0).maxStep)]);

      const column = fly("column", 0);
      const c = column.tracks[0];
      out.column = [r3(c[40].x - c[0].x), r3((c[0].y - c[40].y) / 40), r3(c[c.length - 1].y), column.tracks.length];

      const diagonal = fly("diagonal", 0);
      const d = diagonal.tracks[0];
      out.diagonal = [r3(Math.abs(d[0].x)), r3(Math.hypot(d[41].x - d[40].x, d[41].y - d[40].y)), r3(Math.abs(d[d.length - 1].x)), Math.sign(d[0].x) !== Math.sign(d[d.length - 1].x)];

      const hookR = fly("hook", 10);
      const hookL = fly("hook", -10);
      // The ship crosses over after the first has turned: the rest still follow it.
      const hookKeep = fly("hook", 10, { moveShipAt: 120, moveShipTo: -10 });
      const lastOf = (t) => t[t.length - 1];
      out.hook = [hookR.f.turn, hookL.f.turn, r3(lastOf(hookR.tracks[0]).y), lastOf(hookR.tracks[0]).x > 13, lastOf(hookL.tracks[0]).x < -13, hookKeep.tracks.every((t) => lastOf(t).x > 13)];
      const hk = hookR.tracks[0];
      const corner = hk.findIndex((p) => p.leg === 1);
      out.hookBrake = [r3(hk[1].y - hk[2].y), r3(hk[corner - 2].y - hk[corner - 1].y)];

      const hover = fly("hover", 0);
      out.hover = hover.tracks.map((t) => [t.filter((p) => p.y === 8).length, r3(t.find((p) => p.y === 8).x)]);
      const rowCentre = (h) => r3(h.tracks.map((t) => t.find((p) => p.y === 8).x).reduce((a, b) => a + b, 0) / h.tracks.length);
      // The ship moves away after the first has set out: the row stays put.
      out.hoverCentre = [rowCentre(hover), rowCentre(fly("hover", 6, { moveShipAt: 45, moveShipTo: -6 })), rowCentre(fly("hover", 12.5))];
      out.hoverFalls = hover.tracks.every((t) => lastOf(t).y < -15);

      // The ship stands at (2, -8), where the run begins it.
      const dive = fly("dive", 2);
      const dv = dive.tracks[0];
      const side = dive.f.anchor >= 2 ? 1 : -1;
      const least = (x, y) => Math.min(...dv.map((p) => Math.hypot(p.x - x, p.y - y)));
      out.dive = [dv.filter((p) => Math.abs(p.y - 9.5) < 1e-9).length, r3(least(2 + side * 7, -2)), r3(least(2, -8)), r3(least(2 - side * 5, -12)), r3(dv[8].x - dive.f.anchor)];

      const hairpin = fly("hairpin", 12.5);
      const hairpinL = fly("hairpin", -12.5);
      const hairpinKeep = fly("hairpin", 12.5, { moveShipAt: 140, moveShipTo: -12.5 });
      const hp = hairpin.tracks[0];
      const turned = (h) => h.tracks.map((t) => r3(lastOf(t).x - t[0].x));
      out.hairpin = [r3(Math.min(...hp.map((p) => p.y))), lastOf(hp).y > 16, turned(hairpin), turned(hairpinL), turned(hairpinKeep)];

      const sweep = fly("sweep", 0);
      const sw = sweep.tracks[0];
      out.sweep = [r3(Math.min(...sw.map((p) => p.y))), r3(Math.hypot(sw[61].x - sw[60].x, sw[61].y - sw[60].y)), Math.abs(lastOf(sw).x) > 13, r3(Math.abs(sw[0].x))];

      const stairs = fly("stairs", 0);
      const st = stairs.tracks[0];
      const ys = [...new Set(st.filter((p, i) => i > 0 && Math.abs(p.y - st[i - 1].y) < 1e-9).map((p) => r3(p.y)))];
      out.stairs = [ys, lastOf(st).y < -15];

      const snake = fly("wave", 0);
      const sn = snake.tracks[0];
      const offs = sn.map((p) => p.x - snake.f.anchor);
      const crossings = offs.filter((o, i) => i > 0 && Math.sign(o) !== Math.sign(offs[i - 1]) && o !== 0).length;
      out.wave = [r3(Math.max(...offs)), r3(Math.min(...offs)), crossings, sn.every((p, i) => i === 0 || p.y < sn[i - 1].y), r3((sn[0].y - sn[40].y) / 40)];
      out.waveFile = snake.tracks.every((t) => Math.abs(Math.max(...t.map((p) => p.x - snake.f.anchor)) - 3) < 0.05);

      const cornersOf = (h, n) => {
        const t = h.tracks[n];
        const found = [];
        for (let i = 1; i < t.length; i++) if (t[i].leg !== t[i - 1].leg) found.push([r3(t[i - 1].x - h.f.anchor), r3(t[i - 1].y)]);
        return found;
      };
      const zig = fly("zigzag", 12.5);
      const zigL = fly("zigzag", -12.5);
      // The ship changes sides while the first stroke is being flown.
      const zigSwap = fly("zigzag", 12.5, { moveShipAt: 45, moveShipTo: -12.5 });
      const zg = zig.tracks[0];
      out.zigzag = [cornersOf(zig, 0), cornersOf(zigL, 0), cornersOf(zigSwap, 0), JSON.stringify(cornersOf(zigSwap, 0)) === JSON.stringify(cornersOf(zigSwap, 4))];
      const cornerAt = zg.findIndex((p) => p.leg === 1);
      out.zigzagBrake = [r3(Math.hypot(zg[2].x - zg[1].x, zg[2].y - zg[1].y)), r3(Math.hypot(zg[cornerAt - 1].x - zg[cornerAt - 2].x, zg[cornerAt - 1].y - zg[cornerAt - 2].y))];

      // With the ship there, at x 3: each one stops over it and drops on it.
      const stoop = fly("cross", 3, { present: true });
      out.stoop = stoop.tracks.map((t) => {
        const still = t.filter((p, i) => i > 0 && p.x === t[i - 1].x && p.y === t[i - 1].y);
        return [still.length, r3(still[0]?.x ?? 99), r3(lastOf(t).x), lastOf(t).y < -15];
      });
      const across = fly("cross", 0);
      const cr = across.tracks[0];
      out.cross = [r3(Math.abs(cr[0].x)), r3(cr[0].y), r3(lastOf(cr).y), Math.abs(lastOf(cr).x) > 13, Math.sign(cr[0].x) !== Math.sign(lastOf(cr).x), r3(Math.hypot(cr[41].x - cr[40].x, cr[41].y - cr[40].y))];

      // The three that arrive in the second loop.
      const loop = fly("loop", 0);
      const lp = loop.tracks[0];
      const round = lp.filter((q) => q.leg === 1);
      out.loop = [r3(Math.max(...round.map((q) => q.x)) - Math.min(...round.map((q) => q.x))), r3(Math.max(...round.map((q) => q.y)) - Math.min(...round.map((q) => q.y))), r3(Math.abs(lp.find((q) => q.leg === 2).x - lp[0].x)), lastOf(lp).y < -15, round.length];
      const pincer = fly("pincer", 0);
      // (The first sighting is one frame into the flight.)
      const starts = pincer.tracks.map((t) => Math.round(t[0].x - pincer.f.anchor));
      const ends = pincer.tracks.map((t) => r3(lastOf(t).x - pincer.f.anchor));
      const pc = pincer.tracks[0];
      const pcCorner = pc.findIndex((q) => q.leg === 1);
      out.pincer = [starts.join(), ends.join(), r3(pc[pcCorner].y), r3(Math.hypot(pc[2].x - pc[1].x, pc[2].y - pc[1].y)), r3(Math.hypot(pc[pcCorner - 1].x - pc[pcCorner - 2].x, pc[pcCorner - 1].y - pc[pcCorner - 2].y))];
      const duckR = fly("duck", 10);
      const duckL = fly("duck", -10);
      const dk = duckR.tracks[0];
      out.duck = [duckR.f.turn, duckL.f.turn, lastOf(dk).x < -13, lastOf(duckL.tracks[0]).x > 13, r3(Math.min(...dk.map((q) => q.y))), duckR.tracks.every((t) => lastOf(t).x < -13), dk.filter((q) => q.leg === 1).length];

      // In the game itself: stairs is not dealt, the others are, and they
      // arrive one section at a time.
      const order = ["column", "diagonal", "hover", "hook", "dive", "hairpin", "sweep", "wave", "zigzag", "cross"];
      const dealt = new Set();
      out.early = true;
      out.debuts = [];
      for (const seed of [5, 6, 7]) {
        g.reset({ seed });
        const seen = new Set();
        const first = {};
        for (let t = 0; t < 11500; t++) {
          g.state.lives = 9;
          g.state.ship.respawn = 250;
          g.step(1, 0);
          const section = g.state.stage.section;
          for (const f of g.state.formations) {
            if (seen.has(f.id)) continue;
            seen.add(f.id);
            dealt.add(f.pattern);
            if (order.indexOf(f.pattern) > 1 + g.state.stage.rollout) out.early = false;
            if (!(section in first)) first[section] = f.pattern;
          }
        }
        // Sections 5 and 10 (indices 4 and 9) are a boss's and deal nothing.
        out.debuts.push([1, 2, 3, 5, 6, 7, 8, 10].map((s) => first[s]).join());
      }
      out.dealt = [...dealt].sort();
      // Far into a run (the sixth loop, over several courses), every adopted
      // pattern is dealt.
      const late = new Set();
      for (let t = 0; t < 24000; t += 10) {
        if (t % 3000 === 0) g.reset({ seed: 9, course: t / 3000, startSector: 51 });
        g.state.lives = 9;
        g.state.ship.respawn = 1e9;
        if (g.state.stage.boss) g.state.enemies = [];
        g.step(10, 0);
        for (const f of g.state.formations) late.add(f.pattern);
      }
      out.late = [...late].sort();
      return out;
    });
    // (The fastest thing written is the dive's 0.9; it was 0.62 until 2026-10-12.)
    check("no pattern jumps: the longest step of each is its top speed", r.steps, (v) => v.every(([, step]) => step > 0.2 && step <= 0.91));
    check("column: straight down at 0.22, five in file, out of the bottom", r.column, (v) => v[0] === 0 && v[1] === 0.22 && v[2] < -15 && v[3] === 5);
    check("diagonal: from x 10 on one side to x 10 on the other at 0.3", r.diagonal, (v) => v[0] > 9.8 && v[1] === 0.3 && v[2] > 9 && v[3]);
    check("hook: turns toward the ship's side at y 4 and leaves over that wall; the rest follow the first", r.hook, (v) => v[0] === 1 && v[1] === -1 && v[2] === 4 && v[3] && v[4] && v[5]);
    check("hook: brakes from 0.45 to near 0.12 before the corner", r.hookBrake, (v) => v[0] > 0.42 && v[1] < 0.15);
    check("hover: each hangs at y 8 for 80 frames, in a row 2.6 apart", r.hover, (v) => v.every((m) => m[0] >= 80 && m[0] <= 82) && v.every((m, i) => i === 0 || Math.abs(m[1] - v[i - 1][1] - 2.6) < 1e-6));
    check("hover: then each drops out of the bottom", r.hoverFalls, true);
    check("dive: comes straight in and stops 10 frames at y 9.5", r.dive, (v) => v[0] >= 10 && v[0] <= 12 && v[4] === 0);
    check("dive: then to a point 7 to its own side of the ship and 6 above, and from there across the ship to 5 beyond and 4 below", r.dive, (v) => v[1] < 0.5 && v[2] < 0.5 && v[3] < 0.5);
    check("hover: the row forms over where the ship was when the first set out, and stays inside the walls", r.hoverCentre, (v) => Math.abs(v[0]) < 0.01 && Math.abs(v[1] - 6) < 0.01 && Math.abs(v[2] - 6.8) < 0.01);
    check("hairpin: turns at y -0.6 and leaves over the top", r.hairpin, (v) => Math.abs(v[0] + 0.6) < 0.01 && v[1]);
    check("hairpin: comes back 3.2 toward the ship's side, and the rest follow the first", r.hairpin, (v) => v[2].every((d) => Math.abs(d - 3.2) < 0.01) && v[3].every((d) => Math.abs(d + 3.2) < 0.01) && v[4].every((d) => Math.abs(d - 3.2) < 0.01));
    check("sweep: an arc from x 12 down to y 1.5 at 0.3, out over the far wall", r.sweep, (v) => Math.abs(v[0] - 1.5) < 0.01 && Math.abs(v[1] - 0.3) < 1e-3 && v[2] && Math.abs(v[3] - 12) < 0.01);
    check("stairs: level runs at y 12, 6 and 0, out of the bottom", r.stairs, (v) => JSON.stringify(v[0]) === "[12,6,0]" && v[1]);
    check("wave: a sine 3 to either side, two full waves, always descending at 0.22", r.wave, (v) => Math.abs(v[0] - 3) < 0.05 && Math.abs(v[1] + 3) < 0.05 && v[2] === 3 && v[3] && Math.abs(v[4] - 0.22) < 0.01);
    check("wave: every member snakes along the same curve", r.waveFile, true);
    const zigOk = (corners, xs) => corners.length === 3 && [10.5, 5.5, 0.5].every((y, i) => Math.abs(corners[i][1] - y) < 0.15 && Math.abs(corners[i][0] - xs[i]) < 0.15);
    check("zigzag: every stroke goes 5 toward the ship's side, corners at y 10.5, 5.5 and 0.5", [r.zigzag[0], r.zigzag[1]], (v) => zigOk(v[0], [5, 10, 15].map((x) => Math.min(x, 12.5 - Math.min(...[0]))).map((x, i) => v[0][i][0])) && v[0][0][0] > 4.8 && v[0][1][0] > v[0][0][0] && v[1][0][0] < -4.8 && v[1][1][0] < v[1][0][0]);
    check("zigzag: it turns back when the ship changes sides, and the rest follow the first", [r.zigzag[2], r.zigzag[3]], (v) => v[0][0][0] > 4.8 && v[0][1][0] < v[0][0][0] - 4.8 && v[1]);
    check("zigzag: brakes from 0.45 to near 0.16 into a corner", r.zigzagBrake, (v) => v[0] > 0.4 && v[1] < 0.2);
    check("cross: over the ship each one stops 14 frames, then drops straight down", r.stoop, (v) => v.length === 5 && v.every((m) => m[0] >= 13 && m[0] <= 15 && Math.abs(m[1] - 3) < 0.7 && m[2] === m[1] && m[3]));
    check("cross: with the ship away, from one side wall at y 10 to the other at about y 6, at 0.3", r.cross, (v) => v[0] > 13 && Math.abs(v[1] - 10) < 0.1 && v[2] < 6.3 && v[2] > 5.9 && v[3] && v[4] && v[5] === 0.3);
    check("loop: once round a circle 6 across on the formation's side, slowly, then on down the same lane", r.loop, (v) => Math.abs(v[0] - 6) < 0.05 && Math.abs(v[1] - 6) < 0.05 && v[2] < 0.01 && v[3] && v[4] > 110);
    check("pincer: members start 6 to either side of the lane turn about, and end on the opposite side", r.pincer, (v) => v[0] === "-6,6,-6,6,-6" && v[1] === "6,-6,6,-6,6");
    check("pincer: the files cross and turn down at y -1, braking from 0.36 to near 0.1", r.pincer, (v) => Math.abs(v[2] + 1) < 0.15 && v[3] > 0.33 && v[4] < 0.13);
    check("duck: stops at y -2, then turns away from the ship's side and leaves low over that wall; the rest follow the first", r.duck, (v) => v[0] === -1 && v[1] === 1 && v[2] && v[3] && v[4] > -5 && v[4] < -3.4 && v[5] && v[6] >= 36 && v[6] <= 38);
    check("the first loop deals the ten early patterns and nothing ahead of its turn", r.dealt, (v) => ["column", "cross", "diagonal", "dive", "hairpin", "hook", "hover", "sweep", "wave", "zigzag"].every((id) => v.includes(id)) && !v.includes("stairs"));
    check("far into a run all twenty-one are dealt, and stairs is not", r.late, (v) => v.length === 21 && !v.includes("stairs") && ["split", "stagger", "ladder", "swoop", "orbit", "lace", "bounce", "curl"].every((id) => v.includes(id)));
    check("no pattern appears before its section: two at the start, one more each section", r.early, true);
    check("the eight sections after the first that are not a boss's each open with their new pattern", r.debuts, (v) => v.every((d) => d === "hover,hook,dive,hairpin,sweep,wave,zigzag,cross"));
  },
};
