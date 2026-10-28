import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

export function backupRoot(prefix = 'wvn-pg-backup-') {
  const parent = join(process.cwd(), 'state');
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, prefix));
}

// 仅专用 QA 角色可创建独立物理库；cleanup 只删除当前实例创建的精确名称。
export async function restoreDatabase() {
  const source = process.env.WVN_TEST_DATABASE_URL;
  if (!source) throw Error('WVN_TEST_DATABASE_URL is required');
  const url = new URL(source);
  if (url.username !== 'wvn_qa' || url.pathname !== '/wvn_qa') throw Error('Dedicated QA database required');
  const name = 'wvn_restore_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString: source, max: 1 });
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  url.pathname = '/' + name;
  let closed = false;
  return {
    database: url.toString(),
    async close() {
      if (closed) return;
      closed = true;
      try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
      finally { await admin.end(); }
    },
  };
}
