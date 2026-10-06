# OVERTURN — revision history

## Intent

Flipperless pinball in which turning the table is the whole game: it decides which rim section pays
for each landing, what stands in the ball's way, and which way the ball is thrown.

## Before the first handover (slice)

Evidence is `node tests/balance.cjs` (medians over 6-8 seeds) unless stated.

1. **Targets fell by accident.** With targets that fell from any side, idle completed 8 banks and
   every policy below the look-ahead one lived about 30 s. Cause: a bank turned to the bottom sits
   in the vertical bounce. Change: targets fall only from the face turned to the centre.
2. **Pop bumpers rewarded doing nothing.** With three bumpers, idle scored 14,100 and the modelled
   person 61,890; without them 1,400 and 200,400. Cause: the bumpers threw the ball onto faces at
   random and broke up planned shots. Change: bumpers removed from the slice (`C.BUMPERS = 0`; the
   rule stays in the core for the full game).
3. **The strong player never lost.** A finished bank rebuilt the whole rim. Change: a bank puts
   back a fixed number of bounces, weakest section first, and the number falls from 8 to 1 over the
   first fifteen banks. The strong player now ends at a median of 167 s; `tests/deaths.cjs` finds
   none of its nine lost balls avoidable from 1.5 s earlier (the rim held 0-1 bounces each time).
4. **Banks came every two seconds.** Change: a finished bank stays down for 4 s (was 1.5 s), so
   the table's state differs from bank to bank.

Tried and not adopted: rebuilding the rim to a per-level budget (hid the cost of a bank);
a 7 s bank delay (the strong player's pace fell with no change in how the others fared).

Never measured: a person at the controls. Turn rate, throw strength and the size of a rim section
are chosen from the modelled players only. Difficulty is uncalibrated.

---

# Finishing (stage 2), with `refining-game-prototypes`

- **Intent:** juggling a ball on a floor you are spending, and swinging the room round so the ball
  comes down on the one thing that buys the floor back. Core interaction: choosing the landing
  (which section, table moving or still).
- **Run structure:** an endless score attack on one table, with pressure that keeps rising; three
  balls and a capped number of extends. No ending, by intent (pinball).
- **Starting state:** build `02-slice` (above). First playable copy: `tmp/snapshots/overturn/01-first-playable`.
- **Direction from the user:** pinball-style bonuses, multiball and extends on a single table;
  references checked on the web; rules to be explained the way *Digital Pinball: Necronomicon* does.
- **References checked (web):** *Necronomicon* shows no dot-matrix panel; illustrated banners pop up
  in the margins, arrows flash on the table when an objective is lit, pausing shows instructions
  and current values, and each table has a multiball. *Assault* ran on Namco System 2 with a
  vertical 224x288 screen, a YM2151 and a 24-channel PCM chip. Consequences here: the screen was
  turned to 224x288; rules are shown by a notice strip, table chevrons and a pause sheet.
  What I could not confirm from the pages reached: the detailed rules of each *Necronomicon* table.

Evidence is `node tests/balance.cjs` (medians, 8 seeds, same seeds per comparison) unless stated.

## Stage 1 — structure

### The modelled person was better than the person
- **Stage / question:** 2 — is there a modelled player near the reporter's level? (taken first, since every later figure rests on it)
- **Source:** play report on build 02-slice: `progress=8 score=48100 time=50 fail=drop:1,fling:2`
- **Observation:** on that build `novice` gave 59 s / 11 banks / 83,400 and `human` 77 s / 17 / 155,700 (16 seeds).
- **Options:** (a) weaken `novice`; (b) add a rung below it and keep the others as better players.
- **Decision / change:** (b). `player`: a decision every 0.33 s, 0.3 s late, 22 % speed misreading, 25 % lapses.
- **Before → after:** on 02-slice `player` gives 50 s / 8 banks / 46,300.
- **Status:** kept. One report only: the direction of the error is known, its size is not.

### No danger early, and the decline was a number
- **Stage / question:** 1 — is the primary threat present when the design says it should be?
- **Source:** `tools/audit.mjs` on the slice: no hole for up to 36 s (`human`) and 53 s (`strong`);
  the slice report also listed "repair shrinks by a table of numbers" as a weakness.
- **Cause:** a bank repaired 8 landings whatever the player had done.
- **Options:** (a) start with a thinner rim; (b) a lower repair table; (c) make repair something the
  player builds on the table: one landing per section landed on since the last bank.
- **Decision:** (c), by rule 1 (change what a position costs before adding anything): it ties the
  repair to the landing choice and removes the hidden table.
- **Change:** section lamps; repair = lit lamps.
- **Before → after:** `player` 48 s / 31,900 → 49 s / 27,000; `human` → 80 s / 138,800; `strong`
  no longer ended (3 of 3 capped at 400 s): with repair equal to distinct landings, perfect play breaks even.
- **Status:** kept, with the next entry as its consequence.

### With lamps, the strong player never ended
- **Stage / question:** 2 — endless run: does pressure keep rising?
- **Options:** (a) bring back a shrinking number; (b) every Nth bank removes a section for good.
- **Decision / change:** (b), every 4th bank, weakest section, down to a floor (set in stage 2). Visible on the table and scales with achievement, not with time.
- **Before → after:** `strong` ended at 362 s (every 3rd) and 375 s (every 5th) with a floor of four sections; `player` unchanged at 49-52 s.
- **Status:** kept at every 4th bank. Reopened below after multiball and extends.

### Does simple play lose? (re-asked on the final rules, shared ladder, 16 seeds, means)
idle 23 s / 988; greedy 24 s / 1,275; wiggle 31 s / 4,913; hold 33 s / 14,344; mash 42 s / 24,425;
stepper 45 s / 29,050; `player` 51 s / 49,400; `novice` 71 s / 102,806; `human` 108 s / 238,431.
**Yes**, but random input reaches half of the fitted player's score — recorded as open below.

### Are failures preventable?
`tests/deaths.cjs`, 4 seeds, rewinding 1.5 s: all 19 balls lost by `human` and all 14 lost by
`player` could have been kept by some input. **Yes** on the final rules.

## Stage 1b — content, one element at a time

Each row was switched on alone over lamps + torn sections (`player` / `human`, time and score).

| Element | Seen on screen | Changes the best action | Measured | Kept |
|---|---|---|---|---|
| Base | | | 41 s 27,700 / 56 s 54,600 | |
| Hub lock and multiball | hub ring and chevrons, held ball, second ball, purple table | yes: stop turning and land at the bottom to go up the middle, against throwing for faces; then two landings to serve | 41 s 21,200 / 78 s 283,500; `human` 6.1 locks, 2.8 multiballs, 4.3 jackpots a game | yes |
| Save for a full circle of lamps | cyan ring on the hub | — | 0-0.25 full circles a game on every rung: it never happened | **no**: could not be seen (rule 2) |
| Skill shot (lit the hub) | flashing section, chevrons | yes: turn during READY and read the launch | `human` 1.4 a game | reworked: it now stores the save instead |
| Skill shot stores a save | as above, plus the ring | yes | idle made 0.77 a game by luck → section now chosen away from the bottom and never under a bank → idle 0; `player` 1.0, `human` 2.8 | yes |
| Extends at 100k / 300k | | — | `player` never reached one | moved to 50k / 150k / 400k / 1M, four at most |
| Pop bumpers | | | rejected in the slice (entry 2 above); not retried | no |
| Modes (roof break, chase, hurry-up) | | | not built | see Not adopted |

## Stage 2 — difficulty and progression

### The strong player never ended again
- **Source:** `strong`, 4 seeds, capped at 1,200 s: 304 banks, 6.4 million, 112 multiballs, 4.5 extends, all four capped.
- **Cause:** an extend every 300,000 for ever, and a floor of four sections it could hold.
- **Change:** four extends at most (50k, 150k, 400k, 1M); floor lowered to three sections.
- **Before → after:** floor three: median 1,131 s, 274 banks, one of three still capped at 1,500 s — it held three sections behind a near-permanent multiball (115 a game). Second attempt, floor two: 672 s. Floor one: 267 s (255-457), 70 banks, 1.6 million, none capped. The other rungs never reach the floor (`human` loses 4 sections a game).
- **Status:** kept at a floor of one section (two attempts). The strong player now ends in about four and a half minutes.

### Lives and extends
`player` earns 0.5 extends a game, `novice` 0.6, `human` 2.0. First ball lasts 27 s for `player`.

## Stage 3 — presentation

Passes made with `directing-game-visuals`, `maximizing-game-feel` and
`designing-retro-arcade-sound-kits`; the results and what each left out are in `VISUAL_DESIGN.md`
and `AUDIO.md`. The rules core was not edited during these passes; the seeded ladder is the one above.

- Screen turned to 224x288 with a top strip and a notice strip.
- Notice strip, table chevrons, pause rule sheet, attract loop (title, rule sheet, demo, best five).
- Every event given an answer or an explicit "none"; strongest reserved for jackpot and a torn section.
- Sound rebuilt as programs rendered through one chain so levels can be measured; music added.
- Frames inspected by the author: title, rules, demo, best five, ready, pause, bank, lock,
  multiball, torn section, saved, bonus, game over (`evidence/b-*.png`).
- Left unknown: whether an outsider can name every HUD element (`auditing-game-screen-readability`
  and `gating-intent-legibility` were not run: no finding called for them, and they need a reader
  who has not seen the design).

## Stage 4 — cleanup

- A ball fired from the hub cannot be caught again until it has left it (found when a saved ball was re-locked at once).
- A bank does not stand up through a ball.
- Counters: bonus multiplier and target count start again with each ball; locks and a lit hub are cleared when a ball is lost.
- Unused sound (`hub:lit`) and the unused full-circle award removed.

## Not adopted

| Idea | Why |
|---|---|
| Save for lighting all twelve lamps | happened 0-0.25 times a game; invisible in practice |
| Extends every 300,000 without limit | made the strong player endless |
| Pop bumpers | rewarded idle play in the slice |
| Roof break, chase, spinner, hurry-up, blackout modes | proposed in the design discussion; not built. The hub, multiball, skill shot and torn sections already change the best action in each stretch of a run; these remain candidates |
| Three-ball multiball | two parabolas are already unverified for a person |
| Initials entry | the best five are kept as scores only |
| Guide line for the ball | it would make the landing choice for the player |

## Validation notes

- Measured: the ladders above; rule conformance (31 checks); sound length, level and key; browser flow with real key and pointer events.
- Inspected in frames only: layout, notices, chevrons, colours.
- Nobody has played build 03-full or heard its sound.
- **Calibration:** calibrated against one play report on build `02-slice` (the `player` rung). Build `03-full` is uncalibrated: its new rules have no report.
- Open: random input (`mash`) scores half of the fitted player; the area under a bank still punishes the natural move of bringing a target to the ball.

---

# Rounds and the dot display (build 04-rounds)

## Play report on 03-full

`RUN v1 build=03-full progress=5 score=59100 time=50 fail=fling:2,drop:2`

On that build the `player` rung gives 51 s / 5.2 banks / 49,400 (16 seeds): the rung fitted on the
slice still fits, without refitting. Four balls lost in 50 s means one extend was reached, as the
rung predicts (0.5 a game). No change made on this report.

## Reference checked again (web)

A Japanese strategy page for *Necronomicon* gives the structure of its "rounds": complete a named
target set to make a round READY, then put the ball in one named place to START it; the rounds
come in a fixed cycle (a timed sequence of shots with rising values, a value that counts down and
is collected on a shot, small multiballs, a target that pays 5M, 10M, then an extra ball), and
multiballs are reached by spelling a word a letter at a time. That is the pattern used here:
spell a word with falling faces, a place lights, landing there starts the next round of a cycle.
On the display: every page I reached says banners and table arrows "rather than a traditional
DMD"; the user describes it as a dot matrix. I could not see the screen, so the display was built
as asked.

## Start condition

- **Options:** (a) the hub starts rounds as well as locks; (b) a flashing rim section, as the skill shot uses; (c) rounds start by themselves when the word is complete.
- **Decision:** (b). The hub already means lock; a second meaning would need the display to
  disambiguate. A landing is the game's own "shot", and (c) removes the choice of when to start.
- **Word length:** 8 faces gave the `player` rung 1.0 rounds a game; 6 gives 1.4-1.6. Kept at 6 (ROTATE).

## Rounds, one at a time (alone over the 03-full rules; `player` / `human` score, 8 seeds; without rounds 53,200 / 226,900; `hold` 8,500, `mash` 10,700)

| Round | Seen on screen | Changes the best action | Measured | Kept |
|---|---|---|---|---|
| ROOF BREAK, faces and backs both fall | all targets fall | yes, but toward the easy move | `hold` 8,500 → 30,400 (x3.6), `player` x2.2, `human` x1.5: it paid simple play most | **no** |
| ROOF BREAK, only backs fall | as above, faces steel | yes: bank to the bottom, hit from below | `player` 35,100, `novice` 38,100 (from 116,200), `human` 169,100: everyone who started it scored less | **no** (second attempt; dropped under rule 6, the inversion costs the rim faster than it pays) |
| CHASE | a section flashes and moves, chevrons | yes: the landing section is dictated, whatever its wear | caught 1.9 a game by `player`, 11 by `human`; `player` 46,200, `human` 363,200 | yes |
| SOLO | one face white/yellow with a chevron | yes: one face, not the nearest | `hold` and `mash` unchanged; `player` 91,200, `human` 469,000; 2.3 / 8.8 hits a game | yes |
| RUSH at 20,000 falling to 2,000 | value on the display, faces flash | weakly: hurry | `mash` 10,700 → 86,400: a bank finished by chance took it | reworked |
| RUSH at 8,000 falling to 1,000, third in the cycle | as above | weakly | reached 0.3 times a game by `novice`, 0.65 by `human`, never by `player` | yes, with that caveat |

Final rules, shared ladder, 16 seeds, means: idle 23 s / 988; greedy 25 s / 1,356; wiggle 32 s /
7,106; hold 36 s / 20,969; mash 43 s / 32,325; stepper 45 s / 34,675; `player` 56 s / 81,631;
`novice` 69 s / 122,188; `human` 105 s / 362,100. `strong` (3 seeds, medians): 393 s, 100 banks,
5.4 million, none capped at 1,500 s — it still ends.

## Display

- The two text strips became two dot-matrix panels; every notice and objective was rewritten to
  eighteen characters. Rule sheet split into two pages.
- Coinciding notices found in frames and fixed: the lock value and the round name overlapped; "BALL n" touched the panel edge.
- Rules core untouched by the display work: `tests/rules.cjs` and the ladder above were taken after it.

## Validation notes (04-rounds)

- Measured: 39 rule checks, 8 sound checks, browser flow including each round started by a real landing.
- Inspected in frames by the author: round ready, solo, chase, rush, pause sheet, both panels.
- Nobody has played or heard build 04-rounds.
- **Calibration:** the `player` rung matches two reports (02-slice, 03-full). The rounds have no report: uncalibrated.
- Open: `mash` reaches 40 % of `player` (was 50 %); RUSH is rarely reached and changes the decision least; whether eighteen characters are enough to explain a round to someone who has not read the sheet.

---

# Lamps made legible (build 05-lamps), and a report on 04-rounds

## Play report on 04-rounds

`RUN v1 build=04-rounds progress=8 score=122200 time=74 fail=drop:2,fling:2`

On that build (shared ladder, 16 seeds): `player` 56 s / 5.6 banks / 81,631; `novice` 69 s / 8.3 /
122,188. The report now sits on the `novice` rung, not on `player`: the same person, a third game
later. Read: `player` is a first game, `novice` a third; nothing in the rounds is out of reach of
either. No rule changed on this report. The rounds are therefore calibrated on 04-rounds by one report.

## "Lit lamps are what a bank repairs" was not readable

- **Stage / question:** 3 — is a rule that changes strategy discoverable before it matters?
- **Source:** the user's question on build 04-rounds ("does anything happen when the whole rim is
  lit?"), which the screen should have answered.
- **Cause:** an unlit lamp was a 1.5 px dot, a lit one 2.5 px; the only link to the repair was the
  figure `RIM+n` on the bottom panel and one line of the rule sheet.
- **Options:** (a) rename the figure; (b) show the cause on the table at both ends — when a lamp
  lights and when a bank spends it; (c) bring back an award for lighting every lamp.
- **Decision:** (b), presentation only. (c) is a rule and was already removed for never happening.
- **Change:** unlit lamps are empty sockets, lit ones full bulbs; a newly lit lamp pops `+1` and
  the `RIM+n` figure brightens; on a finished bank each lit lamp flies across the table to the
  section it rebuilds, which flashes on arrival; the notice reads `5 LAMPS: RIM +5`; the rule sheet
  says "each lamp is +1 rim at the next bank".
- **Before → after:** frames `evidence/b-lamps-fly.png`, `b-lamp-lit.png`; the seeded ladder is identical (`tools/ladder.mjs --compare`).
- **Status:** kept. Whether it now reads to a person is unknown until someone plays it.

## A dedicated light for the save (build 06-save-light)

- **Stage / question:** 3 — is every indicator brighter and larger than decoration? (raised by the user: could the save have its own light on the table?)
- **Observation:** a stored save was a 1 px cyan ring round the hub and the word SAVE on the bottom panel; the hub also carries the lock ring, chevrons and pips.
- **Options:** (a) a larger lamp at the hub; (b) a labelled insert on the floor (lettering on the table turns upside down); (c) a ring outside the rim, seen through every hole.
- **Decision / change:** (c): the light sits where the save acts. Empty, it is a row of dark sockets round the rim; lit, a pale line that crosses every hole; it flashes when earned and when spent, with a burst where the ball was caught. The hub ring is gone; the panel word stays. Rule sheet line added.
- **Before → after:** frame `evidence/b-save-lit.png`; seeded ladder identical (`tools/ladder.mjs --compare`).
- **Status:** kept. Unplayed.

## Lights for the multiplier (build 07-mult-lights)

- **Raised by the user:** can the multiplier be a light on the table too?
- **Options:** (a) eight lights spread round the table (hard to count while it turns); (b) a compact ring of eight round the hub, filling one at a time; (c) a number painted on the floor (turns upside down).
- **Decision / change:** (b). Pink, the colour of the faces whose banks raise it. The newest light flashes when a bank is finished; all go out when the ball is lost. The bank's value popup moved up so it no longer covers the ring; the panel keeps the number.
- **Before → after:** frame `evidence/b-lamps-fly.png`; seeded ladder identical (`tools/ladder.mjs --compare`).
- **Status:** kept. The ring reads as how full it is, not as an exact number; the number stays on the display. Unplayed.
- **Note:** `tests/browser.cjs` timed out once in four runs at a forced-state step while this was built (cause not found; it passed on the three reruns).

## Words and figures leave the table (build 08-display-show)

- **Raised by the user:** with multiplier, save, locks and repair now lights on the table, the lower dot panel is free; should the score popups and messages drawn over the table, video-game fashion, move to the dot display with pinball-style presentation?
- **Observation:** the table carried floating text for every face value, `+1`, lock, skill and chase values, bank and jackpot values, round names, JACKPOT, MULTIBALL, SAVED, READY, GAME OVER and the bonus count; the lower panel repeated four values the table now shows as lights.
- **Options:** (a) keep both; (b) move everything to the top panel's one line; (c) make the lower panel the show: big events take all sixteen rows in double-size dots, staged; small awards go to a one-line ticker.
- **Decision / change:** (c). No lettering is drawn over the table during play any more. On the lower panel a show is a list of stages — lettering wiped in, flashed inverted, scrolled in or shaken, then a figure counting up: `RIM +5` → 6000; `JACKPOT` → value; `MULTIBALL` scrolling in; `TORN OUT` shaking; `SKILL` → value → `+SAVE`; `EXTRA` → `BALL`; `ROUND` → `READY`; the round's name; `LOCK 1`; `SAVED`; `BONUS` → `7X300` → the total counting up with a tick a step; `GAME OVER`. A stronger show replaces a weaker one. Between shows the panel carries the word ROTATE or the round in play, the two figures for reference (dim), and the last face's value. The top panel keeps score, balls and the standing objective only.
- **What the table still does at the place of the hit:** flash, sparks and sound, as before; the lamp swells when lit.
- **Removed with it:** the `+1` popup added in 05-lamps (the swelling lamp and the brightening `RIM+n` remain).
- **Before → after:** frames `evidence/b-lamps-fly.png`, `b-bonus.png`, `b-round-chase.png`; seeded ladder identical (`tools/ladder.mjs --compare`).
- **Status:** kept. Open, and only play can answer it: with the eyes on the ball, are the figures on the panel read at all — in particular the value of a single face, which used to appear where it was hit.

## Extra ball by playing the rounds, not by score (build 09-extra-ball)

- **Decided by the user:** score extends removed; the extra ball is earned by a full cycle of rounds.
- **Change (rules):** the extends at 50k / 150k / 400k / 1M are gone. When the last round of the cycle (SOLO, CHASE, RUSH) ends, the hub lights for an extra ball; a ball up the middle collects it (one more ball, five in hand at most). It can be collected during a multiball and together with a lock; it stays lit across a lost ball.
- **Presentation:** hub flashes white and yellow with its chevrons; top panel `HUB: EXTRA BALL`; lower panel `EXTRA BALL` scrolling in, `IS LIT`; on collection `EXTRA` → `BALL` with a zoom and flash. Rule sheet line added.
- **Before → after** (8 seeds, medians; extra balls a game):

| | before | after |
|---|---|---|
| `player` | 62 s, 91,200, 0.9 | 57 s, 91,000, 0 |
| `novice` | 72 s, 98,900, 0.9 | 60 s, 97,900, 0.13 |
| `human` | 95 s, 379,000, 2.1 | 73 s, 301,500, 0.39 |
| `strong` (3 seeds) | 393 s, 5.4 M, 2.0 | 379 s (292-1,347), 5.4 M, 7.3 |

- **Reading:** the extra ball is now out of reach of the two rungs the play reports sit on, and the strong player gets more of them than before (no cap on cycles); one of its three games ran 22 minutes, though all three ended.
- **Status:** kept as decided. Open: whether a first cycle is reachable by a person in an ordinary game (it needs 18 faces and three landings on a flashing section); whether the number of extra balls needs a ceiling for the strong player.
- Test note: display assertions now read a log of what the display was asked to show (`fx.log`), because a later show could replace the one being checked; this was the cause of the intermittent browser-test failure noted under 07.

## Super jackpot (build 10-super-jackpot)

- **Asked for by the user**, after the jackpot was described as a single flat award.
- **Change (rules):** in a multiball each bank is a jackpot once (5,000 x multiplier); finished again it pays as an ordinary bank. When all three have been taken the hub — shut during a multiball until now — lights for the super jackpot: a ball up the middle pays 15,000 x multiplier, is held and fired back, and the three banks light again. Everything is cleared when the multiball ends.
- **Presentation:** only the banks still to be taken flash yellow; hub flashes white and yellow with chevrons, `HUB: SUPER JACKPOT`; on the award the longest stop, flash and zoom in the game, `SUPER` → `JACKPOT` → value counting up, its own jingle.
- **Before → after** (shared ladder, 16 seeds, means): `player` 80,544 → 80,544 (0 supers a game); `novice` 117,613 → 124,000 (0 in the 8-seed run); `human` 292,569 → 389,275, 0.5 supers a game. Baselines unchanged.
- **Reading:** only the `human` rung and above reach it; for the rungs the play reports sit on it changes one thing — a bank already taken in a multiball stops flashing and pays less, so the second ball is worth steering to another bank.
- **Status:** kept. `strong` (3 seeds): 303 s median (293-1,347), 74 banks, 5.1 million, 1.0 super jackpot a game from 52 multiballs — its multiballs are short (17.7 jackpots in all), so even it rarely takes three banks in one. All three games ended; the 22-minute game is the same seed as under 09. Open: the super jackpot may be too far for most play, and no one has played it.

## The rim a new ball starts with (build 11-new-ball-rim)

- **Stage / question:** 4 — is the moment after the player returns fair? (raised by the user: is it intended that the rim does not come back after a lost ball?)
- **Observation (build 10, 16 seeds, medians):** `player`'s first ball lasted 23 s and the whole three-ball game 53 s: the second and third balls got about 15 s each, ceremonies included. A lost ball left holes patched to a single landing and everything else as worn as it was, so the next ball fell sooner.
- **Cause:** the slice's rule ("holes patched with one landing") was written so that a new ball was not dead on arrival; it was never compared with anything.
- **Options, measured (time / score):**

| new ball: every section at least | mash | player | novice | human |
|---|---|---|---|---|
| 1 (as it was) | 40 s / 18,700 | 53 s / 48,100 | 60 s / 97,900 | 82 s / 366,700 |
| 2 | 48 s / 22,900 | 61 s / 85,900 | 64 s / 118,000 | 93 s / 438,500 |
| 3 (full) | 51 s / 69,000 | 61 s / 128,900 | 74 s / 176,400 | 98 s / 436,100 |

- **Decision (the user's):** 2. Full repair paid random input most (x3.7 against x2.7 for `player`).
- **Change:** `NEW_BALL_HP = 2`; the sections built back up flash when the new ball appears; a rule-sheet line. Torn-out sections still stay out.
- **After, shared ladder (16 seeds, means; before in brackets):** idle 1,000 (988); mash 36,906 (32,275); hold 45,150 (20,944); stepper 59,019 (30,694); `player` 108,294 (80,544); `novice` 154,988 (124,000); `human` 451,288 (389,275).
- **Reading:** on means the two steady simple inputs gained most — `hold` and `stepper` roughly doubled, `player` rose by a third. Simple play still loses (stepper reaches 55 % of `player`, was 38 %), but the margin is narrower than the medians above suggested.
- **Status:** kept as decided. `strong` (3 seeds): 289 s median (282-787), 74 banks, 5.0 million; all three ended, the longest in 13 minutes (22 under build 10). Unplayed.

## Controls named for the device; the game on a phone (build 12-controls)

- **Raised by the user:** should `PUSH START` read `PUSH SPACE`; what are the controls now; what about mobile?
- **Found by reading the input code:** Space / Enter start, arrows or A / D turn, P pauses, M mutes; any press of the pointer starts, and holding a half of the page turns. On a phone: (1) the picture stayed at 1x (224x288 on a 390 px wide screen) because only whole-number scales were used; (2) with two fingers, lifting either one stopped the table; (3) pause and mute had keys only.
- **Change (input and drawing; rules untouched):** the start line reads `PUSH SPACE` or `TAP TO START` and the hint `< > TURN THE TABLE` or `HOLD LEFT OR RIGHT SIDE`, following the last input used; the title also names pause. Scale: whole numbers from 2x up, otherwise fit the window. Fingers are tracked one by one: the newest down decides, lifting it hands back to one still held. A tap on the top display pauses on touch; any tap resumes. The game pauses when the page is hidden.
- **Evidence:** `tests/touch.cjs` (emulated 390x844 touch screen, real pointer events): fills the width, tap starts, two-finger hand-over, pause and resume; frames `evidence/t-title.png`, `t-pause.png`. Seeded ladder identical (`tools/ladder.mjs --compare`).
- **Left out:** a mute control on touch (the device's volume serves); on-screen buttons (the two halves of the page are the buttons).
- **Not tested:** a real phone; landscape; whether a thumb resting on the screen hides the lower display.

## Rule sheet ran into the start prompt (build 13-title-layout)

- **Source:** the user, on build 12-controls: the explanation and `PUSH SPACE` overlap.
- **Cause:** page 1 of the rule sheet had grown to 13 lines (lamp, multiplier ring and new-ball lines were added in builds 05, 07 and 11) and reached y = 233; the start prompt sat at 232, and on the pause screen the two lines of current values sat inside the text as well. The frames taken for those builds were of other screens.
- **Change:** line pitch 11 → 10 and gaps 6 → 5; start prompt moved to y = 244; pause values and the pause line moved down; two lines shortened (one touched the right edge, one used a bracket the font does not have).
- **Evidence:** frames of both pages in attract and on pause (`evidence/b-rules.png`, `b-rules-2.png`, `b-pause.png`, `b-pause-1.png`), now captured by the browser test. Seeded ladder identical.
- **Status:** fixed.

## Game over did not say where the score stood (build 14-game-over)

- **Source:** the user: is the placing shown at game over hard to read?
- **Observation:** a single line over the table, `BEST FIVE: NO.3`, and nothing at all for a score outside the five; the other scores were only on an attract page.
- **Change:** game over shows the best-five table. A score that made it has its row flashing with `< YOU` and a line under the table (`YOU ARE NO.3`, or `NEW BEST SCORE`); one that did not is shown large under the table with how far it fell short of fifth place. The attract page uses the same table.
- **Evidence:** frames `evidence/b-over-ranked.png`, `b-over-unranked.png`, captured by the browser test. Seeded ladder identical.
- **Status:** fixed.

## "SKILL" explained nothing (build 15-skill-wording)

- **Source:** the user: what does SKILL mean when the arrowed rim section is hit first?
- **Cause:** the award was named by a pinball term cut to five letters, and the standing notice (`SKILL: LIT RIM`) named neither the action nor the reward.
- **Change (wording only):** waiting, the top panel reads `ARROW RIM: +SAVE`; made, the lower panel shows `SKILLSHOT` → the value → `+SAVE`; the rule sheet says "a new ball's first landing on the arrowed section: one save".
- **Status:** fixed. Seeded ladder identical.

## Skill shot and round start looked the same (build 17-arrow-colours)

- **Source:** the user: should the skill-shot arrows and the round-start arrows be told apart?
- **Observation:** skill shot, round ready and the chase light were all a section flashing yellow with two yellow chevrons; a new ball with a round waiting showed two of them at once, and the display named only one.
- **Change (drawing and wording):** the skill shot's chevrons take the save light's pale cyan and its section flashes white — it is what gives the save; round start and chase stay yellow. The top panel names the colour (`CYAN ARROW: +SAVE`, `YELLOW ARROW:ROUND`) and alternates between the two when both are waiting. Rule sheet lines name the colours.
- **Evidence:** frame `evidence/b-two-arrows.png`. Seeded ladder identical.
- **Status:** fixed. `tests/browser.cjs` timed out once in six runs during this build, at a step not identified (five reruns passed); the cause is not found.

## Game over never left (build 18-over-to-title)

- **Source:** the user: does the game-over screen not go back to the title?
- **Observation:** it stayed until a start input; the attract loop (title, rule sheet, demo, best five) was only ever seen before the first game.
- **Change:** after 15 seconds without input the game-over screen gives way to the title and the attract loop. A start input during those 15 seconds still starts a new game at once. The run summary stays in the address bar until the next game starts.
- **Evidence:** `tests/browser.cjs` (forced clock). Seeded ladder identical.
- **Status:** fixed.

## Do the texts still match the game? (build 19-text-audit)

- **Source:** the user asked whether the explanations agree with the current rules and display.
- **Method:** the rule sheet in `main.js`, the README and `VISUAL_DESIGN.md` were read line by line against the constants and event handling in `core.js` and `main.js`.
- **Found and corrected:**
  - Rule sheet: "yellow arrows point at what is lit" — the skill shot's arrows are cyan since build 17. Now "arrows point at what is lit".
  - README: the `+1` popup on a lamp (removed in build 08); "yellow chevrons" for everything; skill shot and round start described without their colours; game-over table and the return to the title not mentioned; calibration paragraph stopped at build 11.
  - `VISUAL_DESIGN.md`: seven rows of the event table still said "notice", "popup" or "value at the landing point" from before build 08; the skill shot was listed under yellow; the game-over screen was missing.
- **Checked and found right:** every number in the rule sheet and the README rules (3 landings, every 4th bank, back to 2, 6 faces, 20 s rounds, 1.25 s chase step, 3,000 / 1,000 / 8,000-1,000, 5,000 and 15,000, 2,000, five balls, four seconds for a bank), the controls table, the ladder table (rules unchanged since build 11), `AUDIO.md`'s lists.
- **Not checked by anyone else:** whether the wording is understood by a reader new to the game.

## Feel pass on the three things the player does (build 20-feel)

Asked for by the user after a list of candidates; with `maximizing-game-feel`'s order (confirm the event, give it weight, express the motion). Presentation only; seeded ladder identical.

| Moment | Before | Now |
|---|---|---|
| Turning the table | no answer at all | a low FM motor that rises with the turn rate and stays under every other sound (level 0.11 against 0.5 for a landing); a dry click when the control is let go; the drawn table overshoots by 0.012 rad (about one pixel at the rim) and settles in a few frames. The rules' angle is untouched |
| A thrown landing | looked like any landing | seven sparks streaked along the rim in the direction of the throw, and a whoosh whose level and pitch follow the throw's strength (only above a third of full) |
| Any landing | flat ball, fixed thump | the section gives outward two pixels and returns; the thump's pitch follows the speed of the landing; the ball flattens against the surface it hit (floor or side wall) |
| Ball held in the hub | blinking ball | a white arc round the hub runs down to the shot, with two ticks, the second higher |
| Ball lost, drained or saved | vanished at the rim | nine frames' stop on a lost ball, and the ball is drawn falling away (drawing only) |

- **Found by the tests while doing it:** a comment placed inside a line switched off the music stop on a lost ball; caught by the bonus check and fixed before the build was saved. The intermittent browser-test failure reported under builds 07 and 17 was traced: a forced bank's check could be satisfied by sparks left over from a bank the simulated player had just finished. The test now clears them first; five runs in a row pass.
- **Left for later (listed for the user, not built):** a spark for a landing saved by the edge allowance; music that thins as the rim weakens; wipes between objective sentences and a rolling score; vibration on phones; a bank standing up one target at a time.
- **Not judged by anyone:** all of it. In particular whether the motor is pleasant over a whole game, and whether the one-pixel overshoot reads as weight or as slop.

## The table's sound: a ratchet, not a motor (build 21-ratchet)

- **Source:** the user, on build 20-feel: would a small continuous ticking be better than a low tone that sounds all the time?
- **Reasoning:** the low FM tone sat in the same range as the music's bass and never stopped while a key was held; a tick is short, sits far above the bass, and can carry information the tone could not.
- **Change (sound only):** the motor voice is removed. The table ticks once for every quarter of a section it turns (7.5 degrees, about 18 ticks a second at full rate), a 12 ms tick at 2.6 kHz played at 0.075 of full scale; as a section boundary passes, the tick is lower and stronger (0.14). Twelve stronger ticks are one full turn, so the sound also counts sections. The brake click and the one-pixel overshoot stay.
- **Evidence:** `tests/audio.cjs` (length under 0.04 s, a step under a third of a landing's level, the section tick between the two). Seeded ladder identical.
- **Status:** kept. Not heard by anyone.

- **Follow-up (build 22-ratchet-wider), from the user on 21-ratchet: the ticks could be further apart.** One tick for every half section (15 degrees, about nine a second at full rate) instead of every quarter; the stronger tick still marks each section boundary, so the pattern is now weak-strong. Sound only; seeded ladder identical.
- **Second follow-up (build 23-ratchet-third): half a section was too sparse; about one and a half times the first spacing was asked for.** Exactly 1.5 times (11.25 degrees) would not divide a section, and the stronger tick could no longer fall on each boundary; a third of a section (10 degrees, 1.33 times the first spacing, about fourteen ticks a second at full rate) keeps it: weak, weak, strong. Sound only; seeded ladder identical.

## Quieter ratchet; the browser test's intermittent failure found (build 24-test-fix)

- **Ratchet level, from the user on 23:** a little quieter. Step tick 0.075 → 0.05 of full scale, section tick 0.14 → 0.09 (a landing is 0.51).
- **Browser test, investigated at the user's request.** It had failed about one run in six since build 07, at different steps, and I had twice reported the cause as unknown and once as fixed.
  - **Cause, reproduced:** the test forces situations by writing into the state of a game that keeps running. Between forced steps nobody is at the controls, so the ball is lost every few seconds, and for 2.5 s after each loss the rules hold no ball at all. A forced step that arrived inside that pause either threw (`Cannot convert undefined or null to object`: it wrote to a ball that did not exist) or placed a ball the rules then replaced, and the following wait timed out. A minimal script (`inject during 'play'` → works; `inject during 'lost'` → throws) reproduces it every time. The race fixed under build 20 (sparks left from an earlier bank) was real but was a second, smaller cause.
  - **Fix (test code only):** a test-only hook `__game.place(props)` puts one ball into play from any state — it ends a lost-ball pause or a frame stop and replaces a ball already past the rim — and every forced step uses it; the ball stock is topped up before the long unattended stretches so the game cannot end mid-test.
  - **Evidence:** the reproduction passes in both cases with the hook; `tests/browser.cjs` passed 10 runs in a row (before: 8 in a row had also passed once, so 10 is support, not proof).
  - **Not a game defect:** the failure needed state to be written from outside during the pause; nothing a player can do reaches it.
- Seeded ladder identical.

## Second feel pass: the five runners-up (build 25-feel-2)

Asked for by the user. Presentation only; seeded ladder identical.

| Moment | Now |
|---|---|
| A landing caught by the edge allowance beside a hole | a thin high ping and nine white sparks. It fires only when the section under the ball is gone and the neighbouring one caught it — a hole really was missed |
| Eight landings or fewer left in the whole rim (of 36) | the music loses its bass (a high-pass at 320 Hz, between the bass line and the chord) and two sour low notes repeat every 2.5 s; both stop when the rim is rebuilt or the ball is lost |
| The standing objective changes | the new sentence is drawn in from the left, bright for half a second |
| Score | rolls up to its value on the top panel |
| A bank stands up | its three targets flash in turn, each with a click a step higher (the rules stand all three at once; only the answer is staggered) |
| On a phone | a short vibration for a landing, longer for a section breaking, a ball draining, a ball lost; only where the browser allows it |

- **Evidence:** `tests/audio.cjs` (the cut lies between bass and chord), `tests/browser.cjs` (music thins at the threshold and recovers; edge catch throws the sparks; score rolls), frame `evidence/b-edge.png`.
- **Not tested:** vibration (no device; the call is guarded and does nothing on a desktop); how the thinned music and the warning sound together.
- **Threshold chosen without data:** eight landings left. It is reached mostly late in a ball; whether that is when a player wants the warning is a question for play.
- **Browser test after this build:** 11 of 12 runs passed; one timed out at a step that was not captured. So the fix under build 24 removed the main cause but not every one. The test now prints the last check that passed when it fails, so the next failure names its place. Still not a sign of a game defect, and still unexplained.

## A lost ball was drawn coming back across the table (build 27-fall-behind)

- **Source:** the user, on build 25: a ball that has gone out sometimes comes back onto the table and disappears off the bottom of the screen.
- **Cause:** the falling ball added in build 20 is drawing only — the rules have already let the ball go. It was pushed outward from where it left and then pulled down the screen, and it was drawn on top of everything. Out through a hole at the top or the side, that path runs straight back over the playfield, drawn as a full white ball.
- **Options:** (a) stop drawing it when it is over the table; (b) send it straight off the nearest screen edge; (c) draw it under the table, so it falls away behind the machine.
- **Decision / change:** (c). The falling ball is drawn over the ground and under the table, and it gets smaller and greyer as it goes, so it can only be seen outside the rim. Its motion is unchanged.
- **Evidence:** `tests/browser.cjs` throws a ball out through a hole at the top and samples the screen at the ball's position every frame: it passes behind the table (nearest 80 px or less from the centre) and no white ball is drawn inside the rim. Frame `evidence/b-fall-top.png`. Seeded ladder identical.
- **Why I missed it:** the frame I looked at in build 20 was a ball forced out at the bottom.

## Play report on 27-fall-behind, and two questions about the lamps (no build change)

- **Report:** `RUN v1 build=27-fall-behind progress=8 score=113500 time=79 fail=fling:2,drop:1`. On the same rules: `player` 60 s, 7 banks (median), 78,750 (median); `novice` 65 s, 8.5, 114,250; `human` 90 s, 15, 411,700. The report sits on `novice` for banks and score and between `novice` and `human` for time. No model change: one report, inside the ladder.
- **Is it worth lighting as many lamps as possible before finishing a bank?** By the rules, no: a lamp costs the landing that lights it and returns one landing, so it is a refund for landing on an unlit section, not a gain. Checked by changing how much the look-ahead players value a lit lamp (0, 0.5, 2, 5; 16 seeds, medians): `novice` 66 / 64 / 65 / 57 s, `human` 100 / 93 / 87 / 106 s — no trend.
- **Should it be worth it? Tried: lamps raise a bank's value** (x2 from four lit, x3 from eight, x4 with twelve; score only, repair unchanged; lamps kept on a lost ball, as the user asked).

| 16 seeds, median score | off | on |
|---|---|---|
| hold | 32,300 | 45,300 (+40 %) |
| stepper | 37,500 | 48,500 (+29 %) |
| mash | 22,900 | 27,300 (+19 %) |
| `player` | 85,900 | 71,400 (-17 %) |
| `novice` | 118,000 | 268,400 (+127 %) |
| `human` | 438,500 | 391,900 (-11 %) |

  - **Reading:** every simple input gained, because turning without reading lights lamps anyway (the stepper lights one per landing); the three reading rungs moved in both directions. The reward went to the wrong play. Stepper against `player` went from 44 % to 68 % of its score.
  - **Decision:** reverted (`LAMP_STEP = 0`; the switch stays for comparison). First attempt; not pursued further in this form, because any reward counted in lit lamps pays the stepper first.
  - **Also declined, by reasoning only:** raising the repair by lamp count with lamps lost on a lost ball — the same stepper problem, and a penalty that falls hardest on the player who has just made a mistake (the user's own objection).
- `bots.js` gained an override for the value of a lit lamp (`OT_LAMP_W`); its default is the old value and the seeded ladder is unchanged.

---

# Milestone (build 28-milestone)

The user closed this round of work here. Build 28 is build 27 with the label changed; rules as of build 11, drawing, sound and input as of builds 12-27.

- **Decided and left as is:** lamps stay a refund for landing on an unlit section (no reward for hoarding them, in score or in repair).
- **Calibration:** four reports from one player; `player` = first game, `novice` = later games (see README). Calibrated up to `novice` on the current rules; uncalibrated above it.
- **Open, in order of weight:**
  1. Nobody has reached the extra ball (a full cycle of three rounds) or the super jackpot; whether they are too far is undecided.
  2. Steady simple input is closer than it was: the stepper scores 55 % of `player` (means) since the new-ball rim change.
  3. Bringing a target to the ball still puts the ball under a roof; faces and backs at speed are unverified by anyone but the player's silence on it.
  4. `tests/browser.cjs` fails about one run in twelve at a step not yet captured; it now prints where.
  5. Never run: an outside reader's audit of the screen; a real phone.
- **Candidates not built:** a reward for lamps lit by thrown landings; a ceiling on extra balls for the strong player; initials entry; speech.

---

# After the milestone

## Steel backs deflect (build 29-deflector)

- **Source:** the user understood the roof under a bank as a risk they accepted, and asked whether it could be made smaller. Of five options (mark the roofed sections; warn when it is about to happen; deflecting backs; free landings after a back; banks moved inward) they chose to try deflecting backs, and said the look needed no change.
- **Change (rule):** a ball that hits a target's steel back is given 220 px/s along the bank toward its nearer end (`C.DEFLECT`; 0 restores the old bounce). Ends of targets are unchanged.
- **The forced case** (`tests/rules.cjs`): a ball dropped under a bank turned to the bottom was lost in 1.5 s after six landings; now it is out from under the roof after two landings, three back hits, still in play.
- **Ladder, 40 seeds, medians (off → 220 → 320 px/s):** game length — greedy 25 → 27 → 28 s; stepper 53 → 51 → 50; `player` 59 → 58 → 59; `novice` 64 → 64 → 65. Score — `player` 71,400 → 82,400 → 91,900; `novice` 123,100 → 156,500 → 148,000; stepper 36,200 → 51,000 → 39,700; mash 19,500 → 13,400 → 37,000; greedy 800 → 1,000 → 1,200.
- **Reading:** the roof was not what ended the modelled players' games — lengths did not move. The reading rungs score 15-30 % more; the simple inputs move both ways (noise); bringing the nearest target to the ball is still the worst policy of all. A stronger kick (320) bought nothing more, so 220 was kept.
- **Strong (3 seeds):** 395 s median (318-1,135), 96 banks, 4.4 million; all ended (was 289 s).
- **Presentation:** steel sparks run along the bank the way the ball is knocked; rule-sheet line "a back knocks the ball aside".
- **Status:** kept. Open: whether a person feels the difference; whether the sideways knock becomes a way to travel that makes the throw matter less (the ladder does not show it, a person might find it).

## The deflector did not change what the player saw (build 30-deflector-2)

- **Source:** the user, on build 29: the behaviour hardly looks different; the ball still bounces fast under the bank.
- **Cause:** build 29 added sideways speed to a ball that was still bounced back at the rim. In the forced case it took three back hits and two landings to get out — about 0.4 s of the same rattling. It stopped the ball being lost and nothing else. My report gave the landings and not the back hits, and called that a change.
- **Change (rule):** a steel back no longer returns the ball toward the rim. The ball leaves along the bank at 300 px/s toward the nearer end, with 50 px/s away from the back (`DEFLECT`, `DEFLECT_OUT`).
- **The roof case, twelve entries (six positions under the bank, table still or turning):**

| | back hits | landings | ticks under the roof | lost |
|---|---|---|---|---|
| off | 4.0 | 3.9 | 46 | 6 of 12 |
| build 29 (measured as 3 hits in its one forced case) | — | — | — | — |
| 240 / 70 | 1.1 | 2.0 | 29 | 0 |
| 300 / 50 (kept) | 1.1 | 1.5 | 23 | 0 |

- **Ladder, 40 seeds, medians, off → kept:** greedy 25 s / 800 → 30 s / 3,200; stepper 53 s / 36,200 → 54 s / 83,800; mash 46 s / 19,500 → 49 s / 32,900; `player` 59 s / 71,400 → 63 s / 138,800; `novice` 64 s / 123,100 → 74 s / 213,100.
- **Reading:** this time the game changed. Everyone scores about twice as much and the reading rungs last a little longer. The stepper gained most: it turns without looking, so banks pass under its ball all the time, and the roof was what punished that. By medians it went from 51 % to 60 % of `player`; by the shared ladder's means (16 seeds) it is at 86 % (120,138 against 140,300). Bringing the nearest target to the ball is still the worst input, though four times better than it was.
- **Guardrail:** simple play still loses on both measures, but the margin over steady blind turning is the narrowest it has been. Kept for the user to play, because the request was to make this risk smaller and a report outranks the ladder; flagged as the first thing to revisit.
- **Strong (3 seeds):** 361 s median (327-965), 92 banks, 4,984,400 points, 0 of 3 capped at 1,500 s (build 29: 395 s; before the deflector: 289 s).

## Last game's state left on the display between games (build 31-attract-display)

- **Source:** the user: does ROUND READY keep showing on the leaderboard screen?
- **Cause:** between games (title, rule sheet, best five) the lower panel was still drawn from the finished game's state: a round left waiting kept `ROUND READY` blinking, and otherwise the word ROTATE, the multiplier and repair figures stayed; the top panel showed `BALL 0`. Only the demo page, which has a game of its own, was right. Present since the dot display was added (build 04) and made reachable after a game by the return to the title (build 18).
- **Change (drawing):** on the title, rule-sheet and best-five pages the lower panel shows `OVERTURN`, and the top panel shows the last score and the best score without a ball count. The demo page is unchanged.
- **Evidence:** `tests/browser.cjs` leaves a round waiting, lets game over time out, and reads the lower panel's dots on the title and best-five pages: identical on both, no blinking. Frame `evidence/b-best-after-game.png`. Seeded ladder identical.
- **Found in the same frame and fixed with it:** the finished game's chevrons (a round left waiting, a lit hub) kept flashing on the table behind the attract pages, and the score on the top panel rolled up from zero again on every attract page. The table's lit state is cleared when game over gives way to the title, and the rolling score is no longer reset between pages.

## A shorter chase that pays more (build 32-short-chase)

- **Source:** the user, thinking of the extra ball: is a 20-second CHASE too much to get through; could it end at 15 or 10 seconds, with a good player still able to earn?
- **Fact first:** losing the ball in a round does not block the cycle (the round counts as played). But faces dropped during a round do not spell, so a long round delays the next.
- **Measured, 40 seeds, per game (rounds started / RUSH taken / extra balls):**

| CHASE | `player` | `novice` | `human` |
|---|---|---|---|
| 20 s, 1,000 a catch (was) | 1.81 / 0.03 / 0.03 | 2.40 / 0.38 / 0.26 | 3.31 / 0.69 / 0.63 |
| 15 s | 1.81 / 0.03 / 0.03 | 2.48 / 0.41 / 0.35 | 3.42 / 0.71 / 0.67 |
| 10 s | 1.93 / 0.08 / 0.08 | 2.48 / 0.29 / 0.32 | 3.98 / 0.88 / 0.93 |
| ends at 3 catches | 1.90 / 0.06 / 0.06 | 2.41 / 0.38 / 0.29 | 3.81 / 0.84 / 0.86 |
| 10 s, 2,000 a catch (kept) | 1.85 / — / 0.06 | 2.55 / — / 0.23 | 3.94 / — / 0.82 |

- **Reading:** the length of CHASE matters to the `human` rung only; below it too few rounds start for the third to be reached. Halving the time alone cost `novice` 8 % of its score; doubling the catch value gave it back and more (`novice` 213,100 → 259,200; `human` 551,300 → 572,900) while the simple inputs did not move at all (stepper 83,800, mash 32,900 in every row): a catch needs a chosen landing.
- **Change (rules):** CHASE lasts 10 seconds; a catch pays 2,000 more each time. Switches kept: `CHASE_T`, `CHASE_HITS`.
- **Shared ladder after (16 seeds, means):** hold 59,406; stepper 120,388; `player` 147,519; `novice` 237,625; `human` 642,388.
- **Strong (3 seeds):** 331 s median (329-1005), 85 banks, 4,198,600 points, 0 of 3 capped at 1,500 s (build 30: 361 s).
- **Not answered by this:** the extra ball is still far for the rungs the reports sit on (0.06 and 0.23 a game). The spelling length is the lever that would move it; not tried.
- **Browser test:** it failed once here, and for the first time said where — after the multiball check, in the forced bank of the lamp test. Cause: the bank being forced could be in its stand-up countdown from the simulated player's own play; if that ran out before the ball arrived the two targets set down stood up again and the bank did not finish. The forced steps now clear the countdowns.

## Later balls were half the first; a save at their start (build 34-save-start)

- **How it came up:** the user asked whether a rim section that takes four landings would be too much. Measured (40 seeds): game length up 2-4 s, score up 30-48 % for the reading rungs, stepper unchanged — but only the first ball got longer. That led to measuring each ball for the first time.
- **Finding (current rules, 40 seeds, median seconds from launch to loss):** `player` 26 / 15 / 12; `novice` 33 / 16 / 12; `human` 49 / 19 / 12. The third ball lasted 12 s whatever the skill. The change in build 11 (a new ball's rim built back to two) had been judged on whole-game length only and had not cured this.
- **Four landings a section: declined by the user.** It made the gap wider (`player` 38 / 12 / 9).
- **The user's question:** a ball saver at the start would overlap with the skill shot, which gives a save at the same moment — should its reward change, or the conditions for relighting the save be loosened?
- **Options measured (40 seeds; ball lengths for `player`, extra balls a game for `player` / `novice` / `human`, stepper's score):**

| | `player` balls | extra balls | stepper |
|---|---|---|---|
| as it was | 26 / 15 / 12 | 0.05 / 0.20 / 0.75 | 83,800 |
| balls 2 and 3 start with a save | 26 / 21 / 22 | 0.23 / 0.42 / 1.02 | 82,100 |
| every ball starts with one, skill shot always gives 2 letters | 32 / 21 / 14 | 0.23 / 0.53 / 1.13 | 110,500 |
| balls 2 and 3 start with one, skill shot always letters | 23 / 24 / 14 | 0.17 / 0.50 / 1.13 | 82,100 |
| balls 2 and 3 start with one; skill shot: a save if none is lit, else 2 letters (kept) | 26 / 21 / 20 | 0.23 / 0.50 / 1.05 | 82,100 |
| the same with 3 letters | 26 / 21 / 17 | 0.23 / 0.45 / 1.10 | 82,100 |

- **Decision:** the kept row. It uses the save that already exists (no timed saver, no new light), the skill shot's reward is never wasted, the first ball is untouched so blind turning gains nothing (stepper 83,800 → 82,100 while `player` goes 138,500 → 182,000), and it brings the extra ball nearer than anything tried so far. Idle still ends in 33 s.
- **Not changed:** the conditions for relighting a save (the third SOLO hit). With later balls starting with one, relighting is a way to win it back after use and needs no loosening.
- **Presentation:** the ring flashes on as the second and third balls appear, with `READY` → `SAVE ON`; a skill shot shows `ROTATE +2` when it gives letters; the waiting sentence reads `CYAN ARROW: ROTATE` when a save is already lit; the rule sheet is three pages.
- **Shared ladder after (16 seeds, means):** idle 3,138; hold 84,188; stepper 113,050; `player` 175,175; `novice` 288,006; `human` 713,100.
- **Strong (3 seeds):** 344 s median (336-572), 84 banks, 4,229,900 points, 0 of 3 capped at 1,500 s (build 32: 331 s).
- **Still unexplained:** why the third ball was 12 s for every rung before this. The save covers it without answering it.

## Play report on 34, and a rung fitted to the later reports (build 35-regular-rung; rules unchanged)

- **Report:** `RUN v1 build=34-save-start progress=14 score=257800 time=121 fail=fling:2,drop:2`. Four balls lost from a stock of three: one extra ball was collected — the first time a person reached it. The player said they aimed for lighting it and then collected it without trying.
- **Against the ladder on that build:** time and balls lost on `human` (122 s, 4.06), banks and score on `novice` (12.5, 285,850). The third report in a row with more time than its banks would suggest; the user asked for the players to be adjusted.
- **What was tried, each candidate run on the three builds the reports came from (snapshots 28, 31, 34):**
  1. *A cautious player* (`greed`: points weighted 0.5 / 0.25 / 0.1 / 0 against the state of the rim). Banks did not fall: 15-21 at every setting. In this game the rim is bought back by finishing banks, so a player who only wants to live finishes them too. Rejected as the explanation; the option stays in `bots.js`.
  2. *A player who misjudges the table's angle* (0.07 rad in `human`; tried 0.15 / 0.19 / 0.22 / 0.3). A landing forgives 30 degrees, a face about 14, so this takes faces away first. Banks fell to the reports' level at 0.19-0.22, and time fell with them (63 / 68 / 94 s at 0.19, 40 seeds).
  3. *The same with quicker, steadier reactions* (a decision every 10 ticks, 9 late, 4 % lapses, angle 0.22): 70 s / 9 banks / 186,500; 74 / 10 / 192,900; 89 / 11 / 264,100 against the reports' 79 / 8 / 113,500; 80 / 9 / 339,300; 121 / 14 / 257,800 (24 seeds). Kept as `regular`.
- **What the fit shows once counted per ball:** the long report had four balls. Per ball the reports are 26 / 27 / 30 s and 2.7 / 3.0 / 3.5 banks; `regular` gives 23 / 23 / 26 s and 2.9 / 3.1 / 3.7. Banks fit; time is about 15 % short. So the pattern "lives like `human`, scores like `novice`" was in good part the extra ball, not a different kind of player.
- **What the adjustment did not achieve:** a rung that lives much longer than it scores. On the current rules `regular` (88 s, 12.6 banks, 268,475) is beside `novice` (85 s, 12.8, 288,006) — it confirms `novice` as this player's level more than it adds a new one. The remaining 15 % in time per ball is unexplained; three single games cannot settle it.
- **Rules untouched.** The shared ladder now includes `regular`; the other rows are unchanged.

## A low game, and the player's reason: faces hard to aim at (build 36-wider-faces)

- **Report:** `RUN v1 build=35-regular-rung progress=5 score=62000 time=65 fail=drop:2,fling:1`. In 40 seeds `regular` never scores that low (10th percentile 121,000) and `novice` does once; `player` three times. Game length was ordinary (65 s is their 10th percentile); banks were few. Two things follow: a person's games spread wider than the modelled ones, and the "more time than banks" pattern was there without an extra ball — so the conclusion under build 35 that it was mostly the extra ball overstated it.
- **The player's account:** the pink faces are hard to aim at, the rim runs out, and the game slides downhill. That is a chain in the structure — no face, no bank, no repair — not a number.
- **Options measured (40 seeds, medians; time / banks / score):**

| | stepper | mash | `player` | `regular` |
|---|---|---|---|---|
| as it was | 62 s / 7 / 82,100 | 62 / 6 / 48,500 | 75 / 10 / 182,000 | 85 / 11 / 246,500 |
| targets 16 px wide instead of 13 | 69 / 8 / 115,600 | 59 / 6 / 55,400 | 75 / 11 / 209,800 | 101 / 16 / 427,600 |
| glancing hits on a face count | 63 / 9 / 143,300 | 58 / 7 / 89,600 | 76 / 13 / 268,800 | 99 / 18 / 417,000 |
| higher bounce (kick 440) | 62 / 7 / 83,100 | 58 / 6 / 76,500 | 71 / 10 / 179,600 | 90 / 15 / 303,100 |
| every fallen face repairs one landing | 77 / 9 / 125,700 | 74 / 8 / 100,500 | 92 / 12 / 267,000 | 108 / 16 / 439,100 |

- **Decision:** wider targets. It answers the complaint directly, and it helps most the rung that models this player — the one that misjudges the table's angle (+19 % time, +45 % banks, +73 % score) — while random input gains 14 %. Counting glancing hits paid the simple inputs most (+75 %, +85 %). A repair for every face lengthened every policy's game by about a quarter, blind ones included; it is the next candidate if the slide is still felt.
- **Change (rule):** each target is 16 px wide (was 13) and a bank 54 px (was 45). The roof under a bank is wider with it; the deflecting backs still clear it in one hit (twelve entries: 1.1 back hits, none lost).
- **After, shared ladder (16 seeds, means):** idle 6,319; hold 135,013; stepper 105,363; `player` 243,606; `regular` 361,044; `novice` 397,881; `human` 740,219. Holding one direction gained the most of the simple inputs (84,188 → 135,013) and is at 55 % of `player`.
- **Idle:** a game left alone now lasts 36 s (first ball 7 s); the rule test's bound was moved from 40 s to a minute.
- **Strong (3 seeds):** 1500 s median (437-1500), 369 banks, 13,311,200 points, 2 of 3 capped at 1,500 s (build 34: 344 s).
- **Models not changed on this report**, for the reason above: what is missing is spread and bank rate, which the knobs tried under build 35 do not separate.

## Wider targets let the strong player go on for ever; extra balls limited to two (build 37-extra-ball-cap)

- **Finding:** with the targets widened in build 36 the strong player did not end: two of three games capped at 1,500 s, 369 banks, 13.3 million. Build 36 was saved before that result came in and is not a finished state.
- **Candidates (3 seeds each):**

| | game length | banks | capped | extra balls |
|---|---|---|---|---|
| targets 14.5 px instead of 16 | 1,500 s (all three) | 374 | 3 of 3 | 27 a game |
| 16 px, a section torn out every 3rd bank | 1,500 s median | 368 | 2 of 3 | — |
| 16 px, at most two extra balls a game (kept) | 428 s (319-437) | 108 | 0 | 2 |
| 16 px, both | 315 s (267-430) | 84 | 0 | 2 |

- **Cause:** the extra ball had no limit since build 09 (a risk noted then, with one 22-minute game). A player who finishes rounds fast enough earns balls faster than they are lost; the wider targets pushed the strong player over that line, and even a smaller widening did. Tearing sections out sooner does not help against a ball supply without end.
- **Change (rule):** the hub lights for an extra ball at most twice in a game (`EXTRA_MAX`). The rule sheet says so.
- **Effect on the other rungs:** none — the shared ladder is identical for all ten policies (the `human` rung earns about one a game).
- **Strong after:** 428 s median, 108 banks, 5.5 million, none capped (build 34: 344 s).

---

# Second milestone (build 38-milestone-2)

Build 38 is build 37 with the label changed. The user closed this round here.

- **Report on build 37:** `RUN v1 build=37-extra-ball-cap progress=14 score=274600 time=95 fail=fling:3,drop:1` — on `regular` for time and banks (91 s, 14), one extra ball (the second time a person reached it). The game before the targets were widened was 5 banks in 65 s. Nothing changed on this report.
- **Since the first milestone (build 28), rules:** steel backs send the ball out sideways (30); CHASE lasts 10 s at double value (32); balls 2 and 3 start with a save, and a skill shot with a save lit gives two letters (34); targets 16 px wide (36); extra balls limited to two a game (37). **Not rules:** attract display, the `regular` rung, test fixes.
- **Calibration:** the player sits on `regular`; pressure is read from the strong player, which ends in about seven minutes.
- **Open, in order of weight:**
  1. Simple inputs are closer than at the first milestone: holding one direction reaches 55 % of `player` (shared ladder means). Each of the last four rule changes made the game kinder; none was aimed at this.
  2. The super jackpot has still not been reached by a person.
  3. A person's games spread wider than any modelled rung's (62,000 to 339,300 across five reports); no knob tried reproduces it.
  4. Whether the slide the player described (no face, no bank, no rim) is gone after the wider targets is the player's to say; "each face repairs one landing" is the measured next step if not.
  5. Never run: an outside reader's audit of the screen; a real phone.
- **Switches left in the rules for comparison, all off or at their kept values:** `LAMP_STEP`, `CHASE_HITS`, `FACE`, `TARGET_REPAIR`, `START_SAVE`, `SKILL_AWARD`, `EXTRA_MAX`, `DEFLECT`.

## Rule sheet checked against the rules again (build 39-sheet-wording)

- **Source:** the user asked whether the explanation shown in the attract loop is up to date.
- **Method:** all three pages of the sheet, line by line, against the constants and handlers in `core.js` as of build 38, and the README's rules the same way.
- **Result:** every statement and number agrees — three landings, lamps and repair, the back that knocks the ball aside, every fourth bank, a new ball's sections back to two, the skill shot's save or two letters, balls 2 and 3 starting with a save, locks and multiball, a jackpot once per bank and the super jackpot, six faces for ROTATE, the three rounds, the extra ball twice a game. One line was incomplete: "a round ends on its clock or with the ball" left out that SOLO ends on its third hit and RUSH on the first bank, both stated two lines above it; it now reads "a round also ends on its clock or with the ball".
- **Not on the sheet, by choice:** the lengths of the rounds (the display counts them down), the end-of-ball bonus (the display counts it), the limit of five balls in hand.
- Wording only; seeded ladder identical.

## Video, and two things recording it showed (build 40-video)

- **Asked for:** a gif and an mp4 with sound, four seconds of title and sixteen of play.
- **Made:** `tools/record-video.cjs` (after the recorder of an earlier game in this repository): the page is stepped one tick at a time under a fixed clock and seeded random numbers, every second canvas frame is kept, and the sound module's calls are recorded with their ticks and re-rendered offline from the same programs. Seeds 101-140 were tried with the `human` rung; the take kept is the highest-scoring one with no ball lost, two banks or more and a lock: seed 120 (six banks, a multiball, three jackpots, a round, 173,000).
- **Outputs:** `media/overturn.mp4` 672x864, 30 fps, H.264 + AAC, 20.0 s, 6.9 MB; `screenshot.gif` 224x288, 15 fps, 300 frames, 2.5 MB. A turning table changes every pixel every frame, so neither compresses well: at 448x576 and 30 fps the gif was 11 MB.
- **Found 1 — the sound clipped (a defect in the game since build 03).** Summed at their ticks, the sounds of this ordinary take peaked at 1.88 of full scale. Each sound's level had been measured alone ("levels measured at the output" in the finishing notes meant one sound at a time), and nothing limited their sum, so the device cut it square. Fix: an output stage in `audio.js` — gain 0.7 into tanh(1.4 x). A landing alone goes 0.51 → 0.46; the pile-up comes out at 0.89. `tests/audio.cjs` checks both; the recorder uses the same function. The mp4's track: mean -19.2 dB, peak -0.4 dB; the title's four seconds are silent, as attract is meant to be.
- **Found 2 — the title before the first game showed a skill shot.** The table behind the title is a fresh game's, which has a skill-shot section picked: one section flashed white with cyan arrows under the logo. Cleared for the pre-game title; the hint under it was also too dim to read over a bank and is now white.
- **Rules untouched:** seeded ladder identical.
- **Not judged by anyone:** how the soft clip sounds. It was chosen by arithmetic.

---

# Published (build 40-video)

Copied to `docs/overturn/` as a finished game at the user's request, and added to the list in the repository's README. The development copy stays in `tmp/games/overturn/`, with the test frames (`evidence/`), the ladder reports (`reports/`) and the snapshots of every build named above under `tmp/snapshots/overturn/`; those are not published. The open points of the second milestone stand as written there.
