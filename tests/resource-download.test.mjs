import test from 'node:test';
import assert from 'node:assert/strict';
import {createResilientFetch} from '../public/player/resource-download.mjs';

const url='https://wg-b2.saop.cc/__player/resource/test/game.zip';
const headers={'content-length':'6',etag:'"fixed"','accept-ranges':'bytes'};
function broken(){let first=true;return new ReadableStream({pull(c){if(first){first=false;c.enqueue(new Uint8Array([1,2,3]))}else c.error(new TypeError('connection reset'))}})}
const wrap=fetcher=>createResilientFetch({fetcher,allowed:()=>true,delay:async()=>{},idleMs:100});
test('interrupted body resumes only the remaining bytes with a strong validator',async()=>{
 const calls=[];const read=wrap(async(_url,options)=>{calls.push(options);return calls.length===1?new Response(broken(),{headers}):new Response(new Uint8Array([4,5,6]),{status:206,headers:{...headers,'content-length':'3','content-range':'bytes 3-5/6'}})});
 const response=await read(url);assert.equal(response.status,200);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4,5,6]);
 assert.equal(calls[1].headers.get('range'),'bytes=3-');assert.equal(calls[1].headers.has('if-range'),false);assert.equal(calls[1].credentials,'omit');
});
test('truncated EOF also resumes; changed validators and wrong ranges never join different files',async()=>{
 for(const changed of [{etag:'"changed"'},{'content-range':'bytes 2-4/6'},{'content-range':'bytes 3-5/7'}]){
  let calls=0;const read=wrap(async()=>++calls===1?new Response(new Uint8Array([1,2,3]),{headers}):new Response(new Uint8Array([4,5,6]),{status:206,headers:{...headers,'content-length':'3','content-range':'bytes 3-5/6',...changed}}));
  await assert.rejects((await read(url)).arrayBuffer(),/resume|range|validator/i);assert.ok(calls<=4);
 }
});
test('ignored Range cannot append a full body to already delivered bytes',async()=>{
 let calls=0;const read=wrap(async()=>++calls===1?new Response(broken(),{headers}):new Response(new Uint8Array([1,2,3,4,5,6]),{headers}));
 await assert.rejects((await read(url)).arrayBuffer(),/resume|range/i);
});
test('temporary response failures retry, permanent errors and unscoped requests do not',async()=>{
 let calls=0;const read=wrap(async()=>++calls===1?new Response(null,{status:503}):new Response('ok'));
 assert.equal(await(await read(url)).text(),'ok');assert.equal(calls,2);
 calls=0;assert.equal((await wrap(async()=>{calls++;return new Response(null,{status:404})})(url)).status,404);assert.equal(calls,1);
 const options={credentials:'same-origin'};let observed;await createResilientFetch({allowed:()=>false,fetcher:async(_url,o)=>{observed=o;return new Response('ok')}})('/api/me',options);assert.equal(observed,options);
});
test('idle body timeout is bounded and retries without losing received bytes',async()=>{
 let calls=0;const read=createResilientFetch({allowed:()=>true,idleMs:5,delay:async()=>{},fetcher:async()=>++calls===1?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]))}}),{headers}):new Response(new Uint8Array([4,5,6]),{status:206,headers:{...headers,'content-length':'3','content-range':'bytes 3-5/6'}})});
 assert.deepEqual([...new Uint8Array(await(await read(url)).arrayBuffer())],[1,2,3,4,5,6]);assert.equal(calls,2);
});
test('cancellation stops retries and bodies without a stable validator fail safely',async()=>{
 const controller=new AbortController();let calls=0;const read=wrap(async()=>{calls++;return new Response(broken(),{headers})});
 const response=await read(url,{signal:controller.signal});controller.abort();await assert.rejects(response.arrayBuffer(),{name:'AbortError'});assert.equal(calls,1);
 calls=0;const unsafe=wrap(async()=>{calls++;return new Response(broken(),{headers:{'content-length':'6'}})});await assert.rejects((await unsafe(url)).arrayBuffer());assert.equal(calls,1);
});

test('resumption bypasses the complete-response HTTP cache and has one finite retry budget',async()=>{
 const calls=[];const read=wrap(async(_url,options)=>{calls.push(options);return new Response(broken(),{headers:calls.length===1?headers:{...headers,'content-length':'3','content-range':'bytes 3-5/6'},status:calls.length===1?200:206})});
 await assert.rejects((await read(url,{cache:'force-cache'})).arrayBuffer());assert(calls.length<=4);assert.equal(calls[1].cache,'no-store');
});
test('caller cancellation aborts the upstream transport after response headers',async()=>{
 let upstream;const controller=new AbortController(),read=wrap(async(_url,options)=>{upstream=options.signal;return new Response(new ReadableStream(),{headers})});
 const response=await read(url,{signal:controller.signal});controller.abort();await assert.rejects(response.arrayBuffer(),{name:'AbortError'});assert.equal(upstream.aborted,true);
});
test('continuous slow data cannot exceed the total transfer deadline',async()=>{
 const read=createResilientFetch({allowed:()=>true,totalMs:10,idleMs:100,fetcher:async()=>new Response(new ReadableStream({async pull(c){await new Promise(r=>setTimeout(r,4));c.enqueue(new Uint8Array([1]))}}))});
 await assert.rejects((await read(url)).arrayBuffer(),{name:'TimeoutError'});
});
test('transient HEAD failures retry and a caller supplied Range request remains native',async()=>{
 let calls=0;const read=wrap(async(_url,options)=>{calls++;return new Response(null,{status:calls===1?503:200})});assert.equal((await read(url,{method:'HEAD'})).status,200);assert.equal(calls,2);
 const options={headers:{range:'bytes=0-3'}};let observed;await wrap(async(_url,value)=>{observed=value;return new Response(null,{status:206})})(url,options);assert.equal(observed,options);
});
