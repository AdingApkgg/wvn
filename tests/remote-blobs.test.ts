import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SaveStore } from '../src/accounts/saves.server.ts';
import { createBlobApp, RemoteBlobStore } from '../src/accounts/blob-remote.server.ts';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
test('Windows blob storage preserves exact bytes, history and reserve checks without local blob files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wg-remote-blob-')); const db = new DatabaseSync(':memory:');
  let free = 100 * 1024 ** 3;
  const app = createBlobApp({ root, token: 'k'.repeat(64), free: () => free });
  const fetcher: typeof fetch = async (input, init) => app.fetch(new Request(input, init));
  const backend = new RemoteBlobStore('http://192.0.2.20:18572', 'k'.repeat(64), fetcher);
  const saves = new SaveStore(db, join(root, 'not-created'), undefined, backend);
  try {
    const profile = saves.createProfile('alice', 'version-a');
    const file = { name: 'save.dat', bytes: 5, sha256: sha('hello') };
    const upload = await saves.reserve('alice', profile.id, { expectedHead: null, generation: 1, captureId: 'first', files: [file] });
    await saves.write('alice', upload.id, upload.files[0].id, new Blob(['hello']).stream());
    const committed = await saves.commit('alice', upload.id);
    assert.equal((await saves.read('alice', profile.id, committed.revision.id, file.name)).toString(), 'hello');
    const restored = await saves.restore('alice', profile.id, committed.revision.id, committed.revision.id, 1);
    assert.equal(restored.source, committed.revision.id); assert.equal(saves.history('alice', profile.id).length, 2);
    free = 61 * 1024 ** 3;
    await assert.rejects(() => saves.reserve('alice', profile.id, { expectedHead: restored.id, generation: 1, captureId: 'low', files: [file] }), /SPACE_STOP/);
    assert.equal((await app.request('http://localhost/space')).status, 401);
    assert.equal((await app.request('http://localhost/blobs/' + sha('alice') + '/' + file.sha256, { method: 'PUT', headers: { Authorization: 'Bearer ' + 'k'.repeat(64) }, body: 'wrong' })).status, 507);
    const broken = new RemoteBlobStore('http://192.0.2.20:18572', 'k'.repeat(64), async () => { throw Error('offline'); });
    await assert.rejects(() => broken.free(), /STORAGE_UNAVAILABLE/);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
test('private blob service rejects traversal, bad hashes and other credentials', async () => {
 const root = mkdtempSync(join(tmpdir(), 'wg-remote-blob-'));
 try {
  const app = createBlobApp({ root, token: 'k'.repeat(64), free: () => 100 * 1024 ** 3 });
  const headers = { Authorization: 'Bearer ' + 'k'.repeat(64) };
  assert.equal((await app.request('http://localhost/blobs/' + sha('alice') + '/' + sha('hello'), { method: 'PUT', headers, body: 'wrong' })).status, 400);
  assert.equal((await app.request('http://localhost/blobs/invalid/' + sha('hello'), { method: 'PUT', headers, body: 'hello' })).status, 404);
  assert.equal((await app.request('http://localhost/space', { headers: { Authorization: 'Bearer ' + 'z'.repeat(64) } })).status, 401);
 } finally { rmSync(root, { recursive: true, force: true }); }
});
