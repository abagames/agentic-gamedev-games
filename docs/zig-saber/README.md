# ZIG SABER

A one-button side-scrolling terrain shooter in the manner of an early-80s arcade cabinet.
**Every press turns the ship and fires.** You cannot do one without the other.

Open `index.html` in a browser.

## Tags

Drawn once with `node tools/pick-tags.mjs` (the brief allowed tags): **sword, laser**.

- **sword** → a press is a swing, not a line: it covers the side the ship was heading for (30 px beyond its row,
  6 px behind) out to 64 px in front of the nose. A kill inside the swing is a *cut*: three times the points, it takes
  every enemy inside it at once (doubling each time), and your energy is back immediately. It is also the only thing
  that opens an armoured shell. The tag became the game's risk: the best kills are the ones you wait for.
- **laser** → the power-up, and not a second weapon: each laser level makes the blade longer (64 → 96 → 128 →
  160 px), so more of what you kill is a cut. The laser is also armour: touching an enemy costs every level you hold instead of the ship.

## The full game

A lone needle-ship flies a canal bored through a planet: canyon, cavern, fortress, and further in — a foundry with
moving rock, a flooded tube where the scroll speed changes, a core chamber whose reactor can only be killed by a laser
fired through a rotating gap. Each zone is a fixed, learnable course, as on a 1981 cabinet; each zone ends at a gate
boss built from the same rule (straight rows, one button). Loops raise the rank. The ship never gains a second
control: all growth is in what one press can mean.

This slice is the first three zones and the gate that closes them, played twice: the second loop is the same rock
at a higher rank, and destroying its gate clears the game.

## Controls

One button: **Space**, **Z**, **X**, **Enter**, **↑/↓**, a mouse click or a touch anywhere on the page.

- in play: turn + fire
- title / game over / table: start, continue

`P` or `Esc` pauses, `M` mutes. Holding the button does nothing more than one press.

## Rules

- The ship always moves diagonally: the screen scrolls, and the ship climbs or dives at a fixed speed. A press flips
  climb/dive. Rock kills. So does any enemy you touch.
- **One energy, one swing.** A press swings the blade towards the side you were heading for, then turns you away.
  You strike what you are flying at; you do not have to be level with it.
  - If the swing hits anything within 64 px, everything inside it is cut — 300, 600, 1200 … — and the energy is home at once.
  - **Cut chain.** Each swing that cuts raises the multiplier of the next one (×2 … ×5) and restarts its clock.
    A cut within 24 px of the nose pays double and holds the chain half as long again.
    Without a cut it drops one step at a time: ×5 holds for 1 s, ×4 for 1.5 s, ×3 for 2 s, ×2 for 2.5 s. The wave
    neither feeds nor breaks it.
  - **Heat.** The chain also heats the game: every step makes newly arriving enemies 8 % faster (32 % at ×5), and at
    ×3 and above each scripted wave brings one aimed drone with it, two at ×5. Let the chain drop and it cools.
  - If it hits nothing, the energy leaves as a single wave of the same height (far kill: 100). Until that wave hits or
    leaves the screen, **a press only turns** (dull click, dark nose light).
  - Rock stops the blade. **The wave passes through rock**; only armour (a shell, a seal, a plate of the gate) stops it.
- Every entry is announced: a marker in the enemy's colour blinks on its row at the right edge for 0.67 s first.
- Enemies fly straight rows from the right: **drones**; **trains** (red, a file of three — four and five on later
  loops); **shells** (steel, the far shot bounces off, a cut is 500); **rushers** (magenta, blink at the edge, then go).
- Every start and every restart opens with one red carrier train, announced 0.3 s after READY, 40 px off the ship's
  row: the capsule is on offer from the first second, and a lost ship gets a way back to laser level 1.
- Destroy a whole **red train** and its last member drops a capsule (one train in four is red, convoys included;
  orange trains carry nothing). Fly through it: **laser level +1** (up to 3).
  - Each level lengthens the blade: 64 / 96 / 128 / 160 px. Everything inside it is a cut — full value, chain, capsule.
    The wave leaves from the blade's tip. Two small marks in front of the ship show where the blade ends.
  - Levels fade one at a time, the higher the faster: level 3 lasts 7 s, level 2 10 s, level 1 15 s. A capsule adds a
    level and restarts the clock (a line under the laser bars). **A gem winds the clock back to full.**
  - **Laser is also armour, at a price.** Touching an enemy burns every level you hold, destroys the enemy, and for
    half a second the ship rams through anything else. Rock is never forgiven.
- **Gems** sit near the rock in the canyon and cavern, and on the flight line in the fortress (the middle of every
  gate, 24 px off the tip of every tooth, the centre of a sealed lane): 100, 200 … 800 for an unbroken chain, multiplied by the cut chain; letting one scroll
  past resets the gem chain. Each gem also refills the laser clock, so the rock side is where a level is kept alive.
- Extra ship at 200 000, 600 000, 1 400 000 and 3 000 000 — four at most.
- Each game deals the pilot a three-letter call sign from a fixed roster of 50 (shown in the HUD in place of `1UP`); a ranking score is written
  into the BEST 5 under that name at once. There is no name entry.
- Three ships. A lost ship comes back about two seconds of flight before the place it was lost — the nearest roomy
  spot behind — after a short READY, without its laser and chain. The zone is not replayed.
- **Compound waves** are built from the same pieces: a *convoy* (a shell leading a train in one row — the wave cannot
  reach the train until the shell is cut), a *pincer* (two trains at once, far apart), a *chaser* (a train, then a rusher).
- **Sealed lanes.** Every fortress island splits the way into a wide lane and a 7-tile lane closed by a steel seal.
  Only the blade opens the seal, and only from inside the lane: 500. Behind it are four gems and a special capsule
  that gives top laser level and a full ×5 chain at once.
- **The gate** waits past the fortress, at the right edge, out of the blade's reach. It fires nothing; it throws its
  own steel plates at you, two at a time, along the rows nearest yours, with an escort of three drones.
  - Cut a plate (500) and its row of the core lies open for 4.5 s. Let it past and it returns to the gate.
  - Send the wave into an open row: one damage. The gate has 24. A closed plate stops the wave.
  - **The hit pays 200 × the number of rows open at that moment.** Open rows let out files of drones, so holding
    several open is where the score and the danger are.
  - The blade cannot hurt the core, however long it is: its part is the plates. (At laser level 3 the blade reaches
    the gate, so the wave leaves its tip already inside the open row and lands at once.)
  - Below half strength the gate goes into overdrive: plates 40 % sooner, a fourth escort drone.
  - Its time is counted down at the top of the corridor (`TIME 75`), ticking for the last ten seconds. Destroyed: 20 000 × loop, plus 5 000 × loop for
    every second left, plus the loop bonus. The gate's own plates and drones pay plain value (no chain, no
    point-blank double), so there is nothing to gain by letting the clock run. At zero the gate does not blow up — it shuts every plate, calls back the ones in flight and
    pulls away to the right over 1.7 s, shedding sparks; nothing can hurt it any more. The loop ends with no
    bonus (after loop 1 the game goes on to loop 2; after loop 2 it ends without ALL CLEAR).
- **Two loops.** Destroy the second gate and the game is cleared: 50 000 for every ship left, counted off one ship
  at a time (the ship icons go out one by one as the score climbs; this payment earns no extra ships). If the second gate gets
  away the game ends without that.
- **Score for clean play.** Leaving a zone pays 10 000, or 50 000 if no ship was lost in it; taking every gem of a
  zone adds 100 000.
- Each loop is the same rock with faster enemies, more waves, longer trains, aimed drones in volleys and more rushers.

## Core interaction and the main decision

The recurring decision is **when to press**, and it is never free:

- You need presses to stay off the rock, and each one may throw your only shot down an empty row.
- A far wave is safe and worth little; to cut you must hold fire while the enemy closes to 64 px. Which side you can
  strike depends on your heading, so a press also decides what you can hit next.
- A train is a wall. One well-timed swing opens all three and pays 2100 plus the capsule; a far shot takes one and
  leaves the wall.
- Laser levels buy distance: the longer blade lets you cut from further away, but only while you keep taking trains.

Intended sensation: *gliding on a diagonal you committed to, holding your fire while a train closes, and pressing at
the last moment so one swing opens all three and flips you clear.*

## Design and interaction language

1981–83 horizontal scroller: 256 × 224, 8 px tiles, black space, one saturated rock colour per zone with a bright rim,
a 5 × 7 bitmap font, score-table title page, READY / GAME OVER / BEST 5, attract demo, two-PSG sound.
White = you, cyan = your energy, cream = laser, warm = shoot it, steel = cut it, pink = bonus.
The strongest feedback (freeze, stacked score pops, screen kick) is reserved for the multi-cut; a far kill is small on
purpose. Details: `VISUAL_DESIGN.md`, `AUDIO.md`. Concept search and stress test: `DESIGN_SEARCH.md`.

## What the slice is meant to validate

1. Does "shoot = turn" produce a decision on every press, rather than a handicap? (single shot + rock)
2. Is waiting for the cut worth its risk, and can a person time it?
3. Does a fixed, learnable terrain course carry a one-button shooter for a few loops?

## Tuning

The game went through fifteen rounds of change after hands-on play; `REVISION_HISTORY.md` has each one with its reason
and its measurements. The ones that shaped the game most:

- the shot became a swing over a band on the heading side, because people cannot line up a row exactly;
- speed and enemy rate were doubled, and made fair by entry markers, the band swing and laser-as-armour;
- the laser stopped being a second weapon and became blade length that fades one level at a time;
- the chain runs on a clock instead of being broken by the wave; heat ties the danger to the chain;
- the gate throws its own plates, the wave finishes it, and its own drones pay nothing worth waiting for.

## Simulated players

`bots.js`. All planners roll the real rules forward.

| profile | what it is | used for |
|---|---|---|
| idle, mash (6 / 12 / 30 ticks), survivor (rock only), shooter (fires at anything in its row) | state-blind or one-rule policies | exploit detection |
| precise | sees the screen, perfect timing, presses ≥ 4 ticks apart | upper bound, exploit detection |
| oracle | precise + knows the entry script | upper bound |
| human-limited | notices an announced entry 0.27 s after its marker lights, misjudges a target's height against its own by σ ≈ 7 px and its distance by 8 px, replans every 0.15 s, cannot retract a press 0.12 s out, timing error σ ≈ 65 ms, presses ≥ 0.15 s apart, keeps a berth, has lapses, and only trusts plans that survive an 85 ms slip | difficulty and pacing |
| expert | human-limited with half the noise and no lapses | escalation over loops |

Results (3 ships + extends, the two-loop game; the development logs and screenshots are kept out of the deployed copy):

| policy | score | zones | notes |
|---|---|---|---|
| idle | 0 | 0 | rock in 11 s |
| mash 6 / 12 / 30 | 1 300 / 3 100 / 900 | 0 | |
| survivor | 300 | 0 | trains |
| shooter | 4 800 | 0 | shells, rock |
| human-limited (12 seeds) | about 500 000 | 0 % clear the game, 17 % reach loop 2 | 0.7 extra ships, 3.7 lost |
| expert (8 seeds) | about 4 500 000 | 63 % clear the game, 100 % reach loop 2 | 3.6 extra ships, 4.5 lost |
| precise | 6 374 000 | clears the game | no ship lost |

Gate alone (unlimited ships): the human-limited profile destroys it in 24 s on loop 1 and 33 s on loop 2, losing 0.8 / 1.6 ships; the expert in 22 s / 26 s, losing 0.3.

What rests on what: "monotonous play loses" holds on every profile. The campaign's difficulty rests on the
human-limited and expert profiles. The precise planner clears both loops without losing a ship.

Bot sanity: the first human-limited model died mostly from its own artefacts (it turned into rock when a late turn
was no longer safe, and committed to cuts that failed on a one-tick slip). Both were fixed in the model, not the game;
its press rate is 1.9 / s with no two presses closer than 0.15 s. After the hands-on reports the model was made noisier and given a large vertical aiming error (see the tuning record); with the band swing it makes about 50 multi-cuts per game, which a person has not yet confirmed.

## Deliberately omitted

Further zones and their bosses, enemy bullets, ground targets, moving rock, speed or option power-ups, two-player alternation,
continue, difficulty settings, a path-prediction aid.

## Run

Open `index.html` (no build, no server). `?zone=1` or `?zone=2` starts at a later zone, `?loop=n` at a later loop.

## Tests

Needs Node 18+ and the repository's Playwright (`npm install` at the repo root).

| command | what it does |
|---|---|
| `npm test` | rules (94 checks), audio contract (20), browser flow and feel (32) |
| `npm run test:rules` | mechanic conformance on `core.js`, course fairness, monotony ladder |
| `npm run test:audio` | chip-model audio contract |
| `npm run test:browser` | real key / pointer input, attract, READY, cut freeze and input buffering, pause, capsule, laser, zone, death, game over, dealt pilot name, ranking persistence, restart, visibility, mute |
| `npm run balance` | bot ladder |
| `node tests/campaign.cjs 16` | how far each profile gets in the two-loop game |
| `npm run loops` | deaths per loop for one profile (`node tests/loops.cjs human 2`) |
| `npm run deaths` | where and how the human-limited bot dies |
| `npm run course` | the course as ASCII |
| `npm run video` | records 4 s of title and 16 s of play (expert bot, a take without a lost ship) to `media/zig-saber.mp4` (with the game's own audio) and `screenshot.gif`; needs ffmpeg |
| `npm run shots` | screenshots into `evidence/` (created on demand, git-ignored) |

## Known untested behaviour and limitations

- **Difficulty is not established.** The user played the build before the last risk-and-reward round and called it
  quite easy, while the human-limited bot cleared it 19 % of the time; so that bot is weaker than the player and has
  not been recalibrated. The current build (heat, point-blank double, armour that costs every level, the reworked
  gate, the anti-milking scoring) has not been played by a person.
- The all-gems zone bonus has not been achieved by any simulated player; whether it is reachable by hand in the
  canyon and cavern, where gems hug the rock, is not shown.
- Whether the signs are noticed in play is unmeasured: the point-blank marks, the reach marks, the chain gauge and
  its clock, the carrier colour, what the gate wants.
- **Nobody has listened to the audio**, including the gate's music; levels and arbitration are measured, not auditioned.
- The recorded clip was checked frame by frame and by audio peak, not watched and heard as a video.
- Touch input was exercised only as a mouse click in headless Chromium; no phone was used. Other browsers untested.
- A loop boundary is a cut to READY, not a seamless scroll.
- The attract demo builds a rock table on first use; a short hitch at that moment is possible on slow machines.
- No assets: all graphics and sound are generated in code. The 5 × 7 font data is the one used by this repository's
  earlier games.
