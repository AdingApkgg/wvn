import {useEffect,useRef,useState} from 'react';
import {createCacheClient,createForegroundReader,type ForegroundReader,type CacheClient,type DownloadMode,type DownloadProgress,type ResourceFile} from '../../public/cache/client.mjs';
import {prepareStartupResources} from '../../public/cache/startup.mjs';
import {loadCasManifest} from '../../public/player/cas-resources.mjs';
import {formatTransferBytes} from '../../public/ons/resource-loading.mjs';
import {Button} from '../components/ui/button';
import {ownOpeningTask,runCurrentStep} from './operation-scope.mjs';
import {useActionConfirmation} from '../components/confirm-action';
const preference='wvn-whole-resource-mode';
const isMode=(value:unknown):value is DownloadMode=>['demand','background','complete'].includes(String(value));
export function useResourceDownloads({origin,pilot,releaseId,onFile}:{origin:string|null;pilot:{id:string;versionId:string;runtimeKind?:string};releaseId?:string;onFile:(file:ResourceFile)=>void}){
 const confirmation=useActionConfirmation();
 const [mode,setMode]=useState<DownloadMode>('background'),[progress,setProgress]=useState<DownloadProgress|null>(null),[preparing,setPreparing]=useState(false),[problem,setProblem]=useState(''),[notice,setNotice]=useState('');
 const directOnly=useRef(false),foreground=useRef<ForegroundReader|null>(null),nativeBusy=useRef(false),readMode=()=>selected.current;
 const selected=useRef<DownloadMode>('background'),client=useRef<CacheClient|null>(null),manifest=useRef<any>(null),files=useRef(new Map<string,ResourceFile>()),opening=useRef<Promise<CacheClient|null>|null>(null),abort=useRef(new AbortController()),generation=useRef(0),openingEpoch=useRef(0),enterNow=useRef<(()=>void)|null>(null),fileListener=useRef(onFile);fileListener.current=onFile;
 const enabled=!!origin;
 useEffect(()=>{try{const saved=localStorage.getItem(preference);if(isMode(saved)){selected.current=saved;setMode(saved)}}catch{/* 不支持设置持久化时使用默认后台模式。 */}},[]);
 useEffect(()=>{abort.current=new AbortController();return()=>{openingEpoch.current++;generation.current++;abort.current.abort();void client.current?.close();client.current=null;opening.current=null;manifest.current=null;files.current.clear();enterNow.current?.();enterNow.current=null}},[origin,pilot.id,releaseId]);
 async function ensure(){
  if(!origin)throw Error('资源缓存未配置');if(directOnly.current&&selected.current==='demand')return null;if(client.current)return client.current;if(opening.current)return opening.current;
  const signal=abort.current.signal,epoch=openingEpoch.current,isCurrent=()=>!signal.aborted&&abort.current.signal===signal&&openingEpoch.current===epoch;
  const check=()=>{signal.throwIfAborted();if(!isCurrent())throw new DOMException('Obsolete resource preparation','AbortError')};
  return ownOpeningTask(opening,async()=>{
   check();if(!manifest.current){const loaded=await runCurrentStep(isCurrent,()=>loadCasManifest(pilot,{engine:releaseId,signal,fetcher:(input,init)=>fetch(input,{...init,credentials:'same-origin'})}));check();manifest.current=loaded}check();
   const created=createCacheClient({origin,manifest:manifest.current,entry:pilot,sharedEngine:pilot.runtimeKind!=='RenPy'||!!releaseId,onProgress:p=>{if(client.current!==created||!isCurrent())return;setProgress(p)},onFile:file=>{if(client.current!==created||!isCurrent())return;files.current.set(file.sha256,file);fileListener.current(file)}});client.current=created;foreground.current=createForegroundReader({client:created,files:files.current,onFallback:()=>{if(isCurrent()&&client.current===created)setProblem('公共缓存空间不足；未缓存资源本次按需从网络读取，已缓存资源与存档保留')}});
   try{await runCurrentStep(isCurrent,()=>created.ready);check();await runCurrentStep(isCurrent,()=>created.command('start',{mode:selected.current,prepareOnly:true}));check();return created}catch(error){await created.close();check();if(client.current===created)client.current=null;if(selected.current==='demand'&&manifest.current){directOnly.current=true;foreground.current=null;setProblem('公共缓存暂不可用；按需从已登记的资源地址读取，存档保留');return null}throw error}
  });
 }
 async function changeMode(value:DownloadMode){if(value!=='demand')directOnly.current=false;selected.current=value;setMode(value);try{localStorage.setItem(preference,value)}catch{/* 设置不可写不影响当前模式。 */}if(client.current)await client.current.command('start',{mode:value,prepareOnly:!preparing});if(value!=='complete'){enterNow.current?.();enterNow.current=null;}}
 async function prepare(){
  const own=++generation.current;setPreparing(true);setProblem('');
  try{
   const bridge=await ensure();if(own!==generation.current)throw new DOMException('Cancelled','AbortError');if(!bridge)return manifest.current;
   let whole:Promise<unknown>|undefined;
   for(;;){
    if(own!==generation.current)throw new DOMException('Cancelled','AbortError');
    if(readMode()==='complete'){
     const changed=new Promise<boolean>(resolve=>enterNow.current=()=>resolve(false));
     whole??=bridge.command('start',{mode:'complete',wait:true});
     const complete=await Promise.race([whole.then(()=>true),changed]);enterNow.current=null;
     if(complete&&readMode()==='complete'){if(files.current.size!==bridge.plan.rows.length)throw Error('完整资源回执尚未齐备');break}
    }else{
     // 最小启动集优先；模式改变后重新判断门槛，不沿用过时选择进入游戏。
     const m=manifest.current,byPath=new Map<string,any>(m.resources.map((row:any)=>[row.path,row])),targets=new Set<string>((m.engineResources?.files??[]).map((row:any)=>row.sha256));
     for(const file of m.ons?.files??[])if(!file.lazyload){const row=byPath.get(file.path);if(row)targets.add(row.sha256)}
     const allowed=new Map(bridge.plan.rows.map(row=>[row.sha256,row])),reader=foreground.current!;await prepareStartupResources([...targets].flatMap(sha=>{const row=allowed.get(sha);return row?[row]:[]}),(sha,options)=>reader.read(sha,options),{signal:abort.current.signal});
     if(readMode()!=='complete')break;
    }
   }
   if(own!==generation.current)throw new DOMException('Cancelled','AbortError');return manifest.current;
  }catch(error){if(own!==generation.current)throw new DOMException('Cancelled','AbortError');if((error as Error).name!=='AbortError')setProblem((error as Error).message);throw error}finally{if(own===generation.current)setPreparing(false)}
 }
 async function cancel(){generation.current++;openingEpoch.current++;const oldSignal=abort.current,old=client.current;client.current=null;opening.current=null;abort.current=new AbortController();oldSignal.abort(new DOMException('Resource preparation cancelled','AbortError'));enterNow.current?.();enterNow.current=null;setPreparing(false);nativeBusy.current=false;files.current.clear();setProgress(null);foreground.current=null;if(old)await old.close();}
 async function foregroundBusy(value:boolean){const bridge=client.current;if(!bridge||nativeBusy.current===value)return;nativeBusy.current=value;await bridge.command('pause',{foregroundBusy:value})}
 async function enter(){await changeMode('background');await client.current?.command('start',{mode:'background',resume:true});enterNow.current?.();enterNow.current=null;}
 async function clear(){if(!await confirmation.ask('清理本作资源缓存？','仅清理本作公共资源缓存；存档、历史备份及其他活动作品资源保留。','清理资源缓存'))return;await cancel();const created=await ensure();if(!created)throw Error('公共缓存暂不可用，请恢复连接后清理');try{const result=await created.command('clear');files.current.clear();setProgress(null);setProblem('');setNotice(result.retained?'已清理可释放的公共资源；其他活动作品正在使用的共享资源及全部存档保留':'本作资源缓存已清理，存档和历史备份保留')}finally{await created.close();if(client.current===created)client.current=null}}
 return {enabled,mode,progress,preparing,problem,notice,directOnly,confirmation:confirmation.dialog,read:(sha:string,options?:{signal?:AbortSignal})=>foreground.current?foreground.current.read(sha,options):Promise.resolve({sha256:sha,direct:true as const}),reportError:(error:unknown)=>setProblem(error instanceof Error?error.message:String(error)),client,manifest,files,ensure,prepare,cancel,changeMode,enter,clear,foregroundBusy,pause:async()=>{await client.current?.command('pause')},resume:async()=>{setProblem('');foreground.current?.reset();await client.current?.command('start',{mode:selected.current,resume:true})},started:async()=>{await client.current?.command('start',{mode:selected.current})}};
}
export function ResourceDownloads({downloads,running}:{downloads:ReturnType<typeof useResourceDownloads>;running:boolean}){
 if(!downloads.enabled)return null;const act=(promise:Promise<unknown>)=>void promise.catch(downloads.reportError);const p=downloads.progress,complete=p?.completed===p?.total&&p?.total!==undefined,percent=p&&p.totalBytes>0?Math.floor(p.verifiedBytes/p.totalBytes*100):null;
 return <section className="my-4 space-y-2 rounded-lg border p-3" aria-label="资源下载" data-testid="whole-resource-downloads" data-state={p?.status??'idle'}>
  <label className="flex flex-wrap items-center gap-2">资源加载方式 <select value={downloads.mode} onChange={event=>act(downloads.changeMode(event.target.value as DownloadMode))} className="rounded border bg-background p-1"><option value="background">边玩边加载全部</option><option value="demand">按需加载</option><option value="complete">完整加载后进入</option></select></label>
  <p className="text-sm text-muted-foreground">仅加载当前作品与所选引擎；公共资源缓存与存档分别保留。</p>
  {p&&<div role="status" data-testid="whole-resource-progress" data-completed={p.completed} data-total={p.total} data-verified={p.verifiedBytes}><span>{complete?'资源已完整缓存':p.status==='quota'?'空间不足，已暂停全量下载':p.reason==='rate-limit'?'资源服务限流，已暂停全量下载':p.status==='failed'?'部分资源下载失败':p.paused?'下载已暂停':'资源准备中'} · {formatTransferBytes(p.verifiedBytes)} / {formatTransferBytes(p.totalBytes)} · {p.completed} / {p.total} 项</span>{percent!==null&&<progress className="block w-full" value={p.verifiedBytes} max={p.totalBytes} aria-label="完整资源已校验进度"/>}{p.speed>0&&<span>{formatTransferBytes(p.speed)}/s · 当前传输 {formatTransferBytes(p.activeBytes)}</span>}</div>}
  {downloads.notice&&<p role="status">{downloads.notice}</p>}
  {downloads.problem&&<p role="alert">{downloads.problem}；可选择按需加载后重试。</p>}
  <div className="flex flex-wrap gap-2">
   {p&&!complete&&(p.paused||p.status==='failed'||p.status==='quota'?<Button variant="outline" size="sm" onClick={()=>act(downloads.resume())}>继续下载</Button>:<Button variant="outline" size="sm" onClick={()=>act(downloads.pause())}>暂停下载</Button>)}
   {downloads.preparing&&<>{downloads.mode==='complete'&&<Button size="sm" onClick={()=>act(downloads.enter())}>现在进入并后台继续</Button>}<Button variant="ghost" size="sm" onClick={()=>act(downloads.cancel())}>取消资源准备</Button></>}
   <Button variant="ghost" size="sm" disabled={running||downloads.preparing} onClick={()=>act(downloads.clear())}>清理本作资源缓存</Button>
  </div>
 {downloads.confirmation}</section>;
}
