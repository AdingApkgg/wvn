// 隔离浏览器验证原生 XHR 事件；模拟响应只属于本脚本的 __qa__ 路由。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {previewChromiumOptions} from './lib/preview-browser.mjs';
const origin=process.env.WG_QA_BASE_URL,root=process.env.WG_QA_RESULTS_ROOT;
assert.equal(origin,'https://localhost-1.tailac9c6f.ts.net:19481');assert(root);
const options=previewChromiumOptions(process.env.WG_QA_TLS_CERT);options.proxy={server:'http://127.0.0.1:11090',bypass:'localhost,127.0.0.1,localhost-1.tailac9c6f.ts.net,100.116.74.36'};
const browser=await chromium.launch(options),context=await browser.newContext(),page=await context.newPage(),counts={};
await context.route('https://wg-b2.saop.cc/__qa__/**',async route=>{
 const kind=new URL(route.request().url()).pathname.split('/').at(-1);counts[kind]=(counts[kind]??0)+1;
 if(kind==='abort'||kind==='idle'&&counts[kind]===1){await new Promise(r=>setTimeout(r,500));}
 try{await route.fulfill({status:kind==='exhaust'||kind==='temporary'&&counts[kind]===1?503:200,headers:{'access-control-allow-origin':'*','content-type':'application/octet-stream'},body:Buffer.from([7,8,9])})}catch{/* 已取消的隔离请求不重放。 */}
});
const report={};
try{
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 for(const kind of ['temporary','idle','exhaust','abort']){
  report[kind]=await page.evaluate(async({kind,origin})=>{
   if(!globalThis.qaXHRInstalled){const {installResilientXHR}=await import(origin+'/player/resource-download.mjs');installResilientXHR(window,value=>String(value).startsWith('https://wg-b2.saop.cc/__qa__/'),{idleMs:100,retries:2});globalThis.qaXHRInstalled=true;}
   return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),events=[];const timer=setTimeout(()=>reject(Error('XHR test timed out')),6000);
    xhr.open('GET','https://wg-b2.saop.cc/__qa__/'+kind,true);xhr.responseType='arraybuffer';
    for(const name of ['load','error','abort','timeout','loadend'])xhr.addEventListener(name,()=>{events.push(name);if(name==='loadend'){clearTimeout(timer);resolve({events,status:xhr.status,bytes:xhr.response?Array.from(new Uint8Array(xhr.response)):[]})}});
    xhr.send();if(kind==='abort')setTimeout(()=>xhr.abort(),20);
   });
  },{kind,origin});
 }
 assert.equal(report.temporary.status,200);assert.deepEqual(report.temporary.events,['load','loadend']);assert.equal(counts.temporary,2);
 assert.equal(report.idle.status,200);assert.deepEqual(report.idle.events,['load','loadend']);assert.equal(counts.idle,2);
 assert.equal(report.exhaust.status,503);assert.equal(counts.exhaust,3);assert.deepEqual(report.exhaust.events,['load','loadend']);
 assert.deepEqual(report.abort.events,['abort','loadend']);assert.equal(counts.abort,1);
 report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1}
finally{report.counts=counts;fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/xhr-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await context.close();await browser.close()}
