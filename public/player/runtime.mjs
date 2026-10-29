import {runtimeResourceOrigin,verifyDirectEngine} from './resource-location.mjs';
import {createResourceReporter} from '../ons/resource-loading.mjs';
import {createLoadingReporter,observeStartupRequests} from '../ons/loading.mjs';
import {createEmscriptenDriver,engineResourcesForSession,resolveEngineResource} from './emscripten.mjs';
import {findPlayer} from './registry.mjs';
import {validateSnapshot} from '../ons/protocol.mjs';
import {installNativeInput} from './native-input.mjs';
import {prepareRenpyAudio} from './renpy-audio.mjs';
import {createMemoryStorage,storageSnapshot,restoreStorage,installMemoryPersistence,sandboxThumbnail,installAnonymousMedia,requestNativeMenu,installTyranoLoadCompatibility,waitForTyranoReady} from './adapters.mjs';
const origin=new URL(location.href).origin,id=/^\/__player\/resource\/([^/]+)\/index\.html$/.exec(location.pathname)?.[1],entry=findPlayer(id);
let initialized=false;
addEventListener('message',async function initialize(event){
  const init=event.data;
  if(initialized||event.source!==parent||parent===window||event.origin!==origin||init?.type!=='WG_ONS_INIT'||init.pilot!==id||!/^[a-f0-9-]{36}$/.test(init.nonce)||event.ports.length!==1||!entry?.runtimeKind)return;
  initialized=true;removeEventListener('message',initialize);
  const port=event.ports[0],nonce=init.nonce;let seq=0,queue=Promise.resolve(),capture,failed=false;
  const acknowledgements=new Map(),send=message=>port.postMessage({...message,pilot:id,nonce});
  const status=message=>send({type:'status',message:String(message).slice(0,500)});
  const startupAbort=new AbortController();let transferAt=0;
  const resources=createResourceReporter(send),loading=createLoadingReporter(send);let stopObserving=()=>{};loading.phase('connecting');
  function persist(files,requestId){
    // Serialize snapshots, retaining the bytes as they were at the native fsync.
    const snapshot=validateSnapshot({schema:1,pilot:id,files},id);
    const operation=queue.then(()=>new Promise((resolve,reject)=>{
      const number=++seq,timer=setTimeout(()=>{acknowledgements.delete(number);reject(Error('本机存档确认超时'))},28000);
      acknowledgements.set(number,{resolve,reject,timer});send({type:'snapshot',seq:number,snapshot,requestId});
    }));
    queue=operation.catch(error=>{failed=true;status('保存失败：'+error.message)});return operation;
  }
  port.onmessage=({data})=>{
    if(!data||data.nonce!==nonce||data.pilot!==id)return;
    if(data.type==='ack'){
      const ack=acknowledgements.get(data.seq);if(!ack)return;clearTimeout(ack.timer);acknowledgements.delete(data.seq);
      if(data.ok){failed=false;ack.resolve();status('本机存档已保留')}else ack.reject(Error('存档写入失败，请保留页面并导出备份'));
    }else if(data.type==='snapshot'&&/^[a-f0-9-]{36}$/.test(data.requestId)){
      try{if(!capture)throw Error('引擎存档尚未就绪');void persist(capture(),data.requestId).catch(()=>{})}catch(e){status(e.message)}
    }else if(data.type==='menu'){
      const canvas=document.getElementById('canvas')??document.body;
      void requestNativeMenu(window,entry.runtimeKind,canvas).catch(error=>status(error.message));
    }
  };
  try{
    const snapshot=validateSnapshot(init.snapshot,id);
    loading.phase('restoring');
    installNativeInput(window,id,init.nativeInput);
    installAnonymousMedia(window);
    const assetOrigin=runtimeResourceOrigin(document.baseURI,entry,origin);
    const memory=createMemoryStorage(()=>{if(entry.runtimeKind==='Tyrano')queueMicrotask(()=>{if(!failed)void persist(storageSnapshot(memory)).catch(()=>{})})});
    if(entry.runtimeKind==='Tyrano'){restoreStorage(memory,snapshot.files);capture=()=>storageSnapshot(memory)}
    Object.defineProperty(window,'localStorage',{value:memory});Object.defineProperty(window,'sessionStorage',{value:createMemoryStorage()});
    // Optional upstream PWA caching is disabled; never register a worker on the
    // credentialed site. Resources are served by the scoped read-only projection.
    Object.defineProperty(navigator,'serviceWorker',{value:undefined});
    const nativeFetch=fetch.bind(window);window.fetch=(resource,options)=>nativeFetch(resource,{...options,credentials:'omit'});
    stopObserving=observeStartupRequests(window,loading,resource=>{
      const url=new URL(typeof resource==='string'?resource:resource?.url??resource?.href??'',document.baseURI);
      if(url.origin!==assetOrigin)return null;
      if(url.pathname.startsWith('/__engines/resource/'))return 'engine';
      if(!url.pathname.startsWith('/__player/resource/'+id+'/'))return null;
      return /\/(?:renpy|artemis)(?:-pre)?\.(?:js|wasm|data)$/.test(url.pathname)?'engine':'game';
    },resources,event=>{
      if(entry.runtimeKind!=='RenPy'||event.kind!=='game')return;
      if(event.failed)startupAbort.abort();
      else if(event.progress&&!startupAbort.signal.aborted)transferAt=Date.now();
    });
    let driver;const engineResources=engineResourcesForSession(init.engineRelease,entry.runtimeKind,assetOrigin);
    const engineBytes=await verifyDirectEngine(entry,init.engineRelease,assetOrigin);
    function instrument(){
      const FS=window.FS??driver.module.FS,IDBFS=window.IDBFS??driver.module.IDBFS,MEMFS=window.MEMFS??driver.module.MEMFS;
      if(!FS||!IDBFS||!MEMFS)throw Error('引擎文件系统尚未初始化');
      if(capture)return;
      capture=installMemoryPersistence({FS,IDBFS,MEMFS,mount:entry.mount,extraMount:entry.extraMount,files:snapshot.files,persist:files=>persist(files)});
      loading.phase('restoring');status('存档适配已连接');
    }
    if(entry.runtimeKind!=='Tyrano'){
      driver=createEmscriptenDriver({kind:entry.runtimeKind,engineBytes,prepareFilesystem:instrument,prepareRuntime:module=>prepareRenpyAudio(module,init.engineRelease?.id),resources:engineResources,progress:event=>loading.engine(event),status:state=>{if(state==='failed')loading.fail('引擎加载失败，请取消后重试');else if(['initializing','initialized'].includes(state))loading.phase('initializing')}});
      driver.installGlobal(window);
    }
    if(entry.runtimeKind==='Tyrano')Object.defineProperty(document,'readyState',{configurable:true,get:()=>"loading"});
    const scripts=[...document.querySelectorAll('script[type="application/x-wg-script"]')];
    for(const placeholder of scripts){
      const config=JSON.parse(placeholder.textContent),script=document.createElement('script');
      if(config.src){
        const url=new URL(config.src,document.baseURI),prefix=`${assetOrigin}/__player/resource/${id}/`;
        if(!url.href.startsWith(prefix))throw Error('脚本路径不属于当前游戏');
        if(entry.runtimeKind!=='Tyrano'&&/\/(?:artemis|renpy)\.js$/.test(url.pathname)){
          // These audited Emscripten builds unshift preRun callbacks internally,
          // so the final array callback must install persistence first.
          driver.beforeScript();
        }
        const engineFile=url.pathname.slice(`/__player/resource/${id}/`.length);
        loading.phase('downloading','engine');
        script.src=engineResources?.files.includes(engineFile)?resolveEngineResource(engineFile,engineResources):url.href;script.crossOrigin='anonymous';
        const digest=init.engineRelease?.files.find(f=>f.path===engineFile)?.sha256??entry.engineFiles[engineFile];if(digest)script.integrity='sha256-'+btoa(String.fromCharCode(...digest.match(/../g).map(h=>parseInt(h,16))));
        await new Promise((resolve,reject)=>{script.onload=()=>{
          if(entry.runtimeKind==='Tyrano'&&/\/html2canvas(?:\.min)?\.js$/i.test(url.pathname))window.html2canvas=sandboxThumbnail(()=>document.createElement('canvas'),()=>({title:entry.title,text:window.TYRANO?.kag?.stat?.current_save_str||window.TYRANO?.kag?.stat?.current_message_str||''}));
          resolve();
        };script.onerror=()=>reject(Error('游戏脚本加载失败'));placeholder.replaceWith(script)});
      }else{script.textContent=config.body;placeholder.replaceWith(script)}
    }
    if(entry.runtimeKind==='Tyrano'){installTyranoLoadCompatibility(window,id);delete document.readyState;document.dispatchEvent(new Event('DOMContentLoaded'));}
    // Tyrano entry handlers were declared after the inert document finished.
    if(typeof window.onload==='function')window.onload(new Event('load'));
    loading.phase('initializing');status('正在准备游戏；较大的作品可能需要数分钟');
    if(driver){
      await driver.waitReady(()=>driver.module.calledRun&&(document.getElementById('canvas')?.width??0)>400,{timeout:['renpy-v562-2','renpy-v3144-1'].includes(entry.id)?1800000:180000,...(entry.runtimeKind==='RenPy'?{progressAt:()=>transferAt,totalTimeout:1800000,signal:startupAbort.signal}:{})});
    }else await waitForTyranoReady(()=>window.TYRANO?.kag);
    loading.complete();send({type:'started'});resources.activate();
    status('游戏已启动；请在游戏内保存进度');
  }catch(error){loading.fail(error.message);resources.close();stopObserving();status('启动失败：'+error.message);console.error('WG runtime',error)}
});
