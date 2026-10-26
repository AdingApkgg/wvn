import {test} from 'node:test';import assert from 'node:assert/strict';
const api=await import('../public/ons/resource-cache.mjs').catch(()=>({}));
const required=name=>{assert.equal(typeof api[name],'function',name);return api[name]};
const pilot={id:'clannad',versionId:'legacy-test',engine:'a'.repeat(64)},origin='https://localhost';
const manifest=(files=['nscript.dat','scene/1.png','scene/2.png'])=>({pilot:pilot.id,versionId:pilot.versionId,engine:pilot.engine,files:files.map((path,i)=>({path,url:'/__ons/data/clannad/'+path.split('/').map(encodeURIComponent).join('/'),lazyload:i!==0}))});
class MemoryStore{
 rows=new Map();fail=false;async get(key){return structuredClone(this.rows.get(key)??null)}async list(){return [...this.rows.values()].map(({data,...meta})=>structuredClone(meta))}async put(row){if(this.fail)throw Error('quota');this.rows.set(row.key,structuredClone(row))}async remove(keys){for(const key of keys)this.rows.delete(key)}async touch(key,time){const row=this.rows.get(key);if(row)row.accessedAt=time}close(){}
}
async function fixture(options={}){
 const plan=await required('createOnsResourcePlan')(pilot,manifest(),origin),store=options.store??new MemoryStore(),calls=[];
 const fetcher=async(url,init)=>{calls.push({url,...init});return new Response(init.method==='HEAD'?null:new Uint8Array([1,2,3,4]),{headers:{'content-length':'4'}})};
 const cache=required('createOnsResourceSession')({plan,store,fetcher,...options});return {plan,store,calls,cache,fetcher};
}
test('manifest-bound plans reject private, cross-game, traversal and executable resources',async()=>{
 const create=required('createOnsResourcePlan'),plan=await create(pilot,manifest(),origin);assert(plan.resources.has('game:nscript.dat'));assert(plan.resources.has('engine:wasm'));
 for(const doc of [{...manifest(),pilot:'saya'},{...manifest(),versionId:'other'},{...manifest(),engine:'b'.repeat(64)},{...manifest(),files:[{path:'../secret',url:'/api/me'}]},{...manifest(),files:[{path:'x.png',url:'/__ons/data/saya/x.png'}]},{...manifest(),files:[{path:'x.js',url:'/__ons/data/clannad/x.js'}]}])await assert.rejects(create(pilot,doc,origin));
 const f=await fixture();await assert.rejects(f.cache.load('https://elsewhere/'));await assert.rejects(f.cache.load('game:../private'));assert.equal(f.calls.length,0);f.cache.close();
});
test('a second session reuses durable bytes, omits credentials and never changes the original data',async()=>{
 const f=await fixture();assert.deepEqual((await f.cache.load('game:nscript.dat')).data,new Uint8Array([1,2,3,4]));const count=f.calls.length;assert.equal(count,2);for(const request of f.calls){assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error')}f.cache.close();
 const next=api.createOnsResourceSession({plan:f.plan,store:f.store,fetcher:f.fetcher});const result=await next.load('game:nscript.dat');assert.equal(result.source,'cache');assert.deepEqual(result.data,new Uint8Array([1,2,3,4]));assert.equal(f.calls.length,count);result.data[0]=9;assert.equal((await next.load('game:nscript.dat')).data[0],1);next.close();
});
test('version and manifest changes isolate caches while sharing the same pinned WASM key',async()=>{
 const create=required('createOnsResourcePlan'),a=await create(pilot,manifest(),origin),doc={...manifest(),versionId:'legacy-next'},b=await create({...pilot,versionId:doc.versionId},doc,origin),c=await create(pilot,manifest(['nscript.dat','different.png']),origin);
 assert.notEqual(a.resources.get('game:nscript.dat').key,b.resources.get('game:nscript.dat').key);assert.notEqual(a.resources.get('game:nscript.dat').key,c.resources.get('game:nscript.dat').key);assert.equal(a.resources.get('engine:wasm').key,b.resources.get('engine:wasm').key);
});
test('corrupt or expired records are replaced; quota failures still return valid network data',async()=>{
 let now=100;const f=await fixture({now:()=>now,ttl:1000});await f.cache.load('game:nscript.dat');const key=f.plan.resources.get('game:nscript.dat').key;f.store.rows.get(key).data[0]=9;assert.equal((await f.cache.load('game:nscript.dat')).source,'network');now=2000;assert.equal((await f.cache.load('game:nscript.dat')).source,'network');f.store.fail=true;const result=await f.cache.load('game:scene/1.png');assert.deepEqual(result.data,new Uint8Array([1,2,3,4]));assert.equal(result.source,'network');f.cache.close();
});
test('cache eviction stays within its own resource records and respects the byte budget',async()=>{
 let now=0;const f=await fixture({maxBytes:8,maxFileBytes:8,now:()=>++now});await f.cache.load('game:nscript.dat');await f.cache.load('game:scene/1.png');await f.cache.load('game:nscript.dat');await f.cache.load('game:scene/2.png');assert.equal(f.store.rows.size,2);assert(f.store.rows.has(f.plan.resources.get('game:nscript.dat').key));assert(!f.store.rows.has(f.plan.resources.get('game:scene/1.png').key));f.cache.close();
});
test('oversized resources use the existing direct path without buffering or caching the body',async()=>{
 const f=await fixture({maxFileBytes:2});const result=await f.cache.load('game:nscript.dat');assert.equal(result.direct,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'HEAD');assert.equal(f.store.rows.size,0);f.cache.close();
});
test('partial HTTP responses never enter the resource cache',async()=>{
 const f=await fixture({fetcher:async(url,init)=>new Response(init.method==='HEAD'?null:'bad',{status:init.method==='HEAD'?200:206,headers:{'content-length':'3'}})});await assert.rejects(f.cache.load('game:nscript.dat'));assert.equal(f.store.rows.size,0);f.cache.close();
});
test('pinned WASM is verified before returning or persisting bytes',async()=>{
 const f=await fixture();await assert.rejects(f.cache.load('engine:wasm'),/校验/);assert.equal(f.store.rows.size,0);f.cache.close();
});
test('background preloading has a file and byte budget and can be stopped independently',async()=>{
 const f=await fixture({prefetchFiles:1,prefetchBytes:4,idleMs:0});f.cache.startPrefetch();await f.cache.whenIdle();const entries=await f.store.list();assert.equal(entries.length,1);assert.equal(entries[0].size,4);f.cache.close();
});
test('unavailable persistent storage does not waste bandwidth on speculative preloads',async()=>{
 const f=await fixture({store:null,idleMs:0});f.cache.startPrefetch();await f.cache.whenIdle();assert.equal(f.calls.length,0);assert.deepEqual((await f.cache.load('game:nscript.dat')).data,new Uint8Array([1,2,3,4]));f.cache.close();
});
test('concurrent reads share a download but receive independent transferable arrays',async()=>{
 const f=await fixture();const [a,b]=await Promise.all([f.cache.load('game:nscript.dat'),f.cache.load('game:nscript.dat')]);assert.equal(f.calls.length,2);a.data[0]=9;assert.equal(b.data[0],1);f.cache.close();
});
test('foreground reads cancel an unrelated active background download',async()=>{
 let resolveStarted;const started=new Promise(resolve=>resolveStarted=resolve);let aborted=false;
 const f=await fixture({idleMs:0,prefetchFiles:1,fetcher:async(url,init)=>{if(init.method==='GET'&&url.endsWith('/scene/1.png')){resolveStarted();return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('aborted','AbortError'))},{once:true}))}return new Response(init.method==='HEAD'?null:new Uint8Array([1,2,3,4]),{headers:{'content-length':'4'}})}});
 f.cache.startPrefetch();await started;const value=await f.cache.load('game:nscript.dat');assert(aborted);assert.equal(value.data.byteLength,4);f.cache.close();
});
test('cache lookup is a distinct startup phase rather than a fabricated network download',async()=>{
 const loading=await import('../public/ons/loading.mjs'),messages=[],report=loading.createLoadingReporter(x=>messages.push(x));report.phase('checking','engine');assert.equal(messages.at(-1).stage,'checking');assert.equal(loading.loadingPercent(messages.at(-1)),null);
});
