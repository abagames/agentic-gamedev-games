// Stroke font on a 4x6 grid, drawn as lines to match the vector scope.
const G = {
  0: "00 40 46 06 00|06 40",
  1: "10 20 26|06 46",
  2: "00 40 43 03 06 46",
  3: "00 40 46 06|03 43",
  4: "00 03 43|40 46",
  5: "40 00 03 43 46 06",
  6: "40 00 06 46 43 03",
  7: "00 40 16",
  8: "00 40 46 06 00|03 43",
  9: "43 03 00 40 46 06",
  A: "06 01 10 30 41 46|03 43",
  B: "06 00 30 41 42 33 03|33 44 45 36 06",
  C: "40 00 06 46",
  D: "00 30 41 45 36 06 00",
  E: "40 00 06 46|03 33",
  F: "40 00 06|03 33",
  G: "40 00 06 46 43 23",
  H: "00 06|40 46|03 43",
  I: "00 40|20 26|06 46",
  J: "40 46 06 04",
  K: "00 06|40 03 46",
  L: "00 06 46",
  M: "06 00 23 40 46",
  N: "06 00 46 40",
  O: "00 40 46 06 00",
  P: "06 00 40 43 03",
  Q: "00 40 44 26 06 00|24 46",
  R: "06 00 40 43 03 46",
  S: "41 40 00 03 43 46 06 05",
  T: "00 40|20 26",
  U: "00 06 46 40",
  V: "00 26 40",
  W: "00 06 23 46 40",
  X: "00 46|40 06",
  Y: "00 23 40|23 26",
  Z: "00 40 06 46",
  "-": "13 33",
  "+": "13 33|22 24",
  ".": "25 26",
  "!": "20 23|25 26",
  ":": "21 22|24 25",
  x: "12 34|32 14",
};

const parsed = {};
for (const [k, v] of Object.entries(G)) {
  parsed[k] = v.split("|").map((line) => line.split(" ").map((p) => [Number(p[0]), Number(p[1])]));
}

export function textWidth(str, size) {
  return str.length * size * 1.5 - size * 0.5;
}

// size = glyph width in px; height is 1.5x.
export function drawText(ctx, str, x, y, size, align = "left") {
  const s = size / 4;
  let ox = x;
  if (align === "center") ox -= textWidth(str, size) / 2;
  else if (align === "right") ox -= textWidth(str, size);
  ctx.beginPath();
  for (const ch of str) {
    const glyph = parsed[ch];
    if (glyph) {
      for (const line of glyph) {
        ctx.moveTo(ox + line[0][0] * s, y + line[0][1] * s);
        if (line.length === 1 || (line.length === 2 && line[0][0] === line[1][0] && line[0][1] === line[1][1])) {
          ctx.lineTo(ox + line[0][0] * s + 0.01, y + line[0][1] * s + s);
        }
        for (let i = 1; i < line.length; i++) ctx.lineTo(ox + line[i][0] * s, y + line[i][1] * s);
      }
    }
    ox += size * 1.5;
  }
  ctx.stroke();
}
