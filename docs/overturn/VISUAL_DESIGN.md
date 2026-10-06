# OVERTURN — visual and feel design

Concept-derived tags: `turning machine`, `worn rubber`, `lit objective`.

Phrase: **a lit machine turning in the dark; only the ball and the lettering keep their own up and down.**

## Roles

| Role | What | How it is told apart |
|---|---|---|
| Protagonist | the ball | the only white disc, the only thing that never turns; a three-frame trail; flattens for a moment on landing |
| Danger | a missing rim section; a torn-out one; a target's steel back | absence (the ground shows through); a dashed dark-red scar; cold grey |
| Reward | a target's live face | pink strip on the side turned to the centre; white flash when it drops |
| Lit for you | hub, round-start and chase sections, lamps, jackpot faces | yellow, with chevrons on the table pointing at it |
| Gives a save | skill-shot section; the save light itself | pale cyan chevrons; a pale cyan ring outside the rim |

Palette (each colour has one job, `COL` in `main.js`): white ball; cyan / amber / red rim by
landings left; pink face; grey steel; yellow for anything lit; navy table, purple table during a
multiball; green ground that exists only to show the turn.

## Screen (224x288, vertical, as the reference cabinet)

- Top and bottom: two dot-matrix panels, 112 x 16 dots, four levels of one amber. All lettering
  during play lives here; nothing is written over the table.
  Top: score, balls, and the standing objective (eighteen characters at most).
  Bottom: the show. A big event takes all sixteen rows in double-size dots, in stages: lettering
  wiped in, flashed inverted, scrolled in or shaken, then a figure counting up. Between shows: the
  word ROTATE filling in, `ROUND READY`, or the round in play with its value and seconds left; under
  it, dim, the multiplier and next repair as figures, and the last face's value.
- 224x224 playfield: the ground and the table are two bitmaps rotated without smoothing.
- On the table: chevrons point at whatever the sentence names. Hub lit: three chevrons pointing in
  and a yellow ring. Round ready and the chase light: two yellow chevrons pointing out at a section
  flashing yellow. Skill shot: the same shape in the save light's pale cyan, the section flashing white. Solo: the one face flashes white and yellow with a chevron on its centre side.
  Multiball: the faces of each bank whose jackpot is still to be taken flash yellow. Rush: every
  standing face flashes yellow.
- Multiplier lights: eight pink lights round the hub, one more for each bank finished with this
  ball (x2 to x9); the newest flashes, and all go out when the ball is lost.
- Save light: a ring just outside the rim. Dark sockets when empty; a pale line across every hole
  when a save is in store — the net is drawn where the ball would fall.
- Game over: the best five over the dimmed table, this game's row flashing with `< YOU`, or the
  score and how far it fell short; `GAME OVER` on the lower panel; back to the title after 15 s.
- P pauses onto a three-page rule sheet with the current values; the attract loop shows the same sheet.

## Events and their answers

Strongest first. Presentation only; seeded results are identical with or without it.

| Event | Answer |
|---|---|
| Super jackpot | 10-frame stop, the longest flash and zoom, a ring of yellow bursts, shake, panel: `SUPER` → `JACKPOT` → the value counting up; its own jingle. The strongest answer in the game |
| Super jackpot lit / extra ball lit | hub flashes white and yellow with chevrons; panel: the name, then `IS LIT` |
| Jackpot (bank in multiball) | 8-frame stop, white flash, panel: `JACKPOT` flashing, then the value counting up; jingle |
| Section torn out | shake 10, dark-red and white debris, longest noise in the kit; panel: `TORN OUT` shaking |
| Multiball starts | zoom push, flash, table turns purple, music changes key and tempo, jingle; panel: `MULTIBALL` scrolling in |
| Round starts | flash, top panel flashes inverted, round name at double size, jingle |
| Bank finished | 5-frame stop, every standing section flashes, panel: `RIM +n` wiped in, then the value counting up; rising jingle |
| Ball lost | shake 8, music stops, bonus counted target by target with a tick each |
| Ball saved | the save light flashes and goes dark, a pale burst where the ball was caught, hub flash, rising slide, "SAVED" |
| Save earned, or a ball starting with one | the save light comes on round the whole rim, flashing first; a new ball shows `READY` → `SAVE ON` |
| Ball locked | hub flash, zoom push toward the hub, falling slide and thud |
| Section's last landing | shake 5, red debris, noise |
| Solo face hit / chase light caught | yellow burst or value at the landing, three-note rise, count on the display |
| Round ready | rising three notes, `ROUND READY` blinking on both panels, the section flashes |
| Round over | two falling notes; panel: `TIME UP` |
| Skill shot made | pale cyan burst at the landing, the save light comes on, three-note rise; panel: `SKILLSHOT` → value → `+SAVE` |
| Target drops | white flash, pink particles, its value on the lower panel's ticker, bell one scale step higher per face since the last landing |
| Bank spends the lamps | each lit lamp flies across the table to the section it rebuilds; the section flashes on arrival |
| Landing | section flashes white and gives outward two pixels; thump pitched by the landing's speed; a newly lit lamp swells and the repair figure brightens; ball flattens, thump duller as the section wears |
| Steel back hit | two grey sparks, short dry click, and steel sparks running along the bank the way the ball is knocked: no reward |
| Bank stands up | its three faces flash in turn, each with a click a step higher; the empty slots fill as it winds up |
| Caught at a hole's edge | white sparks and a thin high ping |
| Rim nearly gone (8 landings left) | music loses its bass, a warning repeats |
| Objective changes / score changes | the sentence is drawn in from the left, bright at first; the score rolls up |
| Extra ball collected | hub flash, zoom, flash, jingle; panel: `EXTRA` → `BALL` |
| One of two balls lost | small grey burst, falling slide, music returns to normal; panel: `1 BALL` |
| Turning the table | a ratchet tick for every third of a section turned, stronger at each section boundary; on release a click and a one-pixel overshoot that settles |
| Thrown landing | sparks streaked along the rim in the direction of the throw, whoosh scaled by its strength |
| Ball held in the hub | white arc round the hub running down to the shot, two ticks |
| Ball leaves the table | drawn falling away behind the table (under it, shrinking and greying), never across the playfield; a lost ball also stops the frame for nine frames |

Considered and left out: a guide line for the ball's path (it would play the game for the player);
sprite faces or characters (abstract register); animations on the dot display (two rows of
text use all sixteen dots); zoom during ordinary play (the ball's parabola must stay readable).
