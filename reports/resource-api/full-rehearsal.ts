/** 仅操作 wvn_qa 的隔离资源 schema；接收已验证公共索引，不读取下载票据。 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { PgDatabase } from '../../src/database/postgres.ts';
import { migrate } from '../../src/database/migrations.ts';
import { resourceMigrations, ResourceRepository, RedisResourceCache } from '../../src/resources/index.ts';
import { importResources } from '../../src/resources/import.ts';
import { startResourceServer } from '../../src/resources/server.ts';

const schema = 'resource_full_20261029';
const source = '/home/i/wvn-platform-20261029/data/resources.sqlite';
const namespace = 'b2/web-visual-novel/snapshot-20261028';
const expectedSha = '2a04ee201a45363d073eb09f80c0d6ac93089ceeb0b90a5ca850084a18e0e7ee';
const reportPath = '/home/i/wvn-platform-20261029/source/reports/resource-api/full-rehearsal.json';
const expected = { paths: 1_420_065, objects: 1_067_041, logicalBytes: 239_205_984_120 };
const emit = (phase: string, values: Record<string, unknown> = {}) => console.log(JSON.stringify({ phase, ...values }));
const started = performance.now();
const steps: Record<string, unknown> = {};

async function save(status: string) {
  await mkdir('/home/i/wvn-platform-20261029/source/reports/resource-api', { recursive: true });
  await writeFile(reportPath, JSON.stringify({ status, schema, namespace, sourceSha256: expectedSha, expected, elapsedSeconds: +(performance.now() - started).toFixed(3) / 1000, steps }, null, 2) + '\n', { mode: 0o600 });
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  emit(name + '-started'); const begin = performance.now();
  const value = await fn(); const seconds = +( (performance.now() - begin) / 1000).toFixed(3);
  steps[name] = { seconds, result: value }; await save('running'); emit(name + '-complete', { seconds, result: value });
  return value;
}

async function main() {
  const connectionString = process.env.WVN_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('QA_DATABASE_REQUIRED');
  const target = new URL(connectionString);
  if (target.pathname !== '/wvn_qa' || target.username !== 'wvn_qa') throw new Error('QA_DATABASE_REQUIRED');
  const sqlite = new DatabaseSync(source, { readOnly: true });
  try {
    const paths = sqlite.prepare('SELECT count(*) AS n FROM resource_paths WHERE namespace=?').get(namespace)!.n;
    const objects = sqlite.prepare('SELECT count(DISTINCT sha256) AS n FROM resource_paths WHERE namespace=?').get(namespace)!.n;
    const logicalBytes = sqlite.prepare('SELECT sum(o.bytes) AS n FROM resource_paths p JOIN resource_objects o ON o.sha256=p.sha256 WHERE p.namespace=?').get(namespace)!.n;
    const errors = sqlite.prepare("SELECT count(*) AS n FROM b2_cas_sources WHERE namespace=? AND (status<>'verified' OR error IS NOT NULL)").get(namespace)!.n;
    steps.sourceCounts = { paths, objects, logicalBytes, errors }; emit('source-counts', steps.sourceCounts as Record<string, unknown>);
    assert.deepEqual({ paths, objects, logicalBytes }, expected); assert.equal(errors, 0);
  } finally { sqlite.close(); }
  const admin = new Pool({ connectionString, max: 1 });
  try { await admin.query('CREATE SCHEMA IF NOT EXISTS resource_full_20261029'); } finally { await admin.end(); }
  const db = new PgDatabase(connectionString, { schema, max: 4 });
  const monitor = new PgDatabase(connectionString, { schema, max: 1 });
  let running = false;
  const interval = setInterval(() => {
    if (running) return;
    running = true;
    monitor.prepare('SELECT processed,total,published FROM wvn_resource_snapshots WHERE namespace=$1').get(namespace)
      .then(row => emit('progress', { elapsedSeconds: +((performance.now() - started) / 1000).toFixed(1), ...(row ?? { phase: 'source-validation' }) }))
      .catch(() => emit('progress', { phase: 'initializing' })).finally(() => { running = false; });
  }, 15_000);
  let service: Awaited<ReturnType<typeof startResourceServer>> | undefined;
  try {
    await migrate(db, resourceMigrations);
    const dryRun = await timed('dryRun', () => importResources({ db, source, namespace }));
    assert.equal(dryRun.total, expected.paths); assert.equal(dryRun.logicalBytes, expected.logicalBytes); assert.equal(dryRun.sourceSha256, expectedSha);
    const applied = await timed('apply', () => importResources({ db, source, namespace, apply: true, batchSize: 1000 }));
    assert.equal(applied.total, expected.paths); assert.equal(applied.status, 'complete');
    const verified = await timed('verify', () => importResources({ db, source, namespace, verify: true }));
    assert.equal(verified.metadataSha256, applied.metadataSha256); assert.equal(verified.status, 'verified');
    await timed('targetCounts', async () => {
      const row = await db.prepare('SELECT count(*) AS paths,count(DISTINCT key) AS unique_keys,count(DISTINCT sha256) AS objects FROM wvn_resources WHERE namespace=$1').get(namespace);
      const objects = await db.prepare('SELECT count(*) AS n FROM wvn_resource_objects').get();
      const snapshot = await db.prepare('SELECT processed,total,logical_bytes,published FROM wvn_resource_snapshots WHERE namespace=$1').get(namespace);
      assert.equal(row!.paths, expected.paths); assert.equal(row!.unique_keys, expected.paths); assert.equal(row!.objects, expected.objects); assert.equal(objects!.n, expected.objects);
      assert.equal(snapshot!.processed, expected.paths); assert.equal(snapshot!.published, true);
      return { ...row, objectRows: objects!.n, ...snapshot };
    });
    const prefix = 'qa:resource-full:' + randomUUID() + ':';
    service = await startResourceServer({ db, port: 4270, host: '127.0.0.1', redisUrl: process.env.REDIS_URL, cachePrefix: prefix });
    await timed('api', async () => {
      const rows = await db.prepare('SELECT key::text AS key,original_path AS path,sha256,content_type AS mime FROM wvn_resources WHERE namespace=$1 ORDER BY original_path LIMIT 3').all(namespace);
      assert.equal(rows.length, 3);
      const get = (path: string) => fetch('http://127.0.0.1:4270' + path);
      const one = await get('/api/resources/' + rows[0].key); assert.equal(one.status, 200);
      const metadata = await one.json(); assert.equal(metadata.key, rows[0].key); assert.equal(metadata.contentType, rows[0].mime);
      assert.equal(metadata.url, 'https://wg-b2.saop.cc/' + rows[0].sha256 + '.bin');
      assert.equal((await service!.repository.findByOriginalPath(namespace, rows[0].path))!.key, rows[0].key);
      const missing = randomUUID();
      const batch = await fetch('http://127.0.0.1:4270/api/resources/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys: [rows[0].key, rows[1].key, missing] }) });
      assert.equal(batch.status, 200); const batchBody = await batch.json(); assert.equal(batchBody.resources.length, 2); assert.deepEqual(batchBody.missing, [missing]);
      const pageBase = '/api/resources/manifest?namespace=' + encodeURIComponent(namespace) + '&version=' + applied.inventorySha256 + '&limit=2';
      const first = await (await get(pageBase)).json(); assert.equal(first.resources.length, 2); assert.equal(typeof first.nextCursor, 'string');
      const second = await (await get(pageBase + '&cursor=' + first.nextCursor)).json(); assert.equal(second.resources.length, 2);
      assert.notEqual(first.resources[0].key, second.resources[0].key);
      assert.equal((await get('/api/resources/' + missing)).status, 404); assert.equal((await get('/api/resources/invalid')).status, 400);
      assert.equal((await get('/health')).status, 200);
      const redis = createClient({ url: process.env.REDIS_URL, disableOfflineQueue: true, socket: { reconnectStrategy: false, connectTimeout: 500 } });
      redis.on('error', () => {}); await redis.connect();
      try {
        const value = (await redis.get(prefix + rows[0].key))!; const ttl = await redis.ttl(prefix + rows[0].key);
        assert.ok(value); assert.ok(ttl > 0 && ttl <= 300); assert.equal(value.includes('https:'), false);
        const cache = new RedisResourceCache({ url: process.env.REDIS_URL!, prefix });
        const closedDb = new PgDatabase(connectionString, { schema, max: 1 }); await closedDb.close();
        try { assert.equal((await new ResourceRepository(closedDb, { cache }).findByKey(rows[0].key))!.key, rows[0].key); } finally { cache.close(); }
        const unavailable = new RedisResourceCache({ url: 'redis://127.0.0.1:1', prefix: 'qa:unavailable:' + randomUUID() + ':', timeoutMs: 100 });
        const fallbackStarted = performance.now();
        try { assert.equal((await new ResourceRepository(db, { cache: unavailable }).findByKey(rows[0].key))!.key, rows[0].key); } finally { unavailable.close(); }
        return { endpoint: 'http://127.0.0.1:4270', samples: rows, get: 200, pathLookup: true, batchFound: 2, batchMissing: 1, manifestPageSizes: [2, 2], unknown: 404, invalid: 400, health: 200, redisTtl: ttl, redisHitWithClosedPg: true, redisUnavailableFallbackMs: +(performance.now() - fallbackStarted).toFixed(3) };
      } finally { redis.destroy(); }
    });
    await save('complete'); emit('complete', { schema, expected, elapsedSeconds: +((performance.now() - started) / 1000).toFixed(3) });
  } finally { clearInterval(interval); await service?.close(); await monitor.close(); await db.close(); }
}

main().catch(async error => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error?.message === 'QA_DATABASE_REQUIRED' ? 'QA_DATABASE_REQUIRED' : 'REHEARSAL_FAILED';
  steps.failure = { code }; await save('failed'); emit('failed', { code }); process.exitCode = 1;
});
