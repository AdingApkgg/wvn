import { randomUUID } from "node:crypto";
import type { PgDatabase } from "../database/postgres.ts";
import { validateCatalog } from "./catalog-policy.server.ts";
import { AccountError } from "./errors.server.ts";
export type CatalogItem = {
  id: string;
  title: string;
  url: string;
  versions: {
    id: string;
    number: number;
    title: string;
    engine: string;
    url: string;
  }[];
};
export type LibraryEntry = {
  workId: string;
  status: string;
  note: string;
  revision: number;
  lastVersionId: string | null;
  seconds: number;
};
export class LibraryStore {
  private versions = new Map<
    string,
    { work: CatalogItem; version: CatalogItem["versions"][number] }
  >();
  constructor(
    private db: PgDatabase,
    readonly catalog: CatalogItem[],
    private now = Date.now,
    private provider?: () => Promise<CatalogItem[]>,
  ) {
    for (const work of catalog)
      for (const version of work.versions) {
        if (this.versions.has(version.id))
          throw new Error("Duplicate catalog version");
        this.versions.set(version.id, { work, version });
      }
  }
  async currentCatalog(): Promise<CatalogItem[]> {
    if (!this.provider) return this.catalog;
    try {
      const rows = validateCatalog(await this.provider());
      const versions = new Set<string>();
      for (const work of rows) for (const version of work.versions) {
        if (versions.has(version.id)) throw new Error('Duplicate catalog version');
        versions.add(version.id);
      }
      return rows;
    } catch { throw new AccountError(503, 'CATALOG_UNAVAILABLE'); }
  }
  async list(owner: string): Promise<LibraryEntry[]> {
    return (await this.db
      .prepare(
        "SELECT l.*,COALESCE((SELECT sum(seconds) FROM wg_plays p WHERE p.user_id=l.user_id AND p.work_id=l.work_id),0) AS seconds FROM wg_library l WHERE l.user_id=$1 ORDER BY l.updated_at DESC",
      )
      .all(owner))
      .map((row) => ({
        workId: String(row.work_id),
        status: String(row.status),
        note: String(row.note),
        revision: Number(row.revision),
        lastVersionId: row.last_version ? String(row.last_version) : null,
        seconds: Number(row.seconds),
      }));
  }
  async edit(owner: string, workId: string, revision: number, patch: { status: string; note: string }) {
    return (await this.db.transaction(async () => (await this.editLocked(owner, workId, revision, patch)), { lock: 'wvn:library:' + owner }));
  }
  async start(owner: string, versionId: string, eventId: string) {
    return (await this.db.transaction(async () => (await this.startLocked(owner, versionId, eventId)), { lock: 'wvn:library:' + owner }));
  }
  async heartbeat(owner: string, id: string, seq: number, active: boolean) {
    return (await this.db.transaction(async () => (await this.heartbeatLocked(owner, id, seq, active)), { lock: 'wvn:library:' + owner }));
  }
  private async editLocked(
    owner: string,
    workId: string,
    revision: number,
    patch: { status: string; note: string },
  ): Promise<LibraryEntry> {
    if (!(await this.currentCatalog()).some((w) => w.id === workId))
      throw new AccountError(404, "WORK_NOT_FOUND");
    if (
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      !["wanted", "playing", "completed", "paused", "dropped"].includes(
        patch.status,
      ) ||
      typeof patch.note !== "string" ||
      patch.note.length > 5000
    )
      throw new AccountError(400, "LIBRARY_INVALID");
    const existing = (await this.db
      .prepare("SELECT revision FROM wg_library WHERE user_id=$1 AND work_id=$2")
      .get(owner, workId));
    if (Number(existing?.revision ?? 0) !== revision)
      throw new AccountError(409, "CONTENT_CONFLICT");
    (await this.db
      .prepare(
        "INSERT INTO wg_library(user_id,work_id,status,note,revision,updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,work_id) DO UPDATE SET status=excluded.status,note=excluded.note,revision=excluded.revision,updated_at=excluded.updated_at",
      )
      .run(owner, workId, patch.status, patch.note, revision + 1, this.now()));
    return (await this.list(owner)).find((w) => w.workId === workId)!;
  }
  private async startLocked(owner: string, versionId: string, eventId: string): Promise<{ id: string }> {
    const current = await this.currentCatalog();
    const work = current.find(work => work.versions.some(version => version.id === versionId));
    const selected = work ? { work, version: work.versions.find(version => version.id === versionId)! } : undefined;
    if (!selected) throw new AccountError(404, "VERSION_NOT_FOUND");
    if (
      typeof eventId !== "string" ||
      eventId.length < 3 ||
      eventId.length > 100
    )
      throw new AccountError(400, "EVENT_INVALID");
    const existing = (await this.db
      .prepare(
        "SELECT id,version_id FROM wg_plays WHERE user_id=$1 AND event_id=$2",
      )
      .get(owner, eventId));
    if (existing) {
      if (existing.version_id !== versionId)
        throw new AccountError(409, "EVENT_CONFLICT");
      return { id: String(existing.id) };
    }
    const id = randomUUID();
    await this.db.transaction(async () => {
      (await this.db
        .prepare(
          "INSERT INTO wg_plays(id,user_id,work_id,version_id,event_id,started_at,last_at,active) VALUES ($1,$2,$3,$4,$5,$6,$7,0)",
        )
        .run(
          id,
          owner,
          selected.work.id,
          versionId,
          eventId,
          this.now(),
          this.now(),
        ));
      (await this.db
        .prepare(
          "INSERT INTO wg_library(user_id,work_id,status,note,revision,last_version,updated_at) VALUES ($1,$2,'playing','',1,$3,$4) ON CONFLICT(user_id,work_id) DO UPDATE SET last_version=excluded.last_version,updated_at=excluded.updated_at,revision=wg_library.revision+1",
        )
        .run(owner, selected.work.id, versionId, this.now()));

    }, { lock: 'wvn:account-write' });
    return { id };
  }
  private async heartbeatLocked(
    owner: string,
    id: string,
    seq: number,
    active: boolean,
  ): Promise<{ seconds: number }> {
    if (!Number.isSafeInteger(seq) || seq < 1 || typeof active !== "boolean")
      throw new AccountError(400, "HEARTBEAT_INVALID");
    const row = (await this.db
      .prepare("SELECT * FROM wg_plays WHERE user_id=$1 AND id=$2")
      .get(owner, id));
    if (!row) throw new AccountError(404, "PLAY_NOT_FOUND");
    if (seq <= Number(row.seq)) return { seconds: Number(row.seconds) };
    const credited = Number(
      (await this.db
        .prepare(
          "SELECT credited_until FROM wg_play_clock WHERE user_id=$1 AND work_id=$2",
        )
        .get(owner, String(row.work_id)))?.credited_until ?? 0,
    );
    const delta = row.active
      ? Math.max(
          0,
          Math.floor(
            (this.now() -
              Math.max(Number(row.last_at), credited, this.now() - 60_000)) /
              1000,
          ),
        )
      : 0;
    if (delta > 0)
      (await this.db
        .prepare(
          "INSERT INTO wg_play_clock VALUES ($1,$2,$3) ON CONFLICT(user_id,work_id) DO UPDATE SET credited_until=GREATEST(wg_play_clock.credited_until,excluded.credited_until)",
        )
        .run(owner, String(row.work_id), this.now()));
    const seconds = Number(row.seconds) + delta;
    (await this.db
      .prepare(
        "UPDATE wg_plays SET seq=$1,active=$2,seconds=$3,last_at=$4 WHERE user_id=$5 AND id=$6",
      )
      .run(seq, active ? 1 : 0, seconds, this.now(), owner, id));
    return { seconds };
  }
}
