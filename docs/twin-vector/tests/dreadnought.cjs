const assert=require('node:assert/strict'),E=require('../engine.js');
// Stage 3: core fixed on deck A behind its own shield; destroyed turrets open deck B as the route.
function verify(E){
 const results=[];const ok=(name,value)=>{if(!value)throw Error(name);results.push(name);};
 const fresh=()=>{const s=E.create(17);s.round=3;E.boss(s);s.phase='play';s.queue=[];s.player.invuln=9999;return s;};
 const shot=(s,e,layer,z,shifted=true)=>{s.shots=[{lane:e.lane,layer,z,shifted}];let block=false,n=0;do{E.step(s);block=block||s.events.includes('block');}while(s.shots.length&&n++<60&&s.phase==='play');s.events.push(...(block?['block']:[]));};
 const advance=(s,n)=>{for(let i=0;i<n;i++)E.step(s);};
 const route=(s,c,swapAt)=>{s.player.lane=c.lane;s.player.layer=1-c.layer;s.player.fire=0;s.shots=[];E.step(s,{fire:true});let n=0;while(s.shots.length&&s.shots[0].z>swapAt&&n++<60)E.step(s);s.player.swap=0;E.step(s,{swap:true});advance(s,30);};
 let s=fresh(),c=s.enemies[2];
 ok('core sits on A with turrets',c.layer===0&&s.enemies.slice(0,2).every(t=>t.layer===0&&t.armored));
 shot(s,c,0,.80,false);ok('core shield blocks direct fire',s.kills===0&&s.events.includes('block'));
 shot(s,c,0,.48,false);ok('unrouted shot in the gap is deflected',s.kills===0);
 shot(s,c,1,.80,false);ok('closed B shutter blocks the route',s.kills===0&&s.events.includes('block'));
 let t=s.enemies[0];shot(s,t,0,t.z+.32);ok('turret frontal shield blocks',s.kills===0);shot(s,t,0,t.z+.03);ok('turret gap hit unlocks cycle',s.kills===1&&s.enemies.length===2);
 while(s.bossClock!==90)E.step(s);ok('one turret opens B route only',c.openLayer===1&&!c.locked&&c.layer===0);const lane=c.lane;advance(s,20);ok('opening stays in one lane',c.lane===lane&&c.openLayer===1);
 shot(s,c,1,.48);ok('open B deck holds no core body',s.kills===1);
 route(s,c,.95);ok('transfer before the shield plane hits the core shield',s.kills===1);
 while(s.bossClock!==100)E.step(s);route(s,c,.66);ok('shot routed through B into the gap destroys the core',s.phase==='clear'&&s.score===2300&&s.kills===2&&s.enemies.length===0);
 s=fresh();c=s.enemies[2];shot(s,s.enemies[0],0,.43);while(s.bossClock!==162)E.step(s);ok('single turret window closes at 162',c.locked&&c.openLayer<0);
 s=fresh();c=s.enemies[2];shot(s,s.enemies[0],0,.43);shot(s,s.enemies.find(e=>e.type==='turret'),0,.43);while(s.bossClock!==162)E.step(s);ok('both turrets extend opening',c.openLayer===1);while(s.bossClock!==210)E.step(s);ok('extended opening closes at 210',c.locked);
 const old=s.bossClock;s.paused=true;advance(s,10);ok('pause freezes shutter clock',s.bossClock===old);s.paused=false;
 s=fresh();advance(s,29);ok('motion cue precedes movement',s.enemies[0].moveCue===1&&s.enemies[0].lane===1);advance(s,1);ok('whole hull moves together',s.enemies.map(e=>e.lane).join(',')==='2,4,3');advance(s,1200);ok('movement stays within lanes',s.enemies.every(e=>e.lane>=0&&e.lane<=4));
 s=fresh();t=s.enemies[0];s.player.layer=1;s.shots=[{lane:t.lane,layer:1,z:.55,shifted:false}];E.step(s,{swap:true});advance(s,7);ok('real transfer through turret gap destroys it',s.kills===1&&s.transfers===1);
 return results;
}
if(require.main===module){for(const name of verify(E))console.log('PASS',name);}
module.exports=verify;
