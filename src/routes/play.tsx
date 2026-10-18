import { useEffect, useState, useRef } from "react";
import { useLoaderData, useBlocker, redirect } from "react-router";
import { getStore } from "../server/runtime.ts";
export function loader({
  params,
}: {
  params: { workId?: string; slot?: string };
}) {
  const store = getStore();
  const v = store.resolveRoute(params.workId ?? "", params.slot ?? "");
  if (!v) throw new Response(null, { status: 404 });
  if (v.workId !== "v" + params.workId || String(v.number) !== params.slot)
    return redirect(`/${v.workId.slice(1)}/${v.number}/`);
  const w = store.get(v.workId)!;
  return {
    version: w.versions.find((x) => x.id === v.id)!,
    work: { title: w.title, url: w.url },
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
        ? `${data.work.title} · 版本 ${data.version.number} — WG`
        : "WG · 故事放映室",
    },
  ];
}
export default function Play() {
  const { version, work } = useLoaderData<typeof loader>();
  const [expanded, setExpanded] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const allowExit = useRef(false);
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
        <button
          disabled={!ready}
          onClick={() => blocker.state !== "blocked" && setExitRequested(true)}
        >
          ← {work.title}
        </button>
        <span>
          版本 {version.number} · {version.engine}
        </span>
        <button disabled={!ready} onClick={() => setExpanded(!expanded)}>
          {expanded ? "显示工具栏" : "展开画面"}
        </button>
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
      {(blocker.state === "blocked" || exitRequested) && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-title"
            className="modal"
          >
            <h2 id="exit-title">离开当前故事？</h2>
            <p>请先在游戏中保存进度。</p>
            <button
              className="button"
              onClick={() => {
                allowExit.current = true;
                if (blocker.state === "blocked") blocker.proceed();
                else window.location.assign(work.url);
              }}
            >
              离开
            </button>
            <button
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
                setExitRequested(false);
              }}
            >
              继续阅读
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
