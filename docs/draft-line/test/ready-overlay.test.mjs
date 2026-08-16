// Focused visual contract for the READY instruction hierarchy and contrast treatment.
import assert from 'node:assert/strict';
import * as S from '../src/spec.js';
import { Game } from '../src/game.js';
import { textWidth } from '../src/font.js';

const noop = () => {};
globalThis.localStorage = { getItem: () => null, setItem: noop };

const fills = [];
const ctx = new Proxy({ fillStyle: '#000', globalAlpha: 1 }, {
  get(target, key) {
    if (key === 'fillRect') {
      return (x, y, w, h) => fills.push({ x, y, w, h, color: target.fillStyle, alpha: target.globalAlpha });
    }
    return key in target ? target[key] : noop;
  },
  set(target, key, value) { target[key] = value; return true; },
});

const game = new Game(ctx);
fills.length = 0;
game._overlayReady();

const { ready, countdown, instruction } = S.READY_OVERLAY;
const plateW = textWidth(instruction.text, instruction.scale) + instruction.padX * 2;
const plateH = instruction.scale * 5 + instruction.padY * 2;
assert.deepEqual(fills[0], {
  x: Math.round((S.VIEW_W - plateW) / 2),
  y: instruction.y - instruction.padY,
  w: plateW,
  h: plateH,
  color: S.PAL[instruction.plateRole],
  alpha: instruction.plateAlpha,
});
assert.equal(ctx.globalAlpha, 1);
assert.ok(countdown.scale > ready.scale && ready.scale > instruction.scale,
  'countdown, READY, and instruction must retain their visual size hierarchy');
assert.equal(instruction.colorRole, 'hudText');
assert.notEqual(instruction.colorRole, 'hudDim');

// Conservative bound: even if the plate were composited over pure white, a 72%-opaque
// black plate keeps the HUD text comfortably above the 4.5:1 small-text threshold.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (color) => rgb(color)
  .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const worstPlateChannel = 1 - instruction.plateAlpha;
const worstPlate = `#${Math.round(worstPlateChannel * 255).toString(16).padStart(2, '0').repeat(3)}`;
const ratio = (luminance(S.PAL.hudText) + 0.05) / (luminance(worstPlate) + 0.05);
assert.ok(ratio >= 4.5, `instruction contrast ${ratio.toFixed(2)}:1 must be at least 4.5:1`);

console.log(`  PASS  READY instruction uses a local ${instruction.plateAlpha * 100}% dark plate`);
console.log(`  PASS  conservative instruction contrast is ${ratio.toFixed(2)}:1`);
console.log('  PASS  READY and countdown remain above the instruction in the hierarchy');
console.log('\n3 passed, 0 failed');
