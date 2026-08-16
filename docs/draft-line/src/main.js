import * as S from './spec.js';
import { Game } from './game.js';

const canvas = document.getElementById('screen');
canvas.width = S.VIEW_W;
canvas.height = S.VIEW_H;
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const game = new Game(ctx);
window.__game = game;   // handy for the headless smoke test

function fit() {
  const scale = Math.max(1, Math.floor(Math.min(
    window.innerWidth / S.VIEW_W,
    window.innerHeight / S.VIEW_H,
  )));
  canvas.style.width = `${S.VIEW_W * scale}px`;
  canvas.style.height = `${S.VIEW_H * scale}px`;
}
window.addEventListener('resize', fit);
fit();

const HELD = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
window.addEventListener('keydown', (e) => {
  if (HELD.has(e.code)) e.preventDefault();
  game.onKeyDown(e.code);
});
window.addEventListener('keyup', (e) => game.onKeyUp(e.code));
document.addEventListener('visibilitychange', () => {
  game.setPageVisible(!document.hidden);
});
window.addEventListener('blur', () => game.setWindowFocused(false));
window.addEventListener('focus', () => game.setWindowFocused(true));
game.setPageVisible(!document.hidden);
game.setWindowFocused(document.hasFocus());

let last = performance.now();
function frame(now) {
  // Clamp so an alt-tabbed tab does not resume with a one-second physics step.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
