// Were wreck deaths avoidable? For each wreck death, rewind `back` seconds and try every
// constant target x (moving at full speed, no firing). If none survives, the death was a trap
// that no input could escape within that window.
// node tests/fairness.sim.cjs [games] [policy] [specials: default|none]
const WF = require("../core.js");
const B = require("../bots.js");
const N = +process.argv[2] || 6;
const pol = process.argv[3] || "human";
const noSpecials = process.argv[4] === "none";
const mk = { human: (s) => B.humanBot({ seed: s }), oracle: () => B.oracleBot() }[pol];
const BACKS = [0.6, 1.0];

function escapable(snap, frames) {
  for (let x = 8; x <= WF.W - 8; x += 3) {
    const c = WF.clone(snap);
    let ok = true;
    for (let i = 0; i < frames; i++) {
      WF.step(c, { targetX: x });
      if (c.mode === "dead") { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

const res = { deaths: 0, forkInPlay: 0 };
for (const b of BACKS) res["trap" + b] = 0;
for (let g = 0; g < N; g++) {
  const s = WF.createGame(1000 + g, noSpecials ? { specials: [] } : {});
  const bot = mk(1000 + g);
  const ring = [];
  while (s.mode !== "over" && s.t < 600) {
    if (s.mode === "play") { ring.push(WF.clone(s)); if (ring.length > 70) ring.shift(); } else ring.length = 0;
    WF.step(s, bot.update(s) || {});
    for (const e of s.events) {
      if (e.type !== "death" || e.cause !== "wreck") continue;
      res.deaths++;
      const last = ring[ring.length - 1];
      if (last && last.wrecks.length > 1) res.forkInPlay++;
      for (const b of BACKS) {
        const k = Math.round(b / WF.DT);
        if (ring.length < k) continue;
        const snap = ring[ring.length - k];
        if (!escapable(snap, k + 90)) res["trap" + b]++;
      }
    }
  }
}
console.log(pol, noSpecials ? "(no specials)" : "(specials)", JSON.stringify(res));
