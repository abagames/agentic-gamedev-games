// Enemy bullets, the miss sequence and game over (reference/mechanics.md §3, §8).

export default {
  name: "bullets: arming, miss, respawn, game over",
  requires: ["enemy", "miss"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      // A fixed cast for the checks: type 0 is a small enemy firing single
      // aimed bullets, type 1 a middle enemy firing two rotating streams.
      const cast = () => {
        g.state.stage.barrages = [
          { group: "single", base: 0, r: 0.5, speedRank: 1, chain: [], mirror: 1, shape: 0 },
          { group: "middle", base: 0, r: 0.5, speedRank: 1, chain: [], mirror: 1, shape: 0 },
        ];
        g.state.stage.types = [
          { kind: "small", look: 0, interval: 99999, period: 160, muzzles: [{ ox: 0, barrage: 0, mirror: 1 }] },
          { kind: "middle", look: 0, interval: 90, period: 60, muzzles: [{ ox: 0, barrage: 1, mirror: 1 }] },
        ];
      };
      const park = () => {
        g.reset({ seed: 1 });
        g.state.stage.frozen = true;
        cast();
      };
      // A bullet two units above the ship, flying straight down at it.
      const bulletAt = (age) => g.state.bullets.push({ id: 9000 + g.state.bullets.length, x: 0, y: -6, dir: Math.PI, speed: 0.2, age });
      const out = {};

      // A small enemy about to fire, moving as it normally does.
      park();
      g.state.enemies.push({ id: 9500, kind: "small", x: 3, y: 10, hp: 100000, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0] });
      g.step(1, 0);
      out.seedCreated = g.state.bullets.length;
      g.step(21, 0);
      const e1 = g.state.enemies[0];
      const b1 = g.state.bullets[0];
      out.seedRidesEnemy = [b1.x - e1.x, b1.y - e1.y, b1.age];
      g.step(2, 0);
      const e2 = g.state.enemies[0];
      const b2 = g.state.bullets[0];
      // The frame it arms it is still on the enemy; it aims from there.
      out.launchGap = Math.hypot(b2.x - e2.x, b2.y - (e2.y + 0.22));
      const want = Math.atan2(0 - b2.x, -8 - b2.y);
      out.aimError = Math.abs(b2.dir - want);
      const x0 = b2.x;
      const y0 = b2.y;
      g.step(1, 0);
      out.launchSpeed = Math.hypot(g.state.bullets[0].x - x0, g.state.bullets[0].y - y0);

      park();
      g.state.enemies.push({ id: 9501, kind: "small", x: 3, y: 10, hp: 1, age: 0, phase: 0, fireIn: 1, burst: 0, type: 0, angles: [0] });
      g.step(5, 0);
      const hadSeed = g.state.bullets.length;
      g.state.enemies = [];
      g.step(1, 0);
      out.seedGoesWithEnemy = [hadSeed, g.state.bullets.length];

      // A seed with no enemy under it, sitting on the ship: it must not hit.
      park();
      g.state.bullets.push({ id: 9050, x: 0, y: -8, dir: Math.PI, speed: 0.2, age: 0 });
      g.step(20, 0);
      out.seedDoesNotHit = [g.state.lives, g.state.bullets.length];

      park();
      bulletAt(100);
      bulletAt(100);
      g.state.bullets[1].x = 8;
      g.state.chain = 7;
      g.step(12, 0);
      out.livesAfterHit = g.state.lives;
      out.bulletsCleared = g.state.bullets.length;
      out.chainReset = g.state.chain;
      out.respawn = g.state.ship.respawn;

      bulletAt(100);
      g.state.bullets[0].y = -7.5;
      g.step(5, 0);
      out.invincibleLives = g.state.lives;
      g.step(60, 8);
      out.absentCannotMove = g.state.ship.x;
      g.step(20, 8);
      out.movesAfterReturn = g.state.ship.x > 0;
      g.state.bullets = [];
      g.step(300, 0);
      out.respawnOver = g.state.ship.respawn;

      park();
      g.state.lives = 0;
      bulletAt(100);
      g.step(12, 0);
      out.phase = g.state.phase;
      g.step(30, 0);
      g.step(1, 16);
      out.dismissLocked = [g.state.phase, g.state.dismissed];
      g.step(40, 0);
      g.step(1, 16);
      out.dismissed = [g.state.phase, g.state.dismissed];
      // The ship flies up into a bullet coming down: closing at 0.65 a frame
      // (ship 0.4, bullet 0.25), further than the bullet moves. From each of
      // eight starting gaps the bullet must hit. (A test of only the stretch
      // the bullet covered let the ship step over it more often than not.)
      out.headOn = [];
      for (let i = 0; i < 8; i++) {
        park();
        g.state.ship.respawn = 0;
        g.state.bullets.push({ id: 9000, x: 0, y: -8 + 4 + i * 0.08, dir: Math.PI, speed: 0.25, age: 100 });
        let missed = false;
        for (let t = 0; t < 12 && !missed; t++) {
          g.step(1, 1);
          missed = g.state.ship.respawn > 0;
        }
        out.headOn.push(missed);
      }
      // And passing well to the side of one still does not.
      park();
      g.state.ship.respawn = 0;
      g.state.bullets.push({ id: 9000, x: 0.6, y: -4, dir: Math.PI, speed: 0.25, age: 100 });
      g.step(12, 1);
      out.passBeside = g.state.ship.respawn;
      return out;
    });
    check("a ship flying into a bullet is hit, whatever the gap they started with", r.headOn, (v) => v.length === 8 && v.every(Boolean));
    check("a bullet passing 0.6 to the side (the ship is hit within 0.45) does not hit", r.passBeside, 0);
    check("firing creates one seed", r.seedCreated, 1);
    check("the seed stays on its enemy until it launches", r.seedRidesEnemy, (v) => v[0] === 0 && v[1] === 0 && v[2] === 22);
    check("a seed does not hit", r.seedDoesNotHit, (v) => v[0] === 2 && v[1] === 1);
    check("the bullet launches from the enemy's position", r.launchGap, (d) => d < 0.25);
    check("it is aimed at the ship from where it launches", r.aimError, (d) => d < 1e-3);
    // A small enemy's bullet: the unit speed times the small-fire factor (1.15).
    check("it flies at full speed from the first frame", r.launchSpeed, (d) => Math.abs(d - 0.161 * 1.6 * 1.15) < 1e-6);
    check("destroying the enemy removes its seed", r.seedGoesWithEnemy, (v) => v[0] === 1 && v[1] === 0);
    check("an armed bullet costs one ship", r.livesAfterHit, 1);
    check("a miss clears every bullet", r.bulletsCleared, 0);
    check("a miss resets the formation chain", r.chainReset, 0);
    check("the miss sequence lasts 300 frames", r.respawn, (n) => n > 285 && n <= 300);
    check("no second miss while invincible", r.invincibleLives, 1);
    check("the ship cannot move while absent", r.absentCannotMove, 0);
    check("the ship moves again after 72 frames", r.movesAfterReturn, true);
    check("invincibility ends", r.respawnOver, 0);
    check("a miss with no ships left ends the run", r.phase, "gameover");
    check("shot does nothing for the first 60 frames of game over", r.dismissLocked, (v) => v[0] === "gameover" && v[1] === false);
    check("after that a press of shot dismisses the game over, and the run is not started again", r.dismissed, (v) => v[0] === "gameover" && v[1] === true);
  },
};
