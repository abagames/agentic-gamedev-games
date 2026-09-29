/* Original game rules. Fixed 60 Hz, no dependency, same engine in browser and tests. */
(function(root){
'use strict';
const R=typeof module!=='undefined'&&module.exports?require('./rounds.js'):root.TwinRounds;
const LANES=5,SHIELD_GAP=.30,SHOT_SPEED=.020,EMPTY_WAIT=40;
function create(seed=1){return {seed,phase:'title',phaseTick:0,tick:0,round:1,score:0,lives:3,player:{lane:2,layer:0,move:0,fire:0,swap:0,invuln:0},enemies:[],shots:[],bolts:[],fx:[],events:[],queue:[],spawn:0,kills:0,transfers:0,deathCause:'',paused:false,bossSpawned:false,bonusRemaining:0,qualifies:true,initials:[0,0,0],caret:0,saved:false,entryComplete:false,extendCount:0,extendFlash:0,enemyShifts:0};}
function rand(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function event(s,name){s.events.push(name);}
function wave(s){
 s.enemies=[];s.shots=[];s.bolts=[];s.fx=[];s.spawn=50;s.queue=[];
 const config=R.rounds[s.round-1],flip=Math.floor(rand(s)*2);let id=s.round*100;
 for(let group=0;group<config.groups;group++){
  const members=R.formation(s.round,group,flip,rand(s));
  members.forEach((e,i)=>s.queue.push({type:'drone',armored:false,...e,group,id:id++,delay:e.wait??(i===members.length-1?config.rest:config.within)}));
 }
 s.bossSpawned=false;
 s.player={lane:2,layer:0,move:0,fire:0,swap:0,invuln:60};s.phase='ready';s.phaseTick=90;event(s,'ready');
}
function boss(s){
 s.bossSpawned=true;s.phase='bossReady';s.phaseTick=100;s.shots=[];s.bolts=[];
 const variant=R.rounds[s.round-1].boss||1,layer=0;
 s.bossVariant=variant;
 s.enemies=[{id:s.round*1000+1,lane:1,layer,z:.50,type:'turret',boss:true,fireClock:100},
  {id:s.round*1000+2,lane:3,layer:variant>=2?1:layer,z:.50,type:'turret',boss:true,fireClock:155},
  {id:s.round*1000+3,lane:2,layer:1-layer,z:.45,type:'core',boss:true,armored:true,locked:true,fireClock:120,reward:[0,2000,3000,5000][variant],shiftClock:variant===3?180:0}];
 {s.bossCycle=0;s.bossClock=0;s.bossOffset=0;s.bossDirection=1;for(const e of s.enemies){e.baseLane=e.lane;if(e.type==='turret'){e.armored=true;e.z=.40;}else{e.dualCore=true;e.phaseCore=variant===3;e.armored=true;e.layer=variant===3?1:0;e.openLayer=-1;e.warningLayer=-1;e.shiftClock=0;}}}
 event(s,'bossIn');
}
function updateDreadnought(s){
 if(!s.enemies.some(e=>e.dualCore))return;
 s.bossClock=(s.bossClock+1)%240;if(s.bossClock===0)s.bossCycle++;
 // Move only while closed; each step has a visible 30-tick direction cue.
 if(s.bossClock===30){s.bossOffset+=s.bossDirection;if(Math.abs(s.bossOffset)===1)s.bossDirection=-s.bossDirection;}
 const left=s.enemies.filter(e=>e.type==='turret'&&!e.dead).length;
 for(const e of s.enemies){
  const nextLane=e.baseLane+s.bossOffset;if(e.lane!==nextLane)e.movedAt=s.tick;e.lane=nextLane;e.moveCue=s.bossClock<30?s.bossDirection:0;
  if(e.dualCore){
   const was=e.openLayer,available=s.bossVariant===1?(left<2?[1]:[]):[0,1].filter(layer=>!s.enemies.some(t=>t.type==='turret'&&!t.dead&&t.layer===1-layer));
   const selected=available.length?available[s.bossCycle%available.length]:-1;
   e.warningLayer=selected;
   // The core is always shielded on its own layer; an open shutter on the other layer is the route.
   // Stage 6 moves the core off the route before it opens; stage 9 arrives late and leaves early.
   if(s.bossVariant===2&&s.bossClock===30&&selected>=0&&e.layer===selected){e.targetLayer=1-selected;e.shiftTimer=60;event(s,'warn');}
   if(e.phaseCore){
    if(s.bossClock===60&&selected>=0&&e.layer===selected){e.targetLayer=1-selected;e.shiftTimer=60;event(s,'warn');}
    if(s.bossClock===210){e.targetLayer=1-e.layer;e.shiftTimer=60;event(s,'warn');}
   }
   const end=left===1?162:210;
   e.openLayer=selected>=0&&s.bossClock>=90&&s.bossClock<end?selected:-1;
   e.locked=e.openLayer<0||e.openLayer===e.layer;
   e.openWarning=selected>=0&&s.bossClock>=60&&s.bossClock<90;if(s.bossClock===60&&selected>=0)event(s,'warn');
   if(was!==e.openLayer){event(s,'swap');s.fx.push({lane:e.lane,layer:was>=0?was:selected,z:e.z,kind:'open',closing:e.openLayer<0,life:18,max:18});}

  }
 }
}
// Score extends: 15,000 then every 20,000. Routed kills pay triple, so they arrive sooner.
const EXTEND_FIRST=15000,EXTEND_EVERY=20000;
function extend(s){if(s.score>=EXTEND_FIRST+EXTEND_EVERY*s.extendCount){s.lives++;s.extendCount++;s.extendFlash=120;event(s,'extend');}}
// Lane and deck control. Also live during ceremonies (ready, boss arrival, clear) so the player can
// take position; firing stays play-only.
function steer(s,input){
 const p=s.player;
 for(const k of ['move','fire','swap'])p[k]=Math.max(0,p[k]-1);
 if(input.move&&p.move===0){p.lane=Math.max(0,Math.min(4,p.lane+Math.sign(input.move)));p.move=9;}
 if(input.swap&&p.swap===0){
  s.fx.push({lane:p.lane,layer:p.layer,z:1,life:8,max:8,kind:'ghost'});p.layer=1-p.layer;p.swap=18;
  for(const b of s.shots){if(!b.shifted){b.layer=1-b.layer;b.shifted=true;s.fx.push({lane:b.lane,layer:b.layer,from:1-b.layer,z:b.z,life:7,max:7,kind:'route'});
   // A routed shot that arrives already past a body will fly on: mark the whiff.
   const passed=s.enemies.find(e=>e.layer===b.layer&&e.lane===b.lane&&b.z<e.z-.015&&e.z-b.z<.2);
   if(passed)s.fx.push({lane:b.lane,layer:b.layer,z:passed.z,life:16,max:16,kind:'late'});}}
  event(s,'swap');}
}
function finishEntry(s){s.phase='table';s.phaseTick=480;s.entryComplete=true;event(s,'clear');}
function start(s){const seed=s.seed;Object.assign(s,create(seed));wave(s);s.phaseTick=START_WAIT;s.events=s.events.filter(e=>e!=='ready');event(s,'start');}
const START_WAIT=240;
function die(s,cause,culprit){
 if(s.player.invuln||s.phase!=='play')return;
 s.lives--;s.deathCause=cause;s.phase='death';s.phaseTick=60;s.shots=[];s.bolts=[];
 s.fx.push({lane:s.player.lane,layer:s.player.layer,z:1,life:40,max:40,kind:'death'});
 if(culprit)s.fx.push({lane:culprit.lane,layer:culprit.layer,z:Math.min(culprit.z,1.03),life:60,max:60,kind:'culprit',bolt:cause==='BOLT',type:culprit.type});event(s,'death');
}
function kill(s,e,b){
 if(e.armored)s.fx.push({lane:e.lane,layer:e.layer,z:e.z+SHIELD_GAP,life:24,max:24,kind:'shieldFall',span:e.shieldSpan||0});
 if(e.dualCore)for(const part of s.enemies)if(part!==e)part.dead=true;
 e.dead=true;const intercept=e.movedAt!==undefined&&s.tick-e.movedAt<30;const amount=(e.type==='core'?(e.reward||2000):b.shifted?300:100)+(intercept?200:0);s.score+=amount;s.kills++;if(b.shifted)s.transfers++;
 const gap=!!(b.shifted&&e.armored),core=e.type==='core',life=core?48:gap?30:b.shifted?24:14;
 s.fx.push({lane:e.lane,layer:e.layer,z:e.z,life,max:life,kind:b.shifted?'transfer':'hit',amount,gap,core,turret:e.type==='turret'?e.baseLane:undefined});// A kill that read the target's move gets its own cue; the routed version is the brightest.
 event(s,intercept?(b.shifted?'interceptRouted':'intercept'):(b.shifted?'transfer':'hit'));if(core)event(s,'boom');
}
function step(s,input={}){
 s.events=[];if(s.paused)return;s.tick++;s.phaseTick--;if(s.extendFlash>0)s.extendFlash--;
 s.fx=s.fx.filter(f=>--f.life>0);
 if(s.phase==='title'){if(input.start)start(s);return;}
 if(s.phase==='over'||s.phase==='win'){
  if(s.phaseTick<=-180||(input.start&&s.phaseTick<-20)){
   s.phase=s.qualifies?'entry':'table';s.phaseTick=s.qualifies?1200:480;s.entryGate=20;s.initials=[0,0,0];s.caret=0;s.saved=false;
  }return;
 }
 if(s.phase==='entry'){
  if(s.entryGate>0){s.entryGate--;return;}
  if(input.nameMove){s.caret=Math.max(0,Math.min(3,s.caret+Math.sign(input.nameMove)));event(s,'swap');}
  if(input.nameChange&&s.caret<3){s.initials[s.caret]=(s.initials[s.caret]+Math.sign(input.nameChange)+26)%26;event(s,'fire');}
  if(input.confirm){if(s.caret<3){s.caret++;event(s,'fire');}else finishEntry(s);}
  if(s.phase==='entry'&&s.phaseTick<=0)finishEntry(s);return;
 }
 if(s.phase==='table'){if(s.phaseTick<=0||(input.start&&s.phaseTick<450)){s.phase='title';s.phaseTick=0;s.enemies=[];s.shots=[];s.bolts=[];s.fx=[];}return;}
 if(s.phase==='bossReady'){steer(s,input);if(s.phaseTick<=0)s.phase='play';return;}
 if(s.phase==='ready'){steer(s,input);if(s.phaseTick<=0){s.phase='play';s.phaseTick=0;}return;}
 if(s.phase==='clear'){steer(s,input);if(s.phaseTick<105&&s.bonusRemaining>0&&s.phaseTick%6===0){s.score+=100;s.bonusRemaining-=100;event(s,'fire');extend(s);}if(s.phaseTick<=0){if(s.round===R.rounds.length){s.phase='win';event(s,'win');}else{s.round++;wave(s);}}return;}
 if(s.phase==='death'){
  if(s.phaseTick<=0){if(s.lives<=0){s.phase='over';event(s,'over');}else{
   for(const e of s.enemies){if(!e.boss){if(e.z>.23)s.fx.push({lane:e.lane,layer:e.layer,z:.23,from:e.z,life:24,max:24,kind:'retreat'});e.z=Math.min(e.z,.23);e.shiftTimer=0;e.anchored=false;}e.fireAt=Math.max(e.fireAt,.58);}
   s.player.invuln=100;s.player.fire=0;s.player.swap=0;s.phase='ready';s.phaseTick=50;event(s,'ready');
  }}return;
 }
 const p=s.player;p.invuln=Math.max(0,p.invuln-1);
 steer(s,input);
 if(input.fire&&p.fire===0){s.shots.push({lane:p.lane,layer:p.layer,z:.96,shifted:false});p.fire=17;event(s,'fire');}
 // Rests give a crowded field room to breathe; an empty field needs only a short beat before the next arrival.
 if(!s.enemies.length&&s.queue.length&&s.spawn>EMPTY_WAIT)s.spawn=EMPTY_WAIT;
 if(--s.spawn<=0&&s.queue.length){const e=s.queue.shift();e.z=.04;e.fireAt=.55+rand(s)*.16;e.dir=e.lane===0?1:e.lane===4?-1:e.dir??(rand(s)<.5?-1:1);e.turned=false;s.enemies.push(e);s.spawn=e.delay||65;}
 updateDreadnought(s);
 for(const e of s.enemies){
  if((e.type==='shifter'&&!e.shiftedOnce&&e.z>=.12)||(e.type==='core'&&!e.locked&&e.shiftClock>0&&--e.shiftClock===0)){
   if(e.shiftTimer===undefined||e.shiftTimer===0){e.shiftTimer=60;e.targetLayer=1-e.layer;event(s,'warn');}
  }
  if(e.shiftTimer>0&&--e.shiftTimer===0){
   const old=e.layer;e.layer=e.targetLayer;e.movedAt=s.tick;e.shiftedOnce=true;s.enemyShifts++;
   if(e.type==='core'&&!e.dualCore)e.shiftClock=180;
   for(const layer of [old,e.layer])s.fx.push({lane:e.lane,layer,z:e.z,kind:'shift',life:12,max:12});event(s,'swap');
  }
  if(e.boss){
   if(--e.fireClock<=0){if(e.dualCore?e.openLayer>=0:!e.locked){s.bolts.push({lane:e.lane,layer:e.layer,z:e.z+.035});event(s,'enemyFire');}e.fireClock=e.type==='core'?145:160;}
   continue;
  }
  if(e.type==='gunner'&&!e.siegeDone&&e.z>=.52){
   if(!e.anchored){e.anchored=true;e.siegeTimer=108;event(s,'warn');}
   e.siegeTimer--;
   if([78,54,30].includes(e.siegeTimer)){s.bolts.push({lane:e.lane,layer:e.layer,z:e.z+.035});event(s,'enemyFire');}
   if(e.siegeTimer===0){e.anchored=false;e.siegeDone=true;}
   continue;
  }
  e.z+=(.0017+Math.min(s.round,3)*.00025)*(e.armored?.8:1);
  if(e.type==='weaver'&&!e.turned&&e.z>=.47){e.lane+=e.dir;e.movedAt=s.tick;e.turned=true;}
  if(e.type!=='gunner'&&e.z>=e.fireAt){s.bolts.push({lane:e.lane,layer:e.layer,z:e.z+.035});e.fireAt+=.48;event(s,'enemyFire');}
 }
 for(const b of s.shots){
  const prev=b.z;b.z-=SHOT_SPEED;
  const surfaces=[];
  for(const e of s.enemies){
   if(e.dead)continue;
   if(e.dualCore){if(e.lane!==b.lane)continue;
    if(b.layer===e.layer){surfaces.push({e,z:e.z,shield:false},{e,z:e.z+SHIELD_GAP,shield:true});}
    else if(e.openLayer!==b.layer)surfaces.push({e,z:e.z+SHIELD_GAP,shield:true});
    continue;}
   if(e.layer!==b.layer)continue;
   if(e.lane===b.lane)surfaces.push({e,z:e.z,shield:false});
   if(e.armored&&Math.abs(e.lane-b.lane)<=(e.shieldSpan||0))surfaces.push({e,z:e.z+SHIELD_GAP,shield:true});
  }
  const hit=surfaces.filter(h=>h.z<=prev+.015&&h.z>=b.z-.015).sort((a,c)=>c.z-a.z)[0];
  if(hit){
   // Only a routed shot can reach the core: a core arriving around direct shots still deflects them.
   if(hit.shield||(!hit.e.dualCore&&hit.e.locked)||(hit.e.dualCore&&!b.shifted)){s.fx.push({lane:b.lane,layer:b.layer,z:hit.z,life:9,max:9,kind:'block'});event(s,'block');}
   else kill(s,hit.e,b);
   b.dead=true;
  }
 }
 if(!s.enemies.some(e=>e.dualCore)&&s.enemies.some(e=>e.type==='core'&&e.locked)&&!s.enemies.some(e=>e.type==='turret'&&!e.dead)){const core=s.enemies.find(e=>e.type==='core');core.locked=false;event(s,'swap');s.fx.push({lane:core.lane,layer:core.layer,z:core.z,kind:'open',life:24,max:24});}
 s.shots=s.shots.filter(b=>b.z>0&&!b.dead);s.enemies=s.enemies.filter(e=>!e.dead);
 for(const b of s.bolts){b.z+=.0105;if(b.z>=.95&&b.z<=1.065&&b.lane===p.lane&&b.layer===p.layer)die(s,'BOLT',b);}
 s.bolts=s.bolts.filter(b=>b.z<1.1);extend(s);
 for(const e of s.enemies){if(e.z>=1.04){die(s,'BREACH',e);if(s.phase==='play')e.z=1.035;}}
 if(s.phase==='play'&&!s.enemies.length&&!s.queue.length){if(R.rounds[s.round-1].boss&&!s.bossSpawned){boss(s);return;}s.phase='clear';s.phaseTick=145;s.bonusRemaining=500;s.bolts=[];s.shots=[];event(s,'clear');}
}
const api={EMPTY_WAIT,EXTEND_FIRST,EXTEND_EVERY,create,start,step,wave,boss,rounds:R.rounds,LANES,SHIELD_GAP,SHOT_SPEED};root.TwinEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
