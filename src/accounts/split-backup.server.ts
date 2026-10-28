import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createBackupMetadata, prepareAccountRestore, readBackupManifest } from './backup.server.ts';
import { blobPath, copyBlob, copyPrivate, fileProof, reserveSpace, ensureDirectory, newPrivateDirectory, verifyFile, writePrivate, type FileProof } from './backup-files.server.ts';
const names = ['accounts.pgdump', 'secret', 'deletions.jsonl', 'share-revocations.jsonl', 'manifest.json'] as const;

export async function prepareSplitBackup(options: { database: string; databaseSchema?: string; secret: string; ledger: string; shareLedger: string; destination: string }) {
  const backup = await createBackupMetadata({ ...options, sharingEnabled: true });
  copyPrivate(options.secret, join(options.destination, 'secret'));
  backup.secret = await fileProof(join(options.destination, 'secret'));
  writePrivate(join(options.destination, 'manifest.json'), JSON.stringify(backup, null, 2));
  const files: Record<string, FileProof> = {};
  for (const name of names) files[name] = await fileProof(join(options.destination, name));
  const manifest = { format: 'wvn-split-metadata-v2', createdAt: backup.createdAt, files, counts: backup.database.counts, databaseSchema: backup.database.schema };
  writePrivate(join(options.destination, 'split-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export async function finalizeSplitBackup(options: { stage: string; blobRoot: string; destination: string; restoreDirectory: string }) {
  const split = JSON.parse(readFileSync(join(options.stage, 'split-manifest.json'), 'utf8'));
  if (split.format !== 'wvn-split-metadata-v2') throw Error('Legacy split metadata requires explicit offline conversion');
  for (const name of names) await verifyFile(join(options.stage, name), split.files?.[name]);
  const backup = await readBackupManifest(options.stage, false);
  if (JSON.stringify(backup.database.counts) !== JSON.stringify(split.counts) || backup.database.schema !== split.databaseSchema) throw Error('Split backup record counts differ');
  const destination = resolve(options.destination);
  if (existsSync(destination)) throw Error('Backup destination already exists');
  ensureDirectory(dirname(destination));
  reserveSpace(dirname(destination), backup.database.bytes + backup.files.reduce((n, f) => n + f.bytes, 0));
  newPrivateDirectory(destination);
  for (const name of names) copyPrivate(join(options.stage, name), join(destination, name));
  for (const file of backup.files) {
    reserveSpace(destination, file.bytes);
    await copyBlob(blobPath(options.blobRoot, file), blobPath(join(destination, 'blobs'), file), file);
  }
  const restore = await prepareAccountRestore({ backup: destination, currentLedger: join(options.stage, 'deletions.jsonl'), currentShareLedger: join(options.stage, 'share-revocations.jsonl'), destination: options.restoreDirectory });
  const result = { status: 'files-verified-restore-prepared' as const, databaseRestored: false, createdAt: backup.createdAt, destination, restoreDirectory: options.restoreDirectory, files: backup.files.length, counts: backup.database.counts, databaseSchema: restore.databaseSchema };
  writePrivate(join(destination, 'split-verification.json'), JSON.stringify(result, null, 2));
  return result;
}
