import { applyAccountRestore, createAccountBackup, prepareAccountRestore, prepareLegacyAccountRestore } from '../src/accounts/backup.server.ts';
function env(name: string) { const value = process.env[name]; if (!value) throw Error(`${name} is required`); return value; }
const mode = process.argv[2] ?? 'backup';
if (mode === 'restore' || mode === 'legacy-prepare') {
  const prepare = mode === 'restore' ? prepareAccountRestore : prepareLegacyAccountRestore;
  console.log(JSON.stringify(await prepare({ backup: env('WG_ACCOUNT_BACKUP_FROM'), currentLedger: env('WG_ACCOUNT_DELETION_LEDGER'), currentShareLedger: process.env.WG_ACCOUNT_SHARE_LEDGER, destination: env('WG_ACCOUNT_RESTORE_DIR') }), null, 2));
} else if (mode === 'apply') {
  const result = await applyAccountRestore({ prepared: env('WG_ACCOUNT_RESTORE_DIR'), database: env('WG_ACCOUNT_RESTORE_DATABASE') });
  // 连接字符串含密码，永远不序列化到操作回执。
  const { database: _database, ...safe } = result;
  console.log(JSON.stringify(safe, null, 2));
} else if (mode === 'backup') {
  if (process.env.WG_BLOB_UPSTREAM) throw Error('Split storage requires scripts/backup-split-web.py to join metadata and storage-host blobs');
  const manifest = await createAccountBackup({ database: env('WG_ACCOUNT_DATABASE'), databaseSchema: process.env.WG_ACCOUNT_DATABASE_SCHEMA, blobRoot: env('WG_ACCOUNT_BLOBS'), ledger: env('WG_ACCOUNT_DELETION_LEDGER'), shareLedger: process.env.WG_ACCOUNT_SHARE_LEDGER, destination: env('WG_ACCOUNT_BACKUP_DIR') });
  console.log(JSON.stringify({ status: 'complete', createdAt: manifest.createdAt, files: manifest.files.length, counts: manifest.database.counts }, null, 2));
} else throw Error('Expected backup, restore, apply or legacy-prepare');
