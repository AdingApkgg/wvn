import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { configureContentAccessProxy, getContentAccess } from '../src/content/access.server.ts';
import { contentAccessProxy, mountContentProxy } from '../src/content/access-proxy.server.ts';
import { PUBLIC_CONTENT_ACCESS } from '../src/content/policy.ts';

const qualified = {
  ...PUBLIC_CONTENT_ACCESS,
  authenticated: true,
  eligibility: 'qualified' as const,
  displayMode: 'restricted' as const,
  canViewRestricted: true,
};

// 分开部署时公开站 origin（回环地址或反代域名）由部署决定，不能像同进程那样写死白名单。
test('proxy reader trusts any origin but still derives access from credentials', async () => {
  const seen: (string | null)[] = [];
  const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get('cookie'));
    const cookie = new Headers(init?.headers).get('cookie');
    return cookie === 'viewer=qualified'
      ? Response.json(qualified)
      : new Response(null, { status: 401 });
  }) as typeof fetch;
  configureContentAccessProxy(contentAccessProxy('https://accounts.test', fake));
  const viewer = new Request('http://127.0.0.1:4281/27448/', { headers: { cookie: 'viewer=qualified' } });
  assert.equal((await getContentAccess(viewer)).canViewRestricted, true);
  const anonymous = new Request('https://public.test/27448/');
  assert.equal((await getContentAccess(anonymous)).canViewRestricted, false);
  assert.deepEqual(seen, ['viewer=qualified', null]);
});

test('proxy reader degrades to anonymous when the account service has no gate route', async () => {
  const fake = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  configureContentAccessProxy(contentAccessProxy('https://accounts.test', fake));
  const request = new Request('http://127.0.0.1:4281/');
  assert.equal((await getContentAccess(request)).authenticated, false);
});

test('proxy reader surfaces account outages so callers can answer 503', async () => {
  const fake = (async () => new Response(null, { status: 502 })) as unknown as typeof fetch;
  configureContentAccessProxy(contentAccessProxy('https://accounts.test', fake));
  await assert.rejects(() => getContentAccess(new Request('http://127.0.0.1:4281/')), /CONTENT_ACCESS_UNAVAILABLE/);
});

test('public listener forwards /api/me to the account origin and keeps cookies out of cache', async () => {
  const calls: { url: string; method: string; cookie: string | null }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), method: init?.method ?? 'GET', cookie: headers.get('cookie') });
    return Response.json({ user: { id: 'u1' } }, { headers: { 'set-cookie': 'wg.a=1; Path=/', 'cache-control': 'private' } });
  }) as typeof fetch;
  const app = new Hono();
  mountContentProxy(app, 'https://accounts.test', fake);
  app.all('*', (c) => c.text('fallthrough'));
  const response = await app.request('http://127.0.0.1:4281/api/me?x=1', { headers: { cookie: 'wg.session=abc' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { id: 'u1' } });
  assert.equal(response.headers.get('set-cookie'), 'wg.a=1; Path=/');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.deepEqual(calls, [{ url: 'https://accounts.test/api/me?x=1', method: 'GET', cookie: 'wg.session=abc' }]);
});

test('public listener leaves non-/api/me paths to the rest of the app', async () => {
  const app = new Hono();
  mountContentProxy(app, 'https://accounts.test', (async () => assert.fail('不该回源')) as unknown as typeof fetch);
  app.all('*', (c) => c.text('local'));
  assert.equal(await (await app.request('http://127.0.0.1:4281/27448/')).text(), 'local');
});
