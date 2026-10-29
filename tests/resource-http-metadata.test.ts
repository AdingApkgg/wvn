import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { resourceMigrations } from '../src/resources/schema.ts';
import { importHttpMetadata, HTTP_METADATA_SCOPE } from '../src/resources/http-metadata.ts';
import { ResourceRepository } from '../src/resources/repository.ts';
import { RedisResourceCache } from '../src/resources/cache.ts';
import { VersionResources } from '../src/platform/version-resources.server.ts';
import type { Store } from '../src/server/store.ts';
const sha = 'a'.repeat(64);
const proof = () => ({ schema: 1, ...HTTP_METADATA_SCOPE, objects: [{ sha256: sha, bytes: 11, contentType: 'application/octet-stream', versionId: 'target' }] });
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
async function fixture(old = false) {
  const f = await postgresFixture(); await migrate(f.db, old ? resourceMigrations.slice(0, 1) : resourceMigrations);
  await f.db.prepare('INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,published) VALUES($1,$2,true)').run(HTTP_METADATA_SCOPE.namespace, HTTP_METADATA_SCOPE.inventorySha256);
  await f.db.prepare('INSERT INTO wvn_resource_objects(sha256,bytes) VALUES($1,11)').run(sha);
  const keys = [randomUUID(), randomUUID()];
  for (let i = 0; i < 2; i++) await f.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1) VALUES($1,$2,$3,$4,$5,$6,'target',$7)`)
    .run(keys[i], HTTP_METADATA_SCOPE.namespace, 'game/' + i, sha, i ? 'text/plain' : 'image/png', 'source' + i, 'b'.repeat(40));
  const run = (value = proof(), apply = false, expected?: string) => { const bytes = encode(value); return importHttpMetadata({ db: f.db, proofBytes: bytes, expectedProofSha256: expected ?? digest(bytes), ...HTTP_METADATA_SCOPE, apply }); };
  return { ...f, keys, run };
}
test('HTTP metadata dry-run on old schema is write-free, then apply is immutable and all projections agree', async () => {
  const f = await fixture(true);
  try {
    const snapshot = async () => (await f.db.prepare(`SELECT row_to_json(r) AS v FROM wvn_resources r ORDER BY key`).all());
    const original = await snapshot();
    assert.equal((await f.run()).status, 'dry-run');
    assert.equal((await f.db.prepare("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='wvn_resource_objects' AND column_name='http_content_type'").get())?.n, 0);
    await migrate(f.db, resourceMigrations);
    assert.equal((await new ResourceRepository(f.db).findByKey(f.keys[0]))?.contentType, 'image/png');
    assert.equal((await f.run(proof(), true)).changed, 1);
    assert.equal((await f.run(proof(), true)).changed, 0);
    assert.deepEqual(await snapshot(), original);
    const repo = new ResourceRepository(f.db);
    assert.equal((await repo.findByKey(f.keys[0]))?.contentType, 'application/octet-stream');
    assert.equal((await repo.findByOriginalPath(HTTP_METADATA_SCOPE.namespace, 'game/1'))?.contentType, 'application/octet-stream');
    assert.ok((await repo.manifest({ namespace: HTTP_METADATA_SCOPE.namespace, version: HTTP_METADATA_SCOPE.inventorySha256 }))?.resources.every(r => r.contentType === 'application/octet-stream'));
    const bridge = new VersionResources({ raw: async () => ({ status: 'published' }) } as unknown as Store, repo);
    await bridge.bind({ versionId: 'game', namespace: HTTP_METADATA_SCOPE.namespace, inventorySha256: HTTP_METADATA_SCOPE.inventorySha256, prefix: 'game/' });
    assert.ok((await bridge.manifest('game'))?.resources.every(r => r.contentType === 'application/octet-stream'));
    assert.equal((await bridge.find('game', '0'))?.contentType, 'application/octet-stream');
    const conflict = proof(); conflict.objects[0].contentType = 'text/plain';
    await assert.rejects(f.run(conflict, true));
  } finally { await f.close(); }
});
test('HTTP proof rejects invalid digest, membership, bytes, versions, publication and conflicts without writes', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.run(proof(), true, '0'.repeat(64)));
    const variants = [
      { ...proof(), objects: [] },
      { ...proof(), objects: [...proof().objects, ...proof().objects] },
      { ...proof(), objects: [{ ...proof().objects[0], sha256: 'c'.repeat(64) }] },
      { ...proof(), objects: [{ ...proof().objects[0], bytes: 12 }] },
      { ...proof(), objects: [{ ...proof().objects[0], versionId: 'wrong' }] },
      { ...proof(), objects: [{ ...proof().objects[0], contentType: 'text/plain\r\nBad: yes' }] },
    ];
    for (const value of variants) await assert.rejects(f.run(value, true));
    await f.db.prepare('UPDATE wvn_resources SET target_file_id=$1 WHERE key=$2').run('other-target', f.keys[1]);
    await assert.rejects(f.run(proof(), true));
    await f.db.prepare("UPDATE wvn_resources SET target_file_id='target'").run();
    await f.db.exec('UPDATE wvn_resource_snapshots SET published=false');
    await assert.rejects(f.run(proof(), true));
    assert.equal((await f.db.prepare('SELECT http_content_type FROM wvn_resource_objects').get())?.http_content_type, null);
  } finally { await f.close(); }
});
test('custom-prefix Redis rejects legacy MIME payload and writes schema envelope', async () => {
  const client = createClient({ url: process.env.REDIS_URL }); await client.connect();
  const prefix = 'qa:mime:' + randomUUID() + ':'; const key = randomUUID();
  const cache = new RedisResourceCache({ url: process.env.REDIS_URL!, prefix });
  const value = { key, sha256: sha, bytes: 11, contentType: 'text/plain' };
  try {
    await client.set(prefix + key, JSON.stringify(value));
    assert.equal((await cache.getMany([key])).size, 0);
    await cache.setMany([value]); assert.deepEqual((await cache.getMany([key])).get(key), value);
  } finally { cache.close(); await client.del(prefix + key); client.destroy(); }
});

test('CLI requires explicit scope and digest; default dry-run and apply use the exact proof file', async () => {
  const f = await fixture(); const root = await mkdtemp(join(tmpdir(), 'wvn-http-proof-'));
  try {
    const path = join(root, 'proof.json'); const bytes = encode(proof()); await writeFile(path, bytes);
    const args = ['--proof', path, '--expected-proof-sha256', digest(bytes), '--schema', f.schema,
      '--namespace', HTTP_METADATA_SCOPE.namespace, '--inventory', HTTP_METADATA_SCOPE.inventorySha256];
    const invoke = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-resource-http-metadata.ts', ...args],
      { encoding: 'utf8', env: { ...process.env, WG_RESOURCE_DATABASE_URL: process.env.WVN_TEST_DATABASE_URL } });
    const dry = invoke(args); assert.equal(dry.status, 0, dry.stderr); assert.equal(JSON.parse(dry.stdout).status, 'dry-run');
    assert.equal((await f.db.prepare('SELECT http_content_type FROM wvn_resource_objects').get())?.http_content_type, null);
    for (const bad of [args.slice(2), [...args, '--apply', '--apply'], args.map(x => x === digest(bytes) ? '0'.repeat(64) : x)]) {
      const failure = invoke(bad); assert.equal(failure.status, 1); assert.ok(!failure.stderr.includes(process.env.WVN_TEST_DATABASE_URL!));
    }
    const applied = invoke([...args, '--apply']); assert.equal(applied.status, 0, applied.stderr); assert.equal(JSON.parse(applied.stdout).changed, 1);
    assert.equal(JSON.parse(invoke([...args, '--apply']).stdout).changed, 0);
  } finally { await f.close(); await rm(root, { recursive: true, force: true }); }
});

test('apply validates before migrating old schema; paired fields and MIME constraints reject corruption', async () => {
  const f = await fixture(true);
  try {
    const invalid = proof(); invalid.objects[0].versionId = 'wrong';
    await assert.rejects(f.run(invalid, true));
    assert.equal((await f.db.prepare("SELECT count(*)::int AS n FROM wvn_schema_migrations WHERE id='007-resource-http-metadata'").get())?.n, 0);
    assert.equal((await f.run(proof(), true)).changed, 1);
    for (const [mime, hash] of [[null, 'c'.repeat(64)], ['text/plain', null], ['bad type', 'c'.repeat(64)], ['text/plain', 'UPPERCASE']]) {
      await assert.rejects(f.db.prepare('UPDATE wvn_resource_objects SET http_content_type=$1,http_metadata_proof_sha256=$2').run(mime, hash));
    }
    assert.equal((await f.db.prepare('SELECT http_content_type FROM wvn_resource_objects').get())?.http_content_type, 'application/octet-stream');
  } finally { await f.close(); }
});

test('selected proof updates all selected references and leaves other namespace objects untouched', async () => {
  const f = await fixture(); const other = 'e'.repeat(64);
  try {
    await f.db.prepare('INSERT INTO wvn_resource_objects(sha256,bytes) VALUES($1,99)').run(other);
    await f.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1)
      VALUES($1,$2,'unselected', $3,'text/plain','other-source','other-target',$4)`).run(randomUUID(), HTTP_METADATA_SCOPE.namespace, other, 'f'.repeat(40));
    const before = await f.db.prepare('SELECT row_to_json(o) AS object FROM wvn_resource_objects o WHERE sha256=$1').get(other);
    const result = await f.run(proof(), true); assert.equal(result.objects, 1); assert.equal(result.resources, 2);
    assert.deepEqual(await f.db.prepare('SELECT row_to_json(o) AS object FROM wvn_resource_objects o WHERE sha256=$1').get(other), before);
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resources WHERE sha256=$1').get(sha))?.n, 2);
  } finally { await f.close(); }
});

test('warm schema2 cache and late old writeback cannot hide applied MIME or snapshot revocation', async () => {
  const f = await fixture(); const prefix = 'qa:mime-warm:' + randomUUID() + ':';
  const client = createClient({ url: process.env.REDIS_URL }); await client.connect();
  const cache = new RedisResourceCache({ url: process.env.REDIS_URL!, prefix });
  const repo = new ResourceRepository(f.db, { cache });
  try {
    assert.equal((await repo.findByKey(f.keys[0]))?.contentType, 'image/png');
    const oldPayload = (await client.get(prefix + f.keys[0]))!; assert.equal(JSON.parse(oldPayload).schema, 2);
    await f.run(proof(), true);
    assert.equal((await repo.findByKey(f.keys[0]))?.contentType, 'application/octet-stream');
    assert.equal((await repo.findByOriginalPath(HTTP_METADATA_SCOPE.namespace, 'game/0'))?.contentType, 'application/octet-stream');
    assert.ok((await repo.manifest({ namespace: HTTP_METADATA_SCOPE.namespace, version: HTTP_METADATA_SCOPE.inventorySha256 }))?.resources.every(r => r.contentType === 'application/octet-stream'));
    await client.set(prefix + f.keys[0], oldPayload);
    assert.equal((await repo.findByKey(f.keys[0]))?.contentType, 'application/octet-stream');
    await f.db.exec('UPDATE wvn_resource_snapshots SET published=false');
    await client.set(prefix + f.keys[0], oldPayload);
    assert.equal(await repo.findByKey(f.keys[0]), undefined);
  } finally { cache.close(); for (const key of f.keys) await client.del(prefix + key); client.destroy(); await f.close(); }
});
