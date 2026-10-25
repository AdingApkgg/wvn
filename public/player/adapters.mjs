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
    if(path!==mount||mounted)throw Error('Unexpected persistence mount');
    const result=originalMount(MEMFS,opts,path);mounted=true;
    restore(mount,extraMount?files.filter(f=>!f.path.startsWith(extraPrefix)):files);
    return result;
  };
  function capture(){
    if(!mounted)throw Error('Persistence mount is not ready');const result=[];let total=0;
    function walk(dir,relative){for(const name of FS.readdir(dir)){
      if(name==='.'||name==='..')continue;const full=dir+'/'+name,path=relative?relative+'/'+name:name,stat=FS.lstat(full);
      if(path.length>240)throw Error('Save path exceeds limit');
      if(FS.isDir(stat.mode))walk(full,path);
      else{if(!FS.isFile(stat.mode)||stat.size>maxFileBytes||result.length>=maxFiles||(total+=stat.size)>maxBytes)throw Error('Save contents exceed limit');result.push({path,data:new Uint8Array(FS.readFile(full)),mtime:Math.trunc(Number(stat.mtime))})}
    }}walk(mount,'');if(extraMount)walk(extraMount,'game-saves');return result;
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
