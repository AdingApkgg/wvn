import type { PgDatabase } from '../database/postgres.ts';
import type { SearchDocument } from './meili.server.ts';
import type { PublicWork } from '../types.ts';
import type { WorkMetadata } from '../metadata.ts';
import { workTextFingerprint } from '../content/classification.server.ts';

/** 筛选的是版本本身，不能只保留整部作品而继续输出其他版本。 */
export function filterContentVersions(work: PublicWork, content: string): PublicWork | null {
  if (!content) return work;
  const versions = work.versions.filter(version => (version.classification?.sexualContent ?? 'unknown') === content);
  if (!versions.length) return null;
  return { ...work, versions,
    defaultVersionId: versions.some(version => version.id === work.defaultVersionId) ? work.defaultVersionId : versions[0].id };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
/** 白名单投影：不读取磁盘路径、账号、存档、报告明细和存储 URL。 */
export async function documents(db: PgDatabase, ids: string[]): Promise<SearchDocument[]> {
  if (!ids.length) return [];
  const works = await db.prepare(`SELECT w.id,w.title,w.original_title,w.aliases,w.evidence,m.payload
    FROM works w LEFT JOIN work_metadata m ON m.work_id=w.id WHERE w.id=ANY($1::text[]) ORDER BY w.id`).all(ids);
  const versions = await db.prepare(`SELECT v.id,v.work_id,v.number,v.title,v.engine,v.notes,v.language FROM versions v
    WHERE v.work_id=ANY($1::text[]) AND v.status='published' ORDER BY v.sort_order,v.number`).all(ids);
  const checks = await db.prepare(`SELECT r.version_id,r.payload::jsonb->>'status' AS status FROM reports r
    JOIN versions v ON v.id=r.version_id WHERE v.work_id=ANY($1::text[]) AND v.status='published'`).all(ids);
  const classifications = await db.prepare(`SELECT kind,id,payload,fingerprint FROM content_classifications
    WHERE (kind='work' AND id=ANY($1::text[])) OR (kind='version' AND id=ANY($2::text[]))`).all(ids, versions.map(version => version.id));
  const workClass = new Map(classifications.filter(row => row.kind === 'work').map(row => [row.id, { ...JSON.parse(row.payload), fingerprint: row.fingerprint }]));
  const versionClass = new Map(classifications.filter(row => row.kind === 'version').map(row => [row.id, JSON.parse(row.payload)]));
  return works.flatMap(w => {
    const visible = versions.filter(v => v.work_id === w.id);
    if (!visible.length || !/^[vb][1-9]\d{0,8}$/.test(w.id)) return [];
    const metadata = w.payload ? JSON.parse(w.payload) : {};
    const classification = workClass.get(w.id);
    const fingerprint = workTextFingerprint({ title: w.title, originalTitle: w.original_title, aliases: strings(JSON.parse(w.aliases)), evidence: w.evidence },
      w.payload ? metadata as WorkMetadata : undefined,
      visible.map(version => ({ id: version.id, title: version.title, notes: version.notes, language: version.language })));
    const pageSuitability = classification?.fingerprint === fingerprint && ['sfw', 'nsfw'].includes(classification.pageSuitability)
      ? classification.pageSuitability as 'sfw' | 'nsfw' : 'unknown';
    const states = visible.flatMap(v => {
      const reports = checks.filter(c => c.version_id === v.id);
      return reports.length ? reports.map(c => c.status).filter((s): s is string => ['passed', 'failed', 'incomplete'].includes(s)) : ['unchecked'];
    });
    return [{ id: w.id, title: w.title, originalTitle: w.original_title, aliases: strings(JSON.parse(w.aliases)),
      titles: [...strings(metadata.titles?.map((t: { title?: unknown }) => t.title)), ...visible.map(v => v.title)],
      tags: strings(metadata.tags?.map((t: { name?: unknown }) => t.name)),
      engines: [...new Set(visible.map(v => v.engine as string))], states: [...new Set(states)],
      numbers: [w.id.slice(1), ...visible.map(v => String(v.number))],
      pageSuitability,
      sexualContents: [...new Set(visible.map(version => versionClass.get(version.id)?.sexualContent ?? 'unknown'))],
    }];
  });
}
