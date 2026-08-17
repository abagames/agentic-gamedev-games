# DRAFT LINE

![DRAFT LINE screenshot](screenshot.gif)

DRAFT LINE is a 1985-style pseudo-3D arcade racer about using the cars ahead of you as an advantage. Tuck into a rival's slipstream, hold the tow long enough to charge the gauge, then fire a slingshot to surge through the pack. Every run generates a fresh course from a random seed: curves, hills, traffic, roadside scenery, seven checkpoint gates and a finish gate at the coast.

## How to play

Reach all eight gates before the clock runs out. Each of the first seven converts your remaining time into score and replaces the clock with the next leg's allowance — surplus time never carries forward.

Drive directly behind a rival to enter its draft. The gauge along the top edge charges slowly in the shallow tow and much faster on the rival's bumper, and drains once you leave the tow entirely. The shallow tow alone only fills the gauge to 80%; the last stretch is earned on the bumper. Press a boost key with at least a quarter charge to spend the whole gauge at once. A full gauge fired from the deep tow becomes a slingshot — a longer, stronger dash that scores passes and starts an overtake chain. Anything less is an ordinary boost.

Later legs bring denser traffic and sharper roads, and from leg 2 onward each leg contains one marked hairpin that cannot be taken flat out — brake when you see the warning sign. The shoulder slows the car; going far off-road or hitting a car at high relative speed causes a spin, while lighter contact bumps you, costing charge and briefly disrupting steering.

## Controls

| Action            | Keys                         |
| ----------------- | ---------------------------- |
| Steer             | Left/Right Arrow or `A`/`D`  |
| Accelerate        | Up Arrow or `W`              |
| Brake             | Down Arrow or `S`            |
| Boost / slingshot | `Z`, `X`, `J`, `K`, or Space |
| Start / confirm   | Any boost key or Enter       |
| Mute or unmute    | `M`                          |

Releasing the accelerator applies engine braking, and the game pauses itself while the browser tab is hidden. The same steering and accelerate keys select and change letters during high-score initials entry; scores are kept in this browser's local storage.

## Scoring

| Source              | Points                                          |
| ------------------- | ----------------------------------------------- |
| Distance            | 1 per metre, plus 3 per metre in the deep tow    |
| Checkpoint          | 100 per second left on that leg                 |
| Slingshot pass      | 500 per rival, 200 per traffic car              |
| Overtake chain      | 250 per link after the first, up to three links |
| Finish              | 1,000 per second left at the final gate         |

Passes only score during a slingshot boost. Chain links are banked when that boost ends normally or you finish; a spin or a timeout forfeits them, but not the pass points already earned.
