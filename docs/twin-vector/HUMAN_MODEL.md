# Human-limited policy calibration — 2026-09-29

This records calibration against the pre-expansion game. `calibrate-human.cjs` now
uses `evidence/pre-expansion/engine.cjs` so these values remain reproducible. Current
expanded-game comparisons are in README.md and `evidence/expansion-balance.json`.

User evidence: approximately 4,000 points; transferred-shot gold was not noticed;
transfer was used chiefly to attack behind shields. Previous limited policy averaged
15,200 over seeds 1–12 and still had global live enemy/shot/bolt access.
This is a measurement-model correction. No engine, rendering, input or audio changes.

## Revised model

`tests/human-policy.cjs` separates observation from action. Only observation reads world
entities; it samples one layer, not both. Actions receive player lane/layer and delayed
memories only. No score, future queue, live disappearance oracle or forced score cap.

- Action/read cadence: 12 ticks (200ms); delayed observation: 12 ticks.
- Glance at the opposite field every 72 ticks (1.2s), for 18 ticks (300ms).
  Because samples are discrete this normally produces one or two opposite snapshots.
  During that glance the current field is not refreshed.
- After a layer change: 24 ticks (400ms) with no new observations or actions.
  The next opposite glance is scheduled after reorientation.
- 15% missed reads; depth-reading error +/-0.04.
- Last observed enemies are remembered for at most 90 ticks (1.5s).
  Their depth is extrapolated from observation time, never live position. Lane changes
  and destruction remain unknown until another observation; expired predictions are removed.
- Shots/bolts are used only from snapshots at most 30 ticks old. Travel is extrapolated
  to compensate latency, avoiding systematic mistakes caused solely by stale coordinates.
- 25% missed secondary-threat checks, 8% missed lateral actions.
- Ordinary enemies get direct fire. Shield enemies prompt an opposite-layer setup and
  timed transfer through the gap. The old policy used transfers for practically every kill.
- End-state, all spawns, kills, scoring and failure still come from the unchanged game engine.

Alternatives considered: increasing global reaction latency would retain unrealistic
all-field awareness; independent random input failure would lower score without modeling
attention; delayed one-layer snapshots plus reorientation address the reported mismatch.
We chose the third. Numerical values are calibration assumptions, not measurements of
this particular user's eye movements or reaction time.

## Calibration procedure

First 9 settings: opposite-glance intervals 48/90/150 ticks crossed with reorientation
12/24/36 ticks on seeds 1–12. Default 90/24 scored 3,900, but its additional seeds
101–148 averaged 3,310. These 48 then became development seeds, not a holdout.

Expanded development = seeds 1–12 and 101–148 (60 runs). Three follow-up candidates:
90/12 averaged 4,620; 72/24 averaged 4,138; 72/18 averaged 4,700.
Selected 72/24 to put the development average in the approximate 3,500–4,500 band.

Frozen settings were evaluated once on new seeds 201–260. No tuning after this check.

| Policy / sample | Runs | Mean | Median | Range | Clears |
|---|---:|---:|---:|---:|---:|
| Revised, development | 60 | 4,138 | 3,950 | 700–9,900 | 1 |
| Revised, held-out | 60 | 4,185 | 4,100 | 1,200–8,300 | 0 |
| Old limited, same held-out | 60 | 14,733 | 15,300 | 6,300–15,900 | 46 |

Held-out revised runs: 134 breach deaths and 46 bolt deaths; average duration 52.7s,
72.15 shots and 20.73 successful shifts. Inputs never occur less than 12 ticks apart.
There are no timeout terminations or artificial deaths. Scores vary widely: this is
an approximate population mean match, not a policy forced to finish at 4,000.
Strong policy stays at 15,900 across the original 12 seeds. Fixed sweeping averages
6,167, above this human-limited policy: do not claim human-level aiming dominates
simple sweeping from the strong-policy results alone. No game rebalance was requested.

## Verification and files

- `node docs/twin-vector/tests/human-policy.test.cjs`: five checks — hidden opposite
  data cannot affect actions, visual latency, reorientation, memory expiry, deterministic
  replay/input cadence and meaningful ordinary/transfer engagement.
- `node docs/twin-vector/tests/calibrate-human.cjs`: final development/held-out/legacy
  comparison; writes `evidence/human-calibration.json` including causal deaths and traces.
- `node docs/twin-vector/tests/balance.cjs`: current 12-seed ladder, writes
  `evidence/balance.json`; original report archived as `balance-before-perception.json`.
- `legacyLimited` remains available only for explicit comparisons; `limited` is the new model.

Browser rendering is unchanged; no browser re-test is needed for these test-only changes.
Score matching alone does not identify a unique human cognitive model. The user's next
hands-on report remains stronger evidence than this calibration, particularly for spatial
misreads, transfer timing and decisions after attention switches.

## Expansion use

Attention constants are frozen. Observations additionally expose visible closed-core and
stationary-boss states; target selection ignores observed closed cores and extrapolates
observed stationary parts with zero velocity. No hidden opposite-layer reads were added.
The unchanged calibration engine still reproduces the held-out 4,185 average.
With authored formations/breathing intervals and a final boss, the same 60 seeds give
9,460 average, 37 boss arrivals and 30 wins. This reflects game pacing/content changes.
Real browser keyboard play at initial seed 1983 ended on sector 2 at 3,900; simulation
for that same seed also returned sector 2, 3,900. No favorable initial state was injected.

## Nine-stage use

Reaction, attention, memory and execution limits remain frozen. Visible wide-shield
span and anchored-gunner state now enter the same delayed snapshots. Routing can
account for an observed guard covering a neighbor; no live opposite-field data or
future layer transitions are provided. Movement prediction uses the game's speed
cap after stage 3.

Seeds 201–260: mean 15,068, range 3,400–37,200, 2/60 clears, no timeouts.
Stage reach counts: 60, 60, 53, 30, 30, 29, 14, 11, 7. Independent fresh-stock
stage tests cleared 12, 10, 8, 12, 12, 10, 11, 11, 12 times out of 12; these
are diagnostics, not full-run success estimates. Longer campaign scores must not
be equated with the original 4,000-point calibration. Human nine-stage play remains
untested. The historical real-time browser run above is from the three-stage build.

## Moving shield boss observation

The stage-three core is visibly present on both decks. Each delayed snapshot now
includes that visible core with the observed deck's shutter lock state. Reaction,
attention, timing, memory and execution constants are unchanged. The bot does not
predict the boss cycle. Latest isolated stage-three diagnostics are recorded in
evidence/dreadnought-balance.json; earlier full-campaign results predate this boss.

For the final carrier, observations mark the visible shell without a weak point as
locked. This reads only the sampled layer's visible state; no future cycle or
opposite-layer knowledge enters the human policy. Strong policy targets the visible
open layer of shared cores. Boss-only starts are explicitly marked diagnostics,
with fresh stock; campaign statistics are stored separately in the same report.

## Location (2026-09-29)

The policy now lives in `human-policy.js` beside the game (UMD: `HumanPolicy` in the browser,
`module.exports` in Node) because it also pilots the attract demo. `tests/human-policy.cjs`
re-exports it, so all test commands above are unchanged. Constants are unchanged.
