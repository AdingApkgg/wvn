// 公开入口与账号入口分开部署时（平台QA、双栈预览），公开进程既没有账号服务，
// 也没有同源可信读取器：SSR 的 `getContentAccess` 和浏览器直发的 `/api/me/*` 都会落空。
// 这里用账号入口做同机回源，只转发凭据头，资格仍由账号进程按真实会话判定。
import type { Context, Hono } from 'hono';
import { PUBLIC_CONTENT_ACCESS } from './policy.ts';
import type { ContentAccess } from './types.ts';

const HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length']);
// 只转发账号服务真正需要看的东西，避免把公开入口的转发链再套一层。
const FORWARD = ['cookie', 'accept', 'content-type', 'origin', 'referer', 'user-agent', 'x-wg-binding'];

function accountUrl(origin: string, path: string, search: string) {
  return origin + path + search;
}

function forwarded(headers: Headers) {
  const next = new Headers({ accept: 'application/json' });
  for (const name of FORWARD) {
    const value = headers.get(name);
    if (value !== null) next.set(name, value);
  }
  return next;
}

/** 可信读取器：转发凭据到账号入口，401/404 视作匿名，5xx 交给调用方降级。 */
export function contentAccessProxy(accountOrigin: string, fetchImpl: typeof fetch = fetch) {
  return async (request: Request): Promise<ContentAccess> => {
    // 资格接口固定在账号入口的 /api/me/content，与公开页面的路径无关。
    const response = await fetchImpl(accountUrl(accountOrigin, '/api/me/content', ''), {
      headers: forwarded(request.headers),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
      redirect: 'manual',
    });
    if (response.status === 401 || response.status === 404)
      return { ...PUBLIC_CONTENT_ACCESS };
    if (!response.ok) throw new Error('CONTENT_ACCESS_UNAVAILABLE');
    return (await response.json()) as ContentAccess;
  };
}

/**
 * 把公开入口上的 `/api/me*` 交给账号入口。公开站只需要会话态与资格接口；
 * 其余私人接口（存档、上传、Passkey）由 `/account` 页在账号 origin 上直接调用。
 */
export function mountContentProxy(app: Hono, accountOrigin: string, fetchImpl: typeof fetch = fetch) {
  app.all('/api/me', handler);
  app.all('/api/me/*', handler);
  async function handler(c: Context): Promise<Response> {
    let pathname = c.req.path, search = '';
    try {
      const incoming = new URL(c.req.url);
      pathname = incoming.pathname;
      search = incoming.search;
    } catch { /* c.req.path 兜底 */ }
    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    const response = await fetchImpl(accountUrl(accountOrigin, pathname, search), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: hasBody ? await c.req.arrayBuffer() : undefined,
      redirect: 'manual',
    });
    const out = new Headers();
    response.headers.forEach((value, name) => {
      if (!HOP.has(name)) out.append(name, value);
    });
    if (!out.has('cache-control')) out.set('cache-control', 'no-store');
    out.set('vary', 'Cookie');
    return new Response(response.body, { status: response.status, headers: out });
  }
}
