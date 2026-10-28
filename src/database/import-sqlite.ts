import { createReadStream, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PgDatabase, PgRow } from './postgres.ts';

type Column = { name: string; data_type: string };
type SourceTable = { name: string; columns: Column[]; primary: string[]; scanRowid?: boolean };
type TableReport = { name: string; sourceRows: number; targetRows: number; sourceSha256: string; targetSha256: string; matches: boolean };
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

function converted(value: unknown, column: Column): unknown {
  if (value === null) return null;
  if (column.data_type === 'boolean') {
    if (![0, 1, false, true].includes(value as number)) throw new Error('Invalid boolean column: ' + column.name);
    return value === 1 || value === true;
  }
  if (column.data_type.startsWith('timestamp')) {
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp column: ' + column.name);
    return date;
  }
  if (['json', 'jsonb'].includes(column.data_type) && typeof value === 'string') return JSON.parse(value);
  if (['bigint', 'integer', 'smallint', 'numeric', 'double precision', 'real'].includes(column.data_type)) {
    const n = Number(value);
    if (!Number.isFinite(n) || (column.data_type === 'bigint' && !Number.isSafeInteger(n)))
      throw new Error('Invalid numeric column: ' + column.name);
    return n;
  }
  return value;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return { bytes: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}

function rowBytes(row: PgRow, columns: Column[]) {
  return JSON.stringify(columns.map(c => canonical(converted(row[c.name], c)))) + '\n';
}

function sourceDigest(sqlite: DatabaseSync, table: SourceTable) {
  const selected = table.columns.map(c => quote(c.name)).join(',');
  const order = table.primary.map(c => quote(c) + ' COLLATE BINARY').join(',');
  const query = sqlite.prepare(`SELECT ${selected} FROM ${quote(table.name)} ORDER BY ${order}`);
  const digest = createHash('sha256');
  let rows = 0;
  for (const row of query.iterate()) { digest.update(rowBytes(row, table.columns)); rows++; }
  return { rows, sha256: digest.digest('hex') };
}

async function targetDigest(db: PgDatabase, table: SourceTable) {
  const selected = table.columns.map(c => quote(c.name)).join(',');
  const order = table.primary.map(name => {
    const c = table.columns.find(c => c.name === name)!;
    return quote(name) + (['text', 'character varying', 'character'].includes(c.data_type) ? ' COLLATE "C"' : '') + ' NULLS FIRST';
  }).join(',');
  // 服务端游标保持有界内存，避免把百万资源路径一次性读取到 Node 堆。
  await db.exec(`DECLARE wvn_import_cursor NO SCROLL CURSOR FOR SELECT ${selected} FROM ${quote(table.name)} ORDER BY ${order}`);
  const digest = createHash('sha256');
  let rows = 0;
  try {
    for (;;) {
      const batch = await db.prepare('FETCH FORWARD 1000 FROM wvn_import_cursor').all();
      if (!batch.length) break;
      for (const row of batch) { digest.update(rowBytes(row, table.columns)); rows++; }
    }
  } finally { await db.exec('CLOSE wvn_import_cursor'); }
  return { rows, sha256: digest.digest('hex') };
}

async function tableOrder(db: PgDatabase, tables: SourceTable[]) {
  const dependencies = await db.prepare(`SELECT child.relname AS child,parent.relname AS parent
    FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
    JOIN pg_class parent ON parent.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=child.relnamespace
    WHERE c.contype='f' AND NOT c.condeferrable AND n.nspname=current_schema()`).all();
  const result: SourceTable[] = [];
  const pending = new Map(tables.map(t => [t.name, t]));
  while (pending.size) {
    const next = [...pending.values()].find(t => !dependencies.some(d => d.child === t.name && d.parent !== t.name && pending.has(d.parent)));
    if (!next) throw new Error('Cyclic foreign keys require an explicit migration');
    result.push(next); pending.delete(next.name);
  }
  return result;
}

/** 只读一致性 SQLite 快照；逐表核对后整份原子提交，支持延迟循环外键。 */
export async function importSqlite(options: { source: string; db: PgDatabase; apply?: boolean }) {
  const { db } = options;
  const initial = statSync(options.source, { bigint: true });
  const checkSource = () => {
    const wal = options.source + '-wal';
    if (existsSync(wal) && statSync(wal).size > 0)
      throw new Error('Live SQLite WAL detected; create a consistent snapshot before importing');
    const now = statSync(options.source, { bigint: true });
    if (now.size !== initial.size || now.mtimeNs !== initial.mtimeNs || now.ino !== initial.ino)
      throw new Error('SQLite snapshot changed while importing');
  };
  checkSource();
  const fileHash = createHash('sha256');
  for await (const chunk of createReadStream(options.source)) fileHash.update(chunk);
  const sourceSha256 = fileHash.digest('hex');
  checkSource();
  const sqlite = new DatabaseSync(options.source, { readOnly: true });
  const reports: TableReport[] = [];
  try {
    sqlite.exec('BEGIN');
    return await db.transaction(async () => {
    const names = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const allColumns = await db.prepare('SELECT table_name,column_name,data_type,is_identity FROM information_schema.columns WHERE table_schema=current_schema()').all();
    const tables: SourceTable[] = names.map(({ name }) => {
      const columns = sqlite.prepare(`PRAGMA table_info(${quote(String(name))})`).all();
      const available = allColumns.filter(c => c.table_name === name);
      if (!available.length) throw new Error('Missing target table: ' + name);
      const primary = columns.filter(c => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(c => String(c.name));
      if (!primary.length) throw new Error('Source table has no primary key: ' + name);
      return {
        name: String(name), primary,
        scanRowid: available.some(c => c.is_identity === 'YES' && ['catalog_order', 'revision_order'].includes(c.column_name)) &&
          !/WITHOUT\s+ROWID/i.test(String(sqlite.prepare("SELECT sql FROM sqlite_schema WHERE name=?").get(name)?.sql)),
        columns: columns.map(c => {
          const column = available.find(a => a.column_name === c.name);
          if (!column) throw new Error('Missing target column: ' + name + '.' + c.name);
          return { name: String(c.name), data_type: column.data_type };
        }),
      };
    });
    const ordered = await tableOrder(db, tables);
    if (options.apply) await db.exec(`CREATE TABLE IF NOT EXISTS wvn_sqlite_imports(
      source_sha256 text NOT NULL,table_name text NOT NULL,row_count bigint NOT NULL,row_sha256 text NOT NULL,
      completed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_sha256,table_name)
    )`);
    for (const table of ordered) {
      const expected = sourceDigest(sqlite, table);
      const report = await db.transaction(async () => {
        if (options.apply) {
          await db.exec('SET CONSTRAINTS ALL DEFERRED');
          const selected = table.columns.map(c => quote(c.name)).join(',');
          const rows = sqlite.prepare(`SELECT ${selected} FROM ${quote(table.name)}${table.scanRowid ? " ORDER BY rowid" : ""}`).iterate();
          let batch: unknown[][] = [];
          const flush = async () => {
            if (!batch.length) return;
            const placeholders = batch.map((row, i) => '(' + row.map((_, j) => '$' + (i * table.columns.length + j + 1)).join(',') + ')').join(',');
            await db.prepare(`INSERT INTO ${quote(table.name)}(${selected}) VALUES ${placeholders} ON CONFLICT DO NOTHING`).run(...batch.flat());
            batch = [];
          };
          for (const row of rows) {
            batch.push(table.columns.map(c => converted(row[c.name], c)));
            if (batch.length >= Math.min(1000, Math.floor(60_000 / table.columns.length))) await flush();
          }
          await flush();
        }
        const actual = await targetDigest(db, table);
        const matches = expected.rows === actual.rows && expected.sha256 === actual.sha256;
        if (options.apply && !matches) throw new Error('PostgreSQL target differs from source: ' + table.name);
        if (options.apply) {
          for (const column of table.columns) {
            const sequence = await db.prepare('SELECT pg_get_serial_sequence($1,$2) AS name').get(quote(table.name), column.name);
            if (sequence?.name) await db.prepare(`SELECT setval($1::regclass,COALESCE((SELECT max(${quote(column.name)}) FROM ${quote(table.name)}),1),EXISTS(SELECT 1 FROM ${quote(table.name)}))`).get(sequence.name);
          }
          await db.prepare(`INSERT INTO wvn_sqlite_imports(source_sha256,table_name,row_count,row_sha256) VALUES($1,$2,$3,$4)
            ON CONFLICT(source_sha256,table_name) DO UPDATE SET row_count=excluded.row_count,row_sha256=excluded.row_sha256,completed_at=now()`)
            .run(sourceSha256, table.name, actual.rows, actual.sha256);
        }
        return { name: table.name, sourceRows: expected.rows, targetRows: actual.rows, sourceSha256: expected.sha256, targetSha256: actual.sha256, matches };
      });
      reports.push(report);
    }
    checkSource();
    return { status: options.apply ? 'complete' : 'dry-run', sourceSha256, tables: reports };
    }, { lock: 'wvn:sqlite-import' });
  } finally { sqlite.close(); }
}
