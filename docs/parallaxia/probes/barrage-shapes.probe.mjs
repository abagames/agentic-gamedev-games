// The barrage shapes added with the formations: bullets that fall straight
// down, weaving fans, the ring, the retargeting split, and the rule for when a
// formation may fire (docs/spec-draft.md §6).

export default {
  name: "barrage shapes: down, weave, ring, retarget, and when a formation fires",
  requires: ["barrage", "flight"],
  async run({ page, check }) {
    const r = await page.evaluate(async () => {
      const g = window.__game;
      const B = await import("/src/sim/barrage.js");
      const baseOf = (group, name) => {
        for (let i = 0; i < B.baseCount(group); i++) if (B.baseName(group, i) === name) return i;
        return -1;
      };
      const splitOf = (name) => {
        for (let i = 0; i < B.splitCount; i++) if (B.splitName(i) === name) return i;
        return -1;
      };
      const r2 = (v) => Math.round(v * 100) / 100;
      // One enemy of a kind, firing one barrage, with the ship off to the side
      // at shipX. Returns the directions of what it launched, relative to
      // straight down, beat by beat.
      const launch = (kind, group, name, shipX, frames, rank = 0.5) => {
        g.reset({ seed: 1 });
        const s = g.state;
        s.stage.frozen = true;
        s.stage.barrages = [{ group, base: baseOf(group, name), r: rank, speedRank: 1, chain: [], mirror: 1, shape: 0 }];
        s.stage.types = [{ kind, look: 0, interval: 99999, period: 400, muzzles: [{ ox: 0, barrage: 0, mirror: 1 }] }];
        s.ship.x = shipX;
        s.enemies.push({ id: 9000, kind, x: 0, y: 12, hp: 100000, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0] });
        const beats = new Map();
        for (let t = 0; t < frames; t++) {
          s.lives = 9;
          s.ship.x = shipX;
          g.step(1, 0);
          for (const b of s.bullets) if (b.age === 24 && !beats.has(b.id)) beats.set(b.id, [s.frame, r2(b.dir - Math.PI)]);
        }
        const byFrame = new Map();
        for (const [frame, dir] of beats.values()) byFrame.set(frame, [...(byFrame.get(frame) ?? []), dir].sort((a, b) => a - b));
        return [...byFrame.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      };
      const out = { found: [baseOf("single", "drop"), baseOf("middle", "curtain"), baseOf("middle", "burst"), baseOf("large", "weave"), baseOf("large", "rain"), splitOf("ring"), splitOf("retarget")] };
      out.dropLeft = launch("small", "single", "drop", -9, 120);
      out.dropRight = launch("small", "single", "drop", 9, 120);
      out.aimed = launch("small", "single", "single", 0, 120);
      // Every small type of the first six loops: one bullet a beat, no splits.
      const smalls = [];
      for (let seed = 1; seed <= 4; seed++) {
        g.reset({ seed });
        for (const rank of [6, 12, 18, 24, 30, 36]) {
          B.generateTypes(g.state, rank);
          for (const t of g.state.stage.types.filter((t) => t.kind === "small")) {
            const b = g.state.stage.barrages[t.muzzles[0].barrage];
            smalls.push([rank, t.muzzles.length, B.baseName(b.group, b.base), b.chain.length, b.r, b.speedRank]);
          }
        }
      }
      const mean = (rank, i) => {
        const of = smalls.filter((v) => v[0] === rank);
        return of.reduce((a, v) => a + v[i], 0) / of.length;
      };
      out.smalls = [smalls.length, smalls.every((v) => v[1] === 1 && (v[2] === "single" || v[2] === "drop") && v[3] === 0 && v[4] <= 1), new Set(smalls.map((v) => v[2])).size];
      out.smallRise = [mean(6, 4), mean(36, 4), mean(6, 5), mean(36, 5)];
      out.curtain = launch("middle", "middle", "curtain", 9, 120)[0];
      // The knobs for the bigger enemies: a generated cast carries them, and
      // nothing that is fired is slower than the floor.
      g.reset({ seed: 2 });
      B.generateTypes(g.state, 30);
      const fires = (kind) => g.state.stage.types.filter((t) => t.kind === kind).flatMap((t) => t.muzzles.map((m) => g.state.stage.barrages[m.barrage].fire));
      out.knobs = [fires("small").every((f) => f === null), fires("middle").every((f) => f && f.speed === 1.2 && f.density === 0.67), fires("large").every((f) => f && f.speed === 1.25 && f.density === 0.75)];
      // A middle fan written as 4 lanes comes out as 3, a little slower in
      // rhythm, and 1.2 times as fast.
      const thin = (fire) => {
        g.reset({ seed: 1 });
        const s = g.state;
        s.stage.frozen = true;
        s.stage.barrages = [{ group: "middle", base: baseOf("middle", "aimed fan"), r: 0.5, speedRank: 1, chain: [], mirror: 1, shape: 0, fire }];
        s.stage.types = [{ kind: "middle", look: 0, interval: 99999, period: 400, muzzles: [{ ox: 0, barrage: 0, mirror: 1 }] }];
        s.enemies.push({ id: 9000, kind: "middle", x: 0, y: 12, hp: 100000, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0] });
        const beats = new Map();
        let speed = 0;
        for (let t = 0; t < 200; t++) {
          s.lives = 9;
          g.step(1, 0);
          for (const b of s.bullets) {
            if (b.age === 1) beats.set(s.frame, (beats.get(s.frame) ?? 0) + 1);
            speed = b.speed;
          }
        }
        const at = [...beats.keys()];
        return [beats.get(at[0]), at[1] - at[0], Math.round(speed * 10000) / 10000];
      };
      out.thin = [thin(null), thin({ speed: 1.2, density: 0.67 })];
      let slowest = 9;
      for (const seed of [1, 2]) {
        g.reset({ seed });
        g.state.stage.section = 39;
        g.state.stage.sectionEnd = g.state.frame;
        for (let t = 0; t < 2400; t++) {
          g.state.lives = 9;
          g.step(1, 0);
          for (const b of g.state.bullets) if (b.age >= 24) slowest = Math.min(slowest, b.speed);
        }
      }
      out.slowest = slowest;
      out.weave = launch("large", "large", "weave", 0, 120).slice(0, 4);
      out.burst = launch("middle", "middle", "burst", 0, 200).length;
      // The three added with the large enemy's flights.
      out.sidewinder = launch("middle", "middle", "sidewinder", 0, 160).slice(0, 4).map((beat) => r2(beat.reduce((a, d) => a + d, 0) / beat.length));
      out.walker = launch("large", "large", "walker", 0, 60).map((beat) => beat[0]);
      const rings = launch("large", "large", "double ring", 0, 120);
      out.doubleRing = [rings.length, rings[0].length, r2(rings[1][0] - rings[0][0])];

      // A carrier that bursts by the chain [split]: what does it become?
      const burstOf = (name, shipX, rank = 0.5) => {
        g.reset({ seed: 1 });
        const s = g.state;
        s.stage.frozen = true;
        s.ship.x = shipX;
        const index = splitOf(name);
        s.bullets.push({ id: 9000, x: 0, y: 10, dir: Math.PI, speed: 0.1, age: 24, owner: 0, ox: 0, aimed: false, shape: 0, chain: [index], depth: 0, r: rank, mirror: 1, fuse: 24 + 4 });
        for (let t = 0; t < 6; t++) {
          s.lives = 9;
          s.ship.x = shipX;
          g.step(1, 0);
        }
        return s.bullets.map((b) => ({ dir: b.dir, x: b.x, y: b.y, fuse: b.fuse }));
      };
      const ring = burstOf("ring", 0);
      out.ring = [ring.length, r2(ring[1].dir - ring[0].dir), r2((Math.PI * 2) / ring.length)];
      const aimed = burstOf("retarget", 9);
      out.retarget = [aimed.length, r2(aimed[0].dir), aimed.every((b) => b.fuse === -1)];
      out.retargetWant = r2(Math.atan2(9 - 0, -8 - 9.6));
      out.retargetHigh = burstOf("retarget", 9, 0.9).length;

      // A real barrage with a chain of four splits: how long after launching
      // is any bullet still a carrier, and how far has it flown by then?
      // Twice over, the second time at twice the speed: a fuse is a distance.
      out.chain = [1, 2].map((speedRank) => {
        g.reset({ seed: 1 });
        const s = g.state;
        s.stage.frozen = true;
        s.stage.barrages = [{ group: "middle", base: baseOf("middle", "aimed fan"), r: 0.5, speedRank, chain: [splitOf("wide"), splitOf("wide burst"), splitOf("fan"), splitOf("ring")], mirror: 1, shape: 0 }];
        s.stage.types = [{ kind: "middle", look: 0, interval: 99999, period: 30, muzzles: [{ ox: 0, barrage: 0, mirror: 1 }] }];
        s.enemies.push({ id: 9000, kind: "middle", x: 0, y: 12, hp: 100000, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0] });
        let lastCarrierAge = 0;
        let farthest = 0;
        let finals = 0;
        for (let t = 0; t < 70; t++) {
          s.lives = 9;
          s.ship.x = 0;
          s.ship.y = -14;
          g.step(1, 0);
          for (const b of s.bullets) {
            if (b.fuse >= 0 && b.age >= 24) {
              lastCarrierAge = Math.max(lastCarrierAge, b.age - 24);
              farthest = Math.max(farthest, Math.hypot(b.x - s.enemies[0].x, b.y - s.enemies[0].y));
            }
          }
          finals = s.bullets.filter((b) => b.fuse < 0 && b.age >= 24).length;
        }
        return [lastCarrierAge, r2(farthest), finals, s.bullets.some((b) => b.depth === 4)];
      });

      // When a formation fires: count the seeds each pattern's members own,
      // leg by leg, over the first formation.
      const firing = (pattern) => {
        g.reset({ seed: 3 });
        const s = g.state;
        s.drill = { pattern, count: 5 };
        s.stage.drill = s.drill;
        const legs = new Set();
        let first = 0;
        for (let t = 0; t < 500; t++) {
          s.lives = 9;
          s.ship.respawn = 0;
          s.ship.x = 0;
          s.ship.y = -14;
          g.step(1, 0);
          s.bullets = s.bullets.filter((b) => b.age < 24);
          for (const e of s.enemies) {
            if (!first) first = e.formation;
            if (e.formation !== first) continue;
            if (s.bullets.some((b) => b.owner === e.id && b.age === 1)) legs.add(e.flight.leg);
          }
        }
        return [...legs].sort();
      };
      out.fires = { column: firing("column"), hook: firing("hook"), hover: firing("hover"), dive: firing("dive"), hairpin: firing("hairpin"), sweep: firing("sweep") };
      return out;
    });
    check("the new shapes and splits exist", r.found, (v) => v.every((i) => i >= 0));
    check("drop: straight down, wherever the ship is", [r.dropLeft, r.dropRight], (v) => v[0].length >= 3 && v.every((side) => side.every((beat) => beat.length === 1 && beat[0] === 0)));
    check("a small enemy's aimed fire is one bullet a beat", r.aimed, (v) => v.length >= 3 && v.every((beat) => beat.length === 1));
    check("every small type fires one muzzle, aimed singles or drops, and nothing that splits", r.smalls, (v) => v[0] === 72 && v[1] && v[2] === 2);
    check("rank makes small enemies fire more often and faster", r.smallRise, (v) => v[1] > v[0] + 0.3 && v[3] > v[2] + 0.3);
    check("small types carry no knob of this kind; middle and large types carry theirs", r.knobs, (v) => v.every(Boolean));
    check("thinned to 0.67 and sped up 1.2: a fan of 4 every 38 frames becomes 3 every 42, at 0.3091 instead of 0.2576", r.thin, (v) => JSON.stringify(v) === "[[4,38,0.2576],[3,42,0.3091]]");
    check("nothing in flight is slower than 0.85 unit speeds (0.219 a frame)", r.slowest, (v) => v >= 0.219 - 1e-9 && v < 9);
    check("sidewinder: aimed shots 0.26 to one side of the ship, then 0.26 to the other", r.sidewinder, (v) => v.length === 4 && Math.abs(v[0] + 0.26) < 0.011 && Math.abs(v[1] - 0.26) < 0.011 && Math.abs(v[2] + 0.26) < 0.011);
    check("walker: a run of 7 shots that walks across the ship, 0.1 a shot, the middle one dead on", r.walker, (v) => v.length === 7 && Math.abs(v[3]) < 0.011 && v.every((d, i) => i === 0 || Math.abs(d - v[i - 1] - 0.1) < 0.021));
    check("double ring: two rings of 11 and no more in a burst, the second turned 0.3 from the first", r.doubleRing, (v) => v[0] === 2 && v[1] === 11 && Math.abs(Math.abs(v[2]) - 0.3) < 0.021);
    check("curtain: a fan centred on straight down although the ship is to the side", r.curtain, (v) => v.length >= 3 && Math.abs(v[0] + v[v.length - 1]) < 0.011 && Math.abs(v[1] - v[0] - 0.3) < 0.011);
    check("weave: every other beat is shifted by half a gap (0.13)", r.weave, (v) => v.length === 4 && Math.abs(v[1][0] - v[0][0] - 0.13) < 0.011 && Math.abs(v[2][0] - v[0][0]) < 0.011 && Math.abs(v[3][0] - v[1][0]) < 0.011);
    check("burst: runs of at most 5 with a rest between them", r.burst, (n) => n >= 5 && n <= 10);
    check("ring: evenly spaced all the way round", r.ring, (v) => v[0] >= 5 && Math.abs(v[1] - v[2]) < 0.011);
    check("retarget: the carrier becomes one bullet turned to face the ship", [r.retarget, r.retargetWant], (v) => v[0][0] === 1 && Math.abs(v[0][1] - v[1]) < 0.03 && v[0][2]);
    check("retarget: two at a high count rank", r.retargetHigh, 2);
    check("a chain of four splits is finished within 7.5 units of the launch, at unit speed and at twice that (in half the frames)", r.chain, (v) => v.every((c) => c[1] <= 7.5 && c[2] > 20 && c[3]) && Math.abs(v[0][1] - v[1][1]) <= 1 && v[1][0] <= v[0][0] * 0.6);
    check("column and sweep fire all the way", [r.fires.column, r.fires.sweep], (v) => v[0].includes(0) && v[1].includes(0));
    check("hook fires on the way in and through the corner, not on its way to the wall", r.fires.hook, (v) => JSON.stringify(v) === "[0,1]");
    check("hover fires only while it hangs", r.fires.hover, (v) => JSON.stringify(v) === "[1]");
    check("dive never fires", r.fires.dive, (v) => v.length === 0);
    check("hairpin fires only on the way down", r.fires.hairpin, (v) => JSON.stringify(v) === "[0]");
  },
};
