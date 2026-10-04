# Prototype-building instructions

This repository contains focused browser-game vertical slices.

Each slice should come from a coherent full-game concept and exist to make that game's core play feel, decisions, challenge, and feedback directly evaluable.

Existing games under `docs/` are finished artifacts. Do not rewrite them when creating a new game.

## Default assignment

When asked to create a game without a more specific brief, carry out the full workflow autonomously.

Produce the smallest coherent game slice that feels intentional, readable, responsive, and worth playing repeatedly.

Prefer depth from interactions over feature quantity.

## Design constraints

When the user provides enough direction to guide the game concept, use that brief without drawing random tags. Draw tags only when the concept is left open, unless the user explicitly requests tags. For an open-ended assignment, run:

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

The default deliverable is the slice: the first playable version, built, tuned, and validated as the sections below describe, and nothing more. It exists so the user can judge whether the concept is worth finishing.

- Do not run a refinement loop on it, and do not add lives, extends, an ending, a title sequence, or an attract loop unless the core experience depends on them.
- Save it with `node tools/snapshot.mjs tmp/games/<slug> first-playable`. A play report is evidence about the build that was played.
- In the completion report, list the structural weaknesses that the checks already made have shown: what play mostly consists of, which simple policy comes closest to skilled play, which threat or mechanic rarely matters. This lets the concept be judged apart from the roughness of a first version. Do not rate how promising it is; that judgment is the user's.
- Run `node tools/check-done.mjs tmp/games/<slug>` before the completion report.

Then stop. Do not start stage 2 on your own.

### Stage 2: finishing

Start when the user asks to finish or promote a slice. When the brief asks for a finished game from the start, build the slice, snapshot it, and continue into this stage without stopping.

Refine the game with the `refining-game-prototypes` skill; the skill owns the procedure. Do not stop to ask which option to take. Choose, proceed, and record the options not taken. Ask only before an irreversible or outward-facing action.

Add what the concept's run structure calls for and nothing it does not: a defined end to a run where a run is meant to end, a lives and extend economy where the game has lives, a title and attract loop where the game presents itself as an arcade cabinet, a play-feel pass, and a mix whose levels were measured where the game has sound.

Required in this stage:

- Keep `REVISION_HISTORY.md` in the game directory from the first change onward: the intent, each finding with its cause and evidence, what was tried and not adopted, and what was never measured.
- Snapshot every build handed to the user for play.
- State whether difficulty is calibrated against a play report, and on which build. Without a report, say it is uncalibrated.
- Run `node tools/check-done.mjs tmp/games/<slug> --stage finished` before the completion report.

### Tools

Apart from `snapshot.mjs` and `check-done.mjs`, everything in `tools/` is optional help, described in `tools/README.md`: a rules adapter for the bot ladder and its audit, scene capture, calibration, and the run-summary line. Use a tool when a question about the game needs the evidence it produces and that evidence is cheaper than the alternatives. A game that answers its questions another way, or whose rules cannot run outside a browser, uses none of them and needs no explanation beyond its test notes.

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
- failure that feels arbitrary.

Prefer structural changes over merely increasing speed, spawn rate, score, or effect intensity.

A useful tuning change should alter meaningful player behavior, decisions, or achievable outcomes.

### Simulated players

Simulated players must be limited in execution as well as information. Precise bots overestimate human players; hand-written bots with weak decisions underestimate them. Both have happened here, so do not assume a direction.

Use a ladder of policies and state which one each conclusion rests on:

- strong or oracle policies to detect exploits and degenerate strategies,
- a human-limited policy to set difficulty, timers, and pacing.

The baseline is a comparison against simple policies (idle, repeated input, nearest-target greed) plus the sanity checks below. Add more only when a finding calls for it: a stronger policy, such as look-ahead over copied states, when the strong policy is shown to fail in ways a person would avoid; a weaker rung when a play report falls below every policy; policies that stall or only survive when the game has a goal that could be bypassed.

A human-limited policy should model, where relevant, reaction latency to new danger, timing error, attention lapses (not checking secondary threats), position-reading error, decay of stale information, and re-orientation time after the frame of reference changes (teleport, camera cut, moved pivot). It should not be able to repeat accurate actions faster than a person could.

A claim that a strategy is dominant or balanced should hold across the ladder, or be reported as skill-dependent.

When the user's hands-on play contradicts bot results, treat the play report as the stronger evidence and correct the human-limited model toward it. Compare the report with the policies on the build that was played. Fit it numerically only when a difficulty decision depends on the result.

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

Before trusting simulated-player results, sanity-check the simulated players themselves: human-plausible input rate, plausible causes of failure, and no artifact of their own model (such as stale predictions converging on the player) driving the outcome.

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
- validation performed and its results,
- whether difficulty is calibrated against a play report, and on which build,
- any untested behavior,
- any remaining blocker.
