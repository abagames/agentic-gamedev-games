# Prototype-building instructions

This repository contains focused browser-game vertical slices.

Each slice should come from a coherent full-game concept and exist to make that game's core play feel, decisions, challenge, and feedback directly evaluable.

Existing games under `docs/` are finished artifacts. Do not rewrite them when creating a new game.

## Default assignment

When asked to create a game without a more specific brief, carry out the full workflow autonomously.

Produce the smallest coherent game slice that feels intentional, readable, responsive, and worth playing repeatedly.

Prefer depth from interactions over feature quantity.

## Design constraints

When the user names a concrete idea, rule, or motif for the game, use that brief without drawing random tags. When the brief names only a style (an era, a genre's look, a platform feel, such as "1980s retro arcade"), or nothing at all, the concept is left open: draw tags and apply the style alongside them. Draw tags in any case when the user explicitly requests them. For an open-ended assignment, run:

`node tools/pick-tags.mjs`

Adopt the first successful draw. Do not reroll because of preference, difficulty, redundancy, or conflict with an optional skill.

When tags are drawn or supplied by the user, record them in the new game's README.

Treat selected tags as creative constraints rather than literal feature requests. Each should influence the game's identity, but do not force a presentation-oriented tag into an artificial mechanic.

An object tag may be interpreted through the function it performs rather than as the literal object or its customary genre (for example, trampoline as a transit point that protects while in use but wears out, door as a barrier that can be turned into a weapon, smokescreen as a trail that stalls pursuers).

## Concept development

Use the installed Game Concept Workbench.

Begin with `exploring-game-design-space` and follow its `SKILL.md`.

Use `stress-testing-game-concepts` and `curating-game-concept-portfolio` when their documented trigger conditions apply.

Conceive the full game before selecting the vertical slice.

For the default assignment, implementation of one minimal vertical slice is pre-authorized. Human-review boundaries recorded by concept-workbench workflows are non-blocking.

Choose the smallest slice that resolves an important uncertainty about the core experience rather than the concept that merely sounds most impressive.

### Concept quality

Prefer simple controls with non-trivial, state-dependent consequences.

The value of an action should depend on the situation in which it is performed. Strong play should be capable of producing consequences larger than the apparent complexity of the input.

Interesting situations may arise from timing, geometry, motion, interacting systems, changing state or rules, player-created state, autonomous systems, or another game-specific source.

Do not require any particular pattern such as charging, accumulation and release, persistent trails, explicit risk/reward, combos, or resource meters.

Avoid concepts where the same locally optimal action remains obvious throughout play.

The mechanic itself should generate the primary source of satisfaction. Presentation should reinforce that payoff rather than manufacture it.

Before implementation, describe the intended moment-to-moment sensation in one sentence. Check why idle play and simple repeated input patterns would lose to skilled play, adapting the examples of holding or mashing to the chosen controls.

Identify the in-world event that causes progress or scoring. If challenge increases over time, state what changes and how the main decision remains readable.

## Design language

Choose a coherent visual and interaction language appropriate to the concept.

Rules, controls, shapes, color, motion, audio, effects, and interface should feel intentionally related.

A 1980s arcade vocabulary is a useful fallback, not a requirement.

Prefer deliberate constraints, clear silhouettes, small control vocabularies, little explanatory UI, and differentiated feedback.

Avoid generic prototype presentation and decorative effects without gameplay meaning.

## Skills

Inspect the skills available in the current environment during concepting, implementation, tuning, and validation.

Use a skill when its documented trigger conditions match the task or an observed problem. Follow its `SKILL.md` as the canonical local procedure.

A check that needs a reader who has seen neither the design nor the source (an outsider naming screen elements, `gating-intent-legibility`) may use a subagent given only the captured frames and the check's question; this is authorised by this file.

Do not use skills merely because they are installed.

Repository requirements, the user's brief, any selected tags, and the goal of this file take precedence over optional skill-specific genre defaults.

Adapt or skip an optional skill rather than distorting the game to satisfy it.

Use judgment about sequencing. The required outcome matters more than a rigid universal order.

## Build

Create the game under:

`tmp/games/<slug>/`

Do not create or use a Git worktree.

The game must be playable in a browser from `index.html`.

Choose the technology, structure, controls, and asset strategy that best suit the concept.

Do not modify an existing game or its dependency lockfile.

Use generated or third-party assets only when their license and provenance can be recorded. Procedural, code-drawn, or deliberately minimal art is acceptable.

## Slice first, then finish

Work in two stages. The user decides between them.

### Stage 1: the slice

The default deliverable is the slice: the smallest version in which the core decision can be judged by playing it. It exists so the user can decide whether the concept is worth finishing.

A slice that asks nothing of the player cannot be judged, so tune it as far as the core decision needs and no further:

- Structure: the core interaction is what play consists of, and simple play (doing nothing, repeating one input, taking the nearest target) loses early.
- Pressure: the player is under real pressure within the first moments of a run, and it does not let up for a player who plays well. Set this against the strong policy first: it must be at risk of failing, not able to continue indefinitely. Use the human-limited policy as a secondary check. A slice tuned only to a human-limited policy has come out too easy here.
- The `refining-game-prototypes` skill may be used for these two points. Leave the rest of its stages for finishing.

Do not add a difficulty curve across many rounds, an ending, extends, a title sequence, or an attract loop unless the core experience depends on them.

- Save the first playable build with `node tools/snapshot.mjs tmp/games/<slug> first-playable`, and hand over a build for play as described in "Handing over for play" below.
- In the completion report, list the structural weaknesses that remain. Do not rate how promising the slice is; that judgment is the user's.
- State that difficulty is uncalibrated until a play session exists.
- Run `node tools/check-done.mjs tmp/games/<slug>` before the completion report.

Then stop. Do not start stage 2 on your own.

### Stage 2: finishing

Start when the user asks to finish or promote a slice. When the brief asks for a finished game from the start, build the slice, snapshot it, and continue into this stage without stopping.

Do not stop to ask which option to take. Choose, proceed, and record the options not taken. Ask only before an irreversible or outward-facing action.

Finishing turns the slice into the full game the concept described. It is partly repair and partly building; the building steps below are done whether or not a check reported a finding. Work in this order:

1. **Structure.** Refine with the `refining-game-prototypes` skill until the core decision holds up. Weaknesses in the core decision that the slice report listed are dealt with here, not carried forward.
2. **Content.** Add the variation the full-game concept named when it was designed (see the README and the design record), one element at a time. Keep an element only if its effect can be seen on screen, it changes the best action, and it is not the ordinary game with pressure removed; otherwise remove it and record why. Measure "changes the best action" by comparing a policy that takes the element into account with one that does not, on the round that introduces it (`tools/ladder.mjs --variant`, `tools/README.md`). Stop when each stretch of a run introduces something new, or when the remaining candidates fail those tests. Do not invent elements the concept did not name unless the named ones are exhausted. A proposal from the person counts as named; if it fails these tests, say which one and ask before dropping it.
3. **Difficulty and progression.** With the content settled, set the run structure the concept calls for and nothing it does not: a defined end where a run is meant to end, at most one new element per round, and a lives and extend economy where the game has lives.
4. **Presentation.** Do each of these as a deliberate pass, with the named skill, and record what was changed and what was considered and left out:
   - visuals, with `directing-game-visuals`: protagonist, danger, and reward tell apart at a glance; text and actors are large enough to carry the action;
   - play feel, with `maximizing-game-feel`: list every important event and give each a response or an explicit "none";
   - sound, with `building-era-authentic-game-audio` or `designing-retro-arcade-sound-kits`: a complete event kit, a decision on music with its reason, and levels measured at the output;
   - a title and attract loop where the game presents itself as an arcade cabinet.
   Presentation changes must leave seeded simulated results identical.
5. **Cleanup.** The cleanup stage of `refining-game-prototypes`.

Required in this stage:

- Keep `REVISION_HISTORY.md` in the game directory (start it earlier if the slice was revised or played): the intent, each finding with its cause and evidence, what was tried and not adopted, and what was never measured.
- State whether difficulty is calibrated, naming the build, the play session and the rung or bracket it rests on. Without a session, say it is uncalibrated.
- Run `node tools/check-done.mjs tmp/games/<slug> --stage finished` before the completion report.

### Tools

Apart from `snapshot.mjs`, `check-done.mjs` and the review kit, everything in `tools/` is optional help, described in `tools/README.md`: a rules adapter for the bot ladder and its audit, scene capture, calibration, replay statistics, and the run-summary line. Use a tool when a question about the game needs the evidence it produces and that evidence is cheaper than the alternatives. A game whose rules cannot run outside a browser still carries the review kit, at the `no-adapter` or `non-deterministic` level, and needs none of the replay-based tools. `ladder.mjs --compare` compares results only; whether recorded replays stay valid is decided by state hashes.

### Handing over for play

Every build handed over for play, at either stage, is snapshotted and carries the review kit at the highest level its rules allow (`node tools/review-kit.mjs`; `tools/README.md`, "Review kit"). At the `replay` level, the rules compute sin, cos, atan2, hypot, pow, exp and other engine-dependent Math functions deterministically, as that section describes. The person plays, downloads the recorded runs with one key, and comments in the chat; ask any questions about the build there.

When a review zip arrives:

- Store it under `tmp/playtests/<slug>/<session>/`. Play data stays under `tmp/` unless the person asks.
- Run `tools/replay.mjs` on the snapshot it names. A desynchronised replay is reported and not used as evidence. A zip of a build already played repeats the earlier runs; pass the earlier zips with `--exclude`.
- Read the runs together with the person's comments, on the build that was played, with `refining-game-prototypes` (play input) and `evaluating-gameplay-balance` (calibration). Place the person between the existing policies with `tools/replay-stats.mjs`. Fit a rung to how they play (check it with `--fit`, carry it into the current `tests/adapter.cjs` named for the person and session) only when a difficulty decision depends on where they sit and the existing policies do not bracket them closely enough; stop after three attempts and record the fit and where it is off. For questions the figures do not answer, use `tools/replay-probe.mjs`.
- Record the session in `REVISION_HISTORY.md` once it exists: the build, the findings, where the person sits among the policies (and any fit's `k/n` and where it is off), and what was done with each proposal.
- At the slice stage, act only on findings about the core decision, within the slice's tuning limits, and record proposals as held for finishing. Then stop.

## Tune

Once the core loop works, play it before adding significant content or polish.

Improve the weakest decision, interaction, or system relationship first.

Prefer strengthening causal relationships among existing systems over adding new systems.

Look for:

- dominant low-risk strategies,
- actions whose value barely changes with context,
- systems that coexist without affecting one another,
- hazards unrelated to the core mechanic,
- rewards that fail to justify ambitious or skillful play,
- success that produces little meaningful state change,
- failure that feels arbitrary,
- the most natural response to a threat being punished more than ignoring it.

Prefer structural changes over merely increasing speed, spawn rate, score, or effect intensity.

A useful tuning change should alter meaningful player behavior, decisions, or achievable outcomes.

### Simulated players

Build, limit, sanity-check and calibrate simulated players as `evaluating-gameplay-balance` describes, and state which policy each conclusion rests on. This repository fixes which: exploits and the slice's pressure check rest on the strong or oracle policy; calibration statements rest on where a play session places the person among the policies, or on their rung where one was fitted. The pressure check holds although the skill sets difficulty only from human-limited runs: it asks whether the slice has pressure at all, not how hard it is. Where a run has a defined end, the strong or oracle policy may clear it every time; the end must be reachable by the human-limited policy or the person's bracket, and top play is pressed by score. A game may set difficulty on a person's rung instead, and records that choice and its reason in `REVISION_HISTORY.md`. A play session outranks simulated results in either direction.

After structural tuning, perform an explicit play-feel pass.

Tune the most important recurring interaction first. Improve responsiveness, timing, anticipation, impact, follow-through, motion, audiovisual confirmation, readability, and recovery where relevant.

Reserve the strongest feedback for the strongest mechanical outcome.

## Remove generic prototype artifacts

Before completion, remove or revise:

- unnecessary instructional text,
- placeholder-looking UI,
- decorative effects without gameplay meaning,
- inconsistent visual or motion language,
- unnecessary secondary mechanics,
- effects whose intensity does not match event importance,
- obvious default-library presentation.

The slice should feel intentionally limited rather than unfinished.

## Validate

Verify the implementation in proportion to its complexity.

At minimum, exercise:

- loading,
- controls,
- the complete core loop,
- the main player decision,
- meaningful success,
- failure,
- restart.

When relevant, test mechanic conformance, degenerate strategies, balance, legibility, spatial behavior, timing, collision, and other important invariants.

A smoke test alone is not evidence that the intended gameplay works.

Before trusting simulated-player results, run the sanity checks of `evaluating-gameplay-balance` on the simulated players themselves.

After tuning, rerun checks affected by the changes. A change meant to touch only drawing or sound must leave seeded simulated results identical, where the game has them.

Do not claim behavior was validated if it was not exercised.

## README

In the new game's `README.md`, document:

- selected tags and how they influenced the game, if tags were used,
- the envisioned full game and premise,
- controls,
- design and interaction language,
- core interaction and main decision,
- what the slice is intended to validate,
- deliberately omitted systems or content,
- local run instructions,
- available test commands,
- known untested behavior or limitations.

Once finishing has begun, keep the history of changes in `REVISION_HISTORY.md`, not in the README; the README describes the game as it is.

## Repository guardrails

Treat the deliverable as a vertical slice of a conceived game, not an isolated mechanic demo.

Keep it small enough to implement, tune, and verify reliably.

Preserve user changes and unrelated untracked files. Never delete, overwrite, or reset existing work merely to make validation pass.

Unless explicitly requested, do not:

- create commits, branches, tags, or stashes,
- modify the Git index,
- switch revisions,
- rewrite history,
- merge,
- rebase,
- reset,
- push.

Read-only Git commands such as `git status`, `git diff`, and `git log` are allowed.

Do not add a temporary vertical slice to the root `README.md` unless explicitly asked to promote it into the finished games.

## Completion criteria

The prototype is complete when the smallest intended experience is mechanically correct, playable, readable, coherent, and sufficiently tuned for its core play feel to be judged.

Prefer removing a weak secondary feature over leaving the core interaction under-tuned.

## Completion report

Report:

- selected tags, if any,
- the game directory,
- the full-game premise in one concise description,
- the skills actually used,
- the main structural tuning performed,
- the main play-feel tuning performed,
- for a slice, the structural weaknesses already visible,
- for a build handed over for play: the play link with `?review=1` to its snapshot directory (as `review-kit.mjs <snapshot> --check` prints it), the download key (press it between runs; the zip holds every run of that build), and two cautions: play one build in one browser, and download before closing the tab if the page says it is not saved,
- validation performed and its results,
- whether difficulty is calibrated, naming the build, the session and the rung or bracket,
- any untested behavior,
- any remaining blocker.
