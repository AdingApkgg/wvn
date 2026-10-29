import { createHash } from 'node:crypto';
import type { PgDatabase } from '../database/postgres.ts';
import { migrate } from '../database/migrations.ts';
import { resourceMigrations } from './schema.ts';
import { SHA256 } from './types.ts';

export const HTTP_METADATA_SCOPE = Object.freeze({
  bucket: 'web-visual-novel',
  namespace: 'b2/web-visual-novel/snapshot-20261028',
  inventorySha256: 'fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01',
});
export type HttpMetadataObject = { sha256: string; bytes: number; contentType: string; versionId: string };
export type HttpMetadataProof = { schema: 1; bucket: string; namespace: string; inventorySha256: string; objects: HttpMetadataObject[] };
const MIME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+\/[A-Za-z0-9!#$%&'*+.^_`|~-]+(?:; *[A-Za-z0-9!#$%&'*+.^_`|~-]+=(?:[A-Za-z0-9!#$%&'*+.^_`|~-]+|"[\x20-\x21\x23-\x5b\x5d-\x7e]*"))*$/;
const invalid = () => new Error('HTTP_METADATA_PROOF_INVALID');
/** 文件摘要绑定原始字节；只允许已冻结桶、命名空间与清单，不接受任意对象覆盖。 */
export function parseHttpMetadataProof(proofBytes: Uint8Array, expectedProofSha256: string): HttpMetadataProof {
  if (!SHA256.test(expectedProofSha256) || createHash('sha256').update(proofBytes).digest('hex') !== expectedProofSha256) throw invalid();
  let value: HttpMetadataProof;
  try { value = JSON.parse(Buffer.from(proofBytes).toString('utf8')); } catch { throw invalid(); }
  if (!value || value.schema !== 1 || value.bucket !== HTTP_METADATA_SCOPE.bucket || value.namespace !== HTTP_METADATA_SCOPE.namespace
    || value.inventorySha256 !== HTTP_METADATA_SCOPE.inventorySha256 || !Array.isArray(value.objects) || !value.objects.length) throw invalid();
  const seen = new Set<string>();
  for (const row of value.objects) {
    if (!row || typeof row.sha256 !== 'string' || !SHA256.test(row.sha256) || seen.has(row.sha256)
      || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || typeof row.contentType !== 'string' || row.contentType.length > 512 || !MIME.test(row.contentType)
      || typeof row.versionId !== 'string' || !row.versionId.length || row.versionId.length > 2048 || /[\x00-\x1f\x7f]/.test(row.versionId)) throw invalid();
    seen.add(row.sha256);
  }
  return value;
}

export async function importHttpMetadata(options: {
  db: PgDatabase; proofBytes: Uint8Array; expectedProofSha256: string;
  namespace: string; inventorySha256: string; bucket: string; apply?: boolean;
}) {
  const proof = parseHttpMetadataProof(options.proofBytes, options.expectedProofSha256);
  if (options.namespace !== proof.namespace || options.inventorySha256 !== proof.inventorySha256 || options.bucket !== proof.bucket) throw invalid();
  const { db } = options;
  return db.transaction(async () => {
    // apply 阻止所有并发成员、快照发布状态及对象元数据变更；验证和写入共享同一原子边界。
    // dry-run 即便遇到旧 schema 也只做 SELECT，绝不自动迁移。
    if (options.apply) await db.exec('LOCK TABLE wvn_resource_objects,wvn_resources,wvn_resource_snapshots IN SHARE ROW EXCLUSIVE MODE');
    const snapshot = await db.prepare('SELECT 1 FROM wvn_resource_snapshots WHERE namespace=$1 AND inventory_sha256=$2 AND published=true').get(proof.namespace, proof.inventorySha256);
    if (!snapshot) throw invalid();
    const rows = await db.prepare(`SELECT r.sha256,o.bytes,r.target_file_id AS "versionId",
      to_jsonb(o)->>'http_content_type' AS "contentType",to_jsonb(o)->>'http_metadata_proof_sha256' AS proof
      FROM wvn_resources r JOIN wvn_resource_objects o ON o.sha256=r.sha256 WHERE r.namespace=$1`).all<{
        sha256: string; bytes: number; versionId: string; contentType: string | null; proof: string | null;
      }>(proof.namespace);
    const bySha = new Map(proof.objects.map(row => [row.sha256, row]));
    const referenced = new Set<string>(); const pending = new Set<string>();
    for (const row of rows) {
      const item = bySha.get(row.sha256);
      if (!item || item.bytes !== row.bytes || item.versionId !== row.versionId) throw invalid();
      referenced.add(row.sha256);
      if (row.contentType !== null || row.proof !== null) {
        if (row.contentType !== item.contentType || row.proof !== options.expectedProofSha256) throw new Error('HTTP_METADATA_CONFLICT');
      } else pending.add(row.sha256);
    }
    if (referenced.size !== bySha.size) throw invalid();
    if (options.apply) {
      await migrate(db, resourceMigrations);
      for (const sha of pending) await db.prepare(`UPDATE wvn_resource_objects SET http_content_type=$1,http_metadata_proof_sha256=$2 WHERE sha256=$3`)
        .run(bySha.get(sha)!.contentType, options.expectedProofSha256, sha);
    }
    return { status: options.apply ? 'complete' : 'dry-run', namespace: proof.namespace, inventorySha256: proof.inventorySha256,
      proofSha256: options.expectedProofSha256, objects: bySha.size, resources: rows.length, changed: pending.size };
  });
}
