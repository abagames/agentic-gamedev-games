// The three modes and the start sectors (docs/spec-draft.md §2,
// src/sim/constants.js MODES).

export default {
  name: "modes: bullet speed, density, ship speed; starting from a later sector",
  requires: ["modes"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const r4 = (v) => Math.round(v * 10000) / 10000;
      const out = {};
      // The ship: ten frames to the right.
      out.ship = ["normal", "rapid", "dense"].map((mode) => {
        g.reset({ seed: 1, mode });
        g.state.stage.frozen = true;
        g.step(10, 8);
        return r4(g.state.ship.x);
      });
      // One large enemy firing a fan written as 6 lanes every 50 frames, and
      // one small enemy firing singles: lanes, rhythm and speed in each mode.
      const fire = (mode, group, base, kind) => {
        g.reset({ seed: 1, mode });
        const s = g.state;
        s.stage.frozen = true;
        s.stage.barrages = [{ group, base, r: 0.5, speedRank: 1, chain: [], mirror: 1, shape: 0, fire: null }];
        s.stage.types = [{ kind, look: 0, interval: 99999, period: 600, muzzles: [{ ox: 0, barrage: 0, mirror: 1 }] }];
        s.enemies.push({ id: 9000, kind, x: 0, y: 12, hp: 100000, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0] });
        s.ship.x = -12;
        const beats = new Map();
        let speed = 0;
        for (let t = 0; t < 260; t++) {
          s.lives = 9;
          g.step(1, 0);
          for (const b of s.bullets) {
            if (b.age === 1) beats.set(s.frame, (beats.get(s.frame) ?? 0) + 1);
            speed = b.speed;
          }
        }
        const at = [...beats.keys()];
        return [beats.get(at[0]), at[1] - at[0], r4(speed)];
      };
      out.fan = ["normal", "rapid", "dense"].map((mode) => fire(mode, "large", 0, "large"));
      out.single = ["normal", "rapid", "dense"].map((mode) => fire(mode, "single", 0, "small"));
      // The floor moves with the mode: the slowest bullet in flight over a
      // stretch of the fourth loop.
      out.floor = ["normal", "rapid", "dense"].map((mode) => {
        g.reset({ seed: 2, mode, startSector: 31 });
        let slowest = 9;
        for (let t = 0; t < 1500; t++) {
          g.state.lives = 9;
          g.step(1, 0);
          for (const b of g.state.bullets) if (b.age >= 24) slowest = Math.min(slowest, b.speed);
        }
        return r4(slowest);
      });

      // Starting later: the stage is as if the sectors before had been played.
      g.reset({ seed: 3, startSector: 21 });
      g.step(2, 0);
      const late = g.state;
      out.start21 = [late.stage.section + 1, late.stage.rank, late.stage.rollout, late.score, late.lives, late.chain, late.startSector];
      // Played through from sector 1 instead, sector 21 holds the same things.
      const cast = JSON.stringify([late.stage.types, late.stage.barrages, late.stage.streams.map((x) => x.kind)]);
      g.reset({ seed: 3 });
      const s = g.state;
      for (let t = 0; t < 40000 && s.stage.section < 20; t++) {
        s.lives = 9;
        s.ship.respawn = 250;
        // (Bosses are sent away at once, to get there.)
        if (s.stage.boss) s.enemies = [];
        g.step(1, 0);
      }
      out.sameAsPlayed = [s.stage.section + 1, s.stage.rollout, JSON.stringify([s.stage.types, s.stage.barrages, s.stage.streams.map((x) => x.kind)]) === cast];
      // The modes hold the same sectors.
      const holds = (mode) => {
        g.reset({ seed: 3, mode, startSector: 11 });
        g.step(2, 0);
        return JSON.stringify([g.state.stage.types, g.state.stage.barrages, g.state.stage.streams.map((x) => x.kind)]);
      };
      out.sameSectors = holds("normal") === holds("rapid") && holds("normal") === holds("dense");
      let refused = 0;
      for (const bad of [{ startSector: 12 }, { startSector: 0 }, { mode: "easy" }]) {
        try {
          g.reset({ seed: 1, ...bad });
        } catch {
          refused++;
        }
      }
      out.refused = refused;
      g.reset({ seed: 1 });
      return out;
    });
    check("the ship moves 0.4 a frame in CLOSE, 0.52 in CHAIN, 0.34 in DENSE", r.ship, (v) => v[0] === 4 && v[1] === 5.2 && v[2] === 3.4);
    check("a fan of 6 every 46 frames: CHAIN fires 3 lanes at 1.4 times the speed, GRAZE 10 lanes at 0.65 times", r.fan, (v) => v[0][0] === 6 && v[1][0] === 3 && v[2][0] === 10 && Math.abs(v[1][2] / v[0][2] - 1.4) < 0.001 && Math.abs(v[2][2] / v[0][2] - 0.65) < 0.001);
    check("the fan's rhythm is all but the same in all three: the lanes carry the density", r.fan, (v) => Math.abs(v[0][1] - v[1][1]) <= 1 && Math.abs(v[0][1] - v[2][1]) <= 2);
    check("a small enemy's shot stays single; CHAIN fires it half as often, GRAZE 1.7 times as often", r.single, (v) => v.every((m) => m[0] === 1) && Math.abs(v[1][1] / v[0][1] - 2) < 0.1 && Math.abs(v[2][1] / v[0][1] - 1 / 1.7) < 0.06 && Math.abs(v[1][2] / v[0][2] - 1.4) < 0.001);
    check("nothing in flight is slower than the mode's floor: 0.219, 0.3175, 0.1423 a frame", r.floor, (v) => v[0] >= 0.2189 && v[1] >= 0.3174 && v[2] >= 0.1423 && v.every((x) => x < 9));
    check("a run from sector 21 starts at rank 12 with 16 sections of patterns behind it, no score, the usual ships, no chain", r.start21, (v) => v.join() === "21,12,16,0,2,0,21");
    check("sector 21 reached by playing holds the same cast and the same mix", r.sameAsPlayed, (v) => v[0] === 21 && v[1] === 16 && v[2] === true);
    check("the three modes hold the same sectors", r.sameSectors, true);
    check("a start that is not the first sector of a loop, or an unknown mode, is refused", r.refused, 3);
  },
};
