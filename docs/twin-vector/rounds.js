(function(root){
'use strict';
const rounds=[
 {name:'PAIRED PATROL',groups:6,within:70,rest:170,boss:0},
 {name:'PINCER',groups:4,within:42,rest:225,boss:0},
 {name:'CROSS TRAFFIC',groups:5,within:48,rest:235,boss:1},
 {name:'LAYER HOP',groups:6,within:75,rest:215,boss:0},
 {name:'SHIELD CONVOY',groups:4,within:48,rest:255,boss:0},
 {name:'SIEGE LINE',groups:4,within:65,rest:255,boss:2},
 {name:'SHIFT PURSUIT',groups:5,within:65,rest:255,boss:0},
 {name:'CROSS GUARD',groups:4,within:60,rest:275,boss:0},
 {name:'LAST VECTOR',groups:5,within:60,rest:275,boss:3}
];
// pick in [0,1) chooses an authored variant for this group; stage 5 introduces the guard in its plain escort form.
function formation(round,group,flip,pick=0){
 const layer=(group+flip)%2,lane=(group*2+flip)%5,side=group%2?1:3;
 const drone=(lane,layer,extra={})=>({lane,layer,...extra});
 const shift=(lane,layer)=>drone(lane,layer,{type:'shifter'});
 const guard=()=>drone(2,layer,{type:'guard',armored:true,shieldSpan:1});
 if(round===1)return [drone(lane,layer),drone(lane,1-layer,{armored:group%2===1})];
 if(round===2)return [drone(group%2?3:1,layer,{armored:true}),drone(side,1-layer),drone(2,1-layer),drone(group%2?0:4,layer,{type:'weaver'})];
 if(round===3)return [drone(lane,layer,{armored:true}),drone((lane+1)%5,1-layer,{type:'weaver'}),drone(lane,1-layer),drone((lane+3)%5,layer,{type:'weaver'})];
 if(round===4)return [shift(lane,layer),drone((lane+2)%5,1-layer)];
 if(round===5)return [guard(),drone(1,layer),drone(3,layer),drone(2,1-layer)];
 if(round===6)return [drone(side,layer,{type:'gunner'}),shift(2,1-layer),drone(4-side,1-layer,{armored:true})];
 if(round===7)return [shift(side,layer),shift(4-side,1-layer),drone(2,layer,{type:'weaver'})];
 const variant=Math.floor(pick*2);
 if(round===8){
  // Rear guard: two leaders run exposed, the guard arrives about 2.5 s later and covers a shifter crossing in behind it.
  if(variant===1)return [drone(side,layer,{type:'gunner',wait:70}),drone(4-side,layer,{type:'weaver',dir:side===1?1:-1,wait:150}),guard(),shift(4-side,1-layer)];
  return [guard(),drone(side,layer,{type:'gunner'}),shift(4-side,1-layer),drone(2,1-layer,{type:'weaver'})];
 }
 const wide=extra=>drone(side,layer,{type:'guard',armored:true,shieldSpan:1,...extra});
 if(variant===1)return [drone(4-side,layer,{type:'gunner',wait:70}),drone(2,layer,{type:'weaver',wait:150}),wide(),shift(2,1-layer)];
 return [wide(),shift(2,1-layer),drone(4-side,layer,{type:'gunner'}),drone(2,layer,{type:'weaver'})];
}
const api={rounds,formation};root.TwinRounds=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
