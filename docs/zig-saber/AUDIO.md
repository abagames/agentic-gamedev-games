# ZIG SABER — audio

## Contract

- **Fidelity:** era-inspired, hardware-modelled. Two SN76489A PSGs at 3.579545 MHz (three square voices + one noise
  voice each), written to by a 60 Hz driver. The chip model (pitch quantisation, 2 dB volume steps, 17-bit noise LFSR)
  follows MAME `sn76496.cpp`. It is not the sound driver or the music of any real game.
- **Voices:** chip A = BGM (lead, arpeggio, bass, drums on noise). Chip B = effects and jingles (two tone voices +
  noise). The BGM is never interrupted by an effect.
- **BGM mode:** fixed loop, 8 bars / 128 sixteenths in E minor (Em Em C D | Em Em C B). The zone sets key and
  arrangement (canyon: full; cavern: a fourth down, no arpeggio; fortress: a minor third up, 16th ticks). The loop
  number sets tempo (5, 5, 4, 4 frames per sixteenth; raised with the game speed). Music plays only while the ship is flying.
  The gate has its own cue: a 4-bar, 64-step pedal riff (E E C B) with the bass on every sixteenth, stab lead and a
  chromatic fall into the repeat, no arpeggio, 4 frames per sixteenth (225 BPM) and 3 in overdrive. It starts from its
  first bar when the gate has arrived, and the zone music starts over when the gate is gone.
- **Arbitration:** all requests of one tick are allocated together, highest priority first; a program that gets no
  voice is dropped, not queued. Order: death / game over > ceremony jingles > cut, beam, capsule, armour > far kill, ping,
  warning > shot, gem > dry click, spark. Repeat caps: dry click and spark 3 ticks, gem 2 ticks.
- **Budgets:** effects ≤ 0.6 s, ceremony (start, zone, loop, extend, entry, death, game over) ≤ 1.6 s.
- **Host:** audio starts on the first button press. Attract mode is silent. A hidden page suspends the context and
  pauses the game; `M` mutes.
- **Boundary:** `core.js` emits events → `main.js` `consume()` maps them to program names → `audio.js` → `psg.js`
  (AudioWorklet, ScriptProcessor fallback running the same code).

## Event map

| moment | program | target |
|---|---|---|
| press, shot leaves | `shot` | dry narrow zap, falls an octave in 0.1 s |
| press, shot still out | `turn` | dull low click: "you turned, you did not fire" |
| blade cuts n enemies | `cut(n + chain)` | hard noise chop + ring, one scale step higher per extra enemy and per chain level |
| shell opened by the blade | `heavy` | low sweep + noise + high ring |
| far kill | `far` | small falling pop, quieter than a cut |
| shot deflected by a shell | `ping` | three high notes, no noise |
| a cut made with a lengthened blade | `beam` layered under `cut` | two detuned squares falling 3 octaves |
| blade / shot / enemy on rock | `spark` | 3-frame noise tick |
| whole train destroyed | `capdrop` | three rising notes |
| capsule taken | `cap` | five-note rising arpeggio, two voices |
| gem | `gem(chain)` | two-note blip, higher with the chain |
| rusher warning | `warn` | four beeps |
| laser level spent as armour | `guard` | noise hit + octave flip + high ring |
| gate arrives | `warn`, then the gate cue | |
| core hit | `heavy` | |
| gate starts to leave | `warn`, then `spark` ticks while it pulls away | |
| gate destroyed / gate got away | `death` then `loop` / `gameover` | |
| ship lost | `death` | 0.7 s falling sweep + 1 s noise |
| game start / READY after a loss | `start` | jingle |
| zone entered | `zone` | short fanfare |
| loop cleared | `loop` | long fanfare |
| extend | `extend` | trill |
| game over | `gameover` | falling phrase |
| a score goes onto the BEST 5 | `entry` | jingle |

No sound: ship motion, enemy motion, scrolling.

## Checks (`node tests/audio.cjs`)

Every name the game requests exists and every program is used; durations and voice counts within budget; BGM is a
deterministic 128-step loop with all notes inside the chip's range (this caught a bass line below the chip's 110 Hz
floor); same-tick arbitration; repeat cap; rendered output never clips under one effect every 4 ticks over the BGM;
silence when off; mute; every program audible; cut louder than far, shot louder than the dry click.
The browser test checks that attract is silent and that hiding the page suspends audio.

## Listening risk

Levels and timbres were checked by measurement only. Nobody has listened to this kit during play yet.
