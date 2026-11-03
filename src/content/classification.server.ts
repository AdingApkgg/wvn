import { z } from "zod";
import { createHash } from "node:crypto";
import type { PgDatabase, PgRow } from "../database/postgres.ts";
import { migrate } from "../database/migrations.ts";
import { contentCatalogMigrations } from "../database/content-catalog.ts";
import { mediaClassificationSchema } from "../metadata.ts";
import type { WorkClassification, VersionClassification, MediaClassification } from "./types.ts";
import type { WorkMetadata } from "../metadata.ts";
import type { WorkSeed } from "../types.ts";

export type ClassificationKind = "work" | "version" | "image";
type Classifications = { work: WorkClassification; version: VersionClassification; image: MediaClassification };
export type ClassificationRecord = {
  [K in ClassificationKind]: { kind: K; id: string; classification: Classifications[K]; manual: boolean; fingerprint?: string }
}[ClassificationKind];
export type WorkReviewSnapshot = { reviewFingerprint: string; reviewText: ReturnType<typeof buildWorkReviewText> };
export type ClassificationReviewRecord = ClassificationRecord & Partial<WorkReviewSnapshot>;
const evidence = {
  reason: z.string().trim().min(1).max(4000),
  source: z.string().trim().min(1).max(2000),
  reviewedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
};
const schemas = {
  work: z.object({ ...evidence, pageSuitability: z.enum(["sfw", "nsfw", "unknown"]) }).strict(),
  version: z.object({ ...evidence, sexualContent: z.enum(["none", "present", "unknown"]), titleSafe: z.boolean(), ageRating: z.string().trim().min(1).max(100).optional() }).strict(),
  image: mediaClassificationSchema.extend({ revision: evidence.revision }),
};
const identity = z.object({ kind: z.enum(["work", "version", "image"]), id: z.string().trim().min(1).max(500) }).strict();
const importDocument = z.object({
  schemaVersion: z.literal(1),
  records: z.array(z.object({ ...identity.shape, classification: z.unknown(), fingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional() }).strict()).max(100_000),
}).strict();

export class ClassificationConflict extends Error {
  readonly code = "CLASSIFICATION_CONFLICT";
  constructor() { super("分类已被其他操作更新，请刷新后重试"); }
}

function validateIdentity(kind: ClassificationKind, id: string) {
  identity.parse({ kind, id });
  if (kind === "work" && !/^[vb][1-9]\d{0,8}$/.test(id)) throw Error("无效作品分类编号");
  if (kind === "image" && !/^\/media\/[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(id)) throw Error("无效图片分类编号");
}
function validate<K extends ClassificationKind>(kind: K, payload: unknown, manual: boolean): Classifications[K] {
  const classification = schemas[kind].parse(payload) as Classifications[K];
  if (Date.parse(classification.reviewedAt) > Date.now() + 300_000) throw Error("分类核实时间无效");
  if (kind === "image" && !manual && !classification.source.startsWith("manual:")) {
    const image = classification as MediaClassification;
    if (image.sexual === "safe" || image.violence === "tame") {
      let vndb = false;
      try {
        const url = new URL(image.source);
        vndb = url.protocol === "https:" && !url.username && !url.password && !url.port && ["api.vndb.org", "vndb.org", "t.vndb.org"].includes(url.hostname);
      } catch { /* 无法验证的来源不能自动通过。 */ }
      if (!vndb || image.voteCount === undefined || image.voteCount < 1 || image.rawSexual === undefined || image.rawViolence === undefined ||
        (image.sexual === "safe" && image.rawSexual !== 0) || (image.violence === "tame" && image.rawViolence !== 0))
        throw Error("图片安全分类需要对应的 VNDB 原始评分和有效票数，或明确人工审核");
    }
  }
  return classification;
}
function rowRecord(row: PgRow): ClassificationRecord {
  return { kind: row.kind, id: row.id, classification: JSON.parse(row.payload), manual: row.manual,
    ...(row.fingerprint ? { fingerprint: row.fingerprint } : {}) } as ClassificationRecord;
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => JSON.stringify(key) + ":" + stableJson(entry)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
/** 仅绑定公开文本；评分数字、抓取时间和独立过滤的图片不使文字审核过期。 */
function buildWorkReviewText(work: Pick<WorkSeed, "title" | "originalTitle" | "aliases" | "evidence">, metadata?: WorkMetadata,
  versions: { id: string; title: string; notes: string; language: string }[] = []) {
  return {
    title: work.title, originalTitle: work.originalTitle, aliases: work.aliases, evidence: work.evidence,
    versions: versions.map(version => ({ id: version.id, title: version.title, notes: version.notes, language: version.language }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    metadata: metadata ? {
      titles: metadata.titles, description: metadata.description, tags: metadata.tags,
      developers: metadata.developers, languages: metadata.languages, platforms: metadata.platforms,
      released: metadata.released, warnings: metadata.warnings, sources: metadata.sources,
    } : null,
  };
}
export function workTextFingerprint(work: Pick<WorkSeed, "title" | "originalTitle" | "aliases" | "evidence">, metadata?: WorkMetadata,
  versions: { id: string; title: string; notes: string; language: string }[] = []): string {
  return createHash("sha256").update(stableJson(buildWorkReviewText(work, metadata, versions))).digest("hex");
}
const missing = { reason: "尚无独立审核记录", source: "unreviewed", reviewedAt: "1970-01-01T00:00:00.000Z", revision: 0 };
export function unknownWorkClassification(): WorkClassification { return { ...missing, pageSuitability: "unknown" }; }
export function unknownVersionClassification(): VersionClassification { return { ...missing, sexualContent: "unknown", titleSafe: false }; }
export function unknownMediaClassification(): MediaClassification { return { ...missing, sexual: "unknown", violence: "unknown", spoiler: true }; }

/** 管理入口的独立分类仓储；同一 schema 中的并发写入用事务锁序列化。 */
export class ContentClassificationStore {
  readonly ready: Promise<void>;
  constructor(readonly database: PgDatabase) { this.ready = migrate(database, contentCatalogMigrations); }

  async list(): Promise<ClassificationRecord[]> {
    await this.ready;
    return (await this.database.prepare("SELECT kind,id,payload,manual,fingerprint FROM content_classifications ORDER BY kind,id").all()).map(rowRecord);
  }
  async get<K extends ClassificationKind>(kind: K, id: string): Promise<Classifications[K] | undefined> {
    await this.ready;
    const row = await this.database.prepare("SELECT payload FROM content_classifications WHERE kind=$1 AND id=$2").get(kind, id);
    return row ? JSON.parse(row.payload) : undefined;
  }
  private async write(kind: ClassificationKind, id: string, classification: WorkClassification | VersionClassification | MediaClassification, manual: boolean, fingerprint?: string) {
    const payload = JSON.stringify(classification);
    await this.database.prepare(`INSERT INTO content_classifications(kind,id,revision,manual,payload,fingerprint) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,manual=excluded.manual,payload=excluded.payload,fingerprint=excluded.fingerprint`)
      .run(kind, id, classification.revision, manual, payload, fingerprint ?? null);
    await this.database.prepare("INSERT INTO content_classification_history(kind,id,revision,manual,payload,fingerprint) VALUES($1,$2,$3,$4,$5,$6)")
      .run(kind, id, classification.revision, manual, payload, fingerprint ?? null);
  }
  private async currentWorkReview(id: string): Promise<WorkReviewSnapshot | undefined> {
    const table = await this.database.prepare("SELECT to_regclass('works') AS name").get();
    if (!table?.name) return;
    const work = await this.database.prepare('SELECT title,original_title AS "originalTitle",aliases,evidence FROM works WHERE id=$1').get(id);
    if (!work) return;
    const metadata = await this.database.prepare("SELECT payload FROM work_metadata WHERE work_id=$1").get(id);
    const versions = await this.database.prepare("SELECT id,title,notes,language FROM versions WHERE work_id=$1 AND status='published' ORDER BY id").all(id);
    const reviewText = buildWorkReviewText({ title: work.title, originalTitle: work.originalTitle, aliases: JSON.parse(work.aliases), evidence: work.evidence },
      metadata ? JSON.parse(metadata.payload) : undefined, versions.map(version => ({ id: version.id, title: version.title, notes: version.notes, language: version.language })));
    return { reviewText, reviewFingerprint: createHash("sha256").update(stableJson(reviewText)).digest("hex") };
  }
  /** 审核人看到的文案与待提交指纹来自同一目录写锁快照。 */
  async reviewWork(id: string): Promise<WorkReviewSnapshot | undefined> {
    validateIdentity("work", id);
    await this.ready;
    return this.database.transaction(() => this.currentWorkReview(id), { lock: "wvn:catalog-write" });
  }
  async reviewList(): Promise<ClassificationReviewRecord[]> {
    await this.ready;
    return this.database.transaction(() => this.database.transaction(async () => {
      const records: ClassificationReviewRecord[] = await this.list();
      const works = await this.database.prepare("SELECT id FROM works ORDER BY id").all();
      for (const work of works) {
        const snapshot = await this.currentWorkReview(work.id);
        const existing = records.find(record => record.kind === "work" && record.id === work.id);
        if (existing) Object.assign(existing, snapshot);
        else records.push({ kind: "work", id: work.id, classification: unknownWorkClassification(), manual: false, ...snapshot });
      }
      return records;
    }, { lock: "wvn:content-classification-write" }), { lock: "wvn:catalog-write" });
  }
  async set<K extends ClassificationKind>(kind: K, id: string, expectedRevision: number, payload: Omit<Classifications[K], "revision">, expectedFingerprint?: string): Promise<Classifications[K]> {
    validateIdentity(kind, id);
    z.number().int().nonnegative().parse(expectedRevision);
    if (kind === "work") z.string().regex(/^[0-9a-f]{64}$/).parse(expectedFingerprint);
    // 修订只能由仓储产生，调用者不能夹带另一个修订号。
    if (typeof payload !== "object" || payload === null || "revision" in payload) throw Error("分类写入不能指定修订号");
    const classification = validate(kind, { ...payload, revision: expectedRevision + 1 }, true);
    await this.ready;
    return this.database.transaction(() => this.database.transaction(async () => {
      const current = await this.get(kind, id);
      if ((current?.revision ?? 0) !== expectedRevision) throw new ClassificationConflict();
      const snapshot = kind === "work" ? await this.currentWorkReview(id) : undefined;
      if (kind === "work" && (!snapshot || snapshot.reviewFingerprint !== expectedFingerprint)) throw new ClassificationConflict();
      await this.write(kind, id, classification, true, snapshot?.reviewFingerprint);
      return classification;
    }, { lock: "wvn:content-classification-write" }), { lock: "wvn:catalog-write" });
  }
  async import(input: unknown, apply = true) {
    const document = importDocument.parse(input);
    const seen = new Set<string>();
    const records = document.records.map(record => {
      validateIdentity(record.kind, record.id);
      const key = record.kind + ":" + record.id;
      if (seen.has(key)) throw Error("重复分类编号");
      seen.add(key);
      const classification = validate(record.kind, record.classification, false);
      if (record.kind === "work" && (classification as WorkClassification).pageSuitability !== "unknown" && !record.fingerprint)
        throw Error("已审核页面分类必须绑定审核时的文本指纹");
      if (record.kind !== "work" && record.fingerprint) throw Error("仅页面分类允许文本指纹");
      return { ...record, classification };
    });
    await this.ready;
    return this.database.transaction(() => this.database.transaction(async () => {
      let added = 0, updated = 0, unchanged = 0, preservedManual = 0;
      const pending: typeof records = [];
      for (const record of records) {
        const row = await this.database.prepare("SELECT kind,id,payload,manual,fingerprint FROM content_classifications WHERE kind=$1 AND id=$2").get(record.kind, record.id);
        if (row?.manual) { preservedManual++; continue; }
        if (row) {
          const old = rowRecord(row).classification;
          if (old.revision > record.classification.revision) throw new ClassificationConflict();
          if (old.revision === record.classification.revision) {
            const canonicalOld = validate(record.kind, old, false);
            if (JSON.stringify(canonicalOld) !== JSON.stringify(record.classification) || (row.fingerprint ?? undefined) !== record.fingerprint) throw new ClassificationConflict();
            unchanged++; continue;
          }
          updated++;
        } else added++;
        pending.push(record);
      }
      if (apply) for (const record of pending) await this.write(record.kind, record.id, record.classification, false, record.fingerprint);
      return { total: records.length, added, updated, unchanged, preservedManual };
    }, { lock: "wvn:content-classification-write" }), { lock: "wvn:catalog-write" });
  }
}
