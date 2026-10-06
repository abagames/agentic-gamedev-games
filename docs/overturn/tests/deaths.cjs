// Were the strong player's lost balls avoidable? Rewind before each loss and search far wider than the bot does.
// node tests/deaths.cjs [seeds] [rewindTicks]
const OT = require('../core.js'), B = require('../bots.js');
const N = +process.argv[2] || 3, BACK = +process.argv[3] || 90, SURVIVE = 150;
let lost = 0, avoidable = 0; const hpAt = [];
for (let seed = 1; seed <= N; seed++) {
  const st = OT.create(seed), pol = B.policies[process.argv[4] || 'human'](seed), ring = []; let lostSoFar = 0;
  while (!st.over) {
    ring.push(OT.clone(st)); if (ring.length > BACK) ring.shift();
    OT.step(st, pol(st));
    if (Object.values(st.causes).reduce((a, b) => a + b, 0) > lostSoFar) { lostSoFar++;
      lost++; const from = ring[0]; hpAt.push(from.segs.reduce((a, h) => a + Math.max(0, h), 0));
      let r = seed * 977 + lost, found = false; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 4000 && !found; k++) { // random plans: a new input every 4-24 ticks
        const s = OT.clone(from); let dir = 0, hold = 0, alive = true;
        for (let t = 0; t < BACK + SURVIVE; t++) { if (hold-- <= 0) { dir = ((rnd() * 3) | 0) - 1; hold = 4 + ((rnd() * 20) | 0); } OT.step(s, { dir }); if (s.phase !== 'play' || s.stats.saves > from.stats.saves) { alive = false; break; } }
        if (alive) found = true;
      }
      if (found) avoidable++;
    }
  }
}
console.log((process.argv[4] || 'human') + ': balls lost', lost, '| a random search from', BACK, 'ticks earlier survives', avoidable, '| rim strength at the rewind point', hpAt.join(' '));
