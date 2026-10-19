import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
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
    private db: DatabaseSync,
    readonly catalog: CatalogItem[],
    private now = Date.now,
  ) {
    for (const work of catalog)
      for (const version of work.versions) {
        if (this.versions.has(version.id))
          throw new Error("Duplicate catalog version");
        this.versions.set(version.id, { work, version });
      }
    db.exec(`CREATE TABLE IF NOT EXISTS wg_library(user_id TEXT NOT NULL,work_id TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL,last_version TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,work_id));
  CREATE TABLE IF NOT EXISTS wg_plays(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,work_id TEXT NOT NULL,version_id TEXT NOT NULL,event_id TEXT NOT NULL,started_at INTEGER NOT NULL,last_at INTEGER NOT NULL,seq INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0,seconds INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,event_id));
  CREATE INDEX IF NOT EXISTS wg_plays_user ON wg_plays(user_id,work_id);
  CREATE TABLE IF NOT EXISTS wg_play_clock(user_id TEXT NOT NULL,work_id TEXT NOT NULL,credited_until INTEGER NOT NULL,PRIMARY KEY(user_id,work_id));`);
  }
  list(owner: string): LibraryEntry[] {
    return this.db
      .prepare(
        "SELECT l.*,COALESCE((SELECT sum(seconds) FROM wg_plays p WHERE p.user_id=l.user_id AND p.work_id=l.work_id),0) AS seconds FROM wg_library l WHERE l.user_id=? ORDER BY l.updated_at DESC",
      )
      .all(owner)
      .map((row) => ({
        workId: String(row.work_id),
        status: String(row.status),
        note: String(row.note),
        revision: Number(row.revision),
        lastVersionId: row.last_version ? String(row.last_version) : null,
        seconds: Number(row.seconds),
      }));
  }
  edit(
    owner: string,
    workId: string,
    revision: number,
    patch: { status: string; note: string },
  ): LibraryEntry {
    if (!this.catalog.some((w) => w.id === workId))
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
    const existing = this.db
      .prepare("SELECT revision FROM wg_library WHERE user_id=? AND work_id=?")
      .get(owner, workId);
    if (Number(existing?.revision ?? 0) !== revision)
      throw new AccountError(409, "CONTENT_CONFLICT");
    this.db
      .prepare(
        "INSERT INTO wg_library(user_id,work_id,status,note,revision,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,work_id) DO UPDATE SET status=excluded.status,note=excluded.note,revision=excluded.revision,updated_at=excluded.updated_at",
      )
      .run(owner, workId, patch.status, patch.note, revision + 1, this.now());
    return this.list(owner).find((w) => w.workId === workId)!;
  }
  start(owner: string, versionId: string, eventId: string): { id: string } {
    const selected = this.versions.get(versionId);
    if (!selected) throw new AccountError(404, "VERSION_NOT_FOUND");
    if (
      typeof eventId !== "string" ||
      eventId.length < 3 ||
      eventId.length > 100
    )
      throw new AccountError(400, "EVENT_INVALID");
    const existing = this.db
      .prepare(
        "SELECT id,version_id FROM wg_plays WHERE user_id=? AND event_id=?",
      )
      .get(owner, eventId);
    if (existing) {
      if (existing.version_id !== versionId)
        throw new AccountError(409, "EVENT_CONFLICT");
      return { id: String(existing.id) };
    }
    const id = randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO wg_plays(id,user_id,work_id,version_id,event_id,started_at,last_at,active) VALUES (?,?,?,?,?,?,?,0)",
        )
        .run(
          id,
          owner,
          selected.work.id,
          versionId,
          eventId,
          this.now(),
          this.now(),
        );
      this.db
        .prepare(
          "INSERT INTO wg_library(user_id,work_id,status,note,revision,last_version,updated_at) VALUES (?,?,'playing','',1,?,?) ON CONFLICT(user_id,work_id) DO UPDATE SET last_version=excluded.last_version,updated_at=excluded.updated_at,revision=wg_library.revision+1",
        )
        .run(owner, selected.work.id, versionId, this.now());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { id };
  }
  heartbeat(
    owner: string,
    id: string,
    seq: number,
    active: boolean,
  ): { seconds: number } {
    if (!Number.isSafeInteger(seq) || seq < 1 || typeof active !== "boolean")
      throw new AccountError(400, "HEARTBEAT_INVALID");
    const row = this.db
      .prepare("SELECT * FROM wg_plays WHERE user_id=? AND id=?")
      .get(owner, id);
    if (!row) throw new AccountError(404, "PLAY_NOT_FOUND");
    if (seq <= Number(row.seq)) return { seconds: Number(row.seconds) };
    const credited = Number(
      this.db
        .prepare(
          "SELECT credited_until FROM wg_play_clock WHERE user_id=? AND work_id=?",
        )
        .get(owner, String(row.work_id))?.credited_until ?? 0,
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
      this.db
        .prepare(
          "INSERT INTO wg_play_clock VALUES (?,?,?) ON CONFLICT(user_id,work_id) DO UPDATE SET credited_until=MAX(credited_until,excluded.credited_until)",
        )
        .run(owner, String(row.work_id), this.now());
    const seconds = Number(row.seconds) + delta;
    this.db
      .prepare(
        "UPDATE wg_plays SET seq=?,active=?,seconds=?,last_at=? WHERE user_id=? AND id=?",
      )
      .run(seq, active ? 1 : 0, seconds, this.now(), owner, id);
    return { seconds };
  }
}
