require('fs').mkdirSync(require('path').resolve(__dirname,'../evidence'),{recursive:true}); // outputs; created on demand
const fs=require('fs'),path=require('path'),{run}=require('./policies.cjs');
const report={protocol:'Boss-only, fresh 3 lives, seeds 201..260, same frozen human attention/execution limits; strong sees visible open layer. 600 second horizon. Not campaign completion rates.',bosses:[]};
for(const round of [3,6,9])for(const kind of ['hold','mash','strong','limited']){
 const runs=Array.from({length:kind==='limited'?60:12},(_,i)=>run(kind,i+201,undefined,{startBoss:round,stopAfterRound:round}));
 const wins=runs.filter(r=>r.phase==='clear');const row={round,kind,n:runs.length,clears:wins.length,timeouts:runs.filter(r=>r.error).length,meanSeconds:Math.round(runs.reduce((n,r)=>n+(r.seconds||600),0)/runs.length),meanScore:Math.round(runs.reduce((n,r)=>n+r.score,0)/runs.length),runs};report.bosses.push(row);console.log(JSON.stringify({...row,runs:undefined}));
}
report.campaign=[];for(const kind of ['strong','limited']){const runs=Array.from({length:kind==='limited'?60:12},(_,i)=>run(kind,i+201));const row={kind,n:runs.length,clears:runs.filter(r=>r.phase==='win').length,timeouts:runs.filter(r=>r.error).length,meanScore:Math.round(runs.reduce((n,r)=>n+r.score,0)/runs.length),runs};report.campaign.push(row);console.log('campaign',JSON.stringify({...row,runs:undefined}));}
fs.writeFileSync(path.resolve(__dirname,'../evidence/boss-progression-balance.json'),JSON.stringify(report,null,2));
