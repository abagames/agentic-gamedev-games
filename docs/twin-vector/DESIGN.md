# TWIN VECTOR — concept search and implementation decision

## Brief and coverage

1980s arcade visual and tactile language; no modern rendering. Browser, keyboard,
roughly one minute, five lateral lanes and one action button in addition to fire.
First and only tag draw: `pseudo-3D`, `two layers` (tools/pick-tags.mjs).
Perspective defines aiming lanes; two planes define projectile routing.
No hardware emulation claim. The user's explicit random-tag request superseded
the earlier untagged RIVET RAID proposal; no files for that proposal were made.

First obvious tuple: direct-avatar / destroy / independent incoming danger.
Coverage spans interception, routing, construction, delivery, territory and timing;
slots 10–18 exclude that tuple. All roots are original verbal hypotheses, not playtest evidence.

## Normalized root records

Common: lineage=root, time=realtime, information=perfect with telegraphed motion.
Columns encode goal/progress; action and recurring decision; state read; automatic
pressure/risk; expert distinction and learning change; signature; guard evidence;
unknown/status. Each sentence is the one-sentence core. No fun scores.

| ID | Core / goal / conversion | Actions / decision / state read | Dynamics / risk | Skill / learning | Signature (control, topology, operation, failure) | Cheap guard / uncertainty / status |
|---|---|---|---|---|---|---|
| R01 | Shoot invaders on two planes; clear both | Move/fire/swap; prioritize depth and lane | Advance and return fire; neglected layer breaches | Predict layer workload | avatar, lanes, destroy, breach | Idle cannot clear; layers may coexist without interacting; weak |
| R02 | Ram traffic across two decks to collide pairs | Move/ram; matching depths | Traffic advances; unmatched ram moves danger | Pair timing | avatar, lanes, combine, collision | Odd traffic count may strand target; spawn parity unknown; weak |
| R03 | Catch cargo below falling holes; deliver quota | Move/lift; pickup vs return | Gravity; lifting abandons lower deck | Read intercept time | avatar, space, intercept, depletion | Waiting loses falling cargo; catch windows unknown; survives |
| R04 | Flip rail junctions to route trains between levels | Toggle junction; choose conflict to resolve | Fixed-speed trains; routing commits future path | Look ahead to crossings | routing, graph, route, collision | Constant toggle loses endpoint; graph size unknown; survives |
| R05 | Drill upper blocks onto enemies below | Move/drill; choose collapse point | Enemies wander; drilling removes footing | Align support and enemy | avatar, grid, transform, collision | Supports create distinct safe/dangerous choices; path traps unknown; survives |
| R06 | Bounce a projectile between two targets planes | Aim/flip; intercept angle | Ball reflects; wrong deck misses return | Read future bounce | avatar, space, predict, depletion | Auto flip cannot cover two return timings; geometry unknown; survives |
| R07 | Run two parallel conveyors with shared brake | Brake/swap; which belt to hold | Conveyor advance; shared capacity | Time crossing jobs | allocation, queues, allocate, overflow | Brake forever overflows other belt; readability unknown; survives |
| R08 | Pilot a shadow below a flying craft to dock | Move/altitude; match platform and shadow | Forward flight; descent commits | Read projected landing | avatar, space, deliver, collision | Idle misses dock; depth cues uncertain; survives |
| R09 | Shoot aliens in front/rear tunnels | Move/fire/swap; choose tunnel | Invaders advance; neglected tunnel breaches | Lane prioritization | avatar, lanes, destroy, breach | Structural duplicate of R01; duplicate |
| R10 | Lay bridges on upper or lower crossing grid | Place/rotate; spend tile where future traffic goes | Traffic consumes bridges; limited tile supply | Plan shared crossings | placement, graph, construct, depletion | Always upper leaves lower route absent; scope risk; survives |
| R11 | Return thrown hooks through two depth planes | Throw/recall/swap; when to return | Hook travel; commitment until return | Time return through clustered targets | avatar, space, intercept, collision | Immediate recall cannot reach enemies; timing unknown; survives |
| R12 | Capture grid cells whose projected twin stays exposed | Move/claim; expand vs defend | Rivals invade counterpart cells | Plan mirrored vulnerability | avatar, grid, territory, depletion | Blind expansion exposes rear; rule teaching uncertain; survives |
| R13 | Exchange top/bottom weights to drive a lift | Swap weights; landing height | Lift responds to imbalance; overshoot | Read momentum | selection, slots, trade, deadline | Alternation loses net movement; tuning window unknown; survives |
| R14 | Assemble columns by catching upper/lower pieces | Move/rotate; choose destination | Falling pieces; overflow | Read pairing vs stack space | placement, stacks, combine, overflow | Hoard fills stack; mechanic too puzzle-like for requested feel is preference not rejection; survives |
| R15 | Push a patrol between levels to open delivery lanes | Move/push; deliver now or divert | Patrol returns; push changes future route | Schedule openings | avatar, graph, route, collision | Repeated push gives no delivery; routing complexity unknown; survives |
| R16 | Exchange front/back shields to deflect aimed volleys | Move/swap; choose return lane | Volleys reflect along chosen track | Aim defense into offense | avatar, lanes, intercept, collision | Fixed shield cannot cover alternating attacks; repeat timing unknown; survives |
| R17 | Raise/lower paired floors to carry ore across gaps | Toggle/move; floor safety vs cargo path | Cargo rolls downhill; toggles remove footing | Sequence transit | mixed, grid, transform, collision | Static floor cannot deliver across gap; physics scope uncertain; survives |
| R18 | Fold two projected paths into matching exits | Rotate/swap; preserve path continuity | Runner auto advances; turn commitment | Read topology ahead | routing, graph, solve, deadlock | Idle eventually wrong exit; learning/readability unknown; survives |

Six first-pass representatives: R01, R03, R04, R05, R11, R16.
No hard rejection without a demonstrated defect. Others remain unevaluated, not inferior.

## Mechanism mutations and final slate

| ID / lineage | Exact causal change | Expected behavior | Evidence and unresolved question | Minimum test |
|---|---|---|---|---|
| R01a / R01, coupling | Plane switch carries all in-flight shots | Fire before deciding final layer; redirect a missed salvo | Verbal trace: a shot in A cannot hit B until switch. Risk: repeated swapping sweeps everything | Two lanes, two decks, projectile intersection probe |
| R03a / R03, reduction | Cargo itself opens lift, no separate lift control | Choose intercept point to determine next deck | Distinct intercept decisions survive; catch readability unknown | One cargo pair and one lift |
| R04a / R04, commitment | Junction locks until train tail clears | Plan crossings before arrival | Repeated toggling no longer equivalent to routing; may force idle waits | Three junctions, two trains |
| R16a / R16, invert coupling | Deflected volley retains depth until player swaps | Use defense to prepare delayed attack | Different incoming geometry changes ideal swap; timing uncertainty | One aimed volley on each deck |

The four hypotheses cover meaningful feasible neighborhoods; remaining uncertainty
needs a running game. Further mutation stopped rather than adding rules.
Selected R01a because its largest uncertainty (whether depth transfer is useful and
readable) fits a tiny two-plane vertical slice. This is an implementation-budget decision,
not a claim it is the most fun. AGENTS.md pre-authorizes one slice: review is nonblocking.
Human preference: 1980s only, random tags. No human play observation is claimed.

## Full game and slice

A gate-defense cabinet game: a courier fighter protects a two-level orbital freight shaft.
The full game would have escalating sectors with authored formations and depth-crossing
carriers. This slice contains three sectors, two enemy behaviors, a three-ship run,
clear bonuses and local best score. No bosses, campaign, upgrades or secondary resources.

Intended sensation: send a short salvo down a narrowing rail, step aside, then snap it
onto the other deck just as it reaches the target.
Destroying an invader causes scoring and removes a live threat. Every wave requires
all invaders to be destroyed. A breach or bolt hit costs a ship; a lost ship never awards
kills or removes remaining invaders. More invaders and telegraphed lane changes increase
pressure in later sectors while retaining five lanes and the same two controls.

Idle never scores. Fixed-lane firing leaves four lanes and another deck unprotected.
Repeated swapping may rescue some hits; evaluate against aimed policies before claiming
any superiority. Success ends after sector three; replay seeks better survival and routing.

## 2026-09-29 spatial shield revision

User observation: transferred-shot color was not noticed; transfer was used to shoot behind shields.
Adopt that reading as the core. Shield surface is body z + 0.30 and blocks both ordinary and
transferred shots. The enemy body is an ordinary collision target behind it. A transfer into
the gap can strike the body; an early transfer hits the shield, a late one misses.
Body advance is multiplied by 0.8 and shot speed is 0.020 per tick (formerly 0.033).
The opening is about a quarter second before collision margins; no claim of human validation.
When a shield has passed the player's firing origin, the exposed body can be shot normally.
Defeat leaves a brief falling shield while the body explodes.
18 rule/audio tests, 21 browser probes, final smoke pass; 12 seeds each across five policies.
Strong: 12 clears, human-limited: 11, fixed sweep: 0. This supersedes prior-model conclusions.

## Extension: formations, dreadnought, recognition

Requested by the user after calibrating the limited policy. Reuse existing core;
no tag reroll. Three sectors remain, with paired/pincer/cross formations in rounds.js,
48 ordinary opportunities and 3 final boss parts. Boss turret kills on A unlock the
shielded core on B; neither an early transfer nor a locked-core gap hit bypasses it.
Enemy body motion, shot speed and three starting ships remain the same.

Considered pacing changes: slower all-enemy movement, extra lives, authored formations
with gaps. Selected formations/gaps, which give attention-limited players a place to
re-read the other field and reposition instead of raising the execution requirements.
The boss is stationary to apply the learned shield timing to a readable final sequence.
Extend rewards were omitted to preserve the calibrated three-ship run and scope.

Phases: title -> ready -> play -> death/clear; final empty field -> bossReady -> play;
final clear -> win. Over/win -> entry if qualifying, otherwise table -> title.
20-frame entry grace, 20-second name timeout, explicit END, 8-second table timeout.
Bonus 500 is paid in five 100-point pulses after a brief pause. One event boundary
continues to drive the existing 11 sounds; no new unrestricted audio layer.

Visual pass: discrete raster carrier hull, paired turret indicators, locked shutters,
exposed core, larger final impact; no UI cards, panels or overlays. Attract policy uses
real engine input and a separate state; cannot enter the persistence path.

Validation uses the same 60 seeds, same frozen perception constants. Added observable
boss flags (closed/static) only; old engine still yields mean 4,185. New run mean 9,460,
37 boss arrivals and 30 wins. Full record: evidence/expansion-balance.json. No claim
that this constitutes human validation of the expanded game.

## Nine-stage campaign

The recurring sensation is to read both fields, fire, and slip the shot into the
space behind a moving shield at the right moment. Nine authored formations build
from paired patrols to mixed escorts, layer pursuit and a final carrier. Bosses
occur on stages 3, 6 and 9; only stage 9 ends the campaign.

New shifters telegraph for 60 ticks before crossing once, guards shield neighboring
lanes, and gunners stop for three shots before advancing again. Shifter warnings
start at depth .12 so crossing can matter before ordinary shots destroy them.
Skilled early interception remains valid. Enemy speed stops increasing after stage 3;
later challenge comes from combinations and attention demands. Existing shield
gaps and slower armor remain. Stages 3 and 6 restore stock to three ships.

The final carrier has turrets in both fields and an exposed core that later changes
layers with advance warning. All visuals retain the raster palette, bitmap text
and direct field presentation. Existing sound programs reinforce the new events.

Frozen human-limited policy, seeds 201–260: mean 15,068, range 3,400–37,200,
2/60 full clears; 7/60 reached stage 9. Strong policy cleared 12/12 with mean
57,700. These are skill-dependent simulation results, not human play-feel evidence.
Nine new mechanic checks and 51 browser checks passed, alongside the existing
rule, audio, arcade and policy checks. See evidence/nine-stage-balance.json.

## Stage-three moving shield boss

Destroy shielded side turrets by transferring into their gaps. The shared central
core spans both layers and blocks even behind-shield hits until the B shutter opens.
One turret permits a 72-tick opening, both permit 120 ticks, in a 240-tick cycle.
Ticks 60–89 warn; 90 starts opening; movement occurs only on tick 30, after a
30-tick direction cue. The hull advances one lane in a bounded 0,+1,0,-1 cycle.
Core-first victory removes remaining turrets without awarding their points.

The first turret depth (.50) exposed a cadence-sensitive failure in the frozen
human policy: no turret kills across eight boss arrivals. Moving the turrets back
to .40 gives more travel time before shield contact, and 6/12 full stage clears
versus the prior stage-three diagnostic's 8/12. Strong 12/12, hold/mash 0/12.
This limited policy does not learn timing or plan future openings; human play
remains the stronger source of difficulty evidence.

## Boss progression: layers, then moving weak point

Stage 6 splits shielded turrets across layers; each destruction opens the opposite
shutter. Both deaths alternate 120-tick openings; one death gives 72 ticks on that
side. Stage 9 adds a single weak point that departs and returns with 60-tick cues.
Opening is at 90; a returning core arrives at 119, leaving a guaranteed overlap.
A shot fired at 97 can intercept arrival; an early body hit while absent is blocked.
The shared shell remains on both decks, while the absent weak point is drawn dim.
No additional HP, projectile speed or hidden bot assistance was introduced.

Considered alternatives: faster fire risks defeating the attention model; extra HP
repeats the same solution; coordinated shutters and layer motion add a distinct
prediction decision using existing controls. Adopt the third, preserving readable
stops and recurring guaranteed windows. Exact human difficulty remains unverified.
See README for current boss-only and whole-campaign measurements and limitations.
