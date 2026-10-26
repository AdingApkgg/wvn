// 仅在远程专用容器中验收预览；不用生产账号或私人云档。
import fs from 'node:fs';import assert from 'node:assert/strict';import {hostname} from 'node:os';import {chromium} from 'playwright';
import {previewChromiumOptions} from './lib/preview-browser.mjs';import * as native from './lib/player-native-browser.mjs';
import {loadNativeSlot,nativePoint,advanceNativeStory,saveNativeSlot,nativeDialogueChanged} from './lib/renpy-native-menu.mjs';
import {otherPlayers} from '../public/player/registry.mjs';
assert.equal(hostname(),'wvn-loading-qa');assert.equal(process.cwd(),'/work');
const origin='https://localhost:18601',release='renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf',run=process.env.WG_LOADING_RUN;assert(/^[a-z0-9-]+$/.test(run));const root='/qa/'+run;assert(!fs.existsSync(root));fs.mkdirSync(root,{mode:0o700});
const fixture=JSON.parse(fs.readFileSync('/qa/fixture/fixture.json')),report={status:'running',checks:[]};
const opts=previewChromiumOptions('/qa/preview.crt');opts.args.push('--host-resolver-rules=MAP localhost 192.0.2.10','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--disk-cache-size=1048576','--media-cache-size=1048576','--disable-gpu-shader-disk-cache');opts.proxy={server:'http://127.0.0.1:20172',bypass:'localhost,127.0.0.1'};
let browser,context,page;
const write=()=>fs.writeFileSync(root+'/acceptance.json',JSON.stringify(report,null,2));
async function fresh(width=1280){browser=await chromium.launch(opts);context=await browser.newContext({viewport:{width,height:900}});page=await context.newPage();page.on('dialog',d=>d.accept());context.setDefaultTimeout(30000)}
async function close(){await browser?.close();browser=null}
async function ready(path){await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#ons-backup-file')&&!document.querySelector('#ons-backup-file').disabled)}
async function head(){return page.evaluate(async({id,release})=>{const s=await(await import('/ons/storage.mjs')).openSaveStore('wvn-engine-releases-v1-'+release);try{const h=await s.get(id);return h?{id:h.id,revision:h.revision,digest:await(await import('/ons/protocol.mjs')).snapshotDigest(h.snapshot),history:(await s.history(id)).map(x=>x.id)}:null}finally{s.close()}},{id:fixture.id,release})}
async function heldLoading(){
 await fresh(390);await ready('/44184/3/?engine='+release);await page.getByRole('button',{name:'存档管理',exact:true}).click();await page.getByLabel('导入存档备份',{exact:true}).setInputFiles(fixture.candidateBackup);await page.getByRole('status').filter({hasText:'下次启动将从此存档读取'}).waitFor();const before=await head();assert(before);
 let releaseGate;const gate=new Promise(r=>releaseGate=r),requests=[];let pending=false;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/read'))requests.push(r.url())});
 await page.route(/\/game\.zip(?:\?|$)/,async route=>{pending=true;await gate;await route.continue().catch(()=>{})});
 try{
  await page.getByRole('button',{name:'继续阅读',exact:true}).click();await page.getByTestId('reader-loading').waitFor({timeout:process.argv.includes('--baseline')?3000:30000});
  await page.waitForFunction(()=>document.querySelector('[data-testid="reader-loading"]').dataset.stage!=='connecting');
  await page.waitForTimeout(1500);assert.equal(requests.length,0);assert(await page.getByRole('button',{name:'游戏菜单',exact:true}).isDisabled());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:root+'/loading-mobile.jpg',type:'jpeg',quality:75});await page.getByRole('button',{name:'取消加载',exact:true}).click();assert.equal(await page.locator('iframe').count(),0);assert.deepEqual(await head(),before);assert.equal(requests.length,0);
  report.checks.push({name:'visible-loading-cancel-preserves-snapshot-and-history',passed:true,readingsDuringLoad:requests.length,resourceWasHeld:pending});write();
 }finally{releaseGate();await page.unrouteAll({behavior:'ignoreErrors'});await close()}
}
async function failure(){
 await fresh();await ready('/44184/3/?engine='+release);await page.route(/\/renpy\.js(?:\?|$)/,route=>route.abort('failed'));
 await page.getByRole('button',{name:'开始阅读',exact:true}).click();await page.getByRole('alert').filter({hasText:'加载未完成'}).waitFor({timeout:120000});await page.getByRole('button',{name:'返回阅读准备',exact:true}).click();assert.equal(await page.locator('iframe').count(),0);
 report.checks.push({name:'resource-failure-has-retryable-feedback',passed:true});write();await close();
}
async function startup(id,path,newEngine=false){
 await fresh();await ready(path);const snapshots=[];await page.exposeFunction('recordLoading',value=>snapshots.push(value));
 await page.evaluate(()=>{new MutationObserver(()=>{const node=document.querySelector('[data-testid="reader-loading"]');if(node)window.recordLoading({stage:node.dataset.stage,percentage:node.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')??null})}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage','aria-valuenow']})});
 if(newEngine){await page.getByRole('button',{name:'存档管理',exact:true}).click();await page.getByLabel('导入存档备份',{exact:true}).setInputFiles(fixture.candidateBackup);await page.getByRole('status').filter({hasText:'下次启动将从此存档读取'}).waitFor()}
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:30,downloadThroughput:8*1024*1024,uploadThroughput:8*1024*1024});
 const entry=otherPlayers.find(p=>p.id===id),workId=entry?.workId??'v97',versionId=entry?.versionId;
 const started=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes('/api/public/works/'+workId+'/read'),{timeout:600000});started.catch(()=>{});
 await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();await page.getByTestId('reader-loading').waitFor();await started;await page.getByTestId('reader-loading').waitFor({state:'detached'});assert(await page.getByRole('button',{name:'游戏菜单',exact:true}).isEnabled());
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 const frame=native.frameOf(page)??page.frames().find(f=>f.url().includes('/__ons/runtime/'));assert(frame);assert.equal(await frame.evaluate(()=>self.origin),'null');
 if(newEngine){
  const command=s=>frame.evaluate(s=>Promise.race([renpy_exec(s),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native command timeout')),25000))]),s);
  await page.waitForTimeout(5000);await loadNativeSlot(page,frame,command,fixture.expectedText,id,fixture.slotA);const a=await nativePoint(command,id);await advanceNativeStory(page,frame,command);let b=await nativePoint(command,id);for(let i=0;i<15&&!nativeDialogueChanged(a,b);i++){await advanceNativeStory(page,frame,command);b=await nativePoint(command,id)}assert(nativeDialogueChanged(a,b));await saveNativeSlot(command,3,{page,frame,id});
 }
 await native.stop(page);assert.equal(await page.getByTestId('reader-loading').count(),0);assert(snapshots.some(p=>p.stage==='downloading'));assert(snapshots.every(p=>p.percentage===null||Number(p.percentage)>=0&&Number(p.percentage)<=100));
 report.checks.push({name:'real-startup-'+id+(newEngine?'-new':''),passed:true,versionId,stages:[...new Set(snapshots.map(s=>s.stage))],measuredPercentages:[...new Set(snapshots.map(s=>s.percentage).filter(p=>p!==null))].slice(0,20),nativeSaveLoad:newEngine,sandboxOpaque:true});write();await close();
}
try{
 await heldLoading();if(!process.argv.includes('--baseline')){
  await failure();await startup('saya','/97/1/');await startup('artemis-v27448-1','/27448/1/');await startup('tyrano-v18636-1','/18636/1/');await startup(fixture.id,'/44184/3/');await startup(fixture.id,'/44184/3/?engine='+release,true);
 }
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;report.stack=e.stack;await page?.screenshot({path:root+'/failure.jpg',type:'jpeg',quality:70}).catch(()=>{});process.exitCode=1}
finally{report.checkedAt=new Date().toISOString();write();console.log(JSON.stringify(report));await close()}
