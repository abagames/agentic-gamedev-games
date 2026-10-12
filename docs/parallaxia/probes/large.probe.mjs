// The large enemy's ways of flying (docs/flight-patterns.md, src/sim/flight.js
// LARGE_FLIGHTS).

export default {
  name: "large: four ways of flying",
  requires: ["large", "flight"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const r3 = (v) => Math.round(v * 1000) / 1000;
      // The first large enemy of a drill that flies one way only. The ship is
      // there but cannot be hurt, and nothing else is left in the air.
      const fly = (flight, frames) => {
        g.reset({ seed: 3 });
        const s = g.state;
        s.drill = { pattern: "column", count: 1, large: true, largeFlight: flight };
        s.stage.drill = s.drill;
        const track = [];
        const fired = new Set();
        let id = 0;
        for (let t = 0; t < frames; t++) {
          s.lives = 9;
          s.ship.respawn = 100;
          s.ship.x = 0;
          s.ship.y = -14;
          s.bullets = s.bullets.filter((b) => b.age < 24);
          s.enemies = s.enemies.filter((e) => e.kind === "large");
          g.step(1, 0);
          const e = s.enemies.find((x) => x.kind === "large" && (id === 0 || x.id === id));
          if (!e) {
            if (id) break;
            continue;
          }
          id = e.id;
          track.push({ x: e.x, y: e.y, leg: e.flight.leg });
          if (s.bullets.some((b) => b.owner === e.id && b.age === 1)) fired.add(e.flight.leg);
        }
        return { track, fired: [...fired].sort() };
      };
      const last = (t) => t[t.length - 1];
      const out = {};
      const descend = fly("descend", 300).track;
      out.descend = [r3(descend[100].x - descend[0].x), r3((descend[0].y - descend[100].y) / 100)];
      const patrol = fly("patrol", 1400);
      const px = patrol.track.map((q) => q.x);
      const ends = [1, 2, 3].map((leg) => r3(last(patrol.track.filter((q) => q.leg === leg)).x));
      out.patrol = [Math.abs(ends[0]) > 6.95 && Math.abs(ends[0] + ends[1]) < 0.06 && Math.abs(ends[1] + ends[2]) < 0.06 ? -7 : 0, 7, [1, 2, 3].map((leg) => r3(last(patrol.track.filter((q) => q.leg === leg)).y)).join(), last(patrol.track).y < -15, patrol.fired.includes(1) && patrol.fired.includes(3)];
      const shift = fly("shift", 1400);
      const holdAt = (leg) => {
        const still = shift.track.filter((q) => q.leg === leg);
        return [still.length, r3(still[0].x), r3(still[0].y)];
      };
      out.shift = [holdAt(1), holdAt(3), shift.fired.join(), last(shift.track).y < -15];
      const retreat = fly("retreat", 900);
      const stay = retreat.track.filter((q) => q.leg === 1);
      out.retreat = [stay.length, r3(stay[0].y), last(retreat.track).y > 16.5, retreat.fired.join()];

      // In the game, large enemies are dealt all four.
      const dealt = new Set();
      // (What a sector sends is fixed, so look at several courses.)
      for (let course = 0; course < 16; course++) {
        g.reset({ seed: 1, course });
        g.step(1, 0);
        g.state.stage.section = 2;
        for (let t = 0; t < 2400; t++) {
          g.state.lives = 9;
          g.state.ship.respawn = 250;
          g.step(1, 0);
          for (const e of g.state.enemies) if (e.kind === "large" && e.plan) dealt.add(e.plan.pattern);
        }
      }
      out.dealt = [...dealt].sort();
      return out;
    });
    check("descend: straight down at 0.04", r.descend, (v) => v[0] === 0 && v[1] === 0.04);
    check("patrol: back and forth between x -7 and 7 three times, sinking half a unit each time, firing, then out of the bottom", r.patrol, (v) => v[0] === -7 && v[1] === 7 && v[2].split(",").every((y, i) => Math.abs(y - (11 - i * 0.5)) < 0.01) && v[3] && v[4]);
    check("shift: 200 frames at a post 7 to one side, then 200 at 7 to the other, firing only at the posts", r.shift, (v) => v[0][0] >= 200 && v[0][0] <= 202 && Math.abs(v[0][1]) === 7 && v[1][0] >= 200 && v[1][0] <= 202 && v[1][1] === -v[0][1] && v[2] === "1,3" && v[3]);
    check("retreat: 260 frames at y 6.5, firing only there, then out over the top", r.retreat, (v) => v[0] >= 260 && v[0] <= 262 && v[1] === 6.5 && v[2] && v[3] === "1");
    check("the game deals large enemies all four ways", r.dealt, (v) => v.join() === "descend,patrol,retreat,shift");
  },
};
