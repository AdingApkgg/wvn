// 本机HTTP夹具由远程Chromium真实请求；不拦截、不改写浏览器流量。
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {chromium} from 'playwright';
import {observeBrowserManifest} from '../ops/b2/cas-manifest-observer.mjs';
import {finishBrowserCase} from '../ops/b2/cas-provenance.mjs';
test('CDP observes the actual streamed body and preserves mismatch/limit/failure diagnostics',async()=>{
 const body=JSON.stringify({resources:['x'.repeat(3*1024**2)]});
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.end('<html></html>');return}res.setHeader('Content-Type','application/json');res.write(body.slice(0,100));setTimeout(()=>res.end(body.slice(100)),20)});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{for(const mode of ['success','mismatch','limit']){const context=await browser.newContext(),page=await context.newPage(),tasks=[],records=[];const session=await context.newCDPSession(page);
  await observeBrowserManifest({session,url:origin+'/manifest',tasks,limit:mode==='limit'?1024:32*1024**2,onManifest:actual=>{assert.equal(mode==='mismatch'?'bad':actual.resources[0].length,3*1024**2,'oracle mismatch');records.push(actual.resources.length)}});
  await page.goto(origin);for(let attempt=0;attempt<(mode==='success'?2:1);attempt++){const size=await page.evaluate(async()=>{const reader=(await fetch('/manifest')).body.getReader();let bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length}return bytes});assert.equal(size,Buffer.byteLength(body));}assert.equal(tasks.length,mode==='success'?2:1);
  let saved,closed=false;await finishBrowserCase({record:{status:'passed'},tasks,write:r=>saved=r,close:async()=>{closed=true;await context.close()}});assert(closed);
  if(mode==='success'){assert.equal(saved.status,'passed');assert.deepEqual(records,[1,1])}else{assert.equal(saved.status,'failed');assert.match(saved.responseErrors.join(' '),mode==='limit'?/limit/:/oracle mismatch/)}
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
});
