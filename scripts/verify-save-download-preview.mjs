// 仅在独立预览、全新浏览器档案中使用合成原生存档；不连接生产账号。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import path from 'node:path';
import {players} from '../public/player/registry.mjs';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
import * as native from './lib/player-native-browser.mjs';

const origin=process.env.WG_QA_BASE_URL,root=process.env.WG_QA_RESULTS_ROOT;
assert.equal(origin,'https://localhost-1.tailac9c6f.ts.net:19481','Only the isolated preview is allowed');
assert(root&&process.env.WG_ATRI_FIXTURE&&process.env.WG_QA_TLS_CERT);
const entry=players.find(p=>p.id==='artemis-v27448-1'),initial=JSON.parse(fs.readFileSync(process.env.WG_ATRI_FIXTURE));
fs.mkdirSync(root,{recursive:true});
const require=createRequire(import.meta.url),{PNG}=require(path.dirname(require.resolve('playwright-core/package.json'))+'/lib/utilsBundle.js');
const options=previewChromiumOptions(process.env.WG_QA_TLS_CERT);
options.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};
options.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');
const browser=await chromium.launch(options),context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage();
let frame;const record={stage:'seed',startedAt:new Date().toISOString(),network:[],errors:[]};
page.on('dialog',d=>d.accept());page.on('pageerror',e=>record.errors.push(e.message));
page.on('request',r=>{if(r.url().startsWith('https://wg-b2.saop.cc/'))record.network.push({url:r.url(),range:r.headers().range??null})});
record.transfers=[];page.on('requestfinished',r=>{if(r.url().startsWith('https://wg-b2.saop.cc/')){const timing=r.timing();record.transfers.push({url:r.url(),ttfbMs:timing.responseStart-timing.requestStart,totalMs:timing.responseEnd-timing.requestStart})}});
await context.addInitScript(()=>{
 const original=fetch;globalThis.qaFault={injected:false,resumes:0};
 globalThis.fetch=async function(input,options){
  const url=new URL(typeof input==='string'?input:input.url,document.baseURI),headers=new Headers(options?.headers??input?.headers);
  const response=await original.call(this,input,options);
  if(url.origin!=='https://wg-b2.saop.cc'||!url.pathname.endsWith('/artemis-v27448-1/root.pfs'))return response;
  if(headers.has('range')){qaFault.resumes++;return response}
  if(qaFault.injected)return response;qaFault.injected=true;const reader=response.body.getReader();let sent=0;
  return new Response(new ReadableStream({async pull(c){if(sent>=1024**2){void reader.cancel();c.error(new TypeError('QA injected connection reset'));return}const part=await reader.read();if(part.done)c.close();else{sent+=part.value.byteLength;c.enqueue(part.value)}},cancel(){return reader.cancel()}}),{status:response.status,headers:response.headers});
 };
});
const pulse=setInterval(async()=>console.log(JSON.stringify({stage:record.stage,loading:await page.locator('[data-testid=reader-loading]').innerText({timeout:1000}).catch(()=>''),lastResources:record.network.slice(-2),at:new Date().toISOString()})),30000);pulse.unref();
async function idle(){await page.waitForFunction(()=>!document.querySelector('[data-testid=reader-resource-loading][data-active]:not([data-active="0"])'),null,{timeout:300000})}
async function visible(){const deadline=Date.now()+360000;while(Date.now()<deadline){await idle();const png=PNG.sync.read(await frame.locator('canvas').first().screenshot());let bright=0,total=0;for(let i=0;i<png.data.length;i+=16){total++;if(Math.max(...png.data.subarray(i,i+3))>60)bright++}if(bright/total>.7){await page.waitForTimeout(5000);await idle();return}await page.waitForTimeout(2500)}throw Error('Native scene did not render')}
async function tap(x,y,button='left',delay=2000){await idle();const b=await frame.locator('canvas').first().boundingBox();await page.mouse.move(b.x+b.width*x,b.y+b.height*y);await page.waitForTimeout(200);await page.mouse.click(b.x+b.width*x,b.y+b.height*y,{button,delay:200});await page.waitForTimeout(delay);await idle()}
async function start(){
 const started=native.playerStartedRequest(page,entry,600000),at=Date.now();
 const failed=page.waitForSelector('[data-testid=reader-loading][data-stage=failed]',{timeout:600000}).then(async element=>{throw Error('Player startup failed: '+await element.innerText())});failed.catch(()=>{});
 await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();await Promise.race([started,failed]);
 frame=native.frameOf(page);await frame.waitForFunction(()=>!!globalThis.Module?.calledRun,null,{timeout:90000});record.startupMs??=Date.now()-at;
 await frame.evaluate(()=>{
  const F=Module.FS??FS,open=F.open;globalThis.qaReads=[];globalThis.qaWrites=[];
  F.open=function(...args){const result=open.apply(this,args);if(/\/save\d+\.(?:dat|png)$/.test(result.path)){if(args[1]===32768)qaReads.push({path:result.path,request:args[0]});if(result.flags===32833)qaWrites.push(result.path)}return result};
 });
 await visible();await page.waitForTimeout(12000);await tap(.5,.5,'left',2500);await tap(.5,.5,'left',3000);await page.waitForTimeout(30000);await visible();
}
try{
 await page.goto(origin+entry.route,{waitUntil:'domcontentloaded'});
 await page.evaluate(async({id,files})=>{const store=await(await import('/ons/storage.mjs')).openSaveStore();try{if(await store.get(id))throw Error('Fresh QA profile required');await store.commit(id,0,{schema:1,pilot:id,files:files.map(f=>({...f,data:new Uint8Array(f.data)}))},'file-import')}finally{store.close()}},{id:entry.id,files:initial});
 await page.reload({waitUntil:'domcontentloaded'});record.stage='start-with-interrupted-B2-package';await start();
 record.fault=await frame.evaluate(()=>qaFault);assert(record.fault.injected&&record.fault.resumes>=1,'Actual B2 Range resume must recover injected interruption');
 record.stage='load-old-native-slot';await tap(.16,.612);await tap(.25,.24);await tap(.44,.51,'left',10000);
 await frame.waitForFunction(()=>qaReads.some(row=>row.request==='save0001.dat'),null,{timeout:30000});await visible();
 await page.screenshot({path:root+'/loaded-original.jpg',type:'jpeg',quality:65});
 record.stage='native-save';await tap(.5,.5,'right');await tap(.85,.17);await tap(.25,.54,'left',3000);
 await frame.waitForFunction(()=>qaWrites.some(p=>/save\d+\.dat$/.test(p)),null,{timeout:15000});
 const writes=await frame.evaluate(()=>qaWrites),savedPath=writes.filter(p=>p.endsWith('.dat')).at(-1).split('/').at(-1);record.actualNativeSave=savedPath;
 const files=await native.nativeFiles(page,entry);assert(files.some(f=>f.path===savedPath));
 for(const old of initial.filter(f=>f.path.startsWith('save0001.')))assert.deepEqual(files.find(f=>f.path===old.path),old);
 record.oldSlotBytesAndMtimePreserved=true;record.files=native.describe(files);record.binaryCache=await frame.evaluate(()=>globalThis.readAsync?.stats?.());assert(record.binaryCache?.hits>0,'Repeated native resources must reuse isolated bytes');await page.screenshot({path:root+'/saved-menu.jpg',type:'jpeg',quality:65});
 record.stage='persist-and-reload';await native.stop(page);assert.deepEqual(native.describe((await native.localHead(page,entry.id)).snapshot.files),record.files);
 await page.reload({waitUntil:'domcontentloaded'});assert.deepEqual(native.describe((await native.localHead(page,entry.id)).snapshot.files),record.files);record.durableExact=true;
 record.stage='reopen-native-new-slot';await start();
 const restored=await native.nativeFiles(page,entry);for(const saved of files.filter(f=>/^save\d+\.(?:dat|png)$/.test(f.path)))assert.deepEqual(restored.find(f=>f.path===saved.path),saved);
 await tap(.16,.612);await tap(.25,.54);await tap(.44,.51,'left',10000);await visible();
 record.reopenedReads=await frame.evaluate(()=>qaReads);assert(record.reopenedReads.some(row=>row.request===savedPath));record.nativeNewSlotRead=true;
 await page.screenshot({path:root+'/reopened-new-slot.jpg',type:'jpeg',quality:65});await native.stop(page);
 assert.deepEqual(record.errors,[]);record.status='passed';
}catch(error){record.status='failed';record.error=error.message;process.exitCode=1;await page.screenshot({path:root+'/failed.jpg',type:'jpeg',quality:60}).catch(()=>{})}
finally{clearInterval(pulse);record.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/result.json',JSON.stringify(record,null,2));console.log(JSON.stringify({status:record.status,stage:record.stage,error:record.error,actualNativeSave:record.actualNativeSave,fault:record.fault}));await context.close();await browser.close()}
