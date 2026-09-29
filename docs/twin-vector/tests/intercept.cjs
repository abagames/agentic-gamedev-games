function verify(E){
 const out=[],ok=(n,v)=>{if(!v)throw Error(n);out.push(n);};
 const setup=e=>{const s=E.create();s.phase='play';s.queue=[{id:999}];s.spawn=9999;s.player.invuln=999;s.enemies=[{id:1,lane:2,layer:0,z:.5,type:'drone',fireAt:9,...e}];return s;};
 for(const shifted of [false,true])for(const age of [undefined,29,30]){
  const s=setup(age===undefined?{}:{movedAt:100-age});s.tick=99;s.shots=[{lane:2,layer:0,z:.53,shifted},{lane:2,layer:0,z:.53,shifted}];E.step(s);const expected=(shifted?300:100)+(age===29?200:0);ok('bonus boundary '+shifted+'/'+age,s.score===expected&&s.kills===1&&s.fx.find(f=>f.amount).amount===expected);
 }
 const w=setup({type:'weaver',z:.469,dir:1,turned:false});w.shots=[{lane:3,layer:0,z:.49,shifted:false}];E.step(w);ok('lateral interception adds 200',w.score===300);
 const sh=setup({type:'shifter',shiftTimer:1,targetLayer:1});sh.shots=[{lane:2,layer:1,z:.53,shifted:true}];E.step(sh);ok('layer interception stacks with transfer',sh.score===500);
 const front=setup({armored:true,movedAt:0});front.shots=[{lane:2,layer:0,z:.82,shifted:true}];E.step(front);ok('shield block never earns interception',front.score===0&&front.kills===0);
 const approach=setup({});E.step(approach);ok('forward advance never arms bonus',approach.enemies[0].movedAt===undefined);
 for(const shifted of [false,true]){const s=setup({movedAt:90});s.tick=99;s.shots=[{lane:2,layer:0,z:.53,shifted}];E.step(s);ok('intercept has its own cue '+shifted,s.events.includes(shifted?'interceptRouted':'intercept')&&!s.events.includes(shifted?'transfer':'hit'));const t=setup({movedAt:0});t.tick=99;t.shots=[{lane:2,layer:0,z:.53,shifted}];E.step(t);ok('plain kill keeps its cue '+shifted,t.events.includes(shifted?'transfer':'hit')&&!t.events.some(e=>e.startsWith('intercept')));}
 const b=E.create();b.round=3;E.boss(b);b.phase='play';b.player.invuln=999;for(let i=0;i<30;i++)E.step(b);ok('boss lane step arms all parts',b.enemies.every(e=>e.movedAt===b.tick));
 return out;
}
if(require.main===module){const out=verify(require('../engine.js'));out.forEach(x=>console.log('PASS',x));console.log('PASS',out.length,'intercept checks');}module.exports=verify;
