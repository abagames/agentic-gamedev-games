# WRECKFALL — design search record

Skill: `exploring-game-design-space` (search budget reduced to 12 roots, 4 survivors,
1 mutation round; the brief fixes platform, era and fire direction). Follow-up checks from
`stress-testing-game-concepts` on the selected concept. `curating-game-concept-portfolio` was not
needed: there was no supplied pile of concepts to triage.

## Brief normalisation

- Hard: 1980s arcade, one fixed screen, the player shoots **upward only** (no aiming in other
  directions). Browser, keyboard (+ touch).
- Implied by era: movement + one button, lives, endless waves, readable at a glance.
- Free: what a shot *does*, what destruction produces, how progress converts, where danger comes
  from.
- Tags: none. The user's brief is specific enough (AGENTS.md: draw tags only for open briefs).

First obvious concept (recorded, then its tuple forbidden for half of the roots):
`R0 formation shooter`: destroy / exhaust-formation / adversarial fire.

## Root concepts (normalised)

| id | core | op | progress | risk coupling | topology | skill | status |
|---|---|---|---|---|---|---|---|
| R0 | shoot a descending formation, dodge its bombs | destroy | exhaust | adversarial | lanes | aiming/dodging | survives (baseline; close to Space Invaders/Galaxian) |
| R1 | shots split big descending balls into smaller ones | split | exhaust | same-action-creates-risk | continuous | prioritisation | duplicate of *Pang* (hard precedent) |
| R2 | shots decelerate and fall back: missed shots rain on you | intercept | exhaust | same-action-creates-risk (own miss) | continuous | prediction | survives |
| R3 | shooting a bomb reflects it upward into the formation | transform hazard | chain | danger-enables-reward | lanes | timing | survives |
| R4 | shots push enemies up instead of killing; crush them into the ceiling | push | territory | adversarial | columns | prioritisation | weak: repeat-fire under densest column dominates |
| R5 | shots paint enemies; same-colour neighbours pop | convert | chain | opportunity-cost | grid | planning | duplicate neighbourhood of *Puzzle Bobble* |
| R6 | a destroyed enemy becomes a falling wreck that smashes whatever passes under it, and lands in your column | destroy→chain | chain | same-action-creates-risk | moving lanes | timing + geometry | survives |
| R7 | shield overhead blocks bombs and your own shots; toggle | commit | survive | opportunity-cost | lanes | timing | weak: adds a button, decision mostly "shield when bomb" |
| R8 | shots stick to ceiling as stalactites that later fall | construct | build-state | delayed-debt | columns | planning | weak: delay is long and unreadable |
| R9 | harpoon rope stays between ship and hit point | construct | territory | opportunity-cost | continuous | positioning | duplicate of *Pang* harpoon |
| R10 | enemies tethered in pairs; kill one, the other swings down | transform | chain | same-action-creates-risk | graph | prediction | neighbour of R6, weaker readability |
| R11 | shots heat a lane; overheated lane collapses | allocate | chain | delayed-debt | lanes | prioritisation | weak: state-blind "spread fire" policy |

Removed: R1, R5, R9 (named precedents/duplicates); R10 collapsed into R6 (4/5 answers equal after
stripping nouns, R6 has fewer rules).

## Survivors and agency checks

- **R2 lob shots** — situation A: enemy below apex, fire now; situation B: enemy above apex, wait
  for descent or fire to catch it on the way down. Risk: own shot falling back. Unknown: whether a
  returning shot reads as fair.
- **R3 reflect bombs** — situation A: bomb dropped under a dense column, hit it to send it back;
  situation B: bomb under empty sky, dodge instead. Unknown: bomb frequency must be high, turning
  the game into a parry game rather than a shooter.
- **R6 wreck fall** — situation A: a slow lower lane is about to carry three enemies under a high
  target, wait and thread a shot up the gap; situation B: the formation is near the ground, take
  the lowest enemy now even with no chain. Cost: every kill drops a wreck back down toward your
  column, wider for each enemy it swallowed, so a big chain forces a committed escape.
- **R0 baseline** — kept only as the control.

## Mutation round (R6)

- `R6a` (delay consequence): wreck inherits half the lane's horizontal momentum and averages in
  every enemy it swallows. Expected change: the landing point is not your firing column, so the
  escape direction must be read (drift side vs. open side). Risk: harder to predict → mitigated by
  a ground marker showing the predicted landing span.
- `R6b` (reduction): one player shot on screen at a time, and wrecks absorb shots. Expected change:
  each shot is a commitment; you cannot spray a column, and your own wreck blocks re-fire in that
  column, so you must move after firing anyway.
- `R6c` (hazard transformation, rejected): wreck pushes the formation up on landing. Adds a second
  reward channel without a new decision; the wave-clear bonus already pays for a fast clear.

## Selected: R6 + R6a + R6b = WRECKFALL

Signature: realtime / direct-avatar (1-axis) / lanes / destroy→chain / chain /
same-action-creates-risk / perfect / collision+invasion / timing+geometry.

Stress-test (verbal, then executable — see README "Validation"):

| claim | attack | verbal status |
|---|---|---|
| idle loses | formation descends to the ground; bombs target the player | survives |
| mashing in place loses | each kill lands a wreck on your own column | survives (to be measured) |
| fire-then-sidestep does not dominate | it survives early but is slow; formation speeds up as it thins | unknown → bots |
| chains are worth waiting for | score k× for k-th enemy in a wreck, faster clear → clear bonus | unknown → bots |
| danger from wrecks is meaningful | wide wrecks + drift + bombs constrain escape | unknown → bots |

Human review: `status: review_pending` (unattended default assignment; non-blocking per AGENTS.md).

Smallest slice: endless waves of one 5-lane formation, one ship, bombs, wrecks. Resolves the key
uncertainty: does threading a shot so the wreck falls through traffic beat simply shooting the
nearest enemy, for both a strong and a human-limited player, and does the self-made wreck make
movement after every shot a real decision?
