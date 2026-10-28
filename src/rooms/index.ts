import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomError, RoomStore, identifier, type RoomActor } from './store.ts';
import type { PgDatabase } from '../database/postgres.ts';
export { roomMigrations } from './migrations.ts';
export { RoomStore, RoomError, type RoomActor } from './store.ts';

export type RoomRedis = {
  sendCommand(args: string[]): Promise<unknown>;
  duplicate?: () => { connect(): Promise<unknown>; subscribe(channel: string, callback: (message: string) => void): Promise<unknown>; quit(): Promise<unknown>; on(event: string, callback: (...args: any[]) => void): unknown };
};
export type RoomsOptions = {
  db: PgDatabase; redis: RoomRedis; origin: string;
  authenticate(c: Context): Promise<RoomActor | null>;
  isSessionActive(actor: RoomActor): Promise<boolean>;
  isPublishedVersion(id: string): Promise<boolean>;
  redisPrefix?: string; turnUrls?: string[]; turnSecret?: string; webTransportUrl?: string;
  sessionCheckMs?: number;
};
const MAX_FRAME = 16_384;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const RATE_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n`;
const PRESENCE_SCRIPT = `redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); redis.call('ZADD',KEYS[1],ARGV[2],ARGV[3]); redis.call('PEXPIRE',KEYS[1],30000); return redis.call('ZCARD',KEYS[1])`;

/** REST 与 WS 共用权威仓储；WT 网关也复用此 WS 协议。 */
export function mountRooms(app: Hono, options: RoomsOptions) {
  const origin = new URL(options.origin).origin;
  if (origin !== options.origin) throw new Error('Rooms origin must be an exact origin');
  const prefix = options.redisPrefix ?? 'wvn:rooms:';
  const store = new RoomStore(options.db, options.isPublishedVersion);
  let stopped = false;
  let pendingUpgrades = 0;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  type Connection = { ws: WebSocket; id: string; actor?: RoomActor; roomId?: string; cursor: number; pending: number; chain: Promise<void>; checking: boolean; lastPong: number; ready: boolean; presenceKey?: string; flushing: boolean };
  const connections = new Set<Connection>();
  const attachments: { server: HttpServer | HttpsServer; listener: (req: IncomingMessage, socket: any, head: Buffer) => void }[] = [];
  async function redis(args: string[]) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([options.redis.sendCommand(args), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('cache timeout')), 2000); })]);
    } catch { throw new RoomError(503, 'realtime_unavailable'); }
    finally { if (timer) clearTimeout(timer); }
  }
  async function limit(key: string, maximum: number, windowMs: number) {
    const n = Number(await redis(['EVAL', RATE_SCRIPT, '1', prefix + 'rate:' + hash(key), String(windowMs)]));
    if (n > maximum) throw new RoomError(429, 'rate_limited');
  }
  async function active(actor: RoomActor) {
    if (!actor || !await options.isSessionActive(actor)) throw new RoomError(401, 'unauthorized');
  }
  const wrap = (fn: (c: Context, actor: RoomActor) => Promise<unknown>, status = 200) => async (c: Context) => {
    try {
      if (stopped) throw new RoomError(503, 'realtime_unavailable');
      if (c.req.method !== 'GET' && c.req.header('origin') !== origin) throw new RoomError(403, 'origin_denied');
      const actor = await options.authenticate(c);
      if (!actor) throw new RoomError(401, 'unauthorized');
      await active(actor);
      await limit('http:' + actor.sessionId, 160, 10_000);
      return c.json(await fn(c, actor), status as 200);
    } catch (error) {
      const known = error instanceof RoomError ? error : new RoomError(503, 'realtime_unavailable');
      return c.json({ error: known.code }, known.status as 400);
    }
  };
  async function body(c: Context) {
    if (Number(c.req.header('content-length') ?? 0) > MAX_FRAME) throw new RoomError(413, 'frame_too_large');
    // Hono 的 body-limit 同时覆盖无 Content-Length 的流式请求。
    const value = await c.req.json().catch(() => { throw new RoomError(400, 'invalid_json'); });
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RoomError(400, 'invalid_json');
    return value;
  }
  const notify = async (id: string) => { await redis(['PUBLISH', prefix + 'events', id]).catch(() => {}); void flushRoom(id); };
  const changed = async (id: string, task: Promise<unknown>) => { const result = await task; await notify(id); return result; };
  const base = '/api/rooms';
  const sizeLimit = bodyLimit({ maxSize: MAX_FRAME, onError: c => c.json({ error: 'frame_too_large' }, 413) });
  app.use(base, sizeLimit);
  app.use(base + '/*', sizeLimit);
  app.post(base, wrap(async (c, actor) => store.create(actor, (await body(c)).versionId), 201));
  app.get(base + '/:id', wrap((c, actor) => store.snapshot(c.req.param('id')!, actor)));
  app.post(base + '/:id/join', wrap((c, actor) => changed(c.req.param('id')!, store.join(c.req.param('id')!, actor))));
  app.post(base + '/:id/leave', wrap((c, actor) => changed(c.req.param('id')!, store.leave(c.req.param('id')!, actor))));
  app.post(base + '/:id/close', wrap((c, actor) => changed(c.req.param('id')!, store.close(c.req.param('id')!, actor))));
  app.post(base + '/:id/kick', wrap(async (c, actor) => changed(c.req.param('id')!, store.kick(c.req.param('id')!, actor, (await body(c)).userId))));
  app.get(base + '/:id/sync', wrap((c, actor) => store.sync(c.req.param('id')!, actor, Number(c.req.query('after') ?? 0))));
  app.post(base + '/:id/events', wrap(async (c, actor) => changed(c.req.param('id')!, store.send(c.req.param('id')!, actor, await body(c)))));
  app.post(base + '/:id/ticket', wrap(async (c, actor) => {
    const id = identifier(c.req.param('id'));
    await store.member(id, actor);
    await limit('ticket:' + actor.sessionId, 12, 10_000);
    const ticket = randomBytes(32).toString('base64url');
    await redis(['SET', prefix + 'ticket:' + hash(ticket), JSON.stringify({ actor, roomId: id }), 'EX', '30', 'NX']);
    return { ticket, expiresIn: 30, websocketPath: base + '/ws', webTransportUrl: options.webTransportUrl ?? null };
  }));
  app.post(base + '/:id/turn', wrap(async (c, actor) => {
    const id = identifier(c.req.param('id'));
    await store.member(id, actor);
    if (!options.turnSecret || !options.turnUrls?.length) throw new RoomError(503, 'turn_unavailable');
    await limit('turn:' + actor.sessionId, 6, 60_000);
    const username = `${Math.floor(Date.now() / 1000) + 600}:${hash(id + ':' + actor.userId).slice(0,24)}`;
    return { urls: options.turnUrls, username, credential: createHmac('sha1', options.turnSecret).update(username).digest('base64'), ttl: 600 };
  }));
  function send(connection: Connection, value: unknown) {
    const ws = connection.ws;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 262_144) { ws.close(1013, 'backpressure'); return; }
    ws.send(JSON.stringify(value), error => { if (error) ws.terminate(); });
  }
  function reject(connection: Connection, error: unknown) {
    const known = error instanceof RoomError ? error : new RoomError(503, 'realtime_unavailable');
    send(connection, { type: 'error', code: known.code });
    connection.ws.close(known.status === 429 ? 1008 : 4003, known.code);
  }
  async function presence(c: Connection) {
    const key = prefix + 'presence:' + hash(c.actor!.sessionId);
    c.presenceKey = key;
    const count = Number(await redis(['EVAL', PRESENCE_SCRIPT, '1', key, String(Date.now() - 25_000), String(Date.now()), c.id]));
    if (count > 4) throw new RoomError(429, 'too_many_connections');
  }
  async function flush(connection: Connection) {
    if (!connection.ready || !connection.actor || !connection.roomId || connection.flushing || connection.ws.readyState !== WebSocket.OPEN) return;
    connection.flushing = true;
    try {
      await active(connection.actor);
      const result = await store.sync(connection.roomId, connection.actor, connection.cursor, false);
      for (const value of result.events) send(connection, { type: 'event', event: value });
      connection.cursor = result.cursor;
      if (result.head > result.cursor) setImmediate(() => void flush(connection));
    } catch (error) { reject(connection, error); }
    finally { connection.flushing = false; }
  }
  async function flushRoom(id: string) { await Promise.all([...connections].filter(c => c.roomId === id).map(flush)); }
  async function receive(connection: Connection, raw: Buffer, binary: boolean) {
    if (binary || raw.length > MAX_FRAME) throw new RoomError(413, 'frame_too_large');
    let input: any;
    try { input = JSON.parse(raw.toString()); } catch { throw new RoomError(400, 'invalid_json'); }
    if (!input || typeof input !== 'object') throw new RoomError(400, 'invalid_frame');
    if (!connection.actor) {
      if (input.type !== 'auth' || typeof input.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.ticket)) throw new RoomError(401, 'unauthorized');
      const stored = await redis(['GETDEL', prefix + 'ticket:' + hash(input.ticket)]);
      if (!stored) throw new RoomError(401, 'unauthorized');
      const ticket = JSON.parse(String(stored));
      await active(ticket.actor);
      await store.member(ticket.roomId, ticket.actor);
      connection.actor = ticket.actor; connection.roomId = ticket.roomId;
      await presence(connection);
      const sync = await store.sync(ticket.roomId, ticket.actor, input.after ?? 0);
      connection.cursor = sync.cursor;
      connection.ready = true;
      send(connection, { type: 'ready', userId: ticket.actor.userId, ...sync });
      if (sync.head > sync.cursor) setImmediate(() => void flush(connection));
      return;
    }
    await active(connection.actor);
    await store.member(connection.roomId!, connection.actor);
    await limit('socket:' + connection.actor.sessionId, 80, 10_000);
    if (input.type === 'sync') {
      const sync = await store.sync(connection.roomId!, connection.actor, input.after ?? connection.cursor);
      connection.cursor = sync.cursor; send(connection, { type: 'sync', ...sync });
    } else if (input.type === 'event') {
      const result = await store.send(connection.roomId!, connection.actor, input.event);
      send(connection, { type: 'ack', id: input.event.id, event: result });
      await notify(connection.roomId!);
    } else if (input.type === 'ping') send(connection, { type: 'pong', now: Date.now() });
    else throw new RoomError(400, 'invalid_frame');
  }
  wss.on('connection', ws => {
    const connection: Connection = { ws, id: randomUUID(), cursor: 0, pending: 0, chain: Promise.resolve(), checking: false, lastPong: Date.now(), ready: false, flushing: false };
    connections.add(connection);
    ws.on('error', () => {});
    ws.on('pong', () => { connection.lastPong = Date.now(); });
    const timeout = setTimeout(() => { if (!connection.actor) reject(connection, new RoomError(401, 'auth_timeout')); }, 3000);
    ws.on('message', (raw, binary) => {
      if (++connection.pending > 32) { ws.close(1008, 'queue_full'); return; }
      connection.chain = connection.chain.then(() => receive(connection, raw as Buffer, binary)).catch(error => reject(connection, error)).finally(() => { connection.pending--; });
    });
    ws.on('close', () => { clearTimeout(timeout); connections.delete(connection); if (connection.presenceKey) void redis(['ZREM', connection.presenceKey, connection.id]).catch(() => {}); });
  });
  const tick = setInterval(() => {
    for (const c of connections) {
      if (c.checking || !c.actor || !c.ready) continue;
      c.checking = true;
      void (async () => {
        try {
          await active(c.actor!); await store.member(c.roomId!, c.actor!);
          await presence(c);
          if (Date.now() - c.lastPong > 30_000) { c.ws.terminate(); return; }
          c.ws.ping(); await flush(c);
        } catch (error) { reject(c, error); }
        finally { c.checking = false; }
      })();
    }
  }, options.sessionCheckMs ?? 1000);
  tick.unref();
  // PubSub 只用于唤醒；即便丢通知，周期同步仍从 PG 读取可靠历史。
  const subscriber = options.redis.duplicate?.();
  subscriber?.on('error', () => {});
  const subscribed = subscriber ? subscriber.connect().then(() => subscriber.subscribe(prefix + 'events', id => { void flushRoom(id); })).catch(() => {}) : Promise.resolve();
  return {
    handler: app, store,
    attachWebSocket(server: HttpServer | HttpsServer) {
      const listener = (req: IncomingMessage, socket: any, head: Buffer) => {
        if (req.url?.split('?')[0] !== base + '/ws') return;
        const deny = (status: number) => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`); };
        if (stopped || req.url !== base + '/ws' || req.headers.origin !== origin) { deny(403); return; }
        if (connections.size + pendingUpgrades >= 128) { deny(503); return; }
        socket.on('error', () => {});
        pendingUpgrades++;
        void limit('upgrade:' + (req.socket.remoteAddress ?? ''), 30, 10_000).then(() => {
          if (!socket.destroyed) wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
        }).catch(() => deny(429)).finally(() => { pendingUpgrades--; });
      };
      server.on('upgrade', listener); attachments.push({ server, listener });
    },
    async close() {
      stopped = true; clearInterval(tick);
      for (const { server, listener } of attachments) server.off('upgrade', listener);
      for (const c of connections) c.ws.terminate();
      await subscribed; await subscriber?.quit().catch(() => {});
      await new Promise<void>(resolve => wss.close(() => resolve()));
    },
  };
}
