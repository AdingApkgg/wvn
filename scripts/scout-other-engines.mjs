import {chromium} from 'playwright';
import fs from 'node:fs';
import {otherPlayers} from '../public/player/registry.mjs';
const origin=process.env.WG_PLAYER_URL??'https://localhost:18489';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
fs.mkdirSync('reports/engine-isolation',{recursive:true});
const requested=process.argv.slice(2),cases=requested.length?otherPlayers.filter(p=>requested.includes(p.id)):['Artemis','RenPy','Tyrano'].map(kind=>otherPlayers.find(p=>p.runtimeKind===kind));
try{for(const entry of cases){
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:960}}),page=await context.newPage(),events=[];
 page.on('console',msg=>{if(events.length<250)events.push({type:msg.type(),message:msg.text().slice(0,800)})});page.on('pageerror',e=>events.push({type:'pageerror',message:e.message}));page.on('requestfailed',req=>events.push({type:'requestfailed',url:req.url(),error:req.failure()?.errorText}));page.on('dialog',d=>d.accept());
 try{
 await page.goto(origin+entry.route,{waitUntil:'networkidle'});await page.getByRole('button',{name:'开始阅读',exact:true}).click();
 await page.waitForTimeout(30000);
 const frame=page.frames().find(f=>/\/__player\/resource\/[^/]+\/index\.html$/.test(f.url()));
 const state=await frame.evaluate(()=>({origin:self.origin,ready:document.readyState,body:document.body.innerText.slice(0,1000),canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),module:typeof Module,fs:typeof FS,mounts:typeof FS==='object'?FS.mounts?.map(m=>m.mountpoint):null,storage:Object.keys(localStorage)}));
 await page.screenshot({path:`reports/engine-isolation/${entry.id}.jpg`,type:'jpeg',quality:65});
 const result={id:entry.id,title:entry.title,state,status:await page.getByRole('status').allTextContents(),alerts:await page.getByRole('alert').allTextContents(),events};fs.writeFileSync(`reports/engine-isolation/${entry.id}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){console.log(JSON.stringify({id:entry.id,error:error.message,events}));fs.writeFileSync(`reports/engine-isolation/${entry.id}.json`,JSON.stringify({id:entry.id,error:error.message,events},null,2))}
 finally{await context.close()}
}}finally{await browser.close()}
