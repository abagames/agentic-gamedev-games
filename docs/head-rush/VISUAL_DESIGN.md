# HEAD RUSH — visual design

Tags: none drawn. Concept-derived tags: `night circuit`, `runway lights`, `head-on`.

**Visual phrase:** a night circuit seen from the tower — chunky racing cars with stripes and headlights
run between glowing double-lined barriers, over rows of runway lamps.

## Roles (one still frame, no HUD text)

| role | object | read |
|---|---|---|
| protagonist | yellow car with dark-yellow twin stripes | the only yellow body on the field |
| primary danger | red car (leader) and its darker-red convoy, headlights facing you | red + oncoming headlights |
| secondary danger | purple box truck (cab + box silhouette, 17 px) | longest silhouette, never turns |
| primary reward | white 3×3 dots (runway lamps); amber 6 px power; checkered flag | brightest small points |
| powered state | every rival turns blue with white stripes (a truck keeps purple stripes), last second flashing white | the convoy changes colour head to tail in a few frames |
| structure | blue double-line barriers, openings = gaps; light-blue chevrons = one-way | never animated except when a half changes (yellow flash) |
| your intent | yellow blinker dot; yellow marching dashes = predicted path to the next gap | same colour as the car, so it reads as "mine" |
| rival intent | amber blinker arrow; red marching dashes = the leader's signalled route; purple dashes = 1.5 s of a truck's lane ahead | each warning line is the colour of the car it belongs to |

## Palette (gameplay roles)

- `#000` background · `#2040c0` barrier · `#f0f0f0` reward dots / neutral text · `#f8e800` player (+ `#b89800` stripe)
- `#f83000` danger (+ `#801000` stripe, `#c02000` convoy) · `#3070f8` powered rival · `#b048f0` cruiser · `#f8b000` power / blinker
- `#7890b8` labels · `#50f0f0` score pops · `#60d0f8` windshields (small, inside car bodies only)

## Sprites and type

- Cars 13×9 (lane spacing 20, collision radius unchanged at 8), trucks 17×9, 2-frame tyre shimmer tied to travel.
- 5×7 arcade bitmap font on a 6 px advance; score pops 1× (2× from a 5-chain), time 2× at top centre, title 4× with a red drop shadow.
- Everything is code-drawn integer pixels on a 240×272 buffer, scaled by an integer factor. No gradients, glow or post effects.

## Feedback intensity (weakest → strongest)

dot click (rising through an unbroken lane) < turn swish + tyre marks (car noses into the new lane) < half cleared (barriers blink, spark to the flag, flag drops in) <
flag (yellow ring, half flashes, a light sweeps the lanes outside-in, new speed pip flashes) < crash (short freeze, both cars thrown back and spinning, shake along the impact line) <
chain (hit-stop and ring grow per car; the bitten car turns white and is knocked off the track, harder with each bite; white ring and 2× numbers from 5).

State reads: a fresh power turns the convoy blue head to tail (its length = the chain on offer); full throttle trails twin exhaust streaks that lengthen with speed;
the last five seconds each land at 3× in red. Every press relights the blinker immediately (its blink phase restarts).

## Runtime-readable data

`window.__game.visual` exposes the palette roles and HUD anchors used by the renderer.
