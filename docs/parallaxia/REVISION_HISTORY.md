# PARALLAXIA — revision history

What happened between 2026-10-07 and 2026-10-12. The author (who wrote the original PARSEC47) played
builds, reported and decided; the production agent made the changes. They are grouped by area here.
Each entry gives the observation, its cause, the change and the evidence. A name in `code` after a
date is the label of the snapshot of the build at that point (the snapshots are not published; see
`README.md`).

Policies named below: `seeker` (sees the screen exactly and acts on it), `keeper` (plays to keep
the multiplier; the strong policy), `author` (the human-limited policy fitted to three replays of
the author's play), `humanLimited` (the older human-limited policy, which only delays its inputs).
The modes were renamed on 2026-10-11: the old NORMAL, RAPID and DENSE are today's CLOSE, CHAIN and
GRAZE. The identifiers in the code (`normal`, `rapid`, `dense`) did not change.

## Intent

Remake PARSEC47 around what was its core: **fast barrages that are a pleasure to dodge**. What the
remake is meant to do better than the original is **the feel of shots landing and of things being
destroyed**. The only inputs are movement and shot. Lock-on charges while shot is held and fires
when it is let go. There is no slow-down button and no hit stop. The screen is tall, the field is
wider than the screen, and enemies off screen hold their fire. The game is the same on a desktop
and on a phone. Whether it is fun is the author's judgement; the agent supplies playable builds,
checks and measurements.

## Up to the first playable builds (2026-10-07 to 10-08)

1. **The working environment.** Primary sources (`reference/`), a draft specification, a list of
   the author's decisions, and the checking tools (`research/setup-log.md`). The original's
   distribution is kept apart and none of its code was copied.
2. **Ship, shot, one enemy with one barrage, score and items** (`first-playable`). The screen was
   640x480.
3. **A replay's state hash differed between Node and Chromium.** Cause: `Math.atan2` differs in its
   last bit between the two. Change: the simulation's trigonometry moved to `src/sim/math.js`, and
   a unit test fails if the simulation uses `Math.sin` and the like. Evidence: the determinism
   check on the browser side.
4. **Three proposals for the look** (1980s raster, vector, solid; all tall), switchable with the
   digit keys (`look-proposals`). The author chose 1980s raster, a tall screen and large
   characters; the others were removed. (The record of the comparison and its screenshots are
   not published.)
5. **Touch control**, as a first attempt: drag to move, fire while touching, a second finger for
   slow. Proposals for lock-on on a phone went into `docs/controls-mobile.md`.
6. **Middle enemies and lock-on lasers** (`lock-release`). The author's decisions: lock-on is
   "charge, then let go to fire"; a phone is played with one hand; the desktop shot is not
   automatic. The bonus for lasers fired together (+50 % for each further laser) is the agent's
   assumption.
7. **Slow was removed** (the author's decision), from the input, the simulation and the checks.
8. **A first pass at the feel of hits and destruction** (`feel-1`, `docs/game-feel.md`). The
   author: good; no hit stop wanted.
9. **Sideways scrolling** (`scroll`). The field became 28 wide and the view's position became part
   of the simulation's state. The score line moved to a strip above the field (the ship was hidden
   behind it at the top edge).

## 1. Rules and structure

### 1.1 A bullet's seed rides on its enemy (2026-10-10)
- **Observation (author):** the small enemies' bullets appear in the wrong place.
- **Cause:** for its first 24 frames a bullet is a "seed" that cannot hit, and it crept toward the
  ship. A small enemy falls more than 5 units in that time, so by the moment the seed became a
  bullet it was 3.5 units from its enemy on average and 4.9 at most (measured on seed 3).
- **Change:** a seed rides on the enemy that fired it and leaves from there at full speed after 24
  frames. An aimed bullet takes its aim at that moment. Destroying the enemy removes its seeds (the
  author's decision).
- **Evidence:** probe `miss`.

### 1.2 Large enemies, sections, generated barrages, rank (2026-10-10, `sections`, `barrage`)
- Large enemies with wing guns, the mix of enemy streams per section, generated enemy types,
  bullets that split into bullets, and a rank that rises every loop. The table of mixes and the
  split of rank were looked up in the original and written into `reference/mechanics.md` before
  being used.
- Barrages are written as JavaScript data (BulletML is not used). `tools/trace.mjs` runs one
  generated type on its own.

### 1.3 Enemy bullet speed (2026-10-10, `faster-bullets`)
- **Observation (author):** the enemy bullets are still too slow; everything else is fine.
- **Change:** 1.6 times faster. The author accepted it.

### 1.4 The large rework, stage 1: no items, a forward shot, ramming, formations (2026-10-10, `formation-stage1`)
- The author's decisions: items go, the shot fires forward only, touching an enemy's hull costs a
  ship, small enemies fly in formations and wiping one out feeds a chain bonus (the plan is
  `docs/formation-plan.md`).
- Changed from the plan: the ramming box follows the hull as drawn.
- **A defect found on the way:** misses went on happening after game over; on an older build the
  ships left went down to −6. Hits are now tested only during play.

### 1.5 The shot's rate and width (2026-10-10, `shot-limit`, `twin-shot`, `wide-shot`)
- **Observation (author):** is the ship's shot too strong?
- **Change:** at most 4 shots on screen, one every 3 frames (the original fired one a frame, 32 on
  screen). Five settings were compared; 4 is where the limit starts to bite.
- On the author's instruction the shot became a twin shot as wide as the ship, and then the two
  became a matter of drawing only: it is one wide shot (half width 0.5, 1 damage).

### 1.6 The large rework, stage 2: flight patterns (2026-10-10, `flight-patterns`, `shapes`, `middle-flights`, `more-flights`)
- Eight flight patterns for small formations were designed and compared against criteria and seeds
  fixed beforehand (`docs/flight-eval.md`). Verdicts: 1 adopted, 6 held, 1 rejected. The seven
  adopted or held went into the game.
- On the author's instruction: three patterns that move sideways (sine, zigzag, cross); a shape of
  its own for each pattern; one new pattern per section.
- Four of the small patterns now react to the ship (hover by its column, hairpin and zigzag by its
  side, cross by turning down when it passes overhead). A choice made for a whole formation is made
  by the first of it to reach that leg.
- Middle enemies were rebuilt: 16 hit points instead of 32, no splitting bullets, firing less than
  half the time, four slow ways of flying. Large enemies went from one way of flying to four.
- **Result:** with the middle enemies lightened, early pressure fell a great deal (`seeker` ended
  within 10 minutes in 12 runs of 12 before, 6 of 12 after). The adoption criteria could no longer
  tell the patterns apart.

### 1.7 Simple barrages for small enemies (2026-10-10, `small-fire`, `short-splits`)
- On the author's instruction a small enemy fires one bullet at a time, aimed or straight down. Its
  difficulty is set by how often it fires and how fast the bullet is (`SMALL_FIRE`). Simplifying
  alone dropped `seeker` to 6 of 12 runs ending within 10 minutes; 1.3 times the rate and 1.15
  times the speed brought it back to 10.
- Splitting was shortened: however many stages, it is over about 16 frames after the bullet leaves.

### 1.8 Faster, sparser bullets from middle and large enemies and bosses (2026-10-10, `fast-sparse`, `boss-fast`)
- The author's instruction. Every bullet has a lowest speed (0.85 of the base). With `keeper`,
  bullets on screen went from 6.0 to 2.8 on average, the longest a bullet stayed from 311 to 133
  frames, and slow bullets from 29.7 % to 0 %. Misses per minute were about the same (0.68 to
  0.66).
- Bosses were pushed further (1.5 times the speed, half the density). At 0.6 of the density misses
  per boss rose to 0.32, hence 0.5.

### 1.9 Bosses (2026-10-10, `boss`, `boss-wings`)
- The fifth section of a loop is a middle boss and the tenth a large one; their wings can be shot
  off one by one. At 200/280 hit points the policies destroyed them in 4 to 8 seconds, so they
  became 360/520. At their first strength 65 % of the policies' misses were at bosses, so their
  barrages were weakened.
- The author found the builds up to the bosses to have "no problem at present". After that came
  the bosses' drawings, five barrages of their own, and the rule that taking off every wing before
  the body counts in the chain.
- **The wings as a shield** (2026-10-11, `guard`): taking the wings first had made almost no
  difference to the score. While a wing is left, the body takes 34 % of the damage. A boss now
  takes the policy 9.4 seconds wings first and 10.5 seconds body only, so the wings are worth
  taking. At "half" the two times came out the same.
- The body went to two thirds of its hit points (240/350) and a wing to 60 (2026-10-11).
- **How long a boss stays** (2026-10-11, `boss-escape`): 15 seconds for the middle boss and 24 for
  the large one, instead of 30 for both, with a warning from 3 seconds before.

### 1.10 The ground (2026-10-10 to 10-11)
- On the author's instruction (with Star Force as the reference), things on the ground that do not
  attack scroll past below. Its form changed four times:
  1. Islands, each with a fixed bonus (`ground`). The policies showed the ground to be worth too
     little.
  2. Clearing an island counts in the chain, and letting one go breaks it (`ground-chain`). The
     policy that also went for the ground now scored highest, but the chain broke about five times
     a minute.
  3. Bands across the whole width, rows of bonus targets, walls, hidden targets (`bands`).
  4. **The ground is points only**, in 11 free layouts (`ground-free`; the author's decision). It
     touches neither the chain nor the multiplier, and nothing is lost by letting it go.
- The author: "still too little on the ground". Three more layouts, all of them denser, and lower
  points (`ground-dense`). Ground targets on screen went from 9 to 20 on average. The ground's
  share of the score is 31 % in CLOSE, 17 % in CHAIN and 21 % in GRAZE.
- A hidden target takes 30 frames to come up, during which it cannot be destroyed (`hidden-rise`).

### 1.11 Fixed sectors, modes, start sectors (2026-10-10, `fixed-sectors`, `modes`)
- The author's decision: what appears, and in which order, follows from the sector number; only
  positions change from run to run. The fixed course was inspected with `keeper` up to sector 60,
  and the boss of sector 55, which stood out, was corrected.
- Endless sectors and three modes. A mode changes only the speed and density of enemy bullets and
  the ship's speed. A run can start from any tenth sector reached, and what one mode opens is open
  in all three.
- On the author's remark the ship was slowed in all three modes (0.4 / 0.52 / 0.34;
  `slower-ship`).

### 1.12 The score is "points for the kill × multiplier" (2026-10-10, `rate`, `rate-3`)
- The author's decision: the formation bonus gave way to a multiplier (x1 to x16), earned
  differently in each mode: in CLOSE by being near, in CHAIN by wiping out formations in a row, in
  GRAZE by enemy bullets passing close.
- CLOSE measures to the edge of the target's hit box and rises faster the nearer the ship is (the
  square). Above y 13.5 it was x1 (removed 2026-10-12, see 1.14). Ground targets stop at x6.
- GRAZE: radius 2, +1 a bullet. On the author's instruction it sinks from one second after the
  last graze, by 1.2 a second.

### 1.13 More to meet in every loop (2026-10-10 to 10-11, `variety`, `section-kinds`)
- On the author's instruction: more flight patterns for small formations, more ways of flying for
  middle and large enemies, more barrage shapes, more boss movements, and sections with a character
  of their own (SWARM, HEAVY, ISLANDS), dealt out over the first five loops. The first loop was
  left as it was.
- From the sixth loop a formation grows by one enemy a loop, and from the eighth a section runs one
  more stream of formations.
- The number of enemies became fixed per sector; formations come in a set order of sizes; and some
  sections change the formations' speed or reach (SLOW, FAST, LONG, WIDE).

### 1.14 Adjustments of 2026-10-12 (each from a question by the author)
- **WIDE and FAST made little difference.** Over the 22 patterns flown alone, WIDE moved a formation
  by only one unit and FAST shortened its time in the field by only 14 %. WIDE is now applied twice
  (mean |x| 4.1 to 7.5) and FAST is 1.6 times (22 % shorter). Misses did not change beyond the
  section-to-section noise (`wide-fast`).
- **Some small enemies leave without firing.** The figure first given to the author (about half)
  was inflated by the way it was measured: every miss clears the seeds. Counting only enemies that
  did not overlap a miss: cross 47 %, loop 13 %, hook 4 %. The legs on which hook, cross, loop and
  curl may fire were widened; afterwards cross 23 %, loop 3 %, hook 1 % (`fire-legs`).
- **The dive was no threat.** The policies were rammed 0 to 3 times in about 2,600 dives. Stopping
  for less time and diving faster did not change that (`dive`). Re-aiming on the way down made the
  dive easier to shoot. It now swings out to the side and cuts across the ship at an angle: 15 rams
  in 2,584 dives (`dive-slash`). All 196 misses measured afterwards had a way out half a second
  before.
- **In a WIDE section the dive was too abrupt** (the author). It moved 2.0 a frame against a stated
  top speed of 0.9: the two changes above had compounded. The dive alone is not widened
  (`dive-wide`).
- **Bullets split at a set distance.** The time to a split was a number of frames, so a faster
  bullet split further away. It is now divided by the bullet's speed; the median distance a carrier
  flies is 3.3 to 3.9 in every mode.
- **CLOSE pays by distance all the way up the field.** The author asked whether CLOSE pays for
  getting near a boss's parts. It does: each part is measured to the edge of its own hit box (a
  wing shot from 2 under it pays x16, from 8 under x7; under the body's centre, a large boss's
  outer wing is 5.9 away and pays x10). One case did not: each wing shot off knocks the body up
  0.6, a large boss near the top of its tour passes y 13.5 on the third, and above that line every
  kill paid x1 however near the ship was (measured: x1 at y 13.8 and 14, from 2 under). The author
  judged the line unnecessary whether or not a boss is involved, and it is gone (`RATE.close.topY`,
  and `keeper` holding its fire while its target was above the line). A probe for a boss's parts in
  CLOSE was added; the boss probe had only ever parked the ship far away.
  The line was there so that waiting where the enemies come in would not score. Not measured with a
  policy that does that on purpose: `hold_up_shot` scores the same before and after (7,300, over in
  12.3 s), because it does not aim. Over 12 runs of five minutes in CLOSE, `keeper` went from
  145,463 to 140,489 points a minute (0.64 to 0.61 misses a minute) and `seeker` from 50,914 to
  50,986; `keeper` no longer waits for its target to come down, so its figures are not a
  like-for-like comparison of the rule alone.

## 2. Difficulty and progression

- **The opening**: the author played it and found it "now right" (2026-10-10).
- **The rank climbs half as fast** (2026-10-11, `half-rank`; the author: "hold the rise in
  difficulty down"): +3 a loop instead of +6. `keeper`'s misses per minute up to the sixth loop
  went from 0.96 to 0.35 in CLOSE, 0.65 to 0.39 in CHAIN, 0.73 to 0.40 in GRAZE. Bullet speed now
  follows the square root of the rank (`speed-curve`).
- **Extends** moved several times. They stand at every 500,000 points in CLOSE, 300,000 in GRAZE
  and 800,000 in CHAIN (the author's decisions), up to 4 ships.
- **The length of a CHAIN run** (2026-10-12, `chain-speed`): the author's replays ran 255 seconds
  in CLOSE and 267 in GRAZE against 484 in CHAIN. Extends alone could not even that out, so enemy
  bullets in CHAIN went from 1.35 to 1.45 times and the extend from 700,000 to 1,000,000. The
  estimate was 314 seconds; played out by the policy afterwards, the median was 365, 50 seconds
  longer. The values are the author's and were left.
- **CHAIN at 1.4 times and 800,000** (2026-10-12, `chain-1.4`; the author's instruction, after the
  game was declared complete; no reason was given): enemy bullets from 1.45 to 1.4 times CLOSE's,
  the extend from every 1,000,000 points to every 800,000. `author`, 48 runs to game over on the
  same seeds under the present rules: 187 / 229 / 286 seconds before, 196 / 234 / 316 after
  (quartiles), sector 21 either way, the median run now reaching one extend where it reached none.
  The unused constant `SCORE` (a first extend at 500,000, then every 1,000,000) was removed;
  nothing read it. Not played by the author yet.
- **Declared complete** (2026-10-12): the author played it and accepted the play feel, the look and
  the sound. Which snapshot was played was not recorded. There is no replay from after the enemy
  bullets' hit test was corrected, so difficulty has not been fitted to numbers since then.

## 3. Visuals

- **Shading** (2026-10-11, `shading`, `shading-ground`): light from the upper left. Edges of an
  outline that face up or left are drawn lighter, those that face down or right darker. The rule is
  mechanical; no pixel map was redrawn. The ship stays white and only gains a shade. The ground
  follows the same rule. Not adopted: a grey hull for the ship.
- **Roll, engine flame, muzzle flash** (2026-10-11, `roll-muzzle`): moving sideways folds the
  leading half of a sprite inward. Only symmetrical shapes roll. No change of shape for climbing or
  descending (the author's instruction).
- **Different drawings**: small enemies by flight pattern, middle ones by way of flying, seven for
  the large ones, the ship and its icons by mode. The middle boss is a red-orange ray, the large
  one a steel-coloured fortress.
- **Cues per mode** (`finish`): the ring of the graze radius in GRAZE, the blinking of an enemy
  about to escape in CHAIN, a banner and a change of star colour at each new loop.
- **The title**: the author found "LEFT/RIGHT MODE, UP/DOWN START" hard to follow. The sentence went
  and arrows stand where the choices are. The modes read CHAIN, CLOSE, GRAZE, and a first visit
  starts on CHAIN (the author's decision).
- **Removed** (the author's decisions): "DO NOT TOUCH THE ENEMY" on the title; the dotted line at
  y = 13.5 and its "X1" in CLOSE.
- **The score shows nine digits** (2026-10-12, the author's instruction; it was seven).

## 4. Audio

- **Effects and jingles** (2026-10-10): generated in code, four voices. Every event the simulation
  can produce has either a sound or a stated reason for having none (`docs/audio.md`).
- **Music** (2026-10-11, `bgm` to `bgm-3`; the author's instruction): five tunes written within
  the five channels of the Famicom, played by a source separate from the effects.
- **Corrected after the author listened:**
  - "The tone of the part that is not the melody is odd on the title." The triangle wave (the bass
    of every tune) had wrong harmonics.
  - "The bass is still wrong." Clicks at the start and end of each triangle note were removed
    (opened and closed over 4 ms) and the bass was raised an octave.
  - "The boss tune ends with its introduction" and "the lock sound is too pop". The tune's order
    was changed, the lock and laser sounds were remade, and effects with a pitch now move to the
    key of the tune playing.
- **The author's decisions:** no alarm when a boss arrives (`no-boss-alarm`); the sector's tune
  carries on through a middle boss, and the boss tune is for the large boss only; M mutes effects
  and music together.
- **Defects:** for the 90 frames between a large boss's destruction and the next sector, the tune
  of the loop just finished started over; the next loop's tune is chosen instead. Voices still held
  from the run before made a new run drop its sounds; they are freed when a run starts.
- **A sound output opened by a touch is asked to run again** (2026-10-12): once opened, the output
  was only ever resumed when the tab came back or a pause ended. In a browser that does not count a
  touch going down as the player's action, it would stay stopped. Every key and touch now asks it
  to run. **Not checked on a real device.**

## 5. Game feel

- The response to each event, and what was left out, are listed in `docs/game-feel.md`. No hit stop
  (the author's decision).
- **Staged explosions, delayed chain blasts, pieces of hull** (2026-10-11, `staged-blast`, after
  looking at Raiden II and Viper Phase 1): a white flash, a shrinking fire, smoke that stays. A
  middle enemy blows twice more, a large one and a wing five times, a boss thirteen times and then
  once, larger. The pieces are one dark colour and hit nothing. Score, the first shake and the
  sound stay at the moment of the kill.
- All of it is driven from `sim.events` and none of it touches the simulation (the state-hash
  checks pass as before).

## 6. Controls and screens

- **Touch**: drag to move, and the shot fires while touching. The ship follows the finger's
  movement, not its position, and never faster than its own speed.
- **Gamepad** (2026-10-10): left stick or d-pad to move, any of the four face buttons to shoot.
- **More keys and buttons for the shot** (2026-10-12, the author's decision): the only shot key was
  Z, which left WASD with both hands' work on the left hand. X, J, K, Space and Enter also shoot,
  and so do a pad's shoulder buttons and triggers. Z stays the main key: on some keyboards Up, Left
  and Space do not register together. Not added: Ctrl (with W it closes the tab), Shift (Windows
  asks about sticky keys after five presses), Alt. The title's line reads "Z / X / SPACE / TOUCH";
  J, K and Enter are not shown. Input mapping only: replays and state hashes are unchanged.
- **Title, best score, mute, pause** (2026-10-10 to 10-11): a best score is kept per mode and start
  sector. Every run from the title has a new seed (it had always been seed 1).
- **Shot after game over** goes back to the title instead of starting again (2026-10-11,
  `over-to-title`; the author's decision).
- **Runs kept off the record** (2026-10-12): `?start=41` by itself opened a sector that had not
  been reached, and that was saved. `?start=` now counts only beside `?seed=`, and a run with a
  fixed seed, or played from a snapshot, keeps neither a best score nor an opened start.

## 7. Bug fixes

| Date | Observation | Cause | Change and evidence |
| --- | --- | --- | --- |
| 2026-10-11 | Shots pass through a small enemy while it is flashing white (the author's report) | The hit test looked only at the point a shot ended up at. A shot moves 1 a frame and a small enemy is 0.9 tall | The test covers the whole distance flown. At a height offset of 0.5 to 0.55, 0 shots of 25 had hit. Probe `ship` checks 20 heights. It had been there since the first build; about one shot in ten must have passed through moving targets too (`shot-sweep`; the author accepted the build) |
| 2026-10-11 | In GRAZE the multiplier climbs to x16 after game over | With no ships left the ship was not treated as absent, and grazes went on being counted | Tested only during play. Probe `rate` (`review-fixes`) |
| 2026-10-11 | A core above the screen, not yet visible, takes a lock | It could be locked before it had come onto the field | No lock until it has. Probe `ground` |
| 2026-10-11 | The seventh mix of streams is never chosen by any sector | In the original that number is the middle-enemy rush; here the HEAVY section has that part | Removed from the list. Making it selectable would have changed what every fixed sector holds |
| 2026-10-12 | A ship flying into an enemy bullet steps over it | The test covered the stretch the bullet moved and ignored the ship's own move | The test is the bullet's path as seen from the ship. Found by the self-test of `tools/dodge.mjs`, whose search went through a ring that cannot be passed. Afterwards 0 in 48 minutes of policy play (`swept-hit`) |

## 8. Simulated players and tools

- **The old human-limited policy was of no use.** `humanLimited`, which delays every change of
  input by 250 ms, missed 3 to 7 times as often as the author on the same seeds and lasted 28 to 99
  seconds. It also contradicted what the author said ("too slow", "I almost never break the
  chain").
- **Saving replays** (2026-10-11, `rec`): the author asked whether the page should output figures
  about a run; the answer was to keep the replay instead, since any figure can be taken from it
  later. With `?rec=1` every finished run is downloaded as a file.
- **The policy `author`** (2026-10-12, `docs/human-bot.md`): fitted to three replays of the
  author's. What the old model had wrong is that the author does not dodge by reaction: of 13
  misses to bullets, none was to a bullet less than 15 frames old. `author` sees the screen 18
  frames late, anticipates the launch of seeds near it, and loses track of some bullets when there
  are many. Misses per minute: 0.82 in CLOSE (the author 0.94), 0.63 in CHAIN (0.74), 0.53 in GRAZE
  (0.90). Where it does not fit: it scores less and ends sooner than the author in CLOSE, and
  misses more in the first loop.
- **The policy `keeper`** (2026-10-10): treats whatever would cost the multiplier if it escaped as
  work with a deadline. It still breaks the chain more often than the author, so it is not evidence
  that the chain is easy to break.
- **Finding misses that could not be avoided, `tools/dodge.mjs`** (2026-10-12): the author asked
  whether dense fans of equal speed become a wall at high difficulty. The tool rewinds a policy's
  misses and searches for a way to survive. Up to sector 151, of `keeper`'s 160 misses and
  `author`'s 307, none was without a way out one second before. Its limit: it finds where the ship
  could have gone, not whether a person could have seen it in time.
- **The clip** (2026-10-12): `tools/record-video.mjs`. The picture is the game's own drawing, frame
  by frame; the sound is rendered offline from the events of the same run. The play is `keeper`'s,
  not a person's. The first seconds of a run have few bullets (0.1 to 0.8 on screen on average in
  the first 16 seconds of CHAIN), so the clip is taken from the top of sector 3 in CLOSE.
- **Data for checking is not published** (2026-10-12, the author's decision): snapshots, replays
  and the checks' output are not tracked.

## Not adopted

- **Slow** (removed after it was built, by the author's decision), and **hit stop**.
- **Items**, and a shot in every direction (dropped in stage 1).
- **Islands that count in the chain**, **bands across the whole width**, an island placed under a
  formation's column, the large island at the end of a section.
- **The formation bonus** (500 × the number in a row), replaced by the multiplier.
- **A dive that re-aims on the way down.**
- **A key to save a replay (R), a key to mute the music alone (B), the boss alarm** (the author's
  decisions).
- **A grey hull for the ship**; a change of shape when climbing or descending.
- **An extend every 300,000 points in CLOSE** (proposed, withdrawn on the author's remark).
- **Taking a boss that is still arriving out of the ramming test.** It came up in two reviews; no
  instruction was given and it stands (`README.md`, known limitations).
- **Rule proposals** (listed on 2026-10-10 at the author's request and set aside on the author's
  instruction; none is in the game):
  1. destroying a big enemy clears the bullets it fired, for points
  2. a volley of lasers stops a big enemy's fire for a while
  3. middle and large enemies that can be taken apart
  4. a formation that got away comes back once
  5. a formation falls into disorder when its leader goes first
  6. a formation's points depend on its size and on how quickly it went

  Two from the same list, "more points the nearer the kill" and grazing, went in later as the
  modes' multipliers.
- **Proposals not taken up**: a table of best scores, replaying a run from the title, an ending per
  difficulty, vibration on a phone, full screen and offline use, a setting for less shake and
  flashing, a drawing per generated enemy type, building the original to measure it.

## Validation notes

- **`npm run check`** passes in full, with nothing skipped: unit tests (determinism, replays, the
  frame of the policy comparison), a smoke test, keys and pointer, the same state hash in Node and
  in the browser, 18 mechanic probes, the page itself (title, sound, best score, gamepad, replay,
  runs kept off the record), the sound kit and its measured levels, the comparison of monotonous
  and exploratory policies, and a self-test for each instrument.
- **Far into the game** (2026-10-12): `keeper`, with its ships topped up, for four minutes in each
  mode from sectors 1, 61, 101, 501, 2001 and 100001. No exception and no non-finite number; enemy
  bullets level off at the limit of 512; a frame took 5 ms at worst.
- **On the policies**: the strong ones see the screen exactly and without delay, so they are
  stronger than a person. Difficulty is discussed on `author`, less the places where it does not
  fit. A policy that is too exact overrates a person and one with weak judgement underrates one;
  both happened here.

## Never measured, never checked

- **Real devices**: touch on a phone (lag in following, the finger covering the screen, the feel of
  letting go to fire) and sound there; a real gamepad (the check substitutes the values the browser
  reports); browsers other than Chromium; speed on an old device.
- **After the changes of 2026-10-12**: the sector-by-sector inspection (the tables in
  `docs/spec-draft.md` are from the rules before), the table of `keeper`'s chain and score, and a
  refit of `author` (the author's three replays were played before the enemy bullets' hit test was
  corrected).
- **Past the sixth loop** as a person finds it. The policies show only that nothing breaks.
- **Questions the author did not answer one by one**: whether the pieces of hull are mistaken for
  bullets, the WIDE and LONG sections, the bosses' own barrages, the movements that arrive from the
  second loop on. They were closed as part of the author's acceptance of the play feel, the look
  and the sound.
- **Whether a person could have seen and reacted.** Neither `tools/dodge.mjs` nor `author` measures
  the delay between a danger appearing and the input changing.
- **The clip** was checked for its length, for having sound, and in a few frames; it was not
  watched or listened to from end to end.
