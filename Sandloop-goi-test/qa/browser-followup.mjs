import puppeteer from 'puppeteer-core';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage();const results=[];
async function test(name,fn){try{const value=await fn();results.push({name,value});console.log(name,JSON.stringify(value));}catch(e){results.push({name,error:String(e)});console.log(name,String(e));}}
const url=pathToFileURL(path.resolve('dist/index.html')).href;
try{
await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.goto(url);await page.waitForFunction(()=>window.__app,{timeout:60000});await page.click('.title .btn');await page.evaluate(()=>__app.stage.renderer.setAnimationLoop(null));
await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
for(const [width,height] of [[360,640],[844,390],[1366,768]]){
 await page.setViewport({width,height});await page.evaluate(()=>{const a=__app;a.stage.resize();a.startLevel(10);a.play.update(0,0);a.stage.render(0,0);});
 await page.screenshot({path:`qa/results/verified-level10-${width}x${height}.png`});
 await test(`layout-${width}x${height}`,()=>page.evaluate(()=>({pause:document.querySelector('.hud .round').getBoundingClientRect().toJSON(),lastRow:[...__app.play.actors.entries()].filter(([id])=>__app.play.game.board.buckets[id].r===5).map(([id,a])=>{const p=a.root.position.clone().project(__app.stage.camera);return{id,y:(1-p.y)*innerHeight/2};})})));
}
await page.setViewport({width:390,height:844});
await page.evaluate(()=>{const a=__app;a.stage.resize();a.play.colorAssist=true;a.startLevel(10);a.play.update(0,0);a.stage.render(0,0);});await page.screenshot({path:'qa/results/mystery-marks.png'});
await test('memory-same-level',()=>page.evaluate(()=>{const a=__app;a.startLevel(1);a.play.update(0,0);a.stage.render(0,0);const before={...a.stage.renderer.info.memory};for(let i=0;i<30;i++){a.startLevel(1);a.play.update(0,0);a.stage.render(0,0);}return{before,after:{...a.stage.renderer.info.memory}};}));
await test('pause-resume-levels',async()=>{await page.click('.hud .round');const paused=await page.evaluate(()=>({mode:__app.mode,t:__app.play.game.time}));await page.click('.pause .btn.blue:last-child');const levels=await page.evaluate(()=>({mode:__app.mode,locked:document.querySelectorAll('.lvcard.locked').length}));await page.click('.levels .x');const back=await page.evaluate(()=>__app.mode);await page.click('.pause .btn');return{paused,levels,back,resumed:await page.evaluate(()=>__app.mode)};});
await test('real-level1-play-win-next',async()=>{
 await page.evaluate(()=>{__app.startLevel(1);__app.play.update(0,0);__app.stage.render(0,0);});
 for(let id=0;id<5;id++){const p=await page.evaluate(id=>{const a=__app,p=a.play.actors.get(id).root.position.clone().project(a.stage.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},id);await page.mouse.click(p.x,p.y);}
 const won=await page.evaluate(()=>{const a=__app,g=a.play.game;for(let i=0;i<150*100&&g.status==='playing';i++)g.step();a.play.update(0,0);if(g.status!=='won')throw Error('Did not win: '+JSON.stringify({mode:a.mode,taps:g.stats.taps,status:g.status}));a.showResult();return{taps:g.stats.taps,status:g.status,coins:a.save.data.coins,unlocked:a.save.data.unlocked};});
 // Wait for the actual CSS button animation before clicking.
 await new Promise(r=>setTimeout(r,1800));await page.screenshot({path:'qa/results/win.png'});await page.click('.win .btn');return{won,next:await page.evaluate(()=>({mode:__app.mode,level:__app.play.game.level.id}))};
});
await test('natural-loss-and-after-loss-movement',()=>page.evaluate(()=>{const a=__app;a.startLevel(9);const g=a.play.game;for(let j=0;j<5;j++)g.tap(g.openBuckets()[0].id);for(let i=0;i<150*30&&g.status==='playing';i++)g.step();const before={status:g.status,t:g.time,sand:g.sand.total};for(let i=0;i<150*10;i++)g.step();a.showResult();return{before,after:{t:g.time,sand:g.sand.total},mode:a.mode,why:document.querySelector('.fail .why').innerText};}));
await test('pause-before-result-restart',()=>page.evaluate(()=>{const a=__app;a.startLevel(1);const g=a.play.game;for(const b of [...g.openBuckets()])g.tap(b.id);for(let i=0;i<150*100&&g.status==='playing';i++)g.step();a.setPaused(true);const paused={mode:a.mode,pending:a.pendingResult};a.startLevel(1);return{paused,pending:a.pendingResult,wins:a.save.record(1).wins,coins:a.save.data.coins,unlocked:a.save.data.unlocked};}));
await test('marks-not-applied-to-belt',()=>page.evaluate(()=>{const a=__app;a.startLevel(1);a.play.colorAssist=true;a.play.update(0,0);a.play.game.tap(0);a.play.colorAssist=false;a.play.update(0,0);return{board:a.play.actors.get(1).badge.material.opacity,belt:a.play.actors.get(0).badge.material.opacity};}));
await test('continue-after-final',()=>page.evaluate(()=>{const a=__app;a.save.data.finished=true;a.save.data.current=10;a.level=10;a.ui.showTitle(true,10,true);const label=document.querySelector('.title .btn').innerText;a.startFromTitle();return{label,level:a.play.game.level.id};}));
}finally{await fs.writeFile('qa/results/followup-results.json',JSON.stringify(results,null,2));await browser.close();}
