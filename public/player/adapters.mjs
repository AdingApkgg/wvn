import {captureFilesystem} from './emscripten.mjs';
// 旧 Artemis 的 wget_data 会反复请求字体/图片；只在本次沙箱内复用公开字节。
// 每次交给引擎的都是独立副本，不接触保存目录，也不跨游戏共享可变缓冲区。
export function memoizePublicBinaryLoader(read,allowed,{maxBytes=64*1024**2,maxFileBytes=32*1024**2,maxEntries=256,prepare}={}){
 const cache=new Map(),flights=new Map(),state={hits:0,downloads:0,bytes:0};
 function load(url,onload,onerror){
  if(!allowed(url))return read.apply(this,arguments);
  const key=String(url),found=cache.get(key);
  if(found){state.hits++;cache.delete(key);cache.set(key,found);queueMicrotask(()=>onload(found.slice(0)));return}
  if(flights.has(key)){state.hits++;flights.get(key).push({onload,onerror});return}
  const waiting=[{onload,onerror}];flights.set(key,waiting);state.downloads++;
  const failed=error=>{flights.delete(key);for(const sink of waiting)queueMicrotask(()=>sink.onerror?.(error))};
  const receiver=this,start=()=>read.call(receiver,url,buffer=>{
   flights.delete(key);
   if(buffer instanceof ArrayBuffer&&buffer.byteLength<=maxFileBytes&&buffer.byteLength<=maxBytes&&maxEntries>0){
    while(cache.size&&(state.bytes+buffer.byteLength>maxBytes||cache.size>=maxEntries)){const [old,bytes]=cache.entries().next().value;state.bytes-=bytes.byteLength;cache.delete(old)}
    const saved=buffer.slice(0);cache.set(key,saved);state.bytes+=saved.byteLength;
   }
   for(const sink of waiting)queueMicrotask(()=>sink.onload(buffer instanceof ArrayBuffer?buffer.slice(0):buffer));
  },failed);
  // readAsync本来就是回调式异步入口；先取得经校验的正文，再让原生XHR映射到Blob。
  // 只准备本次请求，不枚举全作。缓存失败交回原生失败分支，禁止绕过缓存回源。
  if(prepare){void Promise.resolve().then(()=>prepare(url)).then(start).catch(failed);return}
  try{return start()}catch(error){flights.delete(key);throw error}
 }
 load.stats=()=>({...state});return load;
}
/* Runtime-local persistence only. The opaque frame never opens browser databases. */
const states = new WeakMap();
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
const maxFiles=512,maxFileBytes=32*1024*1024,maxBytes=64*1024*1024;
export function createMemoryStorage(changed=()=>{}) {
  const values=new Map(),state={values,time:0};let proxy;
  const touch=()=>{state.time=Date.now();changed();};
  const api={
    get length(){return values.size},
    key(index){return [...values.keys()][Number(index)]??null},
    getItem(key){return values.get(String(key))??null},
    setItem(key,value){key=String(key);value=String(value);if(values.get(key)===value)return;const size=[...values].reduce((n,[k,v])=>n+(k===key?0:encoder.encode(k+v).length),encoder.encode(key+value).length);if(size>maxFileBytes)throw new DOMException('Save storage exceeds limit','QuotaExceededError');values.set(key,value);touch()},
    removeItem(key){if(values.delete(String(key)))touch()},
    clear(){if(values.size){values.clear();touch()}}
  };
  proxy=new Proxy(api,{
    get(target,key){if(typeof key==='symbol'||Reflect.has(target,key))return Reflect.get(target,key);return values.get(String(key))},
    set(target,key,value){if(typeof key!=='string'||Reflect.has(target,key))return false;api.setItem(key,value);return true},
    deleteProperty(target,key){api.removeItem(key);return true},
    ownKeys(){return [...values.keys()]},
    getOwnPropertyDescriptor(target,key){return values.has(key)?{enumerable:true,configurable:true,writable:true,value:values.get(key)}:undefined},
    has(target,key){return Reflect.has(target,key)||values.has(key)}
  });states.set(proxy,state);return proxy;
}
export function storageSnapshot(storage,time) {
  const state=states.get(storage);if(!state)throw Error('Unknown memory storage');
  return state.values.size?[{path:'webstorage.bin',data:encoder.encode(JSON.stringify([...state.values])),mtime:time??state.time}]:[];
}
export function restoreStorage(storage,files) {
  const state=states.get(storage);if(!state)throw Error('Unknown memory storage');
  if(!Array.isArray(files)||files.length>1||files.some(f=>f.path!=='webstorage.bin'||!(f.data instanceof Uint8Array)||f.data.length>maxFileBytes))throw Error('Invalid storage snapshot');
  const rows=files.length?JSON.parse(decoder.decode(files[0].data)):[];
  if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==2||r.some(v=>typeof v!=='string'))||new Set(rows.map(r=>r[0])).size!==rows.length)throw Error('Invalid storage contents');
  state.values.clear();for(const [k,v]of rows)state.values.set(k,v);state.time=files[0]?.mtime??0;
}
export function installMemoryPersistence({FS,IDBFS,MEMFS,mount,extraMount,files,persist}) {
  if(!FS||!IDBFS||!MEMFS||typeof mount!=='string'||!mount.startsWith('/'))throw Error('Invalid persistence mount');
  const originalMount=FS.mount.bind(FS);let mounted=false,extraMounted=false;
  const extraPrefix='game-saves/';
  function restore(base,rows){for(const file of rows){const full=base+'/'+file.path;FS.mkdirTree(full.slice(0,full.lastIndexOf('/')));FS.writeFile(full,file.data);if(file.mtime!==undefined)FS.utime(full,file.mtime,file.mtime)}}
  const extraFiles=extraMount?files.filter(f=>f.path.startsWith(extraPrefix)).map(f=>({...f,path:f.path.slice(extraPrefix.length)})):[];
  if(extraMount){if(extraMount!=='/game/saves')throw Error('Unexpected extra persistence mount');FS.mkdirTree(extraMount);restore(extraMount,extraFiles)}
  FS.mount=(type,opts,path)=>{
    if(type!==IDBFS)return originalMount(type,opts,path);
    if(extraMount&&path===extraMount){if(extraMounted)throw Error('Repeated extra persistence mount');const result=originalMount(MEMFS,opts,path);extraMounted=true;restore(extraMount,extraFiles);return result}
    if(path!==mount||mounted)throw Error('Unexpected persistence mount: '+path+' (expected '+mount+')');
    const result=originalMount(MEMFS,opts,path);mounted=true;
    restore(mount,extraMount?files.filter(f=>!f.path.startsWith(extraPrefix)):files);
    return result;
  };
  function capture(){
    if(!mounted)throw Error('Persistence mount is not ready');
    return captureFilesystem(FS,[{path:mount,prefix:''},...(extraMount?[{path:extraMount,prefix:'game-saves'}]:[])]);
  }
  let queue=Promise.resolve();
  FS.syncfs=(populate,callback)=>{
    if(typeof populate==='function'){callback=populate;populate=false}callback??=()=>{};
    if(populate){queueMicrotask(()=>callback(mounted?undefined:Error('Persistence mount is not ready')));return}
    let snapshot;try{snapshot=capture()}catch(e){queueMicrotask(()=>callback(e));return}
    const write=queue.then(()=>persist(snapshot));queue=write.catch(()=>{});write.then(()=>callback(),error=>callback(error));
  };
  return capture;
}

// Legacy html2canvas clones the page into another iframe. Opaque child frames
// deliberately cannot access that document. Generate an explicitly labelled text
// thumbnail instead; native Tyrano state/DOM serialization stays in its own engine.
export function sandboxThumbnail(createCanvas,checkpoint){
  return async function render(_element,options={}){
    const canvas=createCanvas(),state=checkpoint();canvas.width=360;canvas.height=203;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Save thumbnail canvas unavailable');
    ctx.fillStyle='#15171d';ctx.fillRect(0,0,360,203);ctx.fillStyle='#d3b9a1';ctx.font='16px sans-serif';ctx.fillText(String(state.title??'WVN').slice(0,20),16,30);
    ctx.fillStyle='#eeeeee';ctx.font='14px sans-serif';const text=Array.from(String(state.text??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()).slice(0,100);
    for(let line=0;line<4;line++)ctx.fillText(text.slice(line*22,(line+1)*22).join(''),16,64+line*24);
    ctx.fillStyle='#a5a6af';ctx.font='12px sans-serif';ctx.fillText('WVN · 文字预览',16,186);
    if(typeof options.onrendered==='function')options.onrendered(canvas);
    return canvas;
  };
}

export function belongsToLegacyScope(entry,path){
  if(entry.runtimeKind!=='RenPy')return true;
  const directory=entry.legacyDirectory;
  if(entry.extraMount==='/game/saves'&&directory===null)return ['tokens/security_keys.txt','tokens/upgraded.txt'].includes(path);
  if(typeof directory!=='string'||!directory||/[\\/]/.test(directory)||directory.startsWith('.'))throw Error('Unverified RenPy legacy scope');
  return path.startsWith(directory+'/')||['tokens/security_keys.txt','tokens/upgraded.txt'].includes(path);
}

export async function requestNativeMenu(win,kind,canvas){
  canvas.focus();
  if(kind==='Artemis'){
    const rect=canvas.getBoundingClientRect(),point={bubbles:true,cancelable:true,button:2,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2};
    canvas.dispatchEvent(new win.MouseEvent('mousedown',{...point,buttons:2}));
    // These games poll button state once per native frame.
    await new Promise(resolve=>setTimeout(resolve,80));
    canvas.dispatchEvent(new win.MouseEvent('mouseup',{...point,buttons:0}));
  }else for(const type of ['keydown','keyup'])canvas.dispatchEvent(new win.KeyboardEvent(type,{bubbles:true,cancelable:true,key:'Escape',code:'Escape',keyCode:27,which:27}));
}

// This audited plugin initializes pm to an empty string before its first
// voiced line, but its load action unconditionally reads pm.storage.indexOf.
// Normalize only the in-memory load copy; stored snapshots remain unchanged.
export function prepareTyranoLoad(id,data){
  if(id!=='tyrano-v49795-1')return data;
  const repeat=data?.stat?.f?.voice_repeat;
  if(!repeat||typeof repeat.pm?.storage==='string')return data;
  const pm=repeat.pm&&typeof repeat.pm==='object'?repeat.pm:{};
  return {...data,stat:{...data.stat,f:{...data.stat.f,voice_repeat:{...repeat,pm:{...pm,storage:''}}}}};
}
export function installTyranoLoadCompatibility(win,id){
  if(id!=='tyrano-v49795-1')return;
  for(const menu of new Set([win.tyrano?.plugin?.kag?.menu,win.TYRANO?.kag?.menu])){
    if(!menu||typeof menu.getSaveData!=='function')continue;
    const original=menu.getSaveData;
    menu.getSaveData=function(...args){
      const value=original.apply(this,args);
      if(!Array.isArray(value?.data))return value;
      const data=value.data.map(slot=>prepareTyranoLoad(id,slot));
      return data.some((slot,index)=>slot!==value.data[index])?{...value,data}:value;
    };
  }
}
// 该版本的原生音频标签按UA把ogg改为m4a，但包内未必提供m4a。
// 只选清单中确实存在且宿主声明可播放的同名ogg；不添加资源别名或放行未知URL。
export function selectTyranoAudioSource(source,resolver,canPlayType){
 if(typeof source!=='string'||!/\.m4a$/i.test(source))return source;
 try{resolver.row(source);return source}catch{/* 已有原格式优先。 */}
 const alternative=source.replace(/\.m4a$/i,'.ogg');let row;
 try{row=resolver.row(alternative)}catch{return source}
 return /^(?:audio|application)\/ogg(?:;|$)/i.test(row.contentType)&&canPlayType('audio/ogg')?alternative:source;
}
const compatibleAudio=new WeakSet();
export function installTyranoAudioCompatibility(win,id,resolver){
 const Howl=win.Howl;if(id!=='tyrano-v49795-1'||!resolver||typeof Howl!=='function'||compatibleAudio.has(Howl))return;
 const audio=new win.Audio();
 function CompatibleHowl(options,...args){
  if(!new.target)return Howl.apply(this,[options,...args]);
  if(options&&options.format===undefined){const values=Array.isArray(options.src)?options.src:[options.src],selected=values.map(value=>selectTyranoAudioSource(value,resolver,type=>audio.canPlayType(type)));if(selected.some((value,index)=>value!==values[index]))options={...options,src:Array.isArray(options.src)?selected:selected[0]}}
  return Reflect.construct(Howl,[options,...args],new.target===CompatibleHowl?Howl:new.target);
 }
 CompatibleHowl.prototype=Howl.prototype;Object.setPrototypeOf(CompatibleHowl,Howl);compatibleAudio.add(CompatibleHowl);win.Howl=CompatibleHowl;
}
const serializedLayers=new WeakSet();
const preparedTyranoResources=new WeakSet();
const preparedTyranoText=new WeakSet(),tyranoLoadWaits=new WeakMap();
// 仅本次审计SDK的两条原生异步入口：保留函数正文，只注入局部依赖记账，不覆盖全局timer/$。
const tyranoScenarioSource="function(file_name,call_back){var that=this;this.stat.is_strong_stop=!0;this.stat.current_scenario=file_name;var file_url=\"\";file_url=$.isHTTP(file_name)?file_name:\"./data/scenario/\"+file_name;if(that.cache_scenario[file_url]){if(call_back){var result_obj=that.cache_scenario[file_url],tag_obj=result_obj.array_s,map_label=result_obj.map_label;that.stat.map_label=map_label;that.stat.is_strong_stop=!1;call_back(tag_obj)}}else $.loadText(file_url,(function(text_str){var result_obj=that.parser.parseScenario(text_str);that.cache_scenario[file_url]=result_obj;var tag_obj=result_obj.array_s,map_label=result_obj.map_label;that.stat.map_label=map_label;that.stat.is_strong_stop=!1;call_back&&call_back(tag_obj)}))}";
const tyranoJumpSource="function(pm){var that=this;setTimeout((function(){that.kag.ftag.nextOrderWithLabel(pm.target,pm.storage)}),1)}";
const tyranoNativePending=new WeakMap(),trackedTyranoNative=new WeakSet();
function beginTyranoNative(kag){
 tyranoNativePending.set(kag,(tyranoNativePending.get(kag)??0)+1);let released=false;
 return ()=>{if(released)return;released=true;const count=(tyranoNativePending.get(kag)??1)-1;if(count)tyranoNativePending.set(kag,count);else tyranoNativePending.delete(kag)};
}
function installTyranoNativeLifecycle(win){
 const storage=win.$??win.jQuery;
 for(const kag of new Set([win.tyrano?.plugin?.kag,win.TYRANO?.kag])){
  const original=kag?.loadScenario;if(typeof original!=='function'||trackedTyranoNative.has(original))continue;
  if(Function.prototype.toString.call(original)!==tyranoScenarioSource)throw Error('Tyrano scenario source shape differs');
  const factory=Function('$','return ('+tyranoScenarioSource+')');
  const wrapped=function(...args){
   const release=beginTyranoNative(this);let pending=false;
   const local={isHTTP(...values){return storage.isHTTP.apply(storage,values)},loadText(...values){
    pending=true;const callback=values[1];values[1]=function(...received){try{return callback.apply(this,received)}finally{release()}};
    return storage.loadText.apply(storage,values);
   }};
   try{return factory(local).apply(this,args)}catch(error){release();throw error}finally{if(!pending)release()}
  };
  trackedTyranoNative.add(wrapped);kag.loadScenario=wrapped;
 }
 for(const tag of new Set([win.tyrano?.plugin?.kag?.tag?.jump,win.TYRANO?.kag?.ftag?.master_tag?.jump])){
  const original=tag?.start;if(typeof original!=='function'||trackedTyranoNative.has(original))continue;
  if(Function.prototype.toString.call(original)!==tyranoJumpSource)throw Error('Tyrano jump source shape differs');
  const factory=Function('setTimeout','return ('+tyranoJumpSource+')'),timer=win.setTimeout??globalThis.setTimeout;
  const wrapped=function(...args){
   const release=beginTyranoNative(this.kag),schedule=(callback,delay,...values)=>timer.call(win,function(...received){try{return callback.apply(this,received)}finally{release()}},delay,...values);
   try{return factory(schedule).apply(this,args)}catch(error){release();throw error}
  };
  trackedTyranoNative.add(wrapped);tag.start=wrapped;
 }
}
function tyranoRestoreIdle(kag,allowMenu){
 if(tyranoNativePending.get(kag)>0)return false;
 const stat=kag?.stat;if(!stat)return true;
 if(['is_adding_text','is_wait','is_wait_anim','is_trans','is_skip','is_auto'].some(key=>stat[key]==1)||(kag.tmp?.num_anim??0)!==0)return false;
 // loadScenario也临时设置strong_stop；仅审计过的[s]才是持久停止，不能放行jump/call的加载空隙。
 const tag=kag.ftag?.array_tag?.[kag.ftag.current_order_index]?.name,strongStop=tag==='s'&&stat.is_strong_stop==1&&kag.key_mouse?.canShowMenu?.();
 return (tag==='p'||tag==='l'||strongStop)&&(allowMenu||kag.key_mouse?.canClick?.()||strongStop);
}
// 冻结pchar的瞬显分支清打字标志后仍有尾定时器；只在原生p/l或合法强停止点交换存档。
// 不取消全局计时器、不改文字/事件/引擎标志；超时关闭本次恢复，后选槽位可取消旧等待。
export async function waitForTyranoRestoreIdle(kag,{signal,timeout=30000,interval=20,allowMenu=false}={}){
 const deadline=Date.now()+timeout;
 while(!tyranoRestoreIdle(kag,allowMenu)){
  signal?.throwIfAborted();if(Date.now()>=deadline)throw Error('游戏文字或动画仍在显示，请稍后读档');
  await new Promise((resolve,reject)=>{
   let timer;const aborted=()=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);reject(signal.reason)};
   signal?.addEventListener('abort',aborted,{once:true});timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve()},Math.min(interval,Math.max(1,deadline-Date.now())));
   if(signal?.aborted)aborted();
  });
 }
 signal?.throwIfAborted();
}
// 此固定版本的preload为无返回值的异步回调API；先完成公共前台校验，再由原生逻辑加载。
// 不改Image.src/complete语义；失败时关闭本次读取，不能另走CDN或提前推进剧情。
export function installTyranoResourcePreparation(win,id,prepare,onFailure=()=>{},{startup=false,prepareMarkup}={}){
 if(id!=='tyrano-v49795-1'||typeof prepare!=='function')return;
 installTyranoNativeLifecycle(win);
 // 冻结libs.js的loadText也是无返回值回调API，loadScenario直接调用它，不经过preload。
 for(const owner of new Set([win.$,win.jQuery])){
  const original=owner?.loadText;if(typeof original!=='function'||preparedTyranoText.has(original))continue;
  const wrapped=function(...args){
   if(typeof args[0]!=='string')return original.apply(this,args);
   const receiver=this;void Promise.resolve().then(()=>prepare(args[0])).then(()=>original.apply(receiver,args)).catch(error=>{if(error?.name!=='AbortError')onFailure(error)});
  };
  preparedTyranoText.add(wrapped);owner.loadText=wrapped;
 }
 for(const kag of new Set([win.tyrano?.plugin?.kag,win.TYRANO?.kag])){
  const original=kag?.preload;if(typeof original!=='function'||preparedTyranoResources.has(original))continue;
  const wrapped=function(...args){
   if(typeof args[0]!=='string')return original.apply(this,args);
   const receiver=this;
   void Promise.resolve().then(()=>prepare(args[0])).then(()=>original.apply(receiver,args)).catch(error=>{if(error?.name!=='AbortError')onFailure(error)});
  };
  preparedTyranoResources.add(wrapped);kag.preload=wrapped;
 }
 // loadjs通过jQuery脚本XHR加载插件，并不调用preload；在原生标签边界等待，保留getScript的原API。
 for(const tag of new Set([win.tyrano?.plugin?.kag?.tag?.loadjs,win.TYRANO?.kag?.ftag?.master_tag?.loadjs])){
  const original=tag?.start;if(typeof original!=='function'||preparedTyranoText.has(original))continue;
  const wrapped=function(...args){
   if(typeof args[0]?.storage!=='string')return original.apply(this,args);
   const receiver=this;void Promise.resolve().then(()=>prepare('./data/others/'+args[0].storage)).then(()=>original.apply(receiver,args)).catch(error=>{if(error?.name!=='AbortError')onFailure(error)});
  };
  preparedTyranoText.add(wrapped);tag.start=wrapped;
 }
 // 只准备当前标签声明的资源。音频在play边界等待，start同步注册原生首次点击，不能错过当前用户手势。
 const resource=(folder,value)=>typeof value==='string'&&value?( /^https?:/i.test(value)?value:'./data/'+folder+'/'+value):null;
 const tagPaths=(kind,pm={})=>{
  if(kind==='position')return pm.frame==='none'?[]:[resource('image',pm.frame)].filter(Boolean);
  if(kind==='image')return [resource(pm.folder||(pm.layer==='base'||!pm.layer?'bgimage':'fgimage'),pm.storage)].filter(Boolean);
  if(kind==='playbgm')return [resource(pm.target==='se'?'sound':'bgm',pm.storage)].filter(Boolean);
  const folder=kind==='glink'?'image':pm.folder||'image';
  return [...['graphic','enterimg','clickimg'].map(k=>resource(folder,pm[k])),...['clickse','enterse','leavese'].map(k=>resource('sound',pm[k]))].filter(Boolean);
 };
 for(const table of new Set([win.tyrano?.plugin?.kag?.tag,win.TYRANO?.kag?.ftag?.master_tag])){
  for(const kind of ['image','button','glink','playbgm','position']){
   const tag=table?.[kind],method=kind==='playbgm'?'play':'start',original=tag?.[method];if(typeof original!=='function'||preparedTyranoText.has(original))continue;
   const wrapped=function(...args){const paths=tagPaths(kind,args[0]);if(!paths.length)return original.apply(this,args);const receiver=this;void Promise.resolve().then(()=>Promise.all([...new Set(paths)].map(path=>prepare(path)))).then(()=>original.apply(receiver,args)).catch(error=>{if(error?.name!=='AbortError')onFailure(error)})};
   preparedTyranoText.add(wrapped);tag[method]=wrapped;
  }
 }
 // 系统模板先创建Image，之后才调用preloadImgCallback；在原生模板入口准备其固定依赖。
 const system='tyrano/images/system/',common=['menu_button_close.png','bg_base.png'],views={menu:[...common,'menu_button_save.png','menu_button_load.png','menu_message_close.png','menu_button_skip.png','menu_button_title.png','label_menu.png'],save:[...common,'arrow_up.png','arrow_down.png','label_save.png','saveslot.png'],load:[...common,'arrow_up.png','arrow_down.png','label_load.png','saveslot.png']};
 for(const kag of new Set([win.tyrano?.plugin?.kag,win.TYRANO?.kag])){
  const original=kag?.html;if(typeof original!=='function'||preparedTyranoText.has(original))continue;
  const wrapped=function(...args){const names=views[args[0]];if(!names)return original.apply(this,args);const receiver=this;void Promise.resolve().then(()=>Promise.all(names.map(name=>prepare(system+name)))).then(()=>original.apply(receiver,args)).catch(error=>{if(error?.name!=='AbortError')onFailure(error)})};
  preparedTyranoText.add(wrapped);kag.html=wrapped;
 }
 // 所有原生恢复入口都在完整同步序列前准备其选中快照；不把loadGameData本身改成async。
 if(typeof prepareMarkup==='function')for(const menu of new Set([win.tyrano?.plugin?.kag?.menu,win.TYRANO?.kag?.menu])){
  for(const method of ['loadGame','loadQuickSave','loadAutoSave']){
   const original=menu?.[method],storage=win.$??win.jQuery;if(typeof original!=='function'||preparedTyranoText.has(original)||method!=='loadGame'&&typeof storage?.getStorage!=='function')continue;
   const wrapped=function(...args){const receiver=this;let snapshot,invoke;
    if(method==='loadGame'){
     const selected=receiver.getSaveData();snapshot=selected?.data?.[args[0]];
     invoke=()=>{const read=receiver.getSaveData;receiver.getSaveData=()=>selected;try{return original.apply(receiver,args)}finally{receiver.getSaveData=read}};
    }else{
     const mode=receiver.kag.config.configSave,key=receiver.kag.config.projectID+(method==='loadQuickSave'?'_tyrano_quick_save':'_tyrano_auto_save'),raw=storage.getStorage(key,mode);
     if(!raw)return original.apply(receiver,args);
     const parsed=JSON.parse(raw);snapshot=prepareTyranoLoad(id,parsed);const selected=snapshot===parsed?raw:JSON.stringify(snapshot);
     // 原生入口仍解析自己的载入副本；临时读取只绑定选中键，存储正文和其他键保持不变。
     invoke=()=>{const read=storage.getStorage;storage.getStorage=function(...values){return values[0]===key&&values[1]===mode?selected:read.apply(this,values)};try{return original.apply(receiver,args)}finally{storage.getStorage=read}};
    }
    tyranoLoadWaits.get(receiver)?.abort();const controller=new (win.AbortController??globalThis.AbortController)();tyranoLoadWaits.set(receiver,controller);
    if(win.navigator?.userActivation?.isActive&&receiver.kag?.tmp?.ready_audio===false&&typeof receiver.kag.readyAudio==='function')receiver.kag.readyAudio();
    void Promise.resolve().then(async()=>{
     controller.signal.throwIfAborted();const layer=snapshot?.layer;if(!layer)return;
     const fragments=[];for(const name of ['map_layer_fore','map_layer_back','layer_free','layer_fix','layer_blend']){const value=layer[name];if(typeof value==='string')fragments.push(value);else if(value&&typeof value==='object')for(const html of Object.values(value))if(typeof html==='string')fragments.push(html)}
     for(const html of new Set(fragments)){controller.signal.throwIfAborted();await prepareMarkup(html,{signal:controller.signal})}
    }).then(async()=>{const allowMenu=method==='loadGame';do{await waitForTyranoRestoreIdle(receiver.kag,{signal:controller.signal,allowMenu})}while(!tyranoRestoreIdle(receiver.kag,allowMenu));controller.signal.throwIfAborted();return invoke()}).catch(error=>{if(!controller.signal.aborted&&error?.name!=='AbortError')onFailure(error)}).finally(()=>{if(tyranoLoadWaits.get(receiver)===controller)tyranoLoadWaits.delete(receiver)});
   };preparedTyranoText.add(wrapped);menu[method]=wrapped;
  }
 }
 // 原生初始化/首个用户点击会直接创建这些固定小型UI资源；不是游戏全量预载。
 if(startup)return Promise.resolve().then(()=>Promise.all(['tyrano/images/system/button_menu.png','tyrano/images/system/nextpage.gif','tyrano/audio/silent.mp3','data/others/plugin/voice_repeat/img/voice_repeat.png'].map(path=>prepare(path))));

}
// 仅在原生层导出边界投影本运行区公共资源；未知字段、原始快照与游戏状态保持原样。
export function installTyranoLayerSerialization(win,projectMarkup){
 if(typeof projectMarkup!=='function')return;
 for(const layer of new Set([win.tyrano?.plugin?.kag?.layer,win.TYRANO?.kag?.layer])){
  if(!layer||typeof layer.getLayeyHtml!=='function'||serializedLayers.has(layer.getLayeyHtml))continue;const original=layer.getLayeyHtml;
  const wrapped=function(...args){const data=original.apply(this,args);if(!data||typeof data!=='object')return data;let result=data;
   for(const name of ['map_layer_fore','map_layer_back','layer_free','layer_fix','layer_blend']){const value=data[name];let next=value;
    if(typeof value==='string')next=projectMarkup(value);
    else if(value&&typeof value==='object'&&!Array.isArray(value)){const entries=Object.entries(value).map(([key,html])=>[key,typeof html==='string'?projectMarkup(html):html]);if(entries.some(([key,html])=>value[key]!==html))next=Object.fromEntries(entries)}
    if(next!==value){if(result===data)result={...data};result[name]=next}
   }return result;
  };serializedLayers.add(wrapped);layer.getLayeyHtml=wrapped;
 }
}

export function installAnonymousMedia(win){
  const NativeAudio=win.Audio;
  win.Audio=function Audio(source){const audio=new NativeAudio();audio.crossOrigin='anonymous';if(source!==undefined)audio.src=source;return audio};
  win.Audio.prototype=NativeAudio.prototype;Object.setPrototypeOf(win.Audio,NativeAudio);
  const resources=[[win.HTMLImageElement,'src'],[win.HTMLMediaElement,'src']];
  if(win.HTMLLinkElement)resources.push([win.HTMLLinkElement,'href']);
  for(const [Type,property] of resources){
    const descriptor=Object.getOwnPropertyDescriptor(Type.prototype,property);
    Object.defineProperty(Type.prototype,property,{...descriptor,set(value){this.crossOrigin='anonymous';descriptor.set.call(this,value)}});
    const setAttribute=Type.prototype.setAttribute;
    Type.prototype.setAttribute=function(name,value){if(String(name).toLowerCase()===property)this.crossOrigin='anonymous';return setAttribute.call(this,name,value)};
  }
  const observer=new win.MutationObserver(records=>{
    const prepare=node=>{if(resources.some(([Type])=>node instanceof Type)){if(node.crossOrigin!=='anonymous')node.crossOrigin='anonymous'}node.querySelectorAll?.('img,video,audio,link').forEach(prepare)};
    for(const record of records){if(record.type==='attributes')prepare(record.target);else for(const node of record.addedNodes)prepare(node)}
  });
  observer.observe(win.document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','href']});
  win.document.querySelectorAll('img,video,audio,link').forEach(element=>element.crossOrigin='anonymous');
  return ()=>observer.disconnect();
}
export function isTyranoReady(kag,{initialScenario,initialTag}={}){
 return typeof kag?.config?.projectID==='string'&&!!kag.config.projectID.trim()&&typeof kag?.stat?.current_scenario==='string'&&!!kag.stat.current_scenario&&(!initialScenario||kag.stat.current_scenario===initialScenario)&&Number.isInteger(kag?.ftag?.current_order_index)&&kag.ftag.current_order_index>=0&&Array.isArray(kag.ftag.array_tag)&&kag.ftag.array_tag.length>0&&(!initialTag||kag.stat.is_wait!=1&&kag.ftag.array_tag[kag.ftag.current_order_index]?.name===initialTag);
}
export async function waitForTyranoReady(getKag,{timeout=180000,interval=100,initialScenario,initialTag}={}){
 const deadline=Date.now()+timeout;
 while(!isTyranoReady(getKag(),{initialScenario,initialTag})){if(Date.now()>=deadline)throw Error('游戏场景尚未就绪');await new Promise(resolve=>setTimeout(resolve,interval))}
}
