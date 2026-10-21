// Tests for the review kit (tools/review/review.js) and the tools that read its zips:
// replay.mjs, replay-stats.mjs, calibrate.mjs --zip, check-done.mjs and review-kit.mjs.
// Browser tests drive tools/tests/fixture-game/play.html with real key events
// and skip when Playwright or a headless browser is not available.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAdapter } from "../lib/game.mjs";
import { makeZip, readZip } from "../lib/zip.mjs";
import { formatRunSummary } from "../lib/run-summary.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tools = path.resolve(here, "..");
const fixture = path.join(here, "fixture-game");
const tmp = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "review-test-"));
const run = (script, ...args) => spawnSync(process.execPath, [path.join(tools, script), ...args], { encoding: "utf8" });

// A copy of the fixture with the kit installed, and a snapshot of it: what a person is handed.
function handover(name) {
  const game = path.join(tmp, name, "fixture-game");
  cpSync(fixture, game, { recursive: true });
  const kit = run("review-kit.mjs", game);
  assert.equal(kit.status, 0, kit.stdout + kit.stderr);
  const root = path.join(tmp, name, "snapshots");
  assert.equal(run("snapshot.mjs", game, "review", "--root", root).status, 0);
  return { game, snap: path.join(root, "fixture-game", "01-review") };
}

// A run played by a policy, recorded the way the kit records one: inputs by the step they
// apply from, and a hash every 60 ticks and at the end.
function record(adapter, policyName, seed) {
  const st = adapter.create(seed);
  const policy = adapter.policies[policyName].make(seed);
  const inputs = [], hashes = [];
  let last = null, t = 0;
  while (!adapter.ended(st)) {
    const input = policy(st) || {};
    const s = JSON.stringify(input);
    if (s !== last) { inputs.push([t, JSON.parse(s)]); last = s; }
    adapter.step(st, input);
    t++;
    if (t % 60 === 0) hashes.push([t, adapter.hash(st)]);
  }
  const r = adapter.result(st);
  const summary = formatRunSummary({ build: "dev", progress: r.progress, score: r.score, timeS: t / 60, failures: r.failures });
  return { seed, ticks: t, inputs, hashes, end: { tick: t, hash: adapter.hash(st) }, summary };
}

function sessionZip(file, runs, { build = "01-review", level = "replay" } = {}) {
  const entries = [];
  const session = { kit: 3, slug: "fixture-game", build, buildConstant: "dev", buildSource: "snapshot", level, runs: [] };
  runs.forEach((r, i) => {
    const replay = `replays/run-${i + 1}.json`;
    entries.push({ name: replay, data: JSON.stringify({ kit: 3, slug: "fixture-game", build, run: i + 1, level, seed: r.seed, ticks: r.ticks, inputs: r.inputs, hashes: r.hashes, end: r.end, events: [], summary: r.summary, ended: true, abandoned: false }) });
    session.runs.push({ run: i + 1, startedAt: "2026-10-17T10:0" + i + ":00.000Z", seed: r.seed, ticks: r.ticks, summary: r.summary, ended: true, abandoned: false, replay });
  });
  entries.unshift({ name: "session.json", data: JSON.stringify(session) });
  writeFileSync(file, makeZip(entries));
  return file;
}

test("the zip writer and reader round-trip, and a damaged entry is refused", () => {
  const bin = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
  const bytes = makeZip([{ name: "session.json", data: '{"a":"é"}' }, { name: "bin/x", data: bin }]);
  const files = readZip(bytes);
  assert.equal(files.get("session.json").toString("utf8"), '{"a":"é"}');
  assert.deepEqual([...files.get("bin/x")], [...bin]);
  assert.deepEqual(makeZip([{ name: "a", data: "x" }]), makeZip([{ name: "a", data: "x" }]), "equal input gives equal bytes");
  const broken = Buffer.from(bytes);
  broken[broken.indexOf("é") + 1] ^= 1;
  assert.throws(() => readZip(broken), /checksum/);
  assert.throws(() => readZip(Buffer.from("not a zip")), /not a zip/);
});

test("replay checks every recorded hash and reports an altered input as a desynchronisation", () => {
  const { snap } = handover("replay");
  const adapter = loadAdapter(snap);
  const a = record(adapter, "human", 5);
  const b = record(adapter, "strong", 6);
  const zip = sessionZip(path.join(tmp, "replay.zip"), [a, b]);
  const ok = run("replay.mjs", zip, snap);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /build: verified \(snapshot 01-review\)/);
  const checks = (r) => new Set([...r.hashes.map(([t]) => t), r.end.tick]).size;
  assert.match(ok.stdout, new RegExp(`run 1: started 2026-10-17T10:00:00.000Z, .*\\n.*\\n  replayed, ${checks(a)} hash\\(es\\) match`));
  assert.match(ok.stdout, new RegExp(`run 2: .*\\n.*\\n  replayed, ${checks(b)} hash\\(es\\) match`));

  // One input changed in the second run: its later hashes no longer match.
  const altered = structuredClone(b);
  const i = altered.inputs.findIndex(([t]) => t > 100);
  altered.inputs[i][1] = { move: -altered.inputs[i][1].move || 1 };
  const bad = run("replay.mjs", sessionZip(path.join(tmp, "desync.zip"), [a, altered]), snap);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /run 2: .*\n.*\n {2}DESYNCHRONISED at tick \d+ \(recorded [0-9a-f]+, replayed [0-9a-f]+\)\. Not used as evidence/);
  assert.match(bad.stdout, /run 1: .*\n.*\n {2}replayed/);
  const zipBytes = readFileSync(path.join(tmp, "desync.zip"));
  run("replay.mjs", path.join(tmp, "desync.zip"), snap);
  assert.deepEqual(readFileSync(path.join(tmp, "desync.zip")), zipBytes, "the replay is never rewritten");
});

test("a run with no hash to check is not counted as replayed", () => {
  const { snap } = handover("empty-run");
  const adapter = loadAdapter(snap);
  const a = record(adapter, "human", 5);
  const empty = { seed: 7, ticks: 0, inputs: [], hashes: [], end: null, summary: null };
  const zip = sessionZip(path.join(tmp, "empty.zip"), [a, empty]);
  const r = run("replay.mjs", zip, snap);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /run 2: .*\n.*\n {2}no recorded hash to check; not verified/);
  const s = run("replay-stats.mjs", zip, snap);
  assert.match(s.stdout, /SKIP run 2: no recorded hash to check \(0 ticks\)/);
  assert.match(s.stdout, /1 replay\(s\) on seeds 5;/);
});

test("review-kit refuses unknown options and never writes into a snapshot", () => {
  const { snap } = handover("kit-args");
  const before = readFileSync(path.join(snap, "review", "review.js"));
  const typo = run("review-kit.mjs", snap, "--questions", "x");
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /unknown option: --questions/);
  const install = run("review-kit.mjs", snap);
  assert.equal(install.status, 2);
  assert.match(install.stderr, /is a snapshot/);
  assert.equal(run("review-kit.mjs", snap, "--check").status, 0);
  assert.deepEqual(readFileSync(path.join(snap, "review", "review.js")), before);
});

test("a later zip of the same build leaves out the runs an earlier one already held", () => {
  const { snap } = handover("exclude");
  const adapter = loadAdapter(snap);
  const a = record(adapter, "human", 11), b = record(adapter, "human", 12), c = record(adapter, "strong", 13);
  const first = sessionZip(path.join(tmp, "first.zip"), [a, b]);
  // the kit's second download repeats runs 1 and 2 with their start times, then the new run
  const second = path.join(tmp, "second.zip");
  sessionZip(second, [a, b, c]);
  const r = run("replay.mjs", second, snap, "--exclude", first);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^1 run\(s\) of fixture-game/m);
  assert.match(r.stdout, /excluded 2 run\(s\) already in .*first\.zip/);
  assert.match(r.stdout, /run 3: .*seed 13/);
  const s = run("replay-stats.mjs", second, snap, "--exclude", first, "--policies", "human");
  assert.match(s.stdout, /1 replay\(s\) on seeds 13;/);
  const cal = run("calibrate.mjs", snap, "--zip", second, "--exclude", first);
  assert.match(cal.stdout, /zip: 1 of 1 run\(s\) used/);
});

test("replay-probe runs a probe over every replayed run", () => {
  const { snap } = handover("probe");
  const adapter = loadAdapter(snap);
  const zip = sessionZip(path.join(tmp, "probe.zip"), [record(adapter, "human", 21), record(adapter, "strong", 22)]);
  const probe = path.join(tmp, "probe-moves.cjs");
  writeFileSync(probe, "let moves = 0, runs = 0, ends = [];\nmodule.exports = { begin() { runs++; }, step(st, t, input) { if (input.move) moves++; }, end(st, run) { ends.push([run.run, st.lives]); }, report: () => ({ runs, moves, ends }) };\n");
  const r = run("replay-probe.mjs", zip, snap, probe, "--json", path.join(tmp, "probe.json"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /probe ran on 2 run\(s\)/);
  const out = JSON.parse(readFileSync(path.join(tmp, "probe.json"), "utf8"));
  assert.equal(out.runs, 2);
  assert.ok(out.moves > 0);
  assert.deepEqual(out.ends.map((e) => e[0]), [1, 2]);
  // a desynchronised run is left out
  const bad = record(adapter, "human", 23); bad.end.hash = "00000000";
  const r2 = run("replay-probe.mjs", sessionZip(path.join(tmp, "probe-bad.zip"), [bad]), snap, probe);
  assert.equal(r2.status, 1);
  assert.match(r2.stdout, /SKIP run 1: DESYNCHRONISED/);
});

test("replay and replay-stats refuse a build other than the one played", () => {
  const { game, snap } = handover("wrong-build");
  const adapter = loadAdapter(snap);
  const zip = sessionZip(path.join(tmp, "other.zip"), [record(adapter, "human", 2)], { build: "07-other" });
  for (const tool of ["replay.mjs", "replay-stats.mjs"]) {
    const r = run(tool, zip, snap);
    assert.equal(r.status, 1, tool);
    assert.match(r.stdout, /BUILD NOT VERIFIED: this directory is snapshot "01-review", but the play names build "07-other"/, tool);
    const loose = run(tool, path.join(tmp, "other.zip"), game);
    assert.match(loose.stdout, /BUILD NOT VERIFIED: this directory is not a snapshot/, tool);
  }
});

test("replay-stats sets the person's figures beside the policies' and names missing hooks", () => {
  const { game, snap } = handover("stats");
  const adapter = loadAdapter(snap);
  const zip = sessionZip(path.join(tmp, "stats.zip"), [record(adapter, "human", 3), record(adapter, "human", 4)]);
  const r = run("replay-stats.mjs", zip, snap, "--policies", "human,strong", "--json", path.join(tmp, "stats.json"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 replay\(s\) on seeds 3, 4; policies run on the same seeds/);
  assert.match(r.stdout, /\s+person\s+human\s+strong/);
  for (const row of ["input changes per s", "hold median s", "reaction median s", "time in mid", "threat distance at failure, median", "failures: bolt per run", "life 1: mean s"]) {
    assert.match(r.stdout, new RegExp(row), row);
  }
  assert.match(r.stdout, /MISSING a "threat_appear" event: reaction latency is measured from threat_fire instead/);
  assert.doesNotMatch(r.stdout, /MISSING player/);
  // The person here is the human policy on the same seeds, so their figures must agree.
  const table = JSON.parse(readFileSync(path.join(tmp, "stats.json"), "utf8")).table;
  for (const row of table) assert.deepEqual(row.person, row.human, row.figure);
  assert.ok(table.some((row) => JSON.stringify(row.person) !== JSON.stringify(row.strong)), "the strong policy plays differently");
  assert.match(r.stdout, /score per run/);

  // --fit: the policy that played agrees on every figure; another is named where it differs.
  const same = run("replay-stats.mjs", zip, snap, "--fit", "human", "--min-n", "1");
  assert.match(same.stdout, /FIT human against the person: (\d+) of \1 figures within 25%/);
  assert.doesNotMatch(same.stdout, /^OFF /m);
  const other = run("replay-stats.mjs", zip, snap, "--policies", "human", "--fit", "strong", "--min-n", "1", "--json", path.join(tmp, "fit.json"));
  assert.match(other.stdout, /FIT strong against the person: \d+ of \d+ figures/);
  assert.match(other.stdout, /^OFF .*: person .*, strong /m);
  assert.match(other.stdout, /NOTE the rung ran on 2 seed\(s\)/);
  const fit = JSON.parse(readFileSync(path.join(tmp, "fit.json"), "utf8")).fit;
  assert.equal(fit.rung, "strong");
  assert.ok(fit.off.length > 0);

  // An adapter without the optional hooks: the figures that remain, and the missing ones named.
  const file = path.join(game, "tests", "adapter.cjs");
  writeFileSync(file, readFileSync(file, "utf8").replace(/\n {2}player: .*\n {2}threats: .*\n/, "\n").replace(/\n {2}region: .*\n/, "\n"));
  const root2 = path.join(tmp, "stats", "snap2");
  run("snapshot.mjs", game, "review", "--root", root2);
  const snap2 = path.join(root2, "fixture-game", "01-review");
  const thin = run("replay-stats.mjs", zip, snap2);
  assert.equal(thin.status, 0, thin.stdout + thin.stderr);
  assert.match(thin.stdout, /MISSING region\(state\): time per region/);
  assert.match(thin.stdout, /MISSING player\(state\) and threats\(state\): distance to threats at failure/);
  assert.doesNotMatch(thin.stdout, /threat distance at failure/);
  assert.match(thin.stdout, /input changes per s/);
});

test("calibrate accepts a session zip in place of a pasted summary", () => {
  const { snap } = handover("calibrate");
  const adapter = loadAdapter(snap);
  // A person who plays like skill t=0.5: twelve runs recorded with that policy.
  adapter.policies.mid = { profile: "human-limited", make: (seed) => adapter.skillPolicy(0.5, seed) };
  const runs = Array.from({ length: 12 }, (_, i) => record(adapter, "mid", i + 1));
  const zip = sessionZip(path.join(tmp, "cal.zip"), runs);
  const r = run("calibrate.mjs", snap, "--zip", zip, "--seeds", "12");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /zip: 12 of 12 run\(s\) used \(run 1 from its summary/);
  assert.match(r.stdout, /skill t(=0\.50| between 0\.4\d and 0\.6\d)/);
  const other = run("calibrate.mjs", snap, "--zip", sessionZip(path.join(tmp, "cal-other.zip"), runs, { build: "02-x" }));
  assert.equal(other.status, 1);
  assert.match(other.stdout, /BUILD NOT VERIFIED: .*report names build "02-x"/);
  assert.equal(run("calibrate.mjs", snap, "--zip", zip, "--summary", runs[0].summary).status, 2, "one input, not both");
});

test("a game without an adapter gets its run summaries, and a statement that replay is unavailable", () => {
  const { snap } = handover("no-adapter");
  const adapter = loadAdapter(snap);
  const a = record(adapter, "human", 9);
  const zip = sessionZip(path.join(tmp, "noadapter.zip"), [a], { level: "no-adapter" });
  const r = run("replay.mjs", zip, snap);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /NOTE the game declares no adapter; replay is unavailable/);
  assert.match(r.stdout, /summary: RUN v1 build=dev /);
  assert.match(r.stdout, /not replayed/);
  const s = run("replay-stats.mjs", zip, snap);
  assert.equal(s.status, 1);
  assert.match(s.stdout, /replay is unavailable\. Only the run summaries can be compared/);
  const nd = run("replay.mjs", sessionZip(path.join(tmp, "nondet.zip"), [a], { level: "non-deterministic" }), snap);
  assert.match(nd.stdout, /non-deterministic; hash checks and replay-based figures are skipped/);
});

test("rules that call engine-dependent Math in step are warned about, and named when a replay desynchronises", () => {
  const { game } = handover("engine-math");
  const core = path.join(game, "core.cjs");
  // a rules change that reads Math.sin; policies calling Math do not count
  writeFileSync(core, readFileSync(core, "utf8").replace("st.tick++;", "st.tick++;\n  st.wobble = Math.sin(st.tick);"));
  const check = run("review-kit.mjs", game, "--check");
  assert.match(check.stdout, /WARN the rules call Math\.sin inside step/);
  writeFileSync(path.join(game, "README.md"), "# x\n");
  const root = path.join(tmp, "engine-math", "snaps2");
  run("snapshot.mjs", game, "trig", "--root", root);
  const done = run("check-done.mjs", game, "--snapshots", root);
  assert.equal(done.status, 1, done.stdout);
  assert.match(done.stdout, /MISSING rules of 01-trig free of engine-dependent Math in step \(they call Math\.sin;/);
  const snap = path.join(root, "fixture-game", "01-trig");
  const adapter = loadAdapter(snap);
  const a = record(adapter, "human", 2);
  a.end.hash = "00000000"; // as if the browser's sine had differed in its last bit
  const r = run("replay.mjs", sessionZip(path.join(tmp, "trig.zip"), [a], { build: "01-trig" }), snap);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /A likely cause: the rules call Math\.sin in step/);
  // the fixture as shipped calls none
  assert.doesNotMatch(run("review-kit.mjs", handover("engine-clean").game, "--check").stdout, /WARN/);
});

test("play links: a file URL, and under WSL the form a Windows browser opens", async () => {
  const { playLinks } = await import("../lib/review-kit.mjs");
  assert.deepEqual(playLinks("/home/a/snap", "index.html", {}), ["file:///home/a/snap/index.html?review=1"]);
  assert.deepEqual(playLinks("/home/a/snap", "index.html", { WSL_DISTRO_NAME: "Ubuntu" }), ["file://wsl.localhost/Ubuntu/home/a/snap/index.html?review=1", "file:///home/a/snap/index.html?review=1"]);
  assert.equal(playLinks("/mnt/c/Users/a b/snap", "index.html", { WSL_DISTRO_NAME: "Ubuntu" })[0], "file:///C:/Users/a%20b/snap/index.html?review=1");
});

test("check-done requires the review kit in the newest snapshot", () => {
  const game = path.join(tmp, "done", "fixture-game");
  const snaps = path.join(tmp, "done", "snaps");
  cpSync(fixture, game, { recursive: true });
  writeFileSync(path.join(game, "README.md"), "# fixture\n");
  const without = run("review-kit.mjs", game, "--check");
  assert.equal(without.status, 1);
  assert.match(without.stdout, /review kit: ABSENT\n {2}- review\/review\.js is missing/);
  run("snapshot.mjs", game, "first-playable", "--root", snaps);
  const absent = run("check-done.mjs", game, "--snapshots", snaps);
  assert.equal(absent.status, 1, "the newest snapshot is the handed-over build, and it has no kit");
  assert.match(absent.stdout, /MISSING the review kit in the newest snapshot 01-first-playable/);

  assert.equal(run("review-kit.mjs", game).status, 0);
  assert.match(run("review-kit.mjs", game, "--check").stdout, /review kit: PRESENT, level replay\n/);
  run("snapshot.mjs", game, "with-kit", "--root", snaps);
  const done = run("check-done.mjs", game, "--snapshots", snaps);
  assert.equal(done.status, 0, done.stdout);
  assert.match(done.stdout, /REVIEW {2}newest snapshot: 02-with-kit: replay\n/);
  writeFileSync(path.join(game, "REVISION_HISTORY.md"), "意図: 避けて集める。\n");
  assert.equal(run("check-done.mjs", game, "--stage", "finished", "--snapshots", snaps).status, 0, "a finished game needs no record lines");

  // A game declared at no-adapter passes without an adapter or a Math check, and its level is printed.
  const playJs = path.join(game, "play.js");
  writeFileSync(playJs, readFileSync(playJs, "utf8").replace('level: "replay"', 'level: "no-adapter"'));
  run("snapshot.mjs", game, "no-adapter", "--root", snaps);
  const na = run("check-done.mjs", game, "--snapshots", snaps);
  assert.equal(na.status, 0, na.stdout);
  assert.match(na.stdout, /newest snapshot: 03-no-adapter: no-adapter/);

  writeFileSync(path.join(game, "review", "review.js"), readFileSync(path.join(game, "review", "review.js"), "utf8") + "\n// edited\n");
  assert.match(run("check-done.mjs", game, "--snapshots", snaps).stdout, /working copy: kit PRESENT at level no-adapter; the copy differs from tools\/review\/review\.js/);
});

// ---------- in a browser ----------

let chromium = null, browser = null, skipWhy = null;
before(async () => {
  try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { skipWhy = "playwright is not installed"; return; }
  try { browser = await chromium.launch(); } catch { skipWhy = "no headless browser available here"; }
});
after(async () => { if (browser) await browser.close(); });

async function open(t, file, query, { context = {}, init } = {}) {
  if (skipWhy) { t.skip(skipWhy); return null; }
  const ctx = await browser.newContext({ acceptDownloads: true, ...context });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href + query);
  page.hold = async (key, ms = 110) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
  return page;
}
const holds = [80, 95, 110, 125, 140, 150];

async function playRun(page, { moves = 4 } = {}) {
  await page.hold("Space", 90);
  for (let i = 0; i < moves; i++) {
    await page.hold(i % 2 ? "ArrowLeft" : "ArrowRight", holds[i % holds.length]);
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => __play.mode === "over", null, { timeout: 60000 });
}
async function downloadZip(page, file) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.hold("KeyN", 100)]);
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), session: JSON.parse(readZip(readFileSync(file)).get("session.json").toString("utf8")) };
}

test("browser: runs are recorded, kept across a reload, and downloaded together as a zip that replays", async (t) => {
  const { snap } = handover("browser");
  const page = await open(t, path.join(snap, "play.html"), "?review=1&seed=3&speed=1");
  if (!page) return;
  await page.evaluate(() => REVIEW.ready);
  await playRun(page);

  // the key does nothing mid-run, and does not reach the game
  await page.hold("Space", 90);
  await page.waitForTimeout(100);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.hold("KeyN", 100);
  await page.waitForTimeout(200);
  assert.equal(downloads, 0, "no download during a run");
  await page.waitForFunction(() => __play.mode === "over", null, { timeout: 60000 });

  await page.waitForTimeout(200); // the save
  await page.reload();
  await page.evaluate(() => REVIEW.ready);
  assert.equal(await page.evaluate(() => REVIEW.runs.length), 2, "runs survive a reload");
  await playRun(page, { moves: 2 });

  const zipFile = path.join(tmp, "browser.zip");
  const { name, session: s } = await downloadZip(page, zipFile);
  assert.match(name, /^fixture-game-01-review-\d{8}-\d{4}\.zip$/);
  assert.equal(s.kit, 3);
  assert.equal(s.build, "01-review");
  assert.equal(s.buildConstant, "dev");
  assert.deepEqual(s.runs.map((r) => r.run), [1, 2, 3]);
  for (const r of s.runs) assert.ok(Date.parse(r.startedAt) > 0, "each run says when it started");
  assert.match(s.runs[0].summary, /^RUN v1 build=dev /);

  const r = run("replay.mjs", zipFile, snap);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.match(/replayed, \d+ hash\(es\) match/g).length, 3);
  assert.deepEqual(page.errors, []);

  // A later download carries every run again.
  await playRun(page, { moves: 2 });
  assert.equal((await downloadZip(page, path.join(tmp, "browser2.zip"))).session.runs.length, 4);
  await page.context().close();
});

test("browser: a run cut off by a reload is kept as abandoned, with what was played of it", async (t) => {
  const { snap } = handover("reload");
  const page = await open(t, path.join(snap, "play.html"), "?review=1&seed=8&speed=4");
  if (!page) return;
  await page.evaluate(() => REVIEW.ready);
  await page.hold("Space", 90);
  await page.hold("ArrowRight", 100);
  await page.waitForFunction(() => __play.state.tick >= 400, null, { timeout: 20000 });
  await page.waitForTimeout(150); // the periodic save
  await page.reload();
  await page.evaluate(() => REVIEW.ready);
  const r = await page.evaluate(() => REVIEW.runs[0]);
  assert.equal(r.abandoned, true);
  assert.ok(r.ticks >= 300 && r.hashes.length >= 5, JSON.stringify({ ticks: r.ticks, hashes: r.hashes.length }));
  const file = path.join(tmp, "reload.zip");
  await downloadZip(page, file);
  const out = run("replay.mjs", file, snap);
  assert.equal(out.status, 0, out.stdout);
  assert.match(out.stdout, /left before the end\n.*\n {2}replayed, \d+ hash\(es\) match/);
  await page.context().close();
});

test("browser: storage failure does not break play, and the zip still downloads", async (t) => {
  const { snap } = handover("nostorage");
  const page = await open(t, path.join(snap, "play.html"), "?review=1&seed=4&speed=2", {
    init: () => { Object.defineProperty(window, "indexedDB", { get() { throw new Error("storage blocked"); } }); },
  });
  if (!page) return;
  await page.evaluate(() => REVIEW.ready);
  await playRun(page);
  assert.equal(await page.evaluate(() => REVIEW.storageOk), false);
  const file = path.join(tmp, "nostorage.zip");
  assert.equal((await downloadZip(page, file)).session.runs.length, 1, "the runs came from memory");
  assert.equal(run("replay.mjs", file, snap).status, 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("browser: two games on one origin keep separate runs", async (t) => {
  const a = handover("isolate-a");
  const b = handover("isolate-b");
  const playJs = path.join(b.snap, "play.js");
  writeFileSync(playJs, readFileSync(playJs, "utf8").replace('slug: "fixture-game"', 'slug: "other-game"'));
  const page = await open(t, path.join(a.snap, "play.html"), "?review=1&seed=5&speed=4");
  if (!page) return;
  await page.evaluate(() => REVIEW.ready);
  await playRun(page, { moves: 2 });
  await page.waitForTimeout(300);
  await page.goto(pathToFileURL(path.join(b.snap, "play.html")).href + "?review=1");
  await page.evaluate(() => REVIEW.ready);
  assert.equal(await page.evaluate(() => REVIEW.runs.length), 0, "the other game sees no runs");
  await page.goto(pathToFileURL(path.join(a.snap, "play.html")).href + "?review=1");
  await page.evaluate(() => REVIEW.ready);
  assert.equal(await page.evaluate(() => REVIEW.runs.length), 1);
  await page.context().close();
});

test("browser: a download key the game already uses is refused", async (t) => {
  const { snap } = handover("collide");
  const playJs = path.join(snap, "play.js");
  writeFileSync(playJs, readFileSync(playJs, "utf8").replace('used: ["ArrowLeft"', 'used: ["KeyN", "ArrowLeft"'));
  const page = await open(t, path.join(snap, "play.html"), "?review=1");
  if (!page) return;
  assert.ok(page.errors.some((e) => /the download key KeyN is one of the game's own keys/.test(e)), page.errors.join("\n"));
  await page.context().close();
});

test("browser: without ?review=1 the kit is not loaded and seeded results and frames are unchanged", async (t) => {
  const { snap } = handover("plain");
  // "Before": the same page with every line of kit wiring removed.
  const before = path.join(tmp, "plain", "before");
  cpSync(snap, before, { recursive: true });
  for (const f of ["play.html", "play.js"]) {
    const p = path.join(before, f);
    writeFileSync(p, readFileSync(p, "utf8").split("\n").filter((l) => !/REVIEW|review\.js/.test(l)).join("\n"));
  }
  const drive = async (file) => {
    const page = await open(t, file, "?seed=11&manual=1");
    if (!page) return null;
    await page.keyboard.press("Space");
    const frames = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 3 ? "ArrowRight" : "ArrowLeft");
      await page.evaluate(() => __play.advance(97));
      frames.push(await page.evaluate(() => document.getElementById("c").toDataURL()));
    }
    await page.evaluate(() => __play.advance(2000));
    const out = await page.evaluate(() => ({ last: __play.last, review: typeof window.REVIEW, loaded: performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /review/.test(n)) }));
    out.frames = frames;
    out.errors = page.errors;
    await page.context().close();
    return out;
  };
  const withKit = await drive(path.join(snap, "play.html"));
  if (!withKit) return;
  const without = await drive(path.join(before, "play.html"));
  assert.equal(withKit.review, "undefined");
  assert.deepEqual(withKit.loaded, []);
  assert.match(withKit.last, /^RUN v1 /);
  assert.equal(withKit.last, without.last);
  assert.deepEqual(withKit.frames, without.frames);
  assert.deepEqual(withKit.errors, []);
  assert.ok(existsSync(path.join(snap, "review", "review.js")), "the kit is in the build, unused");
});
