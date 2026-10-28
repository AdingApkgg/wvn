import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { blobPath, copyBlob, copyPrivate, ledgerEntries, mergedLedger, reserveSpace, fileProof, ensureDirectory, newPrivateDirectory, writePrivate, type BackupFile } from './backup-files.server.ts';

/** V1/V2 SQLite 归档的显式离线路径；返回的文件只能交给离线迁移器。 */
export async function prepareLegacyRestore(options: { backup: string; currentLedger: string; currentShareLedger?: string; destination: string }) {
  const destination = resolve(options.destination);
  if (existsSync(destination)) throw Error('Restore destination already exists');
  const manifest = JSON.parse(readFileSync(join(options.backup, 'manifest.json'), 'utf8'));
  const source = join(options.backup, 'accounts.sqlite');
  if (!['wg-account-backup-v1', 'wg-account-backup-v2'].includes(manifest.format) || !Array.isArray(manifest.files) || (await fileProof(source)).sha256 !== manifest.databaseSha256) throw Error('Invalid legacy backup database');
  const snapshot = new DatabaseSync(source, { readOnly: true });
  let hasShares = false;
  try {
    if (snapshot.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw Error('Legacy SQLite integrity failed');
    if (snapshot.prepare("SELECT 1 FROM sqlite_master WHERE name='wg_save_shares' AND type='table'").get()) hasShares = !!snapshot.prepare('SELECT 1 FROM wg_save_shares LIMIT 1').get();
  } finally { snapshot.close(); }
  const oldShare = join(options.backup, 'share-revocations.jsonl');
  if ((manifest.format === 'wg-account-backup-v2' || hasShares) && (!existsSync(oldShare) || !options.currentShareLedger)) throw Error('Current and archived share revocation ledgers required');
  const deletions = mergedLedger([join(options.backup, 'deletions.jsonl'), options.currentLedger]);
  const shares = options.currentShareLedger ? mergedLedger([...(existsSync(oldShare) ? [oldShare] : []), options.currentShareLedger]) : undefined;
  for (const file of manifest.files as BackupFile[]) blobPath(destination, file);
  ensureDirectory(dirname(destination));
  reserveSpace(dirname(destination), statSync(source).size + manifest.files.reduce((n: number, file: BackupFile) => n + file.bytes, 0));
  newPrivateDirectory(destination); copyPrivate(source, join(destination, 'accounts.sqlite'));
  copyPrivate(join(options.backup, 'manifest.json'), join(destination, 'manifest.json'));
  if ((await fileProof(join(destination, 'accounts.sqlite'))).sha256 !== manifest.databaseSha256) throw Error('Legacy database copy hash mismatch');
  for (const file of manifest.files as BackupFile[]) await copyBlob(blobPath(join(options.backup, 'blobs'), file), blobPath(join(destination, 'blobs'), file), file);
  writePrivate(join(destination, 'deletions.jsonl'), deletions);
  if (shares !== undefined) writePrivate(join(destination, 'share-revocations.jsonl'), shares);
  return { database: join(destination, 'accounts.sqlite'), blobRoot: join(destination, 'blobs'), deletionLedger: join(destination, 'deletions.jsonl'), ...(shares !== undefined ? { shareLedger: join(destination, 'share-revocations.jsonl') } : {}), deletions: ledgerEntries(join(destination, 'deletions.jsonl')).size, warning: 'Legacy archive has no authenticated ledger hashes; independently review retained ledgers before offline conversion' };
}
