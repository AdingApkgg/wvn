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

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// 精确停在外部异步边界：即便底层在取消后仍完成，也不能重开传输。
test('close during a pending ticket aborts the attempt and never opens a transport', async () => {
  const originalFetch = globalThis.fetch, originalWS = globalThis.WebSocket;
  const ticket = deferred<void>(), entered = deferred<void>();
  let sockets = 0, requests = 0, signal: AbortSignal | null | undefined, connected = 0;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    requests++; signal = init?.signal; entered.resolve();
    await ticket.promise;
    return Response.json({ ticket: 'unused', websocketPath: '/api/rooms/ws' });
  }) as typeof fetch;
  globalThis.WebSocket = class extends EventTarget {
    static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { super(); sockets++; }
    close() { this.readyState = 3; }
  } as any;
  const client = new RoomClient({ roomId: 'cancel-ticket', baseUrl: 'http://sdk.test', preferWebTransport: false, transportTimeoutMs: 25 });
  client.addEventListener('connected', () => { connected++; });
  try {
    const outcome = client.connect().then(() => null, error => error);
    await entered.promise;
    client.close();
    ticket.resolve();
    const error = await outcome;
    assert.equal(sockets, 0, 'closed ticket attempt must not construct WebSocket');
    assert.equal(requests, 1, 'closed attempt must not fetch another ticket');
    assert.equal(connected, 0);
    assert.equal(signal?.aborted, true, 'ticket fetch must receive the aborted attempt signal');
    assert.equal(error?.name, 'AbortError');
    assert.equal(client.transport, null);
  } finally { client.close(); globalThis.fetch = originalFetch; globalThis.WebSocket = originalWS; }
});

test('close during a pending WebTransport handshake cancels without fallback or reconnect', async () => {
  const originalFetch = globalThis.fetch, originalWS = globalThis.WebSocket, originalWT = (globalThis as any).WebTransport;
  const ready = deferred<void>(), closed = deferred<void>(), entered = deferred<void>();
  let sockets = 0, requests = 0, fallbacks = 0, connected = 0, wtClosed = 0;
  globalThis.fetch = (async () => {
    requests++;
    return Response.json({ ticket: 'unused', websocketPath: '/api/rooms/ws', webTransportUrl: 'https://sdk.test/rooms' });
  }) as typeof fetch;
  globalThis.WebSocket = class extends EventTarget {
    static OPEN = 1; readyState = 0; bufferedAmount = 0;
    constructor() { super(); sockets++; }
    close() { this.readyState = 3; }
  } as any;
  (globalThis as any).WebTransport = class {
    ready = ready.promise; closed = closed.promise;
    constructor() { entered.resolve(); }
    close() { wtClosed++; closed.resolve(); }
  };
  const client = new RoomClient({ roomId: 'cancel-wt', baseUrl: 'http://sdk.test', transportTimeoutMs: 25 });
  client.addEventListener('fallback', () => { fallbacks++; });
  client.addEventListener('connected', () => { connected++; });
  try {
    const outcome = client.connect().then(() => null, error => error);
    await entered.promise;
    client.close();
    ready.reject(new Error('late QUIC failure after close'));
    const error = await outcome;
    assert.equal(sockets, 0, 'cancelled WT attempt must not open fallback WS');
    assert.equal(requests, 1, 'cancelled WT attempt must not request fallback/reconnect tickets');
    assert.equal(fallbacks, 0);
    assert.equal(connected, 0);
    assert.equal(wtClosed, 1);
    assert.equal(error?.name, 'AbortError');
    assert.equal(client.transport, null);
    assert.equal((client as any).retryTimer, undefined, 'close must not schedule a reconnect');
  } finally {
    client.close(); globalThis.fetch = originalFetch; globalThis.WebSocket = originalWS; (globalThis as any).WebTransport = originalWT;
  }
});

function controlledWebTransport() {
  const instances: ControlledWT[] = [];
  class ControlledWT {
    ready = Promise.resolve();
    private finished = deferred<void>();
    closed = this.finished.promise;
    private stopped = false;
    sent: any[] = [];
    private streamController!: ReadableStreamDefaultController<Uint8Array>;
    private datagramController!: ReadableStreamDefaultController<Uint8Array>;
    private readable = new ReadableStream<Uint8Array>({ start: controller => { this.streamController = controller; } });
    datagrams = {
      readable: new ReadableStream<Uint8Array>({ start: controller => { this.datagramController = controller; } }),
      writable: new WritableStream<Uint8Array>(),
    };
    constructor() { instances.push(this); }
    async createBidirectionalStream() {
      return { readable: this.readable, writable: new WritableStream<Uint8Array>({ write: bytes => {
        const input = JSON.parse(new TextDecoder().decode(bytes)); this.sent.push(input);
        if (input.type === 'auth') this.frame({ type: 'ready', userId: 'owner', snapshot: { id: 'terminal', ownerUserId: 'owner', versionId: 'published', status: 'open', seq: 0, state: {}, stateSeq: 0, members: [] }, events: [], cursor: 0, head: 0 });
        else if (input.type === 'event') this.frame({ type: 'ack', id: input.event.id, event: { ...input.event, seq: this.sent.length, actor: 'owner' } });
      } }) };
    }
    frame(value: unknown) { this.streamController.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); }
    fail() { this.finished.reject(new Error('temporary QUIC network failure')); }
    close() {
      if (this.stopped) return;
      this.stopped = true; this.streamController.close(); this.datagramController.close(); this.finished.resolve();
    }
  }
  return { WT: ControlledWT, instances };
}

// 手动推进SDK定时器，无真实等待；每步检查异步fetch/握手处理完后是否又排入重试。
function manualSdkTimers() {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const scheduled = new Map<number, () => void>();
  let next = 0;
  globalThis.setTimeout = ((callback: () => void) => { scheduled.set(++next, callback); return next; }) as any;
  globalThis.clearTimeout = ((id: number) => scheduled.delete(id)) as any;
  return { scheduled, async advance() {
    const callbacks = [...scheduled.values()]; scheduled.clear();
    for (const callback of callbacks) callback();
    await new Promise<void>(resolve => setImmediate(resolve));
  }, restore() { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; } };
}

test('WebTransport authorization/member termination closes peers without requesting more tickets', async () => {
  for (const code of ['unauthorized', 'not_a_member', 'room_closed']) {
    const originalFetch = globalThis.fetch, originalWT = (globalThis as any).WebTransport;
    const transport = controlledWebTransport(), timers = manualSdkTimers();
    let requests = 0, peerClosed = 0;
    globalThis.fetch = (async () => { requests++; return Response.json({ ticket: 'unused', webTransportUrl: 'https://sdk.test/rooms' }); }) as typeof fetch;
    (globalThis as any).WebTransport = transport.WT;
    const client = new RoomClient({ roomId: 'terminal', baseUrl: 'https://sdk.test' });
    try {
      await client.connect();
      client.peers.set('member', { pc: { close: () => { peerClosed++; } } as any, channel: null });
      transport.instances[0].frame({ type: 'error', code });
      await new Promise<void>(resolve => setImmediate(resolve));
      for (let step = 0; step < 3; step++) await timers.advance();
      assert.equal(requests, 1, code + ': terminal room error must not fetch reconnect tickets');
      assert.equal(timers.scheduled.size, 0);
      assert.equal(peerClosed, 1);
      assert.equal(client.peers.size, 0);
      assert.equal(client.transport, null);
    } finally { client.close(); timers.restore(); globalThis.fetch = originalFetch; (globalThis as any).WebTransport = originalWT; }
  }
});

test('HTTP 401/403/410 during automatic reconnect stops further attempts and closes peers', async () => {
  for (const status of [401, 403, 410]) {
    const originalFetch = globalThis.fetch, originalWT = (globalThis as any).WebTransport;
    const transport = controlledWebTransport(), timers = manualSdkTimers();
    let requests = 0, peerClosed = 0;
    globalThis.fetch = (async () => {
      requests++;
      return requests === 1 ? Response.json({ ticket: 'unused', webTransportUrl: 'https://sdk.test/rooms' }) : Response.json({ error: 'revoked_or_removed' }, { status });
    }) as typeof fetch;
    (globalThis as any).WebTransport = transport.WT;
    const client = new RoomClient({ roomId: 'terminal', baseUrl: 'https://sdk.test' });
    try {
      await client.connect();
      client.peers.set('member', { pc: { close: () => { peerClosed++; } } as any, channel: null });
      transport.instances[0].fail();
      await new Promise<void>(resolve => setImmediate(resolve));
      for (let step = 0; step < 4; step++) await timers.advance();
      assert.equal(requests, 2, status + ': only the first legitimate network reconnect may request a ticket');
      assert.equal(timers.scheduled.size, 0);
      assert.equal(peerClosed, 1);
      assert.equal(client.peers.size, 0);
      assert.equal(client.transport, null);
    } finally { client.close(); timers.restore(); globalThis.fetch = originalFetch; (globalThis as any).WebTransport = originalWT; }
  }
});

test('temporary WebTransport network failure still reconnects successfully', async () => {
  const originalFetch = globalThis.fetch, originalWT = (globalThis as any).WebTransport;
  const transport = controlledWebTransport(), timers = manualSdkTimers();
  let requests = 0, connected = 0;
  globalThis.fetch = (async () => { requests++; return Response.json({ ticket: 'unused', webTransportUrl: 'https://sdk.test/rooms' }); }) as typeof fetch;
  (globalThis as any).WebTransport = transport.WT;
  const client = new RoomClient({ roomId: 'temporary-network', baseUrl: 'https://sdk.test' });
  client.addEventListener('connected', () => { connected++; });
  try {
    await client.connect();
    transport.instances[0].fail();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(timers.scheduled.size, 1, 'temporary network loss schedules one retry');
    await timers.advance();
    assert.equal(requests, 2);
    assert.equal(connected, 2);
    assert.equal(client.transport, 'webtransport');
    assert.equal(timers.scheduled.size, 0);
    await timers.advance();
    assert.equal(requests, 2, 'successful reconnect does not leave another retry queued');
  } finally { client.close(); timers.restore(); globalThis.fetch = originalFetch; (globalThis as any).WebTransport = originalWT; }
});

test('late TURN response after close cannot construct peers or send an offer', async () => {
  const originalFetch = globalThis.fetch, originalWT = (globalThis as any).WebTransport, originalPeer = globalThis.RTCPeerConnection;
  const transport = controlledWebTransport(), turn = deferred<void>(), entered = deferred<void>();
  let created = 0, turnSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    if (String(input).endsWith('/turn')) {
      turnSignal = init?.signal; entered.resolve(); await turn.promise;
      return Response.json({ urls: ['turn:127.0.0.1:28440'], username: 'qa', credential: 'qa' });
    }
    return Response.json({ ticket: 'unused', webTransportUrl: 'https://sdk.test/rooms' });
  }) as typeof fetch;
  (globalThis as any).WebTransport = transport.WT;
  globalThis.RTCPeerConnection = class {
    localDescription: any;
    constructor() { created++; }
    createDataChannel() { return { close() {} }; }
    async createOffer() { return { type: 'offer', sdp: 'qa' }; }
    async setLocalDescription(value: any) { this.localDescription = { toJSON: () => value }; }
    close() {}
  } as any;
  const client = new RoomClient({ roomId: 'peer-cancel', baseUrl: 'https://sdk.test' });
  try {
    await client.connect();
    client.snapshot!.members.push({ userId: 'member', displayName: 'Member' });
    const outcome = client.openPeer('member').then(() => null, error => error);
    await entered.promise;
    client.close();
    turn.resolve();
    const error = await outcome;
    assert.equal(created, 0, 'late TURN must not construct RTCPeerConnection');
    assert.equal(client.peers.size, 0);
    assert.equal(turnSignal?.aborted, true);
    assert.equal(error?.name, 'AbortError');
  } finally { client.close(); globalThis.fetch = originalFetch; (globalThis as any).WebTransport = originalWT; globalThis.RTCPeerConnection = originalPeer; }
});

test('close discards queued signal work before it can request TURN or create a peer', async () => {
  const originalFetch = globalThis.fetch, originalWT = (globalThis as any).WebTransport;
  const transport = controlledWebTransport(), queue = deferred<void>();
  let turnRequests = 0;
  globalThis.fetch = (async (input: unknown) => {
    if (String(input).endsWith('/turn')) { turnRequests++; throw new Error('queued signal must have been discarded'); }
    return Response.json({ ticket: 'unused', webTransportUrl: 'https://sdk.test/rooms' });
  }) as typeof fetch;
  (globalThis as any).WebTransport = transport.WT;
  const client = new RoomClient({ roomId: 'queued-signal-cancel', baseUrl: 'https://sdk.test' });
  try {
    await client.connect();
    client.snapshot!.members.push({ userId: 'member', displayName: 'Member' });
    (client as any).signalChain = queue.promise;
    transport.instances[0].frame({ type: 'event', event: { seq: 1, id: 'offer', actor: 'member', kind: 'offer', target: 'owner', data: { type: 'offer', sdp: 'qa' } } });
    await new Promise<void>(resolve => setImmediate(resolve));
    const queued = (client as any).signalChain;
    client.close(); queue.resolve(); await queued;
    assert.equal(turnRequests, 0, 'closed queued signal must not request TURN');
    assert.equal(client.peers.size, 0);
  } finally { client.close(); globalThis.fetch = originalFetch; (globalThis as any).WebTransport = originalWT; }
});

test('simultaneous openPeer and incoming offer share one peer after both TURN requests finish', async () => {
  const originalFetch = globalThis.fetch, originalWT = (globalThis as any).WebTransport, originalPeer = globalThis.RTCPeerConnection;
  const transport = controlledWebTransport(), turn = deferred<void>(), entered = deferred<void>();
  let turnRequests = 0, created = 0, closed = 0;
  globalThis.fetch = (async (input: unknown) => {
    if (String(input).endsWith('/turn')) {
      if (++turnRequests === 2) entered.resolve(); await turn.promise;
      return Response.json({ urls: ['turn:127.0.0.1:28440'], username: 'qa', credential: 'qa' });
    }
    return Response.json({ ticket: 'unused', webTransportUrl: 'https://sdk.test/rooms' });
  }) as typeof fetch;
  (globalThis as any).WebTransport = transport.WT;
  globalThis.RTCPeerConnection = class {
    localDescription: any; remoteDescription: any; signalingState = 'stable';
    constructor() { created++; }
    createDataChannel() { return { close() {} }; }
    async createOffer() { return { type: 'offer', sdp: 'qa' }; }
    async createAnswer() { return { type: 'answer', sdp: 'qa' }; }
    async setLocalDescription(value: any) { this.localDescription = { toJSON: () => value }; this.signalingState = value.type === 'offer' ? 'have-local-offer' : 'stable'; }
    async setRemoteDescription(value: any) { this.remoteDescription = value; }
    close() { closed++; }
  } as any;
  const client = new RoomClient({ roomId: 'peer-concurrent', baseUrl: 'https://sdk.test' });
  try {
    await client.connect();
    client.snapshot!.members.push({ userId: 'member', displayName: 'Member' });
    const opening = client.openPeer('member').then(value => value, error => error);
    transport.instances[0].frame({ type: 'event', event: { seq: 1, id: 'offer', actor: 'member', kind: 'offer', target: 'owner', data: { type: 'offer', sdp: 'qa' } } });
    await entered.promise;
    const queued = (client as any).signalChain;
    turn.resolve(); await Promise.all([opening, queued]);
    assert.equal(created, 1, 'concurrent peer setup must not overwrite an orphaned RTCPeerConnection');
    assert.equal(client.peers.size, 1);
    client.close(); assert.equal(closed, 1, 'close must reclaim the only constructed peer');
  } finally { client.close(); globalThis.fetch = originalFetch; (globalThis as any).WebTransport = originalWT; globalThis.RTCPeerConnection = originalPeer; }
});
