// 生命周期、资源解析与文件捕获共用；引擎格式、挂载和原生入口由驱动调用方负责。
const wrappedHooks=new WeakMap();
const unwrap=fn=>{while(typeof fn==='function'&&wrappedHooks.has(fn))fn=wrappedHooks.get(fn);return fn;};
export function engineResourcesForSession(release,kind,origin){
 if(release===undefined)return;
 const names=['renpy-pre.js','renpy.js','renpy.wasm','renpy.data'],base=new URL(origin);
 if(kind!=='RenPy'||release?.kind!=='RenPy'||!/^renpy-[a-f0-9]{64}$/.test(release.id)||base.origin!==origin||base.protocol!=='https:'||!Array.isArray(release.files)||release.files.length!==4||new Set(release.files.map(f=>f.path)).size!==4||release.files.some(f=>!names.includes(f.path)||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Invalid session engine release');
 return {baseURL:origin+'/__engines/resource/'+release.id+'/',files:[...names]};
}
export function resolveEngineResource(path,{baseURL,files}){
 if(typeof path!=='string'||!files.includes(path)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\%?#:]/.test(path))throw Error('Unregistered engine resource path');
 const base=new URL(baseURL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/'))throw Error('Invalid engine resource base');
 const url=new URL(path,base);if(url.origin!==base.origin||!url.href.startsWith(base.href))throw Error('Engine resource escapes release');return url.href;
}
export function captureFilesystem(FS,mounts,limits={files:512,fileBytes:32*1024**2,totalBytes:64*1024**2}){
 const files=[];let total=0;
 function walk(directory,relative){
  for(const name of FS.readdir(directory)){
   if(name==='.'||name==='..')continue;
   const full=directory+'/'+name,path=relative?relative+'/'+name:name,stat=FS.lstat(full);
   if(path.length>240)throw Error('Save path exceeds limit');
   if(FS.isDir(stat.mode))walk(full,path);
   else{if(!FS.isFile(stat.mode)||stat.size>limits.fileBytes||files.length>=limits.files||(total+=stat.size)>limits.totalBytes)throw Error('Save contents exceed type or size limit');files.push({path,data:new Uint8Array(FS.readFile(full)),mtime:Math.trunc(Number(stat.mtime))});}
  }
 }
 for(const mount of mounts)walk(mount.path,mount.prefix);return files;
}
export function createEmscriptenDriver({kind,status=()=>{},prepareFilesystem,resources,progress=()=>{}}={}){
 if(!['ONS','Artemis','RenPy'].includes(kind))throw Error('Unsupported Emscripten driver');
 let state='waiting',module={},filesystemPrepared=false;const configured=new WeakSet();
 const change=next=>{if(state==='failed'&&next!=='failed')throw Error('Emscripten driver failed');state=next;status(next);};
 const fail=()=>{if(state!=='failed')change('failed');};
 function hook(value,name,before,after){
  function wrap(fn){
   const original=unwrap(fn);
   const wrapper=function(...args){try{before?.(...args);const result=typeof original==='function'?original.apply(this,args):undefined;after?.(...args);return result;}catch(e){fail();throw e;}};
   wrappedHooks.set(wrapper,original);return wrapper;
  }
  // 已被上游保存的 callback 必须继续引用赋值当时的实现。
  let current=wrap(value[name]);
  Object.defineProperty(value,name,{configurable:true,enumerable:true,get:()=>current,set:fn=>{if(fn!==current)current=wrap(fn);}});
 }
 function prepare(){
  if(filesystemPrepared)return;change('initializing');prepareFilesystem?.(module);filesystemPrepared=true;
 }
 function configure(value,factory=false){
  if(!value||typeof value!=='object')throw Error('Invalid Emscripten Module');module=value;
  if(configured.has(value))return value;configured.add(value);
  hook(value,'onAbort',fail);hook(value,'onExit',()=>change('stopped'));
  hook(value,'onRuntimeInitialized',undefined,()=>change('initialized'));
  const observe=event=>{try{progress(event)}catch{ /* 加载反馈不能影响引擎回调。 */ }};
  hook(value,'setStatus',text=>observe({type:'status',text}));
  hook(value,'monitorRunDependencies',remaining=>observe({type:'dependencies',remaining}));
  if(factory){
   const wrap=fn=>function(...args){change('initializing');try{return fn.apply(this,args);}catch(error){fail();throw error;}};
   if(typeof value.preRun==='function')value.preRun=wrap(value.preRun);
   else if(Array.isArray(value.preRun))value.preRun=value.preRun.map(wrap);
  }else{
   let runs;
   const assign=input=>{const callbacks=typeof input==='function'?[input]:input??[];if(!Array.isArray(callbacks)||callbacks.some(fn=>typeof fn!=='function'))throw Error('Invalid preRun hooks');runs=[...callbacks.filter(fn=>fn!==prepare),prepare];};
   assign(value.preRun);
   Object.defineProperty(value,'preRun',{configurable:true,enumerable:true,get:()=>runs,set:assign});
  }
  if(resources)value.locateFile=path=>resolveEngineResource(path,resources);
  return value;
 }
 return {
  get state(){return state;},get module(){return module;},
  installGlobal(win){if(kind==='ONS')throw Error('ONS requires its factory');Object.defineProperty(win,'Module',{configurable:true,get:()=>module,set:value=>configure(value)});win.Module={};},
  beforeScript(){if(kind==='ONS')return;const runs=typeof module.preRun==='function'?[module.preRun]:module.preRun??[];module.preRun=[...runs.filter(fn=>fn!==prepare),prepare];},
  async startFactory(factory,options){if(kind!=='ONS'||typeof factory!=='function')throw Error('Invalid factory');change('loading');try{const result=await factory(configure(options,true));module=result??options;if(state!=='failed')change('initialized');else throw Error('Emscripten driver failed');return module;}catch(error){fail();throw error;}},
  running(){change('running');},
  async waitReady(predicate,{timeout=180000,poll=100}={}){const deadline=Date.now()+timeout;while(!predicate()){if(state==='failed')throw Error('Engine initialization failed');if(Date.now()>deadline){fail();throw Error('Engine initialization timed out');}await new Promise(r=>setTimeout(r,poll));}change('running');},
 };
}
