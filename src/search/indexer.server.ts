import { randomUUID } from 'node:crypto';
import type { PgDatabase } from '../database/postgres.ts';
import { indexName, MeiliClient, MeiliError } from './meili.server.ts';
import { documents } from './projection.server.ts';

type Options = { db: PgDatabase; meili: MeiliClient; indexUid: string };
export type ConsumeResult = { claimed: number; succeeded: number; failed: number; superseded: number };

/** PG 是事实来源；Meili 只接收可重复生成的公开文档。 */
export class SearchIndexer {
  private readonly db: PgDatabase;
  private readonly meili: MeiliClient;
  readonly indexUid: string;
  constructor(options: Options) {
    this.db = options.db;
    this.meili = options.meili;
    this.indexUid = indexName(options.indexUid);
  }
  private async lock(exclusive: boolean, workId?: string) {
    // 索引任务可能超过普通 PG 空闲事务超时；网络请求另有明确超时。
    await this.db.exec("SET LOCAL idle_in_transaction_session_timeout='0'; SET LOCAL lock_timeout='180s'; SET LOCAL statement_timeout='0'");
    const schema = (await this.db.prepare('SELECT current_schema() AS name').get())!.name;
    const key = 'wvn:search:' + schema + ':' + this.indexUid;
    await this.db.prepare(`SELECT ${exclusive ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared'}(hashtextextended($1,0))`).get(key);
    if (workId) await this.db.prepare('SELECT pg_advisory_xact_lock(hashtextextended($1,0))').get(key + ':' + workId);
  }
  private async initializeUnlocked() {
    await this.meili.ensureIndex(this.indexUid);
    await this.meili.settings(this.indexUid);
  }
  async initialize() {
    await this.db.transaction(async () => { await this.lock(false); await this.initializeUnlocked(); });
  }
  async consume(options: { limit?: number; leaseMs?: number } = {}): Promise<ConsumeResult> {
    const limit = options.limit ?? 100;
    const leaseMs = options.leaseMs ?? 180_000;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600_000)
      throw new Error('Invalid search worker batch bounds');
    await this.initialize();
    const token = randomUUID();
    const jobs = await this.db.transaction(() => this.db.prepare(`WITH candidates AS (
      SELECT work_id FROM search_outbox WHERE available_at<=now() AND (lease_until IS NULL OR lease_until<now())
      ORDER BY available_at,work_id FOR UPDATE SKIP LOCKED LIMIT $1
    ) UPDATE search_outbox o SET lease_token=$2,lease_until=now()+$3::int*interval '1 millisecond'
      FROM candidates c WHERE o.work_id=c.work_id RETURNING o.work_id,o.generation,o.attempts`).all(limit, token, leaseMs));
    const result: ConsumeResult = { claimed: jobs.length, succeeded: 0, failed: 0, superseded: 0 };
    for (const job of jobs) {
      try {
        const handled = await this.db.transaction(async () => {
          // 全量重建排他，同作品串行。即使 lease 过期，旧任务也不会在新任务之后提交。
          await this.lock(false, job.work_id);
          const current = await this.db.prepare('SELECT generation FROM search_outbox WHERE work_id=$1 AND lease_token=$2').get(job.work_id, token);
          if (!current) return false;
          const projection = await documents(this.db, [job.work_id]);
          if (projection.length) await this.meili.replace(this.indexUid, projection);
          else await this.meili.remove(this.indexUid, job.work_id);
          // generation 有更新时保留任务，避免覆盖索引期间发生的新修改。
          await this.db.prepare('DELETE FROM search_outbox WHERE work_id=$1 AND generation=$2 AND lease_token=$3').run(job.work_id, current.generation, token);
          await this.db.prepare(`UPDATE search_outbox SET lease_token=NULL,lease_until=NULL,attempts=0,last_error=NULL,available_at=now()
            WHERE work_id=$1 AND lease_token=$2`).run(job.work_id, token);
          return true;
        });
        if (handled) result.succeeded++; else result.superseded++;
      } catch (error) {
        const code = error instanceof MeiliError ? error.code : 'indexing_error';
        const delay = Math.min(300_000, 1000 * 2 ** Math.min(job.attempts, 9));
        await this.db.prepare(`UPDATE search_outbox SET attempts=attempts+1,last_error=$1,lease_token=NULL,lease_until=NULL,
          available_at=CASE WHEN generation=$2 THEN now()+$3::int*interval '1 millisecond' ELSE now() END
          WHERE work_id=$4 AND lease_token=$5`).run(code.slice(0, 100), job.generation, delay, job.work_id, token);
        result.failed++;
      }
    }
    return result;
  }
  async rebuild(): Promise<{ indexUid: string; documents: number }> {
    const staging = this.indexUid + '_rebuild_' + randomUUID().replaceAll('-', '');
    let count = 0;
    await this.db.transaction(async () => {
      await this.lock(true);
      await this.initializeUnlocked();
      await this.meili.createIndex(staging);
      await this.meili.settings(staging);
      let after = '';
      while (true) {
        const works = await this.db.prepare('SELECT id FROM works WHERE id>$1 ORDER BY id LIMIT 200').all(after);
        if (!works.length) break;
        const batch = await documents(this.db, works.map(w => w.id));
        await this.meili.replace(staging, batch);
        count += batch.length;
        after = works.at(-1)!.id;
      }
      if (await this.meili.count(staging) !== count) throw new Error('Search rebuild document count mismatch');
      // 设置、所有写入、核数均完成后才交换；失败时保留 staging 供核查。
      await this.meili.swap(this.indexUid, staging);
      // 重建不确认 outbox；构建期间的目录写入会在交换后继续消费。
    });
    await this.meili.deleteIndex(staging);
    return { indexUid: this.indexUid, documents: count };
  }
}
