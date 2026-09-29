/* Attention-limited player: used for balance tests and as the attract-mode pilot.
   Shared by Node tests and the browser build. */
(function(root){
'use strict';
// Attention-limited controller: only observe() may read world entities.
const DEFAULTS={actionTicks:12,scanTicks:12,glanceTicks:72,glanceDuration:18,latencyTicks:12,reorientTicks:24,memoryTicks:90,missChance:.15,depthError:.04};
function createHumanPolicy(random,config={}){
 const c={...DEFAULTS,...config},memory=[null,null],pending=[];
 let nextScan=0,nextAction=0,nextGlance=0,glanceUntil=0,glanceLayer=0,lastLayer=null,settleUntil=0;
 const stats={scans:[0,0],oppositeScans:0,missedScans:0,actions:0,minActionGap:null,reorientFrames:0,staleTargets:0,expiredTargets:0,ordinaryAttempts:0,armorAttempts:0,actionTrace:[]};
 function observe(world,t){
  const p=world.player;
  if(lastLayer===null){lastLayer=p.layer;nextGlance=t+c.glanceTicks;}
  if(p.layer!==lastLayer){settleUntil=t+c.reorientTicks;lastLayer=p.layer;glanceUntil=0;nextGlance=settleUntil+c.glanceTicks;}
  if(t<settleUntil){stats.reorientFrames++;return;}
  if(t<nextScan)return;nextScan=t+c.scanTicks;
  if(t>=nextGlance){glanceLayer=1-p.layer;glanceUntil=t+c.glanceDuration;nextGlance=t+c.glanceTicks;}
  const layer=t<glanceUntil?glanceLayer:p.layer;
  stats.scans[layer]++;if(layer!==p.layer)stats.oppositeScans++;
  if(random()<c.missChance){stats.missedScans++;return;}
  const read=e=>({...e,z:e.z+(random()-.5)*2*c.depthError});
  pending.push({at:t+c.latencyTicks,seen:t,layer,round:world.round,enemies:world.enemies.filter(e=>e.layer===layer||(e.dualCore&&e.openLayer===layer)).map(e=>({id:e.id,lane:e.lane,layer:e.layer,z:read(e).z,armored:!!e.armored,shieldSpan:e.shieldSpan||0,locked:e.dualCore?(e.openLayer!==1-e.layer||e.shiftTimer>0):!!e.locked,stationary:!!e.boss||!!e.anchored})),shots:world.shots.filter(b=>b.layer===layer).map(b=>({...read(b)})),bolts:world.bolts.filter(b=>b.layer===layer).map(b=>({...read(b)}))});
 }
 let lastAct=null;
 function act(p,t){
  while(pending.length&&pending[0].at<=t){const snapshot=pending.shift();memory[snapshot.layer]=snapshot;}
  if(t<settleUntil||t<nextAction)return{};nextAction=t+c.actionTicks;
  const perceived=[];
  for(const m of memory){if(!m)continue;const age=t-m.seen;if(age>c.memoryTicks){if(m.enemies.length)stats.expiredTargets++;continue;}
   // Extrapolation is bounded by memory expiry; no hidden current position/identity reads.
   for(const e of m.enemies.filter(e=>!e.locked))perceived.push({...e,z:e.z+(e.stationary?0:age*(.0017+Math.min(m.round,3)*.00025)*(e.armored?.8:1)),age});
  }
  const target=perceived.sort((a,b)=>(b.z-.07*Math.abs(b.lane-p.lane))-(a.z-.07*Math.abs(a.lane-p.lane)))[0];
  if(!target)return{};if(target.age>c.scanTicks+c.latencyTicks)stats.staleTargets++;
  const cover=perceived.filter(e=>e.shieldSpan>0&&e.layer===target.layer&&Math.abs(e.lane-target.lane)<=e.shieldSpan&&e.z+.3>target.z).map(e=>e.z+.3);
  const shieldZ=Math.max(target.armored?target.z+.3:0,...cover);
  const input={move:Math.sign(target.lane-p.lane)};
  if(!target.armored&&!cover.length){input.swap=p.layer!==target.layer;input.fire=!input.swap&&p.lane===target.lane;stats.ordinaryAttempts++;}
  else{
   const shots=[];for(const m of memory){if(!m||t-m.seen>30)continue;for(const b of m.shots)shots.push({...b,z:b.z-(t-m.seen)*.020});}
   const routed=shots.some(b=>b.shifted&&b.lane===target.lane&&b.layer===target.layer&&b.z>target.z);
   const loaded=shots.some(b=>!b.shifted&&b.lane===target.lane&&b.layer!==target.layer&&b.z>target.z+.04&&b.z<shieldZ-.03);
   input.swap=!routed&&(p.layer===target.layer||loaded);
   input.fire=!routed&&p.layer!==target.layer&&p.lane===target.lane;stats.armorAttempts++;
  }
  const own=memory[p.layer];
  if(own&&t-own.seen<30&&random()>.25&&own.bolts.some(b=>b.lane===p.lane&&b.z+(t-own.seen)*.0105>.73)){
   input.move=p.lane<2?1:-1;input.swap=true;
  }
  if(random()<.08)input.move=0;
  if(input.move||input.swap||input.fire){stats.actions++;if(lastAct!==null)stats.minActionGap=stats.minActionGap===null?t-lastAct:Math.min(stats.minActionGap,t-lastAct);lastAct=t;if(stats.actionTrace.length<100)stats.actionTrace.push({t,layer:p.layer,targetLayer:target.layer,age:target.age,armored:target.armored,...input});}
  return input;
 }
 return {step(world,t){if(world.phase!=='play')return{};observe(world,t);return act({lane:world.player.lane,layer:world.player.layer},t);},stats,config:c};
}
const api={createHumanPolicy,DEFAULTS};root.HumanPolicy=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
