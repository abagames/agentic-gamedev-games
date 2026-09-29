// Records a 4 s title + 16 s play clip: canvas frames at 30 fps and the game's own audio
// (every voice the bus actually started, re-rendered offline through the same Adapter).
// Usage (repo root): node docs/twin-vector/tools/record-video.cjs [outDir]
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'media'));
// PREROLL advances the title first so the attract pilot is already fighting when the clip starts.
const PREROLL=300,TITLE=240,PLAY=960,STEP=2;
async function take(browser,seed,capture){
 const page=await browser.newPage();
 // Fix the run seed (the game seeds from the clock) so a chosen take is reproducible.
 await page.addInitScript(seed=>{Date.now=()=>seed;const p=performance.now.bind(performance);performance.now=()=>0;window.__realNow=p;},seed);
 await page.goto('file://'+path.join(root,'index.html')+'?test');await page.waitForFunction(()=>window.__game?.state.phase==='title');
 const r=await page.evaluate(({PREROLL,TITLE,PLAY,STEP,capture})=>{
  const g=__game,s=g.state,rec=[];let tick=0;g.manual(true);for(let i=0;i<PREROLL;i++)g.tick();
  g.audio.adapter={unlock:async()=>true,stop(){},playPart(q){rec.push({tick,q:JSON.parse(JSON.stringify(q))});}};g.audio.active=true;
  const canvas=document.getElementById('screen'),frames=[];
  const tap=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));};
  let pseed=7;const pilot=HumanPolicy.createHumanPolicy(()=>{pseed=(Math.imul(pseed,1664525)+1013904223)>>>0;return pseed/4294967296;});
  let deaths=0,routed=0,kills=0;
  for(;tick<TITLE+PLAY;tick++){
   if(tick===TITLE)tap('Space');
   if(tick>TITLE&&s.phase==='play'){const i=pilot.step(s,s.tick);if(i.move)tap(i.move<0?'ArrowLeft':'ArrowRight');if(i.fire)tap('Space');if(i.swap)tap(s.player.layer?'ArrowUp':'ArrowDown');}
   g.tick();
   if(s.events.includes('death'))deaths++;if(s.events.some(e=>e==='transfer'||e==='interceptRouted'))routed++;if(s.events.some(e=>['hit','transfer','intercept','interceptRouted'].includes(e)))kills++;
   if(capture&&tick%STEP===0)frames.push(canvas.toDataURL('image/png'));
  }
  return {frames,rec,deaths,routed,kills,score:s.score,phase:s.phase};
 },{PREROLL,TITLE,PLAY,STEP,capture});
 let wav=null;
 if(capture){
  // Offline render: same Adapter, each recorded voice start placed at its tick time.
  wav=await page.evaluate(async({rec,seconds})=>{
   const rate=44100,ctx=new OfflineAudioContext(1,Math.ceil(seconds*rate),rate),a=new TwinAudio.Adapter(ctx);
   for(const r of rec)a.playPart(r.q,r.tick/60);
   const d=(await ctx.startRendering()).getChannelData(0),buf=new ArrayBuffer(44+d.length*2),v=new DataView(buf);
   const w=(o,str)=>{for(let i=0;i<str.length;i++)v.setUint8(o+i,str.charCodeAt(i));};
   w(0,'RIFF');v.setUint32(4,36+d.length*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
   v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,d.length*2,true);
   // Normalise to the loudest sample; the kit's peak is deliberately low for in-game mixing.
   let peak=0;for(const x of d)peak=Math.max(peak,Math.abs(x));const gain=peak>0?.9/peak:1;
   for(let i=0;i<d.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,d[i]*gain))*32767,true);
   let bin='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=32768)bin+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return {b64:btoa(bin),peak,gain};
  },{rec:r.rec,seconds:(TITLE+PLAY)/60});
 }
 await page.close();return {...r,wav};
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 // Choose a take: no lost ship in the clip and at least two routed kills.
 let chosen=null;
 for(const seed of [1983,2024,4242,777,31337,90210,12345,555,8080,1111,2222,3333]){
  const t=await take(browser,seed,false);console.log('seed',seed,'deaths',t.deaths,'routed',t.routed,'kills',t.kills,'score',t.score);
  if(t.deaths===0&&t.routed>=2){chosen=seed;break;}
 }
 if(chosen===null)throw Error('no clean take found');
 const t=await take(browser,chosen,true);await browser.close();
 if(process.env.DUMP_REC)fs.writeFileSync(process.env.DUMP_REC,JSON.stringify(t.rec));
 fs.mkdirSync(out,{recursive:true});const frameDir=fs.mkdtempSync(path.join(require('os').tmpdir(),'tv-frames-'));
 t.frames.forEach((f,i)=>fs.writeFileSync(path.join(frameDir,String(i).padStart(4,'0')+'.png'),Buffer.from(f.split(',')[1],'base64')));
 const wav=path.join(frameDir,'audio.wav');fs.writeFileSync(wav,Buffer.from(t.wav.b64,'base64'));
 const fps=String(60/STEP),mp4=path.join(out,'twin-vector.mp4'),gif=path.join(root,'screenshot.gif');
 execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',fps,'-i',path.join(frameDir,'%04d.png'),'-i',wav,'-vf','scale=768:864:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-c:a','aac','-b:a','160k','-shortest',mp4]);
 execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',fps,'-i',path.join(frameDir,'%04d.png'),'-vf','scale=512:576:flags=neighbor,split[a][b];[a]palettegen=max_colors=32:stats_mode=full[p];[b][p]paletteuse=dither=none','-loop','0',gif]);
 fs.rmSync(frameDir,{recursive:true,force:true});
 console.log(JSON.stringify({seed:chosen,frames:t.frames.length,voiceStarts:t.rec.length,deaths:t.deaths,routed:t.routed,kills:t.kills,score:t.score,audioPeakBeforeNormalise:+t.wav.peak.toFixed(3),mp4,gif}));
})().catch(e=>{console.error(e);process.exit(1);});
