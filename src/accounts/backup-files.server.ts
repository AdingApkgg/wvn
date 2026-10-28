import { createHash } from 'node:crypto';
import { createReadStream, chmodSync, closeSync, copyFileSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type BackupFile = { ownerHash: string; hash: string; bytes: number };
export type FileProof = { sha256: string; bytes: number };
export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function reserveSpace(root: string, bytes: number, reserve = 62 * 1024 ** 3) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('Invalid backup byte count');
  const stat = statfsSync(root);
  if (stat.bavail * stat.bsize < reserve + bytes) throw Error('Backup stopped at reserved disk-space threshold');
}
export function flush(file: string) { const fd = openSync(file, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function flushDirectory(directory: string) { if (process.platform !== 'win32') flush(directory); }
export function ensureDirectory(directory: string) { mkdirSync(directory, { recursive: true, mode: 0o700 }); }
export function secureDirectory(directory: string) { ensureDirectory(directory); chmodSync(directory, 0o700); }
export function newPrivateDirectory(directory: string) { mkdirSync(directory, { mode: 0o700 }); }
export function writePrivate(file: string, value: string) { writeFileSync(file, value, { mode: 0o600, flag: 'wx' }); flush(file); flushDirectory(dirname(file)); }
export function copyPrivate(source: string, destination: string) {
  if (!lstatSync(source).isFile()) throw Error('Backup source must be a regular file');
  secureDirectory(dirname(destination));
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
  chmodSync(destination, 0o600); flush(destination); flushDirectory(dirname(destination));
}
export async function fileProof(file: string): Promise<FileProof> {
  const stat = lstatSync(file);
  if (!stat.isFile() || !Number.isSafeInteger(stat.size)) throw Error('Invalid backup file');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return { sha256: digest.digest('hex'), bytes: stat.size };
}
export async function verifyFile(file: string, expected: FileProof) {
  if (!expected || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.bytes) || expected.bytes < 0)
    throw Error('Invalid backup file proof');
  const actual = await fileProof(file);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw Error('Backup file hash or bytes mismatch');
}
export function blobPath(root: string, file: BackupFile) {
  if (!file || !/^[a-f0-9]{64}$/.test(file.ownerHash) || !/^[a-f0-9]{64}$/.test(file.hash) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 32 * 1024 ** 2)
    throw Error('Invalid backup manifest');
  return join(root, file.ownerHash, file.hash + '.bin');
}
export async function copyBlob(source: string, target: string, file: BackupFile) {
  await verifyFile(source, { sha256: file.hash, bytes: file.bytes });
  copyPrivate(source, target);
  await verifyFile(target, { sha256: file.hash, bytes: file.bytes });
}
export function ledgerEntries(file: string) {
  if (!existsSync(file) || !lstatSync(file).isFile()) throw Error('Existing independent ledger required');
  const result = new Map<string, number>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let value: { userId: string; deletedAt: number };
    try { value = JSON.parse(line); } catch { throw Error('Invalid or incomplete ledger record'); }
    if (!value || typeof value.userId !== 'string' || !value.userId || !Number.isSafeInteger(value.deletedAt) || value.deletedAt < 0) throw Error('Invalid ledger record');
    result.set(value.userId, Math.max(result.get(value.userId) ?? 0, value.deletedAt));
  }
  return result;
}
export function mergedLedger(files: string[]) {
  const combined = new Map<string, number>();
  for (const file of files) for (const [id, time] of ledgerEntries(file)) combined.set(id, Math.max(combined.get(id) ?? 0, time));
  return [...combined].sort(([a], [b]) => a.localeCompare(b)).map(([userId, deletedAt]) => JSON.stringify({ userId, deletedAt }) + '\n').join('');
}
