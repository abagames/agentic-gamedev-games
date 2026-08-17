// DRAFT LINE rev.3 — presentation, state machine, HUD, attract demo.
// All gameplay decisions live in sim.js; this file only shows them and routes input.
import * as S from './spec.js';
import { Sim } from './sim.js';
import { Course } from './course.js';
import { Renderer, cameraSetback, sortWorldSprites } from './render.js';
import { Sound } from './audio.js';
import { drawText, drawTextCentered, textWidth } from './font.js';
import { makeDriver } from './driver.js';

const P = S.PAL;
const MODE = {
  ATTRACT: 'attract', READY: 'ready', RACE: 'race',
  FINISH: 'finish', GAMEOVER: 'gameover', ENTRY: 'entry',
};
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.-! ';
const HI_KEY = 'draftline.hi';
const DEFAULT_HI = Object.freeze([
  Object.freeze({ name: 'ACE', score: 50000 }),
  Object.freeze({ name: 'TOW', score: 30000 }),
  Object.freeze({ name: 'AIR', score: 25000 }),
]);

export const ACTION_CODES = Object.freeze(['KeyZ', 'KeyX', 'KeyJ', 'KeyK', 'Space']);
const ACTION_CODE_SET = new Set(ACTION_CODES);
export const isActionCode = (code) => ACTION_CODE_SET.has(code);
const isConfirmCode = (code) => code === 'Enter' || isActionCode(code);

const defaultHi = () => DEFAULT_HI.map((entry) => ({ ...entry }));

function normalizeHiName(name) {
  const chars = [];
  for (const ch of name) {
    if (ch >= 'A' && ch <= 'Z') chars.push(ch);
    else if (ch >= 'a' && ch <= 'z') chars.push(ch.toUpperCase());
    else if (ch === ' ' || ch === '.' || ch === '-' || ch === '!') chars.push(ch);
    else chars.push(' ');
    if (chars.length === 3) break;
  }
  return chars.join('').padEnd(3, ' ');
}

function canonicalHi(value) {
  if (!Array.isArray(value) || value.length === 0) return defaultHi();
  const valid = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    if (typeof entry.name !== 'string') return;
    if (!Number.isSafeInteger(entry.score) || entry.score < 0 || entry.score > 9_999_999) return;
    valid.push({ name: normalizeHiName(entry.name), score: entry.score, index });
  });
  if (!valid.length) return defaultHi();
  valid.sort((a, b) => b.score - a.score || a.index - b.index);
  return valid.slice(0, 5).map(({ name, score }) => ({ name, score }));
}

function isCanonicalHi(value, canonical) {
  if (!Array.isArray(value) || value.length !== canonical.length || value.length < 1 || value.length > 5) return false;
  return value.every((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const keys = Object.keys(entry).sort();
    return keys.length === 2 && keys[0] === 'name' && keys[1] === 'score'
      && entry.name === canonical[i].name && entry.score === canonical[i].score;
  });
}

export const ATTRACT_VIEW = Object.freeze({ titleS: 9, rankingS: 7, fadeS: 0.6 });
export const ATTRACT_CONTROLS = Object.freeze([
  'UP/W ACCEL   DOWN/S BRAKE',
  'STEER LEFT/RIGHT',
  'BOOST Z/X/J/K/SPACE   M MUTE',
]);

export class Game {
  constructor(ctx) {
    this.ctx = ctx;
    this.sound = new Sound();
    this.renderer = new Renderer(ctx);
    this.hi = this._loadHi();
    this.keys = new Set();
    this.blockedKeys = new Set();
    this.pageVisible = true;
    this.windowFocused = true;
    this.active = true;
    this.boostEdge = false;
    this.t = 0;
    this.cpFlash = 0;
    this.checkpointAward = null;
    this.releaseFlash = 0;
    this.chainFlash = 0;
    this.passReadouts = [];
    this.chainEndReadout = null;
    this.shake = 0;
    // Boost presentation state. `boostKick` is the front-loaded spike that fires with the
    // impulse and decays inside a quarter second; `boostEnv` tracks the sim's own gain
    // envelope so the visuals fade out on exactly the frames the car is being dragged back
    // down. Everything the dash looks like is driven off these two numbers.
    this.boostKick = 0;
    this.boostEnv = 0;
    this.boostOutFlash = 0;
    // P5's background counter-scroll, px. Negative = the sky has slid LEFT (right-hand
    // curve). See spec.js BG_SCROLL.
    this.bgOffset = 0;
    // P1's scrub marks and tyre smoke, each held at a WORLD position and aged out.
    this.scrub = [];
    this._scrubT = 0;
    this._puffT = 0;
    this._puffN = 0;
    this.timeLowTick = 0;
    this._boostPunch = 0;
    this._gameOverJinglePlayed = false;
    this.entry = { name: ['A', 'A', 'A'], pos: 0, cool: 0 };
    this._enterAttract();
  }

  // ---------------------------------------------------------------- storage
  _loadHi() {
    let raw;
    try {
      raw = localStorage.getItem(HI_KEY);
    } catch {
      return defaultHi();
    }
    if (raw === null) return defaultHi();

    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const hi = canonicalHi(parsed);
    if (!isCanonicalHi(parsed, hi)) {
      try { localStorage.setItem(HI_KEY, JSON.stringify(hi)); } catch { /* recover in memory */ }
    }
    return hi;
  }

  _saveHi() {
    try { localStorage.setItem(HI_KEY, JSON.stringify(this.hi.slice(0, 5))); } catch { /* ignore */ }
  }

  get hiScore() { return this.hi.length ? this.hi[0].score : 0; }

  // ---------------------------------------------------------------- modes
  _newSim(seed) {
    this.seed = seed;
    this.course = new Course(seed);
    this.sim = new Sim(this.course, seed);
  }

  _enterAttract() {
    this.mode = MODE.ATTRACT;
    this.modeT = 0;
    this.ceremony = false;   // B6: leaving the ending puts the road back, on this frame
    this._newSim(1000 + Math.floor(Math.random() * 9000));
    // Fresh driver each time so its internal state (prevLane, fullFor) doesn't leak
    // across attract loops.
    this._demoDriver = makeDriver({ useTow: true, release: 'expert' });
    // Rivals spawn ~600m out, so a cold start spends the first several seconds of every
    // attract loop driving an empty road — exactly the "generic racing game" impression
    // this demo exists to avoid (B4). Fast-forward the sim silently (no rendering happens
    // until the caller's render loop ticks) until the demo has just reached and entered a
    // tow, then stop: the visible window opens right as the draft is picked up, with the
    // gauge still low, so the player-facing 6s actually contains the hold-charge-release
    // cycle instead of opening on its aftermath. (Stopping once a release had ALREADY
    // fired — the first attempt here — passed a cumulative-stats assertion but meant the
    // visible window mostly showed the CAR SPEEDING AWAY after boosting, with too little
    // of the window left to refill and release again; measured windowed deepMetres ~58m,
    // short of the 150m bar.) `_drawPlayer` is skipped in attract regardless (see B3a), so
    // this warm-up jump itself is never seen.
    const WARMUP_DT = 1 / 60;
    const WARMUP_MAX_STEPS = 1200;   // 20s of sim time, well above the ~10s this needs
    let prevZone = this.sim.zone;
    for (let i = 0; i < WARMUP_MAX_STEPS; i++) {
      if (this.sim.zone === 'deep' && prevZone !== 'deep') break;
      prevZone = this.sim.zone;
      const input = this._demoDriver(this.sim, this.course);
      this.sim.step(WARMUP_DT, input);
    }
    // Snapshot so the smoke test can assert on what the visible window itself accumulates,
    // not on totals inflated by the silent warm-up.
    this.attractWindowStart = { deep: this.sim.stats.deepMetres, releases: this.sim.stats.releases };
    // ATTRACT is visual-only. This is the single entry policy for both the initial title
    // and every post-game return: cut BGM, persistent beds, delayed work and one-shots.
    this.sound.stopAll();
  }

  startRun() {
    this.mode = MODE.READY;
    this.modeT = 0;
    this.ceremony = false;
    this._newSim(1000 + Math.floor(Math.random() * 9000));
    this._resetRunTransients();
    this.sound.stopAll();
  }

  _resetRunTransients() {
    this.cpFlash = 0;
    this.checkpointAward = null;
    this.releaseFlash = 0;
    this.chainFlash = 0;
    this.passReadouts = [];
    this.chainEndReadout = null;
    this.shake = 0;
    this.boostKick = 0;
    this.boostEnv = 0;
    this.boostOutFlash = 0;
    this._boostPunch = 0;
    this.bgOffset = 0;
    this.scrub = [];
    this._scrubT = 0;
    this._puffT = 0;
    this._puffN = 0;
    this.timeLowTick = 0;
    this.boostEdge = false;
    this._gameOverJinglePlayed = false;
  }

  _enterRace() {
    this.mode = MODE.RACE;
    this.modeT = 0;
  }

  _enterFinish() {
    this.mode = MODE.FINISH;
    this.modeT = 0;
    // B6. The finish ceremony plays in front of a dawn coastline instead of in front of the
    // frozen road. `ceremony` is what says the coast is the backdrop right now; it is NOT
    // the same thing as the mode, because ENTRY is reachable from GAME OVER as well and a
    // player who ran out of road has not arrived at the coast. `ceremonyT` is its own clock
    // rather than modeT because the backdrop has to keep scrolling continuously across the
    // FINISH -> ENTRY hand-off, where modeT restarts at 0.
    this.ceremony = true;
    this.ceremonyT = 0;
    this.finishBonus = 0;
    this.finishTarget = Math.max(0, this.sim.timer) * S.SCORE.finishTime;
    this.sound.music(null);
    this.sound.jingle('finish');
  }

  _enterGameOver() {
    if (this._gameOverJinglePlayed) return;
    this._gameOverJinglePlayed = true;
    this.mode = MODE.GAMEOVER;
    this.modeT = 0;
    this.ceremony = false;
    this.sound.music(null);
    this.sound.jingle('gameover');
  }

  _enterEntryOrAttract() {
    const score = Math.floor(this.sim.score);
    if (this.hi.length < 5 || score > this.hi[this.hi.length - 1].score) {
      this.mode = MODE.ENTRY;
      this.modeT = 0;
      this.entry = { name: ['A', 'A', 'A'], pos: 0, cool: 0 };
      this.sound.jingle('entry');
    } else {
      this._enterAttract();
    }
  }

  // ---------------------------------------------------------------- input
  onKeyDown(code) {
    if (!this.active) {
      this.blockedKeys.add(code);
      return;
    }
    if (this.blockedKeys.has(code)) return;
    const pressed = !this.keys.has(code);
    if (pressed) {
      if (isActionCode(code)) this.boostEdge = true;
      if (code === 'KeyM') this.sound.setMuted(this.muted = !this.muted);
      if (this.mode === MODE.ENTRY) {
        if (code === 'ArrowLeft' || code === 'KeyA') this.entry.pos = Math.max(0, this.entry.pos - 1);
        else if (code === 'ArrowRight' || code === 'KeyD') this.entry.pos = Math.min(2, this.entry.pos + 1);
      }
    }
    this.keys.add(code);
    this.sound.unlock();
    if (pressed && isConfirmCode(code)) this._confirm();
  }

  onKeyUp(code) {
    this.keys.delete(code);
    this.blockedKeys.delete(code);
  }

  setPageVisible(visible) {
    this.pageVisible = !!visible;
    this.sound.setPageVisible(this.pageVisible);
    this._syncActive();
  }

  setWindowFocused(focused) {
    this.windowFocused = !!focused;
    this._syncActive();
  }

  _syncActive() {
    const next = this.pageVisible && this.windowFocused;
    if (next === this.active) return;
    if (!next) {
      for (const code of this.keys) this.blockedKeys.add(code);
      this.keys.clear();
      this.boostEdge = false;
    }
    this.active = next;
  }

  get pausedOverlayVisible() {
    return !this.active && (this.mode === MODE.READY || this.mode === MODE.RACE);
  }

  _confirm() {
    if (this.mode === MODE.ATTRACT) this.startRun();
    else if (this.mode === MODE.GAMEOVER && this.modeT > 1.5) this._enterEntryOrAttract();
    else if (this.mode === MODE.FINISH && this.modeT > 14) this._enterEntryOrAttract();
    else if (this.mode === MODE.ENTRY) {
      if (this.entry.pos < 2) {
        // Confirm commits exactly this slot. The key-down edge gate in onKeyDown means the
        // same held key cannot advance again or submit after arriving at the right edge.
        this.entry.pos++;
      } else {
        this.hi.push({ name: this.entry.name.join(''), score: Math.floor(this.sim.score) });
        this.hi.sort((a, b) => b.score - a.score);
        this.hi = this.hi.slice(0, 5);
        this._saveHi();
        this._enterAttract();
      }
    }
  }

  _playerInput() {
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    const up = k.has('ArrowUp') || k.has('KeyW');
    const down = k.has('ArrowDown') || k.has('KeyS');
    const boost = this.boostEdge;
    this.boostEdge = false;
    return {
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      // P4. This used to read `0.85` with the comment "a coasting car is still a racing
      // car", and that was the whole defect: 0.85 takes the th > 0 branch in sim.js, so
      // releasing UP still ACCELERATED at 0.85 * ACCEL = 28.9 m/s^2 and, below the cap,
      // did literally nothing. Engine braking (COAST_DRAG) existed in the simulation and
      // was reachable only by the bots, never by a pair of hands. Full release now means
      // full release; the drag it selects is bounded by COAST_DRAG_CEILING so that letting
      // go can never stand in for BRAKE at a B13 corner.
      throttle: down ? -1 : up ? 1 : 0,
      boost,
    };
  }

  // The attract demo exists to demonstrate the tow/slingshot mechanic, not just to show a
  // car driving down a road — so it uses the same expert autopilot the playable tests use
  // (see driver.js), tow-seeking with expert-timed releases, instead of a bespoke bot.
  _demoInput() {
    return this._demoDriver(this.sim, this.course);
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.modeT += dt;
    if (this.ceremony) this.ceremonyT += dt;   // B6, spans FINISH and the ENTRY after it
    this.cpFlash = Math.max(0, this.cpFlash - dt);
    this.releaseFlash = Math.max(0, this.releaseFlash - dt);
    this.chainFlash = Math.max(0, this.chainFlash - dt);
    for (const r of this.passReadouts) r.life -= dt;
    this.passReadouts = this.passReadouts.filter((r) => r.life > 0);
    if (this.chainEndReadout) {
      this.chainEndReadout.life -= dt;
      if (this.chainEndReadout.life <= 0) this.chainEndReadout = null;
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    this.boostKick = Math.max(0, this.boostKick - dt * 4);      // ~0.25 s
    this.boostOutFlash = Math.max(0, this.boostOutFlash - dt * 5);
    // Track the sim's gain envelope: 1 while the dash is at full shove, ramping to 0
    // through BOOST.falloff. Read, never guessed, so picture and physics cannot drift.
    {
      const b = this.sim.boost;
      this.boostEnv = b.active && b.gain > 0
        ? Math.max(0, Math.min(1, (this.sim.boostGain || 0) / b.gain))
        : 0;
    }
    // P5. The background's counter-scroll. Advanced every frame in every mode, including
    // the frozen ones: on a frozen sim `speed` is whatever it was, but the decay term still
    // runs, so a paused/finished screen relaxes to neutral instead of holding a heading it
    // is no longer turning through. Presentation state only — it is read by the renderer
    // and by nothing else, and it writes nothing back into the sim.
    {
      const s = this.sim;
      const frozen = !(this.mode === MODE.RACE || this.mode === MODE.ATTRACT);
      const curve = frozen ? 0 : this.course.segmentAt(s.z).curve;
      this.bgOffset = S.bgScrollStep(this.bgOffset, curve, frozen ? 0 : s.speed, dt);
    }
    // P1. The scrub trail and tyre smoke, laid in WORLD space at the car's ground contact
    // and left behind there. This is the cue that makes the tarmac the frame of reference:
    // the marks stay where they were put and recede with the road, which a rotating sprite
    // can never do. Nothing here is read by the simulation.
    {
      const s = this.sim;
      const V = S.SPIN_VIS;
      if (this.scrub.length) {
        for (const m of this.scrub) m.age += dt;
        this.scrub = this.scrub.filter((m) => m.age < (m.puff ? V.puffLife : V.scrubLife));
      }
      if (s.spin > 0 && (this.mode === MODE.RACE || this.mode === MODE.ATTRACT)) {
        const psi = this.spinYaw();
        const cs = Math.cos(psi), sn = Math.sin(psi);
        const hw = S.CAR_WIDTH / 2, hl = S.CAR_LEN / 2, xScale = 2 / S.ROAD_WIDTH;
        this._scrubT += dt;
        while (this._scrubT >= V.scrubStep) {
          this._scrubT -= V.scrubStep;
          // All FOUR tyre contacts, in the car's own frame, yawed into the world. Four and
          // not two because the camera can only see the ones that happen to be AHEAD of the
          // car (see SPIN_VIS), and which pair that is changes twice per revolution.
          for (const side of [-1, 1]) for (const end of [-1, 1]) {
            const lx = side * hw * cs + end * hl * sn;
            const lz = -side * hw * sn + end * hl * cs;
            this.scrub.push({ z: s.z + lz, x: s.x + lx * xScale, age: 0, puff: false });
          }
        }
        this._puffT += dt;
        const puffStep = S.HIT.spinTime / V.puffs;
        while (this._puffT >= puffStep) {
          this._puffT -= puffStep;
          // Puffs come off the contact patch a little AHEAD of the car's centre, which is
          // the part of the ground band this camera can see at all.
          // Alternating sides, deterministically — nothing in this build consults Math.random.
          const pside = (this._puffN++ % 2 ? -1 : 1);
          this.scrub.push({
            z: s.z + hl * 0.9,
            x: s.x + pside * hw * 0.8 * xScale,
            age: 0, puff: true,
          });
        }
      } else {
        this._scrubT = 0; this._puffT = 0;
      }
    }
    if (this.entry.cool > 0) this.entry.cool -= dt;

    if (this.mode === MODE.READY && this.modeT >= 2.0) this._enterRace();

    const simRunning = this.mode === MODE.RACE || this.mode === MODE.ATTRACT;
    if (simRunning) {
      const input = this.mode === MODE.ATTRACT ? this._demoInput() : this._playerInput();
      const ev = this.sim.step(dt, input);
      // ATTRACT keeps its visual demo, but demo-generated releases/checkpoints never open
      // one-shot voices. Initial and post-game title screens share this same policy.
      if (this.mode === MODE.RACE && (ev.gameover || this.sim.gameOver)) {
        // Resolve the terminal bundle before ordinary one-shots. Presentation still sees
        // the event, but this frame's only sound is the terminal jingle.
        this._enterGameOver();
        this._reactTo(ev, { silent: true });
      } else if (this.mode !== MODE.ATTRACT) this._reactTo(ev);
    } else {
      this.boostEdge = false;
    }

    if (this.mode === MODE.RACE) {
      if (this.sim.finished) this._enterFinish();
      else if (this.sim.gameOver) this._enterGameOver();
      // Heartbeat under ten seconds. One pulse per second, never a continuous tone.
      if (this.sim.timer < 10) {
        this.timeLowTick -= dt;
        if (this.timeLowTick <= 0) { this.sound.sfx('timeLow'); this.timeLowTick = 0.5 + this.sim.timer * 0.05; }
      } else this.timeLowTick = 0;
    }

    if (this.mode === MODE.ATTRACT && (this.sim.finished || this.modeT > 60)) this._enterAttract();
    if (this.mode === MODE.FINISH) {
      this.finishBonus = Math.min(this.finishTarget, this.finishBonus + this.finishTarget * dt * 0.6);
      if (this.modeT > 18) this._enterEntryOrAttract();
    }
    if (this.mode === MODE.GAMEOVER && this.modeT > 6) this._enterEntryOrAttract();

    if (this.mode === MODE.ENTRY) this._updateEntry(dt);

    const s = this.sim;
    // P2. The engine bed is a persistent voice and nothing used to switch it off, so it kept
    // running under the finish ceremony, GAME OVER and the initials screen — the sim is
    // frozen in those modes, so `s.speed` keeps its last racing value and the car howls at
    // 300 km/h while standing on a beach. The condition is the CAR, not the mode and not
    // `ceremony` (B6's flag): the engine is audible exactly during RACE plus READY, where
    // the car sits on the
    // line at speed01 = 0 and idles, which is the shipped behaviour and is left alone.
    // Every other mode (FINISH, GAMEOVER, ENTRY, whichever it was reached from) is silence,
    // and it is re-armed on the transition back in (startRun) by this same
    // per-frame call rather than by remembering to do it in each of them.
    const engineOn = this.mode === MODE.RACE || this.mode === MODE.READY;
    this.sound.setEngineRunning(engineOn);
    this.sound.setEngine({ speed01: Math.min(1, s.speed / S.VMAX), boosting: s.boost.active });
    // Blend depth into the draft gate so the slipstream SOUNDS deeper as you tuck in —
    // the same information the haze carries, for a player watching the road instead.
    const depth01 = s.zone === 'deep' ? (s.zoneDepth || 0) : 0;
    this.sound.setDraft(s.zoneLevel * (0.7 + 0.3 * depth01));
  }

  _updateEntry(dt) {
    if (this.entry.cool > 0) return;
    const k = this.keys;
    const i = LETTERS.indexOf(this.entry.name[this.entry.pos]);
    if (k.has('ArrowUp') || k.has('KeyW')) {
      this.entry.name[this.entry.pos] = LETTERS[(i + 1) % LETTERS.length];
      this.entry.cool = 0.14;
    } else if (k.has('ArrowDown') || k.has('KeyS')) {
      this.entry.name[this.entry.pos] = LETTERS[(i - 1 + LETTERS.length) % LETTERS.length];
      this.entry.cool = 0.14;
    }
  }

  _reactTo(ev, { silent = false } = {}) {
    if (ev.bump) { if (!silent) this.sound.sfx('bump'); this.shake = 0.35; }
    if (ev.spin) { if (!silent) this.sound.sfx('spin'); this.shake = 1.0; }
    // The "ready" ping means the slingshot is LIVE, not merely that the bar filled. It
    // used to fire on ev.chargeFull, which is charge level alone — so it also went off
    // while shallow-drafting or after the coyote window closed, promising a 1.4x release
    // the sim would have refused. ev.slingReady is the sim's own edge on that promise.
    if (ev.slingReady && !silent) this.sound.sfx('chargeFull');
    if (ev.release) {
      if (!silent) this.sound.sfx('release');
      this.releaseFlash = 0.4;
      // A slingshot is the single most important thing the player can make happen, so it
      // gets the strongest non-crash feedback in the game: a kick harder than a bump
      // (0.35) but under a spin (1.0), which stays the one event allowed to be worst.
      const power = ev.release.sling ? 1 : 0.55 + 0.45 * ev.release.charge;
      this.boostKick = power;
      this.shake = Math.max(this.shake, 0.55 * power);
    }
    if (ev.boostEnd) { if (!silent) this.sound.sfx('boostOut'); this.boostOutFlash = 1; }
    // One SE per simulation tick, even if the slingshot crosses a whole row of cars. The
    // readouts remain per vehicle so rival/traffic points are still individually legible.
    if (ev.overtake && !silent) this.sound.sfx('overtake', { pan: ev.overtakePan });
    if (ev.passes && ev.passes.length) {
      this.chainFlash = 0.8;
      this.passReadouts = ev.passes.map((p) => ({
        text: `${p.kind === 'rival' ? 'RIVAL' : 'TRAFFIC'} +${p.points}`,
        chain: p.chain,
        life: 1.0,
      }));
    }
    if (ev.chainEnd && ev.chainEnd.chain > 0) {
      if (ev.chainEnd.awarded) {
        this.chainEndReadout = {
          text: `CHAIN X${ev.chainEnd.chain} BONUS +${ev.chainEnd.bonus}`,
          life: 1.25,
        };
        if (ev.chainEnd.bonus > 0 && !silent) this.sound.sfx('chainBonus');
      } else if (ev.chainEnd.reason === 'spin') {
        this.chainEndReadout = { text: 'CHAIN LOST', life: 0.75 };
      }
    }
    if (ev.checkpoint) {
      if (!silent) this.sound.jingle('checkpoint');
      this.cpFlash = 1.2;
      this.checkpointAward = this.sim.lastCheckpoint;
    }
    if (ev.timeout && !silent) this.sound.sfx('spin');
  }

  attractPanel() {
    const cycleS = ATTRACT_VIEW.titleS + ATTRACT_VIEW.rankingS;
    const t = ((this.modeT % cycleS) + cycleS) % cycleS;
    const title = t < ATTRACT_VIEW.titleS;
    const localT = title ? t : t - ATTRACT_VIEW.titleS;
    const duration = title ? ATTRACT_VIEW.titleS : ATTRACT_VIEW.rankingS;
    const edgeS = Math.min(localT, duration - localT);
    return { phase: title ? 'title' : 'ranking', alpha: Math.max(0, Math.min(1, edgeS / ATTRACT_VIEW.fadeS)) };
  }

  attractRanking() {
    return this.hi.slice(0, 5).map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      score: entry.score,
    }));
  }

  checkpointReadout() {
    const award = this.checkpointAward || this.sim.lastCheckpoint;
    const timeSet = award ? award.timeSet : S.legExtension(Math.max(1, this.sim.leg - 1));
    const bonusScore = award ? award.bonusScore : 0;
    return {
      timeText: `${timeSet.toFixed(1)} SEC`,
      bonusText: `TIME LEFT BONUS +${String(Math.floor(bonusScore)).padStart(6, '0')} SCORE`,
    };
  }

  // ---------------------------------------------------------------- render
  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * 3;
      ctx.translate(Math.round((Math.random() - 0.5) * m), Math.round((Math.random() - 0.5) * m));
    }
    this._renderWorld();
    ctx.restore();
    this._renderHud();
    this._renderOverlays();
  }

  _renderWorld() {
    const ctx = this.ctx;
    const s = this.sim;
    const r = this.renderer;
    // B6. The ending's backdrop, and an EARLY RETURN rather than a branch woven through the
    // road path: during the ceremony the road, the traffic, the rivals and the player are
    // not drawn at all, so nothing below this line can run in a state it was not written
    // for, and nothing below this line changed. The sim is already frozen in FINISH (see
    // update()), so what this replaces was a still photograph of the road.
    if (this.ceremony) {
      r.beginFrame();
      r.renderCoast(this.ceremonyT);
      r.endFrame();
      return;
    }
    r.beginFrame();
    // FOV punch. A SMALLER camera depth is a WIDER field of view, which throws the road
    // edges outward and makes the near ground rush — the 1985 way to say "faster" without
    // any post-processing. Sustained mildly for the whole dash, spiked on the impulse
    // frame. metresToPixelsAtY() is depth-invariant, so the player sprite keeps its exact
    // scale relative to the road underneath it while this happens.
    const punch = Math.min(1, this.boostEnv * 0.55 + this.boostKick * 0.85);
    const camDepth = S.CAMERA_DEPTH * (1 - 0.20 * punch);
    // The camera sits BEHIND the player by exactly the distance that puts the player's own
    // z on PLAYER_GROUND_Y, so the player is projected by the same code path as every
    // rival and the drawn gap between them is the simulated gap. Derived, never tuned.
    r.renderRoad(this.course, {
      z: s.z - cameraSetback(camDepth, S.CAMERA_HEIGHT),
      x: s.x, height: S.CAMERA_HEIGHT, depth: camDepth,
      bgOffset: this.bgOffset,
    });
    this._boostPunch = punch;

    if (this._boostPunch > 0.02) this._drawSpeedLines(ctx, this._boostPunch);

    this._drawScrub(ctx);   // P1: on the tarmac, under every car

    // Roadside props, cars AND the checkpoint gate share one depth queue. A fixed
    // "props then cars" layer made a far car paint over a nearer building; the gate used
    // to be drawn in a pre-pass of its own, which made every tree, pylon and rival BEYOND
    // it paint straight over its CHECK/FINISH board. The common world-z key restores
    // painter's order for all three, leaving only the player, road and HUD in their
    // deliberate own layers (the player is always nearest the camera, so it stays on top).
    const sprites = r.visibleProps(this.course).map((p) => ({
      z: p.z, x: p.x, category: 'prop', kind: p.kind, o: p,
    }));
    for (const c of s.traffic) sprites.push({ z: c.z, x: c.x, category: 'car', kind: 'traffic', o: c });
    for (const c of s.rivals) sprites.push({ z: c.z, x: c.x, category: 'car', kind: 'rival', o: c });
    // The gate spans the road, so its queue x is the road centre; x is only a tie-break
    // for genuinely coincident depths and never moves the drawn posts.
    const cp = this.course.checkpoints[s.leg - 1];
    if (cp) sprites.push({ z: cp.z, x: 0, category: 'gate', kind: 'gate', isFinish: s.leg >= S.TOTAL_LEGS });
    // Crest occlusion is a CLIP, not a cull. A car on the far side of a brow must show its
    // roof above the ridge and hide its wheels behind it — the genre's whole read for
    // "there is something over that rise". Culling on pr.visible made a car pop out of
    // existence the instant its ground row went behind the crest, which is what made rivals
    // vanish too early on a descent. drawSprite() clips to the same running near->far clip
    // row the road was rasterised with, so the car emerges roof-first and stays welded to
    // the road surface instead of floating.
    for (const p of sortWorldSprites(sprites)) {
      if (p.category === 'gate') this._drawGate(p.z, p.isFinish);
      else if (p.category === 'prop') r.drawProp(p.o);
      else {
        r.drawSprite(p.z, p.x, (c, sx, sy, scale) => {
          this._drawCar(c, { sx, sy, scale }, p.kind, p.o);
        });
      }
    }

    // On the title screen the player sprite sits at the same screen row as the control
    // control legend and blots out the middle of it.
    // The demo is about showing rivals/traffic and the tow, not the player's own car, so
    // it is simply not drawn here.
    if (this.mode !== MODE.ATTRACT) this._drawPlayer(ctx);
    r.endFrame();
  }

  // Radial streaks flung outward from the vanishing point: hard 1-2 px lines in two
  // palette colours, no alpha gradients or blur — exactly what the era could afford, and
  // the reason a dash reads as speed rather than as a number changing in the HUD.
  // Deterministic per-streak angles (no RNG) so they do not fizz as noise between frames.
  _drawSpeedLines(ctx, p) {
    const cx = S.VIEW_W / 2;
    const cy = S.HORIZON_BASE;
    const n = Math.round(10 + 12 * p);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, S.ROAD_Y0, S.VIEW_W, S.ROAD_H);
    ctx.clip();
    for (let i = 0; i < n; i++) {
      // Golden-ratio angle spread: even coverage, never a visible spoke pattern.
      const a = (i * 2.39996) % (Math.PI * 2);
      const dx = Math.cos(a), dy = Math.sin(a) * 0.55;   // squashed: the road is wide, not tall
      // Each streak cycles outward on its own phase, so they stream continuously.
      const ph = ((this.t * (2.2 + 1.8 * p) + i * 0.137) % 1);
      const r0 = 14 + ph * 190;
      const len = (8 + 34 * p) * (0.35 + ph);
      const x0 = cx + dx * r0, y0 = cy + dy * r0;
      const x1 = cx + dx * (r0 + len), y1 = cy + dy * (r0 + len);
      if (y0 > S.ROAD_Y1 && y1 > S.ROAD_Y1) continue;
      ctx.globalAlpha = Math.min(1, p * (0.25 + 0.75 * ph));
      ctx.fillStyle = (i % 3 === 0) ? P.chargeHigh : '#ffffff';
      // Axis-aligned whole-pixel runs rather than strokes: keeps the pixel grid honest.
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t),
          p > 0.6 ? 2 : 1, p > 0.6 ? 2 : 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawGate(z, isFinish) {
    const ctx = this.ctx;
    const a = this.renderer.project(z, -1.25, 0);
    const b = this.renderer.project(z, 1.25, 0);
    if (!a || !b || !a.visible || !b.visible) return;
    const h = Math.max(6, 7 * a.scale);
    const w = Math.max(2, 0.5 * a.scale);
    // project() reports occlusion instead of culling on it now, so the gate has to clip
    // itself against the same crest row — otherwise a gate beyond a brow paints straight
    // through the hill. Its posts are tall, so like a car it should appear top-down.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, S.ROAD_Y0, S.VIEW_W, Math.max(0, a.clip - S.ROAD_Y0));
    ctx.clip();
    ctx.fillStyle = isFinish ? P.gateGlow : P.gate;
    ctx.fillRect(Math.round(a.sx - w / 2), Math.round(a.sy - h), Math.max(1, Math.round(w)), Math.round(h));
    ctx.fillRect(Math.round(b.sx - w / 2), Math.round(b.sy - h), Math.max(1, Math.round(w)), Math.round(h));
    const beamH = Math.max(2, h * 0.16);
    ctx.fillRect(Math.round(a.sx), Math.round(a.sy - h), Math.round(b.sx - a.sx), Math.round(beamH));
    if (a.scale > 3) {
      const label = isFinish ? 'FINISH' : 'CHECK';
      const px = Math.max(1, Math.round(a.scale * 0.35));
      drawTextCentered(ctx, label, (a.sx + b.sx) / 2, Math.round(a.sy - h + beamH + px), px, P.hudBg);
    }
    ctx.restore();
  }

  // Cars are drawn procedurally: body, roof, wheels, lamps. No assets, and the
  // silhouette stays readable at every scale because it is built from whole pixels.
  _drawCar(ctx, pr, kind, o) {
    const w = Math.max(2, Math.round(S.CAR_WIDTH * pr.scale));
    const h = Math.max(2, Math.round(S.CAR_WIDTH * 0.61 * pr.scale));
    const x = Math.round(pr.sx - w / 2);
    const y = Math.round(pr.sy - h);
    const body = kind === 'rival' ? P.rivalBody : P.trafficBody;
    const roof = kind === 'rival' ? P.rivalRoof : P.trafficRoof;
    ctx.fillStyle = '#101018';
    ctx.fillRect(x, y + h - Math.max(1, h * 0.18), w, Math.max(1, Math.round(h * 0.18)));
    ctx.fillStyle = body;
    ctx.fillRect(x, y + Math.round(h * 0.3), w, Math.round(h * 0.55));
    ctx.fillStyle = roof;
    ctx.fillRect(x + Math.round(w * 0.22), y, Math.round(w * 0.56), Math.round(h * 0.42));
    if (kind === 'rival' && o && o.lamp > 0) {
      ctx.fillStyle = P.rivalLamp;
      const lw = Math.max(1, Math.round(w * 0.18));
      const lh = Math.max(1, Math.round(h * 0.22));
      ctx.fillRect(x + 1, y + Math.round(h * 0.34), lw, lh);
      ctx.fillRect(x + w - 1 - lw, y + Math.round(h * 0.34), lw, lh);
    }
  }

  // P1. The car's ground-plane yaw during a crash spin, in radians, 0 when not spinning.
  // It reads sim.spin and HIT.spinTime and changes NEITHER — the simulation owns when the
  // spin starts and how long it lasts, this owns only how far round the car has come.
  // SPIN_VIS.turns is a whole number so the car finishes pointing down the road again.
  spinYaw() {
    const s = this.sim;
    if (s.spin <= 0) return 0;
    const prog = 1 - s.spin / S.HIT.spinTime;
    return prog * Math.PI * 2 * S.SPIN_VIS.turns;
  }

  // Tyre scrub and smoke, drawn on the tarmac BEFORE any car, so they can never obscure
  // the player at the moment the player most needs to see where the car is. Each mark is
  // projected from its own world position through the same project() the road uses, which
  // is what makes it lie flat on the ground rather than float in front of it.
  _drawScrub(ctx) {
    if (!this.scrub.length) return;
    const V = S.SPIN_VIS;
    for (const m of this.scrub) {
      const p = this.renderer.project(m.z, m.x, 0);
      if (!p || !p.visible || !(p.scale > 0)) continue;
      if (m.puff) {
        // Sized in METRES and then projected, like everything else in this renderer. The
        // first cut sized it in pixels off p.scale directly and a puff at point-blank range
        // came out a 46 px grey square standing over the car like a pillar — the screenshot
        // caught it. A puff is 0.3 m across when it leaves the tyre and 0.8 m when it dies,
        // and it is WIDER THAN TALL, which is what stops a flat rectangle reading as a box.
        const a = m.age / V.puffLife;
        const rM = 0.3 + 0.5 * a;
        const rw = Math.max(1, Math.round(rM * p.scale));
        const rh = Math.max(1, Math.round(rM * 0.55 * p.scale));
        const rise = V.puffRiseM * a * p.scale;
        ctx.globalAlpha = 0.34 * (1 - a);
        ctx.fillStyle = '#d8d8e4';
        ctx.fillRect(Math.round(p.sx - rw), Math.round(p.sy - rise - rh), rw * 2, rh * 2);
      } else {
        const a = m.age / V.scrubLife;
        const mw = Math.max(1, Math.round(V.scrubFrac * S.CAR_WIDTH * p.scale));
        const mh = Math.max(1, Math.round(0.25 * p.scale));
        ctx.globalAlpha = 0.55 * (1 - a);
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(Math.round(p.sx - mw / 2), Math.round(p.sy - mh), mw, mh);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawPlayer(ctx) {
    const s = this.sim;
    // The player is projected from its OWN z, through the same project() every rival uses.
    // The camera setback (see _renderWorld) is chosen so this lands on PLAYER_GROUND_Y, so
    // the anchor row is a consequence of the geometry rather than a constant competing with
    // it. `visible` is ignored on purpose: the player's car is never occluded by its own
    // crest. Sizing off p.scale — not off a hand-picked row — is what makes the player and
    // a rival at the same depth exactly the same size; they differed by 13 px before.
    const p = this.renderer.project(s.z, s.x, 0);
    const pxPerM = p.scale;
    const cx = p.sx;
    const bob = Math.sin(this.t * 22) * (s.speed / S.VMAX) * 0.9;
    const w = Math.max(8, Math.round(S.CAR_WIDTH * pxPerM));
    // Same body ratio as _drawCar, so the two silhouettes agree by construction.
    const h = Math.max(4, Math.round(S.CAR_WIDTH * 0.61 * pxPerM));
    const y = Math.round(p.sy - h + bob + (s.boost.active ? 1.5 : 0));
    const x = Math.round(cx - w / 2);

    // Dirty-air heat haze: the one visual that tells you the zone is live — and now, how
    // deep in it you are. The charge rate is proximity-weighted, so "am I in the tow" is no
    // longer the whole question; "how far in" is worth roughly 2x the fill speed, and the
    // player needs to be able to see it without reading the gauge.
    if (s.zoneLevel > 0) {
      const depth = s.zone === 'deep' ? (s.zoneDepth || 0) : 0;
      ctx.globalAlpha = 0.10 + 0.16 * s.zoneLevel + 0.20 * depth;
      ctx.fillStyle = '#d0e0ff';
      const bands = 5 + Math.round(3 * depth);
      for (let i = 0; i < bands; i++) {
        const yy = y - 26 - i * 5 + Math.sin(this.t * (9 + 6 * depth) + i) * 2;
        ctx.fillRect(x - 8 + Math.sin(this.t * 6 + i * 1.7) * 4, yy, w + 16, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (s.boost.active || this.boostKick > 0) {
      // The flame is driven by the SAME envelope as the physics, so it visibly collapses
      // during the falloff ramp instead of vanishing when the timer happens to expire.
      const e = Math.max(this.boostEnv, this.boostKick);
      const n = Math.round(7 + 7 * e);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const sw = Math.round(w * (1 - t) * (0.8 + 0.7 * e));
        // Two-tone core: white-hot at the nozzle, gold at the tail — a flat two-colour
        // ramp, not a gradient.
        ctx.fillStyle = t < 0.35 ? '#ffffff' : (s.boost.sling ? P.chargeHigh : '#ff8840');
        ctx.globalAlpha = (0.55 + 0.45 * e) * (1 - t);
        ctx.fillRect(Math.round(cx - sw / 2), y + h - 2 + i * 3, sw, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (s.spin > 0) {
      // P1/P7/P8. A GROUND-PLANE YAW, not a picture rotation, and — since P8 — not a scale
      // of any kind either. There is deliberately no ctx.rotate() anywhere in this branch:
      // see spec.js SPIN_VIS for why a rotation transform on a camera-facing billboard can
      // only ever say "the image spun", and for why a swinging drawn WIDTH can only ever say
      // "the image stretched". The drawn box below is the SAME w x h the flat sprite uses on
      // every frame of the spin; the yaw is carried by where the features sit inside it.
      // Everything is driven by the single yaw angle psi, so the cues cannot disagree.
      // `spinYaw()` is shared with the scrub trail.
      const V = S.SPIN_VIS;
      const psi = this.spinYaw();
      const cs = Math.cos(psi), sn = Math.sin(psi);
      const acs = Math.abs(cs), asn = Math.abs(sn);
      const hw = S.CAR_WIDTH / 2, hl = S.CAR_LEN / 2;
      const px = (f) => Math.round(w * f);
      const py = (f) => Math.round(h * f);
      const tyre = Math.max(2, py(0.24));
      const sill = y + h - tyre;

      // (1) THE FEATURE OFFSET MODEL — the whole item, in three lines. A car-frame point
      // (u across, v along) turned by psi presents u*cos + v*sin metres of lateral extent;
      // the car's own presented half-extent is hw*|cos| + hl*|sin| — P1's width formula,
      // now the DIVISOR rather than the drawn size. Their ratio `n` is in [-1, +1] for every
      // point inside the car by construction, so a feature of drawn width fw placed at
      // n * (w - fw)/2 sweeps the room it has inside the FIXED silhouette and can never
      // leave it. `dep` is the same rotation's depth component: + is far, - is near.
      const den = Math.max(1e-6, hw * acs + hl * asn);
      const nrm = (u, v) => (u * cs + v * sn) / den;
      const dep = (u, v) => -u * sn + v * cs;
      // The min/max is a ROUNDING guard, not a clamp on the model: n is already bounded, so
      // this only stops a half-pixel of rounding widening the silhouette by one column.
      // Returns the LEFT EDGE of the feature's rect, so every caller can fillRect with it.
      const place = (u, v, fw) =>
        Math.min(x + w - fw, Math.max(x, Math.round(cx + nrm(u, v) * (w - fw) / 2 - fw / 2)));

      // GROUND SCALE. The gradient is taken over a SHORT baseline and multiplied out —
      // differencing the projection across the whole footprint is exact and unusable: this
      // camera sits 7.05 m back, so the near end of an end-on footprint is at 4.9 m and its
      // row is off the bottom of the frame. `groundSquash` is the one stylisation in this
      // branch and is applied to EVERYTHING on the ground (shadow and all four wheels), so
      // the ground plane stays self-consistent: a uniform vertical squash, not a per-element
      // fudge, and the ratios the cues are made of survive it exactly.
      const pFar = this.renderer.project(s.z + 0.5, s.x, 0);
      const pNear = this.renderer.project(s.z - 0.5, s.x, 0);
      const gpm = (pFar && pNear ? Math.max(0.5, pNear.sy - pFar.sy) : pxPerM * 0.4) * V.groundSquash;

      // (2) THE SHADOW IS THE FOOTPRINT, KEPT FROM P7. It lies on the tarmac, so its DEPTH
      // is the yawed extent along the view axis, |cos|*CAR_LEN + |sin|*CAR_WIDTH: deep
      // end-on, flat broadside. It is the one element in the picture that genuinely must
      // foreshorten, and with the body now fixed it can no longer be misread as the car
      // itself changing size. Axis-aligned, never rotated — a rotated shadow would be P1's
      // billboard mistake one layer down. Its WIDTH is the body's, i.e. constant.
      const dM = acs * S.CAR_LEN + asn * S.CAR_WIDTH;
      const footPx = Math.max(2, Math.round(dM * gpm));
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#000008';
      ctx.fillRect(x - px(0.04), sill + tyre - footPx, w + px(0.08), footPx);
      ctx.globalAlpha = 1;

      // (3) FOUR CONTACT PATCHES, SWEEPING. Car-frame offsets through the same `nrm`, so
      // the PATTERN moves within the fixed box — two abreast tail-on, sheared into a
      // trapezoid obliquely, collapsed into a line toward the tail end broadside — while
      // their depth spreads them up and down the ground plane. No scale of any kind can
      // produce this, and it is the cue that survives the loss of the width swing intact.
      const hu = V.trackFrac * hw;
      const hv = V.wheelbaseFrac * hl;
      const wpx = Math.max(2, Math.round(V.wheelM * pxPerM));
      const wpy = Math.max(1, Math.round(V.wheelM * gpm));
      const wheels = [];
      for (const u of [-hu, hu]) for (const v of [-hv, hv]) {
        wheels.push({ sx: place(u, v, wpx), dz: dep(u, v) });
      }
      wheels.sort((a, b) => b.dz - a.dz);     // far first
      const drawWheel = (wl) => {
        // Two colours nothing else in the build uses, so a recorder census of them IS a
        // census of the contact patches (the first cut used the HUD's own white and the
        // assertion silently measured 144 font pixels).
        ctx.fillStyle = wl.dz > 0 ? '#7a8296' : '#eef0f6';
        ctx.fillRect(wl.sx, Math.round(sill + tyre - footPx / 2 - wpy / 2 - wl.dz * gpm), wpx, wpy);
      };
      // The far pair goes UNDER the body and the near pair OVER it, which is the depth
      // ordering a rigid body has and another thing a billboard cannot say.
      for (const wl of wheels) if (wl.dz > 0) drawWheel(wl);

      // (4) THE BODY. Identical rect to the flat sprite's, on every frame: this is the
      // invariant silhouette, and it is the one thing in this branch that must never move.
      const bodyTop = y + py(0.26);
      ctx.fillStyle = P.playerBody;
      ctx.fillRect(x, bodyTop, w, sill - bodyTop);
      ctx.fillStyle = P.playerShade;
      ctx.fillRect(x, sill - Math.max(1, py(0.12)), w, Math.max(1, py(0.12)));

      // (5) THE CABIN SWEEPS. Constant drawn width, placed by `nrm` at the rear-set cabin's
      // own centre — 0.5*CAR_LEN*(1 - roofLenFrac) behind the car's centre — so the glass
      // slides toward whichever end of the box the tail is presenting and back through the
      // middle as the car comes round. Under the roof the full-height section follows it, so
      // the OUTLINE of the greenhouse moves without the outline of the CAR moving.
      const cabV = -0.5 * S.CAR_LEN * (1 - V.roofLenFrac);
      const roofW = Math.max(3, Math.round(V.roofWidFrac * S.CAR_WIDTH * pxPerM));
      const roofX = place(0, cabV, roofW);
      ctx.fillStyle = P.playerBody;
      ctx.fillRect(roofX, bodyTop, roofW, sill - bodyTop);
      ctx.fillStyle = P.playerRoof;
      ctx.fillRect(roofX, y, roofW, py(0.32));
      // Glass. Present at EVERY yaw so the body never reads as an untextured slab: rear
      // window tail-on, side glass broadside, windscreen once it has come round. It is the
      // feature the eye actually tracks across the silhouette.
      const glassW = Math.max(2, roofW - Math.max(2, px(0.06)));
      ctx.fillStyle = cs < -0.35 ? '#203048' : '#101018';
      ctx.fillRect(roofX + Math.round((roofW - glassW) / 2), y + Math.max(1, py(0.06)),
        glassW, Math.max(1, py(0.18)));

      // (6) FACING IDENTITY — which END is pointed at the camera, FADED rather than snapped
      // (P1 switched at |cos psi| = 0.35 and the lamps popped; a lamp swinging away from you
      // dims, and the dimming is itself evidence of the turn). The pair is drawn at the NEAR
      // end's own two corners and swept by the same `nrm`, so the lamps converge toward one
      // side as that end swings away — which is the fixed silhouette's version of an end-on
      // view, and it is the same `cs` sign the depth ordering uses.
      const lampA = Math.min(1, Math.max(0, (acs - V.lampOff) / V.lampFade));
      if (lampA > 0.02) {
        const lampV = cs > 0 ? -hl : hl;
        const lw = Math.max(1, px(0.16));
        ctx.globalAlpha = lampA;
        ctx.fillStyle = cs > 0 ? '#e84030' : '#fff0c0';   // tail away / headlamps toward
        for (const side of [-1, 1]) {
          ctx.fillRect(place(side * V.lampUFrac * hw, lampV, lw), y + py(0.40), lw, py(0.16));
        }
        ctx.globalAlpha = 1;
      }
      for (const wl of wheels) if (wl.dz <= 0) drawWheel(wl);
      return;
    }
    // Every offset below is a fraction of w/h. The sprite is projection-sized now, so the
    // old hardcoded 40x20 pixel offsets left a doll-sized roof on a full-width body.
    const px = (f) => Math.round(w * f);
    const py = (f) => Math.round(h * f);
    const tyre = Math.max(2, py(0.24));
    const sill = y + h - tyre;

    ctx.fillStyle = '#101018';                       // shadow + tyre line
    ctx.fillRect(x - px(0.05), sill, w + px(0.10), tyre);
    ctx.fillStyle = '#e0e0e8';                       // rear tyres
    ctx.fillRect(x - px(0.05), sill, px(0.16), tyre);
    ctx.fillRect(x + w - px(0.11), sill, px(0.16), tyre);

    ctx.fillStyle = P.playerBody;                       // body
    ctx.fillRect(x, y + py(0.26), w, h - py(0.26) - tyre);
    ctx.fillStyle = P.playerShade;                       // lower shade, gives the body a form
    ctx.fillRect(x, sill - Math.max(1, py(0.12)), w, Math.max(1, py(0.12)));

    ctx.fillStyle = P.playerRoof;                       // cabin
    ctx.fillRect(x + px(0.22), y, px(0.56), py(0.32));
    ctx.fillStyle = '#101018';                       // rear glass
    ctx.fillRect(x + px(0.26), y + Math.max(1, py(0.05)), px(0.48), py(0.20));

    ctx.fillStyle = '#e84030';                       // tail lamps
    ctx.fillRect(x + px(0.04), y + py(0.40), px(0.16), py(0.16));
    ctx.fillRect(x + w - px(0.20), y + py(0.40), px(0.16), py(0.16));
    if (this.releaseFlash > 0) {
      // A RIM, not a fill. This used to be a solid rect painted over the whole sprite, which
      // was survivable when the release had no other feedback — but stacked with the flame,
      // the speed lines and the FOV punch it erased the player's own car at the exact moment
      // the player most needs to see where it is. The outline says "that was you" and keeps
      // the silhouette.
      ctx.globalAlpha = this.releaseFlash / 0.4;
      ctx.fillStyle = P.chargeHigh;
      const b = 2;
      ctx.fillRect(x - b, y - b, w + 2 * b, b);           // top
      ctx.fillRect(x - b, y + h, w + 2 * b, b);           // bottom
      ctx.fillRect(x - b, y - b, b, h + 2 * b);           // left
      ctx.fillRect(x + w, y - b, b, h + 2 * b);           // right
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- HUD
  _renderHud() {
    const ctx = this.ctx;
    const s = this.sim;

    ctx.fillStyle = P.hudBg;
    ctx.fillRect(0, 0, S.VIEW_W, S.HUD_TOP_H);
    ctx.fillRect(0, S.ROAD_Y1, S.VIEW_W, S.HUD_BOT_H);

    // Charge gauge across the very top: readable in peripheral vision, which is the
    // only place the player can spare while sitting one metre off a bumper. This is the
    // dark "row of tiles" above SCORE/TIME/HI — it is a bezel-height bar with tick marks
    // every 32px, not a leftover; it reads as plain dark tiles only when charge is empty
    // (attract / just after a reset), and fills blue -> gold as charge rises.
    //
    // TWO states, not three. The bar is gold + blinking white exactly when a press would
    // slingshot, and blue otherwise. This is honest only because of CHARGE_SHALLOW_CAP:
    // the shallow tow stops at 80%, so a FULL bar can only have been bought on a bumper
    // and `full` already implies `slingReady` (test/shallow-cap.test.mjs searches for a
    // counterexample). An interim version drew a third, dulled gold for "full but not
    // live"; that state no longer exists, and re-deriving the blink from charge level
    // alone — rather than from the sim's own slingReady — is what made it necessary.
    // Reading slingReady also means the bar goes quiet for the whole of a running boost:
    // the gauge can refill to 100% mid-slingshot, and blinking there advertised a press
    // _release would have thrown away (see Sim#slingReady).
    const full = s.charge >= S.CHARGE_MAX && s.slingReady;
    const cw = Math.round((s.charge / S.CHARGE_MAX) * S.VIEW_W);
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, S.VIEW_W, S.CELL);
    if (cw > 0) {
      const blink = full && Math.floor(this.t * 8) % 2 === 0;
      ctx.fillStyle = full ? (blink ? '#ffffff' : P.chargeHigh) : P.chargeLow;
      ctx.fillRect(0, 0, cw, S.CELL);
    }
    for (let x = 0; x < S.VIEW_W; x += 32) { ctx.fillStyle = '#00000060'; ctx.fillRect(x, 0, 1, S.CELL); }

    drawText(ctx, 'SCORE', 4, 12, 1, P.hudDim);
    drawText(ctx, String(Math.floor(s.score)).padStart(7, '0'), 4, 22, 2, P.hudText);
    const hiStr = String(Math.max(this.hiScore, Math.floor(s.score))).padStart(7, '0');
    drawText(ctx, 'HI', S.VIEW_W - 4 - textWidth('HI', 1), 12, 1, P.hudDim);
    drawText(ctx, hiStr, S.VIEW_W - 4 - textWidth(hiStr, 1), 22, 1, P.hudDim);

    const low = s.timer < 10;
    const tCol = low && Math.floor(this.t * 6) % 2 === 0 ? P.timeWarn : P.hudText;
    const tStr = s.timer >= 10 ? s.timer.toFixed(1) : s.timer.toFixed(2);
    drawTextCentered(ctx, 'TIME', S.VIEW_W / 2, 11, 1, P.hudDim);
    drawTextCentered(ctx, tStr, S.VIEW_W / 2, 19, 3, tCol);

    // Bottom bar: leg dots, distance-to-gate, speed.
    const by = S.ROAD_Y1 + 3;
    const legStr = `LEG ${s.leg}/${S.TOTAL_LEGS}`;
    drawText(ctx, legStr, 4, by + 10, 1, P.hudDim);
    const dotsX = 4 + textWidth(legStr, 1) + 5;
    for (let i = 0; i < S.TOTAL_LEGS; i++) {
      const done = i < s.leg - 1;
      const cur = i === s.leg - 1;
      ctx.fillStyle = done ? P.chargeHigh : cur ? P.hudText : '#33333f';
      ctx.fillRect(dotsX + i * 5, by + 11, 3, 3);
    }

    const total = S.legDistance(s.leg);
    const frac = Math.max(0, Math.min(1, 1 - s.distanceToCheckpoint / total));
    const barX = 150, barW = 110;
    ctx.fillStyle = '#22222c';
    ctx.fillRect(barX, by + 2, barW, 4);
    ctx.fillStyle = s.leg === S.TOTAL_LEGS ? P.gateGlow : P.hudText;
    ctx.fillRect(barX, by + 2, Math.round(barW * frac), 4);
    drawText(ctx, `${Math.round(s.distanceToCheckpoint)}M`, barX, by + 10, 1, P.hudDim);

    const kph = Math.round(s.speed * 3.6);
    const spStr = `${kph}`;
    const spCol = this.boostKick > 0.2 && Math.floor(this.t * 16) % 2 === 0 ? '#ffffff'
      : s.boost.active ? P.chargeHigh : P.hudText;
    drawText(ctx, spStr, S.VIEW_W - 4 - textWidth(spStr, 2) - 14, by + 4, 2, spCol);
    drawText(ctx, 'KMH', S.VIEW_W - 4 - textWidth('KMH', 1), by + 10, 1, P.hudDim);

    // The dash's own HUD cue. Reserved for the boost so it cannot be confused with the
    // chain banner, and it dies with the envelope so the HUD confirms the end too.
    if (this.boostEnv > 0 || this.boostKick > 0) {
      const e = Math.max(this.boostEnv, this.boostKick);
      const bw = Math.round(S.VIEW_W * e);
      ctx.fillStyle = s.boost.sling ? P.chargeHigh : '#ffffff';
      ctx.fillRect(Math.round((S.VIEW_W - bw) / 2), S.ROAD_Y1 + 1, bw, 1);
      if (this.boostKick > 0.25 && Math.floor(this.t * 12) % 2 === 0) {
        drawTextCentered(ctx, s.boost.sling ? 'SLINGSHOT' : 'BOOST',
          S.VIEW_W / 2, S.ROAD_Y0 + 8, 3, P.chargeHigh);
      }
    }

    if (this.passReadouts.length) {
      this.passReadouts.slice(0, 3).forEach((r, i) => {
        drawTextCentered(ctx, r.text, S.VIEW_W / 2, S.ROAD_Y1 - 62 - i * 10, 1, P.hudText);
      });
      const chain = Math.max(...this.passReadouts.map((r) => r.chain));
      if (chain >= 2) drawTextCentered(ctx, `CHAIN X${chain}`, S.VIEW_W / 2,
        S.ROAD_Y1 - 42, 2, P.chargeHigh);
    } else if (this.chainFlash > 0 && s.chain >= 2) {
      drawTextCentered(ctx, `CHAIN X${s.chain}`, S.VIEW_W / 2, S.ROAD_Y1 - 42, 2, P.chargeHigh);
    }
    if (this.chainEndReadout) {
      drawTextCentered(ctx, this.chainEndReadout.text, S.VIEW_W / 2,
        S.ROAD_Y1 - 42, 1, this.chainEndReadout.text === 'CHAIN LOST' ? P.timeWarn : P.chargeHigh);
    }
  }

  _renderOverlays() {
    const ctx = this.ctx;
    const s = this.sim;

    if (this.cpFlash > 0) {
      const a = this.cpFlash / 1.2;
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, S.ROAD_Y0, S.VIEW_W, S.ROAD_H);
      ctx.globalAlpha = 1;
      // The checkpoint replaces the clock and banks its old remainder as score. Show both
      // causal values explicitly: this is a TIME SET, not an additive time extension.
      // The label uses HUD-label weight, the set time remains the gold focal number, and
      // the final line names the old clock remainder as a score bonus.
      drawTextCentered(ctx, 'CHECKPOINT', S.VIEW_W / 2, 96, 3, P.hudText);
      const checkpoint = this.checkpointReadout();
      // The plate is not decoration: this banner is drawn ON TOP of the checkpoint's own
      // white flash, over daylight road, and the first cut put the label straight onto that
      // — px=1 text at hudDim over a flashed road is unreadable at 320x224 (looked at, not
      // reasoned about: test/screenshot-p3-checkpoint.png). A local dark plate fixes the
      // contrast where the problem is, instead of dimming the flash the whole event is
      // made of. Sized off the strings themselves so it cannot drift when they change.
      const bw = Math.max(textWidth(checkpoint.timeText, 2), textWidth(checkpoint.bonusText, 1)) + 12;
      ctx.fillStyle = P.hudBg;
      ctx.globalAlpha = 0.62;
      ctx.fillRect(Math.round((S.VIEW_W - bw) / 2), 110, bw, 43);
      ctx.globalAlpha = 1;
      drawTextCentered(ctx, 'TIME SET', S.VIEW_W / 2, 114, 1, P.hudText);
      drawTextCentered(ctx, checkpoint.timeText, S.VIEW_W / 2, 124, 2, P.chargeHigh);
      drawTextCentered(ctx, checkpoint.bonusText, S.VIEW_W / 2, 142, 1, P.hudText);
    }

    switch (this.mode) {
      case MODE.ATTRACT: this._overlayAttract(); break;
      case MODE.READY: this._overlayReady(); break;
      case MODE.FINISH: this._overlayFinish(); break;
      case MODE.GAMEOVER:
        drawTextCentered(ctx, 'GAME OVER', S.VIEW_W / 2, 100, 4, P.timeWarn);
        drawTextCentered(ctx, `REACHED LEG ${this.sim.leg} OF ${S.TOTAL_LEGS}`, S.VIEW_W / 2, 130, 1, P.hudText);
        break;
      case MODE.ENTRY: this._overlayEntry(); break;
      default: break;
    }
    if (this.pausedOverlayVisible) {
      ctx.fillStyle = '#000000a0';
      ctx.fillRect(0, S.ROAD_Y0, S.VIEW_W, S.ROAD_H);
      drawTextCentered(ctx, 'PAUSED', S.VIEW_W / 2, 102, 4, P.hudText);
    }
  }

  _overlayAttract() {
    const ctx = this.ctx;
    // Dim the WHOLE road viewport, not a partial box — a box here left a hard, unexplained
    // edge partway down the screen where the dim stopped and full-brightness road resumed.
    ctx.fillStyle = '#00000060';
    ctx.fillRect(0, S.ROAD_Y0, S.VIEW_W, S.ROAD_H);
    const panel = this.attractPanel();
    ctx.globalAlpha = panel.alpha;
    if (panel.phase === 'title') {
      drawTextCentered(ctx, 'DRAFT LINE', S.VIEW_W / 2, 68, 5, P.chargeHigh);
      drawTextCentered(ctx, 'TUCK IN. CHARGE. SLINGSHOT.', S.VIEW_W / 2, 100, 1, P.hudText);
      drawTextCentered(ctx, `${S.TOTAL_LEGS} CHECKPOINTS TO THE COAST`, S.VIEW_W / 2, 110, 1, P.hudDim);
      if (Math.floor(this.t * 2) % 2 === 0) {
        drawTextCentered(ctx, 'PRESS BOOST BUTTON TO START', S.VIEW_W / 2, 138, 2, P.hudText);
      }
      drawTextCentered(ctx, ATTRACT_CONTROLS[0], S.VIEW_W / 2, 166, 1, P.hudDim);
      drawTextCentered(ctx, ATTRACT_CONTROLS[1], S.VIEW_W / 2, 174, 1, P.hudDim);
      drawTextCentered(ctx, ATTRACT_CONTROLS[2], S.VIEW_W / 2, 182, 1, P.hudDim);
    } else {
      drawTextCentered(ctx, 'BEST SCORES', S.VIEW_W / 2, 54, 2, P.chargeHigh);
      this.attractRanking().forEach((entry, index) => {
        drawTextCentered(ctx,
          `${entry.rank}  ${entry.name}  ${String(entry.score).padStart(7, '0')}`,
          S.VIEW_W / 2, 78 + index * 16, 2, P.hudText);
      });
      if (Math.floor(this.t * 2) % 2 === 0) {
        drawTextCentered(ctx, 'PRESS BOOST BUTTON TO START', S.VIEW_W / 2, 170, 1, P.hudDim);
      }
    }
    ctx.globalAlpha = 1;
  }

  _overlayReady() {
    const ctx = this.ctx;
    const n = Math.max(1, 3 - Math.floor(this.modeT * 1.5));
    const { ready, countdown, instruction } = S.READY_OVERLAY;
    const instructionW = textWidth(instruction.text, instruction.scale);
    const plateW = instructionW + instruction.padX * 2;
    const plateH = instruction.scale * 5 + instruction.padY * 2;
    ctx.fillStyle = P[instruction.plateRole];
    ctx.globalAlpha = instruction.plateAlpha;
    ctx.fillRect(Math.round((S.VIEW_W - plateW) / 2), instruction.y - instruction.padY,
      plateW, plateH);
    ctx.globalAlpha = 1;
    drawTextCentered(ctx, 'READY', S.VIEW_W / 2, ready.y, ready.scale, P[ready.colorRole]);
    drawTextCentered(ctx, String(n), S.VIEW_W / 2, countdown.y, countdown.scale,
      P[countdown.colorRole]);
    drawTextCentered(ctx, instruction.text, S.VIEW_W / 2, instruction.y,
      instruction.scale, P[instruction.colorRole]);
  }

  _overlayFinish() {
    const ctx = this.ctx;
    const m = this.modeT;
    if (m < 0.9) {
      ctx.globalAlpha = 1 - m / 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, S.VIEW_W, S.VIEW_H);
      ctx.globalAlpha = 1;
      return;
    }
    // Same fix as the attract scrim: dim the whole road viewport instead of a partial box,
    // which left a hard grey edge partway down the frame where the dim abruptly stopped.
    // B6 deliberately did NOT touch this alpha. Raising it to 0xc0 was the first attempt at
    // the contrast clause and it worked on the numbers and ruined the picture: at 75% black
    // the coastline is a black rectangle with a dim smear in it, i.e. the item's own goal
    // traded away to pass the item's own check. The lever moved to the backdrop palette
    // instead — see PAL.dawnSea* in spec.js.
    ctx.fillStyle = '#00000080';
    ctx.fillRect(0, S.ROAD_Y0, S.VIEW_W, S.ROAD_H);
    drawTextCentered(ctx, 'GOAL', S.VIEW_W / 2, 62, 5, P.chargeHigh);
    drawTextCentered(ctx, 'TIME BONUS', S.VIEW_W / 2, 92, 1, P.hudDim);
    drawTextCentered(ctx, String(Math.floor(this.finishBonus)).padStart(7, '0'), S.VIEW_W / 2, 102, 3, P.hudText);
    if (m > 4) {
      drawTextCentered(ctx, `MAX SLINGSHOT CHAIN  ${this.sim.stats.maxChain}`, S.VIEW_W / 2, 128, 1, P.hudText);
      drawTextCentered(ctx, `METRES IN THE TOW  ${Math.round(this.sim.stats.deepMetres)}`, S.VIEW_W / 2, 140, 1, P.hudText);
    }
    if (m > 8) drawTextCentered(ctx, `FINAL SCORE  ${Math.floor(this.sim.score)}`, S.VIEW_W / 2, 156, 2, P.chargeHigh);
    if (m > 14 && Math.floor(this.t * 2) % 2 === 0) {
      drawTextCentered(ctx, 'PRESS BOOST', S.VIEW_W / 2, 176, 1, P.hudDim);
    }
  }

  _overlayEntry() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000000d0';
    ctx.fillRect(0, 40, S.VIEW_W, 150);
    drawTextCentered(ctx, 'ENTER YOUR INITIALS', S.VIEW_W / 2, 52, 2, P.hudText);
    const px = 5;
    const totalW = 3 * 4 * px * 2;
    const x0 = S.VIEW_W / 2 - totalW / 2;
    for (let i = 0; i < 3; i++) {
      const sel = i === this.entry.pos;
      const col = sel && Math.floor(this.t * 6) % 2 === 0 ? P.chargeHigh : P.hudText;
      const x = Math.round(x0 + i * 4 * px * 2);
      drawText(ctx, this.entry.name[i], x, 76, px, col);
      if (sel) {
        ctx.fillStyle = P.chargeHigh;
        ctx.fillRect(x, 112, 3 * px, 2);
      }
    }
    drawTextCentered(ctx, 'LEFT/RIGHT MOVE   UP/DOWN CHANGE', S.VIEW_W / 2, 120, 1, P.hudDim);
    drawTextCentered(ctx, 'BOOST ENTER AT RIGHT', S.VIEW_W / 2, 130, 1, P.hudDim);
    drawTextCentered(ctx, 'BEST SCORES', S.VIEW_W / 2, 144, 1, P.hudDim);
    this.hi.slice(0, 4).forEach((h, i) => {
      drawTextCentered(ctx, `${h.name}  ${String(h.score).padStart(7, '0')}`, S.VIEW_W / 2, 156 + i * 8, 1, P.hudText);
    });
  }
}
