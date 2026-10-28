import { chmodSync, closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { databaseProof, exportDatabaseSnapshot, postgresEnvironment, postgresTool, restoreEmptyDatabase, schemaName, type DatabaseProof } from '../database/pg-backup.ts';
import { blobPath, copyBlob, copyPrivate, fileProof, flush, ledgerEntries, mergedLedger, reserveSpace, ensureDirectory, newPrivateDirectory, sha256, verifyFile, writePrivate, type BackupFile, type FileProof } from './backup-files.server.ts';

export type AccountBackupManifest = {
  format: 'wvn-account-backup-v3'; createdAt: string; sharingEnabled: boolean;
  database: FileProof & DatabaseProof & { file: 'accounts.pgdump'; schema: string };
  files: BackupFile[];
  ledgers: { deletions: FileProof; shares?: FileProof };
  secret?: FileProof;
};
export type BackupOptions = { database: string; databaseSchema?: string; blobRoot: string; ledger: string; destination: string; shareLedger?: string; sharingEnabled?: boolean };

async function referencedFiles(client: PoolClient, proof: DatabaseProof): Promise<BackupFile[]> {
  const blobs = Object.hasOwn(proof.counts, 'wg_save_blobs'), refs = Object.hasOwn(proof.counts, 'wg_save_refs');
  if (blobs !== refs) throw Error('Incomplete private blob reference schema');
  if (!blobs) return [];
  if ((await client.query('SELECT 1 FROM wg_save_refs r LEFT JOIN wg_save_blobs b ON b.owner=r.owner AND b.hash=r.hash WHERE b.hash IS NULL LIMIT 1')).rowCount) throw Error('Dangling private blob reference: metadata missing');
  return (await client.query<{ owner: string; hash: string; bytes: string }>('SELECT b.owner,b.hash,b.bytes FROM wg_save_blobs b WHERE EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash) ORDER BY b.owner COLLATE "C",b.hash')).rows.map(row => {
    const file = { ownerHash: sha256(row.owner), hash: row.hash, bytes: Number(row.bytes) };
    blobPath('', file);
    return file;
  });
}

/** Web 主机只导出元数据，私有正文随后由存档主机按同一份引用清单合并。 */
export async function createBackupMetadata(options: Omit<BackupOptions, 'blobRoot'>): Promise<AccountBackupManifest> {
  postgresEnvironment(options.database);
  const schema = schemaName(options.databaseSchema);
  ledgerEntries(options.ledger);
  if (options.shareLedger) ledgerEntries(options.shareLedger);
  const destination = resolve(options.destination);
  if (existsSync(destination)) throw Error('Backup destination already exists');
  ensureDirectory(dirname(destination)); reserveSpace(dirname(destination), 0); newPrivateDirectory(destination);
  closeSync(openSync(join(destination, 'accounts.pgdump'), 'wx', 0o600));
  const result = await exportDatabaseSnapshot({ database: options.database, schema, dump: join(destination, 'accounts.pgdump') }, async (client) => {
    const shareRows = (await client.query("SELECT to_regclass($1) AS relation", [schema + '.wg_save_shares'])).rows[0].relation;
    const hasShares = shareRows && (await client.query('SELECT 1 FROM wg_save_shares LIMIT 1')).rowCount !== 0;
    if ((options.sharingEnabled || hasShares) && !options.shareLedger) throw Error('Share revocation ledger required for sharing-enabled backups');
    const size = Number((await client.query('SELECT COALESCE(sum(pg_total_relation_size(c.oid)),0)::bigint AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN (\'r\',\'m\')', [schema])).rows[0].n);
    reserveSpace(destination, size);
    const proof = await databaseProof(client, schema);
    const files = await referencedFiles(client, proof);
    writePrivate(join(destination, 'deletions.jsonl'), mergedLedger([options.ledger]));
    if (options.shareLedger) writePrivate(join(destination, 'share-revocations.jsonl'), mergedLedger([options.shareLedger]));
    return { proof, files };
  });
  const dump = join(destination, 'accounts.pgdump');
  // pg_dump 遵循调用者 umask；完成后强制私有模式并落盘。
  chmodSync(dump, 0o600); flush(dump);
  await postgresTool('pg_restore', ['--list', dump]);
  return {
    format: 'wvn-account-backup-v3', createdAt: new Date().toISOString(), sharingEnabled: !!options.shareLedger || !!options.sharingEnabled,
    database: { file: 'accounts.pgdump', schema, ...await fileProof(dump), ...result.proof },
    files: result.files,
    ledgers: { deletions: await fileProof(join(destination, 'deletions.jsonl')), ...(options.shareLedger ? { shares: await fileProof(join(destination, 'share-revocations.jsonl')) } : {}) },
  };
}

export async function createAccountBackup(options: BackupOptions) {
  const manifest = await createBackupMetadata(options);
  reserveSpace(options.destination, manifest.files.reduce((n, file) => n + file.bytes, 0));
  for (const file of manifest.files) {
    reserveSpace(options.destination, file.bytes);
    await copyBlob(blobPath(options.blobRoot, file), blobPath(join(options.destination, 'blobs'), file), file);
  }
  writePrivate(join(options.destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function readBackupManifest(backup: string, includeBlobs = true): Promise<AccountBackupManifest> {
  const manifest = JSON.parse(readFileSync(join(backup, 'manifest.json'), 'utf8')) as AccountBackupManifest;
  if (manifest.format !== 'wvn-account-backup-v3') throw Error('Legacy SQLite archive requires explicit prepareLegacyAccountRestore');
  if (!manifest.database || manifest.database.file !== 'accounts.pgdump' || !manifest.ledgers || !Array.isArray(manifest.files) || !manifest.database.counts || !manifest.database.digests) throw Error('Invalid backup manifest');
  if (typeof manifest.database.schema !== 'string') throw Error('Invalid backup schema');
  schemaName(manifest.database.schema);
  if (typeof manifest.sharingEnabled !== 'boolean' || ((manifest.sharingEnabled || manifest.database.counts.wg_save_shares > 0) && !manifest.ledgers.shares)) throw Error('Share revocation ledger required by backup manifest');
  const names = Object.keys(manifest.database.counts).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(manifest.database.digests).sort())) throw Error('Invalid database proof');
  for (const name of names) if (!name || !Number.isSafeInteger(manifest.database.counts[name]) || manifest.database.counts[name] < 0 || !/^[a-f0-9]{64}$/.test(manifest.database.digests[name])) throw Error('Invalid database proof');
  await verifyFile(join(backup, 'accounts.pgdump'), manifest.database);
  const header = await import('node:fs/promises').then(async fs => { const handle = await fs.open(join(backup, 'accounts.pgdump'), 'r'); try { const bytes = Buffer.alloc(5); await handle.read(bytes, 0, 5, 0); return bytes.toString(); } finally { await handle.close(); } });
  if (header !== 'PGDMP') throw Error('Invalid PostgreSQL custom archive');
  const unique = new Set<string>();
  for (const file of manifest.files) {
    const path = blobPath(join(backup, 'blobs'), file);
    if (unique.has(path)) throw Error('Duplicate backup blob reference'); unique.add(path);
    if (includeBlobs) await verifyFile(path, { sha256: file.hash, bytes: file.bytes });
  }
  await verifyFile(join(backup, 'deletions.jsonl'), manifest.ledgers.deletions); ledgerEntries(join(backup, 'deletions.jsonl'));
  if (manifest.ledgers.shares) { await verifyFile(join(backup, 'share-revocations.jsonl'), manifest.ledgers.shares); ledgerEntries(join(backup, 'share-revocations.jsonl')); }
  if (manifest.secret) await verifyFile(join(backup, 'secret'), manifest.secret);
  return manifest;
}

export async function prepareAccountRestore(options: { backup: string; currentLedger: string; currentShareLedger?: string; destination: string }) {
  const destination = resolve(options.destination);
  if (existsSync(destination)) throw Error('Restore destination already exists');
  const manifest = await readBackupManifest(options.backup);
  const deletions = mergedLedger([join(options.backup, 'deletions.jsonl'), options.currentLedger]);
  if (manifest.ledgers.shares && !options.currentShareLedger) throw Error('Current share revocation ledger required');
  const shares = options.currentShareLedger ? mergedLedger([...(manifest.ledgers.shares ? [join(options.backup, 'share-revocations.jsonl')] : []), options.currentShareLedger]) : undefined;
  ensureDirectory(dirname(destination));
  reserveSpace(dirname(destination), manifest.database.bytes + manifest.files.reduce((n, file) => n + file.bytes, 0));
  newPrivateDirectory(destination);
  copyPrivate(join(options.backup, 'accounts.pgdump'), join(destination, 'accounts.pgdump'));
  for (const file of manifest.files) { reserveSpace(destination, file.bytes); await copyBlob(blobPath(join(options.backup, 'blobs'), file), blobPath(join(destination, 'blobs'), file), file); }
  writePrivate(join(destination, 'deletions.jsonl'), deletions);
  if (shares !== undefined) writePrivate(join(destination, 'share-revocations.jsonl'), shares);
  if (manifest.secret) copyPrivate(join(options.backup, 'secret'), join(destination, 'secret'));
  const preparedManifest: AccountBackupManifest = { ...manifest, ledgers: { deletions: await fileProof(join(destination, 'deletions.jsonl')), ...(shares !== undefined ? { shares: await fileProof(join(destination, 'share-revocations.jsonl')) } : {}) } };
  writePrivate(join(destination, 'manifest.json'), JSON.stringify(preparedManifest, null, 2));
  const result = { status: 'prepared' as const, dump: join(destination, 'accounts.pgdump'), databaseSchema: manifest.database.schema, blobRoot: join(destination, 'blobs'), deletionLedger: join(destination, 'deletions.jsonl'), ...(shares !== undefined ? { shareLedger: join(destination, 'share-revocations.jsonl') } : {}), counts: manifest.database.counts, files: manifest.files.length, bytes: manifest.files.reduce((n, f) => n + f.bytes, 0), deletions: ledgerEntries(join(destination, 'deletions.jsonl')).size, revocations: shares === undefined ? 0 : ledgerEntries(join(destination, 'share-revocations.jsonl')).size };
  writePrivate(join(destination, 'restore-plan.json'), JSON.stringify(result, null, 2));
  return result;
}

/** 只导入显式提供的新空 PG 目标；调用方随后按常规启动服务重放合并账本。 */
export async function applyAccountRestore(options: { prepared: string; database: string }) {
  const manifest = await readBackupManifest(options.prepared);
  if (!existsSync(join(options.prepared, 'restore-plan.json'))) throw Error('Prepared restore plan required');
  const actual = await restoreEmptyDatabase(options.database, manifest.database.schema, join(options.prepared, 'accounts.pgdump'), { counts: manifest.database.counts, digests: manifest.database.digests }, async (client, proof) => {
    const referenced = await referencedFiles(client, proof);
    const compare = (files: BackupFile[]) => files.map(file => `${file.ownerHash}:${file.hash}:${file.bytes}`).sort();
    if (JSON.stringify(compare(referenced)) !== JSON.stringify(compare(manifest.files))) throw Error('Restored private file references differ from manifest');
  });
  const result = { status: 'database-restored' as const, databaseSchema: manifest.database.schema, counts: actual.counts, rowDigestsVerified: true, ledgerReplayRequired: true };
  return { ...result, database: options.database, blobRoot: join(options.prepared, 'blobs'), deletionLedger: join(options.prepared, 'deletions.jsonl'), ...(manifest.ledgers.shares ? { shareLedger: join(options.prepared, 'share-revocations.jsonl') } : {}) };
}

/** 旧归档仅离线准备，绝不把 SQLite 当运行时后端或自动导入 PG。 */
export async function prepareLegacyAccountRestore(options: { backup: string; currentLedger: string; currentShareLedger?: string; destination: string }) {
  const { prepareLegacyRestore } = await import('./backup-legacy.server.ts');
  return { ...await prepareLegacyRestore(options), status: 'legacy-conversion-required' as const };
}
