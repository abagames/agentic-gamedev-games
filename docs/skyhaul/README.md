# SKYHAUL

A role-reversed *Defender*: you are the Lander. Abducted humans hang beneath you as a swinging
tractor chain, and the hero ship is the enemy. It hunts you, shoots your chain loose, and catches
the captives as they fall.

## Tags

Drawn with `node tools/pick-tags.mjs` (first draw adopted): **attach**, **role reversal**.

- **role reversal**: you fly the classic abductor, and the AI flies the classic hero with a hero's
  goals. It shoots the lander, cuts the tractor chain to free the captives, and breaks off the hunt
  to rescue anyone falling. Its rescues are what give you breathing room.
- **attach**: attaching is the only verb. The lowest point of the chain grabs whatever it touches,
  and every attached body becomes the new lowest point. The chain is score, reach and liability at
  once.

## The game

An arcade campaign of **4 planets × 2 rounds**, each followed by a **bonus stage**.
- Clearing round 8 (SIEGE) completes the mission straight away, with no bonus stage after it: a "MISSION COMPLETE"
  ending and a **ships bonus** of 5000 per ship left, counting the one you are flying. Then
  initials entry.
- A strong run takes about 10 minutes.
- Later tours (a sharper pilot, more captives) remain in the code only for simulations
  (`createGame(seed, { endless: true })`).
- **Planets** set the terrain and colors.
- **Rounds** each have their own mix of existing pieces, with a stage name on the READY screen.
  They are not an ever-growing pile of enemies.

| Round | Planet (terrain) | Name | Mix |
|---|---|---|---|
| 1 | VERDA (flat) | – | Defender only, firing every 3.2 s (instead of 2.0) |
| 2 | VERDA | – | Defender + weak Rescuer |
| 3 | OCHRE (shallow swells) | – | Heavies + Rescuer |
| 4 | OCHRE | MINES | Heavies + Bomber (3 mines, one per 2.8 s) |
| 5 | CINDER (two mesas) | GUNS | three ground turrets + hatch shutter + Heavies |
| 6 | CINDER | ACE | a duel with a fast, trigger-happy Defender (speed ×1.35, climb ×1.4, fire interval ×0.7), nothing else |
| 7 | VOID (one wide canyon) | CROSSFIRE | three turrets + Bomber (3 mines) + Heavies + a tighter hatch shutter (2.8 s open / 1.8 s shut) |
| 8 | VOID | SIEGE | the ACE pilot returns (same multipliers and livery as round 6) + Rescuer + Bomber + two turrets; the final round, no Heavies or shutter |
| bonus | after rounds 2, 4, 6 | – | no enemies; captives parachute down for 24 s; delivering all pays PERFECT |

The pieces:
- **Heavy:** counts 2 in the haul, drags twice as hard, hangs lower, falls fast.
- **Bomber:** lays still mines that cut the chain and kill the hull.
- **Rescuer:** unarmed and slower than the lander.
  - It plucks the lowest captive off a hanging chain of 2 or more (or catches a falling one) and
    sets it down away from the lander.
  - Hooking the carried captive with the chain tip steals it back.
- **Turret:** wakes when the lander passes over it.
  - After a 0.6 s telegraph (blinking barrel, dotted column), it fires straight up.
  - The beam stops at the first thing in the column. A chain hanging over the turret **shields**
    the lander and loses only the captives from the hit point down. With no chain in the way it
    reaches the hull.
- **Hatch shutter:** docking only while open.
- **Scaling:** the Defender sharpens by planet (+1 rank) and by tour (+4).

- Round clear: every captive delivered (captives being carried off still count as left). Bonus
  1000 × tour, plus a **time bonus**: 50 × tour for each whole second left on the HOT fuse,
  counted up on the clear screen: the fuse drains (flashing) while the seconds turn into points
  and the HUD score rises with them. A round cleared after going HOT gets no time bonus. In the bot
  ladder it is 9–17% of a run's score, and bigger hauls still out-earn fast small ones (oracle:
  hauls of 6 > 4 > 2).
- Extend: at 10 000, then every 30 000.
- Rankings: the top five with initials, kept in `localStorage`.
- Attract loop: title → demo (played by the bot) → rankings.

## Controls

- **Arrow keys / WASD**: fly (8-way).
- **Space / Enter**: start.
- **Touch**: drag anywhere to steer (relative stick). Tap to start.
- **Initials board**: arrows/WASD to move, Space/Enter/Z to pick, Backspace to delete; `END` to
  finish (25 s timeout, padded with `-`). Tapping a cell also works.
- **M**: mute.

There is no grab button. You grab by flying the hook onto a human, and you deliver by flying up
into the lit hatch under the mothership.

## Core interaction and main decision

*Intended sensation:* dragging a heavy, swinging string of captives through a sky that one pilot is
trying to slice open, and deciding second by second whether to scoop one more.

- Captives hang in a verlet rope. Each one (a Heavy counts 2) slows the lander and lengthens the
  chain's vertical span, which is its **hittable surface**. A longer chain also reaches the ground
  from higher up. Dragging the tip along the ground snowballs.
- Delivery pays **100·W²**, where W is the haul weight. While you carry, "+payout" beside your
  score shows what the chain is worth now, the hatch opening glows, and a small arrow beside the
  lander points home to it.
- The **Defender** lines up on your row, or on the middle of a hanging chain. It **commits** only
  when lined up and within 120 px, and then flies that row dead straight (longer exhaust, row
  ticks at the screen edges). Every shot is telegraphed from the committed row. Terrain is read
  ahead: it climbs before walls, turns at walls it can't clear, dives into valleys after you, and
  never gets shoved up a slope. A pass that terrain would cut short is aborted, not bent.
- A laser, a hull or a mine crossing the chain **cuts it there**. Falling captives can be
  **re-caught** in mid-air after a short delay. The Defender breaks off to rescue them, then holds
  fire briefly.
- With captives aboard, **diving under** a shot keeps the chain; **climbing over** it costs the
  part that doesn't clear.
- **HOT:** a slow round turns the Defender **HOT** (×1.3 speed, climb and fire rate) until the
  round ends.
  - Each round has its own allowance, about 1.5× a strong player's clear time: 50 / 55 / 60 /
    85 / 85 / 85 / 115 / 115 s, +10 s per tour.
  - An amber fuse under HI, with a small Defender icon at its end, shows the time left. It turns
    yellow for the last 10 s, then blinks red with a tick each second for the last 5 s. Then it
    reads **HOT**.

The main decision is grab more or haul now, read against the Defender's state and what the planet
adds. Heavies push toward bigger hauls for strong play; mines and terrain push toward smaller ones.

## Design and interaction language

Early-80s Williams palette on black, everything code-drawn at 320×240. Colour carries the sides.
- **Actors:**
  - Green is you: the lander, "1UP", your reserve landers and the pending "+payout" at top left.
  - Red is the hero hunting you: the Defender. It is coral red with a white stripe; in ACE rounds
    it is deeper red with a gold stripe; when HOT it strobes red and yellow and drags two dark
    afterimages.
  - Neutral grey: the mothership.
  - Others: magenta walkers, orange and gold Heavies, a blue Bomber, red spiked mines, a yellow
    Rescuer, and steel-grey turrets.
- **Terrain:** only the ground changes colour per planet.
- **Chain:** cyan beam dashes flow downward.
- **Hatch:** a dark doorway in the hull. It glows green while you carry, shows red doors when
  shut, and flashes red just before it shuts.
- **Text in play:** 1UP, score and "+payout"; HI and the HOT fuse; round and captives left; the
  bonus timer.
- **Who you are:** because the game inverts a genre everyone knows, it says so once. The title
  reads "YOU ARE THE LANDER", and a "◂YOU" marker points at the lander at the start of each life
  (see Legibility).

Motion feel (render-only; rules and hitboxes unaffected):
- **Lean:** the lander banks up to 2 px into its horizontal motion. The heavier the haul, the more
  slowly it settles.
- **Exhaust:** puffs stream out opposite the held direction.
- **Chain tension:** links stretched to full length glow bright cyan, and slack ones dim.
- **Near miss:** a shot or the Defender's hull skimming past within a few px of the hull or chain
  gives a spark streak and a whoosh. It is detected in the core as a `graze` event, fires once per
  shot or pass, and occurs about 5–8 times a minute in the bot ladder.
- **Success and loss:**
  - A just-grabbed body is drawn yanked up toward the lander for an instant.
  - Each body reeled in lights the mothership's windows, and a haul of weight 5+ lights the whole
    hull.
  - The HUD score rolls up rather than jumping.
  - After a cut, the part of the chain left hanging springs upward, hardest at the cut end. This
    is the one physics change: `CFG.cutRecoil`.
- **Atmosphere:**
  - Sounds are panned left–right by where they happen.
  - When the lander goes down, the Defender rolls and sheds stars.
  - Going HOT flashes a red screen edge for about a second.

Feedback is scaled to the event:
- **Grab:** a blip whose pitch climbs with weight. A Heavy lands with a low thud. A mid-air catch
  gets a brighter chime and "CATCH".
- **Cut or mine:** a white flash on the body, a spark, and a falling tone.
- **Turret shot the chain took:** a white spark burst, "SHIELD" and a metallic clink.
- **Steal-back:** the lander flashes white and "BACK" appears.
- **Hauling:** a continuous engine chug while captives hang, lower and slower as the weight grows (fades out on delivery, cut or death).
- **Delivery:** reel-in ticks. Only hauls of weight 5 or more get the big arpeggio and flash.
- **Death:** the only screen shake.
- **Jingles:** reserved for ceremonies (round, new planet, bonus start, perfect or plain bonus end,
  clear, extend, game over, high score, entry done). Sound effects stay one-shot.

## What the slice validated (step 1) and what the expansion checks

1. That one attached object working as score, reach, and vulnerable surface gives a grab-more vs.
   haul-now decision that flips with the Defender's state. It holds on flat ground: hoarding
   collapses, and the oracle's best is 6.
2. That each added system shifts that decision rather than just adding hazard. With Heavies, the
   oracle does best taking them and the human-limited bot does best avoiding them. With the
   Bomber, the oracle's best haul drops from 6 to 2–4. Terrain gives temporary cover.
3. That the committed, telegraphed pilot stays readable on uneven ground (tested: a committed
   pass never changes rows on any planet).

## Legibility (first-contact check)

The `gating-intent-legibility` gate was run 5 times on the shipping build. Sixty isolated graders
were each shown two frames of a round, with no rules, and asked what the player is trying to do.
The full record is in `LEGIBILITY.md`.
- **From stills alone:** SKYHAUL reads as *Defender*. The green lander is taken for the enemy
  abducting civilians (7/8 in the first run).
  - Colour coding, the HUD layout and lives icons did not overturn that genre prior.
  - Some changes backfired and were reverted: green lander lives icons read as an enemy wave
    counter, a green mothership read as the player's craft, and the hatch chevrons read as an
    enemy formation.
- **Once the grader knows which craft the arrows move** (as a player does after the first key
  press, and as the title line and spawn marker say), the grab is legible: 7–8/8 against 4/8 on a
  degraded control.
- **Delivering to the hatch** stays weak from stills (≤2/8). It is learned by seeing one delivery.
  The attract demo therefore hauls small, so the first delivery shows within seconds, and the home
  arrow and glowing hatch mark the destination while you carry.

## Deliberately omitted / removed

- **Runner (removed):** a stealth human type (it looks ahead and ducks, and a spotted lander
  calls the Defender). The ladder showed sneaking cost more than being spotted; details in
  `DESIGN_SEARCH.md`.
- **Omitted:** two simultaneous Defenders, smart bombs, a scrolling world with radar, BGM,
  2-player alternation, difficulty options, a drop/decoy button.

## Run

Open `index.html` in a browser (it runs from `file://`, with no build step), or serve the folder
with any static server.

## Tests

From `docs/skyhaul/` (Playwright comes from the repository's root `node_modules`):

- `node tests/core.test.cjs`: 42 conformance tests (including the time bonus and mission complete) (now including the round-1 rules, the Rescuer, the stage table, and turrets: telegraph, shield, direct hit, partial shield from a swung chain).
  - Core: grab rules, W² payout, no empty docking, cut position, death, re-catch, rescue plus
    calm, committed pass, telegraph then fire.
  - Heavies and mines/Bomber.
  - Terrain: planet schedule, lasers stopped by terrain, solid walls vs. gentle slopes, nobody
    stuck on a cliff, shutter docking, straight passes over terrain on every planet.
  - Bonus stage: schedule, no enemies, PERFECT.
  - Flow: round clear, HOT, extend, idle loses, determinism.
- `node tests/browser.probe.cjs [shotDir]`: 14 checks on the real page, the last being round 8 →
  ending (no bonus stage) → initials. It covers keyboard and
  touch control, grab and delivery, death and respawn, and a bonus stage through to the next
  planet. It also covers game over → initials with arrows and WASD (tie ranked above the older
  score, grace window, auto-jump to END) → table → title, and the attract cycle without writing
  rankings. Then a non-qualifying game over and a second loop, entry timeout with padding, and no
  console errors.
- `node tests/campaign.sim.cjs`: per-planet play time, clears, deaths per minute and haul weight
  for the oracle and human-limited bots.
- `node tests/pocket.sim.cjs`: parks an idle lander in each planet's lowest spot. It must not
  survive.
- `node tests/stages.sim.cjs [runs]`: per-round difficulty profile (deaths per minute, clears, main causes) for the oracle and human-limited readers.
- `node tests/rescuer.sim.cjs [paramsJSON] [minChain]`: Rescuer engagement on round 2 (share
  of time hunting, snatches per minute, steal-back rate, score and death cost).
- `node tests/balance.sim.cjs [runs] [s] [rulesJSON] [policyRegex]`: the policy ladder under any
  rule mix.
- `node tests/exploit.sim.cjs` (camping strategies, sweep frequency) and
  `node tests/human-sweep.cjs` (sensitivity to each human limitation).
- **Validation-only hooks:**
  - `index.html?degrade=1` renders the legibility gate's degraded control (one grey, uniform
    blocks, no hatch, payout or fuse).
  - `window.__sky` exposes `app.paused`, `stepOnce`, `render` and `startGame(seed)` for
    frame-exact capture, plus `app.autopilot` (a bot supplying input each tick).
- `npm run video -- [outDir=media] [titleSec=4] [playSec=16] [seed=201] [haulAt=3]`: records
  the title screen and then bot play (Chromium MediaRecorder: canvas plus WebAudio). ffmpeg
  then writes `skyhaul-play.mp4` (960x720, 30 fps, AAC) and `skyhaul-play.gif` (480x360,
  15 fps, silent). The CSS scanline overlay is not captured. The committed
  `media/skyhaul-play.mp4` and `screenshot.gif` (the renamed GIF) come from the default arguments.

## Tuning evidence (current build)

Per round, each played alone with unlimited lives (`tests/stages.sim.cjs`, 20 seeds):

| round | name | oracle deaths/min | oracle clears | human-limited deaths/min | human-limited clears |
|---|---|---|---|---|---|
| 1 | – | 0.09 | 20/20 | 1.62 | 20/20 |
| 2 | – | 0.15 | 20/20 | 3.54 | 17/20 |
| 3 | – | 0.00 | 20/20 | 3.58 | 18/20 |
| 4 | MINES | 0.16 | 20/20 | 2.95 | 16/20 |
| 5 | GUNS | 0.27 | 20/20 | 3.80 | 15/20 |
| 6 | ACE | 0.35 | 18/20 | 3.74 | 19/20 |
| 7 | CROSSFIRE | 0.94 | 19/20 | 3.64 | 12/20 |
| 8 | SIEGE | 0.49 | 16/20 | 3.76 | 10/20 |

Campaign, oracle hauling at 4 (`tests/campaign.sim.cjs`, run endless, 20 × 800 s): deaths per
minute by planet 0.14 / 0.18 / 0.24 / 0.62. The oracle reaches the mission-complete point (round 8)
and beyond. Every camping or pocket strategy dies within about
30 s (pockets: within 3–6 s) with 0 points.

**Balance reference:** at the user's request, balance is tuned on the oracle reader. The
human-limited reader (0.24 s latency, lapses, 9 Hz decisions, about 3 inputs/s) is only a
pessimistic secondary check. Hands-on play found the game "relatively easy", so the bots are
understood to under-rate a skilled player. After the round-7 shutter and the round-8 ace, the
oracle's per-round deaths per minute are 0.45 (round 6), 0.60 (round 7) and 1.00 (round 8). It
completes the mission in 16/20 full runs, in about 9.8 minutes with about 2.8 ships left.

## Known limitations and untested behaviour

- **Hands-on play:** reported OK up to the expansion (planets 2–4, Heavies, the Bomber, bonus
  stages). Not yet played by hand: the Rescuer, turrets, the per-round stage table and ACE, the
  per-round HOT fuse, and the legibility changes (HUD, colours, YOU marker, home arrow).
- **Legibility from stills:** knowing which craft is yours and where to deliver is carried by
  input, the title, the spawn marker and one watched delivery, not by a mid-round frame (see
  Legibility).
- **Later tours:** not part of the shipped campaign (it ends at round 8). Exercised only by the
  oracle bot in endless simulations.
- **Ties:** no tie-break beyond "new entry ranks above an equal old one".
- **Audio:** master level raised twice (0.28 → 0.5 → 0.8) behind a limiter so stacked voices do
  not clip.
  The mix is not validated by ear (runtime only).
- **Touch:** not tried on a physical device, including the initials board.
- **Walls:** a human standing right against a mesa wall can be out of reach of an *empty* chain
  (the hull can't get down beside the wall). Walkers wander off within seconds, so it doesn't
  soft-lock a round.
