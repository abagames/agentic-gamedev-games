// What a run looks like in numbers, taken the same way from a person's replay
// and from a simulated player, so the two can be set side by side.
//   const stats = createPlayStats();
//   each frame, after stepSim: playStatsStep(stats, sim, obs)   (obs = observe(sim))
//   playStatsSummary(stats) -> { metric: number }
// Only frames of the run itself are counted (not the game over screen).

const MOVE_MASK = 15;
const SHOT = 16;

export function createPlayStats() {
  return {
    frames: 0,
    shipFrames: 0,
    prev: null,
    changes: 0,
    moveChanges: 0,
    still: 0,
    shotHeld: 0,
    shotReleases: 0,
    // Lengths (frames) of each stretch one move direction was held.
    holds: [],
    holdFor: 0,
    xs: [],
    ys: [],
    nearest: [],
    chainSum: 0,
    rateSum: 0,
    multSum: 0,
    kills: 0,
    grazes: 0,
    volleys: 0,
    locksFired: 0,
    misses: {},
    // Misses to a bullet in its first quarter second of flight: ones a
    // player who only reacts could not have got out of.
    sudden: 0,
    // To one a third to a half second old (seen late), and to an older one
    // (lost among the others).
    late: 0,
    old: 0,
    // Frames and misses in the first loop (sectors 1 to 10) and after it.
    early: { frames: 0, misses: 0 },
    later: { frames: 0, misses: 0 },
    bulletSum: 0,
    breaks: {},
    score: 0,
    sector: 1,
    ended: false,
  };
}

export function playStatsStep(stats, sim, obs) {
  if (stats.ended) return;
  const bits = sim.input;
  const move = bits & MOVE_MASK;
  stats.frames++;
  if (stats.prev !== null) {
    if (bits !== stats.prev) stats.changes++;
    if (move !== (stats.prev & MOVE_MASK)) {
      stats.moveChanges++;
      if (stats.prev & MOVE_MASK) stats.holds.push(stats.holdFor);
      stats.holdFor = 0;
    }
    if (stats.prev & SHOT && !(bits & SHOT)) stats.shotReleases++;
  }
  stats.holdFor++;
  stats.prev = bits;
  if (move === 0) stats.still++;
  if (bits & SHOT) stats.shotHeld++;

  if (!obs.ship.absent) {
    stats.shipFrames++;
    stats.xs.push(obs.ship.x);
    stats.ys.push(obs.ship.y);
    let best = Infinity;
    for (const b of obs.bullets) {
      if (b.armed === false) continue;
      const d = (b.x - obs.ship.x) ** 2 + (b.y - obs.ship.y) ** 2;
      if (d < best) best = d;
    }
    if (best < Infinity) stats.nearest.push(Math.sqrt(best));
  }
  const part = (obs.sector ?? 1) <= 10 ? stats.early : stats.later;
  part.frames++;
  stats.bulletSum += obs.bullets.length;
  stats.chainSum += sim.chain ?? 0;
  stats.rateSum += sim.rate ?? 1;
  for (const e of sim.events) {
    if (e.type === "destroy") {
      stats.kills++;
      stats.multSum += e.mult ?? 1;
    }
    else if (e.type === "graze") stats.grazes++;
    else if (e.type === "release") {
      stats.volleys++;
      stats.locksFired += e.count ?? 0;
    } else if (e.type === "miss") {
      const key = [e.cause, e.from].filter(Boolean).join(" of ") || "unknown";
      stats.misses[key] = (stats.misses[key] ?? 0) + 1;
      if (e.cause === "bullet") {
        if (e.warn < 15) stats.sudden++;
        else if (e.warn < 36) stats.late++;
        else stats.old++;
      }
      part.misses++;
    } else if (e.type === "chain-break") stats.breaks[e.cause] = (stats.breaks[e.cause] ?? 0) + 1;
  }
  stats.score = sim.score;
  stats.sector = obs.sector ?? stats.sector;
  if (sim.phase === "gameover") stats.ended = true;
}

const quantile = (sorted, q) => (sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
const sortedCopy = (values) => [...values].sort((a, b) => a - b);
const mean = (values) => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);
const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

export function playStatsSummary(stats) {
  const seconds = stats.frames / 60;
  const minutes = seconds / 60;
  const ys = sortedCopy(stats.ys);
  const near = sortedCopy(stats.nearest);
  const holds = sortedCopy(stats.holds);
  const meanX = mean(stats.xs);
  return {
    seconds,
    ended: stats.ended ? 1 : 0,
    score: stats.score,
    "score/min": stats.score / minutes,
    sector: stats.sector,
    "misses/min": sum(stats.misses) / minutes,
    "sudden misses/min": stats.sudden / minutes,
    "late-seen misses/min": stats.late / minutes,
    "lost-bullet misses/min": stats.old / minutes,
    "misses/min, first loop": stats.early.frames ? stats.early.misses / (stats.early.frames / 3600) : NaN,
    "misses/min, later loops": stats.later.frames ? stats.later.misses / (stats.later.frames / 3600) : NaN,
    "bullets on the field, mean": stats.bulletSum / stats.frames,
    "kills/min": stats.kills / minutes,
    // What the kills were paid at, and (GRAZE) where the multiplier stood.
    "multiplier at a kill, mean": stats.kills ? stats.multSum / stats.kills : NaN,
    "rate, mean": stats.rateSum / stats.frames,
    "input changes/s": stats.changes / seconds,
    "move changes/s": stats.moveChanges / seconds,
    "move hold, median frames": quantile(holds, 0.5),
    "move hold, shortest 10% frames": quantile(holds, 0.1),
    "still, share": stats.still / stats.frames,
    "shot held, share": stats.shotHeld / stats.frames,
    "shot releases/min": stats.shotReleases / minutes,
    "locks per volley": stats.volleys ? stats.locksFired / stats.volleys : NaN,
    "ship y, median": quantile(ys, 0.5),
    "ship y, 10%..90%": [quantile(ys, 0.1), quantile(ys, 0.9)],
    "ship x, spread (sd)": Math.sqrt(mean(stats.xs.map((x) => (x - meanX) ** 2))),
    "nearest bullet, median": quantile(near, 0.5),
    "nearest bullet, closest 10%": quantile(near, 0.1),
    "grazes/min": stats.grazes / minutes,
    "chain, mean": stats.chainSum / stats.frames,
    "chain breaks/min": sum(stats.breaks) / minutes,
  };
}

// Where the misses and the chain breaks came from, as "bullet of small 3, ram of large 1".
export const countsText = (counts) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${key} ${n}`)
    .join(", ") || "none";
