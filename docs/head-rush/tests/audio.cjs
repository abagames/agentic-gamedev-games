// Audio contract for the two-SN76489A model (psg.js). node tests/audio.cjs
const assert = require('node:assert/strict');
const S = require('../psg.js'), HR = require('../core.js'), B = require('../bots.js');
let n = 0; const ok = (name, c, info) => { assert.ok(c, name + ' ' + JSON.stringify(info)); n++; console.log('PASS', name, info !== undefined ? JSON.stringify(info) : ''); };

// --- chip behaviour ---
{
  const p = new S.PSG(4000000); p.tone(0, 284); p.vol(0, 0); let tog = 0, prev = p.out[0];
  for (let i = 0; i < p.tickRate; i++) { p.tick(); if (p.out[0] !== prev) { tog++; prev = p.out[0]; } }
  const f = tog / 2, want = 4000000 / (32 * 284);
  ok('tone frequency is clock / (32 N)', Math.abs(f - want) / want < 0.005, { f, want: +want.toFixed(1) });
  ok('only 10-bit periods: every requested pitch maps to an integer 1..1023', [20, 61, 122, 440, 5000, 20000].every(hz => { const q = p.nOf(hz); return Number.isInteger(q) && q >= 1 && q <= 1023; }));
  ok('volume has 16 levels of 2 dB, 15 = off', S.VOL.length === 16 && Math.abs(S.VOL[1] / S.VOL[0] - Math.pow(10, -2 / 20)) < 1e-6 && S.VOL[15] === 0);
  const seqOf = (mode, k) => { const q = new S.PSG(4000000); q.noise(mode); const out = []; for (let i = 0; i < k; i++) { for (let t = 0; t < 32; t++) q.tick(); out.push(q.out[3]); } return out.join(''); };
  const per = seqOf(0, 200), wh = seqOf(4, 400);
  const period = s => { for (let L = 2; L < 80; L++) { let same = true; for (let i = 40; i < s.length - L; i++) if (s[i] !== s[i + L]) { same = false; break; } if (same) return L; } return -1; };
  ok('periodic noise repeats with a short fixed period', period(per) > 0 && period(per) <= 17, period(per));
  ok('white noise does not repeat within 400 shifts', period(wh) === -1);
}
// --- arbitration on the SE chip (2 tone voices + noise) ---
{
  const s = new S.Sound(48000), buf = new Float32Array(800);
  s.command({ t: 'se', name: 'wake' }); s.command({ t: 'se', name: 'power' }); s.command({ t: 'se', name: 'eat', arg: 2 }); s.render(buf);
  const L = s.se.log.slice(-3);
  ok('three tone SEs in one frame: the two highest priorities play, the lowest is dropped', L.find(x => x.name === 'eat').voices === 1 && L.find(x => x.name === 'power').voices === 1 && L.find(x => x.name === 'wake').voices === 0, L);
  ok('never more than 2 tone SE voices at once', s.se.busy() <= 2);
  const j = new S.Sound(48000); j.command({ t: 'se', name: 'go' }); j.command({ t: 'se', name: 'wake' }); j.render(buf);
  const J = j.se.log; ok('a two-voice jingle takes both voices; a lower SE in the same frame is dropped', J.find(x => x.name === 'go').voices === 2 && J.find(x => x.name === 'wake').voices === 0, J);
  j.command({ t: 'se', name: 'crash' }); j.render(buf);
  ok('a higher-priority SE (crash) takes a voice from a running jingle', j.se.log.find(x => x.name === 'crash').voices === 1);
  const e = new S.Sound(48000); e.command({ t: 'engine', on: true, spd: 120 }); e.render(new Float32Array(1600));
  ok('engine buzz = periodic noise clocked by tone 3', e.B.noiseReg === 3 && e.B.att[3] < 15 && e.B.att[2] === 15);
  e.command({ t: 'se', name: 'shift' }); e.render(new Float32Array(1600)); ok('a noise SE takes the noise channel from the engine', e.B.noiseReg === 4);
  e.render(new Float32Array(48000 >> 2)); ok('the engine comes back when the noise SE ends', e.B.noiseReg === 3);
}
// --- program budgets and event coverage ---
{
  const len = p => Math.max(0, ...(p.tones || []).map(t => t.length), (p.noise || []).length) + (p.delay || 0);
  const lens = {}; for (const k in S.PROGRAMS) lens[k] = len(S.PROGRAMS[k](3));
  const ceremony = new Set(['crash', 'gameover', 'feast']); // crash plays over the 1.3 s crash freeze; feast waits for the refill fanfare
  const over = Object.entries(lens).filter(([k, v]) => v > ((S.PROGRAMS[k](3).prio >= S.JINGLE || ceremony.has(k)) ? 96 : 36));
  ok('SE <= 0.6 s, jingles/ceremony <= 1.6 s (in 60 Hz frames)', over.length === 0, over.length ? over : lens);
  ok('the start jingle is short (<= 0.7 s), soft (never louder than attenuation 5) and ends on the dominant E', lens.start <= 42 && S.PROGRAMS.start().tones.every(v => v.every(([, a]) => a >= 5)) && Math.round(S.PROGRAMS.start().tones[0].at(-1)[0]) === 659, lens.start);
  { const st = HR.create(3), firsts = []; for (let i = 0; i < 60 * 200 && st.phase !== 'over'; i++) { HR.step(st, {}); for (const e of st.events) if (e.type === 'go') firsts.push(!!e.first); }
    ok('only the first go of a game is marked first (the start jingle replaces its cue); restarts after a crash are not', firsts.length >= 2 && firsts[0] === true && firsts.slice(1).every(f => !f), firsts); }
  ok('no program uses more than the 2 SE tone voices', Object.keys(S.PROGRAMS).every(k => (S.PROGRAMS[k](3).tones || []).length <= 2));
  const seen = new Set();
  for (const opt of [{}, { course: 3 }]) { const st = HR.create(3, opt), pol = B.human(3); while (st.phase !== 'over') { HR.step(st, pol(st)); for (const e of st.events) seen.add(e.type); } }
  const SILENT = new Set(['park', 'morph']), resolve = t => t === 'shift' ? ['shift', 'rshift'] : [t];
  const missing = [...seen].filter(t => !SILENT.has(t) && !resolve(t).every(x => S.PROGRAMS[x]));
  ok('every emitted game event has a sound or is declared silent', missing.length === 0, { missing });
}
// --- BGM data (trance-techno arrangement) ---
{
  const ev = (tier, fr) => Array.from({ length: 128 }, (_, i) => S.stepEvents(i, tier, fr));
  const e0 = ev(0, false), e2 = ev(2, false), e4 = ev(4, false), e6 = ev(6, false), ef = ev(3, true);
  ok('tempo is frame-quantised and rises with tier (129 -> 225 BPM)', JSON.stringify(S.TEMPO) === '[7,7,6,6,5,5,4,4]');
  { const p = new S.PSG(2000000), m = new S.Music(p); m.set(true, 3, false); const spf = S.TEMPO[3]; const seen = [];
    for (let f = 0; f < 128 * spf + 1; f++) { if (m.fi === 0) seen.push(m.step); m.frame(); }
    ok('the BGM loop is 128 steps (8 bars) and wraps back to step 0', seen.length === 129 && seen[0] === 0 && seen[127] === 127 && seen[128] === 0, seen.slice(-3)); }
  const bar = i => i >> 4, st = i => i & 15;
  ok('four-on-the-floor kick on every beat, dropped only in the breakdown bar (7)', e2.every((e, i) => e.kick === (st(i) % 4 === 0 && bar(i) !== 6)));
  ok('the bass only plays off the beat (pumping), never with the kick', e2.every((e, i) => !e.bass || (st(i) % 4 === 2 && !e.kick)) && e2.filter(e => e.bass).length >= 26);
  ok('the trance-gate arpeggio runs every 16th with 3-3-2 accents', e0.every(e => e.arp && e.arp.note > 0) && e0.slice(0, 16).map(e => e.arp.accent ? 'x' : '.').join('') === 'x..x..x.x..x..x.');
  ok('no lead at tiers 0-1, a two-notes-per-bar pad from tier 2', e0.every(e => e.lead <= 0) && e2.filter(e => e.lead > 0).length === 16 && e2.every((e, i) => (e.lead > 0) === (st(i) % 8 === 0)));
  { // the unpowered pad is far quieter than the powered lead and sits below it, so a bright melody always means power
    const peak = fr => { const p = new S.PSG(2000000), m = new S.Music(p); let lo = 15, top = 0; const v = p.vol.bind(p), tn = p.tone.bind(p); p.vol = (c, a) => { if (c === 0) lo = Math.min(lo, a); v(c, a); }; p.tone = (c, n) => { if (c === 0) top = Math.max(top, 2000000 / (32 * n)); tn(c, n); };
      m.set(true, 3, fr); for (let f = 0; f < 128 * S.TEMPO[3]; f++) m.frame(); return { lo, top }; };
    const pad = peak(false), pow = peak(true);
    ok('the pad is at least 10 dB under the powered lead and never above E5', (pad.lo - pow.lo) * 2 >= 10 && pad.top < 680 && pow.top > 1000, { pad, pow }); }
  ok('closed 16th hats from tier 4, claps on 2 and 4 from tier 2', e4.filter(e => e.drum === 'hat').length > e2.filter(e => e.drum === 'hat').length && e2[4].drum === 'clap' && e0[4].drum !== 'clap');
  ok('bar 8 builds with a snare roll that doubles in the second half', e2.slice(112, 120).filter(e => e.drum === 'snare').length === 4 && e2.slice(120, 128).every(e => e.drum === 'snare'));
  ok('top tiers lift the second-half arpeggio an octave (never above E6)', e6[64].arp.note === e2[64].arp.note + 12 && e6.every(e => e.arp.note <= 88));
  // in key: every powered note is a tone of that bar's chord (in any octave), and the arpeggio is unchanged
  const CH = [[69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74], [69, 72, 76], [65, 69, 72], [67, 71, 74], [64, 68, 71]];
  const inChord = (m, bar) => CH[bar].some(c => (m - c) % 12 === 0);
  ok('power: the lead runs up the chord tones and stays in key; the arpeggio carries on unchanged', ef.every((e, i) => e.lead <= 0 || inChord(e.lead, i >> 4)) && ef.filter(e => e.lead > 0).length === 64 && ef.every((e, i) => JSON.stringify(e.arp) === JSON.stringify(ev(3, false)[i].arp)));
  { // pitched play SEs are in A natural minor (a note counts if it is within 25 cents of a scale degree)
    const deg = [9, 11, 0, 2, 4, 5, 7]; const inKey = f => { const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m); return Math.abs(m - r) < 0.25 && deg.includes(((r % 12) + 12) % 12); };
    const notes = []; for (const [k, arg] of [['dot', 0], ['dot', 4], ['dot', 7], ['eat', 1], ['eat', 4], ['eat', 9], ['power', 0], ['truck', 2], ['refill', 6], ['halfclear', 0], ['extend', 0], ['go', 0], ['start', 0]]) for (const v of S.PROGRAMS[k](arg).tones || []) for (const [f] of v) if (f > 0) notes.push([k, Math.round(f)]);
    const off = notes.filter(([, f]) => !inKey(f)); ok('pitched play SEs and jingles are in the BGM key (A minor)', off.length === 0, off.slice(0, 6)); }
  ok('the power SE is an in-key A minor arpeggio', S.PROGRAMS.power().tones[0].map(f => Math.round(f[0])).filter((v, i, a) => a.indexOf(v) === i).join() === '440,523,659,880');
  ok('bass stays in its register', [e0, e6].flat().every(e => !e.bass || (e.bass >= 40 && e.bass <= 60)));
  { const p = new S.PSG(2000000); let worst = 0; for (const t of [0, 2, 4, 6]) for (const fr of [false, true]) for (let i = 0; i < 128; i++) { const e = S.stepEvents(i, t, fr);
      for (const m of [e.lead, e.bass, e.arp.note]) if (m > 0) { const f = S.midiHz(m), c = 1200 * Math.log2(2000000 / (32 * p.nOf(f)) / f); worst = Math.max(worst, Math.abs(c)); } }
    ok('every BGM note is within 15 cents on the 2 MHz chip', worst <= 15, +worst.toFixed(1)); }
  ok('the kick dive stays inside the 2 MHz chip range (lowest ~61 Hz)', new S.PSG(2000000).nOf(62) <= 1023);
}
// --- output ---
{
  const mk = () => { const s = new S.Sound(48000); s.command({ t: 'music', on: true, tier: 5, fright: false }); s.command({ t: 'engine', on: true, spd: 200, boost: true }); return s; };
  const a = mk(), b = mk(), x = new Float32Array(48000), y = new Float32Array(48000);
  for (const s of [a, b]) { s.command({ t: 'se', name: 'eat', arg: 5 }); s.command({ t: 'se', name: 'power' }); }
  a.render(x); b.render(y); ok('same commands give the same samples', x.every((v, i) => v === y[i]));
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); ok('no clipping under BGM + engine + two SEs', peak < 1, +peak.toFixed(3));
  const rms = buf => Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
  const m = new S.Sound(48000); m.command({ t: 'music', on: true, tier: 3 }); const mb = new Float32Array(48000); m.render(mb);
  const q = new S.Sound(48000); q.command({ t: 'se', name: 'eat', arg: 3 }); const qb = new Float32Array(9000); q.render(qb);
  { let worst = 0; for (const combo of [['crash', 'eat', 'extend'], ['eat', 'truck', 'refill'], ['gameover', 'crash'], ['go', 'shift', 'dot']]) {
      const w = new S.Sound(48000); w.command({ t: 'music', on: true, tier: 6 }); w.command({ t: 'engine', on: true, spd: 220, boost: true });
      const wb = new Float32Array(48000 * 2); w.render(wb.subarray(0, 4800)); for (const k of combo) w.command({ t: 'se', name: k, arg: 5 }); w.render(wb.subarray(4800));
      for (const v of wb) worst = Math.max(worst, Math.abs(v)); }
    ok('no clipping in the worst overlaps (top-speed BGM, boosting engine, crash + eat + jingle)', worst < 0.95, +worst.toFixed(3)); }
  { const lvl = (cmds, n) => { const z = new S.Sound(48000); for (const c of cmds) z.command(c); const zb = new Float32Array(n); z.render(zb); return rms(zb); };
    const bgm = lvl([{ t: 'music', on: true, tier: 4 }], 48000 * 2), dot = lvl([{ t: 'se', name: 'dot', arg: 3 }], 2400), eng = lvl([{ t: 'engine', on: true, spd: 150 }], 48000);
    ok('the dot blip sits a little under the BGM (2-6 dB) and clearly above the engine, which is well below both', dot <= bgm * 0.8 && dot >= bgm * 0.5 && dot > eng * 1.5 && eng < bgm * 0.4, { bgm: +bgm.toFixed(4), dot: +dot.toFixed(4), engine: +eng.toFixed(4) }); }
  ok('an SE stands out over the BGM (louder RMS)', rms(qb) > rms(mb), { bgm: +rms(mb).toFixed(3), se: +rms(qb).toFixed(3) });
  const z = mk(); z.command({ t: 'mute', muted: true }); const zb = new Float32Array(4800); z.render(zb); ok('mute outputs silence', zb.every(v => v === 0));
}
console.log(n, 'audio checks passed');
