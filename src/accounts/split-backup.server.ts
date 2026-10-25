import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, statSync, statfsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createAccountBackup, prepareAccountRestore } from './backup.server.ts';
const names = ['accounts.sqlite', 'secret', 'deletions.jsonl', 'share-revocations.jsonl'] as const;
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function flush(file: string) { const fd = openSync(file, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function counts(file: string) {
 const db = new DatabaseSync(file, { readOnly: true });
 try {
  if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw Error('Backup database integrity failed');
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => [String(row.name), Number(db.prepare('SELECT count(*) n FROM "' + String(row.name).replaceAll('"','""') + '"').get()?.n)]));
 } finally { db.close(); }
}
export function prepareSplitBackup(options: { database: string; secret: string; ledger: string; shareLedger: string; destination: string }) {
 const destination = resolve(options.destination);
 if (existsSync(destination)) throw Error('Backup staging already exists');
 mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
 const disk = statfsSync(dirname(destination));
 if (disk.bavail * disk.bsize < 1024 ** 3 + statSync(options.database).size) throw Error('Metadata backup needs one GiB reserved on web host');
 mkdirSync(destination, { mode: 0o700 });
 const db = new DatabaseSync(options.database);
 try { db.prepare('VACUUM INTO ?').run(join(destination, 'accounts.sqlite')); } finally { db.close(); }
 for (const [source, name] of [[options.secret, 'secret'], [options.ledger, 'deletions.jsonl'], [options.shareLedger, 'share-revocations.jsonl']]) copyFileSync(source, join(destination, name));
 for (const name of names) flush(join(destination, name));
 const manifest = { format: 'wg-split-metadata-v1', createdAt: new Date().toISOString(), files: Object.fromEntries(names.map(name => [name, hash(join(destination, name))])), counts: counts(join(destination, 'accounts.sqlite')) };
 writeFileSync(join(destination, 'split-manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 }); flush(join(destination, 'split-manifest.json')); return manifest;
}
export function finalizeSplitBackup(options: { stage: string; blobRoot: string; destination: string; restoreDirectory: string }) {
 const manifest = JSON.parse(readFileSync(join(options.stage, 'split-manifest.json'), 'utf8'));
 if (manifest.format !== 'wg-split-metadata-v1') throw Error('Invalid split metadata');
 for (const name of names) if (hash(join(options.stage, name)) !== manifest.files?.[name]) throw Error('Split metadata hash mismatch');
 const sameCounts = (file: string) => { if (JSON.stringify(counts(file)) !== JSON.stringify(manifest.counts)) throw Error('Split backup record counts differ'); };
 sameCounts(join(options.stage, 'accounts.sqlite'));
 const backup = createAccountBackup({ database: join(options.stage, 'accounts.sqlite'), blobRoot: options.blobRoot, ledger: join(options.stage, 'deletions.jsonl'), shareLedger: join(options.stage, 'share-revocations.jsonl'), destination: options.destination });
 copyFileSync(join(options.stage, 'secret'), join(options.destination, 'secret')); flush(join(options.destination, 'secret'));
 if (hash(join(options.destination, 'secret')) !== manifest.files.secret) throw Error('Backup secret hash mismatch');
 sameCounts(join(options.destination, 'accounts.sqlite'));
 const restore = prepareAccountRestore({ backup: options.destination, currentLedger: join(options.stage, 'deletions.jsonl'), currentShareLedger: join(options.stage, 'share-revocations.jsonl'), destination: options.restoreDirectory });
 sameCounts(restore.database);
 const result = { status: 'verified', createdAt: backup.createdAt, destination: options.destination, restoreDirectory: options.restoreDirectory, files: backup.files.length, counts: manifest.counts };
 writeFileSync(join(options.destination, 'split-verification.json'), JSON.stringify(result, null, 2), { mode: 0o600 }); return result;
}
