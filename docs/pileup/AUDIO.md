# PILEUP — sound

**Fidelity:** era-inspired. A small wavetable board in the manner of Namco's 1980 WSG, not an emulation of it.
Whether Rally-X itself used the WSG could not be confirmed by search.

## Contract (`audio.js`)

| | |
|---|---|
| Profile | `namco-wsg-inspired` |
| Voices | 3 wavetable voices (bass, lead, counter) and 1 LFSR noise voice; mono |
| Waveforms | 32 steps of 4 bits: pulse (lead), saw (counter, blips), triangle (bass), two-octave square (jingles); 16 volume levels |
| Master chain | gain 0.3 → tanh soft clipper → output; nothing else (0.55 at first, 0.4 after session s8, 0.3 on request) |
| BGM mode | layered-adaptive: sections `chase`, `getaway` (exits open), `alert` (revisited district); a counter-melody layer while 3+ police are on your tracks; tempo 132 → 168 BPM with the police speed; every change lands on a bar line |
| Key | A minor pentatonic (A C D E G) for the music and every reward/feedback sound. Declared exceptions: the siren (alarm two-tone), the van's clank, the busted fall |
| Sharing | effects take the lead or counter voice from the music (the music's note stops); the bass is never taken by an effect; noise belongs to effects |
| Same-tick policy | priority order: danger (death, siren) → consequence (crash, dent, scent) → state jingles → tallies and chimes. A loser moves to the other tone voice, else it is dropped; the emission log records each result |
| Jingles | stop the music; the music returns at the next play phase |
| Demo | demo sound off: no effects, no music |
| Host visibility | a hidden page suspends output and plays nothing; back in view, only the music the game still asks for restarts |

## Events

| Event | Kind | Sound |
|---|---|---|
| crash (pileup grows) | sfx | noise crunch longer with the pileup, tally notes a scale step higher per car |
| scent (a car picks up your tracks) | sfx | high E6–G6 double blip, above everything the music plays |
| siren (arrival) | sfx | two-tone, deliberately out of key |
| dent (van rams) | sfx | metallic clank |
| go | sfx | C–G horn |
| tally (cars left on escape) | sfx | one rising note per car |
| tick (initials) | sfx | E6 tick |
| exit, extend, clear, start, gameover, won | jingle | short phrases in key |
| death | jingle | noise crash and a falling tone |
| tow, spawn, turning, reversing | none | — (reversing had a noise squeal, then a tonal screech; removed on request after s8) |

## Measured (`tests/audio.cjs`, `tests/browser.cjs`)

- **Static checks.**
  - Every program is within budget: sfx ≤ 0.6 s, jingle ≤ 1.6 s, ≤ 24 steps.
  - Every waveform is 32 × 4 bits; every pitch is in key outside the declared exceptions.
  - Every event the page emits has a program, and every program is emitted.
  - Music loops are ≤ 32 s with nothing over the loop end, one note at a time per voice, and reproducible.
  - The skill's `validate-audio-kit.mjs` passes on a manifest derived from the runtime data
    (`reports/audio-manifest.json`): 14 programs, 3 cues, 20 events.
  - Same-tick burst (crash, scent, dent, siren): the siren and the crash both get their voices, lead/counter/noise are all in use,
    the bass stays with the music, and a chime arriving after the burst is dropped.
- **Levels** (peak through the real chain, offline), at master 0.3, 0.4 and 0.55:

| Sound | 0.3 | 0.4 | 0.55 |
|---|---|---|---|
| music bed | 0.21 | 0.28 | 0.37 |
| crash | 0.35 | 0.45 | 0.59 |
| radio blip | 0.17 alone, 0.27 over the music | 0.22, 0.36 | 0.30, 0.47 |
| siren | 0.15 | 0.20 | 0.28 |
| jingles | 0.12–0.26 | 0.16–0.34 | 0.22–0.46 |
| death | 0.27 | 0.36 | 0.47 |
| busiest burst over the music | 0.64 | 0.78 | 0.92 |

  The balance holds: radio blip against music 0.81 at 0.3.

- **Fixed along the way.** A new gain node starts at gain 1 until its first scheduled event. Three or more notes
  meeting end to end let one full-scale sample through: jingles and the siren peaked at 0.77. Every note's gain now
  starts at 0.

## Not measured

Listening by a person; the mix on real speakers.
