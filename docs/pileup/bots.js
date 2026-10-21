// PILEUP — simulated players for tests/adapter.cjs. Node only; the page does not load this.
const S = require('./core.js');
const C = S.C, DX = S.DX, DY = S.DY, REV = S.REV;

function mulberry(seed) {
  let a = seed | 0;
  return () => { let t = (a = (a + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// distance (in units) from the getaway car to the next tile centre ahead; 0 at a centre
function toCentre(p) {
  if (S.atCentre(p) || !p.dir) return 0;
  const off = p.dir === 2 || p.dir === 4 ? (p.x - C.TILE / 2) % C.TILE : (p.y - C.TILE / 2) % C.TILE;
  return p.dir === 2 || p.dir === 3 ? C.TILE - off : off;
}
// the tile the getaway car decides at next
function nextNode(p) {
  const tx = S.tileOf(p.x), ty = S.tileOf(p.y);
  if (S.atCentre(p) || !p.dir) return [tx, ty];
  const ox = p.x - S.cen(tx), oy = p.y - S.cen(ty);
  if (DX[p.dir] * ox > 0 || DY[p.dir] * oy > 0) return [tx + DX[p.dir], ty + DY[p.dir]];
  return [tx, ty];
}
// road distance from the nearest patrol car to every tile
function copField(st) {
  const D = new Int16Array(C.W * C.H).fill(-1), q = [];
  for (const c of st.cops) { const k = S.tileOf(c.x) + S.tileOf(c.y) * C.W; if (D[k] < 0) { D[k] = 0; q.push(k); } }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % C.W, y = (k - x) / C.W;
    for (let d = 1; d <= 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (!S.canMove(st, x, y, d)) continue;
      const nk = nx + ny * C.W;
      if (D[nk] < 0) { D[nk] = D[k] + 1; q.push(nk); }
    }
  }
  return D;
}
function options(st, node) {
  const out = [];
  for (let d = 1; d <= 4; d++) if (S.canMove(st, node[0], node[1], d)) out.push(d);
  if (st.exit) for (const e of S.EXITS) if (node[0] === e.px && node[1] === e.py && !out.includes(e.d) && outward(st, e.d)) out.push(e.d);
  return out;
}
const playing = (st) => st.phase === 'play';
// the bots' route: an exit to a district not yet visited that is no further in (sideways or outward), or out of
// the city. st.routePref picks among those: 'rich' only the best-paying zones, 'safe' only the lowest-paying
const fresh = (st, d) => {
  const x = S.exitDest(st, d);
  if (x.escape || st.routePref === 'any') return true;
  return S.ring(x.cx, x.cy) >= S.ring(st.cx, st.cy) && !st.route.some(([a, b]) => a === x.cx && b === x.cy);
};
const outward = (st, d) => {
  if (!fresh(st, d)) return false;
  if ([1, 2, 3, 4].some(dd => S.exitDest(st, dd).escape)) return !!S.exitDest(st, d).escape;   // out of the city when it can
  if (!st.routePref) return true;
  const m = (dd) => { const x = S.exitDest(st, dd); return x.escape ? 0 : x.mult; };
  const ms = [1, 2, 3, 4].filter(dd => fresh(st, dd)).map(m);
  return m(d) === (st.routePref === 'rich' ? Math.max(...ms) : Math.min(...ms));
};
// road distance to an open outward exit from every tile
function exitField(st) {
  const D = new Int16Array(C.W * C.H).fill(-1), T = new Int16Array(C.W * C.H);
  for (const e of S.EXITS.filter(e => outward(st, e.d))) { S.flood(st, T, e.px, e.py); for (let k = 0; k < D.length; k++) if (T[k] >= 0 && (D[k] < 0 || T[k] < D[k])) D[k] = T[k]; }
  for (const e of S.EXITS) if (outward(st, e.d)) D[e.x + e.y * C.W] = -2;   // outside: better than any road
  return D;
}

// --- simple policies
const idle = () => () => ({});
// always the next direction clockwise when it reaches a corner: one repeated input
const turner = () => (st) => (toCentre(st.p) <= C.PSPD ? { d: (st.p.dir % 4) + 1 } : {});
function random(seed) {
  const r = mulberry(seed * 7 + 3);
  let k = 0;
  return () => (++k % 20 === 0 ? { d: 1 + Math.floor(r() * 4) } : {});
}
// runs from the nearest patrol car by road, never aims at anything
function flee(skip = '') {
  let last = skip;
  return (st) => {
    const p = st.p;
    if (!playing(st) || toCentre(p) > C.PSPD * 2) return {};
    const node = nextNode(p), key = node.join(',') + p.dir;
    if (key === last && p.dir) return {};
    last = key;
    const F = copField(st), E = st.exit ? exitField(st) : null;
    let best = 0, bv = -1e9;
    for (const d of options(st, node)) {
      const k = node[0] + DX[d] + (node[1] + DY[d]) * C.W;
      let v = F[k]; if (v < 0) v = 50;
      if (d === REV[p.dir]) v -= 0.5;
      // with the exit open, head for it along any road that keeps a patrol car four tiles off
      if (E && v >= 4) v = 100 - (E[k] === -1 ? 60 : E[k]);
      if (v > bv) { bv = v; best = d; }
    }
    return best ? { d: best } : {};
  };
}

// --- look-ahead: plays each choice at the next junction (and the one after) on copies of the real rules
function rolloutValue(st, ticks, w) {
  const sc0 = st.score, t0 = st.t, d0 = st.stats.deaths, cont = flee(nextNode(st.p).join(',') + st.p.dir);
  for (let k = 0; k < ticks && st.phase === 'play'; k++) S.step(st, cont(st));
  if (st.stats.deaths > d0 || st.phase === 'dead' || st.over) return -1e6 + (st.t - t0) * 1000;
  if (st.phase === 'clear') return outward(st, st.entry) ? 1e5 + (st.score - sc0) * w.pts : -1e4;
  let pull = 0;
  if (st.exit && w.exit) { const E = exitField(st), v = E[S.tileOf(st.p.x) + S.tileOf(st.p.y) * C.W]; pull = -(v === -1 ? 40 : Math.max(0, v)) * w.exit; }
  const F = copField(st), pk = S.tileOf(st.p.x) + S.tileOf(st.p.y) * C.W;
  const room = F[pk] < 0 ? 12 : Math.min(F[pk], 12);
  // patrol cars on the tyre tracks are the line a crossing can cut
  let herd = 0;
  if (w.herd) for (const c of st.cops) if (c.ti >= 0) herd++;
  return (st.score - sc0) * w.pts + room * w.room - st.cops.length * w.crowd + herd * w.herd + pull;
}
function plan(st, opt) {
  const p = st.p, node = nextNode(p);
  for (const e of S.EXITS) if (node[0] === e.x && node[1] === e.y) return e.d;   // already driving out
  const first = options(st, node);
  if (p.dir && !first.includes(REV[p.dir])) first.push(REV[p.dir]);
  let best = 0, bv = -Infinity;
  for (const d of first) {
    const s1 = S.clone(st);
    if (opt.blind) s1.off = { ...s1.off, ...opt.blind };  // plans as if this element were not there
    S.step(s1, { d });
    let v;
    if (opt.depth > 1) {
      // run to the next decision, then try every choice there
      const n1 = node.join(',');
      const dd = s1.stats.deaths;
      for (let k = 0; k < 60 && s1.phase === 'play' && s1.p.dir && (nextNode(s1.p).join(',') === n1 || toCentre(s1.p) > C.PSPD * 2); k++) S.step(s1, {});
      if (s1.stats.deaths > dd || s1.phase === 'dead' || s1.over) v = -1e6;
      else if (s1.phase === 'clear') v = outward(s1, s1.entry) ? 1e5 : -1e4;
      else {
        v = -Infinity;
        const n2 = nextNode(s1.p);
        for (const d2 of options(s1, n2)) {
          const s2 = S.clone(s1); S.step(s2, { d: d2 });
          v = Math.max(v, rolloutValue(s2, opt.horizon, opt));
        }
        if (v === -Infinity) v = rolloutValue(s1, opt.horizon, opt);
      }
    } else v = rolloutValue(s1, opt.horizon, opt);
    if (d === REV[p.dir]) v -= opt.revCost;
    if (v > bv) { bv = v; best = d; }
  }
  return best;
}
const STRONG = { depth: 2, horizon: 120, pts: 1, room: 25, crowd: 60, herd: 150, exit: 300, revCost: 5 };
function strong(seed, o = {}) {
  const opt = { ...STRONG, ...o };
  let last = '';
  return (st) => {
    if (opt.route) st.routePref = opt.route;   // the bot's own route choice, read only by outward()
    const p = st.p;
    if (!playing(st)) { last = ''; return {}; }
    if (toCentre(p) > C.PSPD * 2 && p.dir) return {};
    const key = nextNode(p).join(',') + p.dir;
    if (key === last && p.dir) return {};
    last = key;
    const d = plan(st, opt);
    return d ? { d } : {};
  };
}
// human-limited: one junction of look-ahead, a shorter horizon, a late reaction and an occasional wrong turn
function human(seed, o = {}) {
  const opt = { ...STRONG, depth: 1, horizon: 75, react: 9, slip: 0.06, ...o };
  const r = mulberry(seed * 13 + 5);
  const queue = [];
  let last = '';
  return (st) => {
    if (opt.route) st.routePref = opt.route;
    const p = st.p;
    let out = {};
    while (queue.length && queue[0].at <= st.t) out = queue.shift().input;
    if (!playing(st)) { last = ''; return out; }
    if (toCentre(p) > C.PSPD * (2 + opt.react) && p.dir) return out; // decide early enough that the late press still lands before the junction
    const key = nextNode(p).join(',') + p.dir;
    if (key === last && p.dir) return out;
    last = key;
    let d = plan(st, opt);
    if (r() < opt.slip) { const os = options(st, nextNode(p)); d = os[Math.floor(r() * os.length)] || d; }
    if (d) queue.push({ at: st.t + opt.react, input: { d } });
    return out;
  };
}

module.exports = { idle, turner, random, flee, strong, human, toCentre, nextNode, copField };
