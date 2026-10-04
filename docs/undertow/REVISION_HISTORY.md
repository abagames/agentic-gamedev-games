# UNDERTOW revision history (human-directed changes)

UNDERTOW was first generated from a single instruction, and then revised in response to
instructions and observations from a human reviewer. This document reconstructs that revision
process, after the first generation, from the Claude Code session history.

- Covered: rules, enemies and threats, difficulty and progression, the loss and extend system,
  radar and HUD, visuals, game feel, bug fixes.
- Not covered: video and screenshot generation, the move to `docs/` and commits.
- Quotes are the reviewer's instructions, translated from Japanese.
- Numbers are bot measurements taken at the time, and many were superseded by later changes. See
  [README.md](README.md) for the current rules and measurements.

## Starting point (the first generated version)

The first instruction was: "Make a 1980s retro arcade game. Give it a scrolling field and a radar
display." The tags drawn were `sink` and `rescue`. The first playable version had these
properties:

- You pilot a submarine around a sideways-scrolling sea that wraps around, with a radar across the
  top showing the whole sea.
- Enemy transports carry captives. Torpedoing a transport frees them, but they sink and drown at
  the seabed, so the decision was when and where to fire. The sub held 6.
- Captives scored when brought back to the home harbour. Catching everyone from one transport paid
  an ALL SAVED bonus.
- Escorts dropped depth charges, and the enemy port had gun batteries.
- The game ended when the subs ran out or the town was empty. Waves were endless.
- Nobody had played it by hand yet.

## Sequence of changes

| # | Reviewer's instruction or observation | Outcome | Area |
|---|---|---|---|
| 1 | It is quite monotonous as it stands | Causes analysed; depth currents, convoys, enemy subs proposed | Rules |
| 2 | Shouldn't people start in the sea, with enemy ships collecting them and counterattacking? | Rebuilt around enemy collectors, mines and torpedoes | Rules |
| 3 | Let the sub rescue people at the surface directly; they must be returned to base; is the friendly ship needed? | Direct pickup added, fixed home harbour restored, rescue ship removed | Rules |
| 4 | Option 3 (give the return trip something to do) | Collectors sail out empty and collect on the way back | Rules |
| 5 | Bring back a friendly ship as a hand-off point, shelled by enemy collectors | Ferry and enemy shelling added | Rules |
| 6 | It is quite easy. Are enemy collectors actually collecting people? | Collector routing and speed fixed | Difficulty |
| 7 | Should a wave clear only when everyone is in one harbour or the other? | Clear condition changed | Rules |
| 8 | The player is at the surface almost all the time and never uses the depths | Rising torpedoes, a dangerous surface, faster sinking, no rafts | Rules |
| 9 | Enemy subs should leave port near the surface, dive, and surface again to return | Enemy sub pathing changed | Enemies |
| 10 | Spills are rare, so varying them is pointless | Wave start changed to "the raid has just happened" | Rules |
| 11 | Go ahead, but make saving everyone possible with good play | Timing limits set so a full rescue is feasible | Difficulty |
| 12 | OK, but too easy. There are no moments where enemies attack you | Escort destroyers with depth charges added | Enemies |
| 13 | Still far too easy. Are the bots weak? I reached wave 4 saving everyone, no misses | Look-ahead bot built; difficulty raised against it | Difficulty |
| 14 | It would be more natural to spread people over the sea and have every enemy sail from port | Wave start rebuilt; laden enemies slowed heavily | Rules |
| 15 | Are there enough enemy types? | A mothership was proposed; the reviewer kept the current set | Enemies |
| 16 | Does the deck gun never hit the player? | Shell blast and wider danger band, with a synchronized warning | Enemies |
| 17 | Is ending at 8 waves appropriate? | Eight-wave campaign with ALL CLEAR | Difficulty |
| 18 | Should the player and the ferry start each wave from the harbour? | Both restart from the harbour | Rules |
| 19 | Should the radar scroll centred on the player? | Radar centred on the camera | Radar / HUD |
| 20 | Scores at the harbour are hidden by the radar; EXTRA SUB overlaps the clear text | Score popups sink; notices moved | Radar / HUD |
| 21 | What could improve the game feel? | Seven items proposed; the first three built and accepted | Game feel |
| 22 | Does the first ship always leave the enemy port to the right? | Not fixed; a radar seam made it look so, and that was corrected | Radar / HUD |
| 23 | The number beside the green figure isn't needed | Town count replaced by "3 lost costs a sub" | Loss system |
| 24 | The count should reset after the clear; could the remaining figures be a bonus? | Reset moved to the next wave start; bonus added | Loss system |
| 25 | Show progress to the next extend, visibly tied to each delivery | Extend counter with flying figures | Loss system |
| 26 | More people are lost while the sub is destroyed, costing a second sub | Losses during a miss no longer count | Loss system |
| 27 | Losing 3 right after respawning feels unfair | People already captured at the miss are not counted | Loss system |
| 28 | A depth charge exploded right after the next wave began | Blasts are now cleared between waves | Bug |
| 29 | The player is sometimes destroyed with nothing nearby | Blast drawing matched to its hitbox; recall shown differently | Bug |
| 30 | Could the title screen be refreshed? Should the enemy port resemble the home port? | Both rebuilt | Visuals |
| 31 | Should the in-game harbour have the lighthouse effect too? | Lighthouse beam added | Visuals |
| 32 | The player blinks as invulnerable on the ALL CLEAR screen | Shown moored at the harbour, not blinking | Bug |

## 1. Core rules and structure

The core loop was rebuilt several times, each time in response to play. The steps are listed in
order because each one set the conditions for the next.

### 1.1 From transports to collectors

- **Observation:** "It is quite monotonous as it stands."
- **Diagnosis:** every shot followed the same procedure, depth was unused, reading the radar
  changed no decision, and the trip home was a chore.
- **Reviewer's direction:** people should be in the sea from the start, and ships from the enemy
  base should collect them quickly, perhaps with an arm, and carry them off. Collecting submarines
  should do the same. Ships should counterattack with mines and submarines with torpedoes.
- **Adjustment:** taken as proposed, the design would be close to Defender. The rule that a sunk
  carrier spills its load, which then sinks, was kept so that where and when you fire still decides
  the rescue.
- **Result:** castaways wait at the surface, enemy collectors lift them with an arm and head for
  port, and sinking a collector drops its load. Mines are dropped after a warning lamp, and enemy
  subs fire torpedoes along a warning line. The port gun batteries were removed.

### 1.2 Direct rescue, the home harbour and the ferry

- **Direction:** "Let the submarine rescue people at the surface directly." "After taking people
  aboard you must return to base. Isn't the friendly ship unnecessary?"
- **Result:** the sub can load castaways itself, and a rescue counts only when they are unloaded at
  the home harbour. A destroyed sub throws its passengers back into the sea.
- **Problem found:** about 49% of play became carrying people across empty sea. Of three options,
  the reviewer chose "give the return trip something to do": collectors now sail out empty toward
  the home side and collect on the way back to port, which cut empty laden travel to 35%.
- **Ferry:** the reviewer then proposed bringing back a friendly ship as a second drop-off, with
  enemy collectors shelling it. The ferry waits off the home harbour, takes up to 8 people, and
  scores when it reaches port. Collectors shell a laden ferry after a 0.7 s warning, and two hits
  sink it and spill its load.

### 1.3 Wave clear condition

- **Question:** "Should a wave clear when everyone has been taken into one harbour or the other?"
- **Finding:** the old rule cleared the wave once the sea was empty and counted people still aboard
  the sub or ferry as rescued. That contradicted the rule that a rescue counts only at the harbour.
- **Result:** a wave clears only when nobody is left in the sea, on an enemy, on the sub or on the
  ferry.

### 1.4 Making the depths matter

- **Observation:** "The player is at the surface almost all the time and never uses the depths."
- **Measurement:** the human-limited bot spent 66–74% of its time in the surface band and under 5%
  below depth 100. Every action was possible only at the surface, and the surface carried no risk.
- **Direction:** all three proposed changes, plus "people at the surface should sink too".
  - **Rising torpedo:** it climbs one unit for every two it travels and hits a hull where it
    breaks the surface. The deeper you fire from, the further it reaches. A surface marker shows
    where a shot fired now would come up.
  - **Dangerous surface:** collectors fire a deck gun at a sub near the surface.
  - **Faster sinking:** people dropped by an enemy sink faster.
  - **No rafts:** everyone starts in a life jacket and sinks slowly, and the sub can pick them up
    at any depth.
- **Result:** time in the surface band fell from 74% to 16%, and time below depth 100 rose from 3%
  to 35%.

### 1.5 How a wave begins

- **Observation:** asked about expansions such as collector types that spill differently, the
  reviewer replied: "Spills don't happen often now, so won't that variation be meaningless?"
- **Measurement:** the bot picked up 17.2 people a minute directly and caught only 4.7 a minute
  from sunk enemies. The core idea, that sinking is the rescue, had become a side event.
- **First response:** waves began just after a raid, with about 70% of the castaways already
  captured and being carried to port one carrier at a time. Catches rose to 13.6 a minute.
- **Later direction:** "The feel is better. But wouldn't it be more natural to place people evenly
  on and under the sea and have every enemy sail from port to collect them?" and "If enemies
  carrying people get a large speed penalty, collection can be fast and a full recovery is still
  possible by taking them back."
- **Final form:** people are spread over the whole sea, about 45% at the surface and the rest in
  mid-water. Collectors, enemy subs and escorts all sail from the enemy port. A laden enemy moves
  at 0.45× speed with one person, slower with each extra one, down to 0.25×. Laden enemy subs
  return through shallow water so their spill can be caught. The sub's capacity went from 6 to 8.

### 1.6 Wave restart

- **Question:** "After a wave clear, should the player and the friendly ship start the next wave
  from the harbour?"
- **Result:** yes. The sub relaunches from the harbour, below the deck gun's reach and briefly
  invulnerable, and the ferry returns to port empty. Starting conditions no longer depend on where
  the last wave ended.

## 2. Enemies and threats

- **Enemy sub pathing** ("enemy subs should leave the port near the surface, dive to a suitable
  depth, and come back up near the port when returning"): implemented as described. A laden enemy
  sub now surfaces in front of the port, within short torpedo range, which gives a last chance to
  take its load back.
- **A dedicated hunter was not added.** Asked whether to add an enemy that specifically targets
  the player, the reply was that a plain chaser would be a hazard unrelated to rescue, and no such
  enemy was built at that point.
- **Escort destroyers** ("OK, but too easy. There are no moments where the enemy attacks you"):
  the existing attacks each had a narrow trigger and were easy to avoid. Destroyers now follow
  some collectors and drop depth charges set to the sub's depth after their stern lights up.
  Sinking the collector they guard makes them chase the sub for a while. Attacking from ahead of
  the collector or from depth stays outside the charges' range.
- **Enemy types** ("are there enough enemy types?"): the three types each force a different
  decision. A large mothership that gathers captives was proposed, and the reviewer chose to keep
  the current set.
- **Deck gun** ("does the collector's deck gun never hit the player?"): it could, but no bot was
  ever hit, because a small dive was enough to escape. The reviewer adopted two changes and asked
  for a clear warning tied to the gun's 0.7 s flash:
  - the shell bursts at the surface with a blast that reaches underwater, so you must move
    sideways or dive below it;
  - the gun now targets a sub within 40 px of the surface instead of 18 px;
  - a crosshair and a half-circle showing the blast area blink in time with the gun, turn red
    when the aim locks, and blink faster as the shell falls.
  - The reviewer's verdict: "Clear and good."

## 3. Difficulty and progression

### 3.1 Collectors that actually collect

- **Observation:** "It is quite easy as it stands. Are enemy collectors properly collecting people
  at the surface?"
- **Finding:** in waves 1–5 the enemy collected only 0–4% of the castaways. Collectors spent 69% of
  their time sailing empty to a fixed turning point while the player cleared the sea.
- **Response:** the turning point became "just past the furthest castaway on the route",
  collectors got faster, and more sail at once. Enemy collection rose to 26–32% in waves 1–3.

### 3.2 Full rescue must be possible

- **Direction:** "Go ahead, but balance it so that everyone can be saved with good play."
- **Response:** the timing was worked out, and limits were set on carrier load, launch interval
  and laden speed. From then on, each structural change was rechecked by looking for at least one
  full-rescue run on every wave.

### 3.3 Bots weaker than the player

- **Observation:** "It is still far too easy. Are the current bots weak?" and "I reached wave 4
  and saved everyone on every wave, with no misses."
- **Finding:** the strongest bot then managed a full rescue on wave 1 in only 2 of 8 runs, so it
  was much weaker than the reviewer. Difficulty set from it had been far too cautious.
- **Response:** a look-ahead bot was written. Every 0.2 s it copies the game state, simulates each
  candidate action 5 s ahead and picks the best. On the version the reviewer had played, it saved
  everyone on waves 1–3 in 6 of 6 runs and reached wave 16 with almost no losses, matching the
  reviewer's report. Difficulty was then raised against this bot: more escorts, escorts that leave
  station to chase, three depth charges per drop, and enemy subs that match the player's depth.
- **Verdict:** "The feel is better."

### 3.4 Eight-wave campaign

- **Question:** "I want the game to be cleared at some wave. Is ending at 8 waves appropriate?"
- **Basis:** difficulty already levelled off at wave 8, and the look-ahead bot cleared wave 8 in 8
  of 10 runs after about 6–8 minutes.
- **Layout:** one new element per wave.

| Wave | New element |
|---|---|
| 1 | Collectors only |
| 2 | Collecting submarines |
| 3 | Escort destroyers |
| 4 | Deck gun reach widens to 40 px |
| 5–7 | More enemies, more speed, more frequent attacks |
| 8 | FINAL WAVE, everything at maximum |

- **Ending:** clearing wave 8 shows ALL CLEAR with a bonus. Clearing every wave without losing
  anyone shows NOBODY LOST and pays 20,000 more. The HUD shows the wave as "n/8".
- **Result:** the look-ahead bot cleared the campaign in 13 of 16 runs, at about 6 minutes a run,
  and a full rescue was observed at least once on every wave.

## 4. Loss and extend system

This system replaced the town population, and was refined over five exchanges.

- **Removing the town count** ("isn't this number unnecessary? A remaining-subs bonus should be
  enough at the clear"): removing it outright would let the game be cleared without rescuing
  anyone. A bot that only tried to survive got ALL CLEAR in 4 of 6 runs with the limit lifted. The
  reviewer chose the option where losing people costs a sub, adding that "the count should reset
  on a miss and on a stage clear".
- **Rule:** each person lost counts one, and the third recalls the sub and costs one life. The
  count resets on a miss. The game ends only when the subs run out. The ALL CLEAR bonus is 3,000
  per remaining sub.
- **Display:** three green figures sit beside the lives. A lost person flies from where it was
  lost to the top right as a red figure, and one green figure turns into a red cross.
- **Reset timing and bonus** ("the count should come back after the clear; it currently comes
  back before it. Could the figures left at the clear be a bonus?"): the count now resets when the
  next wave starts, so the crosses stay visible during the clear display. Each figure left pays
  200 × wave number.
- **Extend counter** ("add the display, and make it visually clear that each delivery to the
  harbour affects the number"): extends come every 30 people delivered. A hollow sub icon and a
  countdown sit beside the lives. Each person delivered flies to the icon as a green figure, the
  number drops by one and the icon fills.
- **Chained misses** ("while the player is destroyed, more people are lost and another sub is
  lost"): people lost while the sub is down, and people thrown from the destroyed sub, no longer
  count toward the next miss.
- **Losses right after respawn** ("losing 3 people and getting a miss right after coming back
  feels a little unfair"): of two options the reviewer chose the first. People already aboard an
  enemy at the moment of the miss belong to that miss and are not counted later. They are drawn
  grey on the enemy and on the radar. Misses within 6 s of respawning went from 4 to 0 in 16 bot
  runs.

## 5. Radar and HUD

- **Radar centring** ("should the radar scroll centred on the player while still showing the
  whole sea?"): yes. The fixed map had a seam, so an enemy just behind the sub could appear at the
  far end of the radar. Centred on the camera, left and right on the radar match the main view.
- **Enemy port marker:** the reviewer asked whether the first ship always leaves to the right. It
  did not (65 left and 68 right in 133 trials), but the enemy port was marked at only one end of
  the radar, so ships leaving the other way seemed to appear from nowhere. The port is now marked
  at both ends when it is near the seam.
- **Score popups** ("the score for returning people to the harbour is hidden by the radar; would
  it be better for scores to go down instead of up?"): all score popups now sink slowly and stay
  between the surface and the seabed. Unloading shows one running total instead of a stack of
  "+100".
- **Notices** ("the EXTRA SUB message overlaps the round clear text"): EXTRA SUB, TAKEN and FERRY
  SUNK were moved below the wave clear text.

## 6. Visuals

- **Enemy port** ("should the enemy port look a little more like my own port?"): it now has the
  same skeleton as the home harbour, a pier, buildings and a central tower, drawn in red and
  black. A crane and a sweeping searchlight replace the lighthouse, and barred holding blocks
  replace the houses. One barred window lights up for each person carried in during the wave.
- **Title screen** ("is there room to refresh the title screen?"): the diagram and text dated
  from the first version. The logo is larger and cut by the waterline, with its lower part dimmed
  and wavering. A looping scene of about 9.5 s, drawn with the game's own sprites, shows a
  collector lifting a person, a rising torpedo from depth, the spill, and the catch and return.
  Text was cut to one line of explanation, the start prompt, controls and the high score.
- **Lighthouse beam** ("should the in-game harbour also have the lighthouse effect?"): the home
  lighthouse now sweeps a beam, which brightens while people are aboard and flashes on each
  delivery. The enemy searchlight scans the sea and the home light points to where to return.

## 7. Game feel

Asked "what could improve the game feel?", seven items were proposed in priority order. The first
three were built on "go ahead", all as display-only changes. The reviewer's verdict was "the
effects are fine as they are", and items 4–7 were not built as proposed.

| # | Item | Status |
|---|---|---|
| 1 | Sinking: hull flashes white before breaking, the screen is pushed along the torpedo's path, hit-stop grows with the load, people are flung out in a small arc | Built |
| 2 | Ordering of intensity: full rescue above sinking above a single catch | Built |
| 3 | Sub motion: hull tilts when climbing or diving, a short turn animation, a bubble wake that rises more slowly with a heavier load | Built |
| 4 | Recoil and bubbles on firing | Not built |
| 5 | A house light goes out for each person lost | Not built |
| 6 | Shock rings for blasts and a near-miss cue | Not built |
| 7 | Lighthouse and house lights respond to each delivery | Not built as proposed; the later lighthouse beam flashes on delivery |

## 8. Bug fixes

- **Blast surviving into the next wave** ("right after the next wave began, a depth charge
  exploded"): mines, depth charges, shells and enemy torpedoes were cleared at the wave clear, but
  the blast objects themselves were not, and they resumed when time restarted. One cleanup routine
  now runs at the clear and at the next wave start, and also removes wreckage and the player's
  torpedoes.
- **Destroyed with nothing nearby** ("the player is sometimes destroyed suddenly where there is
  nothing; are the hitboxes right?"): the hitboxes were correct, but two things made them look
  wrong.
  - A blast's hitbox was at full size from the first frame while its drawing started at 40% of
    the radius. It is now drawn at full size for as long as it can hit.
  - A recall after losing three people was shown with the same explosion as being sunk. It is now
    a white silhouette rising with bubbles, with "3 LOST" and a falling tone.
- **ALL CLEAR screen** ("the player is shown blinking as invulnerable; does it need to be shown,
  and if so it shouldn't blink"): the invulnerability meant for the next wave was also set on the
  final clear. The sub is now shown moored at the home pier without blinking.

## Not adopted

| Idea | What happened |
|---|---|
| Depth currents | Proposed twice; deferred each time in favour of other changes |
| Seabed terrain, boss convoys | Proposed only |
| Collector types that spill differently | Proposed; set aside when the reviewer pointed out spills were rare |
| A dedicated enemy that hunts the player | Advised against; a cargo-seeking variant was offered and not chosen |
| Mothership that gathers captives | Proposed; the reviewer kept the current enemy set |
| Rescue ship that follows the sub | In an early rebuild; removed in favour of the fixed harbour, later replaced by the ferry |
| "Raid already happened" wave start | Built and played; replaced by enemies sailing from port |
| Town population count | Replaced by "3 lost costs a sub" |
| Grace period after respawn | Offered as the alternative to not counting already-captured people; not chosen |
| Game-feel items 4–6 | Proposed; not built after the first three were accepted |

## Validation notes

- At the end of these revisions, 29 rule tests and 9 browser-probe steps pass.
- Difficulty rests on the look-ahead bot, which was calibrated against the reviewer's own result.
  It dodges attacks almost perfectly, so its misses come only from lost people. A human player
  will also be sunk.
- On waves 5 and later, a full rescue is rare even for the look-ahead bot. It has been observed on
  every wave, but that is not proof that it is always achievable.
- Hands-on confirmation is limited to the reviewer's observations quoted above.
