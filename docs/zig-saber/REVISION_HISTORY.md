# ZIG SABER — revision history

Newest first. Rounds 1–15 were made in response to the user's hands-on play; the bot figures quoted in each round
are the ones measured at that time, not the current ones (see `README.md` for those).

Structural:

- **Round 15 (user: "is the time bonus set so that destroying the gate quickly beats shooting its drones until the
  clock runs out?" — it was not).** Measured by letting each bot fight a gate whose core never weakens: milking paid
  934 000 against 546 000 for destroying it (precise bot), 691 000 against 543 000 (expert), because the escorts were
  being cut at ×5 with the point-blank double, about 12 000 a second against a time bonus of 2 000 a second.
  Now the gate's own plates and drones pay plain value and a second left is worth 5 000: destroying it pays
  373 000 / 348 000 / 318 000 (precise / expert / human-limited), milking the full 75 s pays 59 000 / 48 000 / 41 000.
  Pay per open row on core hits is unchanged, so the fight's risk for reward is in how many rows are held open.

- **Round 14 (user, after playing: "quite easy").** The human-limited bot had cleared the game 19 % of the time, so
  here the bot was weaker than the player. Added risk that pays, all tied to things the player chooses:
  heat (chain → faster enemies and aimed drones), point-blank cuts ×2, armour that costs every laser level, and on
  the gate two plates at once, pay per open row, overdrive below half strength, a visible countdown. (A rock-graze
  bonus and a doubled gate bonus were proposed and rejected by the user.)
  Result: human-limited 0 % clear, 19 % reach loop 2; expert 100 % clear but losing 7.1 ships; precise 100 %, none
  lost. The expert survives on extends: at 4.8 million points the "100 000 then every 300 000" rule hands it about
  16 ships. That rule was set by the user when a game was worth a tenth of this and has not been changed.

- **Round 13 (user: the gate is too easy; the game should be cleared after two loops — how should difficulty be
  set; later: good players should have something to chase for score in loop 1 as well).**
  - *Gate.* Making it tougher by damage alone only produced time-outs (even the precise bot failed), so the danger
    was raised instead: plates every 0.9 s instead of 1.8, 20 % faster, each with an escort of three drones aimed at
    the row next to the ship's. Damage needed 18 → 20, time allowed 50 → 75 s. Human-limited bot on loop 1: still
    wins 8 of 8, but in 43 s with 0.9 ships lost (was 27 s, 0.1).
  - *Two-loop campaign.* Targets: the human-limited profile usually sees loop 2 and clears the game now and then;
    the expert profile usually clears it. Loop 2 at +15 % speed and +25 % waves gave 0 % clears for everyone, so it
    is now +10 % speed, +18 % waves, and its gate has the same core as the first. Result (`evidence/campaign.txt`):
    human-limited 19 % all clear, 63 % reach loop 2; expert 88 %; precise 100 %.
  - *Score for clean play.* The zone and loop bonuses were a few thousand against half a million, so they were raised
    until they matter: no-miss zone 50 000, all gems of a zone 100 000, 2 000 per second left on the gate. First-loop
    scores: human-limited 763 000 (566 000–913 000), expert 1 046 000, precise 1 139 000. No bot has taken every gem
    of a zone, so there is at least 300 000 a loop that only a planned route reaches.

- **Round 12 (user: put a boss at the end of the loop; no enemy bullets, everything it sends must be destroyable;
  the blade cannot reach a boss at the right edge; let the wave pass through rock except the core's shielding).**
  The gate throws its plates (cut-only, like shells) and the wave finishes the job through the opened row — the
  wave's first positive role. The wave now ignores rock everywhere. That left it in flight longer, so presses went
  dry more often (9 % against 4 %) and the human-limited bot fell from 2.6 to 1.7 zones; wave speed went from 576 to
  840 px/s (dry time at most 0.24 s) and it recovered to 3.3. First gate tuning (12 damage, the blade could hit an
  open row repeatedly) ended in 3.5 s; now 18 damage and a blade hit closes the row: human-limited bot wins 8 of 8
  in 27 s on average with 0.1 ships lost; precise bot 22 s.

- **Round 11 (user: "the wave only works as a punishment that resets the multiplier").** A far kill and a dry press
  no longer touch the chain. The chain runs on a clock instead, shorter the higher it is, shown as a line under the
  gauge. With a flat 2.5 s per step the human-limited bot sat at ×5 for 62 % of a loop; with 2.5 / 2 / 1.5 / 1 s it
  spends 14 / 12 / 19 / 30 / 25 % at ×1 … ×5.

- **Round 10 (user: "the items in zone 3 are hard to take; capsules still fall so often that there is little reason
  to collect them").** Fortress gems had been placed by the rule that suits curved rock (12 px from the surface) and
  ended up in dead corners behind gate walls; they now sit in gate middles, off tooth tips and on lane centres
  (bot: 20 of 28 taken). Capsules: one train in four is a carrier and convoys lost their guarantee, so a loop gives
  about 9 capsules instead of 19 — one every 15 s. A level now lasts 15 / 10 / 7 s, so a capsule is a lasting step
  and gems (28 clock refills per loop for the bot) are what keep it.

- **Round 9 (user).** The ranking seemed broken: its default scores had been scaled to bot results (last place
  250 000), so a person's score never qualified; the table now ends at 10 000. Extra ships at 100 000 and every
  300 000 after (were 200 000 / 600 000). Name entry removed: a call sign is drawn per game from a fixed roster.

- **Round 8 (user: "is being sent back to the start of the stage too harsh?" — yes).** At this speed a checkpoint
  restart replayed up to 22 s. A lost ship now returns 144 px (2 s) back, at the nearest spot with 36 px of room above
  and below for the first second, with the screen cleared and a 1 s READY. Losing the laser level and the chain stays
  as the price. Human-limited bot: 3.3 zones (was 2.8); deaths in loop 3 fell from 18 to 9.5.

- **Round 7 (user asked whether there is any reason to collect items; answer: barely).** Gems were 2–3 % of the
  score and capsules fell every 4–5 s. Now: (1) a gem refills the laser clock and scores on the cut chain; (2) only
  every second train is a red carrier (capsules per game 41 → 20), levels last 10 / 7 / 5 s instead of 5 / 3.5 / 2.5;
  (3) the sealed lane's capsule is unique (top level + full chain) and the seal can no longer be cut from the wide
  lane. Human-limited bot: about a quarter of the first loop at each level again; it takes 2.2 of the 3 lane capsules.
- **Round 6 (user: "the laser kills distant enemies, so I lose the bonus — the power-up is a punishment").** The beam
  is gone. The laser is now blade length in three levels; whatever it reaches is a cut with every bonus attached, so
  a level can only add. Charges, the firing condition and the small capsule were removed. Levels fade one step at a
  time (as the user had suggested), faster at the top, and one level is spent as armour on a touch.
  First attempt (full-screen reach at level 3, 7 s per level) broke the game: the human-limited bot sat at the top
  level and scored 2.3 million over three loops. With 160 px at the top and 5 / 3.5 / 2.5 s per level it spends about
  a quarter of the first loop at each of the four levels.
- **Round 5 (user: "no capsule from laser kills is too harsh — a loaded ship cannot power up; show the multiplier as
  a gauge").** The no-capsule rule is gone. Instead: the blade has priority inside its reach even when loaded, and a
  train the laser finishes leaves a small capsule (+1) where the blade earns the full one (+3). Far and safe keeps
  the laser alive; close and risky builds it up. Measured on the human-limited bot: cuts 158, beam kills 133 per
  game (before: 74 and 109) — the laser no longer replaces the blade. Capsules are frequent again (about 48 a game,
  most of them small), so the laser is loaded much of the time; first-loop deaths fell from 4.2 to 1.7.
  HUD: a four-segment chain gauge with the multiplier beside it (red blink when lost), a timer line under the laser
  bars, and the exhaust trail turns cyan while a chain is alive.
- **Round 4 (user: "better — now add development and risk/reward"; asked whether power-ups should fade).**
  - *Cut chain* (×2 … ×5, lost on a far kill or a dry press): the safe kill and the careless turn now cost something.
  - *Laser fires only at 2+ enemies or armour*: it no longer drains on lone drones, so holding it as armour is a real choice.
  - *Power-up fade: yes.* With the laser no longer wasted, charges piled up (the human-limited bot held 47 capsules a
    game and stopped dying to enemies). Two rules fixed it: a charge fades after 7 s, and a train killed by the laser
    drops no capsule (the laser was refuelling itself). Capsules per game fell to about 16. (The second rule was replaced in round 5.)
  - *Compound waves* (convoy, pincer, chaser) from the cavern on, and from the canyon on later loops.
  - *Sealed lanes* in the fortress: a wide empty lane against a narrow one with a seal, gems and a capsule.
- **Hands-on report 1 (user): "destroying a three-ship train is impossibly hard for a person."** The human-limited
  bot had been taking trains, so the bot was wrong. First answer: slow everything by a third. That was the wrong
  direction (see report 2) and has been undone.
- **Hands-on report 2 (user): "people are bad at lining up exactly level with an enemy and firing; tune the model on
  that; double the game speed and the enemy rate, and make the systems carry it."** Now: climb/dive 96 px/s, scroll
  72 px/s, drones 144 px/s, waves about 0.55 per second (was 0.23). Systems changed so that this is fair:
  - **The swing is a band on the heading side** (36 px tall instead of a ±9 px row). A press made anywhere in the
    ~0.4 s it takes to fly through that band connects. Because it is one-sided, heading still matters.
  - **The wave** (far shot) has the same height and is faster (576 px/s), so the dry time is at most 0.35 s.
  - **Blade reach 64 px**: a whole train of three is inside one swing for 0.37 s at the new speed.
  - **Entry markers**: 0.67 s of warning on the row before anything flies in (at 144 px/s an unannounced drone gave 1.4 s).
  - **Laser as armour**: capsules are frequent at this density, so a loaded laser absorbs one touch.
  - **Rock made roomier for the speed**: cavern 11–14 tiles wide, fortress gates 9 tiles, lanes 8–10 tiles, longer
    plateaus; zones are 400 columns (≈ 45 s each).
  - **Human-limited model**: misjudges a target's height against its own by σ ≈ 7 px (was ≈ 2 px), its x by 8 px.
- **Free fire → one energy.** With unlimited shots, tapping holds a row and streams bullets. Blade and shot were merged
  into one energy that returns instantly only on a cut.
- **Laser: "every press spends one" → "fires when the row holds a target".** Under the first rule the rock drained the
  stock (human-limited bot: 4 kills from 9 beams); after: 22 kills from 15 beams.
- **Laser pays blade value only inside blade range** (it paid cut value at any range and made the blade pointless).
- **Trains 4 → 3 on the first loop**, so that one swing can take a whole train; 4 and 5 return on later loops.
- **Canyon rock now crosses the centre line** (a mid-row camper used to clear the zone by tapping).
- **Fortress spacing**: gates after an island or teeth are central and further away; tooth pairs overlap. Checked with
  a reachability table: every checkpoint is flyable with presses ≥ 0.2 s apart and a 3 px berth.
- **Hull smaller than the sprite**, first-loop canyon thinner in waves.
- **Later loops**: aimed drones arrive in volleys of up to four.

Play feel: frame freeze on a cut (4 / 6 / 8 frames for 1 / 2 / 3+), presses made during the freeze are kept; stacked
score pops; blade stroke with a crescent tip versus a thin flick when it misses; nose light for "energy home";
exhaust trail that draws the zigzag; a distinct dull click for a dry press.
