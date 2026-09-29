require('fs').mkdirSync(require('path').resolve(__dirname,'../evidence'),{recursive:true}); // outputs; created on demand
const fs=require('fs'),path=require('path'),{run}=require('./policies.cjs');
const result={protocol:{tickRate:60,seeds:'1..12',maxTicks:36000,input:'move=-1|0|1, fire, swap; visible lanes/layers/z/shield/shots/bolts only',limited:require('./human-policy.cjs').DEFAULTS},final:[]};
for(const kind of ['idle','hold','mash','strong','limited'])for(let seed=1;seed<=12;seed++)result.final.push(run(kind,seed));
for(const kind of ['idle','hold','mash','strong','limited']){const r=result.final.filter(x=>x.kind===kind);console.log(kind,JSON.stringify({wins:r.filter(x=>x.phase==='win').length,min:Math.min(...r.map(x=>x.score)),max:Math.max(...r.map(x=>x.score)),mean:Math.round(r.reduce((a,x)=>a+x.score,0)/r.length)}));}
const best=Math.max(...result.final.filter(x=>['strong','limited'].includes(x.kind)).map(x=>x.score)),mono=Math.max(...result.final.filter(x=>['idle','hold','mash'].includes(x.kind)).map(x=>x.score));result.exploratory_ratio=best/mono;console.log('exploratory_ratio',result.exploratory_ratio);
if(result.final.some(x=>x.error))throw new Error('policy timed out');fs.writeFileSync(path.resolve(__dirname,'../evidence/balance.json'),JSON.stringify(result,null,2));
