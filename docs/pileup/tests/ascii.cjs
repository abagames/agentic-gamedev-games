// node tests/ascii.cjs policy seed [every] — prints the board every N ticks of a run (debug)
const S = require('../core.js'), A = require('./adapter.cjs');
const [pol, seed, every] = [process.argv[2] || 'strong', +process.argv[3] || 1, +process.argv[4] || 30];
const st = A.create(seed), f = A.policies[pol].make(seed);
function draw() {
  const g = [];
  for (let y = 0; y < S.C.H; y++) { let r = ''; for (let x = 0; x < S.C.W; x++) r += S.road(st, x, y) ? '.' : '#'; g.push(r.split('')); }
  for (const w of st.wrecks) g[w.ty][w.tx] = 'W';
  for (const c of st.cops) g[S.tileOf(c.y)][S.tileOf(c.x)] = '^>v<'[c.dir - 1] || 'c';
  g[S.tileOf(st.p.y)][S.tileOf(st.p.x)] = st.over ? 'X' : 'P';
  console.log(`t=${st.t} score=${st.score}\n` + g.map(r => r.join('')).join('\n'));
}
const hist = [];
while (!A.ended(st)) { A.step(st, f(st)); if (st.t % every === 0) draw(); }
draw();
