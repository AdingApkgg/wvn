import { PgDatabase, type PgRow } from "../database/postgres.ts";
import { migrate } from "../database/migrations.ts";
import { catalogMigrations } from "../database/catalog.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  workIdPattern,
  parseWorkSlug,
  workSlug,
  providerLink,
} from "../identity.ts";
import { metadataDocument, type WorkMetadata } from "../metadata.ts";
import type { CatalogSeed, Version, PublicWork, Check } from "../types.ts";
export class Conflict extends Error {
  constructor() {
    super("记录已被其他操作更新，请刷新后重试");
  }
}
export const workId = z.string().regex(workIdPattern);
const label = z.string().trim().min(1).max(300);
export function legacyPath(input: string) {
  const s = decodeURIComponent(input);
  if (
    !s.startsWith("/") ||
    s.startsWith("//") ||
    !s.endsWith("/") ||
    /[\\%?#\u0000-\u001f]/.test(s) ||
    s.split("/").some((x) => x === "." || x === "..") ||
    /^\/(?:b)?[0-9]+(?:\/|$)/.test(s) ||
    /^\/(?:api|assets|media|manage|health)(?:\/|$)/.test(s)
  )
    throw Error("无效资源入口");
  return s;
}
const versionInput = z
  .object({
    title: label,
    legacyPath: z.string().transform(legacyPath),
    engine: z.enum(["ONS", "Artemis", "RenPy", "Tyrano"]),
    language: z.string().max(80).optional(),
    notes: z.string().max(4000).optional(),
    sortOrder: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();
const workPatch = z
  .object({
    title: label.optional(),
    aliases: z.array(label).max(50).optional(),
    defaultVersionId: z.string().max(100).nullable().optional(),
  })
  .strict();
const versionPatch = z
  .object({
    title: label.optional(),
    status: z.enum(["published", "hidden", "deleted"]).optional(),
    language: z.string().max(80).optional(),
    notes: z.string().max(4000).optional(),
    sortOrder: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();
const reportSchema = z
  .object({
    versionId: z.string().max(100),
    kind: z.enum(["resources", "http", "startup"]),
    runId: z.string().min(1).max(100),
    startedAt: z.iso.datetime({ offset: true }),
    checkedAt: z.iso.datetime({ offset: true }),
    status: z.enum(["passed", "failed", "incomplete"]),
    detail: z.string().max(5000),
  })
  .strict();
function versionRow(r: PgRow): Version {
  return { id: r.id, workId: r.work_id, number: r.number, title: r.title,
    legacyPath: r.legacy_path, engine: r.engine, revision: r.revision, status: r.status,
    createdAt: r.created_at, language: r.language, notes: r.notes, sortOrder: r.sort_order };
}

export class Store {
  readonly database: PgDatabase;
  readonly ready: Promise<void>;
  constructor(database: PgDatabase | string) {
    this.database = typeof database === 'string' ? new PgDatabase(database) : database;
    this.ready = migrate(this.database, catalogMigrations);
  }
  private async workRows(id?: string) {
    await this.ready;
    return this.database.prepare(`SELECT id,title,original_title AS "originalTitle",aliases,evidence,
      next_number AS "nextNumber",revision,default_id AS "defaultId" FROM works${id ? ' WHERE id=$1' : ''} ORDER BY catalog_order,id`)
      .all(...(id ? [id] : []));
  }
  async close() { await this.database.close(); }
  async tx<T>(fn: () => T | Promise<T>): Promise<T> {
    await this.ready;
    return this.database.transaction(fn, { lock: 'wvn:catalog-write' });
  }
  async seed(seed: CatalogSeed) {
    await this.tx(async () => {
      for (const w of seed.works) {
        workId.parse(w.id); label.parse(w.title);
        await this.database.prepare('INSERT INTO works(id,title,original_title,aliases,evidence,next_number,revision,default_id) VALUES($1,$2,$3,$4,$5,1,1,NULL) ON CONFLICT(id) DO NOTHING')
          .run(w.id, w.title, w.originalTitle, JSON.stringify(w.aliases), w.evidence);
      }
      for (const v of seed.versions) {
        const old = await this.raw(v.id);
        if (old) {
          if (old.legacyPath !== legacyPath(v.legacyPath)) throw Error('种子身份冲突');
        } else {
          const value = versionInput.parse({ title: v.title, legacyPath: v.legacyPath, engine: v.engine });
          await this.insert(v.workId, value, v.id, v.number);
        }
        await this.database.prepare('DELETE FROM pending WHERE id=$1').run(v.id);
      }
      for (const p of seed.pending ?? []) if (!await this.raw(p.id))
        await this.database.prepare('INSERT INTO pending VALUES($1,$2) ON CONFLICT(id) DO NOTHING').run(p.id, JSON.stringify(p));
      for (const w of seed.works)
        await this.database.prepare(`UPDATE works SET default_id=(SELECT id FROM versions WHERE work_id=$1 AND status='published' ORDER BY number LIMIT 1)
          WHERE id=$1 AND default_id IS NULL`).run(w.id);
    });
  }
  private async insert(id: string, input: { title: string; legacyPath: string; engine: string; language?: string; notes?: string; sortOrder?: number }, uuid: string = randomUUID(), slot?: number): Promise<Version> {
    workId.parse(id);
    const row = (await this.workRows(id))[0];
    if (!row) throw Error('作品不存在');
    const number = slot ?? row.nextNumber;
    if (slot && slot < row.nextNumber) throw Error('编号不可复用');
    await this.database.prepare(`INSERT INTO versions(id,work_id,number,title,legacy_path,engine,revision,status,created_at,language,notes,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,1,'published',$7,$8,$9,$10)`)
      .run(uuid, id, number, input.title, input.legacyPath, input.engine, new Date().toISOString(), input.language ?? '未标注', input.notes ?? '', input.sortOrder ?? number);
    await this.database.prepare('INSERT INTO routes VALUES($1,$2,$3)').run(id, number, uuid);
    await this.database.prepare('UPDATE works SET next_number=$1,revision=revision+1 WHERE id=$2').run(number + 1, id);
    return (await this.raw(uuid))!;
  }
  async raw(uuid: string): Promise<Version | undefined> {
    await this.ready;
    const row = await this.database.prepare('SELECT * FROM versions WHERE id=$1').get(uuid);
    return row ? versionRow(row) : undefined;
  }
  async addVersion(id: string, input: unknown) {
    const value = versionInput.parse(input);
    return this.tx(async () => {
      const v = await this.insert(id, value);
      await this.database.prepare('UPDATE works SET default_id=$1 WHERE id=$2 AND default_id IS NULL').run(v.id, id);
      return v;
    });
  }
  async list(includeHidden = false): Promise<PublicWork[]> {
    await this.ready;
    const works = await this.workRows();
    const versions = await this.database.prepare('SELECT * FROM versions ORDER BY sort_order,number').all();
    const metadata = await this.database.prepare('SELECT work_id,payload FROM work_metadata').all();
    const reports = await this.database.prepare('SELECT version_id,payload FROM reports ORDER BY kind').all();
    const meta = new Map(metadata.map(r => [r.work_id, JSON.parse(r.payload) as WorkMetadata]));
    return works.map(w => ({
      id: w.id, title: w.title, originalTitle: w.originalTitle, aliases: JSON.parse(w.aliases), evidence: w.evidence,
      ...(meta.has(w.id) ? { metadata: meta.get(w.id) } : {}), revision: w.revision,
      defaultVersionId: w.defaultId, url: `/${workSlug(w.id)}/`,
      versions: versions.filter(v => v.work_id === w.id && (includeHidden || v.status === 'published')).map(row => {
        const v = versionRow(row);
        return { id: v.id, workId: v.workId, number: v.number, title: v.title, engine: v.engine,
          language: v.language, notes: v.notes, sortOrder: v.sortOrder, revision: v.revision,
          url: `/${workSlug(v.workId)}/${v.number}/`, launchPath: encodeURI(v.legacyPath),
          checks: reports.filter(r => r.version_id === v.id).map(r => {
            const check = JSON.parse(r.payload) as Check;
            return includeHidden ? check : { ...check, detail: '' };
          }), ...(includeHidden ? { status: v.status } : {}) };
      }),
    }));
  }
  async get(id: string, includeHidden = false) { return (await this.list(includeHidden)).find(w => w.id === id); }
  async resolveLegacy(path: string) {
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { return; }
    await this.ready;
    const row = await this.database.prepare("SELECT * FROM versions WHERE legacy_path=$1 AND status='published'").get(decoded);
    return row ? versionRow(row) : undefined;
  }
  async resolveRoute(slug: string, number: string) {
    const id = parseWorkSlug(slug);
    if (!id || !/^[1-9]\d{0,8}$/.test(number)) return;
    await this.ready;
    const row = await this.database.prepare(`SELECT v.* FROM routes r JOIN versions v ON v.id=r.version_id
      WHERE r.work_id=$1 AND r.number=$2 AND v.status='published'`).get(id, Number(number));
    return row ? versionRow(row) : undefined;
  }
  async editWork(id: string, revision: number, input: unknown) {
    const patch = workPatch.parse(input);
    return this.tx(async () => {
      const w = await this.get(id, true);
      if (!w) throw Error('作品不存在');
      if (w.revision !== revision) throw new Conflict();
      if (patch.defaultVersionId) {
        const v = await this.raw(patch.defaultVersionId);
        if (v?.workId !== id || v.status !== 'published') throw Error('默认版本必须属于本作品且可见');
      }
      await this.database.prepare('UPDATE works SET title=$1,aliases=$2,default_id=$3,revision=revision+1 WHERE id=$4')
        .run(patch.title ?? w.title, JSON.stringify(patch.aliases ?? w.aliases), patch.defaultVersionId === undefined ? w.defaultVersionId : patch.defaultVersionId, id);
      return (await this.get(id, true))!;
    });
  }
  async editVersion(uuid: string, revision: number, input: unknown) {
    const patch = versionPatch.parse(input);
    return this.tx(async () => {
      const v = await this.raw(uuid);
      if (!v) throw Error('版本不存在');
      if (v.revision !== revision) throw new Conflict();
      if (v.status === 'deleted') throw Error('已删除的编号不可恢复或复用');
      if (patch.status && patch.status !== 'published' && (await this.get(v.workId, true))?.defaultVersionId === uuid)
        throw Error('请先调整默认版本');
      await this.database.prepare('UPDATE versions SET title=$1,status=$2,language=$3,notes=$4,sort_order=$5,revision=revision+1 WHERE id=$6')
        .run(patch.title ?? v.title, patch.status ?? v.status, patch.language ?? v.language, patch.notes ?? v.notes, patch.sortOrder ?? v.sortOrder, uuid);
      return (await this.raw(uuid))!;
    });
  }
  async reassignVersion(uuid: string, target: string, revision: number) {
    workId.parse(target);
    return this.tx(async () => {
      const v = await this.raw(uuid);
      if (!v) throw Error('版本不存在');
      if (v.revision !== revision) throw new Conflict();
      if (v.status === 'deleted' || v.workId === target) throw Error('无效改归属');
      const w = (await this.workRows(target))[0];
      if (!w) throw Error('目标作品不存在');
      const slot = w.nextNumber;
      await this.database.prepare('UPDATE versions SET work_id=$1,number=$2,revision=revision+1 WHERE id=$3').run(target, slot, uuid);
      await this.database.prepare('INSERT INTO routes VALUES($1,$2,$3)').run(target, slot, uuid);
      await this.database.prepare('UPDATE works SET next_number=$1,default_id=COALESCE(default_id,$2),revision=revision+1 WHERE id=$3')
        .run(slot + 1, v.status === 'published' ? uuid : null, target);
      await this.database.prepare(`UPDATE works SET default_id=(SELECT id FROM versions WHERE work_id=$1 AND status='published' ORDER BY number LIMIT 1),revision=revision+1
        WHERE id=$1 AND default_id=$2`).run(v.workId, uuid);
      return (await this.raw(uuid))!;
    });
  }
  async pending() {
    await this.ready;
    return (await this.database.prepare('SELECT payload FROM pending ORDER BY id').all()).map(r => JSON.parse(r.payload));
  }
  async hasMedia(url: string): Promise<boolean> {
    await this.ready;
    return !!await this.database.prepare(`SELECT 1 FROM work_metadata WHERE payload::jsonb #>> '{cover,url}'=$1
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(payload::jsonb->'screenshots','[]'::jsonb)) image WHERE image->>'url'=$1) LIMIT 1`).get(url);
  }
  async importMetadata(input: unknown, apply = false) {
    const document = metadataDocument.parse(input);
    const run = async () => {
      const ids = new Set<string>();
      const changes: { workId: string; kind: 'added' | 'updated' | 'unchanged' }[] = [];
      for (const m of document.works) {
        if (ids.has(m.workId)) throw Error('重复元数据编号');
        ids.add(m.workId);
        if (!(await this.workRows(m.workId)).length) throw Error('作品不存在');
        const old = await this.database.prepare('SELECT fetched_at,payload FROM work_metadata WHERE work_id=$1').get(m.workId);
        if (old && Date.parse(m.fetchedAt) < Date.parse(old.fetched_at)) throw Error('拒绝较旧的元数据快照');
        changes.push({ workId: m.workId, kind: !old ? 'added' : old.payload === JSON.stringify(m) ? 'unchanged' : 'updated' });
      }
      if (apply) for (const m of document.works)
        await this.database.prepare(`INSERT INTO work_metadata VALUES($1,$2,$3) ON CONFLICT(work_id)
          DO UPDATE SET fetched_at=excluded.fetched_at,payload=excluded.payload`).run(m.workId, m.fetchedAt, JSON.stringify(m));
      return { total: changes.length, added: changes.filter(c => c.kind === 'added').length,
        updated: changes.filter(c => c.kind === 'updated').length, unchanged: changes.filter(c => c.kind === 'unchanged').length, changes };
    };
    return apply ? this.tx(run) : run();
  }
  async createWork(input: unknown) {
    const w = z.object({ id: workId, title: label, originalTitle: label, aliases: z.array(label).max(50), evidence: z.string().url() }).strict().parse(input);
    if (w.evidence !== providerLink(w.id)) throw Error('需要对应作品的 VNDB 或 BGM 证据链接');
    return this.tx(async () => {
      await this.database.prepare('INSERT INTO works(id,title,original_title,aliases,evidence,next_number,revision,default_id) VALUES($1,$2,$3,$4,$5,1,1,NULL)').run(w.id, w.title, w.originalTitle, JSON.stringify(w.aliases), w.evidence);
      return (await this.get(w.id, true))!;
    });
  }
  async bindPending(uuid: string, id: string) {
    return this.tx(async () => {
      const p = (await this.pending()).find((p: any) => p.id === uuid);
      if (!p) throw Error('待匹配条目不存在');
      const engine = /ONSCRIPTER/i.test(p.meta) ? 'ONS' : /ARTEMIS/i.test(p.meta) ? 'Artemis' : /REN/i.test(p.meta) ? 'RenPy' : 'Tyrano';
      const v = await this.insert(id, versionInput.parse({ title: p.title, legacyPath: p.legacyPath, engine }), uuid);
      await this.database.prepare('UPDATE works SET default_id=COALESCE(default_id,$1) WHERE id=$2').run(v.id, id);
      await this.database.prepare('DELETE FROM pending WHERE id=$1').run(uuid);
      return v;
    });
  }
  async checks(uuid: string): Promise<Check[]> {
    await this.ready;
    return (await this.database.prepare('SELECT payload FROM reports WHERE version_id=$1 ORDER BY kind').all(uuid)).map(r => JSON.parse(r.payload));
  }
  async importReport(input: unknown) {
    const r = reportSchema.parse(input);
    if (Date.parse(r.checkedAt) < Date.parse(r.startedAt) || Date.parse(r.checkedAt) > Date.now() + 300000) throw Error('报告时间无效');
    return this.tx(async () => {
      if (!await this.raw(r.versionId)) throw Error('版本不存在');
      const prev = (await this.checks(r.versionId)).find(x => x.kind === r.kind);
      if (prev && (Date.parse(prev.startedAt) > Date.parse(r.startedAt) || (prev.startedAt === r.startedAt && Date.parse(prev.checkedAt) > Date.parse(r.checkedAt))))
        throw Error('拒绝过期报告');
      await this.database.prepare(`INSERT INTO reports VALUES($1,$2,$3,$4) ON CONFLICT(version_id,kind)
        DO UPDATE SET started_at=excluded.started_at,payload=excluded.payload`).run(r.versionId, r.kind, r.startedAt, JSON.stringify(r));
      return r;
    });
  }
}
