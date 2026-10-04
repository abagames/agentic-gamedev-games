# ZIG SABER — visual design

Visual phrase: **a white needle stitching a zigzag through coloured rock, with one line of cyan light in front of it.**

Tags: sword, laser (drawn) · concept-derived: sawtooth path, single-hue rock per zone, black space.

Era target: 1981–83 horizontal scrollers. 256 × 224, 8 px tiles, integer scaling, no gradients, no alpha, no rotation
(the ship tilts by shearing its columns one pixel), a 5 × 7 bitmap font, 60 Hz.

## Hierarchy

1. **Protagonist** — the ship: the only pure-white object, fixed at x = 44, always moving up or down. Its red dotted
   exhaust keeps the last second of its path on screen, so the zigzag (and the slope you are committed to) is visible.
2. **Primary danger** — the rock: one saturated hue per zone with a bright 2 px rim on every exposed face. The rim is
   the collision edge.
3. **Targets** — warm colours, flying straight left: orange drone, red train (red = carries the capsule), magenta
   rusher. The steel-blue shell with a white front plate is the one cold-coloured enemy: the far shot cannot open it.
4. **Reward** — pink gems near the rock, the blinking red/cream `L` capsule.
5. **HUD** — two text rows on black above the playfield; nothing is drawn over the field during play except score pops
   and the zone banner.

## Palette roles

| role | colour | used for |
|---|---|---|
| player body | white `#fcfcfc` | ship, life icons, text |
| player energy | cyan `#3cbcfc` | blade, shot, nose light when the energy is home |
| laser | cream `#fce4a0` | beam, HUD stock, nose light when loaded, multi-cut score pops |
| shoot me | orange / red / magenta | drone / train / rusher |
| blade only | steel blue + white plate | shell |
| bonus | pink `#f878f8` | gems |
| rock | red-brown, green, blue (one per zone) | terrain, and the three course boxes in the HUD |

## State you can read without text

| state | in-world sign |
|---|---|
| heading | ship sheared nose-up / nose-down, exhaust trail slope |
| energy home / out | nose light cyan / dark; the shot itself is on screen while it is out |
| laser level (= armour) | nose light blinks cream, a cream bow stands in front of the nose; three HUD bars; the blade stroke itself turns cream and is drawn at its real length |
| where the blade ends | two small marks in front of the ship at the current reach (cyan at level 0, cream above) |
| armour spent | ship flashes white for the half second it rams, cream ring, short freeze |
| entry coming | bracket in the enemy's colour blinking on its row at the right edge for 0.67 s |
| where the swing reaches | the stroke and the wave are drawn as tall as the band: from just behind the ship's row to 30 px on the heading side |
| blade bit | band-high outlined stroke with a crescent at its tip, ring on each cut enemy, frame freeze |
| blade missed | thin 3-frame flick, then the projectile leaves |
| shot deflected | white sparks on the shell's plate, no explosion |
| chain of gems | pop value climbs 100 → 800 |
| cut chain | four-segment cyan gauge and `X2`…`X5` beside the laser bars; the exhaust trail turns cyan (doubled at ×5); cut pops show the multiplied value, the cut sound climbs; a line under the gauge is the time left before it drops a step (red and blinking at the end); the gauge blinks red when it runs out |
| time left on the current laser level | a line under the laser bars runs down, red and blinking for the last 2 s |
| which train carries a capsule | red file = carrier, orange file = nothing (its entry marker has the same colour) |
| lane capsule | white-flashing capsule inside a pulsing ring: top level and full chain |
| gem wound the clock | the laser bars flash |
| the gate | fortress-blue wall at the right edge with five steel plates (steel = blade only). A plate about to be thrown blinks white; its row shows a dark shutter while it flies; a cut plate leaves a glowing red core row; the red bar on the wall is what is left of the core; the wall blinks red for its last 5 s |
| heat | no sign of its own: it follows the chain, which the gauge and the cyan exhaust already show (stars stay single dots — streaks read as shots) |
| point-blank zone (cut here for double) | red marks 24 px in front of the nose, always shown beside the reach marks; the root of every blade stroke is red |
| point-blank cut | the red root fills in and a tight red crescent snaps out at the nose; red pop with `X2`; white-red burst, longer freeze |
| gate time left | `TIME nn` on a small black plate set into the corridor ceiling, with a bar that runs down beneath it; red, blinking and ticking once a second for the last 10 s; in overdrive the wall's edge burns red |
| the gate leaves | every plate shuts, the wall blinks red and slides off to the right throwing sparks, `THE GATE IS LEAVING` across the top, the clock disappears; then `THE GATE GOT AWAY / NO BONUS` |
| sealed lane | steel bar with a white face across the lane mouth (steel = blade only, as on the shell) |

## Feedback budget (strongest effect for the strongest outcome)

| event | effect |
|---|---|
| dry turn | 2 grey pixels at the tail |
| far kill | 7 small particles, grey score pop |
| cut | 16 particles, ring, white pop, 4-frame freeze |
| multi-cut (2, 3+) | stacked pops in cream, 6–8-frame freeze, screen kick at 3+ |
| death | 46 particles, 16-frame shake, music stops |

## Title logo

Drawn from the 5 × 7 font at four times size, with the banded colouring and hard drop shadow of an early-80s marquee.
`ZIG`: white to cyan to blue (the ship's energy), its three letters standing on a zigzag. `SABER`: white to cream to red
(the laser), cut in two by a rising slash with the lower half slipped aside. On arrival the ship flies the slash across
the word and the cut appears behind it; the ship's exhaust zigzags under `ZIG`.

## What stays procedural

Everything: sprites are character grids in `main.js`, rock is drawn per tile from the course columns. No image assets.
