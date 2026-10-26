import { brand } from "../brand";
import { useEffect, useState, useRef } from "react";
import { useLoaderData, useBlocker, redirect } from "react-router";
import { parseWorkSlug, workSlug } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
import { pilotForVersion } from "../ons/pilots.server.ts";
import { OnsPlayer } from "../ons/player.tsx";
export function loader({
  params,request,
}: {
  params: { workId?: string; slot?: string };request?:Request;
}) {
  const store = getStore();
  const v = store.resolveRoute(params.workId ?? "", params.slot ?? "");
  if (!v) throw new Response(null, { status: 404 });
  if (
    v.workId !== parseWorkSlug(params.workId ?? "") ||
    String(v.number) !== params.slot
  )
    return redirect(`/${workSlug(v.workId)}/${v.number}/`);
  const player=pilotForVersion(v.id,request?new URL(request.url).searchParams.get("engine")??undefined:undefined);
  if(process.env.WG_ALL_ENGINES==='1'&&!player)throw new Response("此版本尚未完成播放器适配",{status:503});
  const w = store.get(v.workId)!;
  return {
    version: w.versions.find((x) => x.id === v.id)!,
    work: { title: w.title, url: w.url },
    pilot: player,
    cloud: process.env.WG_ONS_CLOUD === '1' && !player?.engineCandidate,
  };
}
export function meta({
  loaderData: data,
}: {
  loaderData?: { work: { title: string }; version: { number: number } };
}) {
  return [
    {
      title: data
        ? `${data.work.title} · 版本 ${data.version.number} — ${brand.shortName}`
        : brand.title,
    },
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
  const { pilot, work, cloud } = useLoaderData<typeof loader>();
  if (pilot) return <OnsPlayer key={pilot.id+':'+(pilot.engineRuntime?.engineReleaseId??pilot.engineCandidate?.releaseId??'legacy')} pilot={pilot} workUrl={work.url} cloud={cloud} />;
  return <LegacyPlay />;
}
function LegacyPlay() {
  const { version, work } = useLoaderData<typeof loader>();
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
      <iframe
        key={version.id}
        title={version.title}
        src={version.launchPath}
        allow="autoplay; fullscreen; gamepad"
        allowFullScreen
      />
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
