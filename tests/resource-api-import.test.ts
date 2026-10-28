import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { resourceMigrations, ResourceRepository } from '../src/resources/index.ts';
import { importResources } from '../src/resources/import.ts';

const namespace = 'b2/web-visual-novel/snapshot-test';
const a = 'a'.repeat(64), b = 'b'.repeat(64), inventory = 'c'.repeat(64);

async function fixture() {
  const f = await postgresFixture();
  await migrate(f.db, resourceMigrations);
  const root = mkdtempSync(join(tmpdir(), 'wvn-resource-import-'));
  const source = join(root, 'resources.sqlite');
  const sqlite = new DatabaseSync(source);
  sqlite.exec(`PRAGMA application_id=1465273923; PRAGMA user_version=1;
    CREATE TABLE resource_objects(sha256 TEXT PRIMARY KEY,bytes INTEGER NOT NULL);
    CREATE TABLE resource_paths(namespace TEXT,original_path TEXT,sha256 TEXT,content_type TEXT,PRIMARY KEY(namespace,original_path));
    CREATE TABLE b2_cas_sources(namespace TEXT,original_path TEXT,source_file_id TEXT,sha256 TEXT,status TEXT,error TEXT,PRIMARY KEY(namespace,original_path));
    CREATE TABLE b2_cas_locations(sha256 TEXT PRIMARY KEY,file_id TEXT,content_sha1 TEXT);
    CREATE TABLE b2_cas_snapshots(namespace TEXT PRIMARY KEY,inventory_sha256 TEXT);`);
  sqlite.prepare('INSERT INTO b2_cas_snapshots VALUES(?,?)').run(namespace, inventory);
  for (const [sha, bytes] of [[a, 11], [b, 17]] as const) {
    sqlite.prepare('INSERT INTO resource_objects VALUES(?,?)').run(sha, bytes);
    sqlite.prepare('INSERT INTO b2_cas_locations VALUES(?,?,?)').run(sha, 'target-' + sha[0], 'd'.repeat(40));
  }
  for (const [path, sha, mime] of [['a/1.png', a, 'image/png'], ['a/2.txt', a, 'text/plain'], ['b/故事.webm', b, 'video/webm']]) {
    sqlite.prepare('INSERT INTO resource_paths VALUES(?,?,?,?)').run(namespace, path, sha, mime);
    sqlite.prepare('INSERT INTO b2_cas_sources VALUES(?,?,?,?,?,NULL)').run(namespace, path, 'source-' + path, sha, 'verified');
  }
  sqlite.close();
  return { ...f, source, async close() { await f.close(); rmSync(root, { recursive: true, force: true }); } };
}
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('resource import dry-run verifies receipts without writing PG or the SQLite source', async () => {
  const f = await fixture();
  try {
    const before = digest(f.source);
    const result = await importResources({ db: f.db, source: f.source, namespace });
    assert.equal(result.status, 'dry-run'); assert.equal(result.total, 3); assert.equal(result.logicalBytes, 39);
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resources').get())?.n, 0);
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resource_import_runs').get())?.n, 0);
    assert.equal(digest(f.source), before);
  } finally { await f.close(); }
});

test('resource import retains UUIDs, original MIME and immutable B2 source/target audit across reruns', async () => {
  const f = await fixture();
  try {
    const before = digest(f.source);
    const result = await importResources({ db: f.db, source: f.source, namespace, apply: true, batchSize: 2 });
    assert.equal(result.status, 'complete'); assert.equal(result.total, 3); assert.equal(result.inserted, 3);
    const repo = new ResourceRepository(f.db);
    const png = await repo.findByOriginalPath(namespace, 'a/1.png');
    const text = await repo.findByOriginalPath(namespace, 'a/2.txt');
    assert.match(png!.key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(png!.key, text!.key); assert.equal(png!.sha256, text!.sha256); assert.equal(text!.contentType, 'text/plain');
    const audit = await f.db.prepare('SELECT source_file_id,target_file_id,content_sha1 FROM wvn_resources WHERE key=$1').get(png!.key);
    assert.deepEqual(audit, { source_file_id: 'source-a/1.png', target_file_id: 'target-a', content_sha1: 'd'.repeat(40) });
    const again = await importResources({ db: f.db, source: f.source, namespace, apply: true, batchSize: 1 });
    assert.equal(again.inserted, 0);
    assert.equal((await repo.findByOriginalPath(namespace, 'a/1.png'))?.key, png!.key);
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resource_objects').get())?.n, 2);
    assert.equal(digest(f.source), before);
  } finally { await f.close(); }
});

test('resource import commits checkpoints, records a conflict and resumes without republishing partial rows', async () => {
  const f = await fixture();
  try {
    await f.db.prepare('INSERT INTO wvn_resource_objects VALUES($1,$2)').run(b, 99);
    await assert.rejects(importResources({ db: f.db, source: f.source, namespace, apply: true, batchSize: 1 }), /OBJECT_CONFLICT/);
    const progress = await f.db.prepare('SELECT checkpoint,processed,published FROM wvn_resource_snapshots WHERE namespace=$1').get(namespace);
    assert.deepEqual(progress, { checkpoint: 'a/2.txt', processed: 2, published: false });
    const key = (await f.db.prepare('SELECT key FROM wvn_resources WHERE original_path=$1').get('a/1.png'))!.key;
    assert.equal(await new ResourceRepository(f.db).findByKey(key), undefined);
    const failure = await f.db.prepare("SELECT status,error_code,error_path FROM wvn_resource_import_runs WHERE status='failed'").get();
    assert.deepEqual(failure, { status: 'failed', error_code: 'OBJECT_CONFLICT', error_path: 'b/故事.webm' });
    await f.db.prepare('UPDATE wvn_resource_objects SET bytes=17 WHERE sha256=$1').run(b);
    const resumed = await importResources({ db: f.db, source: f.source, namespace, apply: true, batchSize: 1 });
    assert.equal(resumed.resumed, 2); assert.equal(resumed.inserted, 1);
    assert.equal((await new ResourceRepository(f.db).findByKey(key))?.key, key);
  } finally { await f.close(); }
});

test('resource import refuses changed published mappings and leaves the existing logical key intact', async () => {
  const f = await fixture();
  try {
    await importResources({ db: f.db, source: f.source, namespace, apply: true });
    const repo = new ResourceRepository(f.db);
    const existing = await repo.findByOriginalPath(namespace, 'a/1.png');
    const writer = new DatabaseSync(f.source);
    writer.prepare('UPDATE resource_paths SET sha256=? WHERE original_path=?').run(b, 'a/1.png');
    writer.prepare('UPDATE b2_cas_sources SET sha256=? WHERE original_path=?').run(b, 'a/1.png');
    writer.close();
    await assert.rejects(importResources({ db: f.db, source: f.source, namespace, apply: true }), /SNAPSHOT_CONFLICT/);
    assert.deepEqual(await repo.findByOriginalPath(namespace, 'a/1.png'), existing);
  } finally { await f.close(); }
});

test('resource import rejects unverified or mismatched receipts before importing any paths', async () => {
  for (const change of ["UPDATE b2_cas_sources SET status='error',error='copy failed' WHERE original_path='a/1.png'", "UPDATE b2_cas_sources SET sha256='" + b + "' WHERE original_path='a/1.png'", "DELETE FROM b2_cas_locations WHERE sha256='" + b + "'"]) {
    const f = await fixture();
    try {
      const writer = new DatabaseSync(f.source); writer.exec(change); writer.close();
      await assert.rejects(importResources({ db: f.db, source: f.source, namespace, apply: true }), /SOURCE_INVALID/);
      assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resources').get())?.n, 0);
      assert.equal((await f.db.prepare("SELECT count(*)::int AS n FROM wvn_resource_import_runs WHERE status='failed'").get())?.n, 1);
    } finally { await f.close(); }
  }
});

test('resource import rejects a live WAL snapshot without touching the target', async () => {
  const f = await fixture(); const writer = new DatabaseSync(f.source);
  try {
    writer.exec("PRAGMA journal_mode=WAL; UPDATE resource_objects SET bytes=12 WHERE sha256='" + a + "'");
    await assert.rejects(importResources({ db: f.db, source: f.source, namespace, apply: true }), /SOURCE_UNSTABLE/);
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resources').get())?.n, 0);
  } finally { writer.close(); await f.close(); }
});

test('independent resource verification detects target corruption without writing another import run', async () => {
  const f = await fixture();
  try {
    await importResources({ db: f.db, source: f.source, namespace, apply: true });
    const result = await importResources({ db: f.db, source: f.source, namespace, verify: true });
    assert.equal(result.status, 'verified');
    assert.equal((await f.db.prepare('SELECT count(*)::int AS n FROM wvn_resource_import_runs').get())?.n, 1);
    await f.db.prepare('UPDATE wvn_resources SET target_file_id=$1 WHERE original_path=$2').run('unexpected-version', 'a/1.png');
    await assert.rejects(importResources({ db: f.db, source: f.source, namespace, verify: true }), /PATH_CONFLICT|TARGET_MISMATCH/);
  } finally { await f.close(); }
});

test('independent resource verification catches extra target paths, not just matching source rows', async () => {
  const f = await fixture();
  try {
    await importResources({ db: f.db, source: f.source, namespace, apply: true });
    await f.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1)
      SELECT gen_random_uuid(),namespace,'extra.png',sha256,content_type,source_file_id,target_file_id,content_sha1 FROM wvn_resources WHERE original_path=$1`).run('a/1.png');
    await assert.rejects(importResources({ db: f.db, source: f.source, namespace, verify: true }), /TARGET_MISMATCH/);
  } finally { await f.close(); }
});
