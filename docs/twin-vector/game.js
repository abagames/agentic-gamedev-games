(function(){
'use strict';
const canvas=document.getElementById('screen'),ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
const E=TwinEngine,s=E.create(1983),game=s,audio=new TwinAudio.Bus();
const view={lane:2,lean:0,freeze:0,shake:0};
const storage=(()=>{try{return localStorage;}catch{return {getItem:()=>null,setItem:()=>{}};}})();
// Every run draws a fresh seed, so the first game after loading differs too.
const freshSeed=()=>((Date.now()^Math.floor(performance.now()*1000))>>>0)||1;
// Attract pilot: the attention-limited player from the balance tests, dropped into a random sector
// (sometimes straight into a boss) for one 10-second demo page. It can miss, get hit and lose ships.
const demo=E.create(freshSeed());let pilot=null,pilotFire=0;
function demoScene(){
 Object.assign(demo,E.create(freshSeed()));E.start(demo);demo.round=1+Math.floor(Math.random()*9);
 if(demo.round%3===0&&Math.random()<.5){demo.queue=[];E.boss(demo);}else E.wave(demo);
 let seed=freshSeed();pilot=HumanPolicy.createHumanPolicy(()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});pilotFire=0;
}
function demoStep(){
 let input=pilot.step(demo,demo.tick);if(input.fire)pilotFire=8;if(pilotFire>0)input={...input,fire:true};
 E.step(demo,input);pilotFire=demo.events.includes('fire')?0:Math.max(0,pilotFire-1);
 if(['over','win'].includes(demo.phase)||(demo.phase==='clear'&&demo.phaseTick<100))demoScene();
}
demoScene();
const C={black:'#080c14',ink:'#182c46',blue:'#285880',cyan:'#70d8d0',white:'#f0e4c0',gold:'#e8b048',red:'#e85848',pink:'#d878b0'};
const glyphs={ '^':['00100','01010','10001','00000','00000','00000','00000'],
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['111','010','010','010','010','010','111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],'+':['00000','00100','00100','11111','00100','00100','00000'],':':['0','1','0','0','1','0','0'],'/':['00001','00001','00010','00100','01000','10000','10000'],'>':['100','010','001','010','100','000','000'],'<':['001','010','100','010','001','000','000'],'!':['1','1','1','1','1','0','1'],'.':['0','0','0','0','0','0','1']};
function width(str,k=1){return [...str].reduce((a,c)=>a+((glyphs[c]||['000'])[0].length+1)*k,0)-k;}
function text(str,x,y,color=C.white,k=1,center=false){if(center)x-=width(str,k)/2;ctx.fillStyle=color;for(const c of str){const g=glyphs[c]||['000'];for(let j=0;j<g.length;j++)for(let i=0;i<g[j].length;i++)if(g[j][i]==='1')ctx.fillRect(Math.round(x+i*k),y+j*k,k,k);x+=(g[0].length+1)*k;}}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function line(x0,y0,x1,y1,c){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let err=dx+dy;for(;;){rect(x0,y0,1,1,c);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}}
function project(lane,z,layer){const depth=.2*z+.8*z*z,scale=.24+.76*depth;return {x:128+(lane-2)*44*scale,y:(layer?172:61)+81*depth,scale};}
// Digits: 1 body, 2 eye, 3 accent. Two frames alternate; telegraphs double the rate.
const sprites={
 drone:[['001111100','012111210','111111111','113111311','100111001','001000100'],['001111100','012111210','111111111','113111311','010111010','100000001']],
 weaver:[['100000001','110111011','111212111','011131110','001111100','010000010'],['010000010','110111011','111212111','011131110','001111100','100000001']],
 shifter:[['000111000','001101100','011020110','110010011','100131001','110010011','011020110','001101100','000111000'],['000111000','001111100','011000110','110020011','101131101','110020011','011000110','001111100','000111000']],
 guard:[['0011111111100','0110211120110','1101111111011','1111133311111','1110011100111','0100000000010'],['0011111111100','0110211120110','1101111111011','1111133311111','1110011100111','1000000000001']],
 gunner:[['011111110','112010211','110010011','111111111','001111100','000131000','000111000','000101000'],['011111110','112010211','110010011','111111111','001111100','000111000','000131000','001000100']],
 turret:[['001111100','111111111','112010211','110010011','111313111','100000001'],['001111100','111111111','112010211','110010011','111313111','010000010']],
 core:[['0011111111100','1110010100111','1101111111011','1111100011111','1111100011111','1101111111011','1110010100111','0011111111100'],['0011111111100','1110030300111','1101111111011','1111122211111','1111122211111','1101111111011','1110030300111','0011111111100']],
 ship:[['00000200000','00001210000','00011111000','10011111001','11111111111','11131113111','11000100011','10000000001'],['00000200000','00001210000','00011111000','10011111001','11111111111','11131113111','11000300011','10000000001']],
 burst:['100010001','010010010','001000100','000101000','110010011','000101000','001000100','010010010','100010001'],
 ring:['001000100','000000000','100010001','000101000','001000100','000101000','100010001','000000000','001000100'],
 badge:['0111110','1122211','1123211','1122211','0111110','0011100','0010100'],
 flag:['1110','1221','1110','1000','1000']
};
function sprite(name,x,y,k,colors,frame=0){let data=sprites[name];if(Array.isArray(data[0]))data=data[frame%data.length];for(let j=0;j<data.length;j++)for(let i=0;i<data[j].length;i++){const c=data[j][i];if(c==='0')continue;ctx.fillStyle=typeof colors==='string'?colors:colors[c-1];ctx.fillRect(Math.round(x+(i-data[j].length/2)*k),Math.round(y+(j-data.length/2)*k),Math.max(1,Math.ceil(k)),Math.max(1,Math.ceil(k)));}}
function floor(layer,state=s){const s=state;const p0=project(-.5,0,layer),p1=project(4.5,0,layer),p2=project(4.5,1,layer),p3=project(-.5,1,layer);const active=s.phase!=='over'&&s.player.layer===layer,c=active?C.blue:C.ink;
 // An integer raster of a wireframe plane; no gradients, glow or filtered lines.
 for(let l=-.5;l<5;l++){const a=project(l,0,layer),b=project(l,1,layer);line(a.x,a.y,b.x,b.y,c);}
 for(const z of [0,1]){const a=project(-.5,z,layer),b=project(4.5,z,layer);line(a.x,a.y,b.x,b.y,c);}
 // Interior rungs flow toward the player: the decks carry the freight forward.
 const flow=(s.tick%90)/90;for(let i=0;i<4;i++){const z=(i+flow)/4;if(z<.02)continue;const a=project(-.5,z,layer),b=project(4.5,z,layer);line(a.x,a.y,b.x,b.y,c);}
 line(p3.x,p3.y+3,p2.x,p2.y+3,active?C.cyan:C.blue);line(p3.x,p3.y,p3.x,p3.y+4,C.blue);line(p2.x,p2.y,p2.x,p2.y+4,C.blue);

 for(let l=0;l<5;l++){const p=project(l,1,layer),danger=s.bolts.some(b=>b.layer===layer&&b.lane===l&&b.z>.72);rect(p.x-2,p.y+7,5,2,danger&&s.tick%8<5?C.red:active&&s.player.lane===l?C.cyan:C.ink);}
}
function ship(x,y,lean,colors,frame){const data=sprites.ship[frame%2],k=1.4;for(let j=0;j<data.length;j++)for(let i=0;i<data[j].length;i++){const c=data[j][i];if(c==='0')continue;ctx.fillStyle=typeof colors==='string'?colors:colors[c-1];ctx.fillRect(Math.round(x+(i-data[j].length/2)*k+(j<3?lean:0)),Math.round(y+(j-data.length/2)*k),2,2);}}
function destination(lane,z,layer,tick){if(tick%20>=14)return;const p=project(lane,z,layer),r=5+4*p.scale;for(const dx of [-1,1])for(const dy of [-1,1])line(p.x+dx*r,p.y+dy*r,p.x+dx*(r-3),p.y+dy*r,C.gold);}
// Boss arrival: the hull glides in from the horizon over the arrival cue, then shields close.
const BOSS_HOLD=100,BOSS_APPROACH=60;
function arrival(s){if(s.phase!=='bossReady')return{dz:0,dy:0,shields:true};const age=BOSS_HOLD-s.phaseTick,t=Math.min(1,age/BOSS_APPROACH),e=1-(1-t)**3;return{dz:-(1-e)*.42,dy:age>=BOSS_APPROACH&&age<BOSS_APPROACH+4?1:0,shields:t>=1};}
function board(state=s){
 const s=state;floor(0,s);floor(1,s);const arr=arrival(s);
 if(s.enemies.some(e=>e.boss))for(const layer of [0,1]){
  const p=project(s.enemies.find(e=>e.dualCore)?.lane??2,s.enemies.some(e=>e.type==='core'&&(e.dualCore||e.layer===layer))?.45+arr.dz:.50+arr.dz,layer),rows=[22,26,38,50,55,55,50,38,26,22];
  rows.forEach((w,i)=>rect(p.x-w*p.scale,p.y+arr.dy-13+i*2*p.scale,w*2*p.scale,2*p.scale,layer?C.ink:C.blue));
  for(const [index,lane]of [[0,1],[1,3]]){
   if(s.bossVariant>=2&&layer!==index)continue;
   const alive=s.enemies.some(e=>e.type==='turret'&&(e.baseLane??e.lane)===lane);
   const lost=s.fx.some(f=>f.turret===lane);if(s.enemies.some(e=>e.type==='core'&&(e.dualCore||e.layer===layer)))rect(p.x+(index?12:-15),p.y-10,3,3,alive?C.red:lost&&s.tick%6<3?C.white:C.ink);
  }
 }
 for(const layer of [0,1]){
  const things=[...s.enemies.map(e=>e.boss?{...e,z:e.z+arr.dz}:e).flatMap(e=>e.dualCore?[0,1].map(l=>({...e,bodyLayer:e.layer,layer:l,what:'enemy'})):[{...e,what:'enemy'}]),...s.shots.map(b=>({...b,what:'shot'})),...s.bolts.map(b=>({...b,what:'bolt'}))].filter(o=>o.layer===layer).sort((a,b)=>a.z-b.z);
  for(const o of things){const p=project(o.lane,o.z,layer);if(o.boss)p.y+=arr.dy;const k=Math.max(o.what==='enemy'?.75:.5,p.scale*1.55);
   if(o.what==='enemy'){
    const firing=e=>e.boss?e.fireClock<30:e.type==='gunner'?(!e.siegeDone&&(e.anchored?[78,54,30].some(t=>e.siegeTimer>t&&e.siegeTimer-t<18):e.z>.46)):e.fireAt-e.z<.055;const colors=o.armored&&!o.dualCore?[C.gold,C.white,C.red]:o.type==='shifter'?[C.white,C.pink,C.blue]:o.type==='weaver'?[C.pink,C.white,C.blue]:[C.red,C.white,C.gold];
    const absent=o.dualCore&&o.bodyLayer!==layer;
    const alert=o.shiftTimer>0||o.moveCue||o.anchored||(o.type==='weaver'&&!o.turned&&o.z>.32)||firing(o),frame=Math.floor((s.tick+(o.id||0)*7)/(alert?4:14));
    sprite(o.type,p.x,p.y-k,o.type==='core'?k*1.8:k,absent?C.ink:colors,frame);
    if(o.moveCue)destination(o.lane+o.moveCue,o.z,layer,s.tick);
    // Core deck: a fixed shield like any armored enemy. Other deck: the shutter that opens the route.
    if(o.dualCore&&arr.shields){const q=project(o.lane,o.z+E.SHIELD_GAP,layer),w=12*q.scale;
     if(!absent){line(q.x-w,q.y,q.x+w,q.y,C.gold);line(q.x-w,q.y-4,q.x-w,q.y,C.gold);line(q.x+w,q.y-4,q.x+w,q.y,C.gold);}
     else if(o.openLayer!==layer){const col=o.openWarning&&layer===o.warningLayer&&s.tick%12<6?C.white:C.gold;for(let dy=-4;dy<=0;dy+=2)line(q.x-w,q.y+dy,q.x+w,q.y+dy,col);}
     else{line(q.x-w-3,q.y-4,q.x-w-3,q.y,C.gold);line(q.x+w+3,q.y-4,q.x+w+3,q.y,C.gold);}}
    else if(!o.dualCore&&o.locked){for(let y=-6;y<5;y+=3)line(p.x-9,p.y+y,p.x+9,p.y+y,C.white);}
    if(o.armored&&!o.dualCore&&(!o.boss||arr.shields)&&o.z+E.SHIELD_GAP<=1.05){const q=project(o.lane,o.z+E.SHIELD_GAP,layer),w=(9+44*(o.shieldSpan||0))*q.scale;line(q.x-w,q.y,q.x+w,q.y,C.gold);line(q.x-w,q.y-4,q.x-w,q.y,C.gold);line(q.x+w,q.y-4,q.x+w,q.y,C.gold);}
    if(o.shiftTimer>0&&(!o.dualCore||o.bodyLayer===layer))destination(o.lane,o.z,o.targetLayer,s.tick);
    if(!absent&&firing(o))rect(p.x-1,p.y-k,3,3,C.white);
    if(o.type==='weaver'&&!o.turned&&o.z>.32)destination(o.lane+o.dir,.47,layer,s.tick);
    if(!absent&&o.movedAt!==undefined&&s.tick-o.movedAt<30){rect(p.x-7*k,p.y-k,1,2,C.gold);rect(p.x+7*k,p.y-k,1,2,C.gold);}
   }
   else if(o.what==='shot'){rect(p.x-1,p.y-5*p.scale,2,6*p.scale,o.shifted?C.gold:C.cyan);if(o.shifted){rect(p.x-3,p.y-2,1,2,C.gold);rect(p.x+3,p.y-2,1,2,C.gold);}}
   else{rect(p.x-2,p.y-2,4,4,C.white);rect(p.x-1,p.y-1,2,2,C.red);}
  }
 }
 for(const f of s.fx){const p=project(f.lane,f.z,f.layer);const age=f.max-f.life;
  // Shield halves separate as they fall: the gap was used.
  if(f.kind==='shieldFall'){if(f.z<=1.05){const y=p.y+age,w=7+44*(f.span||0)*p.scale,d=age/3|0;line(p.x-w-d,y,p.x-2-d,y+(age>>2),C.gold);line(p.x+2+d,y+(age>>2),p.x+w+d,y,C.gold);if(age<12){rect(p.x-w-d,y-3,1,3,C.gold);rect(p.x+w+d,y-3,1,3,C.gold);}}continue;}
  if(f.kind==='shift'){const r=3+f.life/4;for(const dx of [-1,1])for(const dy of [-1,1])line(p.x+dx*r,p.y-5+dy*r,p.x+dx*(r-3),p.y-5+dy*r,C.white);continue;}
  if(f.kind==='block'){line(p.x-6,p.y-5-age,p.x-3,p.y-2-age,C.white);line(p.x+3,p.y-2-age,p.x+6,p.y-5-age,C.white);continue;}
  // Routed shot: a trace zips from the old deck to the new one.
  if(f.kind==='route'){const a=project(f.lane,f.z,f.from),t=age/f.max,y0=a.y+(p.y-a.y)*t;for(let y=Math.round(y0);f.from?y>p.y:y<p.y;y+=f.from?-2:2)rect(p.x,y,1,1,C.gold);continue;}
  if(f.kind==='ghost'){if(f.life%4<2)sprite('ship',p.x,p.y-5,1.4,C.blue);continue;}
  // Too late: the routed shot slips past the body. Weaker than a block.
  if(f.kind==='late'){if(f.life%4<3){const y=p.y-6-age;rect(p.x-8-age/3,y,1,3,C.gold);rect(p.x+8+age/3,y,1,3,C.gold);}continue;}
  if(f.kind==='retreat'){const a=project(f.lane,f.from,f.layer),t=age/f.max,y0=a.y+(p.y-a.y)*t;for(let y=Math.round(y0);y>p.y;y-=3)rect(p.x,y,1,2,C.blue);continue;}
  if(f.kind==='culprit'){if(s.phase==='death'&&f.life%10<6){if(f.bolt){rect(p.x-3,p.y-3,6,6,C.white);rect(p.x-2,p.y-2,4,4,C.red);}else{const r=6+5*p.scale;for(const dx of [-1,1])for(const dy of [-1,1]){line(p.x+dx*r,p.y-4+dy*r,p.x+dx*(r-4),p.y-4+dy*r,C.red);line(p.x+dx*r,p.y-4+dy*r,p.x+dx*r,p.y-4+dy*(r-4),C.red);}}}continue;}
  // Shutter bars slide aside when opening and back when closing.
  if(f.kind==='open'){const q=project(f.lane,f.z+E.SHIELD_GAP,f.layer),w=12*q.scale+3,g=Math.round((f.closing?f.life:age)/f.max*w),c=age<6?C.white:C.gold;for(let dy=-4;dy<=0;dy+=2){line(q.x-w-g,q.y+dy,q.x-g,q.y+dy,c);line(q.x+g,q.y+dy,q.x+w+g,q.y+dy,c);}continue;}
  const k=f.core?2.5:f.kind==='death'?2:f.gap?2:f.kind==='transfer'?1.3:.9,hot=f.kind==='transfer'||f.core?C.gold:C.white;
  if(f.kind==='death'){
   if(age<4){rect(p.x-2,p.y-7,4,4,C.white);sprite('burst',p.x,p.y-5,1.4,C.white);}
   else if(age<12)sprite('burst',p.x,p.y-5,2.2,age&2?C.white:C.cyan);
   else if(age<24)sprite('ring',p.x,p.y-5,2+(age-12)/6,C.red);
   // Hull fragments scatter and fall.
   for(let i=0;i<6;i++){const a=i*Math.PI/3+.4,r=age*1.2,fx=p.x+Math.cos(a)*r,fy=p.y-5+Math.sin(a)*r*.6+age*age/40;if(age>=6&&f.life%4)rect(fx,fy,2,2,i%2?C.cyan:C.white);}
   continue;}
  const end=f.core?20:10;
  if(age<3){rect(p.x-2,p.y-7,4,4,C.white);sprite('burst',p.x,p.y-5,k*.75,C.white);}
  else if(age<end)sprite('burst',p.x,p.y-5,k,hot);
  else if(age<end+5)sprite('ring',p.x,p.y-5,k*(1.1+(age-end)/8),C.red);
  else if(f.life%3)for(const dx of [-1,1])for(const dy of [-1,1])rect(p.x+dx*(5+age/3)*k/.9,p.y-5+dy*(5+age/4)*k/.9,2,2,C.red);
  if(f.amount)text(String(f.amount),p.x,p.y-21-(f.max-f.life)/5|0,hot,1,true);
 }
 if(s.phase!=='death'&&s.phase!=='over'&&(s.player.invuln===0||s.tick%8<5)){
  const lane=s===game?view.lane:s.player.lane,p=project(lane,1,s.player.layer),lean=s===game?view.lean:0;ship(p.x,p.y-5+(s.player.fire>14?1:0),lean,s.player.swap>15?C.white:[C.cyan,C.white,C.red],s.tick>>2);
  if(s.player.fire>13){rect(p.x-1,p.y-16,2,4,C.white);}
 }
}
let best=0;try{best=Number(localStorage.getItem('twin-vector-best'))||0;if(!Number.isFinite(best)||best<0)best=0;}catch{}let savedBest=best;
// Cabinet messages occupy the gap between decks. No panel, backing or border.
function ceremony(){
 if(s.paused){text('PAUSE',128,153,C.white,1,true);if(performance.now()%1333<833)text('PUSH SPACE',128,163,C.white,1,true);return;}
 if(s.extendFlash>0&&['play','clear'].includes(s.phase)&&s.tick%16<11)text('EXTEND',128,49,C.gold,1,true);
 if(s.phase==='ready'){
  text('PLAYER 1',128,49,C.white,1,true);
  if(s.phaseTick>30||Math.floor(s.phaseTick/10)%2===0)text('READY',128,158,C.gold,1,true);
 }
 if(s.phase==='bossReady')text(['','DREADNOUGHT','BULWARK','PHASE CARRIER'][s.bossVariant||1],128,158,C.red,1,true);
 if(s.phase==='clear'){
  text('SECTOR CLEAR',128,158,C.cyan,1,true);
  if(s.phaseTick<105)text('BONUS  '+String(500-s.bonusRemaining).padStart(3,'0'),128,277,C.gold,1,true);
 }
 if(s.phase==='over'||s.phase==='win'){
  text(s.phase==='over'?'GAME OVER':'ALL CLEAR',128,158,s.phase==='over'?C.red:C.gold,1,true);
  
 }
}
function rankingScreen(){
 text('HIGH SCORES',128,53,C.gold,1,true);
 const rows=TwinRanking.table(storage);if(s.phase==='entry'){rows.unshift({name:s.initials.map(n=>String.fromCharCode(65+n)).join(''),score:s.score,pending:true});rows.sort((a,b)=>b.score-a.score);rows.length=5;}
 rows.forEach((r,i)=>{text(String(i+1),48,79+i*17,C.red);text(r.name,80,79+i*17,r.pending?C.gold:C.cyan);text(String(r.score).padStart(6,'0'),149,79+i*17,C.white);});
 if(s.phase==='entry'){
  text('ENTER INITIALS',128,181,C.gold,1,true);
  for(let i=0;i<3;i++)text(String.fromCharCode(65+s.initials[i]),83+i*24,208,C.white,2);
  text('END',170,211,C.cyan);const x=s.caret===3?170:83+s.caret*24;line(x,225,x+(s.caret===3?16:9),225,C.gold);
  text('UP DOWN LETTER   SPACE SELECT',128,252,C.white,1,true);
 }else if(s.tick%80<50)text('PUSH SPACE',128,242,C.white,1,true);
}
function scoreTable(){
 text('SCORE ADVANCE TABLE',128,70,C.cyan,1,true);
 // Scored by how the kill happened; interception covers both lane movers and deck movers.
 const rows=[
  [[['drone',[C.red,C.white,C.gold]]],'100','DIRECT',C.white],
  [[['drone',[C.gold,C.white,C.red]]],'300','ROUTED',C.gold],
  [[['weaver',[C.pink,C.white,C.blue]],['shifter',[C.white,C.pink,C.blue]]],'+200','INTERCEPT',C.gold],
  [[['core',[C.red,C.white,C.gold]]],'2000-5000','CORE',C.white]];
 rows.forEach(([who,pts,label,col],i)=>{const y=100+i*26;who.forEach(([name,colors],j)=>sprite(name,who.length>1?58+j*20:70,y+3,name==='core'?1.2:1.4,colors,Math.floor(s.tick/14)));text(pts,96,y,col);text(label,160,y,C.cyan);});
 // The first three thresholds, from the engine's rule (15000 then every 20000); a fourth is out of reach.
 text('EXTEND '+[0,1,2].map(i=>E.EXTEND_FIRST+E.EXTEND_EVERY*i).join(' '),128,214,C.gold,1,true);
 if(s.tick%80<50)text('PUSH SPACE',128,242,C.white,1,true);
}
function draw(){
 rect(0,0,256,288,C.black);
 const inGame=!['title','entry','table'].includes(s.phase);
 if(!inGame||s.tick%32<20)text('1UP',8,6,C.red);text(String(s.score).padStart(6,'0'),8,17,C.white);text('HI-SCORE',128,6,C.red,1,true);text(String(Math.max(best,s.score)).padStart(6,'0'),128,17,C.white,1,true);
 if(inGame){
  // Reserve ships bottom left; sector badges bottom right (big badge = five sectors).
  const reserve=Math.max(0,s.lives-(s.phase==='death'||s.phase==='over'?0:1));for(let i=0;i<Math.min(reserve,5);i++)sprite('ship',12+i*12,281,.7,i===reserve-1&&s.extendFlash>0&&s.tick%10<5?C.white:C.cyan);
  let x=250;for(let n=0;n<Math.floor(s.round/5);n++){sprite('badge',x-3,280,1,[C.gold,C.red,C.white]);x-=9;}for(let n=0;n<s.round%5;n++){sprite('flag',x-2,280,1,[C.red,C.white]);x-=6;}
 }
 if(s.phase==='entry'||s.phase==='table'){rankingScreen();return;}
 if(s.phase==='title'){
  const page=Math.floor(s.tick/600)%3;text('TWIN VECTOR',128,35,C.gold,2,true);
  if(page===0){board(demo);
   if(s.tick%80<56)text('PUSH SPACE',128,158,C.white,1,true);
   text(Math.floor(s.tick/240)%2?'SEND SHOTS BEHIND SHIELD':'ARROWS  LANE AND DECK',128,262,C.white,1,true);
   text('SPACE FIRE',128,276,C.cyan,1,true);}
  else if(page===1)scoreTable();
  else rankingScreen();
 }else{
  text('LEFT '+String(s.enemies.length+s.queue.length).padStart(2,'0'),183,36,C.white);
  const d=view.shake>0?(view.shake%4<2?1:-1)*(view.shake>6?2:1):0;ctx.save();ctx.translate(d,0);board();ctx.restore();
  if(s.phase==='ready')text(E.rounds[s.round-1].name,128,277,C.cyan,1,true);
  if(s.phase==='death')text(s.deathCause,128,157,C.red,1,true);
 }
 ceremony();
 if(audio.muted)text('M',244,36,C.blue);
}
const keys=new Set();let startEdge=false,manual=false,moveEdge=0,fireBuffer=0,pendingSwap=0,pendingLayer=null;
let nameMove=0,nameChange=0,confirmEdge=false;
const moveKeys={ArrowLeft:-1,KeyA:-1,ArrowRight:1,KeyD:1},deckKeys={ArrowUp:0,KeyW:0,ArrowDown:1,KeyS:1},ACTION=['Space','Enter','KeyZ','KeyX'],STEER=['play','ready','bossReady','clear'];
// Returning from another tab leaves the game paused; any action key or tap resumes without firing.
const MENU=['title','over','win','table'],inGame=()=>!MENU.includes(s.phase);
function pause(v){s.paused=v;if(v){audio.stop();keys.clear();startEdge=false;moveEdge=0;fireBuffer=0;pendingSwap=0;pendingLayer=null;}}
window.addEventListener('keydown',e=>{
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Enter','KeyZ','KeyX','KeyA','KeyD','KeyP','KeyM','KeyW','KeyS'].includes(e.code))e.preventDefault();
 if(e.repeat)return;audio.unlock();
 if(s.paused&&(ACTION.includes(e.code)||e.code==='KeyP')){pause(false);return;}
 if(s.phase==='entry'){
  if(['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code))nameMove=['ArrowLeft','KeyA'].includes(e.code)?-1:1;
  if(['ArrowUp','KeyW','ArrowDown','KeyS'].includes(e.code))nameChange=['ArrowUp','KeyW'].includes(e.code)?1:-1;
  if(['Enter','Space','KeyZ','KeyX'].includes(e.code))confirmEdge=true;
  if(e.code==='KeyM')audio.mute(!audio.muted);if(e.code==='KeyP')pause(!s.paused);return;
 }
 keys.add(e.code);
 if(e.code in moveKeys){s.player.move=0;moveEdge=moveKeys[e.code];}
 // One action family (start, fire, confirm); arrows alone move lane and deck.
 if(ACTION.includes(e.code)){if(['title','over','win','table'].includes(s.phase))startEdge=true;else fireBuffer=8;}
 if(STEER.includes(s.phase)&&e.code in deckKeys){pendingLayer=deckKeys[e.code];pendingSwap=pendingLayer===s.player.layer?0:12;}
 if(e.code==='KeyP')pause(!s.paused);
 if(e.code==='KeyM')audio.mute(!audio.muted);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();startEdge=false;if(inGame())pause(true);});
document.addEventListener('visibilitychange',()=>{audio.visibility(document.visibilityState==='visible');if(document.hidden&&inGame())pause(true);});
canvas.addEventListener('pointerdown',e=>{canvas.focus();audio.unlock();if(s.paused){pause(false);return;}if(['title','over','win','table'].includes(s.phase)){startEdge=true;return;}const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x<.3)keys.add('ArrowLeft');else if(x>.7)keys.add('ArrowRight');else if(STEER.includes(s.phase)){pendingLayer=y<.5?0:1;pendingSwap=pendingLayer===s.player.layer?0:12;}keys.add('Space');canvas.setPointerCapture(e.pointerId);});
function release(){keys.clear();}canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
function tick(){
 if(s.phase==='title'){
  s.tick++;audio.ambient(null);if(startEdge){s.seed=freshSeed();E.start(s);audio.emitBatch(s.events);startEdge=false;return;}
  // A fresh scene each time the demo page comes round; the demo only runs while it is on screen.
  if(s.tick%1800===0)demoScene();
  if(Math.floor(s.tick/600)%3===0)demoStep();
  return;
 }
 view.shake=Math.max(0,view.shake-1);
 if(view.freeze>0){view.freeze--;return;}
 let move=0;for(const k of keys)if(moveKeys[k])move=moveKeys[k];if(moveEdge)move=moveEdge;
 s.qualifies=TwinRanking.qualifies(storage,s.score);
 E.step(s,{nameMove,nameChange,confirm:confirmEdge,move,fire:ACTION.some(k=>keys.has(k))||fireBuffer>0,swap:pendingSwap>0&&pendingLayer!==null&&pendingLayer!==s.player.layer,start:startEdge});
 if(s.events.includes('swap')){pendingSwap=0;pendingLayer=null;}else pendingSwap=Math.max(0,pendingSwap-1);
 if(s.events.includes('fire'))fireBuffer=0;else fireBuffer=Math.max(0,fireBuffer-1);
 nameMove=0;nameChange=0;confirmEdge=false;moveEdge=0;startEdge=false;
 // Approach beat: tempo follows the nearest ordinary enemy; the entry screen gets its own loop.
 const near=s.enemies.reduce((z,e)=>e.boss?z:Math.max(z,e.z),0);
 audio.ambient(s.paused?null:s.phase==='play'?'beat':s.phase==='entry'?'entry':null,(near-.25)/.7);
 audio.emitBatch(s.events);
 if(s.entryComplete&&!s.saved){TwinRanking.save(storage,s.initials.map(n=>String.fromCharCode(65+n)).join(''),s.score);s.saved=true;}
 if(s.phase==='bossReady'&&s.phaseTick===BOSS_HOLD-BOSS_APPROACH)view.shake=6;
 const big=s.fx.find(f=>f.life===f.max&&(f.core||f.gap));if(big)view.freeze=big.core?8:3;
 if(big?.core||s.events.includes('death'))view.shake=12;
 const target=s.player.lane;if(s.phase==='title'||Math.abs(target-view.lane)>1.5)view.lane=target;else view.lane+=(target-view.lane)*.55;if(Math.abs(target-view.lane)<.06)view.lane=target;
 view.lean=Math.abs(target-view.lane)>.06?Math.sign(target-view.lane):0;
 best=Math.max(best,s.score);
 if(best>savedBest&&['over','win','clear'].includes(s.phase))try{localStorage.setItem('twin-vector-best',String(best));savedBest=best;}catch{}
}
let last=performance.now(),acc=0;
function frame(now){acc+=Math.min(100,now-last);last=now;while(acc>=1000/60){if(!manual)tick();acc-=1000/60;}draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
// Deliberate, query-gated test surface: the normal game exposes no mutable state.
if(new URLSearchParams(location.search).has('test'))window.__game={state:s,audio,engine:E,draw,view,demo:()=>demo,demoScene,tick(){tick();draw();},manual(v){manual=v;},step(input){E.step(s,input);audio.emitBatch(s.events);draw();},project,palette:C};
})();
