// DRAFT LINE rev.3 — pure simulation. No DOM, no canvas, no audio.
// Everything that decides the feel of the game lives here so it can be tested headlessly.
import * as S from './spec.js';
import { makeRng } from './rng.js';

const CL = S.CAR_LEN;

export const RESULT = {
  NONE: 'none',
  CHECKPOINT: 'checkpoint',
  FINISH: 'finish',
  TIMEOUT: 'timeout',
  GAMEOVER: 'gameover',
};

// Events the simulation emits for one step. The presentation layer maps these to
// sound and HUD flashes; the simulation never knows about either.
function emptyEvents() {
  return {
    bump: false, spin: false, release: null, chargeFull: false, slingReady: false,
    overtake: 0, checkpoint: false, finish: false, timeout: false, gameover: false,
    boostEnd: false, passes: [], chainEnd: null,
  };
}

export class Sim {
  constructor(course, seed = 1) {
    this.course = course;
    this.rng = makeRng(seed ^ 0x5eed);
    this.reset();
  }

  reset() {
    this.leg = 1;
    this.score = 0;
    this.timer = S.START_TIME;
    this.chain = 0;
    this.finished = false;
    this.gameOver = false;
    this.lastCheckpoint = null;
    this.legStartZ = 0;
    this._resetRun(0);
  }

  // Places the car at `z` with a clean state. Used at the start of a run.
  _resetRun(z) {
    this.z = z;
    this.x = 0;
    // Rolling start. A standing start would spend the opening seconds of a timed leg
    // watching the pack drive away, which is not a decision — it is just a tax.
    this.speed = S.VMAX * 0.45;
    this.charge = 0;
    this.boost = { active: false, t: 0, dur: 0, gain: 0, sling: false, pending: 0, ending: false };
    this._chainSession = null;
    this._nextPassId = 1;
    this.assist = 0;
    this.rearm = 0;
    this.spin = 0;
    this.stun = 0;
    this.zone = null;          // 'deep' | 'shallow' | null
    this.slingGrace = 0;       // s of coyote time left in which a release still slingshots
    this.zoneLevel = 0;        // 0..1, for audio
    this.zoneDepth = 0;        // 0..1, how deep inside the band (1 = on the bumper)
    this.rivals = [];
    this.traffic = [];
    this._trafficCursor = 0;
    this._advanceTrafficCursor();
    this._chargeWasFull = false;
    this._slingReadyWas = false;   // edge latch for the ready cue; must not survive a run
    this.deepMetres = 0;
    this.stats = {
      deepMetres: 0, maxChain: 0, bumps: 0, spins: 0, overtakes: 0,
      spinShoulder: 0, spinRear: 0, offroadTime: 0, boostTime: 0, releases: 0,
      chainPasses: 0, rivalPasses: 0, trafficPasses: 0,
      chainBaseScore: 0, chainBonusScore: 0,
      trafficPassesByLeg: Array(S.TOTAL_LEGS).fill(0),
      trafficScoreByLeg: Array(S.TOTAL_LEGS).fill(0),
    };
  }

  _newPassId(kind) {
    return `${kind}:${this._nextPassId++}`;
  }

  _primeTarget(o, kind) {
    if (o.passId === undefined) o.passId = this._newPassId(kind);
    if (o._passPrevRelZ === undefined) o._passPrevRelZ = o.z - this.z;
    return o;
  }

  _clearBoost() {
    this.boost = { active: false, t: 0, dur: 0, gain: 0, sling: false, pending: 0, ending: false };
  }

  _startChainSession() {
    this.chain = 0;
    this._chainSession = { seen: new Set(), settled: false };
  }

  _endChainSession(ev, reason, awardBonus) {
    const session = this._chainSession;
    if (!session || session.settled) return;
    session.settled = true;
    const chain = this.chain;
    const links = Math.min(Math.max(chain - 1, 0), S.SCORE.chainLinkCap);
    const bonus = awardBonus ? S.SCORE.chainLink * links : 0;
    if (bonus > 0) {
      this.score += bonus;
      this.stats.chainBonusScore += bonus;
    }
    ev.chainEnd = { chain, bonus, reason, awarded: !!awardBonus };
    this._chainSession = null;
    this.chain = 0;
  }

  _advanceTrafficCursor() {
    const all = this.course.traffic;
    let i = 0;
    while (i < all.length && all[i].z < this.z) i++;
    this._trafficCursor = i;
  }

  get legTarget() {
    const cp = this.course.checkpoints[this.leg - 1];
    return cp ? cp.z : this.course.totalLength;
  }

  get distanceToCheckpoint() {
    return Math.max(0, this.legTarget - this.z);
  }

  // ---------------------------------------------------------------- rivals
  // Rivals run at ~0.95 Vmax, so you can barely close on them in clean air. The pack
  // spacing is therefore set to what a slingshot actually covers: a full release runs
  // ~3.6 s at ~1.28 Vmax while the rival ahead does 0.95, closing roughly 120 m.
  // That is the whole rhythm of the game — the boost is what buys you the next tow —
  // so the spacing is derived from the boost, never picked by feel.
  _packGap() {
    const c = 1;
    const dur = (S.BOOST.baseDur + S.BOOST.durPerCharge * c) * S.BOOST.slingDur;
    const gain = (S.BOOST.baseGain + S.BOOST.gainPerCharge2 * Math.pow(c, S.BOOST.gainExp)) * S.BOOST.slingGain;
    const closing = (S.VMAX * (1 + gain)) - S.rivalSpeed(this.leg);
    const reach = dur * closing;
    return { min: reach * S.PACK_GAP.min, max: reach * S.PACK_GAP.max };
  }

  _spawnRival() {
    const base = S.rivalSpeed(this.leg);
    let front = null;
    for (const r of this.rivals) if (r.z > this.z && (front === null || r.z > front)) front = r.z;
    const gap = this._packGap();
    // When there is nothing ahead to draft, the next tow goes within reach of clean
    // air. Spacing only from the frontmost car would stack the whole pack far up the
    // road and leave the player with no fuel at all — which is exactly what happened.
    const z = front === null
      ? this.z + this.rng.range(45, 80)
      : front + this.rng.range(gap.min, gap.max);
    this.rivals.push(this._primeTarget({
      z,
      x: this.rng.range(-0.45, 0.45),
      targetX: this.rng.range(-0.5, 0.5),
      speed: base,
      baseSpeed: base,
      brakeTimer: this.rng.range(2, 5),
      lamp: 0,          // >0 while the brake lamp is lit
      braking: 0,       // >0 while actually slowed
      overtaken: false,
    }, 'rival'));
  }

  _updateRivals(dt) {
    // Always keep fuel ahead of the player. Three deep, so the next tow is already
    // on screen when you release into the current one.
    let ahead = 0;
    for (const r of this.rivals) if (r.z > this.z) ahead++;
    while (ahead < 3) { this._spawnRival(); ahead++; }

    const wob = S.rivalWobble(this.leg);
    for (const r of this.rivals) {
      r.brakeTimer -= dt;
      if (r.brakeTimer <= 0 && r.lamp <= 0 && r.braking <= 0) {
        r.lamp = S.RIVAL_SLOWDOWN_WARN;   // telegraph BEFORE slowing down
        r.brakeTimer = this.rng.range(2.2, 5.0);
      }
      if (r.lamp > 0) {
        r.lamp -= dt;
        if (r.lamp <= 0) r.braking = 1.0;
      } else if (r.braking > 0) {
        r.braking -= dt;
      }
      // B13. A rival is subject to the same physics as the player, so it must slow for an
      // exception corner too — and that is not merely consistency, it is where the item
      // says the mechanic pays: the pack COMPRESSES on the approach, which is exactly where
      // drafting is easiest, while arriving with a full gauge forces a real decision about
      // whether to spend it before or after the corner. Without this the rivals sailed
      // through a corner the player physically cannot, so every brake corner deleted the
      // tow and the gauge with it (measured: expert releases 14.1 -> 9.8 per run).
      const target = Math.min(
        r.braking > 0 ? r.baseSpeed * (1 - wob) : r.baseSpeed,
        this._cornerSpeedCap(r.z, r.speed),
      );
      // NOT clamped to ACCEL/BRAKE. Tried, because a rival recovering pack speed by a lerp
      // (0.33 s time constant) out-accelerates the player's own ACCEL (0.6 s from an
      // exception corner's exit speed) and that asymmetry looked like the reason a corner
      // costs the draft. Measured on the 32-seed basis it is noise — expert 26/32 -> 25/32,
      // releases 10.6 -> 10.7 — so the extra coupling into pack behaviour is not worth
      // buying, and the recorded cause of the cost stands: it is the closing speed in clean
      // air (7 m/s), not the rival's acceleration.
      r.speed += (target - r.speed) * Math.min(1, dt * 3);

      // Lateral: either threading a slow car or idly wandering, so the draft zone is
      // never a static box. See RIVAL_AVOID in spec.js for why the threading matters.
      const threat = this._rivalThreat(r);
      let rate = S.RIVAL_DRIFT_RATE;
      if (threat) {
        const side = threat.x > 0 ? -1 : 1;
        const lm = S.RIVAL_AVOID.laneMax;
        r.targetX = Math.max(-lm, Math.min(lm, threat.x + side * S.RIVAL_AVOID.offset));
        rate = S.RIVAL_AVOID.rate;
      } else if (Math.abs(r.x - r.targetX) < 0.03) {
        r.targetX = this.rng.range(-0.55, 0.55);
      }
      r.x += Math.sign(r.targetX - r.x) * Math.min(Math.abs(r.targetX - r.x), rate * dt);
      r.z += r.speed * dt;
    }
    this.rivals = this.rivals.filter((r) => r.z > this.z - 80);
  }

  // Speed cap imposed by B13's exception corners on any car at `z` travelling at `v`.
  // Infinity everywhere else — ordinary corners are covered by the CENTRIFUGAL invariant
  // and impose no speed at all, which is the property B13 is deliberately NOT changing.
  // The braking curve (v^2 = vEntry^2 + 2*BRAKE*d) is the same one the driver plans with,
  // so a rival begins to slow at the same point a competent player does and the pack
  // compresses rather than concertinas.
  _cornerSpeedCap(z, v) {
    const horizon = Math.max(60, 2.0 * v);
    let cap = Infinity;
    for (let i = 0; i <= 6; i++) {
      const d = (i / 6) * horizon;
      const entry = S.brakeCornerEntrySpeed(Math.abs(this.course.curveAt(z + d)));
      if (entry === Infinity) continue;
      const allowed = Math.sqrt(entry * entry + 2 * S.BRAKE * 0.75 * d);
      if (allowed < cap) cap = allowed;
    }
    return cap;
  }

  // The nearest slow car a rival is about to run into, or null.
  _rivalThreat(r) {
    let best = null;
    let bestDz = Infinity;
    for (const t of this.traffic) {
      const dz = t.z - r.z;
      if (dz <= 0) continue;
      const dv = r.speed - t.speed;
      if (dv <= 0) continue;
      if (dz > dv * S.RIVAL_AVOID.lookahead) continue;
      if (Math.abs(t.x - r.x) > S.RIVAL_AVOID.dx) continue;
      if (dz < bestDz) { bestDz = dz; best = t; }
    }
    return best;
  }

  _updateTraffic(dt) {
    const horizon = this.z + S.DRAW_DISTANCE * S.SEG_LEN;
    const all = this.course.traffic;
    while (this._trafficCursor < all.length && all[this._trafficCursor].z < horizon) {
      const t = all[this._trafficCursor++];
      this.traffic.push(this._primeTarget({ z: t.z, x: t.x, speed: t.speedFactor * S.VMAX,
        overtaken: false }, 'traffic'));
    }
    for (const t of this.traffic) t.z += t.speed * dt;
    this.traffic = this.traffic.filter((t) => t.z > this.z - 60);
  }

  // ---------------------------------------------------------------- draft
  // Returns the strongest zone the player currently occupies.
  // Also records `zoneDepth`: 0 at the shallow edge of the band, 1 on the bumper. The
  // charge rate is scaled by it, so how well you are placed inside the zone — not merely
  // whether you are inside it — is what fills the gauge.
  _resolveZone() {
    let best = null;
    this.zoneDepth = 0;
    for (const r of this.rivals) {
      const dz = (r.z - this.z) / CL;
      const dx = Math.abs(r.x - this.x);
      if (dz >= S.DEEP.dzMin && dz <= S.DEEP.dzMax && dx < S.DEEP.dxMax) {
        const span = S.DEEP.dzMax - S.DEEP.dzMin;
        this.zoneDepth = span > 0 ? Math.max(0, Math.min(1, (S.DEEP.dzMax - dz) / span)) : 1;
        return 'deep';
      }
      if (dz > S.SHALLOW.dzMin && dz <= S.SHALLOW.dzMax && dx < S.SHALLOW.dxMax) best = 'shallow';
    }
    return best;
  }

  // Charge per second right now. DEEP is proximity-weighted (see DEEP.chargeFloor);
  // SHALLOW is flat, because its whole role is to be the consolation band.
  _chargeRate() {
    const zp = this._zoneParams();
    if (this.zone !== 'deep') return zp.charge;
    const f = S.DEEP.chargeFloor;
    return zp.charge * (f + (1 - f) * (this.zoneDepth || 0));
  }

  _zoneParams() {
    if (this.zone === 'deep') return S.DEEP;
    if (this.zone === 'shallow') return S.SHALLOW;
    return { charge: 0, drag: 1, steer: 1, gFactor: 1 };
  }

  // Half of the rule: "am I in a position from which a slingshot is possible?" — the
  // positional half only. The single answer to "would a release right now be a slingshot?"
  // is slingReady below, and the HUD gauge, the ready cue and _release all read THAT
  // instead of re-deriving it: the defect that made this a getter was copies of the rule
  // drifting apart, so the gauge promised a slingshot the release then refused to give.
  //
  // Coyote time: still a slingshot for BOOST.slingGrace after the last deep tick.
  // Strictly > 0, so the grace is a half-open window [0, slingGrace): a release exactly
  // slingGrace after leaving deep is NOT a slingshot. Chosen that way because the timer
  // is decremented before the release is read, so "grace has run out" and "grace is
  // exactly zero" have to be the same state — otherwise the window would silently be one
  // tick longer than the constant says, and its length would depend on frame rate.
  get slingArmed() {
    return this.zone === 'deep' || this.slingGrace > 0;
  }

  // "A press right now IS a slingshot": armed AND the bar is actually full. This is what
  // the white blink and the ready ping mean, and it is what _release itself uses, so the
  // cue and the outcome are the same fact by construction. A full-but-unarmed gauge is dim
  // gold and silent. minCharge is deliberately NOT the threshold here: between minCharge
  // and CHARGE_MAX a release is legal but is an ORDINARY boost (no 1.4x, no chain), even
  // inside the deep band — a partial deep release used to slingshot, which made the gauge
  // lie in the other direction.
  //
  // `!boost.active` is the third term, and it exists for exactly the same reason as the
  // other two: _release refuses while a boost is still running, so during those up to
  // 2.43 s the white blink and the ready ping were promising a slingshot the button could
  // not deliver — a press did literally nothing. Rather than buy the press back with an
  // input buffer (another grace mechanism on top of the coyote window), the false CUE is
  // deleted: while boosting the gauge stays plain blue and stays silent, and the blink and
  // the ping arrive on the tick the slipstream actually becomes spendable again.
  get slingReady() {
    return this.charge >= S.CHARGE_MAX && this.slingArmed && !this.boost.active;
  }

  _release(ev) {
    // `boost.active` here is now redundant with slingReady's own !boost.active term, but is
    // kept deliberately, for the same reason the slingArmed gate below is kept: this is the
    // one place that states "you cannot spend a boost while a boost is running" as a RULE.
    // slingReady only decides whether a release would be a SLINGSHOT; without this line an
    // ordinary (minCharge..CHARGE_MAX) press would still restack a boost mid-boost.
    if (this.charge < S.BOOST.minCharge || this.boost.active) return;
    const c = this.charge / S.CHARGE_MAX;
    // Redundant since CHARGE_SHALLOW_CAP: charge can only REACH CHARGE_MAX while deep or
    // inside the coyote window, so `charge >= CHARGE_MAX` already implies slingArmed. Kept
    // anyway as the second layer of defence — the cap is a property of the charge loop and
    // a future edit there (a new charge source, a pickup, a different band) could restore
    // a full-but-unarmed gauge; this gate is the one place where "no slingshot without a
    // deep tick" is stated as a rule rather than emerging from arithmetic.
    const sling = this.slingReady;
    let dur = S.BOOST.baseDur + S.BOOST.durPerCharge * c;
    let gain = S.VMAX * (S.BOOST.baseGain + S.BOOST.gainPerCharge2 * Math.pow(c, S.BOOST.gainExp));
    if (sling) { dur *= S.BOOST.slingDur; gain *= S.BOOST.slingGain; }
    // `pending` is the instant velocity step, consumed by the longitudinal block on this
    // same tick (it has to be applied there so it can be clamped against the same cap).
    this.boost = {
      active: true, t: dur, dur, gain, sling,
      pending: gain * S.BOOST.impulse,
      ending: false,          // true once inside the falloff ramp; presentation reads it
    };
    // The assist runs for the whole boost plus assistTime. A slingshot puts you into
    // traffic at 130+ m/s in the middle of whatever corner you happen to be in, and with
    // a quarter-second of assist the release was un-steerable: every remaining spin in a
    // measured expert run was a rear-end taken at |curve| >= 0.68 while boosting. The
    // boost is supposed to punch you through a hole, which means you have to be able to
    // aim it.
    this.assist = dur + S.BOOST.assistTime;   // dirty-air exit assist: you CAN steer out
    this.charge = 0;
    this.rearm = S.BOOST.rearm;
    this._chargeWasFull = false;
    this.stats.releases++;
    if (sling) this._startChainSession();
    ev.release = { charge: c, sling };
  }

  // ---------------------------------------------------------------- step
  // input = { steer: -1..1, throttle: -1..1, boost: bool (edge-triggered by caller) }
  step(dt, input) {
    const ev = emptyEvents();
    if (this.gameOver || this.finished) return ev;

    dt = Math.min(dt, 1 / 30);   // never let a stalled tab teleport the car

    this._updateRivals(dt);
    this._updateTraffic(dt);

    const spinning = this.spin > 0;
    this.zone = spinning ? null : this._resolveZone();
    this.zoneLevel = this.zone === 'deep' ? 1 : this.zone === 'shallow' ? 0.5 : 0;
    const zp = this._zoneParams();

    // ---- slingshot coyote time. Resolved AFTER the zone and BEFORE the release read, so
    // the tick on which the car leaves the deep band still has grace left (slingGrace - dt)
    // rather than a one-tick hole where a perfectly timed release silently downgrades.
    if (this.zone === 'deep') this.slingGrace = S.BOOST.slingGrace;
    else if (this.slingGrace > 0) this.slingGrace = Math.max(0, this.slingGrace - dt);

    // ---- charge
    if (!spinning) {
      if (this.rearm > 0) this.rearm -= dt;
      const canCharge = this.rearm <= 0;
      // The order of these four cases IS the rule; they are not independent.
      //   1. deep      -> fill to CHARGE_MAX, as before.
      //   2. in grace  -> hold, drain NOTHING. Checked before both the shallow give-back
      //      and the clean-air drain: the coyote window means "you were deep an instant
      //      ago", and at CHARGE_DRAIN a single tick already puts charge under CHARGE_MAX,
      //      which would silently cancel the window it is supposed to protect. Holding for
      //      out-of-zone too (not just deep -> shallow) is deliberate: the window is
      //      defined by where you WERE, so splitting its behaviour on where you now are
      //      would make the same 0.25 s mean two different things.
      //   3. shallow   -> fill only to CHARGE_SHALLOW_CAP, and give back anything above it
      //      at CHARGE_EXCESS_DRAIN, clamped AT the cap.
      //   4. otherwise -> the old CHARGE_DRAIN leak.
      if (this.zone === 'deep' && canCharge) {
        this.charge = Math.min(S.CHARGE_MAX, this.charge + this._chargeRate() * dt);
      } else if (this.slingGrace > 0) {
        /* hold */
      } else if (this.zone === 'shallow') {
        if (this.charge > S.CHARGE_SHALLOW_CAP) {
          this.charge = Math.max(S.CHARGE_SHALLOW_CAP, this.charge - S.CHARGE_EXCESS_DRAIN * dt);
        } else if (canCharge) {
          this.charge = Math.min(S.CHARGE_SHALLOW_CAP, this.charge + this._chargeRate() * dt);
        }
      } else {
        this.charge = Math.max(0, this.charge - S.CHARGE_DRAIN * dt);
      }
      if (this.charge >= S.CHARGE_MAX && !this._chargeWasFull) {
        this._chargeWasFull = true;
        ev.chargeFull = true;
      } else if (this.charge < S.CHARGE_MAX) {
        this._chargeWasFull = false;
      }
      if (input.boost) this._release(ev);
    }

    // ---- ready cue. Edge-triggered on slingReady, resolved AFTER the release so a press
    // on the very tick the gauge fills does not also ping (the release sound owns that
    // frame, and charge is already back to 0 here). Falling back to false re-arms it, so
    // dropping out of the tow and tucking back in pings again. `chargeFull` above stays as
    // the pure charge-level edge; nothing consumes it today, but the two are genuinely
    // different facts and collapsing them is what produced the lying cue in the first place.
    {
      const ready = this.slingReady;
      if (ready && !this._slingReadyWas) ev.slingReady = true;
      this._slingReadyWas = ready;
    }

    // ---- boost timer. Expiry is recorded now but settled only after collision/pass and
    // progression, so a crossing on the final boost tick remains eligible.
    let boostExpires = false;
    if (this.boost.active) {
      this.stats.boostTime += dt;
      this.boost.t -= dt;
      this.boost.ending = this.boost.t > 0 && this.boost.t < S.BOOST.falloff;
      if (this.boost.t <= 0) {
        this.boost.t = 0;
        boostExpires = true;
      }
    }
    if (this.assist > 0) this.assist -= dt;
    if (this.stun > 0) this.stun -= dt;

    // ---- longitudinal
    const offroad = Math.abs(this.x) > S.HIT.shoulderSoft;
    let cap = S.VMAX * (1 + (1 - zp.drag) * 0.16);
    // The boost's gain rides a flat-then-ramp-down envelope. Holding it flat to the last
    // frame and then dropping the cap 45 m/s in one tick made the end read as a bug; a
    // linear ramp over BOOST.falloff, with CAP_DECAY dragging the car down through it,
    // reads as the slipstream running out.
    let boostGain = 0;
    if (this.boost.active) {
      boostGain = this.boost.gain
        * (this.boost.t < S.BOOST.falloff ? Math.max(0, this.boost.t) / S.BOOST.falloff : 1);
      cap += boostGain;
    }
    if (offroad) cap *= S.OFFROAD_FACTOR;
    this.boostGain = boostGain;   // readout for the presentation layer

    if (spinning) {
      this.spin -= dt;
      this.speed += (S.VMAX * S.HIT.spinSpeedMul - this.speed) * Math.min(1, dt * 4);
    } else {
      const th = input.throttle;
      // The throttle can never take you above your current cap. VMAX is documented as the
      // player's own top speed and it has to actually BE one: previously ACCEL was added
      // first and the cap was only a per-frame lerp toward it, so holding full throttle
      // settled ~10.6 m/s ABOVE the cap — by a frame-rate-dependent amount — and handed a
      // driver who ignored the mechanic entirely a sustained 1.03-1.08 VMAX for free.
      // That, not the charge rate or the boost gain, was why using the tow lost to
      // ignoring it. The only thing that raises the cap is a boost.
      // THE IMPULSE. Applied here rather than in _release() so it is clamped against the
      // very cap the boost just raised — a step that overshot the ceiling would be bled
      // straight back off by CAP_DECAY and the player would have been "given" speed the
      // game immediately took away. Offroad, `cap` has already been multiplied by
      // OFFROAD_FACTOR, so firing with a wheel in the grass still buys you nothing: that
      // is deliberate, and it is the one path where a dash legitimately does nothing.
      if (this.boost.pending > 0) {
        this.speed = Math.min(this.speed + this.boost.pending, Math.max(cap, this.speed));
        this.boost.pending = 0;
      }
      // While boosting, the throttle pulls at BOOST.accel instead of ACCEL, so the
      // remaining ~40% of the gain lands inside a tenth of a second instead of ramping
      // for the better part of two seconds. Outside a boost, ACCEL is untouched.
      const acc = this.boost.active ? S.BOOST.accel : S.ACCEL;
      if (th > 0) this.speed = Math.min(this.speed + acc * th * dt, Math.max(cap, this.speed));
      else if (th < 0) this.speed += S.BRAKE * th * dt;
      // P6: this used to ramp the drag in over COAST_DRAG_ONSET. Station-keeping in the
      // draft is done with SHORT lifts, and the ramp delivered under half the nominal drag
      // over one — below spec.DRAFT_HOLD_DRAG — so the gauge stopped filling by hand. Full
      // drag on the first frame of a closed throttle; see spec.js.
      else this.speed -= S.COAST_DRAG * dt;
      // Above the cap only happens on the way down from a boost; bleed it off smoothly.
      if (this.speed > cap) this.speed += (cap - this.speed) * Math.min(1, dt * S.CAP_DECAY);
      this.speed = Math.max(0, this.speed);
    }

    // ---- lateral
    const curve = this.course.curveAt(this.z);
    const gMul = this.assist > 0 ? 1 : zp.gFactor;
    const steerMul = this.assist > 0 ? S.BOOST.assistSteer : zp.steer;
    if (!spinning && this.stun <= 0) {
      const authority = 0.35 + 0.65 * Math.min(1, this.speed / S.VMAX);
      this.x += input.steer * S.STEER_RATE * authority * steerMul * dt;
    }
    this.x -= curve * this.speed * this.speed * S.CENTRIFUGAL * gMul * dt;
    this.x = Math.max(-1.9, Math.min(1.9, this.x));

    if (offroad && !spinning) {
      this.stats.offroadTime += dt;
      if (Math.abs(this.x) > S.HIT.shoulderSpin) this._doSpin(ev, 'shoulder');
    }

    // ---- advance and score distance
    const before = this.z;
    this.z += this.speed * dt;
    const travelled = this.z - before;
    this.score += travelled * S.SCORE.perMetre;
    if (this.zone === 'deep') {
      this.deepMetres += travelled;
      this.stats.deepMetres += travelled;
      this.score += travelled * S.SCORE.deepMetreBonus;
    }

    const collided = this._collide(ev);
    this._overtakes(ev, collided);
    this._progress(dt, ev);
    if (boostExpires && this.boost.active) {
      this._endChainSession(ev, 'natural', true);
      this._clearBoost();
      ev.boostEnd = true;
    }
    return ev;
  }

  _doSpin(ev, cause = 'rear') {
    this.spin = S.HIT.spinTime;
    if (cause === 'shoulder') this.stats.spinShoulder++; else this.stats.spinRear++;
    this.charge = 0;
    this.slingGrace = 0;   // a spin ends the tow; the grace cannot survive it either
    this._slingReadyWas = false;   // re-arm the cue: recovering into a tow should ping again
    this._endChainSession(ev, 'spin', false);
    this._clearBoost();
    this.x = Math.max(-1.0, Math.min(1.0, this.x));
    this.stats.spins++;
    ev.spin = true;
  }

  _doBump(ev, otherX) {
    this.x += Math.sign(this.x - otherX || 1) * S.HIT.bumpPush;
    this.charge *= S.HIT.bumpChargeMul;
    this.stun = S.HIT.bumpStun;
    this.stats.bumps++;
    ev.bump = true;
  }

  _collide(ev) {
    const collided = new Set();
    if (this.spin > 0) return collided;
    const check = (o, kind) => {
      this._primeTarget(o, kind);
      const dz = o.z - this.z;
      const sweptThrough = o._passPrevRelZ > 0 && dz <= 0;
      if (!sweptThrough && (dz <= 0 || dz > S.HIT.dzMax * CL)) return false;
      if (Math.abs(o.x - this.x) >= S.HIT.dxMax) return false;
      collided.add(o.passId);
      // A bump may leave the boost running; excluding the identity here prevents the same
      // contacted car from becoming a scoring pass on a later crossing in this session.
      if (this._chainSession) this._chainSession.seen.add(o.passId);
      const dv = (this.speed - o.speed) / S.VMAX;
      if (dv >= S.HIT.spinDv) this._doSpin(ev);
      else this._doBump(ev, o.x);
      return true;
    };
    for (const r of this.rivals) if (check(r, 'rival')) return collided;
    for (const t of this.traffic) if (check(t, 'traffic')) return collided;
    return collided;
  }

  _overtakes(ev, collided = new Set()) {
    const targets = [
      ...this.rivals.map((o) => ({ o, kind: 'rival', points: S.SCORE.slingshotRival })),
      ...this.traffic.map((o) => ({ o, kind: 'traffic', points: S.SCORE.slingshotTraffic })),
    ];
    let closestPassDx = Infinity;
    for (const { o, kind, points } of targets) {
      this._primeTarget(o, kind);
      const relZ = o.z - this.z;
      const crossed = o._passPrevRelZ > 0 && relZ <= 0;
      if (crossed && !o.overtaken) {
        o.overtaken = true;
        if (!collided.has(o.passId)) {
          this.stats.overtakes++;
          ev.overtake++;
          // Keep the existing deterministic traversal as the tie-break: update only for
          // a STRICTLY closer clean crossing, never sort and never consult RNG. This is
          // independent of whether the pass belongs to a scoring slingshot chain.
          const relativeDx = o.x - this.x;
          const absDx = Math.abs(relativeDx);
          if (absDx < closestPassDx) {
            closestPassDx = absDx;
            ev.overtakePan = S.overtakePan(relativeDx);
          }
          const session = this._chainSession;
          if (this.boost.active && this.boost.sling && session && !session.seen.has(o.passId)) {
            session.seen.add(o.passId);
            this.chain++;
            this.score += points;
            this.stats.chainPasses++;
            this.stats.chainBaseScore += points;
            if (kind === 'rival') this.stats.rivalPasses++;
            else {
              this.stats.trafficPasses++;
              this.stats.trafficPassesByLeg[this.leg - 1]++;
              this.stats.trafficScoreByLeg[this.leg - 1] += points;
            }
            this.stats.maxChain = Math.max(this.stats.maxChain, this.chain);
            ev.passes.push({ kind, passId: o.passId, points, chain: this.chain });
          }
        }
      }
      o._passPrevRelZ = relZ;
    }
  }

  _progress(dt, ev) {
    this.timer -= dt;

    const cp = this.course.checkpoints[this.leg - 1];
    if (cp && this.z >= cp.z) {
      if (this.leg >= S.TOTAL_LEGS) {
        this._endChainSession(ev, 'finish', true);
        this._clearBoost();
        this.score += Math.max(0, this.timer) * S.SCORE.finishTime;
        this.finished = true;
        ev.finish = true;
        return;
      }
      // The clock is REPLACED, not extended. Carrying surplus forward would let a
      // strong opening leg pay for a weak final one, which silently deletes the whole
      // difficulty curve — every leg has to be met on its own terms. Surplus is paid
      // out as score instead, so driving fast early is still worth doing.
      const remaining = Math.max(0, this.timer);
      const bonusScore = remaining * S.SCORE.checkpoint;
      const timeSet = S.legExtension(this.leg);
      this.score += bonusScore;
      this.timer = timeSet;
      // Preserve causal values at the event. The presentation must not reconstruct the
      // bonus after the old timer has been replaced by the next leg's allowance.
      this.lastCheckpoint = { checkpoint: this.leg, remaining, timeSet, bonusScore };
      this.legStartZ = cp.z;
      this.leg++;
      ev.checkpoint = true;
    }

    if (this.timer <= 0) {
      this.timer = 0;
      this._endChainSession(ev, 'timeout', false);
      this._clearBoost();
      ev.timeout = true;
      this.gameOver = true;
      ev.gameover = true;
    }
  }

  // ---------------------------------------------------------------- readouts
  // The one number the whole difficulty curve rests on: how fast you must average
  // over this leg to reach the next gate. Displayed nowhere, used by tests.
  requiredAverage(leg = this.leg) {
    return S.legDistance(leg) / S.legExtension(leg);
  }
}
