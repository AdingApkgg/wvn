// 真实远程浏览器；只使用本轮隔离预览和新建浏览器上下文，不读取用户存档。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {players} from '../../public/player/registry.mjs';
import {previewChromiumOptions} from '../../scripts/lib/preview-browser.mjs';
import {nativePoint,enterNativeStory,advanceNativeStory,isNativeBodyCheckpoint,nativeDialogueChanged,inspectNativeDialogue} from '../../scripts/lib/renpy-native-menu.mjs';
const run=process.env.WG_B2_BROWSER_RUN??'browser-v1';assert(/^[a-z0-9-]+$/.test(run));
const origin=process.env.WVN_VERIFY_ORIGIN??'https://localhost:18981',out=path.join(process.env.WVN_QA_OUTPUT_ROOT??'/qa',run);fs.mkdirSync(out,{recursive:true});
const doc=JSON.parse(fs.readFileSync(process.env.WVN_B2_RELEASE_FILE??'/run/wvn-b2/release.json'));const release=doc.release??doc,shared=release.id;
const gameFrameSelector='iframe[sandbox="allow-scripts"][src^="/__"]';
const requested=process.argv.slice(2);
const cases=[{id:'clannad',mobile:true},{id:'artemis-v27448-1'},{id:'tyrano-v49795-1'},{id:'renpy-v50789-1',shared:true}].filter(x=>!requested.length||requested.includes(x.id));
const opts=previewChromiumOptions(process.env.WVN_QA_CERT);opts.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');if(process.env.WVN_QA_PROXY)opts.proxy={server:process.env.WVN_QA_PROXY,bypass:'localhost,127.0.0.1'};
const require=createRequire(import.meta.url),{PNG}=require(path.dirname(require.resolve('playwright-core/package.json'))+'/lib/utilsBundle.js');
const browser=await chromium.launch(opts),results=[];
for(const test of cases){
 const entry=players.find(p=>p.id===test.id);assert(entry);const label=entry.id+(test.shared?'-shared':'-original'),context=await browser.newContext({viewport:test.mobile?{width:390,height:900}:{width:1280,height:960}}),page=await context.newPage();context.setDefaultTimeout(30000);const errors=[],errorDetails=[],network=[],sources=[],mainObjectResponses=[],finishedRequests=new Set(),logs=[];let frame,stage='navigate';const record={id:entry.id,label,kind:entry.runtimeKind??'ONS',shared:!!test.shared,startedAt:new Date().toISOString()};
 page.on('requestfinished',r=>finishedRequests.add(r));page.on('dialog',d=>d.accept());page.on('pageerror',e=>{errors.push(e.message);errorDetails.push({stage,stack:e.stack,at:new Date().toISOString()});});page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text().slice(0,400));});page.on('response',async r=>{if(/\/__(?:player|ons|engines)\//.test(r.url())){const parsed=new URL(r.url());if(parsed.origin===origin&&[200,206].includes(r.status())&&(/\/__engines\/resource\//.test(parsed.pathname)||/\/__ons\/(data|engine)\//.test(parsed.pathname)||/\/__player\/resource\//.test(parsed.pathname)&&!parsed.pathname.endsWith('/index.html')))mainObjectResponses.push({url:r.url(),status:r.status()});const h=await r.allHeaders().catch(()=>({}));if(h['x-wvn-resource-source']==='b2')sources.push({url:r.url(),key:h['x-wvn-b2-key']?decodeURIComponent(h['x-wvn-b2-key']):undefined,status:r.status(),bytes:h['content-length'],encoding:h['content-encoding'],method:r.request().method(),finishedAtHeaders:finishedRequests.has(r.request())});if(r.status()>=400)network.push({url:r.url(),status:r.status()});}});page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED'))network.push({url:r.url(),error:r.failure()?.errorText});});
 const pulse=setInterval(async()=>console.log(JSON.stringify({label,stage,resources:sources.length,lastSources:sources.slice(-3),ui:await page.locator('[data-testid=reader-loading]').innerText().catch(()=>''),cache:await page.getByRole('status').allTextContents().catch(()=>[]),at:new Date().toISOString()})),30000);pulse.unref();
 const command=async script=>{const r=await frame.evaluate(async s=>await Promise.race([renpy_exec(s).then(value=>({value})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),20000))]),script);assert(!r.timeout,'Native RenPy VM timed out');return r.value;};
 async function start(){
  const pending=page.waitForResponse(r=>r.status()===200&&r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/public/works/'+entry.workId+'/read',{timeout:480000});pending.catch(()=>{});
  await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();
  await page.waitForFunction(selector=>!!document.querySelector(selector),gameFrameSelector,{timeout:30000});
  const failed=page.waitForFunction(()=>document.querySelector('[data-testid=reader-loading][data-stage=failed]')?.textContent||false,null,{timeout:480000}).then(async value=>{throw Error('Player reported startup failure: '+await value.jsonValue());});failed.catch(()=>{});
  const r=await Promise.race([pending,failed]);assert.equal(r.status(),200);frame=page.frames().find(f=>/\/__(ons\/runtime|player\/resource)\//.test(f.url()));assert(frame,'Runtime frame missing');
  await frame.waitForFunction(kind=>kind==='ONS'?!!globalThis.g_onsyuri_module?.FS:kind==='Tyrano'?!!globalThis.TYRANO?.kag?.ftag?.array_tag?.length:!!globalThis.Module?.calledRun&&!!(Module.FS??globalThis.FS),entry.runtimeKind??'ONS',{timeout:90000});
 }
 async function stop(){await page.getByRole('button',{name:'保存并退出',exact:true}).click();await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor({timeout:45000});assert.equal(await page.locator(gameFrameSelector).count(),0);}
 try{
  assert.equal((await page.goto(origin+entry.route+(test.shared?'?engine='+shared:''),{waitUntil:'domcontentloaded'})).status(),200);
  await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor();
  record.driverHashes=await page.evaluate(async()=>{const result={};for(const name of ['runtime.mjs','emscripten.mjs','resource-location.mjs']){const response=await fetch('/player/'+name,{credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('Trusted driver unavailable');result[name]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}return result;});
  if(await page.getByLabel('主角名字',{exact:true}).count())await page.getByLabel('主角名字',{exact:true}).fill('预览验收');
  stage='cold-start';await start();await page.waitForTimeout(3500);
  record.resourceDelivery='browser-to-CDN';
  record.probes=await frame.evaluate(()=>{let parentDenied=false,storageDenied=false;try{void parent.document.body}catch{parentDenied=true;}try{indexedDB.open('b2-isolation-probe')}catch{storageDenied=true;}return {origin:self.origin,parentDenied,storageDenied,canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),aborted:!!globalThis.Module?.ABORT};});
  assert.equal(record.probes.origin,'null');assert(record.probes.parentDenied&&record.probes.storageDenied&&!record.probes.aborted);
  assert(sources.length>0,'No actual B2 resource responses');
  if(test.shared){
   record.engineArtifactSource=process.env.WVN_ENGINE_ARTIFACT_SOURCE??'b2';
   if(record.engineArtifactSource==='verified-local'){
    record.engineHeads=[];for(const file of release.files){const head=await page.request.head(origin+'/__engines/resource/'+shared+'/'+file.path);assert.equal(head.status(),200);assert.equal(head.headers().etag,'"'+file.sha256+'"');record.engineHeads.push({path:file.path,etag:head.headers().etag});}
   }else assert(sources.some(r=>r.key?.startsWith('engines/'+shared+'/')),'Shared engine must come from B2');
  }
  await page.screenshot({path:out+'/'+label+'-started.png'});
  if(entry.runtimeKind==='RenPy'){
   record.audioCompatibility=await frame.evaluate(()=>{const F=Module.FS??globalThis.FS;let source='';let sourceAvailable=true;try{source=F.readFile('/renpy/common/_audio.js',{encoding:'utf8'});}catch{sourceAvailable=false;}return {sourceAvailable,applied:source.includes('// WVN: video statistics are optional for file-backed queues.'),drawGuard:source.includes('q.draw_stats?.[1]'),fileGuard:source.includes('q.file_stats?.[1]')};});
   if(test.shared)assert(record.audioCompatibility.applied&&record.audioCompatibility.drawGuard&&record.audioCompatibility.fileGuard,'Shared runtime must apply the scoped in-memory compatibility edit');else assert.equal(record.audioCompatibility.applied,false,'Legacy engine must remain unchanged');
   stage='native-story';record.vmVersion=await command('result = str(renpy.version())');record.opening=await enterNativeStory(page,frame,command,entry.id);
   let a;const bodyDeadline=Date.now()+300000;record.bodyTrace=[];
   for(let n=0;Date.now()<bodyDeadline;n++){
    a=await nativePoint(command,entry.id);if(n%5===0)record.bodyTrace.push({at:new Date().toISOString(),point:a,dialogue:await inspectNativeDialogue(command)});
    if(isNativeBodyCheckpoint(a,entry.id))break;await advanceNativeStory(page,frame,command);
   }
   record.lastBodyPoint=a;assert(isNativeBodyCheckpoint(a,entry.id),'Native story text unavailable: '+JSON.stringify(a));record.storyBefore=a;
   let b;for(let n=0;n<15;n++){await advanceNativeStory(page,frame,command);b=await nativePoint(command,entry.id);if(nativeDialogueChanged(a,b))break;}
   assert(nativeDialogueChanged(a,b),'Actual story dialogue must advance');record.storyAfter=b;record.nativeStoryAdvanced=true;
  }else if(entry.runtimeKind==='Tyrano'){
   record.native=await frame.evaluate(()=>({scenario:TYRANO.kag.stat.current_scenario,index:TYRANO.kag.ftag.current_order_index,tags:TYRANO.kag.ftag.array_tag.length}));assert(record.native.tags>0);
   await frame.waitForFunction(()=>TYRANO.kag.stat.current_scenario==='title.ks',null,{timeout:180000});
   for(let n=0;n<3;n++){const b=await page.locator(gameFrameSelector).boundingBox();await page.mouse.click(b.x+b.width*.5,b.y+b.height*.6,{delay:150});await page.waitForTimeout(1500);}
   record.afterInput=await frame.evaluate(()=>({scenario:TYRANO.kag.stat.current_scenario,index:TYRANO.kag.ftag.current_order_index,text:document.body.innerText.slice(-1000)}));
  }else{
   const canvas=frame.locator('canvas').first();await canvas.press('Space',{delay:150});await page.waitForTimeout(1500);await canvas.press('Space',{delay:150});await page.waitForTimeout(1500);
   record.native=await frame.evaluate(()=>{const m=globalThis.g_onsyuri_module??globalThis.Module;return {fsReady:!!(m.FS??globalThis.FS),aborted:!!m.ABORT,canvasWidth:document.querySelector('canvas')?.width};});assert(record.native.fsReady&&!record.native.aborted&&record.native.canvasWidth>400);
   if(entry.runtimeKind==='Artemis'||!entry.runtimeKind){
    stage='actual-canvas';const deadline=Date.now()+300000;let visible=false;
    while(Date.now()<deadline){
     const shot=await canvas.screenshot({timeout:15000}),png=PNG.sync.read(shot),colors=new Set();let bright=0,total=0;
     for(let i=0;i<png.data.length;i+=16){const [r,g,b]=png.data.subarray(i,i+3);total++;if(Math.max(r,g,b)>60){bright++;colors.add((r>>4)*256+(g>>4)*16+(b>>4));}}
     record.visual={width:png.width,height:png.height,brightFraction:bright/total,colors:colors.size};
     if(png.width>=300&&record.visual.brightFraction>.2&&colors.size>=30){visible=true;break;}
     await page.waitForTimeout(3000);
    }
    assert(visible,'Actual game canvas did not become visible: '+JSON.stringify(record.visual));
   }

  }
  stage='screenshot';await page.screenshot({path:out+'/'+label+'-running.png'});record.screenshot=label+'-running.png';record.screenshotSHA256=createHash('sha256').update(fs.readFileSync(out+'/'+record.screenshot)).digest('hex');
  stage='exit-first';await stop();stage='warm-start';await start();await page.waitForTimeout(2500);stage='exit-second';await stop();record.reentryPassed=true;record.nonGameFramesAfterExit=await page.locator('iframe').count();
  assert.deepEqual(errors,[]);assert.deepEqual(mainObjectResponses,[],'Application server must not transmit object bodies');const realNetwork=network.filter(r=>!(r.status===404&&/favicon/.test(r.url)));assert.deepEqual(realNetwork,[]);
  record.status='passed';record.layoutNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
 }catch(e){record.status='failed';record.error=e.message;record.stack=e.stack;record.statusText=await page.getByRole('status').allTextContents().catch(()=>[]);await page.screenshot({path:out+'/'+label+'-failed.png',timeout:10000}).catch(()=>{});}
 finally{clearInterval(pulse);Object.assign(record,{stage,errors,errorDetails,network,sources,mainObjectResponses,console:logs.slice(-35),finishedAt:new Date().toISOString()});results.push(record);fs.writeFileSync(out+'/'+label+'.json',JSON.stringify(record,null,2));fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({label,status:record.status,stage,error:record.error,resources:sources.length,elapsedSeconds:Math.round((Date.now()-Date.parse(record.startedAt))/1000)}));await context.close();}
}
await browser.close();if(results.some(r=>r.status!=='passed'))process.exitCode=1;
