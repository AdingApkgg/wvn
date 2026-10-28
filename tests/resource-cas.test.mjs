import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const command = fileURLToPath(new URL('../scripts/migration/resource-cas.mjs', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'wvn-cas-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), objects = join(root, 'objects'), database = join(root, 'mapping.sqlite');
  await mkdir(source);
  return { root, source, objects, database };
}
async function run(f, options = []) {
  return exec(process.execPath, [command, '--source', f.source, '--objects', f.objects,
    '--database', f.database, '--namespace', 'game/v1', ...options]);
}
function open(t, path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON');
  t.after(() => db.close());
  return db;
}

test('default dry-run hashes resources without creating objects or SQLite', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'engine.wasm'), '\0asm');
  const { stdout } = await run(f);
  const result = JSON.parse(stdout);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.files, 1);
  assert.equal(result.uniqueObjects, 1);
  await assert.rejects(stat(f.objects), { code: 'ENOENT' });
  await assert.rejects(stat(f.database), { code: 'ENOENT' });
});

test('apply keeps source bytes, uses complete extensionless SHA-256 and indexes original paths', async t => {
  const f = await fixture(t);
  await mkdir(join(f.source, '背景'));
  await mkdir(join(f.source, 'other'));
  await writeFile(join(f.source, '背景', '标题 #1.png'), 'same bytes');
  await writeFile(join(f.source, 'engine.wasm'), 'same bytes');
  await writeFile(join(f.source, 'other', 'engine.wasm'), 'different bytes');
  await writeFile(join(f.source, 'empty.data'), '');
  const first = JSON.parse((await run(f, ['--apply'])).stdout);
  assert.equal(first.files, 4);
  assert.equal(first.uniqueObjects, 3);
  assert.equal(first.writtenObjects, 3);
  assert.deepEqual((await readdir(f.objects)).sort(), [digest('same bytes'), digest('different bytes'), digest('')].sort());
  assert.equal(await readFile(join(f.objects, digest('same bytes')), 'utf8'), 'same bytes');
  assert.equal(await readFile(join(f.source, '背景', '标题 #1.png'), 'utf8'), 'same bytes');
  const db = open(t, f.database);
  const rows = db.prepare('SELECT * FROM resource_paths ORDER BY original_path').all();
  assert.equal(rows.length, 4);
  assert.equal(rows.find(r => r.original_path === '背景/标题 #1.png').sha256, digest('same bytes'));
  assert.equal(rows.find(r => r.original_path === '背景/标题 #1.png').content_type, 'image/png');
  assert.equal(rows.find(r => r.original_path === 'engine.wasm').content_type, 'application/wasm');
  assert.equal(rows.find(r => r.original_path === 'other/engine.wasm').sha256, digest('different bytes'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM resource_objects').get().n, 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const second = JSON.parse((await run(f, ['--apply'])).stdout);
  assert.equal(second.writtenObjects, 0);
  assert.equal(second.reusedObjects, 3);
  assert.equal(db.prepare('SELECT count(*) AS n FROM resource_paths').get().n, 4);
});

test('multi-chunk binary objects retain all bytes and do not share storage with the source file', async t => {
  const f = await fixture(t);
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 37);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 251;
  const original = join(f.source, 'large.data');
  await writeFile(original, bytes);
  const result = JSON.parse((await run(f, ['--apply'])).stdout);
  assert.equal(result.sourceBytes, bytes.length);
  const stored = join(f.objects, digest(bytes));
  assert.deepEqual(await readFile(stored), bytes);
  await writeFile(original, 'changed source');
  assert.deepEqual(await readFile(stored), bytes);
  const db = open(t, f.database);
  assert.equal(db.prepare('SELECT bytes FROM resource_objects').get().bytes, bytes.length);
});

test('changed content under an existing namespace path fails and rolls back new mappings', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'z.txt'), 'old');
  await run(f, ['--apply']);
  await writeFile(join(f.source, 'a.txt'), 'new path');
  await writeFile(join(f.source, 'z.txt'), 'changed');
  await assert.rejects(run(f, ['--apply']), e => /已有路径对应不同内容/.test(e.stderr));
  const db = open(t, f.database);
  assert.equal(db.prepare('SELECT count(*) AS n FROM resource_paths').get().n, 1);
  assert.equal(db.prepare('SELECT sha256 FROM resource_paths').get().sha256, digest('old'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM resource_objects').get().n, 1);
  await run(f, ['--apply', '--namespace', 'game/v2']);
  assert.equal(db.prepare('SELECT count(*) AS n FROM resource_paths').get().n, 3);
});

test('an existing same-size corrupted hash object is not overwritten or trusted', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'asset.bin'), 'good');
  await mkdir(f.objects);
  await writeFile(join(f.objects, digest('good')), 'evil');
  await assert.rejects(run(f, ['--apply']), e => /已有对象校验失败/.test(e.stderr));
  assert.equal(await readFile(join(f.objects, digest('good')), 'utf8'), 'evil');
  const db = open(t, f.database);
  assert.equal(db.prepare('SELECT count(*) AS n FROM resource_paths').get().n, 0);
  assert.deepEqual(await readdir(f.objects), [digest('good')]);
});

test('source and object symlinks are rejected', async t => {
  const f = await fixture(t);
  const outside = join(f.root, 'private.txt');
  await writeFile(outside, 'private');
  await symlink(outside, join(f.source, 'link.txt'));
  await assert.rejects(run(f, ['--apply']), e => /符号链接/.test(e.stderr));
  await rm(join(f.source, 'link.txt'));
  await writeFile(join(f.source, 'a.txt'), 'private');
  await mkdir(f.objects, { recursive: true });
  await symlink(outside, join(f.objects, digest('private')));
  await assert.rejects(run(f, ['--apply']), e => /已有对象校验失败/.test(e.stderr));
  assert.equal(await readFile(outside, 'utf8'), 'private');
});

test('overlapping directories and a database inside either resource directory are rejected', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'a.txt'), 'hello');
  for (const overrides of [
    { objects: join(f.source, 'objects') },
    { objects: f.root },
    { database: join(f.source, 'mapping.sqlite') },
    { database: join(f.objects, 'mapping.sqlite') },
  ]) {
    await assert.rejects(run({ ...f, ...overrides }, ['--apply']), e => /目录.*重叠|数据库.*目录/.test(e.stderr));
  }
  await assert.rejects(stat(f.objects), { code: 'ENOENT' });
  await assert.rejects(stat(f.database), { code: 'ENOENT' });
});

test('the SQLite mapping enforces digest, size, foreign-key and original-path uniqueness', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'a.png'), 'data');
  await run(f, ['--apply']);
  const db = open(t, f.database);
  const insert = db.prepare('INSERT INTO resource_objects(sha256, bytes) VALUES(?, ?)');
  for (const invalid of ['short', 'g'.repeat(64), 'A'.repeat(64)]) assert.throws(() => insert.run(invalid, 1));
  assert.throws(() => insert.run('b'.repeat(64), -1));
  assert.throws(() => db.prepare('INSERT INTO resource_paths VALUES(?, ?, ?, ?)').run('game/v1', 'missing.png', 'f'.repeat(64), 'image/png'));
  assert.throws(() => db.prepare('INSERT INTO resource_paths VALUES(?, ?, ?, ?)').run('game/v1', 'a.png', digest('data'), 'image/png'));
});

test('an unrelated existing database is left untouched', async t => {
  const f = await fixture(t);
  const existing = new DatabaseSync(f.database);
  existing.exec("CREATE TABLE private_data(value TEXT); INSERT INTO private_data VALUES('keep')");
  existing.close();
  await writeFile(join(f.source, 'a.txt'), 'data');
  await assert.rejects(run(f, ['--apply']), e => /独立资源映射库/.test(e.stderr));
  const db = open(t, f.database);
  assert.equal(db.prepare('SELECT value FROM private_data').get().value, 'keep');
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name), ['private_data']);
});
