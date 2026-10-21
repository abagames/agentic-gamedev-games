# Shared tools

Scripts used while building and refining a game under `tmp/games/<slug>/`. They need Node 18+;
`shots.mjs` also needs the repository's Playwright.

| Script | Purpose |
|---|---|
| `pick-tags.mjs` | Draws design tags for an open-ended assignment |
| `snapshot.mjs <game-dir> <label>` | Copies a build to `tmp/snapshots/<slug>/<NN>-<label>/` |
| `ladder.mjs <game-dir> [--variant name]` | Runs the game's simulated players over the same seeds; writes `reports/ladder.json` with results and usage telemetry |
| `audit.mjs <ladder.json>` | Lists signals worth examining in a ladder report |
| `calibrate.mjs <dir> --summary "RUN v1 ..."` or `--zip <review.zip>` | Places a play report on the game's skill axis |
| `review-kit.mjs <game-dir> [--check]` | Copies the review kit into a game, or reports whether it is wired in |
| `replay.mjs <review.zip> <snapshot-dir>` | Checks that each recorded run replays on the build played |
| `replay-stats.mjs <review.zip> <snapshot-dir>` | How the person played, beside chosen policies on the same seeds; `--fit` compares a fitted rung with the person |
| `replay-probe.mjs <review.zip> <snapshot-dir> <probe>` | Runs a small probe of your own over every replayed run |
| `shots.mjs <game-dir>` | Captures named scenes and writes `evidence/shots/frames.json` |
| `check-done.mjs <game-dir> [--stage slice\|finished]` | Checks that the records AGENTS.md asks for at that stage exist, and that the newest snapshot carries the review kit |

Run the tools' own tests with `npm run test:tools`.

## Which are required

AGENTS.md is the authority. It requires `snapshot.mjs` (the first playable build, and every build
handed over for play), the review kit in every build handed over for play (`review-kit.mjs`, at the
highest level the game's rules allow), and `check-done.mjs` (before each completion report: the
default stage for a slice, `--stage finished` after the refinement loop). `replay.mjs` and
`replay-stats.mjs` are what AGENTS.md runs when a review zip arrives, where the level allows. Every
other script here is optional: use it when a question about the game needs the evidence it
produces. A game with no adapter, no scenes, and no run-summary line is complete if its questions
were answered another way; `check-done.mjs` lists such items as `ABSENT`, which does not fail.

## What the tools do not decide

`audit.mjs` prints `SIGNAL` and `NOTE` lines and always exits 0. A signal is something to look at
against the game's intent, not a defect: stalling that outscores prompt play may be the intended
risk, and two policies with similar scores may simply both be succeeding. `check-done.mjs` checks
that records exist, not that the game is good. `calibrate.mjs` refuses to name a skill level when
the build is not the one that was played or when the chosen metrics do not separate the policies.

## Conventions that make a game measurable

Adopt these when you want the corresponding tool; none is required.

- Rules in a module that runs under Node without the renderer, deterministic for a seed.
- Rules that report what happened each step: actions and score by mechanic, each threat firing and
  landing, each failure and its cause.
- `tests/adapter.cjs` wrapping those rules (contract below).
- The run-summary line printed at the end of a run.
- Named scenes on `window.__test.scenes`.

## Adapter contract

`ladder.mjs`, `audit.mjs`, and `calibrate.mjs` reach a game through one file,
`<game-dir>/tests/adapter.cjs`. It wraps the game's own rules module; the tools never import
anything else from the game.

```js
module.exports = {
  tickS: 1 / 60,                       // seconds advanced by one step
  intent: {                            // optional; what audit.mjs compares against
    core: "catch",                     // source tag of the core interaction
    primaryThreat: "raider",
    threats: ["raider", "mine"],
    regions: ["surface", "mid", "deep"],
    thresholds: { coreShare: 0.5 },    // optional overrides
  },
  create(seed) { /* -> state, deterministic for a seed */ },
  step(state, input) { /* advance one tick */ },
  ended(state) { /* -> boolean */ },
  result(state) { /* -> { score, progress, success, failures: { cause: count } } */ },
  events(state) { /* -> events produced by the last step (optional) */ },
  region(state) { /* -> name of the region the player is in (optional) */ },
  threatPresent(state, id) { /* -> is the primary threat on the field (optional) */ },
  clone(state) { /* -> independent copy, for look-ahead policies (optional) */ },
  hash(state) { /* -> string; the rules module's state hash, the same function the page gives the review kit (needed by replay.mjs) */ },
  player(state) { /* -> { x, y } (optional; with threats, replay-stats reports distance at failure) */ },
  threats(state) { /* -> [{ id, x, y }] on the field now (optional) */ },
  policies: {
    idle:   { profile: "baseline",      make: (seed) => (state) => ({}) },
    human:  { profile: "human-limited", make: (seed) => (state) => input },
    strong: { profile: "precise",       make: (seed) => (state) => input },
    staller:  { profile: "precise", role: "stall",        make: ... },
    survivor: { profile: "precise", role: "survive_only", make: ... },
  },
  skillPolicy(t, seed) { /* -> policy; t=0 weakest modelled player, t=1 strongest (optional) */ },
  variants: {                          // optional; for ladder --variant
    round3: (state, seed) => { /* start on round 3 */ },
    noShells: (state, seed) => { /* switch one element off */ },
  },
};
```

Events:

| Event | Meaning |
|---|---|
| `{ type: "action", source }` | The player did something countable; `source` names the mechanic |
| `{ type: "score", source, amount }` | Score from that mechanic |
| `{ type: "threat_appear", id }` | A threat first became visible (optional; replay-stats measures reaction from it, else from `threat_fire`) |
| `{ type: "threat_fire", id }` | A threat activated |
| `{ type: "threat_hit", id }` | It reached the player |
| `{ type: "failure", cause }` | A life or run was lost |

Profiles are `baseline`, `human-limited`, `precise`, or `oracle`. A policy with a `role` is an
objective-ignoring probe and is left out of skill comparisons.

Keep the adapter thin. If a game's rules already emit events, map them; do not add events to the
rules only to satisfy the tools unless a question about the game needs them.

## Run summary line

A game prints one line when a run ends, so a play report can be pasted instead of remembered:

```text
RUN v1 build=03-campaign progress=7 score=74200 time=212 fail=bomb:2,wreck:1
```

`build` is the snapshot label. `progress` is the game's own measure of how far the run got.
`fail` lists failures by cause and is omitted when there were none. Build labels and cause names
are short ASCII identifiers.

When a run ends, the game logs the line and passes it to the review kit, which puts it in the zip:

```js
console.log(line);
window.REVIEW && REVIEW.runEnd(line);
```

It adds no key binding and no on-screen text, and the game does not write it to the address bar.
`lib/run-summary.mjs` formats the line and parses the plain line, or an encoded one pasted from an
older game that wrote it to the URL fragment.

## Scenes for `shots.mjs`

The page exposes `window.__test.scenes`, an object of named functions that each arrange one
moment, and optionally `window.__test.frame()`, which returns `{ elements }` for the frame just
drawn, in the format of the `auditing-game-screen-readability` skill (rectangle, kind, draw order).
`shots.mjs` saves a PNG per scene and one `frames.json`; pass that file to the skill's
`check-screen-frames.mjs`.

## Variants: does an element change the best action?

A variant changes the state right after `create`, so the same policies can be run on a later round,
or with one element switched off:

```bash
node tools/ladder.mjs tmp/games/<slug> --variant round3 --out tmp/games/<slug>/reports/round3.json
node tools/ladder.mjs tmp/games/<slug> --variant round3-plain --out tmp/games/<slug>/reports/round3-plain.json
```

For the content test "it changes the best action", compare a policy that takes the element into
account with one that does not (a policy option the game's bots define), on the round that
introduces it. For "not the ordinary game with pressure removed", compare that round with the
element and without. The report records its variant, and `--compare` refuses two reports run on
different variants.

The adapter's `progress` is the game's own measure and may change meaning when the game does (a
slice measuring seconds, a finished game measuring rounds). Compare progress across builds only
when it means the same thing on both.

## Presentation-only changes

Before a presentation pass, write a report; after it, compare:

```bash
node tools/ladder.mjs tmp/games/<slug> --out tmp/games/<slug>/reports/before.json
# ... change drawing or sound only ...
node tools/ladder.mjs tmp/games/<slug> --compare tmp/games/<slug>/reports/before.json
```

Any difference means the change reached the rules. The baseline is read before the new report is
written, and `--compare` refuses a baseline that is also the output file.

## Review kit

A person plays a build as many times as they like and presses one key between runs to download a
zip of every run of that build kept in their browser. They say what they think in the chat. The
agent replays the zip on the snapshot that was played. The kit is `review/review.js`, one file with
no dependencies, copied into each game by `node tools/review-kit.mjs <game-dir>` so that snapshots
and promoted copies carry it.

### Activation

Only with `?review=1`. The page loads the kit with one line placed before the game's scripts, and
the game reaches it only through `window.REVIEW`, which otherwise does not exist. Without the
parameter no kit code is loaded and the game behaves and draws exactly as before.

```html
<script>/[?&]review=1(&|$)/.test(location.search) && document.write('<script src="review/review.js"><\/script>')</script>
```

### What a game provides

```js
window.REVIEW && REVIEW.attach({
  slug: 'my-game',              // the game directory's name
  build: BUILD,                 // the game's own build constant
  level: 'replay',              // see levels below
  key: 'KeyN',                  // the download key (KeyboardEvent.code)
  used: ['ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'KeyP'], // the game's keys; the kit refuses to share one
  hash: () => rules.hash(st),   // the rules module's state hash; not needed at level non-deterministic
});
window.REVIEW && REVIEW.runStart({ seed });   // a run begins
window.REVIEW && REVIEW.step(input);          // right after each rules step, with the input that step was given,
                                              // before anything that can end the run
window.REVIEW && REVIEW.runEnd(summaryLine);  // a run ends; the run-summary line where the game has one
```

`input` must be in the form `tests/adapter.cjs` passes to `step(state, input)`. The hash must be
one function in the rules module, called by both the page and the adapter, over the rules state
only. Anything else the rules read (a seed taken from the clock, `Math.random` in the rules) makes
replays desynchronise; the checks below catch it.

The rules must also compute the same numbers in the person's browser as under Node. `+ - * /` and
`Math.sqrt` are rounded alike by every engine; `Math.sin`, `cos`, `atan2`, `hypot`, `exp`, `pow` and
the other transcendental functions are not. In the pilot, Node 24 and Chromium 153 differed in the
last bit of `Math.sin` and `Math.cos`, and two of three OVERTURN runs desynchronised within a few
hundred ticks. A game at level `replay` computes these in its rules module from the exact operations
(range reduction and a polynomial; about 25 lines for sin, cos, atan2 and hypot, accurate to a few
units in 1e-15). `review-kit.mjs --check`, `check-done.mjs` and a desynchronised `replay.mjs` run the
adapter's policies briefly with those functions counted inside `step` only, and name any the rules
call. Calls made by policies or by drawing code do not matter.

### Levels

| Level | When | What is recorded | What the agent-side tools do |
|---|---|---|---|
| `replay` | Deterministic rules and a `tests/adapter.cjs` | Inputs, hashes, summary line | Replay and check every hash; replay-stats |
| `no-adapter` | Deterministic rules that do not run under Node | The same | Print the run summaries; say that replay is unavailable |
| `non-deterministic` | The game declares its rules are not reproducible | Events passed to `REVIEW.event(e)` and the summary line instead of inputs and hashes | Skip hash checks and replay-based figures, and say so |

### Recording and download

- Each run is kept with its start time, seed, inputs as `[tick, input]` from the tick they apply,
  a hash every 60 ticks and at the end, and the summary line. A run left unfinished by starting
  another or closing the page is kept as abandoned. A run in progress is saved every 300 ticks, so
  a reload loses at most its last few seconds.
- Runs are saved to IndexedDB under the game's slug and build label, so games and snapshots on one
  origin do not see each other's runs, and they survive a reload. Every storage call is caught;
  when storage fails the runs live in memory and a small mark says to download before closing.
- Build label: served from a snapshot (`.../<slug>/<NN>-<label>/`), the kit records the snapshot's
  label; otherwise the game's build constant. Both are in the zip.
- The download key works between runs; during a run it shows a small mark and does nothing. It
  never reaches the game. Each download holds every run of the build kept in that browser, so the
  newest zip supersedes earlier ones. The person refers to runs in the chat by when they played
  them ("the last run", "around 10:40"); the start times in the zip identify them.

### The zip

`<slug>-<build>-<YYYYMMDD-HHMM>.zip`, stored without compression:

- `session.json`: `kit` (3), `slug`, `build`, `buildConstant`, `buildSource`, `level`, `downloaded`,
  and `runs`, each with `run`, `startedAt`, `seed`, `ticks`, `summary`, `ended`, `abandoned`, `replay`;
- `replays/run-<n>.json`: `seed`, `ticks`, `inputs`, `hashes`, `end`, `events`, `summary`.

The zip writer and its CRC-32 are written here (`makeZip` in `review/review.js`, MIT like the rest
of this repository); no third-party code is vendored. Zips from earlier kit versions still load.

### Agent side

```bash
node tools/review-kit.mjs tmp/snapshots/<slug>/<NN>-<label> --check   # the kit's level, and the play link
node tools/replay.mjs <review.zip> tmp/snapshots/<slug>/<NN>-<label>
node tools/replay-stats.mjs <review.zip> tmp/snapshots/<slug>/<NN>-<label> [--policies a,b] [--fit rung] [--react-max-s 2] [--max-s 600] [--json out.json]
node tools/calibrate.mjs tmp/snapshots/<slug>/<NN>-<label> --zip <review.zip>
node tools/replay-probe.mjs <review.zip> tmp/snapshots/<slug>/<NN>-<label> probe.cjs [--json out.json]
```

Every download holds all the runs of that build kept in the browser, so a second zip of a build
repeats the first one's runs. Pass the earlier zips with `--exclude a.zip[,b.zip]` to any of these
tools; runs with the same start time, seed and length are left out, and the output says how many.

All three verify the build as `calibrate.mjs` does and refuse any other. They never re-record, edit
or migrate a replay. `replay.mjs` lists each run with its start time and summary, and checks every
recorded hash; a run with no hash to check (cut off within its first second) is not verified and
not used, and `replay-stats.mjs` leaves it out. A mismatch is reported as a desynchronised replay with its first mismatching tick,
not as evidence about the game, and the exit code is 1. The check is strict: a difference in the
last bit of any rules value counts, even where the run's outcome would have been the same.

`replay-stats.mjs` prints, beside the same figures for the chosen policies on the same seeds: time,
progress and score per run, input rate and hold durations, reaction latency from a threat's
appearance to the next input change, the rate of each rules event (by `source` or `cause` where it
has one), time per region, distance to threats at failure, failures by cause, and results per life.
Each figure gives the number of events it rests on. Figures whose hooks are missing are named on
`MISSING` lines. A threat followed by no input change within `--react-max-s` seconds (default 2)
counts as unanswered rather than as a slow reaction; the policies run for at most `--max-s` seconds per seed (default 600).

`replay-probe.mjs` answers what the figures above do not (what each failure came from, the shape
of the person's moves, how long a state held). The probe is a module exporting any of
`begin(run, state)`, `step(state, tick, input, events, run)`, `end(state, run)` and `report()`; it only
reads state. Runs are checked as `replay.mjs` checks them, and a desynchronised one is left out.

`--fit <rung>` compares a policy fitted to the person with the person, figure by figure:
`FIT <rung> against the person: k of n figures within 25%`, then an `OFF` line for each figure
outside it, and a `THIN` line for figures the person's play gives too few events for (`--min-n`,
default 8; `--tolerance`, default 0.25). Results per run always count, and on a few seeds they are
weak evidence, which the output says. A rung fitted to results alone (`calibrate.mjs`) typically
agrees on them and is `OFF` on how the person plays: in UMBRA's sessions it missed the person's
escapes by a third and fell below the novice policy.

## Calibration

```bash
node tools/calibrate.mjs tmp/snapshots/<slug>/<NN>-<label> --summary "RUN v1 build=<NN>-<label> ..."
```

With `--zip`, the runs of a review zip are the report: the median progress and score and the
mean failures and time over its runs, from each run's summary line, or from its replay where it
has none. Run it on the snapshot named in the report's `build` field; it checks the two against
`SNAPSHOT.json` and stops when they differ (`--allow-unverified-build` overrides, and the output
then says the build was not verified). It compares `progress`, `failures`, and `score` by default;
choose others with `--metrics` (`time` is also available). A metric that is the same at every skill
level is ignored, and when the remaining metrics fit several skill levels equally the result is
`NOT IDENTIFIED` with exit code 1, not a guess. Failures by cause are printed for comparison by
hand, not fitted.
