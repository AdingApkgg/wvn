import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresFixture } from './helpers/postgres.ts';
import { Store } from '../src/server/store.ts';
import { configurePublicProjection } from '../src/accounts/public-projection.server.ts';
import { loadCatalog } from '../src/search/runtime.server.ts';
import { loader as loadWork } from '../src/routes/work.tsx';

// 若统计或分享重新进入关键路径，本测试会在释放接口前超时。
test('目录和作品主体不等待统计及玩家存档，附属数据随后独立完成', async () => {
  const f = await postgresFixture();
  const store = new Store(f.db);
  const key = Symbol.for('wvn.catalog.runtime.v1');
  const runtime = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const previousStore = runtime[key];
  const previousEnv = { ...process.env };
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Set<string>();
  const origin = 'https://navigation.test';
  configurePublicProjection(origin, async request => {
    const shares = new URL(request.url).pathname.endsWith('/save-shares');
    started.add(shares ? 'shares' : 'counts');
    await pending;
    return Response.json(shares ? { items: [], next: null } : { v4: { reads: 9, likes: 2, favorites: 1 } });
  });
  try {
    await store.seed({ snapshotAt: '2026-11-15T00:00:00Z', works: [
      { id: 'v4', title: '切页验证', originalTitle: 'Navigation', aliases: [], evidence: 'https://vndb.org/v4' },
    ], versions: [{ id: 'navigation-v4', workId: 'v4', number: 1, title: '原版', legacyPath: '/navigation/', engine: 'ONS' }] });
    runtime[key] = store;
    process.env.WG_SHARE_ACCOUNT_ORIGIN = origin;
    process.env.WG_SHARE_BACKEND_ORIGIN = origin;
    delete process.env.WG_CONTENT_GATE;
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('主体被附属接口阻塞')), 1000); });
    const result = await Promise.race([Promise.all([
      loadCatalog(new Request(origin + '/'), store, {}),
      loadWork({ params: { workId: '4' }, request: new Request(origin + '/4/') }),
    ]), deadline]).finally(() => clearTimeout(timeout));
    const [catalog, work] = result;
    assert.equal(catalog.items[0].title, '切页验证');
    assert(!('restricted' in work));
    assert.equal(work.title, '切页验证');
    assert.deepEqual([...started].sort(), ['counts', 'shares']);
    // 已打开的旧客户端仍按普通值读取旧字段，不能向其发送 Promise。
    assert.equal(catalog.counts, null);
    assert.equal(work.counts, null);
    assert.equal(work.shares, null);
    release();
    assert.deepEqual(await catalog.deferredCounts, { v4: { reads: 9, likes: 2, favorites: 1 } });
    assert.deepEqual(await work.deferredCounts, { reads: 9, likes: 2, favorites: 1 });
    assert.equal((await work.deferredShares)?.available, true);
  } finally {
    release();
    runtime[key] = previousStore;
    process.env = previousEnv;
    await f.close();
  }
});
