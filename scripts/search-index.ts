import { PgDatabase } from '../src/database/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { catalogMigrations } from '../src/database/catalog.ts';
import { searchMigrations } from '../src/search/migrations.ts';
import { MeiliClient } from '../src/search/meili.server.ts';
import { SearchIndexer } from '../src/search/indexer.server.ts';

const [command = 'consume', batch = '100', ...extra] = process.argv.slice(2);
if (!['init', 'rebuild', 'consume', 'worker'].includes(command) || !/^\d{1,4}$/.test(batch) || Number(batch) < 1 || Number(batch) > 1000 || extra.length)
  throw new Error('Usage: tsx scripts/search-index.ts [init|rebuild|consume|worker] [1..1000]');
const databaseUrl = process.env.WG_DATABASE_URL || process.env.DATABASE_URL;
const { MEILISEARCH_URL, MEILI_WRITE_KEY, MEILI_MASTER_KEY } = process.env;
if (!databaseUrl || !MEILISEARCH_URL || !(MEILI_WRITE_KEY || MEILI_MASTER_KEY))
  throw new Error('DATABASE_URL, MEILISEARCH_URL and MEILI_WRITE_KEY are required');
const idleMs = Number(process.env.SEARCH_WORKER_IDLE_MS || '1000');
if (!Number.isSafeInteger(idleMs) || idleMs < 100 || idleMs > 30_000)
  throw new Error('SEARCH_WORKER_IDLE_MS must be between 100 and 30000');
const db = new PgDatabase(databaseUrl, { schema: process.env.WG_DATABASE_SCHEMA || process.env.DATABASE_SCHEMA || 'public' });
let stopping = false;
let wake: (() => void) | undefined;
const stop = () => { stopping = true; wake?.(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
function pause(ms: number) {
  if (stopping) return Promise.resolve();
  return new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); wake = undefined; resolve(); };
    const timer = setTimeout(done, ms);
    wake = done;
  });
}
try {
  await migrate(db, [...catalogMigrations, ...searchMigrations]);
  const indexer = new SearchIndexer({ db, meili: new MeiliClient({ url: MEILISEARCH_URL, apiKey: (MEILI_WRITE_KEY || MEILI_MASTER_KEY)! }),
    indexUid: process.env.MEILI_INDEX_UID || 'wvn_public_works' });
  if (command === 'rebuild') console.log(JSON.stringify({ command, ...await indexer.rebuild() }));
  else if (command === 'init') { await indexer.initialize(); console.log(JSON.stringify({ command, indexUid: indexer.indexUid })); }
  else if (command === 'worker') {
    let failures = 0;
    let initialized = false;
    console.log(JSON.stringify({ command, status: 'running', indexUid: indexer.indexUid, batch: Number(batch) }));
    while (!stopping) {
      try {
        if (!initialized) { await indexer.initialize(); initialized = true; }
        // 空闲时只查 PG，避免每轮向 Meili 提交相同的设置任务。
        const pending = await db.prepare(`SELECT 1 FROM search_outbox
          WHERE available_at<=now() AND (lease_until IS NULL OR lease_until<now()) LIMIT 1`).get();
        if (!pending) { failures = 0; await pause(idleMs); continue; }
        const result = await indexer.consume({ limit: Number(batch) });
        if (result.claimed) console.log(JSON.stringify({ command, ...result }));
        failures = result.failed ? failures + 1 : 0;
        if (result.claimed < Number(batch) || result.failed)
          await pause(failures ? Math.min(30_000, idleMs * 2 ** Math.min(failures, 9)) : idleMs);
      } catch {
        initialized = false;
        failures++;
        console.error('搜索索引服务暂不可用；保留 outbox，稍后重试。');
        await pause(Math.min(30_000, idleMs * 2 ** Math.min(failures, 9)));
      }
    }
    console.log(JSON.stringify({ command, status: 'stopped' }));
  } else {
    const result = await indexer.consume({ limit: Number(batch) });
    console.log(JSON.stringify({ command, ...result }));
    if (result.failed) process.exitCode = 1;
  }
} catch {
  console.error('搜索索引任务失败；未确认的 outbox 已保留，请检查服务状态后重试。');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await db.close();
}
