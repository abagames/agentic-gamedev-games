// Finds whether a game has the review kit wired in, and at which declared level.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const KIT_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "review", "review.js");
// The links that open a page in review mode: the file URL, and under WSL the form a Windows browser
// opens (file://wsl.localhost/<distro>/...). Paths under /mnt/<drive>/ map to the drive instead.
export function playLinks(dir, page = "index.html", env = process.env) {
  const file = path.join(path.resolve(dir), page);
  const links = [pathToFileURL(file).href + "?review=1"];
  if (env.WSL_DISTRO_NAME) {
    const drive = /^\/mnt\/([a-z])(\/.*)$/.exec(file);
    links.unshift(drive
      ? `file:///${drive[1].toUpperCase()}:${encodeURI(drive[2])}?review=1`
      : `file://wsl.localhost/${encodeURIComponent(env.WSL_DISTRO_NAME)}${pathToFileURL(file).pathname}?review=1`);
  }
  return links;
}

const sha1 = (f) => createHash("sha1").update(readFileSync(f)).digest("hex");

function sources(dir, depth = 0, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || ["node_modules", "review", "reports", "evidence", "tests", "media"].includes(name)) continue;
    const f = path.join(dir, name);
    const st = statSync(f);
    if (st.isDirectory() && depth < 2) sources(f, depth + 1, out);
    else if (st.isFile() && /\.(html|js|mjs|cjs)$/.test(name)) out.push(f);
  }
  return out;
}

export function kitStatus(gameDir) {
  const dir = path.resolve(gameDir);
  const copy = path.join(dir, "review", "review.js");
  const files = existsSync(dir) ? sources(dir) : [];
  const text = (f) => readFileSync(f, "utf8");
  const loader = files.some((f) => f.endsWith(".html") && /review\/review\.js/.test(text(f)) && /review=1/.test(text(f)));
  const attachFile = files.find((f) => /REVIEW\s*(&&\s*REVIEW\s*)?\.attach\s*\(/.test(text(f)));
  let level = null;
  if (attachFile) {
    const m = /level\s*:\s*['"](replay|no-adapter|non-deterministic)['"]/.exec(text(attachFile));
    level = m ? m[1] : null;
  }
  const present = existsSync(copy) && loader && !!attachFile;
  const problems = [];
  if (!existsSync(copy)) problems.push("review/review.js is missing (run tools/review-kit.mjs)");
  if (!loader) problems.push("no page loads review/review.js under ?review=1");
  if (!attachFile) problems.push("the game never calls REVIEW.attach");
  if (attachFile && !level) problems.push("REVIEW.attach names no level (replay, no-adapter or non-deterministic)");
  const current = existsSync(copy) ? sha1(copy) === sha1(KIT_SOURCE) : false;
  return { present, level, current, problems };
}

// Math functions whose last bit differs between JS engines (Node and Chromium differ in sin and cos
// today). + - * / and Math.sqrt are rounded alike everywhere. A rules step that calls any of these
// makes a run played in a browser desynchronise when replayed under Node.
export const ENGINE_MATH = ["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "hypot"];

// Counts those calls made inside adapter.step during a short run of each policy (calls made by the
// policies themselves are not counted: they never run in the person's browser).
export function engineMathInRules(adapter, { seeds = [1, 2], maxTicks = 3600 } = {}) {
  const counts = {};
  const orig = Object.fromEntries(ENGINE_MATH.map((f) => [f, Math[f]]));
  const wrap = () => { for (const f of ENGINE_MATH) Math[f] = (...a) => { counts[f] = (counts[f] || 0) + 1; return orig[f](...a); }; };
  const unwrap = () => { for (const f of ENGINE_MATH) Math[f] = orig[f]; };
  try {
    for (const def of Object.values(adapter.policies)) {
      for (const seed of seeds) {
        const st = adapter.create(seed);
        const policy = def.make(seed);
        for (let t = 0; t < maxTicks && !adapter.ended(st); t++) {
          const input = policy(st) || {};
          wrap();
          try { adapter.step(st, input); } finally { unwrap(); }
        }
      }
    }
  } finally { unwrap(); }
  return counts;
}
