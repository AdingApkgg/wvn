import { brand } from "../brand";
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useLoaderData, useBlocker, redirect, useLocation, Link } from "react-router";
import { parseWorkSlug, workSlug } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
import { pilotForVersion } from "../ons/pilots.server.ts";
import { OnsPlayer } from "../ons/player.tsx";
import {contentGateEnabled,getContentAccess} from '../content/access.server.ts';
import {versionAccessError} from '../content/policy.ts';
import {ContentGate} from '../content/gate';
import {ContentSettings} from './content';
import {useContentAccess} from '../content/client';
export async function loader({
  params,request,
}: {
  params: { workId?: string; slot?: string };request?:Request;
}) {
  const store = getStore();
  const v = (await store.resolveRoute(params.workId ?? "", params.slot ?? ""));
  if (!v) throw new Response(null, { status: 404 });
  if (
    v.workId !== parseWorkSlug(params.workId ?? "") ||
    String(v.number) !== params.slot
  )
    return redirect(`/${workSlug(v.workId)}/${v.number}/`);
  const w = (await store.get(v.workId))!;
  const gated=contentGateEnabled();
  const version=w.versions.find(x=>x.id===v.id)!;
  const restriction=gated&&request?versionAccessError(w,version,await getContentAccess(request)):null;
  if(restriction)return {restricted:{code:restriction,returnTo:request?new URL(request.url).pathname:w.url}};
  const player=pilotForVersion(v.id,request?new URL(request.url).searchParams.get("engine")??undefined:undefined);
  if((gated||process.env.WG_ALL_ENGINES==='1')&&!player)throw new Response("此版本尚未完成播放器适配",{status:503});
  return {
    version,
    work: { title: w.title, url: w.url },
    pilot: player,
    cloud: process.env.WG_ONS_CLOUD === '1' && !player?.engineCandidate,
    requiresQualification:gated&&(w.classification?.pageSuitability!=='sfw'||version.classification?.sexualContent!=='none'),
  };
}
export function meta({
  loaderData: data,
}: {
  loaderData?: { work?: { title: string }; version?: { number: number };restricted?:unknown };
}) {
  return [
    {
      title: data?.work&&data?.version
        ? `${data.work.title} · 版本 ${data.version.number} — ${brand.shortName}`
        : brand.title,
    },
    ...(data?.restricted?[{name:'robots',content:'noindex,nofollow'}]:[]),
  ];
}
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../components/ui/alert-dialog";
export default function Play() {
  const data=useLoaderData<typeof loader>(),location=useLocation();
  const content=useContentAccess();
  const retained=useRef<{path:string;data:Exclude<typeof data,{restricted:unknown}>}|null>(null);
  const [saveError,setSaveError]=useState('');
  useEffect(()=>{const update=(event:Event)=>setSaveError(String((event as CustomEvent).detail??'本机保存未完成，请保留页面重试'));window.addEventListener('wg-content-save-error',update);return()=>window.removeEventListener('wg-content-save-error',update)},[]);
  if(!('restricted' in data))retained.current={path:location.pathname,data};
  const previous=retained.current?.path===location.pathname?retained.current.data:null;
  const blocked=!previous||'restricted' in data||(previous.requiresQualification&&!content.access.canViewRestricted);
  const liveTitle=!blocked&&previous?`${previous.work.title} · 版本 ${previous.version.number} — ${brand.shortName}`:brand.title;
  useLayoutEffect(()=>{
    if(content.enabled)document.title=liveTitle;
  },[content.enabled,liveTitle,data]);
  if(!previous)return <ContentGate code={data.restricted?.code??'CONTENT_MODE_REQUIRED'} returnTo={data.restricted?.returnTo??location.pathname}/>;
  const {pilot,work,cloud,version}=previous;
  return <div className="content-player-shell">
    <div inert={blocked||undefined} aria-hidden={blocked||undefined} style={blocked?{display:'none'}:undefined}>
      {previous.requiresQualification&&<aside className="container text-sm p-4" role="note">{version.classification?.sexualContent==='present'?'此版本含成人性内容。':'此版本内容尚待核实，不能据此认定为全年龄版本。'} 请确认当前环境适合，再开始阅读。</aside>}
      {pilot?<OnsPlayer key={pilot.id+':'+(pilot.engineRuntime?.engineReleaseId??pilot.engineCandidate?.releaseId??'legacy')} pilot={pilot} workUrl={work.url} cloud={cloud} contentBlocked={blocked}/>:<LegacyPlay version={version} work={work} requiresConfirmation={previous.requiresQualification}/>}
    </div>
    {blocked&&<section className="container content-playback-shield"><h1>敏感内容已收起</h1><p role="status">本次浏览权限已关闭或失效。运行实例与本机存档仍保留；恢复权限后可继续。</p>{pilot&&<Button variant="outline" onClick={()=>window.dispatchEvent(new Event('wg-content-save-exit'))}>保存到本机后退出</Button>}{saveError&&<p role="status">{saveError}</p>}<ContentSettings embedded returnTo={location.pathname}/></section>}
  </div>;
}
function LegacyPlay({version,work,requiresConfirmation}:{version:import('../types.ts').PublicVersion;work:{title:string;url:string};requiresConfirmation:boolean}) {
  const [confirmed,setConfirmed]=useState(!requiresConfirmation);
  const [expanded, setExpanded] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const allowExit = useRef(false);
  const backButton = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    setReady(true);
    const handler = (e: BeforeUnloadEvent) => {
      if (allowExit.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  return (
    <main className={"player" + (expanded ? " expanded" : "")}>
      <header className="player-bar">
        <Button
          variant="ghost"
          ref={backButton}
          disabled={!ready}
          onClick={() => blocker.state !== "blocked" && setExitRequested(true)}
        >
          ← {work.title}
        </Button>
        <span>
          版本 {version.number} · {version.engine}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={expanded}
          disabled={!ready}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "显示工具栏" : "展开画面"}
        </Button>
      </header>
      {!confirmed?<Button onClick={()=>setConfirmed(true)}>确认内容提示，开始阅读</Button>:<iframe
        key={version.id}
        title={version.title}
        src={version.launchPath}
        allow="autoplay; fullscreen; gamepad"
        allowFullScreen
      />}
      <p className="player-note">
        存档保存在当前浏览器。远程预览与正式站点属于不同来源，存档不会自动互通。
      </p>
      <AlertDialog
        open={blocker.state === "blocked" || exitRequested}
        onOpenChange={(open) => {
          if (!open && !allowExit.current) {
            if (blocker.state === "blocked") blocker.reset();
            setExitRequested(false);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            backButton.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>离开当前故事？</AlertDialogTitle>
            <AlertDialogDescription>
              请先在游戏中保存进度。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续阅读</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                allowExit.current = true;
                if (blocker.state === "blocked") blocker.proceed();
                else window.location.assign(work.url);
              }}
            >
              离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
