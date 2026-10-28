import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync, statSync, readFileSync } from 'node:fs';
import { PgDatabase } from '../src/database/postgres.ts';
import { testDatabase, testDatabaseSchema, testUser } from './helpers/accounts.ts';
import { backupRoot, restoreDatabase } from './helpers/backup.ts';
import { DeletionLedger } from '../src/accounts/deletion.server.ts';
import { createAccountBackup, prepareAccountRestore, applyAccountRestore } from '../src/accounts/backup.server.ts';

test('native PG backup isolates its schema and restores rows and sequences only to an empty database', async () => {
  const root = backupRoot(), db = await testDatabase();
  const schema = testDatabaseSchema(db), target = await restoreDatabase();
  let restored: PgDatabase | undefined;
  try {
    await testUser(db, 'backup-original-id');
    await db.exec("INSERT INTO wg_share_audit(share,action,reason,created) VALUES ('fixture','create','synthetic',1)");
    const ledger = join(root, 'deleted.jsonl'); new DeletionLedger(ledger);
    const manifest = await createAccountBackup({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: schema, blobRoot: join(root, 'blobs'), ledger, destination: join(root, 'backup') });
    assert.equal(manifest.format, 'wvn-account-backup-v3');
    assert.equal(manifest.database.schema, schema);
    assert.equal(manifest.database.counts.user, 1);
    assert.equal(statSync(join(root, 'backup', 'accounts.pgdump')).mode & 0o777, 0o600);
    assert.equal(readFileSync(join(root, 'backup', 'accounts.pgdump')).subarray(0, 5).toString(), 'PGDMP');
    const prepared = await prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: ledger, destination: join(root, 'prepared') });
    assert.equal(prepared.status, 'prepared');
    const applied = await applyAccountRestore({ prepared: join(root, 'prepared'), database: target.database });
    assert.equal(applied.status, 'database-restored');
    restored = new PgDatabase(target.database, { schema });
    assert.equal((await restored.prepare('SELECT id FROM "user"').get())?.id, 'backup-original-id');
    assert.equal((await restored.prepare("SELECT nextval('wg_share_audit_id_seq') AS n").get())?.n, 2);
    const schemas = await restored.prepare("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'qa_%'").all();
    assert.deepEqual(schemas.map(row => row.nspname), [schema]);
    await assert.rejects(() => applyAccountRestore({ prepared: join(root, 'prepared'), database: target.database }), /empty|non-empty/i);
    assert.equal((await restored.prepare('SELECT count(*) n FROM "user"').get())?.n, 1);
  } finally { await restored?.close(); await target.close(); rmSync(root, { recursive: true, force: true }); }
});

test('backup refuses dangling private references instead of silently omitting required bytes', async () => {
  const root = backupRoot(), db = await testDatabase();
  const ledger = join(root, 'deletions.jsonl'); new DeletionLedger(ledger);
  try {
    await db.prepare('INSERT INTO wg_save_refs(owner,revision,hash) VALUES($1,$2,$3)').run('missing-owner', 'missing-revision', '0'.repeat(64));
    await assert.rejects(() => createAccountBackup({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(db), blobRoot: join(root, 'blobs'), ledger, destination: join(root, 'backup') }), /missing|dangling|reference/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('restore checks non-system tables whose schema starts with pg but is not reserved', async () => {
  const root = backupRoot(), db = await testDatabase(), target = await restoreDatabase();
  const ledger = join(root, 'deleted.jsonl'); new DeletionLedger(ledger);
  const targetDb = new PgDatabase(target.database);
  try {
    await createAccountBackup({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(db), blobRoot: join(root, 'blobs'), ledger, destination: join(root, 'backup') });
    await prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: ledger, destination: join(root, 'prepared') });
    await targetDb.exec('CREATE SCHEMA pgx_private; CREATE TABLE pgx_private.keep(id integer); INSERT INTO pgx_private.keep VALUES(7)');
    await assert.rejects(() => applyAccountRestore({ prepared: join(root, 'prepared'), database: target.database }), /empty|non-empty/i);
    assert.equal((await targetDb.prepare('SELECT id FROM pgx_private.keep').get())?.id, 7);
  } finally { await targetDb.close(); await target.close(); rmSync(root, { recursive: true, force: true }); }
});

test('snapshot proof and native dump stay consistent across a concurrent committed write', async () => {
  const { databaseProof, exportDatabaseSnapshot, restoreEmptyDatabase } = await import('../src/database/pg-backup.ts');
  const root = backupRoot(), db = await testDatabase(), schema = testDatabaseSchema(db), target = await restoreDatabase();
  let restored: PgDatabase | undefined;
  try {
    await testUser(db, 'before-snapshot');
    const proof = await exportDatabaseSnapshot({ database: process.env.WVN_TEST_DATABASE_URL!, schema, dump: join(root, 'snapshot.pgdump') }, async client => {
      const original = await databaseProof(client, schema);
      await testUser(db, 'after-snapshot');
      return original;
    });
    assert.equal((await db.prepare('SELECT count(*) n FROM "user"').get())?.n, 2);
    const actual = await restoreEmptyDatabase(target.database, schema, join(root, 'snapshot.pgdump'), proof);
    assert.equal(actual.counts.user, 1);
    restored = new PgDatabase(target.database, { schema });
    assert.equal((await restored.prepare('SELECT id FROM "user"').get())?.id, 'before-snapshot');
  } finally { await restored?.close(); await target.close(); rmSync(root, { recursive: true, force: true }); }
});

test('prepare merges maximum independent deny timestamps and rejects tampered ledgers and dumps', async () => {
  const { writeFileSync, existsSync } = await import('node:fs');
  const root = backupRoot(), db = await testDatabase();
  try {
    const ledger = join(root, 'deleted.jsonl'), shares = join(root, 'shares.jsonl'), current = join(root, 'current.jsonl'), currentShares = join(root, 'current-shares.jsonl');
    writeFileSync(ledger, '{"userId":"same","deletedAt":900}\n{"userId":"same","deletedAt":100}\n');
    writeFileSync(shares, '{"userId":"denied","deletedAt":800}\n');
    writeFileSync(current, '{"userId":"same","deletedAt":200}\n{"userId":"newer","deletedAt":1000}\n');
    writeFileSync(currentShares, '{"userId":"denied","deletedAt":20}\n');
    await createAccountBackup({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(db), blobRoot: root, ledger, shareLedger: shares, destination: join(root, 'backup') });
    await assert.rejects(() => prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: current, destination: join(root, 'missing-current-shares') }), /share revocation ledger/i);
    assert.equal(existsSync(join(root, 'missing-current-shares')), false);
    const prepared = await prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: current, currentShareLedger: currentShares, destination: join(root, 'prepared') });
    assert.equal(new DeletionLedger(prepared.deletionLedger, true).entries.get('same'), 900);
    assert.equal(new DeletionLedger(prepared.shareLedger, true).entries.get('denied'), 800);
    assert.equal(prepared.deletions, 2);
    const dump = join(root, 'backup', 'accounts.pgdump'), bytes = readFileSync(dump);
    writeFileSync(dump, Buffer.from('PGDMP tampered'));
    await assert.rejects(() => prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: current, currentShareLedger: currentShares, destination: join(root, 'bad-dump') }), /hash|bytes/);
    writeFileSync(dump, bytes);
    writeFileSync(join(root, 'backup', 'deletions.jsonl'), '{"userId":"forged","deletedAt":1}\n');
    await assert.rejects(() => prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: current, currentShareLedger: currentShares, destination: join(root, 'bad-ledger') }), /hash|bytes/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy SQLite V1 and V2 archives require explicit preparation and offline PG conversion', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { prepareLegacyAccountRestore } = await import('../src/accounts/backup.server.ts');
  const { importSqlite } = await import('../src/database/import-sqlite.ts');
  const { createAccountService } = await import('./helpers/accounts.ts');
  for (const format of ['wg-account-backup-v1', 'wg-account-backup-v2']) {
    const root = backupRoot(), backup = join(root, 'legacy'), db = await testDatabase();
    let service: Awaited<ReturnType<typeof createAccountService>> | undefined;
    try {
      mkdirSync(backup);
      const old = new DatabaseSync(join(backup, 'accounts.sqlite'));
      old.exec('CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" integer,"createdAt" text,"updatedAt" text); CREATE TABLE wg_account(user_id text PRIMARY KEY,auth_version integer,code_group text)');
      for (const id of ['legacy-survivor', 'legacy-deleted']) {
        old.prepare('INSERT INTO "user" VALUES(?,?,?,0,?,?)').run(id, id, id + '@example.invalid', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
        old.prepare('INSERT INTO wg_account VALUES(?,1,?)').run(id, 'original-code-group');
      }
      old.close();
      const sourceHash = createHash('sha256').update(readFileSync(join(backup, 'accounts.sqlite'))).digest('hex');
      writeFileSync(join(backup, 'manifest.json'), JSON.stringify({ format, databaseSha256: sourceHash, files: [] }));
      writeFileSync(join(backup, 'deletions.jsonl'), '');
      if (format.endsWith('v2')) writeFileSync(join(backup, 'share-revocations.jsonl'), '');
      const current = join(root, 'current-deletions.jsonl'); writeFileSync(current, '{"userId":"legacy-deleted","deletedAt":99}\n');
      const currentShares = join(root, 'current-shares.jsonl'); writeFileSync(currentShares, '{"userId":"legacy-revoked-share","deletedAt":77}\n');
      await assert.rejects(() => prepareAccountRestore({ backup, currentLedger: current, destination: join(root, 'wrong-path') }), /legacy|SQLite/i);
      const prepared = await prepareLegacyAccountRestore({ backup, currentLedger: current, currentShareLedger: currentShares, destination: join(root, 'converted') });
      assert.equal(prepared.status, 'legacy-conversion-required');
      const imported = await importSqlite({ source: prepared.database, db, apply: true });
      assert.ok(imported);
      service = await createAccountService({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(db), origin: 'https://accounts.wg.test', secret: 'synthetic-legacy-restore-secret-with-at-least-48-characters', deletionLedger: prepared.deletionLedger });
      assert.equal((await service.db.prepare('SELECT id FROM "user" WHERE id=$1').get('legacy-survivor'))?.id, 'legacy-survivor');
      assert.equal(await service.db.prepare('SELECT id FROM "user" WHERE id=$1').get('legacy-deleted'), undefined);
      assert.equal(new DeletionLedger(prepared.shareLedger, true).entries.get('legacy-revoked-share'), 77);
      assert.equal(createHash('sha256').update(readFileSync(join(backup, 'accounts.sqlite'))).digest('hex'), sourceHash);
    } finally { await service?.close(); rmSync(root, { recursive: true, force: true }); }
  }
});

test('native restore handles the pre-existing empty public schema and quoted JSON/bytea tables', async () => {
  const root = backupRoot(), source = await restoreDatabase(), target = await restoreDatabase();
  const sourceDb = new PgDatabase(source.database), targetDb = new PgDatabase(target.database);
  try {
    await sourceDb.exec(`CREATE TABLE "odd\"\"table"(id bigserial PRIMARY KEY,payload jsonb,bytes bytea); INSERT INTO "odd\"\"table"(payload,bytes) VALUES ('{"nested":{"id":"original"}}','\\x001122')`);
    const ledger = join(root, 'deleted.jsonl'); new DeletionLedger(ledger);
    const manifest = await createAccountBackup({ database: source.database, blobRoot: root, ledger, destination: join(root, 'backup') });
    assert.equal(manifest.database.schema, 'public');
    await prepareAccountRestore({ backup: join(root, 'backup'), currentLedger: ledger, destination: join(root, 'prepared') });
    await applyAccountRestore({ prepared: join(root, 'prepared'), database: target.database });
    const row = await targetDb.prepare('SELECT * FROM "odd""table"').get();
    assert.deepEqual(row?.payload, { nested: { id: 'original' } });
    assert.deepEqual(row?.bytes, Buffer.from([0, 0x11, 0x22]));
  } finally { await sourceDb.close(); await targetDb.close(); await source.close(); await target.close(); rmSync(root, { recursive: true, force: true }); }
});

test('apply refuses a manifest that drops referenced private files or required share ledgers', async () => {
  const { sharingFixture } = await import('./helpers/sharing.ts');
  const { writeFileSync } = await import('node:fs');
  const f = await sharingFixture(true), target = await restoreDatabase();
  try {
    const ledger = join(f.root, 'deletions.jsonl'); new DeletionLedger(ledger);
    const manifest = await createAccountBackup({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(f.db), blobRoot: f.root, ledger, shareLedger: join(f.root, 'revoked.jsonl'), destination: join(f.root, 'backup') });
    assert.equal(manifest.files.length, 1);
    writeFileSync(join(f.root, 'backup', 'manifest.json'), JSON.stringify({ ...manifest, ledgers: { deletions: manifest.ledgers.deletions } }));
    await assert.rejects(() => prepareAccountRestore({ backup: join(f.root, 'backup'), currentLedger: ledger, destination: join(f.root, 'missing-share-ledger') }), /share revocation ledger/i);
    writeFileSync(join(f.root, 'backup', 'manifest.json'), JSON.stringify({ ...manifest, files: [] }));
    await prepareAccountRestore({ backup: join(f.root, 'backup'), currentLedger: ledger, currentShareLedger: join(f.root, 'revoked.jsonl'), destination: join(f.root, 'prepared') });
    await assert.rejects(() => applyAccountRestore({ prepared: join(f.root, 'prepared'), database: target.database }), /reference|file/i);
  } finally { await target.close(); await f.close(); }
});
