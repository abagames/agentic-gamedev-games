# Audio contract (current: small-wavetable revision, 2026-09-29)

The sections after this one describe the earlier two-square-voice contract and are kept as history.

- Profile: era-inspired small wavetable/custom family. Not an emulation of any specific board.
- Voices (4, mono): 0 player (fire, swap), 1 consequence and jingles, 2 LFSR noise only,
  3 cabinet (warning, tune bass, ambient). Gains .05/.06/.07/.045, no master processing.
- Primitives: 32-step 4-bit wavetables `pulse`, `organ`, `soft`, `buzz` (PeriodicWave),
  15-bit LFSR noise clocked at 16 kHz (pitch via playback rate), 4-bit volume per note,
  pitch registers updated once per 60 Hz tick (sweeps are stairs), 1 ms attack / 3 ms release.
- Programs: 18 (fire, swap, hit, block, transfer, intercept, interceptRouted, enemyFire, warn, boom,
  death, ready, clear, win, over, extend, start, bossIn). A program has one part per voice; parts arbitrate independently.
- Budgets: sfx <= .6 s, jingle <= 1.6 s, tune <= 4 s; <= 24 steps per part (48 for the tune).
- Priorities: start 120, death 110, boom 108, extend 105, swap 102, fire 100, warn 90,
  interceptRouted 78, intercept 77, transfer 75, block 72, hit 70, jingles 60, enemyFire 40, ambient 10.
- Same tick: one start per voice, higher priority first, losers dropped. A busy voice with a
  higher-priority program drops the request. Jingles that lose are deferred up to 60 ticks.
- BGM mode: `event-music` plus one control axis. `ambient('beat', x)` during play plays a
  two-note low pulse on voice 3 every 44-30x ticks, x = nearest ordinary enemy depth.
  `ambient('entry')` loops a 2.88 s phrase on voice 3 during name entry. Title and pause: none.
- Lifecycle: user activation, mute, host visibility and demo gate everything. Hidden stops all
  voices; visible never replays missed one-shots; the ambient cue resumes only if still requested.

# Frozen audio contract

Era-inspired early-1980s PSG vocabulary, not hardware-faithful emulation.
Two monophonic square oscillators; output mono; no noise, effects, mastering, music,
stereo pan or randomness. Voice 0 carries player fire (gain .055); voice 1 carries
state/consequence (.065). 1ms attack and 3ms release remove discontinuity clicks.
No post gain; sum bounded well below full scale. Frequency range 65–1320 Hz.
Parameter changes occur on deterministic note boundaries. BGM mode `none`, 0 cues.
Durations: SFX <=.6s, jingles <=1.6s, <=24 steps. Actual longest SFX .46s,
longest jingle .72s; each program uses one voice. Maximum physical concurrency 2.

## Event boundary and targets

Rules emit event names -> Bus.emitBatch -> kit (`spec`) -> Adapter -> Web Audio.
Game logic never calls the synth. A mock adapter verifies gating and arbitration.

| Event | Type | Voice / priority | Intended confirmation |
|---|---|---|---|
| fire | SFX | 0 / 100 | Dry, short two-note shot, up to 3.53/second |
| swap | SFX | 1 / 65 | Three rising steps, max 3.33/second; yields to consequences |
| hit | SFX | 1 / 70 | Low two-note collapse |
| block | SFX | 1 / 72 | Bright, very short metallic rejection |
| transfer | SFX | 1 / 75 | Higher rising reward after routed impact |
| enemyFire | SFX | 1 / 40 | Quiet short low pulse |
| death | SFX | 1 / 110 | Falling four-step crash |
| ready | jingle | 1 / 60 | Two gates and a higher opening tone |
| clear | jingle | 1 / 60 | Rising four-step cadence |
| win | jingle | 1 / 60 | Five-step final cadence |
| over | jingle | 1 / 60 | Falling three-note cadence |

Movement, the silent title diagram, pause, ordinary score count changes and UI focus
are intentionally silent. Score events reuse impact sound, no second score pulse.

## Arbitration/lifecycle

Resolve unique events by descending priority once per 60Hz tick. Maximum one new
program per voice per tick: drop lower-priority same-tick requests with observable
`same-tick-drop`. An existing higher-priority program blocks a new lower-priority
request; otherwise the new program steals that voice and stops all its prior notes.
Same-tick losers never steal a voice. Repeated identical events coalesce to one request.
Fire can coexist with consequences on the other voice; ready/clear music never
stacks on another program on voice 1. No long-lived BGM tails.

User activation is required. Failed unlock remains safely silent and retries only on
input. Mute and host visibility are independent gates. Hiding or muting stops nodes;
visible does not replay missed one-shots. Pause stops sound. No continuous cue exists
to restore. Attract mode emits no events; explicit `demo` calls are gated too.

## Verification and limits

`tests/rules.cjs` checks runtime kit data (not a separately maintained manifest),
program count, voices, duration, positive note values, mute/hidden/demo/activation gates,
same-tick arbitration and repeated hidden notifications. Full engine event scenarios
exercise fire/swap/block/hit/transfer/death/ready/clear/win/over; dense browser frames
exercise enemyFire. Fixed source data is deterministic; there is no seed variation.

`tests/browser.cjs` renders all 12 programs through the real Adapter in
OfflineAudioContext and measures peak/RMS/onset/tail (`evidence/audio.json`).
Peak must be >.01 and <.2, RMS >.005, onset <10ms and tail within duration+12ms.
Co-occurrence group is fire (voice 0) + one foreground effect (voice 1): no music bed;
foreground gain exceeds fire by 1.45dB. Worst-case sum remains <.2 even allowing
band-limited square overshoot. A long jingle and consequence cannot coexist on voice 1.

Auditory identity has not been auditioned by a human; rendering is not a listening
substitute. Actual OS hidden/visible output was not captured because the headless
Chromium visibility override was unavailable. Boundary suppression and real blur event
were checked. Device speakers, Safari/Firefox audio and mobile activation are untested.

## Arcade extension event reuse

Boss arrival uses ready; both turrets lost use swap for the shutter opening; final
core hit uses transfer, then clear and win at their separate phase boundaries.
Five delayed bonus increments reuse fire on voice 0. Initial-letter changes and
confirm use fire; caret movement uses swap; completed entry uses clear. The bus
still enforces two voices and same-tick priority. Attract runs a separate engine
state without calling the audio bus and cannot write rankings. No new programs
were added; the offline 11-program measurement is rerun by browser.cjs.

## 2026-09-29 priority fix

Swap was 95 and held voice 1 for 7 ticks, so a transfer (75) or block (72) landing
within that window was priority-dropped: late gap snaps were silent. Swap is now 65,
below every consequence and above jingles/enemyFire. `tests/feel.cjs` checks a late
snap (swap then transfer both play) and an early snap onto a shield (block plays).

## Score extend cue

`extend` (jingle, voice 1, priority 105) is the twelfth program: 660-880-1320-880-1320 Hz, 0.34 s.
It outranks every consequence except death, because it is rare and changes the stock.
Bosses no longer resupply, so the old `ready` reuse at the clear boundary is removed.

## 2026-09-29 small-wavetable revision

Replaced the two square voices with the contract at the top of this file. Warnings (shifter
crossing, boss shutter and core shift, gunner anchoring) now emit `warn` instead of reusing
`enemyFire`. Core destruction adds `boom`. A new run emits `start` and the first ready wait
is 240 ticks so the tune finishes before play. Measured offline (evidence/audio.json):
peak <= .130 per program, beat quieter than warning. Not auditioned on speakers.

## Interception cues

A kill within 30 ticks of the target's lane or deck move replaces its base cue: `intercept`
(direct, 300) adds a high 1760-2093 Hz answer to the collapse; `interceptRouted` (500) extends
the transfer rise to 2637 Hz. They mark reading a move, not a score tier. Measured peak <= .095.
Human-limited policy frequency: about 0.5 per run (it does not predict moves), so they stay rare.

## Boss arrival cue

`bossIn` (jingle, priority 85, voice 3 `buzz` plus voice 2 noise) replaces the reused `ready`:
a falling 220 -> 55 Hz call over a 1 s rumble, the reverse of the rising start/clear phrases.
It outranks the final kill on the shared noise voice, so it sounds at once; the kill keeps its tone.
Its last low note ends as the drawn hull finishes its 60-tick approach.
