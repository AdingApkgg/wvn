import { after } from 'node:test';
import { createAccountService as createService, type AccountService } from '../../src/accounts/service.server.ts';
import type { AccountConfig } from '../../src/accounts/config.server.ts';
import type { PgDatabase } from '../../src/database/postgres.ts';
import { postgresFixture } from './postgres.ts';

type Fixture = Awaited<ReturnType<typeof postgresFixture>>;
const aliases = new Map<string, Fixture>();
const databases = new Map<PgDatabase, Fixture>();
const initialized = new Set<Fixture>();
const services = new Set<AccountService>();
let memoryId = 0;

// 旧测试中的文件名仅作为测试数据库别名；每个别名对应独立的真实 PG schema。
// 这个转换只存在于测试，应用入口不接受 SQLite 路径。
async function fixtureFor(alias = ':memory:') {
  const key = alias === ':memory:' ? 'memory-' + ++memoryId : alias;
  let fixture = aliases.get(key);
  if (!fixture) {
    fixture = await postgresFixture();
    aliases.set(key, fixture);
    databases.set(fixture.db, fixture);
  }
  return fixture;
}

export async function createAccountService(input: AccountConfig): Promise<AccountService> {
  if (/^postgres(?:ql)?:/.test(input.database)) {
    const service = await createService(input);
    services.add(service);
    return service;
  }
  const fixture = await fixtureFor(input.database);
  const service = await createService({ ...input, database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: fixture.schema });
  initialized.add(fixture);
  services.add(service);
  return service;
}

export async function testDatabase(alias?: string) {
  const fixture = await fixtureFor(alias);
  if (!initialized.has(fixture)) {
    const service = await createService({
      database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: fixture.schema,
      origin: 'https://accounts.wg.test', secret: 'synthetic-postgres-unit-test-secret-with-at-least-48-characters',
    });
    await service.close();
    initialized.add(fixture);
  }
  return fixture.db;
}

export function testDatabaseSchema(db: PgDatabase) {
  const fixture = databases.get(db);
  if (!fixture) throw new Error('Database does not belong to this test fixture');
  return fixture.schema;
}

export async function testUser(db: PgDatabase, id: string, name = id) {
  await db.prepare(`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt")
    VALUES($1,$2,$3,false,now(),now()) ON CONFLICT(id) DO NOTHING`).run(id, name, id + '@example.invalid');
}

after(async () => {
  for (const service of services) await service.close();
  for (const fixture of aliases.values()) await fixture.close();
});
