# UNDERTOW — design search record

Brief: 1980s retro arcade game with a **scrolling field** and a **radar display**.
Tags (first draw of `node tools/pick-tags.mjs`): **sink**, **rescue**. Both fit the brief; no reroll.

Hard constraints: realtime, browser, keyboard (+ touch/pad optional), world wider than the screen
(so the radar carries decisions), one-person build in a day.
Free: theme, topology, what "sink" means, how rescue converts to progress.

Obvious first association (recorded, then forbidden for half the roots):
Defender/Choplifter — `intercept + deliver + adversarial`.

## Root concepts (signature: operation / progress / risk / info / skill)

| id | one-sentence core | signature | guard result |
|---|---|---|---|
| R1 | Defender-style: shoot abductors over a wrapping land, carry falling humanoids home | intercept / deliver / adversarial / perfect+radar / aiming | survives (baseline) |
| R2 | Ships sink on timers across the ocean; visit each and evacuate before it goes under | route / deliver / opportunity-cost / radar / planning | weak: agency collapse into a travelling-salesman route, action at the ship is trivial |
| R3 | Latch a rescue sub to a sinking hull; crew transfer while you sink together; release before crush depth | commit / deliver / same-action-creates-risk / perfect / timing | survives |
| R4 | Drop whirlpools (sinks) that pull everything nearby: enemies drown, survivors are pulled to your boat, but survivors drown too if you misplace them | construct / convert / same-action-creates-risk / perfect / prediction | survives |
| R5 | Torpedo enemy transports; each one breaks and spills its captives, who **sink** toward the seabed; catch them before they drown and carry them home | destroy→deliver / convert / same-action-creates-obligation / radar / timing+routing | survives |
| R6 | One-button ballast diver descending a scrolling abyss to rescue divers, with decompression on the way up | evade / collect / delayed-debt / local / timing | weak: single timing channel, idle ascent dominates once learned |
| R7 | Shooter where firing heats the hull; dump heat into water (heat sink) | destroy / survive / reward-consumes-safety / perfect / dexterity | hard_reject: heat meter is independent of rescue; tag forced into a resource meter |
| R8 | Space: stranded astronauts orbit black holes (sinks); slingshot around them to pick up | route / collect / danger-enables-reward / predictive / prediction | survives |
| R9 | Rescued people trail behind you on a line that drags and snags | route / deliver / same-action-creates-risk / perfect / dexterity | duplicate of R1 + snake trail |
| R10 | Seal compartments of a vertically scrolling sinking liner to buy time for passengers | allocate / territory / opportunity-cost / perfect / planning | weak: radar has no role on a single hull |
| R11 | Chased by patrol craft, lead them over quicksand/sinkholes to free the captives they carry | route / convert / adversarial / perfect / prediction | survives |
| R12 | Dark sea; sonar pings reveal sinking wrecks but also alert hunters | predict / deliver / information-cost / hidden / inference | survives |

Duplicate pass: R9→R1. R2 and R10 kept only as weak records.

## Mutations

| id | parent | operator | rule change | expected behaviour change | new risk |
|---|---|---|---|---|---|
| M1 | R5 | hazard transformation | escort depth charges also kill captives in the water | the rescue column is contested; kill the escort first, or catch fast | extra enemy type |
| M2 | R5 | delay consequence | captives are *carried* (capacity 6) and die with you; unload at home harbour | long catch far from home = risky cargo; decide when to go home | trips can become tedious |
| M3 | R5 | reduction | no player lives drain from idling; loss comes from the **town** emptying (every drowned or shipped captive is gone for good) | idle and mash both lose the same way: people drown or are shipped | needs readable town meter |
| M4 | R3 | commitment | latching slows the hull's sink but you can't fire | combines R3 with shooting | two modes, heavier |
| M5 | R12 | information | radar is exact but delayed | inference layer | radar was requested as a helper, not an obstacle |

Stop: M4/M5 add rules without a new decision; remaining uncertainty needs play.

## Final slate (unranked)

1. **R5+M1+M2+M3 (Kill-spill rescue)** — shooting creates a sinking, time-limited rescue obligation at the kill point. Evidence: mash sinks transports far away → spills drown → town empties (hand trace). Risk: catching may be trivial or impossible depending on sink speed vs sub speed. Question: does the player start choosing *where and when* to fire? Test: slice + bot ladder with a mash bot and a "fire only when catchable" bot.
2. **R3 Latch-and-ride** — commitment timing. Risk: single decision per wreck. Test: paper timing sim.
3. **R4 Whirlpool** — hazard is the tool. Risk: placement may be too fiddly with a stick. Test: cursor prototype.
4. **R11 Lure into sinks** — Pac-Man-like routing. Risk: radar mostly irrelevant. Test: grid sim.

## Selection for the slice

R5 with M1–M3. It is the one that most directly uses the brief's two requirements: the
scrolling field makes kill placement spatial and the radar is how you see transports, spills
and home at once. It resolves the key uncertainty: *does "sinking the enemy creates a sinking
rescue" turn firing into a state-dependent decision?*

- **Sensation:** lining up a torpedo so the transport breaks right where you can sweep down
  through its falling captives, while depth charges drift down the same water.
- **Why idle loses:** transports reach the enemy port; every captive aboard is lost; town empties.
- **Why mashing loses:** each hit spills 3–6 captives wherever the transport happened to be;
  a spill far from the sub drowns before you arrive, and the town still empties.
- **Why holding one direction loses:** transports go both ways round the ring.
- **Progress event:** a captive delivered to the harbour (returns to the town) — score and
  extends. Sinking a transport is worth little on its own.
- **Escalation:** more transports at once, more escorts, faster sinking in later waves. The
  decision stays readable because the radar shows each transport with its load and each spill
  as a falling column.

status: review_pending (unattended default assignment; implementation pre-authorized)

## Revision 2 (after user review: "かなり単調")

User direction: survivors start in the sea; raider craft sortie from their base and snatch them
with arms; raider subs do the same; raiders fight back (ships: mines, subs: torpedoes).

Adopted as a hybrid that keeps the original hook (sinking a raider spills its hold, which sinks):

| change | why (measured with the bot ladder / pacing sim) |
|---|---|
| survivors wait on life rafts at the surface; the sub cannot lift them off, only a raider's arm can | picking up floating survivors oneself was a low-risk chore that filled 77% of play; now the only way to rescue is to sink a raider and catch the spill |
| raider is worth 50 × what it carries; empty = 0; whole spill caught = n² × 100 | the mash bot farmed empty ships at the port exit (648 kills, never lost); now letting a raider gather first is worth more |
| rafts give out on a timer and their people sink as one spill | without it, killing every raider at the exit stalled the wave forever |
| grab-subs shadow the fullest grab-ship at depth and chase spills | contests the big catch instead of competing for rafts |
| mines: 0.5 s stern-lamp tell, only on a sub ≥ 30 px under the hulls, sink 28 px/s | most mine deaths happened 0.22 s after the drop, just under the band: not reactable |
| a rescue ship follows the sub (keeps 120 px off the port) instead of a fixed harbour | empty-screen trips home with cargo took 31% of play; now 14% |
| ring 1024 → 768 px, sea 160 → 120 px deep | the field was mostly empty |
| survivors are no longer drawn from the town; the town loses one per survivor taken or drowned | small late waves made the per-wave perfect bonus farmable |

## Revision 3 (user direction)

- The sub may take survivors straight off a raft (one per 0.3 s, just under the surface). It must
  then bring them back to our fixed harbour. The following rescue ship was removed.
- Rules are symmetric: raiders must reach their port before their hold is lost, and a destroyed
  raider spills its hold. A destroyed sub throws its survivors out where it died; they are
  protected from the blast that killed it, and the next sub starts at the harbour.
- Rafts may now appear anywhere from 84 px off our harbour to 90 px off their port.
- Cost: empty-screen trips home with cargo rose back to ~49 % of play (was 14 % with the rescue ship).

## Revision 4: trawling route (option 3 of the user's choice)

- Grab-ships leave the port empty and sail along the side of the ring with more people on rafts,
  to 75 px off our harbour. There they turn and trawl back, working only the water between
  themselves and their port.
- The half of the ring near our harbour is now contested. On the way home you meet outbound empty
  raiders. Worth 0, but sinking one protects the rafts behind you.
- Pacing (human-limited bot, h0): something in view 40 % → 58 %; empty-screen trips with cargo
  49 % → 35 %.

## Revision 5: our ferry (user direction)

- The ferry holds station 150 px out on the side of the ring where the sub is working. It does
  not chase the sub: a chasing ferry made every surfacing an accidental hand-over (the earlier
  "tender" problem).
- It takes survivors from a sub surfaced beneath it (8 seats) and turns for home 1 s after the
  last hand-over. They are saved when it docks.
- Raider grab-ships shell only a loaded ferry: 0.7 s gun flash, an arcing 1.2 s shell, and the
  landing point is shown. Two hits sink it and spill its load. It is replaced after 8 s.
- Tuning pass 1 (HP 3, 35 px/s, shells every 5 s): handing over beat carrying home by 3–5×.
  Pass 2 (HP 2, 28 px/s, shells every 4 s down to 1.8 s, range 140): about 2×, with about 10 %
  of handed-over people spilled. Still favoured by the bots; needs a human check.

## Revision 6: raiders actually compete for the rafts (user: "かなり簡単")

- Measured with `tests/rafts.sim.cjs`: in waves 1–5 the raiders took only 0–4 % of raft
  survivors (human-limited bot with ferry), because grab-ships spent 69 % of their time sailing
  out empty to the fixed turn point near our harbour.
- Changes:
  - grab-ships now turn just past the farthest raft on their side
  - they are faster (42 + 2n px/s, was 32 + 2n)
  - more of them sortie, more often (max 2 + n/2, every 5.5 − 0.4n s)
  - the first one leaves 0.8 s into the wave
- Result: raider share 26–32 % in waves 1–3 and 40–55 % in waves 4–11. Time spent sailing out
  empty fell to 44 %. The human-limited bot with ferry now lasts about 4.3 min (was about 6).

## Revision 7: a wave ends only when everyone has reached a port (user direction)

- Removed the free save at wave clear: survivors aboard the sub or ferry had been counted as saved
  without docking.
- A wave now clears when nobody is on a raft, in the water, aboard a raider, the sub or the ferry.
- Once nothing is left at sea, the ferry steams home at double speed.
- End-of-wave tail (settled → clear): median 5.9 s, max 7.6 s, no losses (h0f). Almost all of it
  is the sub carrying its last catch home, like a Choplifter-style return. Accepted as is.

## Revision 8: use the deep water (user: "ほとんどの時間プレイヤーが海上にいて、海中をまったく使っていない")

- Measured: the sub spent 66–74 % of its time in the surface band and under 5 % below 100 px.
- Changes (all three proposals, plus the user's "people at the surface also sink"):
  1. **Climbing torpedo.** It rises 1 px per 2 px run and hits a hull where it reaches the
     surface, so depth sets range. A surface tick shows the aim point.
  2. **The surface is dangerous.** Grab-ships' deck guns shell a sub within 18 px of the surface
     (0.7 s gun flash, landing point shown), as well as a loaded ferry.
  3. **Spills sink faster:** 12 + 0.8n px/s.
  - Rafts are removed. All wreck survivors start at the surface in life jackets and sink slowly
    (2.6 + 0.25n px/s). The sub catches them by touch at any depth.
- Found and fixed: a sub could keep survivors aboard forever with nothing else at sea, so the wave
  never ended. Grab-subs now sortie and stalk a loaded sub (torpedo or ram) once the sea is
  settled.
- Result: surface band 16 %, deeper than 100 px about 35 %.
- Early waves were eased once (ships 1 + ⌈n/2⌉ at most, every 7.5 − 0.5n s, 34 + 2n px/s).
  The bots are now aim-limited, so difficulty needs hands-on play.

## Revision 9: grab-subs use their harbour mouth (user direction)

- Grab-subs sortie at 62 px (just under the surface) from the port and dive to their work.
- Heading home, they start rising 140 px out from the port. They can dock only at ≤ 66 px, and
  hold at the harbour mouth until they are up.
- A loaded grab-sub going home is therefore catchable in shallow water near the port, where the
  climbing torpedo reaches it from a short run.

## Revision 10: waves open after a raid; everyone must be rescuable (user direction)

- User: spills were rare, so varying them would mean little. Measured (h0f, per minute): 17 jacket
  pickups vs 4.7 spill catches, and 3.5 shots.
- Each wave now starts with 70 % of its survivors aboard raiders fleeing our coast for their port.
  The rest are in jackets off our coast.
- Constraint: good play must be able to save everyone. Timing analysis showed that at wave 6
  sink + catch + unload took ~10 s per raider against ~6 s between departures, so a full rescue
  was impossible by construction. Fixes:
  - at most 3 per fleeing raider, so two spills fit our hold of 6
  - departures at least 7.5 s apart
  - loaded raiders at 0.6× speed
  - fleeing grab-subs shallow enough to hit from below (a climbing torpedo cannot reach deeper
    targets)
  - survivors capped at 18
  - port grab-subs capped at 2
  - port sorties at least 5 s apart
  - spill sink speed capped at 15
  - the whole wave spec held from wave 10
- A grab-sub touching our sub now only bumps it, unless it is stalking a sub that holds survivors
  after the sea is settled. Collisions while both chased the same spill had become the top cause
  of death (20–29 per 8 games).
- Result: spill catches 13.6/min, jacket pickups 3.8/min, shots 6.8/min. The full-information bot
  saves everyone at waves 1–6 and 10 in some runs.

## Revision 11: escort destroyers (user: "簡単すぎる。敵から攻撃を受ける場面が無い")

- Measured: about 6 attacks per minute on our sub, each easy to sidestep (deck guns only near the
  surface, mines only right under a ship, grab-sub torpedoes only on the same depth line).
  Deaths 0.65/min.
- Added escort destroyers, attached to the rescue action rather than roaming.
  - A share of fleeing raiders gets one (never the first of a wave; 35 % at wave 1, up to 75 %).
  - It keeps station astern of its raider and depth-charges our sub at any depth within 70 px:
    0.6 s rack flash, a pair of charges 18 px apart set to our depth, sinking 40 px/s. The
    blasts also kill spilled survivors.
  - It hunts our sub for 8 s after its raider is sunk.
  - The raider after an escorted one leaves 4 s later, to keep a full rescue possible.
- First pass (range 90, 0.5 s tell): too hard, since range 90 covered every firing position on
  the raider. Range reduced to 70, so a shot from deeper than 100 px outranges it.
- Bot fix: dodge a charge pair by getting clear of its centre. Moving away from the nearer charge
  ran the bot into the other one.
- Result: about 11.5 attacks/min, 1.5 deaths/min. The full-information bot still reaches perfect
  waves up to wave 6 (not 5, 8, 10).

## Revision 12: a strong reference bot, then harder (user: "まだ相当簡単", reached wave 4 with nobody lost, no subs lost)

- The hand-written bots were much weaker than the user, so the difficulty picture was wrong.
- Built `plannerBot`, a lookahead planner.
  - It clones the game every 0.2 s. For each intent it plays the intent to completion, then a
    default policy (unload when full, catch reachable spills, unload at 4+, sink the most urgent
    raider), 5 s ahead.
  - The value function counts only survivors that can still be reached before the seabed.
  - Making it strong took three fixes: judge spills by reachability, value getting cargo toward
    the unloading point, and play intent then default in rollouts. Pure single-intent rollouts
    dithered.
- On the build the user played, the planner saved everyone in 6/6 tries at waves 1–3 and reached
  wave 16 with almost no losses, about the user's level.
- Harder, tuned on the planner:
  - escorts on 50–90 % of raiders
  - escorts break station to run at a sub within 130 px
  - three charges 16 px apart, set to the sub's depth, sinking 46 px/s
  - charge range 80 px
  - patrolling grab-subs close on the sub's depth line and fire
  - spills sink up to 17 px/s
- Kept the full rescue possible: loaded raiders at 0.65×, and 5 s extra after an escorted raider.
  At 0.7× and 4 s the planner could not save everyone at waves 8 and 10.
- Result: the planner reaches about wave 10 in 10 min. Every tested wave has at least one
  perfect run.
- Clonable state: the RNG state now lives in `g.rs` and `structuredClone(g)` is exact. A step
  costs about 2 µs.

## Revision 13: survivors spread all round the sea; every raider sorties from its port (user direction)

- User: a pre-loaded fleeing raid felt unnatural. Spread the survivors at the surface and in
  mid-water, and have every raider come out of its port to collect. Put a heavy speed penalty on a
  raider carrying people, so fast collection can still be won back.
- Implemented:
  - survivors from 85 px off our harbour to 110 px off their port, 45 % at the surface and the
    rest down to 55 px deep
  - the port empties at once at the wave start
  - escorts sail with grab-ships
  - loaded speed 0.45, −0.07 per extra person, floor 0.25
  - loaded grab-subs run home shallow (45 px), so their spills can be caught
- Getting a full rescue back took structural caps, found with one-at-a-time variants on the
  planner:
  - escorts were the biggest factor (0/8 → 3/8 at wave 3 without them), then ship speed
  - no single change fixed wave 6; together they did
  - caps: 3 grab-ships, 2 grab-subs, 35 % escorts, sorties ≥ 6 s apart, 16 survivors, jackets
    ≤ 3.4 px/s, and a hold of 8
- The planner needed a route-based value. It had been sinking three raiders at once far apart and
  drowning the spills. That is also the key decision for a player: don't sink what you can't catch.
- A grab-sub now stalks and rams only a sub sitting on survivors after the sea is settled.
  Without that restriction it was ramming whenever the grab-ships were gone.
- Result: waves 1–10 all have at least one perfect planner run. The play mix is 5.3 spill catches
  vs 9.4 jacket pickups per minute.

## Revision 14: deck guns that matter (user: "回収船の甲板砲はプレイヤーには当たらない？")

- Measured: shots at the sub 0.6/min and no hits. The gun fired only within 18 px of the surface,
  needed a direct 11 px hit, and gave 1.9 s of warning.
- The user chose (1) a surface burst whose blast reaches into the water, and (2) a wider trigger
  band, and asked for a clear "you will be hit here" warning.
  - The trigger band is now 40 px, drawn as the lighter band.
  - The burst radius is 22 px from the surface point.
  - Warning: the aim point tracks the sub for 0.7 s, shown as a crosshair and a half-disc of the
    burst zone flashing in step with the gun. The aim locks on firing, and the zone turns red and
    blinks faster through the 1.2 s flight. The zone never disappears, only its brightness
    changes.
- The sub now respawns below the band. Otherwise it was shelled on arrival (the idle bot lost 3
  subs in 65 s).
- Ferry spills are protected from the burst that sank the ferry.
- The wider band cost the planner time, so full rescues became rarer. Wave 10 had none in 45
  tries. Later deck-gun fire was slowed (≥ 3 s), top speeds capped (ships 40, subs 34, spills 16),
  and the plateau moved to wave 8. Every wave 1–8 again has at least one perfect planner run.

## Revision 15: an 8-wave campaign (user: "ある程度のウェーブでゲームクリアとしたい。8ウェーブで終了が適正？")

- Why 8: difficulty had plateaued at wave 8. The planner (about the user's level) cleared wave 8
  in 8 of 10 full games in 6–8 min.
- Structure: one new element per early wave (1 grab-ships, 2 + grab-subs, 3 + escorts, 4 + the
  40 px deck-gun band). Waves 5–7 tighten, and 8 is FINAL WAVE. ALL CLEAR pays for the town left
  and subs in hand, plus 20,000 if nobody was lost all campaign.
- Found and fixed a stall: with a hold of 8, cargo drift (3.5 px/s each) almost cancelled the
  climb, so a full sub could not surface to unload. Now 2.5 px/s each.
- Tuning: survivors capped at 14 (wave 4, the band-widening wave, had 0/24 perfect runs at 16).
  The town is 20 (was 30) so a clear is not automatic: the planner clears 81 % of campaigns.
- Every wave 1–8 has at least one perfect planner run in 24.

## Revision 16: every wave sorties from our harbour (user suggestion)

- At each new wave the sub and an empty ferry return to our harbour, so the start of every wave is
  the same. Previously the sub started wherever the last wave ended. The sub starts below the
  deck guns' reach, with a moment of invulnerability.
- Cost is small, because a wave only clears once everyone has docked. The planner's campaign clear
  rate is 6/8.

## Revision 17: radar centred on the view (user suggestion)

- The radar still shows the whole ring, but it now scrolls with the main view: the view bracket is
  fixed in the middle, and the harbour and port marks move.
- On a ring, a fixed map had a seam where something just behind the sub could appear at the far
  edge. Centred, the radar's left and right always match the shorter way round.

## Revision 18: game feel, items 1–3 (maximizing-game-feel skill)

- Register: tense submarine warfare. Weighty, short impacts; motion and light rather than bounce.
- 1, the sink moment:
  - a white hull flash for about 4 frames, then the break
  - a directional camera push along the torpedo's run, instead of random jitter
  - hit-stop of 2 + n frames (n aboard, up to 4)
  - survivors tossed in a render-only 0.5 s arc before sinking
- 2, feedback hierarchy: ALL SAVED > sink > catch. ALL SAVED gets double rings and a radar blip;
  catch particles were cut back.
- 3, sub motion: 1–2 px pitch from vertical speed across hull segments, a 0.12 s narrowing on
  turns, and a speed-scaled wake whose bubbles rise more slowly with a heavier load.
- Items 4–7 (fire recoil, loss shown at home, blast rings and near misses, unloading lights) are
  deferred until after hands-on play.

## Revision 19: the town counter replaced by losses costing subs (user direction)

- User: the town number was unclear, and the clear bonus should be for subs only.
- Removing the loss penalty outright broke the goal. A survival-only planner, with the town
  unlimited, cleared 4/6 campaigns after rescuing only 3–6 people.
- Now every loss counts toward a miss: the 3rd since the last miss or wave clear recalls the sub
  (the user asked that misses and clears reset the count). Anyone aboard goes home with it.
- Visual link (user request): a red figure flies from the loss (or from its radar blip) to a
  three-figure counter by the spare subs and crosses one out. The last one blinks, and "3 LOST"
  flashes the spare subs.
- Tuning on the planner: 5/miss gave 100 % clears, 4/miss with an extend every 30 gave 100 %,
  3/miss with an extend every 40 gave 69 %, and 3/miss with an extend every 30 gave 80 % (chosen).

## Revision 20: deaths from "nothing" (user report)

- Two causes, both mismatches between presentation and rules:
  - Blasts were drawn growing from 40 % of their radius, while they were lethal at full radius
    from the first frame. Now they are drawn full size and filled while lethal.
  - A recall (third loss) used the sinking explosion. In the human-limited bot's deaths it was 9
    of 25. Now it has its own animation: a white silhouette rising, a descending jingle, "3 LOST".
- Checked and consistent with their visuals: mine contact, charge contact and burst, grab-sub
  torpedo, the shell zone.
- Also fixed: blasts (plus wrecks and our torpedo) were not cleared on a wave clear. Time is
  frozen on the clear/READY screens, so a blast from the clearing moment went off at the start of
  the next wave. All hazards are now cleared at the clear and at the next wave's start.

## Revision 21: title and enemy port (user direction)

- Title rebuilt. The old diagram showed the first prototype (transports and an arrow to a
  lighthouse). It is now a looping scene of the current loop: grab-ship lift, depth-fired
  climbing torpedo, break, spill, catch, home. The logo is cut by the surface. Text is cut to one
  line.
- Their port now uses our harbour's layout, so the mirrored rule reads visually: people are lost
  when a raider docks there. The barred windows count the people taken during the wave.
