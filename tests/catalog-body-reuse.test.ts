import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogBodyCache, catalogBodies } from '../src/lib/catalog-body-cache.ts';
import { clientLoader } from '../src/routes/work.tsx';
import type { PublicWork } from '../src/types.ts';

const evidence = { reason: 'test', source: 'test', reviewedAt: '2026-11-15T00:00:00Z', revision: 1 };
const work = (id = 'v4'): PublicWork => ({
  id, title: '公开主体', originalTitle: 'Public', aliases: [], evidence: 'https://vndb.org/' + id,
  classification: { ...evidence, pageSuitability: 'sfw' }, revision: 1,
  defaultVersionId: 'public-version', url: '/' + id.slice(1) + '/',
  versions: [{ id: 'public-version', workId: id, number: 1, title: '公开版', engine: 'ONS', revision: 1, url: '/' + id.slice(1) + '/1/', launchPath: '/game/', checks: [], language: '中文', notes: '', sortOrder: 1, classification: { ...evidence, sexualContent: 'none', titleSafe: true } }],
});

test('只复用完整公共主体，受限字段重投影且读写不共享可变引用', () => {
  const cache = new CatalogBodyCache();
  const source = work();
  source.versions.push({ ...source.versions[0], id: 'restricted', title: '受限标题', notes: '受限备注', classification: { ...evidence, sexualContent: 'present', titleSafe: false } });
  cache.seed([source, { ...work('v5'), classification: { ...evidence, pageSuitability: 'nsfw' } }, { ...work('v6'), classification: undefined }]);
  source.title = '外部修改';
  const read = cache.get(new URL('https://test.invalid/4/'))!;
  assert.equal(read.title, '公开主体');
  assert.equal(read.versions[1].notes, '');
  assert.equal(read.versions[1].launchPath, '');
  assert.notEqual(read.versions[1].title, '受限标题');
  read.title = '调用方修改';
  assert.equal(cache.get(new URL('https://test.invalid/4/'))!.title, '公开主体');
  assert.equal(cache.get(new URL('https://test.invalid/5/')), undefined);
  assert.equal(cache.get(new URL('https://test.invalid/6/')), undefined);
  assert.equal(cache.get(new URL('https://test.invalid/4/?saveVersion=x')), undefined);
});

test('目录快照有容量与时效上限，禁用和失效后不能命中', () => {
  let now = 0;
  const cache = new CatalogBodyCache({ now: () => now, ttl: 100, capacity: 1 });
  cache.seed([work(), work('v5')]);
  assert.equal(cache.get(new URL('https://test.invalid/5/')), undefined);
  now = 100;
  assert.equal(cache.get(new URL('https://test.invalid/4/')), undefined);
  cache.seed([work()]);cache.clear();
  assert.equal(cache.get(new URL('https://test.invalid/4/')), undefined);
  cache.seed([work()], false);
  assert.equal(cache.get(new URL('https://test.invalid/4/')), undefined);
});

test('失效或过期后，同一目录快照重渲染不能重新播种', () => {
  let now = 0;const cache = new CatalogBodyCache({ now: () => now, ttl: 100 });
  const snapshot = [work()];cache.seed(snapshot);cache.clear();cache.seed(snapshot);
  assert.equal(cache.get(new URL('https://test.invalid/4/')), undefined);
  const fresh = [work()];cache.seed(fresh);now = 101;cache.seed(fresh);
  assert.equal(cache.get(new URL('https://test.invalid/4/')), undefined);
  cache.seed([work()]);assert(cache.get(new URL('https://test.invalid/4/')));
});

test('命中立即返回公共主体，同时请求最新结果；未命中等待服务端', async () => {
  catalogBodies.seed([work()]);
  let release!: (value: any) => void;
  const fresh = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const serverLoader = (() => { calls++; return fresh; }) as any;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const hit = await Promise.race([
      clientLoader({ request: new Request('https://test.invalid/4/'), serverLoader } as any),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('复用主体仍在等待服务端')), 500); }),
    ]);
    assert.equal(hit.title, '公开主体');assert.equal(calls, 1);
    assert('refresh' in hit);
    const replacement = { ...work(), title: '最新主体', deferredCounts: Promise.resolve(null), deferredShares: null };
    release(replacement);assert.equal(await hit.refresh, replacement);
    catalogBodies.clear();
    const denied = { restricted: { code: 'SIGN_IN_REQUIRED', returnTo: '/4/' }, title: '受限内容' };
    assert.deepEqual(await clientLoader({ request: new Request('https://test.invalid/4/'), serverLoader: async () => denied } as any), denied);
  } finally { if (timer) clearTimeout(timer); release?.(null); catalogBodies.clear(); }
});
