# OVERTURN — sound

Game code names events (`rim:3`, `target:4`, `bank`); `audio.js` owns the programs. A program is a
list of two-operator FM notes and filtered-noise bursts, rendered by one fixed chain (sum, gain,
soft clip at 0.84) into a buffer. `tests/audio.cjs` renders every program through that chain in
Node and checks length, step count, peak level and key.

- Effects (repeated, under 0.65 s): landing by wear (3 programs), section gives way, steel back,
  target bell (10 steps of A minor pentatonic), bank stands up, launch, lock, skill shot, saved,
  one ball lost, section torn out, bonus tick, round ready, round over.
- Jingles (rare, under 1.6 s): start, round start, bank, jackpot, super jackpot, multiball, extra ball, ball lost, game over.
- Turning: a ratchet. One 12 ms tick for every third of a section turned (10 degrees), about fourteen a second at full rate (0.05 of full scale), lower and stronger as a section boundary passes (0.09). No continuous tone.
- Danger: with eight landings or fewer left in the rim the music passes through a 320 Hz high-pass (its bass line drops out) and a two-note warning, deliberately out of key, repeats every 2.5 s.
- Added effects: edge-catch ping, a bank's three targets clicking up in turn, brake click, thrown-landing whoosh (level and pitch by strength), hub countdown tick. Landings are played faster or slower with their speed.
- No sound: a lamp lighting (the landing already sounds), pause.
- Music: yes. Reason: the period's boards and the reference pinball both carry a bed, and the
  multiball needs a change that is heard, not read. One four-bar FM loop in A minor (bass and a
  broken chord, 132 bpm); the multiball plays it a fourth up at 160 bpm. It stops when a ball is
  lost and during attract.
- Key: reward sounds use A C D E G, which lies in both A minor and the multiball's D minor.
  Landings, slides and noises are unpitched or deliberately outside it.
- Measured peaks at the output: 0.25 (bonus tick) to 0.76 (section torn out); landings 0.51-0.57,
  targets 0.46; music loop peak 0.37, RMS 0.06 against 0.19-0.20 for a landing or a target.
- Output stage: gain 0.7 into a soft clip, tanh(1.4 x). A single sound passes almost unchanged (a landing: 0.51 in, 0.46 out); sounds landing together, which sum to 1.9 in an ordinary multiball, are rounded off at 0.89 instead of being cut square by the device.
- Heard only in part: the player commented on the turning tick; the rest of the kit has levels that are computed, not judged by ear.
