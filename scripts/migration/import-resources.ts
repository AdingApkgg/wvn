import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { PgDatabase } from '../../src/database/postgres.ts';
import { migrate } from '../../src/database/migrations.ts';
import { resourceMigrations } from '../../src/resources/schema.ts';
import { importResources, ResourceImportError } from '../../src/resources/import.ts';

export async function main(args = process.argv.slice(2)) {
  const values: Record<string, string> = {}; let apply = false, verify = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--apply') { if (apply) throw new Error('Duplicate --apply'); apply = true; continue; }
    if (name === '--verify') { if (verify) throw new Error('Duplicate --verify'); verify = true; continue; }
    if (!['--source', '--namespace', '--schema', '--batch-size', '--report'].includes(name) || name in values || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('Usage: import-resources.ts --source resources.sqlite --namespace <namespace> --schema <isolated_schema> [--apply | --verify] [--batch-size 1000] [--report report.json]');
    values[name] = args[++i];
  }
  // CLI 强制显式选择 schema，避免将全量演练写进 public。
  if (!values['--source'] || !values['--namespace'] || !values['--schema'] || !process.env.DATABASE_URL || (apply && verify)) throw new Error('Source, namespace, explicit schema and DATABASE_URL are required; apply and verify are mutually exclusive');
  const db = new PgDatabase(process.env.DATABASE_URL, { schema: values['--schema'] });
  try {
    // schema 必须由操作方事先创建；迁移只创建该 schema 中的资源表。
    await migrate(db, resourceMigrations);
    const report = await importResources({ db, source: values['--source'], namespace: values['--namespace'], apply, verify,
      batchSize: values['--batch-size'] === undefined ? undefined : Number(values['--batch-size']) });
    if (values['--report']) await writeFile(values['--report'], JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report));
    return report;
  } finally { await db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ status: 'failed', code: error instanceof ResourceImportError ? error.code : 'IMPORT_FAILED', ...(error instanceof ResourceImportError && error.originalPath ? { originalPath: error.originalPath } : {}) }));
    process.exitCode = 1;
  });
}
