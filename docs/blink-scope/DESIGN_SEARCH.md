# BLINK SCOPE — design-space search

Workflow: `game-concept-workbench:exploring-game-design-space` (unattended run, review boundary non-blocking → `status: review_pending` for human review; slice implementation pre-authorized by AGENTS.md).

## Brief normalization

- Hard: one binary input (press only is allowed; hold/release optional), real-time action, 1980s arcade feel, browser, small slice.
- Tags (drawn with `node tools/pick-tags.mjs`, first draw): **radar**, **teleportation**.
- Free: theme, topology, progress conversion, information model.
- Assumed session: 1–4 minute runs, learnable in one run, mastery over dozens.

First obvious concept (recorded, then forbidden for half the roots): *radar shows enemies, press to teleport away from them* → `evade + survive + collision`.

## Coverage plan (pre-assigned neighborhoods)

| slot | primary op | progress | risk coupling | info |
|---|---|---|---|---|
| R1–R3 | evade | survive | independent / opportunity-cost | local |
| R4–R6 | intercept | chain | same-action-creates-risk | delayed |
| R7–R8 | route | deliver | reward-consumes-safety | stale |
| R9–R10 | trade/swap | exhaust-opponent | hazard redirect | hidden |
| R11–R12 | construct | territory | delayed-debt | predictive |

## Root records (normalized)

Signature order: time / control / state / op / progress / risk / info / failure / skill.

| id | core | signature | guard result |
|---|---|---|---|
| R1 | Radar reveals hunters; press teleports a fixed hop in the facing of the sweep to dodge. | rt / indirect-avatar / cont / evade / survive / independent / delayed / collision / timing | **weak**: survival-only scoring, press value = "get away", agency collapse likely |
| R2 | Sweep line itself is the lethal detector; press blinks across it. | rt / avatar / cont / evade / survive / independent / perfect / collision / timing | **hard_reject**: fixed-interval press matches beam period → state-blind policy dominates |
| R3 | Stealth sub in a dark maze, ping reveals walls, press teleports N cells forward. | rt / lane / grid / evade / race / opportunity-cost / local / collision / memory | weak: memory-driven, authored maps needed (budget) |
| **R4** | Sweep rotates around your ship; press teleports you to the beam tip at fixed range; landing on a real enemy destroys it (telefrag) and its burst chains. Enemies are seen only as fading blips. | rt / indirect-avatar / cont / intercept / chain / same-action-creates-risk / delayed / collision+edge / timing+prediction | **survives** |
| R5 | Static radar station; press drops a teleport-mine at the beam tip; mine detonates later. | rt / cursor / cont / intercept / collect / opportunity-cost / delayed / overflow / prediction | duplicate-neighbor of R4 minus self-risk (4/5 equal) → **duplicate** |
| R6 | Press swaps your position with the most recently painted blip; enemies fire at where you were. | rt / selection / cont / trade / exhaust / hazard-redirect / delayed / collision / prediction | **survives** (weak: target choice is automatic) |
| R7 | Courier blinks between radar beacons; sweep marks which beacon is safe this revolution. | rt / selection / graph / route / deliver / reward-consumes-safety / stale / deadline / planning | survives (weak: small action space) |
| R8 | Rescue: radar pings stranded pods; press blinks to pod and back, carrying it; each carry leaves you exposed. | rt / indirect-avatar / cont / route / deliver / reward-consumes-safety / delayed / collision / prioritization | neighbor of R4 when pods replace enemies; kept as full-game content idea |
| R9 | Role reversal: *you* are the blip on the enemy's radar; hunters converge on your last-painted position; teleport baits them into each other. | rt / indirect-avatar / cont / trade / exhaust / hazard-redirect / hidden / collision / prediction | **survives** |
| R10 | Press teleports each hunter one hop toward the sweep line; collisions between them score. | rt / global / cont / transform / chain / delayed-debt / perfect / overflow / timing | weak: output hard to read, no avatar |
| R11 | Each teleport drops a relay; triangles of relays enclose territory; enemies cut links. | rt / placement / graph / construct / territory / delayed-debt / perfect / depletion / planning | **survives** (weak: slow payoff) |
| R12 | Radar has a blind sector that rotates; press teleports into the blind sector to hide. | rt / avatar / cont / evade / survive / opportunity-cost / hidden / collision / timing | duplicate of R1 |

## Mutation round

- **R4 → R4a (topology/risk)**: add a lethal scope edge — a landing outside the scope loses the ship. Expected change: mashing/fixed-interval pressing random-walks off the scope; the beam's direction now matters both for offense and for staying centered. New risk: harsh failure if tip-outside state is unreadable → tip must change colour when outside.
- **R4a → R4b (hazard transformation)**: telefrag bursts destroy nearby enemies, chaining. Homing hunters cluster around you; the cluster is the reward only when it is at jump range. Expected change: "let them close, blink out, blink back into the swarm when the beam comes round" becomes the expert pattern — large consequence from one press.
- R9 → R9a (reduction): drop enemy radar, keep "hunters chase your old position". Mapped onto R4b's homing lag → merged (turn-limited homing).
- R6 → R6a: player chooses swap target by timing (beam). Becomes neighbor of R4b → duplicate.

Stop: new children map onto R4b's signature; remaining uncertainty (timing window width, readability of stale blips) needs play.

## Final slate

| id | hypothesis | strongest evidence | main risk | next question / smallest test |
|---|---|---|---|---|
| **R4b** | Timing a fixed-range teleport against a rotating sweep, under stale radar information, produces state-dependent offense/escape decisions | idle dies to homing hunters; mashing random-walks off the lethal edge; value of a press depends on beam angle × enemy distance × edge distance | hit window may be too narrow to feel intentional; stale blips may read as noise | playable scope slice + bot policies (idle / mash / fixed interval / greedy-aim) |
| R9 | Baiting hunters into collisions via teleports | hazard redirect is strong | control is indirect, hard to read | prototype with visible hunter radar |
| R7 | Beacon routing under revolving safety info | clear readability | tiny action space | paper sim of beacon graph |
| R11 | Relay territory built by teleport history | persistent player-made state | payoff too slow for arcade | grid sim |

`status: review_pending` (non-blocking). Selected for the slice: **R4b**, because its key uncertainty — whether a single fixed-range blink timed against a sweep can carry both attack and escape — is the core of the full game and can only be resolved by play.

## Stress test of R4b (`stress-testing-game-concepts`, verbal pass before implementation)

Causal model: press → ship relocates to `pos + R·dir(θ_sweep)`; any hunter within the telefrag radius of the landing point is destroyed and bursts; bursts destroy hunters within burst radius (chain). Hunters home with limited turn rate; contact kills the ship; a landing outside the scope kills the ship. Hunters are only drawn as blips painted by the sweep.

| claim | attacking policy / trace | verdict |
|---|---|---|
| idle loses | NoInput: hunters reach the stationary ship in (spawn distance)/speed ≈ 5–7 s | survives (to confirm by sim) |
| mashing loses | Spam: consecutive landings rotate slowly with θ → curved random walk of step R; edge is ≈ 2.5 R from centre | survives (to confirm by sim) |
| fixed-interval loses | **Ping-pong**: press at θ₀ and θ₀+π every half revolution → shuttles between two points, never exits scope | **weak**: can survive a while with no targeting. Score must be starved rather than death-guaranteed: survival earns nothing and sector progress needs kills; hunters keep spawning so the population grows until the shuttle's landing points are covered. Needs sim confirmation. |
| press value is state-dependent | State A: hunter 1.0 R away, beam 40° short of it → wait then press (attack). State B: hunter 0.2 R away, beam pointing inward → press now with no target (escape). State C: hunter adjacent, beam pointing past the edge → pressing is death; must wait or accept contact | survives (three reachable states, three different correct actions) |
| skill beats greedy aim | Greedy = "press when beam tip crosses a fresh blip". Expert additionally predicts approach during the beam's travel, escapes early, and uses blink-out/blink-back to hit clusters | unknown → bot comparison (greedy vs cluster-aware) |
| failure non-arbitrary | edge death readable only if tip marker changes when outside | unknown → visual check |

Invariants to implement (`implementing-gameplay-invariants`):
1. Score only on telefrag/burst kills, never on survival time or presses.
2. A hunter can be scored once (killed flag checked before scoring; removed same tick).
3. Sector advances only when its quota of hunters is destroyed; the spawner keeps running (up to a live cap that grows with sector) so stalling adds pressure.
4. Landing outside the scope radius = ship lost, checked on the same tick as the press.
5. Press during respawn/READY is ignored (no buffered free jump).

## Revision R4b → R4c (after human feedback)

- Feedback: killing by landing on a hunter reads as a hairline difference from contact → unconvincing.
- Rule change: the blink fires a shot from the landing point along the sweep; landing within 16 units of a hunter is a crash.
- Expected behaviour change: attack requires the target to be beyond jump range + 24 (you must blink *toward* it, closing distance). The inside-ring "escape only" category survives; the bounce-back setup now requires escaping earlier (hunter at 70–100 instead of ~40).
- New risk found in sim: a fixed-width bullet shrinks the angular window with range (±26 ms at 200 units). Fix: widening wavefront (half-width 20 + 0.14·travel) keeps ≈ ±45 ms.
- New trap found in sim: escaping from a very close hunter leaves it at ≈114 units when the beam returns — exactly the landing point. Made readable by the red "too close to shoot" colouring.

## Revision R4c → R4d: escalation as uniform game speed

- Issue: sector escalation only raised hunter speed (with a 36 → 47 jump at sector 2) against a fixed sweep, so the spatial rules of thumb drifted between sectors; a sweep-only speed-up drifted the other way.
- Rule change: one speed factor k(sector) = min(1.45, 1 + 0.07·(sector−1)) multiplies every rate (sweep, hunter speed/turn, spawn, shot speed, 1/blip life); distances are fixed. Live cap reduced to 5→8 so pressure comes mainly from speed.
- Evidence (sim, sector held fixed, 30 seeds): zero-noise radar bot hit rate 43→48 % under uniform k = 1→1.45 vs 43→30 % when only hunters speed up; kills/min 29.6→38.9 vs 29.6→22.8.
- Open question: the human limit of the shrinking window (±31 ms at cap) — needs play with `?speed=`.

## Revision R4d → R4e: sonar reveal on the shot

- Rule change: the shot's wavefront paints hunters within its hit band + 45 (once per shot, up to its hit point).
- Intended behaviour change: a miss is no longer wasted — it buys information along a chosen bearing, at the cost of the 110-unit blink it rides on. Probing shots become a legitimate option when the picture is stale.
- Evidence (sim, 40 seeds): radar-only model 10.0k → 16.1k, sector 3.4 → 4.3; policies that ignore information are unchanged (idle 0, spam 0, ping-pong 355), so the gain comes from reading, not from the input pattern.

## Revision → v6: time bonus vs chain (pacing decision)

- Proposal (user): gentle linear chains + a time-bonus bar → balance between immediate clearing and chain-seeking.
- Test: pilots differing only in patience (immediate / adaptive 50% / adaptive 25% / always patient), 60 seeds, true-position and radar-only.
- Finding: linear (and doubling) chains with a time bonus make "shoot now" dominant (1.5–3×). Only square chains (100n², cap n = 7) plus a 2 s per-extra-link refund of the bar produced an interior optimum (true-position: adaptive 49k vs 35–36k) / near tie (radar: 11.8–14.4k).
- Adopted square + refund; linear kept switchable. Causal link added: chains are score *and* time.

## Revision v6.6: human-error model, origin-shot rejected

- The existing bots never made the dominant human mistake (blinking next to a hunter). Added a fallible pilot (HUMAN in demo-bot.js: 70 ms timing noise, 0.25 s danger reaction, 50% lapse in checking the landing area, ±6 px blip misreads). Its deaths: ~94% landing crash + ~4% touched right after landing.
- Gauge retuned against it (par 10 s/hunter → ~60% bar left at clear).
- Proposal: fire the shot from the blink origin. Result: human-like sector 2.2 → 4.5, but blind half-turn rhythm 572 → 81,396 (2.7× the human-like pilot) because homing hunters crowd the space in front of the ship. Hard defect (state-blind policy dominates) → rejected; kept as an off-by-default switch.
- Non-exploitable lever measured: landing-crash radius 16 → 12 (human-like sector 2.2 → 2.75, ping-pong stays < 800). Pending decision.
