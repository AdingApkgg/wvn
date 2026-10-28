import { parseArgs } from 'node:util';
import { importSqlite } from '../../src/database/import-sqlite.ts';
import { PgDatabase } from '../../src/database/postgres.ts';

const { values } = parseArgs({ options: { source: { type: 'string' }, schema: { type: 'string' }, apply: { type: 'boolean', default: false } } });
if (!values.source || !values.schema || !process.env.DATABASE_URL) throw new Error('--source, explicit --schema and DATABASE_URL are required');
const db = new PgDatabase(process.env.DATABASE_URL, { schema: values.schema });
try {
  const report = await importSqlite({ source: values.source, db, apply: values.apply });
  console.log(JSON.stringify(report));
} finally { await db.close(); }
