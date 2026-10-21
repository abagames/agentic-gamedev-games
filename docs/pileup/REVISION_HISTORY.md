# PILEUP — revision history

## Intent

Make the collision Rally-X could not let you aim (enemy cars meeting each other) into the thing you aim at:
herd police onto one junction and leave before they meet.

## Slice revisions (before any play session)

Evidence is from `tests/balance.cjs` and `tests/aim.cjs` on seeds 1–6 / 1–8. Details of each mutation are in
`DESIGN_SEARCH.md`.

| # | change | finding that caused it | evidence after |
|---|---|---|---|
| 1 | Shortest-path chasers (root) | — | all bots caught in 4–13 s, 0 crashes |
| 2 | Pursuers target your next junction | crashes unreachable | strong 31–93 s, 2–11 wrecks a run |
| 3 | Denser grid (2×2 blocks, junction every 3 tiles) | strong caught in corner pincers on 4-wide blocks | — |
| 4 | Look-ahead bot fixes: rollout's first choice was overwritten by the continuation policy; depth-2 re-evaluated the first junction | strong bot weaker than flee | strong 31–93 s |
| 5 | Locked goals + roadblocks | person: Rally-X collisions exist but cannot be aimed; aim vs survival-only 6.4 vs 6.3 wrecks/min | 8.2 vs 7.7 wrecks/min, pileups ≤ 2: still incidental |
| 6 | Lock onto your straight road's end; locked cars commit even into wrecks | locks scattered | median score 8,500 vs 3,400, best pileup 5 |
| 7 | 4 police at start, +1 / 10 s to 10; arrival gap 150 → 40 ticks; speed 18 → 28 (+1 / 10 s) | strong bot went past 600 s on one seed; one patrol car on the field at 30 s | strong 10–388 s |
| 8 | Human-limited bot decides early enough for its delayed press to land before the junction | bot pressed after passing the junction it meant | human median 10 s → 55 s |

## Play session s1 — build `01-first-playable` (comments only, 2026-10-20)

No review zip was sent, so there are no replays and no placement among the policies.

- Finding: 「人間が敵を誘導している感じが無い。勝手に目標地点に突っ込んで衝突している」. The player does not feel they
  lure the police; the police drive into their target junction and crash on their own. Cause: the lock target was
  chosen by the rules (the end of your straight road), so the link from your action to the crash was invisible. The
  roadblock rule also made a second car ramming the first automatic.
- Done (core decision, slice limits): police now follow your tyre tracks turn for turn, and the tracks are drawn
  red where a car still has to drive them. Locks, junction markers and roadblocks are removed. Crash attribution
  after the change: 74 of 75 first impacts involve a car on the tracks (strong and human-limited, 6 seeds each).
  Snapshotted as `02-tracks`.
- Held for finishing: nothing proposed.

## Play session s2 — build `tracks` (zip `pileup-tracks-20261020-0004.zip`, 4 runs, no comments yet)

Stored at `tmp/playtests/pileup/s2/`. Played from the working copy, so the zip names build `tracks` and
`tools/replay.mjs` refused it on the label. The working copy's files were identical to `02-tracks`. All 4 runs were
replayed on `02-tracks` with every recorded state hash matching (own script; `replay-stats.mjs` refuses for the
same reason, so it was not run).

| run | seed | time | score | wrecks (cars) | longest line on tracks | caught by |
|---|---|---|---|---|---|---|
| 1 | 8516 | 32 s | 1,500 | 3,3,2 | 5 | a hunting car, side-on |
| 2 | 75847 | 36 s | 1,600 | 4,2,2 | 3 | a car on the tracks, side-on |
| 3 | 726901 | 43 s | 3,600 | 3,5,5 | 3 | a car on the tracks, side-on |
| 4 | 499830 | 66 s | 3,700 | 2,4,2,5,3 | 6 | a car on the tracks, head-on |

- All 14 first impacts involved a car on the tracks (8 with both cars on them).
- 4.3 reversals a minute.
- Where the person sits on the same seeds: human-limited bot 15–78 s, scores 0–7,800; strong 65–87 s, scores
  3,600–8,700. The person is level with the human-limited bot on time and below the strong bot on score.
- **Finding:** on these seeds the flee policy, which never folds its route on purpose, scored 0, 1,500, 5,800 and
  2,100, with pileups of up to 10 cars. On seeds 1–6 it had scored almost nothing. Running from police through
  this maze makes loops by itself, so score does not yet separate deliberate luring from flight.
- Person's comment: 「誘導している手ごたえはあり問題ない。輪は意図的に作った」. Luring is felt; the loops in these
  runs were made on purpose. The s1 finding (crashes felt unprovoked) is resolved on `tracks`. The flee-policy
  result is kept as a note, not acted on: the play session outranks it, and the person's loops were deliberate.

Tried and not adopted: crashes-per-minute as the aim measure. It is capped by the arrival rate once the field is
full, so it reads about equal whatever the policy does. Score and pileup size are used instead.

## Never measured

Recorded human play (s1 was comments only), touch input, audio levels, whether the markers are read at speed by someone who has not seen the
rules.

## Finishing (stage 2, requested 2026-10-20: 「完成版に進めよ」)

Intent statement: *drawing a loop with a line of police on your tail and cutting across its start just ahead of
them.* Run structure from the concept: districts with an exit, lives and extends, a defined end.

### Structure

- **Farming exploit (fixed).** A wreck's fire was renewed by every car that joined it. One wreck could then burn
  forever on a busy track: the strong bot fed it 129 cars and scored 936,400 in 20 minutes. Now the fire burns 9 s
  from the first crash.
- **Exit and quota (added, from the concept).** At first there was one exit, at the top middle. The human-limited
  bot opened it on most runs but died before reaching it. Exits in the middle of all four edges cut the trip
  roughly in half.
- **First arrival (fixed).** The first patrol car of every life arrived at the top-left corner, beside the route to
  the top exit. It now arrives at the corner farthest from you, as later arrivals already did.
- **Early losses (examined, not changed).** About 10% of bot lives end within 8 s, mostly in a corner pocket.
  Traces show both cars visible for 2 s or more and the bot dithering, so these were judged avoidable. A tried
  change (no arrival while you are within 6 tiles by road) changed no result and was reverted.
- **Bot defects found on the way (fixed in `bots.js`, not in the game):**
  - death in the first simulated step was not seen;
  - bots turned back one tile short of the exit;
  - the exit-seeking continuation ignored patrol cars more than 2 tiles away (now 4).

### Content (one element at a time, on the district that introduces it; strong bot, one life, 20 seeds)

| Element | Aware | Blind to it | Element off | Outcome |
|---|---|---|---|---|
| one-way streets | 9/20 clear, 3,540 | 8/20, 3,470 | 7/20, 4,145 | **removed**: knowing it does not change the best action; no promising rework |
| drawbridges (cars on a rising bridge fall in) | 12/20, 4,965 | 14/20, 5,470 | 16/20, 6,160 | **removed** after a second attempt (river cars score double: aware 13/20, blind 14/20): it only added hazard |
| heavy van, first version (slower, counted twice for the quota) | 17/20, 7,170 | 14/20, 5,890 | 14/20, 4,935 | changed: it made the district easier |
| heavy van, same speed, counts once for the quota | 16/20, 7,135 | 11/20, 6,050 | 14/20, 4,935 | **kept**: knowing it pays (+5 clears), ignoring it costs |
| dog unit | 8/20, 5,270 | 5/20, 3,925 | 9/20, 5,225 | **kept**: knowing it pays (+3 clears), adds pressure |

Districts 4 and 5 bring new mazes only, because the named candidates were exhausted. The district that held one-way
streets and the one that held bridges now carry layouts only.

### Difficulty and progression

The person's session s2 (build `02-tracks`) sits between the policies:

| | time | score |
|---|---|---|
| human-limited (on the person's seeds plus 8 more) | 47 s median | 1,000 |
| the person | ~40 s | ~2,600 |
| skilled (react 4, horizon 120, slip 0.03) | 68 s | 4,700 |

The skilled rung was added as the upper bracket; no fit was attempted, because the bracket was close enough for the
decision. Difficulty is set so the end is reachable by the upper bracket. The human-limited bot reaches districts
1–4, so the loss is spread over the run rather than hitting a wall.

| Tried | Result |
|---|---|
| quotas 8–12, then 6–10 | human-limited bot never left district 2 |
| police speed-up every 15 s instead of 10 s | worse for the human-limited bot: a slow line folds less; reverted |
| quotas 5–9, extra car at 5,000 then every 15,000, an extra car per district cleared | human-limited reaches districts 1–4; skilled wins 5/12; strong wins 8/8 (30,000–55,000, pressed by score) |

### Presentation

- Visuals per `VISUAL_DESIGN.md`. Two outsider readings by agents shown only frames:
  - First reading: red versus grey tracks, the navy van and a diagonal track line were unclear.
  - Changes: the live stretch now carries dashes running toward you; segments between tiles that are not next to
    each other are not drawn; each district's first READY names what it brings.
  - Second reading: the controlled car, goal, exits, quota bar, lives and pileup counts were read correctly. Those
    frames had no car on the tracks, so the red meaning is carried by the first READY line and the demo.
- Feel per `FEEL_TUNING.md`. Caught and wrecked now look different (cold flash versus fire burst).
- Sound:
  - every program is within the budget (`tests/audio.cjs`; SE ≤ 0.6 s, jingle ≤ 1.6 s, ≤ 24 steps);
  - levels are measured through the chain in `tests/browser.cjs`. The first pass had tonal effects at 0.11–0.20
    peak; they were raised to 0.26–0.41, with crashes at 0.71–0.76, death at 0.85, and a busy moment at 0.83;
  - no music, reason in the README.
- Title with high-score table, attract demo (recorded strong run, replayed through the rules, silent), initials entry.
- Presentation left the rules alone: `ladder.mjs --compare` shows all 40 runs identical to
  `reports/before-presentation.json`. The page's state hash equals the Node rules' after the same inputs
  (`tests/shot.cjs`).

### Scripts removed

`tests/balance.cjs`, `tests/aim.cjs` and `tests/telemetry.cjs` measured the endless single-life slice. Their
figures above remain as history. `campaign.cjs`, `district.cjs` and `deaths.cjs` replace them for the finished
rules.

### Never measured

- Human play of the finished campaign.
- Touch on a device.
- Audio heard by a person.

## Play session s3: build `04-finished` (zip `pileup-finished-20261020-0318.zip`, 1 run)

Stored at `tmp/playtests/pileup/s3/`.

**Replay.** The page was opened from a path outside the snapshot folder, so the zip names build `finished` and
`tools/replay.mjs` refused it on the label. The game files are identical to `04-finished`; only the README differs.
The run was replayed on `04-finished` with every recorded hash matching (own script). `replay-stats.mjs` was not run,
for the same reason.

**The run.** CITY ESCAPED with 33,000 points in 331 s, 66 cars wrecked, best pileup 8, 5 cars lost (D2 ×1, D3 ×2,
D4 ×2). After each exit opened, the person stayed 2–9 s before leaving.

**Where the person sits on the same build:** skilled 22,463 median and 38% wins; strong 39,625 and 100%. The
person is between them. One run is thin evidence.

The person's answers:

1. Whether to stay after the exits open or leave at once: 「あった」. The decision is felt. No change.
2. 「バンは分かったが結局1回目で止まるので差がない。警察犬は全く分からない」.
   - **Van.** The replay confirms it: every van that took its first hit was wrecked about 1.3 s later by the next
     car in the line. A stalled van was a late wreck.
   - **Dog.** 17 dog units appeared and cut across the tracks 3 times in the whole run. Too rare to see.
   - **Decision rule 2:** make each one unmistakable or remove it. Two attempts each, measured on the district
     that introduces the element, strong bot, one life:

| Attempt | Aware | Blind | Element off | Outcome |
|---|---|---|---|---|
| Van A: no stall, drives on after its first hit, second hit wrecks it | 24/40 | 21/40 | 23/40 | visible, but scores about equal: not adopted |
| Van B: a car that hits the van is wrecked and the van drives on; only a burning wreck stops it | 21/40, 5,635 | 18/40, 5,012 | 23/40, 4,037 | **kept**: unmistakable on screen, adds pressure, knowing it pays a little (+3 clears, +12% score); a modest effect, recorded as such |
| Dog: never takes your tracks, always hunts (replaces the cut rule) | 8/20, 3,770 | 4/20, 2,660 | 7/20, 3,715 | **kept**: knowing it pays (+4 clears, +42% score) |

3. Sound: 「問題なし」.

**After the rework**, the whole-run ladder (8 seeds) gives:

| | Median score | Wins |
|---|---|---|
| human-limited | 6,825 | 0% |
| skilled | 22,463 | 38% |
| strong | 39,625 | 100% |

These are almost unchanged. Each district's first READY line was rewritten to name the new behaviour.

**Calibration.** Calibrated on `04-finished` by session s3 (one run): the person lies between skilled and strong,
and the end is reachable at their level. The van and dog rework has not been played.

## Play session s4: build `05-van-dog-rework` (zip `pileup-05-van-dog-rework-20261020-0444.zip`, 1 run)

Stored at `tmp/playtests/pileup/s4/`. Served from the snapshot, so `tools/replay.mjs` verified the build: 204
hashes match.

**The run.** Reached district 4: 15,100 points, 203 s, caught 7 times.

| District | What happened |
|---|---|
| 1 | out after 22 s |
| 2 | one death (by a van on the tracks); out 7 s into the next life, the exits having been open 32 s |
| 3 | two deaths (by a hunting dog at 28 s, by a hunting car at 4 s); out after 16 s |
| 4 | four deaths: dog at 5 s, dog at 7 s, van at 19 s, car at 12 s |

Vans: 11 appeared, 2 rams, 5 stopped by wrecks. Dog units: 12 appeared and caused 3 of the 7 deaths.
Placement: between human-limited and skilled.

The person's comments and what was done:

- 「dogは他の車と見た目が同じすぎる」. Confirmed by the deaths: 3 of 7, two within 7 s of a life. **Done
  (presentation):** the dog unit is now a cyan car with a sweeping cyan searchlight instead of white headlights and
  a light bar.
- 「van はダメージが入った状態が分かりやすくあるべき」. In `05` a van takes no damage, so there was no state to show.
  Taken as a proposal for a visible damage state. **Done (rule):** each ram damages the van and the third wrecks it;
  a burning wreck still stops it at once. Shown as dents and a grey roof, then sparks, a smoke trail and a dead light
  bar. Measured on MARKET (strong, one life, 40 seeds): aware 20/40 clears and 5,935; blind 21/40 and 5,280; off
  23/40 and 4,037. Playing around it pays in score (+12%), not in clears, which is a weak pass on "changes the best
  action". Kept as the person's proposal; recorded as weak. Whole-run ladder: human-limited 6,938 (0%), skilled
  22,025 (38%), strong 40,500 (100%), almost unchanged.
- 「現状脱出は上下左右どこにいっても次のステージに違いは無い？」. Correct: all four exits are equal, and every
  district starts from the centre. Answered in the chat with options; not changed without the person's decision.

## Play session s5: build `06-dog-van-look` (zip `pileup-06-dog-van-look-20261020-0557.zip`, 2 runs)

Stored at `tmp/playtests/pileup/s5/`. Verified by `tools/replay.mjs` (226 hashes).

- Run 1 was abandoned at 25 s.
- Run 2 escaped: 31,100 points, 225 s, 4 cars lost. Dog units caused 1 of the 4 losses (3 of 7 in s4). Vans: 19
  seen, 8 rams.

The person's requests: 「Bで考えたい。合わせてEnter positionも変える。また districts ごとにビジュアルの差もつけることができるか？」

- **B** (branching route)
- **A** (enter where you left)
- a different look for each district

All three were taken up.

### The city (route branching, entry position, district looks)

- **Structure.**
  - 7x7 districts. DOWNTOWN is in the middle, and zones run by compass direction: OLD TOWN west, MARKET north,
    UPTOWN east, HARBOR south, INDUSTRY on the diagonals.
  - An exit leads to the neighbouring district on that side, which you enter at the opposite edge.
  - Driving out of the outer ring escapes the city; the shortest escape is 4 districts.
  - DOWNTOWN keeps its hand-drawn maze. The other 48 remove 6–9 streets chosen from a seed of their position, under
    the same map checks.
  - The bonus and extra car come only the first time you get out of a district.
- **Zones.**

| Zone | Police | Pileups pay | Heat (police count and speed) |
|---|---|---|---|
| OLD TOWN | patrol cars | x1 | −1 |
| MARKET | vans | x1.5 | 0 |
| UPTOWN | dog units | x1.5 | 0 |
| HARBOR, INDUSTRY | vans and dog units | x3 | +1 |

- **On screen.**
  - Each zone has its own block colours and rooftops.
  - Each exit carries a label: destination chip, tag and multiplier.
  - READY and GOT AWAY show a city map with the route.
- **Route test** (`tests/route.cjs`): the same bot taking the nearest unvisited non-inward exit, the best-paying
  one, or the lowest-paying one. It is the content check for "does the route change the best action".

| Step | Change | Finding |
|---|---|---|
| 1 | first version: police speed +1 per district entered; bots may only take outward exits | skilled won 1/12 on every route. Entering at the far edge makes the outward exit the farthest one, and the bot could not go sideways. The rich route was best for skilled: no trade-off |
| 2 | zone heat ±2 (cap and speed); bots may go sideways into unvisited districts | strong: rich 0/8, safe 8/8, nearest 8/8. Rich now far too hot |
| 3 | heat ±1; speed by ring + every second district | strong nearest 6/8; outer rings too fast |
| 4 | speed by heat + every second district only | strong nearest 8/8, safe 8/8; skilled nearest 6/12, rich 0/12 |
| 5 | found: the rich bot never took the escape exit (it pays no multiplier); wandering scored 168,000 over 19 min, with extends every 15,000 refilling lives | bot fixed (escape always first); extends now at 10,000 and then every 40,000 |
| 6 | after step 5 | strong: nearest 8/8 63,318, rich 4/8 94,412, safe 8/8 52,762. Skilled: nearest 4/12 30,800, rich 2/12 31,183 (no reward), safe 1/12 17,091 |
| 7 | rich zones pay x3 instead of x2 | strong rich 4/8 130,687; skilled rich 2/12 37,425 (+21% on nearest, half the escapes). **Kept**: the rich route is now a trade at both levels |

The safe route (OLD TOWN) does not win more for the skilled bot (1/12): lower scores bring fewer extends. It is a
lower-variance, lower-score route rather than an easier one. Recorded, not changed.

Whole-run ladder on the city (8 seeds):

| | Median score | Districts got out of | Escaped |
|---|---|---|---|
| human-limited | 12,638 | 2.9 | 0% |
| skilled | 42,625 | 4.3 | 50% |
| strong | 64,281 | 5.2 | 88% |

Outsider reading of the city screens (an agent shown three frames only):

- read the exit labels as the neighbouring district and its pileup multiplier;
- read the grid as a city map with your district outlined;
- read each zone's look as a different place with different police;
- weighed the route as "multiplier against danger and distance", which is the intended decision.

It was unsure whether the amber line was the route; the GOT AWAY panel draws the next step from it. Banners now sit
below the top exit, because EXITS OPEN covered the top exit's label in a frame.

Calibration: the city is uncalibrated. No session yet.

## Play session s6: build `07-city` (zip `pileup-07-city-20261020-0857.zip`, 1 run)

Stored at `tmp/playtests/pileup/s6/`. Verified by `tools/replay.mjs` (311 hashes).

**The run.** Escaped: 48,350 points, 311 s, 4 cars lost. Route: DOWNTOWN, east to UPTOWN, south to INDUSTRY, east to
UPTOWN, east to UPTOWN, out. Once inside UPTOWN, the exits on offer were "UPTOWN x1.5" again and again (for example
U1.5 U1.5 I3 I3, and U1.5 OUT U1.5 U1.5).

The person's proposal:
「マップが上下左右で倍率が決まっているのは、一度そこに入り込むと次の選択肢のほとんどが同じ倍率になるためよくない。基本外側が倍率が高いが、しばしばそうではない地区が混ざる、というのが良いのでは」

**Done.**
- Zones are no longer fixed by compass direction. Every run draws the city from its seed, weighted by ring (table
  in the README): mostly x1–x1.5 near the centre, mostly x3 on the outer ring, and other zones often mixed in.
- DOWNTOWN stays in the middle, and the mazes stay fixed by position.
- The content-check variants and tests set the zone they need explicitly.
- The demo was regenerated, because drawing the city uses the run's random stream.

### Escape early, never go back, keep runs short (after s6)

The person asked: 「脱出時には残機ボーナスなどがあり、早期に逃げるモチベーションがあるようになっている？」

- **Finding.** No. The flat 10,000 escape bonus was small against x3 farming: the strong bot scored 130,687 through
  x3 zones against 63,318 by the nearest exits.
- **Options offered:** A (a bonus per car left), B (a time bonus), C (both).
- **Instruction:** 「Aで進めよ。少なくともすでに通った区画に再度入ることはリスクが高くよくない選択である必要がある。またプレイ時間がやたらと伸びるのも良くない」.

Done:

- 5,000 per car left on escaping, added to the escape bonus.
- A revisited district is on alert: heat +2, no bonus, and a red `HOT` label on its exit.
- Police a step faster every 2 minutes of the run.

| Step | Settings | Strong | Skilled | Revisits allowed | Longest run | Outcome |
|---|---|---|---|---|---|---|
| 1 | 10,000 per car; speed + every district + every 90 s | nearest 4/8 | nearest 2/12 | 0/8, 22,500 | 7 min (was 19) | too hard; x3 route below nearest |
| 2 | speed + every second district + every 120 s; outer ring x3 share 45% (ring 2: 25%) | nearest 6/8, 90,587; rich 3/8, 60,543 | nearest 3/12 | strong 0/8, skilled 0/12 | 8 min (11 revisiting) | still hard; the per-car bonus made playing safe always better |
| 3 | 5,000 per car; quotas 4 + ring | nearest 8/8, 86,481; rich 6/8, 72,056 | nearest 7/12, 46,912; rich 3/12, 29,070 | — | about 7 min | **kept** |

Whole-run ladder after step 3:

| | Median score | Escaped |
|---|---|---|
| human-limited | 2,906 | 0% |
| skilled | 50,238 | 63% |
| strong | 86,481 | 100% |

**Remaining weakness, not closed.** A route that always chases the best-paying zone loses to the nearest new exit on
both escapes and score. The x3 reward does not justify a detour; it is taken when it is on the way. Logged as
unresolved after this step: the person's request was for early escape to pay, and it now does.

The demo picker now wants a pileup within the first 12 s; the demo was regenerated.

## Play session s7: build `08-escape-early` (zip `pileup-08-escape-early-20261020-1043.zip`, 3 runs)

Stored at `tmp/playtests/pileup/s7/`. Verified by `tools/replay.mjs`.

**The runs.** None escaped: 11,700, 22,150 and 25,650 points, 7–9 cars lost each. Most losses were on rings 2–3,
5–25 s into a district. Run 3 lost 5 cars to dog units. Run 1 went back into DOWNTOWN (HOT) and lost 4 cars there.
The person escaped on every earlier build, so this build is likely too hard for them. On being asked, the person
chose to leave difficulty as it is for now: 「難度は一度そのまま」.

**Request.** BGM and better feel: 「BGMを付けるなどゲームフィールの向上を行いたい。どのような内容が良いか？
また音源はどのようなスペックにするか？」. Proposal: a WSG-style board and adaptive chase music, plus a "slip" cue
and count-ups. Answer: 「WSGで。推奨で進めよ」.

**Done (presentation only).**
- New sound board and adaptive music; see `AUDIO.md`.
- Count-ups on GOT AWAY and on escape (cars left light one by one).
- The slip cue was built and then removed: only 19% of its triggers were followed by a wreck (`FEEL_TUNING.md`).
- Seeded results are unchanged: `ladder.mjs --compare`, all 40 runs identical to the `08` rules.

## Play session s8: build `09-wsg-music` (zip `pileup-09-wsg-music-20261020-2257.zip`, 2 runs)

Stored at `tmp/playtests/pileup/s8/`. Verified by `tools/replay.mjs` (110 and 195 hashes).

- Run 1 was abandoned at 1:50.
- Run 2 escaped: 49,600 points in 3:14, 4 districts, 3 cars left. That matches the skilled–strong bracket again on
  the `08` rules, after s7's three losses.

Comment: 「すこし全般に音量を減らしたい」.

**Done.** Master gain 0.55 → 0.4 (about −2.7 dB at the output). Every event keeps its place relative to the others:
radio blip against music 0.79 (was 0.81). The browser test's minimum levels were scaled with it. Sound only; the
rules are unchanged.

Then 「マスターを0.3に」: master 0.4 → 0.3 (a further −2.5 dB; about −5.3 dB from the first mix). Relative balance
unchanged (radio blip / music 0.81). Test minimums scaled.

Asked whether the 「ザッ」 sound plays on turning: it plays on reversing only. The person: 「スキール音はザッではなくキーという感じでは？」.
Done: the skid is now a tonal screech (high saw tone wavering down 2.6 → 2.0 kHz, 0.18 s) on a tone voice instead of
a noise burst, declared out of key. Peak 0.13, as before.

「スキール音は削除」: the reversal sound is removed; the skid marks stay. The kit is now 14 programs.
