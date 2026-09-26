// SKYHAUL — procedural arcade sound. Game code emits event names; this maps them to
// short square/triangle/noise voices in the spirit of an early-80s sound board.
(function (root) {
  "use strict";
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    // A gentle limiter so the louder mix never clips when several voices stack.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    // 4-bit-ish stepped noise, like an LFSR at a low clock.
    let v = 0;
    for (let i = 0; i < d.length; i++) {
      if (i % 3 === 0) v = Math.random() * 2 - 1;
      d[i] = v;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  // Stereo placement: the event being played sets the pan from its screen x (see play()).
  let curPan = 0;
  function out(node) {
    if (curPan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = curPan;
      node.connect(p).connect(master);
    } else node.connect(master);
  }

  function tone(type, f0, f1, dur, vol, at) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (at || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0)
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    out(o.connect(g));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, fc0, fc1, at) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (at || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(fc0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, fc1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    out(s.connect(f).connect(g));
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  // Chain-length pitch: each attached body lifts the grab blip a scale step.
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const semi = (n) => Math.pow(2, n / 12);

  const handlers = {
    round(e) {
      if (e.first) {
        // New planet: a longer, lower call.
        [0, 7, 12, 7, 15, 19].forEach((s, i) =>
          tone("triangle", 220 * semi(s), 220 * semi(s), 0.14, 0.13, i * 0.12),
        );
        return;
      }
      [0, 4, 7, 12].forEach((s, i) =>
        tone("square", 330 * semi(s), 330 * semi(s), 0.1, 0.12, i * 0.09),
      );
    },
    bonusStart() {
      [12, 7, 12, 16, 19, 24].forEach((s, i) =>
        tone("square", 392 * semi(s), 392 * semi(s), 0.07, 0.1, i * 0.08),
      );
    },
    bonusEnd(e) {
      if (e.perfect) {
        [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) =>
          tone("square", 523 * semi(s), 523 * semi(s), 0.09, 0.12, i * 0.07),
        );
        noise(0.6, 0.05, 9000, 3000, 0.1);
      } else {
        [7, 4, 0].forEach((s, i) =>
          tone("triangle", 392 * semi(s), 392 * semi(s), 0.12, 0.1, i * 0.12),
        );
      }
    },
    // Engine labour while hauling: lower and slower the heavier the chain.
    // Near miss: a fast airy whoosh with a high glint.
    graze() {
      noise(0.12, 0.09, 7000, 2500);
      tone("square", 2960, 3520, 0.05, 0.05);
    },
    turretCharge() {
      tone("square", 200, 800, 0.55, 0.05);
    },
    turretFire(e) {
      noise(0.14, 0.12, 6000, 900);
      tone("sawtooth", 900, 1400, 0.12, 0.08);
      if (e.shielded) {
        // The chain took it: a bright metallic clink over the zap.
        tone("square", 2640, 2640, 0.04, 0.09, 0.03);
        tone("square", 1980, 1980, 0.05, 0.07, 0.07);
      }
    },
    hotTick(e) {
      tone(
        "square",
        e.left <= 2 ? 1320 : 990,
        e.left <= 2 ? 1320 : 990,
        0.06,
        0.07,
      );
    },
    snatch() {
      tone("square", 988, 740, 0.07, 0.08);
      tone("square", 740, 494, 0.1, 0.08, 0.07);
    },
    stealBack() {
      [0, 7, 12].forEach((s, i) =>
        tone("square", 660 * semi(s), 660 * semi(s), 0.05, 0.1, i * 0.04),
      );
    },
    drop() {
      tone("triangle", 330, 220, 0.12, 0.05);
    },
    chute() {
      tone("triangle", 1320, 990, 0.08, 0.03);
    },
    hiscore() {
      [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) =>
        tone("square", 440 * semi(s), 440 * semi(s), 0.08, 0.11, i * 0.08),
      );
    },
    entryDone() {
      [12, 19, 24].forEach((s, i) =>
        tone("square", 440 * semi(s), 440 * semi(s), 0.1, 0.11, i * 0.1),
      );
    },
    ui() {
      tone("square", 880, 880, 0.04, 0.08);
    },
    uiMove() {
      tone("square", 1320, 1320, 0.015, 0.05);
    },
    go() {
      tone("square", 660, 660, 0.06, 0.08);
    },
    attach(e) {
      const k = scale[Math.min(scale.length - 1, (e.w || e.n) - 1)];
      if (e.heavy) {
        tone("square", 110 * semi(k), 90 * semi(k), 0.14, 0.16);
        noise(0.06, 0.08, 800, 200);
        return;
      }
      tone("square", 440 * semi(k), 440 * semi(k) * 1.06, 0.07, 0.13);
      if (e.air)
        tone("triangle", 880 * semi(k), 1320 * semi(k), 0.12, 0.12, 0.03);
    },
    cut(e) {
      if (e.cause === "death") return;
      tone("sawtooth", 700, 120, 0.22, 0.1);
      noise(0.12, 0.12, 4000, 600);
    },
    tele() {
      tone("square", 1760, 1760, 0.03, 0.05);
      tone("square", 1760, 1760, 0.03, 0.05, 0.1);
      tone("square", 1760, 1760, 0.03, 0.05, 0.2);
    },
    // (A committed pass is shown by the longer exhaust and edge ticks; no sound, to keep the
    // mix for the telegraph and the shot.)
    lock() {},
    fire() {
      tone("square", 2200, 300, 0.18, 0.09);
      noise(0.08, 0.06, 8000, 2000);
    },
    rescue() {
      tone("triangle", 523, 784, 0.12, 0.07);
    },
    dock() {
      tone("triangle", 196, 392, 0.12, 0.12);
    },
    reel(e) {
      const s = Math.min(24, ((e.w || e.k) - 1) * 2);
      tone("square", 392 * semi(s), 392 * semi(s), e.heavy ? 0.1 : 0.06, 0.1);
      if (e.heavy) tone("square", 196 * semi(s), 196 * semi(s), 0.1, 0.08);
    },
    delivered(e) {
      if (e.n >= 5) {
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
          tone(
            "square",
            523 * semi(s),
            523 * semi(s),
            0.09,
            0.12,
            0.05 + i * 0.06,
          ),
        );
        noise(0.5, 0.05, 9000, 3000, 0.05);
      } else if (e.n >= 3) {
        [0, 7, 12].forEach((s, i) =>
          tone(
            "square",
            523 * semi(s),
            523 * semi(s),
            0.08,
            0.1,
            0.05 + i * 0.06,
          ),
        );
      } else {
        tone("square", 523, 523, 0.08, 0.08, 0.05);
      }
    },
    mine() {
      tone("triangle", 180, 160, 0.05, 0.05);
    },
    boom() {
      noise(0.35, 0.22, 2500, 80);
      tone("square", 160, 50, 0.25, 0.08);
    },
    death() {
      noise(0.9, 0.3, 3000, 60);
      tone("sawtooth", 300, 40, 0.8, 0.12);
    },
    alert() {
      for (let i = 0; i < 4; i++)
        tone(
          "square",
          i % 2 ? 620 : 880,
          i % 2 ? 880 : 620,
          0.16,
          0.08,
          i * 0.17,
        );
    },
    clear(e) {
      // Time bonus: a quick rising tick run while the fuse counts into points.
      if (e && e.secsLeft > 0) {
        const n = Math.min(12, e.secsLeft);
        for (let i = 0; i < n; i++)
          tone(
            "square",
            1320 + i * 40,
            1320 + i * 40,
            0.025,
            0.05,
            0.95 + i * (1 / n),
          );
      }
      [0, 4, 7, 12, 7, 12, 16, 24].forEach((s, i) =>
        tone("square", 392 * semi(s), 392 * semi(s), 0.1, 0.11, i * 0.1),
      );
    },
    extend() {
      [0, 12, 0, 12, 24].forEach((s, i) =>
        tone("triangle", 660 * semi(s), 660 * semi(s), 0.07, 0.12, i * 0.07),
      );
    },
    complete() {
      // Mission complete: the longest fanfare in the game.
      const seq = [0, 4, 7, 12, 7, 12, 16, 19, 16, 19, 24, 28, 31, 36];
      seq.forEach((st, i) => tone("square", 392 * semi(st), 392 * semi(st), 0.12, 0.12, i * 0.11));
      [0, 7, 12].forEach((st, i) => tone("triangle", 196 * semi(st), 196 * semi(st), 1.4, 0.08, 1.5 + i * 0.05));
      noise(1.2, 0.04, 9000, 3000, 1.5);
    },
    gameover(e) {
      if (e && e.cleared) return; // the mission-complete fanfare already played
      [12, 7, 4, 0, -5].forEach((s, i) =>
        tone("triangle", 330 * semi(s), 330 * semi(s), 0.2, 0.12, i * 0.2),
      );
    },
    land() {},
    defTurn() {},
  };

  function play(e) {
    const h = handlers[e.t];
    if (!h) return;
    curPan = typeof e.x === "number" ? Math.max(-0.75, Math.min(0.75, (e.x / 320) * 1.5 - 0.75)) : 0;
    h(e);
    curPan = 0;
  }

  // Hauling engine: one continuous voice while captives hang from the lander. A low-passed square
  // wave with a tremolo "chug"; heavier hauls sound lower and chug slower. engine(0) fades it out.
  let eng = null;
  function engine(w) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (w > 0 && !muted) {
      if (!eng) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        const amp = ctx.createGain();
        amp.gain.value = 0;
        const lfo = ctx.createOscillator();
        lfo.type = "square";
        const depth = ctx.createGain();
        const trem = ctx.createGain();
        trem.gain.value = 0.5;
        lfo.connect(depth).connect(trem.gain);
        osc.connect(lp).connect(trem).connect(amp).connect(master);
        osc.start();
        lfo.start();
        eng = { osc, lfo, depth, amp, w: -1 };
      }
      if (eng.w !== w) {
        eng.w = w;
        eng.osc.frequency.setTargetAtTime(170 / (1 + 0.1 * w), now, 0.05);
        eng.lfo.frequency.setTargetAtTime(Math.max(3, 9 - w * 0.8), now, 0.05);
        eng.depth.gain.setTargetAtTime(0.45, now, 0.05);
      }
      eng.amp.gain.setTargetAtTime(0.1, now, 0.04);
    } else if (eng) {
      const e = eng;
      eng = null;
      e.amp.gain.setTargetAtTime(0, now, 0.05);
      e.osc.stop(now + 0.4);
      e.lfo.stop(now + 0.4);
    }
  }

  root.SKYAUDIO = {
    unlock,
    play,
    engine,
    // (test boundary) the master bus, so an analyser can measure what is actually output
    bus: () => master,
    toggle() {
      muted = !muted;
      if (muted) engine(0);
      return muted;
    },
  };
})(window);
