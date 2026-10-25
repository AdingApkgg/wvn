import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {otherPlayers} from '../public/player/registry.mjs';
const origin=process.env.WG_PLAYER_URL??'https://localhost:18489';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
const directory='reports/other-startup';fs.mkdirSync(directory,{recursive:true});
const requested=process.argv.slice(2);const cases=requested.length?otherPlayers.filter(p=>requested.includes(p.id)):otherPlayers;
const results=[];
try{for(const entry of cases){
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:960}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('dialog',d=>d.accept());const record={id:entry.id,title:entry.title,kind:entry.runtimeKind,errors,startedAt:new Date().toISOString()};
 try{
 await page.goto(origin+entry.route,{waitUntil:'networkidle'});await page.getByRole('button',{name:'开始阅读',exact:true}).click();
 const frame=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing runtime frame')),15000);const check=()=>{const f=page.frames().find(f=>/\/__player\/resource\/[^/]+\/index\.html$/.test(f.url()));if(f){clearTimeout(timer);resolve(f)}else setTimeout(check,100)};check()});
 await frame.waitForFunction(kind=>kind==='Tyrano'?window.TYRANO?.kag?.config?.projectID&&window.TYRANO?.kag?.stat?.current_scenario&&window.TYRANO?.kag?.ftag?.current_order_index>=0:window.Module?.calledRun===true&&document.querySelector('canvas')?.width>400,entry.runtimeKind,{timeout:['renpy-v562-2','renpy-v3144-1'].includes(entry.id)?1800000:180000});
 // Some Tyrano packages wait for a real first gesture before loading audio,
 // before any title-menu event-setting elements exist.
 if(entry.runtimeKind==='Tyrano')await frame.locator('body').click({position:{x:300,y:250},force:true});
 await page.waitForTimeout(2000);
 record.state=await frame.evaluate(()=>({origin:self.origin,canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),storage:Object.keys(localStorage),scenario:window.TYRANO?.kag?.stat?.current_scenario}));assert.equal(record.state.origin,'null');
 const probes=await frame.evaluate(async()=>{let parentDenied=false,idbDenied=false;try{void parent.document.body}catch{parentDenied=true}try{indexedDB.open('wg-isolation-probe')}catch{idbDenied=true}let privateAPI;try{const r=await fetch('/api/me');privateAPI=r.status}catch{privateAPI='denied'}return {parentDenied,idbDenied,privateAPI}});
 assert.equal(probes.parentDenied,true);assert.equal(probes.idbDenied,true);assert.ok(probes.privateAPI==='denied'||probes.privateAPI===403);record.probes=probes;
 assert.equal(errors.length,0,'uncaught runtime exception: '+errors.join('; '));
 await page.getByRole('button',{name:'结束阅读并保留存档',exact:true}).click();await page.getByRole('button',{name:'开始阅读',exact:true}).waitFor({timeout:35000});
 record.head=await page.evaluate(async id=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{const h=await s.get(id);return h?{revision:h.revision,files:h.snapshot.files.map(f=>({path:f.path,bytes:f.data.length,mtime:f.mtime})),digest:h.digest}:null}finally{s.close()}},entry.id);
 assert.ok(record.head);record.status='passed';
 }catch(error){record.status='failed';record.error=error.message;record.statusText=await page.getByRole('status').allTextContents().catch(()=>[]);record.alerts=await page.getByRole('alert').allTextContents().catch(()=>[])}
 finally{record.finishedAt=new Date().toISOString();results.push(record);fs.writeFileSync(`${directory}/${entry.id}.json`,JSON.stringify(record,null,2));fs.writeFileSync(`${directory}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({id:entry.id,status:record.status,error:record.error,files:record.head?.files?.length}));await context.close()}
}}finally{await browser.close()}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
