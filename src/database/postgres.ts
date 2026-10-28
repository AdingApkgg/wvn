import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

type TransactionContext = { client: PoolClient; savepoint: number };
type TransactionOptions = { lock?: string };
export type PgRow = Record<string, any>;

function integer(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('PostgreSQL integer exceeds the safe JavaScript range');
  return n;
}

/** 异步仓储的连接边界；事务内所有查询使用同一连接。 */
export class PgDatabase {
  readonly pool: Pool;
  private closing?: Promise<void>;
  private readonly context = new AsyncLocalStorage<TransactionContext>();

  constructor(connectionString: string, options: { schema?: string; max?: number } = {}) {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname.length < 2)
      throw new Error('A PostgreSQL database URL is required');
    const schema = options.schema ?? 'public';
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid PostgreSQL schema');
    this.pool = new Pool({
      connectionString,
      max: options.max ?? 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 30_000,
      options: `-c search_path=${schema},pg_catalog`,
      types: {
        getTypeParser: (oid, format) => oid === 20 && format !== 'binary'
          ? integer : types.getTypeParser(oid, format),
      },
    });
    // pg 的空闲连接错误来自事件，不能成为未处理异常；不记录含连接信息的报错文本。
    this.pool.on('error', (error) => {
      console.error('PostgreSQL idle connection failed', { code: (error as Error & { code?: string }).code ?? 'CONNECTION_ERROR' });
    });
  }

  get isTransaction() { return !!this.context.getStore(); }

  private query<T extends QueryResultRow = PgRow>(sql: string, values: unknown[] = []) {
    return (this.context.getStore()?.client ?? this.pool).query<T>(sql, values);
  }

  prepare(sql: string) {
    return {
      all: async <T extends QueryResultRow = PgRow>(...values: unknown[]): Promise<T[]> =>
        (await this.query<T>(sql, values)).rows,
      get: async <T extends QueryResultRow = PgRow>(...values: unknown[]): Promise<T | undefined> =>
        (await this.query<T>(sql, values)).rows[0],
      run: async (...values: unknown[]) => {
        const result = await this.query(sql, values);
        return { changes: result.rowCount ?? 0 };
      },
    };
  }

  async exec(sql: string): Promise<void> { await this.query(sql); }

  async transaction<T>(fn: () => T | Promise<T>, options: TransactionOptions = {}): Promise<T> {
    const outer = this.context.getStore();
    if (outer) {
      const name = 'wvn_sp_' + ++outer.savepoint;
      await outer.client.query(`SAVEPOINT ${name}`);
      try {
        if (options.lock) await this.lock(options.lock);
        const result = await fn();
        await outer.client.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        await outer.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await outer.client.query(`RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      return await this.context.run({ client, savepoint: 0 }, async () => {
        try {
          if (options.lock) await this.lock(options.lock);
          const result = await fn();
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    } finally { client.release(); }
  }

  private async lock(key: string) {
    await this.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  }

  close() { return this.closing ??= this.pool.end(); }
}
