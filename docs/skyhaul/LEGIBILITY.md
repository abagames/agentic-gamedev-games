# SKYHAUL — intent-legibility gate record

Skill: gating-intent-legibility. Withheld key (frozen before capture):

    # Withheld key (frozen before any capture or grading) — never sent to graders

    Artifact: shipping-build (browser build at 320x240, integer-scaled), SKYHAUL.

    Intended goal (one sentence): fly the green craft so the lowest point of the cyan line hanging
    beneath it touches magenta/orange people, collecting them into a dangling chain, then fly up into
    the lit opening under the grey saucer at the top to deliver them — bigger chains pay much more.

    Option set per state:
    - grab: steer so the chain's lowest point touches a person (ground or falling)
    - haul: fly up to the lit hatch under the saucer to deliver the chain
    - dodge row: leave the horizontal row of the white ship (and its shots) — dive under with a chain
    - dodge column: move sideways off a charging ground turret (or let the chain take it)
    - avoid hazards: steer the craft/chain around red spiked mines, the blue ship's hull
    - recover: re-hook a person being carried off by the yellow craft / falling from a cut chain

    Intended risk/reward pairing: a longer chain is worth more (payout shown over the saucer) but is
    slower and a bigger target — a horizontal shot or a mine across it drops everyone below the cut;
    touching the white ship's row, a mine, or a turret beam with the craft itself destroys it. The
    bar under HI running out makes the white ship faster.

    Intended action-class list (for the divergence metric):
    A grab (move toward a person) · B haul (move up to the hatch) · C dodge-vertical (leave a row) ·
    D dodge-horizontal (leave a column / hull) · E steal-back / recatch (chase an airborne person) ·
    F wait/hold position (e.g. under a committed pass, for the hatch)

    Stochastic components excluded from prediction scoring: which way a walking person turns; when the
    blue ship drops a mine; the Rescuer's rest timer.
    frozen 2026-09-25T14:02:42Z

    ## Protocol change (run 4), recorded before capture
    Control legend now names which sprite the arrow keys move, as a live player learns with the first key press:
    real: "the small green craft with thin legs, which has a cyan line hanging below it"; degraded: "the small grey
    block that has a thin line hanging below it". Key itself unchanged.

# Intent-legibility gate — run 1 (artifact: shipping-build, 320x240 x3)

Manifest: C1 = Playwright canvas screenshots at chosen ticks with the loop paused (test hooks `stepOnce`/`render`);
C2 = replayed twice, 24/24 fingerprints identical; C3 = score/lives/lander/weight/entity counts.
Track: skilled (reader oracle, haulAt 4), seed 1000+r. Sampling: pre-declared enumeration, rounds 1–8, scene
centre 1200 ticks after round start. Δback 15 ticks, Δfwd 45 ticks. Control: `?degrade=1` (palette collapse,
uniform sprites, hatch/payout/HOT gauge removed), same seeds/ticks, interleaved, unannounced. 16 graders
(sonnet), one per scene, goal asked first, then options/risk/prediction/counterfactual. Key frozen before capture.

## Prediction gate (stage B, scored by evaluator against t+Δfwd, via deterministic node replay)
real:    matched s01 s14 · partial s06 · contradicted s02 s09 s10 s12 s15
control: matched s03 s16 · partial s08 · contradicted s04 s05 s07 s11 s13
Contradictions are motion-independent misreads of *what objects are* (e.g. "the captive disappears into the
alien", "the falling block lands and merges") — the board model was wrong, not a stochastic outcome.

## Goal (Q1), all 16 — which object was read as the player
real (8):  green lander 1 (s01) · grey mothership 6 (s02 s06 s10 s12 s14 s15) · white Defender 1 (s09)
control:   top saucer-block 6 · tethered pair 1 (s16) · unsure 1 (s13)
Intended goal recovered unprompted: real 1/8 (s01; delivery only in options → weak); control ~2/8 partial
(s16 "ferry cargo between drop-off points", s13 "tow a chain into a pile").

## Verdicts
Intent: gated real scenes s01 (weak), s14 (inverted), s06 (inverted) → **illegible** on this run.
Control separation: the control was NOT read worse than the real build → formally **instrument-failure**
(the instrument cannot certify legibility here). The run is still a strong, element-specific lead, because the
real build is misread the *same specific way* 7/8 times, which the control does not reproduce.
Variety: collapse-not-measurable (counterfactuals mostly act for a misidentified avatar).
Entry point: not-measured (naive track not run).

## Visual elements that failed (repair items)
1. Mothership + lit hatch bar: the green bar under the grey saucer is read as *the player's health/shield bar*;
   the payout number above it as *the player's score* → the saucer is read as the player (6/8 real).
2. Green lander with a cyan beam lifting magenta humans: read through the Defender genre prior as *an enemy
   abducting civilians* — the thing to stop (6/8 real). Nothing on screen says "this one is you".
3. HOT gauge (green bar under HI): read as shield/fuel/energy of the player (5/8 real).
4. Lives icons (small green lander silhouettes, top right) are not connected to the lander in anyone's reading.
5. Turret beam (red column) read as the saucer's tractor beam (s02, s05).
Correctly transmitted: mines = danger (s06, s12), turrets "might be armed" (s09), Defender's laser = threat (s02).

## Human-review flags
Whether a role-reversal game should rely on a one-word "YOU" marker vs purely visual cues is a design/taste call.

# Runs 2–5 (repairs), same seeds/ticks/Δ as run 1; game states identical across builds (24/24 fingerprints)
| run | build change | legend | avatar right | goal: grab | goal: deliver to hatch |
|---|---|---|---|---|---|
| 1 | original | input only | 1/8 | 1/8 | 0/8 (options only, 1) |
| 2 | hatch doorway + chevrons, payout beside lander, amber fuse + Defender icon, lander-sprite lives (top right), YOU at spawn, title line | input only | 0/8 | 0/8 | 0/8 |
| 3 | 1UP + score + lives + "+payout" on the left in green; green mothership; red Defender | input only | 1/8 | 1/8 | 1/8 |
| 4 | (same as 3) | names the moved craft | 7/8 | 8/8 | 1–2/8 |
| 5 | grey mothership (no posts), blinking home arrow while carrying | names the moved craft | 7/8 | 7/8 | 1/8 (+2 "carry somewhere") |
Control (degraded, run 4, same legend): craft located 2/8, grab-like partial 4/8 → the real build separates on the grab.

Findings:
- Without knowing which craft is theirs, graders read SKYHAUL as Defender (the green alien abducts, the player stops it):
  the genre prior beats every static cue tried (colour coding, HUD layout, lives icons, "+payout"). Backfires recorded:
  lander-sprite lives read as an enemy wave counter; payout beside the lander read as the enemy's bounty; a green
  mothership read as the player's craft; hatch chevrons read as a descending enemy formation.
- Once the controlled craft is known — which a live player learns from the first key press, from the title card
  ("YOU ARE THE LANDER") and the spawn "◂YOU" marker — the grab is legible (7–8/8, control 4/8 partial).
- Delivering to the hatch is NOT legible from mid-round stills (≤2/8 in every run). It is transmitted by seeing one
  delivery happen (reel-in, rising point pops, score jump); the attract demo now hauls small so one happens early.
Verdict (shipping-build, skilled track, pre-declared enumeration): intent weak — grab legible given the avatar,
destination illegible from stills; avatar identification illegible from stills (resolved in play by input + YOU/title).
Variety: collapse-not-measurable (single run per build). Entry point: not-measured.
