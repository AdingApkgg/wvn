import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { PgDatabase } from '../src/database/postgres.ts';

test('PostgreSQL parameters preserve quoted content and reject duplicate identities', async () => {
  const f = await postgresFixture();
  try {
    await f.db.exec('CREATE TABLE entries(id text PRIMARY KEY,value text NOT NULL,n bigint NOT NULL)');
    const input = "中文 ? '); DROP TABLE entries; --";
    const result = await f.db.prepare('INSERT INTO entries VALUES($1,$2,$3)').run('one', input, 239205984120);
    assert.equal(result.changes, 1);
    assert.deepEqual(await f.db.prepare('SELECT * FROM entries WHERE id=$1').get('one'), { id: 'one', value: input, n: 239205984120 });
    await assert.rejects(f.db.prepare('INSERT INTO entries VALUES($1,$2,$3)').run('one', 'x', 0), { code: '23505' });
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM entries').get())?.n, 1);
  } finally { await f.close(); }
});

test('PostgreSQL transaction rolls back changes after an awaited failure', async () => {
  const f = await postgresFixture();
  try {
    await f.db.exec('CREATE TABLE entries(id text PRIMARY KEY)');
    await assert.rejects(f.db.transaction(async () => {
      await f.db.prepare('INSERT INTO entries VALUES($1)').run('rollback');
      await new Promise(resolve => setTimeout(resolve, 5));
      throw new Error('abort');
    }), /abort/);
    assert.deepEqual(await f.db.prepare('SELECT * FROM entries').all(), []);
  } finally { await f.close(); }
});

test('Concurrent PostgreSQL transactions retain their own connection across awaits', async () => {
  const f = await postgresFixture();
  try {
    await f.db.exec('CREATE TABLE entries(id text PRIMARY KEY)');
    let ready!: () => void;
    let finish!: () => void;
    const inserted = new Promise<void>(resolve => { ready = resolve; });
    const release = new Promise<void>(resolve => { finish = resolve; });
    const first = f.db.transaction(async () => {
      await f.db.prepare('INSERT INTO entries VALUES($1)').run('first');
      ready();
      await release;
      assert.equal((await f.db.prepare('SELECT count(*) AS n FROM entries').get())?.n, 2);
    });
    await inserted;
    try {
      await f.db.transaction(async () => {
        assert.equal((await f.db.prepare('SELECT count(*) AS n FROM entries').get())?.n, 0);
        await f.db.prepare('INSERT INTO entries VALUES($1)').run('second');
      });
    } finally { finish(); }
    await first;
    assert.equal((await f.db.prepare('SELECT count(*) AS n FROM entries').get())?.n, 2);
  } finally { await f.close(); }
});

test('Nested transaction failure rolls back its savepoint and preserves outer writes', async () => {
  const f = await postgresFixture();
  try {
    await f.db.exec('CREATE TABLE entries(id text PRIMARY KEY)');
    await f.db.transaction(async () => {
      await f.db.prepare('INSERT INTO entries VALUES($1)').run('outer');
      await assert.rejects(f.db.transaction(async () => {
        await f.db.prepare('INSERT INTO entries VALUES($1)').run('inner');
        throw new Error('inner abort');
      }), /inner abort/);
      await f.db.prepare('INSERT INTO entries VALUES($1)').run('after');
    });
    assert.deepEqual(await f.db.prepare('SELECT id FROM entries ORDER BY id').all(), [{ id: 'after' }, { id: 'outer' }]);
  } finally { await f.close(); }
});

test('Migration rerun is idempotent and changed migration text is rejected', async () => {
  const f = await postgresFixture();
  try {
    const migrations = [{ id: '001-test', sql: 'CREATE TABLE entries(id text PRIMARY KEY)' }];
    await migrate(f.db, migrations);
    await f.db.prepare('INSERT INTO entries VALUES($1)').run('preserved');
    await migrate(f.db, migrations);
    assert.deepEqual(await f.db.prepare('SELECT * FROM entries').all(), [{ id: 'preserved' }]);
    await assert.rejects(migrate(f.db, [{ id: '001-test', sql: 'DROP TABLE entries' }]), /checksum/i);
    assert.deepEqual(await f.db.prepare('SELECT * FROM entries').all(), [{ id: 'preserved' }]);
  } finally { await f.close(); }
});

test('Unsafe PostgreSQL schema names are rejected before connecting', () => {
  assert.throws(() => new PgDatabase('postgresql://localhost/wvn', { schema: 'public; DROP SCHEMA public' }), /schema/i);
});
