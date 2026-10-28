import { PgDatabase } from '../src/database/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { catalogMigrations } from '../src/database/catalog.ts';
import { searchMigrations } from '../src/search/migrations.ts';
import { MeiliClient } from '../src/search/meili.server.ts';
import { SearchIndexer } from '../src/search/indexer.server.ts';

const [command = 'consume', batch = '100', ...extra] = process.argv.slice(2);
if (!['init', 'rebuild', 'consume'].includes(command) || !/^\d{1,4}$/.test(batch) || Number(batch) < 1 || Number(batch) > 1000 || extra.length)
  throw new Error('Usage: tsx scripts/search-index.ts [init|rebuild|consume] [1..1000]');
const { DATABASE_URL, MEILISEARCH_URL, MEILI_WRITE_KEY, MEILI_MASTER_KEY } = process.env;
if (!DATABASE_URL || !MEILISEARCH_URL || !(MEILI_WRITE_KEY || MEILI_MASTER_KEY))
  throw new Error('DATABASE_URL, MEILISEARCH_URL and MEILI_WRITE_KEY are required');
const db = new PgDatabase(DATABASE_URL);
try {
  await migrate(db, [...catalogMigrations, ...searchMigrations]);
  const indexer = new SearchIndexer({ db, meili: new MeiliClient({ url: MEILISEARCH_URL, apiKey: (MEILI_WRITE_KEY || MEILI_MASTER_KEY)! }),
    indexUid: process.env.MEILI_INDEX_UID || 'wvn_public_works' });
  if (command === 'rebuild') console.log(JSON.stringify({ command, ...await indexer.rebuild() }));
  else if (command === 'init') { await indexer.initialize(); console.log(JSON.stringify({ command, indexUid: indexer.indexUid })); }
  else {
    const result = await indexer.consume({ limit: Number(batch) });
    console.log(JSON.stringify({ command, ...result }));
    if (result.failed) process.exitCode = 1;
  }
} catch {
  console.error('搜索索引任务失败；未确认的 outbox 已保留，请检查服务状态后重试。');
  process.exitCode = 1;
} finally { await db.close(); }
