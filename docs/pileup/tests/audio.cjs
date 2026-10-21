// node tests/audio.cjs — the sound kit's contract, from its own runtime data:
//   every effect and jingle within budget; every event the page emits has a program; pitches in A minor pentatonic
//   except declared alarms; music loops within budget, one note at a time per voice, nothing hanging over the loop;
//   voice arbitration under a same-tick burst; and the generic manifest through the skill's validator.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const SFX = require('../audio.js').SFX;   // the file's 'this' is module.exports under Node
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const CAP = { sfx: 0.6, jingle: 1.6 }, STEPS = 24, LOOP_MAX = 32;
const ARGS = [0, 1, 2, 3, 6, 12];
const noteName = (n) => n && n.replace(/\d+$/, '').replace('#', '#');

// programs
for (const [name, fn] of Object.entries(SFX.PROGRAMS)) for (const arg of ARGS) {
  const p = fn(arg), len = SFX.length(p);
  ok(len <= CAP[p.kind] && p.steps.length <= STEPS, `${name}(${arg}) ${p.kind} ${len.toFixed(2)}s ${p.steps.length} steps`);
  ok(p.steps.every(s => s.d > 0 && s.t >= 0 && Number.isFinite(s.d)), `${name} has a bad step`);
  ok(p.steps.every(s => s.v >= 0 && s.v <= 15 && Number.isInteger(s.v)), `${name} volume outside 4 bits`);
  if (!SFX.OUT_OF_KEY[name]) for (const s of p.steps) if (s.voice !== 'noise') {
    ok(!s.f0 && SFX.KEY.has(noteName(s.n0)[0]) && SFX.KEY.has(noteName(s.n1)[0]) && !s.n0.includes('#'), `${name}: ${s.n0 || s.f0} not in A minor pentatonic`);
  }
}
for (const w of Object.values(SFX.WAVES)) ok(w.length === 32 && w.every(v => Number.isInteger(v) && v >= 0 && v <= 15), 'a waveform is not 32 x 4 bits');
// events the page emits
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const emitted = new Set([...main.matchAll(/(?:sfx|SFX\.play)\('(\w+)'/g)].map(m => m[1]));
for (const e of emitted) ok(SFX.PROGRAMS[e], `no program for event ${e}`);
for (const p of Object.keys(SFX.PROGRAMS)) ok(emitted.has(p), `program ${p} is never emitted`);
// music
for (const section of Object.keys(SFX.SECTIONS)) for (const heat of [0, 3, 6]) for (const line of [false, true]) {
  const tl = SFX.timeline(section, SFX.tempoFor(heat), line), per = {};
  ok(tl.loop <= LOOP_MAX, `${section} loop ${tl.loop}s`);
  for (const n of tl.notes) {
    ok(SFX.KEY.has(n.n[0]) && !n.n.includes('#'), `${section} ${n.voice} ${n.n} out of key`);
    ok(n.t + n.d <= tl.loop + 1e-9, `${section} ${n.voice} note hangs over the loop`);
    (per[n.voice] = per[n.voice] || []).push(n);
  }
  ok(Object.keys(per).length <= 3 && !per.noise, `${section} uses ${Object.keys(per)}`);
  for (const [v, ns] of Object.entries(per)) { ns.sort((a, b) => a.t - b.t); for (let i = 1; i < ns.length; i++) ok(ns[i].t >= ns[i - 1].t + ns[i - 1].d - 1e-9, `${section} ${v} overlaps at ${ns[i].t}`); }
  const tl2 = SFX.timeline(section, SFX.tempoFor(heat), line);
  ok(JSON.stringify(tl) === JSON.stringify(tl2), 'music timeline not reproducible');
}
// arbitration: the densest same-tick burst the game makes — a reversal into a pileup as a car takes the tracks and
// an arrival is announced
{
  const V = SFX.newVoices(), got = {};
  for (const [n, a] of [['crash', 4], ['scent'], ['dent'], ['siren']]) got[n] = SFX.allocate(n, SFX.PROGRAMS[n](a), 0, V);
  ok(got.siren.tone && got.crash.noise === 'noise', 'the siren and the crash both get their voices');
  ok(got.siren.tone === 'lead' || got.siren.tone === 'counter', 'the siren gets a tone voice');
  ok(V.lead.owner && V.counter.owner && V.noise.owner && !V.bass.owner, 'lead, counter and noise in use; the bass stays with the music');
  const used = Object.values(got).flatMap(g => Object.values(g).filter(Boolean));
  ok(used.length >= 4, 'the burst used the voices');
  // a lower-priority request finds nothing free and is dropped
  const tk = SFX.allocate('tick', SFX.PROGRAMS.tick(), 0.01, V);
  ok(tk.tone === null, 'a chime is dropped when danger and consequence hold every tone voice');
}
// generic manifest, derived from the runtime kit, through the skill's validator
{
  const programs = {}, aliases = {}, events = [];
  for (const [name, fn] of Object.entries(SFX.PROGRAMS)) {
    const p = fn(3), got = SFX.allocate(name, p, 0, SFX.newVoices());
    programs[name] = { id: name, kind: p.kind, steps: p.steps.filter(s => got[s.voice]).map(s => ({ offset: s.t, duration: s.d, voice: got[s.voice] })) };
    aliases[name] = name;
    events.push({ name, classification: p.kind, priority: SFX.PRIORITY[name] || 10 });
  }
  const bgmCues = {};
  for (const section of Object.keys(SFX.SECTIONS)) {
    const tl = SFX.timeline(section, SFX.tempoFor(0), true);
    bgmCues[section] = { id: section, durationSeconds: tl.loop, loopStartSeconds: 0, loopEndSeconds: tl.loop, steps: tl.notes.map(n => ({ offset: n.t, duration: n.d, voice: n.voice })) };
    aliases['music:' + section] = { kind: 'cue', id: section };
    events.push({ name: 'music:' + section, classification: 'bgm', priority: 20 });
  }
  for (const n of ['tow', 'spawn', 'turn']) events.push({ name: n, classification: 'none', priority: 0 });
  const manifest = { version: 1, audioMode: 'active', hardwareProfile: { id: SFX.PROFILE.id, fidelity: SFX.PROFILE.fidelity, voiceLimit: SFX.PROFILE.voiceLimit, primitives: SFX.PROFILE.primitives },
    budgets: { sfxMaxDurationSeconds: CAP.sfx, jingleMaxDurationSeconds: CAP.jingle, maxStepsPerProgram: STEPS, bgmLoopMaxDurationSeconds: LOOP_MAX, bgmLoopMaxTailSeconds: 0 }, programs, aliases, events, bgmCues };
  const file = path.join(__dirname, '..', 'reports', 'audio-manifest.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(manifest, null, 1));
  const validator = path.join(process.env.HOME, '.claude/plugins/cache/agentic-gamedev-skills/retro-arcade-game-finisher/0.1.3/skills/building-era-authentic-game-audio/scripts/validate-audio-kit.mjs');
  if (fs.existsSync(validator)) {
    try { const o = execFileSync('node', [validator, file], { encoding: 'utf8' }); console.log(o.trim()); ok(o.trim().length > 0, 'validator printed nothing'); }
    catch (e) { fails++; console.log('FAIL validator:', (e.stdout || '') + (e.stderr || '')); }
  } else console.log('NOTE validator not installed here; manifest written to', file);
}
if (fails) { console.log(fails, 'failed'); process.exit(1); }
console.log(`audio contract ok: ${Object.keys(SFX.PROGRAMS).length} programs, ${Object.keys(SFX.SECTIONS).length} music sections, ${emitted.size} events emitted`);
