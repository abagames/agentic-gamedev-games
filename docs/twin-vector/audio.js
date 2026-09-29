/* Era-inspired small-wavetable board: three 32-step 4-bit wavetable voices plus one LFSR noise
   voice, 4-bit volume, register updates at 60 Hz. Not an emulation of any specific board. */
(function(root){
'use strict';
// Voice roles: 0 player, 1 consequence/jingle, 2 noise, 3 cabinet (warning, tune bass, ambient).
const VOICE_GAIN=[.05,.06,.07,.045],NOISE_CLOCK=16000,TICK=1/60;
const table=fn=>Array.from({length:32},(_,i)=>Math.max(0,Math.min(15,Math.round(7.5+7.5*fn(i/32*2*Math.PI)))));
const WAVES={
 pulse:Array.from({length:32},(_,i)=>i<8?15:0),
 organ:table(x=>(Math.sin(x)*.7+Math.sin(2*x)*.3+Math.sin(3*x)*.15)/1.02),
 soft:table(x=>2/Math.PI*Math.asin(Math.sin(x))),
 buzz:table(x=>1-2*((x/(2*Math.PI))%1))
};
const m=n=>Math.round(440*2**((n-69)/12));
const N=(f,d,v=15,to)=>to?{f,d,v,to}:{f,d,v};
const R=d=>({f:0,d,v:0});
const decay=(f0,f1,dur,v0,steps)=>Array.from({length:steps},(_,i)=>N(Math.round(f0*(f1/f0)**(i/steps)),+(dur/steps).toFixed(3),Math.max(1,Math.round(v0*(1-i/steps)))));
const part=(voice,wave,notes)=>({voice,wave,notes});
const melody=(voice,wave,list,d,v)=>part(voice,wave,list.map(x=>Array.isArray(x)?(x[0]?N(m(x[0]),x[1],v):R(x[1])):N(m(x),d,v)));
const spec={
 fire:{priority:100,kind:'sfx',parts:[part(0,'pulse',[N(1400,.06,12,500)])]},
 swap:{priority:102,kind:'sfx',parts:[part(0,'organ',[N(220,.09,12,880)])]},
 hit:{priority:70,kind:'sfx',parts:[part(1,'organ',[N(400,.07,12,100)]),part(2,'noise',decay(12000,5000,.16,11,6))]},
 block:{priority:72,kind:'sfx',parts:[part(1,'pulse',[N(1600,.02,12),N(500,.03,10)])]},
 transfer:{priority:75,kind:'sfx',parts:[part(1,'pulse',[N(660,.07,13,1320),N(1320,.05,13),N(1760,.07,11)]),part(2,'noise',decay(16000,9000,.1,8,4))]},
 // Interception (kill within 0.5 s of a lane or deck move): the base cue plus a high answer.
 intercept:{priority:77,kind:'sfx',parts:[part(1,'organ',[N(400,.05,12,150),N(1760,.04,13),N(2093,.08,12)]),part(2,'noise',decay(12000,5000,.14,10,5))]},
 interceptRouted:{priority:78,kind:'sfx',parts:[part(1,'pulse',[N(660,.06,13,1320),N(1320,.04,13),N(1760,.04,13),N(2093,.04,13),N(2637,.1,12)]),part(2,'noise',decay(16000,9000,.12,9,4))]},
 enemyFire:{priority:40,kind:'sfx',parts:[part(1,'soft',[N(200,.05,10,120)])]},
 warn:{priority:90,kind:'sfx',parts:[part(3,'pulse',[N(500,.1,15,1000),N(1000,.1,15,500),N(500,.1,15,1000),N(1000,.1,12,500)])]},
 boom:{priority:108,kind:'sfx',parts:[part(1,'organ',[N(220,.55,15,40)]),part(2,'noise',decay(6000,900,.6,15,12))]},
 death:{priority:110,kind:'sfx',parts:[part(1,'organ',[N(440,.45,15,55)]),part(2,'noise',decay(5000,1200,.6,14,12))]},
 ready:{priority:60,kind:'jingle',parts:[melody(1,'organ',[[64,.1],[0,.05],[64,.1],[0,.05],[76,.15]],0,12)]},
 clear:{priority:60,kind:'jingle',parts:[melody(1,'organ',[[64,.09],[69,.09],[73,.09],[76,.24]],0,12)]},
 win:{priority:60,kind:'jingle',parts:[melody(1,'organ',[[64,.12],[69,.12],[76,.12],[81,.12],[76,.24]],0,12)]},
 over:{priority:60,kind:'jingle',parts:[melody(1,'organ',[[64,.14],[62,.14],[57,.28]],0,12)]},
 // Boss arrival: a falling low call over a rumble, the reverse of the rising start/clear phrases.
 // Lasts the 60-tick approach so the final low note lands as the hull arrives.
 bossIn:{priority:85,kind:'jingle',parts:[part(3,'buzz',[N(220,.2,14,196),N(185,.2,14,165),N(147,.2,14,131),N(110,.4,15,55)]),part(2,'noise',decay(2400,500,1,9,10))]},
 extend:{priority:105,kind:'jingle',parts:[melody(1,'pulse',[[76,.05],[81,.05],[88,.07],[81,.05],[88,.12]],0,13)]},
 // Credit tune while the first sector waits: A-minor call, answered an octave up.
 start:{priority:120,kind:'tune',parts:[
  melody(1,'organ',[[69,.15],[72,.15],[76,.15],[81,.3],[79,.15],[76,.15],[72,.15],[74,.3],[76,.15],[79,.15],[81,.15],[84,.45],[81,.15],[84,.6]],0,12),
  melody(3,'soft',[45,57,45,57,43,55,43,55,41,53,41,53,40,52,40,52,45,57,45,57],.15,13)]}
};
// Continuous cabinet cues on voice 3 at the lowest priority; any event on voice 3 interrupts them.
const AMBIENT_PRIORITY=10;
const ENTRY_LOOP=[72,76,79,84,83,79,76,74,72,76,81,84,83,81,79,76].map(n=>N(m(n),.18,8));
const BEAT=[N(55,.06,8),N(49,.06,8)];
const beatInterval=x=>Math.round(44-30*Math.max(0,Math.min(1,x)));
function duration(p){return Math.max(...p.parts.map(q=>q.notes.reduce((a,n)=>a+n.d,0)));}
class Adapter{
 constructor(ctx){this.ctx=ctx||null;this.nodes=[[],[],[],[]];this.waves=new Map();this.noiseBuffer=null;}
 async unlock(){try{if(!this.ctx)this.ctx=new (root.AudioContext||root.webkitAudioContext)();if(this.ctx.state==='suspended')await this.ctx.resume();return this.ctx.state==='running';}catch{return false;}}
 wave(name){if(!this.waves.has(name)){const t=WAVES[name],n=t.length,H=16,real=new Float32Array(H),imag=new Float32Array(H);
   for(let k=1;k<H;k++)for(let i=0;i<n;i++){const y=t[i]/7.5-1,a=2*Math.PI*k*i/n;real[k]+=y*Math.cos(a)*2/n;imag[k]+=y*Math.sin(a)*2/n;}
   this.waves.set(name,this.ctx.createPeriodicWave(real,imag));}return this.waves.get(name);}
 noise(){if(!this.noiseBuffer){const sr=this.ctx.sampleRate,b=this.ctx.createBuffer(1,sr,sr),d=b.getChannelData(0);let r=1,out=1,acc=0;
   // 15-bit LFSR clocked at NOISE_CLOCK; playbackRate sets the audible clock.
   for(let i=0;i<sr;i++){acc+=NOISE_CLOCK/sr;while(acc>=1){acc--;const bit=(r^(r>>1))&1;r=(r>>1)|(bit<<14);out=r&1?1:-1;}d[i]=out;}this.noiseBuffer=b;}return this.noiseBuffer;}
 // `at` (optional) schedules against an offline timeline, e.g. when rendering a recorded session.
 stopVoice(v,at){for(const n of this.nodes[v]){try{at===undefined?n.stop():n.stop(at);}catch{}}this.nodes[v]=[];}
 stop(){for(let v=0;v<4;v++)this.stopVoice(v);}
 play(p){for(const q of p.parts)this.playPart(q);}
 playPart(q,at){if(!this.ctx)return;const ctx=this.ctx,v=q.voice;this.stopVoice(v,at);let t=(at??ctx.currentTime)+.002;
  for(const n of q.notes){if(n.f&&n.v){const g=ctx.createGain(),level=VOICE_GAIN[v]*n.v/15;let src,param,base;
    if(q.wave==='noise'){src=ctx.createBufferSource();src.buffer=this.noise();src.loop=true;param=src.playbackRate;base=NOISE_CLOCK;}
    else{src=ctx.createOscillator();src.setPeriodicWave(this.wave(q.wave));param=src.frequency;base=1;}
    // Pitch registers update once per 60 Hz tick, so sweeps are audible stairs.
    const steps=Math.max(1,Math.round(n.d/TICK));for(let k=0;k<steps;k++){const f=n.to?n.f*(n.to/n.f)**(k/steps):n.f;param.setValueAtTime(f/base,t+Math.min(k*TICK,n.d-.004));}
    // Silent until the envelope starts: the default gain of 1 would leak a full-scale sample when
    // late start times round the source ahead of the first automation event.
    g.gain.value=0;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(level,t+.001);g.gain.setValueAtTime(level,t+n.d-.003);g.gain.linearRampToValueAtTime(0,t+n.d);
    src.connect(g);g.connect(ctx.destination);src.start(t);src.stop(t+n.d);this.nodes[v].push(src);src.onended=()=>{src.disconnect();g.disconnect();};}
   t+=n.d;}}
}
class Bus{
 constructor(adapter=new Adapter()){this.adapter=adapter;this.muted=false;this.visible=true;this.active=false;this.log=[];this.busy=[0,0,0,0];this.priorities=[0,0,0,0];this.frame=0;this.pending=[];this.mode=null;this.intensity=0;this.seq={step:0,wait:0};this.ambientPlays=0;}
 async unlock(){this.active=await this.adapter.unlock();}
 stop(){this.adapter.stop();this.busy=[0,0,0,0];this.priorities=[0,0,0,0];this.pending=[];this.seq={step:0,wait:0};}
 mute(v){this.muted=v;if(v)this.stop();}
 visibility(v){if(v===this.visible)return;this.visible=v;if(!v)this.stop();}
 // One continuous axis from game state: 'beat' with approach intensity, 'entry' loop, or null.
 ambient(mode,intensity=0){if(mode!==this.mode)this.seq={step:0,wait:0};this.mode=mode;this.intensity=intensity;}
 gated(demo){return this.muted||!this.visible||!this.active||demo;}
 tryPlay(p,used){
  // A part plays unless its voice already started this tick or holds a higher-priority program.
  let played=false,reason='play';
  for(const q of p.parts){const v=q.voice;
   if(used.has(v)){reason='same-tick-drop';continue;}
   if(this.busy[v]>0&&this.priorities[v]>p.priority){if(reason==='play')reason='priority-drop';continue;}
   used.add(v);this.busy[v]=Math.ceil(q.notes.reduce((a,n)=>a+n.d,0)*60);this.priorities[v]=p.priority;this.adapter.playPart(q);played=true;}
  return played?'play':reason;}
 emitBatch(events,{demo=false}={}){
  this.frame++;this.busy=this.busy.map(n=>Math.max(0,n-1));const used=new Set();
  if(this.gated(demo)){for(const name of new Set(events)){if(!spec[name])throw new Error('Unknown audio event '+name);this.log.push({frame:this.frame,name,result:'gated'});}this.pending=[];this.trim();return;}
  // Jingles that lost their voice wait up to one second instead of vanishing (clear after a final kill).
  const waiting=this.pending;this.pending=[];
  for(const w of waiting){const r=this.tryPlay(spec[w.name],used);if(r!=='play'&&this.frame-w.frame<60)this.pending.push(w);else this.log.push({frame:this.frame,name:w.name,result:r==='play'?'deferred-play':'deferred-drop'});}
  for(const name of [...new Set(events)].sort((a,b)=>(spec[b]?.priority??0)-(spec[a]?.priority??0))){
   const p=spec[name];if(!p)throw new Error('Unknown audio event '+name);
   const r=this.tryPlay(p,used);
   if(r!=='play'&&p.kind==='jingle'){this.pending.push({name,frame:this.frame});this.log.push({frame:this.frame,name,result:'deferred'});}
   else this.log.push({frame:this.frame,name,result:r});
  }
  this.stepAmbient(used);this.trim();
 }
 stepAmbient(used){
  if(!this.mode)return;if(--this.seq.wait>0)return;
  const notes=this.mode==='entry'?ENTRY_LOOP:BEAT,note=notes[this.seq.step%notes.length];
  this.seq.wait=this.mode==='entry'?Math.round(note.d*60):beatInterval(this.intensity);this.seq.step++;
  if(used.has(3)||(this.busy[3]>0&&this.priorities[3]>AMBIENT_PRIORITY))return;
  this.busy[3]=Math.ceil(note.d*60);this.priorities[3]=AMBIENT_PRIORITY;this.adapter.playPart({voice:3,wave:this.mode==='entry'?'organ':'soft',notes:[note]});this.ambientPlays++;
 }
 trim(){if(this.log.length>256)this.log.splice(0,this.log.length-256);}
}
root.TwinAudio={spec,WAVES,ENTRY_LOOP,BEAT,beatInterval,duration,VOICE_GAIN,NOISE_CLOCK,Adapter,Bus};if(typeof module!=='undefined')module.exports=root.TwinAudio;
})(typeof globalThis!=='undefined'?globalThis:this);
