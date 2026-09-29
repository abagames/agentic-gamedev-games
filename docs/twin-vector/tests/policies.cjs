const E=require('../engine.js');
const {createHumanPolicy}=require('./human-policy.cjs');
function run(kind,seed=1,engine=E,options={}){
 const E=engine,s=E.create(seed);E.start(s);let target=null,decision=0,input={},actions=0,lastMove=0;const causes={},telemetry={spawns:0,shots:0,swaps:0,blocks:0,deaths:[],transferKills:0,ordinaryKills:0,bossReached:false,enemyShifts:0};
 let r=seed+123;const random=()=>{r=(Math.imul(r,1664525)+1013904223)>>>0;return r/4294967296;};
 if(options.startRound){s.round=options.startRound;E.wave(s);}
 if(options.startBoss){s.round=options.startBoss;s.queue=[];E.boss(s);}
 const human=createHumanPolicy(random,options);
 for(let t=0;t<36000;t++){
  input={};
  if(s.phase==='play'){
   if(kind==='hold')input={fire:true};
   if(kind==='mash')input={fire:true,move:Math.floor(t/90)%2?1:-1,swap:t%19===0};
   if(kind==='limited'){input=human.step(s,t);if(input.move||input.swap||input.fire){actions++;lastMove=t;}}
   if(kind==='strong'||kind==='legacyLimited'){
    const cadence=kind==='strong'?1:12;
    if(t%cadence===0){
     const p=s.player;
     if(kind==='strong'||t>=decision||(target&&!s.enemies.some(e=>e.id===target.id))){
      const candidates=s.enemies.filter(e=>!e.locked).sort((a,b)=>(b.z-.07*Math.abs(b.lane-p.lane))-(a.z-.07*Math.abs(a.lane-p.lane)));
      target=candidates[0]?{...candidates[0]}:null;decision=t+30;
      if(kind==='legacyLimited'&&target)target.z+=(random()-.5)*.08;
      // One missed scan in ten; stale observations persist for half a second.
      if(kind==='legacyLimited'&&random()<.1){target=null;decision=t+30;}
     }
     input.fire=true;
     if(target){
      input.move=Math.sign(target.lane-p.lane);
      const routed=s.shots.some(b=>b.shifted&&b.lane===target.lane&&b.layer===target.layer&&b.z>target.z);
      const loaded=s.shots.some(b=>!b.shifted&&b.lane===target.lane&&b.layer!==target.layer&&b.z>target.z+.04&&(!target.armored||b.z<target.z+E.SHIELD_GAP-.03));
      input.fire=!routed&&p.layer!==target.layer&&p.lane===target.lane;
      input.swap=!routed&&(p.layer===target.layer||loaded);
     }
     if(kind==='strong'||random()>.25){
      const threat=s.bolts.some(b=>b.lane===p.lane&&b.layer===p.layer&&b.z>.73);
      if(threat){input.swap=true;input.move=p.lane<2?1:-1;}
     }
     if(kind==='legacyLimited'&&random()<.08)input.move=0;
     if(input.move||input.swap)actions++;lastMove=t;
    }
   }
  }
  const queued=s.queue.length;E.step(s,input);if(s.bossSpawned)telemetry.bossReached=true;telemetry.enemyShifts=s.enemyShifts||0;if(s.queue.length<queued)telemetry.spawns+=queued-s.queue.length;
  for(const ev of s.events){if(ev==='fire')telemetry.shots++;if(ev==='swap')telemetry.swaps++;if(ev==='block')telemetry.blocks++;if(ev==='transfer'||ev==='interceptRouted')telemetry.transferKills++;if(ev==='hit'||ev==='intercept')telemetry.ordinaryKills++;}
  if(s.events.includes('death')){causes[s.deathCause]=(causes[s.deathCause]||0)+1;telemetry.deaths.push({tick:t,cause:s.deathCause,sinceDecision:t-lastMove,targets:s.enemies.length,score:s.score,round:s.round});}
  if(s.phase==='over'||s.phase==='win'||(options.stopAfterRound===s.round&&s.phase==='clear'&&s.bonusRemaining===0))return {kind,seed,phase:s.phase,score:s.score,kills:s.kills,transfers:s.transfers,round:s.round,lives:s.lives,seconds:Math.round(t/60),actions,causes,telemetry,perception:kind==='limited'?human.stats:undefined};
 }
 return {kind,seed,phase:s.phase,score:s.score,round:s.round,error:'timeout'};
}
if(require.main===module){const all=[];for(const kind of ['idle','hold','mash','strong','limited'])for(let seed=1;seed<=12;seed++)all.push(run(kind,seed));console.log(JSON.stringify(all,null,2));}module.exports={run};
