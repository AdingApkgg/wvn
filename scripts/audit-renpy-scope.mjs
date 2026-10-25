import fs from'node:fs';import{chromium}from'playwright';import{otherPlayers}from'../public/player/registry.mjs';
const out='reports/renpy-scopes.json',results=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):[];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
try{for(const p of otherPlayers.filter(p=>p.runtimeKind==='RenPy')){
 if(results.some(r=>r.id===p.id&&(r.directory||r.extraMount)))continue;
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:960}}),page=await context.newPage();
 try{await page.goto('https://localhost:18489'+p.route,{waitUntil:'networkidle'});await page.getByRole('button',{name:'开始阅读',exact:true}).click();
 let frame;for(let n=0;n<100;n++){frame=page.frames().find(f=>f.url().includes('/__player/runtime/')||/\/__player\/resource\/[^/]+\/index\.html$/.test(f.url()));if(frame)break;await page.waitForTimeout(100)}
 await frame.waitForFunction(()=>typeof renpy_get==='function'&&Module.calledRun,{timeout:120000});
 const data=await Promise.race([frame.evaluate(()=>renpy_exec('result = {"savedir": config.savedir, "directory": config.save_directory}')),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native config timeout')),90000))]);
 if(p.id==='renpy-v10597-1'&&data.directory===null&&data.savedir==='//game/saves'){data.extraMount='/game/saves'}
 else if(typeof data.directory!=='string'||!/^[^./\\][^/\\]*$/.test(data.directory)||data.savedir!=='/home/web_user/.renpy/'+data.directory)throw Error('Unexpected save scope '+JSON.stringify(data));
 results.push({id:p.id,versionId:p.versionId,...data});console.log(JSON.stringify({id:p.id,...data}));
 }catch(error){results.push({id:p.id,error:error.message});console.log(JSON.stringify({id:p.id,error:error.message}))}
 finally{fs.writeFileSync(out,JSON.stringify(results,null,2));await context.close()}
}}finally{await browser.close()}
