// Sections and the large enemy (docs/spec-draft.md §5).

export default {
  name: "stage: sections and the large enemy",
  requires: ["large", "sections"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const out = {};

      g.reset({ seed: 1 });
      g.step(1, 0);
      out.first = [g.state.stage.section, g.state.stage.streams.map((s) => s.kind).join()];
      g.step(599, 0);
      out.stillFirst = g.state.stage.section;
      const during = g.state.enemies.length;
      g.state.enemies = [];
      g.step(59, 0);
      out.lullSpawnsNothing = g.state.enemies.length;
      g.step(2, 0);
      out.second = g.state.stage.section;
      out.secondHasBig = g.state.stage.streams.some((s) => s.kind !== "small");

      // Every section of two loops draws its mix from the allowed range.
      const seen = [];
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        g.reset({ seed });
        g.state.lives = 4;
        for (let n = 0; n < 20; n++) {
          g.step(1, 0);
          g.state.enemies = [];
          g.state.bullets = [];
          const kinds = g.state.stage.streams.map((s) => s.kind);
          // A boss's section: the boss is taken away, and the stage notices.
          if (g.state.stage.boss) g.step(1, 0);
          seen.push([n % 10, kinds.filter((k) => k === "small").length, kinds.filter((k) => k === "middle").length, kinds.filter((k) => k === "large").length]);
          g.state.stage.sectionEnd = g.state.frame;
          g.state.stage.spawnEnd = g.state.frame;
        }
      }
      out.firstAlwaysLight = seen.filter((s) => s[0] === 0).every((s) => s[1] === 1 && s[2] === 0 && s[3] === 0);
      out.maxStreams = Math.max(...seen.map((s) => s[1] + s[2] + s[3]));
      out.lateHasBig = seen.filter((s) => s[0] === 7 || s[0] === 8).every((s) => s[2] + s[3] >= 1);
      out.bossSections = seen.filter((s) => s[0] === 4 || s[0] === 9).every((s) => s[1] + s[2] + s[3] === 0);
      out.largeAppears = seen.some((s) => s[3] > 0);

      // What a sector holds is fixed; where it puts it is the run's. Twelve
      // sections played out (a ship that is never there), under two seeds
      // and under another course.
      const walk = (seed, course) => {
        g.reset({ seed, course });
        const s = g.state;
        const mixes = [];
        const bosses = [];
        const lanes = [];
        // Per section and stream: what each wave was, in order.
        const waves = [];
        let counts = [];
        let section = -1;
        for (let t = 0; t < 12000 && s.stage.section < 12; t++) {
          s.lives = 9;
          s.ship.respawn = 250;
          g.step(1, 0);
          if (s.stage.section !== section) {
            section = s.stage.section;
            mixes.push(s.stage.streams.map((x) => x.kind).join("+"));
            waves.push(s.stage.streams.map(() => []));
            counts = s.stage.streams.map(() => 0);
            if (s.stage.boss) bosses.push(JSON.stringify([s.stage.types.filter((x) => x.kind === "midboss" || x.kind === "bigboss" || x.kind === "wing"), s.enemies.find((e) => e.boss).boss.points]));
          }
          s.stage.streams.forEach((stream, i) => {
            if (stream.waves === counts[i]) return;
            counts[i] = stream.waves;
            const f = s.formations.find((x) => x.id === stream.formation);
            waves[waves.length - 1][i].push(`${stream.type}:${f ? f.pattern : stream.flight}`);
            if (f) lanes.push(Math.round(f.anchor * 100));
          });
        }
        return { mixes: mixes.join(), bosses: bosses.join(), cast: JSON.stringify(s.stage.barrages), waves, lanes: lanes.join(), sections: mixes.length, count: lanes.length, nBosses: bosses.length };
      };
      // One run's waves against another's: stream by stream the same things in
      // the same order, as far as both got (how many fit in is the run's).
      const sameOrder = (x, y) => x.waves.every((streams, n) => streams.every((list, i) => list.every((w, k) => y.waves[n][i][k] === undefined || y.waves[n][i][k] === w)));
      const a = walk(11, 0);
      const b = walk(12, 0);
      const c = walk(11, 1);
      out.fixed = [a.sections, a.count, a.nBosses, a.mixes === b.mixes, a.bosses === b.bosses, a.cast === b.cast, sameOrder(a, b), a.lanes !== b.lanes, a.mixes !== c.mixes || a.cast !== c.cast];

      // Frozen: nothing arrives.
      g.reset({ seed: 1 });
      g.state.stage.frozen = true;
      g.step(700, 0);
      out.frozen = [g.state.enemies.length, g.state.stage.section];

      // A large enemy is worth 1000.
      // (CHAIN: the mode where the multiplier is the chain, so a kill with no chain pays its face value.)
      g.reset({ seed: 1, mode: "rapid" });
      g.state.stage.frozen = true;
      g.state.enemies.push({ id: 9000, kind: "large", x: 0, y: -5, hp: 1, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      const before = g.state.score;
      g.step(4, 16);
      out.kill = [g.state.score - before, g.state.enemies.length];
      return out;
    });
    check("a run starts in section 0 with one stream of small enemies", r.first, (v) => v[0] === 0 && v[1] === "small");
    check("a section lasts 600 frames of arrivals", r.stillFirst, 0);
    check("nothing arrives during the 60-frame lull", r.lullSpawnsNothing, 0);
    check("then the next section starts", r.second, 1);
    check("the second section brings a bigger enemy", r.secondHasBig, true);
    check("the first section of every loop is the light one", r.firstAlwaysLight, true);
    check("at most 3 streams run at once", r.maxStreams, 3);
    check("sections 8 and 9 always include a big enemy", r.lateHasBig, true);
    check("sections 5 and 10 send no streams: they are a boss's", r.bossSections, true);
    check("large enemies do appear", r.largeAppears, true);
    check("two seeds: the same mix of streams in every section, the same bosses, the same cast", r.fixed, (v) => v[0] >= 12 && v[1] >= 30 && v[2] >= 2 && v[3] && v[4] && v[5]);
    check("two seeds: each stream sends the same types flying the same way in the same order", r.fixed, (v) => v[6] === true);
    check("two seeds: the formations do not arrive in the same lanes", r.fixed, (v) => v[7] === true);
    check("another course holds something else", r.fixed, (v) => v[8] === true);
    check("a frozen stage sends nothing and does not advance", r.frozen, (v) => v[0] === 0 && v[1] === -1);
    check("destroying one scores 1000", r.kill, (v) => v[0] === 1000 && v[1] === 0);
  },
};
