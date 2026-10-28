import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresFixture } from './helpers/postgres.ts';
import { registrationFixture } from './helpers/webauthn.ts';
import { createAccountService } from '../src/accounts/service.server.ts';
import { migrate } from '../src/database/migrations.ts';
import { accountMigrations } from '../src/database/accounts.ts';

async function fixture() {
  const pg = await postgresFixture();
  mkdirSync(join(process.cwd(), 'state'), { recursive: true });
  const root = mkdtempSync(join(process.cwd(), 'state', 'wvn-pg-accounts-'));
  const config = {
    origin: 'https://accounts.wg.test', database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: pg.schema,
    secret: 'synthetic-postgres-secret-that-is-at-least-48-characters-long',
    deletionLedger: join(root, 'deletions.jsonl'), blobRoot: join(root, 'blobs'),
    catalog: [{ id: 'v4', title: 'Story', url: '/4/', versions: [{ id: 'version-a', title: 'Original', number: 1, engine: 'ONS', url: '/4/1/' }] }],
  };
  return { pg, root, config, async close() { await pg.close(); rmSync(root, { recursive: true, force: true }); } };
}

test('PostgreSQL Passkey accounts keep IDs and sessions across service restarts and migration reruns', async () => {
  const f = await fixture();
  let service: Awaited<ReturnType<typeof createAccountService>> | undefined;
  try {
    service = await createAccountService(f.config);
    const opts = await service.app.request(f.config.origin + '/api/auth/passkey/generate-register-options?context=' + encodeURIComponent(JSON.stringify({ nickname: 'Persistent Reader' })));
    assert.equal(opts.status, 200);
    const data = await opts.json();
    const registration = await service.app.request(f.config.origin + '/api/auth/passkey/verify-registration', {
      method: 'POST', headers: { origin: f.config.origin, 'content-type': 'application/json', cookie: opts.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') },
      body: JSON.stringify({ response: registrationFixture(data.challenge, f.config.origin, true), createSession: true }),
    });
    assert.equal(registration.status, 200);
    const cookie = registration.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const initial = await service.app.request(f.config.origin + '/api/me', { headers: { cookie } });
    assert.equal(initial.status, 200);
    const first = await initial.json();
    await service.close();
    service = await createAccountService(f.config);
    await migrate(service.db, accountMigrations);
    const again = await service.app.request(f.config.origin + '/api/me', { headers: { cookie } });
    assert.equal(again.status, 200);
    const me = await again.json();
    assert.equal(me.user.id, first.user.id);
    assert.equal(me.user.name, 'Persistent Reader');
    assert.equal((await service.db.prepare('SELECT count(*) AS n FROM "user"').get())?.n, 1);
    assert.ok((await service.db.prepare('SELECT "createdAt" FROM session').get())?.createdAt instanceof Date);
  } finally { await service?.close(); await f.close(); }
});

test('PostgreSQL private save commits preserve concurrent conflicts and do not expose another owner', async () => {
  const f = await fixture();
  let service: Awaited<ReturnType<typeof createAccountService>> | undefined;
  try {
    service = await createAccountService(f.config);
    const user = await (await service.auth.$context).internalAdapter.createUser({ name: 'Alice', email: 'alice@example.invalid', emailVerified: false }, { method: 'passkey' });
    const saves = service.saves!;
    const profile = await saves.createProfile(user.id, 'version-a');
    const files = [{ name: 'slot.dat', bytes: 5, sha256: createHash('sha256').update('hello').digest('hex') }];
    const one = await saves.reserve(user.id, profile.id, { expectedHead: null, generation: 1, captureId: 'one', files });
    const two = await saves.reserve(user.id, profile.id, { expectedHead: null, generation: 1, captureId: 'two', files });
    await saves.write(user.id, one.id, one.files[0].id, new Blob(['hello']).stream());
    await saves.write(user.id, two.id, two.files[0].id, new Blob(['hello']).stream());
    const results = await Promise.all([saves.commit(user.id, one.id), saves.commit(user.id, two.id)]);
    assert.equal(results.filter(r => r.conflict).length, 1);
    assert.notEqual(results[0].revision.id, results[1].revision.id);
    assert.equal((await saves.read(user.id, profile.id, results[0].revision.id, 'slot.dat')).toString(), 'hello');
    await assert.rejects(saves.read('other-owner', profile.id, results[0].revision.id, 'slot.dat'));
    assert.equal((await saves.commit(user.id, one.id)).revision.id, results[0].revision.id);
  } finally { await service?.close(); await f.close(); }
});
