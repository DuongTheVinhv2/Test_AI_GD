import {Game} from '../src/core/game';
import {LEVELS} from '../src/core/levels';
import {ART_SOURCES} from '../src/core/art-data';
import {Rng} from '../src/core/rng';
import {writeFileSync} from 'node:fs';
const results:any[]=[];
for(const lv of LEVELS){
 const g=new Game(lv);const badRows=ART_SOURCES[lv.art].rows.map((r,i)=>({row:i,length:r.length})).filter(r=>r.length!==32);
 const counts=Array.from(g.sand.counts); const caps=Array(11).fill(0);for(const b of g.board.buckets)caps[b.color]+=g.caps[b.id];
 results.push({kind:'structure',level:lv.id,badRows,conserved:counts.every((n,i)=>n===caps[i]),total:g.sand.total,open:g.openBuckets().map(b=>b.id)});
}
for(const policy of ['random','exposed','lookahead'])for(const lv of LEVELS){
 let wins=0,losses=0,timeouts=0;const samples=[];
 for(let seed=1;seed<=10;seed++){
 const g=new Game(lv,seed),rng=new Rng(seed);let next=0;let invariant=true;
 while(g.status==='playing'&&g.time<150){
 if(g.ticks>=next&&g.slotsUsed<g.slots){
 next=g.ticks+90;const open=g.openBuckets(),ex=g.exposure();let pool=open;
 if(policy!=='random'){
 const good=open.filter(b=>ex[b.color]>0);if(good.length)pool=good;
 else if(policy==='lookahead'){
 // Cheapest legal removal sequence leading to exposed sand, accounting for mystery reveal.
 const queue=[{board:g.board.clone(),route:[] as number[]}];let route:number[]|null=null;
 for(let q=0;q<queue.length&&q<3000;q++){const x=queue[q];if(x.route.length>=g.slots-g.slotsUsed)continue;for(const b of x.board.openBuckets()){const r=[...x.route,b.id];if(ex[b.color]>0){route=r;break;}const board=x.board.clone();board.remove(board.buckets[b.id]);queue.push({board,route:r});}if(route)break;}
 pool=route?[g.board.buckets[route[0]]]:[];
 }
 }
 if(pool.length)g.tap(pool[rng.int(pool.length)].id);
 }
 g.step();if(g.slotsUsed>g.slots||g.sand.total<0)invariant=false;
 }
 if(g.status==='won')wins++;else if(g.status==='lost')losses++;else timeouts++;
 samples.push({seed,status:g.status,time:+g.time.toFixed(2),sand:g.sand.total,taps:g.stats.taps,invariant});
 }
 const row={kind:'simulation',policy,level:lv.id,wins,losses,timeouts,samples};results.push(row);console.log(JSON.stringify({policy,level:lv.id,wins,losses,timeouts}));
}
writeFileSync('qa/results/core-results.json',JSON.stringify(results,null,2));
