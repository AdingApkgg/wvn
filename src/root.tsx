import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import "./styles.css";
import { Button } from "./components/ui/button";
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
export default function Root() {
  return <Outlet />;
}
export function ErrorBoundary() {
  const e = useRouteError();
  return (
    <main className="container">
      <a href="/" className="brand">
        WG / 故事放映室
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
