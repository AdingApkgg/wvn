import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { createClient } from 'redis';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { resourceMigrations, ResourceRepository, RedisResourceCache } from '../src/resources/index.ts';

async function fixture() {
  const f = await postgresFixture(); await migrate(f.db, resourceMigrations);
  const key = randomUUID(); const sha = 'a'.repeat(64);
  await f.db.prepare('INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,published) VALUES($1,$2,true)').run('cache-test', 'c'.repeat(64));
  await f.db.prepare('INSERT INTO wvn_resource_objects VALUES($1,$2)').run(sha, 11);
  await f.db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`).run(key, 'cache-test', 'image.png', sha, 'image/png', 'source', 'target', 'd'.repeat(40));
  return { ...f, key };
}

test('real Redis caches bounded-TTL metadata but requires current PostgreSQL publication and MIME validation', async () => {
  const f = await fixture(); const prefix = 'qa:resources:' + randomUUID() + ':';
  const admin = createClient({ url: process.env.REDIS_URL, socket: { reconnectStrategy: false, connectTimeout: 500 }, disableOfflineQueue: true });
  admin.on('error', () => {}); await admin.connect();
  const cache = new RedisResourceCache({ url: process.env.REDIS_URL!, prefix, ttlSeconds: 30 });
  try {
    const repo = new ResourceRepository(f.db, { cache });
    const value = await repo.findByKey(f.key);
    assert.equal(value?.contentType, 'image/png');
    const keys = await admin.keys(prefix + '*'); assert.equal(keys.length, 1);
    const ttl = await admin.ttl(keys[0]); assert.ok(ttl > 0 && ttl <= 30);
    const encoded = (await admin.get(keys[0]))!;
    assert.equal(encoded.includes('https:'), false); assert.equal(encoded.includes('source'), false);
    assert.deepEqual(await repo.findByKey(f.key), value);
    await f.db.close();
    await assert.rejects(repo.findByKey(f.key));
  } finally {
    cache.close();
    const keys = await admin.keys(prefix + '*'); if (keys.length) await admin.del(keys);
    admin.destroy(); await f.close();
  }
});

test('Redis connection failure and a stalled Redis handshake fall back to PostgreSQL within a bounded time', async () => {
  const f = await fixture(); const sockets = new Set<Socket>();
  const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  try {
    for (const url of ['redis://127.0.0.1:1', 'redis://127.0.0.1:' + port]) {
      const cache = new RedisResourceCache({ url, prefix: 'qa:' + randomUUID() + ':', timeoutMs: 100 });
      try {
        const repo = new ResourceRepository(f.db, { cache }); const start = performance.now();
        assert.equal((await repo.findByKey(f.key))?.key, f.key);
        assert.ok(performance.now() - start < 1200);
        const next = performance.now(); assert.equal((await repo.findByKey(f.key))?.key, f.key);
        assert.ok(performance.now() - next < 500);
      } finally { cache.close(); }
    }
  } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); await f.close(); }
});
