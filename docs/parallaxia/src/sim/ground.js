// The ground: plated ground that drifts down under everything else, with
// things on it to shoot. Nothing on the ground attacks, nothing on it can be
// run into, and enemy bullets pass over it. Only the ship's shots and lasers
// meet it: a shot that reaches a ground target stops there, so shooting the
// ground is shots not spent on what is in the air.
//
// The ground pays points and nothing else, and letting it go costs nothing;
// so a piece of ground can be any shape. A piece is laid out one of several
// ways (LAYOUTS below): a row of blocks, plates scattered about, a diagonal, a
// chevron, columns, a chequered block, a wide field, twin blocks, a strip, a
// wall, a group of bonus targets, a core. Most targets are panels. The rest:
//   bonus  valuable; they come as a group, and the whole group pays on top
//   wall   takes several shots and stops what is fired at the enemies beyond
//   hidden unseen until a shot crosses it
//   core   takes several shots (or one laser) and takes everything on the
//          ground near it with it
//
// What a piece is, where its plates are and where its special targets sit is
// fixed by the sector (it can be learnt); how its panels are scattered is
// the run's.
//
// A piece is kept as a grid of cells the width of the field ("island" in the
// data, from when the ground was islands): cells[r][c] says whether there is
// a plate.

import { FIELD, GROUND, SHOT, THEMES } from "./constants.js";
import { contentRng, nextInt } from "./rng.js";
import { scoreKill } from "./score.js";
import { shotReached } from "./enemies.js";

const CONTENT_GROUND = 6;
const COLS = GROUND.cols;

export function createGround() {
  // nextIn: field units of drift until the next piece sets out.
  // section, ordinal: which piece of which section the next one is.
  return { islands: [], targets: [], nextIn: GROUND.firstIn, section: -1, ordinal: 0 };
}

// Where a row's blocks are: [first column, columns] each.
const ROWS = Object.freeze([
  [[0, 3], [5, 3], [10, 3]],
  [[0, 2], [3, 3], [7, 3], [11, 2]],
  [[0, 4], [5, 3], [9, 4]],
  [[1, 3], [5, 3], [9, 3]],
  [[0, 2], [4, 5], [11, 2]],
]);
const WALLS = Object.freeze([
  [[0, 2], [3, 7], [11, 2]],
  [[0, 8], [10, 3]],
  [[0, 3], [5, 8]],
]);

// A piece being laid: plates, and what is put on them. `fixed` draws what the
// sector decides, `run` what the run does.
function piece(rows) {
  const cells = [];
  for (let r = 0; r < rows; r++) cells.push(new Array(COLS).fill(false));
  return { rows, cells, targets: [], taken: new Set() };
}
const plate = (p, r, c) => {
  if (r >= 0 && r < p.rows && c >= 0 && c < COLS) p.cells[r][c] = true;
};
const block = (p, r0, c0, h, w) => {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) plate(p, r, c);
};
function put(p, r, c, kind, more = {}) {
  if (!p.cells[r] || !p.cells[r][c] || p.taken.has(r * COLS + c)) return false;
  p.taken.add(r * COLS + c);
  p.targets.push({ r, c, kind, ...more });
  return true;
}
// The plated cells of a part of the piece with nothing on them yet.
function free(p, inside = () => true) {
  const out = [];
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < COLS; c++) if (p.cells[r][c] && !p.taken.has(r * COLS + c) && inside(r, c)) out.push([r, c]);
  return out;
}
// Panels on `count` of the free cells, chosen by the run.
function panels(p, run, count, inside) {
  const spots = free(p, inside);
  for (let i = 0; i < count && spots.length > 0; i++) {
    const [r, c] = spots.splice(nextInt(run, spots.length), 1)[0];
    put(p, r, c, "panel");
  }
}

// The ways a piece is laid out. Each returns the piece; `group` marks bonus
// targets that belong together.
const LAYOUTS = Object.freeze({
  // Three or four blocks side by side across the field, a few panels each.
  row(fixed, run) {
    const p = piece(2 + nextInt(fixed, 2));
    for (const [first, width] of ROWS[nextInt(fixed, ROWS.length)]) {
      block(p, 0, first, p.rows, width);
      panels(p, run, 2 + nextInt(run, 3), (r, c) => c >= first && c < first + width);
    }
    return p;
  },
  // One wide stretch of ground, most of the field across and four deep,
  // with panels all over it.
  field(fixed, run) {
    const p = piece(4);
    const width = 8 + nextInt(fixed, 3);
    const first = nextInt(fixed, COLS - width + 1);
    block(p, 0, first, 4, width);
    // (A bite out of one corner, so that it is not a plain slab.)
    const bite = nextInt(fixed, 4);
    block(p, bite < 2 ? 0 : 2, bite % 2 ? first : first + width - 2, 2, 2);
    for (let r = bite < 2 ? 0 : 2; r < (bite < 2 ? 2 : 4); r++) for (let c = bite % 2 ? first : first + width - 2; c < (bite % 2 ? first + 2 : first + width); c++) p.cells[r][c] = false;
    panels(p, run, 12 + nextInt(run, 4));
    return p;
  },
  // Two square blocks, one to each side, thick with panels.
  twin(fixed, run) {
    const p = piece(4);
    const left = nextInt(fixed, 2);
    const right = 8 + nextInt(fixed, 2);
    block(p, 0, left, 4, 4);
    block(p, 0, right, 4, 4);
    panels(p, run, 6 + nextInt(run, 2), (r, c) => c < 6);
    panels(p, run, 6 + nextInt(run, 2), (r, c) => c > 6);
    return p;
  },
  // A single line of plates right across the field, a panel on most of them.
  strip(fixed, run) {
    const p = piece(1);
    const gapAt = nextInt(fixed, COLS);
    for (let c = 0; c < COLS; c++) if (c !== gapAt) plate(p, 0, c);
    panels(p, run, 9);
    return p;
  },
  // Single plates here and there over a deep stretch, a panel on each.
  scatter(fixed) {
    const p = piece(6);
    const columns = [0, 2, 4, 6, 8, 10, 12];
    const count = 5 + nextInt(fixed, 2);
    for (let i = 0; i < count; i++) {
      const c = columns.splice(nextInt(fixed, columns.length), 1)[0];
      const r = nextInt(fixed, p.rows - 1);
      // (Two plates deep, a panel on each.)
      block(p, r, c, 2, 1);
      put(p, r, c, "panel");
      put(p, r + 1, c, "panel");
    }
    return p;
  },
  // A line of plates from one side down to the other.
  diagonal(fixed, run) {
    const p = piece(6);
    const dir = nextInt(fixed, 2) ? 1 : -1;
    for (let i = 0; i < p.rows; i++) block(p, i, dir > 0 ? i * 2 : 10 - i * 2, 1, 3);
    panels(p, run, 10);
    return p;
  },
  // Two lines that meet in the middle: a V, point down or point up.
  chevron(fixed, run) {
    const p = piece(5);
    const up = nextInt(fixed, 2) === 1;
    for (let i = 0; i < p.rows; i++) {
      const r = up ? p.rows - 1 - i : i;
      block(p, r, 1 + i, 1, 2);
      block(p, r, 10 - i, 1, 2);
    }
    panels(p, run, 10);
    return p;
  },
  // One or two columns of plates, front to back: a lane that stays shut for
  // as long as they take to pass.
  column(fixed, run) {
    const p = piece(6);
    const at = [[2, 10], [6], [0, 12], [4, 8]][nextInt(fixed, 4)];
    for (const c of at) {
      block(p, 0, c, p.rows, 1);
      panels(p, run, 5, (r, cc) => cc === c);
    }
    return p;
  },
  // A chequered block: every other plate, a panel on about half.
  checker(fixed, run) {
    const p = piece(4);
    const first = nextInt(fixed, 9);
    for (let r = 0; r < p.rows; r++) for (let c = first; c < first + 5; c++) if ((r + c) % 2 === 0) plate(p, r, c);
    panels(p, run, 9);
    return p;
  },
  // A wall along the front of a long block, sometimes with a door in it, and
  // panels behind.
  wall(fixed, run) {
    const p = piece(2);
    const layout = WALLS[nextInt(fixed, WALLS.length)];
    for (const [first, width] of layout) block(p, 0, first, p.rows, width);
    const long = layout.reduce((a, b) => (b[1] > a[1] ? b : a));
    const door = nextInt(fixed, 3) === 0 ? long[0] + 2 + nextInt(fixed, long[1] - 4) : -1;
    for (let c = long[0]; c < long[0] + long[1]; c++) if (c !== door) put(p, 1, c, "wall");
    panels(p, run, 5, (r, c) => r === 0 && c >= long[0] && c < long[0] + long[1]);
    for (const [first, width] of layout) if (first !== long[0]) panels(p, run, 2 + nextInt(run, 2), (r, c) => c >= first && c < first + width);
    return p;
  },
  // A row of bonus targets along the back of one block of a row.
  bonusRow(fixed, run) {
    const p = piece(2 + nextInt(fixed, 2));
    const layout = ROWS[nextInt(fixed, ROWS.length)];
    for (const [first, width] of layout) block(p, 0, first, p.rows, width);
    const [first, width] = layout[nextInt(fixed, layout.length)];
    for (let c = first; c < first + width; c++) put(p, 0, c, "bonus", { group: 1 });
    for (const [f, w] of layout) panels(p, run, 2 + nextInt(run, 2), (r, c) => c >= f && c < f + w);
    return p;
  },
  // One bonus target at each edge of the field: the pair is the group, and
  // they are as far apart as two things can be.
  bonusEnds(fixed, run) {
    const p = piece(2);
    block(p, 0, 0, 2, 2);
    block(p, 0, 11, 2, 2);
    const mid = 4 + nextInt(fixed, 3);
    block(p, 0, mid, 2, 3);
    // (One column in from the edge: both can just be seen from the middle.)
    put(p, nextInt(fixed, 2), 1, "bonus", { group: 1 });
    put(p, nextInt(fixed, 2), 11, "bonus", { group: 1 });
    panels(p, run, 4, (r, c) => c >= mid && c < mid + 3);
    panels(p, run, 4, (r, c) => c < 2 || c > 10);
    return p;
  },
  // Four bonus targets in a square, in a block somewhere along a row.
  bonusSquare(fixed, run) {
    const p = piece(3);
    const first = nextInt(fixed, 10);
    block(p, 0, first, 3, 4 - (first > 9 ? 1 : 0));
    const at = Math.min(first + nextInt(fixed, 2), COLS - 2);
    for (const [r, c] of [[0, at], [0, at + 1], [1, at], [1, at + 1]]) put(p, r, c, "bonus", { group: 1 });
    const other = first < 6 ? 9 : 1;
    block(p, 0, other, 2, 3);
    panels(p, run, 4, (r, c) => c >= other && c < other + 3);
    panels(p, run, 4, (r, c) => c >= first && c < first + 4);
    return p;
  },
  // A core in the middle of a block, with panels round it and more ground
  // within its reach.
  core(fixed, run) {
    const p = piece(3);
    const first = 1 + nextInt(fixed, 9);
    block(p, 0, first, 3, 3);
    put(p, 1, first + 1, "core");
    if (first >= 5) block(p, 0, first - 4, 2, 2);
    if (first <= 6) block(p, 1, first + 5, 2, 2);
    panels(p, run, 10);
    return p;
  },
});
export const GROUND_LAYOUTS = Object.freeze(Object.keys(LAYOUTS));

function weighted(rng, weights) {
  const keys = Object.keys(weights);
  let n = nextInt(rng, keys.reduce((a, k) => a + weights[k], 0));
  for (const k of keys) {
    if (n < weights[k]) return k;
    n -= weights[k];
  }
  return keys[0];
}

function launchPiece(sim) {
  const ground = sim.ground;
  // Which piece of its section this is: that, and the course, decide it.
  if (ground.section !== sim.stage.section) {
    ground.section = sim.stage.section;
    ground.ordinal = 0;
  }
  const fixed = contentRng(sim.course, CONTENT_GROUND, Math.max(ground.section, 0) * 8 + ground.ordinal++);
  const kind = weighted(fixed, GROUND.layouts);
  const rhythm = weighted(fixed, GROUND.rhythm);
  const gapRoll = nextInt(fixed, 1000);
  const hiddenRoll = nextInt(fixed, GROUND.hiddenOf) < GROUND.hidden ? nextInt(fixed, 64) : -1;
  const p = LAYOUTS[kind](fixed, sim.rng);
  // A hidden target where the sector says: on any plate that has none of the
  // piece's special targets. If the run has scattered a panel there, the
  // panel gives way, so that the place does not depend on the run.
  if (hiddenRoll >= 0) {
    const spots = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < COLS; c++) if (p.cells[r][c] && !p.targets.some((t) => t.r === r && t.c === c && t.kind !== "panel")) spots.push([r, c]);
    if (spots.length > 0) {
      const [r, c] = spots[hiddenRoll % spots.length];
      p.targets = p.targets.filter((t) => !(t.r === r && t.c === c));
      p.targets.push({ r, c, kind: "hidden", unseen: true });
    }
  }
  const island = { id: sim.nextId++, x: 0, y: FIELD.halfH + (p.rows * GROUND.cell) / 2, cols: COLS, rows: p.rows, cells: p.cells, kind, look: nextInt(sim.rng, 3) };
  for (const t of p.targets) {
    ground.targets.push({
      id: sim.nextId++,
      island: island.id,
      kind: t.kind,
      // Offset of its cell's centre from the piece's centre.
      ox: (t.c - (COLS - 1) / 2) * GROUND.cell,
      oy: ((p.rows - 1) / 2 - t.r) * GROUND.cell,
      x: 0,
      y: 0,
      hp: GROUND.kinds[t.kind].hp,
      look: nextInt(sim.rng, 3),
      ...(t.group ? { group: island.id } : {}),
      ...(t.unseen ? { unseen: true } : {}),
    });
  }
  ground.islands.push(island);
  // How long until the next: usually a gap, sometimes right behind, sometimes
  // a long stretch of nothing. (A section of islands brings them thick and fast.)
  const [least, spread] = sim.stage.theme === "islands" ? THEMES.kinds.islands.gap : GROUND[rhythm];
  ground.nextIn = p.rows * GROUND.cell + least + (gapRoll % (spread + 1));
}

export function updateGround(sim) {
  const ground = sim.ground;
  // None set out in a drill, or while a boss is here.
  if (GROUND.on(sim) && !sim.stage.boss) {
    ground.nextIn -= GROUND.speed;
    if (ground.nextIn <= 0) launchPiece(sim);
  }
  for (const island of ground.islands) island.y -= GROUND.speed;
  const live = new Map(ground.islands.map((i) => [i.id, i]));
  for (const target of ground.targets) {
    const island = live.get(target.island);
    if (target.rising > 0) target.rising--;
    target.x = island.x + target.ox;
    target.y = island.y + target.oy;
  }
  // Gone once the whole piece is below the field. What was left on it is
  // simply gone: nothing is lost by it.
  const gone = new Set(ground.islands.filter((i) => i.y + (i.rows * GROUND.cell) / 2 < -FIELD.halfH - 1).map((i) => i.id));
  if (gone.size > 0) {
    ground.islands = ground.islands.filter((i) => !gone.has(i.id));
    ground.targets = ground.targets.filter((t) => !gone.has(t.island));
  }
}

// A shot stops at the first standing target it reaches. Wrecks stop nothing.
export function hitGroundWithShots(sim) {
  const ground = sim.ground;
  if (ground.targets.length === 0) return;
  const shots = [];
  for (const shot of sim.shots) {
    // Of everything in its path this frame, the first it comes to (enemies.js,
    // shotReached).
    let target = null;
    for (const t of ground.targets) {
      // (One still coming up is not there yet: shots pass over it.)
      if (t.hp <= 0 || t.rising > 0) continue;
      const kind = GROUND.kinds[t.kind];
      if (Math.abs(shot.x - t.x) < kind.half + SHOT.halfW && shotReached(shot, t.y, kind.half) && (target === null || t.y < target.y)) target = t;
    }
    if (!target) {
      shots.push(shot);
      continue;
    }
    // A hidden target shows itself to the first shot, which is spent on that,
    // and takes a moment to come up.
    if (target.unseen) {
      target.unseen = false;
      target.rising = GROUND.rise;
      sim.events.push({ type: "ground-reveal", x: target.x, y: target.y, target: target.id });
    } else damageGroundTarget(sim, target, SHOT.damage, shot.x);
  }
  sim.shots = shots;
}

// The cores a lock-on can settle on.
export const lockableGround = (sim) => sim.ground.targets.filter((t) => t.kind === "core" && t.hp > 0);

export function damageGroundTarget(sim, target, damage, hitX = target.x, dist = null) {
  if (target.hp <= 0 || target.rising > 0) return;
  target.hp -= damage;
  if (target.hp > 0) {
    sim.events.push({ type: "ground-hit", x: hitX, y: target.y, target: target.id });
    return;
  }
  destroyTarget(sim, target, dist);
  if (target.kind === "core") {
    // A core takes everything on the ground near it with it, walls and all.
    const reach = GROUND.coreRadius ** 2;
    for (const other of sim.ground.targets) {
      if (other.hp > 0 && !(other.rising > 0) && (other.x - target.x) ** 2 + (other.y - target.y) ** 2 <= reach) destroyTarget(sim, other, dist);
    }
  }
  // The last of a group of bonus targets: the bonus on top. (A core may take
  // a whole group, or the last of several.)
  const groups = new Set(sim.ground.targets.filter((t) => t.group && t.hp <= 0 && !t.paid).map((t) => t.group));
  for (const group of groups) {
    const members = sim.ground.targets.filter((t) => t.group === group);
    if (members.some((t) => t.hp > 0)) continue;
    for (const t of members) t.paid = true;
    const last = members.includes(target) ? target : members[0];
    const [score, mult] = scoreKill(sim, GROUND.set, last.x, last.y, dist, { halfW: GROUND.kinds.bonus.half, halfH: GROUND.kinds.bonus.half }, true);
    sim.events.push({ type: "ground-bonus", x: last.x, y: last.y, score, mult });
  }
}

function destroyTarget(sim, target, dist) {
  const kind = GROUND.kinds[target.kind];
  target.hp = 0;
  target.unseen = false;
  const [score, mult] = scoreKill(sim, kind.score, target.x, target.y, dist, { halfW: kind.half, halfH: kind.half }, true);
  sim.events.push({ type: "ground-destroy", x: target.x, y: target.y, kind: target.kind, score, mult });
}
