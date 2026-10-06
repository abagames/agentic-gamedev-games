// The sound kit, rendered through the same chain the browser plays: length, steps, level at the output, key. node tests/audio.cjs
const A = require('../audio.js'), assert = require('node:assert/strict'), SR = 44100;
let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };
const peak = d => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0), rms = d => Math.sqrt(d.reduce((a, v) => a + v * v, 0) / d.length);
const R = {}; for (const k in A.SE) R[k] = A.render(A.SE[k], SR);
const len = k => R[k].length / SR, isJ = k => A.JINGLES.includes(k);
const long = Object.keys(R).filter(k => len(k) > (isJ(k) ? 1.6 : 0.65));
ok('effects stay under 0.65 s and jingles under 1.6 s', long.length === 0, long);
ok('no program has more than 24 steps', Object.keys(A.SE).every(k => A.SE[k].length <= 24));
const peaks = Object.fromEntries(Object.keys(R).map(k => [k, +peak(R[k]).toFixed(2)]));
ok('every sound peaks between 0.25 and 0.84 of full scale at the output', Object.values(peaks).every(v => v >= 0.25 && v <= 0.84), peaks);
ok('the strongest are the section torn out and the last bounce giving way', peaks['void'] >= peaks['rim:3'] && peaks['rim:break'] >= peaks['back']);
const scale = [9, 11, 0, 2, 4, 5, 7], off = [];
for (const k of A.IN_KEY) for (const s of A.SE[k]) if (s.n !== undefined && !scale.includes(s.n % 12)) off.push(k + ':' + s.n);
ok('sounds meant to agree with the music use notes of A minor', off.length === 0 && A.IN_KEY.length >= 14, off);
for (const m in A.MUSIC) {
  const d = A.render(A.MUSIC[m].prog, SR), loopN = Math.round(A.MUSIC[m].len * SR), loop = new Float32Array(loopN); for (let j = 0; j < d.length; j++) loop[j % loopN] += d[j];
  const info = { peak: +peak(loop).toFixed(2), rms: +rms(loop).toFixed(3), rim: +rms(R['rim:3'].subarray(0, 2000)).toFixed(3), target: +rms(R['target:0'].subarray(0, 2000)).toFixed(3) };
  ok('music "' + m + '" stays under the commonest sounds (rim landing, target) and does not clip', info.peak < 0.8 && info.rim > info.rms * 2 && info.target > info.rms * 2, info);
}
const rat = { step: +(peaks['ratchet'] * A.RATCHET.vol).toFixed(3), section: +(peaks['ratchet'] * A.RATCHET.section).toFixed(3), length: +(R['ratchet'].length / SR).toFixed(3) };
ok('the ratchet is a very short tick played well under a landing, the section tick a little stronger', rat.length < 0.04 && rat.step < peaks['rim:3'] / 3 && rat.section > rat.step && rat.section < peaks['rim:3'], rat);
ok('the danger cut sits above the bass line and below the broken chord', A.DANGER_HP > A.NOTE(52) * 1.5 && A.DANGER_HP < A.NOTE(67), { cut: A.DANGER_HP, bassTop: Math.round(A.NOTE(52)), chordLow: Math.round(A.NOTE(67)) });
ok('the output stage leaves a single sound almost as it is and rounds a pile-up off below full scale', Math.abs(A.master(peaks['rim:3']) - peaks['rim:3']) < 0.06 && A.master(1.9) < 0.9 && A.master(5) < 0.9 && A.master(0.1) > 0.09, { landing: +A.master(peaks['rim:3']).toFixed(2), pileUp: +A.master(1.9).toFixed(2) });
const shift = [2, 4, 5, 7, 9, 10, 0]; // D minor, the multiball's key: the reward scale (A C D E G) lies inside it too
ok('the reward scale fits both keys', A.PENTA.every(p => scale.includes(p % 12) && shift.includes(p % 12)));
console.log('audio:', n, 'passed');
