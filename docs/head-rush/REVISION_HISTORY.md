# HEAD RUSH revision history (human-directed changes)

HEAD RUSH was first generated end to end from a single instruction, and then revised in response
to instructions and observations from a human reviewer. This document reconstructs that revision
process, after the first generation, from the Claude Code session history.

- Covered: lane-change rules, courses, rivals, power and scoring, mode and lives, indicators and
  visuals, audio, game feel, bug fixes.
- Not covered: video and screenshot generation, the move to `docs/` and commits.
- Quotes are the reviewer's instructions, translated from Japanese.
- Numbers are bot measurements taken at the time, and many were superseded by later changes. See
  [README.md](README.md) for the current rules and measurements.

## Starting point (the first generated version)

The first instruction was: "Make a 1980s retro arcade game: a dot-eating game like Sega's Head On,
with the game speed and exhilaration raised in the way Pac-Man Championship Edition did." No tags
were drawn. The version reported as complete had these properties:

- Five nested square lanes, with red rival cars driving the opposite way, in a 3-minute score
  attack.
- **Half refresh:** clearing one half of the dots raises a flag on the other side. Taking it
  refills that half, raises the speed tier and adds a parked car.
- **Convoy:** driving over a grey parked car wakes it, and it joins the tail of the rival convoy.
- **Power:** the convoy turns blue and flees, and head-on hits score 200, 400, 800 and so on.
- A lane change moved one lane per gap at normal speed and was impossible while accelerating.
- A crash cost time and the convoy. There were no lives.
- Sound was an engine tone only. Near misses had a spark and a whoosh.
- Nobody had played it by hand yet.

## Sequence of changes

| # | Reviewer's instruction or observation | Outcome | Area |
|---|---|---|---|
| 1 | Head On let you cross several lanes at a gap at low speed; did you choose 1 lane, and 0 at high speed? | Multi-lane crossing when slow, 1 lane while accelerating | Lane change |
| 2 | Moving exactly one lane at low speed is hard | Second lane needs a 0.2 s hold | Lane change |
| 3 | What are the expansion options? Do them in order | Courses, TOUR mode, trucks, SWITCH bonus, name entry, BGM, gamepad | Several |
| 4 | Dots sticking out into the gaps should be fixed | Dots kept clear of wall openings | Bug |
| 5 | (pasted audio TypeError) | Broken setting fixed; settings check and audio guards added | Bug |
| 6 | Shouldn't the course change shape when a flag refills the other side? | Refilled half switches pattern | Courses |
| 7 | How about a line ahead of the player showing the predicted path to the next gap? | Path indicator added | Indicators |
| 8 | It's too faint to see. Fonts and characters are small and lack impact | Visual upgrade | Visuals |
| 9 | Is the one-way maze pattern too harsh a constraint? | UNDERTOW and LONG STRAIGHT softened | Courses |
| 10 | How often does the human-like bot miss in 3 minutes? I miss more than 20 times | Novice model added; easier opening and rival path offered | Difficulty |
| 11 | The enemy is a bit too fast; slow it firmly, and extend invulnerability after eating one | Rivals slowed, opening eased, rival path, post-eat grace | Rivals |
| 12 | A revived enemy sometimes appears right in front of the player | Spawn distance rules | Rivals |
| 13 | Would a bonus maze with many power pellets, as in Championship Edition, be good? | FEAST half-pattern | Power |
| 14 | Isn't the power time too short in the later stages? | Minimum power time raised from 2.4 s to 4.0 s | Power |
| 15 | How about 1 lane at high speed and at most 2 at low speed, for easier control? | Lane cap lowered from 3 to 2 | Lane change |
| 16 | I want a warning line on the purple enemy too | Truck warning line | Indicators |
| 17 | As the truck's reward, no points, but +1 to the starting multiplier for red cars | Truck gives chain +1 | Scoring |
| 18 | Does the power-rich stage come at a fixed interval, or randomly? Make it always appear | FEAST on flags 3, 7, 11, … | Power |
| 19 | Add lives and extends, and a game over other than time up | Lives, extends, GAME OVER | Mode and lives |
| 20 | Is 5 minutes needed? Limit it to 3 minutes, and adjust the speed | TOUR removed; 7 speed tiers | Mode and lives |
| 21 | Can you make driving chiptune BGM on 1980s arcade hardware terms? | Audio rebuilt on two emulated SN76489 chips | Audio |
| 22 | Are dots just before a lane change sometimes left behind? | Pickup also checked at the lane position | Bug |
| 23 | Sometimes the red enemy doesn't appear for a while | Leader respawn logic fixed | Rivals |
| 24 | Make the BGM more like trance techno, keeping the hardware limits | New arrangement on the same chips | Audio |
| 25 | Should the maze patterns be fixed? Fix them | Fixed pattern order | Courses |
| 26 | 3 lives, 3,000 points, then every 5,000 (up to 6) | Lives and extends reset | Mode and lives |
| 27 | Is the truck's multiplier increase clear to the player? Make it permanent | Permanent base multiplier with clearer display | Scoring |
| 28 | Show exact multipliers such as ×2, ×4; the base could be a separate ×1, ×2, ×3 | Score = 200 × base × chain, total capped at ×64 | Scoring |
| 29 | The course select on the title isn't needed; reconsider what the title shows | Cast table title | Visuals |
| 30 | Should a revived red enemy appear further away, around behind my car? | Spawn behind the player | Rivals |
| 31 | The power-up sound is wrong; change it so it doesn't disturb the BGM | Power sounds brought into key | Audio |
| 32 | The dot-eating sound is almost inaudible; adjust overall | Mix rebalanced | Audio |
| 33 | Is the speed rising a bit too fast? Should the timer run during a miss? | Step +18%; dead time after a crash cut | Mode and lives |
| 34 | Could the attract loop have a pure demo scene with no title or score table? | Three-scene attract loop | Visuals |
| 35 | The CLASSIC label isn't needed; a small red "!" appears; SPACE SPEED wording | Labels trimmed, "!" removed, "SPACE BOOST" | Visuals |
| 36 | List game-feel measures. Near miss is hard to understand, so remove it | Near miss removed; ten feel items built | Game feel |
| 37 | Isn't the purple enemy blue during power? | Blue body with purple stripes | Visuals |

## 1. Lane-change rules

- **Multi-lane crossing** ("Head On let you switch several lanes at a gap at low speed; did you
  decide on 1 lane at low speed and 0 at high speed?"): the one-lane rule had come from an
  unchecked assumption about Head On, and the zero-lane rule had been added to stop holding the
  accelerator from being optimal. On "adjust it; keep the original if it is better", three rule
  sets were compared with bots. Holding a direction now crosses several lanes at normal speed and
  one lane while accelerating. Rivals still move one lane per gap. The "accelerating, cannot turn"
  crash type, 41% of the human-limited bot's crashes, disappeared.
- **Hitting exactly one lane** ("the balance seems good, but moving just one lane at low speed is
  hard"): an ordinary key press of 0.1–0.15 s was being read as a hold. The second lane now needs
  the direction held for at least 0.2 s, and the blinker shows two dots once the hold is long
  enough. Bots tap for a single instant and cannot reproduce this problem, so the change rests on
  the play report.
- **Cap of two lanes** ("how about 1 lane at high speed and at most 2 at low speed, so the
  destination is easier to control?"): holding could cross three lanes, with only about 0.1 s
  between the second and third. The cap became two. The novice model's score rose about 40%, and
  the human-limited bot's results were unchanged.
- **Keys:** asked whether keys other than Space work, the answer was that Z, X and Shift already
  accelerate, and WASD already change lanes. The title keeps the single label "SPACE".

## 2. Courses and half-patterns

- **Four courses** (from "do the expansions in order"): CLASSIC, TWIN GATES, UNDERTOW (one-way
  gaps) and LONG STRAIGHT, defined as data. Turn frequency and crash rate differed by course in
  bot play.
- **Half switching** ("shouldn't the course switch to another shape when a flag refills the dots
  on the other side?"): a layout became two halves. Taking a flag switches the refilled half to a
  different pattern while the other half keeps its gaps and dots. A fifth pattern, LADDER, was
  added. The lanes never change, so the cars keep driving.
- **Softening harsh patterns** ("is the one-way maze pattern too harsh a constraint?"):
  measurement showed UNDERTOW was slow and trapped the player (21% of its crashes were
  unavoidable), and LONG STRAIGHT was worse for fairness (51%). On "apply it", UNDERTOW kept its
  inward-only entrances but got two-way side gaps, and LONG STRAIGHT got a centre gap for the
  inner lanes. Unavoidable crashes fell to 8% and 32%.
- **Fixed order** ("should the maze patterns be fixed, or is random fine?"): random order
  explained only 2–3% of the variation in crashes, but a fixed order lets players plan and makes
  the ranking fair. On "fix it", patterns now change in a set order from easier to harder.

## 3. Rivals

- **Purple trucks** (from the expansion list): a truck never changes lane, and appears from speed
  tier 3. A rival type that lies with its blinker was left out because it would break the core
  read.
- **Slower rivals and an easier opening** ("the enemy is a bit too fast; go with both, but slow
  the enemy firmly, and extend invulnerability a little after eating an enemy so a following one
  doesn't revive and hit you"):
  - rivals start at 75% of the player's speed instead of 100%;
  - the chance that a rival steers onto the player's lane starts at 30% instead of 55%;
  - the blinker appears earlier and became an amber arrow;
  - red dashes show the rival's path to its next gap;
  - for 0.8 s after eating a rival the player cannot crash.
- **Spawn in front of the player** ("a revived enemy sometimes appears right in front of the
  player"): a new leader could appear 20 px away. It must now appear at least 110 px away and not
  in the player's lane ahead, and it flashes and waits 0.75 s before it can hit.
- **Red car missing** ("sometimes the red enemy doesn't appear for a while"): waking parked cars
  kept resetting the wait for a new leader. The longest gap without a red car outside power went
  from 9.9 s to 1.4 s.
- **Spawn behind the player** ("should a revived red enemy appear further away, around behind my
  car?"): a version that places it where the time to meeting is longest was measured first, then
  switched on with "enable it". The novice model's crashes with a newly appeared car fell from 38
  to 20.

## 4. Power, FEAST and scoring

- **FEAST** ("Championship Edition sometimes had a kind of bonus maze with lots of power cookies;
  would that be good to have?"): added on the condition that it changes how you play. A FEAST half
  has a power pellet on every lane corner, fewer dots and gold walls. Its power is short but
  stacks, so routing pellet to rival to pellet is the skill.
- **FEAST schedule** ("does the power-rich stage come at a fixed number of patterns, not
  randomly?"): it had a 50% chance once eligible. On "make it always appear; set the interval
  appropriately", it now comes on flags 3, 7, 11 and so on.
- **Power duration** ("isn't the power time too short in the later stages?"): the share of cars
  eaten per power fell from 92% at the first tiers to 59% at the last. The minimum duration went
  from 2.4 s to 4.0 s.
- **Truck reward** ("as the reward for beating the purple truck, no points, but +1 to the
  starting multiplier when beating red enemies"): built as described, first as a one-time boost
  that carried over to the next power.
- **Clarity and permanence** ("is the base multiplier increase from the purple enemy conveyed
  clearly?" and "make it permanent"): the increase was not clear, for five listed reasons. The
  bonus became permanent for the run and is lost on a crash. During power the truck stays visibly
  special with a "+1" above it, and eating it shows the new multiplier in purple with its own
  sound.
- **Cap check** ("if red cars go ×2, ×3, ×4, could the truck's cap be higher? Verify it"): a
  linear chain was compared with the doubling chain at several caps. Linear scoring made caps
  irrelevant but cut scores by about 40% and flattened the big chain, so doubling was kept.
- **Exact multipliers** ("the current form is fine, but I want the displayed multiplier to be
  exact, like ×2, ×4; the base could be ×1, ×2, ×3 so that ×2 gives ×4, ×8"): a red car now scores
  200 × base × chain, and the exact figure is shown. Separating the two factors let the oracle's
  score roughly double, so on "change to the recommended form" the base cap was removed and the
  ×64 limit was applied to the total multiplier.
- **SWITCH bonus** (from the expansion list): eating a car after changing lane mid-chain doubles
  that car.

## 5. Mode, lives and pacing

- **Calibrating to the player** ("how often does the current human-like bot miss in 3 minutes? I
  miss more than 20 times"): the human-limited bot crashed far less than the reviewer. A novice
  model and an "ignore the rivals" baseline were added to the ladder, and later difficulty
  decisions report all of them.
- **TOUR mode** (from the expansion list): a 5-minute mode was added, then removed. Asked "is 5
  minutes needed? How about limiting it to 3 minutes?", measurement showed no bot survived to 5
  minutes once lives existed, and half switching had removed its other difference.
- **Lives and extends** ("add lives and extends, and a game over other than time up; what
  starting lives and extend settings are best?"): crash times from bot runs were replayed against
  many settings. The values changed three times:
  - 5 lives, extends at 10,000 and every 30,000 after;
  - 6 lives, after the speed tiers were compressed;
  - 3 lives, extends at 3,000 and every 5,000 after, up to 6, chosen by the reviewer from a
    table of options for "3 lives with frequent extends".
- **Speed curve:**
  - With the move to 3 minutes only, ten tiers of +15% became seven tiers of +25%, so a practised
    player reaches top speed. Rival aggression per tier was reduced to compensate.
  - On "is the speed rising a little too fast?", the step became +18%, for a top speed of 2.26×
    the starting speed.
- **Timer during a miss** ("should the timer run during a miss? If so, shorten the blank time at
  game start and restart"): the timer keeps running. Time lost per crash went from 2.2 s to
  1.25 s, and READY from 2 s to 1.5 s.

## 6. Indicators and visuals

- **Path indicator** ("when the player is in a gap and just before it, how about a line ahead of
  the player predicting the path to the next gap?"): a dashed line shows where the current input
  will take the car. It is computed by running the real game logic ahead, so it cannot disagree
  with the game.
- **Visual upgrade** ("it's faint and hard to see. Should the visuals be expanded in a 1980s
  arcade style now? The font and characters are small and lack impact"): drawing only, with no
  change to collisions or numbers. The font went from 3×5 to 5×7, cars from 9×7 to 13×9 with
  stripes and headlights, walls to double lines, and dots, pellets and the flag were enlarged. The
  path indicator became bright flowing dashes.
- **Truck warning line** ("I want a warning line on the purple enemy too"): a purple dashed line
  covers the stretch of its lane the truck will drive in the next 1.5 s.
- **Title screen** ("the course select on the title isn't needed; reconsider what the title
  shows"): every run starts from CLASSIC and there is one ranking. The title shows a cast table of
  the real sprites with one line each.
- **Attract loop** ("could there be a pure demo scene with neither the title nor the high-score
  table?"): the loop is now title and cast, 20 s of demo play with no logo, then the top five.
- **Small labels:**
  - "The CLASSIC label isn't needed": the course name at start was removed, and half-pattern
    names show for 3 s after a change only.
  - A small red "!" over a woken parked car was removed on "remove it".
  - The controls line became "SPACE BOOST", because "SPEED UP" already describes the flag.
- **Truck during power** ("isn't the purple enemy blue during power-up?"): it had been kept
  purple on purpose. Of two options the reviewer chose a blue body with purple stripes, keeping
  the "+1".

## 7. Audio

- **Hardware-accurate rebuild** ("can you make chiptune BGM with a sense of speed that suits this
  game, on the terms of 1980s retro arcade hardware?"): the earlier sound used browser oscillators
  freely. Of two options the reviewer chose two chips. The audio now emulates two SN76489A chips,
  the configuration of Sega's System 1 board as checked against MAME's source, with one chip for
  BGM and one for effects and the engine. A 60 Hz driver writes pitch and volume.
- **Trance arrangement** ("I want the BGM more like trance techno, keeping the hardware limits
  and the chiptune character. Would making it C64-like be good?"): it was not moved toward the
  C64, because the SID's trance character comes from filter and pulse-width features these chips
  lack. The same chips now play a four-on-the-floor kick, off-beat bass, a gated arpeggio and a
  lead, with layers added by speed tier.
- **Power sounds** ("the sound on power-up is wrong; change it to one that doesn't disturb the
  BGM"): the pickup sound was an augmented chord and the power melody a chromatic siren, both
  clashing with the A minor tune. They and the other out-of-key effects were moved onto the A
  minor scale, and a test checks this.
- **Mix** ("the dot-eating sound is almost inaudible; adjust overall"): the dot sound was 10.5 dB
  below the BGM and 0.03 s long. The BGM was lowered one step, short effects were raised, the dot
  sound was moved an octave above the melody, and the overall level was raised without clipping.

## 8. Game feel

Asked for game-feel measures, a list was proposed against the game's intended sensation. The
reviewer's first reply was about one item on it.

- **Near miss removed** ("near miss is hard to understand in the first place, so shouldn't it be
  removed as a game rule?"): it was an effect, not a rule, and its trigger did not match a real
  dodge. It fired when simply passing in the next lane and could fail to fire on a true escape. It
  was removed with its sound.
- **Feel pass** ("regardless of near miss, proceed in priority order"), all drawing and sound:

| # | Item | Status |
|---|---|---|
| 1 | An eaten car stays at the impact point during hit-stop, then spins off the course, faster for longer chains | Built |
| 2 | The blinker lights on the frame the key is pressed, with a short sound when the second dot arms | Built |
| 3 | The car tilts toward the new lane, leaves tyre marks, and a second lane adds a pitched sound | Built |
| 4 | Exhaust trails while accelerating, longer at higher tiers | Built |
| 5 | Consecutive dots climb the scale and reset on a lane change | Built |
| 6 | Clearing a half flashes the walls and sends a spark to the flag, which drops in | Built |
| 7 | A speed-up sweeps light from the outer lane inward | Built |
| 8 | A crash freezes briefly, then throws both cars along the impact direction | Built |
| 9 | Power turns the convoy blue from the front car to the last | Built |
| 10 | The last 5 seconds show the time enlarged in red | Built |
| — | Easing on the sideways slide | Reverted |

- The easing was reverted because collisions use the drawn position, so changing the motion
  changed hit timing. The human-limited bot's score fell from 60.3k to 45.5k with it.
- The reviewer's verdict was "the playtest is OK". Tests for the new effects were then added, and
  writing them exposed a bug where an eaten car started moving one frame before hit-stop ended.

## 9. Bug fixes

- **Dots in the gaps** ("dots sticking out a little into the gaps should be fixed"): dots now
  start at least 16 px from a gap's centre, and a test checks every course.
- **Audio TypeError:** this came from an edit made during the previous fix, where a comment
  disabled part of the settings line and the speed tier became NaN after a crash. The game now
  checks every tuning setting on load, and the audio skips invalid values.
- **Dots left behind after a lane change** ("on some stages, is a dot just before the lane change
  left unpicked?"): pickup used the drawn position, which was still sliding. 4.2% of dot passes
  were missed, all during the slide. Dots and flags are now picked up at either the drawn or the
  lane position. Rechecking with more runs also corrected an earlier survival figure that had been
  optimistic.

## Not adopted

| Idea | What happened |
|---|---|
| No lane change while accelerating | Replaced by one lane while accelerating |
| Crossing up to three lanes | Reduced to two for control |
| Rival that signals falsely | Not built; it would break the core read |
| Gap highlight when time is short | Judged ineffective and skipped |
| 5-minute TOUR mode | Built, then removed |
| Random FEAST and random pattern order | Replaced by fixed schedules |
| One-time truck bonus with carry-over | Replaced by a permanent base multiplier |
| Linear chain scoring | Measured and rejected; the big chain lost its payoff |
| C64-style sound | Declined; the chosen chips have no filter or pulse-width control |
| Course select on the title | Removed |
| Near-miss effect | Removed as unreadable |
| Eased lane slide | Reverted because it changed collision timing |

## Validation notes

- At the end of these revisions the suites pass: rules 101, audio 36, browser 49, input devices
  10, and feel 27.
- Difficulty figures come from a ladder of bots: an oracle, a human-limited bot, a novice model
  and baselines that ignore rivals or do nothing. Several changes rest on the reviewer's play
  reports instead, because the bots could not reproduce the problem.
- Hands-on confirmation is limited to the reviewer's observations quoted above, including "the
  playtest is OK" after the feel pass.
- Gamepad and touch input were checked with simulated input only.
