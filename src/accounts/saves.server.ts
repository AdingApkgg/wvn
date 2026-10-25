import { createHash, randomUUID } from "node:crypto";
import { LocalBlobStore, type BlobStore } from './blob-store.server.ts';
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { AccountError } from "./errors.server.ts";
export type SaveFile = { name: string; bytes: number; sha256: string };
export type SaveProfile = {
  id: string;
  versionId: string;
  head: string | null;
  generation: number;
};
export type SaveRevision = {
  id: string;
  parent: string | null;
  source: string | null;
  files: SaveFile[];
  conflict: boolean;
  originKind?: "share";
  createdAt: number;
};
export type SaveHistory = {
  items: SaveRevision[];
  current: SaveRevision | null;
  next: string | null;
};
type UploadFile = SaveFile & { id: string };
type Row = Record<string, SQLOutputValue>;
const SHA = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const GiB = 1024 ** 3;
export class SaveStore {
  onRemove?: (owner: string, profileId?: string) => void;
  private blobs: BlobStore;
  private writes = 0;
  constructor(
    private db: DatabaseSync,
    root: string,
    free?: () => number,
    backend?: BlobStore,
  ) {
    this.blobs = backend ?? new LocalBlobStore(root, free);
    db.exec(`CREATE TABLE IF NOT EXISTS wg_save_profiles(id TEXT PRIMARY KEY,owner TEXT NOT NULL,version_id TEXT NOT NULL,generation INTEGER NOT NULL,head TEXT,deleted INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS wg_profiles_owner ON wg_save_profiles(owner,version_id);
  CREATE UNIQUE INDEX IF NOT EXISTS wg_profile_active_version ON wg_save_profiles(owner,version_id) WHERE deleted=0;
  CREATE TABLE IF NOT EXISTS wg_save_parts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,upload_id TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wg_save_origins(revision TEXT PRIMARY KEY,kind TEXT NOT NULL,share_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS wg_save_revisions(id TEXT PRIMARY KEY,owner TEXT NOT NULL,profile TEXT NOT NULL,parent TEXT,source TEXT,files TEXT NOT NULL,conflict INTEGER NOT NULL,created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS wg_revisions_profile ON wg_save_revisions(owner,profile,created);
  CREATE TABLE IF NOT EXISTS wg_save_blobs(owner TEXT NOT NULL,hash TEXT NOT NULL,bytes INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,hash));
  CREATE TABLE IF NOT EXISTS wg_save_refs(owner TEXT NOT NULL,revision TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(revision,hash));
  CREATE INDEX IF NOT EXISTS wg_refs_blob ON wg_save_refs(owner,hash);
  CREATE TABLE IF NOT EXISTS wg_save_uploads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,profile TEXT NOT NULL,expected_head TEXT,generation INTEGER NOT NULL,capture TEXT NOT NULL,manifest TEXT NOT NULL,files TEXT NOT NULL,total INTEGER NOT NULL,expires INTEGER NOT NULL,result TEXT,UNIQUE(owner,profile,capture));`);
  }
  private tx<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private async space(bytes = 0) {
    if (await this.blobs.free() < 62 * GiB + bytes)
      throw new AccountError(507, "SPACE_STOP");
  }
  private profile(owner: string, id: string): SaveProfile {
    const row = this.db
      .prepare("SELECT * FROM wg_save_profiles WHERE owner=? AND id=?")
      .get(owner, id);
    if (!row) throw new AccountError(404, "NOT_FOUND");
    if (row.deleted) throw new AccountError(410, "PROFILE_DELETED");
    return {
      id: String(row.id),
      versionId: String(row.version_id),
      head: row.head ? String(row.head) : null,
      generation: Number(row.generation),
    };
  }
  profiles(owner: string, versionId?: string): SaveProfile[] {
    return this.db
      .prepare(
        "SELECT * FROM wg_save_profiles WHERE owner=? AND deleted=0 AND (? IS NULL OR version_id=?) ORDER BY created DESC",
      )
      .all(owner, versionId ?? null, versionId ?? null)
      .map((r) => this.profile(owner, String(r.id)));
  }
  createProfile(owner: string, versionId: string): SaveProfile {
    if (typeof versionId !== "string" || versionId.length > 200 || !versionId)
      throw new AccountError();
    return this.tx(() => {
      const existing = this.profiles(owner, versionId)[0];
      if (existing) return existing;
      if (
        Number(
          this.db
            .prepare(
              "SELECT count(*) AS n FROM wg_save_profiles WHERE owner=? AND deleted=0",
            )
            .get(owner)?.n,
        ) >= 200
      )
        throw new AccountError(413, "PROFILE_LIMIT");
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO wg_save_profiles(id,owner,version_id,generation,created) VALUES (?,?,?,1,?)",
        )
        .run(id, owner, versionId, Date.now());
      return this.profile(owner, id);
    });
  }

  private manifest(files: SaveFile[]): SaveFile[] {
    if (!Array.isArray(files) || files.length < 1 || files.length > 512)
      throw new AccountError(400, "MANIFEST_INVALID");
    const names = new Set<string>();
    let bytes = 0;
    const safe = files.map((file) => {
      if (
        typeof file.name !== "string" ||
        Buffer.byteLength(file.name, "utf8") > 240 ||
        !file.name ||
        /\p{Cs}/u.test(file.name) ||
        file.name !== file.name.normalize("NFC") ||
        /[\\:*?"<>|\p{Cc}\p{Cf}]/u.test(file.name) ||
        file.name
          .split("/")
          .some(
            (s) =>
              !s ||
              s === "." ||
              s === ".." ||
              /[ .]$/.test(s) ||
              /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s),
          ) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        file.bytes > 32 * 1024 ** 2 ||
        typeof file.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      )
        throw new AccountError(400, "MANIFEST_INVALID");
      const key = file.name.toLowerCase();
      if (names.has(key)) throw new AccountError(400, "MANIFEST_INVALID");
      names.add(key);
      bytes += file.bytes;
      return { name: file.name, bytes: file.bytes, sha256: file.sha256 };
    });
    if (bytes > 64 * 1024 ** 2) throw new AccountError(413, "SNAPSHOT_LIMIT");
    return safe.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }
  async reserve(
    owner: string,
    profileId: string,
    input: {
      expectedHead: string | null;
      generation: number;
      captureId: string;
      files: SaveFile[];
    },
  ): Promise<{ id: string; files: UploadFile[]; complete: boolean }> {
    const profile = this.profile(owner, profileId);
    if (input.generation !== profile.generation)
      throw new AccountError(410, "GENERATION_CHANGED");
    const files = this.manifest(input.files);
    if (
      typeof input.captureId !== "string" ||
      !input.captureId ||
      input.captureId.length > 100 ||
      !(input.expectedHead === null || typeof input.expectedHead === "string")
    )
      throw new AccountError();
    if (
      input.expectedHead !== null &&
      !this.db
        .prepare(
          "SELECT id FROM wg_save_revisions WHERE owner=? AND profile=? AND id=?",
        )
        .get(owner, profileId, input.expectedHead)
    )
      throw new AccountError(400, "BASE_INVALID");
    const manifest = SHA(
      JSON.stringify({
        files,
        head: input.expectedHead,
        generation: input.generation,
      }),
    );
    let previous = this.db
      .prepare(
        "SELECT * FROM wg_save_uploads WHERE owner=? AND profile=? AND capture=?",
      )
      .get(owner, profileId, input.captureId);
    if (previous) {
      if (previous.manifest !== manifest)
        throw new AccountError(409, "CAPTURE_CHANGED");
      if (previous.result || Number(previous.expires) >= Date.now())
        return {
          id: String(previous.id),
          files: JSON.parse(String(previous.files)),
          complete: !!previous.result,
        };
    }
    const total = files.reduce((n, f) => n + f.bytes, 0);
    await this.space(total);
    this.profile(owner, profileId);
    const added = [...new Map(files.map((f) => [f.sha256, f])).values()].reduce(
      (n, f) =>
        n +
        (this.db
          .prepare(
            "SELECT 1 FROM wg_save_refs WHERE owner=? AND hash=? LIMIT 1",
          )
          .get(owner, f.sha256)
          ? 0
          : f.bytes),
      0,
    );
    return this.tx(() => {
      const freshProfile = this.profile(owner, profileId);
      if (freshProfile.generation !== input.generation) throw new AccountError(410, 'GENERATION_CHANGED');
      previous = this.db.prepare("SELECT * FROM wg_save_uploads WHERE owner=? AND profile=? AND capture=?").get(owner, profileId, input.captureId);
      if (previous) {
        if (previous.manifest !== manifest) throw new AccountError(409, 'CAPTURE_CHANGED');
        if (previous.result || Number(previous.expires) >= Date.now()) return { id: String(previous.id), files: JSON.parse(String(previous.files)) as UploadFile[], complete: !!previous.result };
      }

      const used = Number(
        this.db
          .prepare(
            "SELECT COALESCE(sum(bytes),0) AS n FROM wg_save_blobs b WHERE b.owner=? AND EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash)",
          )
          .get(owner)?.n,
      );
      const reserved = Number(
        this.db
          .prepare(
            "SELECT COALESCE(sum(total),0) AS n FROM wg_save_uploads WHERE owner=? AND result IS NULL AND expires>?",
          )
          .get(owner, Date.now())?.n,
      );
      if (used + reserved + added > 512 * 1024 ** 2)
        throw new AccountError(413, "ACCOUNT_QUOTA");
      const id = previous ? String(previous.id) : randomUUID(),
        uploadFiles = files.map((f) => ({ ...f, id: randomUUID() }));
      if (previous) {
        this.db
          .prepare(
            "UPDATE wg_save_uploads SET files=?,total=?,expires=? WHERE id=? AND owner=? AND result IS NULL",
          )
          .run(
            JSON.stringify(uploadFiles),
            added,
            Date.now() + 3600_000,
            id,
            owner,
          );
        return { id, files: uploadFiles, complete: false };
      }
      this.db
        .prepare(
          "INSERT INTO wg_save_uploads(id,owner,profile,expected_head,generation,capture,manifest,files,total,expires) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          owner,
          profileId,
          input.expectedHead,
          input.generation,
          input.captureId,
          manifest,
          JSON.stringify(uploadFiles),
          added,
          Date.now() + 3600_000,
        );
      return { id, files: uploadFiles, complete: false };
    });
  }
  private upload(owner: string, id: string): Row {
    const row = this.db
      .prepare("SELECT * FROM wg_save_uploads WHERE owner=? AND id=?")
      .get(owner, id);
    if (!row) throw new AccountError(404, "NOT_FOUND");
    const profile = this.profile(owner, String(row.profile));
    if (profile.generation !== row.generation)
      throw new AccountError(410, "GENERATION_CHANGED");
    if (!row.result && Number(row.expires) < Date.now())
      throw new AccountError(410, "UPLOAD_EXPIRED");
    return row;
  }
  async gc() {
    // Known request parts only; never scan unrelated files or erase capture manifests.
    const parts = this.db
      .prepare("SELECT * FROM wg_save_parts WHERE created<? LIMIT 100")
      .all(Date.now() - 3600_000);
    for (const part of parts) {
      try {
        await this.blobs.remove(SHA(String(part.owner)), String(part.id) + ".upload");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") continue;
      }
      this.db.prepare("DELETE FROM wg_save_parts WHERE id=?").run(part.id);
    }
    const cutoff = Date.now() - 7 * 86400_000;
    const rows = this.db
      .prepare(
        "SELECT b.* FROM wg_save_blobs b WHERE b.created<? AND NOT EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash) AND NOT EXISTS(SELECT 1 FROM wg_save_uploads u,json_each(u.files) f WHERE u.owner=b.owner AND u.expires>? AND u.result IS NULL AND json_extract(f.value,'$.sha256')=b.hash) LIMIT 100",
      )
      .all(cutoff, Date.now());
    for (const row of rows) {
      try {
        await this.blobs.remove(SHA(String(row.owner)), String(row.hash) + ".bin");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") continue;
      }
      this.db
        .prepare("DELETE FROM wg_save_blobs WHERE owner=? AND hash=?")
        .run(row.owner, row.hash);
    }
  }
  snapshotMetadata(owner: string, profileId: string, revisionId: string) {
    const profile = this.profile(owner, profileId);
    const row = this.db
      .prepare(
        "SELECT * FROM wg_save_revisions WHERE owner=? AND profile=? AND id=?",
      )
      .get(owner, profileId, revisionId);
    if (!row) throw new AccountError(404, "NOT_FOUND");
    const revision = this.revision(row);
    return { profile, revision };
  }
  async snapshot(owner: string, profileId: string, revisionId: string) {
    const value = this.snapshotMetadata(owner, profileId, revisionId);
    for (const file of value.revision.files) await this.readBlob(owner, file);
    return this.snapshotMetadata(owner, profileId, revisionId);
  }
  async readBlob(owner: string, file: SaveFile): Promise<Buffer> {
    let bytes: Buffer;
    try {
      bytes = await this.blobs.read(SHA(owner), file.sha256);
    } catch {
      throw new AccountError(503, "FILE_UNAVAILABLE");
    }
    if (bytes.length !== file.bytes || SHA(bytes) !== file.sha256)
      throw new AccountError(503, "FILE_CORRUPT");
    return bytes;
  }
  pin(owner: string, key: string, files: SaveFile[]) {
    for (const file of files)
      this.db
        .prepare("INSERT OR IGNORE INTO wg_save_refs VALUES (?,?,?)")
        .run(owner, key, file.sha256);
  }
  unpin(owner: string, key: string) {
    this.db
      .prepare(
        "UPDATE wg_save_blobs SET created=? WHERE owner=? AND hash IN(SELECT hash FROM wg_save_refs WHERE owner=? AND revision=?)",
      )
      .run(Date.now(), owner, owner, key);
    this.db
      .prepare("DELETE FROM wg_save_refs WHERE owner=? AND revision=?")
      .run(owner, key);
  }
  async write(
    owner: string, uploadId: string, fileId: string,
    stream: ReadableStream<Uint8Array>,
    locked: <T>(fn: () => T | Promise<T>) => Promise<T> = async (fn) => fn(),
  ): Promise<void> {
    if (this.writes >= 4) throw new AccountError(429, 'UPLOAD_BUSY');
    this.writes++;
    try {
    const file = await locked(async () => {
      const current = this.upload(owner, uploadId);
      if (current.result) throw new AccountError(409, "UPLOAD_COMMITTED");
      const item = (JSON.parse(String(current.files)) as UploadFile[]).find(f => f.id === fileId);
      if (!item) throw new AccountError(404, "NOT_FOUND");
      await this.space(item.bytes); return item;
    });
    const hash = createHash("sha256"), chunks: Uint8Array[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      bytes += chunk.byteLength;
      if (bytes > file.bytes || bytes > 32 * 1024 ** 2) throw new AccountError(413, "FILE_LIMIT");
      hash.update(chunk); chunks.push(chunk);
    }
    if (bytes !== file.bytes || hash.digest("hex") !== file.sha256) throw new AccountError(400, "FILE_HASH_MISMATCH");
    await locked(async () => {
      const current = this.upload(owner, uploadId);
      if (current.result) throw new AccountError(409, "UPLOAD_COMMITTED");
      if (!(JSON.parse(String(current.files)) as UploadFile[]).some(f => f.id === fileId)) throw new AccountError(409, "UPLOAD_RENEWED");
      await this.blobs.write(SHA(owner), file.sha256, Buffer.concat(chunks));
      // The caller holds the account lock through durable storage acknowledgement.
      this.upload(owner, uploadId);
      this.db.prepare("INSERT INTO wg_save_blobs(owner,hash,bytes,created) VALUES (?,?,?,?) ON CONFLICT(owner,hash) DO UPDATE SET bytes=excluded.bytes")
        .run(owner, file.sha256, bytes, Date.now());
    });
      } finally { this.writes--; }
  }
  private revision(row: Row): SaveRevision {
    return {
      id: String(row.id),
      parent: row.parent ? String(row.parent) : null,
      source: row.source ? String(row.source) : null,
      files: JSON.parse(String(row.files)),
      conflict: !!row.conflict,
      ...(this.db
        .prepare("SELECT 1 FROM wg_save_origins WHERE revision=?")
        .get(row.id)
        ? { originKind: "share" as const }
        : {}),
      createdAt: Number(row.created),
    };
  }
  private insertRevision(
    owner: string,
    profileId: string,
    parent: string | null,
    files: SaveFile[],
    conflict: boolean,
    source: string | null = null,
  ): SaveRevision {
    const id = randomUUID(),
      created = Date.now();
    this.db
      .prepare("INSERT INTO wg_save_revisions VALUES (?,?,?,?,?,?,?,?)")
      .run(
        id,
        owner,
        profileId,
        parent,
        source,
        JSON.stringify(files),
        conflict ? 1 : 0,
        created,
      );
    for (const file of files)
      this.db
        .prepare("INSERT OR IGNORE INTO wg_save_refs VALUES (?,?,?)")
        .run(owner, id, file.sha256);
    return { id, parent, source, files, conflict, createdAt: created };
  }
  commitReceived(
    owner: string,
    uploadId: string,
    shareId: string,
    onCommit?: (result: { conflict: boolean; revision: SaveRevision }) => void,
  ) {
    return this.commit(owner, uploadId, shareId, onCommit);
  }
  async commit(
    owner: string,
    uploadId: string,
    receivedShare?: string,
    onCommit?: (result: { conflict: boolean; revision: SaveRevision }) => void,
  ): Promise<{ conflict: boolean; revision: SaveRevision }> {
    const upload = this.upload(owner, uploadId);
    if (upload.result) return JSON.parse(String(upload.result));
    const files = (JSON.parse(String(upload.files)) as UploadFile[]).map(
      ({ id, ...f }) => f,
    );
    for (const file of files) {
      const blob = this.db
        .prepare("SELECT bytes FROM wg_save_blobs WHERE owner=? AND hash=?")
        .get(owner, file.sha256);
      if (blob?.bytes !== file.bytes)
        throw new AccountError(409, "FILES_INCOMPLETE");
      let bytes: Buffer;
      try {
        bytes = await this.blobs.read(SHA(owner), file.sha256);
      } catch {
        throw new AccountError(409, "FILES_INCOMPLETE");
      }
      if (bytes.length !== file.bytes || SHA(bytes) !== file.sha256)
        throw new AccountError(400, "FILE_HASH_MISMATCH");
    }
    return this.tx(() => {
      const current = this.upload(owner, uploadId);
      if (current.result) return JSON.parse(String(current.result));
      if (current.files !== upload.files) throw new AccountError(409, 'UPLOAD_RENEWED');

      const profile = this.profile(owner, String(upload.profile));
      if (profile.generation !== upload.generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      const conflict = !receivedShare && profile.head !== upload.expected_head;
      const revision = this.insertRevision(
        owner,
        profile.id,
        upload.expected_head ? String(upload.expected_head) : null,
        files,
        conflict,
      );
      if (receivedShare) {
        this.db
          .prepare("INSERT INTO wg_save_origins VALUES (?,'share',?)")
          .run(revision.id, receivedShare);
        revision.originKind = "share";
      }
      if (!conflict && !receivedShare)
        this.db
          .prepare("UPDATE wg_save_profiles SET head=? WHERE owner=? AND id=?")
          .run(revision.id, owner, profile.id);
      const result = { conflict, revision };
      this.db
        .prepare("UPDATE wg_save_uploads SET result=? WHERE owner=? AND id=?")
        .run(JSON.stringify(result), owner, uploadId);
      onCommit?.(result);
      return result;
    });
  }
  historyPage(owner: string, profileId: string, cursor?: string): SaveHistory {
    const profile = this.profile(owner, profileId);
    const base = cursor
      ? this.db
          .prepare(
            "SELECT rowid AS pos,created FROM wg_save_revisions WHERE owner=? AND profile=? AND id=?",
          )
          .get(owner, profileId, cursor)
      : null;
    if (cursor && !base) throw new AccountError(400, "CURSOR_INVALID");
    const rows = base
      ? this.db
          .prepare(
            "SELECT * FROM wg_save_revisions WHERE owner=? AND profile=? AND (created<? OR (created=? AND rowid<?)) ORDER BY created DESC,rowid DESC LIMIT 201",
          )
          .all(owner, profileId, base.created, base.created, base.pos)
      : this.db
          .prepare(
            "SELECT * FROM wg_save_revisions WHERE owner=? AND profile=? ORDER BY created DESC,rowid DESC LIMIT 201",
          )
          .all(owner, profileId);
    const items = rows.slice(0, 200).map((row) => this.revision(row));
    const head = profile.head
      ? this.db
          .prepare(
            "SELECT * FROM wg_save_revisions WHERE owner=? AND profile=? AND id=?",
          )
          .get(owner, profileId, profile.head)
      : null;
    return {
      items,
      current: head ? this.revision(head) : null,
      next: rows.length > 200 ? items.at(-1)!.id : null,
    };
  }
  history(owner: string, profileId: string): SaveRevision[] {
    return this.historyPage(owner, profileId).items;
  }
  allHistory(owner: string, profileId: string): SaveRevision[] {
    const all: SaveRevision[] = [];
    let cursor: string | undefined;
    do {
      const page = this.historyPage(owner, profileId, cursor);
      all.push(...page.items);
      cursor = page.next ?? undefined;
    } while (cursor);
    return all;
  }
  async read(
    owner: string,
    profileId: string,
    revisionId: string,
    name: string,
  ): Promise<Buffer> {
    this.profile(owner, profileId);
    const row = this.db
      .prepare(
        "SELECT * FROM wg_save_revisions WHERE owner=? AND profile=? AND id=?",
      )
      .get(owner, profileId, revisionId);
    if (!row) throw new AccountError(404, "NOT_FOUND");
    const file = (JSON.parse(String(row.files)) as SaveFile[]).find(
      (f) => f.name === name,
    );
    if (!file) throw new AccountError(404, "NOT_FOUND");
    let bytes: Buffer;
    try {
      bytes = await this.blobs.read(SHA(owner), file.sha256);
    } catch {
      throw new AccountError(503, "FILE_UNAVAILABLE");
    }
    if (bytes.length !== file.bytes || SHA(bytes) !== file.sha256)
      throw new AccountError(503, "FILE_CORRUPT");
    return bytes;
  }
  async restore(
    owner: string,
    profileId: string,
    sourceId: string,
    head: string | null,
    generation: number,
  ): Promise<SaveRevision> {
    const sourceValue = this.snapshotMetadata(owner, profileId, sourceId);
    for (const file of sourceValue.revision.files) await this.readBlob(owner, file);
    return this.tx(() => {
      const profile = this.profile(owner, profileId);
      if (profile.generation !== generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      if (profile.head !== head)
        throw new AccountError(409, "CONTENT_CONFLICT");
      const source = this.db
        .prepare(
          "SELECT * FROM wg_save_revisions WHERE owner=? AND profile=? AND id=?",
        )
        .get(owner, profileId, sourceId);
      if (!source) throw new AccountError(404, "NOT_FOUND");
      const files = JSON.parse(String(source.files)) as SaveFile[];
      const revision = this.insertRevision(
        owner,
        profileId,
        head,
        files,
        false,
        sourceId,
      );
      this.db
        .prepare(
          "INSERT INTO wg_save_origins(revision,kind,share_id) SELECT ?,kind,share_id FROM wg_save_origins WHERE revision=?",
        )
        .run(revision.id, sourceId);
      this.db
        .prepare("UPDATE wg_save_profiles SET head=? WHERE owner=? AND id=?")
        .run(revision.id, owner, profileId);
      if (
        this.db
          .prepare("SELECT 1 FROM wg_save_origins WHERE revision=?")
          .get(revision.id)
      )
        revision.originKind = "share";
      return revision;
    });
  }
  remove(
    owner: string,
    profileId: string,
    head: string | null,
    generation: number,
  ): void {
    this.tx(() => {
      const profile = this.profile(owner, profileId);
      if (profile.generation !== generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      if (profile.head !== head)
        throw new AccountError(409, "CONTENT_CONFLICT");
      this.onRemove?.(owner, profileId);
      this.db
        .prepare(
          "UPDATE wg_save_profiles SET deleted=1,generation=generation+1 WHERE owner=? AND id=?",
        )
        .run(owner, profileId);
      this.db
        .prepare(
          "UPDATE wg_save_blobs SET created=? WHERE owner=? AND hash IN(SELECT hash FROM wg_save_refs WHERE owner=? AND revision IN(SELECT id FROM wg_save_revisions WHERE owner=? AND profile=?))",
        )
        .run(Date.now(), owner, owner, owner, profileId);
      this.db
        .prepare(
          "DELETE FROM wg_save_refs WHERE owner=? AND revision IN(SELECT id FROM wg_save_revisions WHERE owner=? AND profile=?)",
        )
        .run(owner, owner, profileId);
      this.db
        .prepare(
          "UPDATE wg_save_uploads SET expires=0 WHERE owner=? AND profile=? AND result IS NULL",
        )
        .run(owner, profileId);
    });
  }
  deleteOwner(owner: string, deletedAt = Date.now()) {
    this.onRemove?.(owner);
    this.db
      .prepare(
        "DELETE FROM wg_save_origins WHERE revision IN (SELECT id FROM wg_save_revisions WHERE owner=?)",
      )
      .run(owner);
    this.db
      .prepare("UPDATE wg_save_blobs SET created=? WHERE owner=?")
      .run(deletedAt, owner);
    for (const table of [
      "wg_save_refs",
      "wg_save_uploads",
      "wg_save_revisions",
      "wg_save_profiles",
    ])
      this.db.prepare(`DELETE FROM ${table} WHERE owner=?`).run(owner);
  }
}
