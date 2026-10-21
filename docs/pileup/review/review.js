// Review kit: records every run for review when the page is opened with ?review=1, and downloads
// all of them as one zip when the person presses the download key between runs.
// Copied into a game as review/review.js by tools/review-kit.mjs; documented in tools/README.md.
//
// The page loads this file only in review mode, before the game's own scripts:
//   <script>/[?&]review=1(&|$)/.test(location.search) && document.write('<script src="review/review.js"><\/script>')</script>
// and the game calls it only through window.REVIEW, which does not exist otherwise:
//   REVIEW.attach({ slug, build, level, key, used, hash })
//   REVIEW.runStart({ seed })   when a run begins
//   REVIEW.step(input)          right after each rules step, with the input that step was given,
//                               before anything that can end the run
//   REVIEW.event(e)             non-deterministic level only: a rules event worth keeping
//   REVIEW.runEnd(summaryLine)  when a run ends
//
// Under Node the file exports only its pure parts (the zip writer), for the agent-side tools.
(function (root) {
  'use strict';
  const KIT = 3;
  const LEVELS = ['replay', 'no-adapter', 'non-deterministic'];

  // ---------- stored (uncompressed) zip ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const utf8 = (s) => new TextEncoder().encode(s);
  // entries: [{ name, data: Uint8Array | string }] -> Uint8Array. Fixed timestamps, so equal input gives equal bytes.
  function makeZip(entries) {
    const parts = [], central = [];
    let offset = 0;
    for (const e of entries) {
      const name = utf8(e.name), data = typeof e.data === 'string' ? utf8(e.data) : e.data, crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // version, flags: UTF-8 names
      local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); // stored; 1980-01-01 00:00
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      const head = new DataView(new ArrayBuffer(46));
      head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(8, 0x0800, true);
      head.setUint16(10, 0, true); head.setUint16(12, 0, true); head.setUint16(14, 0x21, true);
      head.setUint32(16, crc, true); head.setUint32(20, data.length, true); head.setUint32(24, data.length, true);
      head.setUint16(28, name.length, true); head.setUint32(42, offset, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      central.push(new Uint8Array(head.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { KIT, LEVELS, makeZip, crc32 }; return; }

  const HASH_EVERY = 60, SAVE_EVERY = 300; // a run in progress is saved every 5 s at 60 ticks/s, since pagehide cannot wait for storage
  let cfg = null, runs = [], run = null, storageOk = true, buildInfo = null, lastInput = null;

  // ---------- storage: every call is caught; the game never depends on it ----------
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res) => {
      try {
        const r = indexedDB.open('review-kit', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
        r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  async function tx(mode, fn) {
    try {
      const d = await db(); if (!d) throw new Error('no database');
      return await new Promise((res, rej) => {
        const t = d.transaction('kv', mode), req = fn(t.objectStore('kv'));
        t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    } catch (e) { storageOk = false; return undefined; }
  }
  // all runs of one game and build live under one key, so games and snapshots on one origin stay apart
  const runsKey = () => [cfg.slug, buildInfo.build, 'runs'].join('|');
  const save = () => tx('readwrite', (s) => s.put(JSON.parse(JSON.stringify(runs)), runsKey()));

  // ---------- build label: the snapshot the page is served from names the build ----------
  function detectBuild() {
    let path = location.pathname; try { path = decodeURIComponent(path); } catch (e) { /* keep it encoded */ }
    // tools/snapshot.mjs writes <slug>/<NN>-<label>/; the game's own slug anchors the match
    const esc = cfg.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp('/' + esc + '/(\\d{2,}-[a-z0-9-]+)/[^/]*$').exec(path);
    return m ? { build: m[1], buildConstant: cfg.build, buildSource: 'snapshot' } : { build: cfg.build, buildConstant: cfg.build, buildSource: 'game' };
  }

  function attach(c) {
    if (cfg) throw new Error('review kit: attach() called twice');
    if (!c || !c.slug || !c.build) throw new Error('review kit: attach() needs slug and build');
    if (!LEVELS.includes(c.level)) throw new Error(`review kit: level must be one of ${LEVELS.join(', ')}`);
    if (!c.key) throw new Error('review kit: attach() needs key, the download key (a KeyboardEvent.code value)');
    if ((c.used || []).includes(c.key)) throw new Error(`review kit: the download key ${c.key} is one of the game's own keys`);
    if (c.level !== 'non-deterministic' && typeof c.hash !== 'function') throw new Error('review kit: a deterministic game must pass hash(), the rules module\'s state hash');
    cfg = c; buildInfo = detectBuild();
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', (e) => { if (e.code === cfg.key) e.stopPropagation(); }, true);
    addEventListener('pagehide', () => { if (run && !run.ended) run.abandoned = true; save(); });
    api.ready = restore();
    return api;
  }

  async function restore() {
    const kept = await tx('readonly', (s) => s.get(runsKey()));
    if (Array.isArray(kept) && kept.length) {
      // a run still open in storage was cut off by a reload or by closing the page
      let changed = false;
      for (const r of kept) if (!r.ended && !r.abandoned) { r.abandoned = true; changed = true; }
      // runs begun before storage answered come after the stored ones
      runs = kept.concat(runs); runs.forEach((r, i) => { r.run = i + 1; });
      if (changed || runs.length > kept.length) save();
    }
  }

  // ---------- recording ----------
  function runStart(o) {
    if (!cfg) return;
    if (run && !run.ended) finish(null, true);
    run = {
      run: runs.length + 1, startedAt: new Date().toISOString(), seed: o && o.seed !== undefined ? o.seed : null,
      ticks: 0, inputs: [], hashes: [], end: null, events: [], summary: null, ended: false, abandoned: false,
    };
    runs.push(run); lastInput = null; save();
  }
  function step(input) {
    if (!run || run.ended) return;
    if (cfg.level !== 'non-deterministic') {
      const s = JSON.stringify(input === undefined ? null : input);
      if (s !== lastInput || run.inputs.length === 0) { run.inputs.push([run.ticks, JSON.parse(s)]); lastInput = s; }
    }
    run.ticks++;
    if (cfg.level !== 'non-deterministic' && run.ticks % HASH_EVERY === 0) run.hashes.push([run.ticks, String(cfg.hash())]);
    if (run.ticks % SAVE_EVERY === 0) save();
  }
  function event(e) { if (run && !run.ended) run.events.push([run.ticks, e]); }
  function finish(summary, abandoned) {
    run.ended = true; run.abandoned = !!abandoned; run.summary = summary || null;
    if (cfg.level !== 'non-deterministic') run.end = { tick: run.ticks, hash: String(cfg.hash()) };
    save().then(() => { if (!storageOk) ack('not saved: download before closing'); });
  }
  function runEnd(summary) { if (run && !run.ended) finish(summary, false); }

  // ---------- the download key, and a small acknowledgement in the corner ----------
  function onKey(e) {
    if (e.code !== cfg.key) return;
    e.stopPropagation(); e.preventDefault();
    if (!e.repeat) download();
  }
  let ackEl = null, ackT = 0;
  function ack(s) {
    if (!ackEl) { ackEl = document.createElement('div'); ackEl.style.cssText = 'position:fixed;right:4px;top:4px;z-index:2147483000;font:bold 12px/1 monospace;color:#000;background:#ffd84a;padding:3px 5px;border-radius:3px;pointer-events:none;transition:opacity .4s'; document.body.appendChild(ackEl); }
    ackEl.textContent = s; ackEl.style.opacity = 1; clearTimeout(ackT); ackT = setTimeout(() => { ackEl.style.opacity = 0; }, 1500);
  }

  // ---------- the zip: every run of this build kept in this browser ----------
  function buildZip() {
    const entries = [], out = { kit: KIT, slug: cfg.slug, ...buildInfo, level: cfg.level, downloaded: new Date().toISOString(), runs: [] };
    for (const r of runs) {
      const replay = `replays/run-${r.run}.json`;
      entries.push({ name: replay, data: JSON.stringify({
        kit: KIT, slug: cfg.slug, build: buildInfo.build, run: r.run, level: cfg.level, seed: r.seed,
        ticks: r.ticks, inputs: r.inputs, hashes: r.hashes, end: r.end, events: r.events, summary: r.summary, ended: r.ended, abandoned: r.abandoned,
      }) });
      out.runs.push({ run: r.run, startedAt: r.startedAt, seed: r.seed, ticks: r.ticks, summary: r.summary, ended: r.ended, abandoned: r.abandoned, replay });
    }
    entries.unshift({ name: 'session.json', data: JSON.stringify(out, null, 2) });
    return makeZip(entries);
  }
  function download() {
    if (run && !run.ended) { ack('download after the run'); return; }
    if (!runs.length) { ack('no runs yet'); return; }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const name = `${cfg.slug}-${buildInfo.build}-${stamp}.zip`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buildZip()], { type: 'application/zip' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    ack(`${runs.length} run${runs.length > 1 ? 's' : ''} downloaded`);
  }

  const api = {
    KIT, LEVELS, attach, runStart, step, event, runEnd, download, ready: Promise.resolve(),
    get runs() { return runs; }, get build() { return buildInfo; }, get storageOk() { return storageOk; },
  };
  root.REVIEW = api;
})(typeof window !== 'undefined' ? window : this);
