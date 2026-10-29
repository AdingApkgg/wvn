// 真实远程浏览器；只使用本轮隔离预览和新建浏览器上下文，不读取用户存档。
import fs from 'node:fs';
import {observePlayerManifestInput,readPlayerManifestInput} from './cas-manifest-observer.mjs';
import {validateBrowserManifest,validateBrowserResourceURL,finishBrowserCase} from './cas-provenance.mjs';
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
assert(!process.env.WVN_B2_CANARY_PREFIX,'CAS acceptance forbids request rewriting');
assert(process.env.WVN_CAS_EXPECTED_MANIFESTS,'Independent PG manifest oracle is required');
const expectedManifests=JSON.parse(fs.readFileSync(process.env.WVN_CAS_EXPECTED_MANIFESTS));
const cdnHost='wg-b2.saop.cc';
const isResourcePath=p=>/^\/(?:__player\/resource|__ons\/(?:data|engine)|__engines\/resource|releases)\//.test(p);
const gameFrameSelector='iframe[sandbox="allow-scripts"][src^="/__"]';
const isMainBodyRequest=request=>{const u=new URL(request.url());if(u.origin!==origin)return false;if(isResourcePath(u.pathname))return !(request.resourceType()==='document'&&u.pathname.endsWith('/index.html'));let frame;try{frame=request.frame()}catch{return false}return /\/__(?:ons\/runtime|player\/resource)\//.test(frame?.url()??'')&&request.resourceType()!=='document'&&!/^\/(?:player|ons)\/[^/]+\.(?:mjs|js)$/.test(u.pathname);};
const requested=process.argv.slice(2);
const cases=[{id:'ons-v1194-1',mobile:true},{id:'clannad',mobile:true},{id:'artemis-v27448-1'},{id:'tyrano-v49795-1'},{id:'renpy-v50789-1',shared:true}].filter(x=>!requested.length||requested.includes(x.id));
assert(cases.length>0&&requested.every(id=>cases.some(test=>test.id===id)),'Requested browser case is not registered');
const opts=previewChromiumOptions(process.env.WVN_QA_CERT);opts.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');if(process.env.WVN_QA_PROXY)opts.proxy={server:process.env.WVN_QA_PROXY,bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};
const require=createRequire(import.meta.url),{PNG}=require(path.dirname(require.resolve('playwright-core/package.json'))+'/lib/utilsBundle.js');
const browser=await chromium.launch(opts),results=[];
try{for(const test of cases){
 const entry=players.find(p=>p.id===test.id);assert(entry);const label=entry.id+(test.shared?'-shared':'-original'),context=await browser.newContext({viewport:test.mobile?{width:390,height:900}:{width:1280,height:960}}),page=await context.newPage();context.setDefaultTimeout(30000);const errors=[],errorDetails=[],network=[],sources=[],mainObjectResponses=[],finishedRequests=new Set(),logs=[],responseTasks=[],unexpectedRequests=[];let allowedURLs=new Map(),frame,stage='navigate',starts=0;const record={id:entry.id,label,kind:entry.runtimeKind??'ONS',shared:!!test.shared,deliveryMode:'cas-browser-direct',startedAt:new Date().toISOString()};
 page.on('request',request=>{const u=new URL(request.url());if(u.hostname===cdnHost){try{validateBrowserResourceURL(request.url(),allowedURLs)}catch(e){unexpectedRequests.push({url:request.url(),error:e.message})}}else if(isMainBodyRequest(request)){unexpectedRequests.push({url:request.url(),error:'Main-site object request'});}});
 page.on('requestfinished',r=>finishedRequests.add(r));page.on('dialog',d=>d.accept());page.on('pageerror',e=>{errors.push(e.message);errorDetails.push({stage,stack:e.stack,at:new Date().toISOString()});});page.on('console',m=>{if(m.text().startsWith('WVN CSS compatibility '))(record.cssCompatibility??=[]).push(m.text().slice(22));if(['error','warning'].includes(m.type()))logs.push(m.text().slice(0,400));});
 page.on('response',r=>{const task=(async()=>{const parsed=new URL(r.url());
  if([200,206].includes(r.status())&&isMainBodyRequest(r.request()))mainObjectResponses.push({url:r.url(),status:r.status()});
  if(parsed.hostname!==cdnHost)return;
  const h=await r.allHeaders().catch(()=>({}));let metadata;
  try{metadata=validateBrowserResourceURL(r.url(),allowedURLs)}catch(e){unexpectedRequests.push({url:r.url(),error:e.message});return;}
  sources.push({url:r.url(),sha256:metadata.sha256,key:metadata.key,path:metadata.path,expectedBytes:metadata.bytes,expectedContentType:metadata.contentType,status:r.status(),bytes:h['content-length'],contentType:h['content-type'],contentRange:h['content-range'],encoding:h['content-encoding'],method:r.request().method(),finishedAtHeaders:finishedRequests.has(r.request())});
  if(r.status()>=400)network.push({url:r.url(),status:r.status()});
 })();task.catch(error=>unexpectedRequests.push({url:r.url(),error:error.message}));responseTasks.push(task);});
 page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED'))network.push({url:r.url(),error:r.failure()?.errorText});});
 async function assertProvenance(){await Promise.all(responseTasks);assert.equal(record.browserManifests.length,starts,'Every browser start must consume an independently verified manifest');assert(sources.length>0,'No real CDN responses');assert.deepEqual(unexpectedRequests,[],'All body requests must be literal known root hashes');for(const source of sources){validateBrowserResourceURL(source.url,allowedURLs);assert([200,206,304].includes(source.status),'CDN object response failed');if(source.status!==304){assert(source.contentType,'Missing object MIME');assert.equal(source.contentType.split(';')[0].trim().toLowerCase(),source.expectedContentType.split(';')[0].trim().toLowerCase(),'Actual MIME differs from independent metadata');}if(source.status===206){assert.match(source.contentRange??'',new RegExp('^bytes [0-9]+-[0-9]+/'+source.expectedBytes+'$'),'Range total differs from independent metadata');}}}
 const pulse=setInterval(async()=>console.log(JSON.stringify({label,stage,resources:sources.length,lastSources:sources.slice(-3),ui:await page.locator('[data-testid=reader-loading]').innerText().catch(()=>''),cache:await page.getByRole('status').allTextContents().catch(()=>[]),at:new Date().toISOString()})),30000);pulse.unref();
 const command=async script=>{const r=await frame.evaluate(async s=>await Promise.race([renpy_exec(s).then(value=>({value})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),20000))]),script);assert(!r.timeout,'Native RenPy VM timed out');return r.value;};
 async function start(){
  starts++;
  const pending=page.waitForResponse(r=>r.status()===200&&r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/public/works/'+entry.workId+'/read',{timeout:480000});pending.catch(()=>{});
  await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();
  await page.waitForFunction(selector=>!!document.querySelector(selector),gameFrameSelector,{timeout:30000});
  const failed=page.waitForFunction(()=>document.querySelector('[data-testid=reader-loading][data-stage=failed]')?.textContent||false,null,{timeout:480000}).then(async value=>{throw Error('Player reported startup failure: '+await value.jsonValue());});failed.catch(()=>{});
  const r=await Promise.race([pending,failed]);assert.equal(r.status(),200);frame=page.frames().find(f=>/\/__(ons\/runtime|player\/resource)\//.test(f.url()));assert(frame,'Runtime frame missing');
  await frame.waitForFunction(kind=>kind==='ONS'?!!globalThis.g_onsyuri_module?.FS:kind==='Tyrano'?!!globalThis.TYRANO?.kag?.ftag?.array_tag?.length:!!globalThis.Module?.calledRun&&!!(Module.FS??globalThis.FS),entry.runtimeKind??'ONS',{timeout:90000});
  const observed=await readPlayerManifestInput(frame);validateBrowserManifest(expectedManifests[entry.id],observed.manifest);record.browserManifests.push({...observed.evidence,pilot:observed.manifest.pilot,resources:observed.manifest.resources.length});
 }
 async function stop(){await page.getByRole('button',{name:'保存并退出',exact:true}).click();await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor({timeout:45000});assert.equal(await page.locator(gameFrameSelector).count(),0);}
 try{
  record.browserManifests=[];
  await observePlayerManifestInput(context);
  assert.equal((await page.goto(origin+entry.route+(test.shared?'?engine='+shared:''),{waitUntil:'domcontentloaded'})).status(),200);
  await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor();
  record.driverHashes=await page.evaluate(async()=>{const result={};for(const name of ['runtime.mjs','emscripten.mjs','resource-location.mjs','cas-resources.mjs','cas-dom.mjs']){const response=await fetch('/player/'+name,{credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('Trusted driver unavailable');result[name]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}return result;});
  if(await page.getByLabel('主角名字',{exact:true}).count())await page.getByLabel('主角名字',{exact:true}).fill('预览验收');
  const manifestResponse=await page.request.get(origin+'/api/player/'+entry.id+'/resources'+(test.shared?'?engine='+encodeURIComponent(shared):''));assert.equal(manifestResponse.status(),200);
  const manifest=await manifestResponse.json();assert(expectedManifests[entry.id],'Missing independently exported manifest');allowedURLs=validateBrowserManifest(expectedManifests[entry.id],manifest);record.manifestIdentity={pilot:manifest.pilot,versionId:manifest.versionId,inventorySha256:manifest.inventorySha256,resources:manifest.resources.length,engine:manifest.engineResources.id};
  stage='cold-start';await start();await page.waitForTimeout(3500);
  record.resourceDelivery='browser-to-CDN';
  record.probes=await frame.evaluate(()=>{let parentDenied=false,storageDenied=false;try{void parent.document.body}catch{parentDenied=true;}try{indexedDB.open('b2-isolation-probe')}catch{storageDenied=true;}return {origin:self.origin,parentDenied,storageDenied,canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),aborted:!!globalThis.Module?.ABORT};});
  assert.equal(record.probes.origin,'null');assert(record.probes.parentDenied&&record.probes.storageDenied&&!record.probes.aborted);
  await assertProvenance();
  if(test.shared)assert(manifest.engineResources.files.some(file=>sources.some(source=>source.url===file.url)),'Selected shared engine must use its registered root hash URLs');
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
  await assertProvenance();assert.deepEqual(errors,[]);assert.deepEqual(mainObjectResponses,[],'Application server must not transmit object bodies');const realNetwork=network.filter(r=>!(r.status===404&&/favicon/.test(r.url)));assert.deepEqual(realNetwork,[]);
  record.status='passed';record.layoutNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
 }catch(e){record.status='failed';record.error=e.message;record.stack=e.stack;record.statusText=await page.getByRole('status').allTextContents().catch(()=>[]);await page.screenshot({path:out+'/'+label+'-failed.png',timeout:10000}).catch(()=>{});}
 finally{clearInterval(pulse);Object.assign(record,{unexpectedRequests,stage,errors,errorDetails,network,sources,mainObjectResponses,console:logs.slice(-35),finishedAt:new Date().toISOString()});await finishBrowserCase({record,tasks:responseTasks,write(record){results.push(record);fs.writeFileSync(out+'/'+label+'.json',JSON.stringify(record,null,2));fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({label,status:record.status,stage,error:record.error,resources:sources.length,elapsedSeconds:Math.round((Date.now()-Date.parse(record.startedAt))/1000)}));},close:()=>context.close()});}
}
}finally{await browser.close()}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
