import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryStore } from '../src/accounts/library.server.ts';
import { createAccountService, testDatabase } from './helpers/accounts.ts';
import { registrationFixture } from './helpers/webauthn.ts';

const origin = 'https://accounts.wg.test';
const catalog = [{ id: 'v4', title: '安全作品', url: '/4/', versions: [
  { id: 'version-a', number: 1, title: '原版', engine: 'ONS', url: '/4/1/' },
] }];
const privateNote = '含敏感阅读细节的私人备注，公共模式下未显示。';

test('真实PG只修改阅读状态时保留已有私人备注并递增修订，旧修订不能覆盖', async () => {
  const db = await testDatabase();
  try {
    const store = new LibraryStore(db, catalog);
    await store.edit('alice', 'v4', 0, { status: 'wanted', note: privateNote });
    const updated = await store.edit('alice', 'v4', 1, { status: 'playing' });
    assert.equal(updated.status, 'playing');
    assert.equal(updated.note, privateNote);
    assert.equal(updated.revision, 2);
    assert.deepEqual(await db.prepare('SELECT status,note,revision FROM wg_library WHERE user_id=$1 AND work_id=$2').get('alice', 'v4'),
      { status: 'playing', note: privateNote, revision: 2 });
    await assert.rejects(store.edit('alice', 'v4', 1, { status: 'completed' }), { code: 'CONTENT_CONFLICT' });
    assert.equal((await store.list('alice'))[0].revision, 2);
    assert.equal((await store.list('alice'))[0].note, privateNote);
  } finally { await db.close(); }
});

test('真实PG新条目省略备注默认为空，完整PATCH仍可设置及显式清空备注，显式非法备注不写库', async () => {
  const db = await testDatabase();
  try {
    const store = new LibraryStore(db, catalog);
    const fresh = await store.edit('alice', 'v4', 0, { status: 'wanted' });
    assert.equal(fresh.note, '');
    assert.equal(fresh.revision, 1);
    const full = await store.edit('alice', 'v4', 1, { status: 'playing', note: privateNote });
    assert.equal(full.note, privateNote);
    assert.equal(full.revision, 2);
    const cleared = await store.edit('alice', 'v4', 2, { status: 'completed', note: '' });
    assert.equal(cleared.note, '');
    assert.equal(cleared.revision, 3);
    for (const note of [undefined, null, 123, false, [], {}, '长'.repeat(5001)]) {
      const patch = { status: 'paused', note } as Parameters<LibraryStore['edit']>[3];
      await assert.rejects(store.edit('alice', 'v4', 3, patch), { code: 'LIBRARY_INVALID' });
    }
    const unchanged = (await store.list('alice'))[0];
    assert.equal(unchanged.status, 'completed');
    assert.equal(unchanged.note, '');
    assert.equal(unchanged.revision, 3);
  } finally { await db.close(); }
});

async function httpFixture() {
  const service = await createAccountService({
    origin, database: ':memory:', catalog, contentGate: true,
    secret: 'synthetic-content-library-test-secret-with-at-least-48-characters',
  });
  const options = await service.app.request(origin + '/api/auth/passkey/generate-register-options?context=' +
    encodeURIComponent(JSON.stringify({ nickname: '公共书架阅读者' })));
  const challenge = await options.json();
  const registered = await service.app.request(origin + '/api/auth/passkey/verify-registration', {
    method: 'POST', headers: { origin, 'content-type': 'application/json',
      cookie: options.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') },
    body: JSON.stringify({ response: registrationFixture(challenge.challenge, origin, true), createSession: true }),
  });
  assert.equal(registered.status, 200);
  const cookie = registered.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const me = await (await service.app.request(origin + '/api/me', { headers: { cookie } })).json();
  return {
    service, userId: me.user.id as string,
    async patch(body: unknown) {
      return service.app.request(origin + '/api/me/library/v4', {
        method: 'PATCH', headers: { origin, cookie, 'x-wg-binding': me.binding, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    async mode() { return (await service.app.request(origin + '/api/me/content', { headers: { cookie } })).json(); },
  };
}

test('公共模式真实账号HTTP可只PATCH阅读状态，隐藏的既有备注原值保留且旧修订返回409', async () => {
  const f = await httpFixture();
  try {
    await f.service.library.edit(f.userId, 'v4', 0, { status: 'wanted', note: privateNote });
    assert.equal((await f.mode()).displayMode, 'public');
    const response = await f.patch({ revision: 1, status: 'playing' });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.status, 'playing');
    assert.equal(data.revision, 2);
    const saved = await f.service.db.prepare('SELECT status,note,revision FROM wg_library WHERE user_id=$1 AND work_id=$2').get(f.userId, 'v4');
    assert.deepEqual(saved, { status: 'playing', note: privateNote, revision: 2 });
    const stale = await f.patch({ revision: 1, status: 'completed' });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'CONTENT_CONFLICT');
    assert.equal((await f.service.library.list(f.userId))[0].note, privateNote);
    assert.equal((await f.service.library.list(f.userId))[0].revision, 2);
  } finally { await f.service.close(); }
});

test('真实账号HTTP兼容旧版完整PATCH和新条目默认空备注，显式空字符串可清空而非法备注返回400', async () => {
  const f = await httpFixture();
  try {
    const fresh = await f.patch({ revision: 0, status: 'wanted' });
    assert.equal(fresh.status, 200);
    assert.equal((await fresh.json()).note, '');
    const full = await f.patch({ revision: 1, status: 'playing', note: privateNote });
    assert.equal(full.status, 200);
    assert.equal((await full.json()).note, privateNote);
    for (const note of [null, 123, false, [], {}, '长'.repeat(5001)]) {
      const invalid = await f.patch({ revision: 2, status: 'paused', note });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).code, 'LIBRARY_INVALID');
    }
    assert.equal((await f.service.library.list(f.userId))[0].revision, 2);
    assert.equal((await f.service.library.list(f.userId))[0].note, privateNote);
    const cleared = await f.patch({ revision: 2, status: 'completed', note: '' });
    assert.equal(cleared.status, 200);
    const data = await cleared.json();
    assert.equal(data.note, '');
    assert.equal(data.revision, 3);
    assert.equal((await f.service.library.list(f.userId))[0].note, '');
  } finally { await f.service.close(); }
});
