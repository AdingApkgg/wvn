import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresFixture } from './helpers/postgres.ts';

test('source listener and separately loaded SSR runtime share one PostgreSQL store and shutdown pool', async () => {
  const pg = await postgresFixture();
  const previousUrl = process.env.WG_DATABASE_URL, previousSchema = process.env.WG_DATABASE_SCHEMA;
  process.env.WG_DATABASE_URL = process.env.WVN_TEST_DATABASE_URL;
  process.env.WG_DATABASE_SCHEMA = pg.schema;
  const stores = new Set<ReturnType<typeof import('../src/server/runtime.ts').getStore>>();
  try {
    const aUrl = new URL('../src/server/runtime.ts?listener', import.meta.url);
    const bUrl = new URL('../src/server/runtime.ts?ssr', import.meta.url);
    const a = await import(aUrl.href) as typeof import('../src/server/runtime.ts');
    const b = await import(bUrl.href) as typeof import('../src/server/runtime.ts');
    assert.notEqual(a, b, 'exercise separate module instances like source and the SSR bundle');
    const listener = a.getStore(), ssr = b.getStore();
    stores.add(listener); stores.add(ssr);
    await Promise.all([...stores].map(store => store.ready));
    assert.equal(listener === ssr, true, 'source and SSR must share the same runtime store');
    await listener.close();
    assert.equal(ssr.database.pool.ended, true);
  } finally {
    for (const store of stores) await store.close();
    if (previousUrl === undefined) delete process.env.WG_DATABASE_URL; else process.env.WG_DATABASE_URL = previousUrl;
    if (previousSchema === undefined) delete process.env.WG_DATABASE_SCHEMA; else process.env.WG_DATABASE_SCHEMA = previousSchema;
    await pg.close();
  }
});
