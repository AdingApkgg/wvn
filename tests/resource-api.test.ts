import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { resourceMigrations, ResourceRepository, createResourceApp } from '../src/resources/index.ts';
import { startResourceServer } from '../src/resources/server.ts';

const namespace = 'b2/web-visual-novel/snapshot-test';
const version = 'c'.repeat(64);
const sha = 'a'.repeat(64);

async function fixture() {
  const f = await postgresFixture();
  await migrate(f.db, resourceMigrations);
  return f;
}

async function seed(f: Awaited<ReturnType<typeof fixture>>, count = 3) {
  await f.db.prepare(`INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,published)
    VALUES($1,$2,true)`).run(namespace, version);
  await f.db.prepare('INSERT INTO wvn_resource_objects(sha256,bytes) VALUES($1,$2)').run(sha, 11);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const key = randomUUID(); keys.push(key);
    await f.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`)
      .run(key, namespace, '故事/' + i + '.png', sha, i === 1 ? 'text/plain' : 'image/png', 'source-' + i, 'target-1', 'd'.repeat(40));
  }
  return keys;
}

test('resource migration creates isolated PostgreSQL tables and is repeatable', async () => {
  const f = await fixture();
  try {
    const row = await f.db.prepare(`SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema=current_schema() AND table_name='wvn_resources'`).get();
    assert.equal(row?.n, 1);
    await migrate(f.db, resourceMigrations);
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_schema_migrations WHERE id=$1').get('003-resources-postgres'))?.n, 1);
  } finally { await f.close(); }
});

test('resource keys resolve to the fixed SHA256 URL with path-specific MIME and no location audit leakage', async () => {
  const f = await fixture();
  try {
    const keys = await seed(f);
    const repo = new ResourceRepository(f.db);
    const app = createResourceApp(repo);
    const response = await app.request('/api/resources/' + keys[1]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { key: keys[1], url: 'https://wg-b2.saop.cc/' + sha + '.bin', sha256: sha, bytes: 11, contentType: 'text/plain' });
    assert.equal((await repo.findByOriginalPath(namespace, '故事/0.png'))?.key, keys[0]);
    assert.equal(await repo.findByOriginalPath(namespace, 'not-found'), undefined);
    assert.equal((await app.request('/api/resources/' + randomUUID())).status, 404);
    for (const invalid of ['no-key', sha, 'https%3A%2F%2Fevil.invalid', keys[0].toUpperCase()])
      assert.equal((await app.request('/api/resources/' + invalid)).status, 400);
  } finally { await f.close(); }
});

test('resource batch lookup caps input, deduplicates and reports explicit missing UUIDs', async () => {
  const f = await fixture();
  try {
    const keys = await seed(f); const missing = randomUUID();
    const app = createResourceApp(new ResourceRepository(f.db));
    const post = (value: unknown) => app.request('/api/resources/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const response = await post({ keys: [keys[1], missing, keys[0], keys[1]] });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.resources.map((r: { key: string }) => r.key), [keys[1], keys[0]]);
    assert.deepEqual(body.missing, [missing]);
    for (const body of [{ keys: Array(101).fill(keys[0]) }, { keys: ['http://127.0.0.1/private'] }, { keys: [] }, { keys: 'bad' }, { keys, url: 'https://evil.invalid' }])
      assert.equal((await post(body)).status, 400);
    const malformed = await app.request('/api/resources/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const oversized = await app.request('/api/resources/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys: ['x'.repeat(20_000)] }) });
    assert.equal(oversized.status, 413);
  } finally { await f.close(); }
});

test('resource manifest is version-pinned, bounded and uses a namespace-bound keyset cursor', async () => {
  const f = await fixture();
  try {
    await seed(f, 4);
    const app = createResourceApp(new ResourceRepository(f.db));
    const base = '/api/resources/manifest?namespace=' + encodeURIComponent(namespace) + '&version=' + version;
    const firstResponse = await app.request(base + '&limit=2');
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.deepEqual(first.resources.map((r: { originalPath: string }) => r.originalPath), ['故事/0.png', '故事/1.png']);
    assert.equal(typeof first.nextCursor, 'string');
    const second = await (await app.request(base + '&limit=2&cursor=' + first.nextCursor)).json();
    assert.deepEqual(second.resources.map((r: { originalPath: string }) => r.originalPath), ['故事/2.png', '故事/3.png']);
    assert.equal(second.nextCursor, null);
    assert.equal((await app.request(base + '&limit=501')).status, 400);
    assert.equal((await app.request(base + '&limit=2&limit=3')).status, 400);
    assert.equal((await app.request(base.replace(version, 'b'.repeat(64)))).status, 404);
    assert.equal((await app.request('/api/resources/manifest?namespace=other&version=' + version + '&cursor=' + first.nextCursor)).status, 400);
    assert.equal((await app.request('/api/resources/manifest')).status, 400);
    await f.db.prepare('UPDATE wvn_resource_snapshots SET published=false WHERE namespace=$1').run(namespace);
    assert.equal((await app.request(base)).status, 404);
  } finally { await f.close(); }
});

test('resource repository never exposes a partially imported namespace through keys or paths', async () => {
  const f = await fixture();
  try {
    const keys = await seed(f);
    await f.db.prepare('UPDATE wvn_resource_snapshots SET published=false WHERE namespace=$1').run(namespace);
    const repo = new ResourceRepository(f.db);
    assert.equal(await repo.findByKey(keys[0]), undefined);
    assert.equal(await repo.findByOriginalPath(namespace, '故事/0.png'), undefined);
    assert.deepEqual(await repo.resolve(keys), { resources: [], missing: keys });
  } finally { await f.close(); }
});

test('standalone resource service answers real HTTP requests using the isolated PostgreSQL repository', async () => {
  const f = await fixture();
  let service: Awaited<ReturnType<typeof startResourceServer>> | undefined;
  try {
    const keys = await seed(f);
    service = await startResourceServer({ db: f.db, host: '127.0.0.1', port: 0 });
    const port = (service.server.address() as { port: number }).port;
    const response = await fetch('http://127.0.0.1:' + port + '/api/resources/' + keys[0]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).key, keys[0]);
    assert.equal((await fetch('http://127.0.0.1:' + port + '/health')).status, 200);
  } finally { await service?.close(); await f.close(); }
});
