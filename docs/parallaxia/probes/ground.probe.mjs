// The ground: pieces of plated ground that drift down, and what is on them:
// panels, groups of bonus targets, walls, hidden targets, cores
// (docs/spec-draft.md §5, src/sim/ground.js).

export default {
  name: "ground: layouts, panels, bonus groups, walls, hidden targets, cores",
  requires: ["ground"],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const r3 = (v) => Math.round(v * 1000) / 1000;
      const HP = { panel: 1, bonus: 1, wall: 4, hidden: 1, core: 6 };
      // A band of our own making, with no more to come. `at` lists targets as
      // [row, column, kind]; the band's centre is put at (x, y).
      const park = (cols, rows, at, x = 0, y = -2, mode = "rapid") => {
        // CHAIN: a kill with no chain pays its face value, and it shows that the ground leaves the chain alone.
        g.reset({ seed: 1, mode });
        const s = g.state;
        s.stage.frozen = true;
        s.ground.nextIn = 1e9;
        s.ground.islands = [{ id: 8000, x, y, cols, rows, cells: Array.from({ length: rows }, () => new Array(cols).fill(true)), kind: "row", look: 0 }];
        s.ground.targets = at.map(([row, col, kind], i) => ({ id: 8001 + i, island: 8000, kind, ox: (col - (cols - 1) / 2) * 2, oy: ((rows - 1) / 2 - row) * 2, x: 0, y: 0, hp: HP[kind], look: 0, ...(kind === "hidden" ? { unseen: true } : {}), ...(kind === "bonus" ? { group: 8000 } : {}) }));
        return s;
      };
      const hps = (s) => s.ground.targets.map((t) => t.hp).join();
      const out = {};

      let s = park(3, 1, [[0, 0, "panel"]]);
      g.step(10, 0);
      out.drift = [r3(-2 - s.ground.islands[0].y), r3(s.ground.targets[0].x), r3(s.ground.targets[0].y - s.ground.islands[0].y)];

      // Two panels one above the other, straight over the ship.
      s = park(1, 2, [[0, 0, "panel"], [1, 0, "panel"]]);
      g.step(1, 16);
      g.step(8, 0);
      out.oneShot = [hps(s), s.score, s.shots.length];
      g.step(1, 16);
      g.step(10, 0);
      out.cleared = [hps(s), s.score, s.shots.length, s.chain];
      g.step(60, 16);
      out.after = [s.score, s.shots.some((shot) => shot.y > 0)];

      // Clearing panels is not a wipe-out: with a chain of 3 a panel pays x4,
      // and the chain is still 3.
      s = park(1, 1, [[0, 0, "panel"]]);
      s.chain = 3;
      g.step(1, 16);
      g.step(8, 0);
      out.panelsNoLink = [s.score, s.chain];

      // Bare plate stops nothing: a small enemy beyond the band is shot down.
      s = park(3, 2, [[0, 0, "panel"]]);
      s.enemies.push({ id: 9000, kind: "small", x: 0, y: 8, hp: 1, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      g.step(1, 16);
      g.step(20, 0);
      out.plate = [s.enemies.length, s.score, s.ground.targets[0].hp];

      // Whatever leaves the field standing is simply gone: no chain is lost.
      s = park(3, 1, [[0, 0, "panel"], [0, 1, "bonus"], [0, 2, "wall"]], 8, -16);
      s.chain = 3;
      let breaks = 0;
      for (let t = 0; t < 60; t++) {
        g.step(1, 0);
        breaks += s.events.filter((e) => e.type === "chain-break").length;
      }
      out.letGo = [s.chain, breaks, s.ground.islands.length, s.ground.targets.length];

      // A row of three bonus targets, taken one by one with a chain of 3.
      s = park(3, 1, [[0, 0, "bonus"], [0, 1, "bonus"], [0, 2, "bonus"], [0, 1, "panel"]], 0, -2);
      s.ground.targets[3].oy = 99; // the panel is out of the way: the group is not everything there is
      s.chain = 3;
      const paid = [];
      let bonusEvents = 0;
      for (const x of [-2, 0, 2]) {
        s.ship.x = x;
        const before = s.score;
        for (let t = 0; t < 9; t++) {
          g.step(1, t === 0 ? 16 : 0);
          bonusEvents += s.events.filter((e) => e.type === "ground-bonus").length;
        }
        paid.push(s.score - before);
      }
      out.bonusRow = [paid.join(), s.chain, bonusEvents];

      // A wall block: four shots, and what is beyond it is not hit meanwhile.
      s = park(1, 1, [[0, 0, "wall"]]);
      s.enemies.push({ id: 9000, kind: "middle", x: 0, y: 6, hp: 1000, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      const wallHits = [];
      let hp = 4;
      let shieldedFrames = 0;
      for (let t = 0; t < 60 && s.ground.targets[0].hp > 0; t++) {
        g.step(1, 16);
        if (s.enemies[0].hp < 1000) shieldedFrames++;
        if (s.ground.targets[0].hp !== hp) {
          wallHits.push(hp - s.ground.targets[0].hp);
          hp = s.ground.targets[0].hp;
        }
      }
      const atBreak = [s.score, s.enemies[0].hp, s.chain];
      g.step(20, 16);
      out.wall = [wallHits.join(), ...atBreak, shieldedFrames, s.enemies[0].hp < 1000];

      // A hidden target: the first shot shows it and is spent; the second
      // destroys it.
      s = park(1, 1, [[0, 0, "hidden"]]);
      g.step(1, 16);
      let reveals = 0;
      for (let t = 0; t < 8; t++) {
        g.step(1, 0);
        reveals += s.events.filter((e) => e.type === "ground-reveal").length;
      }
      const shown = [s.ground.targets[0].unseen, s.ground.targets[0].hp, s.score, s.shots.length, reveals];
      // While it comes up (30 frames from the shot that showed it) a shot
      // passes over it and nothing is scored.
      const rising = s.ground.targets[0].rising;
      g.step(1, 16);
      g.step(8, 0);
      out.hiddenRising = [rising > 0, s.ground.targets[0].hp, s.score, s.shots.length];
      g.step(30, 0);
      out.hiddenUp = s.ground.targets[0].rising;
      g.step(1, 16);
      g.step(8, 0);
      out.hidden = [...shown, s.ground.targets[0].hp, s.score];

      // The core: six shots. It takes everything on the ground within 5 of
      // it, walls and all, and nothing further off.
      s = park(3, 3, [[1, 1, "core"]]);
      const hits = [];
      hp = 6;
      for (let t = 0; t < 60 && s.ground.targets[0].hp > 0; t++) {
        g.step(1, 16);
        if (s.ground.targets[0].hp !== hp) {
          hits.push(hp - s.ground.targets[0].hp);
          hp = s.ground.targets[0].hp;
        }
      }
      out.core = [hits.join(), s.score, s.chain];
      s = park(7, 3, [[1, 1, "core"], [0, 0, "panel"], [2, 2, "wall"], [1, 3, "bonus"], [1, 4, "panel"]], 4, -2);
      s.ship.x = s.ground.islands[0].x - 4;
      for (let t = 0; t < 60 && s.ground.targets[0].hp > 0; t++) g.step(1, 16);
      // (The core is at column 1: column 3 is 4 away, column 4 is 6 away.)
      out.coreTakesAll = [hps(s), s.score, s.chain];
      // A core can be locked on to, once; one laser destroys it. The ship is
      // off to the side, where its shots do not reach the core.
      s = park(3, 3, [[1, 1, "core"], [0, 0, "panel"]], 0, 4);
      s.ship.x = 2.6;
      g.step(40, 16);
      const locksHeld = s.locks.length;
      const coreBefore = s.ground.targets[0].hp;
      for (let t = 0; t < 90 && s.ground.targets[0].hp > 0; t++) g.step(1, 0);
      out.coreLock = [locksHeld, coreBefore, hps(s), s.score, s.chain, s.lasers.length];
      // Nothing else on the ground can be locked.
      s = park(3, 3, [[1, 1, "panel"], [1, 0, "bonus"], [1, 2, "wall"]], 0, 4);
      s.ship.x = 0;
      s.ship.y = -6;
      g.step(1, 0);
      s.shots = [];
      for (let t = 0; t < 40; t++) {
        g.step(1, 16);
        s.shots = [];
      }
      out.noLock = s.locks.length;

      // Something in the air right over a panel: the same shot reaches both,
      // and it is the one in the air that takes it.
      s = park(1, 1, [[0, 0, "panel"]]);
      s.enemies.push({ id: 9000, kind: "middle", x: 0, y: -2.4, hp: 3, age: 0, phase: 0, fireIn: 1e9, burst: 0, type: -1, angles: [] });
      g.step(1, 16);
      g.step(6, 0);
      out.airFirst = [s.enemies[0].hp, s.ground.targets[0].hp];

      // Flying over it costs nothing.
      s = park(3, 3, [[1, 1, "core"], [0, 0, "panel"], [2, 2, "wall"]]);
      s.ship.x = s.ground.islands[0].x;
      s.ship.y = s.ground.islands[0].y;
      g.step(30, 0);
      out.flyOver = s.lives;

      // What a run lays down by itself, sector by sector.
      const lay = (seed, course, frames = 12000) => {
        g.reset({ seed, course });
        const st = g.state;
        const seen = new Map();
        let offPlate = 0;
        // (Stepped a second at a time: every piece is on the field for far longer.)
        for (let t = 0; t < frames; t += 60) {
          st.lives = 9;
          st.ship.respawn = 1e9;
          if (st.stage.boss) st.enemies = [];
          g.step(60, 0);
          for (const band of st.ground.islands) {
            if (seen.has(band.id)) continue;
            const targets = st.ground.targets.filter((x) => x.island === band.id);
            const cellOf = (x) => [Math.round((band.rows - 1) / 2 - x.oy / 2), Math.round(x.ox / 2 + (band.cols - 1) / 2)];
            for (const x of targets) {
              const [row, col] = cellOf(x);
              if (!band.cells[row] || !band.cells[row][col]) offPlate++;
            }
            const special = targets.filter((x) => x.kind !== "panel").map((x) => `${x.kind}@${cellOf(x).join(".")}`).sort().join(" ");
            const panels = targets.filter((x) => x.kind === "panel").map((x) => cellOf(x).join(".")).sort().join(" ");
            const bonus = targets.filter((x) => x.kind === "bonus");
            seen.set(band.id, { section: st.stage.section, kind: band.kind, x: band.x, cols: band.cols, rows: band.rows, plates: band.cells.map((row) => row.map((c) => (c ? "#" : ".")).join("")).join("/"), special, panels, counts: targets.reduce((a, x) => ({ ...a, [x.kind]: (a[x.kind] ?? 0) + 1 }), {}), oneGroup: new Set(bonus.map((x) => x.group)).size <= 1 && bonus.every((x) => x.group === band.id), bonusSpan: bonus.length ? Math.max(...bonus.map((x) => x.ox)) - Math.min(...bonus.map((x) => x.ox)) : 0, frame: Math.round(st.frame - (16 + band.rows - band.y) / 0.07) });
          }
        }
        return { bands: [...seen.values()], offPlate };
      };
      const a = lay(4, 0);
      const b = lay(5, 0);
      const c = lay(4, 1);
      const fixedPart = (run) => JSON.stringify(run.bands.map((x) => [x.section, x.kind, x.plates, x.special]));
      const every = [a, b, c, lay(4, 2), lay(4, 3)].flatMap((run) => run.bands);
      const of = (kind) => every.filter((x) => x.kind === kind);
      const total = (kind) => a.bands.reduce((n, x) => n + (x.counts[kind] ?? 0), 0);
      const gaps = a.bands.slice(1).map((x, i) => x.frame - a.bands[i].frame);
      out.laid = {
        pieces: a.bands.length,
        offPlate: a.offPlate,
        onGrid: every.every((x) => x.x === 0 && x.cols === 13 && x.rows >= 1 && x.rows <= 6),
        layouts: [...new Set(every.map((x) => x.kind))].sort().join(),
        shapes: new Set(every.map((x) => x.plates)).size,
        targets: { panel: total("panel"), bonus: total("bonus"), wall: total("wall"), hidden: total("hidden"), core: total("core") },
        groups: every.every((x) => x.oneGroup),
        bonusRow: of("bonusRow").every((x) => x.counts.bonus >= 2 && x.counts.bonus <= 5),
        bonusEnds: of("bonusEnds").every((x) => x.counts.bonus === 2 && x.bonusSpan === 20),
        bonusSquare: of("bonusSquare").every((x) => x.counts.bonus === 4 && x.bonusSpan === 2),
        walls: of("wall").every((x) => x.counts.wall >= 6 && x.counts.wall <= 8),
        doors: [of("wall").filter((x) => x.counts.wall === 7 && !x.plates.includes("#######.") ).length, of("wall").length],
        cores: of("core").every((x) => x.counts.core === 1) && every.every((x) => (x.counts.core ?? 0) <= 1 && (x.counts.hidden ?? 0) <= 1),
        onlyBonusKindsHaveBonus: every.every((x) => (x.counts.bonus ?? 0) === 0 || x.kind.startsWith("bonus")),
        gaps: [Math.min(...gaps), Math.max(...gaps)],
        sameAcrossSeeds: fixedPart(a) === fixedPart(b),
        panelsDiffer: JSON.stringify(a.bands.map((x) => x.panels)) !== JSON.stringify(b.bands.map((x) => x.panels)),
        otherCourse: fixedPart(a) !== fixedPart(c),
      };

      g.reset({ seed: 4 });
      s = g.state;
      s.drill = { pattern: "column", count: 3 };
      s.stage.drill = s.drill;
      g.step(600, 0);
      out.drill = s.ground.islands.length;
      // A core is locked once it is on the field, and not while it is still
      // above the top edge (16), where it cannot be seen.
      const lockCore = (y) => {
        const c = park(1, 1, [[0, 0, "core"]], 0, y);
        c.ship.x = 0;
        g.step(12, 0);
        c.shots = [];
        g.step(11, 16);
        return c.locks.length;
      };
      out.coreInView = [lockCore(18.5), lockCore(15)];
      return out;
    });
    check("a piece of ground drifts down 0.07 a frame, and its targets go with it", r.drift, (v) => Math.abs(v[0] - 0.7) < 1e-6 && v[1] === -2 && v[2] === 0);
    check("one shot destroys a panel and stops there: 50 points", r.oneShot, (v) => v[0] === "1,0" && v[1] === 50 && v[2] === 0);
    check("the next shot passes the wreck and takes the one behind; no chain comes of the ground", r.cleared, (v) => v[0] === "0,0" && v[1] === 100 && v[2] === 0 && v[3] === 0);
    check("shots then fly on over what is left, and nothing more is paid", r.after, (v) => v[0] === 100 && v[1]);
    check("with a chain of 3 a panel pays 50 x 4, and the chain is still 3", r.panelsNoLink, (v) => v[0] === 200 && v[1] === 3);
    check("bare plate stops nothing", r.plate, (v) => v[0] === 0 && v[1] === 100 && v[2] === 1);
    check("what leaves the field standing costs nothing: the chain is as it was", r.letGo, (v) => v[0] === 3 && v[1] === 0 && v[2] === 0 && v[3] === 0);
    check("a group of three bonus targets at a chain of 3: 300 x 4 each, the last brings 1500 x 4 on top, and the chain is still 3", r.bonusRow, (v) => v[0] === "1200,1200,7200" && v[1] === 3 && v[2] === 1);
    check("a wall block takes four shots and pays 20", r.wall, (v) => v[0] === "1,1,1,1" && v[1] === 20 && v[3] === 0);
    check("while the wall stands nothing reaches the enemy beyond it; once it is down, shots do", r.wall, (v) => v[2] === 1000 && v[4] === 0 && v[5] === true);
    check("a hidden target takes a moment to come up: a shot in that time passes over it and scores nothing", r.hiddenRising, (v) => v[0] === true && v[1] === 1 && v[2] === 0);
    check("once it is up it is a target like the others", r.hiddenUp, 0);
    check("a hidden target: the first shot shows it and is spent, a shot after it has come up destroys it for 300", r.hidden, (v) => v[0] === false && v[1] === 1 && v[2] === 0 && v[3] === 0 && v[4] === 1 && v[5] === 0 && v[6] === 300);
    check("the core takes six shots and pays 300; no chain comes of it", r.core, (v) => v[0] === "1,1,1,1,1,1" && v[1] === 300 && v[2] === 0);
    check("destroying the core destroys what is within 5 of it (a panel, a wall, a bonus target: the group of one pays too) and not the panel 6 away", r.coreTakesAll, (v) => v[0] === "0,0,0,0,1" && v[1] === 300 + 50 + 20 + 300 + 1500 && v[2] === 0);
    check("a core takes one lock and no more; the laser destroys it and the panel beside it", r.coreLock, (v) => v[0] === 1 && v[1] === 6 && v[2] === "0,0" && v[3] === 350 && v[4] === 0 && v[5] === 0);
    check("panels, bonus targets and walls cannot be locked on to", r.noLock, 0);
    check("what is in the air is hit before what is on the ground under it", r.airFirst, (v) => v[0] === 2 && v[1] === 1);
    check("flying over the ground costs nothing", r.flyOver, 2);
    const laid = r.laid;
    check("a run lays ground on the field's grid, every target on a plate, one to six plates deep", laid, (v) => v.pieces >= 30 && v.offPlate === 0 && v.onGrid);
    check("every way of laying it out turns up, in many shapes", laid, (v) => v.layouts === "bonusEnds,bonusRow,bonusSquare,checker,chevron,column,core,diagonal,field,row,scatter,strip,twin,wall" && v.shapes >= 30);
    check("panels are the bulk of the targets; hidden targets and bonus targets are there too", laid.targets, (t) => t.panel > t.bonus + t.wall && t.bonus >= 4 && t.hidden >= 1);
    check("bonus targets come as one group a piece, only on the pieces made for them: a row of 2 to 5, a pair at the two edges of the field, a square of 4", laid, (v) => v.groups && v.onlyBonusKindsHaveBonus && v.bonusRow && v.bonusEnds && v.bonusSquare);
    check("a wall is 6 to 8 blocks; at most one core and one hidden target a piece", laid, (v) => v.walls && v.cores);
    check("the ground comes in waves: some pieces right behind the last, some after a long stretch of nothing", laid.gaps, (v) => v[0] < 200 && v[1] > 450);
    check("two seeds: the same layouts on the same plates with the same special targets, sector by sector", laid.sameAcrossSeeds, true);
    check("two seeds: the panels are scattered differently", laid.panelsDiffer, true);
    check("another course lays something else", laid.otherCourse, true);
    check("a drill has no ground", r.drill, 0);
    check("a core above the top of the field is not locked; one on the field is", r.coreInView, (v) => v[0] === 0 && v[1] === 1);
  },
};
