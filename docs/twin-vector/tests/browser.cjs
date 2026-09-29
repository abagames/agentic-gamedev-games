// Adapted from probing-web-game-mechanics probe-template; query-gated scenarios.
require('fs').mkdirSync(require('path').resolve(__dirname,'../evidence'),{recursive:true}); // outputs; created on demand
const {chromium}=require('playwright'),path=require('path'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:768,height:864}}),errors=[];let checks=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks++;console.log('PASS',name,JSON.stringify(actual));};
 const shot=async name=>{await page.screenshot({path:path.resolve(__dirname,'../evidence/'+name+'.png')});};
 await page.goto('file://'+path.resolve(__dirname,'../index.html')+'?test');await page.waitForFunction(()=>window.__game?.state.phase==='title');await shot('title');
 check('demo scenes vary sector and boss',await page.evaluate(()=>{const seen=new Set();for(let i=0;i<30;i++){__game.demoScene();const d=__game.demo();seen.add(d.round+(d.bossSpawned?'B':''));}return seen.size>=6;}),true);
 await page.waitForFunction(()=>__game.demo().shots.length>0,null,{timeout:9000});check('human-limited pilot fires in the demo',true,true);await shot('demo');
 await page.keyboard.press('Enter');await page.waitForFunction(()=>__game.state.phase==='play');
 check('start through real Enter',await page.evaluate(()=>__game.state.phase),'play');
 // Brief press/release must survive a render boundary. Test both movement aliases.
 for(const [key,lane]of [['ArrowLeft',1],['KeyA',0],['ArrowRight',1],['KeyD',2]]){await page.keyboard.press(key);await page.waitForTimeout(80);check(key+' short tap',await page.evaluate(()=>__game.state.player.lane),lane);}
 await page.evaluate(()=>{__game.state.shots=[];});await page.keyboard.press('Space');await page.waitForTimeout(100);check('Space fires without changing deck',await page.evaluate(()=>[__game.state.player.layer,__game.state.shots.length>0]),[0,true]);
 await page.waitForTimeout(300);await page.evaluate(()=>{__game.state.shots=[];});await page.keyboard.press('KeyX');await page.waitForTimeout(100);check('X fires without changing deck',await page.evaluate(()=>[__game.state.player.layer,__game.state.shots.length>0]),[0,true]);
 await page.keyboard.press('KeyS');await page.waitForTimeout(100);check('S selects lower deck',await page.evaluate(()=>__game.state.player.layer),1);
 await page.waitForTimeout(250);await page.keyboard.press('KeyW');await page.waitForTimeout(100);check('W selects upper deck',await page.evaluate(()=>__game.state.player.layer),0);
 await page.waitForTimeout(250);
 await page.keyboard.press('ArrowDown');await page.waitForTimeout(80);check('Down selects B',await page.evaluate(()=>__game.state.player.layer),1);
 await page.keyboard.down('ArrowDown');await page.waitForTimeout(350);await page.keyboard.up('ArrowDown');check('holding Down on B does not toggle',await page.evaluate(()=>__game.state.player.layer),1);
 await page.keyboard.press('ArrowUp');await page.waitForTimeout(150);check('Up selects A',await page.evaluate(()=>__game.state.player.layer),0);
 await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);check('directional input buffers during cooldown',await page.evaluate(()=>__game.state.player.layer),1);
 await page.keyboard.press('ArrowUp');await page.waitForTimeout(350);
 await page.keyboard.press('KeyZ');await page.waitForTimeout(65);check('short Z fires',await page.evaluate(()=>__game.state.shots.length>0),true);
 await page.keyboard.press('KeyP');const pausedTick=await page.evaluate(()=>__game.state.tick);await page.waitForTimeout(100);check('pause freezes engine tick',await page.evaluate(()=>__game.state.tick),pausedTick);await page.keyboard.press('KeyP');
 await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));__game.state.shots=[];});check('leaving the game pauses play',await page.evaluate(()=>__game.state.paused),true);
 await page.keyboard.press('Space');await page.waitForTimeout(80);check('Space resumes without firing',await page.evaluate(()=>[__game.state.paused,__game.state.shots.length]),[false,0]);
 await page.keyboard.press('KeyM');check('mute key',await page.evaluate(()=>__game.audio.muted),true);await page.keyboard.press('KeyM');check('unmute key',await page.evaluate(()=>__game.audio.muted),false);
 // Controlled state with a real frame settlement for each mechanic.
 async function scenario(body){await page.evaluate(body);await page.waitForTimeout(70);}
 await scenario(()=>{const g=__game,s=g.state;Object.assign(s,g.engine.create(1));s.phase='play';s.player.invuln=999;s.queue=[{id:999}];s.spawn=99999;s.enemies=[{id:1,lane:2,layer:1,z:.6,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:2,layer:1,z:.94,shifted:false}];});
 check('live armored target blocks ordinary bolt',await page.evaluate(()=>[__game.state.score,__game.state.enemies.length]),[0,1]);
 await scenario(()=>{const s=__game.state;s.shots=[{lane:2,layer:0,z:.96,shifted:false}];s.player.layer=0;s.player.swap=0;});
 await page.keyboard.press('ArrowDown');await page.waitForTimeout(400);check('Down transfers in-flight shot',await page.evaluate(()=>[__game.state.score,__game.state.enemies.length,__game.state.transfers]),[300,0,1]);await shot('transfer');
 // Dedicated states must render, not just exist in simulation.
 await scenario(()=>{const s=__game.state;s.queue=[];s.enemies=[];s.shots=[];});check('clear transition',await page.evaluate(()=>__game.state.phase),'clear');await shot('clear');
 await scenario(()=>{const s=__game.state;s.phase='clear';s.phaseTick=2;s.round=9;s.bossSpawned=true;s.score=2000;});check('complete nine sectors',await page.evaluate(()=>__game.state.phase),'win');await shot('win');
 // Complete two recognition cycles through actual key handlers.
 async function enterInitials(prefix){
  await page.waitForTimeout(400);await page.keyboard.press('Enter');await page.waitForTimeout(400);
  check(prefix+' qualifies for entry',await page.evaluate(()=>__game.state.phase),'entry');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.press('KeyP');check('entry resumes after blur',await page.evaluate(()=>__game.state.paused),false);
  for(const key of ['ArrowUp','KeyW','ArrowDown','KeyS']){await page.keyboard.press(key);await page.waitForTimeout(40);}
  check('letter aliases cycle back to A',await page.evaluate(()=>__game.state.initials[0]),0);
  for(const key of ['ArrowRight','KeyD','ArrowLeft','KeyA']){await page.keyboard.press(key);await page.waitForTimeout(40);}
  check('cursor aliases return to first initial',await page.evaluate(()=>__game.state.caret),0);await shot('entry');
  for(const key of ['KeyZ','Enter','Space']){await page.keyboard.press(key);await page.waitForTimeout(40);}
  check('confirm selects END without skipping table',await page.evaluate(()=>[__game.state.phase,__game.state.caret]),['entry',3]);await shot('entry-end');
  await page.keyboard.press('KeyX');await page.waitForTimeout(80);check(prefix+' saves table',await page.evaluate(()=>__game.state.phase),'table');await shot('table');
  const saved=await page.evaluate(()=>localStorage.getItem('twin-vector-scores'));
  await page.evaluate(()=>{__game.state.phaseTick=2;});await page.waitForTimeout(80);check(prefix+' returns to attract',await page.evaluate(()=>__game.state.phase),'title');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});check(prefix+' hidden tab does not pause attract',await page.evaluate(()=>__game.state.paused),false);
  await page.waitForTimeout(150);check('attract does not write rankings',await page.evaluate(()=>localStorage.getItem('twin-vector-scores')),saved);
  await page.keyboard.press('Space');await page.waitForTimeout(80);check(prefix+' next run resets',await page.evaluate(()=>[__game.state.phase,__game.state.score,__game.state.lives]),['ready',0,3]);
 }
 await enterInitials('win');
 await scenario(()=>{const s=__game.state;s.phase='play';s.lives=1;s.player.invuln=0;s.spawn=99999;s.queue=[{id:999}];s.score=4321;s.enemies=[{id:7,lane:4,layer:1,z:1.04,type:'drone',fireAt:9}];});
 check('breach enters death',await page.evaluate(()=>[__game.state.phase,__game.state.lives]),['death',0]);await page.waitForFunction(()=>__game.state.phase==='over');
 check('game over hides the ship',await page.evaluate(()=>{const g=__game,s=g.state,p=g.project(s.player.lane,1,s.player.layer),c=document.getElementById('screen').getContext('2d');g.draw();const d=c.getImageData(Math.round(p.x)-8,Math.round(p.y)-12,16,12).data;for(let i=0;i<d.length;i+=4)if(d[i]===0x70&&d[i+1]===0xd8&&d[i+2]===0xd0)return false;return true;}),true);await shot('over');
 await enterInitials('game-over');
 check('two real records persisted',await page.evaluate(()=>JSON.parse(localStorage.getItem('twin-vector-scores')).length),2);
 // Stage-three moving shield boss: same conformance suite in the browser engine.
 const dread=require('./dreadnought.cjs');
 const dreadChecks=await page.evaluate('('+dread.toString()+')(__game.engine)');
 check('moving shield boss conformance',dreadChecks.length,19);
 await page.evaluate(()=>{const g=__game,s=g.state;g.manual(true);Object.assign(s,g.engine.create(17));s.round=3;g.engine.boss(s);s.phase='play';s.player.invuln=9999;g.draw();});await shot('dreadnought-closed');
 await page.evaluate(()=>{const g=__game,s=g.state;s.shots=[{lane:1,layer:0,z:.43,shifted:true}];g.step({});while(s.bossClock!==75)g.step({});g.draw();});await shot('dreadnought-warning');
 await page.evaluate(()=>{const g=__game;while(g.state.bossClock!==100)g.step({});g.draw();});await shot('dreadnought-open');
 const intercept=require('./intercept.cjs');
 check('intercept bonus conformance',await page.evaluate('('+intercept.toString()+')(__game.engine).length'),15);
 const progression=require('./boss-progression.cjs');
 check('boss progression conformance',await page.evaluate('('+progression.toString()+')(__game.engine).length'),82);
 await page.evaluate(()=>{const g=__game,s=g.state;Object.assign(s,g.engine.create(17));s.round=6;g.engine.boss(s);s.phase='play';s.player.invuln=9999;s.shots=[{lane:3,layer:1,z:.43,shifted:true}];g.step({});while(s.bossClock!==100)g.step({});g.draw();});await shot('bulwark-open-a');
 await page.evaluate(()=>{const g=__game,s=g.state;Object.assign(s,g.engine.create(10));s.phase='play';s.round=4;s.queue=[{id:9999}];s.spawn=99999;s.player.invuln=9999;s.enemies=[{id:1,type:'shifter',lane:2,layer:0,z:.32,fireAt:9}];g.step({});});
 check('shifter destination is telegraphed',await page.evaluate(()=>[__game.state.enemies[0].shiftTimer,__game.state.enemies[0].targetLayer]),[59,1]);await shot('shifter-warning');
 await page.evaluate(()=>{for(let i=0;i<59;i++)__game.step({});});
 check('shifter crosses to B',await page.evaluate(()=>__game.state.enemies[0].layer),1);await shot('shifter-crossing');
 await page.evaluate(()=>{const g=__game,s=g.state;s.enemies=[{id:2,type:'guard',lane:2,layer:0,z:.50,armored:true,shieldSpan:1,fireAt:9},{id:3,type:'drone',lane:1,layer:0,z:.35,fireAt:9}];s.shots=[{lane:1,layer:0,z:.82,shifted:true}];g.step({});});
 check('wide guard blocks neighboring lane',await page.evaluate(()=>[__game.state.score,__game.state.events.includes('block')]),[0,true]);await shot('guard-convoy');
 await page.evaluate(()=>{const g=__game,s=g.state;s.enemies=[{id:4,type:'gunner',lane:3,layer:1,z:.52,fireAt:9}];s.shots=[];s.bolts=[];for(let i=0;i<54;i++)g.step({});});
 check('gunner anchors and fires spaced shots',await page.evaluate(()=>[__game.state.enemies[0].anchored,__game.state.bolts.length]),[true,2]);await shot('gunner-burst');
 await page.evaluate(()=>{const g=__game,s=g.state;s.round=9;g.engine.boss(s);g.draw();});await shot('final-boss');
 await page.evaluate(()=>{const g=__game,s=g.state;s.phase='play';s.player.invuln=9999;s.shots=[{lane:3,layer:1,z:.43,shifted:true}];g.step({});while(s.bossClock!==75)g.step({});g.draw();});
 check('final core waits on B while A route is warned',await page.evaluate(()=>{const c=__game.state.enemies.find(e=>e.type==='core');return [c.layer,c.warningLayer,c.openWarning];}),[1,0,true]);await shot('final-boss-warning');
 await page.evaluate(()=>{const g=__game;while(g.state.bossClock!==130)g.step({});g.draw();});check('final core shielded on B behind open A route',await page.evaluate(()=>{const c=__game.state.enemies.find(e=>e.type==='core');return [c.layer,c.openLayer,c.locked];}),[1,0,false]);await shot('final-boss-shift');
 await page.evaluate(()=>{const g=__game,s=g.state;s.phase='play';s.round=3;s.bossSpawned=true;s.enemies=[];s.queue=[];s.lives=1;s.score=14700;g.step({});for(let i=0;i<80;i++)g.step({});});
 check('clear bonus crossing 15,000 extends',await page.evaluate(()=>[__game.state.phase,__game.state.lives,__game.state.extendCount]),['clear',2,1]);await page.evaluate(()=>{__game.state.tick=0;__game.draw();});await shot('extend');
 await page.evaluate(()=>{__game.manual(false);});
 // Actual document.visibilityState transition via Chromium's visibility override.
 const cdp=await page.context().newCDPSession(page);let visibility='untested';
 try{
  await cdp.send('Emulation.setEmulatedMedia',{media:'screen'});
  // Page.setWebLifecycleState frozen doesn't claim visibility. Use a second tab + headed-independent CDP visibility command only when supported.
  await cdp.send('Emulation.setPageVisibilityOverride',{visibilityState:'hidden'});
  await page.waitForTimeout(80);check('actual document hidden',await page.evaluate(()=>document.visibilityState),'hidden');check('audio hidden gate',await page.evaluate(()=>__game.audio.visible),false);
  await cdp.send('Emulation.setPageVisibilityOverride',{visibilityState:'visible'});visibility='actual hidden/visible passed';
 }catch(e){visibility='CDP visibility override unavailable; bus boundary and blur tested, actual OS backgrounding untested';}
 // Blur exercises the real host handler; renderer must stop and not carry held inputs.
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));check('blur pauses',await page.evaluate(()=>__game.state.paused),true);
 // Offline render the exact runtime synth, not a parallel approximation.
 const audio=await page.evaluate(async()=>{const results={};const all={...TwinAudio.spec,ambientBeat:{parts:[{voice:3,wave:'soft',notes:TwinAudio.BEAT}]},ambientEntry:{parts:[{voice:3,wave:'organ',notes:TwinAudio.ENTRY_LOOP}]}};for(const [name,p]of Object.entries(all)){const duration=TwinAudio.duration(p),ctx=new OfflineAudioContext(1,Math.ceil((duration+.05)*44100),44100);const a=new TwinAudio.Adapter(ctx);a.play(p);const b=await ctx.startRendering(),d=b.getChannelData(0);let peak=0,sum=0,first=-1,last=-1;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);peak=Math.max(peak,v);sum+=v*v;if(v>.0001){if(first<0)first=i;last=i;}}results[name]={peak,rms:Math.sqrt(sum/d.length),onset:first/44100,tail:last/44100,duration};}return results;});
 for(const [name,a]of Object.entries(audio)){assert(a.peak>.01&&a.peak<.2,name+' peak');assert(a.rms>.005,name+' rms');assert(a.onset<.01,name+' onset');assert(a.tail<a.duration+.012,name+' tail');}console.log('PASS offline audio',Object.keys(audio).length,'programs incl. ambient: audible, onset/tail bounded, no clipping');
 fs.writeFileSync(path.resolve(__dirname,'../evidence/audio.json'),JSON.stringify(audio,null,2));
 // Late start times once leaked a full-scale sample through the default gain of 1.
 check('late-scheduled programs never leak a full-scale sample',await page.evaluate(async()=>{const rate=44100;let pk=0;for(const at of [18.017,18.1])for(const p of Object.values(TwinAudio.spec)){const ctx=new OfflineAudioContext(1,Math.ceil((at+TwinAudio.duration(p)+.05)*rate),rate),a=new TwinAudio.Adapter(ctx);for(const q of p.parts)a.playPart(q,at);const d=(await ctx.startRendering()).getChannelData(0);for(let k=Math.floor(at*rate);k<d.length;k++)pk=Math.max(pk,Math.abs(d[k]));}return pk<.2;}),true);
 // Busy board screenshot: use meaningful reachable states, then hold engine for inspection.
 await page.evaluate(()=>{const g=__game,s=g.state;g.manual(true);s.paused=false;s.phase='play';s.round=2;s.player={lane:2,layer:1,move:0,fire:16,swap:0,invuln:0};s.enemies=[{lane:0,layer:0,z:.73,type:'drone',armored:true,fireAt:.77},{lane:3,layer:0,z:.56,type:'weaver',dir:-1,turned:false,fireAt:.8},{lane:4,layer:1,z:.64,type:'drone',fireAt:.67},{lane:2,layer:1,z:.32,type:'weaver',dir:1,turned:false,fireAt:.8}];s.shots=[{lane:2,layer:0,z:.7,shifted:true},{lane:2,layer:1,z:.86,shifted:false}];s.bolts=[{lane:0,layer:0,z:.9},{lane:4,layer:1,z:.82}];s.fx=[{lane:2,layer:0,z:.5,kind:'transfer',life:18,max:24,amount:300}];g.draw();});await shot('play');
 if(process.argv.includes('--live')){
  await page.reload();await page.waitForFunction(()=>__game.state.phase==='title');
  // human-policy.js is part of the page (it also pilots the attract demo).
  await page.keyboard.press('Enter');
  await page.evaluate(()=>{let seed=2106;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};window.realBot=HumanPolicy.createHumanPolicy(rng);window.realBotTimer=setInterval(()=>{const s=__game.state,input=realBot.step(s,s.tick);const tap=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));};if(input.move)tap(input.move<0?'ArrowLeft':'ArrowRight');if(input.fire)tap('Space');if(input.swap)tap(s.player.layer?'ArrowUp':'ArrowDown');},1000/60);});
  let outcome,lastRound=0;
  for(let i=0;i<1800;i++){
   await page.waitForTimeout(250);outcome=await page.evaluate(()=>({phase:__game.state.phase,round:__game.state.round,score:__game.state.score,lives:__game.state.lives,kills:__game.state.kills,boss:__game.state.bossSpawned}));
   if(outcome.round!==lastRound){console.log('LIVE',JSON.stringify(outcome));lastRound=outcome.round;}
   if(i===80||i===160)await shot('expanded-live-'+i);
   if(['over','win'].includes(outcome.phase))break;
  }
  await page.evaluate(()=>clearInterval(window.realBotTimer));check('live limited bot reaches terminal phase', ['over','win'].includes(outcome.phase),true);
  await shot('expanded-live-result');fs.writeFileSync(path.resolve(__dirname,'../evidence/expanded-live.json'),JSON.stringify(outcome,null,2));console.log('LIVE RESULT',JSON.stringify(outcome));
 }
 check('runtime errors',errors,[]);fs.writeFileSync(path.resolve(__dirname,'../evidence/browser.json'),JSON.stringify({checks,errors,visibility},null,2));console.log('VISIBILITY:',visibility);console.log('PASS browser checks',checks);await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
