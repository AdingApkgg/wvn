import {makeResourcePlan} from './plan.mjs';
import {sanitizeResourceFailure} from './download.mjs';
export function createCacheClient({origin,parentOrigin=location.origin,manifest,entry,sharedEngine=true,onProgress=()=>{},onFile=()=>{},document=globalThis.document}){
 const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:'||origin===parentOrigin||url.hostname===new URL(parentOrigin).hostname)throw Error('Invalid cache origin');
 const plan=makeResourcePlan(manifest,entry,{sharedEngine}),allowed=new Map(plan.rows.map(row=>[row.sha256,row])),nonce=crypto.randomUUID(),pending=new Map(),channel=new MessageChannel(),frame=document.createElement('iframe');let closed=false,connected=false,resolveReady,rejectReady,closingId,closingTimer,closingPromise,resolveClose;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject});ready.catch(()=>{});
 const timer=setTimeout(()=>rejectReady(Error('资源缓存连接超时')),30000);
 frame.hidden=true;frame.title='WVN 公共资源缓存';frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.src=origin+'/__wvn_cache/index.html';
 frame.onload=()=>{if(!closed)frame.contentWindow.postMessage({type:'WVN_CACHE_INIT',nonce,manifest,entry,sharedEngine,planId:plan.id},origin,[channel.port2])};
 channel.port1.onmessage=({data})=>{
  if(data?.nonce!==nonce||data.planId!==plan.id)return;if(closingId&&data.id===closingId&&data.type==='response'){dispose(data.ok);return}if(closed)return;
  if(data.type==='ready'){connected=true;clearTimeout(timer);resolveReady(data);return}
  if(data.type==='progress'){onProgress(data);return}
  if(data.type==='file'){
   const row=allowed.get(data.sha256);if(!row||!(data.blob instanceof Blob)||data.blob.size!==row.bytes){rejectReady(Error('Invalid cache file proof'));return}onFile({sha256:row.sha256,blob:data.blob});return;
  }
  if(data.type==='response'&&!data.id&&!data.ok){clearTimeout(timer);rejectReady(Error(data.error??'资源缓存连接失败'));return}
  const job=pending.get(data.id);if(!job)return;pending.delete(data.id);job.stop();
  if(data.ok){
   if(job.sha256){const row=allowed.get(job.sha256),value=data.value;if(value?.sha256!==row.sha256||!(value.blob instanceof Blob)||value.blob.size!==row.bytes){job.reject(Error('Invalid cache file proof'));return}onFile(value)}
   job.resolve(data.value);
  }else{const error=Error(data.error??'资源缓存失败');error.name=data.name??'Error';const details=sanitizeResourceFailure(data.resourceFailure);if(details)error.resourceFailure=details;job.reject(error)}
 };
 function dispose(graceful=false){clearTimeout(closingTimer);channel.port1.close();frame.remove();resolveClose?.({graceful})}
 document.body.append(frame);
 async function command(type,value={},signal){
  if(closed)throw Error('Cache bridge closed');signal?.throwIfAborted();await ready;signal?.throwIfAborted();const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{const abort=()=>{pending.delete(id);channel.port1.postMessage({type:'cancel',id,nonce,planId:plan.id});reject(signal.reason)};pending.set(id,{resolve,reject,sha256:type==='get'?value.sha256:null,stop:()=>signal?.removeEventListener('abort',abort)});signal?.addEventListener('abort',abort,{once:true});channel.port1.postMessage({type,id,nonce,planId:plan.id,...value});});
 }
 return {plan,ready,command,get(sha256,{signal}={}){if(!allowed.has(sha256))return Promise.reject(Error('Unregistered cache object'));return command('get',{sha256},signal)},close(){if(closingPromise)return closingPromise;closed=true;clearTimeout(timer);rejectReady(Error('Cache bridge closed'));for(const job of pending.values()){job.stop();job.reject(Error('Cache bridge closed'))}pending.clear();closingPromise=new Promise(resolve=>resolveClose=resolve);if(!connected)dispose();else{closingId=crypto.randomUUID();closingTimer=setTimeout(()=>dispose(),3000);channel.port1.postMessage({type:'pause',disconnect:true,id:closingId,nonce,planId:plan.id})}return closingPromise}};
}

// 仅在缓存写入空间耗尽时放弃持久化；不吞掉摘要错误、非法键或主动取消。
export function createForegroundReader({client,files,onFallback=()=>{}}){
 const rows=new Map(client.plan.rows.map(row=>[row.sha256,row]));let unwritable=false;
 const validate=(value,row)=>{if(value?.sha256!==row.sha256||!(value.blob instanceof Blob)||value.blob.size!==row.bytes)throw Error('Invalid foreground resource proof');return value};
 return {
  async read(sha256,{signal}={}){signal?.throwIfAborted();const row=rows.get(sha256);if(!row)throw Error('Unregistered foreground resource');if(files.has(sha256))return validate(files.get(sha256),row);if(unwritable)return {sha256,direct:true};try{return validate(await client.get(sha256,{signal}),row)}catch(error){signal?.throwIfAborted();if(error.name!=='QuotaExceededError')throw error;unwritable=true;onFallback(error);return {sha256,direct:true}}},
  reset(){unwritable=false},
 };
}
