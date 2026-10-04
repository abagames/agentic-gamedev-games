// A deliberately tiny game used to test the tools. Three lanes; bolts are telegraphed and
// land on a lane; coins appear on a lane and are collected by standing there.
// It has two planted defects for tools/audit.mjs to find: the "dud" threat never hits,
// and a player who only dodges still reaches the success state.
const TICKS = 1800;
const BOLT_EVERY = 40;
const BOLT_FLIGHT = 24;
const DUD_EVERY = 70;

function next(st) {
  let t = (st.rng = (st.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function create(seed) {
  return { rng: seed | 0, tick: 0, lane: 1, lives: 3, score: 0, coins: 0, bolts: [], coin: null, coinAt: 0, nextId: 1, events: [], hits: 0 };
}

function step(st, input) {
  st.events = [];
  const move = Math.sign((input && input.move) || 0);
  st.lane = Math.max(0, Math.min(2, st.lane + move));
  st.tick++;

  if (st.tick % BOLT_EVERY === 0) {
    st.bolts.push({ id: st.nextId++, lane: Math.floor(next(st) * 3), firedAt: st.tick, landsAt: st.tick + BOLT_FLIGHT });
    st.events.push({ type: "threat_fire", id: "bolt" });
  }
  if (st.tick % DUD_EVERY === 0) st.events.push({ type: "threat_fire", id: "dud" });

  for (const b of st.bolts) {
    if (b.landsAt === st.tick && b.lane === st.lane) {
      st.lives--;
      st.hits++;
      st.events.push({ type: "threat_hit", id: "bolt" }, { type: "failure", cause: "bolt" });
    }
  }
  st.bolts = st.bolts.filter((b) => b.landsAt > st.tick);

  if (!st.coin && st.tick >= st.coinAt) st.coin = { lane: Math.floor(next(st) * 3) };
  if (st.coin && st.coin.lane === st.lane) {
    st.score += 10;
    st.coins++;
    st.coin = null;
    st.coinAt = st.tick + 15;
    st.events.push({ type: "action", source: "collect" }, { type: "score", source: "collect", amount: 10 });
  }
  if (st.tick % 60 === 0) {
    st.score += 1;
    st.events.push({ type: "score", source: "passive", amount: 1 });
  }
}

const ended = (st) => st.lives <= 0 || st.tick >= TICKS;

module.exports = { create, step, ended, TICKS, BOLT_FLIGHT };
