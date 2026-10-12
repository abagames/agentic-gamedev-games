// Generated enemy types, rank, and bullets that burst into more bullets
// (docs/spec-draft.md §6).

const near = (expected, eps = 1e-6) => (actual) => Math.abs(actual - expected) < eps;

export default {
  name: "barrage: generated types, rank per loop, splitting bullets",
  requires: ["barrage"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const out = {};
      const summary = () => JSON.stringify([g.state.stage.rank, g.state.stage.types, g.state.stage.barrages]);

      g.reset({ seed: 5 });
      g.step(1, 0);
      const first = summary();
      const smallSpeed = () => {
        const mine = g.state.stage.barrages.filter((b) => b.group === "single");
        return mine.reduce((sum, b) => sum + b.speedRank, 0) / mine.length;
      };
      out.smallSpeed = [smallSpeed()];
      out.kinds = g.state.stage.types.map((t) => t.kind).join();
      out.rank0 = g.state.stage.rank;
      out.everyTypeFires = g.state.stage.types.every((t) => t.muzzles.length > 0);
      out.wingsMirrored = g.state.stage.types
        .filter((t) => t.kind !== "small")
        .every((t) => t.muzzles.filter((m) => m.ox !== 0).every((m) => t.muzzles.some((n) => n.ox === -m.ox && n.barrage === m.barrage && n.mirror === -m.mirror)));
      out.ranges = g.state.stage.barrages.every((b) => b.r > 0 && b.r <= 1 && b.speedRank >= 1 && b.chain.length <= 4 && new Set(b.chain).size === b.chain.length);
      g.reset({ seed: 5 });
      g.step(1, 0);
      out.sameSeedSameCast = summary() === first;
      // The cast belongs to the sector, not to the run: another seed has the
      // same one. Another course has another.
      g.reset({ seed: 6 });
      g.step(1, 0);
      out.otherSeedSameCast = summary() === first;
      g.reset({ seed: 5, course: 1 });
      g.step(1, 0);
      out.otherCourseOtherCast = summary() !== first;

      // Jump to the start of the second loop.
      g.reset({ seed: 5 });
      g.step(1, 0);
      g.state.stage.section = 9;
      g.state.stage.sectionEnd = g.state.frame;
      g.state.enemies = [];
      g.step(1, 0);
      out.loop2 = [g.state.stage.section, g.state.stage.rank, summary() !== first];
      out.smallSpeed.push(smallSpeed());
      const depth = (s) => Math.max(...s.stage.barrages.map((b) => b.chain.length));
      out.depthLoop2 = depth(g.state);
      g.state.stage.section = 49;
      g.state.stage.sectionEnd = g.state.frame;
      g.step(1, 0);
      out.loop6 = [g.state.stage.rank, depth(g.state), Math.max(...g.state.stage.barrages.map((b) => b.speedRank))];

      // A carrier with the chain ["three"]: flies 22 frames after launch,
      // then becomes three plain bullets at -0.3, 0 and +0.3.
      const carrier = (chain) =>
        g.state.bullets.push({ id: 9000, x: 0, y: 10, dir: Math.PI, speed: 0.1, age: 24, owner: 0, ox: 0, aimed: false, shape: 0, chain, depth: 0, r: 0.5, mirror: 1, fuse: 24 + 22 });
      g.reset({ seed: 1 });
      g.state.stage.frozen = true;
      carrier([0]);
      g.step(21, 0);
      out.beforeFuse = g.state.bullets.length;
      g.step(1, 0);
      out.afterFuse = g.state.bullets.map((b) => [Math.round((b.dir - Math.PI) * 100) / 100, b.fuse, b.depth, Math.round(b.y * 1000) / 1000]);

      // "side drop" keeps the carrier and adds two bullets sideways. The
      // carrier here is far slower than any real one, so its parts come out
      // at the floor (0.85 unit speeds): no bullet is slower than that.
      g.reset({ seed: 1 });
      g.state.stage.frozen = true;
      carrier([5]);
      g.state.bullets[0].fuse = 24 + 18;
      g.step(18, 0);
      out.keep = g.state.bullets.map((b) => [Math.round((b.dir - Math.PI) * 100) / 100, Math.round(b.speed * 1000) / 1000, b.fuse]);

      // A two-step chain: three, then each of those becomes a twin at once.
      g.reset({ seed: 1 });
      g.state.stage.frozen = true;
      carrier([0, 3]);
      g.step(22, 0);
      out.midChain = g.state.bullets.map((b) => b.fuse >= 0).join();
      g.step(2, 0);
      out.endChain = [g.state.bullets.length, g.state.bullets.every((b) => b.fuse < 0 && b.depth === 2)];

      // A seed that is a carrier does not burst before it launches, and a
      // burst right after a miss is swallowed like any fresh bullet.
      g.reset({ seed: 1 });
      g.state.stage.frozen = true;
      carrier([0]);
      g.state.ship.respawn = 290;
      g.step(22, 0);
      out.swallowedAfterMiss = g.state.bullets.length;
      return out;
    });
    check("a loop's cast is 3 small, 4 middle and 2 large types", r.kinds, "small,small,small,middle,middle,middle,middle,large,large");
    check("the first loop runs at rank 6", r.rank0, 6);
    check("every type has at least one muzzle that fires", r.everyTypeFires, true);
    check("wing guns come in mirrored pairs sharing a barrage", r.wingsMirrored, true);
    check("count rank within 0..1, speed rank at least 1, chains of at most 4 distinct splits", r.ranges, true);
    check("the same seed generates the same cast", r.sameSeedSameCast, true);
    check("another seed has the same cast: it belongs to the sector", r.otherSeedSameCast, true);
    check("another course has another cast", r.otherCourseOtherCast, true);
    check("the second loop starts at section 10 with rank 9 and a new cast", r.loop2, (v) => v[0] === 10 && v[1] === 9 && v[2] === true);
    check("at rank 9 nothing an ordinary enemy fires splits yet", r.depthLoop2, 0);
    check("rank 21: some bullets split, once, and bullets are faster", r.loop6, (v) => v[0] === 21 && v[1] === 1 && v[2] > 1.4);
    check("a small enemy's bullets are faster in the second loop, but by less than a third", r.smallSpeed, (v) => v[1] > v[0] * 1.1 && v[1] < v[0] * 1.33);
    check("a carrier is one bullet until its fuse runs out", r.beforeFuse, 1);
    check("then it becomes three plain bullets fanned by 0.3", r.afterFuse, (v) => v.length === 3 && v[0][0] === -0.3 && v[1][0] === 0 && v[2][0] === 0.3 && v.every((b) => b[1] === -1 && b[2] === 1 && b[3] === v[0][3]));
    check("side drop: the carrier flies on, plus two bullets to the sides, at no less than the speed floor", r.keep, (v) => v.length === 3 && v[0][0] === 0 && v[0][2] === -1 && near(1.57, 0.01)(Math.abs(v[1][0])) && v[1][1] === 0.219 && v[2][1] === 0.219);
    check("in a two-step chain the first parts are carriers", r.midChain, "true,true,true");
    check("and end as 6 plain bullets", r.endChain, (v) => v[0] === 6 && v[1] === true);
    check("a burst right after a miss is swallowed", r.swallowedAfterMiss, 0);
  },
};
