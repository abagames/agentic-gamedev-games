// What each loop adds: flight patterns, ways of flying, barrage shapes, boss
// moves, and sections with a character of their own (constants.js UNLOCK and
// THEMES; docs/spec-draft.md, "what each loop brings").

export default {
  name: "variety: what each loop brings",
  requires: ["modes", "flight", "boss"],
  async run({ page, check }) {
    const r = await page.evaluate(async () => {
      const g = window.__game;
      const E = await import("/src/sim/enemies.js");
      const B = await import("/src/sim/barrage.js");
      const r2 = (v) => Math.round(v * 100) / 100;
      const out = {};
      // Flight patterns in play, by sector.
      out.known = [1, 2, 4, 6, 9, 11, 12, 13, 14, 21, 23, 31, 41, 43, 44, 61].map((n) => [n, E.patternsKnown(n - 1).known, E.patternsKnown(n - 1).debut]);

      // The start of each of the first six loops, over a few courses: the
      // shapes and ways of flying in use, the boss's way of moving, and the
      // sections with a character.
      const loops = [];
      for (let loop = 0; loop < 6; loop++) {
        const seen = { middle: new Set(), large: new Set(), boss: new Set(), moves: new Set(), mf: new Set(), lf: new Set(), themes: [] };
        for (let course = 0; course < 6; course++) {
          g.reset({ seed: 3, course, startSector: loop * 10 + 1 });
          const s = g.state;
          let section = -1;
          // (Ten frames at a time: nothing looked at here comes and goes faster.)
          for (let t = 0; t < 9000 && s.stage.section < loop * 10 + 10; t += 10) {
            s.lives = 9;
            s.ship.respawn = 1e9;
            for (const e of s.enemies) if (e.boss) seen.moves.add(e.boss.move);
            if (s.stage.boss && s.enemies.some((e) => e.boss && !e.entering)) s.enemies = [];
            g.step(10, 0);
            if (s.stage.section !== section) {
              section = s.stage.section;
              if (s.stage.theme) seen.themes.push([course, section % 10, s.stage.theme, s.stage.streams.map((x) => x.kind[0]).join("")]);
            }
            for (const e of s.enemies) {
              if (e.boss) seen.moves.add(e.boss.move);
              if (e.plan) (e.kind === "middle" ? seen.mf : seen.lf).add(e.plan.pattern);
            }
            for (const b of s.stage.barrages) if (seen[b.group]) seen[b.group].add(B.baseName(b.group, b.base));
          }
        }
        loops.push({ middle: seen.middle.size, large: seen.large.size, boss: seen.boss.size, moves: [...seen.moves].sort().join(), mf: seen.mf.size, lf: seen.lf.size, themes: seen.themes });
      }
      out.loops = loops;

      // What a stream sends is the sector's: the sizes of its formations come
      // in the same order whatever the seed, short ones and then a long one.
      const sizes = (seed) => {
        g.reset({ seed });
        const s = g.state;
        const seen = new Map();
        for (let t = 0; t < 1500; t += 5) {
          s.lives = 9;
          s.ship.respawn = 1e9;
          g.step(5, 0);
          for (const f of s.formations) if (!f.open) seen.set(f.id, f.planned);
        }
        return [...seen.values()];
      };
      out.sizes = [sizes(3), sizes(4)];

      // The sections that change how formations fly. The same formation, with
      // and without: where its first enemy is, frame by frame.
      const flown = (theme) => {
        g.reset({ seed: 7, startSector: 11 });
        const s = g.state;
        g.step(1, 0);
        s.stage.theme = theme;
        s.ship.x = 6;
        const path = [];
        for (let t = 0; t < 150 && path.length < 50; t++) {
          s.lives = 9;
          s.ship.respawn = 1e9;
          g.step(1, 0);
          const first = s.enemies.find((e) => e.kind === "small" && e.slot === 0);
          if (first) path.push([first.x, first.y]);
          else if (path.length > 0) break;
        }
        return path;
      };
      const far = (path, n) => {
        let d = 0;
        for (let i = 1; i < n; i++) d += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        return d;
      };
      const plain = flown("");
      const slow = flown("slow");
      const fast = flown("fast");
      const long = flown("long");
      const wide = flown("wide");
      const n = Math.min(plain.length, slow.length, fast.length, long.length, wide.length, 40);
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      // Two stretches, by 2 and then by 1.5.
      const once = (x, k) => x * (k - ((k - 1) * Math.abs(x)) / 14);
      const widen = (x) => once(once(x, 2), 1.5);
      out.warp = {
        frames: n,
        slow: far(slow, n) / far(plain, n),
        fast: far(fast, n) / far(plain, n),
        long: plain.slice(0, n).every((p, i) => near(long[i][0], p[0]) && near(15.5 - long[i][1], (15.5 - p[1]) * 1.35)),
        wide: plain.slice(0, n).every((p, i) => near(wide[i][1], p[1]) && near(wide[i][0], Math.abs(p[0]) <= 14 ? widen(p[0]) : wide[i][0])),
        wider: Math.max(...plain.slice(0, n).map((p, i) => Math.abs(wide[i][0]) - Math.abs(p[0]))),
      };

      // The doorway: a fan with its middle lanes left out. And the mirror
      // image of a turning pattern.
      const launch = (group, name, frames) => {
        g.reset({ seed: 1, mode: "normal" });
        const s = g.state;
        s.stage.frozen = true;
        let base = -1;
        for (let i = 0; i < B.baseCount(group); i++) if (B.baseName(group, i) === name) base = i;
        s.stage.barrages = [{ group, base, r: 0.5, speedRank: 1, chain: [], mirror: 1, shape: 0, fire: null }];
        s.stage.types = [{ kind: "large", look: 0, interval: 99999, period: 400, muzzles: [{ ox: 0, barrage: 0, mirror: 1 }] }];
        s.enemies.push({ id: 9000, kind: "large", x: 0, y: 12, hp: 100000, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0.3] });
        s.ship.x = -12;
        const beats = new Map();
        for (let t = 0; t < frames; t++) {
          s.lives = 9;
          g.step(1, 0);
          for (const b of s.bullets) if (b.age === 24 && !beats.has(b.id)) beats.set(b.id, [s.frame, r2(b.dir)]);
        }
        const byFrame = new Map();
        for (const [frame, dir] of beats.values()) byFrame.set(frame, [...(byFrame.get(frame) ?? []), dir].sort((a, b) => a - b));
        return [...byFrame.values()];
      };
      const gate = launch("large", "gatefall", 80)[0].map((d) => r2(d - Math.PI));
      out.gate = [gate.length, Math.min(...gate.map((d) => Math.abs(d)))];
      const cross = launch("large", "crossfire", 80)[0];
      out.counter = [cross.length, cross.every((d) => cross.some((o) => Math.abs(o + d) < 0.011))];

      // A boss that keeps over the ship, and one that comes down low.
      const bossRun = (move, shipX) => {
        g.reset({ seed: 3, startSector: 31 });
        g.step(1, 0);
        const s = g.state;
        s.stage.section = 33;
        s.stage.sectionEnd = s.frame;
        s.stage.streams = [];
        s.enemies = [];
        g.step(1, 0);
        const body = s.enemies.find((e) => e.boss);
        body.boss.move = move;
        if (move === "swoop") body.boss.points = [[0, 11.5], [4, 4.5], [-4, 10]];
        let low = 99;
        let fast = 0;
        for (let t = 0; t < 900; t++) {
          s.lives = 9;
          s.ship.respawn = 0;
          s.ship.x = shipX;
          s.ship.y = -14;
          s.bullets = [];
          const y = body.y;
          g.step(1, 0);
          low = Math.min(low, body.y);
          if (t > 100) fast = Math.max(fast, Math.abs(body.y - y));
        }
        return [r2(body.x), r2(low), r2(fast / body.boss.speed)];
      };
      out.chase = [bossRun("chase", 5)[0], bossRun("chase", -9)[0]];
      out.swoop = bossRun("swoop", 0);
      return out;
    });
    const known = Object.fromEntries(r.known.map((k) => [k[0], k]));
    check("the first loop deals its patterns one section at a time: 2 at sector 1, 9 by sector 9", r.known, () => known[1][1] === 2 && known[2][1] === 3 && known[4][1] === 5 && known[6][1] === 6 && known[9][1] === 9);
    check("each later loop brings three more, one in each of its first three sections", r.known, () => known[11][1] === 10 && known[12][1] === 11 && known[13][1] === 12 && known[14][1] === 12 && known[14][2] === false && known[21][1] === 13 && known[23][1] === 15 && known[31][1] === 16);
    check("the last arrive in the fifth loop: 21 from sector 43 on", r.known, () => known[41][1] === 19 && known[43][1] === 21 && known[44][1] === 21 && known[61][1] === 21 && known[61][2] === false);
    check("the first loop uses no more than the 9 middle, 10 large and 5 boss shapes it starts with", r.loops[0], (v) => v.middle <= 9 && v.large <= 10 && v.boss <= 5);
    check("later loops use shapes the first does not have", r.loops, (v) => v[4].boss > 5 && v[5].boss > v[1].boss && v[5].middle + v[5].large >= v[0].middle + v[0].large);
    check("ways of flying: four of each in the first loop, more later", r.loops, (v) => v[0].mf <= 4 && v[0].lf <= 4 && v[4].mf > 4 && v[3].lf > 4);
    check("a boss tours in the first loop; later loops have ones that chase and ones that swoop", r.loops, (v) => v[0].moves === "tour" && v.slice(1).some((l) => l.moves.includes("chase")) && v.slice(2).some((l) => l.moves.includes("swoop")));
    check("the first loop has no section with a character; every later loop has three, never its first section nor a boss's, no two alike", r.loops, (v) => v[0].themes.length === 0 && v.slice(1).every((l) => l.themes.length === 18 && l.themes.every((t) => t[1] !== 0 && t[1] !== 4 && t[1] !== 9) && [0, 1, 2, 3, 4, 5].every((c) => new Set(l.themes.filter((t) => t[0] === c).map((t) => t[2])).size === 3)));
    check("all seven kinds of section turn up", r.loops, (v) => new Set(v.flatMap((l) => l.themes).map((t) => t[2])).size === 7);
    check("the sizes of a sector's formations are the sector's: the same for another seed", r.sizes, (v) => v[0].length >= 4 && v[0].slice(0, Math.min(v[0].length, v[1].length)).join() === v[1].slice(0, Math.min(v[0].length, v[1].length)).join());
    check("they come as a phrase: of every four, two short and two longer", r.sizes, (v) => v[0].slice(0, 4).filter((c) => c <= 3).length === 2 && v[0].slice(0, 4).filter((c) => c >= 5).length === 2);
    check("SLOW: a formation flies at about 0.6 of its speed; FAST: at about 1.6", r.warp, (v) => v.frames >= 20 && v.slow > 0.5 && v.slow < 0.8 && v.fast > 1.4 && v.fast < 1.85);
    check("LONG: the same path drawn out downward by 1.35 from where the enemies come in", r.warp, (v) => v.long === true);
    check("WIDE: the same path drawn out sideways about the middle, twice over (by 2, then by 1.5), easing to nothing at the walls", r.warp, (v) => v.wide === true && v.wider > 2);
    check("a swarm is three streams of formations, a heavy section two middle and one large", r.loops, (v) => v.slice(1).flatMap((l) => l.themes).every((t) => (t[2] === "swarm" ? t[3] === "sss" : t[2] === "heavy" ? t[3] === "mml" : true)) && v.slice(1).flatMap((l) => l.themes).some((t) => t[2] === "islands"));
    check("gatefall: a fan with the two lanes under the enemy left out", r.gate, (v) => v[0] === 8 && v[1] >= 0.29);
    check("crossfire: every bullet has its mirror image", r.counter, (v) => v[0] >= 6 && v[1]);
    check("a chasing boss ends over the ship, no further out than 6", r.chase, (v) => v[0] === 5 && v[1] === -6);
    check("a swooping boss comes down to y 4.5, hurrying (its fastest drop is about twice its usual pace; the move is slanted)", r.swoop, (v) => v[1] === 4.5 && v[2] > 1.8 && v[2] <= 2.51);
  },
};
