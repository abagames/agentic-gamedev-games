// node tests/rules.cjs — rule conformance on arranged states
const S = require('../core.js'), C = S.C;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const at = (tx, ty) => ({ x: S.cen(tx), y: S.cen(ty) });
function blank(at, zone) { const st = S.create(1, { at: at || [0, 0], zone }); st.phase = 'play'; st.pt = 0; st.warn = null; st.spawnT = 1e9; return st; }
function cop(st, tx, ty, dir, ti) { const c = { id: st.nextId++, ...at(tx, ty), dir, pref: [1, 2, 3, 4], ti: ti === undefined || ti === null ? -1 : ti, kind: 'car', hp: 1, stun: 0, immune: 0 }; st.cops.push(c); return c; }
// lay tyre tracks through these tiles (index 0 first) and park the getaway car out of the way
function tracks(st, tiles) { st.trail = tiles.map(([x, y]) => [x, y, 0]); st.trailBase = 0; st.p = { ...at(1, 16), dir: 0, want: 0 }; }
const row = (y, x0, x1) => { const o = []; for (let x = x0; x0 <= x1 ? x <= x1 : x >= x1; x += x0 <= x1 ? 1 : -1) o.push([x, y]); return o; };
const run = (st, n, inp) => { for (let i = 0; i < n && st.phase === 'play'; i++) S.step(st, inp ? inp(st, i) : {}); };

// the map has no dead ends and the start is a road
ok(S.road(blank(), 10, 7), 'start tile is a road');

// steering: a remembered turn is taken at the next junction;// a car on the tracks follows them turn for turn, including back the way it came
{ const st = blank(); tracks(st, [...row(7, 4, 7), [7, 6], [7, 5], [7, 4], [7, 5]]);
  const c = cop(st, 4, 7, 2, 1); const seen = [];
  run(st, 120, () => { const k = S.tileOf(c.x) + ',' + S.tileOf(c.y); if (seen[seen.length - 1] !== k) seen.push(k); return {}; });
  ok(seen.slice(0, 8).join(' ') === '4,7 5,7 6,7 7,7 7,6 7,5 7,4 7,5', `follows tracks incl. reversal: ${seen.slice(0, 8).join(' ')}`); }

// a car off the tracks picks them up at the first track tile it reaches
{ const st = blank(); tracks(st, row(7, 4, 10)); const c = cop(st, 7, 4, 3); run(st, 50);
  ok(c.ti >= 0, `hunter picks up the tracks (ti ${c.ti})`); }

// doubling back in front of the line: the lead car turns back into the next one, the third drives into the wreck
{ const st = blank(); tracks(st, [...row(7, 4, 13), ...row(7, 12, 10)]);
  cop(st, 12, 7, 2, 9); cop(st, 9, 7, 2, 6); cop(st, 6, 7, 2, 3);
  run(st, 90);
  ok(st.stats.crashes === 1 && st.stats.best === 3 && st.score === 600, `3-car pileup from a double-back: wrecks ${st.stats.crashes} best ${st.stats.best} score ${st.score}`); }

// crossing your own tracks: cars on the two passes meet side-on at the crossing
{ const st = blank(); tracks(st, [...row(7, 7, 13), [13, 6], [13, 5], [13, 4], ...row(4, 12, 10), [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 10]]);
  // one car about to pass (10,7) eastward on the first pass, one about to reach it southward on the second
  cop(st, 9, 7, 2, 3); cop(st, 10, 6, 3, 15);
  st.cops[0].x = S.cen(9) - 0; st.cops[1].y = S.cen(6) - 4 * 18 + 4 * 18; // both one tile out
  run(st, 20);
  ok(st.stats.crashes === 1, `side-on crash at a crossing (wrecks ${st.stats.crashes})`); }

// cars running one behind the other on the same tracks do not wreck each other
{ const st = blank(); tracks(st, row(7, 4, 16)); cop(st, 6, 7, 2, 3); const b = cop(st, 5, 7, 2, 2); b.x += 120; run(st, 30);
  ok(st.stats.crashes === 0, 'nose to tail is not a crash'); }

// a car on the tracks drives into a wreck on them; a hunting car goes around
{ const st = blank(); tracks(st, row(7, 4, 13)); st.wrecks.push({ id: 99, tx: 10, ty: 7, n: 2, t: C.WRECK_T });
  cop(st, 7, 7, 2, 4); run(st, 60);
  ok(st.wrecks[0].n === 3 && st.score === 300, `tracked car joins the pileup (n=${st.wrecks[0].n}, score ${st.score})`);
  const st2 = blank(); st2.p = { ...at(4, 7), dir: 0, want: 0 }; st2.trail = [[4, 7, 0]];
  st2.wrecks.push({ id: 99, tx: 10, ty: 7, n: 2, t: C.WRECK_T });
  cop(st2, 13, 7, 4); run(st2, 120);
  ok(st2.wrecks[0].n === 2, 'a hunting car does not enter a wreck'); }


// the getaway car dies on contact with police or a wreck
{ const st = blank(); st.p = { ...at(4, 7), dir: 2, want: 2 }; cop(st, 7, 7, 4, null); run(st, 30); ok(st.phase === 'dead' && st.cause === 'caught', 'caught by police'); }
{ const st = blank(); st.p = { ...at(4, 7), dir: 2, want: 2 }; st.p.x += 30; st.wrecks.push({ id: 9, tx: 5, ty: 7, n: 2, t: 500 }); run(st, 3); ok(st.phase === 'dead' && st.cause === 'wreck', 'driving into a wreck'); }
// a wreck in a junction ahead stops the getaway car at the tile before it when it arrives at a centre
{ const st = blank(); st.p = { ...at(4, 7), dir: 2, want: 2 }; st.wrecks.push({ id: 9, tx: 6, ty: 7, n: 2, t: 500 }); run(st, 30); ok(st.phase === 'play' && st.p.x === S.cen(5), 'stops short of a wreck seen from a centre'); }

// wrecks burn out
{ const st = blank(); st.p = { ...at(1, 16), dir: 0, want: 0 }; st.wrecks.push({ id: 9, tx: 10, ty: 7, n: 2, t: 10 }); run(st, 11); ok(st.wrecks.length === 0, 'wreck is towed'); }

// a heavy van rams: the car that hits it is wrecked and the van drives on, damaged; its third ram wrecks it
// (scoring twice, counting once towards the exit); a burning wreck stops it at once
{ const st = blank([0, -1], 'MARKET'); st.p = { ...at(1, 16), dir: 0, want: 0 }; st.trail = [[1, 16, 0]];
  const v = cop(st, 10, 7, 2); v.kind = 'van'; v.hp = S.C.VAN_HP;
  const ram = () => { const c = cop(st, 10, 7, 4); c.x = v.x + 150; c.y = v.y; v.immune = 0; S.step(st, {}); return c; };
  const c1 = ram();
  ok(st.cops.includes(v) && !st.cops.includes(c1) && v.hp === 2 && st.stats.cars === 1, `first ram: van drives on (hp ${v.hp}, cars ${st.stats.cars})`);
  ram(); ok(st.cops.includes(v) && v.hp === 1, `second ram: still going (hp ${v.hp})`);
  const w0 = st.wrecked; ram();
  ok(!st.cops.includes(v) && st.wrecked === w0 + 2 && st.stats.cars === 5, `third ram wrecks it (cars ${st.stats.cars}, quota +${st.wrecked - w0})`);
  const st2 = blank([0, -1], 'MARKET'); st2.p = { ...at(1, 16), dir: 0, want: 0 }; st2.trail = [[1, 16, 0]];
  const v2 = cop(st2, 10, 7, 2); v2.kind = 'van'; v2.hp = S.C.VAN_HP; v2.x += 60; /* already committed past the junction */ st2.wrecks.push({ id: 77, tx: 11, ty: 7, n: 2, t: 500 });
  for (let i = 0; i < 20 && st2.cops.includes(v2); i++) S.step(st2, {});
  ok(!st2.cops.includes(v2), 'a wreck stops an undamaged van'); }
// a dog unit never takes your tracks: it keeps hunting
{ const st = blank([1, 0], 'UPTOWN'); tracks(st, row(7, 4, 10)); const d = cop(st, 7, 4, 3); d.kind = 'dog'; run(st, 50);
  ok(d.ti === -1, `dog ignores the tracks (ti ${d.ti})`); }
// the exits open at the district's quota; driving out pays the bonus (first time only) and leads to the
// neighbouring district on that side, entered from the opposite edge
{ const st = blank(); st.wrecked = S.district(st).quota - 2; st.p = { ...at(1, 16), dir: 0, want: 0 }; st.trail = [[1, 16, 0]];
  cop(st, 10, 4, 2); const c = cop(st, 10, 4, 4); c.x += 150; S.step(st, {});
  ok(st.exit, 'exits open at the quota');
  st.p = { ...at(10, 15), dir: 3, want: 3 }; const sc = st.score; run(st, 40);
  ok(st.phase === 'clear' && st.score === sc + S.C.CLEAR_BONUS, `driving out pays the bonus (+${st.score - sc})`);
  for (let i = 0; i < S.C.CLEAR_T + 1; i++) S.step(st, {});
  ok(st.cx === 0 && st.cy === 1 && st.phase === 'ready' && !st.exit && st.wrecked === 0, `south exit leads to the district below (${st.cx},${st.cy})`);
  ok(S.tileOf(st.p.x) === 10 && S.tileOf(st.p.y) === 1 && st.p.want === 3, `entered at the top edge heading in (${S.tileOf(st.p.x)},${S.tileOf(st.p.y)})`);
  // back north into DOWNTOWN: no bonus or extra car a second time... and DOWNTOWN is entered from its bottom edge
  st.phase = 'play'; st.exit = true; st.cleared.push('0,1'); st.warn = null; st.spawnT = 1e9; st.p = { ...at(10, 2), dir: 1, want: 1 };
  const sc2 = st.score, l2 = st.lives; run(st, 40);
  ok(st.phase === 'clear' && st.score === sc2 && st.lives === l2, 'no bonus or extra car for a district already got out of');
  for (let i = 0; i < S.C.CLEAR_T + 1; i++) S.step(st, {});
  ok(st.cx === 0 && st.cy === 0 && S.tileOf(st.p.y) === 16, 'back in DOWNTOWN at its bottom edge'); }
// pileups pay the zone's multiplier
{ const st = blank([1, 1], 'INDUSTRY'); tracks(st, [...row(7, 4, 13), ...row(7, 12, 10)]); cop(st, 12, 7, 2, 9); cop(st, 9, 7, 2, 6); run(st, 60);
  ok(S.district(st).mult === 3 && st.score === 900, `INDUSTRY triples a head-on (score ${st.score})`); }
// lives: a death costs one and restarts the district with the quota kept; the last one ends the run
{ const st = blank(); st.lives = 2; st.wrecked = 3; st.p = { ...at(4, 7), dir: 2, want: 2 }; cop(st, 7, 7, 4); run(st, 30);
  for (let i = 0; i < S.C.DEAD_T + 1; i++) S.step(st, {});
  ok(st.lives === 1 && st.phase === 'ready' && st.cops.length === 0 && st.wrecked === 3, 'death restarts the district, quota kept');
  st.phase = 'play'; st.warn = null; st.spawnT = 1e9; st.p = { ...at(4, 7), dir: 2, want: 2 }; cop(st, 7, 7, 4); run(st, 30);
  for (let i = 0; i < S.C.DEAD_T + 1; i++) S.step(st, {}); ok(st.over, 'last life ends the run'); }
// an extra life at the first extend score
{ const st = blank(); st.score = S.C.EXTEND_FIRST - 100; tracks(st, [...row(7, 4, 13), ...row(7, 12, 10)]); cop(st, 12, 7, 2, 9); cop(st, 9, 7, 2, 6); const l = st.lives; run(st, 60);
  ok(st.lives === l + 1, 'extend at the first threshold'); }
// driving out of the outer ring escapes the city
{ const st = blank([0, 3]); st.exit = true; st.p = { ...at(10, 15), dir: 3, want: 3 }; const sc = st.score; run(st, 40); for (let i = 0; i < S.C.CLEAR_T + 1; i++) S.step(st, {});
  ok(st.won && st.score >= sc + S.C.ESCAPE_BONUS, 'leaving the outer ring escapes the city'); }

// escaping pays a bonus for every car still left
{ const st = blank([0, 3]); st.exit = true; st.lives = 3; st.p = { ...at(10, 15), dir: 3, want: 3 }; const sc = st.score; run(st, 40);
  ok(st.score === sc + S.C.CLEAR_BONUS * 4 + S.C.ESCAPE_BONUS + 3 * S.C.CAR_BONUS, `escape bonus with 3 cars (+${st.score - sc})`); }
// a district you come back to is on alert: police faster and more of them
{ const st = blank(); const v0 = S.copSpeed(st), c0 = S.cap(st);
  st.route.push([1, 0], [0, 0]); st.d = 0; const v1 = S.copSpeed(st), c1 = S.cap(st);
  ok(v1 === v0 + S.C.REVISIT_HEAT && c1 === c0 + S.C.REVISIT_HEAT && S.district(st).alert, `revisit: speed ${v0}->${v1}, cap ${c0}->${c1}`);
  ok(S.exitDest(st, 2).alert, 'the exit back into a visited district is marked'); }
// police get faster as the run goes on
{ const st = blank(); const v0 = S.copSpeed(st); st.t += S.C.RUN_HEAT_T; ok(S.copSpeed(st) === v0 + 1, 'run time heats up the police'); }

// determinism: same seed and inputs give the same hash
{ const B = require('../bots.js'); const h = []; for (let k = 0; k < 2; k++) { const st = S.create(5), f = B.flee(); run(st, 1500, (s) => f(s)); h.push(S.hash(st)); } ok(h[0] === h[1], 'replay hash is stable'); }

if (fails) { console.log(fails, 'failed'); process.exit(1); }
console.log('rules ok');
