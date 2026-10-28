import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import type { AccountService } from '../accounts/service.server.ts';
import { ABSOLUTE_MS } from '../accounts/auth.server.ts';
import { migrate } from '../database/migrations.ts';
import type { Store } from '../server/store.ts';
import { mountRooms, roomMigrations, type RoomActor } from '../rooms/index.ts';

/** 登录与身份绑定沿用账号服务；长连接持续以 PG 会话和 auth_version 校验权限。 */
export async function mountAccountRooms(service: AccountService, catalog: Store, env: NodeJS.ProcessEnv = process.env) {
  if (env.WG_ROOMS_ENABLED !== '1') return null;
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required when rooms are enabled');
  const redis = createClient({ url: env.REDIS_URL, disableOfflineQueue: true, commandsQueueMaxLength: 256,
    socket: { connectTimeout: 2000, reconnectStrategy: retries => retries > 5 ? false : Math.min(2000, 100 * 2 ** retries) } });
  redis.on('error', () => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([redis.connect(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Room Redis connection failed')), 3000);
    })]);
    clearTimeout(timer);
    await catalog.ready;
    await migrate(service.db, roomMigrations);
    const turnUrls = env.WG_TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean);
    if (turnUrls?.some(url => !/^turns?:[^\s]+$/.test(url))) throw new Error('Invalid TURN URL');
    if (env.WG_WEBTRANSPORT_URL && new URL(env.WG_WEBTRANSPORT_URL).protocol !== 'https:') throw new Error('WebTransport requires HTTPS');
    async function isSessionActive(actor: RoomActor) {
      if (!Number.isSafeInteger(actor.authVersion) || service.deletions.entries.has(actor.userId)) return false;
      const row = await service.db.prepare(`SELECT 1 FROM session s JOIN "user" u ON u.id=s."userId"
        JOIN wg_account a ON a.user_id=u.id WHERE s.id=$1 AND u.id=$2 AND a.auth_version=$3
        AND s."expiresAt">$4 AND s."createdAt">$5`).get(actor.sessionId, actor.userId, actor.authVersion, new Date(), new Date(Date.now() - ABSOLUTE_MS));
      return !!row;
    }
    const cacheIdentity = createHash('sha256').update(service.config.database + ':' + (service.config.databaseSchema ?? 'public') + ':' + service.config.origin).digest('hex').slice(0, 24);
    const rooms = mountRooms(service.app, { db: service.db, redis, origin: service.config.origin,
      async authenticate(c) {
        try {
          const player = await service.player(c);
          return { userId: player.session.user.id, sessionId: player.session.session.id, displayName: player.session.user.name,
            authVersion: Number(player.binding.slice(player.binding.lastIndexOf(':') + 1)) };
        } catch { return null; }
      },
      isSessionActive,
      async isPublishedVersion(id) { return (await catalog.raw(id))?.status === 'published'; },
      redisPrefix: env.WG_ROOMS_REDIS_PREFIX ?? 'wvn:rooms:' + cacheIdentity + ':',
      turnUrls, turnSecret: env.WG_TURN_SECRET, webTransportUrl: env.WG_WEBTRANSPORT_URL,
    });
    let closing: Promise<void> | undefined;
    return { ...rooms, isSessionActive, close() {
      return closing ??= (async () => { await rooms.close(); if (redis.isOpen) redis.destroy(); })();
    } };
  } catch (error) { clearTimeout(timer); if (redis.isOpen) redis.destroy(); throw error; }
}
