// ZIG SABER — audio adapter. Game code calls play / music; everything is rendered by the
// two-SN76489A model in psg.js (era-inspired two-PSG sound board), inside an AudioWorklet when available,
// otherwise in a ScriptProcessorNode running the same code.
(function (root) {
  'use strict';
  let ctx = null, node = null, local = null, muted = false, hidden = false, starting = false, pending = null;
  const last = {};
  function send(m) { if (local) local.command(m); else if (node) node.port.postMessage(m); }
  function sendIfChanged(key, m) { const s = JSON.stringify(m); if (last[key] === s) return; last[key] = s; send(m); }

  async function start() {
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      const src = 'const ZSS = ' + root.ZSSound.factorySource + ';\n' +
        'class ZSPsg extends AudioWorkletProcessor {\n' +
        '  constructor() { super(); this.s = new ZSS.Sound(sampleRate); this.port.onmessage = e => this.s.command(e.data); }\n' +
        '  process(i, o) { const ch = o[0]; this.s.render(ch[0]); for (let c = 1; c < ch.length; c++) ch[c].set(ch[0]); return true; }\n' +
        '}\nregisterProcessor("zs-psg", ZSPsg);';
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      node = new AudioWorkletNode(ctx, 'zs-psg', { outputChannelCount: [1] });
    } catch (e) {
      // fallback: the same chip model on the main thread
      local = new root.ZSSound.Sound(ctx.sampleRate);
      node = ctx.createScriptProcessor(1024, 0, 1);
      node.onaudioprocess = ev => local.render(ev.outputBuffer.getChannelData(0));
    }
    node.connect(ctx.destination);
    for (const k in last) send(JSON.parse(last[k]));
    send({ t: 'mute', muted });
    // the key press that unlocks audio is also the one that starts the game: play its jingle once the chips exist
    if (pending && performance.now() - pending.at < 500 && !muted && !hidden) send(pending.m);
    pending = null;
  }

  const A = {
    init() {
      if (ctx) { if (ctx.state === 'suspended' && !hidden) ctx.resume(); return; }
      if (starting) return; starting = true; start();
    },
    get muted() { return muted; },
    get state() { return ctx ? ctx.state : 'none'; },
    get backend() { return local ? 'script' : node ? 'worklet' : 'none'; },
    toggleMute() { muted = !muted; send({ t: 'mute', muted }); return muted; },
    play(name, arg) {
      if (muted || hidden) return;
      if (!node) { pending = { m: { t: 'se', name, arg }, at: performance.now() }; return; }
      send({ t: 'se', name, arg });
    },
    // continuous state, sent only when it changes
    music(on, zone, loop, hot) { sendIfChanged("music", { t: "music", on: !!on && !hidden, zone: zone | 0, loop: loop | 0, hot: !!hot }); },
    // host visibility: hidden pages suspend output; visible resumes only what the game still requests
    setHidden(h) { hidden = h; if (!ctx) return; if (h) ctx.suspend(); else ctx.resume(); },
    SE_NAMES: () => Object.keys(root.ZSSound.PROGRAMS),
  };
  root.ZSAudio = A;
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
})(this);
