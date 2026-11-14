import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as startup from '../public/cache/startup.mjs';
import * as storage from '../public/cache/store.mjs';
import {downloadObject} from '../public/cache/download.mjs';
import {createDownloadSession} from '../public/cache/scheduler.mjs';
import {snapshotDigest} from '../public/ons/protocol.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('startup overlaps two small reads and gives oversized files exclusive access',async()=>{
 let active=0,peak=0;const releases=[],began=[];
 const rows=[{sha256:'a',bytes:4},{sha256:'b',bytes:4},{sha256:'c',bytes:20},{sha256:'d',bytes:2}];
 const task=startup.prepareStartupResources(rows,async sha=>{began.push(sha);peak=Math.max(peak,++active);await new Promise(resolve=>releases.push(()=>{active--;resolve()}));},{maxBytes:8});
 await tick();assert.deepEqual(began,['a','b']);releases.shift()();await tick();assert.deepEqual(began,['a','b']);releases.shift()();await tick();assert.deepEqual(began,['a','b','c']);assert.equal(active,1);releases.shift()();await tick();assert.deepEqual(began,['a','b','c','d']);releases.shift()();await task;assert.equal(peak,2);
});
test('startup cancels siblings and never dispatches remaining files after failure',async()=>{
 const began=[];const failure=Error('broken');
 await assert.rejects(startup.prepareStartupResources([{sha256:'a',bytes:1},{sha256:'b',bytes:1},{sha256:'c',bytes:1}],async(sha,{signal})=>{began.push(sha);if(sha==='a')throw failure;await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});if(signal.aborted)reject(signal.reason)});}),error=>error===failure);
 assert(!began.includes('c'));
});
test('startup abort before entry issues no reads',async()=>{const c=new AbortController();c.abort();let calls=0;await assert.rejects(startup.prepareStartupResources([{sha256:'a',bytes:1}],async()=>calls++,{signal:c.signal}),{name:'AbortError'});assert.equal(calls,0)});

function memoryDirectory(){const files=new Map(),dirs=new Map();return {files,dirs,async getFileHandle(id,{create}={}){if(!files.has(id)&&!create)throw new DOMException('missing','NotFoundError');return {async createWritable(){const chunks=[];return {async write(bytes){chunks.push(bytes.slice())},async close(){files.set(id,new Blob(chunks))},async abort(){}}},async getFile(){return files.get(id)}}},async getDirectoryHandle(id){if(!dirs.has(id))dirs.set(id,memoryDirectory());return dirs.get(id)},async *keys(){yield* files.keys();yield* dirs.keys()},async removeEntry(id){files.delete(id);dirs.delete(id)}}}
function locks(){const held=new Set();return {held,async request(name,options,callback){if(options.ifAvailable&&held.has(name))return callback(null);assert(!held.has(name));held.add(name);try{return await callback({name})}finally{held.delete(name)}}}}
test('view session cleanup removes abandoned directories while retaining active and legacy data',async()=>{
 const root=memoryDirectory(),manager=locks();const first=await storage.openPublicViewSession(root,manager);const second=await storage.openPublicViewSession(root,manager);
 assert(root.dirs.has(first.id));root.files.set('legacy-file',new Blob(['keep']));root.dirs.set('session-11111111-1111-4111-8111-111111111111',memoryDirectory());
 const third=await storage.openPublicViewSession(root,manager);assert(root.dirs.has(first.id));assert(root.dirs.has(second.id));assert(!root.dirs.has('session-11111111-1111-4111-8111-111111111111'));assert(root.files.has('legacy-file'));
 await first.close();assert(!root.dirs.has(first.id));await second.close();await third.close();assert.equal(manager.held.size,0);
});
test('view session without Web Locks leaves other sessions intact',async()=>{const root=memoryDirectory();const name='session-11111111-1111-4111-8111-111111111111';root.dirs.set(name,memoryDirectory());const current=await storage.openPublicViewSession(root,null);assert(root.dirs.has(name));await current.close();assert(root.dirs.has(name))});
test('verified OPFS view is not scanned a second time, while unrelated blobs remain checked',async()=>{
 const data=new Uint8Array([1,2,3]),row={sha256:digest(data),bytes:3,contentType:'application/octet-stream'};row.url='https://wvn-s3-zi0.saop.cc/'+row.sha256+'.bin';
 const result=await storage.createPublicFileView({row,parts:(async function*(){yield {offset:0,data:new Blob([data])}})(),directory:memoryDirectory()});
 result.blob.slice=()=>{throw Error('redundant scan')};
 assert.equal(await downloadObject(row,{store:{get:async()=>result.blob}}),result.blob);
 let removed=false;await assert.rejects(downloadObject(row,{retries:0,store:{get:async()=>new Blob(['bad']),remove:async()=>{removed=true},parts:async function*(){}},fetcher:async()=>{throw Error('network')}}),/network/);assert(removed);
});
test('download propagates dynamic foreground priority and keeps background requests low',async()=>{
 const data=new Uint8Array([1,2,3]),row={sha256:digest(data),bytes:3};row.url='https://wvn-s3-zi0.saop.cc/'+row.sha256+'.bin';
 for(const [foreground,want] of [[true,'high'],[false,'low']]){let saved,priority;await downloadObject(row,{foreground:()=>foreground,store:{get:async()=>saved,parts:async function*(){},append:async(_r,_at,bytes)=>{saved=new Blob([bytes])},complete:async()=>{}},fetcher:async(_url,options)=>{priority=options.priority;return new Response(data)}});assert.equal(priority,want)}
});
test('snapshot digest keeps call-time bytes even when caller mutates immediately',async()=>{const value={schema:1,pilot:'clannad',files:[{path:'a.save',data:new Uint8Array([1,2])},{path:'b.save',data:new Uint8Array([3,4])}]};const expected=await snapshotDigest(value);const pending=snapshotDigest(value);value.files[1].data.fill(9);value.files.reverse();assert.equal(await pending,expected);await assert.rejects(snapshotDigest({...value,files:[value.files[0],value.files[0]]}),/无效/)});

test('startup cancellation aborts the active batch before another row is dispatched',async()=>{
 const c=new AbortController(),began=[];const task=startup.prepareStartupResources(['a','b','c'].map(sha256=>({sha256,bytes:1})),async(sha,{signal})=>{began.push(sha);await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));},{signal:c.signal});
 await tick();c.abort(new DOMException('cancel','AbortError'));await assert.rejects(task,{name:'AbortError'});assert.deepEqual(began,['a','b']);
});
test('scheduler foreground promotion is visible to an existing download and subsequent retries',async()=>{
 const row={sha256:'a'.repeat(64),bytes:1},plan={id:'fixture',rows:[row],totalBytes:1};let finish,foreground;
 const store={backend:'cache-storage',state:async()=>null,protect:async()=>({}),lease:async()=>({}),renew:async token=>token,release:async()=>{},list:async()=>[],scoped:()=>({})};
 const session=createDownloadSession({plan,store,estimate:async()=>({quota:1024**3,usage:0}),download:async(_row,options)=>{foreground=options.foreground;await new Promise(resolve=>finish=resolve);return new Blob(['x'])}});
 try{await session.start();await tick();assert.equal(foreground(),false);const demand=session.demand(row.sha256);await tick();assert.equal(foreground(),true);finish();assert.equal((await demand).size,1)}finally{await session.close()}
});
test('snapshot digest avoids a JavaScript byte copy and submits every file before yielding',async()=>{
 const snapshot={schema:1,pilot:'clannad',files:[{path:'a.save',data:new Uint8Array([1,2])},{path:'b.save',data:new Uint8Array([3,4])}]},original=crypto.subtle.digest,seen=[];
 crypto.subtle.digest=function(algorithm,bytes){seen.push(bytes);return original.call(this,algorithm,bytes)};
 try{const pending=snapshotDigest(snapshot);assert.equal(seen.length,2);assert.equal(seen[0],snapshot.files[0].data);assert.equal(seen[1],snapshot.files[1].data);await pending}finally{crypto.subtle.digest=original}
});
