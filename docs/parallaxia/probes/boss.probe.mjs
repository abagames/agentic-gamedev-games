// Bosses: whose sections they are, coming in, touring, wings, giving up,
// being destroyed (docs/spec-draft.md §5, src/sim/boss.js).

export default {
  name: "boss: arrival, wings, time limit, destruction",
  requires: ["boss"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const r2 = (v) => Math.round(v * 100) / 100;
      // Starts the given section (1-based) with an empty field.
      // (CHAIN where the chain is in question; the ship is parked far from the
      // boss, so in CLOSE every part pays its face value.)
      const at = (sector, seed = 3, mode = "normal") => {
        g.reset({ seed, mode });
        g.step(1, 0);
        const s = g.state;
        s.stage.section = sector - 2;
        s.stage.sectionEnd = s.frame;
        s.stage.streams = [];
        s.enemies = [];
        s.ground.islands = [];
        s.ground.targets = [];
        s.ship.x = -13;
        s.ship.y = -15;
        g.step(1, 0);
        return s;
      };
      // The ship stays in play (a boss holds its fire while it is away).
      const safe = (s) => {
        s.lives = 9;
      };
      const body = (s) => s.enemies.find((e) => e.boss);
      const out = {};

      let s = at(5);
      out.mid = [s.stage.section + 1, s.enemies.map((e) => e.kind).join(), s.stage.boss === body(s).id, s.stage.streams.length];
      // Coming in: 90 frames in which a shot passes through it and nothing locks.
      for (let t = 0; t < 80; t++) {
        safe(s);
        g.step(1, 0);
      }
      s.shots = [{ x: 0, y: body(s).y - 1, vy: 1 }];
      g.step(1, 0);
      out.entering = [body(s).entering, body(s).hp, s.bullets.length, s.shots.length];
      let islands = 0;
      for (let t = 0; t < 8; t++) {
        safe(s);
        g.step(1, 0);
      }
      out.arrived = [body(s).entering, r2(body(s).x), r2(body(s).y), s.enemies.filter((e) => e.parent).map((w) => r2(w.x - body(s).x)).join()];
      // Then it tours and fires; no island sets out while it is here.
      const seen = new Set();
      let fired = 0;
      const patterns = new Set();
      for (let t = 0; t < 800; t++) {
        safe(s);
        g.step(1, 0);
        seen.add(r2(body(s).x) + "," + r2(body(s).y));
        if (body(s).burst > 0) patterns.add(body(s).boss.pattern);
        fired = Math.max(fired, s.bullets.length);
        islands = Math.max(islands, s.ground.islands.length);
      }
      const type = s.stage.types[body(s).type];
      out.tour = [seen.size > 100, fired > 0, patterns.size, type.muzzles.length, islands, body(s).y >= 8 && body(s).y <= 12.5, s.stage.section + 1, type.muzzles.every((m) => s.stage.barrages[m.barrage].group === "boss"), new Set(type.muzzles.map((m) => s.stage.barrages[m.barrage].base)).size];

      // A wing shot off: 1000 points, its gun gone, the body knocked back and
      // silent for 70 frames.
      const wing = s.enemies.find((e) => e.parent);
      const score0 = s.score;
      const y0 = body(s).y;
      wing.hp = 1;
      s.shots.push({ x: wing.x, y: wing.y - 1, vy: 1 });
      g.step(1, 0);
      out.wing = [s.score - score0, s.enemies.filter((e) => e.parent).length, r2(body(s).y - y0) >= 0.5, body(s).fireIn >= 69, body(s).burst, body(s).boss.wings];

      // The body destroyed: 5000, every bullet gone, the other wing gone
      // unpaid, and the next section 90 frames later.
      for (let t = 0; t < 200 && s.bullets.length === 0; t++) {
        safe(s);
        g.step(1, 0);
      }
      const bulletsBefore = s.bullets.length;
      const score1 = s.score;
      body(s).hp = 0.3; // (behind its last wing a shot does 0.34)
      s.shots.push({ x: body(s).x, y: body(s).y - 1, vy: 1 });
      g.step(1, 0);
      const gone = [s.score - score1, s.bullets.length, s.enemies.length, bulletsBefore > 0];
      g.step(1, 0);
      const frame = s.frame;
      let next = 0;
      for (let t = 0; t < 200 && s.stage.section === 4; t++) {
        safe(s);
        g.step(1, 0);
        next = s.frame - frame;
      }
      out.destroyed = [...gone, next, s.stage.section + 1, s.stage.boss];

      // Behind a wing the body takes a third of what hits it; with the wings
      // gone, all of it.
      s = at(5);
      for (let t = 0; t < 95; t++) {
        safe(s);
        g.step(1, 0);
      }
      s.bullets = [];
      const hp0 = body(s).hp;
      s.shots = [{ x: body(s).x, y: body(s).y - 1, vy: 1 }];
      g.step(1, 0);
      const guarded = hp0 - body(s).hp;
      let opened = 0;
      for (const w of s.enemies.filter((e) => e.parent)) {
        w.hp = 1;
        s.shots.push({ x: w.x, y: w.y - 1, vy: 1 });
      }
      g.step(1, 0);
      opened += s.events.filter((e) => e.type === "boss-open").length;
      const hp1 = body(s).hp;
      s.shots = [{ x: body(s).x, y: body(s).y - 1, vy: 1 }];
      g.step(1, 0);
      out.guard = [Math.round(guarded * 100) / 100, hp1 - body(s).hp, opened];

      // Every wing shot off before the body: the body is a wipe-out in the
      // chain, paid like a formation's.
      s = at(5, 3, "rapid");
      for (let t = 0; t < 95; t++) {
        safe(s);
        g.step(1, 0);
      }
      s.chain = 3;
      for (const w of s.enemies.filter((e) => e.parent)) {
        w.hp = 1;
        s.shots.push({ x: w.x, y: w.y - 1, vy: 1 });
      }
      g.step(1, 0);
      s.chain = 3;
      const score2 = s.score;
      body(s).hp = 1;
      s.shots = [{ x: body(s).x, y: body(s).y - 1, vy: 1 }];
      g.step(1, 0);
      out.clean = [s.score - score2, s.chain];
      // With a wing still on, the chain is neither longer nor broken.
      s = at(5, 3, "rapid");
      for (let t = 0; t < 95; t++) {
        safe(s);
        g.step(1, 0);
      }
      s.chain = 3;
      body(s).hp = 0.3;
      s.shots = [{ x: body(s).x, y: body(s).y - 1, vy: 1 }];
      g.step(1, 0);
      out.notClean = [s.chain];

      // Left alone for 15 seconds it stops firing and goes, having said so 3
      // seconds before; no score, and the chain is as it was.
      s = at(5);
      s.ship.respawn = 1e9;
      s.chain = 4;
      let lastShotAt = 0;
      let leftAt = 0;
      const warnedAt = [];
      for (let t = 0; t < 2400 && s.stage.section === 4; t++) {
        safe(s);
        s.chain = 4;
        g.step(1, 0);
        if (s.events.some((e) => e.type === "boss-warn")) warnedAt.push(t);
        if (body(s) && body(s).burst > 0) lastShotAt = t;
        if (!body(s) && leftAt === 0) leftAt = t;
      }
      out.left = [lastShotAt < 990, leftAt > 990 && leftAt < 1200, s.score, s.chain, s.stage.section + 1, warnedAt.length, warnedAt[0] >= 808 && warnedAt[0] <= 812];
      // The large boss stays 24 seconds.
      s = at(10);
      let bigLeftAt = 0;
      for (let t = 0; t < 2400 && s.stage.section === 9; t++) {
        safe(s);
        g.step(1, 0);
        if (!body(s) && bigLeftAt === 0) bigLeftAt = t;
      }
      out.bigLeft = bigLeftAt > 1530 && bigLeftAt < 1740;

      // The tenth section is the large one's: four wings.
      s = at(10);
      out.big = [s.enemies.map((e) => e.kind).join(), s.stage.section + 1];
      // Lock-on reaches a wing from outside the body's column.
      for (let t = 0; t < 95; t++) {
        safe(s);
        g.step(1, 0);
      }
      const outer = s.enemies.filter((e) => e.parent).sort((a, b) => b.x - a.x)[0];
      s.ship.x = outer.x;
      s.ship.y = 0;
      s.ship.respawn = 0;
      g.step(12, 16);
      out.wingLock = [s.locks.length >= 1, s.locks.every((l) => l.target === outer.id)];

      // CLOSE: a boss's part pays by how near the ship is to that part, as
      // anything does, and as much when the boss has been knocked to the top
      // of the field. [the multiplier, how high the part was]
      const wingKill = (gap, bodyY) => {
        const s2 = at(10);
        for (let t = 0; t < 95; t++) {
          safe(s2);
          g.step(1, 0);
        }
        if (bodyY !== null) body(s2).y = bodyY;
        const wing = s2.enemies.filter((e) => e.parent).sort((a, b) => b.x - a.x)[0];
        wing.hp = 1;
        for (let t = 0; t < 60; t++) {
          safe(s2);
          s2.bullets = [];
          s2.ship.respawn = 0;
          // (Under the wing's outer half: a shot from under its middle,
          // late on a boss that is moving, can touch the wing inside it.)
          s2.ship.x = wing.x + 1;
          s2.ship.y = body(s2).y - 0.8 - gap;
          g.step(1, 16);
          const e = s2.events.find((x) => x.type === "destroy" && x.kind === "wing");
          if (e) return [e.mult, r2(e.y)];
        }
        return [-1, 99];
      };
      out.closeWing = [wingKill(2, null), wingKill(8, null), wingKill(20, null), wingKill(2, 14)];

      // Other sections have no boss; a drill has none either.
      s = at(4);
      out.none = [s.enemies.some((e) => e.boss), s.stage.boss];
      return out;
    });
    check("section 5 belongs to the middle boss: a body and two wings, and nothing else arrives", r.mid, (v) => v[0] === 5 && v[1] === "midboss,wing,wing" && v[2] && v[3] === 0);
    check("while it comes in, a shot passes through it and it does not fire", r.entering, (v) => v[0] === true && v[1] === 240 && v[2] === 0 && v[3] === 1);
    check("after 90 frames it is at (0, 11.5) with a wing 3.6 to each side", r.arrived, (v) => v[0] === false && v[1] === 0 && v[2] === 11.5 && v[3] === "3.6,-3.6");
    check("it tours near the top, fires each of its barrages (boss-only shapes) in turn, and no island sets out meanwhile", r.tour, (v) => v[0] && v[1] && v[2] === v[3] && v[3] >= 2 && v[4] === 0 && v[5] && v[6] === 5 && v[7] && v[8] === v[3]);
    check("a wing shot off pays 500, knocks the body back and silences it for 70 frames", r.wing, (v) => v[0] === 500 && v[1] === 1 && v[2] && v[3] && v[4] === 0 && v[5] === 1);
    check("the body destroyed pays 3000 and takes every bullet and the other wing; the next section starts 90 frames on", r.destroyed, (v) => v[0] === 3000 && v[1] === 0 && v[2] === 0 && v[3] && v[4] >= 89 && v[4] <= 91 && v[5] === 6 && v[6] === 0);
    check("behind a wing a shot does 0.34 to the body; once the last wing is gone (said once) it does 1", r.guard, (v) => v[0] === 0.34 && v[1] === 1 && v[2] === 1);
    check("CHAIN, with every wing shot off first: the body pays 3000 x 4 and makes the chain 4", r.clean, (v) => v[0] === 12000 && v[1] === 4);
    check("CHAIN, with a wing still on: the chain stays as it was", r.notClean, (v) => v[0] === 3);
    check("the middle boss, after 15 seconds, stops firing and leaves: no score, chain untouched, on to section 6; it warns once, 3 seconds before", r.left, (v) => v[0] && v[1] && v[2] === 0 && v[3] === 4 && v[4] === 6 && v[5] === 1 && v[6]);
    check("the large boss leaves after 24 seconds", r.bigLeft, true);
    check("section 10 belongs to the large boss: a body and four wings", r.big, (v) => v[0] === "bigboss,wing,wing,wing,wing" && v[1] === 10);
    check("from under an outer wing, locks settle on that wing", r.wingLock, (v) => v[0] && v[1]);
    check("CLOSE: a wing shot from 2 under it pays x16, from 8 under x7, from 20 under x1", r.closeWing, (v) => v[0][0] === 16 && v[1][0] === 7 && v[2][0] === 1);
    check("CLOSE: a boss knocked up to y 14 still pays x16 from 2 under its wing", r.closeWing, (v) => v[3][0] === 16 && v[3][1] > 13.5);
    check("section 4 has no boss", r.none, (v) => v[0] === false && v[1] === 0);
  },
};
