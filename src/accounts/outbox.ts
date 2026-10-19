import type { SaveFile } from "./saves.server";
export type SaveDraft = {
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
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wg-account-save-outbox", 1);
    request.onupgradeneeded = () => {
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
    const tx = db.transaction("drafts", mode);
    const request = operation(tx.objectStore("drafts"));
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
export function draftsFor(owner: string) {
  return transaction("readonly", (s) =>
    s.index("owner").getAll(owner),
  ) as Promise<SaveDraft[]>;
}
export async function saveDraft(draft: SaveDraft) {
  await transaction("readwrite", (s) => s.put(draft));
}
export async function removeDraft(key: string) {
  await transaction("readwrite", (s) => s.delete(key));
}
