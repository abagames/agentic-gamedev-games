// The middle enemy: soft, lightly armed, and flying (docs/spec-draft.md §5).

export default {
  name: "middle: soft, lightly armed, four ways of flying",
  requires: ["middle", "flight"],
  async run({ page, check }) {
    const r = await page.evaluate(async () => {
      const g = window.__game;
      const { KINDS } = await import("/src/sim/constants.js");
      const r3 = (v) => Math.round(v * 1000) / 1000;
      const out = { hp: KINDS.middle.hp, largeHp: KINDS.large.hp };

      // Every middle type of several casts, at the first and at a late rank.
      const types = [];
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        g.reset({ seed });
        g.step(1, 0);
        for (const late of [false, true]) {
          if (late) {
            g.state.stage.section = 49;
            g.state.stage.sectionEnd = g.state.frame;
            g.state.enemies = [];
            g.step(1, 0);
          }
          for (const t of g.state.stage.types.filter((x) => x.kind === "middle")) {
            const barrages = t.muzzles.map((m) => g.state.stage.barrages[m.barrage]);
            types.push({ ox: t.muzzles.map((m) => m.ox).sort((a, b) => a - b), groups: [...new Set(barrages.map((b) => b.group))], chain: Math.max(...barrages.map((b) => b.chain.length)), duty: t.period / t.interval });
          }
        }
      }
      out.types = types.length;
      out.wingsOrBody = types.every((t) => (t.ox.length === 2 && t.ox[0] === -1.5 && t.ox[1] === 1.5 && t.groups.join() === "sub") || (t.ox.length === 1 && t.ox[0] === 0 && t.groups.join() === "middle"));
      out.bothKinds = [types.some((t) => t.ox.length === 2), types.some((t) => t.ox.length === 1)];
      out.noSplits = Math.max(...types.map((t) => t.chain));
      out.duty = r3(Math.max(...types.map((t) => t.duty)));

      // One way of flying at a time. The ship is there but cannot be hurt.
      const fly = (flight, shipX, frames = 900, seed = 3, course = 0) => {
        g.reset({ seed, course });
        const s = g.state;
        s.drill = { pattern: "column", count: 1, middle: true, middleFlight: flight };
        s.stage.drill = s.drill;
        const tracks = new Map();
        const fired = new Set();
        let alternate = null;
        let pair = null;
        for (let t = 0; t < frames; t++) {
          s.lives = 9;
          s.ship.respawn = 100;
          s.ship.x = shipX;
          s.ship.y = -14;
          s.bullets = s.bullets.filter((b) => b.age < 24);
          s.enemies = s.enemies.filter((e) => e.kind === "middle");
          g.step(1, 0);
          for (const e of s.enemies) {
            if (e.kind !== "middle") continue;
            if (!tracks.has(e.id)) tracks.set(e.id, []);
            // Is another of the same wave still to come as the first appears?
            if (tracks.size === 1 && pair === null) pair = s.stage.streams.find((x) => x.kind === "middle").left >= 1;
            if (tracks.size === 2 && alternate === null) alternate = s.stage.streams.find((x) => x.kind === "middle").alternate;
            tracks.get(e.id).push({ x: e.x, y: e.y, leg: e.flight.leg });
            if (e.slot === 0 && s.bullets.some((b) => b.owner === e.id && b.age === 1)) fired.add(e.flight.leg);
          }
        }
        return { tracks: [...tracks.values()], fired: [...fired].sort(), alternate, pair };
      };
      const last = (t) => t[t.length - 1];

      const sink = fly("sink", 0).tracks[0];
      out.sink = [r3(sink[40].x - sink[0].x), r3((sink[0].y - sink[40].y) / 40)];

      const post = fly("post", 0);
      const p = post.tracks[0];
      out.post = [p.filter((q) => q.y === 9).length, last(p).y > 16.5, r3(Math.min(...p.map((q) => q.y))), post.fired];
      // Waves that come down one side (some alternate sides instead): the
      // second enemy starts 7 from the first, or less where the wall is near.
      out.apart = [];
      // (How many a wave has is the sector's, so other courses are looked at
      // as well as other seeds.)
      for (let seed = 1; seed <= 16; seed++) {
        const wave = fly("post", 0, 400, seed, seed % 8);
        if (wave.tracks.length >= 2 && wave.pair && wave.alternate === false) out.apart.push(r3(Math.abs(wave.tracks[1][0].x - wave.tracks[0][0].x)));
      }

      // The ship far to one side, then far to the other: one of the two is the
      // far side from where this enemy comes down, and there every slide is a
      // full 6.
      const stopsOf = (run) => [1, 3, 5, 7].map((leg) => run.tracks[0].find((q) => q.leg === leg)).filter(Boolean).map((q) => [r3(q.x), r3(q.y)]);
      const stalkR = fly("stalk", 11);
      const stalkL = fly("stalk", -11);
      const stalk = Math.abs(stopsOf(stalkR)[1][0] - stopsOf(stalkR)[0][0]) > 5.9 ? stalkR : stalkL;
      const st = stalk.tracks[0];
      out.stalk = [stopsOf(stalk), stalk.fired, last(st).y < -15, stalk === stalkR ? 1 : -1];
      const speeds = [];
      for (let i = 1; i < st.length; i++) if (st[i].leg === 2) speeds.push(Math.hypot(st[i].x - st[i - 1].x, st[i].y - st[i - 1].y));
      out.stalkSpeed = r3(Math.max(...speeds));

      const drift = fly("drift", 0);
      const d = drift.tracks[0];
      out.drift = [r3(Math.abs(d[0].x)), r3(d[0].y), r3(last(d).y), Math.sign(d[0].x) !== Math.sign(last(d).x), r3(Math.hypot(d[41].x - d[40].x, d[41].y - d[40].y)), drift.fired];

      // A formation still fires and flies as before with middle enemies about,
      // and shooting a middle enemy down pays 500 and no formation bonus.
      // (CHAIN: the mode where the multiplier is the chain, so a kill with no chain pays its face value.)
      g.reset({ seed: 1, mode: "rapid" });
      g.state.stage.frozen = true;
      g.state.enemies.push({ id: 9000, kind: "middle", x: 0, y: -5, hp: KINDS.middle.hp, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      let frames = 0;
      while (g.state.enemies.length > 0 && frames < 200) {
        g.step(1, 16);
        frames++;
      }
      out.shotDown = [frames, g.state.score, g.state.chain];
      return out;
    });
    check("a middle enemy has 16 hit points, a third of a large one's", [r.hp, r.largeHp], (v) => v[0] === 16 && v[1] === 48);
    check("every middle type has either a pair of wing guns or one body pattern, never both", [r.types, r.wingsOrBody], (v) => v[0] === 48 && v[1]);
    check("both kinds turn up", r.bothKinds, (v) => v[0] && v[1]);
    check("a middle enemy's bullets never burst, even at rank 36", r.noSplits, 0);
    check("it fires for less than half the time", r.duty, (v) => v < 0.5);
    check("sink: straight down at 0.05", r.sink, (v) => v[0] === 0 && v[1] === 0.05);
    check("post: down to y 9, 240 frames there, then out over the top; it fires only at the post", r.post, (v) => v[0] >= 240 && v[0] <= 242 && v[1] && v[2] === 9 && JSON.stringify(v[3]) === "[1]");
    check("the enemies of one wave are set 7 apart (less against a wall)", r.apart, (v) => v.length >= 2 && v.includes(7) && v.every((d) => d > 0 && d <= 7));
    check("stalk: three slides toward the ship, 6 at most, sinking 1 each", [r.stalk[0], r.stalk[3]], (v) => v[0].length === 4 && Math.abs((v[0][1][0] - v[0][0][0]) * v[1] - 6) < 0.01 && (v[0][2][0] - v[0][1][0]) * v[1] > 0 && (v[0][3][0] - v[0][2][0]) * v[1] >= 0 && Math.abs(v[0][3][0]) <= 11 && [0, 1].every((i) => Math.abs(v[0][i][1] - v[0][i + 1][1] - 1) < 0.01) && v[0][3][1] < 7.01);
    check("stalk: it fires while it waits and slides, not on the way in or out", r.stalk, (v) => v[1].length > 0 && v[1].every((leg) => leg >= 1 && leg <= 6) && v[2]);
    check("stalk: it slides at 0.08", r.stalkSpeed, (v) => Math.abs(v - 0.08) < 0.002);
    check("drift: from one side wall at y 11 to the other at about y 8, at 0.09, firing", r.drift, (v) => v[0] > 11.8 && Math.abs(v[1] - 11) < 0.05 && v[2] < 8.5 && v[3] && Math.abs(v[4] - 0.09) < 1e-3 && v[5].join() === "0");
    check("shot down from 3 below in about a second: 500 points, and no chain from it", r.shotDown, (v) => v[0] <= 60 && v[1] === 500 && v[2] === 0);
  },
};
