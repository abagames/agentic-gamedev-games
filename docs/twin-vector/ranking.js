(function(root){
'use strict';
const defaults=[{name:'ACE',score:12000},{name:'CPU',score:8000},{name:'RAM',score:4000},{name:'VEC',score:2000},{name:'ONE',score:500}];
function clean(rows){return Array.isArray(rows)?rows.filter(r=>r&&/^[A-Z]{3}$/.test(r.name)&&Number.isInteger(r.score)&&r.score>=0&&r.score<=999999).map(r=>({name:r.name,score:r.score})).slice(0,100):[];}
function read(storage){try{return clean(JSON.parse(storage.getItem('twin-vector-scores')||'[]'));}catch{return[];}}
function table(storage){return [...read(storage),...defaults].sort((a,b)=>b.score-a.score).slice(0,5);}
function qualifies(storage,score){return score>=table(storage).at(-1).score;}
function save(storage,name,score){if(!qualifies(storage,score))return false;const rows=clean([{name,score},...read(storage)]).sort((a,b)=>b.score-a.score).slice(0,5);try{storage.setItem('twin-vector-scores',JSON.stringify(rows));}catch{}return true;}
const api={defaults,table,qualifies,save};root.TwinRanking=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
