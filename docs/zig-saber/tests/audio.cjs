// Audio contract on the chip model (no browser). node tests/audio.cjs
const S = require('../psg.js'), fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
const main = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
const used = new Set([...main.matchAll(/play\((?:[^'()]*\? *)?'([a-z]+)'(?: *: *'([a-z]+)')?/g)].flatMap(m => [m[1], m[2]]).filter(Boolean));
const names = Object.keys(S.PROGRAMS);
ok('every sound the game asks for exists in the kit', [...used].every(u => names.includes(u)), [...used].filter(u => !names.includes(u)));
ok('every program in the kit is asked for by the game', names.every(u => used.has(u)), names.filter(u => !used.has(u)));
const LONG = ['death', 'gameover', 'start', 'zone', 'loop', 'extend', 'entry']; // ceremony: up to 1.6 s
const len = {}; let voicesOk = true;
for (const k of names) {
  const p = S.PROGRAMS[k](2); const frames = Math.max(...(p.tones || []).map(t => t.length), p.noise ? p.noise.length : 0); len[k] = frames;
  if ((p.tones || []).length > 2) voicesOk = false;
  for (const t of p.tones || []) for (const [f, a] of t) assert.ok(f >= 0 && f < 6000 && a >= 0 && a <= 15, k);
}
ok('effects last at most 0.6 s, ceremony at most 1.6 s', names.every(k => len[k] <= (LONG.includes(k) ? 96 : 36)), len);
ok('no program wants more than two tone voices and the noise voice', voicesOk);
ok('only ceremony outranks the death sound', names.filter(k => S.PROGRAMS[k](1).prio >= S.JINGLE).every(k => LONG.includes(k)));
// BGM
{
  const a = JSON.stringify(Array.from({ length: S.STEPS }, (_, i) => S.stepEvents(i, 0, 0))), b = JSON.stringify(Array.from({ length: S.STEPS }, (_, i) => S.stepEvents(i, 0, 0)));
  ok('the BGM is a fixed 128-step loop', a === b && S.STEPS === 128);
  let lo = 999, hi = 0, bars = 0;
  for (let z = 0; z < 3; z++) for (let i = 0; i < S.STEPS; i++) { const e = S.stepEvents(i, z, 0); for (const m of [e.lead, e.bass, e.arp]) if (m > 0) { lo = Math.min(lo, m); hi = Math.max(hi, m); } if (i % 16 === 0 && e.bass > 0 && e.lead > 0) bars++; }
  ok('every bar opens with bass and lead, all notes inside the chip range', bars === 24 && S.midiHz(lo) >= 3579545 / (32 * 1023) && hi <= 96, { lo, hi });
  ok('zones change key and arrangement, loops change tempo', S.stepEvents(0, 1, 0).lead === S.stepEvents(0, 0, 0).lead - 5 && S.stepEvents(1, 1, 0).arp === 0 && S.stepEvents(1, 2, 0).drum === 'tick' && S.stepEvents(0, 0, 3).frames < S.stepEvents(0, 0, 0).frames);
}
{
  const cue = Array.from({ length: S.B_STEPS }, (_, i) => S.stepEvents(i, S.GATE, 0, false)); let lo = 999, hi = 0;
  for (const e of cue) for (const m of [e.lead, e.bass]) if (m > 0) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
  ok('the gate has its own cue: a 64-step loop, bass on every 16th, no arpeggio, inside the chip range', S.B_STEPS === 64 && cue.every(e => e.bass > 0 && e.arp === 0) && JSON.stringify(S.stepEvents(64 + 5, S.GATE, 0)) === JSON.stringify(cue[5]) && S.midiHz(lo) >= 3579545 / (32 * 1023) && hi <= 96 && JSON.stringify(cue) !== JSON.stringify(Array.from({ length: 64 }, (_, i) => S.stepEvents(i, 2, 0))), { lo, hi });
  ok('it is faster than any zone, and faster still in overdrive', cue[0].frames < S.stepEvents(0, 2, 0).frames + 1 && cue[0].frames === 4 && S.stepEvents(0, S.GATE, 0, true).frames === 3);
  const m = new S.Music(new S.PSG(3579545)); m.set(true, 2, 0); for (let i = 0; i < 100; i++) m.frame(); const before = m.step; m.set(true, S.GATE, 0); 
  ok('entering the gate restarts the music on the cue\'s first bar', before > 0 && m.step === 0 && m.fi === 0);
  const s = new S.Sound(44100); s.command({ t: 'music', on: true, zone: S.GATE, loop: 0, hot: true }); const o = new Float32Array(44100 * 2); s.render(o); let pk = 0, sq = 0; for (const v of o) { pk = Math.max(pk, Math.abs(v)); sq += v * v; }
  ok('the gate cue is audible and does not clip', Math.sqrt(sq / o.length) > 0.03 && pk < 0.7, { peak: +pk.toFixed(3) });
}
// arbitration and rendering
const SR = 44100, render = (snd, sec) => { const o = new Float32Array(Math.round(SR * sec)); snd.render(o); let pk = 0, sq = 0; for (const v of o) { pk = Math.max(pk, Math.abs(v)); sq += v * v; } return { peak: +pk.toFixed(3), rms: +Math.sqrt(sq / o.length).toFixed(4) }; };
{
  const s = new S.Sound(SR); s.command({ t: 'se', name: 'turn' }); s.command({ t: 'se', name: 'cut', arg: 2 }); s.command({ t: 'se', name: 'death' }); render(s, 0.02);
  const log = s.se.log.map(l => l.name + ':' + l.voices + (l.noise ? 'n' : ''));
  ok('same tick: the highest priority takes the voices, the rest is dropped whole or in part', log[0] === 'death:1n' && s.se.slot.filter(Boolean).some(v => v.name === 'death') && s.se.nslot.name === 'death', log);
  const t = new S.Sound(SR); let acc = 0; for (let i = 0; i < 6; i++) { if (t.se.request('turn')) acc++; t.se.frame(); }
  ok('the dry click cannot restart more often than every third tick', acc === 2, acc);
}
{
  const s = new S.Sound(SR); s.command({ t: 'music', on: true, zone: 0, loop: 0 }); const m = render(s, 3);
  ok('BGM alone: audible, far from clipping', m.rms > 0.03 && m.peak < 0.6, m);
  const storm = ['shot', 'cut', 'far', 'beam', 'cap', 'gem', 'ping', 'heavy', 'spark', 'turn']; let k = 0, worst = 0;
  for (let i = 0; i < 180; i++) { if (i % 4 === 0) s.command({ t: 'se', name: storm[k++ % storm.length], arg: k % 4 }); const o = new Float32Array(735); s.render(o); for (const v of o) worst = Math.max(worst, Math.abs(v)); }
  ok('BGM under an effect every 4 ticks never clips', worst <= 1.0, +worst.toFixed(3));
  s.command({ t: 'music', on: false }); render(s, 1.2); const q = render(s, 0.5);
  ok('music off and effects over: silence', q.peak < 0.26 && q.rms < 0.26, q); // a square chip rests at a DC level, not at zero
  s.command({ t: 'mute', muted: true }); s.command({ t: 'se', name: 'death' }); ok('mute is silent', render(s, 0.3).peak === 0);
}
{
  // AC level (standard deviation) over each program's own length
  const lv = {}; for (const k of names) { const s = new S.Sound(SR); s.command({ t: 'se', name: k, arg: 2 }); const o = new Float32Array(Math.round(SR * len[k] / 60)); s.render(o); let m = 0; for (const v of o) m += v; m /= o.length; let q = 0; for (const v of o) q += (v - m) * (v - m); lv[k] = +Math.sqrt(q / o.length).toFixed(3); }
  ok('every program makes sound', names.every(k => lv[k] > 0.02), lv);
  ok('the cut is louder than the far pop and the shot, the shot louder than the dry click', lv.cut > lv.far && lv.cut > lv.shot && lv.shot > lv.turn, { cut: lv.cut, far: lv.far, shot: lv.shot, turn: lv.turn });
}
console.log(n + ' checks passed');
