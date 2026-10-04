// Tests for the shared tools, run against tools/tests/fixture-game.
//   node --test tools/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { loadAdapter, runOne, summarize } from "../lib/game.mjs";
import { formatRunSummary, parseRunSummary } from "../lib/run-summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tools = path.resolve(here, "..");
const fixture = path.join(here, "fixture-game");
const tmp = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "tools-test-"));
const run = (script, ...args) => spawnSync(process.execPath, [path.join(tools, script), ...args], { encoding: "utf8" });

test("run summary round-trips and rejects other lines", () => {
  const line = formatRunSummary({ build: "02-x", progress: 7, score: 74200, timeS: 211.6, failures: { bomb: 2, wreck: 1, none: 0 } });
  assert.equal(line, "RUN v1 build=02-x progress=7 score=74200 time=212 fail=bomb:2,wreck:1");
  const p = parseRunSummary(`pasted: ${line}`);
  assert.deepEqual([p.build, p.progress, p.score, p.timeS, p.totalFailures], ["02-x", 7, 74200, 212, 3]);
  assert.equal(parseRunSummary("RUN v1 progress=1 score=0 time=3").totalFailures, 0);
  assert.throws(() => parseRunSummary("I reached wave 4"));
  assert.throws(() => parseRunSummary("RUN v1 progress=x score=0 time=3"));

  // The same line pasted as an encoded fragment or as a whole URL.
  const encoded = encodeURIComponent(line);
  for (const pasted of [encoded, `#${encoded}`, `file:///games/x/index.html#${encoded}`, `https://example.org/x/?a=1#${encoded}`]) {
    const q = parseRunSummary(pasted);
    assert.deepEqual([q.build, q.progress, q.score, q.timeS, q.failures], ["02-x", 7, 74200, 212, { bomb: 2, wreck: 1 }], pasted);
  }
  assert.ok(encoded.length < 150);
  assert.throws(() => parseRunSummary("#RUN%20v1%20progress=%E0%A4%A"));
});

test("a run summary written to the URL fragment in a browser can be pasted back", async (t) => {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)("playwright"));
  } catch {
    t.skip("playwright is not installed");
    return;
  }
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    t.skip("no headless browser available here");
    return;
  }
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(fixture, "index.html")).href);
    const line = formatRunSummary({ build: "03-campaign", progress: 7, score: 74200, timeS: 212, failures: { bomb: 2, wreck: 1 } });
    await page.evaluate((l) => window.__test.endRun(l), line);
    const url = page.url();
    assert.match(url, /^file:.*index\.html#RUN/);
    const back = parseRunSummary(url);
    assert.deepEqual([back.build, back.progress, back.score, back.timeS, back.totalFailures], ["03-campaign", 7, 74200, 212, 3]);
  } finally {
    await browser.close();
  }
});

test("runs are deterministic per seed and differ across seeds", () => {
  const adapter = loadAdapter(fixture);
  const a = runOne(adapter, adapter.policies.human.make(3), 3);
  const b = runOne(adapter, adapter.policies.human.make(3), 3);
  const c = runOne(adapter, adapter.policies.human.make(4), 4);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.fingerprint, c.fingerprint);
  const s = summarize([a, c]);
  assert.equal(s.runs, 2);
  assert.ok(s.usage_analysis.action_share.collect === 1);
  assert.ok(Math.abs(Object.values(s.usage_analysis.region_time_share).reduce((x, y) => x + y, 0) - 1) < 0.01);
});

test("ladder writes a report, and --compare detects identical and changed rules", () => {
  const a = path.join(tmp, "a.json");
  const b = path.join(tmp, "b.json");
  const first = run("ladder.mjs", fixture, "--seeds", "6", "--out", a);
  assert.equal(first.status, 0, first.stderr);
  const report = JSON.parse(readFileSync(a, "utf8"));
  assert.deepEqual(Object.keys(report.policies), ["idle", "survivor", "human", "strong"]);
  assert.ok(report.policies.strong.mean_score > report.policies.human.mean_score);
  assert.ok(report.policies.human.mean_score > report.policies.idle.mean_score);

  const same = run("ladder.mjs", fixture, "--seeds", "6", "--out", b, "--compare", a);
  assert.equal(same.status, 0);
  assert.match(same.stdout, /all 24 runs identical/);

  // A copy of the game with one rule changed must be reported as different.
  const changed = path.join(tmp, "changed-game");
  cpSync(fixture, changed, { recursive: true });
  const core = path.join(changed, "core.cjs");
  writeFileSync(core, readFileSync(core, "utf8").replace("st.score += 10;", "st.score += 11;"));
  const diff = run("ladder.mjs", changed, "--seeds", "6", "--out", b, "--compare", a);
  assert.equal(diff.status, 1);
  assert.match(diff.stdout, /runs differ/);

  const none = run("ladder.mjs", fixture, "--seeds", "2", "--seed-start", "100", "--out", b, "--compare", a);
  assert.equal(none.status, 1);
  assert.match(none.stdout, /nothing was checked/);
});

test("ladder never compares a report with itself", () => {
  // Baseline at the default output path, then a rule change, then --compare on that same path.
  const game = path.join(tmp, "self-compare-game");
  cpSync(fixture, game, { recursive: true });
  assert.equal(run("ladder.mjs", game, "--seeds", "4").status, 0);
  const baseline = path.join(game, "reports", "ladder.json");
  const original = readFileSync(baseline, "utf8");
  const core = path.join(game, "core.cjs");
  writeFileSync(core, readFileSync(core, "utf8").replace("st.score += 10;", "st.score += 11;"));

  const same = run("ladder.mjs", game, "--seeds", "4", "--compare", baseline);
  assert.equal(same.status, 2);
  assert.match(same.stderr, /same file/);
  assert.equal(readFileSync(baseline, "utf8"), original, "the baseline must not be overwritten");

  const other = run("ladder.mjs", game, "--seeds", "4", "--compare", baseline, "--out", path.join(tmp, "after.json"));
  assert.equal(other.status, 1);
  assert.match(other.stdout, /runs differ/);
});

test("audit reports the fixture's planted defects as signals and exits 0", () => {
  const a = path.join(tmp, "audit.json");
  run("ladder.mjs", fixture, "--seeds", "16", "--out", a);
  const r = run("audit.mjs", a);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /SIGNAL threat "dud" fires .* never hits/);
  assert.match(r.stdout, /SIGNAL survive-only \(survivor\) reaches the success state/);
  assert.doesNotMatch(r.stdout, /threat "bolt"/);
  const few = path.join(tmp, "few.json");
  run("ladder.mjs", fixture, "--seeds", "4", "--out", few);
  assert.match(run("audit.mjs", few).stdout, /NOTE {3}only 4 seeds/);
});

test("calibrate finds the skill that produced a report, on the build that was played", () => {
  const root = path.join(tmp, "cal-snaps");
  assert.equal(run("snapshot.mjs", fixture, "first", "--root", root).status, 0);
  const snap = path.join(root, "fixture-game", "01-first");
  const adapter = loadAdapter(fixture);
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
  const s = summarize(seeds.map((seed) => runOne(adapter, adapter.skillPolicy(0.5, seed), seed)));
  const failures = Math.round(Object.values(s.failures_per_run).reduce((x, y) => x + y, 0));
  const line = (build) => formatRunSummary({ build, progress: s.median_progress, score: s.median_score, timeS: 30, failures: { bolt: failures } });

  const r = run("calibrate.mjs", snap, "--summary", line("01-first"), "--seeds", "12");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /build: verified \(snapshot 01-first\)/);
  assert.match(r.stdout, /skill t=0\.50 over 12 seeds/);

  // A report naming another build, or a directory that is not a snapshot, is refused.
  const wrong = run("calibrate.mjs", snap, "--summary", line("07-other"), "--seeds", "12");
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /BUILD NOT VERIFIED: this directory is snapshot "01-first", but the report names build "07-other"/);
  const loose = run("calibrate.mjs", fixture, "--summary", line("01-first"), "--seeds", "12");
  assert.equal(loose.status, 1);
  assert.match(loose.stdout, /BUILD NOT VERIFIED: this directory is not a snapshot/);
  const forced = run("calibrate.mjs", fixture, "--summary", line("01-first"), "--seeds", "12", "--allow-unverified-build");
  assert.equal(forced.status, 0);
  assert.match(forced.stdout, /build: NOT VERIFIED/);

  assert.notEqual(run("calibrate.mjs", snap, "--summary", "no summary here").status, 0);
  assert.equal(run("calibrate.mjs", snap, "--summary", line("01-first"), "--metrics", "luck").status, 2);
});

test("calibrate does not name a skill when the metrics cannot tell policies apart", () => {
  // Every policy has the same progress and no failures; only the score differs.
  const game = path.join(tmp, "flat-game");
  cpSync(fixture, game, { recursive: true });
  const file = path.join(game, "tests", "adapter.cjs");
  writeFileSync(
    file,
    readFileSync(file, "utf8")
      .replace("progress: st.coins", "progress: 1")
      .replace("failures: st.hits ? { bolt: st.hits } : {}", "failures: {}"),
  );
  const top = "RUN v1 build=dev progress=1 score=1100 time=30";

  const flat = run("calibrate.mjs", game, "--summary", top, "--metrics", "progress,failures", "--allow-unverified-build");
  assert.equal(flat.status, 1, flat.stdout);
  assert.match(flat.stdout, /NOT IDENTIFIED: progress, failures are the same at every skill level/);
  assert.doesNotMatch(flat.stdout, /skill t=/);

  // With a metric that does separate them, the top score lands at the top of the axis, not at t=0.
  const byScore = run("calibrate.mjs", game, "--summary", top, "--metrics", "progress,failures,score", "--allow-unverified-build");
  assert.equal(byScore.status, 0, byScore.stdout);
  assert.match(byScore.stdout, /NOTE progress, failures did not vary with skill/);
  const m = /skill t(?:=| between )(\d\.\d\d)/.exec(byScore.stdout);
  assert.ok(m && +m[1] >= 0.7, byScore.stdout);
});

test("snapshot numbers builds and leaves out dotfiles and reports", () => {
  const game = path.join(tmp, "snap-game");
  cpSync(fixture, game, { recursive: true });
  writeFileSync(path.join(game, ".hidden"), "x");
  mkdirSync(path.join(game, "reports"));
  writeFileSync(path.join(game, "reports", "ladder.json"), "{}");
  const root = path.join(tmp, "snaps");
  assert.equal(run("snapshot.mjs", game, "first-playable", "--root", root).status, 0);
  const second = run("snapshot.mjs", game, "after-structure", "--root", root);
  assert.equal(second.status, 0, second.stderr);
  const made = readdirSync(path.join(root, "snap-game")).sort();
  assert.deepEqual(made, ["01-first-playable", "02-after-structure"]);
  const dir = path.join(root, "snap-game", made[0]);
  assert.ok(existsSync(path.join(dir, "core.cjs")));
  assert.ok(existsSync(path.join(dir, "tests", "adapter.cjs")));
  assert.ok(!existsSync(path.join(dir, ".hidden")));
  assert.ok(!existsSync(path.join(dir, "reports")));
  const manifest = JSON.parse(readFileSync(path.join(dir, "SNAPSHOT.json"), "utf8"));
  assert.ok(manifest.files.some((f) => f.path === "index.html" && /^[0-9a-f]{40}$/.test(f.sha1)));
  // The snapshot is itself runnable by the tools.
  assert.equal(run("ladder.mjs", dir, "--seeds", "2", "--out", path.join(tmp, "snap.json")).status, 0);
  assert.equal(run("snapshot.mjs", game, "Bad Label", "--root", root).status, 2);
});

test("check-done asks less of a slice than of a finished game", () => {
  const game = path.join(tmp, "done-game");
  cpSync(fixture, game, { recursive: true });
  const root = path.join(tmp, "done-snaps");
  const before = run("check-done.mjs", game, "--snapshots", root);
  assert.equal(before.status, 1);
  assert.match(before.stdout, /checked done-game as slice/);
  assert.match(before.stdout, /MISSING README\.md/);
  assert.match(before.stdout, /MISSING a snapshot of the first playable build/);
  assert.doesNotMatch(before.stdout, /REVISION_HISTORY\.md/, "a slice has no revision log yet");
  assert.match(run("check-done.mjs", game, "--stage", "finished", "--snapshots", root).stdout, /MISSING REVISION_HISTORY\.md/);
  assert.equal(run("check-done.mjs", game, "--stage", "polished").status, 2);

  // Wording and package.json are not checked: AGENTS.md does not prescribe how a game is tested.
  writeFileSync(path.join(game, "README.md"), "# 題名\n## 操作\n");
  run("snapshot.mjs", game, "first-playable", "--root", root);
  const slice = run("check-done.mjs", game, "--snapshots", root);
  assert.equal(slice.status, 0, slice.stdout);
  assert.match(slice.stdout, /nothing missing/);
  assert.match(slice.stdout, /ABSENT {2}reports\/ladder\.json/);
  assert.match(slice.stdout, /does not rate how promising/);

  // The same game is not yet finished: the revision log is still missing.
  assert.equal(run("check-done.mjs", game, "--stage", "finished", "--snapshots", root).status, 1);
  writeFileSync(path.join(game, "REVISION_HISTORY.md"), "意図: 避けて集める。\n");
  const finished = run("check-done.mjs", game, "--stage", "finished", "--snapshots", root);
  assert.equal(finished.status, 0, finished.stdout);
  assert.match(finished.stdout, /checked done-game as finished/);
});

test("shots captures scenes and writes a frame manifest", (t) => {
  const out = path.join(tmp, "shots");
  const r = run("shots.mjs", fixture, "--out", out, "--min-scale", "2");
  if (r.status !== 0 && /browserType\.launch|Executable doesn't exist|Cannot find module/.test(r.stderr + r.stdout)) {
    t.skip("no headless browser available here");
    return;
  }
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(existsSync(path.join(out, "plain.png")));
  assert.ok(existsSync(path.join(out, "clear-and-extend.png")));
  const m = JSON.parse(readFileSync(path.join(out, "frames.json"), "utf8"));
  assert.deepEqual(m.viewport, { w: 224, h: 256 });
  assert.equal(m.minScale, 2);
  assert.deepEqual(m.frames.map((f) => f.id), ["plain", "clear-and-extend"]);
  const overlap = m.frames[1].elements;
  assert.equal(overlap.length, 2);
  assert.ok(overlap.every((e) => e.kind === "text" && e.rect.length === 4 && typeof e.z === "number"));
  assert.equal(run("shots.mjs", fixture, "--out", out, "--scenes", "nope").status, 1);
});
