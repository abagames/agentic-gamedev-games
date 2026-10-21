# PILEUP — feel tuning

Register: serious and tense, 1981 night chase. Weighty impacts, short camera shake, no squash or faces.
The strongest feedback is kept for a pileup of three or more cars. The second strongest is losing a car.

| Event | Response | Strength |
|---|---|---|
| steering / turning at a junction | none (headlight cone turns with the car) | — |
| reversing | grey skid marks (no sound; the squeal was removed on request) | small |
| a patrol car picks up your tracks | red square flashes on the tile; the red stretch grows; radio blip | small, high register |
| live tracks (red) | bright dashes run along them toward you | continuous, quiet |
| two cars meet | crunch; debris; shake 2 + 1.5 per car; tally pop above the wreck (one number per pileup, growing) | medium |
| a car joins a pileup | the same, a step louder and higher; fire grows; the count appears from 3 | grows with n |
| a pileup of 3+ | banner "n-CAR PILEUP", warm flash (0.08 per car, capped 0.4) | strongest |
| a van rams a car | the car is wrecked as usual; the van flashes white, smoke puffs, clank, shake 4, and keeps going | medium |
| a dog unit hunting | a sweeping cyan searchlight instead of headlights | continuous |
| a van's damage | dents after one ram; sparks, smoke trail and a dead light bar after two | continuous |
| an arrival is coming | corner box blinks red/blue 1.5 s, two-tone siren | small |
| a wreck is about to be towed | it blinks for its last 1.5 s | quiet |
| the exits open | the quota icons turn green, chevrons pulse in the four wall gaps, "EXITS OPEN", rising call | state change |
| extra car | "EXTRA CAR", arpeggio | state change |
| got away | the car leaves the screen, panel "GOT AWAY!", phrase | state change |
| caught | shake 12, cold blue-white flash, car turns red and blinks, "BUSTED" | strong |
| drove into a wreck | shake 12, orange flash and fire burst, "WRECKED" | strong, distinct from caught |
| game over / city escaped | panel and jingle; initials if the score made the table | ceremony |

Added after session s7:

| Event | Response |
|---|---|
| the run's state | the music: tempo rises with the police speed; counter-melody while 3+ cars are on your tracks; getaway section when the exits open; alert section in a revisited district |
| got out of a district | the bonus counts up; the route on the city map steps into the next district |
| escaped | the bonus counts up, then each car left lights and ticks in turn (5,000 each) |

Considered and left out:
- **A "slip" cue when you cross your tracks just ahead of the line.** Measured on the skilled bot: the loose
  trigger fired 11.5 times a minute against 3.8 wrecks. A tighter one (a car on the old tracks and one on the fresh
  tracks both due at the crossing within a tile of each other) fired 2.7 times a minute, but only 15 of 78 were
  followed by a wreck within 2 s. A cue that is wrong four times in five teaches the wrong thing, so it was
  removed.
- **Hit-stop on crashes.** Crashes come several a second in a big fold, and freezing would stutter the line the
  player is reading.
- **Camera kick toward the impact.** The whole maze must stay still to read routes.
- **Near-miss feedback.** There is no clean trigger: driving alongside your own line is normal play.

All of the above is drawing and sound only. `reports/after-presentation.json` is identical to
`before-presentation.json` (40 runs, `ladder.mjs --compare`).
