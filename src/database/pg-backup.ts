import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PgDatabase } from './postgres.ts';

export const PG_BACKUP_TIMEOUT = 30 * 60 * 1000;
export function schemaName(value = 'public') {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw Error('Invalid PostgreSQL schema');
  return value;
}
export const quoteIdentifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

/** 密码和连接 URL 仅通过子进程环境传递，绝不进入参数或异常日志。 */
export function postgresEnvironment(database: string) {
  let url: URL;
  try { url = new URL(database); } catch { throw Error('A PostgreSQL database URL is required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2 || url.hash)
    throw Error('A PostgreSQL database URL is required');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  env.PGHOST = decodeURIComponent(url.hostname.replace(/^\[|\]$/g, ''));
  env.PGPORT = url.port || '5432';
  env.PGUSER = decodeURIComponent(url.username);
  env.PGPASSWORD = decodeURIComponent(url.password);
  env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  env.PGCONNECT_TIMEOUT = '10';
  env.PGAPPNAME = 'wvn-offline-backup';
  const params: Record<string, string> = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', sslcrl: 'PGSSLCRL', channel_binding: 'PGCHANNELBINDING' };
  for (const [key, value] of url.searchParams) {
    if (!Object.hasOwn(params, key)) throw Error('Unsupported PostgreSQL backup URL parameter');
    env[params[key]] = value;
  }
  return env;
}

export async function postgresTool(tool: 'pg_dump' | 'pg_restore', args: string[], database?: string) {
  const env = database ? postgresEnvironment(database) : Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  await new Promise<void>((resolve, reject) => {
    execFile(tool, args, { env, timeout: PG_BACKUP_TIMEOUT, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error) => {
      // execFile 原始异常包含命令参数和 stderr；这里只返回安全的工具名与退出状态。
      if (error) reject(Error(`${tool} failed (${error.killed ? 'timeout' : String(error.code ?? 'spawn-error')})`));
      else resolve();
    });
  });
}

export type DatabaseProof = { counts: Record<string, number>; digests: Record<string, string> };
export async function databaseProof(client: PoolClient, schema: string): Promise<DatabaseProof> {
  const tables = (await client.query<{ name: string }>(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname COLLATE "C"`, [schema])).rows;
  const proof: DatabaseProof = { counts: Object.create(null), digests: Object.create(null) };
  for (const { name } of tables) {
    const digest = createHash('sha256');
    let count = 0;
    await client.query(`DECLARE wvn_backup_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM ${quoteIdentifier(schema)}.${quoteIdentifier(name)} t ORDER BY to_jsonb(t)::text COLLATE "C"`);
    try {
      while (true) {
        const rows = (await client.query<{ row: string }>('FETCH 1000 FROM wvn_backup_rows')).rows;
        for (const row of rows) { digest.update(row.row + '\n'); count++; }
        if (rows.length < 1000) break;
      }
    } finally { await client.query('CLOSE wvn_backup_rows'); }
    proof.counts[name] = count;
    proof.digests[name] = digest.digest('hex');
  }
  return proof;
}

export async function exportDatabaseSnapshot<T>(options: { database: string; schema: string; dump: string }, collect: (client: PoolClient) => Promise<T>) {
  postgresEnvironment(options.database);
  const db = new PgDatabase(options.database, { schema: schemaName(options.schema), max: 1 });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL idle_in_transaction_session_timeout='35min'`);
    await client.query(`SET LOCAL statement_timeout='30min'`);
    const snapshot = (await client.query<{ snapshot: string }>('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const result = await collect(client);
    await postgresTool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--strict-names', '--schema=' + options.schema, '--snapshot=' + snapshot, '--file=' + options.dump], options.database);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); await db.close(); }
}

export async function restoreEmptyDatabase(database: string, schema: string, dump: string, expected: DatabaseProof, verify?: (client: PoolClient, actual: DatabaseProof) => Promise<void>) {
  postgresEnvironment(database);
  const db = new PgDatabase(database, { schema: schemaName(schema), max: 1 });
  const client = await db.pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('wvn:offline-restore',0))"); locked = true;
    const tables = (await client.query<{ schema: string; name: string }>(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','f','m')`)).rows;
    for (const table of tables) {
      const found = await client.query(`SELECT 1 FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} LIMIT 1`);
      if (found.rowCount) throw Error('Restore requires an empty target database; non-empty table found');
    }
    // 空 dbname 让 libpq 从 PGDATABASE 读取目标；CLI 参数不含数据库 URL/密码。
    await postgresTool('pg_restore', ['--dbname=', '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--clean', '--if-exists', dump], database);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout='30min'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout='35min'`);
    const actual = await databaseProof(client, schema);
    if (verify) await verify(client, actual);
    await client.query('COMMIT');
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Restored database row counts or identity digests differ');
    return actual;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('wvn:offline-restore',0))").catch(() => {});
    client.release(); await db.close();
  }
}
