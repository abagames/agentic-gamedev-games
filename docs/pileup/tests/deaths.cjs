// node tests/deaths.cjs [seeds] [policy] — how lives end: seconds into the life, cause, and the car responsible
const S = require('../core.js'), A = require('./adapter.cjs');
const n = +process.argv[2] || 8, name = process.argv[3] || 'skilled';
const life = [], kinds = {};
for (let seed = 1; seed <= n; seed++) {
  const st = A.create(seed), pol = A.policies[name].make(seed); let go = 0;
  while (!A.ended(st)) {
    A.step(st, pol(st));
    for (const e of st.events) {
      if (e.type === 'go') go = st.t;
      if (e.type === 'death') {
        const s = (st.t - go) / 60 | 0; life.push(s);
        let k = e.cause;
        if (e.cause === 'caught') { const c = st.cops.slice().sort((a, b) => (Math.abs(a.x - st.p.x) + Math.abs(a.y - st.p.y)) - (Math.abs(b.x - st.p.x) + Math.abs(b.y - st.p.y)))[0];
          k = `${c.kind}-${c.ti >= 0 ? 'tracked' : 'hunter'}-${c.dir === S.REV[st.p.dir] ? 'headon' : c.dir === st.p.dir ? 'behind' : 'side'}`; }
        kinds[k] = (kinds[k] || 0) + 1;
        if (s < 8) console.log(`early death seed ${seed} d${st.d + 1} ${s}s ${k} at ${S.tileOf(st.p.x)},${S.tileOf(st.p.y)}`);
      }
    }
  }
}
life.sort((a, b) => a - b);
console.log(name, 'lives', life.length, 'seconds into life: p10', life[life.length / 10 | 0], 'median', life[life.length >> 1], '|', JSON.stringify(kinds));
