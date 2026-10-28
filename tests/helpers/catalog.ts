import { Store } from '../../src/server/store.ts';
import { postgresFixture } from './postgres.ts';

export async function testStore() {
  const fixture = await postgresFixture();
  const store = new Store(fixture.db);
  try { await store.ready; } catch (error) { await fixture.close(); throw error; }
  store.close = async () => { await fixture.close(); };
  return store;
}
