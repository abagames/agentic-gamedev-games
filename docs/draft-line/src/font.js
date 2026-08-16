// 3x5 pixel font. Chunky by design — scaled up it reads as an early-80s board.
const G = {
  '0': '111,101,101,101,111', '1': '010,110,010,010,111', '2': '111,001,111,100,111',
  '3': '111,001,111,001,111', '4': '101,101,111,001,001', '5': '111,100,111,001,111',
  '6': '111,100,111,101,111', '7': '111,001,001,001,001', '8': '111,101,111,101,111',
  '9': '111,101,111,001,111',
  A: '111,101,111,101,101', B: '110,101,110,101,110', C: '111,100,100,100,111',
  D: '110,101,101,101,110', E: '111,100,111,100,111', F: '111,100,111,100,100',
  G: '111,100,101,101,111', H: '101,101,111,101,101', I: '111,010,010,010,111',
  J: '001,001,001,101,111', K: '101,101,110,101,101', L: '100,100,100,100,111',
  M: '101,111,111,101,101', N: '110,101,101,101,101', O: '111,101,101,101,111',
  P: '111,101,111,100,100', Q: '111,101,101,111,011', R: '111,101,110,101,101',
  S: '111,100,111,001,111', T: '111,010,010,010,010', U: '101,101,101,101,111',
  V: '101,101,101,101,010', W: '101,101,111,111,101', X: '101,101,010,101,101',
  Y: '101,101,111,010,010', Z: '111,001,010,100,111',
  ' ': '000,000,000,000,000', '.': '000,000,000,000,010', ':': '000,010,000,010,000',
  '/': '001,001,010,100,100', '-': '000,000,111,000,000', '!': '010,010,010,000,010',
  '*': '101,010,111,010,101', '<': '001,010,100,010,001', '>': '100,010,001,010,100',
  // '+' earns its place the hard way: the checkpoint banner drew "+33.2 SEC" and, with no
  // '+' in this table, the old fallback rendered it as "-33.2 SEC" — the player read a
  // bonus as a penalty. Same 3x5 weight as '-', one pixel of stem above and below.
  '+': '000,010,111,010,000',
};

// The fallback is DELIBERATELY UGLY, and that is the whole point of it.
// It used to be G['-'], i.e. an unknown character silently rendered as a real, meaningful
// glyph. That is the worst possible failure mode for a font: the string still looks like a
// sentence, so nothing about it invites a second look, while its MEANING has been changed —
// "+33.2 SEC" became "-33.2 SEC" and shipped for six passes. A solid block cannot be
// mistaken for text, so the next '%', ':' variant, '(' or 'e' anyone types shows up as
// damage on the first frame it is drawn instead of as a plausible lie.
// MISSING records every character that took this path, so a test can assert it stays empty
// without anyone having to eye-hunt strings again (see sim.test.mjs §14).
const TOFU = '111,111,111,111,111';
export const MISSING = new Set();
export const GLYPHS = G;

const CACHE = {};
function rows(ch) {
  if (!CACHE[ch]) {
    if (!G[ch]) MISSING.add(ch);
    CACHE[ch] = (G[ch] || TOFU).split(',');
  }
  return CACHE[ch];
}

export const textWidth = (s, px = 1) => s.length * 4 * px - px;

export function drawText(ctx, s, x, y, px = 1, color = '#fff') {
  ctx.fillStyle = color;
  const up = String(s).toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const r = rows(up[i]);
    const ox = x + i * 4 * px;
    for (let ry = 0; ry < 5; ry++) {
      const line = r[ry];
      for (let rx = 0; rx < 3; rx++) {
        if (line[rx] === '1') ctx.fillRect(ox + rx * px, y + ry * px, px, px);
      }
    }
  }
}

export function drawTextCentered(ctx, s, cx, y, px = 1, color = '#fff') {
  drawText(ctx, s, Math.round(cx - textWidth(s, px) / 2), y, px, color);
}
