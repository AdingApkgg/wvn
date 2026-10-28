import { createHash, randomUUID } from "node:crypto";
import { LocalBlobStore, type BlobStore } from './blob-store.server.ts';
import type { PgDatabase, PgRow } from "../database/postgres.ts";
import { AccountError } from "./errors.server.ts";
export type SaveFile = { name: string; bytes: number; sha256: string };
export type SaveProfile = {
  id: string;
  versionId: string;
  engineReleaseId?: string;
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
type Row = PgRow;
const SHA = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const GiB = 1024 ** 3;
// 独立 scope 沿用原唯一索引；旧客户端按原 versionId 查询仍只读旧档。
function profileScope(versionId: string, releaseId?: string) {
  if (!versionId || typeof versionId !== "string" || versionId.length > 200 || (releaseId !== undefined && !/^renpy-[a-f0-9]{64}$/.test(releaseId))) throw new AccountError();
  return releaseId ? JSON.stringify(["wvn-engine-cloud-v2",versionId,releaseId]) : versionId;
}
function profileIdentity(scope: string): {versionId:string;engineReleaseId?:string} {
  if (scope.startsWith('["wvn-engine-cloud-v2",')) {
    const [,versionId,engineReleaseId]=JSON.parse(scope);
    if(profileScope(versionId,engineReleaseId)!==scope)throw new AccountError();
    return {versionId,engineReleaseId};
  }
  return {versionId:scope};
}
export class SaveStore {
  onRemove?: (owner: string, profileId?: string) => void | Promise<void>;
  private blobs: BlobStore;
  private writes = 0;
  constructor(
    private db: PgDatabase,
    root: string,
    free?: () => number,
    backend?: BlobStore,
  ) {
    this.blobs = backend ?? new LocalBlobStore(root, free);
  }
  private async tx<T>(fn: () => T | Promise<T>): Promise<T> {
    return (await this.db.transaction(fn, { lock: 'wvn:account-write' }));
  }
  private async space(bytes = 0) {
    if (await this.blobs.free() < 62 * GiB + bytes)
      throw new AccountError(507, "SPACE_STOP");
  }
  private async profile(owner: string, id: string): Promise<SaveProfile> {
    const row = (await this.db
      .prepare("SELECT * FROM wg_save_profiles WHERE owner=$1 AND id=$2")
      .get(owner, id));
    if (!row) throw new AccountError(404, "NOT_FOUND");
    if (row.deleted) throw new AccountError(410, "PROFILE_DELETED");
    return {
      id: String(row.id),
      ...profileIdentity(String(row.version_id)),
      head: row.head ? String(row.head) : null,
      generation: Number(row.generation),
    };
  }
  async profiles(owner: string, versionId?: string, engineReleaseId?: string): Promise<SaveProfile[]> {
    return (await Promise.all((await this.db
      .prepare(
        "SELECT * FROM wg_save_profiles WHERE owner=$1 AND deleted=0 AND ($2::text IS NULL OR version_id=$3) ORDER BY created DESC",
      )
      .all(owner, versionId ? profileScope(versionId,engineReleaseId) : null, versionId ? profileScope(versionId,engineReleaseId) : null))
      .map(async (r) => (await this.profile(owner, String(r.id))))));
  }
  async createProfile(owner: string, versionId: string, engineReleaseId?: string): Promise<SaveProfile> {
    const scope=profileScope(versionId,engineReleaseId);
    if (typeof versionId !== "string" || versionId.length > 200 || !versionId)
      throw new AccountError();
    return (await this.tx(async () => {
      const existing = (await this.profiles(owner, versionId,engineReleaseId))[0];
      if (existing) return existing;
      if (
        Number(
          (await this.db
            .prepare(
              "SELECT count(*) AS n FROM wg_save_profiles WHERE owner=$1 AND deleted=0",
            )
            .get(owner))?.n,
        ) >= 200
      )
        throw new AccountError(413, "PROFILE_LIMIT");
      const id = randomUUID();
      (await this.db
        .prepare(
          "INSERT INTO wg_save_profiles(id,owner,version_id,generation,created) VALUES ($1,$2,$3,1,$4)",
        )
        .run(id, owner, scope, Date.now()));
      return (await this.profile(owner, id));
    }));
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
    const profile = (await this.profile(owner, profileId));
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
      !(await this.db
        .prepare(
          "SELECT id FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND id=$3",
        )
        .get(owner, profileId, input.expectedHead))
    )
      throw new AccountError(400, "BASE_INVALID");
    const manifest = SHA(
      JSON.stringify({
        files,
        head: input.expectedHead,
        generation: input.generation,
      }),
    );
    let previous = (await this.db
      .prepare(
        "SELECT * FROM wg_save_uploads WHERE owner=$1 AND profile=$2 AND capture=$3",
      )
      .get(owner, profileId, input.captureId));
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
    (await this.profile(owner, profileId));
    let added = 0;
    for (const file of new Map(files.map(file => [file.sha256, file])).values()) {
      const known = await this.db.prepare('SELECT 1 FROM wg_save_refs WHERE owner=$1 AND hash=$2 LIMIT 1').get(owner, file.sha256);
      if (!known) added += file.bytes;
    }
    return (await this.tx(async () => {
      const freshProfile = (await this.profile(owner, profileId));
      if (freshProfile.generation !== input.generation) throw new AccountError(410, 'GENERATION_CHANGED');
      previous = (await this.db.prepare("SELECT * FROM wg_save_uploads WHERE owner=$1 AND profile=$2 AND capture=$3").get(owner, profileId, input.captureId));
      if (previous) {
        if (previous.manifest !== manifest) throw new AccountError(409, 'CAPTURE_CHANGED');
        if (previous.result || Number(previous.expires) >= Date.now()) return { id: String(previous.id), files: JSON.parse(String(previous.files)) as UploadFile[], complete: !!previous.result };
      }

      const used = Number(
        (await this.db
          .prepare(
            "SELECT COALESCE(sum(bytes),0) AS n FROM wg_save_blobs b WHERE b.owner=$1 AND EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash)",
          )
          .get(owner))?.n,
      );
      const reserved = Number(
        (await this.db
          .prepare(
            "SELECT COALESCE(sum(total),0) AS n FROM wg_save_uploads WHERE owner=$1 AND result IS NULL AND expires>$2",
          )
          .get(owner, Date.now()))?.n,
      );
      if (used + reserved + added > 512 * 1024 ** 2)
        throw new AccountError(413, "ACCOUNT_QUOTA");
      const id = previous ? String(previous.id) : randomUUID(),
        uploadFiles = files.map((f) => ({ ...f, id: randomUUID() }));
      if (previous) {
        (await this.db
          .prepare(
            "UPDATE wg_save_uploads SET files=$1,total=$2,expires=$3 WHERE id=$4 AND owner=$5 AND result IS NULL",
          )
          .run(
            JSON.stringify(uploadFiles),
            added,
            Date.now() + 3600_000,
            id,
            owner,
          ));
        return { id, files: uploadFiles, complete: false };
      }
      (await this.db
        .prepare(
          "INSERT INTO wg_save_uploads(id,owner,profile,expected_head,generation,capture,manifest,files,total,expires) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
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
        ));
      return { id, files: uploadFiles, complete: false };
    }));
  }
  private async upload(owner: string, id: string): Promise<Row> {
    const row = (await this.db
      .prepare("SELECT * FROM wg_save_uploads WHERE owner=$1 AND id=$2")
      .get(owner, id));
    if (!row) throw new AccountError(404, "NOT_FOUND");
    const profile = (await this.profile(owner, String(row.profile)));
    if (profile.generation !== row.generation)
      throw new AccountError(410, "GENERATION_CHANGED");
    if (!row.result && Number(row.expires) < Date.now())
      throw new AccountError(410, "UPLOAD_EXPIRED");
    return row;
  }
  async gc() {
    // Known request parts only; never scan unrelated files or erase capture manifests.
    const parts = (await this.db
      .prepare("SELECT * FROM wg_save_parts WHERE created<$1 LIMIT 100")
      .all(Date.now() - 3600_000));
    for (const part of parts) {
      try {
        await this.blobs.remove(SHA(String(part.owner)), String(part.id) + ".upload");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") continue;
      }
      (await this.db.prepare("DELETE FROM wg_save_parts WHERE id=$1").run(part.id));
    }
    const cutoff = Date.now() - 7 * 86400_000;
    const rows = (await this.db
      .prepare(
        "SELECT b.* FROM wg_save_blobs b WHERE b.created<$1 AND NOT EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash) AND NOT EXISTS(SELECT 1 FROM wg_save_uploads u,jsonb_array_elements(u.files::jsonb) f(value) WHERE u.owner=b.owner AND u.expires>$2 AND u.result IS NULL AND f.value->>'sha256'=b.hash) LIMIT 100",
      )
      .all(cutoff, Date.now()));
    for (const row of rows) {
      try {
        await this.blobs.remove(SHA(String(row.owner)), String(row.hash) + ".bin");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") continue;
      }
      (await this.db
        .prepare("DELETE FROM wg_save_blobs WHERE owner=$1 AND hash=$2")
        .run(row.owner, row.hash));
    }
  }
  async snapshotMetadata(owner: string, profileId: string, revisionId: string) {
    const profile = (await this.profile(owner, profileId));
    const row = (await this.db
      .prepare(
        "SELECT * FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND id=$3",
      )
      .get(owner, profileId, revisionId));
    if (!row) throw new AccountError(404, "NOT_FOUND");
    const revision = (await this.revision(row));
    return { profile, revision };
  }
  async snapshot(owner: string, profileId: string, revisionId: string) {
    const value = (await this.snapshotMetadata(owner, profileId, revisionId));
    for (const file of value.revision.files) await this.readBlob(owner, file);
    return (await this.snapshotMetadata(owner, profileId, revisionId));
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
  async pin(owner: string, key: string, files: SaveFile[]) {
    for (const file of files)
      (await this.db
        .prepare("INSERT INTO wg_save_refs VALUES ($1,$2,$3) ON CONFLICT DO NOTHING")
        .run(owner, key, file.sha256));
  }
  async unpin(owner: string, key: string) {
    (await this.db
      .prepare(
        "UPDATE wg_save_blobs SET created=$1 WHERE owner=$2 AND hash IN(SELECT hash FROM wg_save_refs WHERE owner=$3 AND revision=$4)",
      )
      .run(Date.now(), owner, owner, key));
    (await this.db
      .prepare("DELETE FROM wg_save_refs WHERE owner=$1 AND revision=$2")
      .run(owner, key));
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
      const current = (await this.upload(owner, uploadId));
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
      const current = (await this.upload(owner, uploadId));
      if (current.result) throw new AccountError(409, "UPLOAD_COMMITTED");
      if (!(JSON.parse(String(current.files)) as UploadFile[]).some(f => f.id === fileId)) throw new AccountError(409, "UPLOAD_RENEWED");
      await this.blobs.write(SHA(owner), file.sha256, Buffer.concat(chunks));
      // The caller holds the account lock through durable storage acknowledgement.
      (await this.upload(owner, uploadId));
      (await this.db.prepare("INSERT INTO wg_save_blobs(owner,hash,bytes,created) VALUES ($1,$2,$3,$4) ON CONFLICT(owner,hash) DO UPDATE SET bytes=excluded.bytes")
        .run(owner, file.sha256, bytes, Date.now()));
    });
      } finally { this.writes--; }
  }
  private async revision(row: Row): Promise<SaveRevision> {
    return {
      id: String(row.id),
      parent: row.parent ? String(row.parent) : null,
      source: row.source ? String(row.source) : null,
      files: JSON.parse(String(row.files)),
      conflict: !!row.conflict,
      ...((await this.db
        .prepare("SELECT 1 FROM wg_save_origins WHERE revision=$1")
        .get(row.id))
        ? { originKind: "share" as const }
        : {}),
      createdAt: Number(row.created),
    };
  }
  private async insertRevision(
    owner: string,
    profileId: string,
    parent: string | null,
    files: SaveFile[],
    conflict: boolean,
    source: string | null = null,
  ): Promise<SaveRevision> {
    const id = randomUUID(),
      created = Date.now();
    (await this.db
      .prepare("INSERT INTO wg_save_revisions VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
      .run(
        id,
        owner,
        profileId,
        parent,
        source,
        JSON.stringify(files),
        conflict ? 1 : 0,
        created,
      ));
    for (const file of files)
      (await this.db
        .prepare("INSERT INTO wg_save_refs VALUES ($1,$2,$3) ON CONFLICT DO NOTHING")
        .run(owner, id, file.sha256));
    return { id, parent, source, files, conflict, createdAt: created };
  }
  async commitReceived(
    owner: string,
    uploadId: string,
    shareId: string,
    onCommit?: (result: { conflict: boolean; revision: SaveRevision }) => void | Promise<void>,
  ) {
    return (await this.commit(owner, uploadId, shareId, onCommit));
  }
  async commit(
    owner: string,
    uploadId: string,
    receivedShare?: string,
    onCommit?: (result: { conflict: boolean; revision: SaveRevision }) => void | Promise<void>,
  ): Promise<{ conflict: boolean; revision: SaveRevision }> {
    const upload = (await this.upload(owner, uploadId));
    if (upload.result) return JSON.parse(String(upload.result));
    const files = (JSON.parse(String(upload.files)) as UploadFile[]).map(
      ({ id, ...f }) => f,
    );
    for (const file of files) {
      const blob = (await this.db
        .prepare("SELECT bytes FROM wg_save_blobs WHERE owner=$1 AND hash=$2")
        .get(owner, file.sha256));
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
    return (await this.tx(async () => {
      const current = (await this.upload(owner, uploadId));
      if (current.result) return JSON.parse(String(current.result));
      if (current.files !== upload.files) throw new AccountError(409, 'UPLOAD_RENEWED');

      const profile = (await this.profile(owner, String(upload.profile)));
      if (profile.generation !== upload.generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      const conflict = !receivedShare && profile.head !== upload.expected_head;
      const revision = (await this.insertRevision(
        owner,
        profile.id,
        upload.expected_head ? String(upload.expected_head) : null,
        files,
        conflict,
      ));
      if (receivedShare) {
        (await this.db
          .prepare("INSERT INTO wg_save_origins VALUES ($1,'share',$2)")
          .run(revision.id, receivedShare));
        revision.originKind = "share";
      }
      if (!conflict && !receivedShare)
        (await this.db
          .prepare("UPDATE wg_save_profiles SET head=$1 WHERE owner=$2 AND id=$3")
          .run(revision.id, owner, profile.id));
      const result = { conflict, revision };
      (await this.db
        .prepare("UPDATE wg_save_uploads SET result=$1 WHERE owner=$2 AND id=$3")
        .run(JSON.stringify(result), owner, uploadId));
      await onCommit?.(result);
      return result;
    }));
  }
  async historyPage(owner: string, profileId: string, cursor?: string): Promise<SaveHistory> {
    const profile = (await this.profile(owner, profileId));
    const base = cursor
      ? (await this.db
          .prepare(
            "SELECT revision_order AS pos,created FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND id=$3",
          )
          .get(owner, profileId, cursor))
      : null;
    if (cursor && !base) throw new AccountError(400, "CURSOR_INVALID");
    const rows = base
      ? (await this.db
          .prepare(
            "SELECT * FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND (created<$3 OR (created=$4 AND revision_order<$5)) ORDER BY created DESC,revision_order DESC LIMIT 201",
          )
          .all(owner, profileId, base.created, base.created, base.pos))
      : (await this.db
          .prepare(
            "SELECT * FROM wg_save_revisions WHERE owner=$1 AND profile=$2 ORDER BY created DESC,revision_order DESC LIMIT 201",
          )
          .all(owner, profileId));
    const items = (await Promise.all(rows.slice(0, 200).map(async (row) => (await this.revision(row)))));
    const head = profile.head
      ? (await this.db
          .prepare(
            "SELECT * FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND id=$3",
          )
          .get(owner, profileId, profile.head))
      : null;
    return {
      items,
      current: head ? (await this.revision(head)) : null,
      next: rows.length > 200 ? items.at(-1)!.id : null,
    };
  }
  async history(owner: string, profileId: string): Promise<SaveRevision[]> {
    return (await this.historyPage(owner, profileId)).items;
  }
  async allHistory(owner: string, profileId: string): Promise<SaveRevision[]> {
    const all: SaveRevision[] = [];
    let cursor: string | undefined;
    do {
      const page = (await this.historyPage(owner, profileId, cursor));
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
    (await this.profile(owner, profileId));
    const row = (await this.db
      .prepare(
        "SELECT * FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND id=$3",
      )
      .get(owner, profileId, revisionId));
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
    const sourceValue = (await this.snapshotMetadata(owner, profileId, sourceId));
    for (const file of sourceValue.revision.files) await this.readBlob(owner, file);
    return (await this.tx(async () => {
      const profile = (await this.profile(owner, profileId));
      if (profile.generation !== generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      if (profile.head !== head)
        throw new AccountError(409, "CONTENT_CONFLICT");
      const source = (await this.db
        .prepare(
          "SELECT * FROM wg_save_revisions WHERE owner=$1 AND profile=$2 AND id=$3",
        )
        .get(owner, profileId, sourceId));
      if (!source) throw new AccountError(404, "NOT_FOUND");
      const files = JSON.parse(String(source.files)) as SaveFile[];
      const revision = (await this.insertRevision(
        owner,
        profileId,
        head,
        files,
        false,
        sourceId,
      ));
      (await this.db
        .prepare(
          "INSERT INTO wg_save_origins(revision,kind,share_id) SELECT $1,kind,share_id FROM wg_save_origins WHERE revision=$2",
        )
        .run(revision.id, sourceId));
      (await this.db
        .prepare("UPDATE wg_save_profiles SET head=$1 WHERE owner=$2 AND id=$3")
        .run(revision.id, owner, profileId));
      if (
        (await this.db
          .prepare("SELECT 1 FROM wg_save_origins WHERE revision=$1")
          .get(revision.id))
      )
        revision.originKind = "share";
      return revision;
    }));
  }
  async remove(
    owner: string,
    profileId: string,
    head: string | null,
    generation: number,
  ): Promise<void> {
    (await this.tx(async () => {
      const profile = (await this.profile(owner, profileId));
      if (profile.generation !== generation)
        throw new AccountError(410, "GENERATION_CHANGED");
      if (profile.head !== head)
        throw new AccountError(409, "CONTENT_CONFLICT");
      await this.onRemove?.(owner, profileId);
      (await this.db
        .prepare(
          "UPDATE wg_save_profiles SET deleted=1,generation=generation+1 WHERE owner=$1 AND id=$2",
        )
        .run(owner, profileId));
      (await this.db
        .prepare(
          "UPDATE wg_save_blobs SET created=$1 WHERE owner=$2 AND hash IN(SELECT hash FROM wg_save_refs WHERE owner=$3 AND revision IN(SELECT id FROM wg_save_revisions WHERE owner=$4 AND profile=$5))",
        )
        .run(Date.now(), owner, owner, owner, profileId));
      (await this.db
        .prepare(
          "DELETE FROM wg_save_refs WHERE owner=$1 AND revision IN(SELECT id FROM wg_save_revisions WHERE owner=$2 AND profile=$3)",
        )
        .run(owner, owner, profileId));
      (await this.db
        .prepare(
          "UPDATE wg_save_uploads SET expires=0 WHERE owner=$1 AND profile=$2 AND result IS NULL",
        )
        .run(owner, profileId));
    }));
  }
  async deleteOwner(owner: string, deletedAt = Date.now()) {
    await this.onRemove?.(owner);
    (await this.db
      .prepare(
        "DELETE FROM wg_save_origins WHERE revision IN (SELECT id FROM wg_save_revisions WHERE owner=$1)",
      )
      .run(owner));
    (await this.db
      .prepare("UPDATE wg_save_blobs SET created=$1 WHERE owner=$2")
      .run(deletedAt, owner));
    for (const table of [
      "wg_save_refs",
      "wg_save_uploads",
      "wg_save_revisions",
      "wg_save_profiles",
    ])
      (await this.db.prepare(`DELETE FROM ${table} WHERE owner=$1`).run(owner));
  }
}
