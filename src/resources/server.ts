import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { PgDatabase } from '../database/postgres.ts';
import { migrate } from '../database/migrations.ts';
import { resourceMigrations } from './schema.ts';
import { ResourceRepository } from './repository.ts';
import { RedisResourceCache } from './cache.ts';
import { createResourceApp } from './http.ts';

/** 独立服务入口；db 的生命周期由调用者拥有，close 只关闭 HTTP 与本服务缓存。 */
export async function startResourceServer(options: { db: PgDatabase; host?: string; port?: number; redisUrl?: string; cachePrefix?: string }) {
  await migrate(options.db, resourceMigrations);
  const port = options.port ?? 4270;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid resource service port');
  const cache = options.redisUrl ? new RedisResourceCache({ url: options.redisUrl, prefix: options.cachePrefix }) : undefined;
  const repository = new ResourceRepository(options.db, { cache });
  const app = createResourceApp(repository);
  app.get('/health', async c => { await options.db.prepare('SELECT 1').get(); return c.json({ status: 'ok', subsystem: 'resources' }); });
  try {
    const server = await new Promise<ReturnType<typeof serve>>((resolve, reject) => {
      const server = serve({ fetch: app.fetch, hostname: options.host ?? '127.0.0.1', port }, () => resolve(server));
      server.once('error', reject);
    });
    let closing: Promise<void> | undefined;
    return { server, app, repository, close() {
      return closing ??= new Promise<void>((resolve, reject) => {
        cache?.close();
        server.close(error => error ? reject(error) : resolve());
      });
    } };
  } catch (error) { cache?.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL || !process.env.RESOURCE_DATABASE_SCHEMA) throw new Error('DATABASE_URL and explicit RESOURCE_DATABASE_SCHEMA are required');
  const db = new PgDatabase(process.env.DATABASE_URL, { schema: process.env.RESOURCE_DATABASE_SCHEMA });
  startResourceServer({ db, redisUrl: process.env.REDIS_URL, cachePrefix: process.env.RESOURCE_CACHE_PREFIX ?? 'wvn:resources:' + process.env.RESOURCE_DATABASE_SCHEMA + ':v1:',
    host: process.env.RESOURCE_HOST ?? '127.0.0.1', port: process.env.RESOURCE_PORT === undefined ? undefined : Number(process.env.RESOURCE_PORT) })
    .then(service => {
      console.log(JSON.stringify({ status: 'listening', subsystem: 'resources', port: (service.server.address() as { port: number }).port }));
      const stop = () => { service.close().then(() => db.close()).catch(() => { process.exitCode = 1; }); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
    }).catch(async () => { console.error(JSON.stringify({ status: 'failed', code: 'RESOURCE_START_FAILED' })); await db.close(); process.exitCode = 1; });
}
