// Lock-on lasers: charge while shot is held, release when it is let go
// (docs/spec-draft.md §4).

export default {
  name: "lock-on: charge on hold, release on letting go",
  requires: ["middle", "lock"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const park = () => {
        // (CHAIN: the mode where the multiplier is the chain, so a kill with no chain pays its face value.)
        g.reset({ seed: 1, mode: "rapid" });
        g.state.stage.frozen = true;
      };
      const enemy = (kind, x, y, hp) =>
        g.state.enemies.push({ id: 9000 + g.state.enemies.length, kind, x, y, hp, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      // A middle enemy that the normal shot cannot reach (far off to the side
      // of the fan would still be hit, so give it plenty of health instead).
      const out = {};

      park();
      enemy("middle", 0, 6, 100000);
      g.step(9, 16);
      out.before10 = g.state.locks.length;
      g.step(1, 16);
      out.at10 = g.state.locks.length;
      g.step(60, 16);
      out.capped = g.state.locks.length;
      out.noLaserWhileHeld = g.state.lasers.length;
      const hp0 = g.state.enemies[0].hp;
      g.state.shots = [];
      g.step(1, 0);
      out.released = [g.state.locks.length, g.state.lasers.length, g.state.lasers[0].damage];
      g.step(40, 0);
      out.volleyDamage = hp0 - g.state.enemies[0].hp;
      out.lasersGone = g.state.lasers.length;

      park();
      enemy("middle", 0, 6, 100000);
      g.step(10, 16);
      const hp1 = g.state.enemies[0].hp;
      g.state.shots = [];
      g.step(40, 0);
      out.singleDamage = hp1 - g.state.enemies[0].hp;

      park();
      g.step(40, 0);
      enemy("middle", 0, 6, 100000);
      g.step(40, 0);
      out.noLockWithoutShot = g.state.locks.length;

      park();
      enemy("small", 0, 6, 100000);
      g.step(40, 16);
      out.smallNotLockable = g.state.locks.length;

      park();
      enemy("middle", 6, 6, 100000);
      g.step(40, 16);
      out.outOfColumn = g.state.locks.length;

      park();
      enemy("middle", 0, -12, 100000);
      g.step(40, 16);
      out.behindShip = g.state.locks.length;

      park();
      enemy("middle", 1, 10, 100000);
      enemy("middle", -1, 4, 100000);
      g.step(10, 16);
      out.nearestFirst = g.state.locks[0].target === g.state.enemies[1].id;

      park();
      enemy("middle", 0, 6, 100000);
      g.step(30, 16);
      g.state.enemies = [];
      g.step(1, 16);
      out.lockDropsWithTarget = g.state.locks.length;

      park();
      enemy("middle", 0, 6, 100000);
      g.step(30, 16);
      g.state.bullets.push({ id: 9900, x: 0, y: -7.5, dir: Math.PI, speed: 0.2, age: 100 });
      g.step(5, 16);
      out.missClearsLocks = [g.state.lives, g.state.locks.length, g.state.lasers.length];

      park();
      enemy("middle", 0, 6, 100000);
      g.step(40, 16);
      g.state.shots = [];
      const before = g.state.score;
      g.state.enemies[0].hp = 20;
      g.step(40, 0);
      out.laserKill = [g.state.enemies.length, g.state.score - before];
      return out;
    });
    check("no lock before 10 frames of holding shot", r.before10, 0);
    check("the first lock comes at 10 frames", r.at10, 1);
    check("at most 4 locks", r.capped, 4);
    check("no laser while shot is held", r.noLaserWhileHeld, 0);
    check("letting go turns 4 locks into 4 lasers of 17.5 each", r.released, (v) => v[0] === 0 && v[1] === 4 && v[2] === 17.5);
    check("a volley of 4 does 70 damage", r.volleyDamage, 70);
    check("lasers are spent on hitting", r.lasersGone, 0);
    check("a single laser does 7 damage", r.singleDamage, 7);
    check("no lock without holding shot", r.noLockWithoutShot, 0);
    check("small enemies cannot be locked", r.smallNotLockable, 0);
    check("no lock on an enemy outside the column ahead", r.outOfColumn, 0);
    check("no lock on an enemy behind the ship", r.behindShip, 0);
    check("the nearest enemy ahead is locked first", r.nearestFirst, true);
    check("a lock is dropped when its target is gone", r.lockDropsWithTarget, 0);
    check("a miss clears locks without firing them", r.missClearsLocks, (v) => v[0] === 1 && v[1] === 0 && v[2] === 0);
    check("a laser kill removes the enemy and scores 500", r.laserKill, (v) => v[0] === 0 && v[1] === 500);
  },
};
