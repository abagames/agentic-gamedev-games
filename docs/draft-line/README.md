# DRAFT LINE

![DRAFT LINE screenshot](screenshot.gif)

DRAFT LINE is a 1985-style pseudo-3D arcade racer about using the cars ahead of you as an advantage. Tuck into a rival's slipstream, hold the tow long enough to charge the gauge, then release a slingshot to surge through the pack.

The course is generated from a random seed for each run and combines curves, hills, traffic, roadside scenery, seven checkpoint gates, and a final finish gate at the coast.

## How to play

Reach all eight gates before the clock reaches zero. The first seven gates advance you to the next leg; the eighth ends the race.

Drive directly behind a rival to enter its draft. The top-edge gauge charges slowly in the shallow tow and much faster when you are close to the rival's bumper. Leaving the tow drains the gauge. Once it is at least 25% full, press an action key to spend the entire charge on a boost. Releasing while in the deep tow produces the stronger slingshot and starts an overtake chain.

Later legs add denser traffic and sharper roads. From leg 2 onward, each leg also contains a specially marked hairpin that cannot be taken flat out; watch for the warning sign and brake before turning. Running onto the shoulder slows the car, and going too far off-road or hitting another car at high relative speed causes a spin. A lighter contact causes a bump, reduces charge, and briefly disrupts steering.

Each leg has its own time allowance. Crossing a checkpoint converts the remaining time into score and replaces the clock with the next leg's allowance; unused time does not carry forward. If the timer expires, the run ends.

## Controls

| Action                    | Keys                         |
| ------------------------- | ---------------------------- |
| Steer                     | Left/Right Arrow or `A`/`D`  |
| Accelerate                | Up Arrow or `W`              |
| Brake                     | Down Arrow or `S`            |
| Release boost / slingshot | `Z`, `X`, `J`, `K`, or Space |
| Start / confirm           | Any action key or Enter      |
| Mute or unmute            | `M`                          |

Releasing the accelerator applies engine braking. The game automatically pauses while the browser tab is hidden or its window is out of focus; release any held keys and press them again after returning.

For high-score initials, use Left/Right or `A`/`D` to select a position, Up/Down or `W`/`S` to change its character, and an action key or Enter to confirm. High scores are stored in the browser's local storage for this site.

## Scoring

- Distance travelled: 1 point per metre.
- Distance in the deep tow: 3 additional points per metre.
- Checkpoint bonus: 100 points for each second remaining on that leg.
- Slingshot pass: 500 points for a rival or 200 points for a traffic car passed during the same slingshot boost.
- Chain bonus: 250 points per link after the first, capped at three links (750 points).
- Finish bonus: 1,000 points for each second remaining at the final gate.

Slingshot pass points are awarded immediately. The chain bonus is banked when the boost ends normally or when you finish; spinning or timing out forfeits that bonus, but not pass points already earned. Ordinary overtakes and passes made during a non-slingshot boost do not award pass points.
