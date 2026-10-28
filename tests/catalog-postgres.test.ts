import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { catalogMigrations } from '../src/database/catalog.ts';
import { Store, Conflict } from '../src/server/store.ts';

const seed = { snapshotAt: '2026-10-29T00:00:00Z', works: [
  { id: 'v4', title: 'CLANNAD', originalTitle: 'CLANNAD', aliases: ['团子'], evidence: 'https://vndb.org/v4' },
  { id: 'v27448', title: 'ATRI', originalTitle: 'ATRI', aliases: [], evidence: 'https://vndb.org/v27448' },
], versions: [{ id: 'original-version', workId: 'v4', number: 1, title: '原版', legacyPath: '/clannad/', engine: 'ONS' }] };

test('PostgreSQL catalog keeps IDs, legacy aliases and version tombstones across concurrent requests', async () => {
  const f = await postgresFixture();
  try {
    await migrate(f.db, catalogMigrations);
    const a = new Store(f.db), b = new Store(f.db);
    await a.seed(seed);
    await a.seed(seed);
    const versions = await Promise.all([
      a.addVersion('v4', { title: 'Second', legacyPath: '/second/', engine: 'ONS' }),
      b.addVersion('v4', { title: 'Third', legacyPath: '/third/', engine: 'ONS' }),
    ]);
    assert.deepEqual(versions.map(v => v.number).sort(), [2, 3]);
    await a.editVersion(versions[0].id, versions[0].revision, { status: 'deleted' });
    assert.equal((await a.addVersion('v4', { title: 'Fourth', legacyPath: '/fourth/', engine: 'ONS' })).number, 4);
    await a.reassignVersion('original-version', 'v27448', 1);
    assert.equal((await a.resolveLegacy('/clannad/'))?.workId, 'v27448');
    assert.equal((await a.resolveRoute('4', '1'))?.id, 'original-version');
  } finally { await f.close(); }
});

test('PostgreSQL catalog revision conflicts do not overwrite a committed change', async () => {
  const f = await postgresFixture();
  try {
    await migrate(f.db, catalogMigrations);
    const store = new Store(f.db);
    await store.seed(seed);
    const old = (await store.get('v4'))!;
    await store.editWork('v4', old.revision, { title: '团子大家族' });
    await assert.rejects(store.editWork('v4', old.revision, { title: 'stale' }), Conflict);
    assert.equal((await store.get('v4'))?.title, '团子大家族');
  } finally { await f.close(); }
});
