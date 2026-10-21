# PILEUP

A 1981-style fixed-screen maze driving game. You drive a getaway car through a grid of city blocks and leave
**tyre tracks**. Patrol cars that find your tracks follow them exactly, turn for turn, so your route is their route.
Cross your own tracks just ahead of the line, or double back after a junction, and the line runs into itself. Every
car still following the tracks drives into the wreck. Wreck enough of them and the exits in the city wall open.
Get out through five districts to escape the city.

Open `index.html` in a browser (no build step, no server needed).

## Tags

The brief named only a style ("1980年代レトロアーケードゲームを制作せよ"), so tags were drawn once with
`node tools/pick-tags.mjs`: **maze**, **car**.

- **maze**: the playfield is a city-block maze, and your path through it is drawn on the screen as the route the
  police will drive. Loops round a block, figure-eights and doubling back after a junction are how you fold that
  route into itself. Each wreck changes the maze for nine seconds, and each district is a different maze.
- **car**: read through what cars leave behind and what they cannot do. A car leaves tracks, and a patrol car on
  them is committed: it drives the next tile of them even into a burning wreck. You are a car too: you can reverse
  instantly, but a wreck kills you as it kills them.

### Relation to Rally-X

Rally-X (Namco, 1980) is the closest neighbour: cars in a maze, and pursuers faster than you. As the person pointed
out during design, in Rally-X red cars that collide spin and stall for a while, but you could hardly cause this on
purpose. PILEUP is built to make that collision something you cause with your own route. See `DESIGN_SEARCH.md` and
`REVISION_HISTORY.md` for how it got there.

## The game

A getaway across a city of 7 x 7 districts. You start in the middle of DOWNTOWN. Each district has a quota of
police cars to wreck. When the quota is met, the exits in the middle of all four walls open. **The exit you take is
your route:**

- each exit leads to the neighbouring district on that side, and you enter it at the opposite edge;
- driving out of a district on the outer ring escapes the city: **CITY ESCAPED**;
- the shortest escape crosses four districts.

The label beside each exit shows where it leads and what pileups pay there. The READY and GOT AWAY screens show the
city map with your route.

| Zone | Police | Pileups pay | Pressure |
|---|---|---|---|
| DOWNTOWN (always the centre) | patrol cars | x1 | usual |
| OLD TOWN | patrol cars | x1 | fewer and slower |
| MARKET | + **heavy van**: a car that hits it is wrecked and the van drives on, damaged; its third ram or any burning wreck stops it; scores double | x1.5 | usual |
| UPTOWN | + **dog unit**: never takes your tracks; it always hunts you | x1.5 | usual |
| HARBOR, INDUSTRY | vans and dog units | x3 | more and faster |

Every run draws a new city. The mazes are fixed by position; the zones are drawn by ring:

| Ring | OLD TOWN | MARKET | UPTOWN | HARBOR / INDUSTRY |
|---|---|---|---|---|
| 1 | 35% | 30% | 30% | 5% |
| 2 | 20% | 27.5% | 27.5% | 25% |
| 3 (outer) | 15% | 20% | 20% | 45% |

The further out you go, the more the x3 zones dominate, but quieter districts are often mixed in.

Quotas grow by ring: 4 in DOWNTOWN, then 5, 6 and 7 on the outer ring.

- **Going back is a bad choice.** A district you have been through before is on alert: two more police, two steps
  faster, and no bonus or extra car. Its exit shows a red `HOT` label.
- **Don't hang about.** Police get a step faster for every second district you enter and for every 2 minutes of the
  run.
- **Escaping early pays.** Getting out of the city scores 10,000, plus 5,000 for every car you still have.

## Controls

- **Arrow keys / WASD**: the direction to take at the next junction. It is remembered until you are able to take it.
  The opposite direction reverses at once.
- **Touch / mouse**: swipe on the screen in a direction; tap to start.
- `Space` / `Enter` start. `M` mutes. On the high-score table: up/down change a letter, `Space` moves on.
- With `?review=1`: `N` downloads the recorded runs of this build (between runs).

## Rules

- Your car moves 5.5 tiles a second. Without input it keeps going straight and stops at a wall.
- It leaves tyre tracks on every tile it drives (the last 48 tiles; older tracks fade and are lost).
- A patrol car **off** your tracks hunts you by the shortest road and never reverses between junctions. When it
  reaches a tile of your tracks it picks them up (a red flash), at your latest pass over that tile.
- A patrol car **on** your tracks drives exactly where you drove, including back the way it came where you reversed.
  The stretch police still have to drive is drawn red with dashes running toward you; older tracks are grey.
- **Two patrol cars that meet head-on or side-on wreck each other**; one running into the back of another does not.
  A wreck burns for 9 s from the first crash and blocks its tile. A car following tracks through it drives in and
  joins the pileup; a hunting car routes around it.
- A **dog unit** never picks up your tracks; it always hunts. A **heavy van** wrecks any patrol car that hits it and
  drives on, visibly damaged (dents, grey roof, then smoke and a dead light bar); its third ram wrecks it, and a
  burning wreck stops it at once.
- **Score**: the n-th car in a pileup scores 100 × n × the zone's multiplier. A heavy van scores as two cars but
  counts once towards the quota.
- Getting out of a district for the first time: 1,000 × (ring + 1) and an extra car. Escaping the city: 10,000 and
  5,000 per car left.
- Extra cars also at 10,000 points and every 40,000 after.
- You have 3 cars. You lose one when a patrol car touches you or you drive into a wreck. You restart at the edge
  you entered the district by, with the quota kept and the police cleared.
- Patrol cars arrive at the four corners after a 1.5 s siren warning: 4 at first, one more every 10 s up to 10
  (OLD TOWN one fewer, HARBOR and INDUSTRY one more). They start slower than you and gain speed every 10 s up to
  faster than you. Every second district you enter starts them a little faster; OLD TOWN starts them one step
  slower and HARBOR/INDUSTRY one step faster. The count and speed reset when you lose a car.

## Core interaction and main decision

The sensation: *drawing a loop with a line of police on your tail and cutting across its start just ahead of them.*

At each junction you choose a road, and that choice is also the route of every car behind you. Two folds make a crash:

- **crossing**: go round a block and through a junction your line is still passing, through a gap in it. The car
  behind you meets the line side-on.
- **doubling back**: pass a junction, reverse, and turn off at it. The lead car follows the tracks down the street
  and back, and meets the next car head-on.

The longer the line, the bigger the pileup, and the more cars there are to slip past. Hunting cars come at you from
in front. You dodge them into side streets, where they cross your tracks and join the line. Once the exits are open,
staying to fold more pileups is a trade: more score and extra cars, against police that keep getting faster.

Simulated players over whole runs (`npm run ladder`, 8 seeds; `reports/ladder.json`). The bots take the nearest exit
into a district they have not visited that is not further in, and always the way out of the city when they can:

| policy | median score | districts got out of | escaped |
|---|---|---|---|
| idle | 0 | 0 | 0% |
| flee (never folds on purpose) | 1,113 | 1.0 | 0% |
| human-limited look-ahead | 2,906 | 1.5 | 0% |
| skilled (quicker, further-sighted) | 50,238 | 4.8 | 63% |
| strong (2-junction look-ahead on the real rules) | 86,481 | 5.4 | 100% |

Routes (`node tests/route.cjs`, whole runs):

| route | strong | skilled |
|---|---|---|
| nearest exit into an unvisited district | 8/8 escaped, 86,481 | 7/12, 46,912 |
| always the best-paying zone | 6/8, 72,056 | 3/12, 29,070 |
| any exit, revisits allowed (measured before the last easing) | 0/8, 28,625 | 0/12, 13,825 |

Runs last about 5 minutes; the longest bot run was 7 minutes.

## Design and interaction language

An early-80s top-down maze cabinet at night: black asphalt, blue city blocks lit from the top left, pixel cars on a
24-pixel grid. Colour carries the roles:

- **amber**: you;
- **white with flashing red/blue**: police; the navy van (longer, shows its damage) is a variant;
- **cyan**: the dog unit, a cyan car sweeping a cyan searchlight;
- **red**: police intent (the live stretch of your tracks, the arrival box);
- **orange fire**: pileups;
- **green**: the open exits.

Full plan in `VISUAL_DESIGN.md`; every event's response in `FEEL_TUNING.md`; sound in `AUDIO.md`.

Sound is an era-inspired small wavetable board in the manner of Namco's WSG: three 4-bit voices and a noise voice.
The chase music in A minor pentatonic follows the game:

- tempo rises with the police speed;
- a counter-melody joins while three or more cars are on your tracks;
- it switches to a getaway section when the exits open, and to an alert section in a district you came back to.

Effects take a voice from the music while they sound. The radio blip that says a car picked up your tracks sits
above everything the music plays. The attract demo is silent.

The title shows the high-score table. After 9 s an attract demo plays a recorded strong-bot run (`demo.js`)
through the real rules.

## Run and test

```bash
open index.html                       # or any browser; no server needed
npm test                              # rules, sound budget, and the headless page
npm run test:rules                    # rule conformance on arranged states
npm run test:audio                    # every sound within the SE / jingle budget, every event has a program
npm run test:browser                  # title, demo, start, keys, a pileup, the exit, game over, initials, restart, sound levels
npm run campaign                      # whole runs per policy: districts, lives lost, time
npm run district                      # one life in each district per policy (content checks: see tests/district.cjs)
node tests/route.cjs 8 strong         # does the route matter? nearest / rich / safe exits over whole runs
npm run ladder                        # the repository's bot ladder over whole runs
node tests/deaths.cjs 12 skilled      # how lives end
node tests/shot.cjs strong 2 2 1500   # screenshots of a bot's run in the page, at ticks of play
node tests/demo.cjs                   # regenerate the attract demo
npm run video                         # media/pileup.mp4 and screenshot.gif: 4 s of title, 16 s of a strong-bot run (needs ffmpeg)
```

`tests/adapter.cjs` serves the repository's `tools/` (ladder, review kit, replay); variants `market`, `uptown` and
their `-plain` forms start a one-life run in the district that introduces an element, with it on or off. `reports/before-presentation.json` and `reports/after-presentation.json` are the
presentation-pass comparison (identical). There is no `evidence/shots/frames.json`. The screen was checked from frames written by
`tests/shot.cjs` and `tests/browser.cjs` (`evidence/`), read by an outside reader (see `REVISION_HISTORY.md`).

## Known limitations and untested behaviour

- Difficulty is uncalibrated for this build (`08`). On `07-city` the person escaped once (48,350), between the skilled
  and the strong policy.
- Always chasing the x3 zones loses to taking the nearest new exit. With the spare-car bonus, x3 is an opportunistic
  pick, not a route worth a detour.
- Touch steering has not been tried on a real touch device.
- Sound levels were measured by offline rendering through the master chain, not heard by a person.
- Early losses (within 8 s of a life) are about 10% of lives for the bots, mostly in a corner pocket. They were
  judged avoidable for a person, because both cars are visible for 2 s or more, but this has not been confirmed by
  play.
