# OVERTURN

Flipperless pinball. The only control turns the whole table; gravity keeps pointing down the screen.
Built to the brief "a pinball game with no flippers, only screen rotation, after the rotating
playfield of Namco's *Assault*, as an arcade game of the same period", then finished as a
single-table pinball with the rule set and rule display the user asked for (real pinball and
*Digital Pinball: Necronomicon* as references). No tags were drawn: the brief fixed the concept.

## The game

A 1988 rotate-and-zoom cabinet, vertical screen. One round table is bolted to a turning floor. The
ball never rests: a live rubber rim throws it back toward the centre, and the player turns the
machine under it. The rim is the flipper and the drain at once. Every pinball rule on the table is
written in the things a turn can decide: which section the ball lands on, whether the table is
moving when it lands, which face is in the ball's way, and whether the ball goes straight up the
middle.

## Controls

| | keyboard | touch / mouse |
|---|---|---|
| turn the table anticlockwise / clockwise | Left / Right, or A / D | hold the left / right half of the page |
| start, restart | Space or Enter | tap or click anywhere |
| pause (shows the rule sheet) | P | tap the top display; any tap resumes |
| mute | M | — |

The title and pause screens name whichever input was used last (`PUSH SPACE` or `TAP TO START`).
With two fingers the newest one down decides the direction, and lifting it hands back to the one
still held. The game pauses by itself when the page is hidden. On a window narrower than twice the
screen (a phone) the picture is scaled to fit; otherwise it uses whole-number scales.

## Rules

- **Rim.** Twelve sections, three landings each (cyan, amber, red). At zero a section is a hole; a
  ball that reaches a hole is lost. A new ball finds every hole and every red section built back
  up to two landings; sections torn out for good stay out. A rim that is turning when the ball lands drags the ball its
  own way — the only way to send it sideways.
- **Lamps.** A landing lights that section's lamp (it swells, and the repair figure on the
  display brightens). Each lit lamp is one landing the next finished bank puts back: the lamps
  fly to the sections they rebuild.
- **Banks.** Three banks of three drop targets. A target falls only when hit on the face turned to
  the centre; from the rim side it is steel. A bank turned to the bottom is a roof over the
  ball; a steel back does not bounce the ball back at the rim but sends it out sideways along the
  bank, toward the nearer end, so one hit carries it out from under the roof. The third target of a bank puts one landing back into the rim for
  every lit lamp, weakest section first, puts the lamps out, raises the bonus multiplier and lights
  the hub. The bank stands up again after four seconds.
- **Torn sections.** Every fourth bank tears the weakest section out for good, until one
  section is left. This is what makes a long game harder.
- **Hub.** Lit, the hub catches a ball that comes straight up the middle — a landing near the
  bottom with the table still — holds it while the table can be turned freely, and fires it back.
  The second lock starts a **multiball**: two balls, the table turns purple, and losing one of the
  two costs nothing. In a multiball each bank is a **jackpot** once (5,000; its faces flash yellow
  until taken). With all three taken the hub lights for the **super jackpot**: a ball up the
  middle pays 15,000 and lights the three banks again. All of it ends with the multiball.
- **Save.** A stored save shows as a lit ring round the outside of the rim, across every hole:
  the next ball to fall out is fired back from the hub. One at a time. The second and third balls
  start with it lit; the third SOLO hit lights it again.
- **Skill shot.** A new ball marks one section away from the bottom with pale cyan arrows. Make
  the first landing on it for 2,000 and a save — or, with a save already lit, two letters of ROTATE.
- **Rounds.** Every face that falls lights a letter of ROTATE on the display. With the word
  complete a section flashes yellow under yellow arrows; land on it to start the next round of the cycle
  (SOLO and RUSH last 20 seconds, CHASE 10):
  **SOLO** — one face is lit; hitting it pays 3,000, 6,000, 9,000 and the third stores a save.
  **CHASE** — a light runs round the rim, a section every 1.25 s; a landing on it pays 2,000 more
  each time (2,000, 4,000, 6,000 ...), for 10 seconds. **RUSH** — a value falls from 8,000 to 1,000; the first bank finished takes it.
  All of these are multiplied by the bonus multiplier.
- **Bonus.** A lost ball pays targets dropped x 100 x multiplier; the multiplier starts again.
  The multiplier shows as a ring of pink lights round the hub.
- **Extra ball.** When all three rounds of the cycle have been played the hub lights for an extra
  ball; a ball straight up the middle collects it. Twice in a game at most, and never more than five in
  hand. Score gives none.

The decision at every landing, about once a second: which section pays for this bounce (worn or
sound, lamp lit or not), and is the table moving — and which way — when it does.

Intended sensation: juggling a ball on a floor you are spending, and swinging the room round so the
ball comes down on the one thing that buys the floor back.

## How the rules are shown

Two dot-matrix panels, 112 x 16 dots each, in the manner of a pinball backbox display.

- Top panel: score and balls in hand; under them what the table is asking for, in at most
  eighteen characters (`CYAN ARROW: +SAVE`, `HUB LIT: LOCK IT`, `HIT THE LIT FACE`, `DROP PINK FACES`).
- Bottom panel: the show. Big events take the whole panel in double-size dots, in stages —
  `RIM +5` wiped in and then the bank's value counting up, `JACKPOT` flashing, `MULTIBALL` scrolling
  in, the end-of-ball bonus counted with a tick a step. Between events it carries the word ROTATE
  filling in or the round in play, and the last face's value.
- Nothing is written over the table during play: the table speaks in lights (lamps, multiplier
  ring, lock pips, save ring, chevrons), the panels in words and figures.
- Chevrons on the table point at whatever the sentence names: pale cyan for the skill shot,
  yellow for everything else. When a skill shot and a round are both waiting the sentence
  alternates between them.
- Game over shows the best five with this game's row marked, or how far the score fell short;
  after 15 seconds without input it returns to the title and the attract loop.
- P pauses onto a three-page rule sheet with the current values; the attract loop shows the same sheet.

On the reference: the pages I could reach describe *Necronomicon* as showing notices on banners
in the margins and arrows on the table "rather than a traditional DMD"; I could not see its screen.
The dot display here is built as asked, and the arrows and pause sheet follow those descriptions.

## Design and interaction language

Late-1980s rotate/zoom hardware: 224x288 vertical, a rotating ground and a rotating table drawn as
bitmaps without smoothing, a 5x7 font, two-operator FM sound and one FM music loop. Everything
bolted to the table turns; the ball and the lettering never do. See `VISUAL_DESIGN.md` (roles,
palette, every event and its answer) and `AUDIO.md`.

## Left out

Pop bumpers (rule present, count zero: they rewarded idle play), a roof-break round (built two
ways, rejected both times), more than two balls, more tables, initials entry, speech.
`REVISION_HISTORY.md` has the reasons.

## Run

Open `index.html` in a browser (no build, no server needed).

## Video

`screenshot.gif` (224x288, 15 fps, 2.5 MB, silent) and `media/overturn.mp4` (672x864, 30 fps,
H.264 + AAC, 6.9 MB): four seconds of the title and sixteen of play. `npm run video` makes both
(`node tools/record-video.cjs [seed] [policy]`; needs Playwright and ffmpeg). The game is stepped
one tick at a time with a fixed clock; the picture is the game's own canvas, and the sound is the
game's own programs re-rendered offline at the ticks they were asked for, through the same output
stage. The take shown is seed 120 played by the `human` rung: a skill shot, six banks, two locks,
a multiball with jackpots, a round, a torn section, no ball lost.

## Tests

| | |
|---|---|
| `npm test` | rule conformance (51 checks), the sound kit (length, level, key), the browser flow and the phone-sized touch flow (both need the repository's Playwright) |
| `npm run balance` | ladder of simulated players over the same seeds; `OT_C='{"HUB":false}'` switches a feature off for comparison |
| `npm run deaths` | rewinds each ball a policy loses and searches for a way to have kept it |
| `node tools/ladder.mjs <this directory>` (from the repository root) | the shared ladder through `tests/adapter.cjs` |

Simulated players (`bots.js`): `idle`, `hold`, `stepper`, `wiggle`, `mash`, `greedy` (baselines);
`player` (fitted to the play report on build 02-slice, confirmed by the report on 03-full), `novice`,
`regular` (fitted to the reports on builds 27, 31 and 34: quick reactions, a misjudged table angle), `human`
(look-ahead with slow, late, noisy decisions and lapses); `strong` (look-ahead on exact copies every 3 ticks).

Shared ladder, 16 seeds, means (`strong`: `npm run balance`, 3 seeds, medians):

| policy | game length | banks | score |
|---|---|---|---|
| idle | 36 s | 1.6 | 6,319 |
| greedy (nearest target to the ball) | 43 s | 2.5 | 40,225 |
| wiggle | 51 s | 4.8 | 37,756 |
| mash | 58 s | 5.9 | 58,881 |
| stepper | 59 s | 7.2 | 105,363 |
| hold | 69 s | 8.7 | 135,013 |
| player (first game) | 84 s | 12.1 | 243,606 |
| regular (fitted to the later reports) | 91 s | 14.1 | 361,044 |
| novice (later games) | 93 s | 14.7 | 397,881 |
| human | 121 s | 22.1 | 740,219 |
| strong | 428 s | 108 | 5,473,200 |

## Not tested, and limits

- Calibration: seven play reports from one player. The first two (02-slice, 03-full) fitted the
  `player` rung: a first game. The later ones — 04-rounds (74 s, 8 banks, 122,200), 27 (79 s, 8,
  113,500), 31 (80 s, 9, 339,300), 34 (121 s, 14, 257,800 with one extra ball) — sit on `novice`
  for banks and score. The `regular` rung was fitted to the last three on the builds they were
  played on; per ball it gives the reports' banks (2.9 / 3.1 / 3.7 against 2.7 / 3.0 / 3.5) and
  about 15 % less time (23 / 23 / 26 s against 26 / 27 / 30). On the current rules it comes out
  beside `novice`. Above that nothing has a report: the super jackpot has not been reached by a person.
  A report on build 35 (65 s, 5 banks, 62,000) fell below every game `regular` plays in 40 seeds:
  a person's games vary more than the modelled ones. A report on build 37 (95 s, 14 banks, 274,600, one extra ball) sits on `regular` (91 s, 14 banks,
  300,800 median): the current rules are calibrated on that one report.
- The sound has been heard by the player in passing (the turning tick was adjusted three times on
  their word); nothing else in the kit has been commented on. Levels are computed at the output.
- Touch input is exercised in an emulated phone (390x844, real pointer events, two fingers), not on a device.
- No readability audit by an outside reader was run (`evidence/shots/frames.json` is absent);
  the frames the browser tests capture into `evidence/` were inspected by the author only. That
  folder and `reports/` are test output: they are written on demand and are not part of the
  published game.
- Whether two balls can be followed by a person, and whether a face and a back can be told apart
  at speed, are unverified.
