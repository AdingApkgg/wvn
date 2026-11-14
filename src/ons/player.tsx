import {createReaderFullscreen,type FullscreenMode} from './fullscreen.mjs';
import {ResourceDownloads,useResourceDownloads} from "./resource-downloads";
import {readCasManifest} from '../../public/player/cas-resources.mjs';
import {LoadingView,ResourceLoadingBar} from "./loading";
import {validateLoadingProgress,type LoadingProgress} from "../../public/ons/loading.mjs";
import {validateResourceProgress,type ResourceProgress} from "../../public/ons/resource-loading.mjs";
import {createOnsResourcePlan,openResourceCacheStore,createOnsResourceSession,clearOnsResourceCache,type ResourceSession,type ResourceStore,type CacheStats} from "../../public/ons/resource-cache.mjs";
import {formatTransferBytes} from "../../public/ons/resource-loading.mjs";
import { brand } from "../brand";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useBlocker, useLocation } from "react-router";
import { claimStartIntent } from "../lib/reader-experience";
import {useActionConfirmation} from '../components/confirm-action';
import type { Snapshot } from "../../public/ons/protocol.mjs";
import type { SaveStore, SavedRevision } from "../../public/ons/storage.mjs";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { nativeInputSpec, validatePlayerName } from "../../public/player/native-input.mjs";
import { NativeSelect, NativeSelectOption } from "../components/ui/native-select";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "../components/ui/alert-dialog";
import { OnsCloud } from './cloud';
import { ReadingSession } from '../accounts/reading-session';
import {consumeStartupNotice} from '../analytics/startup';
import {recordReading,trackPublicEvent} from '../analytics/client';
import {parseWorkSlug} from '../identity';
import {watchBootstrap} from './bootstrap-deadline.mjs';
import {runCurrentStep,commitCurrentStep} from './operation-scope.mjs';

type Runtime = {engineReleaseId:string;saveCompatibilityId:string;database:string;stage:string;engineRelease:{id:string;kind:string;files:{path:string;sha256:string}[]}};
type Pilot = {resourceDelivery?:'cas';engineRuntime?:Runtime;engineOption?:Runtime;engineReleaseId?:string;saveCompatibilityId?:string; id: string; title: string; versionId: string; engine: string; legacySave: string; runtimeKind?: string; legacyHint?: string; engineCandidate?: {releaseId:string;database:string;cloudEnabled:false;compatibility:"unknown";engineRelease?:{id:string;kind:string;files:{path:string;sha256:string}[]}} };
type History = Omit<SavedRevision, "snapshot" | "bytesHeld">;
type StorageModule = typeof import("../../public/ons/storage.mjs");
type ProtocolModule = typeof import("../../public/ons/protocol.mjs");
async function modules() {
  const storagePath = "/ons/storage.mjs", protocolPath = "/ons/protocol.mjs";
  return {
    storage: await import(/* @vite-ignore */ storagePath) as StorageModule,
    protocol: await import(/* @vite-ignore */ protocolPath) as ProtocolModule,
  };
}
// Firefox 刷新时不能沿用上次按钮的可用状态；以本次存档初始化为准。
const startButtonPersistence = { autoComplete: "off" } as const;
export function OnsPlayer({ pilot, workUrl, cloud = false, resourceCacheOrigin=null, contentBlocked=false, autoStart=false,versionNumber }: { pilot: Pilot; workUrl: string; cloud?: boolean; resourceCacheOrigin?:string|null;contentBlocked?:boolean;autoStart?:boolean;versionNumber?:number }) {
  const routeLocation=useLocation(),starting=useRef(false);
  const confirmation=useActionConfirmation();
  const runtime=pilot.engineRuntime??pilot.engineCandidate,releaseId=pilot.engineRuntime?.engineReleaseId??pilot.engineCandidate?.releaseId;
  const targetLabel=`版本 ${versionNumber??pilot.versionId} · ${releaseId?'独立引擎 '+releaseId.slice(0,20):(pilot.runtimeKind??'ONS')+' 原引擎档案'}`;
  const [ready, setReady] = useState(false), [running, setRunning] = useState(false);
  const [gameStarted,setGameStarted]=useState(false);
  const [cacheStats,setCacheStats]=useState<CacheStats|null>(null);
  const [resources,setResources]=useState<ResourceProgress|null>(null);
  const [loading,setLoading]=useState<LoadingProgress|null>(null),[loadStartedAt,setLoadStartedAt]=useState(0);
  const [status, setStatus] = useState("正在读取本机存档…"), [error, setError] = useState("");
  const [localBusy, setBusy] = useState(false), [cloudBusy,setCloudBusy]=useState(false), [history, setHistory] = useState<History[]>([]), [selected, setSelected] = useState("");
  const busy=localBusy||cloudBusy;
  const [savePanel, setSavePanel] = useState(false), [cloudStatus, setCloudStatus] = useState(cloud ? "云端：正在确认账号" : "云端：未启用");
  const [head, setHead] = useState<SavedRevision | null>(null);
  const inputSpec=nativeInputSpec(pilot.id),[playerName,setPlayerName]=useState("");
  const store = useRef<SaveStore | null>(null), current = useRef<SavedRevision | null>(null);
  const frame = useRef<HTMLIFrameElement>(null), surface = useRef<HTMLDivElement>(null);
  const fullscreen=useRef<ReturnType<typeof createReaderFullscreen>|null>(null),[fullscreenMode,setFullscreenMode]=useState<FullscreenMode>('none');
  useEffect(()=>{if(!surface.current)return;const controller=createReaderFullscreen(surface.current,{onChange:setFullscreenMode});fullscreen.current=controller;return()=>{controller.close();if(fullscreen.current===controller)fullscreen.current=null}},[]);
  useEffect(()=>{if(contentBlocked)void fullscreen.current?.exit().catch(()=>{})},[contentBlocked]);
  function preserveGameFocus(event: MouseEvent<HTMLElement>) {
    // 同一活跃页面内先完成按钮点击，再由弹窗移交焦点，避免复查在按下与点击间收起控件。
    // 真正切回窗口仍执行全局资格复查；键盘、输入框和选择器保持原生焦点行为。
    if (event.button === 0 && document.visibilityState === "visible" && document.hasFocus() &&
      document.activeElement === frame.current && event.target instanceof Element && event.target.closest("button"))
      event.preventDefault();
  }
  const channel = useRef<{ port: MessagePort; nonce: string; seq: number; writing: boolean;started:boolean;resourceReady?:boolean;dispose:()=>void;cache?:ResourceSession } | null>(null);
  const pending = useRef(new Map<string, { resolve: (value: { snapshot: Snapshot; saved: boolean }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const downloads=useResourceDownloads({origin:pilot.resourceDelivery==='cas'?resourceCacheOrigin:null,pilot,releaseId,onFile:file=>{const c=channel.current;if(c?.resourceReady)c.port.postMessage({type:'cache-files',pilot:pilot.id,nonce:c.nonce,files:[file]})}});
  const active = useRef(true);
  const runningNow = useRef(false);
  const blockedNow=useRef(contentBlocked);blockedNow.current=contentBlocked;
  useEffect(()=>{const c=channel.current;if(c)c.port.postMessage({type:'content-visibility',pilot:pilot.id,nonce:c.nonce,visible:!contentBlocked})},[contentBlocked,pilot.id]);
  useEffect(()=>{
    const exit=()=>{void run(async()=>{
      try{
        if(runningNow.current&&channel.current?.started&&!(await capture()).saved)throw Error('本机备份尚未成功，请保留页面重试');
        channel.current?.dispose();channel.current=null;changeRunning(false);window.location.assign(workUrl);
      }catch(error){window.dispatchEvent(new CustomEvent('wg-content-save-error',{detail:error instanceof Error?error.message:'本机保存未完成'}));throw error;}
    })};
    window.addEventListener('wg-content-save-exit',exit);return()=>window.removeEventListener('wg-content-save-exit',exit);
  },[pilot.id,workUrl]);
  const bootstrapAcknowledged=useRef(false),bootstrapExpired=useRef(false),startupAttempt=useRef(0),bootstrapDeadline=useRef<ReturnType<typeof watchBootstrap>|null>(null);
  function changeRunning(value: boolean) { if(!value)void fullscreen.current?.exit().catch(()=>{});startupAttempt.current++;bootstrapDeadline.current?.close();bootstrapDeadline.current=null;bootstrapAcknowledged.current=false;bootstrapExpired.current=false;runningNow.current = value; setRunning(value);setGameStarted(false);setResources(null);setLoading(value?{stage:"connecting"}:null);if(value)setLoadStartedAt(Date.now()); }
  function cancelLoading(){
    if(channel.current?.started)return;
    channel.current?.dispose();channel.current=null;void downloads.cancel();changeRunning(false);setError("");setStatus("已取消加载，本机存档和历史备份保留");
  }
  const blocker = useBlocker(({ currentLocation, nextLocation }) => runningNow.current && (currentLocation.pathname !== nextLocation.pathname || new URLSearchParams(currentLocation.search).get("engine") !== new URLSearchParams(nextLocation.search).get("engine")));
  async function refresh() {
    const value = await store.current!.get(pilot.id);
    current.current = value; setHead(value); setHistory(await store.current!.history(pilot.id));
  }
  useEffect(() => {
    active.current = true;
    let instance: SaveStore | null = null;
    void (async () => {
      const { storage } = await modules(); instance = await storage.openSaveStore(runtime?.database);
      if (!active.current) { instance.close(); return; }
      store.current = instance; await refresh();
      setReady(true); setStatus("本机存档已就绪");
    })().catch(e => { if (active.current) setError(e.message || "本机存档不可用"); });
    return () => {
      active.current = false; channel.current?.dispose(); channel.current = null;
      for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(Error("播放器已关闭")); }
      pending.current.clear(); instance?.close();
    };
  }, [pilot.id,releaseId]);
  useEffect(() => {
    if (!running) return;
    const before = (event: BeforeUnloadEvent) => { if(!runningNow.current)return;event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [running]);
  useEffect(()=>{
    if(!running||gameStarted||!downloads.enabled||pilot.runtimeKind!=='RenPy'||!releaseId||bootstrapAcknowledged.current)return;
    const target=frame.current,attempt=startupAttempt.current;
    const deadline=watchBootstrap({onTimeout:()=>{
      if(!active.current||!runningNow.current||startupAttempt.current!==attempt||frame.current!==target||bootstrapAcknowledged.current)return;
      bootstrapExpired.current=true;
      channel.current?.dispose();channel.current=null;
      setLoading({stage:'failed',message:'播放器入口连接超时，请返回阅读准备后重试；本机存档和历史备份保留'});
    }});
    bootstrapDeadline.current=deadline;
    return()=>{deadline.close();if(bootstrapDeadline.current===deadline)bootstrapDeadline.current=null};
  },[running,gameStarted,downloads.enabled,pilot.id,pilot.runtimeKind,releaseId]);
  async function run(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); } catch (e) { if (active.current&&(e as Error).name!=="AbortError") setError(e instanceof Error ? e.message : "操作失败，原备份保留"); }
    finally { if (active.current) setBusy(false); }
  }
  async function startReading() {
    if(starting.current)return;starting.current=true;
    const isCurrent=()=>active.current&&!blockedNow.current&&!runningNow.current;
    try {
      if(inputSpec)validatePlayerName(playerName);
      await runCurrentStep(isCurrent,refresh);
      if(downloads.enabled)await runCurrentStep(isCurrent,()=>downloads.prepare());
      if(!isCurrent())return;
      setStatus("正在连接沙箱…");changeRunning(true);
    } finally { starting.current=false; }
  }
  useEffect(()=>{
    if(!ready||!autoStart||contentBlocked||inputSpec||runningNow.current)return;
    try { if(claimStartIntent(routeLocation.key,pilot.versionId,routeLocation.state?.startReading,window.sessionStorage))void run(startReading); } catch { /* 会话存储不可用时保留手动开始。 */ }
  },[ready,autoStart,contentBlocked,routeLocation.key,pilot.versionId]);
  async function connect(target:HTMLIFrameElement,attempt:number) {
    if (!store.current || !target.contentWindow || frame.current!==target || startupAttempt.current!==attempt || bootstrapExpired.current || !active.current || !runningNow.current) return;
    const targetWindow=target.contentWindow;
    channel.current?.dispose();
    const ports = new MessageChannel(), nonce = crypto.randomUUID();
    const controller=new AbortController();let cache:ResourceSession|undefined,resourceStore:ResourceStore|null=null;
    const connection:{port:MessagePort;nonce:string;seq:number;writing:boolean;started:boolean;resourceReady?:boolean;dispose:()=>void;cache?:ResourceSession}={port:ports.port1,nonce,seq:0,writing:false,started:false,dispose(){controller.abort();if(downloads.enabled)void downloads.cancel();cache?.close();resourceStore?.close();ports.port1.close()}};channel.current=connection;
    const isCurrent=()=>active.current&&runningNow.current&&!bootstrapExpired.current&&startupAttempt.current===attempt&&frame.current===target&&target.contentWindow===targetWindow&&channel.current===connection&&!controller.signal.aborted;
    const resourceRequests=new Map<string,AbortController>();
    const requests=new Map<string,AbortController>(),resourceQueue:{requestId:string;key:string;controller:AbortController;detach:()=>void}[]=[];let fetching=0;
    const sendResource=(value:object,bytes?:Uint8Array)=>{if(channel.current!==connection||controller.signal.aborted)return;try{ports.port1.postMessage({...value,pilot:pilot.id,nonce},bytes?[bytes.buffer as ArrayBuffer]:[])}catch{/* 退出后的资源回执无需送达。 */}};
    const wholeKeys=new Map<string,string>(),wholeAllowed=new Set<string>();
    const pumpResources=()=>{while((cache||downloads.client.current)&&fetching<2&&resourceQueue.length&&!controller.signal.aborted){const job=resourceQueue.shift()!;if(job.controller.signal.aborted)continue;fetching++;const loading:Promise<{blob?:Blob;data?:Uint8Array;direct?:boolean}>=downloads.client.current?(wholeKeys.has(job.key)?downloads.read(wholeKeys.get(job.key)!,{signal:job.controller.signal}):Promise.reject(Error('资源键不属于当前清单'))):cache!.load(job.key,progress=>sendResource({type:'ons-resource-progress',requestId:job.requestId,...progress}));void loading.then(value=>{job.controller.signal.throwIfAborted();return value}).then(value=>sendResource({type:'ons-resource-result',requestId:job.requestId,ok:true,...(value.direct?{direct:true}:value.blob?{blob:value.blob}:{data:value.data})},value.data)).catch(error=>{if(!job.controller.signal.aborted)sendResource({type:'ons-resource-result',requestId:job.requestId,ok:false,error:String(error.message??'资源读取失败').slice(0,200)})}).finally(()=>{fetching--;job.detach();if(requests.get(job.requestId)===job.controller)requests.delete(job.requestId);pumpResources()})}};
    try{
    const { protocol } = await runCurrentStep(isCurrent,modules);
    ports.port1.onmessage = async ({ data }) => {
      if (!isCurrent() || !data || data.nonce !== nonce || data.pilot !== pilot.id) return;
      if(consumeStartupNotice(data,connection,pilot.id)){
        bootstrapAcknowledged.current=true;bootstrapDeadline.current?.acknowledge();
        connection.cache?.startPrefetch();if(downloads.enabled)void downloads.started().catch(()=>{});setGameStarted(true);setLoading(null);const id=parseWorkSlug(workUrl.split('/')[1]??'');if(id)void recordReading(id,pilot.versionId);trackPublicEvent('reading_start',undefined,window.location.pathname);return;
      }
      if(data.type==='cache-resource-cancel'){resourceRequests.get(data.requestId)?.abort();return;}
      if(data.type==='cache-resource'){
        const bridge=downloads.client.current;if(!bridge||!/^[a-f0-9-]{36}$/.test(data.requestId??'')||resourceRequests.has(data.requestId)||resourceRequests.size>=64||!wholeAllowed.has(data.sha256)){sendResource({type:'cache-resource-result',requestId:data.requestId,ok:false,error:'资源请求无效'});return}
        const request=new AbortController(),cancel=()=>request.abort();resourceRequests.set(data.requestId,request);controller.signal.addEventListener('abort',cancel,{once:true});
        void downloads.read(data.sha256,{signal:request.signal}).then(file=>sendResource({type:'cache-resource-result',requestId:data.requestId,ok:true,...file})).catch(error=>sendResource({type:'cache-resource-result',requestId:data.requestId,ok:false,name:error.name,error:String(error.message).slice(0,240)})).finally(()=>{controller.signal.removeEventListener('abort',cancel);resourceRequests.delete(data.requestId)});return;
      }
      if(data.type==='ons-resource-cancel'){requests.get(data.requestId)?.abort();requests.delete(data.requestId);const queued=resourceQueue.findIndex(job=>job.requestId===data.requestId);if(queued>=0)resourceQueue.splice(queued,1);return;}
      if(data.type==='ons-resource'){
        if(!cache&&!downloads.client.current&&downloads.directOnly.current&&typeof data.key==='string'&&wholeKeys.has(data.key)&&/^[a-f0-9-]{36}$/.test(data.requestId??'')){sendResource({type:'ons-resource-result',requestId:data.requestId,ok:true,direct:true});return;}
        if((!cache&&!downloads.client.current)||typeof data.key!=='string'||data.key.length>300||!/^[-a-f0-9]{36}$/.test(data.requestId??'')||requests.has(data.requestId)||requests.size>=64){sendResource({type:'ons-resource-result',requestId:data.requestId,ok:false,error:'资源请求无效'});return;}
        const request=new AbortController(),abort=()=>request.abort(),detach=()=>controller.signal.removeEventListener('abort',abort);controller.signal.addEventListener('abort',abort,{once:true});request.signal.addEventListener('abort',detach,{once:true});requests.set(data.requestId,request);resourceQueue.push({requestId:data.requestId,key:data.key,controller:request,detach});pumpResources();return;
      }
      if(data.type==="resource-progress"){if(connection.started){const value=validateResourceProgress(data);if(value){setResources(value);if(downloads.enabled)void downloads.foregroundBusy(value.active>0).catch(downloads.reportError)}}return;}
      if(data.type==="loading-progress"){if(!connection.started){const value=validateLoadingProgress(data);if(value){bootstrapAcknowledged.current=true;bootstrapDeadline.current?.acknowledge();setLoading(value)}}return;}
      if (data.type === "status" && typeof data.message === "string" && data.message.length <= 500) { setStatus(data.message); return; }
      if (data.type !== "snapshot" || !Number.isSafeInteger(data.seq) || data.seq !== connection.seq + 1 || connection.writing) return;
      connection.seq = data.seq; connection.writing = true;
      let snapshot: Snapshot | undefined, saved = false;
      try {
        snapshot = protocol.validateSnapshot(data.snapshot, pilot.id);
        const value = await store.current!.commit(pilot.id, current.current?.revision ?? 0, snapshot, "engine");
        if (channel.current !== connection || !active.current) return;
        const changed = current.current?.revision !== value.revision;
        current.current = value; setHead(value); saved = true;
        if (changed) setHistory(await store.current!.history(pilot.id));
      } catch (e) { if (active.current&&(e as Error).name!=="AbortError") setError(e instanceof Error ? e.message : "本机保存失败，请导出当前存档"); }
      finally {
        connection.writing = false;
        if (channel.current === connection) ports.port1.postMessage({ type: "ack", nonce, pilot: pilot.id, seq: data.seq, ok: saved });
        const request = pending.current.get(data.requestId);
        if (request) {
          clearTimeout(request.timer); pending.current.delete(data.requestId);
          if (snapshot) request.resolve({ snapshot, saved }); else request.reject(Error("引擎返回的存档无效"));
        }
      }
    };
    let resourceManifest:unknown,casManifest:any;
    if(pilot.resourceDelivery==='cas'){
      if(downloads.enabled){await runCurrentStep(isCurrent,downloads.ensure);casManifest=downloads.manifest.current}else{const response=await fetch('/api/player/'+encodeURIComponent(pilot.id)+'/resources'+(releaseId?'?engine='+encodeURIComponent(releaseId):''),{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});casManifest=await readCasManifest(response,pilot)}resourceManifest=casManifest.ons;
      if(downloads.enabled){for(const row of downloads.client.current?.plan.rows??[])wholeAllowed.add(row.sha256);for(const row of casManifest.resources)wholeKeys.set('game:'+row.path,row.sha256);const wasm=casManifest.engineResources.files.find((row:any)=>row.path==='onsyuri.wasm');if(wasm)wholeKeys.set('engine:wasm',wasm.sha256);}
    }
    if(!pilot.runtimeKind&&!downloads.enabled){
      if(!casManifest){const response=await fetch('/__ons/manifest/'+encodeURIComponent(pilot.id),{credentials:'same-origin',cache:'no-cache',redirect:'error',signal:controller.signal});if(!response.ok)throw Error('资源清单不可用');
      const text=await response.text();if(text.length>32*1024*1024)throw Error('资源清单过大');resourceManifest=JSON.parse(text);}
      const plan=await createOnsResourcePlan(pilot,resourceManifest,location.origin,runtime?.engineRelease,casManifest);
      if(controller.signal.aborted)return;
      try{resourceStore=await openResourceCacheStore()}catch{/* 浏览器不支持持久缓存时继续读取网络资源。 */}
      let maxBytes=256*1024*1024;
      try{const {quota,usage}=await navigator.storage.estimate();if(quota!==undefined&&usage!==undefined)maxBytes=Math.max(0,Math.min(maxBytes,Math.floor((quota-usage)/4)))}catch{/* 使用有限的默认缓存预算。 */}
      if(controller.signal.aborted){resourceStore?.close();return}
      cache=createOnsResourceSession({plan,store:resourceStore,maxBytes,maxFileBytes:Math.min(32*1024*1024,maxBytes),onStats:stats=>{if(channel.current===connection&&active.current&&!controller.signal.aborted)setCacheStats(stats)}});connection.cache=cache;
    }
    // Opaque frames have no serializable target origin. Bind one dedicated port to
    // this exact frame; never broadcast credentials or expose a general fetch API.
    if(!commitCurrentStep(isCurrent,()=>{targetWindow.postMessage({ type: "WG_ONS_INIT", pilot: pilot.id, nonce, ...(casManifest?{casManifest}:{}), ...(downloads.enabled&&!downloads.directOnly.current?{resourceBroker:true,resourceFiles:[...downloads.files.current.values()]}:{}), ...(pilot.runtimeKind==='RenPy'&&runtime?.engineRelease?{engineRelease:runtime.engineRelease}:{}), ...(inputSpec?{nativeInput:{playerName:validatePlayerName(playerName)}}:{}), ...(resourceManifest?{resourceManifest}:{}), snapshot: current.current?.snapshot ?? { schema: 1, pilot: pilot.id, files: [] } }, "*", [ports.port2]);ports.port1.postMessage({type:'content-visibility',pilot:pilot.id,nonce,visible:!blockedNow.current});connection.resourceReady=true})){
      controller.abort();cache?.close();resourceStore?.close();ports.port1.close();ports.port2.close();
    }
    }catch(error){
      if(isCurrent()){connection.dispose();if(channel.current===connection)channel.current=null;if((error as Error).name!=='AbortError')setLoading({stage:'failed',message:(error as Error).message})}
      else{controller.abort();cache?.close();resourceStore?.close();ports.port1.close();ports.port2.close()}
    }
  }
  function capture(): Promise<{ snapshot: Snapshot; saved: boolean }> {
    const connection = channel.current;
    if (!connection) return Promise.reject(Error("引擎尚未连接"));
    if(!connection.started)return Promise.reject(Error("游戏仍在加载，请稍后操作；本机存档仍保留"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.current.delete(requestId); reject(Error("存档读取超时，请保留页面后重试")); }, 30000);
      pending.current.set(requestId, { resolve, reject, timer });
      connection.port.postMessage({ type: "snapshot", pilot: pilot.id, nonce: connection.nonce, requestId });
    });
  }
  function download(text: string, suffix: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `wg-${pilot.id}-${suffix}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function adopt(snapshot: Snapshot, reason: "legacy-import" | "file-import" | "restore") {
    if (running) throw Error("请先结束阅读并保存，再恢复备份");
    if (current.current && !await confirmation.ask("恢复到本机？","将以此备份作为下次启动的进度。当前本机副本会保留在历史中。","确认恢复")) return;
    await store.current!.commit(pilot.id, current.current?.revision ?? 0, snapshot, reason);
    await refresh(); setStatus("备份已保留，下次启动将从此存档读取");
  }
  const renderedStartupAttempt=startupAttempt.current;
  return (
    <main className="reader-shell">
      <header className="reader-heading">
        <Link to={workUrl} className="brand" aria-label="返回作品">← {pilot.title}</Link>
        <Link to="/" className="text-sm text-muted-foreground">发现更多故事</Link>
      </header>
      <p className="reader-context text-sm text-muted-foreground">{targetLabel}</p>
      <div ref={surface} className="reader-surface" style={{ minHeight: running ? "min(72vh, 850px)" : "min(50vh, 520px)" }}>
        {running ? <iframe ref={frame} title={`${pilot.title} · ${pilot.runtimeKind ?? "ONS"} 沙箱`} src={`${pilot.runtimeKind ? "/__player/runtime/" : "/__ons/runtime/"}${pilot.id}`} sandbox="allow-scripts" allow="autoplay; fullscreen *; gamepad *" allowFullScreen aria-busy={!gameStarted} onLoad={event => { const element=event.currentTarget;if(bootstrapExpired.current||startupAttempt.current!==renderedStartupAttempt||frame.current!==element)return;void connect(element,renderedStartupAttempt).catch(e=>{if(active.current&&runningNow.current&&!bootstrapExpired.current&&startupAttempt.current===renderedStartupAttempt&&frame.current===element&&e.name!=="AbortError")setLoading({stage:"failed",message:e.message});}); }} style={{ display: "block", border: 0, width: "100%", height: "72vh" }} /> : <p className="p-10 text-center text-muted-foreground">{head ? `已保留 ${head.snapshot.files.length} 个存档文件，开始阅读后恢复。` : `游戏自身保存后，${brand.shortName} 会保留本机副本。`}</p>}
        {running&&gameStarted&&<ResourceLoadingBar progress={resources} onManage={()=>{void run(async()=>{await fullscreen.current?.exit();const tools=surface.current?.parentElement?.querySelector<HTMLDetailsElement>('.advanced-tools');if(tools){tools.open=true;tools.scrollIntoView({block:'nearest'})}})}}/>}
        {running&&!gameStarted&&loading&&<LoadingView progress={loading} startedAt={loadStartedAt} onCancel={cancelLoading} />}
      {!running&&inputSpec&&<div className="my-4 max-w-sm space-y-2"><Label htmlFor="player-name">{inputSpec.label}</Label><Input id="player-name" value={playerName} maxLength={inputSpec.maxLength} autoComplete="off" placeholder="输入游戏中使用的名字" onChange={event=>setPlayerName(event.target.value)} /><p className="text-sm text-muted-foreground">开始新游戏时使用此名字；读取旧档后以存档内容为准。</p></div>}
      <div className="reader-toolbar" aria-label="阅读操作" onMouseDown={preserveGameFocus}>
        <div className="reader-controls">
          {!running ? <Button {...startButtonPersistence} data-testid="reader-start" data-ready={ready?"true":"false"} disabled={!ready || busy||contentBlocked} onClick={() => run(startReading)}>{head?.snapshot.files.length ? "继续阅读" : "开始阅读"}</Button> : <>
            <Button variant="outline" disabled={busy||!gameStarted} onClick={() => { const c = channel.current; if (c) c.port.postMessage({ type: "menu", pilot: pilot.id, nonce: c.nonce }); }}>游戏菜单</Button>
            <Button variant="outline" disabled={busy||!gameStarted} onClick={() => run(async () => { const result = await capture(); if (!result.saved) throw Error("存档尚未保留，请先导出当前存档"); channel.current?.dispose(); channel.current = null; changeRunning(false); setStatus("阅读已结束，本机副本已保留"); })}>结束阅读</Button>
            <Button variant="ghost" aria-pressed={fullscreenMode!=='none'} onClick={() => run(async () => { await fullscreen.current?.toggle(); })}>{fullscreenMode==='none'?'全屏':'退出全屏'}</Button>
          </>}
        </div>
        <Button variant="ghost" aria-expanded={savePanel} aria-controls="reader-save-panel" onClick={() => {void run(async()=>{await fullscreen.current?.exit();setSavePanel(open => !open)})}}>存档与备份</Button>
      </div>
      {fullscreenMode==='page'&&<p className="reader-fullscreen-note" role="status">已铺满页面；Safari 地址栏由浏览器控制。</p>}
      </div>
      <details className="advanced-tools" open={downloads.preparing||!!downloads.problem||!!downloads.notice||!!error||undefined}><summary>加载与高级工具</summary><div>
      <ResourceDownloads downloads={downloads} running={running}/>
      {!pilot.runtimeKind&&!downloads.enabled&&<div className="reader-cache-info" data-testid="ons-cache-status" data-hits={cacheStats?.hits??0} data-downloads={cacheStats?.downloads??0} data-preloaded={cacheStats?.preloaded??0} data-bytes={cacheStats?.bytes??0}>
        <p>{cacheStats?(cacheStats.available?`资源缓存：本次复用 ${cacheStats.hits} 项 · 已用 ${formatTransferBytes(cacheStats.bytes)}`:'浏览器缓存暂不可用，本次仍可正常阅读'):'读过的资源会保留在浏览器中；空闲时少量预加载。'}{cacheStats?.prefetching?' · 正在预加载':cacheStats?.preloaded?` · 已预加载 ${cacheStats.preloaded} 项`:''}</p>
        <Button variant="ghost" size="sm" disabled={running||busy||!ready} title={running?'结束阅读后可清理':undefined} onClick={()=>run(async()=>{await clearOnsResourceCache(pilot.id);setCacheStats(null);setStatus('本作资源缓存已清理，存档和历史备份保留')})}>清理本作资源缓存</Button>
      </div>}
      {pilot.engineOption&&<div className="flex flex-wrap items-center gap-3 text-sm"><span>{pilot.engineRuntime?'新版引擎独立存档':'原引擎存档'}</span><Link className="underline" to={pilot.engineRuntime?'?':'?engine='+encodeURIComponent(pilot.engineOption.engineReleaseId)}>{pilot.engineRuntime?'切回原引擎':'使用新版引擎（独立存档）'}</Link></div>}
      {pilot.engineRuntime&&<p role="note" className="muted">新引擎 {pilot.engineRuntime.engineReleaseId.slice(0,20)} · 使用独立本机工作区与云端档案。旧档需主动复制，原档和历史保留。{pilot.engineRuntime.stage==='cloud-testing'?'正在预览验收。':''}</p>}
      {pilot.engineCandidate&&<p role="note" className="muted">候选引擎 · 存档保留在独立工作区，云端同步关闭。导入旧档仅创建副本，兼容性尚未确认。</p>}
      </div></details>
      <div className="reader-save-status" data-state={error?"error":head?"saved":"pending"} role="status" aria-live="polite"><span>本机副本：{head?new Date(head.createdAt).toLocaleString('zh-CN')+' · ':''}{status}</span><span>{cloudStatus}</span></div>
      {error && blocker.state !== "blocked" && <div role="alert" className="reader-error"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setSavePanel(true)}>打开存档管理并导出</Button></div>}
      <p className="reader-tip">游戏进度请在游戏内存档；WVN 备份已有存档文件。本机副本不会自动上传云端。</p>
      <ReadingSession running={running&&gameStarted} />
      <section id="reader-save-panel" className="reader-save-panel space-y-5" hidden={!savePanel} aria-label="存档管理面板" onMouseDown={preserveGameFocus}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2>存档与备份</h2><Button variant="outline" disabled={!ready || busy} onClick={() => run(async () => { const { storage } = await modules(); const snapshot = running ? (await capture()).snapshot : current.current?.snapshot; if (!snapshot) throw Error("还没有可导出的存档"); download(await storage.exportBackup(snapshot,releaseId), "backup"); })}>下载本机备份</Button></div>
        {pilot.runtimeKind === "Tyrano" && <p className="text-sm text-muted-foreground">新存档使用文字缩略图；旧存档中的图片预览继续保留。</p>}
      {cloud&&ready&&<OnsCloud pilot={pilot} targetLabel={targetLabel} running={running} onStatus={setCloudStatus} onBusy={setCloudBusy} capture={async()=>{
        const result=runningNow.current?await capture():null;
        if(result&&!result.saved)throw Error('本机保存尚未成功，请先导出当前存档');
        const snapshot=result?.snapshot??current.current?.snapshot;
        if(!snapshot)throw Error('还没有可上传的本机存档');
        if(runningNow.current)await refresh();
        return snapshot;
      }} restore={async(snapshot,check)=>{
        check();if(runningNow.current)throw Error('请先结束阅读并保留存档');
        const base=current.current?.revision??0;
        await store.current!.commit(pilot.id,base,snapshot,'restore',check);
        check();await refresh();setStatus('云端备份已保留，下次启动将从此存档读取');
      }}/>}
      <Card><CardHeader><CardTitle>存档与旧档迁移</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">只读提取本来源的旧游戏存档，原数据库保持不变。导入或恢复会新增历史副本；不会覆盖历史记录。运行期间请先结束阅读。</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={!ready || running || busy} onClick={() => run(async () => { const { storage } = await modules(); if(pilot.legacyHint&&!await confirmation.ask("导入旧版存档？",pilot.legacyHint+" 原存档不会修改。","备份并导入"))return; const snapshot = await storage.readLegacy(pilot.id); if (!snapshot || !snapshot.files.length) throw Error("当前网站来源没有这款游戏的旧存档；原有存档不会修改"); download(await storage.exportBackup(snapshot), "legacy-original"); await adopt(snapshot, "legacy-import"); })}>备份并读取本来源旧档</Button>
          <Label className="inline-flex cursor-pointer items-center rounded-md border px-4 py-2 text-sm" htmlFor="ons-backup-file">导入存档备份</Label>
          <input id="ons-backup-file" aria-label="导入存档备份" type="file" accept="application/json,.json" disabled={!ready || running || busy} className="max-w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(async () => { if (file.size > 90 * 1024 * 1024) throw Error("备份文件过大"); const { storage } = await modules(); await adopt(await storage.importBackup(await file.text(), pilot.id,releaseId?{releaseId,allowLegacyCopy:true}:undefined), "file-import"); }); }} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="ons-history">历史备份</Label>
          <NativeSelect id="ons-history" value={selected} onChange={event => setSelected(event.target.value)} disabled={!ready || busy}>
            <NativeSelectOption value="">选择一个保留的版本…</NativeSelectOption>
            {history.map(row => <NativeSelectOption key={row.id} value={row.id}>#{row.revision} · {new Date(row.createdAt).toLocaleString()} · {row.reason === "legacy-import" ? "旧档原始备份" : row.reason === "engine" ? "游戏存档" : "导入或恢复"}</NativeSelectOption>)}
          </NativeSelect>
          <Button variant="outline" disabled={!selected || running || busy} onClick={() => run(async () => { await adopt((await store.current!.getRevision(selected, pilot.id)).snapshot, "restore"); })}>下次启动使用此备份</Button>
          <Button variant="ghost" disabled={!selected || busy} onClick={() => run(async () => { const { storage } = await modules(); download(await storage.exportBackup((await store.current!.getRevision(selected, pilot.id)).snapshot,releaseId), "history"); })}>导出所选备份</Button>
        </div>
        <p className="text-xs text-muted-foreground">共享引擎 <code>{(releaseId??pilot.engine).slice(0, 16)}</code> · 每个游戏版本使用独立存档空间。旧存档不会被清理。</p>
        <a href="https://github.com/YuriSizuku/OnscripterYuri" target="_blank" rel="noreferrer" className="text-xs underline">ONScripterYuri 源码与 GPL-2.0 许可</a>
      </CardContent></Card>
      </section>
      <AlertDialog open={blocker.state === "blocked"} onOpenChange={open => { if (!open && blocker.state === "blocked" && !busy) blocker.reset(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>保存后离开故事？</AlertDialogTitle>
            <AlertDialogDescription>请先在游戏中保存进度。离开前，{brand.shortName} 会等待本机备份写入成功；保存失败时会保留此页。</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>继续阅读</AlertDialogCancel>
            <Button variant="outline" disabled={busy} onClick={() => run(async () => { const { storage } = await modules(); download(await storage.exportBackup((await capture()).snapshot,releaseId), "before-leaving"); })}>导出当前存档</Button>
            <Button disabled={busy} onClick={() => run(async () => {
              if (blocker.state !== "blocked") return;
              const proceed = blocker.proceed;
              if (!(await capture()).saved) throw Error("本机备份尚未成功，请先导出当前存档");
              channel.current?.dispose(); channel.current = null; changeRunning(false); proceed();
            })}>保存并离开</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {confirmation.dialog}
    </main>
  );
}
