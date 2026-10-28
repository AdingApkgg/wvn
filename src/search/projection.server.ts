import type { PgDatabase } from '../database/postgres.ts';
import type { SearchDocument } from './meili.server.ts';

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
/** 白名单投影：不读取磁盘路径、账号、存档、报告明细和存储 URL。 */
export async function documents(db: PgDatabase, ids: string[]): Promise<SearchDocument[]> {
  if (!ids.length) return [];
  const works = await db.prepare(`SELECT w.id,w.title,w.original_title,w.aliases,m.payload
    FROM works w LEFT JOIN work_metadata m ON m.work_id=w.id WHERE w.id=ANY($1::text[]) ORDER BY w.id`).all(ids);
  const versions = await db.prepare(`SELECT v.id,v.work_id,v.number,v.title,v.engine FROM versions v
    WHERE v.work_id=ANY($1::text[]) AND v.status='published' ORDER BY v.sort_order,v.number`).all(ids);
  const checks = await db.prepare(`SELECT r.version_id,r.payload::jsonb->>'status' AS status FROM reports r
    JOIN versions v ON v.id=r.version_id WHERE v.work_id=ANY($1::text[]) AND v.status='published'`).all(ids);
  return works.flatMap(w => {
    const visible = versions.filter(v => v.work_id === w.id);
    if (!visible.length || !/^[vb][1-9]\d{0,8}$/.test(w.id)) return [];
    const metadata = w.payload ? JSON.parse(w.payload) : {};
    const states = visible.flatMap(v => {
      const reports = checks.filter(c => c.version_id === v.id);
      return reports.length ? reports.map(c => c.status).filter((s): s is string => ['passed', 'failed', 'incomplete'].includes(s)) : ['unchecked'];
    });
    return [{ id: w.id, title: w.title, originalTitle: w.original_title, aliases: strings(JSON.parse(w.aliases)),
      titles: [...strings(metadata.titles?.map((t: { title?: unknown }) => t.title)), ...visible.map(v => v.title)],
      tags: strings(metadata.tags?.map((t: { name?: unknown }) => t.name)),
      engines: [...new Set(visible.map(v => v.engine as string))], states: [...new Set(states)],
      numbers: [w.id.slice(1), ...visible.map(v => String(v.number))],
    }];
  });
}
