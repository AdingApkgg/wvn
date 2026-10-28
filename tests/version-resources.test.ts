import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { postgresFixture } from './helpers/postgres.ts';
import { Store } from '../src/server/store.ts';
import { migrate } from '../src/database/migrations.ts';
import { resourceMigrations, ResourceRepository } from '../src/resources/index.ts';
import { VersionResources, createVersionResourceApp } from '../src/platform/version-resources.server.ts';

test('version resource manifests preserve relative names, scope cursors and immutable version bindings', async () => {
  const pg = await postgresFixture();
  try {
    const catalog = new Store(pg.db);
    await catalog.seed({ snapshotAt: new Date().toISOString(), works: [{ id: 'v4', title: 'Story', originalTitle: 'Story', aliases: [], evidence: 'https://vndb.org/v4' }],
      versions: [{ id: 'original-version', workId: 'v4', number: 1, title: 'Build', legacyPath: '/story/', engine: 'ONS' }] });
    await migrate(pg.db, resourceMigrations);
    const inventory = 'e'.repeat(64);
    await pg.db.prepare(`INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,published) VALUES('snapshot',$1,true)`).run(inventory);
    await pg.db.prepare('INSERT INTO wvn_resource_objects VALUES($1,5)').run('a'.repeat(64));
    const paths = ['webgal/story/数据/图 A.png', 'webgal/story/slot.bin', 'webgal/other/private.dat'];
    for (const path of paths) await pg.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1)
      VALUES($1,'snapshot',$2,$3,'image/png','source','target',$4)`).run(randomUUID(), path, 'a'.repeat(64), 'b'.repeat(40));
    const bridge = new VersionResources(catalog, new ResourceRepository(pg.db));
    await bridge.bind({ versionId: 'original-version', namespace: 'snapshot', inventorySha256: inventory, prefix: 'webgal/story/' });
    await bridge.bind({ versionId: 'original-version', namespace: 'snapshot', inventorySha256: inventory, prefix: 'webgal/story/' });
    await assert.rejects(bridge.bind({ versionId: 'original-version', namespace: 'snapshot', inventorySha256: inventory, prefix: 'webgal/other/' }), /immutable/i);
    const app = new Hono().route('/', createVersionResourceApp(bridge));
    const first = await (await app.request('/api/versions/original-version/resources?limit=1')).json();
    assert.equal(first.resources.length, 1);
    assert.ok(first.nextCursor);
    const second = await (await app.request('/api/versions/original-version/resources?limit=1&cursor=' + first.nextCursor)).json();
    assert.equal(second.nextCursor, null);
    assert.deepEqual([first.resources[0].path, second.resources[0].path].sort(), ['slot.bin', '数据/图 A.png'].sort());
    const lookup = await app.request('/api/versions/original-version/resource?path=' + encodeURIComponent('数据/图 A.png'));
    assert.equal(lookup.status, 200);
    assert.equal((await lookup.json()).url, 'https://wg-b2.saop.cc/' + 'a'.repeat(64) + '.bin');
    assert.equal((await app.request('/api/versions/original-version/resource?path=../other/private.dat')).status, 400);
    const work = (await catalog.get('v4', true))!;
    await catalog.editWork('v4', work.revision, { defaultVersionId: null });
    const version = (await catalog.raw('original-version'))!;
    await catalog.editVersion(version.id, version.revision, { status: 'hidden' });
    assert.equal((await app.request('/api/versions/original-version/resources')).status, 404);
  } finally { await pg.close(); }
});
