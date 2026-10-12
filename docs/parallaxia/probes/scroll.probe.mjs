// Sideways scrolling, and off-screen enemies holding their fire
// (docs/spec-draft.md §2).

const near = (expected, eps = 1e-3) => (actual) => Math.abs(actual - expected) < eps;

export default {
  name: "scroll: the view follows the ship; off-screen enemies do not fire",
  requires: ["scroll"],
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
      const enemy = (kind, x, fireIn) =>
        g.state.enemies.push({ id: 9000 + g.state.enemies.length, kind, x, y: 12, hp: 100000, age: 0, phase: 0, fireIn, burst: 0, type: kind === "small" ? 0 : 1, angles: [0] });
      const out = {};

      park();
      out.startView = g.state.viewX;
      g.step(1, 8);
      out.lags = g.state.viewX < g.state.ship.x * 0.24;
      g.step(120, 8);
      out.rightEdge = [g.state.ship.x, g.state.viewX, g.state.ship.x - g.state.viewX];
      g.step(200, 4);
      out.leftEdge = [g.state.ship.x, g.state.viewX];
      g.step(200, 1);
      out.verticalDoesNotScroll = g.state.viewX;

      // Ship at the far left: the view shows x from -14 to 8.
      park();
      g.step(200, 4);
      enemy("small", 9.5, 3);
      enemy("small", -9.5, 3);
      g.step(10, 4);
      out.firedOnScreenOnly = g.state.bullets.map((b) => Math.sign(b.x));
      out.offscreenClockHeld = g.state.enemies[0].fireIn;

      // Coming back: the same enemy fires once the view reaches it.
      g.state.bullets = [];
      g.state.enemies[1].fireIn = 1e9;
      g.step(40, 8);
      out.firesWhenReached = g.state.bullets.length;

      // A burst in progress stops while its enemy is off screen.
      park();
      enemy("middle", 9.5, 1);
      g.step(8, 0);
      const duringBurst = g.state.bullets.length;
      g.step(200, 4);
      const afterLeaving = g.state.bullets.length + 0;
      const burstLeft = g.state.enemies[0].burst;
      g.step(60, 4);
      out.burst = [duringBurst > 0, burstLeft > 0, g.state.enemies[0].burst === burstLeft];
      return out;
    });
    check("the view starts centred", r.startView, 0);
    check("the view eases after the ship", r.lags, true);
    check("ship at the right wall: ship 12.5, view 3, 9.5 from the screen centre", r.rightEdge, (v) => v[0] === 12.5 && near(3)(v[1]) && near(9.5)(v[2]));
    check("ship at the left wall: view -3", r.leftEdge, (v) => v[0] === -12.5 && near(-3)(v[1]));
    check("moving up does not scroll", r.verticalDoesNotScroll, near(-3));
    check("only the on-screen enemy fired", r.firedOnScreenOnly, (v) => v.length === 1 && v[0] === -1);
    check("an off-screen enemy's firing clock does not run", r.offscreenClockHeld, 3);
    check("it fires once the view reaches it", r.firesWhenReached, (n) => n >= 1);
    check("a burst pauses while its enemy is off screen", r.burst, (v) => v[0] && v[1] && v[2]);
  },
};
