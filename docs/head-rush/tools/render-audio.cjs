// Render the two-PSG BGM and SE kit to WAV files for listening. node tools/render-audio.cjs
const S = require('../psg.js'), fs = require('fs'), path = require('path');
const SR = 48000, OUT = path.resolve(__dirname, '../evidence/audio'); fs.mkdirSync(OUT, { recursive: true });
function wav(name, f32) {
  const b = Buffer.alloc(44 + f32.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, name + '.wav'), b); return name + '.wav';
}
const files = [];
// one full loop of the BGM at each tempo stage, plus the power variation
for (const [tier, fright] of [[0, false], [2, false], [4, false], [6, false], [3, true]]) {
  const s = new S.Sound(SR); s.command({ t: 'music', on: true, tier, fright });
  const secs = 128 * S.TEMPO[tier] / 60; const buf = new Float32Array(Math.round(secs * SR)); s.render(buf);
  files.push(wav(`bgm-tier${tier}${fright ? '-power' : ''}`, buf) + ` (${secs.toFixed(1)} s)`);
}
// the SE kit, one after another
{ const s = new S.Sound(SR), parts = [];
  for (const k of Object.keys(S.PROGRAMS)) { s.command({ t: 'se', name: k, arg: 3 }); const b = new Float32Array(Math.round(SR * 1.2)); s.render(b); parts.push(b); }
  const all = new Float32Array(parts.reduce((a, b) => a + b.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  files.push(wav('se-kit', all) + ' (' + Object.keys(S.PROGRAMS).join(', ') + ', 1.2 s each)'); }
// a game-like mix: tier-4 BGM, engine, and a burst of play SEs
{ const s = new S.Sound(SR); s.command({ t: 'music', on: true, tier: 4, fright: false }); s.command({ t: 'engine', on: true, spd: 160 });
  const buf = new Float32Array(SR * 8), blk = SR / 10;
  for (let i = 0; i < 80; i++) { if (i % 3 === 0) s.command({ t: 'se', name: 'dot', arg: 4 }); if (i % 17 === 5) s.command({ t: 'se', name: 'shift' }); if (i === 40) s.command({ t: 'se', name: 'power' }); if (i >= 44 && i <= 60 && i % 4 === 0) s.command({ t: 'se', name: 'eat', arg: (i - 40) / 4 }); s.command({ t: 'engine', on: true, spd: 160, boost: i % 20 < 8 }); s.render(buf.subarray(i * blk, (i + 1) * blk)); }
  files.push(wav('mix-play', buf) + ' (BGM tier 4 + engine + dots, turns, power, a chain)'); }
console.log('wrote to evidence/audio:\n  ' + files.join('\n  '));
