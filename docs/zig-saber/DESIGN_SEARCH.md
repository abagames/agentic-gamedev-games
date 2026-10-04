# ZIG SABER — design search record

Brief (user): a one-button side-scrolling shooter with terrain. The button shoots **and** flips the ship's vertical
direction. Basic play: press in front of enemies that come straight from the right, destroy them, collect power-up
items. 1980s arcade feel, visuals and audio. Tags optional — drawn once with `node tools/pick-tags.mjs`: **sword, laser**.

Hard constraints: realtime, one binary input (press), horizontal scroll, terrain, straight-flying enemies, items.
Free: what the shot is, what limits it, what the power-up does, how terrain and enemies interact.
Search budget reduced to 9 roots / 3 mutations because control scheme and genre are fixed by the brief.

Obvious first association (recorded, then forbidden for more than half the roots): zigzag ship with a free stream of
shots — `intercept + collect + independent`.

## Root concepts

| id | one-sentence core | signature (operation / progress / risk / info / skill) | cheap guard |
|---|---|---|---|
| R1 | every press turns and fires a free bullet; kill what is in your row | intercept / collect / independent / perfect / timing | **hard defect**: fast tapping holds a row and fires a stream; state-blind mash dominates |
| R2 | only one projectile may be out: a press while it flies only turns | intercept / collect / opportunity-cost / perfect / timing | survives: a turn you need for the rock can cost you the shot you need next |
| R3 | *sword*: the first 40 px (48 after tuning) of the shot is a blade — kills there score more and cut everything inside it | intercept / chain / danger-enables-reward / perfect / timing+prediction | survives: waiting is the skill; collision is the price |
| R4 | not pressing charges the shot; a long glide fires a big one | commit / collect / reward-consumes-safety / perfect / timing | weak: rock dictates glide length, so charge is given, not chosen |
| R5 | the turn itself is the sword: a vertical swing above/below the ship | intercept / collect / same-action-creates-risk / perfect / dexterity | weak: enemies come along rows, the swing wants columns; fights the brief's "press in front" |
| R6 | shots ricochet off rock | predict / collect / independent / perfect / aiming | weak: ship cannot aim, so bounces are luck |
| R7 | *laser*: capsule = stock of piercing beams, every press spends one | allocate / collect / opportunity-cost / perfect / planning | survives on paper; unknown: rock forces presses, stock may just drain |
| R8 | capsule ladder (speed / double / laser) chosen by when you press | allocate / build-state / opportunity-cost / perfect / planning | weak: the one button is already taken; needs a second input or a mode |
| R9 | shots carve the rock; you dig your own corridor | construct / survive / same-action-creates-risk / perfect / planning | weak: straight shots only dig rows; terrain stops being a constraint |

Duplicate pass: R4 ≈ R2 (both make "not pressing" valuable; R2 does it with less state). R8 is content on top of R7.

## Mutations

| id | parent | operator | rule change | expected behaviour change | new risk |
|---|---|---|---|---|---|
| M1 | R2+R3 | reduction | blade and shot are one energy: a press swings the blade; if it cuts, the energy is home at once; if not, it flies on as the single shot | far shot = safe, slow to re-arm; close cut = dangerous, instantly re-armed, multi-kill | waiting may be too hard to time |
| M2 | R7 | commitment | the laser fires only when the row holds a target (after measurement: with "every press spends one", the human-limited bot got 4 kills from 9 beams — the rock drained the stock) | the stock becomes "do I spend it on this lone drone or keep it for a train / shell" instead of "press less" | less to decide |
| M3 | M1 | topology | a capsule comes from destroying a whole *train* (same-row file of 3; 4 and 5 on later loops) | one swing can take three: the capsule is a timing prize; longer trains need two swings or the laser | trains are walls; unfair if unreadable |

Stop: remaining questions (can a human time the cut; does the single shot feel fair) need play.

Later mutations:

| id | parent | operator | rule change | expected behaviour change | new risk |
|---|---|---|---|---|---|
| M5 | M1 | delay consequence | consecutive cutting swings multiply (×5 max); a far kill or a dry press resets | the safe shot and the careless turn now cost the chain | score inflation; HUD-only state |
| M6 | M2 | cash-out / reduction | laser fires only at 2+ or armour; charges fade after 7 s; a laser-killed train drops nothing | holding the laser as armour is a choice with a clock | fade may feel punitive |
| M7 | M6 | reduction | the laser stops being a weapon: each level lengthens the blade (64/96/128/160 px); levels fade one at a time, a touch costs a level | the power-up can only add to what the blade earns; keeping it means keeping on taking trains | at high levels cutting loses its risk |

(M6's charge and firing rules were replaced by M7 after a hands-on report that the beam stole the cut bonus.)

(M5, M6, compound waves and sealed lanes were added after hands-on approval of the double-speed build.)

## Final slate (unranked)

1. **ZIG SABER = R2 + R3 + M1 + M2 + M3.** Evidence: reasoning trace + bot ladder (below). Risk: timing window too
   tight for people. Question: do players wait for the cut, and does the dry click read as their own doing? Test: this slice.
2. **R4 glide charge.** Risk: rock decides the charge. Test: same terrain, charge instead of blade.
3. **R5 vertical swing.** Risk: orthogonal to straight enemies. Test: paper trace with column formations.
4. **R9 carving.** Risk: terrain no longer constrains. Test: tiny prototype with destructible rows.

`human_review: { checkpoint: pre_investment, status: review_pending, concept_ids: [slate-1] }` — the default
assignment pre-authorises one slice; slate 1 was built.

## Selection

Slate 1: the only candidate where both tags are mechanics rather than skins (sword = the near end of the shot,
laser = the stored exception to its two limits: one target, one projectile) and where the brief's coupling
"shoot = turn" produces a decision on every press.

- **Sensation:** gliding on a diagonal you committed to, holding your fire while a train closes, and pressing at the
  last moment so one swing opens all three and flips you clear of the wreck.
- **Why never pressing loses:** the ship always moves; the rock ends the run in ~4 s (0 points, tested).
- **Why mashing loses:** tapping holds a row, but only one projectile exists, so most taps are dry (57–73 % in the
  ladder), nothing off that row is touched, and the rock arrives where the row closes (dies in zone 1, ≤ 2 300 points).
- **Why "fire at anything in my row at once" loses:** it never waits for the blade, so trains (walls of 3+) are not
  opened and shells are not opened at all; the tested bot dies on the first trains.
- **Why "fly the rock, ignore enemies" loses:** enemies are placed along the open rows the rock leaves.
- **Progress event:** an enemy destroyed (100 far / 300 cut, doubling per extra enemy in one swing or beam), a gem
  flown through, a capsule taken, a zone entered.
- **Escalation:** each loop repeats the same rock with faster enemies, more waves, longer trains, aimed drones in
  volleys and more rushers. The decision stays the same and stays readable because every enemy still flies a straight row.

## Stress test (stress-testing-game-concepts, on the built slice)

Figures below were taken on the first build (row-exact shot, original speed); `README.md` has the current ladder (same ordering).

| claim | policy / trace | verdict |
|---|---|---|
| idle cannot progress | `idle`: 3 ships on rock in 14 s, 0 points | survives |
| mash is not dominant | `mash` every 6 / 12 / 30 ticks: all die in zone 1, best 2 000 vs human-limited 32 000 | survives |
| always-safe (rock only) is not viable | `survivor`: dies to trains in zone 1, 0 points | survives |
| always-immediate-reward is not dominant | `shooter`: dies in zone 1, 600 points | survives (weak instrument: the bot does not dodge) |
| the cut is chosen, not forced | human-limited: 22 far / 22 cut / 6 multi; precise: 44 far / 75 cut / 34 multi over 3 loops | survives: both ways of killing stay in use at both skill levels |
| the laser is a decision | after M2: human-limited 22 kills from 15 beams (was 4 from 9) | survives; whether players *save* it is unknown |
| a human can time the cut | hands-on report on the first build: a three-ship train was impossible to take | **failed**: people cannot line up a row exactly. Mutation M4 (topology): the shot became a band on the heading side, entries are announced, laser stock is armour; speed and enemy rate doubled at the user's request. Unconfirmed by hand on the new build |
| difficulty rises for strong play | precise planner (4-tick presses, perfect timing): 0 deaths through loop 7; expert human-limited: 0.5 → 2 → 4 deaths per loop | weak: escalation is validated only on human-limited profiles |
