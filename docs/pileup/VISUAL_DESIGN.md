# PILEUP — visual design

Tags **maze** and **car** (drawn). Concept-derived: *night city*, *tyre tracks*, *fire*.

**Visual phrase:** a city at night seen from a police helicopter. An amber car runs under sodium light, dragging
a red line of police behind it along its own tyre marks.

## Roles

| Role | What | Look |
|---|---|---|
| Protagonist | the getaway car | amber body, dark roof, the only warm-yellow object; headlight cone |
| Primary danger | patrol cars, and where they will drive | white bodies with alternating red/blue light bars; **red** tyre tracks mark the stretch of road they still have to drive |
| Variants of danger | heavy van, dog unit | the van is longer and dark navy with a white roof; when a car hits it, the van flashes white, smokes, and keeps going while the car burns. The dog unit is a cyan car sweeping a cyan searchlight ahead of it (no headlights, no light bar); it never turns onto your red tracks |
| Primary reward | a pileup | orange/yellow fire on a dark hulk; the pileup's car count under it; score rising from it |
| Goal | the open exit | green chevrons in the gap in the city wall on each edge, pulsing outward |
| Ground | the city | black asphalt, blue blocks lit top-left; grey old tracks; nothing else moves |

Palette: asphalt `#0b0b10`, blocks `#16306a`/`#3f6fd8`, amber `#ffcf2e`, police red `#ff3b3b` (tracks, siren,
warnings), fire orange `#ff8a1c`, goal green `#4dff6a`, dog cyan `#3ff0ff`. Every colour above has one job; red
is never used for reward, amber never for anything but you.

## State changes shown without text

| Event | Shown by |
|---|---|
| a car picks up your tracks | a red square flashes on that tile; the tracks behind it turn red |
| two cars meet | debris burst, shake scaled to the pileup, fire grows with each car; 3+ cars: banner and a warm flash |
| a van rams a car | the car burns, the van flashes white and drives on; one ram: dents and a grey roof; two: more dents, sparks, smoke trail, dead light bar |
| an arrival | the corner box blinks red/blue for 1.5 s |
| the exit opens | the four wall gaps open with green chevrons; the quota icons all light |
| a wreck is about to be towed | it blinks for its last 1.5 s |
| you are caught | the car turns red, big shake, flash |

## HUD

Top bar: score left; high score right; district name and the quota as a row of small car icons in the middle
(filled when wrecked); lives as small amber cars at the bottom left. Words appear only for ceremonies
(READY, GOT AWAY, BUSTED, GAME OVER, CITY ESCAPED) and on the title and attract screens.

## Kept procedural

Everything: cars, blocks, fire and tracks are drawn in code on a 24-pixel grid; no image assets.

## Districts (added after session s5)

Each zone of the city has its own blocks, so you know where you are without reading. The roles above keep their
colours in every zone:

- amber is only ever you;
- red is police intent;
- orange is fire;
- bright green is an open exit;
- cyan is a dog unit.

Zone colours are muted against those.

Zones are drawn per run (outer rings lean to HARBOR/INDUSTRY); the look follows the zone.

| Zone | Blocks | Rooftops | Police |
|---|---|---|---|
| DOWNTOWN | blue | sparse lit windows | patrol cars |
| OLD TOWN | brick brown | tiled roofs | patrol cars; pileups x1 |
| MARKET | olive | striped awnings along the street side | heavy vans; x1.5 |
| UPTOWN | purple | towers of lit windows | dog units; x1.5 |
| HARBOR | slate teal | stacked crates | vans and dogs, more police; x3 |
| INDUSTRY | grey | hazard stripes | vans and dogs, more police; x3 |

**Exits.** Each exit carries a label on the wall beside it, always visible: the destination zone's colour chip,
its three-letter tag and what its pileups pay (`OUT !` where the exit leaves the city). The labels brighten when
the exits open.

**City map.** The READY and GOT AWAY panels show the 7x7 city: zones by colour, districts already got out of
brighter, your route as an amber line, your district outlined, and on GOT AWAY the step to the next one.

Banners sit a third of the way down the screen, so EXITS OPEN never covers the top exit it announces.
