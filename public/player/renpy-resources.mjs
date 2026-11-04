// RenPyWeb.dl_new必须同步返回编号，dl_get必须返回原生XHR。
// 只在这个已审计SDK调用栈里使用原生XHR子类，缓存就绪后才open/send；不改全局XHR的长期行为。
const installed=new WeakMap();
const nativeVideoMetadata=new WeakMap();
const videoModules=new WeakSet(),videoMarker='// WVN: prepare the current public video before native source assignment.',videoCancelMarker='// WVN: cancel obsolete public video preparation on native stop.',videoFadeMarker='// WVN: cancel pending video when native fadeout replaces the queue.',videoMetadataMarker='// WVN: retain native metadata preparation before starting the current video.';
// 原生 metadata 先于 play，避免 WebKit/GStreamer 的 Blob 自动预读路径损坏解码输入。
// 不改媒体接口、事件或游戏时钟；只清理本次准备仍持有的源，不影响后来接管同一元素的队列。
export function prepareRenpyVideoMetadata(c,p,element,signal){
 signal.throwIfAborted();
 const current=()=>c.playing===p&&c.video_el===element&&!c.paused&&p.started===null;
 if(!current())return Promise.resolve(null);
 const url=String(p.url);
 return new Promise((resolve,reject)=>{
  let timer;const owner={signal};
  const clearWait=()=>{clearTimeout(timer);element.removeEventListener('loadedmetadata',ready);element.removeEventListener('error',failed)};
  const release=clearSource=>{clearWait();signal.removeEventListener('abort',cancel);if(nativeVideoMetadata.get(element)!==owner)return;nativeVideoMetadata.delete(element);if(clearSource&&owner.src!==undefined&&element.getAttribute('src')===owner.src){element.removeAttribute('src');element.load()}};
  const cancel=()=>{release(true);reject(signal.reason??new DOMException('Native video stopped','AbortError'))};
  const ready=()=>{
   clearWait();if(!current()||String(p.url)!==url){release(true);resolve(null);return}
   // 真实 metadata 到同步原生启动之间仍可取消；只有消费该准备结果后才交还源的清理责任。
   owner.result={url,src:element.getAttribute('src')};resolve(owner.result);
  };
  const failed=()=>{const error=Error('Native video metadata MediaError '+element.error?.code);release(true);reject(error)};
  owner.release=release;nativeVideoMetadata.set(element,owner);
  signal.addEventListener('abort',cancel,{once:true});element.addEventListener('loadedmetadata',ready,{once:true});element.addEventListener('error',failed,{once:true});
  timer=setTimeout(()=>{release(true);reject(Error('Native video metadata timed out'))},30000);
  try{element.preload='metadata';element.src=url;owner.src=element.getAttribute('src');element.load()}catch(error){release(true);reject(error)}
 });
}
export function prepareRenpyVideoRuntime(module,{id,prepare,has=()=>false,onFailure=()=>{}}={}){
 if(id!=='renpy-v14240-2'||typeof prepare!=='function'||videoModules.has(module))return false;
 const FS=module.FS??globalThis.FS,path='/renpy/common/_audio.js';
 if(!FS?.readFile||!FS?.writeFile)throw Error('RenPy video runtime filesystem is unavailable');
 const source=FS.readFile(path,{encoding:'utf8'}),head='let video_start = (c) => {',nativeHead='let wvn_native_video_start = (c) => {',next='let video_pause = (c) => {',bridge='let video_start = (c) => Module.wvnStartVideo(c, wvn_native_video_start);';
 const count=part=>source.split(part).length-1,patched=source.includes(videoMarker),cancelPatched=source.includes(videoCancelMarker),stopHead='let video_stop = (c) => {',stopBridge=stopHead+'\n    Module.wvnCancelVideo(c);',fadePatched=source.includes(videoFadeMarker),fadeHead='    if (c.playing == null || c.playing.started == null) {',fadeBridge=fadeHead+'\n        Module.wvnCancelVideo(c);';
 if(patched?count(nativeHead)!==1||count(bridge)!==1||count(next)!==1:count(head)!==1||count(next)!==1||count('c.video_el.src = p.url;')!==1||count('p.started = c.video_el.currentTime;')!==1)throw Error('RenPy native video source shape differs');
 if(count(stopHead)!==1||(cancelPatched?count(stopBridge)!==1:source.includes('Module.wvnCancelVideo(')))throw Error('RenPy native video stop source shape differs');
 if(count(fadeHead)!==1||fadePatched&&count(fadeBridge)!==1)throw Error('RenPy native video fadeout source shape differs');
 const metadataPatched=source.includes(videoMetadataMarker),sourceLine='c.video_el.src = p.url;',preparedLine='Module.wvnUsePreparedVideoSource(c.video_el, p.url);';
 if(metadataPatched?count(preparedLine)!==1||count(sourceLine)!==0:count(sourceLine)!==1||count(preparedLine)!==0)throw Error('RenPy native video metadata source shape differs');
 const pending=new WeakMap(),primed=new WeakMap();
 Object.defineProperties(module,{wvnStartVideo:{value(c,nativeStart){
  const p=c.playing,element=c.video_el;if(p==null||p.started!==null||c.paused||element==null)return;
  if(pending.has(p))return;const controller=new AbortController();pending.set(p,controller);
  void Promise.resolve().then(()=>{if(controller.signal.aborted)return;if(c.playing!==p||c.video_el!==element||c.paused||p.started!==null){controller.abort(new DOMException('Native video no longer current','AbortError'));return}if(!has(String(p.url)))return prepare(String(p.url),controller.signal)}).then(async()=>{
   if(controller.signal.aborted)return;
   const ready=await prepareRenpyVideoMetadata(c,p,element,controller.signal);
   // 只有同一条、未暂停且仍存活的原生队列可以继续；原生函数负责 play、增益和时钟。
   if(ready&&!controller.signal.aborted&&c.playing===p&&c.video_el===element&&!c.paused&&p.started===null){primed.set(element,ready);nativeStart(c)}
  }).catch(error=>{if(!controller.signal.aborted&&c.playing===p&&c.video_el===element&&error?.name!=='AbortError')onFailure(error)}).finally(()=>{if(nativeVideoMetadata.get(element)?.signal===controller.signal)controller.abort(new DOMException('Native video preparation was not consumed','AbortError'));if(pending.get(p)===controller)pending.delete(p)});
 }},wvnUsePreparedVideoSource:{value(element,url){const ready=primed.get(element),owner=nativeVideoMetadata.get(element);primed.delete(element);if(!ready||owner?.result!==ready||owner.signal.aborted||ready.url!==String(url)||ready.src!==element.getAttribute('src')||element.readyState<1)throw Error('Native prepared video source differs');owner.release(false)}},wvnCancelVideo:{value(c){const p=c.playing,controller=p&&pending.get(p);if(c.video_el)primed.delete(c.video_el);if(controller){pending.delete(p);controller.abort(new DOMException('Native video stopped','AbortError'))}}}});
 let fixed=source;if(!patched)fixed=videoMarker+'\n'+fixed.replace(head,nativeHead).replace(next,bridge+'\n\n'+next);if(!cancelPatched)fixed=videoCancelMarker+'\n'+fixed.replace(stopHead,stopBridge);if(!fadePatched)fixed=videoFadeMarker+'\n'+fixed.replace(fadeHead,fadeBridge);if(!metadataPatched)fixed=videoMetadataMarker+'\n'+fixed.replace(sourceLine,preparedLine);if(fixed!==source)FS.writeFile(path,fixed);
 videoModules.add(module);return fixed!==source;
}
export function installRenpyResourcePreparation(win,prepare,onFailure=()=>{},{allowed=()=>true,onNamespaceReady=()=>{}}={}){
 if(typeof prepare!=='function'||installed.has(win))return;
 const wrapped=new WeakSet(),observed=new WeakSet();
 function wrap(fn){
  if(typeof fn!=='function'||wrapped.has(fn))return fn;
  const native=function(...args){
   const NativeXHR=win.XMLHttpRequest;
   class PreparedXHR extends NativeXHR{
    #request;#controller=new win.AbortController();#sent=false;
    open(method,url,...rest){
     if(String(method).toUpperCase()!=='GET'||rest[0]===false||!allowed(String(url)))throw Error('Unregistered native public download');
     this.#request=[method,url,...rest];
    }
    send(body){
     if(!this.#request||this.#sent)throw new win.DOMException('Native download already sent','InvalidStateError');
     this.#sent=true;const request=this.#request,responseType=this.responseType,timeout=this.timeout;
     void Promise.resolve().then(()=>{if(!this.#controller.signal.aborted)return prepare(String(request[1]),this.#controller.signal)}).then(()=>{
      if(this.#controller.signal.aborted)return;
      super.open(...request);this.responseType=responseType;this.timeout=timeout;super.send(body);
     }).catch(error=>{if(error?.name!=='AbortError')onFailure(error)});
    }
    abort(){this.#controller.abort(new win.DOMException('Native download aborted','AbortError'));return super.abort()}
   }
   // SDK本体仍负责编号、记录和FS写入；原生同步抛错也不能遗留全局构造器覆盖。
   win.XMLHttpRequest=PreparedXHR;
   try{return fn.apply(this,args)}finally{win.XMLHttpRequest=NativeXHR}
  };
  wrapped.add(native);return native;
 }
 function observe(owner){
  if(!owner||typeof owner!=='object'||observed.has(owner))return;
  onNamespaceReady(owner);observed.add(owner);
  const descriptor=Object.getOwnPropertyDescriptor(owner,'dl_new');
  if(descriptor&&!descriptor.configurable){if(descriptor.writable)owner.dl_new=wrap(owner.dl_new);return;}
  let current=wrap(owner.dl_new);Object.defineProperty(owner,'dl_new',{configurable:true,enumerable:descriptor?.enumerable??true,get:()=>current,set:value=>{current=wrap(value)}});
 }
 const descriptor=Object.getOwnPropertyDescriptor(win,'RenPyWeb');let current=win.RenPyWeb;observe(current);installed.set(win,true);
 if(descriptor&&!descriptor.configurable)return;
 Object.defineProperty(win,'RenPyWeb',{configurable:true,enumerable:descriptor?.enumerable??true,get:()=>current,set:value=>{current=value;observe(value)}});
}
