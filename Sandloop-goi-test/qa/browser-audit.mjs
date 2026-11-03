import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('qa/results'); await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try {res.setHeader('Content-Type','text/html');res.end(await fs.readFile('dist/index.html'));}catch(e){res.statusCode=500;res.end(String(e));}}).listen(5187,'127.0.0.1');
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(); const results=[]; const errors=[];
page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const log=async(name,fn)=>{try{const value=await fn();results.push({name,value});console.log(name,JSON.stringify(value));}catch(e){results.push({name,error:String(e)});console.log(name,String(e));}};
await page.setViewport({width:390,height:844,deviceScaleFactor:1});
try {
await page.goto('http://127.0.0.1:5187');await page.waitForFunction(()=>window.__app,{timeout:60000});
await page.screenshot({path:path.join(out,'title-mobile.png')});
await log('startup',()=>page.evaluate(()=>({mode:__app.mode,text:document.body.innerText,webgl:!!__app.stage.renderer.getContext()})));
await page.click('.title .btn');
await log('click-play',()=>page.evaluate(()=>({mode:__app.mode,level:__app.play.game.level.id})));
// Freeze rendering for reproducible simulation and flow tests; normal DOM input remains active.
await page.evaluate(()=>__app.stage.renderer.setAnimationLoop(null));
await log('all-level-viewport-and-hit',()=>page.evaluate(()=>{
const a=__app;const output=[];
for(let n=1;n<=10;n++){a.startLevel(n);a.play.update(0,0);a.stage.render(0,0);a.stage.scene.updateMatrixWorld(true);a.stage.camera.updateMatrixWorld(true);
output.push({level:n,buckets:[...a.play.actors.entries()].map(([id,actor])=>{const p=actor.root.position.clone().project(a.stage.camera);const x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;return {id,row:a.play.game.board.buckets[id].r,x,y,visible:y>=0&&y<innerHeight&&x>=0&&x<innerWidth,hit:a.play.pick(x,y)};})});}return output;}));
await page.screenshot({path:path.join(out,'level10-mobile.png')});
await log('mystery-color-assist',()=>page.evaluate(()=>{const a=__app;a.startLevel(10);a.play.colorAssist=true;a.play.update(0,0);return a.play.game.board.buckets.filter(b=>b.mystery&&!b.revealed).map(b=>({id:b.id,color:b.color,mode:a.play.actors.get(b.id).mode,badgeOpacity:a.play.actors.get(b.id).badge.material.opacity}));}));
await log('restart-attempt-counter',()=>page.evaluate(()=>{const a=__app;a.startLevel(1);a.play.game.tap(0);const before=structuredClone(a.save.record(1));a.startLevel(1);return {before,after:a.save.record(1),log:a.save.data.log};}));
await log('natural-level1-win',()=>page.evaluate(()=>{const a=__app;a.startLevel(1);const g=a.play.game;for(const b of [...g.openBuckets()])g.tap(b.id);for(let i=0;i<150*120&&g.status==='playing';i++)g.step();return {status:g.status,time:g.time,sand:g.sand.total,mode:a.mode,pending:a.pendingResult,save:a.save.data};}));
await log('reload-during-win-delay',async()=>{await page.reload();await page.waitForFunction(()=>window.__app);await page.evaluate(()=>__app.stage.renderer.setAnimationLoop(null));return page.evaluate(()=>({mode:__app.mode,current:__app.save.data.current,unlocked:__app.save.data.unlocked,coins:__app.save.data.coins,record:__app.save.record(1)}));});
await log('win-again-after-lost-unlock',()=>page.evaluate(()=>{const a=__app;a.startLevel(1);const g=a.play.game;for(const b of [...g.openBuckets()])g.tap(b.id);for(let i=0;i<150*120&&g.status==='playing';i++)g.step();a.showResult();return {unlocked:a.save.data.unlocked,coins:a.save.data.coins,record:a.save.record(1)};}));
await log('pause-on-win-overlay',()=>page.evaluate(()=>{const a=__app;a.setPaused(true);return {mode:a.mode,win:document.querySelector('.win').className,pause:document.querySelector('.pause').className};}));
await log('sound-off-reload',async()=>{await page.evaluate(()=>{__app.save.data.settings.sound=false;__app.save.data.settings.music=false;__app.save.commit();});await page.reload();await page.waitForFunction(()=>window.__app);await page.click('.title .btn');await page.evaluate(()=>__app.stage.renderer.setAnimationLoop(null));return page.evaluate(()=>({sound:__app.audio.sound,sfxGain:__app.audio.sfxBus.gain.value,pourGain:__app.audio.pourGain.gain.value}));});
await log('level1-pointer-real',async()=>{await page.evaluate(()=>{__app.startLevel(1);__app.play.update(0,0);__app.stage.render(0,0);});const p=await page.evaluate(()=>{const a=__app,p=a.play.actors.get(0).root.position.clone().project(a.stage.camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});await page.mouse.click(p.x,p.y);return page.evaluate(()=>({taps:__app.play.game.stats.taps,belt:__app.play.game.belt.length}));});
for(const [width,height] of [[360,640],[844,390],[1366,768]]){await page.setViewport({width,height,deviceScaleFactor:1});await page.evaluate(()=>{__app.startLevel(10);__app.play.update(0,0);__app.stage.render(0,0);});await page.screenshot({path:path.join(out,`level10-${width}x${height}.png`)});}
await log('restarts-memory',()=>page.evaluate(()=>{const a=__app;const before={...a.stage.renderer.info.memory};for(let i=0;i<20;i++){a.startLevel(1);a.play.update(0,0);a.stage.render(0,0);}return {before,after:a.stage.renderer.info.memory};}));
await log('finish-flow-hud',()=>page.evaluate(()=>{const a=__app;a.startLevel(10);a.finishLevel(true);a.showResult();a.next();a.stage.tick=()=>({dt:0.016,time:1});a.frame();return {mode:a.mode,hud:document.querySelector('.hud').className,finish:document.querySelector('.finish').className};}));
await log('corrupt-save',async()=>{await page.evaluate(()=>localStorage.setItem('sandloop.save.v1',JSON.stringify({version:1,current:0,levels:{},settings:{},log:[]})));await page.reload();await new Promise(r=>setTimeout(r,1000));return page.evaluate(()=>({app:!!window.__app,text:document.body.innerText}));});
} finally {await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify({results,errors},null,2));console.log('ERRORS',JSON.stringify(errors));await browser.close();server.close();}
