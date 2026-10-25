import type { Snapshot } from "./protocol.mjs";
export type SavedRevision = { id: string; pilot: string; revision: number; digest: string; snapshot: Snapshot; reason: string; bytes: number; bytesHeld: number; createdAt: string };
export type SaveStore = {
  close(): void;
  get(pilot: string): Promise<SavedRevision | null>;
  getRevision(id: string, pilot: string): Promise<SavedRevision>;
  history(pilot: string): Promise<Omit<SavedRevision, "snapshot" | "bytesHeld">[]>;
  commit(pilot: string, base: number, input: Snapshot, reason?: string, check?:()=>void): Promise<SavedRevision>;
};
export function openSaveStore(database?: string): Promise<SaveStore>;
export function readLegacy(pilot: string): Promise<Snapshot | null>;
export function exportBackup(input: Snapshot, releaseId?: string): Promise<string>;
export function importBackup(text: string, pilot: string, candidate?: {releaseId: string; allowLegacyCopy?: boolean}): Promise<Snapshot>;
