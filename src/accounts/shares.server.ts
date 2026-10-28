import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PgDatabase, PgRow } from "../database/postgres.ts";
import { AccountError } from "./errors.server.ts";
import type { SaveFile, SaveStore } from "./saves.server.ts";
import type { CatalogPolicy } from "./catalog-policy.server.ts";
import type { ShareLedger } from "./share-ledger.server.ts";
import type {
  ShareInput,
  ShareText,
  ShareView,
  OwnShare,
  SharePage,
  ModerationShare,
} from "./share-types.ts";
import { isShareProgress } from "./share-metadata.ts";
type Row = PgRow;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export class ShareStore {
  constructor(
    readonly db: PgDatabase,
    readonly saves: SaveStore,
    readonly catalog: CatalogPolicy,
    readonly ledger: ShareLedger,
  ) {
    saves.onRemove = async (owner, profile) => {
      (await this.revokeSource(owner, profile));
      if (!profile)
        (await this.db
          .prepare("DELETE FROM wg_share_publish_keys WHERE owner=$1")
          .run(owner));
    };
  }
  async atomic<T>(fn: () => T | Promise<T>): Promise<T> {
    return (await this.db.transaction(fn, { lock: 'wvn:account-write' }));
  }
  text(input: ShareText): ShareText {
    if (
      !input ||
      typeof input.title !== "string" ||
      !input.title.trim() ||
      [...input.title.trim()].length > 80 ||
      typeof input.description !== "string" ||
      [...input.description].length > 2000 ||
      /[\p{Cs}\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(
        input.title + input.description,
      ) ||
      !isShareProgress(input.progress) ||
      typeof input.spoiler !== "boolean"
    )
      throw new AccountError(400, "SHARE_TEXT_INVALID");
    return {
      title: input.title.trim(),
      description: input.description.trim(),
      progress: input.progress,
      spoiler: input.spoiler,
    };
  }
  async limit(key: string, max: number, ms = 3600_000) {
    const k = sha(key),
      now = Date.now();
    (await this.db.prepare("DELETE FROM wg_share_rates WHERE expires<$1").run(now));
    (await this.db
      .prepare(
        "INSERT INTO wg_share_rates VALUES ($1,$2,1) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN wg_share_rates.expires<=$3 THEN 1 ELSE wg_share_rates.n+1 END,expires=CASE WHEN wg_share_rates.expires<=$4 THEN excluded.expires ELSE wg_share_rates.expires END",
      )
      .run(k, now + ms, now, now));
    if (
      Number(
        (await this.db.prepare("SELECT n FROM wg_share_rates WHERE key=$1").get(k))?.n,
      ) > max
    )
      throw new AccountError(429, "TRY_LATER");
  }
  async row(id: string) {
    const row = (await this.db
      .prepare("SELECT * FROM wg_save_shares WHERE id=$1")
      .get(id));
    if (!row) throw new AccountError(404, "SHARE_UNAVAILABLE");
    return row;
  }
  async live(row: Row) {
    const source = (await this.db
      .prepare(
        "SELECT generation,deleted FROM wg_save_profiles WHERE owner=$1 AND id=$2",
      )
      .get(row.owner, row.profile));
    if (!source || source.deleted || source.generation !== row.generation)
      throw new AccountError(404, "SHARE_UNAVAILABLE");
    if (
      this.ledger.entries.has(String(row.id)) ||
      !["active", "pending"].includes(String(row.state)) ||
      (row.expires !== null && Number(row.expires) <= Date.now())
    )
      throw new AccountError(404, "SHARE_UNAVAILABLE");
    this.catalog.require(String(row.version));
  }
  async authorize(id: string, secret?: string) {
    const row = (await this.row(id));
    (await this.live(row));
    if (row.state !== "active")
      throw new AccountError(404, "SHARE_UNAVAILABLE");
    if (row.mode === "link") {
      const hash =
        typeof secret === "string" && secret.length <= 100 ? sha(secret) : "";
      const expected = String(row.secret_hash);
      if (
        hash.length !== expected.length ||
        !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))
      )
        throw new AccountError(404, "SHARE_UNAVAILABLE");
    }
    return row;
  }
  private async view(row: Row, own = false): Promise<ShareView> {
    const text = JSON.parse(
      String((own && row.pending) || row.approved || row.pending),
    ) as ShareText;
    const meta = row.published_meta
      ? JSON.parse(String(row.published_meta))
      : this.catalog.require(String(row.version));
    const files = JSON.parse(String(row.files)) as SaveFile[];
    const claims = (await this.db
      .prepare(
        "SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='wg_save_share_claims'",
      )
      .get())
      ? Number(
          (await this.db
            .prepare(
              "SELECT count(*) AS n FROM wg_save_share_claims WHERE share=$1 AND status='complete'",
            )
            .get(row.id))?.n,
        )
      : 0;
    return {
      ...text,
      id: String(row.id),
      mode: row.mode as "public" | "link",
      ...meta,
      metadataBasis: row.published_meta ? "published" : "legacy-current",
      publicSource: (await this.publicSource(row)),
      author: String(
        (await this.db.prepare("SELECT name FROM \"user\" WHERE id=$1").get(row.owner))
          ?.name ?? "已注销玩家",
      ),
      createdAt: Number(row.created),
      expiresAt: row.expires === null ? null : Number(row.expires),
      files,
      bytes: files.reduce((n, f) => n + f.bytes, 0),
      claims,
      integrity: "sha256",
      compatibility: "author-declared",
    };
  }
  async inspect(id: string, secret?: string) {
    return (await this.view((await this.authorize(id, secret))));
  }
  private async publicSource(row: Row): Promise<ShareView["publicSource"]> {
    if (!row.source_share) return null;
    const parent = (await this.db
      .prepare("SELECT * FROM wg_save_shares WHERE id=$1 AND mode='public'")
      .get(row.source_share));
    if (!parent) return null;
    try {
      (await this.authorize(String(parent.id)));
      const approved = JSON.parse(String(parent.approved)) as ShareText;
      return { id: String(parent.id), title: approved.title };
    } catch {
      return null;
    }
  }
  async create(
    owner: string,
    input: ShareInput,
  ): Promise<{ id: string; secret?: string; state: string; duplicate?: boolean }> {
    const text = this.text(input);
    if (
      !["public", "link"].includes(input.mode) ||
      typeof input.requestId !== "string" ||
      !input.requestId ||
      input.requestId.length > 100 ||
      (input.mode === "link" && ![1, 7, 30].includes(input.days ?? 30))
    )
      throw new AccountError();
    const payload = sha(JSON.stringify({ ...input, ...text }));
    await this.saves.snapshot(owner, input.profileId, input.revisionId);
    return (await this.atomic(async () => {
      const key = (await this.db
        .prepare(
          "SELECT * FROM wg_share_publish_keys WHERE owner=$1 AND request=$2",
        )
        .get(owner, input.requestId));
      const previous = key
        ? (await this.row(String(key.share)))
        : (await this.db
            .prepare(
              "SELECT * FROM wg_save_shares WHERE owner=$1 AND request_id=$2",
            )
            .get(owner, input.requestId));
      if (previous) {
        if ((key?.payload ?? previous.payload) !== payload)
          throw new AccountError(409, "CAPTURE_CHANGED");
        (await this.live(previous));
        return {
          id: String(previous.id),
          state: String(previous.state),
          duplicate: true,
        };
      }
      const source = (await this.saves.snapshotMetadata(
        owner,
        input.profileId,
        input.revisionId,
      ));
      if (source.profile.generation !== input.generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      const meta = this.catalog.require(source.profile.versionId);
      const duplicate = (await this.db
        .prepare(
          "SELECT * FROM wg_save_shares WHERE owner=$1 AND profile=$2 AND generation=$3 AND revision=$4 AND mode=$5 AND state IN ('active','pending') AND (expires IS NULL OR expires>$6) ORDER BY created,id",
        )
        .all(
          owner,
          input.profileId,
          input.generation,
          input.revisionId,
          input.mode,
          Date.now(),
        ))
        .find((row) => !this.ledger.entries.has(String(row.id)));
      if (duplicate) {
        (await this.live(duplicate));
        (await this.db
          .prepare("INSERT INTO wg_share_publish_keys VALUES ($1,$2,$3,$4)")
          .run(owner, input.requestId, payload, duplicate.id));
        return {
          id: String(duplicate.id),
          state: String(duplicate.state),
          duplicate: true,
        };
      }
      if (
        Number(
          (await this.db
            .prepare(
              "SELECT count(*) AS n FROM wg_save_shares WHERE owner=$1 AND state IN ('active','pending') AND (expires IS NULL OR expires>$2)",
            )
            .get(owner, Date.now()))?.n,
        ) >= 20
      )
        throw new AccountError(413, "SHARE_LIMIT");
      (await this.limit("publish:" + owner, 5));
      const id = randomUUID(),
        secret =
          input.mode === "link"
            ? randomBytes(32).toString("base64url")
            : undefined,
        state = secret ? "active" : "pending";
      const origin = (await this.db
        .prepare(
          "SELECT share_id FROM wg_save_origins WHERE revision=$1 AND kind='share'",
        )
        .get(input.revisionId));
      (await this.db
        .prepare(
          "INSERT INTO wg_save_shares (id,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,approved,pending,metadata_revision,created,request_id,payload,published_meta,source_share) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
        )
        .run(
          id,
          owner,
          input.profileId,
          input.generation,
          input.revisionId,
          source.profile.versionId,
          meta.work.id,
          input.mode,
          secret ? sha(secret) : null,
          state,
          secret ? Date.now() + (input.days ?? 30) * 86400_000 : null,
          JSON.stringify(source.revision.files),
          secret ? JSON.stringify(text) : null,
          secret ? null : JSON.stringify(text),
          1,
          Date.now(),
          input.requestId,
          payload,
          JSON.stringify({...meta,version:{...meta.version,...(source.profile.engineReleaseId?{engineReleaseId:source.profile.engineReleaseId}:{})}}),
          origin?.share_id ?? null,
        ));
      (await this.db
        .prepare("INSERT INTO wg_share_publish_keys VALUES ($1,$2,$3,$4)")
        .run(owner, input.requestId, payload, id));
      (await this.saves.pin(owner, "share:" + id, source.revision.files));
      return { id, ...(secret ? { secret } : {}), state };
    }));
  }
  private async pageRows(
    owner: string | null,
    work: string | null,
    version?: string,
    cursor?: string,
    limit = 21,
    progress?: string,
  ): Promise<Row[]> {
    let before = Number.MAX_SAFE_INTEGER,
      beforeId = "~";
    if (cursor) {
      const r = (await this.row(cursor));
      if (owner ? r.owner !== owner : r.work !== work || r.mode !== "public")
        throw new AccountError(400, "CURSOR_INVALID");
      before = Number(r.created);
      beforeId = String(r.id);
    }
    return (await this.db
      .prepare(
        "SELECT * FROM wg_save_shares WHERE ($1::text IS NULL OR owner=$2) AND ($3::text IS NULL OR work=$4) AND ($5::text IS NULL OR version=$6) AND ($7::text IS NULL OR approved::jsonb->>'progress'=$8) AND (created<$9 OR (created=$10 AND id<$11)) AND ($12=0 OR (mode='public' AND state='active' AND (expires IS NULL OR expires>$13))) ORDER BY created DESC,id DESC LIMIT $14",
      )
      .all(
        owner,
        owner,
        work,
        work,
        version ?? null,
        version ?? null,
        progress ?? null,
        progress ?? null,
        before,
        before,
        beforeId,
        owner === null ? 1 : 0,
        Date.now(),
        limit,
      ));
  }
  async listPublic(
    work: string,
    version?: string,
    cursor?: string,
    progress?: string,
  ): Promise<SharePage> {
    if (progress !== undefined && !isShareProgress(progress))
      throw new AccountError(400, "FILTER_INVALID");
    const visible: Row[] = [];
    let at = cursor,
      exhausted = false;
    for (
      let scanned = 0;
      scanned < 1000 && visible.length < 21;
      scanned += 40
    ) {
      const rows = (await this.pageRows(null, work, version, at, 40, progress));
      for (const row of rows) {
        at = String(row.id);
        try {
          (await this.live(row));
          visible.push(row);
        } catch (e) {
          if (!(e instanceof AccountError && e.status === 404)) throw e;
        }
        if (visible.length === 21) break;
      }
      if (rows.length < 40) {
        exhausted = true;
        break;
      }
    }
    const selected = visible.slice(0, 20);
    return {
      items: (await Promise.all(selected.map(async (r) => (await this.view(r))))),
      next:
        visible.length > 20
          ? String(selected.at(-1)!.id)
          : exhausted
            ? null
            : (at ?? null),
    };
  }
  async listOwn(owner: string, cursor?: string): Promise<SharePage<OwnShare>> {
    const rows = (await this.pageRows(owner, null, undefined, cursor)),
      selected = rows.slice(0, 20);
    return {
      items: (await Promise.all(selected.map(async (r) => {
        let view: ShareView;
        try {
          view = (await this.view(r, true));
        } catch {
          const files = JSON.parse(String(r.files));
          view = {
            ...JSON.parse(String(r.pending || r.approved)),
            id: String(r.id),
            mode: r.mode,
            work: { id: r.work, title: "版本已下线", url: "/" },
            version: {
              id: r.version,
              title: "版本已下线",
              number: 0,
              engine: "",
              url: "/",
            },
            metadataBasis: "legacy-current",
            publicSource: null,
            author: "",
            createdAt: Number(r.created),
            expiresAt: r.expires,
            files,
            bytes: files.reduce((n: number, f: SaveFile) => n + f.bytes, 0),
            claims: 0,
            integrity: "sha256",
            compatibility: "author-declared",
          } as ShareView;
        }
        return {
          ...view,
          state: !["active", "pending"].includes(String(r.state))
            ? String(r.state)
            : this.ledger.entries.has(String(r.id))
              ? "revoked"
              : r.expires !== null && Number(r.expires) <= Date.now()
                ? "expired"
                : String(r.state),
          metadataRevision: Number(r.metadata_revision),
          pending: r.pending ? JSON.parse(String(r.pending)) : null,
        };
      }))),
      next: rows.length > 20 ? String(selected.at(-1)!.id) : null,
    };
  }
  async edit(owner: string, id: string, revision: number, input: ShareText) {
    const row = (await this.row(id));
    if (row.owner !== owner) throw new AccountError(404, "NOT_FOUND");
    (await this.live(row));
    if (row.metadata_revision !== revision)
      throw new AccountError(409, "CONTENT_CONFLICT");
    const text = JSON.stringify(this.text(input));
    (await this.db
      .prepare(
        "UPDATE wg_save_shares SET approved=$1,pending=$2,metadata_revision=metadata_revision+1 WHERE id=$3",
      )
      .run(
        row.mode === "link" ? text : row.approved,
        row.mode === "public" ? text : null,
        id,
      ));
  }
  async moderate(
    id: string,
    revision: number,
    action: "approve" | "block" | "reject" | "resolve",
    reason: string,
  ) {
    const row = (await this.row(id));
    if (action === "approve") (await this.live(row));
    if (row.metadata_revision !== revision)
      throw new AccountError(409, "CONTENT_CONFLICT");
    if (
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.length > 1000 ||
      !["approve", "block", "reject", "resolve"].includes(action)
    )
      throw new AccountError();
    if (action === "block" || action === "reject")
      (await this.revokeRows([row], "blocked"));
    else if (action === "approve") {
      if (row.mode !== "public" || !row.pending)
        throw new AccountError(409, "CONTENT_CONFLICT");
      (await this.db
        .prepare(
          "UPDATE wg_save_shares SET approved=pending,pending=NULL,state='active' WHERE id=$1",
        )
        .run(id));
    }
    (await this.db
      .prepare(
        "INSERT INTO wg_share_audit(share,action,reason,created) VALUES ($1,$2,$3,$4)",
      )
      .run(id, action, reason, Date.now()));
    (await this.db
      .prepare(
        "UPDATE wg_save_share_reports SET status='resolved' WHERE share=$1 AND status='open'",
      )
      .run(id));
  }
  private async revokeRows(rows: Row[], state: string) {
    for (const row of rows) {
      this.ledger.record(String(row.id));
      (await this.db
        .prepare("UPDATE wg_save_shares SET state=$1 WHERE id=$2")
        .run(state, row.id));
      (await this.saves.unpin(String(row.owner), "share:" + row.id));
    }
  }
  async revoke(owner: string, id: string) {
    const row = (await this.row(id));
    if (row.owner !== owner) throw new AccountError(404, "NOT_FOUND");
    (await this.revokeRows([row], "revoked"));
  }
  async revokeSource(owner: string, profile?: string) {
    (await this.revokeRows(
      (await this.db
        .prepare(
          "SELECT * FROM wg_save_shares WHERE owner=$1 AND ($2::text IS NULL OR profile=$3) AND state IN ('active','pending')",
        )
        .all(owner, profile ?? null, profile ?? null)),
      "revoked",
    ));
  }
  async replay() {
    for (const id of this.ledger.entries.keys()) {
      const row = (await this.db
        .prepare("SELECT * FROM wg_save_shares WHERE id=$1")
        .get(id));
      if (row) {
        (await this.db
          .prepare("UPDATE wg_save_shares SET state='revoked' WHERE id=$1")
          .run(id));
        (await this.saves.unpin(String(row.owner), "share:" + id));
      }
    }
  }
  async report(
    owner: string,
    id: string,
    secret: string | undefined,
    reason: string,
  ) {
    (await this.authorize(id, secret));
    if (typeof reason !== "string" || !reason.trim() || reason.length > 1000)
      throw new AccountError();
    (await this.limit("report:" + owner, 10));
    (await this.db
      .prepare(
        "INSERT INTO wg_save_share_reports(id,reporter,share,reason,created) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      )
      .run(randomUUID(), owner, id, reason.trim(), Date.now()));
  }
  async queue(): Promise<ModerationShare[]> {
    return (await Promise.all((await this.db
      .prepare(
        "SELECT * FROM wg_save_shares WHERE state IN ('active','pending') AND (pending IS NOT NULL OR id IN(SELECT share FROM wg_save_share_reports WHERE status='open')) ORDER BY created LIMIT 100",
      )
      .all())
      .map(async (r) => {
        let metadata: ReturnType<CatalogPolicy["require"]> | null = null;
        let catalogStatus: ModerationShare["catalogStatus"] = "visible";
        try {
          metadata = this.catalog.require(String(r.version));
        } catch (error) {
          catalogStatus =
            error instanceof AccountError && error.status === 404
              ? "hidden"
              : "unavailable";
        }
        const files = JSON.parse(String(r.files)) as SaveFile[];
        return {
          id: String(r.id),
          mode: r.mode as ModerationShare["mode"],
          state: String(r.state),
          metadataRevision: Number(r.metadata_revision),
          createdAt: Number(r.created),
          expiresAt: r.expires === null ? null : Number(r.expires),
          workId: String(r.work),
          versionId: String(r.version),
          work: metadata?.work ?? null,
          version: metadata?.version ?? null,
          catalogStatus,
          publication: r.published_meta
            ? JSON.parse(String(r.published_meta))
            : null,
          publicSource: (await this.publicSource(r)),
          author: String(
            (await this.db.prepare("SELECT name FROM \"user\" WHERE id=$1").get(r.owner))
              ?.name ?? "已注销玩家",
          ),
          files,
          bytes: files.reduce((n, f) => n + f.bytes, 0),
          pending: r.pending ? JSON.parse(String(r.pending)) : null,
          approved: r.approved ? JSON.parse(String(r.approved)) : null,
          reports: (await this.db
            .prepare(
              "SELECT id,reason,created FROM wg_save_share_reports WHERE share=$1 AND status='open'",
            )
            .all(r.id))
            .map((report) => ({
              id: String(report.id),
              reason: String(report.reason),
              created: Number(report.created),
            })),
        };
      })));
  }
  async leaseDownload(owner: string, files: SaveFile[]) {
    const id = "download:" + randomUUID();
    (await this.atomic(async () => {
      (await this.db
        .prepare("INSERT INTO wg_share_download_leases VALUES ($1,$2,$3)")
        .run(id, owner, Date.now() + 3600_000));
      (await this.saves.pin(owner, id, files));
    }));
    return id;
  }
  async releaseDownload(id: string) {
    const row = (await this.db
      .prepare("SELECT * FROM wg_share_download_leases WHERE id=$1")
      .get(id));
    if (row) {
      (await this.saves.unpin(String(row.owner), id));
      (await this.db
        .prepare("DELETE FROM wg_share_download_leases WHERE id=$1")
        .run(id));
    }
  }
  async gc() {
    for (const row of (await this.db
      .prepare(
        "SELECT id FROM wg_share_download_leases WHERE expires<$1 LIMIT 100",
      )
      .all(Date.now())))
      (await this.releaseDownload(String(row.id)));
    const rows = (await this.db
      .prepare(
        "SELECT * FROM wg_save_shares WHERE state IN ('active','pending') AND expires IS NOT NULL AND expires<=$1 LIMIT 100",
      )
      .all(Date.now()));
    (await this.revokeRows(rows, "expired"));
  }
}
