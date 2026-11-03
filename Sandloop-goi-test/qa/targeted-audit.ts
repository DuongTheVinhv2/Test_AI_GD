import {Game} from '../src/core/game';
import {Board} from '../src/core/grid';
import {SandSim} from '../src/core/sand';
import {LEVELS} from '../src/core/levels';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const checks:string[]=[];
function test(name:string,run:()=>void){run();checks.push(name);console.log('PASS',name);}
test('blocked bucket leaves board/belt unchanged',()=>{const g=new Game(LEVELS[4]);const b=g.board.buckets.find(b=>!g.board.isOpen(b))!;assert.equal(g.tap(b.id),'blocked');assert.equal(b.gone,false);assert.equal(g.belt.length,0);});
test('rapid taps enforce capacity and reject duplicate',()=>{const g=new Game(LEVELS[8]);for(let i=0;i<5;i++)assert.equal(g.tap(g.openBuckets()[0].id),'ok');const n=g.board.remaining;assert.equal(g.tap(g.openBuckets()[0].id),'full');assert.equal(g.board.remaining,n);assert.equal(g.tap(g.belt[0].id),'blocked');assert.equal(g.slotsUsed,5);});
test('mystery stays hidden until adjacent floor is empty',()=>{const b=new Board(['oo'],[['0','?1']]);assert.equal(b.buckets[1].revealed,false);assert.equal(b.isOpen(b.buckets[1]),false);b.remove(b.buckets[0]);assert.equal(b.buckets[1].revealed,true);assert.equal(b.isOpen(b.buckets[1]),true);});
test('hole blocks board path',()=>{const b=new Board(['o','x','o'],[['.'],['.'],['0']]);assert.equal(b.path(b.buckets[0]),null);});
test('sand respects real four-grain layer and reaches through stray',()=>{const s=new SandSim(1,5);s.cells.set([1,1,1,1,2]);assert.equal(s.pickup(0,0,1,1),0);s.cells.set([1,1,1,2,0]);assert.equal(s.pickup(0,0,1,1),1);});
test('win emitted once and taps rejected after win',()=>{const g=new Game(LEVELS[0]);let wins=0;g.onEvent=e=>{if(e.type==='win')wins++;};for(const b of g.openBuckets())g.tap(b.id);for(let i=0;i<150*60;i++)g.step();assert.equal(g.status,'won');assert.equal(wins,1);assert.equal(g.sand.total,0);assert.equal(g.tap(0),'over');assert.equal(g.delivered,5);});
test('loss emitted once and taps rejected after loss',()=>{const g=new Game(LEVELS[8]);let losses=0;g.onEvent=e=>{if(e.type==='lose')losses++;};for(let i=0;i<5;i++)g.tap(g.openBuckets()[0].id);for(let i=0;i<150*15;i++)g.step();assert.equal(g.status,'lost');assert.equal(losses,1);assert.equal(g.tap(0),'over');});
test('clone evolves same game state',()=>{const g=new Game(LEVELS[0],42);g.tap(0);for(let i=0;i<350;i++)g.step();const clone=g.clone();for(let i=0;i<600;i++){g.step();clone.step();}assert.deepEqual(g.sand.cells,clone.sand.cells);assert.deepEqual(g.belt,clone.belt);assert.deepEqual(g.stats,clone.stats);});
writeFileSync('qa/results/targeted-results.json',JSON.stringify(checks,null,2));
