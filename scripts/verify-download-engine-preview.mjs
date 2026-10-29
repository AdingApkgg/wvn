// 下载适配器的跨引擎回归；每款游戏均使用独立、空白浏览器档案。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {players} from '../public/player/registry.mjs';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
const origin=process.env.WG_QA_BASE_URL,root=process.env.WG_QA_RESULTS_ROOT;
assert.equal(origin,'https://localhost-1.tailac9c6f.ts.net:19481');assert(root);
const options=previewChromiumOptions(process.env.WG_QA_TLS_CERT);options.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};options.args.push('--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required');
const browser=await chromium.launch(options),results=[];fs.mkdirSync(root,{recursive:true});
for(const id of ['clannad','tyrano-v49795-1','renpy-v50789-1']){
 const entry=players.find(p=>p.id===id),context=await browser.newContext(),page=await context.newPage(),record={id,errors:[],objectHosts:[],mainObjectBodies:[]};
 page.on('dialog',d=>d.accept());page.on('pageerror',error=>record.errors.push(error.message));
 page.on('response',response=>{const url=new URL(response.url());if(url.hostname==='wg-b2.saop.cc')record.objectHosts.push(url.hostname);if(url.origin===origin&&response.status()===200&&/\/__(?:player\/resource|ons\/(?:data|engine)|engines\/resource)\//.test(url.pathname)&&!url.pathname.endsWith('/index.html'))record.mainObjectBodies.push(url.pathname)});
 const pulse=setInterval(async()=>console.log(JSON.stringify({id,loading:await page.getByTestId('reader-loading').innerText({timeout:1000}).catch(()=>''),at:new Date().toISOString()})),30000);pulse.unref();
 try{
  await page.goto(origin+entry.route,{waitUntil:'domcontentloaded'});if(await page.getByLabel('主角名字',{exact:true}).count())await page.getByLabel('主角名字',{exact:true}).fill('预览验收');
  await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).click();
  const state=await page.waitForFunction(()=>{if(document.querySelector('[data-testid=reader-loading][data-stage=failed]'))return 'failed';return [...document.querySelectorAll('button')].some(b=>b.textContent==='游戏菜单'&&!b.disabled)?'started':false},null,{timeout:600000});assert.equal(await state.jsonValue(),'started');
  const frame=page.frames().find(f=>/\/__(?:ons\/runtime|player\/resource)\//.test(f.url()));assert(frame);
  record.isolation=await frame.evaluate(()=>{let parentDenied=false,idbDenied=false;try{void parent.document.body}catch{parentDenied=true}try{indexedDB.open('isolated-qa-check')}catch{idbDenied=true}return {origin:self.origin,parentDenied,idbDenied}});assert.deepEqual(record.isolation,{origin:'null',parentDenied:true,idbDenied:true});
  await page.waitForTimeout(3000);await page.screenshot({path:root+'/'+id+'.jpg',type:'jpeg',quality:65});
  await page.getByRole('button',{name:'保存并退出',exact:true}).click();await page.getByRole('button',{name:/^(开始阅读|继续阅读)$/}).waitFor({timeout:35000});
  record.durable=await page.evaluate(async id=>{const store=await(await import('/ons/storage.mjs')).openSaveStore();try{const head=await store.get(id);return {exists:!!head,files:head?.snapshot.files.length,revision:head?.revision}}finally{store.close()}},id);assert(record.durable.exists);assert(record.objectHosts.length>0);assert.deepEqual(record.mainObjectBodies,[]);assert.deepEqual(record.errors,[]);record.status='passed';
 }catch(error){record.status='failed';record.error=error.message;await page.screenshot({path:root+'/'+id+'-failed.jpg',type:'jpeg',quality:65}).catch(()=>{});process.exitCode=1}
 finally{clearInterval(pulse);results.push(record);fs.writeFileSync(root+'/engine-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(record));await context.close()}
}
await browser.close();
