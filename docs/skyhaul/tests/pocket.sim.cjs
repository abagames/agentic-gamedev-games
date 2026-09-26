// Safe-pocket probe: park an empty lander at the lowest point of each planet's terrain and idle.
// A pocket that keeps an idle lander alive indefinitely is a degenerate hiding place.
const SKY = require("../core.js");
const { CFG } = SKY;
for (const r of [1, 3, 5, 7]) {
  let alive = 0, t = 0;
  for (let s = 1; s <= 10; s++) {
    const g = SKY.createGame(s * 29);
    SKY.startRound(g, r);
    while (g.phase !== "play") SKY.step(g, {});
    let lowX = 20;
    for (let x = 20; x < CFG.W - 20; x++) if (SKY.groundUnder(g, x - 8, x + 8) > SKY.groundUnder(g, lowX - 8, lowX + 8)) lowX = x;
    const L = g.lander;
    L.x = lowX;
    L.y = SKY.groundUnder(g, lowX - 6, lowX + 6) - CFG.landerHalfH - 1;
    const lives = g.lives;
    let i = 0;
    for (; i < 90 * 60 && g.lives === lives; i++) {
      SKY.step(g, { dx: 0, dy: 1 });
      g.events.length = 0;
    }
    t += i / 60;
    if (g.lives === lives) alive++;
  }
  console.log(`round ${r} ${SKY.roundRules(r).planetName.padEnd(6)} idle-in-lowest-pocket: survived 90 s in ${alive}/10, mean time to first death ${(t / 10).toFixed(0)} s`);
}
