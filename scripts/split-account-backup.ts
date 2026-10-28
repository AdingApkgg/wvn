import { prepareSplitBackup, finalizeSplitBackup } from '../src/accounts/split-backup.server.ts';
import { readFileSync } from 'node:fs';
function env(name: string) { const value = process.env[name]; if (!value) throw Error(name + ' required'); return value; }
const mode = process.argv[2];
if (mode === 'prepare') console.log(JSON.stringify(await prepareSplitBackup({ database: env('WG_ACCOUNT_DATABASE'), databaseSchema: process.env.WG_ACCOUNT_DATABASE_SCHEMA, secret: env('WG_ACCOUNT_SECRET_FILE'), ledger: env('WG_ACCOUNT_DELETION_LEDGER'), shareLedger: env('WG_ACCOUNT_SHARE_LEDGER'), destination: env('WG_SPLIT_STAGE') })));
else if (mode === 'finalize') {
  const file = process.argv[3]; if (!file) throw Error('Private finalize configuration required');
  console.log(JSON.stringify(await finalizeSplitBackup(JSON.parse(readFileSync(file, 'utf8')))));
} else throw Error('Expected prepare or finalize');
