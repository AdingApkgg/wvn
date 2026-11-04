import type { SaveFile } from "./saves.server";
export type SaveDraft = {
  engineReleaseId?:string;
  key: string;
  owner: string;
  profile: string;
  version: string;
  generation: number;
  expectedHead: string | null;
  captureId: string;
  files: (SaveFile & { blob: Blob })[];
  status: "pending" | "conflict";
};
type StoredDraft = Omit<SaveDraft, "files"> & {
  storageVersion?: 2;
  files: (SaveFile & { blob?: Blob; data?: ArrayBuffer; mimeType?: string })[];
};
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wg-account-save-outbox", 2);
    request.onupgradeneeded = (event) => {
      // v2 沿用原 object store 和 owner 索引，不删除或重写 v1 待上传副本。
      if (event.oldVersion !== 0) return;
      const store = request.result.createObjectStore("drafts", {
        keyPath: "key",
      });
      store.createIndex("owner", "owner");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other account tabs and retry"));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    let tx: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      tx = db.transaction("drafts", mode);
      request = operation(tx.objectStore("drafts"));
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? request.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Local backup was aborted"));
    };
  });
}
export async function draftsFor(owner: string): Promise<SaveDraft[]> {
  const drafts = await transaction<StoredDraft[]>("readonly", (s) =>
    s.index("owner").getAll(owner),
  );
  return drafts.map(({ storageVersion, files, ...draft }) => ({
    ...draft,
    files: files.map(({ data, mimeType, blob, ...file }) => {
      if (data instanceof ArrayBuffer)
        return { ...file, blob: new Blob([data], { type: mimeType ?? "" }) };
      if (blob instanceof Blob) return { ...file, blob };
      throw new Error("Local backup bytes are unavailable; original record retained");
    }),
  }));
}
export async function saveDraft(draft: SaveDraft) {
  // WebKit 某些数据存储模式无法持久化 Blob；转换在事务外完成，避免事务自动结束。
  const files = await Promise.all(draft.files.map(async ({ blob, ...file }) => ({
    ...file,
    data: await blob.arrayBuffer(),
    mimeType: blob.type,
  })));
  const stored: StoredDraft = { ...draft, storageVersion: 2, files };
  await transaction("readwrite", (s) => s.put(stored));
}
export async function removeDraft(key: string) {
  await transaction("readwrite", (s) => s.delete(key));
}
