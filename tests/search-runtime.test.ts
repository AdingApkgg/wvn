import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { postgresFixture } from './helpers/postgres.ts';
import { Store } from '../src/server/store.ts';
import { MeiliClient } from '../src/search/meili.server.ts';
import { SearchIndexer } from '../src/search/indexer.server.ts';
import { createSearchRuntime, SearchRuntimeError, loadCatalog } from '../src/search/runtime.server.ts';

async function fixture() {
  const pg = await postgresFixture();
  const store = new Store(pg.db);
  await store.ready;
  const indexUid = 'wvn_qa_search_runtime_' + randomUUID().replaceAll('-', '');
  const meili = new MeiliClient({ url: process.env.MEILISEARCH_URL!, apiKey: process.env.MEILI_MASTER_KEY! });
  const env = { MEILISEARCH_URL: process.env.MEILISEARCH_URL!, MEILI_SEARCH_KEY: process.env.MEILI_MASTER_KEY!,
    MEILI_WRITE_KEY: 'wrong-fallback', MEILI_MASTER_KEY: 'wrong-fallback', MEILI_INDEX_UID: indexUid };
  await store.seed({ snapshotAt: '2026-10-29T00:00:00Z', works: [
    { id: 'v4', title: '寻找星空', originalTitle: 'Looking for Stars', aliases: ['星空'], evidence: 'https://vndb.org/v4' },
    { id: 'b27', title: '星空', originalTitle: 'Starlight', aliases: [], evidence: 'https://bgm.tv/subject/27' },
  ], versions: [
    { id: 'runtime-first', workId: 'v4', number: 1, title: '中文版', legacyPath: '/runtime-first/', engine: 'ONS' },
    { id: 'runtime-second', workId: 'b27', number: 1, title: '原版', legacyPath: '/runtime-second/', engine: 'RenPy' },
  ] });
  return { ...pg, store, indexUid, meili, env,
    indexer: new SearchIndexer({ db: pg.db, meili, indexUid }),
    async close() {
      for (const index of await meili.listIndexes())
        if (index.uid === indexUid || index.uid.startsWith(indexUid + '_')) await meili.deleteIndex(index.uid);
      await pg.close();
    } };
}

test('runtime installs outbox, honors the search key and returns explicit unconfigured 503s', async () => {
  const f = await fixture();
  try {
    const missing = await createSearchRuntime(f.store, {});
    assert.equal((await missing.app.request('/api/search?q=星空')).status, 503);
    await assert.rejects(missing.query(new URLSearchParams('q=星空')), (error: unknown) =>
      error instanceof SearchRuntimeError && error.status === 503 && error.code === 'search_unavailable');
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM search_outbox').get())!.n, 2);
    const runtime = await createSearchRuntime(f.store, f.env);
    await f.indexer.rebuild();
    const page = await runtime.query(new URLSearchParams('q=星空&limit=1'));
    assert.deepEqual(page.ids, ['b27']);
    assert.equal(page.nextOffset, 1);
    const next = await runtime.query(new URLSearchParams('q=星空&limit=1&offset=1'));
    assert.deepEqual(next.ids, ['v4']);
    await assert.rejects(runtime.query(new URLSearchParams('limit=0')), (error: unknown) =>
      error instanceof SearchRuntimeError && error.status === 400);
  } finally { await f.close(); }
});

test('catalog keeps base browsing and displays unavailable search without pretending zero matches', async () => {
  const f = await fixture();
  try {
    const base = await loadCatalog(new Request('http://wvn.test/'), f.store, {});
    assert.deepEqual(base.items.map(w => w.id), ['v4', 'b27']);
    assert.equal(base.isSearch, false);
    assert.equal(base.searchError, null);
    const failed = await loadCatalog(new Request('http://wvn.test/?q=星空'), f.store, {});
    assert.equal(failed.searchStatus, 503);
    assert.match(failed.searchError!, /搜索暂不可用/);
    assert.equal(failed.nextSearchUrl, null);
    const runtime = await createSearchRuntime(f.store, f.env);
    await f.indexer.rebuild();
    const found = await loadCatalog(new Request('http://wvn.test/?q=星空&limit=1'), f.store, f.env);
    assert.deepEqual(found.items.map(w => w.id), ['b27']);
    assert.equal(found.nextSearchUrl, '/?q=%E6%98%9F%E7%A9%BA&limit=1&offset=1');
    assert.equal(found.searchError, null);
    const second = await loadCatalog(new Request('http://wvn.test' + found.nextSearchUrl), f.store, f.env);
    assert.deepEqual(second.items.map(w => w.id), ['v4']);
    const filtered = await loadCatalog(new Request('http://wvn.test/?engine=ONS'), f.store, f.env);
    assert.deepEqual(filtered.items.map(w => w.id), ['v4']);
    await f.db.prepare('UPDATE versions SET status=$1 WHERE id=$2').run('hidden', 'runtime-second');
    assert.deepEqual((await runtime.query(new URLSearchParams('q=星空'))).ids, ['v4']);
    assert.deepEqual((await loadCatalog(new Request('http://wvn.test/?q=星空'), f.store, f.env)).items.map(w => w.id), ['v4']);
  } finally { await f.close(); }
});

test('continuous CLI worker consumes real isolated schema events and exits cleanly on SIGTERM', async () => {
  const f = await fixture();
  let child: ReturnType<typeof spawn> | undefined;
  try {
    child = spawn(process.execPath, ['--import', 'tsx', 'scripts/search-index.ts', 'worker', '2'], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: process.env.WVN_TEST_DATABASE_URL, WG_DATABASE_URL: process.env.WVN_TEST_DATABASE_URL,
        DATABASE_SCHEMA: f.schema, WG_DATABASE_SCHEMA: '', MEILI_INDEX_UID: f.indexUid,
        MEILI_WRITE_KEY: process.env.MEILI_MASTER_KEY, SEARCH_WORKER_IDLE_MS: '100' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout!.on('data', chunk => { output += chunk.toString(); });
    child.stderr!.on('data', chunk => { output += chunk.toString(); });
    const exited = once(child, 'exit');
    let consumed = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) break;
      const installed = await f.db.prepare("SELECT to_regclass('search_outbox') AS name").get();
      if (installed?.name && (await f.db.prepare('SELECT count(*) AS n FROM search_outbox').get())!.n === 0) {
        consumed = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(consumed, output);
    assert.deepEqual((await f.meili.search(f.indexUid, { q: '星空', limit: 10, offset: 0 })).hits.map(h => h.id), ['b27', 'v4']);
    const taskCount = async () => {
      const response = await fetch(process.env.MEILISEARCH_URL + '/tasks?indexUids=' + f.indexUid + '&limit=100', {
        headers: { Authorization: 'Bearer ' + process.env.MEILI_MASTER_KEY },
      });
      assert.equal(response.status, 200);
      return (await response.json()).results.length as number;
    };
    await new Promise(resolve => setTimeout(resolve, 200));
    const beforeIdle = await taskCount();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await taskCount(), beforeIdle, '空闲 worker 不应继续提交 Meili 设置任务');
    child.kill('SIGTERM');
    const [code, signal] = await Promise.race([exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Worker did not stop')), 5000).unref())]);
    assert.equal(code, 0, output);
    assert.equal(signal, null);
    assert.match(output, /"status":"stopped"/);
  } finally {
    if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGKILL'); await stopped; }
    await f.close();
  }
});
