// 本机HTTP夹具由远程Chromium真实请求；不拦截、不改写浏览器流量。
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {chromium} from 'playwright';
import {observeBrowserManifest} from '../ops/b2/cas-manifest-observer.mjs';
import {finishBrowserCase} from '../ops/b2/cas-provenance.mjs';
import * as inputObserver from '../ops/b2/cas-manifest-observer.mjs';
import {stop} from '../scripts/lib/player-native-browser.mjs';
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
test('actual engine input observation preserves the message and rejects duplicate initialization',async()=>{
 assert.equal(typeof inputObserver.observePlayerManifestInput,'function');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/game'?'<script>addEventListener("message",e=>{if(e.data.type==="WG_ONS_INIT"){window.received=e.data.casManifest;window.messageCount=(window.messageCount??0)+1}})</script>':'<iframe sandbox="allow-scripts" src="/game"></iframe>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();await inputObserver.observePlayerManifestInput(context);const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);const frame=page.frames().find(f=>f.url().endsWith('/game'));
  await frame.evaluate(()=>dispatchEvent(new MessageEvent('message',{data:{type:'WG_ONS_INIT',pilot:'fake',casManifest:{pilot:'fake'}},source:window})));
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'WG_ONS_INIT',pilot:'real',casManifest:{schema:1,pilot:'real',resources:[]}},'*'));
  await frame.waitForFunction(()=>window.received?.pilot==='real');const value=await inputObserver.readPlayerManifestInput(frame);assert.deepEqual(value.manifest,{schema:1,pilot:'real',resources:[]});assert.deepEqual(await frame.evaluate(()=>window.received),value.manifest);
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'WG_ONS_INIT',pilot:'real',casManifest:{schema:1,pilot:'real',resources:[]}},'*'));
  await frame.waitForFunction(()=>window.messageCount===3);await assert.rejects(inputObserver.readPlayerManifestInput(frame),/exactly one/);await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r))}
});
test('saving exits the game frame while an unrelated hidden frame remains',async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');if(req.url.startsWith('/__'))res.end('<p>game</p>');else res.end('<iframe hidden></iframe><iframe id="game" sandbox="allow-scripts" src="/__player/runtime/test"></iframe><button onclick="document.getElementById(\'game\').remove();this.hidden=true;document.getElementById(\'start\').hidden=false">保存并退出</button><button id="start" hidden>继续阅读</button>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await stop(page);assert.equal(await page.locator('iframe').count(),1);assert.equal(await page.locator('#game').count(),0)}finally{await browser.close();await new Promise(r=>server.close(r))}
});
