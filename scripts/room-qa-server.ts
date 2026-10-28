// 仅隔离远程QA使用：注入测试身份，不可作为生产入口。
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { createHash, X509Certificate, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { createClient } from 'redis';
import { postgresFixture } from '../tests/helpers/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { mountRooms, roomMigrations } from '../src/rooms/index.ts';

if (process.env.WVN_ROOMS_QA !== 'isolated-loopback' || !process.argv.includes('--isolated-qa')) throw new Error('Explicit isolated QA mode required');
const cert = await readFile(process.env.ROOMS_QA_CERT!), key = await readFile(process.env.ROOMS_QA_KEY!);
const pg = await postgresFixture(), redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => {}); await redis.connect(); await migrate(pg.db, roomMigrations);
const app = new Hono(), origin = 'https://127.0.0.1:28444', redisPrefix = 'wvn:rooms:qa:' + randomUUID() + ':';
const rooms = mountRooms(app, { db: pg.db, redis, redisPrefix, origin,
  authenticate: async c => {
    const userId = c.req.header('x-rooms-qa');
    return userId && /^[a-z0-9_-]{1,80}$/.test(userId) ? { userId, sessionId: 'qa-' + userId, displayName: userId } : null;
  },
  isSessionActive: async () => true,
  isPublishedVersion: async id => id === 'qa-published-version',
  turnSecret: process.env.ROOMS_TURN_SECRET,
  turnUrls: ['turn:127.0.0.1:28440?transport=udp','turn:127.0.0.1:28440?transport=tcp'],
  webTransportUrl: 'https://127.0.0.1:28443/rooms',
});
app.get('/', c => c.html('<!doctype html><meta charset="utf-8"><title>WVN 房间隔离 QA</title><p>仅用于连接验收</p>'));
app.get('/room-client.mjs', async c => c.body(await readFile(new URL('../public/player/room-client.mjs', import.meta.url), 'utf8'), 200, { 'content-type': 'text/javascript' }));
app.get('/favicon.ico', c => c.body(null, 204));
app.get('/qa-info', c => c.json({ certificateHash: createHash('sha256').update(new X509Certificate(cert).raw).digest('base64') }));
const http = httpServer(getRequestListener(app.fetch)), https = httpsServer({ key, cert }, getRequestListener(app.fetch));
const sockets = new Set<import('node:net').Socket>();
for (const server of [http, https]) server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
rooms.attachWebSocket(http); rooms.attachWebSocket(https);
for (const [server, port] of [[http, 28439],[https, 28444]] as const) await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
console.log(JSON.stringify({ ready: true, origin, http: '127.0.0.1:28439', schema: pg.schema }));
async function close() {
  await rooms.close(); for (const socket of sockets) socket.destroy(); await Promise.all([http,https].map(s => new Promise<void>(resolve => s.close(() => resolve()))));
  const keys = await redis.keys(redisPrefix + '*'); if (keys.length) await redis.del(keys);
  await redis.quit(); await pg.close(); process.exit(0);
}
process.once('SIGTERM', close); process.once('SIGINT', close);
