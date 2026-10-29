import { readFile } from 'node:fs/promises';
import { PgDatabase } from '../src/database/postgres.ts';
import { importHttpMetadata } from '../src/resources/http-metadata.ts';

let db: PgDatabase | undefined;
try {
  const args = process.argv.slice(2); const values: Record<string, string> = {}; let apply = false;
  const names = ['--proof', '--expected-proof-sha256', '--schema', '--namespace', '--inventory'];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply' && !apply) { apply = true; continue; }
    if (!names.includes(arg) || arg in values || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error();
    values[arg] = args[++i];
  }
  if (names.some(name => !values[name])) throw new Error();
  const url = process.env.WG_RESOURCE_DATABASE_URL ?? process.env.WG_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error();
  db = new PgDatabase(url, { schema: values['--schema'] });
  const result = await importHttpMetadata({ db, proofBytes: await readFile(values['--proof']), expectedProofSha256: values['--expected-proof-sha256'],
    namespace: values['--namespace'], inventorySha256: values['--inventory'], bucket: 'web-visual-novel', apply });
  console.log(JSON.stringify(result));
} catch {
  console.error('HTTP 元数据导入失败：请核对证明摘要、显式范围、已发布快照、对象大小、全部版本ID及既有证明；未提交任何变更。');
  process.exitCode = 1;
} finally { await db?.close(); }
