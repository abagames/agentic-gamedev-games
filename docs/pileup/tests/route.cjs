// node tests/route.cjs [seeds] [bot] — does the route matter? the same bot taking the nearest outward exit, the
// best-paying zone ('rich') or the lowest-paying ('safe'): wins, score, districts, cars lost
const S = require('../core.js'), B = require('../bots.js');
const n = +process.argv[2] || 8, bot = process.argv[3] || 'strong', extra = bot === 'skilled' ? { react: 4, horizon: 120, slip: 0.03 } : {};
for (const route of (process.argv[4] || ',rich,safe,any').split(',')) {
  let wins = 0, score = 0, dist = 0, deaths = 0, secs = 0, revisits = 0, maxs = 0; const zones = {};
  for (let seed = 1; seed <= n; seed++) {
    const st = S.create(seed), f = B[bot === 'skilled' ? 'human' : bot](seed, { ...extra, route: route || undefined });
    if (route) st.routePref = route;
    while (!st.over && !st.won && st.t < 60 * 1200) S.step(st, f(st));
    wins += st.won ? 1 : 0; revisits += st.route.length - new Set(st.route.map(String)).size; maxs = Math.max(maxs, st.t / 60); score += st.score; dist += st.stats.districts; deaths += st.stats.deaths; secs += st.t / 60;
    for (const [cx, cy] of st.route) { const z = S.districtAt(st, cx, cy).name; zones[z] = (zones[z] || 0) + 1; }
  }
  console.log(`${bot} route ${(route || 'nearest').padEnd(7)} wins ${wins}/${n} | score ${(score / n) | 0} | districts ${(dist / n).toFixed(1)} | cars lost ${(deaths / n).toFixed(1)} | ${(secs / n) | 0}s (max ${maxs | 0}) | revisits ${(revisits / n).toFixed(1)} | ${JSON.stringify(zones)}`);
}
