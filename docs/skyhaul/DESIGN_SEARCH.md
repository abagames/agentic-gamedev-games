# SKYHAUL — design search record

Brief: 1980s retro arcade game (fixed screen, browser). Concept left open → tags drawn with
`node tools/pick-tags.mjs`: **attach**, **role reversal** (first draw, adopted).

Workflow: `exploring-game-design-space` (root generation → guards → duplicate collapse → mutation → slate),
then `stress-testing-game-concepts` on the selected concept. Status of human review: `review_pending`
(default assignment; non-blocking per AGENTS.md).

## Obvious first concept (recorded, then forbidden for half the roots)

Galaga reversal: you are the boss alien, tractor-beam the player ship. Tuple:
`intercept + capture(collect) + adversarial`.

## Root concepts (normalized)

| id | one-sentence core | primary op | progress | risk coupling | topology | skill channel | status |
|---|---|---|---|---|---|---|---|
| R01 | Boss alien dives and tractor-captures an AI fighter that shoots back | intercept | collect | adversarial | continuous | timing | survives (obvious) |
| R02 | You are the Centipede head; eaten mushrooms attach as body segments; AI gunner splits you | route | race (reach bottom) | reward-consumes-safety (long body = target) | grid | planning | survives |
| R03 | You are the Asteroid; AI ship shoots you into fragments you must re-merge | combine | survive/territory | adversarial | continuous | prioritization | weak: multi-body control unclear |
| R04 | Defender reversal: you are the Lander; abducted humans hang below you as a swinging chain; AI Defender hunts with horizontal lasers that cut the chain | route + attach | deliver (chain² score) | reward-consumes-safety (long chain = slower, spans more laser rows) | continuous + rope | geometry/prediction | survives |
| R05 | You command an invader formation; choose when invaders detach to dive at a dodging AI cannon, returners re-attach | commit/predict | exhaust-opponent | opportunity-cost (formation gaps) | slots + continuous | prediction | survives |
| R06 | Frogger reversal: you place cars that attach into trains to block AI frogs | construct | block/deny | delayed-debt | lanes | planning | weak: player passive between placements |
| R07 | Pac-Man reversal: ghost that latches onto walls to reshape maze vs AI Pac | construct | territory | adversarial | grid | planning | duplicate-ish of R06 (construct/deny) |
| R08 | Breakout reversal: you are the ball that sticks (attaches) to bricks and chooses launch angle vs AI paddle | aim/commit | destroy | same-action-creates-risk | continuous | aiming | survives |
| R09 | Parasite hops between AI-driven hosts; each host moves differently; turret AI shoots current host | route/commit | survive/convert | opportunity-cost | graph of hosts | timing | survives |

Guards: idle loses in all survivors (every AI opponent hunts). R06/R07 collapsed as one "construct-to-deny"
neighborhood; R06 kept as representative but `weak` (agency between placements unknown).
R03 marked weak: controlling several fragments with one input set is undefined.

## Mutations

- **M04a (R04, hazard transformation):** falling (cut) humans drift down slowly and can be re-attached mid-air
  by the chain tip; the Defender, true to its role, diverts to rescue falling humans instead of shooting.
  Expected change: a cut is no longer pure loss — it is both a recatch opportunity and a distraction window.
- **M04b (R04, reduction):** no grab button. The chain's lowest body is the hook: whatever it touches attaches.
  Expected change: chain length becomes reach — a long chain can scoop from a safe altitude, and a low sweep
  along the ground snowballs (each new body becomes the new hook). One input vocabulary (8-way move).
- **M02a (R02, topology):** body segments shot off become mushrooms — close neighbor of Centipede; not pursued.

## Slate

| id | why it stays | main risk | next question | smallest test |
|---|---|---|---|---|
| R04+M04a+M04b "SKYHAUL" | Only concept where the attached thing is simultaneously score, reach, and vulnerable surface | rope physics may feel mushy or the Defender may feel arbitrary | does the grab-more vs haul-now decision flip with Defender state? | one-screen slice with one Defender AI and bots |
| R05 formation commander | indirect control / prediction neighborhood | agency hard to feel | can players predict AI dodge? | discrete sim |
| R08 sticky ball | aiming neighborhood | reduces to angle optimization | does attach-point choice matter? | paper trace |
| R02 centipede head | grid planning neighborhood | too close to source | does body length trade-off create decisions? | grid sim |

Selected: **SKYHAUL** — it resolves the most interesting uncertainty (a single attached object acting as
reward, reach, and liability at once) with the smallest slice (one screen, one opponent).

## Stress test (SKYHAUL, verbal, before implementation)

Causal model: move 8-way; chain nodes follow by verlet rope; tip touching a human attaches it; reaching the top
hatch delivers the whole chain (score 100·n²); Defender flies horizontally (wraps), tracks your altitude with lag,
telegraphs and fires horizontal lasers; laser/Defender body hitting a chain node cuts the chain there; hitting the
lander kills you.

| claim | attack | evidence | class |
|---|---|---|---|
| C1 idle loses | idle | Defender tracks altitude and fires; nothing scores without delivery | survives (reasoning) |
| C2 one-at-a-time hauling loses to chaining | always-deliver-immediately | 100·n² makes 5-chain = 2500 vs 5×100; escalation ("Baiter" timer) punishes slow rounds | survives_with_unknowns — depends on laser pressure; test with bots |
| C3 long chain is a liability | always-hoard | chain spans more rows, lander slower, so lasers from a Defender below cut it | unknown until simulated |
| C4 key decision flips | two states: (a) Defender far & facing away, chain 3 → grab more; (b) Defender rising under you, chain 5 → haul now / go high | constructed by reasoning | survives (reasoning) |
| C5 top-hatch camping | always-safe: sit at top | Defender tracks altitude to the top; top row is not safe | survives (reasoning), verify in sim |
| C6 hazard related to core | — | laser cuts the chain (core object); Defender rescues cut humans | survives |

Next discriminators: bot ladder (greedy-hauler, hoarder, human-limited state reader) comparing score and survival.

## Tuning log (structural, in order)

1. **The telegraph now commits.** The Defender used to re-aim during its nose flash, so the tell carried no information. It now holds its row while telegraphing.
2. **Commit on close approach.** A Defender that tracked the lander's altitude to point-blank range was a guided missile, and rams dominated deaths. Inside 120 px it now locks a row.
3. **Lock the current row, not a target row.** Locking a target row made it dive diagonally through the lander and fire from rows it was not marked on. It now locks the row it is already flying, so a committed pass is always a straight line (verified by `core.test` "committed pass").
4. **Commit only at full speed.** After (3) it turned around beside the lander and locked misaligned rows forever, so idle survived 210 s. Now it lines up again while swinging round. Idle dies in 36 s.
5. **No point-blank lock, and calm after a rescue.** The switch from rescue to hunt right beside the lander produced unreadable instant rams.
6. **Softer round 1, steeper ramp.** Speed 74, climb 32, fire cooldown 2.0 s in round 1, ramping +8%/+12%/+15% per round.

Bot-model corrections, made after sanity checks showed deaths caused by the bot's own model: laser rows added to its threat model; ramming redefined as closing and roughly level; a ceiling/ground escape bug fixed; walls with hysteresis so it does not re-enter visible rows; row noise lowered from 5 px to 2 px; committed dodges in the human-limited mode only.

Play-feel pass: longer exhaust on a committed pass plus edge ticks; a dotted sight line during the telegraph; a white flash on each attached or cut body; grab pitch rising with chain length; alternating reel popups; a big arpeggio plus flash only for 5+ hauls; shake only on death; the n² payout shown at the hatch; READY on respawn.

# Full-game expansion (steps 2–4)

## Step 2: one enemy and one human type

- **Bomber / mines (kept).** The Bomber flies across at a new altitude on each pass and lays still
  mines. The ladder (20 seeds) showed the oracle's best haul size dropping from 6 to 2–4 under
  mines. Blind haulers die to mines and the hull. It opposes the Heavy by design.
- **Runner (removed).** Tried in four forms:
  1. It bolts from a low lander.
  2. It ducks and can't be grabbed. This created a soft-lock when only runners remained.
  3. It looks only the way it faces, and approaching from behind works.
  4. As (3), and a sighting fires a flare that calls the Defender.

  In every version, a stealth-aware oracle scored at or below a naive one: going around cost more
  time than being spotted. The version that avoided sight lines best scored 8k, vs. 17k for the
  naive bot. The mechanic did not reward the skill it was meant to. It was removed under the
  "remove a weak secondary feature" rule.
- **Heavy (kept).** Weight 2 in the W² payout, twice the drag, a longer link, a fast fall. This
  is skill-dependent. The oracle does best taking Heavies (31k vs. 28–29k when delaying or
  avoiding them). The human-limited bot does best avoiding them (9.9k vs. 7.6k delaying, 6.9k
  taking).

## Step 3: terrain, shutter, planets (structural fixes found by validation)

1. **Terrain lifted the lander into the Defender's row.** Walls are now solid sideways; gentle
   slopes (under 1.5 px per px) still lift. CINDER deaths fell from 55 to 16 (mesas alone:
   21 → 2).
2. **The Defender was shoved up walls, causing unreadable fast rams** (a post-rescue case). Walls
   are solid for it too: it stops and turns, and it climbs gentle rises.
3. **Committed passes were bent by terrain.** It now reads terrain ahead, commits only to a row
   clear up to the lander, commits only when lined up, and aborts a pass rather than bend it.
4. **Safe pockets** (an idle lander survived 90 s in narrow valleys, 10/10). Causes, fixed in
   order:
   - off-screen terrain lookup (the Defender bounced forever at a high screen edge);
   - a cut/re-grab loop on the ground (the Defender kept shooting a grounded chain while the
     body re-attached every frame; now a 0.35 s re-grab delay, and a grounded chain makes it aim
     at the lander);
   - geometry: narrow V-notches can't be entered by a wide hull. Terrain was reshaped (broad
     swells, two mesas with wide gaps, one wide canyon), and the lander hovers 4 px up.

   Rejected on the way: throttled dives (broke committed-pass speed), no point-blank restraint
   (rams went from 8 to 160), and a reckless HOT pilot (rams 153, pockets unchanged). Result: no
   pocket survives on any planet.
5. **Stranded humans:** spawns go on footholds, and anyone on a cliff face slides to the foot.
6. **Difficulty from systems, not speed.** The Defender scales by planet rank and tour instead of
   by round. Captives are steady within a tour. The Bomber is gentler on CINDER than on VOID.

## Step 4: arcade layer (`arcadifying-mini-games`)

- **Rounds:** data table `PLANETS` in `core.js`, 2 rounds per planet, plus a bonus stage as the
  breather after each planet.
- **Phase machine:** the core has `ready → play → clear → ready` and
  `play → dying → ready | over`, with the bonus stage using the same phases. The app has
  `title → demo → table → title` and `play → over → entry? → table → title`. Confirm input has a
  20-frame grace in every mode.
- **Score economy:** W² hauls, round clear 1000 × tour, PERFECT bonus 5000 × tour. Extend at 10k
  (about 2× a decent planet-1 run), then every 30k.
- **Rankings:** top 5, board-style initials entry. Factory table merged at read time, never
  stored. Ties rank the new entry higher. Non-qualifying scores skip entry and go straight to the
  table; there is no replay, so skipping can't desynchronize anything.
- **Attract:** a scripted autopilot (the reader bot) drives a separate game object and never
  touches storage.

## Change requested after step 4: the Bomber from OCHRE

The Bomber now appears from OCHRE (rounds 3–4) at its gentlest (at most 3 mines, one per 2.8 s),
alongside the Heavies. It ramps to 4 mines / 2.4 s on CINDER and 5 / 2.0 s on VOID. Re-run
afterwards: 30 core tests and 13 browser checks pass; no pocket survives on any planet. Oracle
(hauling at 4) deaths per minute: VERDA 0.15, OCHRE 0.13, CINDER 0.34, VOID 0.55. The curve
stays monotonic after VERDA, and OCHRE barely changed.

## Change requested: livelier early rounds (Rescuer from round 2, softer round 1)

The request: the early game felt dull. Add a weak Rescuer from round 2, and soften round 1's
Defender if needed.

- **Round 1:** the Defender fires every 3.2 s instead of 2.0 s (`firstRoundFireMul` 1.6), and
  there is no Rescuer. Human-limited bot on round 1: deaths per minute 2.74 → 2.44, shots per
  minute 13.6 → 10.6, mean clear time 54 s → 44 s. Oracle: 0.17 → 0.12.
- **Rescuer:** it attacks the chain from a new angle (proximity to the chain's lower end, not
  rows or areas), can't kill, and is countered with the core verb (hook a carried captive back).
  It is the "weak Rescuer" option from the enemy-variety shortlist. Engagement on round 2, weak
  setting (42 px/s, 5 s rest, chains of 2+), 20 seeds:

| policy | hunting | snatches/min | won back | score/min | deaths/min |
|---|---|---|---|---|---|
| oracle, no Rescuer | – | – | – | 5922 | 0.00 |
| oracle, weak Rescuer | 31% | 0.88 | 93% | 5218 | 0.06 |
| human-limited, no Rescuer | – | – | – | 4211 | 3.08 |
| human-limited, weak Rescuer | 30% | 0.70 | 38% | 4614 | 2.33 |

  - **Why it helps:** it is in play about a third of the time, adds almost no lethal pressure,
    and the steal-back rate separates skill levels (93% vs 38%).
  - **Rejected:** more aggressive variants (3 s rest, chains of 1+, faster) raised steal-back
    work for the human-limited bot without adding presence (still 34%), so the weak setting
    was kept as requested.
- **After the change:** 34 core tests and 13 browser checks pass; no pocket survives on any
  planet; campaign deaths per minute for the oracle (hauling at 4) are 0.17 / 0.20 / 0.52 /
  0.37.
- **Not measured:** "less dull" is a feel judgment. The bots can show presence and interaction
  rate, not boredom, so this needs a hands-on check.

## Change requested: ground turrets + per-round personalities (incl. a Defender-only ACE round)

**Structure.** The planet table (terrain, colors) is now separate from an 8-entry `STAGES` table.
Each round mixes existing pieces, with a stage name: plain, plain, plain, MINES, GUNS, ACE,
CROSSFIRE, SIEGE. There are 7 distinct mixes in the 8 rounds (tested for ≥ 6). ACE is a spike
built only from Defender multipliers. Bonus stages are the breathers.

**Turret.** Vertical fire, telegraphed 0.6 s. The beam stops at the lowest thing in its column,
so a hanging chain shields the lander at the cost of the captives from the hit point down (a
straight chain loses only its lowest captive). This makes chain length flip value: a liability
against level Defender shots, a shield against turrets.
- First hit-test: thin links and body cores against a wide hull let beams slip past the chain.
  Shielding was then *worse* than dodging for the oracle (13 turret deaths vs 0).
- Fix: consistent widths (beam ±2 px; bodies ±3, Heavies ±4, links ±1.5; the hull's core ±4).
  Afterwards shield and dodge are roughly even for the oracle (GUNS 4301 vs 3945 points per
  minute; CROSSFIRE 2712 vs 2993), so which to use depends on the situation.

**Tuning.**
- CROSSFIRE's Bomber reduced to 3 mines / 2.8 s (clears: oracle 16 → 18/20, human-limited
  3 → 11/20).
- SIEGE was a grind (median clear 128 s). Ablation: the Rescuer, turrets, the Bomber and Heavies
  each added 15–35 s. The shutter and Heavies were removed from SIEGE, bringing the median to
  75 s.

**Per-round profile** (`tests/stages.sim.cjs`, 20 seeds, oracle hauling at 4):

| round | deaths/min | median clear |
|---|---|---|
| 1 | 0.09 | 34 s |
| 2 | 0.15 | 37 s |
| 3 | 0.00 | 41 s |
| 4 (MINES) | 0.16 | 59 s |
| 5 (GUNS) | 0.21 | 56 s |
| 6 (ACE) | 0.36 | 58 s |
| 7 (CROSSFIRE) | 0.84 | 77 s |
| 8 (SIEGE) | 0.49 | 75 s |

**Regression.** 37 core tests and 13 browser checks pass; no pocket survives; every camping
strategy dies within about 30 s with 0 points.

## Change requested: HOT as a per-round par (option A) + visible countdown

**Problem.** HOT used to fire at a fixed 42 s. In rounds 4–8 even the oracle reached it in
70–100% of rounds (29–48% of play time), so it acted as a blanket ×1.3 difficulty on the late
rounds, not a penalty for slow play. It also had become redundant as an anti-camping device:
terrain reshaping already closed the pockets.

**Change.** Each stage now sets its own HOT time, about 1.5× the oracle's median clear time
(50 / 55 / 60 / 85 / 85 / 85 / 115 / 115 s, +10 s per tour). The HUD bar under HI shows the
time left: green, yellow for the last 10 s, blinking red for the last 5 s with a tick per second.
Then it shows "HOT".

**How often HOT is reached** (rounds that reached it / share of play time spent HOT; 20 seeds
per round):

| policy | r1 | r2 | r3 | r4 | r5 | r6 | r7 | r8 |
|---|---|---|---|---|---|---|---|---|
| oracle | 10/1 | 0/0 | 5/0 | 0/0 | 5/0 | 10/11 | 5/2 | 20/4 |
| human-limited | 15/6 | 65/28 | 30/16 | 40/14 | 35/14 | 15/1 | 30/13 | 30/9 |

**Effect.** The human-limited bot's deaths per minute in rounds 5–8 fell from 4.1–4.9 to 3.6–3.8,
and its clears rose, because the late rounds no longer carry a hidden ×1.3. The oracle's
per-round profile is unchanged within noise.

**Checks.** 38 core tests (including the HOT schedule and the 5-4-3-2-1 ticks) and 13 browser
checks pass; no pocket survives. The gauge's green, yellow and HOT states were checked in
screenshots.

## Legibility gate, feel pass, cleanup

- **Legibility gate:** `gating-intent-legibility`, 5 runs and 60 isolated graders; the full record
  is in `LEGIBILITY.md`.
  - From stills, the role reversal is read backwards (the lander taken for the enemy abductor).
  - Once the moved craft is known, the grab is legible; the destination (hatch) stays weak.
  - Kept: the "YOU ARE THE LANDER" title line; the "◂YOU" spawn marker; the 1UP HUD with green
    lives and "+payout"; the red Defender; the amber fuse with a Defender icon; the doorway hatch
    that glows while carrying; the home arrow; an attract demo that delivers early.
  - Reverted after they backfired: lander-sprite lives at top right (read as an enemy wave), the
    payout beside the lander (read as the enemy's bounty), a green mothership (read as the
    player), and hatch chevrons (read as an enemy formation).
- **Feel pass:**
  - ACE livery: deeper red with a gold stripe.
  - Shield hit: a metallic clink plus a white spark burst.
  - Steal-back: a lander flash.
  - Audio: the lock blip removed and the hauling hum quieter, to clear the mix for the telegraph
    and shots.
- **Cleanup:** unused config keys, palette entries and a helper removed. Tests after cleanup:
  38 core, 13 browser; pocket, exploit, stage and campaign sims re-run.

## Change requested: time bonus + an 8-round campaign with an ending

- **Time bonus:** whole seconds left on the HOT fuse × 50 × tour at each round clear, and none
  once HOT. Ladder (20 seeds, 300 s):
  - Oracle hauling 2/4/6: 25.8k/31.1k/34.3k before, 31.0k/35.9k/37.9k after. The ordering holds
    and the gap narrows, so "rush vs one more" is a real trade-off.
  - Human-limited: hauls of 4 stay best.
  - The time bonus is 9–17% of a run's score.
- **Campaign:** 8 rounds, option A (end there). Reasons: all eight rounds are distinct mixes,
  SIEGE is built as the climax, and a strong run takes about 10 minutes, while a second tour adds
  no new content.
  - Ending: after round 8's bonus stage comes "MISSION COMPLETE", then 5000 per ship left, then
    initials.
  - Later tours remain behind `opts.endless` for simulations.
- **Tests:** 40 core (time bonus, mission complete, and that there is no round 9) and 14 browser
  (round 8 → bonus → ending → entry).

- **Follow-up request:** no bonus stage after round 8. SIEGE now goes straight to MISSION COMPLETE (tested: no bonusStart, no round 9).

## Feel pass A (requested) + louder mix

- **Render-only feel:** lean with weight-dependent settling, exhaust puffs, and chain tension
  colouring.
- **Near miss:** a core `graze` event, feedback only.
  - First tuning gave 17/min for the oracle, mostly hull skims, which is noise. The hull band was
    narrowed by 4 px, giving 7.9/min (oracle) and 5.0/min (human-limited).
- **Audio:** master level 0.28 → 0.5 with a DynamicsCompressor limiter.
- **Tests:** 41 core (near miss: one per shot, never on a hit) and 14 browser; pockets still closed.

## Feel pass B + C (requested)

- **Success feel:** grab yank (render), mothership windows lit per body reeled in, whole-hull glow
  for hauls of weight 5+, HUD score roll-up.
- **Cut recoil (the only simulation change):** the remaining chain gets an upward velocity after
  a cut.
  - Stage profile afterwards (oracle deaths/min, rounds 1–8): 0.09 / 0.14 / 0.14 / 0.40 / 0.47 /
    0.45 / 0.61 / 0.73. That is smoother and monotonic; before it was 0.09 / 0.15 / 0.00 / 0.16 /
    0.27 / 0.35 / 0.94 / 0.49.
  - Human-limited clears are about the same. Pockets remain closed.
- **Atmosphere:** stereo pan by event x, the Defender's victory roll plus stars while the lander
  dies, and a red screen-edge pulse on going HOT.
- **Tests:** 42 core (cut recoil) and 14 browser.

## Harder finish (requested after "relatively easy" hands-on play)

The user found the game relatively easy, so the bots under-rate a skilled player. From now on,
balance is referenced to the oracle.
- Round 7 CROSSFIRE gains a tighter hatch shutter (2.8 s open / 1.8 s shut).
- Round 8 SIEGE gets the ACE pilot (×1.35 speed, ×1.4 climb, ×0.7 fire interval) and its livery.
- Master volume 0.5 → 0.8.
- Oracle results: round 6/7/8 deaths per minute 0.45 / 0.60 / 1.00, clears 19 / 18 / 14 of 20.
  Full campaign: mission complete 16/20, 9.8 min, about 2.8 ships left.
