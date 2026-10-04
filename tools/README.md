# Shared tools

Scripts used while building and refining a game under `tmp/games/<slug>/`. They need Node 18+;
`shots.mjs` also needs the repository's Playwright.

| Script | Purpose |
|---|---|
| `pick-tags.mjs` | Draws design tags for an open-ended assignment |
| `snapshot.mjs <game-dir> <label>` | Copies a build to `tmp/snapshots/<slug>/<NN>-<label>/` |
| `ladder.mjs <game-dir>` | Runs the game's simulated players over the same seeds; writes `reports/ladder.json` with results and usage telemetry |
| `audit.mjs <ladder.json>` | Lists signals worth examining in a ladder report |
| `calibrate.mjs <dir> --summary "RUN v1 ..."` | Places a play report on the game's skill axis |
| `shots.mjs <game-dir>` | Captures named scenes and writes `evidence/shots/frames.json` |
| `check-done.mjs <game-dir> [--stage slice\|finished]` | Checks that the records AGENTS.md asks for at that stage exist |

Run the tools' own tests with `npm run test:tools`.

## Which are required

AGENTS.md is the authority. It requires `snapshot.mjs` (the first playable build, and during
finishing every build handed over for play) and `check-done.mjs` (before each completion report:
the default stage for a slice, `--stage finished` after the refinement loop). Every other script here
is optional: use it when a question about the game needs the evidence it produces. A game with no
adapter, no scenes, and no run-summary line is complete if its questions were answered another
way; `check-done.mjs` lists such items as `ABSENT`, which does not fail.

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
  policies: {
    idle:   { profile: "baseline",      make: (seed) => (state) => ({}) },
    human:  { profile: "human-limited", make: (seed) => (state) => input },
    strong: { profile: "precise",       make: (seed) => (state) => input },
    staller:  { profile: "precise", role: "stall",        make: ... },
    survivor: { profile: "precise", role: "survive_only", make: ... },
  },
  skillPolicy(t, seed) { /* -> policy; t=0 weakest modelled player, t=1 strongest (optional) */ },
};
```

Events:

| Event | Meaning |
|---|---|
| `{ type: "action", source }` | The player did something countable; `source` names the mechanic |
| `{ type: "score", source, amount }` | Score from that mechanic |
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

When a run ends, the game logs the line and writes it to the URL fragment:

```js
console.log(line);
location.hash = encodeURIComponent(line);
```

The player copies the address bar and pastes it into the report. This adds no key binding and no
on-screen text. A typical line is about 100 characters once encoded; one with a dozen failure
causes stays under 450. `lib/run-summary.mjs` formats the line and parses the plain line, the
encoded fragment, or the whole pasted URL.

## Scenes for `shots.mjs`

The page exposes `window.__test.scenes`, an object of named functions that each arrange one
moment, and optionally `window.__test.frame()`, which returns `{ elements }` for the frame just
drawn, in the format of the `auditing-game-screen-readability` skill (rectangle, kind, draw order).
`shots.mjs` saves a PNG per scene and one `frames.json`; pass that file to the skill's
`check-screen-frames.mjs`.

## Presentation-only changes

Before a presentation pass, write a report; after it, compare:

```bash
node tools/ladder.mjs tmp/games/<slug> --out tmp/games/<slug>/reports/before.json
# ... change drawing or sound only ...
node tools/ladder.mjs tmp/games/<slug> --compare tmp/games/<slug>/reports/before.json
```

Any difference means the change reached the rules. The baseline is read before the new report is
written, and `--compare` refuses a baseline that is also the output file.

## Calibration

```bash
node tools/calibrate.mjs tmp/snapshots/<slug>/<NN>-<label> --summary "RUN v1 build=<NN>-<label> ..."
```

Run it on the snapshot named in the report's `build` field; it checks the two against
`SNAPSHOT.json` and stops when they differ (`--allow-unverified-build` overrides, and the output
then says the build was not verified). It compares `progress`, `failures`, and `score` by default;
choose others with `--metrics` (`time` is also available). A metric that is the same at every skill
level is ignored, and when the remaining metrics fit several skill levels equally the result is
`NOT IDENTIFIED` with exit code 1, not a guess. Failures by cause are printed for comparison by
hand, not fitted.
