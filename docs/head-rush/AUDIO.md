# HEAD RUSH — audio contract

## Fidelity and target

- **Target board:** Sega System 1 (1983) sound section — two **SN76489A** PSGs at **2 MHz** and **4 MHz**, mixed mono
  **0.40 / 0.60** (MAME `src/mame/sega/system1.cpp`).
- **Chip behaviour (hardware-faithful at chip level),** after MAME `src/devices/sound/sn76496.cpp` for the SN76489A:
  - square tones `f = clock / (32 N)` with a 10-bit `N` (0 means 1024);
  - 16 volume levels in 2 dB steps (15 = off);
  - noise is a 17-bit shift register (feedback `0x10000`, taps `0x04` / `0x08`, XOR) shifting every 512 / 1024 / 2048 clocks
    or once per tone-3 cycle; writing the noise register resets the register;
  - no filters or hardware envelopes. Each output sample averages the chip ticks it covers (a box filter).
- **Assumption, not from a ROM:** the 60 Hz sound-driver cadence (tempo, envelopes, vibrato and arpeggios update once per frame),
  and every note, pattern and sound program, which are written for this game.

## Voices

| chip | ch0 | ch1 | ch2 | noise |
|---|---|---|---|---|
| A (2 MHz, 0.40): BGM | lead | trance-gate arpeggio | kick (pitch dive) + off-beat bass | open hat / hat / clap / snare roll |
| B (4 MHz, 0.60): SE | SE voice 1 | SE voice 2 | silent clock for the engine | engine buzz (periodic, tone-3 clocked) / noise SEs |

The BGM sits on the 2 MHz chip because the 4 MHz chip cannot reach the bass (its lowest tone is about 122 Hz).
Every BGM note is within 15 cents on the 2 MHz chip. The top-speed octave jump skips notes above E6, which would run flat.

## Arbitration (SE chip)

- Requests that land in the same 60 Hz frame are allocated together, highest priority first.
  Priorities: dot 0 · turns/wake/join/etc. 1 · power/count/feast 2 · eat and jingles 3 · crash/game over 4.
- A request takes a free voice, or the lowest-priority running voice of equal or lower priority. A request that cannot get a voice is **dropped**: no queueing, and no fade-steal.
- Two-voice jingles need both SE voices. A higher-priority SE (crash) can still take one of them.
- The noise channel goes to noise SEs over the engine. The engine re-takes the channel when they end.
- The `dot` sound is capped at one per 2 frames. `feast` starts 27 frames after its request, so it follows the refill fanfare.

## BGM (layered-adaptive, trance-techno arrangement)

- 8 bars of 16ths, Am F C G | Am F G E, 128 steps per loop. Trance and techno come from arrangement technique, not from
  timbre the chip does not have (no filter sweeps or pulse-width modulation, unlike a C64 SID):
  - **four-on-the-floor kick** on ch2: a 3-frame pitch dive (196 → 98 → 62 Hz) on every beat;
  - **off-beat pumping bass** on the same ch2, between the kicks, so one channel carries kick and bass;
  - **trance-gate arpeggio** on ch1: chord tones every 16th with 3-3-2 accents;
  - **soft pad** on ch0: two long notes per bar in the arpeggio's register, 12 dB under the powered lead, with vibrato;
  - **noise**: off-beat open hat, a clap on 2 and 4, closed 16th hats from tier 4;
  - **form**: the kick drops out in bar 7 (breakdown), and bar 8 is a snare roll into the loop start.
- One control axis, the speed tier:
  - tempo is frame-quantised: 7 / 6 / 5 / 4 frames per 16th = 129 / 150 / 180 / 225 BPM, for tiers 0–1 / 2–3 / 4–5 / 6–7;
  - layers: groove only at tiers 0–1; pad and claps from tier 2; 16th hats from tier 4; the second-half arpeggio an octave up from tier 6
    (never above E6).
- Power: ch0 becomes the only bright melody in the game, an 8th-note run up the bar's chord tones an octave up, so hearing a melody always means power. The arpeggio, bass and drums carry on, so the music stays in key.
- **In key:** every pitched play SE and jingle is in A natural minor, the key of the BGM. Dots start one scale step higher per speed tier and climb a step per dot while you eat a lane without a break (a two-note shimmer after six), each bite of a chain
  goes one scale step higher (root, diatonic fifth, octave), and the power cue is A–C–E–A. Nothing detunes with tier any more.
- The BGM plays only while the race runs (it stops for READY and crashes).
- **Start:** pressing start plays a soft 0.6 s jingle at the top of the first READY (a rise up the A minor chord to a held E5, each note fading,
  about 4 dB under the other jingles); the BGM starts when READY ends. The short `go` cue is kept for GO AGAIN after a crash and is not played on top of the start jingle. A cue requested while the audio
  is still being unlocked by that same key press is held for up to 0.5 s and played once the chips exist.

## Mix

Levels are RMS relative to the tier-4 BGM, all set with the chips' 2 dB attenuation steps:
- feedback SEs: dot about −3.5 dB (kept under the BGM on purpose: it is the most frequent sound), turn −1, wake +1.5, join / new leader / power end about −1 to −3;
  the rival's turn is subtle (−6);
- bites and crashes +2 to +4, jingles +3 to +6;
- the engine buzz −13, a background bed that never covers the dots.

Dots sit an octave above the BGM's lead and arpeggio (880–3136 Hz on the A minor scale) and last 3 frames.
Short control cues: the second lane crossed in one gap adds a rising E–A to the turn noise, the double blinker lighting gives a 2-frame A6 tick, and pressing full throttle gives a short noise burst.
Master gain 2.2 puts the worst overlap tested (top-speed BGM, boosting engine, crash + bite + jingle) at a peak of 0.88.

## Validation

- `node tests/audio.cjs` (39 checks): tone frequency, 10-bit pitches, 2 dB volume table, periodic vs white noise,
  same-frame allocation and drops, jingle voices, crash pre-emption, engine hand-over, SE ≤ 0.6 s and ceremonies ≤ 1.6 s,
  event coverage, BGM loop / tempo / four-on-the-floor / off-beat bass / gate arpeggio / layers / build / power / 15-cent pitch accuracy, determinism, no clipping, SE
  louder than BGM, mute.
- Browser: runs in an **AudioWorklet** when served over HTTP. A `file://` page cannot load the worklet, so the same model runs in a ScriptProcessorNode
  (deprecated, but it works). A synthetic `visibilitychange` suspends and resumes it.
- `node tools/render-audio.cjs` writes WAVs to `evidence/audio/` for listening: a BGM loop per tempo stage, the power variation,
  the whole SE kit and a game-like mix.

## Not verified

Listening on real speakers or headphones; the BGM's musical quality; how the loudness balance feels during play.
