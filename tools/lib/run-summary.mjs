// The one-line run summary a game prints when a run ends, so that a play report is a
// paste and not a recollection.
//
//   RUN v1 build=03-campaign progress=7 score=74200 time=212 fail=bomb:2,wreck:1
//
// progress: the game's own unit of how far the run got (wave, stage, flags).
// time: seconds. fail: failures by cause; omit the field when there were none.
// Build labels and cause names are short ASCII identifiers (letters, digits, hyphens).
//
// A game logs the line and writes it to the URL fragment, so it can be copied from the
// address bar. parseRunSummary accepts the plain line, the encoded fragment, or the whole URL.

export function formatRunSummary({ build = "dev", progress, score, timeS, failures = {} }) {
  const fail = Object.entries(failures)
    .filter(([, n]) => n > 0)
    .map(([cause, n]) => `${cause}:${n}`)
    .join(",");
  return `RUN v1 build=${build} progress=${progress} score=${score} time=${Math.round(timeS)}` + (fail ? ` fail=${fail}` : "");
}

export function parseRunSummary(input) {
  let line = String(input).trim();
  // A pasted URL or fragment arrives percent-encoded; decode it before looking for the line.
  if (/RUN(%20|\+)v1/i.test(line)) {
    try {
      line = decodeURIComponent(line.replace(/\+/g, " "));
    } catch {
      throw new Error("run summary is not validly percent-encoded");
    }
  }
  const m = /RUN v1\s+(.*)$/.exec(line);
  if (!m) throw new Error('not a run summary (expected a line starting with "RUN v1")');
  const fields = Object.fromEntries(
    m[1].split(/\s+/).map((kv) => {
      const i = kv.indexOf("=");
      if (i < 0) throw new Error(`bad field "${kv}"`);
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  for (const k of ["progress", "score", "time"]) {
    if (!Number.isFinite(+fields[k])) throw new Error(`run summary needs a numeric ${k}`);
  }
  const failures = {};
  if (fields.fail) {
    for (const part of fields.fail.split(",")) {
      const [cause, n] = part.split(":");
      failures[cause] = +n;
    }
  }
  return {
    build: fields.build || "dev",
    progress: +fields.progress,
    score: +fields.score,
    timeS: +fields.time,
    failures,
    totalFailures: Object.values(failures).reduce((a, b) => a + b, 0),
  };
}
