// 仅在本任务远程预览和新浏览器上下文验收，不读取用户历史存档。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {webgalPlayers} from '../public/player/webgal-registry.mjs';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
import * as native from './lib/player-native-browser.mjs';
const origin=process.env.WG_QA_BASE_URL,root=process.env.WG_QA_RESULTS_ROOT;
assert.equal(origin,'https://localhost-1.tailac9c6f.ts.net:19482');assert(root&&process.env.WG_QA_TLS_CERT);
fs.mkdirSync(root,{recursive:true});
const opts=previewChromiumOptions(process.env.WG_QA_TLS_CERT);
opts.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};
opts.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');
const require=createRequire(import.meta.url),{PNG}=require(path.dirname(require.resolve('playwright-core/package.json'))+'/lib/utilsBundle.js');
const requested=process.argv.slice(2),cases=webgalPlayers.filter(p=>!requested.length||requested.includes(p.id));assert(cases.length&&requested.every(id=>cases.some(p=>p.id===id)));
const browser=await chromium.launch(opts),results=[];
async function run(entry){
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 await context.addInitScript(()=>{globalThis.qaShaderErrors=[];const proto=globalThis.WebGLRenderingContext?.prototype;if(!proto)return;const compile=proto.compileShader;proto.compileShader=function(shader){const result=compile.call(this,shader);if(!this.getShaderParameter(shader,this.COMPILE_STATUS))qaShaderErrors.push(this.getShaderInfoLog(shader));return result;};});
 const page=await context.newPage();let frame,stage='metadata',expected=new Set(),stopping=false;
 const record={id:entry.id,route:entry.route,title:entry.title,startedAt:new Date().toISOString(),errors:[],network:[],console:[],invalid:[],mainBodies:[],failed:[]};
 const pulse=setInterval(()=>console.log(JSON.stringify({id:entry.id,stage,requests:record.network.length,at:new Date().toISOString()})),30000);pulse.unref();
 page.on('pageerror',e=>{record.errors.push(e.message);fs.writeFileSync(root+'/'+entry.id+'-error.json',JSON.stringify({message:e.message,stack:e.stack},null,2))});page.on('console',m=>{if(record.console.length<180)record.console.push(m.text().slice(0,500))});page.on('dialog',d=>d.accept());
 page.on('request',r=>{const u=new URL(r.url());if(u.host==='wg-b2.saop.cc'){record.network.push({url:r.url(),range:r.headers().range??null});if(!/^\/[a-f0-9]{64}\.bin$/.test(u.pathname)||u.search||!expected.has(r.url()))record.invalid.push(r.url());}});
 page.on('requestfailed',r=>{if(!stopping)record.failed.push({url:r.url(),failure:r.failure()?.errorText})});
 page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&/^\/__(?:player\/resource|ons\/(?:data|engine)|engines\/resource)\//.test(u.pathname)&&!u.pathname.endsWith('/index.html'))record.mainBodies.push({url:r.url(),status:r.status()})});
 async function start(){
  const started=native.playerStartedRequest(page,entry,480000),failed=page.waitForSelector('[data-testid=reader-loading][data-stage=failed]',{timeout:480000}).then(async e=>{throw Error('Startup failed: '+await e.innerText())});failed.catch(()=>{});
  await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();await Promise.race([started,failed]);frame=native.frameOf(page);assert(frame);
  await frame.waitForFunction(()=>globalThis.Module?.calledRun&&!Module.ABORT,null,{timeout:180000});
 }
 async function visual(){
  const deadline=Date.now()+600000;
  while(Date.now()<deadline){
   const png=PNG.sync.read(await frame.locator('canvas').first().screenshot({timeout:20000}));let total=0,bright=0;const colors=new Set();
   for(let i=0;i<png.data.length;i+=16){const[r,g,b]=png.data.subarray(i,i+3);total++;if(Math.max(r,g,b)>60){bright++;colors.add((r>>4)*256+(g>>4)*16+(b>>4))}}
   record.visual={width:png.width,height:png.height,bright:bright/total,colors:colors.size};if(png.width>400&&bright/total>.12&&colors.size>25)return;
   const transferring=await page.locator('[data-testid=reader-resource-loading][data-active]:not([data-active="0"])').count();
   if(!transferring)await frame.locator('canvas').first().press('Space',{delay:100});await page.waitForTimeout(3000);
  }throw Error('Game canvas remained blank');
 }
 try{
  const response=await page.request.get(origin+'/api/player/'+entry.id+'/resources',{timeout:180000});assert.equal(response.status(),200);const manifest=await response.json();assert.equal(manifest.versionId,entry.versionId);assert(manifest.resources.length>1000);
  expected=new Set([...manifest.resources,...manifest.engineResources.files].map(r=>r.url));record.resourceCount=manifest.resources.length;
  for(const row of [...manifest.resources,...manifest.engineResources.files])assert.equal(row.url,'https://wg-b2.saop.cc/'+row.sha256+'.bin');
  await page.goto(origin+entry.route,{waitUntil:'domcontentloaded',timeout:60000});
  const oldId='artemis-v27448-1';await page.evaluate(async id=>{const s=await(await import('/ons/storage.mjs')).openSaveStore();try{await s.commit(id,0,{schema:1,pilot:id,files:[{path:'qa-preserve.dat',data:new Uint8Array([20,26,10,29]),mtime:1793232000000}]},'file-import')}finally{s.close()}},oldId);
  const old=native.describe((await native.localHead(page,oldId)).snapshot.files);
  stage='start';await start();record.native=await frame.evaluate(mount=>{const F=Module.FS??FS;return {origin:self.origin,aborted:!!Module.ABORT,mountPoint:F.lookupPath(mount).node.mount.mountpoint,files:F.readdir(mount),storageKeys:Object.keys(localStorage)}},entry.mount);
  assert.equal(record.native.origin,'null');assert(record.native.mountPoint===entry.mount);stage='render';await visual();
  await page.screenshot({path:root+'/'+entry.id+'-running.png'});
  const needsFx=['artemis-v37021-1','artemis-v39197-1','artemis-v562-3','artemis-v1115-2','artemis-v20431-2'].includes(entry.id);
  if(needsFx)await frame.waitForFunction(()=>globalThis.__wvnShaderCompatibility?.translated>0,null,{timeout:30000});
  await page.waitForTimeout(500);record.graphics=await frame.evaluate(()=>({errors:globalThis.qaShaderErrors??[],compatibility:globalThis.__wvnShaderCompatibility??null}));assert.deepEqual(record.graphics.errors,[]);
  if(needsFx)assert(record.graphics.compatibility?.translated>0,'Registered FX compatibility must execute');
  stage='save-channel';record.beforeSave=native.describe(await native.nativeFiles(page,entry));
  await frame.evaluate(async mount=>{const F=Module.FS??FS;F.writeFile(mount+'/wvn-qa-retention.dat',new Uint8Array([87,86,78,1]));await new Promise((resolve,reject)=>F.syncfs(false,e=>e?reject(e):resolve()));},entry.mount);
  const expectedFiles=native.describe(await native.nativeFiles(page,entry));assert(expectedFiles.some(f=>f.path==='wvn-qa-retention.dat'));
  stage='exit';stopping=true;await native.stop(page);assert.deepEqual(native.describe((await native.localHead(page,entry.id)).snapshot.files),expectedFiles);
  assert.deepEqual(native.describe((await native.localHead(page,oldId)).snapshot.files),old);record.originalPilotPreserved=true;
  stage='reopen';stopping=false;await page.reload({waitUntil:'domcontentloaded'});await start();const restored=native.describe(await native.nativeFiles(page,entry));
  const marker=expectedFiles.find(f=>f.path==='wvn-qa-retention.dat');assert.deepEqual(restored.find(f=>f.path===marker.path),marker);record.adapterPersistencePassed=true;
  record.restored=restored;stopping=true;await native.stop(page);
  assert.deepEqual(record.invalid,[]);assert.deepEqual(record.mainBodies,[]);assert.deepEqual(record.errors,[]);assert(record.network.length>3);const packageUrl='https://wg-b2.saop.cc/'+entry.packageFiles['artemis.data']+'.bin',packageRequests=record.network.filter(r=>r.url===packageUrl);assert(packageRequests.length&&packageRequests.every(r=>r.range),'Native preload must reuse the verified package without a second full download');record.packageReuse={requests:packageRequests.length,unranged:0};record.status='passed';
 }catch(error){record.status='failed';record.error=error.message;record.statusText=await page.getByRole('status').allTextContents().catch(()=>[]);if(frame)record.frameState=await frame.evaluate(()=>({body:document.body.innerText.slice(0,800),calledRun:!!globalThis.Module?.calledRun,aborted:!!globalThis.Module?.ABORT})).catch(()=>null);await page.screenshot({path:root+'/'+entry.id+'-failed.png',timeout:10000}).catch(()=>{});}
 finally{clearInterval(pulse);record.stage=stage;record.finishedAt=new Date().toISOString();results.push(record);fs.writeFileSync(root+'/'+entry.id+'.json',JSON.stringify(record,null,2));fs.writeFileSync(root+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({id:entry.id,status:record.status,stage,error:record.error,requests:record.network.length}));await context.close();}
}
try{let next=0;await Promise.all(Array.from({length:Math.min(2,cases.length)},async()=>{while(next<cases.length)await run(cases[next++])}));}finally{await browser.close()}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
