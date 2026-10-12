// Formations and the chain, in CHAIN, the mode where the chain is the score
// multiplier (docs/spec-draft.md §7). The other modes keep no chain.

export default {
  name: "formation: the chain as multiplier, escape",
  requires: ["enemy", "formation"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const park = (mode = "rapid") => {
        g.reset({ seed: 1, mode });
        g.state.stage.frozen = true;
      };
      let nextId = 9000;
      const small = (x, y, formation = 0) =>
        g.state.enemies.push({ id: nextId++, kind: "small", x, y, hp: 1, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [], formation });
      // A formation whose wave has fully arrived, stacked above the ship.
      const formation = (id, ys, open = false) => {
        g.state.formations.push({ id, open, spawned: ys.length, killed: 0, escaped: 0, x: 0, y: 0 });
        for (const y of ys) small(0, y, id);
      };
      const out = {};

      park();
      small(0, -5);
      g.step(8, 16);
      out.loneKill = [g.state.score, g.state.enemies.length, g.state.chain];

      park();
      formation(7001, [-5, -3, -1]);
      g.step(4, 16);
      out.partly = [g.state.enemies.length < 3 && g.state.enemies.length > 0, g.state.score <= 200, g.state.chain];
      g.step(12, 16);
      out.wiped = [g.state.score, g.state.chain, g.state.formations.length, g.state.enemies.length];
      g.step(60, 16);
      out.paidOnce = g.state.score;
      formation(7002, [-5, -3]);
      g.step(12, 16);
      out.second = [g.state.score - out.paidOnce, g.state.chain];

      park();
      g.state.chain = 15;
      formation(7003, [-5]);
      g.step(8, 16);
      out.sixteenth = [g.state.score, g.state.chain];
      formation(7004, [-5]);
      g.step(8, 16);
      out.capped = [g.state.score - out.sixteenth[0], g.state.chain];

      // One gets away off the bottom: the chain ends and the rest pay nothing.
      park();
      g.state.chain = 5;
      formation(7005, [-5, -15.9]);
      g.step(1, 0);
      out.escaped = [g.state.chain, g.state.enemies.length, g.state.formations.length];
      g.step(8, 16);
      out.afterEscape = [g.state.score, g.state.chain, g.state.enemies.length, g.state.formations.length];

      // A formation still arriving cannot pay yet, however many are down.
      park();
      formation(7006, [-5, -3], true);
      g.step(12, 16);
      out.stillOpen = [g.state.score, g.state.chain, g.state.formations.length];

      // CLOSE keeps no chain: a formation wiped out, or one that gets away,
      // changes nothing.
      park("normal");
      formation(7007, [-5, -3]);
      g.step(12, 16);
      formation(7008, [-15.9]);
      g.step(2, 0);
      out.noChain = [g.state.chain, g.state.enemies.length, g.state.formations.length];

      // The real flow: a wave of small enemies is one formation, and a wave
      // cut short by the end of the section closes as it stands.
      g.reset({ seed: 1, mode: "rapid" });
      g.state.ship.y = -14;
      g.step(40, 0);
      const f = g.state.formations[0];
      out.wave = [g.state.formations.length, f.open, f.spawned, g.state.enemies.length, g.state.enemies.every((e) => e.formation === f.id)];
      f.killed = f.spawned;
      g.state.enemies = [];
      g.state.stage.spawnEnd = g.state.frame;
      g.state.stage.sectionEnd = g.state.frame + 1000;
      g.step(1, 0);
      out.closedBySectionEnd = [g.state.score, g.state.chain, g.state.formations.length];
      return out;
    });
    check("a small enemy outside a formation is worth 100 and starts no chain", r.loneKill, (v) => v[0] === 100 && v[1] === 0 && v[2] === 0);
    check("no chain while part of the formation is left", r.partly, (v) => v[0] && v[1] && v[2] === 0);
    check("wiping out a formation of 3 pays 3 x 100 and makes the chain 1", r.wiped, (v) => v[0] === 300 && v[1] === 1 && v[2] === 0 && v[3] === 0);
    check("a formation counts only once", r.paidOnce, 300);
    check("the next formation's two pay 100 x 2 each, and the chain is 2", r.second, (v) => v[0] === 400 && v[1] === 2);
    check("with 15 behind it a kill pays 100 x 16", r.sixteenth, (v) => v[0] === 1600 && v[1] === 16);
    check("the multiplier stops at 16 though the chain goes on", r.capped, (v) => v[0] === 1600 && v[1] === 17);
    check("an enemy leaving the field ends the chain", r.escaped, (v) => v[0] === 0 && v[1] === 1 && v[2] === 1);
    check("the rest of that formation pays 100 x 1 and starts no chain", r.afterEscape, (v) => v[0] === 100 && v[1] === 0 && v[2] === 0 && v[3] === 0);
    check("a formation that is still arriving is not a wipe-out yet", r.stillOpen, (v) => v[0] === 200 && v[1] === 0 && v[2] === 1);
    check("CLOSE keeps no chain", r.noChain, (v) => v[0] === 0 && v[1] === 0 && v[2] === 0);
    check("a wave of small enemies is one open formation", r.wave, (v) => v[0] === 1 && v[1] === true && v[2] === v[3] && v[2] >= 1 && v[4]);
    check("the end of the section closes a wave that was cut short", r.closedBySectionEnd, (v) => v[0] === 0 && v[1] === 1 && v[2] === 0);
  },
};
