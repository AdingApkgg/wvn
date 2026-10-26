// 专用远程浏览器容器；仅操作独立预览的临时浏览器存储，不写生产账号。
import fs from 'node:fs';import assert from 'node:assert/strict';import {hostname} from 'node:os';import {chromium} from 'playwright';import {previewChromiumOptions} from './lib/preview-browser.mjs';import * as native from './lib/player-native-browser.mjs';
assert.equal(hostname(),'wvn-loading-qa');assert.equal(process.cwd(),'/work');
const origin='https://localhost:18601',run=process.env.WG_GAMEPLAY_RUN;assert(/^[a-z0-9-]+$/.test(run));const root='/qa/'+run;assert(!fs.existsSync(root));fs.mkdirSync(root,{mode:0o700});
const report={status:'running',checks:[]},write=()=>fs.writeFileSync(root+'/acceptance.json',JSON.stringify(report,null,2));
const opts=previewChromiumOptions('/qa/preview.crt');opts.args.push('--host-resolver-rules=MAP localhost 192.0.2.10','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--disk-cache-size=1048576','--disable-gpu-shader-disk-cache');opts.proxy={server:'http://127.0.0.1:20172',bypass:'localhost,127.0.0.1'};
let browser,context,page;
async function fresh(path,width=1280){browser=await chromium.launch(opts);context=await browser.newContext({viewport:{width,height:900}});page=await context.newPage();page.on('dialog',d=>d.accept());await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor();await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();await page.getByRole('button',{name:'游戏菜单',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(x=>x.textContent==='游戏菜单')?.disabled,{timeout:600000});await page.waitForTimeout(1500);const frame=native.frameOf(page)??page.frames().find(f=>f.url().includes('/__ons/runtime/'));assert(frame);assert.equal(await frame.evaluate(()=>self.origin),'null');return frame}
async function hold(frame,url,operation){
 const tag='wvn-gameplay-'+crypto.randomUUID(),gates=new Map(),seen=[];let release;
 const gate=new Promise(r=>release=r);gates.set(tag,release);await page.route('**/*'+tag+'*',async route=>{seen.push(route.request().url());await gate;if(operation==='failure')await route.abort('failed');else await route.continue()});
 const pending=frame.evaluate(({url,tag,operation})=>{
  const full=url+(url.includes('?')?'&':'?')+'qa='+tag;
  if(operation==='image')return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,anonymous:image.crossOrigin});image.onerror=()=>reject(Error('image failed'));image.src=full});
  if(operation==='ons')return fetch_file(g_onsyuri_module.FS,'/qa-resource-check',{ '/qa-resource-check':{url:full,loaded:false}}).then(result=>{const F=g_onsyuri_module.FS,bytes=result===1?F.stat('/qa-resource-check').size:0;if(result===1)F.unlink('/qa-resource-check');return {result,bytes}});
  return new Promise(resolve=>{const xhr=new XMLHttpRequest();xhr.open('GET',full);xhr.responseType='arraybuffer';xhr.onload=()=>resolve({status:xhr.status,bytes:xhr.response?.byteLength});xhr.onerror=()=>resolve({status:0});xhr.send()});
 },{url,tag,operation});pending.catch(()=>{});
 try{
  await page.getByTestId('reader-resource-loading').waitFor({timeout:30000});assert.equal(await page.getByTestId('reader-loading').count(),0);assert(await page.getByRole('button',{name:'保存并退出',exact:true}).isEnabled());assert(seen.length>0);
  assert.equal(await page.getByTestId('reader-resource-loading').evaluate(el=>getComputedStyle(el).pointerEvents),'none');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:root+'/'+operation+'-loading.jpg',type:'jpeg',quality:75});release();const value=await pending;
  if(operation==='failure'){await page.getByRole('alert').filter({hasText:'部分资源加载失败'}).waitFor();await page.getByTestId('reader-resource-loading').waitFor({state:'detached',timeout:15000});assert.equal(value.status,0)}else {await page.getByTestId('reader-resource-loading').waitFor({state:'detached',timeout:30000});if(operation==='ons')assert.equal(value.result,1);else if(operation==='image'){assert(value.width>0);assert.equal(value.anonymous,'anonymous')}else assert.equal(value.status,200)}
  return value;
 }finally{release();await page.unrouteAll({behavior:'ignoreErrors'})}
}
try{
 let frame=await fresh('/4/1/',390),reads=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/read'))reads++});
 const url=await frame.evaluate(()=>Object.values(g_onsyuri_filemap).find(x=>/\.(?:png|jpg|jpeg)(?:\?|$)/i.test(x.url))?.url);assert(url);let before;for(let attempt=0;attempt<30&&!before;attempt++){before=await native.localHead(page,'clannad');if(!before)await page.waitForTimeout(500)}assert(before);
 const value=await hold(frame,url,'ons');assert(value.bytes>0);await hold(frame,url,'failure');assert.equal(reads,0);await native.stop(page);const after=await native.localHead(page,'clannad');if(before)assert((after?.history??[]).some(x=>x.id===before.id)||after?.id===before.id);
 report.checks.push({name:'clannad-native-lazy-loader-and-failure-mobile',passed:true,bytes:value.bytes,historyPreserved:true,extraReadingEvents:reads,sandboxOpaque:true});write();await browser.close();
 frame=await fresh('/18636/1/');const image=await frame.evaluate(()=>[...document.images].find(x=>x.naturalWidth>100&&x.src.includes('/__player/resource/'))?.src??performance.getEntriesByType('resource').find(x=>/\.(?:png|jpe?g|webp)(?:\?|$)/i.test(x.name)&&x.name.includes('/__player/resource/'))?.name);assert(image);await hold(frame,image,'image');await native.stop(page);report.checks.push({name:'tyrano-image-preload-anonymous-and-native-save',passed:true});write();await browser.close();
 frame=await fresh('/27448/1/');const xhrUrl=origin+'/__player/resource/artemis-v27448-1/index.html';await hold(frame,xhrUrl,'xhr');await native.stop(page);report.checks.push({name:'artemis-in-game-xhr-and-native-save',passed:true});report.status='passed';
}catch(error){report.status='failed';report.error=error.message;report.stack=error.stack;await page?.screenshot({path:root+'/failure.jpg',type:'jpeg',quality:75}).catch(()=>{});process.exitCode=1}
finally{report.checkedAt=new Date().toISOString();write();console.log(JSON.stringify(report));await browser?.close()}
