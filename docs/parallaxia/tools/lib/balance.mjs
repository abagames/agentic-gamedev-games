// Policy comparison harness. Produces a report in the evaluating-gameplay-balance
// log contract. It detects degenerate play (a monotonous input scoring as well
// as varied play); it says nothing about whether the game is fun.
//
// A game adapter is { createSim, stepSim, getScore, isEnded, capabilities,
// observe?, fps }.

import { monotonous, randomSegments, seeker, humanLimited, HUMAN_DEFAULTS } from "../policies/index.mjs";

export function runPolicy(adapter, policy, { seed, variant = 0, maxTicks }) {
  const sim = adapter.createSim({ seed });
  const decide = policy.create({ seed, variant });
  let tick = 0;
  let changes = 0;
  let last = 0;
  while (tick < maxTicks && !adapter.isEnded(sim)) {
    const obs = adapter.observe ? adapter.observe(sim) : null;
    const bits = decide(obs, tick);
    if (bits !== last) changes++;
    last = bits;
    adapter.stepSim(sim, bits);
    tick++;
  }
  return {
    score: adapter.getScore(sim),
    elapsed: tick / adapter.fps,
    ended: adapter.isEnded(sim),
    input_changes_per_s: changes / Math.max(tick / adapter.fps, 1e-9),
  };
}

export function verdict(ratio) {
  if (ratio === null) return "undefined";
  if (ratio <= 1.0) return "fail";
  if (ratio <= 1.5) return "needs_work";
  return "pass";
}

export function evaluate(
  adapter,
  { seeds = [2001, 2002, 2003], maxTicks = 3600, variants = 8, humanParams = HUMAN_DEFAULTS } = {}
) {
  const cases = {};
  for (const [name, policy] of Object.entries(monotonous)) {
    let best = null;
    for (const seed of seeds) {
      const r = runPolicy(adapter, policy, { seed, maxTicks });
      if (best === null || r.score > best.score) best = r;
    }
    cases[name] = best;
  }
  const maxScore = Math.max(...Object.values(cases).map((c) => c.score));

  // State-reading policies only make sense when the game exposes observe().
  const explorers = adapter.observe ? [randomSegments, seeker] : [randomSegments];
  let best = null;
  for (const policy of explorers) {
    for (const seed of seeds) {
      for (let variant = 0; variant < variants; variant++) {
        const r = runPolicy(adapter, policy, { seed, variant, maxTicks });
        if (best === null || r.score > best.result.score) best = { result: r, seed, variant, policy };
      }
    }
  }

  const human = humanLimited(best.policy, humanParams, adapter.fps);
  const humanRuns = [];
  for (const seed of seeds) {
    for (let variant = 0; variant < variants; variant++) {
      humanRuns.push(runPolicy(adapter, human, { seed, variant, maxTicks }));
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // Convention when no monotonous policy scores at all: the ratio is undefined
  // (null), not infinite; the report says so.
  const ratio = maxScore > 0 ? best.result.score / maxScore : null;

  return {
    version: "1.0",
    run_config: {
      seed_set: seeds,
      fixed_dt: 1 / adapter.fps,
      max_ticks: maxTicks,
      policy_budget: `${variants} variants per seed`,
      input_schema: {
        move: { type: "bits", values: ["UP", "DOWN", "LEFT", "RIGHT"], neutral: 0 },
        shot: { type: "boolean", timing: ["held", "released"] },
      },
      visible_state_schema: adapter.observe ? ["adapter.observe()"] : [],
      policy_visibility: { monotonous: [], random_segments: [], seeker: adapter.observe ? ["adapter.observe()"] : [] },
      policy_profiles: {
        exploratory: { profile: best.policy.profile, policy: best.policy.name },
        human_limited: { profile: "human-limited", params: humanParams },
      },
    },
    monotonous: { cases, max_score: maxScore, max_case: Object.keys(cases).find((k) => cases[k].score === maxScore) },
    exploratory: { best: best.result, best_seed: best.seed, best_variant: best.variant, best_policy: best.policy.name },
    exploratory_ratio: ratio,
    ratio_note: ratio === null ? "monotonous.max_score is 0, so the ratio is undefined" : undefined,
    verdict: verdict(ratio),
    telemetry: {
      death_analysis: {},
      spawn_analysis: {},
      scoring_analysis: {},
      input_analysis: { exploratory_input_changes_per_s: best.result.input_changes_per_s },
      usage_analysis: {},
    },
    profile_results: {
      human_limited: {
        mean_score: mean(humanRuns.map((r) => r.score)),
        mean_elapsed: mean(humanRuns.map((r) => r.elapsed)),
        max_input_changes_per_s: Math.max(...humanRuns.map((r) => r.input_changes_per_s)),
      },
    },
  };
}
