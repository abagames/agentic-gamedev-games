# OVERTURN — design search

Record of the concept search run with `exploring-game-design-space` before any code was written.
A surviving concept is a hypothesis worth a prototype, not a proven one.

## Brief

- Hard: pinball without flippers; the only control turns the whole playfield (after the rotating
  ground of Namco's *Assault*, 1988); built as an arcade game of that period.
- Free: what turning does to the ball, what counts as the drain, what converts to score, table shape.
- Reference kept at a distance: a turned maze that a ball rolls through to a goal (the obvious
  neighbour, and an existing 1989 game). At least half the roots were not allowed to be
  "roll the ball to an exit".
- Search budget reduced from the default 18 roots to 12, because control and genre were fixed by the brief.

Axes forced apart: what a turn does (aims gravity / moves surfaces into the ball / carries a held
ball), where failure sits (fixed to the table / fixed to the screen / made by play), progress
conversion (chain, deliver, survive, build-state), source of the ball's energy.

## Roots

| id | core | signature (operation / progress / risk / failure) | guard result |
|---|---|---|---|
| R01 | Round table, drain fixed to the table, bumpers score | evade / collect / independent / collision | **hard_reject**: holding the drain at the top is a state-blind policy that removes the only threat |
| R02 | Rim with fixed gaps; ball rests on the rim and slides as the table turns | route / survive / same-action-risk / collision | weak: a resting ball has no flight, so no timing; play is slow rolling |
| R03 | Surfaces carry the table's speed: turning into the ball bats it, turning away deadens it | intercept / chain / same-action-risk / collision | survives as a rule, not a game: needs a failure and a goal |
| R04 | Long table, camera on the ball, turn to steer the fall to an exit | route / race / opportunity-cost / deadline | **duplicate** of the reference |
| R05 | Enemies roam the table and the ball is the weapon | intercept / exhaust-opponent / adversarial / opponent | weak: with no avatar the enemies have nothing to threaten; unknown how they would create failure |
| R06 | Several coloured balls under one gravity, sorted into pockets | allocate / deliver / opportunity-cost / deadline | survives; unknown whether one input can serve three balls with intent rather than by luck |
| R07 | Lit pockets become holes after use | route / build-state / delayed-debt / collision | survives; merged into M1 |
| R08 | Spin for centrifugal force, drain at the hub | commit / survive / danger-enables-reward / collision | weak: a rotating picture does not show centrifugal force; value depends on presentation |
| R09 | Vanes lift a resting ball as the drum turns, then spill it | construct / deliver / delayed-debt / opportunity-loss | survives; slow, unknown whether a spill can be aimed |
| R10 | No drain; a clock, extended by targets | route / race / opportunity-cost / deadline | weak: the clock is unrelated to the turning; neighbour of R04 |
| R11 | Quarter-turn snaps, each a commitment | commit / solve / opportunity-cost / deadlock | survives as a puzzle; outside the brief's arcade feel (preference, not a defect) |
| R12 | Saucers catch the ball and fire it along a table-fixed line after a count | commit / chain / opportunity-cost / collision | survives |

## Mutations

- **M1 = R03 + R07, operator "hazard created by play" + "reduction".** The rim is the flipper and
  the drain at once: a live rubber rim returns the ball to the centre at a fixed speed (so the ball
  is always in flight and its path on screen is an ordinary parabola), a turning rim drags the ball
  sideways, and every bounce wears the section it lands on until the section is a hole. Expected
  change: idle now fails by itself (same section three times), and every landing asks which section
  pays for it. New risk: decline may be unavoidable and feel fatalistic.
- **M2 = M1 + "commitment".** Targets fall only when hit on the face turned to the centre. Expected
  change: the vertical bounce under a bank no longer scores, so the ball has to be thrown and the
  table brought round under it. New risk: the area under a bank becomes a trap.
- **M3 = R12 on a passive table** (gravity turns with the table, ball rolls and rests, saucers are
  the only launchers).

## Slate

| | OT-A WEAR RIM (M2) | OT-B SAUCER SHOT (M3) | OT-C DRUM (R09) | OT-D ONE GRAVITY (R06) |
|---|---|---|---|---|
| one_sentence_core | Turn the table so a standing rim section is under the falling ball and a target face is in its way; each landing spends the rim | Turn so the saucer points at a target when its count runs out | Turn to lift the ball on a vane and spill it onto targets | Turn so three balls each fall toward their own pocket |
| key_decision | which section takes this landing, which way the table is moving when it does | when to stop turning | how far to lift before spilling | which ball to serve now |
| state_read | ball's parabola, rim wear, which banks stand and which way they face | count, table angle | vane angle, ball position | three balls, three pockets |
| progress | drop targets; a finished bank rebuilds part of the rim | targets hit by fired balls | targets hit by spilled balls | deliveries |
| risk_coupling | same-action: every bounce that sets up a shot wears the rim | opportunity-cost | delayed | opportunity-cost |
| failure_shape | collision with a hole the player made | pit on the table | chute at the screen's bottom | wrong pocket |
| skill_channel | prediction + timing | timing | planning | prioritization |
| strongest evidence (reasoned, not played) | idle fails in three bounces; turning the nearest target to the ball is wrong, because that shows its back | one clear aimed shot per catch | energy comes only from the player | one input, several consequences |
| main risk | the economy between wear and repair may let a good player go on for ever, or nobody last | long dead time while the ball rolls | slow; a spill may not be aimable | the choice may be luck |
| open question | can a person read the landing and the throw quickly enough to choose a section? | is a catch-and-fire every few seconds enough play? | can a spill be aimed? | can one turn serve two balls on purpose? |
| smallest test | one table, three banks, rim wear, ladder of simulated players | one saucer, two targets | one vane | two balls, two pockets |

OT-A was built: it asks the question the brief turns on — whether turning alone can carry both the
aiming and the saving that flippers do — and it is the only one whose failure is made by play.
OT-B's saucer is kept as named content for the full game. Stress-testing as a separate pass was
skipped: the questions it would have raised about OT-A (dominant simple policies, endless play)
were answered by the simulated-player ladder on the build instead.

```yaml
human_review:
  checkpoint: post_exploration
  status: review_pending
  concept_ids: [OT-A, OT-B, OT-C, OT-D]
```
