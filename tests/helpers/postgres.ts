import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PgDatabase } from '../../src/database/postgres.ts';

// 每个测试拥有独立 schema；cleanup 只删除本 fixture 创建的命名空间。
export async function postgresFixture() {
  const connectionString = process.env.WVN_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('WVN_TEST_DATABASE_URL is required for PostgreSQL tests');
  const target = new URL(connectionString);
  if (target.pathname !== '/wvn_qa' || target.username !== 'wvn_qa')
    throw new Error('Refusing to create fixtures outside the dedicated wvn_qa database');
  const schema = 'qa_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString, max: 1 });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const db = new PgDatabase(connectionString, { schema });
  return {
    db,
    schema,
    async close() {
      await db.close();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    },
  };
}
