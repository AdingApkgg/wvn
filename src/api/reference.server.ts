import { readFile } from 'node:fs/promises';
import type { Hono } from 'hono';
import { generateOpenApiDocument } from './openapi.server.ts';

export const referenceBootstrap = String.raw`
Scalar.createApiReference('#wvn-api-reference', {
  url: '/api/dash/openapi.json',
  theme: 'default',
  withDefaultFonts: false,
  telemetry: false,
  persistAuth: false,
  hideClientButton: true,
  showDeveloperTools: 'never',
  agent: { disabled: true },
  proxyUrl: '',
  customFetch: async function (input, init) {
    var url = input instanceof Request ? input.url : new URL(String(input), window.location.origin).href;
    var request = new Request(input instanceof Request ? input : url, init);
    var target = new URL(request.url);
    if (target.origin !== window.location.origin || !target.pathname.startsWith('/api/')) {
      throw new Error('API 文档只能请求本站接口。');
    }
    var session = await window.fetch('/api/me', {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: request.signal
    });
    if (!session.ok) throw new Error('管理员会话已失效，请返回后台重新登录。');
    var identity = await session.json();
    if (!identity.admin || typeof identity.binding !== 'string') {
      throw new Error('管理权限已变化，请返回后台重新确认。');
    }
    var headers = new Headers(request.headers);
    headers.set('x-wg-binding', identity.binding);
    return window.fetch(request.url, {
      method: request.method, headers: headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: request.signal
    });
  }
});
`;

// 不使用 Scalar HTML 自动发现保留的 api-reference ID，避免默认配置的第二次挂载。
const referenceHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>WVN API 文档</title>
<style>body{margin:0;font-family:system-ui,sans-serif}header.wvn-api-bar{display:flex;align-items:center;gap:1rem;padding:.8rem 1.2rem;border-bottom:1px solid #8885;font-size:.875rem}header.wvn-api-bar a{color:inherit}header.wvn-api-bar span{color:#666}@media(prefers-color-scheme:dark){body{background:#18181b;color:#fafafa}header.wvn-api-bar span{color:#aaa}}</style>
<script defer src="/api/dash/reference/scalar.js"></script><script defer src="/api/dash/reference/bootstrap.js"></script>
</head><body><header class="wvn-api-bar"><a href="/dash">返回后台</a><strong>WVN API 文档</strong><a href="/api/dash/openapi.json" download="wvn-openapi.json">下载 OpenAPI</a></header><div id="wvn-api-reference"></div><noscript>启用 JavaScript 后可浏览 Scalar；也可下载 OpenAPI 文件。</noscript></body></html>`;

let scalarScript: Promise<Buffer> | undefined;
function getScalarScript() {
  if (!scalarScript) {
    scalarScript = readFile(new URL('./browser/standalone.js', import.meta.resolve('@scalar/api-reference')));
    void scalarScript.catch(() => { scalarScript = undefined; });
  }
  return scalarScript;
}

/** 必须在 mountDashboard 的管理员 guard 之后注册，且先于 SSR/catch-all。 */
export function mountApiReference(app: Hono) {
  app.get('/dash/api', c => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
    return c.html(referenceHtml);
  });
  app.get('/api/dash/openapi.json', async c => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await generateOpenApiDocument());
  });
  app.get('/api/dash/reference/scalar.js', async c => {
    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Cache-Control', 'private, no-store');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    return c.body(new Uint8Array(await getScalarScript()));
  });
  app.get('/api/dash/reference/bootstrap.js', c => {
    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Cache-Control', 'private, no-store');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    return c.body(referenceBootstrap);
  });
}
