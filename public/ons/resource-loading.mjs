// 观察真实资源生命周期；不额外读取、复制响应，也不改变凭据、重试或引擎回调。
const safe=fn=>{try{return fn()}catch{/* 反馈失败不能改变游戏行为。 */}};
export function validateResourceProgress(value){
 if(!value||value.type!=='resource-progress'||!Number.isSafeInteger(value.active)||value.active<0||value.active>100000)return null;
 if(value.failed!==undefined&&typeof value.failed!=='boolean')return null;
 const result={active:value.active,...(value.failed?{failed:true}:{})};
 if(value.loaded!==undefined||value.total!==undefined){
  if(!Number.isFinite(value.loaded)||!Number.isFinite(value.total)||value.loaded<0||value.total<=0||value.loaded>value.total)return null;
  result.loaded=value.loaded;result.total=value.total;
 }
 return result;
}
export function createResourceReporter(send,{now=()=>Date.now()}={}){
 let enabled=false,closed=false,lastAt=-Infinity,last=null;const batch=new Set();
 function emit(){
  if(!enabled||closed)return;
  const entries=[...batch],active=entries.filter(x=>!x.done).length;
  const known=entries.length>0&&entries.every(x=>x.total>0);
  const value={type:'resource-progress',active,...(entries.some(x=>x.failed)?{failed:true}:{}),...(known?{loaded:entries.reduce((sum,x)=>sum+x.loaded,0),total:entries.reduce((sum,x)=>sum+x.total,0)}:{})};
  if(JSON.stringify(value)===JSON.stringify(last))return;
  if(active===last?.active&&!!value.failed===!!last?.failed&&known===Number.isFinite(last?.total)&&now()-lastAt<200)return;
  last=value;lastAt=now();safe(()=>send(value));
 }
 return {
  activate(){enabled=true;emit()},close(){closed=true;batch.clear()},
  begin(){
   if([...batch].every(x=>x.done))batch.clear();
   const item={loaded:0,total:0,done:false,failed:false};if(!closed)batch.add(item);emit();
   return {progress(loaded,total){if(item.done||closed)return;if(Number.isFinite(loaded)&&Number.isFinite(total)&&total>0&&loaded>=0&&loaded<=total){item.loaded=loaded;item.total=total;emit()}},end(failed=false){if(item.done||closed)return;item.done=true;item.failed=failed;if(item.total)item.loaded=item.total;emit()}};
  },
 };
}
export function observeResourceRequests(win,startup,classify,resources){
 const cleanups=new Set(),requests=new WeakMap(),pending=new Set();let closed=false;
 const kindOf=resource=>safe(()=>classify(resource));
 function begin(resource){
  const kind=resource==null?null:kindOf(resource);if(!kind||closed)return null;
  safe(()=>startup.phase('downloading',kind));const report=resources?.begin();
  const item={url:safe(()=>new URL(typeof resource==='string'?resource:resource?.url??resource?.href,win.document?.baseURI).href),at:win.performance?.now?.()??0,done:false,cleanups:new Set(),
   progress(loaded,total){safe(()=>{startup.download?.(kind,loaded,total);report?.progress(loaded,total)})},
   end(failed=false){if(item.done)return;item.done=true;pending.delete(item);for(const cleanup of [...item.cleanups]){safe(cleanup);cleanups.delete(cleanup)}item.cleanups.clear();safe(()=>report?.end(failed))}};
  pending.add(item);return item;
 }
 function wrapMethod(object,key,wrap,scope){
  const original=object?.[key];if(typeof original!=='function')return;
  const own=Object.getOwnPropertyDescriptor(object,key),wrapper=wrap(original);
  safe(()=>{object[key]=wrapper;if(object[key]===wrapper){const cleanup=()=>{if(object[key]===wrapper){if(own)Object.defineProperty(object,key,own);else delete object[key]}};cleanups.add(cleanup);scope?.add(cleanup)}});
 }
 function observePromise(promise,ok,fail){safe(()=>{promise.then(value=>safe(()=>ok(value)),()=>safe(fail))});return promise;}
 function body(response,item){
  if(item.done||closed)return;
  item.timing=true;
  if(!response.ok){item.end(true);return}
  if(!response.body){item.end();return}
  // 保持原 Response、消费 Promise 与字节不变；arrayBuffer 等消费结束才算完成。
  for(const name of ['arrayBuffer','blob','text','json','formData','bytes'])wrapMethod(response,name,original=>function(...args){
   try{return observePromise(original.apply(this,args),()=>item.end(),()=>item.end(true))}catch(error){item.end(true);throw error}
  },item.cleanups);
  let loaded=0;const length=Number(response.headers?.get('content-length')),encoded=response.headers?.get('content-encoding');
  const total=!encoded&&Number.isFinite(length)&&length>0?length:0;
  wrapMethod(response.body,'getReader',original=>function(...args){
   const reader=original.apply(this,args);
   wrapMethod(reader,'read',read=>function(...values){try{return observePromise(read.apply(this,values),chunk=>{if(chunk.done)item.end();else {loaded+=chunk.value?.byteLength??0;if(total)item.progress(loaded,total)}},()=>item.end(true))}catch(error){item.end(true);throw error}},item.cleanups);
   wrapMethod(reader,'cancel',cancel=>function(...values){try{return observePromise(cancel.apply(this,values),()=>item.end(),()=>item.end(true))}catch(error){item.end(true);throw error}},item.cleanups);
   return reader;
  },item.cleanups);
 }
 const originalFetch=win.fetch;
 const fetchWrapper=function(resource,...args){
  const method=String(args[0]?.method??resource?.method??'GET').toUpperCase(),item=method==='GET'?begin(resource):null;
  try{const promise=originalFetch.call(this,resource,...args);if(item)observePromise(promise,response=>body(response,item),()=>item.end(true));return promise}catch(error){item?.end(true);throw error}
 };
 if(typeof originalFetch==='function'){win.fetch=fetchWrapper;cleanups.add(()=>{if(win.fetch===fetchWrapper)win.fetch=originalFetch})}
 const prototype=win.XMLHttpRequest?.prototype;
 wrapMethod(prototype,'open',original=>function(method,url,...args){const result=original.call(this,method,url,...args);requests.set(this,String(method).toUpperCase()==='GET'?url:null);return result});
 wrapMethod(prototype,'send',original=>function(...args){
  const item=begin(requests.get(this));let failed=false,remove;
  if(item){
   const progress=event=>item.progress(event.lengthComputable?event.loaded:undefined,event.lengthComputable?event.total:undefined),failure=()=>{failed=true},end=()=>{item.end(failed||this.status>=400);remove()};
   remove=()=>{for(const [name,fn] of [['progress',progress],['error',failure],['abort',failure],['timeout',failure],['loadend',end]])this.removeEventListener(name,fn);cleanups.delete(remove)};
   for(const [name,fn] of [['progress',progress],['error',failure],['abort',failure],['timeout',failure],['loadend',end]])this.addEventListener(name,fn);cleanups.add(remove);
  }
  try{return original.apply(this,args)}catch(error){item?.end(true);remove?.();throw error}
 });
 // 原生流式编译等不经 JS 消费方法的请求，以浏览器的传输完成记录收尾。
 let performanceObserver;
 safe(()=>{if(!win.PerformanceObserver)return;performanceObserver=new win.PerformanceObserver(list=>{for(const entry of list.getEntries()){const item=[...pending].find(x=>x.timing&&x.url===entry.name&&entry.startTime>=x.at-1);if(item)item.end(entry.responseStatus>=400)}});performanceObserver.observe({type:'resource',buffered:false})});
 cleanups.add(()=>performanceObserver?.disconnect());
 // 图片预载（含未挂入 DOM 的 new Image）和音视频缓冲同样可见；保留匿名资源适配器。
 const elements=new WeakMap(),delayedMedia=new WeakMap();
 function watch(element,url,media=false,started=false){
  delayedMedia.get(element)?.();
  if(media&&!started&&element.preload==='none'){
   const remove=()=>{element.removeEventListener('loadstart',start);cleanups.delete(remove);delayedMedia.delete(element)},start=()=>{remove();if(!closed)watch(element,element.currentSrc||element.src,true,true)};
   element.addEventListener('loadstart',start,{once:true});delayedMedia.set(element,remove);cleanups.add(remove);return;
  }
  elements.get(element)?.();const item=begin(url);if(!item)return;
  const success=()=>{item.end();remove()},failure=()=>{item.end(true);remove()};
  const names=media?['loadeddata','canplay','playing','emptied','abort']:['load','abort'];
  const remove=()=>{for(const name of names)element.removeEventListener(name,success);element.removeEventListener('error',failure);cleanups.delete(remove);elements.delete(element)};
  for(const name of names)element.addEventListener(name,success);element.addEventListener('error',failure);elements.set(element,()=>{item.end();remove()});cleanups.add(remove);
 }
 for(const [Type,media] of [[win.HTMLImageElement,false],[win.HTMLMediaElement,true]]){
  const proto=Type?.prototype,descriptor=proto&&Object.getOwnPropertyDescriptor(proto,'src');
  if(descriptor?.set){const setter=function(value){safe(()=>watch(this,value,media));try{return descriptor.set.call(this,value)}catch(error){elements.get(this)?.();throw error}};safe(()=>{Object.defineProperty(proto,'src',{...descriptor,set:setter});cleanups.add(()=>{if(Object.getOwnPropertyDescriptor(proto,'src')?.set===setter)Object.defineProperty(proto,'src',descriptor)})})}
  wrapMethod(proto,'setAttribute',original=>function(name,value){if(String(name).toLowerCase()==='src')safe(()=>watch(this,value,media));return original.call(this,name,value)});
 }
 if(win.document){
  let mutations;safe(()=>{if(!win.MutationObserver)return;const prepare=el=>{if(!elements.has(el)){if(win.HTMLImageElement&&el instanceof win.HTMLImageElement&&!el.complete)watch(el,el.currentSrc||el.src);else if(win.HTMLMediaElement&&el instanceof win.HTMLMediaElement&&el.readyState<2)watch(el,el.currentSrc||el.src,true)}el.querySelectorAll?.('img,video,audio').forEach(prepare)};mutations=new win.MutationObserver(records=>{for(const record of records)if(record.type==='attributes')prepare(record.target);else for(const node of record.addedNodes)prepare(node)});mutations.observe(win.document,{subtree:true,childList:true,attributes:true,attributeFilter:['src']})});cleanups.add(()=>mutations?.disconnect());
  const wait=event=>{const el=event.target;if(win.HTMLMediaElement&&el instanceof win.HTMLMediaElement&&!elements.has(el))watch(el,el.currentSrc||el.src,true,true)},done=event=>elements.get(event.target)?.();
  win.document.addEventListener('loadstart',wait,true);win.document.addEventListener('waiting',wait,true);win.document.addEventListener('playing',done,true);cleanups.add(()=>{win.document.removeEventListener('loadstart',wait,true);win.document.removeEventListener('waiting',wait,true);win.document.removeEventListener('playing',done,true)});
 }
 return()=>{closed=true;for(const item of [...pending])item.end();for(const cleanup of [...cleanups].reverse())safe(cleanup);cleanups.clear()};
}
