import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { AccountError } from "./errors.server.ts";
import type { SaveFile, SaveStore } from "./saves.server.ts";
import type { CatalogPolicy } from "./catalog-policy.server.ts";
import type { ShareLedger } from "./share-ledger.server.ts";
import type { ShareInput, ShareText, ShareView, OwnShare, SharePage } from "./share-types.ts";
type Row = Record<string, SQLOutputValue>;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export class ShareStore {
 constructor(readonly db: DatabaseSync, readonly saves: SaveStore, readonly catalog: CatalogPolicy, readonly ledger: ShareLedger) {
  db.exec(`CREATE TABLE IF NOT EXISTS wg_save_shares(id TEXT PRIMARY KEY,owner TEXT NOT NULL,profile TEXT NOT NULL,generation INTEGER NOT NULL,revision TEXT NOT NULL,version TEXT NOT NULL,work TEXT NOT NULL,mode TEXT NOT NULL,secret_hash TEXT,state TEXT NOT NULL,expires INTEGER,files TEXT NOT NULL,approved TEXT,pending TEXT,metadata_revision INTEGER NOT NULL,created INTEGER NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(owner,request_id));
  CREATE INDEX IF NOT EXISTS wg_shares_work ON wg_save_shares(work,created,id);
  CREATE TABLE IF NOT EXISTS wg_share_rates(key TEXT PRIMARY KEY,expires INTEGER NOT NULL,n INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wg_share_audit(id INTEGER PRIMARY KEY,share TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wg_save_share_reports(id TEXT PRIMARY KEY,reporter TEXT NOT NULL,share TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS wg_report_open ON wg_save_share_reports(reporter,share) WHERE status='open';`);
  saves.onRemove = (owner, profile) => this.revokeSource(owner, profile);
  this.replay();
 }
 atomic<T>(fn: () => T): T {
  if (this.db.isTransaction) return fn();
  this.db.exec("BEGIN IMMEDIATE"); try { const result = fn(); this.db.exec("COMMIT"); return result; } catch (e) { this.db.exec("ROLLBACK"); throw e; }
 }
 text(input: ShareText): ShareText {
  if (!input || typeof input.title !== "string" || !input.title.trim() || [...input.title.trim()].length > 80 || typeof input.description !== "string" || [...input.description].length > 2000 || /[\p{Cs}\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input.title + input.description) || !["chapter", "route", "complete", "unlock", "other"].includes(input.progress) || typeof input.spoiler !== "boolean") throw new AccountError(400, "SHARE_TEXT_INVALID");
  return { title: input.title.trim(), description: input.description.trim(), progress: input.progress, spoiler: input.spoiler };
 }
 limit(key: string, max: number, ms = 3600_000) {
  const k = sha(key), now = Date.now();
  this.db.prepare("DELETE FROM wg_share_rates WHERE expires<?").run(now);
  this.db.prepare("INSERT INTO wg_share_rates VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN expires<=? THEN 1 ELSE n+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END").run(k, now + ms, now, now);
  if (Number(this.db.prepare("SELECT n FROM wg_share_rates WHERE key=?").get(k)?.n) > max) throw new AccountError(429, "TRY_LATER");
 }
 row(id: string) {
  const row = this.db.prepare("SELECT * FROM wg_save_shares WHERE id=?").get(id);
  if (!row) throw new AccountError(404, "SHARE_UNAVAILABLE"); return row;
 }
 live(row: Row) {
  if (this.ledger.entries.has(String(row.id)) || !["active", "pending"].includes(String(row.state)) || (row.expires !== null && Number(row.expires) <= Date.now())) throw new AccountError(404, "SHARE_UNAVAILABLE");
  this.catalog.require(String(row.version));
 }
 authorize(id: string, secret?: string) {
  const row = this.row(id); this.live(row);
  if (row.state !== "active") throw new AccountError(404, "SHARE_UNAVAILABLE");
  if (row.mode === "link") {
   const hash = typeof secret === "string" && secret.length <= 100 ? sha(secret) : "";
   const expected = String(row.secret_hash);
   if (hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) throw new AccountError(404, "SHARE_UNAVAILABLE");
  }
  return row;
 }
 private view(row: Row, own = false): ShareView {
  const text = JSON.parse(String((own && row.pending) || row.approved || row.pending)) as ShareText;
  const meta = this.catalog.require(String(row.version));
  const files = JSON.parse(String(row.files)) as SaveFile[];
  const claims = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wg_save_share_claims'").get() ? Number(this.db.prepare("SELECT count(*) AS n FROM wg_save_share_claims WHERE share=? AND status='complete'").get(row.id)?.n) : 0;
  return { ...text, id: String(row.id), mode: row.mode as "public" | "link", ...meta, author: String(this.db.prepare('SELECT name FROM "user" WHERE id=?').get(row.owner)?.name ?? "已注销玩家"), createdAt: Number(row.created), expiresAt: row.expires === null ? null : Number(row.expires), files, bytes: files.reduce((n, f) => n + f.bytes, 0), claims, integrity: "sha256", compatibility: "author-declared" };
 }
 inspect(id: string, secret?: string) { return this.view(this.authorize(id, secret)); }
 create(owner: string, input: ShareInput): { id: string; secret?: string; state: string } {
  const text = this.text(input);
  if (!["public", "link"].includes(input.mode) || typeof input.requestId !== "string" || !input.requestId || input.requestId.length > 100 || (input.mode === "link" && ![1, 7, 30].includes(input.days ?? 30))) throw new AccountError();
  const payload = sha(JSON.stringify({ ...input, ...text }));
  const previous = this.db.prepare("SELECT * FROM wg_save_shares WHERE owner=? AND request_id=?").get(owner, input.requestId);
  if (previous) { if (previous.payload !== payload) throw new AccountError(409, "CAPTURE_CHANGED"); this.live(previous); return { id: String(previous.id), state: String(previous.state) }; }
  const source = this.saves.snapshot(owner, input.profileId, input.revisionId);
  if (source.profile.generation !== input.generation) throw new AccountError(410, "GENERATION_CHANGED");
  const meta = this.catalog.require(source.profile.versionId);
  this.limit("publish:" + owner, 5);
  return this.atomic(() => {
   if (Number(this.db.prepare("SELECT count(*) AS n FROM wg_save_shares WHERE owner=? AND state IN ('active','pending') AND (expires IS NULL OR expires>?)").get(owner, Date.now())?.n) >= 20) throw new AccountError(413, "SHARE_LIMIT");
   const id = randomUUID(), secret = input.mode === "link" ? randomBytes(32).toString("base64url") : undefined, state = secret ? "active" : "pending";
   this.db.prepare("INSERT INTO wg_save_shares VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, owner, input.profileId, input.generation, input.revisionId, source.profile.versionId, meta.work.id, input.mode, secret ? sha(secret) : null, state, secret ? Date.now() + (input.days ?? 30) * 86400_000 : null, JSON.stringify(source.revision.files), secret ? JSON.stringify(text) : null, secret ? null : JSON.stringify(text), 1, Date.now(), input.requestId, payload);
   this.saves.pin(owner, "share:" + id, source.revision.files);
   return { id, ...(secret ? { secret } : {}), state };
  });
 }
 private pageRows(owner: string | null, work: string | null, version?: string, cursor?: string): Row[] {
  let before = Number.MAX_SAFE_INTEGER, beforeId = "~";
  if (cursor) { const r = this.row(cursor); if (owner ? r.owner !== owner : r.work !== work || r.mode !== "public") throw new AccountError(400, "CURSOR_INVALID"); before = Number(r.created); beforeId = String(r.id); }
  return this.db.prepare("SELECT * FROM wg_save_shares WHERE (? IS NULL OR owner=?) AND (? IS NULL OR work=?) AND (? IS NULL OR version=?) AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC").all(owner, owner, work, work, version ?? null, version ?? null, before, before, beforeId);
 }
 listPublic(work: string, version?: string, cursor?: string): SharePage {
  const rows = this.pageRows(null, work, version, cursor).filter((r) => r.mode === "public" && r.state === "active" && !this.ledger.entries.has(String(r.id)) && (r.expires === null || Number(r.expires) > Date.now()) && this.catalog.visible(String(r.version)));
  const selected = rows.slice(0, 20); return { items: selected.map((r) => this.view(r)), next: rows.length > 20 ? String(selected.at(-1)!.id) : null };
 }
 listOwn(owner: string, cursor?: string): SharePage<OwnShare> {
  const rows = this.pageRows(owner, null, undefined, cursor), selected = rows.slice(0, 20);
  return { items: selected.map((r) => { let view: ShareView; try { view = this.view(r, true); } catch { const files = JSON.parse(String(r.files)); view = { ...JSON.parse(String(r.pending || r.approved)), id: String(r.id), mode: r.mode, work: { id: r.work, title: "版本已下线", url: "/" }, version: { id: r.version, title: "版本已下线", number: 0, engine: "", url: "/" }, author: "", createdAt: Number(r.created), expiresAt: r.expires, files, bytes: files.reduce((n: number, f: SaveFile) => n + f.bytes, 0), claims: 0, integrity: "sha256", compatibility: "author-declared" } as ShareView; }
   return { ...view, state: this.ledger.entries.has(String(r.id)) ? "revoked" : r.expires !== null && Number(r.expires) <= Date.now() ? "expired" : String(r.state), metadataRevision: Number(r.metadata_revision), pending: r.pending ? JSON.parse(String(r.pending)) : null }; }), next: rows.length > 20 ? String(selected.at(-1)!.id) : null };
 }
 edit(owner: string, id: string, revision: number, input: ShareText) {
  const row = this.row(id); if (row.owner !== owner) throw new AccountError(404, "NOT_FOUND"); this.live(row);
  if (row.metadata_revision !== revision) throw new AccountError(409, "CONTENT_CONFLICT");
  const text = JSON.stringify(this.text(input));
  this.db.prepare("UPDATE wg_save_shares SET approved=?,pending=?,metadata_revision=metadata_revision+1 WHERE id=?").run(row.mode === "link" ? text : row.approved, row.mode === "public" ? text : null, id);
 }
 moderate(id: string, revision: number, action: "approve" | "block" | "reject", reason: string) {
  const row = this.row(id); this.live(row);
  if (row.metadata_revision !== revision) throw new AccountError(409, "CONTENT_CONFLICT");
  if (!reason.trim() || reason.length > 1000 || !["approve", "block", "reject"].includes(action)) throw new AccountError();
  if (action !== "approve") this.revokeRows([row], "blocked");
  else {
   if (row.mode !== "public" || !row.pending) throw new AccountError(409, "CONTENT_CONFLICT");
   this.db.prepare("UPDATE wg_save_shares SET approved=pending,pending=NULL,state='active' WHERE id=?").run(id);
  }
  this.db.prepare("INSERT INTO wg_share_audit(share,action,reason,created) VALUES (?,?,?,?)").run(id, action, reason, Date.now());
  this.db.prepare("UPDATE wg_save_share_reports SET status='resolved' WHERE share=? AND status='open'").run(id);
 }
 private revokeRows(rows: Row[], state: string) {
  for (const row of rows) { this.ledger.record(String(row.id)); this.db.prepare("UPDATE wg_save_shares SET state=? WHERE id=?").run(state, row.id); this.saves.unpin(String(row.owner), "share:" + row.id); }
 }
 revoke(owner: string, id: string) { const row = this.row(id); if (row.owner !== owner) throw new AccountError(404, "NOT_FOUND"); this.revokeRows([row], "revoked"); }
 revokeSource(owner: string, profile?: string) { this.revokeRows(this.db.prepare("SELECT * FROM wg_save_shares WHERE owner=? AND (? IS NULL OR profile=?) AND state IN ('active','pending')").all(owner, profile ?? null, profile ?? null), "revoked"); }
 replay() { for (const id of this.ledger.entries.keys()) { const row = this.db.prepare("SELECT * FROM wg_save_shares WHERE id=?").get(id); if (row) { this.db.prepare("UPDATE wg_save_shares SET state='revoked' WHERE id=?").run(id); this.saves.unpin(String(row.owner), "share:" + id); } } }
 report(owner: string, id: string, secret: string | undefined, reason: string) { this.authorize(id, secret); if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) throw new AccountError(); this.limit("report:" + owner, 10); this.db.prepare("INSERT OR IGNORE INTO wg_save_share_reports(id,reporter,share,reason,created) VALUES (?,?,?,?,?)").run(randomUUID(), owner, id, reason.trim(), Date.now()); }
 queue() { return this.db.prepare("SELECT id,mode,state,pending,approved,metadata_revision AS metadataRevision,created FROM wg_save_shares WHERE state IN ('active','pending') AND (pending IS NOT NULL OR id IN(SELECT share FROM wg_save_share_reports WHERE status='open')) ORDER BY created LIMIT 100").all().map((r) => ({ ...r, pending: r.pending ? JSON.parse(String(r.pending)) : null, approved: r.approved ? JSON.parse(String(r.approved)) : null, reports: this.db.prepare("SELECT id,reason,created FROM wg_save_share_reports WHERE share=? AND status='open'").all(r.id) })); }
 gc() { const rows = this.db.prepare("SELECT * FROM wg_save_shares WHERE state IN ('active','pending') AND expires IS NOT NULL AND expires<=? LIMIT 100").all(Date.now()); this.revokeRows(rows, "expired"); }
}
