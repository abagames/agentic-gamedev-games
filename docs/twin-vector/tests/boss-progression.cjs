// Stages 6 and 9: split turrets choose the route deck; the core must sit on the other deck,
// shielded like any armored enemy, and only a routed shot through the open deck reaches it.
function verify(E){
 const out=[],ok=(name,v)=>{if(!v)throw Error(name);out.push(name);};
 const fresh=round=>{const s=E.create(1);s.round=round;E.boss(s);s.phase='play';s.queue=[];s.player.invuln=99999;return s;};
 const until=(s,t)=>{do{E.step(s);}while(s.bossClock!==t);};
 const destroy=(s,layer)=>{const t=s.enemies.find(e=>e.type==='turret'&&e.layer===layer);s.shots=[{lane:t.lane,layer,z:t.z+.03,shifted:true}];E.step(s);};
 const fly=(s,shot)=>{s.shots=[shot];let block=false,n=0;do{E.step(s);block=block||s.events.includes('block');}while(s.shots.length&&n++<60&&s.phase==='play');return block;};
 const route=(s,c)=>{s.player.lane=c.lane;s.player.layer=1-c.layer;s.player.fire=0;s.player.swap=0;s.shots=[];E.step(s,{fire:true});let n=0;while(s.shots[0]&&s.shots[0].z>c.z+.22&&n++<60)E.step(s);E.step(s,{swap:true});for(let i=0;i<30&&s.phase==='play';i++)E.step(s);};
 for(const round of [6,9])for(const killedLayer of [0,1]){
  const s=fresh(round),c=s.enemies.find(e=>e.type==='core');
  ok(round+' shielded split turrets '+killedLayer,s.enemies.slice(0,2).every(t=>t.armored)&&s.enemies[0].layer!==s.enemies[1].layer&&c.armored);
  for(const layer of [0,1])ok(round+' closed boss blocks deck '+layer+'/'+killedLayer,fly(s,{lane:c.lane,layer,z:.9,shifted:false})&&s.score===0);
  destroy(s,killedLayer);until(s,75);ok(round+' opposite warning '+killedLayer,c.openWarning&&c.warningLayer===1-killedLayer);
  until(s,130);ok(round+' route opens opposite, core on the far deck '+killedLayer,c.openLayer===1-killedLayer&&c.layer===killedLayer&&!c.locked);
  const lane=c.lane;E.step(s);ok(round+' holds aim during opening '+killedLayer,c.lane===lane);
  ok(round+' direct fire on the core deck is shielded '+killedLayer,fly(s,{lane:c.lane,layer:c.layer,z:.9,shifted:false})&&s.kills===1);
  ok(round+' open deck holds no core body '+killedLayer,!fly(s,{lane:c.lane,layer:c.openLayer,z:c.z+.03,shifted:true})&&s.kills===1);
  if(s.bossClock>150)until(s,round===9?122:100);
  const before=s.score;route(s,c);
  ok(round+' real routed shot destroys the core '+killedLayer,s.phase==='clear'&&s.kills===2&&s.enemies.length===0&&s.score-before>=(round===6?3000:5000));
 }
 for(const round of [6,9]){
  const s=fresh(round),c=s.enemies.find(e=>e.type==='core');destroy(s,0);destroy(s,1);
  const seen=[];for(let cycle=0;cycle<4;cycle++){until(s,130);ok(round+' both: core faces open route '+cycle,c.openLayer>=0&&c.layer===1-c.openLayer&&!c.locked);seen.push(c.openLayer);until(s,170);ok(round+' both extend opening '+cycle,c.openLayer===seen.at(-1));}
  ok(round+' both alternate route',seen.join()==='0,1,0,1'||seen.join()==='1,0,1,0');
 }
 for(const killedLayer of [0,1]){
  const s=fresh(9),c=s.enemies.find(e=>e.type==='core');destroy(s,killedLayer);
  for(let cycle=0;cycle<3;cycle++){until(s,100);if(cycle>0)ok('9 core still on the route deck at opening '+killedLayer+'/'+cycle,c.layer===1-killedLayer&&c.locked);until(s,130);ok('9 guaranteed window '+killedLayer+'/'+cycle,c.layer===killedLayer&&c.openLayer===1-killedLayer&&!c.locked);until(s,210);ok('9 departure has warning '+killedLayer+'/'+cycle,c.shiftTimer===59&&c.targetLayer!==c.layer);until(s,60);ok('9 return has warning '+killedLayer+'/'+cycle,c.shiftTimer===59&&c.targetLayer===killedLayer);}
 }
 {const s=fresh(6),c=s.enemies.find(e=>e.type==='core');destroy(s,1);until(s,30);ok('6 core leaves the route deck with warning',c.shiftTimer===59&&c.targetLayer===1);
  // A core that arrives around ordinary shots still deflects them: holding fire is not a route.
  until(s,88);const blocked=fly(s,{lane:c.lane,layer:1,z:c.z+.06,shifted:false});ok('arriving core deflects unrouted shots',s.kills===1&&c.layer===1&&blocked);}
 const s=fresh(9);destroy(s,0);until(s,210);const c=s.enemies.find(e=>e.type==='core'),timer=c.shiftTimer,clock=s.bossClock;s.paused=true;E.step(s);ok('pause freezes boss and shift clocks',c.shiftTimer===timer&&s.bossClock===clock);
 s.paused=false;s.phase='death';s.phaseTick=40;E.step(s);ok('death freezes boss and shift clocks',c.shiftTimer===timer&&s.bossClock===clock);
 E.start(s);ok('restart removes all boss parts',!s.bossSpawned&&!s.enemies.length&&s.round===1);
 const fire=fresh(6);destroy(fire,1);until(fire,100);const fc=fire.enemies.find(e=>e.type==='core');fc.fireClock=1;fire.bolts=[];E.step(fire);ok('core fires from its own deck while the route is open',fire.bolts.some(b=>b.lane===fc.lane&&b.layer===fc.layer));
 return out;
}
if(require.main===module){const out=verify(require('../engine.js'));out.forEach(x=>console.log('PASS',x));console.log('PASS',out.length,'boss progression checks');}module.exports=verify;
