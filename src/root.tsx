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
} from "react-router";
import "./styles.css";
import { Button } from "./components/ui/button";
import { SiteNavigation } from "./components/site-navigation";
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
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export function loader(){return {isolated:process.env.WG_ALL_ENGINES==='1',release:process.env.WG_DEPLOYMENT_MODE==='production'}}
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
  return <>
    {!privatePage && !playerPage && <SiteNavigation preview={!flags.release} />}
    {(notice||workerError)&&<aside className="container rounded-md border p-4 text-sm" role="status">
      {workerError||'统一播放器已升级。请先关闭其他仍在运行的旧版游戏页面，再登录账号。旧存档可在播放器内按版本迁移。'}
      {notice&&!workerError&&<Button size="sm" variant="outline" className="ml-3" onClick={()=>{localStorage.setItem('wg-isolation-upgrade-20261020','acknowledged');setNotice(false)}}>我已关闭旧版页面</Button>}
    </aside>}
    <Outlet />
  </>;
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
