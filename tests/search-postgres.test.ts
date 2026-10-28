import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { catalogMigrations } from '../src/database/catalog.ts';
import { Store } from '../src/server/store.ts';
import { searchMigrations } from '../src/search/migrations.ts';
import { MeiliClient } from '../src/search/meili.server.ts';
import { SearchIndexer } from '../src/search/indexer.server.ts';
import { createSearchApp } from '../src/search/http.server.ts';

async function fixture() {
  const pg = await postgresFixture();
  const indexUid = 'wvn_qa_search_' + randomUUID().replaceAll('-', '');
  const meili = new MeiliClient({ url: process.env.MEILISEARCH_URL!, apiKey: process.env.MEILI_MASTER_KEY! });
  await migrate(pg.db, [...catalogMigrations, ...searchMigrations]);
  const store = new Store(pg.db);
  await store.ready;
  const indexer = new SearchIndexer({ db: pg.db, meili, indexUid });
  return { ...pg, store, meili, indexUid, indexer,
    app: createSearchApp({ db: pg.db, meili, indexUid }),
    async close() {
      for (const index of await meili.listIndexes())
        if (index.uid === indexUid || index.uid.startsWith(indexUid + '_')) await meili.deleteIndex(index.uid);
      await pg.close();
    } };
}
async function seed(f: Awaited<ReturnType<typeof fixture>>) {
  await f.store.seed({ snapshotAt: '2026-10-29T00:00:00Z', works: [
    { id: 'v4', title: 'CLANNAD', originalTitle: 'クラナド', aliases: ['团子大家族', '小镇家族'], evidence: 'https://vndb.org/v4' },
    { id: 'b27', title: '星空', originalTitle: 'Starlight', aliases: ['星光'], evidence: 'https://bgm.tv/subject/27' },
  ], versions: [
    { id: 'version-a', workId: 'v4', number: 1, title: '中文版', legacyPath: '/private-disk/secret-clannad/', engine: 'ONS' },
    { id: 'version-b', workId: 'b27', number: 1, title: '原版', legacyPath: '/private-disk/secret-stars/', engine: 'RenPy' },
  ] });
  await f.db.prepare('INSERT INTO work_metadata VALUES($1,$2,$3)').run('v4', '2026-10-29T00:00:00Z', JSON.stringify({ titles: [{ title: '光守坂道', lang: 'zh' }], tags: [{ name: '校园' }] }));
  await f.db.prepare('INSERT INTO reports VALUES($1,$2,$3,$4)').run('version-a', 'startup', '2026-10-29T00:00:00Z', JSON.stringify({ status: 'passed', detail: '/secrets/report-path' }));
}
async function search(f: Awaited<ReturnType<typeof fixture>>, query: string) {
  const response = await f.app.request('/api/search?' + query);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ ids: string[]; source: string; nextOffset: number | null }>;
}

test('search outbox commits with catalog changes, rolls back, and queues both reassigned works', async () => {
  const f = await fixture();
  try {
    await seed(f);
    assert.deepEqual((await f.db.prepare('SELECT work_id FROM search_outbox ORDER BY work_id').all()).map(r => r.work_id), ['b27', 'v4']);
    await f.db.exec('DELETE FROM search_outbox');
    await assert.rejects(f.db.transaction(async () => {
      await f.db.prepare('UPDATE works SET title=$1 WHERE id=$2').run('回滚标题', 'v4');
      throw new Error('rollback');
    }), /rollback/);
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM search_outbox').get())!.n, 0);
    await f.store.reassignVersion('version-a', 'b27', 1);
    assert.deepEqual((await f.db.prepare('SELECT work_id FROM search_outbox ORDER BY work_id').all()).map(r => r.work_id), ['b27', 'v4']);
  } finally { await f.close(); }
});

test('real Meilisearch finds Chinese aliases, multilingual titles and IDs with public filters', async () => {
  const f = await fixture();
  try {
    await seed(f);
    await f.indexer.rebuild();
    for (const q of ['团子大家族', '光守坂道', 'v4', '4', 'クラナド'])
      assert.deepEqual((await search(f, 'q=' + encodeURIComponent(q))).ids, ['v4']);
    assert.deepEqual((await search(f, 'engine=ONS&tag=' + encodeURIComponent('校园') + '&state=passed')).ids, ['v4']);
    assert.deepEqual((await search(f, 'engine=RenPy&tag=' + encodeURIComponent('校园'))).ids, []);
    assert.deepEqual((await search(f, 'state=unchecked')).ids, ['b27']);
    const json = JSON.stringify(await search(f, 'q=CLANNAD'));
    assert.doesNotMatch(json, /private-disk|secret|report-path|apiKey|master/i);
    for (const query of ['limit=0', 'limit=51', 'offset=10001', 'q=' + 'x'.repeat(201), 'state=hidden', 'engine=bad', 'tag=x&tag=y'])
      assert.equal((await f.app.request('/api/search?' + query)).status, 400, query);
    await f.db.prepare('UPDATE versions SET status=$1 WHERE id=$2').run('hidden', 'version-a');
    assert.deepEqual((await search(f, 'q=CLANNAD')).ids, []);
    const stats = await f.indexer.consume({ limit: 10 });
    assert.ok(stats.succeeded >= 1);
    assert.deepEqual((await f.meili.search(f.indexUid, { q: 'CLANNAD', limit: 10, offset: 0 })).hits, []);
  } finally { await f.close(); }
});

test('worker retains a failed Meilisearch task, retries safely and consumes duplicates idempotently', async () => {
  const f = await fixture();
  try {
    await seed(f);
    // 索引主键错误让 Meili 返回 202 后真正失败，捕获把入队当成功的错误。
    await f.meili.createIndex(f.indexUid, 'wrongPrimaryKey');
    const failed = await f.indexer.consume({ limit: 10 });
    assert.equal(failed.failed, 2);
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM search_outbox').get())!.n, 2);
    assert.equal((await f.db.prepare('SELECT min(attempts) AS n FROM search_outbox').get())!.n, 1);
    await f.meili.deleteIndex(f.indexUid);
    await f.db.exec("UPDATE search_outbox SET available_at=now(),lease_until=NULL,lease_token=NULL");
    await f.indexer.initialize();
    const retry = await f.indexer.consume({ limit: 10 });
    assert.equal(retry.succeeded, 2);
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM search_outbox').get())!.n, 0);
    await f.db.prepare('UPDATE works SET revision=revision+1 WHERE id=$1').run('v4');
    await f.indexer.consume({ limit: 10 });
    assert.deepEqual((await search(f, 'q=团子大家族')).ids, ['v4']);
    assert.equal((await f.indexer.consume({ limit: 10 })).claimed, 0);
  } finally { await f.close(); }
});

test('concurrent workers and rebuild preserve the newest document and requeue snapshot changes', async () => {
  const f = await fixture();
  try {
    await seed(f);
    await f.indexer.initialize();
    const other = new SearchIndexer({ db: f.db, meili: f.meili, indexUid: f.indexUid });
    const results = await Promise.all([f.indexer.consume({ limit: 10 }), other.consume({ limit: 10 })]);
    assert.equal(results.reduce((n, r) => n + r.succeeded, 0), 2);
    await f.db.prepare('UPDATE works SET title=$1 WHERE id=$2').run('最新唯一标题', 'v4');
    await Promise.all([f.indexer.consume({ limit: 10 }), f.indexer.rebuild()]);
    await f.indexer.consume({ limit: 10 });
    assert.deepEqual((await search(f, 'q=最新唯一标题')).ids, ['v4']);
    assert.equal((await f.meili.search(f.indexUid, { q: '', limit: 10, offset: 0 })).hits.length, 2);
  } finally { await f.close(); }
});

test('search outages return an explicit 503 and leave outbox work retryable', async () => {
  const f = await fixture();
  try {
    await seed(f);
    const unavailable = new MeiliClient({ url: 'http://127.0.0.1:1', apiKey: 'test', requestTimeoutMs: 100 });
    const app = createSearchApp({ db: f.db, meili: unavailable, indexUid: f.indexUid });
    const response = await app.request('/api/search?q=CLANNAD');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'search_unavailable');
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM search_outbox').get())!.n, 2);
  } finally { await f.close(); }
});

test('expired leases cannot let an old worker overwrite a newer same-work document', async () => {
  const f = await fixture();
  let releaseOld!: () => void;
  try {
    await seed(f);
    await f.indexer.rebuild();
    await f.indexer.consume({ limit: 10 });
    await f.db.prepare('UPDATE works SET title=$1 WHERE id=$2').run('旧任务暂停标题', 'v4');
    let entered!: () => void;
    const inside = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { releaseOld = resolve; });
    const replace = f.meili.replace.bind(f.meili);
    f.meili.replace = async (uid, docs) => {
      if (docs[0]?.title === '旧任务暂停标题') { entered(); await resume; }
      await replace(uid, docs);
    };
    const old = f.indexer.consume({ limit: 1 });
    await inside;
    const claimed = (await f.db.prepare('SELECT lease_token FROM search_outbox WHERE work_id=$1').get('v4'))!.lease_token;
    await f.db.prepare('UPDATE works SET title=$1 WHERE id=$2').run('租约更新最终标题', 'v4');
    await f.db.prepare("UPDATE search_outbox SET lease_until=now()-interval '1 second' WHERE work_id=$1").run('v4');
    const newer = new SearchIndexer({ db: f.db, meili: f.meili, indexUid: f.indexUid }).consume({ limit: 1 });
    let reclaimed = false;
    for (let i = 0; i < 300; i++) {
      const next = await f.db.prepare('SELECT lease_token FROM search_outbox WHERE work_id=$1').get('v4');
      if (next?.lease_token !== claimed) { reclaimed = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(reclaimed, '第二个 worker 应能领取已过期的租约');
    // 无作品锁时，新 worker 会在此完成并被随后恢复的旧写入覆盖。
    await Promise.race([newer, new Promise(resolve => setTimeout(resolve, 250))]);
    releaseOld();
    await Promise.all([old, newer]);
    await f.indexer.consume({ limit: 10 });
    assert.deepEqual((await search(f, 'q=租约更新最终标题')).ids, ['v4']);
    assert.deepEqual((await search(f, 'q=旧任务暂停标题')).ids, []);
  } finally { releaseOld?.(); await f.close(); }
});

test('catalog writes during a real staged rebuild remain queued after atomic swap', async () => {
  const f = await fixture();
  try {
    await seed(f);
    await f.indexer.rebuild();
    await f.indexer.consume({ limit: 10 });
    const replace = f.meili.replace.bind(f.meili);
    let changed = false;
    f.meili.replace = async (uid, docs) => {
      if (uid !== f.indexUid && !changed) {
        changed = true;
        // 索引发送的是已读取的旧快照；写入与业务事务同生共灭。
        await f.db.prepare('UPDATE works SET title=$1 WHERE id=$2').run('重建期间唯一新标题', 'v4');
      }
      await replace(uid, docs);
    };
    await f.indexer.rebuild();
    assert.ok(changed);
    assert.equal((await f.db.prepare('SELECT work_id FROM search_outbox WHERE work_id=$1').get('v4'))!.work_id, 'v4');
    await f.indexer.consume({ limit: 10 });
    assert.deepEqual((await search(f, 'q=重建期间唯一新标题')).ids, ['v4']);
  } finally { await f.close(); }
});

test('stale filter matches are rechecked and filtered pagination preserves relevance order', async () => {
  const f = await fixture();
  try {
    await seed(f);
    await f.indexer.rebuild();
    await f.db.prepare('UPDATE versions SET engine=$1 WHERE id=$2').run('Artemis', 'version-a');
    assert.deepEqual((await search(f, 'engine=ONS')).ids, []);
    await f.db.prepare('UPDATE work_metadata SET payload=$1 WHERE work_id=$2').run(JSON.stringify({ tags: [{ name: '变化标签' }] }), 'v4');
    assert.deepEqual((await search(f, 'tag=' + encodeURIComponent('校园'))).ids, []);
    const all = await search(f, 'limit=1');
    const next = await search(f, 'limit=1&offset=' + all.nextOffset);
    assert.equal(all.ids.length, 1);
    assert.equal(next.ids.length, 1);
    assert.notEqual(all.ids[0], next.ids[0]);
  } finally { await f.close(); }
});
