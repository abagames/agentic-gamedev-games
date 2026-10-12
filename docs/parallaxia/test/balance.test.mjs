import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, verdict } from "../tools/lib/balance.mjs";
import { holdWins, skillWins, zeroBaseline } from "./fixtures/toy-sims.mjs";

const opts = { seeds: [1, 2, 3], maxTicks: 1800, variants: 6 };

test("balance: varied play beating every monotonous policy passes", () => {
  const report = evaluate(skillWins, opts);
  assert.ok(report.exploratory_ratio > 1.5, `ratio ${report.exploratory_ratio}`);
  assert.equal(report.verdict, "pass");
});

test("balance harness fails a game where holding shot is optimal", () => {
  const report = evaluate(holdWins, opts);
  assert.ok(report.exploratory_ratio <= 1.0, `ratio ${report.exploratory_ratio}`);
  assert.equal(report.verdict, "fail");
});

test("balance: a zero monotonous score gives an undefined ratio, not a pass", () => {
  const report = evaluate(zeroBaseline, opts);
  assert.equal(report.monotonous.max_score, 0);
  assert.equal(report.exploratory_ratio, null);
  assert.equal(report.verdict, "undefined");
  assert.ok(report.ratio_note);
});

test("balance: report follows the log contract's top-level shape", () => {
  const report = evaluate(skillWins, opts);
  for (const key of ["version", "run_config", "monotonous", "exploratory", "exploratory_ratio", "telemetry", "profile_results"]) {
    assert.ok(key in report, key);
  }
  for (const key of ["no_input", "hold_shot", "spam_shot", "pulse_shot", "hug_wall_shot", "hold_up_shot"]) {
    assert.ok(key in report.monotonous.cases, key);
  }
  assert.equal(report.run_config.policy_profiles.human_limited.profile, "human-limited");
});

test("balance: the human-limited policy cannot change inputs faster than a person", () => {
  const report = evaluate(skillWins, opts);
  const human = report.profile_results.human_limited;
  assert.ok(human.max_input_changes_per_s <= 4, `changes/s ${human.max_input_changes_per_s}`);
  assert.ok(human.mean_score < report.exploratory.best.score);
});

test("balance: verdict thresholds", () => {
  assert.equal(verdict(1.0), "fail");
  assert.equal(verdict(1.3), "needs_work");
  assert.equal(verdict(1.6), "pass");
});
