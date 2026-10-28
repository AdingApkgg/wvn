import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresFixture } from './helpers/postgres.ts';
import { importSqlite } from '../src/database/import-sqlite.ts';

async function fixture() {
  const f = await postgresFixture();
  const root = mkdtempSync(join(tmpdir(), 'wvn-pg-import-'));
  const source = join(root, 'legacy.sqlite');
  const sqlite = new DatabaseSync(source);
  sqlite.exec(`CREATE TABLE works(id TEXT PRIMARY KEY,title TEXT NOT NULL);
    CREATE TABLE saves(id TEXT PRIMARY KEY,work TEXT REFERENCES works(id),created INTEGER NOT NULL,enabled INTEGER NOT NULL);
    INSERT INTO works VALUES('v4','团子 ? ');
    INSERT INTO saves VALUES('original-save-id','v4',1793204116841,1);`);
  sqlite.close();
  await f.db.exec(`CREATE TABLE works(id text PRIMARY KEY,title text NOT NULL);
    CREATE TABLE saves(id text PRIMARY KEY,work text REFERENCES works(id),created timestamptz NOT NULL,enabled boolean NOT NULL);`);
  return { ...f, source, async close() { await f.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('SQLite migration preview preserves source and leaves PostgreSQL unchanged', async () => {
  const f = await fixture();
  try {
    const report = await importSqlite({ source: f.source, db: f.db });
    assert.equal(report.status, 'dry-run');
    assert.equal(report.tables.find(t => t.name === 'works')?.sourceRows, 1);
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM works').get())?.n, 0);
    const old = new DatabaseSync(f.source, { readOnly: true });
    try { assert.equal(old.prepare('SELECT title FROM works').get()?.title, '团子 ? '); } finally { old.close(); }
  } finally { await f.close(); }
});

test('SQLite migration preserves IDs, timestamps, booleans, foreign keys and is repeatable', async () => {
  const f = await fixture();
  try {
    const report = await importSqlite({ source: f.source, db: f.db, apply: true });
    assert.equal(report.status, 'complete');
    assert.equal(report.tables.every(t => t.matches), true);
    const saved = await f.db.prepare('SELECT * FROM saves').get();
    assert.equal(saved?.id, 'original-save-id');
    assert.equal(saved?.created.getTime(), 1793204116841);
    assert.equal(saved?.enabled, true);
    const again = await importSqlite({ source: f.source, db: f.db, apply: true });
    assert.equal(again.status, 'complete');
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM saves').get())?.n, 1);
  } finally { await f.close(); }
});

test('SQLite migration detects conflicting existing rows and preserves the target row', async () => {
  const f = await fixture();
  try {
    await f.db.prepare('INSERT INTO works VALUES($1,$2)').run('v4', 'keep this title');
    await assert.rejects(importSqlite({ source: f.source, db: f.db, apply: true }), /differs|mismatch/i);
    assert.equal((await f.db.prepare('SELECT title FROM works WHERE id=$1').get('v4'))?.title, 'keep this title');
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM saves').get())?.n, 0);
  } finally { await f.close(); }
});

test('SQLite migration refuses unknown columns before writing any source table', async () => {
  const f = await fixture();
  try {
    const old = new DatabaseSync(f.source);
    old.exec('ALTER TABLE works ADD COLUMN private_note TEXT');
    old.close();
    await assert.rejects(importSqlite({ source: f.source, db: f.db, apply: true }), /column/i);
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM works').get())?.n, 0);
  } finally { await f.close(); }
});

test('SQLite migration imports deferred circular references as one atomic snapshot', async () => {
  const f = await fixture();
  try {
    const old = new DatabaseSync(f.source);
    old.exec("ALTER TABLE works ADD COLUMN default_save TEXT; UPDATE works SET default_save='original-save-id'");
    old.close();
    await f.db.exec(`ALTER TABLE works ADD COLUMN default_save text;
      ALTER TABLE works ADD CONSTRAINT works_default FOREIGN KEY(default_save) REFERENCES saves(id) DEFERRABLE INITIALLY DEFERRED`);
    const report = await importSqlite({ source: f.source, db: f.db, apply: true });
    assert.equal(report.status, 'complete');
    assert.equal((await f.db.prepare('SELECT default_save FROM works WHERE id=$1').get('v4'))?.default_save, 'original-save-id');
  } finally { await f.close(); }
});

test('SQLite migration refuses a live WAL source until a consistent snapshot is supplied', async () => {
  const f = await fixture();
  const writer = new DatabaseSync(f.source);
  try {
    writer.exec("PRAGMA journal_mode=WAL; INSERT INTO works VALUES('v5','live write')");
    await assert.rejects(importSqlite({ source: f.source, db: f.db, apply: true }), /snapshot|WAL/i);
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM works').get())?.n, 0);
  } finally { writer.close(); await f.close(); }
});


test('SQLite migration retains row insertion order for generated catalog and revision ordering', async () => {
  const f = await fixture();
  try {
    const old = new DatabaseSync(f.source);
    old.exec("INSERT INTO works VALUES('v2','Inserted after v4')");
    old.close();
    await f.db.exec('ALTER TABLE works ADD COLUMN catalog_order bigint GENERATED BY DEFAULT AS IDENTITY');
    await importSqlite({ source: f.source, db: f.db, apply: true });
    const rows = await f.db.prepare('SELECT id FROM works ORDER BY catalog_order').all();
    assert.deepEqual(rows.map(row => row.id), ['v4', 'v2']);
  } finally { await f.close(); }
});
