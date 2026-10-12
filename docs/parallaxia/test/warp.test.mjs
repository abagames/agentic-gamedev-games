// A WIDE section draws every formation's path out sideways, except a dive's.

import test from "node:test";
import assert from "node:assert/strict";
import { createSim, stepSim } from "../src/sim/sim.js";

test("warp: in a WIDE section a dive keeps its own width and its own speed; the rest are drawn out", () => {
  const sim = createSim({ seed: 7, startSector: 11 });
  const stretched = new Map(); // pattern -> how many stretches its formations were given
  const last = new Map();
  let fastestDive = 0;
  for (let t = 0; t < 9000; t++) {
    // Every section a WIDE one, and the ship out of the way.
    if (sim.stage.boss === 0) sim.stage.theme = "wide";
    sim.lives = 9;
    sim.ship.respawn = 250;
    sim.bullets = [];
    stepSim(sim, 0);
    for (const f of sim.formations) if (f.warp) stretched.set(f.pattern, f.warp.wide.length);
    for (const e of sim.enemies) {
      const f = sim.formations.find((x) => x.id === e.formation);
      if (!f || f.pattern !== "dive") continue;
      const was = last.get(e.id);
      if (was) fastestDive = Math.max(fastestDive, Math.hypot(e.x - was[0], e.y - was[1]));
      last.set(e.id, [e.x, e.y]);
    }
  }
  assert.equal(stretched.get("dive"), 0, "a dive was flown");
  assert.ok(fastestDive > 0.8 && fastestDive <= 0.91, `fastest step of a dive: ${fastestDive}`);
  const others = [...stretched].filter(([pattern]) => pattern !== "dive");
  assert.ok(others.length >= 5, `other patterns flown: ${others.length}`);
  assert.ok(others.every(([, n]) => n === 2), JSON.stringify(others));
});
