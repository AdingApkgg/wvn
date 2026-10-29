const temporary=status=>[408,429,500,502,503,504].includes(status);
const timeout=()=>new DOMException('Resource transfer idle timeout','TimeoutError');
const strong=value=>typeof value==='string'&&/^"[^"\r\n]+"$/.test(value);
// 只恢复公开、不可变资源；账号请求、原生 Range 请求和用户取消不改写。
export function createResilientFetch({fetcher=fetch,allowed=()=>false,idleMs=30000,totalMs=1800000,retries=3,maxBytes=1024**3,delay=(ms,signal)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',abort);resolve()}function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason)}signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
})}={}){
 return async function resourceFetch(input,options){
  const headers=new Headers(options?.headers??input?.headers),method=String(options?.method??input?.method??'GET').toUpperCase();
  if(!['GET','HEAD'].includes(method)||headers.has('range')||!allowed(input))return fetcher(input,options);
  const signal=options?.signal??input?.signal,controller=new AbortController();let retry=0,reader,releaseUpstream=()=>{};
  const abort=()=>controller.abort(signal.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const check=()=>{if(controller.signal.aborted)throw controller.signal.reason??new DOMException('Cancelled','AbortError')};
  const deadline=setTimeout(()=>controller.abort(new DOMException('Resource transfer total timeout','TimeoutError')),totalMs);
  const finish=()=>{clearTimeout(deadline);releaseUpstream();signal?.removeEventListener('abort',abort)};
  async function timed(promise,cancel=()=>{}){
   let timer,listener;const interrupted=new Promise((_,reject)=>{
    listener=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',listener,{once:true});
    timer=setTimeout(()=>{cancel();reject(timeout())},idleMs);
   });
   try{check();return await Promise.race([promise,interrupted])}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',listener)}
  }
  async function again(error){check();if(retry>=retries)throw error;await delay(Math.min(4000,500*2**retry++),controller.signal);check()}
  async function request(resume){
   for(;;){
    check();releaseUpstream();let returned=false;const current=new AbortController(),stop=()=>current.abort(controller.signal.reason);controller.signal.addEventListener('abort',stop,{once:true});
    const release=()=>controller.signal.removeEventListener('abort',stop);
    try{
     const response=await timed(fetcher(input,{...options,...(resume?.has('range')?{cache:'no-store'}:{}),headers:resume??headers,credentials:'omit',redirect:'error',signal:current.signal}),()=>current.abort(timeout()));
     if(temporary(response.status)){void response.body?.cancel().catch(()=>{});throw Error('Resource download failed '+response.status)}
     returned=true;releaseUpstream=release;return response;
    }catch(error){release();await again(error)}finally{if(!returned)release()}
   }
  }
  let response;try{response=await request()}catch(error){finish();throw error}
  if(response.status!==200||!response.body||response.headers.has('content-range')){finish();return response}
  const raw=response.headers.get('content-length'),encoded=response.headers.get('content-encoding');
  const total=!encoded&&raw!==null&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):null,etag=response.headers.get('etag');
  if(total!==null&&total>maxBytes){finish();void response.body.cancel();throw Error('Resource exceeds size limit')}
  reader=response.body.getReader();let received=0;
  const body=new ReadableStream({
   async pull(output){
    try{
     for(;;){
      check();let chunk;
      try{chunk=await timed(reader.read(),()=>{void reader.cancel().catch(()=>{})});if(chunk.done&&total!==null&&received!==total)throw Error('Resource body truncated')}
      catch(error){
       check();if(received&&(!strong(etag)||total===null||received>=total))throw error;
       await again(error);void reader.cancel().catch(()=>{});reader.releaseLock();
       // 单范围 Range 可匿名跨域发送；If-Range 会触发预检。响应仍必须
       // 带回同一强 ETag 和完整范围，验证成功后才拼接，防止跨版本混合。
       const resume=new Headers(headers);if(received)resume.set('range','bytes='+received+'-');
       const next=await request(resume);
       if(received){
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(next.headers.get('content-range')??'');
        if(next.status!==206||!range||Number(range[1])!==received||Number(range[2])!==total-1||Number(range[3])!==total||next.headers.get('etag')!==etag||next.headers.get('content-encoding')){
         void next.body?.cancel().catch(()=>{});throw Error('Resource resume range or validator differs');
        }
       }else if(next.status!==200||total!==null&&Number(next.headers.get('content-length'))!==total||etag&&next.headers.get('etag')!==etag){void next.body?.cancel().catch(()=>{});throw Error('Resource restart differs')}
       if(!next.body)throw Error('Resource resume body missing');reader=next.body.getReader();continue;
      }
      if(chunk.done){finish();reader.releaseLock();output.close();return}
      received+=chunk.value.byteLength;if(received>maxBytes||total!==null&&received>total)throw Error('Resource body exceeds size');output.enqueue(chunk.value);return;
     }
    }catch(error){finish();void reader?.cancel().catch(()=>{});output.error(error)}
   },
   cancel(reason){finish();controller.abort(reason??new DOMException('Cancelled','AbortError'));return reader.cancel(reason)},
  });
  const result=new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  Object.defineProperty(result,'url',{value:response.url});return result;
 };
}

// 老引擎的异步二进制 XHR 只使用 onload/onerror。保留原生事件和响应类型，
// 小资源失败后有限重读；大启动包由上面的流式读取器预载并续传。
export function installResilientXHR(win,allowed,{idleMs=30000,retries=3}={}){
 const prototype=win.XMLHttpRequest.prototype,open=prototype.open,send=prototype.send,abort=prototype.abort,setHeader=prototype.setRequestHeader;
 const requests=new WeakMap();
 prototype.open=function(method,url,async=true,...rest){
  requests.get(this)?.finish?.();const value=open.call(this,method,url,async,...rest);
  const xhr=this,state={method,url,async,rest,headers:[]},events=['load','error','timeout','abort','loadend'];
  // 必须先于引擎注册的 onload/onerror，否则旧引擎会在重试前终止加载。
  const event=e=>state.handle?.(e),progress=e=>state.progress?.(e);
  for(const name of events)xhr.addEventListener(name,event,true);xhr.addEventListener('progress',progress,true);
  state.cleanup=()=>{for(const name of events)xhr.removeEventListener(name,event,true);xhr.removeEventListener('progress',progress,true)};
  state.finish=state.cleanup;requests.set(this,state);return value;
 };
 prototype.setRequestHeader=function(name,value){requests.get(this)?.headers.push([name,value]);return setHeader.call(this,name,value)};
 prototype.abort=function(){requests.get(this)?.finish?.();return abort.call(this)};
 prototype.send=function(data){
  const state=requests.get(this);
  if(!state||!state.async||String(state.method).toUpperCase()!=='GET'||this.responseType!=='arraybuffer'||!allowed(state.url)){state?.finish?.();return send.call(this,data)}
  const xhr=this;let attempts=0,idle,retryTimer,stopped=false,restarting=false,idleAbort=false;
  function finish(){stopped=true;clearTimeout(idle);clearTimeout(retryTimer);state.cleanup();state.finish=undefined}
  function progress(){clearTimeout(idle);if(!stopped)idle=setTimeout(()=>{idleAbort=true;abort.call(xhr);idleAbort=false},idleMs)}
  function event(e){
   if(e.type==='loadend'){if(restarting)e.stopImmediatePropagation();return}
   const retryable=e.type==='error'||e.type==='timeout'||e.type==='abort'&&idleAbort||e.type==='load'&&temporary(xhr.status);
   if(!retryable||attempts>=retries){finish();return}
   e.stopImmediatePropagation();clearTimeout(idle);restarting=true;
   const responseType=xhr.responseType,timeout=xhr.timeout;
   retryTimer=setTimeout(()=>{
    if(stopped)return;restarting=false;open.call(xhr,state.method,state.url,true,...state.rest);xhr.responseType=responseType;xhr.timeout=timeout;xhr.withCredentials=false;
    for(const [name,value] of state.headers)setHeader.call(xhr,name,value);progress();send.call(xhr,data);
   },Math.min(4000,500*2**attempts++));
  }
  state.finish=finish;state.handle=event;state.progress=progress;xhr.withCredentials=false;progress();
  try{return send.call(this,data)}catch(error){finish();throw error}
 };
}
