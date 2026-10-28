import { resolve } from 'node:path';
import { fileResponse } from '../server/resources.ts';
import { createHash } from 'node:crypto';
import type { Hono } from 'hono';
import { PgDatabase } from '../database/postgres.ts';
import { migrate } from '../database/migrations.ts';
import type { Store } from '../server/store.ts';
import { resourceMigrations, ResourceRepository, RedisResourceCache, createResourceApp } from '../resources/index.ts';
import { VersionResources, createVersionResourceApp } from './version-resources.server.ts';
import { createSearchRuntime } from '../search/runtime.server.ts';

/** 目录、资源索引可使用各自的数据库；账号与私人正文不进入公开资源仓储。 */
export async function mountPublicPlatform(app: Hono, store: Store, env: NodeJS.ProcessEnv = process.env) {
  await store.ready;
  const ownsDatabase = !!(env.WG_RESOURCE_DATABASE_URL || env.WG_RESOURCE_DATABASE_SCHEMA);
  const connection = env.WG_RESOURCE_DATABASE_URL ?? env.WG_DATABASE_URL ?? env.DATABASE_URL ?? store.database.pool.options.connectionString;
  if (ownsDatabase && !connection) throw new Error('WG_RESOURCE_DATABASE_URL or catalog database URL is required');
  const db = ownsDatabase ? new PgDatabase(connection!, { schema: env.WG_RESOURCE_DATABASE_SCHEMA }) : store.database;
  const schema = (await db.prepare('SELECT current_schema() AS name').get())!.name;
  const identity = createHash('sha256').update((connection ?? '') + ':' + schema).digest('hex').slice(0, 24);
  const cache = env.REDIS_URL ? new RedisResourceCache({ url: env.REDIS_URL, prefix: env.WG_RESOURCE_CACHE_PREFIX ?? `wvn:resources:${identity}:v1:` }) : undefined;
  try {
    await migrate(db, resourceMigrations);
    const repository = new ResourceRepository(db, { cache });
    const versions = new VersionResources(store, repository);
    await versions.ready;
    const search = await createSearchRuntime(store, env);
    app.on(['GET', 'HEAD'], '/player/room-client.mjs', async c => {
      const response = await fileResponse(c.req.raw, resolve('public'), '/player/room-client.mjs');
      response.headers.set('Cache-Control', 'no-cache');
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return response;
    });
    app.route('/', createResourceApp(repository));
    app.route('/', createVersionResourceApp(versions));
    app.route('/', search.app);
    let closing: Promise<void> | undefined;
    return { repository, versions, search, close() {
      return closing ??= (async () => { cache?.close(); await search.close?.(); if (ownsDatabase) await db.close(); })();
    } };
  } catch (error) { cache?.close(); if (ownsDatabase) await db.close(); throw error; }
}
