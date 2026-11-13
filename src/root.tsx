import { brand } from "./brand";
import {useEffect,useState} from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";
import "./styles.css";
import "./ui-system.css";
import "./m3-system.css";
import { MotionSystem, RouteMotion } from "./components/motion-system";
import { Button } from "./components/ui/button";
import { SiteNavigation } from "./components/site-navigation";
import {Analytics} from './analytics/client';
import { ContentProvider } from "./content/client";
import { PUBLIC_CONTENT_ACCESS } from "./content/policy";
import { getContentAccess } from "./content/access.server";
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <MotionSystem>{children}</MotionSystem>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export async function loader({ request }: LoaderFunctionArgs) {
  const contentEnabled = process.env.WG_CONTENT_GATE === "1";
  let contentAccess = { ...PUBLIC_CONTENT_ACCESS };
  if (contentEnabled) {
    try { contentAccess = await getContentAccess(request); }
    catch { /* 权限依赖异常时保持公共浏览，不授予显示权限。 */ }
  }
  return {
    isolated: process.env.WG_ALL_ENGINES === "1",
    release: process.env.WG_DEPLOYMENT_MODE === "production",
    analyticsWebsiteId: process.env.WG_UMAMI_INTERNAL_URL ? process.env.WG_UMAMI_WEBSITE_ID ?? null : null,
    contentEnabled, contentAccess,
  };
}
export default function Root() {
  const flags=useLoaderData<typeof loader>();const [notice,setNotice]=useState(false),[workerError,setWorkerError]=useState('');
  const location = useLocation();
  const privatePage = /^\/(?:share-admin|manage)(?:\/|$)/.test(location.pathname);
  const playerPage = /^\/(?:\d+|b\d+)\/\d+\/?$/.test(location.pathname);
  useEffect(()=>{
    if(!flags.isolated||/^\/(?:share-admin|manage)(?:\/|$)/.test(location.pathname))return;
    let active=true;
    const acknowledged=()=>setNotice(false);window.addEventListener('wg-legacy-tabs-acknowledged',acknowledged);
    const path='/player/legacy-context.mjs';
    void (async()=>{
      const module=await import(/* @vite-ignore */ path) as typeof import('../public/player/legacy-context.mjs');
      await module.prepareCurrentContext();
      if(active&&flags.release)setNotice(localStorage.getItem('wg-isolation-upgrade-20261020')!=='acknowledged');
    })().catch(error=>{if(active&&flags.release)setWorkerError(error.message||'请关闭旧版游戏页面后刷新重试')});
    return()=>{active=false;window.removeEventListener('wg-legacy-tabs-acknowledged',acknowledged)};
  },[flags.isolated,flags.release]);
  return <ContentProvider initial={flags.contentAccess} enabled={flags.contentEnabled&&!privatePage}>
    <Analytics websiteId={flags.analyticsWebsiteId}/>
    {!privatePage && !playerPage && <SiteNavigation preview={!flags.release} />}
    {(notice||workerError)&&<aside className="container rounded-md border p-4 text-sm" role="status">
      {workerError||'如有旧版游戏页面，请先关闭，以便安全使用新版播放器。已有存档可在阅读器中导入。'}
      {notice&&!workerError&&<Button size="sm" variant="outline" className="ml-3" onClick={()=>{localStorage.setItem('wg-isolation-upgrade-20261020','acknowledged');setNotice(false)}}>我已关闭旧版页面</Button>}
    </aside>}
    <RouteMotion><Outlet /></RouteMotion>
  </ContentProvider>;
}
export function ErrorBoundary() {
  const e = useRouteError();
  return (
    <main className="container">
      <a href="/" className="brand">
        {brand.shortName} / {brand.translation}
      </a>
      <h1>
        {isRouteErrorResponse(e) && e.status === 404
          ? "没有找到这段故事"
          : "页面暂时无法打开"}
      </h1>
      <p>请返回目录，或稍后再试。</p>
      <Button asChild>
        <a href="/">返回目录</a>
      </Button>
    </main>
  );
}
