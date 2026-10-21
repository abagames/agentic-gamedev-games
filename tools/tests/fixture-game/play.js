// The fixture game in a browser, for the review kit's tests. Arrow keys move a lane per press;
// Space or Enter starts a run. ?seed=N first seed, ?speed=N ticks per frame, ?manual=1 no
// animation loop (tests call __play.advance).
(function () {
  const core = window.FixtureCore, q = new URLSearchParams(location.search);
  const cv = document.getElementById("c"), g = cv.getContext("2d");
  let seed = +q.get("seed") || 1, st = core.create(seed), mode = "title", pending = 0, last = "";
  const speed = +q.get("speed") || 1;
  window.REVIEW && REVIEW.attach({ slug: "fixture-game", build: "dev", level: "replay", key: "KeyN", used: ["ArrowLeft", "ArrowRight", "Space", "Enter"], hash: () => core.hash(st) });

  function start() {
    st = core.create(seed); mode = "play"; pending = 0;
    window.REVIEW && REVIEW.runStart({ seed });
    seed++;
  }
  function tick() {
    if (mode !== "play") return;
    const input = { move: pending }; pending = 0;
    core.step(st, input);
    window.REVIEW && REVIEW.step(input);
    if (core.ended(st)) {
      mode = "over";
      last = `RUN v1 build=dev progress=${st.coins} score=${st.score} time=${Math.round(st.tick / 60)}` + (st.hits ? ` fail=bolt:${st.hits}` : "");
      console.log(last); location.hash = encodeURIComponent(last);
      window.REVIEW && REVIEW.runEnd(last);
    }
  }
  function draw() {
    g.fillStyle = "#000"; g.fillRect(0, 0, 224, 256);
    for (let l = 0; l < 3; l++) { g.fillStyle = "#1c1c2a"; g.fillRect(8 + l * 72, 24, 64, 224); }
    for (const b of st.bolts) { const k = 1 - (b.landsAt - st.tick) / core.BOLT_FLIGHT; g.fillStyle = "#ff3b30"; g.fillRect(8 + b.lane * 72, 24, 64, 4 + k * 200); }
    if (st.coin) { g.fillStyle = "#ffd84a"; g.fillRect(32 + st.coin.lane * 72, 200, 16, 16); }
    g.fillStyle = "#6fe8ff"; g.fillRect(28 + st.lane * 72, 224, 24, 16);
    g.fillStyle = "#fff"; g.font = "8px monospace"; g.fillText(`SCORE ${st.score}  LIVES ${st.lives}  ${mode.toUpperCase()}`, 8, 14);
  }
  addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft") pending = -1;
    else if (e.code === "ArrowRight") pending = 1;
    else if ((e.code === "Space" || e.code === "Enter") && mode !== "play") start();
  });
  if (q.get("manual") !== "1") {
    let prev = performance.now(), acc = 0;
    const loop = (now) => { acc += Math.min(100, now - prev); prev = now; while (acc >= 1000 / 60) { acc -= 1000 / 60; for (let i = 0; i < speed; i++) tick(); } draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  } else draw();
  window.__play = { advance(n) { for (let i = 0; i < n; i++) tick(); draw(); }, get state() { return st; }, get mode() { return mode; }, get last() { return last; } };
})();
