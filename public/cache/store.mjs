import {sha256} from './vendor/noble-hashes/sha2.js';
const DB='wvn-whole-public-cache-v1',CACHE='wvn-whole-public-parts-v1';
const valid=sha=>{if(!/^[a-f0-9]{64}$/.test(sha))throw Error('Invalid cache key')};
const validPart=(sha,part)=>part?.id?.startsWith(sha+'-')&&/^[a-f0-9]{64}-[a-f0-9-]{36}$/.test(part.id)&&Number.isSafeInteger(part.offset)&&part.offset>=0&&Number.isSafeInteger(part.size)&&part.size>0&&part.size<=4*1024**2&&['opfs','cache-storage'].includes(part.backend);
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const cacheCorruption=message=>Object.assign(Error(message),{name:'CacheCorruptionError'});

// 仅本模块实际校验过的不可变Blob可复用证明；不接受持久元数据或调用方自报标志。
const verifiedFiles=new WeakMap();
export function isVerifiedPublicFile(blob,row){const proof=verifiedFiles.get(blob);return !!proof&&proof.sha256===row.sha256&&proof.bytes===row.bytes&&blob.size===row.bytes}

// Web Locks作为会话存活租约：后台冻结不会过期，崩溃后浏览器自动释放。
// 无锁能力的会话使用不同前缀，不能被另一页面误判成遗留目录。
export async function openPublicViewSession(root,locks){
 const id=(locks?'session-':'unlocked-')+crypto.randomUUID();let release,held,closed=false;
 if(locks){
  let acquired,failed;const ready=new Promise((resolve,reject)=>{acquired=resolve;failed=reject});
  held=locks.request('wvn-public-view/'+id,{mode:'exclusive'},async()=>{const untilClose=new Promise(resolve=>release=resolve);acquired();await untilClose});held.catch(failed);await ready;
 }
 try{
  const directory=await root.getDirectoryHandle(id,{create:true});
  if(locks)for await(const name of root.keys()){
   if(name===id||!/^session-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(name))continue;
   await locks.request('wvn-public-view/'+name,{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock)return;try{await root.removeEntry(name,{recursive:true})}catch(error){if(error.name!=='NotFoundError')throw error}});
  }
  return {id,directory,async close(){if(closed)return;closed=true;try{await root.removeEntry(id,{recursive:true})}finally{release?.();await held}}};
 }catch(error){release?.();await held;throw error}
}

export const PUBLIC_FILE_VIEW_THRESHOLD=32*1024**2;
export function publicFileViewReserve(rows,backend){return backend==='opfs'?rows.reduce((n,row)=>n+(row.bytes>=PUBLIC_FILE_VIEW_THRESHOLD?row.bytes:0),0):0}
// 大对象仍保留原分块；只生成当前运行区私有的、校验完成后才能返回的文件视图。
export async function createPublicFileView({row,parts,directory,signal}){
 valid(row?.sha256);if(!Number.isSafeInteger(row.bytes)||row.bytes<0||!directory)throw Error('Invalid public file view');signal?.throwIfAborted();
 const id=row.sha256+'-'+crypto.randomUUID();let created=false,writer,complete=false,size=0;const hash=sha256.create();
 const corrupt=()=>Object.assign(Error('Public file view checksum or length differs'),{name:'CacheCorruptionError'});
 try{
  const handle=await directory.getFileHandle(id,{create:true});created=true;signal?.throwIfAborted();writer=await handle.createWritable();
  for await(const part of parts){if(part.offset!==size)throw corrupt();for(let offset=0;offset<part.data.size;offset+=65536){signal?.throwIfAborted();const bytes=new Uint8Array(await part.data.slice(offset,offset+65536).arrayBuffer());if(size+bytes.byteLength>row.bytes)throw corrupt();await writer.write(bytes);hash.update(bytes);size+=bytes.byteLength}}
  signal?.throwIfAborted();const digest=[...hash.digest()].map(v=>v.toString(16).padStart(2,'0')).join('');if(size!==row.bytes||digest!==row.sha256)throw corrupt();await writer.close();writer=undefined;signal?.throwIfAborted();
  const file=await handle.getFile();if(file.size!==row.bytes)throw corrupt();const blob=file.slice(0,file.size,row.contentType);verifiedFiles.set(blob,{sha256:row.sha256,bytes:row.bytes});complete=true;return {id,blob};
 }finally{if(writer)await writer.abort().catch(()=>{});if(created&&!complete)await directory.removeEntry(id)}
}

export async function confirmPublicCapacity({directory,storage,bytes,signal}){
 if(!Number.isSafeInteger(bytes)||bytes<=0)throw Error('Invalid capacity reservation');signal?.throwIfAborted();
 const info=await storage?.estimate?.();signal?.throwIfAborted();
 if(!directory||!Number.isFinite(info?.quota)||!Number.isFinite(info?.usage)||info.quota<=0||info.usage<0||info.quota-info.usage>=bytes)return info;
 // WebKit会按使用量分级报告配额；用本来源原生临时文件确认容量，再读真实estimate，绝不伪造额度。
 const name='capacity-'+crypto.randomUUID();let created=false,writer;
 try{
  const handle=await directory.getFileHandle(name,{create:true});created=true;signal?.throwIfAborted();
  if(!handle.createWritable)return info;
  writer=await handle.createWritable();signal?.throwIfAborted();await writer.truncate(bytes);signal?.throwIfAborted();await writer.close();writer=undefined;
  if((await handle.getFile()).size!==bytes)throw new DOMException('Capacity reservation was truncated','QuotaExceededError');
 }finally{
  if(writer)await writer.abort().catch(()=>{});
  if(created)await directory.removeEntry(name);
 }
 signal?.throwIfAborted();return {...await storage.estimate(),source:'native-opfs-reservation',reservedBytes:bytes};
}

export async function openChunkStore({indexedDB=globalThis.indexedDB,caches=globalThis.caches,storage=globalThis.navigator?.storage,origin=globalThis.location?.origin,locks=globalThis.navigator?.locks}={}){
 if(!indexedDB||!origin)throw Error('Public resource storage unavailable');
 const opening=indexedDB.open(DB,2);opening.onupgradeneeded=()=>{for(const name of ['objects','sessions','leases'])if(!opening.result.objectStoreNames.contains(name))opening.result.createObjectStore(name,{keyPath:'key'})};const db=await request(opening);db.onversionchange=()=>db.close();
 let directory;try{directory=await(await storage?.getDirectory()).getDirectoryHandle('wvn-public-chunks-v1',{create:true})}catch{/* OPFS 不可用时保留 Cache Storage 分块后端。 */}
 const cache=!directory&&caches?await caches.open(CACHE):null;if(!directory&&!cache){db.close();throw Error('No public chunk backend')}
 let viewsDirectory,viewSession,closed=false,closePromise;const viewFiles=new Map(),viewTasks=new Map(),getTasks=new Set(),viewShutdown=new AbortController();
 if(directory)try{const root=await directory.getDirectoryHandle('wvn-public-views-v1',{create:true});viewSession=await openPublicViewSession(root,locks);viewsDirectory=viewSession.directory}catch(error){db.close();throw error}
 function tx(name,mode,run){return new Promise((resolve,reject)=>{const transaction=db.transaction(name,mode);let value;transaction.oncomplete=()=>resolve(value);transaction.onabort=()=>reject(transaction.error??Error('Cache transaction aborted'));transaction.onerror=()=>{};try{run(transaction.objectStore(name),x=>value=x)}catch(error){transaction.abort();reject(error)}})}

 // 内容写入与租约校验在同一事务，旧写入者即使已写完临时块也不能发布。
 function objectTx(sha,token,run){return new Promise((resolve,reject)=>{
  const transaction=db.transaction(['objects','leases'],'readwrite'),objects=transaction.objectStore('objects');let value,failure;
  transaction.oncomplete=()=>resolve(value);transaction.onabort=()=>reject(failure??transaction.error??Error('Cache transaction aborted'));transaction.onerror=()=>{};
  const execute=()=>{try{run(objects,x=>value=x)}catch(error){failure=error;transaction.abort()}};
  if(!token){execute();return}const req=transaction.objectStore('leases').get(token.key);req.onsuccess=()=>{const live=req.result;if(token.key!=='object/'+sha||live?.owner!==token.owner||live.fence!==token.fence||live.expiresAt<=Date.now()){failure=Object.assign(Error('Public resource lease expired'),{name:'LeaseLostError'});transaction.abort()}else execute()};
 })}
 const read=(name,key)=>request(db.transaction(name,'readonly').objectStore(name).get(key));
 const partURL=id=>origin+'/__wvn_cache/part/'+id;
 async function partBlob(part){
  if(part.backend==='opfs'){try{const file=await(await directory.getFileHandle(part.id)).getFile();return file.size===part.size?file:null;}catch(error){if(error.name==='NotFoundError')return null;throw error}}
  const response=await(await caches.open(CACHE)).match(partURL(part.id));if(!response)return null;const blob=await response.blob();return blob.size===part.size?blob:null;
 }
 async function erase(part){try{if(part.backend==='opfs')await directory.removeEntry(part.id);else await(await caches.open(CACHE)).delete(partURL(part.id))}catch{/* 缺失的可重下载公共块无需再次删除。 */}}
 const api={
  backend:directory?'opfs':'cache-storage',
  confirmCapacity:(bytes,{signal}={})=>confirmPublicCapacity({directory,storage,bytes,signal}),
  async diagnostics(){const c=caches?await caches.open(CACHE):null;return {origin,opfs:!!directory,estimate:await storage?.estimate?.(),cacheKeys:c?(await c.keys()).slice(0,6).map(r=>r.url):[]}},
  async meta(sha){valid(sha);return await read('objects',sha)??null},
  async list(){return request(db.transaction('objects','readonly').objectStore('objects').getAll())},
  async *parts(sha){const meta=await api.meta(sha);for(const part of meta?.parts??[]){if(!validPart(sha,part))throw cacheCorruption('Invalid stored chunk');const data=await partBlob(part);if(!data)throw cacheCorruption('Invalid stored chunk');yield {offset:part.offset,data}}},
  get(sha,token,{signal}={}){
   const result=(async()=>{const checkGet=()=>{signal?.throwIfAborted();viewShutdown.signal.throwIfAborted()};
   if(closed)throw Error('Public store closed');signal?.throwIfAborted();const meta=await api.meta(sha);checkGet();if(!meta?.complete)return null;
   const existing=viewFiles.get(sha);if(existing)return existing.blob;
   // 临时I/O或配额错误不能证明内容损坏；保留已提交块，交由调用者显示错误并重试。
   const chunks=[];let size=0;try{for await(const part of api.parts(sha)){checkGet();if(part.offset!==size)throw cacheCorruption('Invalid part offset');chunks.push(part.data);size+=part.data.size}if(size!==meta.bytes)throw cacheCorruption('Invalid cached size')}catch(error){checkGet();if(error.name!=='CacheCorruptionError')throw error;await api.remove(sha,token);return null}
   if(!viewsDirectory||meta.bytes<PUBLIC_FILE_VIEW_THRESHOLD)return new Blob(chunks,{type:meta.contentType});
   let task=viewTasks.get(sha);if(!task){
    const controller=new AbortController(),signals=[viewShutdown.signal,signal].filter(Boolean),abort=()=>controller.abort(signals.find(s=>s.aborted)?.reason);for(const item of signals)item.addEventListener('abort',abort,{once:true});if(signals.some(s=>s.aborted))abort();
    task=(async()=>{try{const row={...meta,sha256:sha},parts=(async function*(){let offset=0;for(const data of chunks){yield {offset,data};offset+=data.size}})(),result=await createPublicFileView({row,parts,directory:viewsDirectory,signal:controller.signal});viewFiles.set(sha,result);return result.blob}catch(error){if(error.name==='CacheCorruptionError'){await api.remove(sha,token);return null}throw error}finally{for(const item of signals)item.removeEventListener('abort',abort);viewTasks.delete(sha)}})();viewTasks.set(sha,task);
   }return task;})();getTasks.add(result);void result.finally(()=>getTasks.delete(result)).catch(()=>{});return result;
  },
  async append(row,offset,data,token){
   valid(row.sha256);if(!(data instanceof Uint8Array)||!data.byteLength||data.byteLength>4*1024**2)throw Error('Invalid chunk');
   const id=row.sha256+'-'+crypto.randomUUID(),part={id,offset,size:data.byteLength,backend:api.backend};
   if(directory){const file=await directory.getFileHandle(id,{create:true});if(file.createSyncAccessHandle){const handle=await file.createSyncAccessHandle();try{if(handle.write(data,{at:0})!==data.byteLength)throw Error('Short chunk write');handle.flush()}finally{handle.close()}}else{const writer=await file.createWritable();try{await writer.write(data);await writer.close()}catch(error){await writer.abort().catch(()=>{});throw error}}}
   else await cache.put(partURL(id),new Response(data, {headers:{'content-type':'application/octet-stream'}}));
   try{await objectTx(row.sha256,token,(store,done)=>{const req=store.get(row.sha256);req.onsuccess=()=>{const old=req.result,parts=old?.parts??[],end=parts.reduce((n,p)=>n+p.size,0);if(old?.complete||end!==offset||offset+data.byteLength>row.bytes){store.transaction.abort();return}store.put({key:row.sha256,sha256:row.sha256,bytes:row.bytes,contentType:row.contentType,parts:[...parts,part],complete:false});done()}})}catch(error){await erase(part);throw error}
  },
  async complete(row,token){valid(row.sha256);return objectTx(row.sha256,token,(store,done)=>{const req=store.get(row.sha256);req.onsuccess=()=>{const meta=req.result??{key:row.sha256,parts:[]},size=meta.parts.reduce((n,p)=>n+p.size,0);if(size!==row.bytes){store.transaction.abort();return}store.put({...meta,sha256:row.sha256,bytes:row.bytes,contentType:row.contentType,complete:true});done()}})},
  async remove(sha,token){valid(sha);const meta=await objectTx(sha,token,(store,done)=>{const req=store.get(sha);req.onsuccess=()=>{done(req.result);store.delete(sha)}});for(const part of meta?.parts??[])if(validPart(sha,part))await erase(part)},
  async state(id,value){if(value===undefined)return (await read('sessions',id))?.value??null;return tx('sessions','readwrite',store=>store.put({key:id,value}))},
  async lease(key,owner,ttl=30000,now=Date.now()){
   return tx('leases','readwrite',(store,done)=>{const req=store.get(key);req.onsuccess=()=>{const old=req.result;if(old&&old.owner!==owner&&old.expiresAt>now){done(null);return}const value={key,owner,fence:old?.owner===owner&&old.expiresAt>now?old.fence:(old?.fence??0)+1,expiresAt:now+ttl};store.put(value);done(value)}});
  },
  async renew(token,ttl=30000){return tx('leases','readwrite',(store,done)=>{const req=store.get(token.key);req.onsuccess=()=>{const live=req.result;if(live?.owner!==token.owner||live.fence!==token.fence||live.expiresAt<=Date.now()){done(null);return}const value={...live,expiresAt:Date.now()+ttl};store.put(value);done(value)}})},
  async release(token){if(!token)return;return tx('leases','readwrite',store=>{const req=store.get(token.key);req.onsuccess=()=>{const live=req.result;if(live?.owner===token.owner&&live.fence===token.fence)store.put({...live,expiresAt:0})}})},
  scoped(token){return {...api,get:(sha,options)=>api.get(sha,token,options),append:(row,offset,data)=>api.append(row,offset,data,token),complete:row=>api.complete(row,token),remove:sha=>api.remove(sha,token)}},
  async protect(plan,owner){
   const members=plan.rows.map(r=>{valid(r.sha256);return r.sha256});await api.state('members/'+plan.id,members);
   return tx('leases','readwrite',(store,done)=>{const value={key:'active/'+owner,owner,planId:plan.id,fence:1,expiresAt:Date.now()+30000};store.put(value);done(value)});
  },
  async clearPlan(plan){
   const keys=[...new Set(plan.rows.map(r=>{valid(r.sha256);return r.sha256}))];
   const result=await new Promise((resolve,reject)=>{
    const transaction=db.transaction(['objects','leases','sessions'],'readwrite'),objects=transaction.objectStore('objects');let failure,retained=0;const removed=[];let cleanupKeys=[];
    transaction.oncomplete=()=>resolve({removed,retained,cleanupKeys});transaction.onabort=()=>reject(failure??transaction.error??Error('Public cache clear aborted'));transaction.onerror=()=>{};
    const req=transaction.objectStore('leases').getAll();req.onsuccess=()=>{
     const live=req.result.filter(x=>x.expiresAt>Date.now());if(live.some(x=>x.planId===plan.id)){failure=Error('Active resource plan cannot be cleared');transaction.abort();return}
     const protectedKeys=new Set(live.filter(x=>x.key.startsWith('object/')).map(x=>x.key.slice(7))),plans=[...new Set(live.map(x=>x.planId).filter(Boolean))];let pending=plans.length;
     const eraseMetadata=()=>{cleanupKeys=keys.filter(sha=>!protectedKeys.has(sha));for(const sha of keys){const read=objects.get(sha);read.onsuccess=()=>{if(!read.result)return;if(protectedKeys.has(sha)){retained++;return}removed.push({...read.result,sha256:sha});objects.delete(sha)}}};
     if(!pending){eraseMetadata();return}for(const id of plans){const read=transaction.objectStore('sessions').get('members/'+id);read.onsuccess=()=>{const members=read.result?.value;if(Array.isArray(members))for(const sha of members)protectedKeys.add(sha);if(!--pending)eraseMetadata()}}
    };
   });
   for(const meta of result.removed)for(const part of meta.parts??[])if(validPart(meta.sha256,part))await erase(part);
   if(directory){const legacyViews=await directory.getDirectoryHandle('wvn-public-views-v1',{create:true}),keys=new Set(result.cleanupKeys);for await(const name of legacyViews.keys())if(/^[a-f0-9]{64}-[a-f0-9-]{36}$/.test(name)&&keys.has(name.slice(0,64)))await legacyViews.removeEntry(name)}
   return {removed:result.removed.length,retained:result.retained};
  },
  close(){if(closePromise)return closePromise;closed=true;viewShutdown.abort(new DOMException('Public store closed','AbortError'));closePromise=(async()=>{await Promise.allSettled([...getTasks]);try{for(const {id} of viewFiles.values())try{await viewsDirectory.removeEntry(id)}catch(error){if(error.name!=='NotFoundError')throw error}viewFiles.clear()}finally{try{await viewSession?.close()}finally{db.close()}}})();return closePromise},
 };
 return api;
}
