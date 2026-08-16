// Is the game actually winnable, and is it winnable ONLY by using the mechanic?
// Runs the real course with three scripted drivers of increasing skill and reports
// how far each gets. This is the single most load-bearing test in the project:
// the whole difficulty curve is a claim about these three numbers.
//
// B9 (2026-08-11): this file used to contract on FIVE seeds and assert on individual
// runs. That basis provably could not distinguish tuning values — the B8 sweep found
// five different PACK_GAP settings that all passed the 5-seed gates while disagreeing
// on 32 and on 96 — and single-run gates flipped on unrelated changes. It now runs the
// SAME 32-seed basis as `scratchpad/sweep8w.mjs` (seed = 101 + 101*i, i = 0..31) and
// every gate asserts on a RATE or a MEAN over that basis. Each threshold below carries
// the measured value it was derived from and the headroom it leaves; nothing here is a
// 5-seed number carried across.
import * as S from '../src/spec.js';
import { Sim } from '../src/sim.js';
import { Course } from '../src/course.js';
import { makeDriver } from '../src/driver.js';

const DT = 1 / 60;
const MAX_STEPS = 60 * 60 * 12;   // 12 minutes of simulated time is a hard stop

// --- drivers -------------------------------------------------------------
// All three share ONE controller (src/driver.js, also used by the attract demo) and
// differ only in policy, so the table compares strategies rather than comparing three
// separately-written bots of accidentally different competence.
//   plain  — genuinely ignores the tow: drives the clean-air racing line, never boosts.
//   masher — genuinely mashes: chases the tow but dumps the gauge the moment it lights.
//   expert — holds the tow to a full gauge and releases from inside the deep zone.
const drivers = {
  plain: makeDriver({ useTow: false, release: 'none' }),
  masher: makeDriver({ useTow: true, release: 'asap' }),
  expert: makeDriver({ useTow: true, release: 'expert' }),
};

// --- harness -------------------------------------------------------------
function run(driverFn, seed) {
  const course = new Course(seed);
  const sim = new Sim(course, seed);
  let steps = 0;
  while (!sim.finished && !sim.gameOver && steps++ < MAX_STEPS) {
    sim.step(DT, driverFn(sim, course));
  }
  return {
    finished: sim.finished,
    leg: sim.leg,
    score: Math.floor(sim.score),
    chain: sim.stats.maxChain,
    chainScore: sim.stats.chainBaseScore + sim.stats.chainBonusScore,
    chainBase: sim.stats.chainBaseScore,
    chainBonus: sim.stats.chainBonusScore,
    rivalPasses: sim.stats.rivalPasses,
    trafficPasses: sim.stats.trafficPasses,
    trafficByLeg: [...sim.stats.trafficPassesByLeg],
    trafficScoreByLeg: [...sim.stats.trafficScoreByLeg],
    trafficAvailableByLeg: Array.from({ length: S.TOTAL_LEGS }, (_, i) => {
      const lo = i === 0 ? 0 : course.checkpoints[i - 1].z;
      const hi = course.checkpoints[i].z;
      return course.traffic.filter((t) => t.z >= lo && t.z < hi).length;
    }),
    deep: Math.round(sim.stats.deepMetres),
    spins: sim.stats.spins,
    releases: sim.stats.releases,
    bumps: sim.stats.bumps,
    avgVmax: sim.z / (steps * DT) / S.VMAX,
  };
}

// The wide basis. Identical generation to scratchpad/sweep8w.mjs, so a tuning value
// swept there is measured against exactly the seeds this contract judges it on.
const SEEDS = [];
for (let i = 0; i < 32; i++) SEEDS.push(101 + i * 101);
const N = SEEDS.length;

const table = {};
for (const [name, fn] of Object.entries(drivers)) {
  table[name] = SEEDS.map((s) => run(fn, s));
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};

// --- aggregates over the wide basis ---------------------------------------
const rows = (n) => table[n];
const rate = (n, p) => rows(n).filter(p).length / N;          // fraction of seeds
const cnt = (n, p) => rows(n).filter(p).length;
const mean = (n, k) => rows(n).reduce((a, r) => a + r[k], 0) / N;
const minOf = (n, k) => Math.min(...rows(n).map((r) => r[k]));
const maxOf = (n, k) => Math.max(...rows(n).map((r) => r[k]));
const pct = (n, k, p) => {                                     // percentile, nearest-rank-ish
  const v = rows(n).map((r) => r[k]).sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};
const finRate = (n) => rate(n, (r) => r.finished);

console.log(`\n  ${N} seeds (101 + 101*i), 3 drivers — rates and distributions, not single runs\n`);
console.log('  driver   finished   avg leg  avg Vmax  chain min/med/max  deep min/mean  spins mean/p90/max  rel mean/min');
for (const name of Object.keys(table)) {
  console.log(`  ${name.padEnd(8)} ${String(cnt(name, (r) => r.finished)).padStart(3)}/${N} ${(finRate(name) * 100).toFixed(0).padStart(4)}%  ${mean(name, 'leg').toFixed(1).padStart(6)}  ${mean(name, 'avgVmax').toFixed(3).padStart(8)}  ${`${minOf(name, 'chain')}/${pct(name, 'chain', 0.5)}/${maxOf(name, 'chain')}`.padStart(14)}  ${`${minOf(name, 'deep')}/${Math.round(mean(name, 'deep'))}`.padStart(13)}  ${`${mean(name, 'spins').toFixed(1)}/${pct(name, 'spins', 0.9)}/${maxOf(name, 'spins')}`.padStart(16)}  ${`${mean(name, 'releases').toFixed(1)}/${minOf(name, 'releases')}`.padStart(12)}`);
}
console.log('');

const sumLeg = (name, key, leg) => rows(name).reduce((n, r) => n + r[key][leg], 0);
console.log('  chain scoring after the one-boost-session revision');
console.log('  driver   score min/med/max       chain-score min/med/max   base mean  bonus mean  rival/traffic passes mean');
for (const name of Object.keys(table)) {
  console.log(`  ${name.padEnd(8)} ${`${minOf(name, 'score')}/${pct(name, 'score', 0.5)}/${maxOf(name, 'score')}`.padStart(23)}`
    + ` ${`${minOf(name, 'chainScore')}/${pct(name, 'chainScore', 0.5)}/${maxOf(name, 'chainScore')}`.padStart(29)}`
    + ` ${mean(name, 'chainBase').toFixed(0).padStart(10)} ${mean(name, 'chainBonus').toFixed(0).padStart(11)}`
    + ` ${`${mean(name, 'rivalPasses').toFixed(1)}/${mean(name, 'trafficPasses').toFixed(1)}`.padStart(25)}`);
}
const monoMax = Math.max(maxOf('plain', 'score'), maxOf('masher', 'score'));
const exploratoryRatio = maxOf('expert', 'score') / monoMax;
const meanExpertMasher = mean('expert', 'score') / mean('masher', 'score');
const meanChainExpertMasher = mean('expert', 'chainScore') / Math.max(1, mean('masher', 'chainScore'));
console.log(`  score separation: expert/masher mean ${meanExpertMasher.toFixed(3)}x; `
  + `chain-score mean ${meanChainExpertMasher.toFixed(3)}x; exploratory best / monotonous max ${exploratoryRatio.toFixed(3)}x`);
console.log('  expert traffic contribution by leg (available / passed / points across the same 32 seeds):');
console.log(`  ${Array.from({ length: S.TOTAL_LEGS }, (_, i) => `L${i + 1} ${sumLeg('expert', 'trafficAvailableByLeg', i)}/${sumLeg('expert', 'trafficByLeg', i)}/${sumLeg('expert', 'trafficScoreByLeg', i)}`).join('  ')}`);
console.log('');

// --- gates ----------------------------------------------------------------
// Every threshold below was read off the distribution printed above, measured on this
// 32-seed basis. "Headroom" is stated against the measured value, not against the old
// 5-seed one.

// Measured: expert finishes 32/32 = 100%. The 96-seed basis (scratchpad/plaincheck.mjs,
// see Done) put the expert at 87-91/96 = 91-95%, so the true rate is a little under 100%
// and the gate is set below BOTH: 80% = 26/32, i.e. six seeds may go wrong before this
// fails. Headroom: 20 points / 6 seeds.
ok('an expert driver can finish the run',
  finRate('expert') >= 0.80,
  `${cnt('expert', (r) => r.finished)}/${N} = ${(finRate('expert') * 100).toFixed(0)}% (gate >= 80%)`);

// Measured: plain finishes 0/32 = 0%. Not asserted as an exact zero: on 96 seeds the plain
// driver does squeak home 2-4 times (2-4%), so an exact-zero gate on 32 seeds would be a
// coin-flip against a known non-zero rate. Gate 6% = at most 2 of 32. Headroom: 2 seeds.
ok('a driver who ignores the mechanic cannot finish',
  finRate('plain') <= 0.06,
  `${cnt('plain', (r) => r.finished)}/${N} = ${(finRate('plain') * 100).toFixed(0)}% (gate <= 6%), avg leg ${mean('plain', 'leg').toFixed(1)}`);

// Measured: masher 4/32 = 12.5% vs expert 100% — a 87.5-point gap. The old gate was a raw
// `<` between two counts of five, which a single seed could invert (and did: the masher
// went 0/5 -> 2/5 on the contract seeds with no rate change at all). Gate: the gap must be
// at least 35 points AND the masher must stay under 40%. Headroom: 52.5 points on the gap,
// 27.5 points on the level.
ok('mashing the button is not a substitute for holding the tow',
  finRate('expert') - finRate('masher') >= 0.35 && finRate('masher') <= 0.40,
  `masher ${(finRate('masher') * 100).toFixed(0)}% vs expert ${(finRate('expert') * 100).toFixed(0)}%, gap ${((finRate('expert') - finRate('masher')) * 100).toFixed(0)} pts (gate >= 35 pts, masher <= 40%)`);

// Measured: the plain driver reaches leg 8 (the last leg) on 32/32 seeds — it runs out of
// clock ON the final leg rather than being walled early, which is exactly the intended
// shape. NOTE: this statistic has zero variance on the current build, so the gate is a
// tripwire for a future regression rather than a discriminating measurement; it is stated
// as a rate anyway so a partial collapse (some seeds walling at leg 2-3) is caught.
// Gate: >= 90% of seeds reach leg 4. Headroom: 10 points / 3 seeds, plus 4 legs of depth.
ok('the plain driver still gets a decent way in (not a wall at leg 1)',
  rate('plain', (r) => r.leg >= 4) >= 0.90,
  `${(rate('plain', (r) => r.leg >= 4) * 100).toFixed(0)}% of seeds reach leg 4 (gate >= 90%), mean leg ${mean('plain', 'leg').toFixed(1)}`);

// Measured: expert deep-zone metres min 2675, mean 3536 over 32 seeds. The old gate was
// "> 800 m on every run", which the PLAIN driver nearly satisfies by accident (its max is
// 872 m — a car that never boosts still drifts through slipstreams), so 800 never actually
// tested "uses the tow". Gate raised to 1500 m — above the masher's maximum (1497 m) and
// almost double the plain driver's — required on >= 95% of seeds. Headroom: the worst
// expert seed is 1.8x the threshold, and 100% vs a 95% gate leaves 1 seed.
ok('the expert actually uses the tow',
  rate('expert', (r) => r.deep >= 1500) >= 0.95,
  `${(rate('expert', (r) => r.deep >= 1500) * 100).toFixed(0)}% of seeds >= 1500 m deep (gate >= 95%), min ${minOf('expert', 'deep')} m, mean ${Math.round(mean('expert', 'deep'))} m`);

// Under the one-boost-session definition, expert maxChain min 6, median 8, max 12 on this
// worktree — every one of the 32 seeds still chains, but no run-wide carry is possible.
// The old gate was `some run has chain >= 2`, satisfiable by one lucky seed out of five.
// Gate: >= 90% of seeds must reach a chain of 3. Headroom: 10 points, and the worst seed
// is at double the chain length asked for.
ok('slingshot chains happen',
  rate('expert', (r) => r.chain >= 3) >= 0.90,
  `${(rate('expert', (r) => r.chain >= 3) * 100).toFixed(0)}% of seeds chain >= 3 (gate >= 90%), min ${minOf('expert', 'chain')}, median ${pct('expert', 'chain', 0.5)}, max ${maxOf('expert', 'chain')}`);

// MARGINAL GATE #1. Measured: expert spins max = 12 on this basis (seed 808), p90 = 8.
// The old assertion was `every run <= 12` — i.e. it was sitting EXACTLY on its threshold
// with ZERO headroom, one spin away from failing, and it only looked safe on the 5 contract
// seeds (max 7 there). In rate form: at most 10% of seeds (3 of 32) may exceed 12 spins.
// Measured 0% exceed, so headroom is 3 seeds — but the ceiling itself is still touched, and
// a p90 tripwire at 10 (measured 8) is asserted with it so a general drift upward is caught
// before the worst seed alone moves.
ok('no driver is wrecked constantly (spins are rare)',
  rate('expert', (r) => r.spins > 12) <= 0.10 && pct('expert', 'spins', 0.9) <= 10,
  `${cnt('expert', (r) => r.spins > 12)}/${N} seeds over 12 spins (gate <= 10%), p90 ${pct('expert', 'spins', 0.9)} (gate <= 10), max ${maxOf('expert', 'spins')}`);

// MARGINAL GATE #2. B2's real acceptance: spin recovery must stop dominating the average
// speed. Measured mean spins 5.75 (sd 2.30, standard error 0.41 over 32 seeds). Gate kept
// at 7.0 — that is 1.25 spins / 18% of headroom, or about 3.1 standard errors, the tightest
// margin of any gate here. The crude bang-bang bots spun 15-22 times a run. On the 5-seed
// basis this read 6.0 vs 7.0 and looked like a 14%-headroom pass on a sample of five; the
// wide basis says the margin is real but small, and this is the gate most likely to be the
// first to fail on a physics change.
ok('spin recovery does not dominate the run',
  mean('expert', 'spins') <= 7.0,
  `mean spins ${mean('expert', 'spins').toFixed(2)} (gate <= 7.00, sd ${(Math.sqrt(rows('expert').reduce((a, r) => a + (r.spins - mean('expert', 'spins')) ** 2, 0) / (N - 1))).toFixed(2)})`);

// Measured: expert releases mean 14.50 (sd 1.74), min 11 over 32 seeds. Two-sided in rate
// form: the mean must clear 10 (headroom 4.5 releases / 31%) AND >= 90% of individual seeds
// must spend the gauge at least 8 times (measured 100%, min 11 — headroom 3 releases on the
// worst seed and 10 points on the rate).
ok('the expert spends the gauge often enough for the payoff to be measurable',
  mean('expert', 'releases') >= 10 && rate('expert', (r) => r.releases >= 8) >= 0.90,
  `mean releases ${mean('expert', 'releases').toFixed(2)} (gate >= 10), ${(rate('expert', (r) => r.releases >= 8) * 100).toFixed(0)}% of seeds >= 8 (gate >= 90%), min ${minOf('expert', 'releases')}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
