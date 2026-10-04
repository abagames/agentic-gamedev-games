const ZS = require('../core.js'); const co = ZS.buildCourse(+process.argv[2] || 0);
const R = ZS.C.ROWS; const ev = {}; for (const e of co.events) ev[Math.floor(e.wx / 8)] = e;
for (let r = 0; r < R; r++) { let s = ''; for (let c = 0; c < co.n; c++) { const g = co.gems.find(g => Math.floor(g.wx / 8) === c && Math.floor((g.y - 16) / 8) === r); const e = ev[c]; s += ZS.solidCol(co, c, r) ? '#' : g ? '*' : e && e.y && Math.floor((e.y - 16) / 8) === r ? e.type[0] : co.cps.includes(c) && r === 12 ? '|' : ' '; } console.log(s); }
console.log('cols', co.n, 'zones', JSON.stringify(co.zones), 'cps', co.cps.join(','), 'events', co.events.length, 'gems', co.gems.length);
const cnt = {}; for (const e of co.events) cnt[e.type] = (cnt[e.type] || 0) + 1; console.log(cnt);
