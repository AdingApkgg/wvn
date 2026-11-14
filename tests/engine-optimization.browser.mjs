// 专用构建机上的真实Chromium API夹具；不使用游戏、账号或生产资源。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const worker=`
import {openChunkStore,isVerifiedPublicFile} from '/public/cache/store.mjs';
import {downloadObject} from '/public/cache/download.mjs';
onmessage=async()=>{let store;try{
 const size=32*1024**2+1,data=new Uint8Array(size);data.fill(37);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const row={sha256:hash,bytes:size,contentType:'application/octet-stream',url:'https://wvn-s3-zi0.saop.cc/'+hash+'.bin'};
 store=await openChunkStore();for(let at=0;at<size;at+=1024**2)await store.append(row,at,data.subarray(at,Math.min(size,at+1024**2)));await store.complete(row);
 const original=Blob.prototype.slice;let fullSlices=0;Blob.prototype.slice=function(...args){if(this.size===size)fullSlices++;return original.apply(this,args)};
 let blob;try{blob=await downloadObject(row,{store:store.scoped(undefined),fetcher:async()=>{throw Error('cache must satisfy read')}})}finally{Blob.prototype.slice=original}
 const proof=isVerifiedPublicFile(blob,row);await store.close();store=null;postMessage({ok:true,bytes:blob.size,proof,fullSlices});
}catch(error){await store?.close();postMessage({ok:false,error:error.stack})}};
`;
async function fixture(t){
 const root=new URL('../',import.meta.url),server=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>engine optimization fixture</title>');return}if(req.url==='/worker.mjs'){res.setHeader('content-type','text/javascript');res.end(worker);return}const path=decodeURIComponent(req.url.split('?')[0]);if(!/^\/public\/[a-z0-9/_.-]+$/.test(path)||path.includes('..')){res.writeHead(404).end();return}res.setHeader('content-type','text/javascript');res.end(await readFile(new URL('.'+path,root)))}catch{res.writeHead(404).end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext();return {context,origin:'http://127.0.0.1:'+server.address().port};
}
test('real browser locks protect active views and reclaim a closed page session',{timeout:30000},async t=>{
 const {context,origin}=await fixture(t),first=await context.newPage(),second=await context.newPage();await first.goto(origin);await second.goto(origin);
 const start=async page=>page.evaluate(async()=>{const {openPublicViewSession}=await import('/public/cache/store.mjs');const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('fixture-views',{create:true});window.viewsRoot=root;window.viewSession=await openPublicViewSession(root,navigator.locks);return window.viewSession.id});
 const firstId=await start(first);await start(second);assert(await second.evaluate(async id=>{for await(const name of viewsRoot.keys())if(name===id)return true;return false},firstId));
 await first.close();await second.waitForFunction(async id=>!(await navigator.locks.query()).held.some(lock=>lock.name==='wvn-public-view/'+id),firstId);await second.evaluate(()=>viewSession.close());await start(second);
 assert.equal(await second.evaluate(async id=>{for await(const name of viewsRoot.keys())if(name===id)return true;return false},firstId),false);await second.evaluate(()=>viewSession.close());
});
test('real Worker materializes a verified OPFS large object without a second full scan',{timeout:120000},async t=>{
 const {context,origin}=await fixture(t),page=await context.newPage();await page.goto(origin);
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{const worker=new Worker('/worker.mjs',{type:'module'});worker.onmessage=({data})=>{worker.terminate();resolve(data)};worker.onerror=event=>{worker.terminate();reject(Error(event.message))};worker.postMessage('run')}));
 assert.equal(result.ok,true,result.error);assert.equal(result.bytes,32*1024**2+1);assert.equal(result.proof,true);assert.equal(result.fullSlices,1);
});
test('real WebCrypto preserves snapshot digest and independent input bytes',{timeout:30000},async t=>{
 const {context,origin}=await fixture(t),page=await context.newPage();await page.goto(origin);
 assert.deepEqual(await page.evaluate(async()=>{const {snapshotDigest,validateSnapshot}=await import('/public/ons/protocol.mjs');const snapshot={schema:1,pilot:'clannad',files:[{path:'a.save',data:new Uint8Array([1,2])},{path:'b.save',data:new Uint8Array([3,4])}]};const copied=validateSnapshot(snapshot,snapshot.pilot),expected=await snapshotDigest(snapshot),pending=snapshotDigest(snapshot);snapshot.files[1].data.fill(9);return {same:await pending===expected,isolated:copied.files[1].data[0]===3}}),{same:true,isolated:true});
});
