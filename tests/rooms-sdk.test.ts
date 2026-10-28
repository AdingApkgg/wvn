import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { createClient } from 'redis';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { mountRooms, roomMigrations } from '../src/rooms/index.ts';
import { RoomClient } from '../public/player/room-client.mjs';

test('browser SDK uses a fresh ticket when WebTransport fails and reconnects with persisted authoritative state', async () => {
  const pg = await postgresFixture(), redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', () => {}); await redis.connect(); await migrate(pg.db, roomMigrations);
  const app = new Hono(), prefix = 'rooms-sdk:' + randomUUID() + ':';
  const origin = 'http://rooms-sdk.test';
  const service = mountRooms(app, { db: pg.db, redis, origin, redisPrefix: prefix,
    authenticate: async () => ({ userId: 'owner', sessionId: 'session', displayName: 'Owner' }),
    isSessionActive: async () => true, isPublishedVersion: async () => true,
    webTransportUrl: 'https://127.0.0.1:9/rooms' });
  const server = createServer(getRequestListener(app.fetch)); service.attachWebSocket(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = 'http://127.0.0.1:' + (server.address() as any).port;
  const originalWS = globalThis.WebSocket, originalWT = (globalThis as any).WebTransport;
  globalThis.WebSocket = class extends WebSocket { constructor(url: string) { super(url, { origin }); } } as any;
  (globalThis as any).WebTransport = class { ready = Promise.reject(new Error('QUIC unavailable')); closed = Promise.resolve(); close() {} };
  let client: RoomClient | undefined;
  try {
    const { id } = await (await fetch(baseUrl + '/api/rooms', { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: JSON.stringify({ versionId: 'published' }) })).json();
    client = new RoomClient({ roomId: id, baseUrl, headers: { Origin: origin } });
    const ready = await client.connect();
    assert.equal(client.transport, 'websocket');
    assert.equal(ready.snapshot.ownerUserId, 'owner');
    const ack = await client.publishState({ chapter: 5 });
    assert.ok(ack.seq > 0);
    client.close();
    for (let chapter = 6; chapter <= 25; chapter++) {
      const response = await fetch(baseUrl + '/api/rooms/' + id + '/events', { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), kind: 'state', data: { chapter } }) });
      assert.equal(response.status, 200);
    }
    const resumed = await client.connect();
    assert.deepEqual(resumed.snapshot.state, { chapter: 25 });
    assert.deepEqual(client.snapshot?.state, { chapter: 25 });
    assert.equal(client.sequence >= ack.seq, true);
    // 公共SDK不能主动索取音视频设备。
    const source = await readFile(new URL('../public/player/room-client.mjs', import.meta.url), 'utf8');
    assert.equal(source.includes('getUserMedia'), false);
  } finally {
    client?.close(); globalThis.WebSocket = originalWS; (globalThis as any).WebTransport = originalWT;
    await service.close(); await new Promise<void>(resolve => server.close(() => resolve()));
    const keys = await redis.keys(prefix + '*'); if (keys.length) await redis.del(keys);
    await redis.quit(); await pg.close();
  }
});
