import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { createClient } from 'redis';
import WebSocket from 'ws';
import { postgresFixture } from './helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { mountRooms, roomMigrations } from '../src/rooms/index.ts';

async function fixture() {
  const pg = await postgresFixture();
  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', () => {});
  await redis.connect();
  await migrate(pg.db, roomMigrations);
  const revoked = new Set<string>();
  const prefix = 'rooms-test:' + randomUUID() + ':';
  const apps = [new Hono(), new Hono()];
  const services = apps.map(app => mountRooms(app, {
    db: pg.db, redis, origin: 'http://rooms.test', redisPrefix: prefix,
    authenticate: async (c: any) => {
      const userId = c.req.header('x-test-user');
      return userId ? { userId, sessionId: 's-' + userId, displayName: userId } : null;
    },
    isSessionActive: async (actor: any) => !revoked.has(actor.sessionId),
    isPublishedVersion: async (id: string) => id === 'published',
    turnUrls: ['turn:127.0.0.1:28440?transport=udp'], turnSecret: 'test-secret-only',
    webTransportUrl: 'https://127.0.0.1:28443/rooms', sessionCheckMs: 50,
  }));
  const servers = apps.map(app => createServer(getRequestListener(app.fetch)));
  services.forEach((s, i) => s.attachWebSocket(servers[i]));
  for (const server of servers) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  async function request(path: string, user = 'owner', body?: unknown, instance = 0, method = 'POST') {
    return apps[instance].request('/api/rooms' + path, {
      method, headers: { Origin: 'http://rooms.test', 'x-test-user': user, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function connect(ticket: string, instance = 0, origin = 'http://rooms.test') {
    const port = (servers[instance].address() as any).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/rooms/ws`, { origin });
    const frames: any[] = [];
    ws.on('message', data => frames.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ type: 'auth', ticket, after: 0 }));
    return { ws, frames, async wait(type: string) {
      for (let i = 0; i < 150; i++) {
        const frame = frames.find(f => f.type === type);
        if (frame) return frame;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail('Missing frame ' + type + ': ' + JSON.stringify(frames));
    } };
  }
  return { ...pg, redis, request, connect, revoked, services, async cleanup() {
    await Promise.all(services.map(s => s.close()));
    await Promise.all(servers.map(s => new Promise<void>(resolve => s.close(() => resolve()))));
    const keys = await redis.keys(prefix + '*');
    if (keys.length) await redis.del(keys);
    await redis.quit(); await pg.close();
  } };
}

test('rooms use PostgreSQL membership, owner authority, atomic capacity and private directed signals across instances', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('', '', { versionId: 'published' })).status, 401);
    assert.equal((await f.request('', 'owner', { versionId: 'hidden' })).status, 404);
    const created = await f.request('', 'owner', { versionId: 'published' });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal((await f.request('/' + id, 'outsider', undefined, 1, 'GET')).status, 403);
    const joined = await Promise.all(Array.from({ length: 10 }, (_, i) => f.request('/' + id + '/join', 'u' + i, {}, i % 2)));
    assert.equal(joined.filter(r => r.status === 200).length, 7);
    assert.equal(joined.filter(r => r.status === 409).length, 3);
    const member = 'u' + joined.findIndex(r => r.status === 200);
    assert.equal((await f.request('/' + id + '/events', member, { id: randomUUID(), kind: 'state', data: { chapter: 4 } })).status, 403);
    const event = { id: randomUUID(), kind: 'state', data: { chapter: 3 } };
    const first = await f.request('/' + id + '/events', 'owner', event);
    assert.equal(first.status, 200);
    const saved = await first.json();
    assert.deepEqual(await (await f.request('/' + id + '/events', 'owner', event, 1)).json(), saved);
    assert.equal((await f.request('/' + id + '/events', 'owner', { ...event, data: { chapter: 7 } }, 1)).status, 409);
    assert.equal((await f.request('/' + id + '/events', member, { id: randomUUID(), kind: 'offer', target: 'outsider', data: { sdp: 'x' } })).status, 403);
    const signal = { id: randomUUID(), kind: 'offer', target: member, data: { type: 'offer', sdp: 'private' } };
    assert.equal((await f.request('/' + id + '/events', 'owner', signal)).status, 200);
    const other = 'u' + joined.findIndex((r, i) => r.status === 200 && 'u' + i !== member);
    const view = await (await f.request('/' + id + '/sync?after=0', other, undefined, 1, 'GET')).json();
    assert.equal(view.events.some((e: any) => e.kind === 'offer'), false);
    assert.equal(view.snapshot.members.length, 8);
    assert.deepEqual(view.snapshot.state, { chapter: 3 });
    assert.equal((await f.request('/' + id + '/kick', member, { userId: 'owner' })).status, 403);
    assert.equal((await f.request('/' + id + '/kick', 'owner', { userId: member })).status, 200);
    assert.equal((await f.request('/' + id + '/join', member, {})).status, 403);
    assert.equal((await f.request('/' + id + '/events', member, { id: randomUUID(), kind: 'ice', target: 'owner', data: {} })).status, 403);
    assert.equal((await f.request('/' + id + '/close', member, {})).status, 403);
    assert.equal((await f.request('/' + id + '/close', 'owner', {})).status, 200);
    assert.equal((await f.request('/' + id + '/join', 'last', {})).status, 410);
  } finally { await f.cleanup(); }
});

test('room tickets are single use, session revocation stops sockets, reconnect replays persisted sequence and TURN uses expiring HMAC', async () => {
  const f = await fixture();
  try {
    const created = await f.request('', 'owner', { versionId: 'published' });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    await f.request('/' + id + '/join', 'member', {});
    assert.equal((await f.request('/' + id + '/ticket', 'outsider', {})).status, 403);
    const ticket = await (await f.request('/' + id + '/ticket', 'member', {})).json();
    const a = await f.connect(ticket.ticket);
    await a.wait('ready');
    const b = await f.connect(ticket.ticket, 1);
    assert.equal((await b.wait('error')).code, 'unauthorized');
    const sent = await (await f.request('/' + id + '/events', 'owner', { id: randomUUID(), kind: 'state', data: { chapter: 6 } }, 1)).json();
    const event = await a.wait('event');
    assert.equal(event.event.seq, sent.seq);
    const sync = await (await f.request('/' + id + '/sync?after=' + (sent.seq - 1), 'member', undefined, 1, 'GET')).json();
    assert.equal(sync.events.at(-1).seq, sent.seq);
    const turn = await (await f.request('/' + id + '/turn', 'member', {})).json();
    assert.ok(Number(turn.username.split(':')[0]) <= Math.floor(Date.now() / 1000) + 600);
    assert.equal(turn.credential, createHmac('sha1', 'test-secret-only').update(turn.username).digest('base64'));
    assert.equal('secret' in turn, false);
    assert.equal((await f.request('/' + id + '/turn', 'outsider', {})).status, 403);
    f.revoked.add('s-member');
    await new Promise<void>(resolve => a.ws.readyState === WebSocket.CLOSED ? resolve() : a.ws.once('close', () => resolve()));
    assert.equal((await f.request('/' + id + '/ticket', 'member', {})).status, 401);
    a.ws.terminate(); b.ws.terminate();
  } finally { await f.cleanup(); }
});

test('room HTTP/WS origin, session, frame and Redis failure boundaries reject without creating authority', async () => {
  const f = await fixture();
  try {
    const created = await f.request('', 'owner', { versionId: 'published' });
    assert.equal(created.status, 201); const { id } = await created.json();
    const ticket = await (await f.request('/' + id + '/ticket', 'owner', {})).json();
    await assert.rejects(f.connect(ticket.ticket, 0, 'http://attacker.test'));
    const a = await f.connect(ticket.ticket); await a.wait('ready');
    const closed = new Promise<number>(resolve => a.ws.once('close', code => resolve(code)));
    a.ws.send('x'.repeat(16_385));
    assert.equal(await closed, 1009);
    const revokedTicket = await (await f.request('/' + id + '/ticket', 'owner', {})).json();
    f.revoked.add('s-owner');
    const b = await f.connect(revokedTicket.ticket, 1);
    assert.equal((await b.wait('error')).code, 'unauthorized'); b.ws.terminate();
    f.revoked.delete('s-owner');
    f.redis.destroy();
    assert.equal((await f.request('/' + id + '/ticket', 'owner', {})).status, 503);
    assert.equal((await f.request('/' + id + '/events', 'owner', { id: randomUUID(), kind: 'state', data: { injected: true } })).status, 503);
    await f.redis.connect();
    const snapshot = await (await f.request('/' + id, 'owner', undefined, 1, 'GET')).json();
    assert.deepEqual(snapshot.state, {});
  } finally {
    if (!f.redis.isOpen) await f.redis.connect();
    await f.cleanup();
  }
});
