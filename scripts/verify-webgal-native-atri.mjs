import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {webgalPlayers} from '../public/player/webgal-registry.mjs';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
import * as native from './lib/player-native-browser.mjs';
import {compareNativeCaption} from './lib/native-caption.mjs';
const origin=process.env.WG_QA_BASE_URL,out=process.env.WG_QA_RESULTS_ROOT;assert.equal(origin,'https://localhost-1.tailac9c6f.ts.net:19482');assert(out);
fs.mkdirSync(out,{recursive:true});const require=createRequire(import.meta.url),{PNG}=require(path.dirname(require.resolve('playwright-core/package.json'))+'/lib/utilsBundle.js');const entry=webgalPlayers.find(p=>p.workId==='v27448');
const opts=previewChromiumOptions(process.env.WG_QA_TLS_CERT);opts.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};opts.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');
const browser=await chromium.launch(opts),context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage();let frame;
const record={stage:'start',errors:[],console:[],requests:[],startedAt:new Date().toISOString()};page.on('pageerror',e=>record.errors.push(e.message));page.on('dialog',d=>d.accept());page.on('console',m=>{if(record.console.length<150)record.console.push(m.text().slice(0,400))});page.on('request',r=>{if(r.url().startsWith('https://wg-b2.saop.cc/'))record.requests.push(r.url())});
const pulse=setInterval(()=>console.log(JSON.stringify({stage:record.stage,requests:record.requests.length,errors:record.errors})),30000);pulse.unref();
// 原生启动会读取整个槽位列表；必须再比较实际剧情画面，不能只凭 FS.open 判定读档。
const titleReference=PNG.sync.read(fs.readFileSync(path.resolve(out,'../native-atri-v6/title.png')));
async function matchScene(reference,{pageImage=false,advance=false,checkpoint=false}={}){
 const deadline=Date.now()+240000;
 while(Date.now()<deadline){
  await idle();const canvas=frame.locator('canvas').first(),rect=await canvas.boundingBox(),current=PNG.sync.read(await canvas.screenshot());let sum=0,count=0;
  for(let y=.12;y<.82;y+=.035)for(let x=.08;x<.88;x+=.035){
   const a=(Math.floor(y*current.height)*current.width+Math.floor(x*current.width))*4;
   const rx=pageImage?Math.floor(rect.x+x*rect.width):Math.floor(x*reference.width),ry=pageImage?Math.floor(rect.y+y*rect.height):Math.floor(y*reference.height),b=(ry*reference.width+rx)*4;
   for(let c=0;c<3;c++){sum+=Math.abs(current.data[a+c]-reference.data[b+c]);count++}
  }
  record.sceneDifference=sum/count;
  if(checkpoint){record.captionMatch=compareNativeCaption(reference,current);if(record.captionMatch.score>.85)return;}
  else if(record.sceneDifference<14)return;
  if(advance)await tap(.5,.5,'left',1500);else await page.waitForTimeout(1500);
 }
 throw Error('Native scene did not match reference: '+record.sceneDifference);
}
async function visual(){const end=Date.now()+360000;while(Date.now()<end){await idle();const png=PNG.sync.read(await frame.locator('canvas').first().screenshot());let bright=0,total=0;for(let n=0;n<png.data.length;n+=16){total++;if(Math.max(...png.data.subarray(n,n+3))>60)bright++}if(bright/total>.2)return;await frame.locator('canvas').first().press('Space',{delay:150});await page.waitForTimeout(2000)}throw Error('Native scene unavailable')}
async function shot(name){await page.screenshot({path:out+'/'+name+'.png'});record.stage=name;fs.writeFileSync(out+'/progress.json',JSON.stringify(record,null,2));console.log(name)}
async function idle(){await page.waitForFunction(()=>{if(document.querySelector('[data-testid=reader-resource-loading][data-active]:not([data-active="0"])')){globalThis.__wvnQaQuietSince=0;return false}globalThis.__wvnQaQuietSince ||= Date.now();return Date.now()-globalThis.__wvnQaQuietSince>1500},null,{timeout:300000})}
async function tap(x,y,button='left',wait=5000){await idle();const box=await frame.locator('canvas').first().boundingBox();await page.mouse.click(box.x+box.width*x,box.y+box.height*y,{button,delay:200});await page.waitForTimeout(wait);await idle()}
async function start(){const started=native.playerStartedRequest(page,entry,480000);await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();await started;frame=native.frameOf(page);await frame.waitForFunction(()=>Module.calledRun,null,{timeout:180000});await idle();
 await frame.evaluate(()=>{const F=Module.FS??FS,open=F.open;globalThis.qaReads=[];globalThis.qaWrites=[];F.open=function(...args){const result=open.apply(this,args);if(/save\d+\.dat$/.test(result.path)){if((result.flags&3)!==0)qaWrites.push(result.path);else qaReads.push(result.path)}return result}});
}
try{
 await page.goto(origin+entry.route,{waitUntil:'domcontentloaded'});await start();await matchScene(titleReference,{pageImage:true,advance:true});await shot('title');
 await tap(.16,.555,'left',15000);await visual();await shot('first-run-manual');await tap(.5,.5,'left',8000);await shot('story');for(let i=0;i<16;i++){await tap(.5,.5,'left',1000);if(i===7)await shot('intro-advanced')}await shot('dialogue');
 const savedScene=PNG.sync.read(await frame.locator('canvas').first().screenshot({path:out+'/saved-scene.png'}));
 await tap(.5,.5,'right');await shot('native-menu');await tap(.85,.17);await shot('save-menu');await tap(.25,.24);await shot('saved');
 const files=await native.nativeFiles(page,entry);record.files=native.describe(files);record.writes=await frame.evaluate(()=>qaWrites);
 const save=files.find(f=>/^save\d+\.dat$/.test(f.path));assert(save&&record.writes.length,'Actual native menu must write a slot');record.slot=save.path;
 await native.stop(page);assert.deepEqual(native.describe((await native.localHead(page,entry.id)).snapshot.files),record.files);
 await page.reload({waitUntil:'domcontentloaded'});await start();const restored=await native.nativeFiles(page,entry);assert.deepEqual(restored.find(f=>f.path===save.path),save);await matchScene(titleReference,{pageImage:true,advance:true});await shot('restored-title');
 await tap(.16,.612);await shot('load-menu');await tap(.25,.24);await shot('load-confirm');await tap(.44,.51,'left',10000);await matchScene(savedScene,{checkpoint:true});await shot('native-slot-loaded');record.reads=await frame.evaluate(()=>qaReads);assert(record.reads.some(p=>p.endsWith('/'+save.path)),'Native load must read the saved slot');record.sceneRestored=true;
 await native.stop(page);assert.deepEqual((await native.localHead(page,entry.id)).snapshot.files.find(f=>f.path===save.path),save);assert.deepEqual(record.errors,[]);record.status='passed';
}catch(error){record.status='failed';record.error=error.message;process.exitCode=1;await shot('failed').catch(()=>{});}
finally{clearInterval(pulse);record.finishedAt=new Date().toISOString();fs.writeFileSync(out+'/result.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record));await context.close();await browser.close()}
