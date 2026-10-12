// Bullet trajectory trace: the output format of the bullet-pattern bench.
// Only the format is fixed here; what produces the bullets (BulletML or
// something else) is undecided and plugs in behind it.
//
// A trace is JSON Lines. First line is the header, then one record per bullet
// per frame:
//   {"type":"header","version":1,"fps":60,"seed":1,"source":"<pattern name>"}
//   {"f":0,"id":1,"x":0,"y":8,"dir":3.1416,"speed":0.1}
// Units: x right and y up in field units, origin at the field centre; dir in
// radians, 0 = up, increasing clockwise; speed in field units per frame.

export const TRACE_VERSION = 1;

const RECORD_KEYS = ["f", "id", "x", "y", "dir", "speed"];

export function createTraceWriter({ fps, seed, source }) {
  const lines = [JSON.stringify({ type: "header", version: TRACE_VERSION, fps, seed, source })];
  return {
    record(frame, bullet) {
      lines.push(
        JSON.stringify({
          f: frame,
          id: bullet.id,
          x: bullet.x,
          y: bullet.y,
          dir: bullet.dir,
          speed: bullet.speed,
        })
      );
    },
    toString() {
      return lines.join("\n") + "\n";
    },
  };
}

// Returns a list of problems; empty means the trace is well formed.
export function validateTrace(text) {
  const problems = [];
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return ["trace is empty"];
  let header;
  try {
    header = JSON.parse(lines[0]);
  } catch {
    return ["line 1: header is not JSON"];
  }
  if (header.type !== "header") problems.push("line 1: missing header");
  if (header.version !== TRACE_VERSION) problems.push("line 1: unsupported version");
  if (!Number.isFinite(header.fps)) problems.push("line 1: fps missing");
  let lastFrame = -1;
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    let rec;
    try {
      rec = JSON.parse(lines[i]);
    } catch {
      problems.push(`line ${i + 1}: not JSON`);
      continue;
    }
    for (const key of RECORD_KEYS) {
      if (!Number.isFinite(rec[key])) problems.push(`line ${i + 1}: '${key}' is not a finite number`);
    }
    if (!Number.isInteger(rec.f) || rec.f < 0) problems.push(`line ${i + 1}: 'f' is not a frame index`);
    if (rec.f < lastFrame) problems.push(`line ${i + 1}: frames go backwards`);
    if (rec.f !== lastFrame) seen.clear();
    if (seen.has(rec.id)) problems.push(`line ${i + 1}: bullet ${rec.id} appears twice in frame ${rec.f}`);
    seen.add(rec.id);
    lastFrame = rec.f;
  }
  return problems;
}
