import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { postgresFixture } from './helpers/postgres.ts';
import { createAccountService } from '../src/accounts/service.server.ts';
import { createPublicApp } from '../src/server/http.ts';
import { Store } from '../src/server/store.ts';
import { mountPublicPlatform } from '../src/platform/public.server.ts';
import { mountAccountRooms } from '../src/platform/rooms.server.ts';
import { registrationFixture } from './helpers/webauthn.ts';
import { deleteAccountRows } from '../src/accounts/deletion.server.ts';

test('public platform resolves opaque keys to the configured CDN and exposes search failure explicitly', async () => {
  const pg = await postgresFixture();
  const store = new Store(pg.db);
  const publicApi = new Hono();
  let platform: Awaited<ReturnType<typeof mountPublicPlatform>> | undefined;
  try {
    platform = await mountPublicPlatform(publicApi, store, {});
    // createPublicApp captures routes when mounting a sub-app, so construct it after module setup.
    const listener = createPublicApp(store, 'fixtures/resources', undefined, publicApi);
    const key = randomUUID(), digest = 'a'.repeat(64);
    await pg.db.prepare(`INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,source_sha256,published) VALUES('integration',$1,$2,true)`)
      .run('b'.repeat(64), 'c'.repeat(64));
    await pg.db.prepare('INSERT INTO wvn_resource_objects(sha256,bytes) VALUES($1,5)').run(digest);
    await pg.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1) VALUES($1,'integration','原名.png',$2,'image/png','source','target','dddddddddddddddddddddddddddddddddddddddd')`).run(key, digest);
    const resource = await listener.request('/api/resources/' + key);
    assert.equal(resource.status, 200);
    assert.deepEqual(await resource.json(), { key, sha256: digest, bytes: 5, contentType: 'image/png', url: `https://wg-b2.saop.cc/${digest}.bin` });
    assert.equal((await listener.request('/api/search?q=story')).status, 503);
    const sdk = await listener.request('/player/room-client.mjs');
    assert.equal(sdk.status, 200);
    assert.match(sdk.headers.get('content-type')!, /javascript/);
    assert.match(await sdk.text(), /export class RoomClient/);
  } finally { await platform?.close(); await pg.close(); }
});

test('room integration authenticates actual Passkey sessions and invalidates an account generation', async () => {
  const pg = await postgresFixture();
  const store = new Store(pg.db);
  const origin = 'https://accounts.wg.test';
  mkdirSync(join(process.cwd(), 'state'), { recursive: true });
  const root = mkdtempSync(join(process.cwd(), 'state', 'wvn-platform-'));
  const service = await createAccountService({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: pg.schema,
    origin, secret: 'synthetic-platform-integration-secret-with-at-least-48-characters', blobRoot: join(root, 'blobs'),
    catalogProvider: async () => (await store.list()).filter(work => work.versions.length).map(work => ({ id: work.id, title: work.title, url: work.url, versions: work.versions })) });
  let rooms: Awaited<ReturnType<typeof mountAccountRooms>> | undefined;
  try {
    await store.ready;
    await store.createWork({ id: 'v4', title: 'Story', originalTitle: 'Story', aliases: [], evidence: 'https://vndb.org/v4' });
    const version = await store.addVersion('v4', { title: 'Build', legacyPath: '/story/', engine: 'ONS' });
    rooms = await mountAccountRooms(service, store, { WG_ROOMS_ENABLED: '1', REDIS_URL: process.env.REDIS_URL });
    assert.ok(rooms);
    const options = await service.app.request(origin + '/api/auth/passkey/generate-register-options?context=' + encodeURIComponent(JSON.stringify({ nickname: 'Room Reader' })));
    const data = await options.json();
    const registration = await service.app.request(origin + '/api/auth/passkey/verify-registration', { method: 'POST',
      headers: { origin, 'content-type': 'application/json', cookie: options.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') },
      body: JSON.stringify({ response: registrationFixture(data.challenge, origin, true), createSession: true }) });
    assert.equal(registration.status, 200);
    const cookie = registration.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const me = await (await service.app.request(origin + '/api/me', { headers: { cookie } })).json();
    const headers = { origin, cookie, 'content-type': 'application/json', 'x-wg-binding': me.binding };
    const catalogResponse = await service.app.request(origin + '/api/account-catalog');
    assert.equal((await catalogResponse.json())[0]?.versions[0]?.id, version.id, 'account catalog reads versions created in PG after service startup');
    assert.equal((await service.app.request(origin + '/api/me/play-sessions', { method: 'POST', headers, body: JSON.stringify({ versionId: version.id, eventId: 'new-pg-version' }) })).status, 200);
    assert.equal((await service.app.request(origin + '/api/me/save-profiles', { method: 'POST', headers, body: JSON.stringify({ versionId: version.id }) })).status, 201);
    const oldWork = (await store.get('v4'))!;
    await store.editWork('v4', oldWork.revision, { title: 'Changed in PG' });
    assert.equal((await (await service.app.request(origin + '/api/account-catalog')).json())[0].title, 'Changed in PG');
    const hidden = await store.addVersion('v4', { title: 'Hidden Build', legacyPath: '/hidden-build/', engine: 'ONS' });
    await store.editVersion(hidden.id, hidden.revision, { status: 'hidden' });
    assert.equal((await service.app.request(origin + '/api/me/play-sessions', { method: 'POST', headers, body: JSON.stringify({ versionId: hidden.id, eventId: 'hidden-pg-version' }) })).status, 404);

    assert.equal((await service.app.request(origin + '/api/rooms', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ versionId: version.id }) })).status, 401);
    const created = await service.app.request(origin + '/api/rooms', { method: 'POST', headers, body: JSON.stringify({ versionId: version.id }) });
    assert.equal(created.status, 201);
    const room = await created.json();
    const ticketResponse = await service.app.request(origin + '/api/rooms/' + room.id + '/ticket', { method: 'POST', headers, body: '{}' });
    assert.equal(ticketResponse.status, 200);
    assert.equal((await service.app.request(origin + '/api/rooms/' + room.id + '/turn', { method: 'POST', headers, body: '{}' })).status, 503);
    const session = await service.db.prepare('SELECT id FROM session WHERE "userId"=$1').get(me.user.id);
    const actor = { userId: me.user.id, sessionId: session!.id, displayName: me.user.name, authVersion: 0 };
    assert.equal(await rooms.isSessionActive(actor), true);
    await service.db.prepare('UPDATE wg_account SET auth_version=auth_version+1 WHERE user_id=$1').run(me.user.id);
    assert.equal(await rooms.isSessionActive(actor), false);
    const other = await (await service.auth.$context).internalAdapter.createUser({ name: 'Other Reader', email: 'other-reader@example.invalid', emailVerified: false }, { method: 'passkey' });
    const otherActor = { userId: other.id, sessionId: 'test-other-session', displayName: other.name };
    await rooms.store.join(room.id, otherActor);
    await rooms.store.send(room.id, actor, { id: 'same-message', kind: 'offer', target: other.id, data: { sdp: 'synthetic-a' } });
    await rooms.store.send(room.id, otherActor, { id: 'same-message', kind: 'answer', target: me.user.id, data: { sdp: 'synthetic-b' } });
    const otherRoom = await rooms.store.create(otherActor, version.id);
    await rooms.store.join(otherRoom.id, actor);
    const held = await pg.db.pool.connect();
    try {
      await held.query('BEGIN');
      await held.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [otherRoom.id]);
      await assert.rejects(service.db.transaction(async () => {
        await service.db.exec("SET LOCAL lock_timeout='100ms'");
        await deleteAccountRows(service.db, service.saves, me.user.id, Date.now());
      }), { code: '55P03' }, 'deleting a member locks the same room row as a concurrent WS sender');
    } finally { await held.query('ROLLBACK'); held.release(); }
    const updated = await (await service.app.request(origin + '/api/me', { headers: { cookie } })).json();
    const deleted = await service.app.request(origin + '/api/me', { method: 'DELETE', headers: { ...headers, 'x-wg-binding': updated.binding }, body: JSON.stringify({ confirmation: 'DELETE' }) });
    assert.equal(deleted.status, 200);
    assert.equal((await service.db.prepare('SELECT status FROM rooms WHERE id=$1').get(room.id))?.status, 'closed');
    assert.equal((await service.db.prepare('SELECT count(*) AS n FROM room_members WHERE user_id=$1').get(me.user.id))?.n, 0);
    assert.equal((await rooms.store.snapshot(otherRoom.id, otherActor)).members.some(member => member.displayName === 'Room Reader'), false);
    assert.equal(JSON.stringify(await service.db.prepare('SELECT data FROM room_events').all()).includes('Room Reader'), false);
  } finally { await rooms?.close(); await service.close(); await pg.close(); rmSync(root, { recursive: true, force: true }); }
});
