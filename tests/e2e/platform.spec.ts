import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { authenticator, register, api } from '../helpers/account-browser';

const origin = process.env.WG_ACCOUNT_TEST_URL!;
const fixtureFile = process.env.WG_PLATFORM_FIXTURE_FILE;
const reportDir = process.env.WG_PLATFORM_REPORT_DIR;
test.use({ ignoreHTTPSErrors: false });
test.skip(!fixtureFile || !reportDir || !origin, 'Isolated PostgreSQL platform launcher required');
function fixture() { return JSON.parse(readFileSync(fixtureFile!, 'utf8')); }

test('actual public and account listeners resolve version resources through opaque UUID keys', async ({ page, request }) => {
  const f = fixture();
  for (const base of [process.env.WG_TEST_URL!, origin]) {
    const first = await request.get(base + '/api/versions/' + f.versionId + '/resources?limit=1');
    expect(first.status()).toBe(200);
    const manifest = await first.json();
    expect(manifest.resources).toHaveLength(1);
    expect(manifest.nextCursor).toBeTruthy();
    const next = await request.get(base + '/api/versions/' + f.versionId + '/resources?limit=1&cursor=' + encodeURIComponent(manifest.nextCursor));
    expect(next.status()).toBe(200);
    const second = await next.json();
    expect(second.resources).toHaveLength(1);
    expect(second.resources[0].key).not.toBe(manifest.resources[0].key);
    expect(second.nextCursor).toBeNull();
    for (const key of f.keys) {
      expect(key).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
      const resolved = await request.get(base + '/api/resources/' + key);
      expect(resolved.status()).toBe(200);
      expect(await resolved.json()).toEqual({ key, sha256: f.sha256, bytes: 11638, contentType: 'image/png', url: f.cdnUrl });
    }
    expect((await request.get(base + '/api/resources/' + f.sha256)).status()).toBe(400);
    expect((await request.get(base + '/api/resources/00000000-0000-4000-8000-000000000001')).status()).toBe(404);
  }
  await page.goto(origin + '/account');
  const result = await page.evaluate(async ({ versionId, path }) => {
    const response = await fetch('/api/versions/' + versionId + '/resource?path=' + encodeURIComponent(path));
    return { status: response.status, data: await response.json() };
  }, { versionId: f.versionId, path: f.paths[0] });
  expect(result.status).toBe(200);
  expect(result.data.key).toBe(f.keys[0]);
});

test('actual indexed Chinese search renders matches and explains malformed queries', async ({ page, request }) => {
  const result = await request.get('/api/search?q=' + encodeURIComponent('团子大家族'));
  expect(result.status()).toBe(200);
  const data = await result.json();
  expect(data.source).toBe('meilisearch');
  expect(data.ids).toContain('v4');
  expect(Object.keys(data).sort()).toEqual(['filteredOut', 'ids', 'indexEstimatedTotalHits', 'limit', 'nextOffset', 'offset', 'source']);
  await page.goto('/?q=' + encodeURIComponent('团子大家族'));
  await expect(page.locator('.story-card')).toHaveCount(1);
  await expect(page.locator('.story-card')).toContainText('CLANNAD');
  const malformed = await request.get('/api/search?engine=INVALID');
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toEqual({ error: 'invalid_search_query' });
  await page.goto('/?engine=INVALID');
  await expect(page.getByText('搜索条件无效，请调整后重试。', { exact: true })).toBeVisible();
});

test('real Passkey sessions connect RoomClient over WS and account deletion invalidates existing sockets and tickets', async ({ page, browser }) => {
  const f = fixture();
  await page.goto(origin + '/account');
  await authenticator(page);
  expect((await register(page, 'Platform Room Owner')).status).toBe(200);
  const me = await api(page, '/api/me');
  const created = await api(page, '/api/rooms', { versionId: f.versionId });
  expect(created.status).toBe(201);
  const roomId = created.data.id;
  const memberContext = await browser.newContext({ ignoreHTTPSErrors: false });
  const member = await memberContext.newPage();
  try {
    await member.goto(origin + '/account');
    await authenticator(member);
    expect((await register(member, 'Platform Room Member')).status).toBe(200);
    expect((await api(member, '/api/rooms/' + roomId + '/join', {})).status).toBe(200);
    for (const target of [page, member]) {
      const connected = await target.evaluate(async id => {
        const modulePath = '/player/room-client.mjs';
        const { RoomClient } = await import(modulePath);
        const client = new RoomClient({ roomId: id, preferWebTransport: false, headers: async () => {
          const response = await fetch('/api/me');
          if (!response.ok) return {};
          return { 'x-wg-binding': (await response.json()).binding };
        } });
        (window as any).platformRoom = client;
        (window as any).platformEvents = [];
        for (const type of ['event', 'error', 'disconnected']) client.addEventListener(type, (event: any) => (window as any).platformEvents.push({ type, detail: event.detail }));
        const ready = await client.connect();
        return { transport: client.transport, userId: ready.userId, members: ready.snapshot.members.length };
      }, roomId);
      expect(connected.transport).toBe('websocket');
      expect(connected.members).toBe(2);
      if (target === page) expect(connected.userId).toBe(me.data.user.id);
    }
    const sequence = await page.evaluate(async () => (await (window as any).platformRoom.publishState({ chapter: 7, scope: 'actual-account' })).seq);
    await member.waitForFunction(seq => (window as any).platformEvents.some((event: any) => event.type === 'event' && event.detail.seq === seq && event.detail.kind === 'state' && event.detail.data.scope === 'actual-account'), sequence);
    // 票据仅保留在浏览器内，不进入测试日志或URL。
    await page.evaluate(async id => {
      const me = await (await fetch('/api/me')).json();
      const response = await fetch('/api/rooms/' + id + '/ticket', { method: 'POST', headers: { 'content-type': 'application/json', 'x-wg-binding': me.binding }, body: '{}' });
      if (!response.ok) throw new Error('old ticket fixture failed');
      (window as any).oldRoomTicket = (await response.json()).ticket;
    }, roomId);
    expect((await api(page, '/api/me', { confirmation: 'DELETE' }, 'DELETE')).status).toBe(200);
    expect((await api(page, '/api/me')).status).toBe(401);
    await page.waitForFunction(() => (window as any).platformRoom.transport === null);
    await member.waitForFunction(() => (window as any).platformRoom.transport === null);
    const rejected = await page.evaluate(async () => new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(location.origin.replace('https:', 'wss:') + '/api/rooms/ws');
      const timer = setTimeout(() => { ws.close(); reject(new Error('deleted ticket not rejected')); }, 5000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket: (window as any).oldRoomTicket, after: 0 }));
      ws.onmessage = event => { const frame = JSON.parse(event.data); clearTimeout(timer); ws.close(); resolve(frame.code ?? frame.type); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('ticket check socket failed')); };
    }));
    expect(rejected).toBe('unauthorized');
    const closed = await api(member, '/api/rooms/' + roomId);
    expect(closed.status).toBe(200);
    expect(closed.data.status).toBe('closed');
    expect(closed.data.members.some((entry: any) => entry.userId === me.data.user.id)).toBe(false);
  } finally {
    for (const target of [page, member]) await target.evaluate(() => (window as any).platformRoom?.close()).catch(() => {});
    await memberContext.close();
  }
});

test('COEP account page records the actual CDN CORS fetch boundary separately from API success', async ({ page }, testInfo) => {
  const f = fixture(), consoleErrors: string[] = [], failures: string[] = [];
  const observed: { status: number; allowOrigin: string | null; resourcePolicy: string | null }[] = [];
  page.on('console', message => { if (message.type() === 'error' && /wg-b2\.saop\.cc|cors/i.test(message.text())) consoleErrors.push(message.text()); });
  page.on('requestfailed', request => { if (request.url() === f.cdnUrl) failures.push(request.failure()?.errorText ?? 'request_failed'); });
  page.on('response', response => {
    if (response.url() === f.cdnUrl) {
      const headers = response.headers();
      observed.push({ status: response.status(), allowOrigin: headers['access-control-allow-origin'] ?? null, resourcePolicy: headers['cross-origin-resource-policy'] ?? null });
    }
  });
  const account = await page.goto(origin + '/account');
  expect(account?.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  const result = await page.evaluate(async url => {
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const bytes = await response.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      return { ok: response.ok, status: response.status, bytes: bytes.byteLength, sha256, isolated: crossOriginIsolated };
    } catch (error) { return { ok: false, error: (error as Error).name, isolated: crossOriginIsolated }; }
  }, f.cdnUrl);
  const status = result.ok ? 'cors_readable' : consoleErrors.some(message => /cors|access-control-allow-origin/i.test(message)) ? 'blocked_missing_cors' : 'network_error';
  const receipt = { status, boundary: '真实COEP账号页、配置代理、只读CDN小PNG；未修改CF/B2', sample: { sha256: f.sha256, expectedBytes: 11638 }, result, observed, failures, consoleErrors };
  await writeFile(join(reportDir!, 'cdn-cors.json'), JSON.stringify(receipt, null, 2) + '\n');
  await testInfo.attach('cdn-cors-boundary', { body: Buffer.from(JSON.stringify(receipt)), contentType: 'application/json' });
  expect(result.isolated).toBe(true);
  expect(status, 'network errors must not be mislabeled as a known CORS boundary').not.toBe('network_error');
  if (result.ok) { expect(result.bytes).toBe(11638); expect(result.sha256).toBe(f.sha256); }
  else testInfo.annotations.push({ type: 'production-cors-pending', description: 'blocked_missing_cors：需要单独生产CORS授权，本次未改CDN配置。' });
});
