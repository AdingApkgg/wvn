import { readFileSync } from 'node:fs';
import { PgDatabase } from '../src/database/postgres.ts';
import { migrate } from '../src/database/migrations.ts';
import { Store } from '../src/server/store.ts';
import { createAccountService } from '../src/accounts/service.server.ts';
import { resourceMigrations } from '../src/resources/schema.ts';
import { versionResourceMigrations } from '../src/platform/version-resources.server.ts';
import { searchMigrations } from '../src/search/migrations.ts';
import { roomMigrations } from '../src/rooms/migrations.ts';

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
// 显式选择已建好的 schema；不创建账号、不导入种子、不读取或修改旧 SQLite 和独立账本。
const catalog = new Store(new PgDatabase(process.env.WG_DATABASE_URL ?? required('DATABASE_URL'), { schema: required('WG_DATABASE_SCHEMA') }));
const resources = new PgDatabase(process.env.WG_RESOURCE_DATABASE_URL ?? process.env.WG_DATABASE_URL ?? required('DATABASE_URL'), { schema: required('WG_RESOURCE_DATABASE_SCHEMA') });
let accounts: Awaited<ReturnType<typeof createAccountService>> | undefined;
try {
  await catalog.ready;
  await migrate(catalog.database, searchMigrations);
  await migrate(resources, [...resourceMigrations, ...versionResourceMigrations]);
  accounts = await createAccountService({ database: process.env.WG_ACCOUNT_DATABASE_URL ?? required('WG_ACCOUNT_DATABASE'),
    databaseSchema: required('WG_ACCOUNT_DATABASE_SCHEMA'), origin: required('WG_ACCOUNT_ORIGIN'),
    secret: readFileSync(required('WG_ACCOUNT_SECRET_FILE'), 'utf8').trim() });
  await migrate(accounts.db, roomMigrations);
  console.log(JSON.stringify({ status: 'schema-ready', catalog: true, accounts: true, resources: true, seeded: false, listening: false }));
} catch {
  console.error('平台表结构初始化失败；检查显式 PG schema、数据库权限和私有环境配置。');
  process.exitCode = 1;
} finally { await accounts?.close(); await resources.close(); await catalog.close(); }
