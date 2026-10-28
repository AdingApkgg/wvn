import { createHash } from 'node:crypto';
import type { PgDatabase } from './postgres.ts';

export type Migration = { id: string; sql: string };

/** 已应用迁移不可修改；所有待应用变更在同一事务提交。 */
export async function migrate(db: PgDatabase, migrations: Migration[]) {
  if (new Set(migrations.map(m => m.id)).size !== migrations.length)
    throw new Error('Duplicate migration identity');
  await db.transaction(async () => {
    const row = await db.prepare('SELECT current_schema() AS name').get();
    if (!row?.name) throw new Error('PostgreSQL schema does not exist');
    await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended($1,0))')
      .get('wvn:migrations:' + row.name);
    await db.exec(`CREATE TABLE IF NOT EXISTS wvn_schema_migrations(
      id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex');
      const existing = await db.prepare('SELECT checksum FROM wvn_schema_migrations WHERE id=$1').get(migration.id);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error('Migration checksum mismatch: ' + migration.id);
        continue;
      }
      await db.exec(migration.sql);
      await db.prepare('INSERT INTO wvn_schema_migrations(id,checksum) VALUES($1,$2)').run(migration.id, checksum);
    }
  });
}
