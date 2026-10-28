import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { PgDatabase } from '../database/postgres.ts';
import { SHA256, validContentType, validNamespace } from './types.ts';

type Mapping = {
  namespace: string; originalPath: string; sha256: string; bytes: number; contentType: string;
  sourceFileId: string; targetFileId: string; contentSha1: string;
};
type SourceSummary = { inventorySha256: string; sourceSha256: string; metadataSha256: string; total: number; logicalBytes: number };
export type ResourceImportReport = SourceSummary & {
  status: 'dry-run' | 'complete' | 'verified'; namespace: string; runId?: string; inserted: number; resumed: number; batches: number;
};
export class ResourceImportError extends Error {
  constructor(readonly code: string, readonly originalPath?: string, cause?: unknown) { super(code + (originalPath ? ': ' + originalPath : ''), { cause }); }
}

const sourceQuery = `SELECT p.namespace,p.original_path AS originalPath,p.sha256,o.bytes,p.content_type AS contentType,
  s.source_file_id AS sourceFileId,l.file_id AS targetFileId,l.content_sha1 AS contentSha1,
  s.sha256 AS sourceSha256,s.status,s.error
  FROM resource_paths p LEFT JOIN resource_objects o ON o.sha256=p.sha256
  LEFT JOIN b2_cas_sources s ON s.namespace=p.namespace AND s.original_path=p.original_path
  LEFT JOIN b2_cas_locations l ON l.sha256=p.sha256`;
const recordset = `jsonb_to_recordset($1::jsonb) AS x(key uuid,namespace text,"originalPath" text,
  sha256 text,bytes bigint,"contentType" text,"sourceFileId" text,"targetFileId" text,"contentSha1" text)`;

function canonical(row: Mapping) {
  // 固定列顺序并保留原始字符串；不把运行中分配的 UUID 纳入内容审计。
  return JSON.stringify([row.namespace, row.originalPath, row.sha256, row.bytes, row.contentType, row.sourceFileId, row.targetFileId, row.contentSha1]) + '\n';
}

function mapping(raw: Record<string, unknown>, namespace: string): Mapping {
  const path = typeof raw.originalPath === 'string' ? raw.originalPath : undefined;
  const id = (value: unknown) => typeof value === 'string' && value.length >= 1 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value);
  if (raw.namespace !== namespace || !path || path.length > 16384 || path.includes('\0') || typeof raw.sha256 !== 'string' || !SHA256.test(raw.sha256)
    || !Number.isSafeInteger(raw.bytes) || (raw.bytes as number) < 0 || !validContentType(raw.contentType)
    || !id(raw.sourceFileId) || !id(raw.targetFileId) || typeof raw.contentSha1 !== 'string' || !/^[0-9a-f]{40}$/.test(raw.contentSha1)
    || raw.sourceSha256 !== raw.sha256 || raw.status !== 'verified' || raw.error !== null)
    throw new ResourceImportError('SOURCE_INVALID', path);
  return { namespace, originalPath: path, sha256: raw.sha256, bytes: raw.bytes as number, contentType: raw.contentType,
    sourceFileId: raw.sourceFileId as string, targetFileId: raw.targetFileId as string, contentSha1: raw.contentSha1 };
}

async function checkBatch(db: PgDatabase, rows: Mapping[], apply: boolean) {
  const json = JSON.stringify(rows.map(row => ({ ...row, key: randomUUID() })));
  if (apply) await db.prepare(`INSERT INTO wvn_resource_objects(sha256,bytes)
    SELECT DISTINCT x.sha256,x.bytes FROM ${recordset} ON CONFLICT(sha256) DO NOTHING`).run(json);
  const objectConflict = await db.prepare(`SELECT x."originalPath" AS path FROM ${recordset}
    JOIN wvn_resource_objects o ON o.sha256=x.sha256 WHERE o.bytes IS DISTINCT FROM x.bytes LIMIT 1`).get(json);
  if (objectConflict) throw new ResourceImportError('OBJECT_CONFLICT', objectConflict.path);
  let inserted = 0;
  if (apply) inserted = (await db.prepare(`INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1)
    SELECT x.key,x.namespace,x."originalPath",x.sha256,x."contentType",x."sourceFileId",x."targetFileId",x."contentSha1"
    FROM ${recordset} ON CONFLICT(namespace,original_path) DO NOTHING`).run(json)).changes;
  const pathConflict = await db.prepare(`SELECT x."originalPath" AS path FROM ${recordset}
    JOIN wvn_resources r ON r.namespace=x.namespace AND r.original_path=x."originalPath"
    WHERE r.sha256 IS DISTINCT FROM x.sha256 OR r.content_type IS DISTINCT FROM x."contentType"
      OR r.source_file_id IS DISTINCT FROM x."sourceFileId" OR r.target_file_id IS DISTINCT FROM x."targetFileId"
      OR r.content_sha1 IS DISTINCT FROM x."contentSha1" LIMIT 1`).get(json);
  if (pathConflict) throw new ResourceImportError('PATH_CONFLICT', pathConflict.path);
  if (!apply) {
    const count = await db.prepare(`SELECT count(*)::int AS n FROM ${recordset}
      JOIN wvn_resources r ON r.namespace=x.namespace AND r.original_path=x."originalPath"`).get(json);
    inserted = rows.length - count!.n;
  }
  return inserted;
}

function checkSnapshot(existing: Record<string, any> | undefined, summary: SourceSummary) {
  if (existing && (existing.inventory_sha256 !== summary.inventorySha256 || existing.metadata_sha256 !== summary.metadataSha256
    || existing.total !== summary.total || existing.logical_bytes !== summary.logicalBytes))
    throw new ResourceImportError('SNAPSHOT_CONFLICT');
}

async function verifyTarget(db: PgDatabase, namespace: string, summary: SourceSummary) {
  const targetDigest = createHash('sha256'); let targetRows = 0;
  await db.prepare(`DECLARE wvn_resource_verify NO SCROLL CURSOR FOR
    SELECT r.namespace,r.original_path AS "originalPath",r.sha256,o.bytes,r.content_type AS "contentType",
      r.source_file_id AS "sourceFileId",r.target_file_id AS "targetFileId",r.content_sha1 AS "contentSha1"
    FROM wvn_resources r JOIN wvn_resource_objects o ON o.sha256=r.sha256
    WHERE r.namespace=$1 ORDER BY r.original_path COLLATE "C"`).run(namespace);
  try {
    for (;;) {
      const rows = await db.prepare('FETCH FORWARD 1000 FROM wvn_resource_verify').all<Mapping>();
      if (!rows.length) break;
      for (const row of rows) { targetDigest.update(canonical(row)); targetRows++; }
    }
  } finally { await db.exec('CLOSE wvn_resource_verify'); }
  if (targetRows !== summary.total || targetDigest.digest('hex') !== summary.metadataSha256) throw new ResourceImportError('TARGET_MISMATCH');
}

/** 有界批次导入已冻结、已 verified 的只读 B2 映射；从不访问 B2 或资源字节。 */
export async function importResources(options: { db: PgDatabase; source: string; namespace: string; apply?: boolean; verify?: boolean; batchSize?: number }): Promise<ResourceImportReport> {
  const { db, namespace } = options;
  const batchSize = options.batchSize ?? 1000;
  if (!validNamespace(namespace) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000 || (options.apply && options.verify))
    throw new ResourceImportError('INVALID_OPTIONS');
  const runId = options.apply ? randomUUID() : undefined;
  let sqlite: DatabaseSync | undefined;
  let resumed = 0, inserted = 0, batches = 0;
  if (runId) await db.prepare("INSERT INTO wvn_resource_import_runs(id,namespace,status) VALUES($1,$2,'validating')").run(runId, namespace);
  try {
    const initial = statSync(options.source, { bigint: true });
    const checkSource = () => {
      if (existsSync(options.source + '-wal') && statSync(options.source + '-wal').size > 0) throw new ResourceImportError('SOURCE_UNSTABLE');
      const now = statSync(options.source, { bigint: true });
      if (now.size !== initial.size || now.mtimeNs !== initial.mtimeNs || now.ctimeNs !== initial.ctimeNs || now.ino !== initial.ino)
        throw new ResourceImportError('SOURCE_UNSTABLE');
    };
    checkSource();
    const fileHash = createHash('sha256');
    for await (const chunk of createReadStream(options.source)) fileHash.update(chunk);
    checkSource();
    const sourceSha256 = fileHash.digest('hex');
    if (runId) await db.prepare('UPDATE wvn_resource_import_runs SET source_sha256=$2,updated_at=now() WHERE id=$1').run(runId, sourceSha256);
    sqlite = new DatabaseSync(options.source, { readOnly: true });
    sqlite.exec('PRAGMA query_only=ON; BEGIN');
    if (sqlite.prepare('PRAGMA application_id').get()?.application_id !== 0x57564e43 || sqlite.prepare('PRAGMA user_version').get()?.user_version !== 1)
      throw new ResourceImportError('SOURCE_INVALID');
    const snapshot = sqlite.prepare('SELECT inventory_sha256 FROM b2_cas_snapshots WHERE namespace=?').get(namespace);
    if (typeof snapshot?.inventory_sha256 !== 'string' || !SHA256.test(snapshot.inventory_sha256)) throw new ResourceImportError('SOURCE_INVALID');
    const sourceCount = sqlite.prepare('SELECT count(*) AS n FROM b2_cas_sources WHERE namespace=?').get(namespace)!.n;
    const digest = createHash('sha256'); let total = 0, logicalBytes = 0;
    for (const raw of sqlite.prepare(sourceQuery + ' WHERE p.namespace=? ORDER BY p.original_path COLLATE BINARY').iterate(namespace)) {
      const row = mapping(raw, namespace); digest.update(canonical(row)); total++; logicalBytes += row.bytes;
      if (!Number.isSafeInteger(logicalBytes)) throw new ResourceImportError('SOURCE_INVALID', row.originalPath);
    }
    if (total === 0 || sourceCount !== total) throw new ResourceImportError('SOURCE_INVALID');
    const summary = { inventorySha256: snapshot.inventory_sha256, sourceSha256, metadataSha256: digest.digest('hex'), total, logicalBytes };
    checkSource();
    if (runId) await db.prepare('UPDATE wvn_resource_import_runs SET inventory_sha256=$2,metadata_sha256=$3,total=$4,updated_at=now() WHERE id=$1')
      .run(runId, summary.inventorySha256, summary.metadataSha256, total);
    let checkpoint = '';
    if (runId) {
      await db.transaction(async () => {
        let existing = await db.prepare('SELECT * FROM wvn_resource_snapshots WHERE namespace=$1 FOR UPDATE').get(namespace);
        checkSnapshot(existing, summary);
        if (existing?.lease_run_id && existing.lease_until && existing.lease_until.getTime() > Date.now()) throw new ResourceImportError('IMPORT_BUSY');
        if (!existing) {
          await db.prepare(`INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,source_sha256,metadata_sha256,total,logical_bytes)
            VALUES($1,$2,$3,$4,$5,$6)`).run(namespace, summary.inventorySha256, sourceSha256, summary.metadataSha256, total, logicalBytes);
          existing = await db.prepare('SELECT * FROM wvn_resource_snapshots WHERE namespace=$1').get(namespace);
        }
        if (!existing!.published) { checkpoint = existing!.checkpoint; resumed = existing!.processed; }
        await db.prepare(`UPDATE wvn_resource_snapshots SET lease_run_id=$2,lease_until=now()+interval '5 minutes'
          WHERE namespace=$1`).run(namespace, runId);
        await db.prepare(`UPDATE wvn_resource_import_runs SET status='running',source_sha256=$2,inventory_sha256=$3,
          metadata_sha256=$4,total=$5,processed=$6,checkpoint=$7,updated_at=now() WHERE id=$1`)
          .run(runId, sourceSha256, summary.inventorySha256, summary.metadataSha256, total, resumed, checkpoint);
      }, { lock: 'wvn:resource-import:' + namespace });
    } else checkSnapshot(await db.prepare('SELECT * FROM wvn_resource_snapshots WHERE namespace=$1').get(namespace), summary);
    const select = sqlite.prepare(sourceQuery + ' WHERE p.namespace=? AND p.original_path>? COLLATE BINARY ORDER BY p.original_path COLLATE BINARY LIMIT ?');
    let processed = resumed;
    for (;;) {
      checkSource();
      const rows = select.all(namespace, checkpoint, batchSize).map(raw => mapping(raw, namespace));
      if (!rows.length) break;
      const lastPath = rows.at(-1)!.originalPath;
      const created = await db.transaction(async () => {
        if (runId) {
          const lease = await db.prepare('SELECT lease_run_id FROM wvn_resource_snapshots WHERE namespace=$1 FOR UPDATE').get(namespace);
          if (lease?.lease_run_id !== runId) throw new ResourceImportError('IMPORT_LEASE_LOST');
        }
        const created = await checkBatch(db, rows, !!options.apply);
        checkSource();
        if (runId) {
          await db.prepare(`UPDATE wvn_resource_snapshots SET checkpoint=$2,processed=$3,lease_until=now()+interval '5 minutes' WHERE namespace=$1`)
            .run(namespace, lastPath, processed + rows.length);
          await db.prepare(`UPDATE wvn_resource_import_runs SET checkpoint=$2,processed=$3,inserted=$4,updated_at=now() WHERE id=$1`)
            .run(runId, lastPath, processed + rows.length, inserted + created);
        }
        return created;
      }, runId ? { lock: 'wvn:resource-import:' + namespace } : {});
      checkpoint = lastPath; processed += rows.length; inserted += created; batches++;
    }
    if (runId) {
      await db.transaction(async () => {
        const lease = await db.prepare('SELECT lease_run_id FROM wvn_resource_snapshots WHERE namespace=$1 FOR UPDATE').get(namespace);
        if (lease?.lease_run_id !== runId) throw new ResourceImportError('IMPORT_LEASE_LOST');
        await verifyTarget(db, namespace, summary);
        checkSource();
        await db.prepare(`UPDATE wvn_resource_snapshots SET published=true,processed=total,lease_run_id=NULL,lease_until=NULL,completed_at=now() WHERE namespace=$1`).run(namespace);
        await db.prepare("UPDATE wvn_resource_import_runs SET status='complete',updated_at=now(),finished_at=now() WHERE id=$1").run(runId);
      }, { lock: 'wvn:resource-import:' + namespace });
    }
    if (options.verify) await db.transaction(async () => { await verifyTarget(db, namespace, summary); checkSource(); });
    return { status: runId ? 'complete' : options.verify ? 'verified' : 'dry-run', namespace, ...summary, ...(runId ? { runId } : {}), inserted, resumed, batches };
  } catch (cause) {
    const error = cause instanceof ResourceImportError ? cause : new ResourceImportError(sqlite ? 'SOURCE_OR_DATABASE_ERROR' : 'SOURCE_UNREADABLE', undefined, cause);
    if (runId) {
      await db.prepare(`UPDATE wvn_resource_import_runs SET status='failed',error_code=$2,error_path=$3,updated_at=now(),finished_at=now() WHERE id=$1`)
        .run(runId, error.code, error.originalPath ?? null);
      await db.prepare('UPDATE wvn_resource_snapshots SET lease_run_id=NULL,lease_until=NULL WHERE namespace=$1 AND lease_run_id=$2').run(namespace, runId);
    }
    throw error;
  } finally { sqlite?.close(); }
}
