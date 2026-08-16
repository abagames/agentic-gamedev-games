// Deterministic repro/repair gate for the diagonal overpass. This intentionally observes
// renderer geometry, not screenshots: shared world boundaries must project to the same
// screen point on adjacent frames, independent of speed or how much bridge remains ahead.
import * as S from '../src/spec.js';
import { Renderer } from '../src/render.js';

const noop = () => {};
const ctx = new Proxy({ globalAlpha: 1 }, {
  get: (t, k) => k in t ? t[k] : noop,
  set: (t, k, v) => (t[k] = v, true),
});
const anchor = S.DISTANT_OVERPASS.positionsM[0];
const makeCourse = (curve = 0, terrain = () => 0) => {
  const segments = Array.from({ length: 3000 }, (_, i) => ({
    index: i, z: i * S.SEG_LEN, curve, y: terrain(i * S.SEG_LEN),
  }));
  const course = {
    segments, totalLength: segments.length * S.SEG_LEN, checkpoints: [], traffic: [],
    segmentAt: (z) => segments[Math.max(0, Math.min(segments.length - 1, Math.floor(z / S.SEG_LEN)))],
    curveAt: () => curve,
  };
  course.elevationAt = (z) => course.segmentAt(z).y;
  return course;
};

function frame(course, dz, camX = 0, depth = S.CAMERA_DEPTH) {
  const quads = [];
  const r = new Renderer(ctx);
  r._quad = (a, b, c, d, colour) => quads.push({ a, b, c, d, colour });
  r.beginFrame();
  r.renderRoad(course, { z: anchor - dz, x: camX, height: S.CAMERA_HEIGHT, depth });
  r.endFrame();
  return quads.filter((q) => q.colour === S.PAL.overpassUnderside);
}

function intersectsRoadViewport(qs) {
  return qs.some((q) => [q.a, q.b, q.c, q.d].some((p) => p.sy >= S.ROAD_Y0 && p.sy < S.ROAD_Y1));
}

// INV-DECK-CONTIGUOUS: fixed world tessellation means adjacent projected slices share
// an identical edge. The optional near-clipped first slice is the sole exception.
function contiguous(qs) {
  const body = qs.filter((q) => !q.canopy);
  for (let i = 1; i < body.length; i++) {
    const far = body[i - 1], near = body[i];
    if (Math.hypot(far.a.sx - near.b.sx, far.a.sy - near.b.sy) > 1e-7) return false;
    if (Math.hypot(far.d.sx - near.c.sx, far.d.sy - near.c.sy) > 1e-7) return false;
  }
  return true;
}

const scenarios = [
  ['straight', makeCourse()],
  ['right', makeCourse(1.05)],
  ['left', makeCourse(-1.05)],
  ['uphill', makeCourse(0.2, (z) => 6 * Math.sin((z - anchor) / 180))],
  ['downhill', makeCourse(-0.2, (z) => -6 * Math.sin((z - anchor) / 180))],
  ['crest', makeCourse(0.4, (z) => 7 * Math.cos((z - anchor) / 100))],
];

let failures = 0;
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}  ${detail}`);
  if (!pass) failures++;
};

for (const [name, course] of scenarios) {
  let finite = true, joined = true, visible = true, firstBad = null;
  for (let dz = 429; dz >= -141; dz -= 3) {
    const qs = frame(course, dz);
    visible &&= qs.length > 0;
    const thisJoined = contiguous(qs);
    if (!thisJoined && firstBad == null) firstBad = { dz, quads: qs.length };
    joined &&= thisJoined;
    finite &&= qs.every((q) => [q.a, q.b, q.c, q.d].every((p) => Number.isFinite(p.sx) && Number.isFinite(p.sy)));
  }
  check(`${name}: deck remains finite, joined and present`, finite && joined && visible,
    `finite=${finite} joined=${joined} visible=${visible} firstBad=${JSON.stringify(firstBad)}`);
}

// Time/order surface: low speed, high speed and a single tick crossing the near plane.
for (const step of [0.5, 8, 40, 120]) {
  const course = scenarios[0][1];
  let joined = true, present = true;
  for (let dz = 430 - step; dz >= -140; dz -= step) {
    const qs = frame(course, dz);
    joined &&= contiguous(qs); present &&= qs.length > 0;
  }
  check(`distance step ${step}m`, joined && present, `joined=${joined} present=${present}`);
}

// Inverse case: outside the authored structure's exit, no underside may remain.
check('inverse: bridge is absent after its intended far endpoint', frame(scenarios[0][1], -170).length === 0,
  `quads=${frame(scenarios[0][1], -170).length}`);

// INV-PASS-CONTINUOUS: around the actual crossing, the real projected soffit—not an
// unrelated screen-space cap—must intersect the road viewport on at least one side of
// the camera plane and then leave through an authored endpoint.
for (const [name, course] of scenarios) {
  const samples = [40, 20, 12, 0, -12, -20, -40].map((dz) => intersectsRoadViewport(frame(course, dz)));
  check(`${name}: real soffit remains visible around the crossing`, samples.some(Boolean),
    `visible=${samples.map(Number).join('')}`);
}

process.exit(failures ? 1 : 0);
