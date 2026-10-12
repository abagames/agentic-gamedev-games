// The score multiplier in the two modes that do not use the chain: by how
// close the kill is (CLOSE) and by grazing (GRAZE). The chain (CHAIN) is in
// probes/formation.probe.mjs. (docs/spec-draft.md §7, src/sim/score.js)

export default {
  name: "rate: the multiplier by closeness and by grazing",
  requires: ["modes"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const park = (mode) => {
        g.reset({ seed: 1, mode });
        g.state.stage.frozen = true;
        return g.state;
      };
      const small = (s, x, y) => s.enemies.push({ id: 9000 + s.enemies.length, kind: "small", x, y, hp: 1, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [], formation: 0 });
      const out = {};

      // CLOSE: one small enemy straight above the ship at a given distance,
      // shot the moment the shot arrives. What 100 points became.
      const closeKill = (shipY, enemyY) => {
        const s = park("normal");
        s.ship.y = shipY;
        small(s, 0, enemyY);
        // [how far off it was when it went, how high, what the 100 became]
        for (let t = 0; t < 40; t++) {
          g.step(1, 16);
          const e = s.events.find((x) => x.type === "destroy");
          // (To the edge of its hit box: 1.2 by 0.45 either way.)
          if (e) return [Math.hypot(Math.max(Math.abs(e.x - s.ship.x) - 1.2, 0), Math.max(Math.abs(e.y - s.ship.y) - 0.45, 0)), e.y, s.score];
        }
        return [99, 99, -1];
      };
      // (The enemy sinks while the shot climbs, so the distances are what they
      // are when it is hit.)
      out.close = [closeKill(-8, -5), closeKill(-8, 0), closeKill(-8, 6), closeKill(-14, 11), closeKill(13, 15.4)];
      // A laser's kill counts where it was let go from, not where the ship is
      // when it lands.
      let s = park("normal");
      s.ship.y = 3;
      s.enemies.push({ id: 9100, kind: "middle", x: 0, y: 6, hp: 7, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [], formation: 0 });
      s.shots = [];
      g.step(1, 16);
      s.shots = [];
      for (let t = 0; t < 9; t++) {
        g.step(1, 16);
        s.shots = [];
      }
      const locks = s.locks.length;
      g.step(1, 0);
      s.ship.y = -14;
      for (let t = 0; t < 60 && s.enemies.length > 0; t++) g.step(1, 0);
      out.laser = [locks, s.score];
      // The ground pays no more than x6, however near: a panel right under
      // the ship's nose.
      s = park("normal");
      s.ground.nextIn = 1e9;
      s.ground.islands = [{ id: 8000, x: 0, y: -6, cols: 1, rows: 1, cells: [[true]], kind: "row", look: 0 }];
      s.ground.targets = [{ id: 8001, island: 8000, kind: "panel", ox: 0, oy: 0, x: 0, y: 0, hp: 1, look: 0 }];
      g.step(1, 16);
      g.step(6, 0);
      out.groundCap = s.score;
      // A large enemy is as close as its hull is: from 3.5 under its centre
      // (2.6 under its hit box) a kill pays in full.
      s = park("normal");
      s.ship.y = 3;
      s.enemies.push({ id: 9200, kind: "large", x: 2.5, y: 6.5, hp: 1, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [], formation: 0 });
      for (let t = 0; t < 12 && s.enemies.length > 0; t++) g.step(1, 16);
      out.big = s.score;
      // An island cleared, or a formation let go, does nothing in CLOSE.
      s = park("normal");
      s.ground.nextIn = 1e9;
      s.ground.islands = [{ id: 8000, x: 0, y: -16.2, cols: 1, rows: 1, cells: [[true]], kind: "row", look: 0 }];
      s.ground.targets = [{ id: 8001, island: 8000, kind: "panel", ox: 0, oy: 0, x: 0, y: 0, hp: 1, look: 0 }];
      let lost = 0;
      for (let t = 0; t < 40; t++) {
        g.step(1, 0);
        lost += s.events.filter((e) => e.type === "ground-lost" || e.type === "chain-break").length;
      }
      out.normalIsland = [lost, s.chain];

      // GRAZE: a bullet that passes within 2 of the ship without hitting it.
      const bullet = (s2, x, id = 99000) => s2.bullets.push({ id, x, y: s2.ship.y + 3, dir: Math.PI, speed: 0.3, age: 100, owner: 0, ox: 0, aimed: false, shape: 0, chain: [], depth: 0, r: 0.5, mirror: 1, fuse: -1 });
      s = park("dense");
      bullet(s, s.ship.x + 0.8);
      let grazes = 0;
      for (let t = 0; t < 20; t++) {
        g.step(1, 0);
        grazes += s.events.filter((e) => e.type === "graze").length;
      }
      out.graze = [grazes, Math.round(s.rate * 100) / 100, s.lives];
      // One that passes 3 away is not a graze; one 1.8 away is.
      s = park("dense");
      bullet(s, s.ship.x + 1.8);
      g.step(20, 0);
      out.generous = s.rate;
      s = park("dense");
      bullet(s, s.ship.x + 3);
      g.step(20, 0);
      out.wide = s.rate;
      // Five in a row lift it to 6; a kill then pays x6.
      s = park("dense");
      for (let i = 0; i < 5; i++) bullet(s, s.ship.x + 0.8 + i * 0.02, 99000 + i);
      g.step(12, 0);
      s.bullets = [];
      small(s, 0, -5);
      const before = s.rate;
      for (let t = 0; t < 12 && s.enemies.length > 0; t++) g.step(1, 16);
      out.pays = [Math.round(before * 100) / 100, s.score];
      // Left alone it holds for 60 frames, then sinks a step and a half a second, to 1.
      s = park("dense");
      s.rate = 4;
      g.step(60, 0);
      const held = s.rate;
      g.step(50, 0);
      const sunk = s.rate;
      g.step(600, 0);
      out.decay = [held, Math.round(sunk * 100) / 100, s.rate];
      // The ground pays at the multiplier and does nothing else to it: a
      // group of bonus targets taken neither raises nor holds it.
      s = park("dense");
      s.rate = 4;
      s.rateIdle = 200;
      s.ground.nextIn = 1e9;
      s.ground.islands = [{ id: 8000, x: 0, y: -4, cols: 1, rows: 1, cells: [[true]], kind: "bonusRow", look: 0 }];
      s.ground.targets = [{ id: 8001, island: 8000, kind: "bonus", group: 8000, ox: 0, oy: 0, x: 0, y: 0, hp: 1, look: 0 }];
      const rateBefore = Math.floor(s.rate);
      for (let t = 0; t < 12 && s.ground.targets[0].hp > 0; t++) g.step(1, 16);
      const paidAt = s.score;
      const after = s.rate;
      g.step(60, 0);
      out.hold = [rateBefore, paidAt, after < 4, s.rate < after];
      // A ship lost puts it back to 1; and nothing grazes a ship that cannot be hit.
      s = park("dense");
      s.rate = 9;
      s.bullets.push({ id: 99999, x: s.ship.x, y: s.ship.y + 1, dir: Math.PI, speed: 0.2, age: 100 });
      g.step(12, 0);
      const afterMiss = s.rate;
      bullet(s, s.ship.x + 0.8);
      g.step(20, 0);
      out.miss = [afterMiss, s.rate, s.ship.respawn > 0];
      // Once the run is over, nothing afterOver: there is no ship to pass.
      s = park("dense");
      s.lives = 0;
      s.bullets.push({ id: 99998, x: s.ship.x, y: s.ship.y + 1, dir: Math.PI, speed: 0.2, age: 100 });
      g.step(12, 0);
      const over = s.phase;
      let afterOver = 0;
      for (let i = 0; i < 6; i++) {
        bullet(s, s.ship.x + 0.8 + i * 0.1, 98000 + i);
        g.step(20, 0);
        afterOver += s.events.filter((e) => e.type === "graze").length;
      }
      out.over = [over, afterOver, s.rate];
      // CHAIN and CLOSE do not graze.
      s = park("rapid");
      bullet(s, s.ship.x + 0.8);
      g.step(20, 0);
      out.noGraze = s.rate;
      return out;
    });
    const want = (d) => 100 * Math.max(1, Math.min(16, Math.round(1 + 15 * Math.max(0, Math.min(1, (16 - d) / 13)) ** 2)));
    check("CLOSE: a kill pays 100 x 16 within 3, x 1 from 16 on (half the screen), rising faster the nearer it is", r.close, (v) => v.slice(0, 4).every((k) => k[2] === want(k[0])) && v[0][2] === 1600 && v[3][2] === 100 && v[1][2] > v[2][2] && v[2][2] > 100);
    check("CLOSE: it pays the same at the top of the field: a kill above y 13.5 within 3 pays 100 x 16", r.close, (v) => v[4][0] < 3 && v[4][1] > 13.5 && v[4][2] === 1600);
    check("CLOSE: a laser let go 3 away pays 500 x 16 though the ship has moved off", r.laser, (v) => v[0] === 1 && v[1] === 8000);
    check("CLOSE: distance is to the edge of the hit box: a large enemy 3.5 off centre pays 1000 x 16", r.big, 16000);
    check("CLOSE: what is on the ground pays no more than x6: a panel 2 away pays 50 x 6", r.groundCap, 300);
    check("CLOSE: an island that gets away breaks nothing", r.normalIsland, (v) => v[0] === 0 && v[1] === 0);
    check("GRAZE: a bullet passing 0.8 away is one graze, +1, and no ship lost", r.graze, (v) => v[0] === 1 && v[1] === 2 && v[2] === 2);
    check("GRAZE: a bullet passing 1.8 away still counts; one 3 away does not", [r.generous, r.wide], (v) => v[0] === 2 && v[1] === 1);
    check("GRAZE: five grazes make the multiplier 6, and a kill pays 100 x 6", r.pays, (v) => v[0] === 6 && v[1] === 600);
    check("GRAZE: it holds for 60 frames, then sinks one every 50 frames, down to 1", r.decay, (v) => v[0] === 4 && Math.abs(v[1] - 3) < 0.02 && v[2] === 1);
    check("GRAZE: a group of bonus targets pays at the multiplier ((300 + 1500) x 3 here, sunk from 4) and does not hold it", r.hold, (v) => v[0] === 4 && v[1] === 5400 && v[2] && v[3]);
    check("GRAZE: a ship lost puts it back to 1, and nothing grazes a ship that cannot be hit", r.miss, (v) => v[0] === 1 && v[1] === 1 && v[2]);
    check("GRAZE: after the last ship is lost, bullets passing close are no graze and the multiplier stays at 1", r.over, (v) => v[0] === "gameover" && v[1] === 0 && v[2] === 1);
    check("CHAIN does not graze", r.noGraze, 1);
  },
};
