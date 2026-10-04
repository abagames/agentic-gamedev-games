# WRECKFALL revision history (human-directed changes)

WRECKFALL was first generated end to end from a single instruction, and then revised in response to
instructions and observations from a human reviewer. This document reconstructs that revision
process, after the first generation, from the Claude Code session history.

- Covered: rules, difficulty and progression, visuals, audio, game feel, controls, bug fixes.
- Not covered: video and screenshot generation, itch.io materials, the move to `docs/` and commits.
- Quotes are the reviewer's instructions, translated from Japanese.
- Numbers are bot measurements taken at the time, and some were superseded by later changes. See
  [README.md](README.md) for the current rules and measurements.

## Starting point (the first generated version)

The first instruction was: "Make a 1980s fixed-screen retro arcade shooter. Shots go upward only,
not in all directions." The version reported as complete had these properties:

- A craft you shoot becomes a wreck that falls and crushes the craft it passes through. The hulks
  in the bottom lane deflect shots and can only be destroyed by dropping a wreck on them.
- Waves were endless. Escorts were refilled 2.4 s after being destroyed.
- A hulk reaching the defence line cost one life, and the formation was pushed back up.
- The HEIGHT bonus was "room left above the line × 10 × wave number".
- Extends came at 20,000 points, then every 60,000.
- There were no special craft, thick hulks, mothership or formation behaviours.
- Nobody had played it by hand yet. Difficulty was set from bots only.

## Sequence of changes

| # | Reviewer's instruction or observation | Outcome | Area |
|---|---|---|---|
| 1 | What would raise replay value? | Five directions proposed | Rules |
| 2 | Won't a challenge stage become a fixed answer repeated every time? | Prototyped with lane start positions randomized each time | Rules |
| 3 | It differs too little from a normal stage, so it isn't needed | Challenge stage removed | Rules |
| 4 | Go ahead | HEAVY and SPLITTER added | Rules |
| 5 | HEAVY doesn't affect how the game unfolds | HEAVY removed, SPLITTER kept | Rules |
| 6 | Would it be clearer if the whole formation simply descended? | Stepped descent proposed (not built at this point) | Rules |
| 7 | Won't stalling to keep shooting until the last moment score the most? | Farming exploit confirmed by measurement | Rules |
| 8 | Invasion should be game over; raise descent speed and the HEIGHT bonus | Implemented as directed | Rules |
| 9 | Do options 1 and 2 | Thick hulks and the mothership added | Rules |
| 10 | Go ahead; the time allowance should scale with the number of targets | Formation behaviours added; allowance derived from target count | Rules / difficulty |
| 11 | Design how many waves the game should have, with the wave layout | 12-wave campaign | Difficulty |
| 12 | (pasted TypeError) | Rendering crash fixed | Bug |
| 13 | The yellow and green enemies look too much like Space Invaders | Both redrawn | Visuals |
| 14 | Change the UFO's shape a little too | Mothership redrawn | Visuals |
| 15 | The sound is almost inaudible | Volume raised about 8–10× | Audio |
| 16 | What could improve the game feel? | Ten items proposed, all built on "do them in order" | Game feel |
| 17 | Make the second extend 100,000; the ship count goes up by one on death | Extend changed, display fixed | Difficulty / bug |
| 18 | The red outline box on player death isn't needed | Cause-of-death outline removed | Game feel |
| 19 | Is EXTEND not shown when the extend happens on wave clear? | Display and jingle order fixed | Bug |
| 20 | Should dragging respond outside the game screen too? | Touch is received by the whole page | Controls |
| 21 | Would about 100 above and 300 below be a good balance? | Margins split 1:3 on portrait screens | Controls |

## 1. Rules and game structure

Rule changes are listed in order, because each decision set the conditions for the next.

### 1.1 Challenge stage — prototyped, then removed

- **Trigger:** asked "what would raise replay value, such as per-stage variation?", five directions
  were proposed: lane movement patterns, craft with different wreck behaviour, hulk variants, a
  challenge stage, and scoring and record keeping.
- **Observation:** "Won't a challenge stage become a fixed answer repeated every time? Will it have
  depth in timing?"
- **Response:** a fixed layout would indeed become memorization. The prototype kept the formation
  fixed, randomized each lane's start position every time, refilled no escorts, and limited the
  shots (7, then 6, then 5).
- **Measurement:** PERFECT rate on the first challenge was 100% for the strongest bot, 33% for the
  human-limited bot and 0% for the bot that shoots the nearest craft. A recorded winning input
  replayed on a different layout crushed only 0.3–0.5 hulks, so it could not be solved by
  memorization.
- **Verdict:** "It differs too little from a normal stage, so the bonus stage isn't needed." The
  code, tests and measurement script were all removed.

### 1.2 HEAVY and SPLITTER — HEAVY removed

- **Added:** two craft whose wrecks behave differently. A HEAVY wreck does not drift sideways,
  falls straight and fast, and sends out a shockwave on landing. A SPLITTER wreck splits into two
  that spread left and right.
- **Measurement:** the strongest bot avoided shooting heavies directly (8% of shots against a 21%
  share of craft) and sought out splitters. By bot statistics, targeting had changed.
- **Observation:** "HEAVY doesn't affect how the game unfolds."
- **Cause:** an ordinary wreck drifts at only half its lane's speed, so it lands only about
  12–20 px from where a heavy would. That difference cannot be seen in play, and the shockwave
  mattered only when a heavy was shot from directly below.
- **Verdict:** a rework was offered (a heavy landing pushes the formation back up), but "remove it
  and keep only SPLITTER" was chosen. SPLITTER became the only special craft.

The policy drawn from these two cases: variation must visibly change how play unfolds, and a shift
in bot statistics is not evidence of that. Later expansion proposals were chosen on this basis.

### 1.3 Invasion and the HEIGHT bonus — closing the farming exploit

- **Question:** "For the HEIGHT concept, would it be clearer if the whole formation simply
  descended?" The whole formation already descended, but at 0.9 px/s on wave 1 it was too slow to
  notice.
- **Observation:** "Unless the HEIGHT bonus is set properly, won't shooting enemies until the last
  moment score the most? That is undesirable for the flow of the game."
- **Measurement:** a bot that deliberately holds back the last hulk was written to test this.
  Stalling scored 1.2–2.2× as much per wave (wave 2: 3,685 against 7,973). Since an invasion only
  cost one life and pushed the formation back, it could be repeated.
- **Rejected proposal:** paying out a chain's points only when the wreck crushes a hulk.
- **Reviewer's direction:** "Shouldn't invasion be game over? Also, scoring even when no hulk is
  destroyed feels better. So combine a faster invasion with a larger HEIGHT bonus."
- **Implementation:**
  - Invasion is an immediate game over, whatever the lives left. Lives now cover only bombs and
    wrecks.
  - Descent speed on wave 1 went from 0.9 to 1.5 px/s, plus 0.2 per wave, capped at 2.8.
  - The HEIGHT bonus became "room left × 40 × (wave + 1)".
  - The bonus still on offer is shown at the right end of the defence line at all times.
- **Result:** clearing promptly outscored stalling on waves 1, 2 and 5 (wave 5: 15,143 against
  9,585).

### 1.4 Thick hulks and the mothership

Of the proposals made for "what's the next expansion?", two were built on "do options 1 and 2".

- **Thick hulk** (orange plating): the outcome depends on how many craft the wreck has swallowed.
  One does nothing, two crack the plate and leave an ordinary hulk, three or more crush it. They
  appear in the bottom lane from wave 3.
  - A version where small wrecks simply bounced walled out human-level play, and a version where
    the plate was just knocked off let greedy shooting through, so the rule settled on these three
    steps.
- **Mothership:** crosses above the top lane. A hit is worth 300 points. Its wreck is 56 px wide,
  counts as three craft, and crushes a thick hulk outright.
  - At the first width of 30 px its wreck crushed only 1 hulk in 30 hits, so it was widened.

### 1.5 Formation behaviours — CONVOY and REVERSE kept, PULSE dropped

From the proposals for "what's the next expansion?", "go ahead" led to lanes moving differently
from wave to wave.

- **CONVOY:** every lane moves the same way. Vertical alignments become rarer, and shots per hulk
  rose from 3.0 to 4.4.
- **REVERSE:** each crushed hulk reverses the lane above it. The board keeps rearranging, and
  clearing actually got faster (46 s to 29 s).
- **PULSE** (lanes stop and start together): no bot fired more during the stops, and the effect was
  the same as CONVOY, so it was tried and dropped.

## 2. Difficulty and progression

### 2.1 Time allowance scaled to targets

- **Observation:** "Is the descent speed appropriate when stage 3 adds targets? The time allowance
  should scale with the number of targets."
- **Finding:** time until invasion shrank as targets grew (52 s on wave 1, 39 s on wave 3, 34 s on
  wave 4, 30 s on wave 5). This caused the walls at waves 3 and 5.
- **Response:** each wave's allowance is set first as "(24 s + 5 s per hulk + 12 s per thick hulk)
  × pressure", and descent speed is derived from it. Pressure tightens each wave, down to 0.55.
- **Result:** the human-limited bot's clears on waves 1–5 (out of 12 runs) went from 12/12/9/7/0 to
  12/12/11/11/11.

### 2.2 Twelve-wave campaign

- **Instruction:** "Considering this game's wave variation and difficulty curve, design how many
  waves should make a game clear, together with the wave layout."
- **Basis:** every new element has appeared by wave 6, density reaches its cap at wave 8 and time
  pressure at wave 10. After that only speed and bomb rate changed.
- **Layout:** four acts of three waves. Each wave introduces at most one new element, which a test
  checks. Wave 4 had previously introduced two hulk lanes, CONVOY, splitters and a thick hulk at
  once, and these were separated. Wave 12, LAST STAND, combines everything.
- **Ending:** clearing wave 12 pays 10,000 points per remaining ship and shows the ALL CLEAR
  screen. The HUD shows the wave as "7/12".
- **Tuning:** waves with two hulk lanes get 10 s more, and CONVOY waves get 1.15× the allowance.
- **Result** (12 runs each): the strongest bot all-cleared 12/12, the human-limited bot 1/12 with a
  median reach of wave 7. The human-limited bot loses about one run per wave, with no sudden wall.

### 2.3 Extends

- After the invasion rule change inflated scores, extends had been moved to 30,000 and then every
  100,000 after that (130,000, 230,000, …).
- On "make the second extend 100,000", they became 30,000, then 100,000, then every 100,000
  (200,000, 300,000, …).

## 3. Visuals

- **Yellow and green enemies** ("they look a little too much like Space Invaders enemies; rework
  them a bit"):
  - Yellow (30 points) changed from a squid shape to a diamond-shaped craft with turning rotors.
  - Green (20 points) changed from a crab shape to a downward-pointing delta whose wing tips and
    exhaust flicker.
- **Mothership** ("change the UFO's shape a little too"): changed from a domed saucer to a flat
  carrier, with a small cockpit on top, engine pods at both ends and a row of cyan windows along
  the belly.
- Colour, points, size and hitboxes are unchanged in every case, so rules and difficulty are
  unaffected.

## 4. Audio

- **Observation:** "The sound is almost inaudible, so raise the volume a lot."
- **Cause:** the overall volume was low at 0.32, and most sounds peaked at 0.03–0.1 of full scale.
  In addition, the browser's built-in compressor, added to prevent distortion, turned short sounds
  such as the shot down to about a quarter.
- **Response:** the overall volume was raised to 4.0, and the compressor was replaced with a soft
  clipper that only rounds off the loudest peaks. The mothership's sound, the quietest, got a small
  boost of its own.
- **Result** (peak level, 1.0 is full scale):

| Sound | Before | After |
|---|---|---|
| Shot | 0.04 | 0.28 |
| March | 0.06 | 0.46 |
| Craft destroyed | 0.09 | 0.61 |
| Hulk crushed (loudest) | 0.45 | 0.94 |
| Mothership | 0.01 | 0.17 |

The balance between sounds was kept, and crushing a hulk is still the loudest sound.

## 5. Game feel

Before the campaign was designed, the reviewer had confirmed "the game feel is OK". Later, asked
"what could improve the game feel?", ten items were proposed against the game-feel skill's
checklist, and all were built on "do them in order". The largest gap was that moving and dodging
right after a shot produced almost no response. None of the items change rules or hitboxes.

| # | Item | Channel | Status |
|---|---|---|---|
| A1 | Muzzle flash and a 2 px recoil on firing | Display | Kept |
| A2 | Spark and whoosh on a near miss by a wreck or bomb | Display, sound | Kept |
| A3 | 0.5 s slow motion on death, with a red outline around the cause | Display | Slow motion kept, outline removed |
| A4 | Cannon leans into its direction of travel | Display | Kept |
| B5 | Falling whistle for wrecks of 3+ craft, rising in pitch near the ground | Sound | Kept |
| B6 | Formation dips 1 px on each march beat (display only) | Display | Kept |
| B7 | Screen edges pulse red and a heartbeat joins the march near the line | Display, sound | Kept |
| C8 | HEIGHT bonus counts up | Display, sound | Kept |
| C9 | A thick hulk's plate cracks and its chunks fall | Display | Kept |
| C10 | Glow on wrecks of 2+ craft that grows with the chain | Display | Kept |

- Near misses occur about 3–4 times a minute in human-limited play, and their response is clearly
  weaker than an actual hit.
- Crushing a hulk remains the loudest sound and the only event with a brief freeze, so the
  strongest feedback stays on the most important outcome.
- **A3's outline** was removed on "the red outline box on player death isn't needed". B6 is a
  lightweight form of the stepped descent proposed in 1.3.

## 6. Controls and layout

These questions came up while preparing the itch.io release, but the changes are to the published
game itself (`main.js`).

- **Touch outside the game screen** ("should dragging respond outside the game screen, anywhere in
  the browser?"): touch and click are now received by the whole page instead of the canvas.
  Dragging is relative, so the cannon moves the same way from the margins, and a finger no longer
  has to cover the landing markers near the cannon.
- **Placement on portrait screens** ("would about 100 above and 300 below be a good balance?"): on
  a portrait screen the vertical margin is split 1:3, moving the game screen up. On a 390×844
  screen that gives 99 px above and 299 px below. Landscape screens stay centred.

## 7. Bug fixes

- **Rendering crash:** a craft blinking red before dropping a bomb and flashing white from a hit at
  the same moment looked up a sprite that does not exist, and `drawEnemy` threw a TypeError. Only
  one tint is now applied at a time, with a fallback to the untinted sprite.
- **Ship count going up by one on death:** reserve icons were drawn as "lives minus 1 while alive",
  so one extra icon showed during the explosion. A single core function now returns the count, and
  it is always lives minus 1.
- **EXTEND not shown on wave clear:** when the HEIGHT bonus crossed an extend threshold, the EXTEND
  banner was overwritten at once by WAVE CLEAR and its jingle was drowned out. EXTEND now has its
  own line, the new ship icon blinks, and the jingle plays 0.9 s later.

Each fix added a rule test or a browser-probe step that detects a regression.

## Not adopted

| Idea | What happened |
|---|---|
| Challenge stage | Prototyped, then removed as too close to a normal stage |
| HEAVY | Prototyped, then removed as having no effect on how play unfolds |
| PULSE | Dropped after bot measurement showed it added no new decision |
| Paying chain points only on a hulk crush | Proposed only; rejected because scoring on escort kills feels better |
| Stepped descent (one row at fixed intervals) | Proposed only; replaced by the display-only 1 px dip on each beat |
| Red outline around the cause of death | Built, then removed as unnecessary |

## Validation notes

- At the end of these revisions, 27 rule tests and 13 browser-probe steps pass.
- All difficulty numbers come from bot measurements. Hands-on confirmation is limited to the
  observations above and "the game feel is OK".
- The added sounds (falling whistle, heartbeat, near miss) and the raised volume were not checked
  by ear on the implementation side.
- Touch control and the portrait layout were checked with automated browser input, not on a real
  phone.
