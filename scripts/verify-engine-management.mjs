import fs from'node:fs';import assert from'node:assert/strict';import{chromium}from'playwright';
import{players}from'../public/player/registry.mjs';import{previewChromiumOptions}from'./lib/preview-browser.mjs';
const origin=process.env.WG_ENGINE_TEST_ORIGIN??'https://localhost:18551',directory=process.env.WG_ENGINE_REPORT??'reports/emscripten/startup';fs.mkdirSync(directory,{recursive:true});
const requested=process.argv.slice(2),targets=requested.length?players.filter(p=>requested.includes(p.id)):players.filter(p=>p.runtimeKind!=='Tyrano');
assert.equal(requested.length?targets.length:68,requested.length||68);
const options=previewChromiumOptions('preview.crt');options.args.push('--host-resolver-rules=MAP localhost 192.0.2.10','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');options.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1'};
const browser=await chromium.launch(options),results=[];
try{for(const entry of targets){
 const context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage(),errors=[],startedAt=new Date().toISOString();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());let record={id:entry.id,kind:entry.runtimeKind??'ONS',startedAt};
 try{
  const response=await page.goto(origin+entry.route,{waitUntil:'domcontentloaded',timeout:45000});assert.equal(response.status(),200);await page.waitForFunction(()=>window.__reactRouterDataRouter?.state.initialized);
  if(await page.getByLabel('主角名字',{exact:true}).count())await page.getByLabel('主角名字',{exact:true}).fill('预览验收');
  await page.getByRole('button',{name:'开始阅读',exact:true}).click();
  const deadline=Date.now()+15000;let frame;while(!(frame=page.frames().find(f=>/\/__(ons\/runtime|player\/resource)\//.test(f.url())))){assert(Date.now()<deadline,'Runtime frame missing');await page.waitForTimeout(100);}
  const timeout=['renpy-v562-2','renpy-v3144-1'].includes(entry.id)?1800000:180000;
  await frame.waitForFunction(kind=>kind==='ONS'?globalThis.g_onsyuri_module?.FS&&document.querySelector('canvas')?.width>400:kind==='Tyrano'?window.TYRANO?.kag?.ftag?.current_order_index>=0:window.Module?.calledRun===true&&document.querySelector('canvas')?.width>400,entry.runtimeKind??'ONS',{timeout});
  const probes=await frame.evaluate(async()=>{let parentDenied=false,storageDenied=false;try{void parent.document.body}catch{parentDenied=true;}try{indexedDB.open('wvn-private-probe')}catch{storageDenied=true;}let privateAPI;try{privateAPI=(await fetch('/api/me',{credentials:'include'})).status}catch{privateAPI='blocked';}return {origin:self.origin,parentDenied,storageDenied,privateAPI};});
  assert.equal(probes.origin,'null');assert(probes.parentDenied&&probes.storageDenied);assert(['blocked',403].includes(probes.privateAPI));
  assert.deepEqual(errors,[]);await page.getByRole('button',{name:'保存并退出',exact:true}).click();await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor({timeout:40000});
  const head=await page.evaluate(async id=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{const h=await s.get(id);return h?{revision:h.revision,files:h.snapshot.files.length,history:(await s.history(id)).length}:null;}finally{s.close();}},entry.id);
  assert(head,'Snapshot did not receive durable acknowledgement');record={...record,status:'passed',probes,head,errors};
 }catch(error){record={...record,status:'failed',error:error.message,errors,statusText:await page.getByRole('status').allTextContents().catch(()=>[])};await page.screenshot({path:directory+'/'+entry.id+'-failure.png'}).catch(()=>{});}
 finally{record.finishedAt=new Date().toISOString();results.push(record);fs.writeFileSync(directory+'/'+entry.id+'.json',JSON.stringify(record,null,2));fs.writeFileSync(directory+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({id:entry.id,status:record.status,error:record.error,elapsedSeconds:Math.round((Date.now()-Date.parse(startedAt))/1000)}));await context.close();}
}}finally{await browser.close();}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
