import {resourceOriginForManifest} from '../player/resource-location.mjs';
// 资源缓存独立于账号与存档数据库。仅允许可信页面核准的本作资源清单和固定 WASM。
const MiB=1024*1024,DB='wvn-public-resource-cache-v1';
const digest=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
function resourcePath(path){return typeof path==='string'&&path.length>0&&path.length<=240&&!/[\\%:?\u0000-\u001f\u007f]/u.test(path)&&path.split('/').every((part,index,all)=>part&&part!=='.'&&part!=='..'&&(!part.startsWith('.')||index===all.length-1&&/^\.[^.]+\.ogg$/i.test(part)))&&(!path.includes('#')||/\.(ogg|mp3|wav)$/i.test(path))&&!/\.(html?|[cm]?js|wasm|svg|exe|ps1|py)$/i.test(path)}
export async function createOnsResourcePlan(pilot,manifest,origin,release){
 if(!pilot||!/^[a-z0-9-]{1,100}$/.test(pilot.id)||!/^https?:$/.test(new URL(origin).protocol)||new URL(origin).origin!==origin||manifest?.pilot!==pilot.id||manifest.versionId!==pilot.versionId||manifest.engine!==pilot.engine||!/^[a-f0-9]{64}$/.test(manifest.engine)||!Array.isArray(manifest.files)||manifest.files.length>60000)throw Error('资源缓存清单不匹配');
 const assetOrigin=resourceOriginForManifest(manifest.resourceOrigin,origin),direct=assetOrigin!==origin;
 const files=[],names=new Set();
 for(const row of manifest.files){
  if(!resourcePath(row?.path)||names.has(row.path.toLowerCase())||typeof row.lazyload!=='boolean'||row.url!==(direct?assetOrigin:"")+`/__ons/data/${pilot.id}/`+row.path.split('/').map(encodeURIComponent).join('/'))throw Error('资源缓存路径无效');
  names.add(row.path.toLowerCase());files.push({path:row.path,url:row.url,lazyload:row.lazyload});
 }
 let wasmHash=pilot.engine,engine=`/__ons/engine/${pilot.engine}/`;
 if(manifest.engineRelease){
  if(!release||release.id!==manifest.engineRelease.id||!/^ons-[a-f0-9]{64}$/.test(release.id))throw Error('资源缓存引擎版本不匹配');
  const wasm=release.files?.find(f=>f.path==='onsyuri.wasm');if(!/^[a-f0-9]{64}$/.test(wasm?.sha256))throw Error('资源缓存引擎校验缺失');wasmHash=wasm.sha256;engine=`/__engines/resource/${release.id}/`;
 }
 const revision=await digest(new TextEncoder().encode(JSON.stringify([pilot.id,pilot.versionId,files]))),namespace=`game/${pilot.id}/${pilot.versionId}/${revision}`,resources=new Map();
 for(const file of files)resources.set('game:'+file.path,{key:namespace+'/'+file.path,namespace,url:new URL(file.url,origin).href,path:file.path,kind:'game',lazy:file.lazyload});
 resources.set('engine:wasm',{key:`engine/${wasmHash}/onsyuri.wasm`,namespace:'engine/'+wasmHash,url:assetOrigin+engine+'onsyuri.wasm',kind:'engine',sha256:wasmHash});
 const candidates=files.filter(f=>f.lazyload&&/\.(png|jpe?g|webp|ogg|mp3|wav)$/i.test(f.path)).map(f=>'game:'+f.path);
 return {pilot:pilot.id,versionId:pilot.versionId,revision,namespace,resources,candidates,manifest};
}
// 浏览器给出的是解压后的数据；压缩长度或缺失的 Content-Length 不能作为解码大小。
function decodedLength(response){const encoding=response.headers.get('content-encoding')?.trim().toLowerCase(),raw=response.headers.get('content-length');if(encoding&&encoding!=='identity'||raw===null||!/^\d+$/.test(raw))return null;const value=Number(raw);return Number.isSafeInteger(value)&&value>=0?value:null}
const result=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
export async function openResourceCacheStore(idb=globalThis.indexedDB){
 if(!idb)throw Error('资源缓存不可用');
 const request=idb.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore('entries',{keyPath:'key'});request.result.createObjectStore('blobs',{keyPath:'key'})};const db=await result(request);db.onversionchange=()=>db.close();
 function transaction(stores,mode,run){return new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);let value;tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error??Error('资源缓存写入失败'));tx.onerror=()=>{};try{run(tx,x=>value=x)}catch(error){tx.abort();reject(error)}})}
 return {
  async get(key){return transaction(['entries','blobs'],'readonly',(tx,done)=>{let meta,data;const a=tx.objectStore('entries').get(key),b=tx.objectStore('blobs').get(key);a.onsuccess=()=>{meta=a.result;if(data!==undefined)done(meta?{...meta,data:data?.data}:null)};b.onsuccess=()=>{data=b.result??null;if(meta!==undefined)done(meta?{...meta,data:data?.data}:null)}})},
  async list(){return result(db.transaction('entries','readonly').objectStore('entries').getAll())},
  async put(row){const {data,...meta}=row;return transaction(['entries','blobs'],'readwrite',tx=>{tx.objectStore('entries').put(meta);tx.objectStore('blobs').put({key:row.key,data})})},
  async putBounded(row,maxBytes){return transaction(['entries','blobs'],'readwrite',(tx,done)=>{const entries=tx.objectStore('entries'),blobs=tx.objectStore('blobs'),request=entries.getAll();request.onsuccess=()=>{const rows=request.result.filter(x=>x.key!==row.key).sort((a,b)=>a.accessedAt-b.accessedAt);let used=rows.reduce((n,x)=>n+x.size,0);while(rows.length&&used+row.size>maxBytes){const old=rows.shift();used-=old.size;entries.delete(old.key);blobs.delete(old.key)}const {data,...meta}=row;entries.put(meta);blobs.put({key:row.key,data});done(used+row.size)}})},
  async remove(keys){return transaction(['entries','blobs'],'readwrite',tx=>{for(const key of keys){tx.objectStore('entries').delete(key);tx.objectStore('blobs').delete(key)}})},
  async touch(key,time){return transaction(['entries'],'readwrite',tx=>{const store=tx.objectStore('entries'),req=store.get(key);req.onsuccess=()=>{if(req.result)store.put({...req.result,accessedAt:time})}})},
  close(){db.close()},
 };
}
export function createOnsResourceSession({plan,store=null,fetcher=globalThis.fetch,now=()=>Date.now(),maxBytes=256*MiB,maxFileBytes=32*MiB,ttl=7*86400000,prefetchFiles=6,prefetchBytes=8*MiB,idleMs=1000,onStats=()=>{}}){
 const flights=new Map(),queue=[],queued=new Set(),waiters=[];let closed=false,foreground=0,background=null,timer=null,started=false,attempts=0,preloadBudget=prefetchBytes;
 const stats={available:!!store,hits:0,downloads:0,preloaded:0,bytes:0,maxBytes,prefetching:false};
 const publish=()=>{try{onStats({...stats})}catch{/* 状态显示不影响游戏。 */}},remove=async keys=>{if(store)try{await store.remove(keys)}catch{stats.available=false;publish()}},meta=async()=>{try{return await store?.list()??[]}catch{stats.available=false;return []}};
 const initial=meta().then(rows=>{stats.bytes=rows.reduce((n,r)=>n+r.size,0);publish()});
 function check(){if(closed)throw new DOMException('播放器已关闭','AbortError')}
 async function write(row){
  if(!store||row.size>maxBytes)return;
  try{
   if(store.putBounded){check();stats.bytes=await store.putBounded(row,maxBytes);publish();return}
   const rows=(await meta()).filter(x=>x.key!==row.key).sort((a,b)=>a.accessedAt-b.accessedAt);let used=rows.reduce((n,x)=>n+x.size,0),evicted=[];
   while(rows.length&&used+row.size>maxBytes){const old=rows.shift();used-=old.size;evicted.push(old.key)}
   await remove(evicted);check();await store.put(row);stats.bytes=used+row.size;
  }catch{stats.available=false}publish();
 }
 async function read(key,mode,signal,notify){
  check();await initial;const resource=plan.resources.get(key);if(!resource)throw Error('资源未登记');
  let row;try{row=await store?.get(resource.key)}catch{stats.available=false}
  check();
  if(row){
   if(row.expiresAt>now()&&row.data instanceof Uint8Array&&row.data.byteLength===row.size&&await digest(row.data)===row.sha256&&(!resource.sha256||row.sha256===resource.sha256)){
    stats.hits++;try{await store.touch(row.key,now())}catch{stats.available=false}publish();return {data:new Uint8Array(row.data),source:'cache'};
   }
   await remove([resource.key]);
  }
  const options={credentials:'omit',redirect:'error',cache:'no-store',signal};
  const head=await fetcher(resource.url,{...options,method:'HEAD'});check();if(!head.ok)throw Error('资源读取失败 '+head.status);
  const length=decodedLength(head),limit=mode==='prefetch'?Math.min(maxFileBytes,MiB,preloadBudget):maxFileBytes;
  if(length!==null&&length>limit||mode==='prefetch'&&(length===null||length===0))return {direct:true};
  if(mode==='prefetch'&&length!==null&&length>preloadBudget)return {direct:true};
  notify({loaded:0,total:length??0,source:'network'});
  const response=await fetcher(resource.url,{...options,method:'GET'});check();if(response.status!==200||response.headers.has('content-range'))throw Error('资源响应无效');
  const responseLength=decodedLength(response),expected=responseLength??length;
  if(length!==null&&responseLength!==null&&length!==responseLength)throw Error('资源读取期间大小发生变化');
  const reader=response.body?.getReader(),chunks=[];let received=0;
  if(reader){try{for(;;){const part=await reader.read();check();if(part.done)break;received+=part.value.byteLength;if(received>limit){await reader.cancel();return {direct:true}}chunks.push(part.value);notify({loaded:received,total:expected??0,source:'network'})}}finally{reader.releaseLock()}}
  else {const data=new Uint8Array(await response.arrayBuffer());received=data.byteLength;if(received>limit)return {direct:true};chunks.push(data)}
  check();if(expected!==null&&received!==expected)throw Error('资源大小与响应头不符');
  const data=new Uint8Array(received);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength}
  const sha256=await digest(data);if(resource.sha256&&sha256!==resource.sha256)throw Error('共享引擎校验失败');
  await write({key:resource.key,namespace:resource.namespace,size:received,sha256,data,accessedAt:now(),expiresAt:now()+ttl});
  check();stats.downloads++;if(mode==='prefetch'){stats.preloaded++;preloadBudget-=received}publish();return {data,source:'network'};
 }
 async function obtain(key,mode,listener=()=>{}){
  check();if(!plan.resources.has(key))throw Error('资源未登记');
  let flight=flights.get(key);
  if(flight?.controller.signal.aborted){try{await flight.promise}catch{}flight=null}
  if(!flight){
   const controller=new AbortController(),listeners=new Set();flight={controller,listeners,promise:null};flights.set(key,flight);
   flight.promise=read(key,mode,controller.signal,value=>{for(const fn of listeners)try{fn(value)}catch{}}).finally(()=>{if(flights.get(key)===flight)flights.delete(key)});
  }
  flight.listeners.add(listener);try{const value=await flight.promise;return value.data?{...value,data:new Uint8Array(value.data)}:value}finally{flight.listeners.delete(listener)}
 }
 function settle(){if(!timer&&!background&&!queue.length)for(const resolve of waiters.splice(0))resolve()}
 function schedule(){
  if(!store||!stats.available||maxFileBytes<=0){queue.length=0;settle();return}
  if(closed||!started||foreground||background||timer||!queue.length||stats.preloaded>=prefetchFiles||preloadBudget<=0||attempts>=24){if(stats.preloaded>=prefetchFiles||preloadBudget<=0||attempts>=24)queue.length=0;settle();return}
  timer=setTimeout(async()=>{timer=null;if(closed)return;const key=queue.shift();attempts++;const token={key};background=token;stats.prefetching=true;publish();try{await obtain(key,'prefetch')}catch{/* 预加载失败不干扰阅读。 */}finally{if(background===token)background=null;stats.prefetching=false;publish();schedule();settle()}},idleMs);
 }
 function enqueue(keys){for(const key of keys){if(queue.length>=24)break;if(!queued.has(key)){queued.add(key);queue.push(key)}}schedule()}
 return {
  async load(key,onProgress=()=>{}){
   check();if(!plan.resources.has(key))throw Error('资源未登记');foreground++;if(timer){clearTimeout(timer);timer=null}
   if(background&&background.key!==key)flights.get(background.key)?.controller.abort();
   try{return await obtain(key,'demand',onProgress)}finally{foreground--;if(key.startsWith('game:')&&started){const index=plan.candidates.indexOf(key);if(index>=0)enqueue(plan.candidates.slice(index+1,index+4))}schedule();settle()}
  },
  startPrefetch(){started=true;enqueue(plan.candidates.slice(0,12))},
  whenIdle(){return !timer&&!background&&!queue.length?Promise.resolve():new Promise(resolve=>waiters.push(resolve))},
  stats(){return {...stats}},
  close(){closed=true;if(timer)clearTimeout(timer);timer=null;queue.length=0;for(const value of flights.values())value.controller.abort();for(const resolve of waiters.splice(0))resolve();},
 };
}
export async function clearOnsResourceCache(pilot){
 if(!/^[a-z0-9-]{1,100}$/.test(pilot))throw Error('未知资源版本');const store=await openResourceCacheStore();try{const rows=await store.list();await store.remove(rows.filter(row=>row.namespace.startsWith('game/'+pilot+'/')).map(row=>row.key))}finally{store.close()}
}
