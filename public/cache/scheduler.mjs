// 公共资源调度；不接触账号来源、存档数据库或游戏写入通道。
import {downloadObject,sanitizeResourceFailure} from './download.mjs';
import {publicFileViewReserve} from './store.mjs';
const abortError=message=>new DOMException(message,'AbortError');
const modes=new Set(['demand','background','complete']),reserve=256*1024**2;
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',abort);resolve()}function abort(){clearTimeout(timer);reject(signal.reason)}signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});
export function createDownloadSession({plan,store,download=downloadObject,estimate=()=>navigator.storage.estimate(),onProgress=()=>{},onFile=()=>{}}){
 if(!plan?.id||!Array.isArray(plan.rows)||!Number.isSafeInteger(plan.totalBytes))throw Error('Invalid download plan');
 const rows=new Map(plan.rows.map(row=>[row.sha256,row])),owner=crypto.randomUUID(),active=new Map(),verified=new Map(),demands=new Map(),failures=new Map(),waiting=new Set();
 let bulkLimit=4,mode='background',paused=false,reason='',closed=false,started=false,cursor=0,verifiedBytes=0,protection,leader,heartbeat,timer,pumping=false,again=false,quotaChecked=false,lastError,lastFailure,closePromise,capacityController,capacityTask;
 let lastObjectProgress={},peakBufferBytes=0,foregroundBusy=false,quietUntil=0,quietTimer;
 let stateWrites=Promise.resolve(),transferred=0,lastTick=Date.now(),lastBytes=0,speed=0;
 const persist=()=>{const value={mode,paused,reason,bulkLimit,...(lastFailure?{lastFailure}:{})};stateWrites=stateWrites.then(()=>store.state(plan.id,value));return stateWrites};
 const status=()=>({...lastObjectProgress,peakBufferBytes,foregroundBusy,mode,paused,reason,...(lastFailure?{lastFailure}:{}),status:closed?'closed':verified.size===rows.size?'complete':lastError?'failed':reason.startsWith('quota')?'quota':paused?'paused':!started?'idle':mode==='demand'?'demand':'downloading',verifiedBytes,totalBytes:plan.totalBytes,completed:verified.size,total:rows.size,activeBytes:[...active.values()].reduce((n,j)=>n+j.loaded,0),speed,failures:[...failures].map(([sha256,error])=>({sha256,error:error.message})),queued:Math.max(0,rows.size-verified.size-active.size),pendingDemands:demands.size,active:active.size});
 function report(immediate=false){if(closed)return;if(immediate){clearTimeout(timer);timer=undefined;const now=Date.now();if(now-lastTick>=200){speed=Math.max(0,(transferred-lastBytes)*1000/(now-lastTick));lastTick=now;lastBytes=transferred}onProgress(status());return}if(!timer)timer=setTimeout(()=>{timer=undefined;report(true)},200)}
 function settle(){if(verified.size===rows.size){for(const item of waiting)item.resolve(status());waiting.clear();report(true)}else if(lastError||reason.startsWith('quota')){const error=lastError??Object.assign(Error('资源缓存空间不足或无法估算'),{name:'QuotaExceededError'});for(const item of waiting)item.reject(error);waiting.clear()}}
 const ready=(async()=>{
  const [saved,preferences]=await Promise.all([store.state(plan.id),store.state('preferences')]);if(modes.has(preferences?.mode??saved?.mode))mode=preferences?.mode??saved.mode;paused=saved?.paused===true;reason=paused?String(saved.reason??'user'):'';bulkLimit=Number.isInteger(saved?.bulkLimit)&&saved.bulkLimit>=1&&saved.bulkLimit<=4?saved.bulkLimit:['failed','rate-limit'].includes(reason)?1:4;
  if(rows.has(saved?.lastFailure?.sha256)){const details=sanitizeResourceFailure(saved.lastFailure.details);if(details)lastFailure={sha256:saved.lastFailure.sha256,details}}
  if(!closed)protection=await store.protect(plan,owner);
  heartbeat=setInterval(()=>void renew().then(()=>pump()).catch(fail),10000);heartbeat.unref?.();report(true);
 })();ready.catch(()=>{});
 async function renew(){if(closed)return;for(const job of active.values())if(job.token){const token=await store.renew(job.token);if(!token)job.controller.abort(Object.assign(Error('Public resource lease expired'),{name:'LeaseLostError'}));else job.token=token}if(protection){const next=await store.renew(protection);if(!next)throw Error('Resource plan protection expired');protection=next}if(leader)leader=await store.renew(leader)}
 function fail(error){if(closed)return;lastError=error;lastFailure=undefined;paused=true;reason='failed';for(const job of active.values())job.controller.abort(error);void persist().catch(()=>{});report(true);settle()}
 async function quota(){
  if(quotaChecked)return true;
  let info=await estimate().catch(()=>null);if(closed||paused||mode==='demand')return false;let held=0;for(const meta of await store.list()){const row=rows.get(meta.sha256??meta.key);if(row&&meta.bytes===row.bytes&&Array.isArray(meta.parts))held+=Math.min(row.bytes,meta.parts.reduce((n,p)=>Number.isSafeInteger(p.size)&&p.size>0?n+p.size:n,0))}
  const need=Math.max(0,plan.totalBytes-held),margin=Math.max(reserve,Math.ceil(need*.1))+publicFileViewReserve(plan.rows,store.backend);
  if(closed||paused||mode==='demand')return false;
  if(Number.isFinite(info?.quota)&&info.quota>0&&Number.isFinite(info?.usage)&&info.usage>=0&&info.quota-info.usage<need+margin&&store.confirmCapacity){
   const controller=new AbortController();capacityController=controller;
   const task=Promise.resolve().then(()=>store.confirmCapacity(need+margin,{signal:controller.signal}));capacityTask=task;
   try{info=await task}catch{if(controller.signal.aborted)return false;info=null}finally{if(capacityController===controller)capacityController=undefined;if(capacityTask===task)capacityTask=undefined}
   if(controller.signal.aborted||closed||paused||mode==='demand')return false;
  }
  if(!Number.isFinite(info?.quota)||!Number.isFinite(info?.usage)||info.quota-info.usage<need+margin){paused=true;reason='quota-estimate';await persist();report(true);settle();return false}quotaChecked=true;return true;
 }
 function subscribe(item,sha,signal){
  const subscriber=Symbol();item.users.add(subscriber);return new Promise((resolve,reject)=>{
   const cleanup=()=>{signal?.removeEventListener('abort',abort);item.users.delete(subscriber)};
   const abort=()=>{cleanup();reject(signal.reason);if(!item.users.size&&demands.get(sha)===item){demands.delete(sha);active.get(sha)?.controller.abort(abortError('No foreground subscribers'));cursor=0}};
   signal?.addEventListener('abort',abort,{once:true});item.promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});if(signal?.aborted)abort();
  });
 }
 async function acquire(row,signal){for(;;){signal.throwIfAborted();const token=await store.lease('object/'+row.sha256,owner);if(token)return token;await sleep(200,signal)}}
 function launch(row,foreground){
  const controller=new AbortController(),job={row,foreground,controller,promise:null,token:null,loaded:0,progressAt:0};active.set(row.sha256,job);
  job.promise=(async()=>{job.token=await acquire(row,controller.signal);const blob=await download(row,{store:store.scoped(job.token),signal:controller.signal,foreground:()=>job.foreground,onProgress:p=>{const loaded=Math.min(row.bytes,Math.max(0,p.loaded??0));transferred+=Math.max(0,loaded-job.progressAt);job.loaded=loaded;job.progressAt=loaded;job.peak=p.peakBufferBytes??0;peakBufferBytes=Math.max(peakBufferBytes,[...active.values()].reduce((n,j)=>n+(j.peak??0),0));lastObjectProgress={sha256:row.sha256,committed:p.committed,readerMode:p.readerMode};report()}});controller.signal.throwIfAborted();if(!await store.renew(job.token))throw Object.assign(Error('Public resource lease expired'),{name:'LeaseLostError'});if(!(blob instanceof Blob)||blob.size!==row.bytes)throw Error('Invalid verified resource result');verified.set(row.sha256,blob);verifiedBytes+=row.bytes;failures.delete(row.sha256);onFile({sha256:row.sha256,blob});const demand=demands.get(row.sha256);if(demand){demands.delete(row.sha256);demand.resolve(blob)}return blob;
  })().catch(async error=>{
   const requested=demands.get(row.sha256);
   if(controller.signal.aborted&&error.name==='AbortError'&&!closed){return}
   const details=sanitizeResourceFailure(error.resourceFailure);lastFailure=details?{sha256:row.sha256,details}:undefined;
   if(error.name==='QuotaExceededError'){paused=true;reason='quota-write';lastError=undefined;await persist();for(const other of active.values())if(other!==job&&!other.foreground)other.controller.abort(abortError('Quota paused'));}
   else if(!closed){failures.set(row.sha256,error);lastError=error;paused=true;reason=error.name==='RateLimitError'?'rate-limit':'failed';if(reason==='rate-limit')bulkLimit=1;if(reason==='rate-limit')for(const other of active.values())if(other!==job&&!other.foreground)other.controller.abort(abortError('Service rate limited'));await persist()}
   if(requested){demands.delete(row.sha256);requested.reject(error)}settle();
  }).finally(async()=>{if(job.token)await store.release(job.token);if(active.get(row.sha256)===job)active.delete(row.sha256);if(!closed){report();settle();pump()}});
  job.promise.catch(fail);return job;
 }
 function next(){while(cursor<plan.rows.length){const row=plan.rows[cursor++];if(!verified.has(row.sha256)&&!active.has(row.sha256)&&!failures.has(row.sha256))return row}return null}
 async function pump(){
  if(pumping){again=true;return}pumping=true;
  try{
   await ready;if(closed)return;
   for(const [sha,demand] of demands){if(verified.has(sha)){demands.delete(sha);demand.resolve(verified.get(sha));continue}const job=active.get(sha);if(job){job.foreground=true;continue}if(active.size<4)launch(rows.get(sha),true)}
   if(closed||!started||paused||lastError||foregroundBusy||mode==='demand'||demands.size||[...active.values()].some(job=>job.foreground))return;
   // 原生进度按200ms合并；空闲至少一个周期后再占后台带宽，避免资源切换间反复抢回连接。
   if(quietUntil>performance.now()){clearTimeout(quietTimer);quietTimer=setTimeout(()=>{quietTimer=undefined;void pump()},Math.ceil(quietUntil-performance.now()));return;}
   if(!await quota())return;leader=leader?await store.renew(leader):await store.lease('plan/'+plan.id,owner);if(!leader)return;
   if(closed||paused||foregroundBusy||quietUntil>performance.now()||mode==='demand'||demands.size||[...active.values()].some(job=>job.foreground))return;const limit=mode==='complete'?bulkLimit:1;while(active.size<limit){const row=next();if(!row)break;launch(row,false)}
   settle();
  }catch(error){fail(error)}finally{pumping=false;if(again){again=false;queueMicrotask(pump)}}
 }
 return {
  ready,status,
  async setForegroundBusy(value){if(typeof value!=='boolean')throw Error('Invalid native foreground activity');await ready;if(closed)throw Error('Download session closed');if(foregroundBusy===value)return status();foregroundBusy=value;clearTimeout(quietTimer);quietUntil=value?0:performance.now()+200;if(value){cursor=0;for(const job of active.values())if(!job.foreground)job.controller.abort(abortError('Native foreground priority'))}report(true);void pump();return status()},
  async setMode(value){await ready;if(!modes.has(value))throw Error('Invalid resource loading mode');mode=value;cursor=0;if(mode==='demand')capacityController?.abort(abortError('Mode changed'));await store.state('preferences',{mode});await persist();if(mode==='demand')for(const job of active.values())if(!job.foreground)job.controller.abort(abortError('Mode changed'));report(true);void pump()},
  async start(){await ready;started=true;void pump();return status()},
  async pause(){await ready;paused=true;reason='user';capacityController?.abort(abortError('User paused'));for(const job of active.values())if(!job.foreground)job.controller.abort(abortError('User paused'));await persist();report(true);return status()},
  async resume(){await ready;if(closed)throw Error('Download session closed');paused=false;reason='';lastError=undefined;lastFailure=undefined;failures.clear();quotaChecked=false;cursor=0;started=true;await persist();void pump();return status()},
  async demand(sha,{signal}={}){signal?.throwIfAborted();await ready;signal?.throwIfAborted();if(closed)throw Error('Download session closed');if(!rows.has(sha))throw Error('Unregistered cache object');if(verified.has(sha))return verified.get(sha);let item=demands.get(sha);if(!item){if(demands.size>=64)throw Error('Too many foreground resources');let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});item={promise,resolve,reject,users:new Set()};demands.set(sha,item)}const result=subscribe(item,sha,signal),promoted=active.get(sha);if(promoted)promoted.foreground=true;for(const job of active.values())if(!job.foreground&&job.row.sha256!==sha)job.controller.abort(abortError('Foreground priority'));cursor=0;void pump();return result},
  async waitForComplete(){await ready;if(verified.size===rows.size)return status();if(lastError)throw lastError;if(reason.startsWith('quota'))throw Object.assign(Error('资源缓存空间不足或无法估算'),{name:'QuotaExceededError'});return new Promise((resolve,reject)=>waiting.add({resolve,reject}))},
  async clear(){await ready;if(!closed)throw Error('Active resource plan cannot be cleared');await closePromise;return store.clearPlan(plan)},
  close(){if(closePromise)return closePromise;closed=true;clearTimeout(timer);clearTimeout(quietTimer);clearInterval(heartbeat);const error=abortError('Download session closed');capacityController?.abort(error);for(const job of active.values())job.controller.abort(error);for(const demand of demands.values())demand.reject(error);demands.clear();for(const item of waiting)item.reject(error);waiting.clear();closePromise=(async()=>{await ready.catch(()=>{});clearInterval(heartbeat);await capacityTask?.catch(()=>{});await Promise.allSettled([...active.values()].map(job=>job.promise));await stateWrites;if(leader)await store.release(leader);if(protection)await store.release(protection)})();return closePromise},
 };
}
