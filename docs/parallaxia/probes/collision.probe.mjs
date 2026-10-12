// Running into an enemy (docs/spec-draft.md §9).

export default {
  name: "collision: an enemy's hull costs a ship, its wing tips do not",
  requires: ["enemy", "collision"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const park = () => {
        g.reset({ seed: 1 });
        g.state.stage.frozen = true;
      };
      // Tough enough to survive, and with no type it never fires.
      const enemy = (kind, x, y) =>
        g.state.enemies.push({ id: 9000 + g.state.enemies.length, kind, x, y, hp: 100000, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      const out = {};

      // The ship starts at (0, -8). A small enemy sinks onto it.
      park();
      enemy("small", 0, -7);
      g.step(1, 0);
      out.notYet = g.state.lives;
      g.step(4, 0);
      out.rammed = [g.state.lives, g.state.enemies.length, g.state.ship.respawn > 0];

      // Beside the hull but inside the box that shots hit.
      park();
      enemy("small", 0.9, -7.9);
      g.step(1, 0);
      out.smallWing = g.state.lives;
      park();
      enemy("middle", 1.0, -7);
      g.step(40, 0);
      out.middleWing = [g.state.lives, g.state.enemies[0].y < -8.5];
      park();
      enemy("large", 1.5, -7);
      g.step(60, 0);
      out.largeWing = [g.state.lives, g.state.enemies[0].y < -8.5];
      park();
      enemy("large", 1.0, -7);
      g.step(60, 0);
      out.largeHull = g.state.lives;
      park();
      enemy("middle", 0.6, -7);
      g.step(40, 0);
      out.middleHull = g.state.lives;

      // Flying into one counts the same as being run down.
      park();
      enemy("middle", 0, -5);
      g.step(8, 1);
      out.flewInto = g.state.lives;

      park();
      g.state.ship.respawn = 100;
      enemy("small", 0, -7.9);
      g.step(3, 0);
      out.invincible = g.state.lives;

      park();
      g.state.lives = 0;
      g.state.chain = 4;
      enemy("middle", 0, -7.5);
      g.step(3, 0);
      out.lastShip = [g.state.phase, g.state.lives, g.state.chain];
      g.step(120, 0);
      out.noMissAfterTheEnd = g.state.lives;
      return out;
    });
    check("no miss while the enemy is still above the ship", r.notYet, 2);
    check("the hull reaching the ship costs one ship, and the enemy stays", r.rammed, (v) => v[0] === 1 && v[1] === 1 && v[2]);
    check("a small enemy's wing tip does not", r.smallWing, 2);
    check("a middle enemy's wing passes over the ship", r.middleWing, (v) => v[0] === 2 && v[1]);
    check("a large enemy's wing passes over the ship", r.largeWing, (v) => v[0] === 2 && v[1]);
    check("a large enemy's hull costs a ship", r.largeHull, 1);
    check("a middle enemy's hull costs a ship", r.middleHull, 1);
    check("flying into an enemy costs a ship", r.flewInto, 1);
    check("no collision while invincible", r.invincible, 2);
    check("ramming with no ships left ends the run and the chain", r.lastShip, (v) => v[0] === "gameover" && v[1] === -1 && v[2] === 0);
    check("nothing is lost after the run has ended", r.noMissAfterTheEnd, -1);
  },
};
