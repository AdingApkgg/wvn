// 运行区只接收可信父页交来的已校验公共 Blob，不接触来源持久存储。
const mime=value=>String(value).toLowerCase().replace(/;\s*/g,';');
import {workerSource} from './local-worker.mjs';
export function createLocalResources(resolver,initialFiles=[],{load,urls=globalThis.URL,fetcher=globalThis.fetch.bind(globalThis)}={}){
 const registered=new Map(),scoped=new Map(),files=new Map(),mapped=new Map(),rowForURL=new Map(),owned=new Set(),bodies=new Map(),workerSpecs=new Map(),workers=new Map();let closed=false;
 const create=urls.createObjectURL.bind(urls),revoke=urls.revokeObjectURL.bind(urls);
 for(const path of new Set([...resolver.files.keys(),...resolver.engines.keys()])){
  let row;try{row=resolver.row(path)}catch{continue}
  scoped.set(path,row);
  const previous=registered.get(row.sha256);if(previous&&previous.bytes!==row.bytes)throw Error('Conflicting local resource size');
  if(previous)previous.types.add(mime(row.contentType));else registered.set(row.sha256,{bytes:row.bytes,types:new Set([mime(row.contentType)])});
 }
 const check=()=>{if(closed)throw Error('Local resource run closed')};
 function put(file){
  check();const row=registered.get(file?.sha256);
  if(!row||!(file.blob instanceof Blob)||file.blob.size!==row.bytes||!row.types.has(mime(file.blob.type)))throw Error('Invalid local resource proof');
  // 相同 SHA 的正文不可变；重复回执不撤销正在被原生元素使用的 URL。
  if(!files.has(file.sha256)){files.set(file.sha256,file.blob);for(const state of workers.values()){void updateWorker(state,file.sha256)}}
 }
 function createURL(blob){check();if(!(blob instanceof Blob))throw Error('Invalid runtime Blob');const url=create(blob);owned.add(url);bodies.set(url,blob);return url}
 function resolve(input,relative){
  check();const value=input instanceof Request?input.url:String(input);
  if(value.startsWith('blob:')){if(!owned.has(value))throw Error('Unowned resource Blob URL');return value}
  if(!value||value.startsWith('#')||value.startsWith('data:'))return value;
  const row=resolver.row(value,relative),blob=files.get(row.sha256);if(!blob)return row.url;
  const key=row.path+';'+row.sha256+';'+mime(row.contentType);
  if(!mapped.has(key)){const url=createURL(mime(blob.type)===mime(row.contentType)?blob:blob.slice(0,blob.size,row.contentType));mapped.set(key,url);rowForURL.set(url,row)}
  return mapped.get(key);
 }
 function path(input,relative){check();const value=String(input);if(value.startsWith('blob:')){const row=rowForURL.get(value);if(!row)throw Error('Blob has no registered resource path');return row.path}return resolver.path(value,relative)}
 const logical=input=>{check();const row=String(input).startsWith('blob:')?rowForURL.get(String(input)):resolver.row(input);if(!row)throw Error('Blob has no logical resource base');return new URL(row.path.split('/').map(encodeURIComponent).join('/'),resolver.base).href};
 function workerConfig(input,options,onlySha){
  const source=resolve(input);let base;try{base=logical(input)}catch{base=resolver.base+'index.html'}
  const entries=[],fallbacks=[],known=new Set(),publicBodies=new Map();
  for(const [path,row] of scoped){
   if(onlySha&&row.sha256!==onlySha)continue;
   const target=resolve(path),encoded=path.split('/').map(encodeURIComponent).join('/');
   entries.push([row.url,target],[new URL(encoded,resolver.base).href,target],[new URL('/'+encoded,resolver.base).href,target],[new URL('/__engines/resource/'+resolver.manifest.engineResources.id+'/'+encoded,resolver.base).href,target]);
   if(bodies.has(target)){known.add(target);publicBodies.set(target,bodies.get(target));fallbacks.push([target,row.url])}
  }
  // 只有当前 worker 源码与有效清单正文进入专用端口；不枚举可能含导出存档的自有 Blob。
  if(bodies.has(source)){known.add(source);publicBodies.set(source,bodies.get(source))}
  return {source,base,entries,fallbacks,known:[...known],bodies:[...publicBodies]};
 }
 function workerURL(input,options={}){
  check();options??={};if(options.type&&!['classic','module'].includes(options.type))throw Error('Invalid worker type');
  const nonce=crypto.randomUUID(),plan=resolver.manifest.inventorySha256,script=workerSource({nonce,plan,module:options.type==='module'});
  const url='data:text/javascript;charset=utf-8,'+encodeURIComponent(script);
  workerSpecs.set(url,{nonce,plan,input,options,config:workerConfig(input,options)});return url;
 }
 async function prepareWorkerConfig(config,state){
  const inline=[];
  const values=[...config.bodies].sort(([a],[b])=>a===config.source?-1:b===config.source?1:0);
  for(const [url,blob] of values){state.allowed.set(url,blob);if(!state.inlineKnown.has(url)&&blob.size<=state.inlineBudget&&(url===config.source||blob.size<=65536||/javascript|ecmascript/.test(blob.type))){state.inlineKnown.add(url);state.inlineBudget-=blob.size;try{const bytes=new Uint8Array(await blob.arrayBuffer());inline.push([url,bytes])}catch(error){state.inlineKnown.delete(url);state.inlineBudget+=blob.size;throw error}}}
  return {...config,bodies:undefined,files:values.map(([url,blob])=>[url,{size:blob.size,type:blob.type}]),inline};
 }
 async function updateWorker(state,sha256){
  try{const config=await prepareWorkerConfig(workerConfig(state.input,state.options,sha256),state);if(workers.has(state.worker))state.port.postMessage({type:'files',nonce:state.nonce,plan:state.plan,entries:config.entries,files:config.files,inline:config.inline})}catch(error){console.error('WVN resource worker update',error.message)}
 }
 function attachWorker(worker,url){
  check();const spec=workerSpecs.get(url);if(!spec)throw Error('Unknown local worker');workerSpecs.delete(url);
  const channel=new MessageChannel(),state={...spec,worker,port:channel.port1,allowed:new Map(),reads:new Map(),inlineKnown:new Set(),inlineBudget:8*1024**2};workers.set(worker,state);
  const reply=(request,value,transfer=[])=>state.port.postMessage({nonce:spec.nonce,plan:spec.plan,id:request.id,...value},transfer);
  state.port.onmessage=async({data})=>{
   if(!workers.has(worker)||data?.nonce!==spec.nonce||data.plan!==spec.plan)return;
   if(data.type==='error'){detachWorker(worker);worker.dispatchEvent(new ErrorEvent('error',{message:data.error,filename:spec.config.base,cancelable:true}));return}
   if(!/^[a-f0-9-]{36}$/.test(data.id??''))return;
   try{
    if(data.type==='open'){
     const blob=state.allowed.get(data.url);if(!blob||state.reads.size>=8||!Number.isSafeInteger(data.start)||!Number.isSafeInteger(data.end)||data.start<0||data.end<data.start||data.end>=blob.size)throw Error('Invalid public worker range');
     const readId=crypto.randomUUID();state.reads.set(readId,{blob,at:data.start,end:data.end});reply(data,{ok:true,readId});
    }else if(data.type==='read'){
     const read=state.reads.get(data.readId);if(!read||read.busy)throw Error('Worker read is not active');
     if(read.at>read.end){state.reads.delete(data.readId);reply(data,{ok:true,done:true});return}
     read.busy=true;const end=Math.min(read.end+1,read.at+65536),bytes=new Uint8Array(await read.blob.slice(read.at,end).arrayBuffer());read.at=end;read.busy=false;if(workers.has(worker))reply(data,{ok:true,bytes,done:false},[bytes.buffer]);
    }else if(data.type==='cancel'){state.reads.delete(data.readId);reply(data,{ok:true})}
   }catch(error){reply(data,{ok:false,error:String(error.message).slice(0,180)})}
  };
  void prepareWorkerConfig(spec.config,state).then(config=>{if(workers.has(worker))worker.postMessage({type:'WVN_LOCAL_WORKER_INIT',nonce:spec.nonce,plan:spec.plan,config},[channel.port2]);else channel.port2.close()}).catch(error=>{channel.port2.close();if(workers.has(worker)){worker.terminate();worker.dispatchEvent(new ErrorEvent('error',{message:error.message,filename:spec.config.base,cancelable:true}))}});
 }
 function detachWorker(worker){const state=workers.get(worker);if(state){state.port.close();state.allowed.clear();state.reads.clear();workers.delete(worker)}}
 async function prepare(input,signal){check();signal?.throwIfAborted();const value=input instanceof Request?input.url:String(input);if(!load||!value||value.startsWith('#')||value.startsWith('blob:')||value.startsWith('data:'))return;const row=resolver.row(value);if(!files.has(row.sha256)){const file=await load(row.sha256,signal);signal?.throwIfAborted();if(file?.sha256===row.sha256&&file.direct===true)return;put(file)}}
 const api={put,path,prepare,has(input){check();return files.has(resolver.row(input).sha256)},resolve,createURL,logical,workerURL,attachWorker,detachWorker,
  async fetch(input,options){check();await prepare(input,options?.signal??input?.signal);const url=resolve(input);return fetcher(input instanceof Request?new Request(url,input):url,{...options,credentials:'omit',redirect:'error'})},
  close(){if(closed)return;closed=true;for(const [worker,state] of workers){state.port.close();worker.terminate()}workers.clear();workerSpecs.clear();bodies.clear();for(const url of owned)revoke(url);owned.clear();mapped.clear();rowForURL.clear();files.clear()},
 };
 try{for(const file of initialFiles)put(file)}catch(error){api.close();throw error}
 return api;
}
