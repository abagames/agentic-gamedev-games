// Game-feel probes: audio arbitration in real play, buffered fire, hit stop, easing and new feedback frames.
require('fs').mkdirSync(require('path').resolve(__dirname,'../evidence'),{recursive:true}); // outputs; created on demand
const {chromium}=require('playwright'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:768,height:864}}),errors=[];let checks=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);checks++;console.log('PASS',name,JSON.stringify(actual));};
 const shot=async name=>{await page.screenshot({path:path.resolve(__dirname,'../evidence/feel-'+name+'.png')});};
 await page.goto('file://'+path.resolve(__dirname,'../index.html')+'?test');await page.waitForFunction(()=>window.__game?.state.phase==='title');
 // Deterministic arena: manual ticks through the real input/tick path.
 const arena=async(extra)=>page.evaluate(extra=>{const g=__game,s=g.state;g.manual(true);Object.assign(s,g.engine.create(5));s.phase='play';s.round=2;s.player.invuln=9999;s.queue=[{id:999}];s.spawn=99999;g.audio.stop();g.audio.active=true;g.audio.log=[];g.view.freeze=0;g.view.shake=0;g.view.lane=2;new Function('s',extra)(s);g.draw();},extra);
 const key=async code=>page.evaluate(code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));},code);
 const ticks=async n=>page.evaluate(n=>{for(let i=0;i<n;i++)__game.tick();},n);

 // 1. A late snap into the gap must still sound the routed-kill cue after the swap cue.
 await arena("s.enemies=[{id:1,lane:2,layer:1,z:.6,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:2,layer:0,z:.64,shifted:false}];");
 await key('ArrowDown');await ticks(4);
 check('late gap snap plays transfer after swap',await page.evaluate(()=>__game.audio.log.filter(l=>['swap','transfer'].includes(l.name)).map(l=>l.name+':'+l.result)),['swap:play','transfer:play']);
 // 2. Early snap onto the shield: block cue is audible too.
 await arena("s.enemies=[{id:1,lane:2,layer:1,z:.55,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:2,layer:0,z:.88,shifted:false}];");
 await key('ArrowDown');await ticks(3);
 check('early snap block cue audible',await page.evaluate(()=>__game.audio.log.filter(l=>l.name==='block').map(l=>l.result)),['play']);

 // 3. A Z tap during cooldown is buffered, not lost.
 await arena("s.player.fire=6;");
 await key('KeyZ');await ticks(8);
 check('tap during cooldown fires once',await page.evaluate(()=>__game.state.shots.length),1);
 await arena("s.player.fire=0;");await key('KeyZ');await ticks(20);
 check('single tap never repeats',await page.evaluate(()=>__game.state.shots.length),1);

 // 4. Hit stop: gap kill freezes 3 ticks, holds buffered input, then resumes.
 await arena("s.enemies=[{id:1,lane:2,layer:1,z:.6,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:2,layer:0,z:.64,shifted:false}];");
 await key('ArrowDown');let t0;for(let i=0;i<6;i++){await ticks(1);if(await page.evaluate(()=>__game.state.enemies.length===0)){t0=await page.evaluate(()=>__game.state.tick);break;}}
 await page.evaluate(()=>{const s=__game.state;s.player.fire=0;});await key('KeyZ');await ticks(3);
 check('gap kill freezes engine for 3 ticks',await page.evaluate(()=>[__game.state.tick,__game.state.shots.length]),[t0,0]);
 await ticks(1);check('buffered fire survives hit stop',await page.evaluate(()=>[__game.state.tick,__game.state.shots.length]),[t0+1,1]);
 await arena("s.enemies=[{id:1,lane:2,layer:0,z:.6,type:'drone',fireAt:9,turned:true}];s.shots=[{lane:2,layer:0,z:.64,shifted:false}];");
 await ticks(3);check('ordinary hit has no hit stop',await page.evaluate(()=>__game.view.freeze),0);

 // 5. Final core: large burst, long stop and shake.
 await page.evaluate(()=>{const g=__game,s=g.state;Object.assign(s,g.engine.create(17));s.round=9;g.engine.boss(s);s.phase='play';s.player.invuln=9999;s.enemies=s.enemies.filter(e=>e.type==='core');g.view.freeze=0;});
 await page.evaluate(()=>{const g=__game,s=g.state,c=s.enemies[0];let n=0;while(!(c.openLayer>=0&&!c.locked)&&n++<600)g.engine.step(s,{});s.shots=[{lane:c.lane,layer:c.layer,z:c.z+.03,shifted:true}];g.tick();});
 check('final core kill is core-sized with long stop',await page.evaluate(()=>{const f=__game.state.fx.find(f=>f.amount);return [f.core,f.amount>=5000,__game.view.freeze,__game.view.shake>0];}),[true,true,8,true]);
 await ticks(4);await shot('core-kill');

 // 6. Lateral easing reaches the authoritative lane quickly.
 await arena("");await key('ArrowRight');await ticks(1);
 const eased=await page.evaluate(()=>[__game.state.player.lane,__game.view.lane>2&&__game.view.lane<3,__game.view.lean]);
 await ticks(5);check('ship eases toward new lane then settles',[...eased,await page.evaluate(()=>__game.view.lane)],[3,true,1,3]);

 // 7. Frames for review.
 await arena("s.enemies=[{id:1,lane:1,layer:1,z:.55,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:1,layer:0,z:.7,shifted:false}];s.player.lane=1;");
 await key('ArrowDown');await ticks(2);await shot('route');
 await arena("s.enemies=[{id:1,lane:2,layer:1,z:.62,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:2,layer:0,z:.52,shifted:false}];");
 await key('ArrowDown');await ticks(4);check('late snap marks the whiff',await page.evaluate(()=>__game.state.fx.some(f=>f.kind==='late')),true);await shot('late');
 await arena("s.enemies=[{id:1,lane:2,layer:1,z:.6,type:'drone',armored:true,fireAt:9,turned:true}];s.shots=[{lane:2,layer:0,z:.66,shifted:false}];");
 await key('ArrowDown');for(let i=0;i<5;i++)await ticks(1);await shot('gap-kill');
 await arena("s.bolts=[{lane:1,layer:0,z:.8},{lane:3,layer:1,z:.86}];");await page.evaluate(()=>{__game.state.tick=0;__game.draw();});
 check('bolt lanes flash on both decks',await page.evaluate(()=>{const g=__game,c=document.getElementById('screen').getContext('2d'),red=[0xe8,0x58,0x48];return [[1,0],[3,1],[2,0]].map(([l,layer])=>{const p=g.project(l,1,layer),d=c.getImageData(Math.round(p.x),Math.round(p.y+8),1,1).data;return d[0]===red[0]&&d[1]===red[1]&&d[2]===red[2];});}),[true,true,false]);await shot('danger');
 await arena("s.player.invuln=0;s.lives=2;s.player.lane=2;s.enemies=[{id:1,lane:4,layer:1,z:.7,type:'drone',fireAt:9,turned:true}];s.bolts=[{lane:2,layer:0,z:.94}];");
 await ticks(3);check('bolt death records culprit',await page.evaluate(()=>[__game.state.phase,__game.state.fx.some(f=>f.kind==='culprit'&&f.bolt)]),['death',true]);await shot('culprit');
 await ticks(58);check('respawn shows retreat',await page.evaluate(()=>__game.state.fx.some(f=>f.kind==='retreat')),true);await ticks(3);await shot('retreat');
 await page.evaluate(()=>{const g=__game,s=g.state;Object.assign(s,g.engine.create(17));s.round=6;g.engine.boss(s);s.phase='play';s.player.invuln=9999;g.view.freeze=0;s.shots=[{lane:3,layer:1,z:.43,shifted:true}];g.tick();while(s.bossClock!==93)g.tick();});
 check('shutter opening is not drawn as a kill',await page.evaluate(()=>__game.state.fx.filter(f=>f.kind==='open').map(f=>[f.closing,!!f.amount])),[[false,false]]);await shot('shutter');

 check('no runtime errors',errors,[]);
 console.log('PASS',checks,'feel checks');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
