import {makeResourcePlan} from './plan.mjs';
import {sanitizeResourceFailure} from './download.mjs';
import {openChunkStore} from './store.mjs';
import {createDownloadSession} from './scheduler.mjs';
let plan,store,rows,opening,session,used=false;const jobs=new Map(),requests=new Map();
const send=value=>postMessage(value);
onmessage=async({data:m})=>{
 try{
  if(m?.type==='init'){
   if(opening)throw Error('Cache already initialized');
   plan=makeResourcePlan(m.manifest,m.entry,{sharedEngine:m.sharedEngine});if(plan.id!==m.planId)throw Error('Cache plan differs');rows=new Map(plan.rows.map(r=>[r.sha256,r]));
   opening=(async()=>{store=await openChunkStore();session=createDownloadSession({plan,store,onProgress:p=>send({type:'progress',...p}),onFile:file=>{if(!jobs.get(file.sha256)?.waiters.size)send({type:'file',...file})}});await session.ready})();await opening;
   send({type:'ready',backend:store.backend,estimate:await navigator.storage.estimate(),progress:session.status()});return;
  }
  if(!opening||m.planId!==plan.id||!/^[a-f0-9-]{36}$/.test(m.id??''))return;await opening;
  const respond=value=>send({type:'response',id:m.id,ok:true,value});
  if(m.type==='cancel'){const job=requests.get(m.id);if(job){job.waiters.delete(m.id);requests.delete(m.id);if(!job.waiters.size)job.controller.abort()}return}
  if(m.type==='status'){const objects=[];for(const row of rows.values()){const meta=await store.meta(row.sha256);if(meta)objects.push({sha256:row.sha256,complete:meta.complete,bytes:meta.bytes,committed:meta.parts.reduce((n,p)=>n+p.size,0),parts:meta.parts.slice(0,4)})}respond({backend:store.backend,planId:plan.id,objects,progress:session.status(),diagnostics:await store.diagnostics()});return}
  if(m.type==='pause'){if(m.disconnect===true){await session.close();await store.close();respond({closed:true})}else if(Object.hasOwn(m,'foregroundBusy'))respond(await session.setForegroundBusy(m.foregroundBusy));else respond(await session.pause());return}
  if(m.type==='start'){if(m.mode!==undefined)await session.setMode(m.mode);if(m.prepareOnly===true){respond(session.status());return}used=true;if(m.resume===true)await session.resume();else await session.start();respond(m.wait===true?await session.waitForComplete():session.status());return}
  if(m.type==='clear'){if(used)throw Error('Active resource plan cannot be cleared');await session.close();respond(await session.clear());return}
  if(m.type!=='get'||!rows.has(m.sha256))throw Error('Unregistered cache command or object');used=true;
  let job=jobs.get(m.sha256);
  if(job?.controller.signal.aborted){try{await job.promise}catch{}job=null}
  if(!job){
   const controller=new AbortController(),waiters=new Set();job={controller,waiters,promise:null};jobs.set(m.sha256,job);
   job.promise=session.demand(m.sha256,{signal:controller.signal}).finally(()=>{if(jobs.get(m.sha256)===job)jobs.delete(m.sha256)});
  }
  job.waiters.add(m.id);requests.set(m.id,job);
  try{const blob=await job.promise;if(job.waiters.has(m.id))respond({sha256:m.sha256,blob})}finally{requests.delete(m.id);job.waiters.delete(m.id)}
 }catch(error){send({type:'response',id:m?.id,ok:false,name:error.name,resourceFailure:sanitizeResourceFailure(error.resourceFailure),error:String(error.message??'缓存失败').slice(0,240)})}
};
