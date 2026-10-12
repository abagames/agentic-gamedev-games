// Ship movement and the normal shot (docs/spec-draft.md §3, §4).

const near = (expected, eps = 1e-6) => (actual) => Math.abs(actual - expected) < eps;

export default {
  name: "ship: move, shot",
  requires: ["move", "shot"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const park = () => {
        g.reset({ seed: 1 });
        g.state.stage.frozen = true;
      };
      const out = {};
      park();
      out.start = [g.state.ship.x, g.state.ship.y];
      g.step(10, 8);
      out.right10 = g.state.ship.x;
      g.step(60, 8);
      out.rightEdge = g.state.ship.x;
      park();
      g.step(60, 4 | 2);
      out.leftDownEdge = [g.state.ship.x, g.state.ship.y];
      park();
      g.step(1, 1 | 8);
      out.diagonal = [g.state.ship.x, g.state.ship.y + 8];
      park();
      g.step(1, 8 | 4);
      out.rightBeatsLeft = g.state.ship.x;
      park();
      g.step(3, 8 | 32);
      out.oldSlowBitIgnored = [g.state.ship.x, g.state.input];

      park();
      g.step(5, 0);
      out.noShotWithoutKey = g.state.shots.length;
      g.step(1, 16);
      out.firstFrame = g.state.shots.length;
      g.step(2, 16);
      out.thirdFrame = g.state.shots.length;
      g.step(1, 16);
      out.fourthFrame = g.state.shots.length;
      park();
      g.step(10, 16);
      out.shotXs = g.state.shots.map((s) => Math.round((s.x - g.state.ship.x) * 1000) / 1000);
      const ys = g.state.shots.map((s) => s.y);
      g.step(1, 0);
      out.shotMoves = g.state.shots.map((s, i) => [Math.round((s.y - ys[i]) * 1000) / 1000, Math.round((s.x - g.state.ship.x) * 1000) / 1000]);
      // From the start position a shot takes 23 frames to leave the field, so
      // the fifth has to wait for the first.
      park();
      g.step(22, 16);
      out.cap = g.state.shots.length;
      g.step(3, 16);
      out.afterOneLeft = [g.state.shots.length, Math.max(...g.state.shots.map((s) => s.y)) < 15];
      // Close under the top edge the shots leave at once, and the interval rules.
      park();
      g.state.ship.y = 13;
      g.step(60, 16);
      out.nearFireCount = g.state.ship.fireCount;
      // One shot against a wide enemy: a single hit. A middle enemy's box is
      // 2.0 to either side, so the shot reaches it up to 3.2 away.
      const middle = (x) => g.state.enemies.push({ id: 9000, kind: "middle", x, y: -5, hp: 100, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      const oneShot = (x) => {
        park();
        middle(x);
        g.step(1, 16);
        g.step(5, 0);
        return [100 - g.state.enemies[0].hp, g.state.shots.length];
      };
      out.oneHit = oneShot(0);
      out.reach = [oneShot(3.1)[0], oneShot(3.3)[0]];
      // Letting go and pressing again is no faster than holding.
      park();
      for (let i = 0; i < 12; i++) g.step(1, i % 2 === 0 ? 16 : 0);
      out.mashed = g.state.ship.fireCount;
      park();
      g.step(60, 16);
      g.step(40, 0);
      out.goneOffscreen = g.state.shots.length;
      // A shot flies a whole unit a frame, and a small enemy is 0.9 tall. A
      // small enemy standing still at every height from the ship's, in steps
      // of a twentieth: no shot may step over it.
      const through = [];
      for (let k = 0; k < 20; k++) {
        g.reset({ seed: 1, mode: "rapid" });
        const st = g.state;
        st.stage.frozen = true;
        st.ground.nextIn = 1e9;
        st.enemies.push({ id: 9000, kind: "small", x: 0, y: -2 + k / 20, hp: 1e9, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [], formation: 0, flight: null });
        // (No flight: it would sink and sway. Hold it where it is.)
        let hits = 0;
        let fired = 0;
        for (let t = 0; t < 60; t++) {
          st.enemies[0].x = 0;
          st.enemies[0].y = -2 + k / 20;
          g.step(1, 16);
          hits += st.events.filter((e) => e.type === "hit").length;
          fired += st.events.filter((e) => e.type === "shot").length;
        }
        through.push([hits, fired]);
      }
      out.through = through;
      // The same for the thinnest thing on the ground, a panel.
      g.reset({ seed: 1, mode: "rapid" });
      const sg = g.state;
      sg.stage.frozen = true;
      sg.ground.nextIn = 1e9;
      sg.ground.islands = [{ id: 8000, x: 0, y: -2.53, cols: 1, rows: 1, cells: [[true]], kind: "row", look: 0 }];
      sg.ground.targets = [{ id: 8001, island: 8000, kind: "wall", ox: 0, oy: 0, x: 0, y: 0, hp: 4, look: 0 }];
      g.step(1, 16);
      g.step(12, 0);
      out.groundOnce = [sg.ground.targets[0].hp, sg.shots.length];
      return out;
    });
    check("starts at (0, -8)", r.start, (v) => v[0] === 0 && v[1] === -8);
    check("10 frames right at the normal mode's speed, 0.4, moves 4.0", r.right10, near(4));
    check("stops 1.5 inside the right edge", r.rightEdge, 12.5);
    check("stops 1.5 inside the left and bottom edges", r.leftDownEdge, (v) => v[0] === -12.5 && v[1] === -14.5);
    check("diagonal movement is 0.707 per axis", r.diagonal, (v) => near(0.4 * 0.707)(v[0]) && near(0.4 * 0.707)(v[1]));
    check("right wins over left when both are held", r.rightBeatsLeft, near(0.4));
    check("there is no slow: the old slow bit is dropped", r.oldSlowBitIgnored, (v) => near(1.2)(v[0]) && v[1] === 8);
    check("no shot steps over a small enemy that stands still, whatever height it stands at (all but the shots still in flight at the end hit)", r.through, (v) => v.every(([hits, fired]) => fired >= 15 && hits >= fired - 2));
    check("a shot that reaches a ground target hits it once and is spent", r.groundOnce, (v) => v[0] === 3 && v[1] === 0);
    check("no shots without the shot key", r.noShotWithoutKey, 0);
    check("the first shot leaves on the first frame held", r.firstFrame, 1);
    check("the next one 3 frames later", [r.thirdFrame, r.fourthFrame], (v) => v[0] === 1 && v[1] === 2);
    check("every shot leaves from the centre of the ship", r.shotXs, (xs) => xs.length === 4 && xs.every((x) => x === 0));
    check("every shot flies straight up at speed 1", r.shotMoves, (m) => m.every((v) => v[0] === 1 && v[1] === 0));
    check("a shot is one hit of 1 damage, however wide the enemy", r.oneHit, (v) => v[0] === 1 && v[1] === 0);
    check("it reaches an enemy whose box is within 1.2 of its centre (0.5 + 0.7)", r.reach, (v) => v[0] === 1 && v[1] === 0);
    check("no shot is fired while 4 are on screen", r.cap, 4);
    check("the next leaves as soon as one is gone", r.afterOneLeft, (v) => v[0] === 4 && v[1]);
    check("near the top edge the ship fires 20 shots a second", r.nearFireCount, 20);
    check("mashing shot is slower than holding it (3 shots in 12 frames, not 4)", r.mashed, 3);
    check("shots leave the field", r.goneOffscreen, 0);
  },
};
