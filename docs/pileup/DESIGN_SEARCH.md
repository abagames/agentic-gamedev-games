# PILEUP — design search record

Brief: "1980年代レトロアーケードゲームを制作せよ" (make a 1980s retro arcade game). The brief named a style only,
so tags were drawn once with `node tools/pick-tags.mjs`: **maze**, **car**.

Workflow: `exploring-game-design-space` (root batch, cheap guards, neighbour collapse), then structural fixes driven
by simulated players. The human review boundary was recorded as `review_pending` (non-blocking per AGENTS.md).
The person took part mid-run (see "Rally-X" below).

## Obvious first association (recorded, then forbidden for half the roots)

Rally-X: drive a maze collecting flags while faster pursuers chase you, using a smokescreen to stun them
(collect + evade, adversarial, timing). HEAD RUSH in `docs/` already covers Head On's lane-switching car game.

## Root concepts (normalized)

| id | core | operation | progress | risk coupling | topology | skill channel | status |
|---|---|---|---|---|---|---|---|
| R1 | Rally-X-like flag collection with pursuers | collect/evade | collect | adversarial | grid | timing | duplicate of the reference |
| R2 | Light-cycle: your exhaust trail builds maze walls that trap pursuers | construct | territory | same-action-creates-risk | grid | planning | weak: Tron neighbour |
| R3 | Parked cars are the maze; ramming shoves them and re-routes pursuers | construct/route | build-state | delayed-debt | grid | planning | survives, slow (puzzle pace) |
| R4 | Car without brakes: momentum carries you past junctions; turn timing is the skill | evade | survive | opportunity-cost | grid | timing | weak: no outward decision |
| R5 | **Pileup**: make pursuers crash into each other; wrecks block streets and catch more | route/predict | chain (pileups) | danger-enables-reward | grid | prediction/timing | survives |
| R6 | Delivery runs across a maze whose one-way streets flip on a timer | route | deliver | opportunity-cost | graph | planning | survives, low pressure |
| R7 | Each junction you drive through toggles a gate (Lady Bug's turnstiles, as a car) | transform | build-state | same-action-creates-risk | grid | planning | survives; close to Lady Bug |
| R8 | Dig new streets as a bulldozer; pursuers use them too | construct | survive | same-action-creates-risk | grid | planning | weak: Dig Dug neighbour |

Guards: R1 collapses into the reference. R4 fails the agency check (the only choice is timing a fixed turn). R2
and R8 are neighbours of existing classics, with the trail/dig doing the same structural job.

Slate kept: R5, R3, R7, R6. **R5 chosen for the slice**: it turns the hazard into the score source (hazard
transformation). It is also the only slate member under real-time pressure from the first seconds, and its
uncertainty (can crashes be caused deliberately?) can only be settled by building it.

## Mutations during the slice (each measured)

1. **Root R5, pursuers on the shortest road to you.** Every bot died in 4–13 s with zero crashes. Shortest-path
   chasers pincer you, and the only crash is two of them arriving at one junction within about 10 ticks.
   *Defect: crashes unreachable by play.*
2. **Cut-off targeting (pursuers head for your next junction).** Crashes appeared (strong look-ahead: 2–11 a run).
   The person then pointed out that **Rally-X already has enemy cars that collide and stall, and that it could
   hardly be caused on purpose**. Measured: the look-ahead valuing crashes and the one valuing survival only both
   made 6.4 vs 6.3 wrecks a minute. *Defect: crashes were incidental, Rally-X's failure exactly.*
   (My earlier claim that Rally-X had no such rule came from a search that was silent on it; corrected.)
3. **Locked goals plus roadblocks.** A far car locks a junction and drives there without changing its mind, then
   stops as a roadblock that the next car rams. Still equal: 8.2 vs 7.7 wrecks a minute, pileups never above 2.
   The lock target (the very next junction) moved every 3 tiles, so locks were scattered.
4. **Lock onto the end of your straight road, committed even into a wreck** (adopted). Driving straight now points
   every far car at one junction, and the marker count shows it. Survival-only vs herding look-ahead: median
   score 3,400 vs 8,500, cars per wreck 2.15 vs 2.27, best pileup 5. Built as `01-first-playable`.
5. **Police follow your tyre tracks** (adopted, build `tracks`). The person played `first-playable`:
   「人間が敵を誘導している感じが無い。勝手に目標地点に突っ込んで衝突している」 (no sense of luring; they run into
   their target junction and crash by themselves). Cause: the lock target was chosen by the rules from your heading.
   You never saw what you did that sent a car there, and the roadblock-plus-ram made cop-on-cop crashes automatic.
   Now a car that reaches your tracks drives them turn for turn, and the tracks are drawn on screen, red where a car
   still has to drive them. Crashes only happen where your route folds: a crossing taken through a gap in the line,
   or a double-back after a junction. Locks and roadblocks are removed. Evidence: 74 of 75 first impacts involve a
   tracked car. The flee policy (no folding) makes 2 wrecks in 6 runs. Cars per wreck rise to 3.2–3.8, best pileup
   8. Survival-only and pileup-valuing look-ahead now score 6,500 vs 7,900, because folding the line is also the
   only way to survive it.

## Review boundary

status: review_pending. `first-playable` was played by the person (comment above, no zip). `tracks` is handed over
for play; no approval is assumed.
