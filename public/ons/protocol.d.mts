export type Snapshot = { schema: number; pilot: string; files: { path: string; data: Uint8Array; mtime?: number }[] };
export const limits: Readonly<{ files: number; fileBytes: number; totalBytes: number }>;
export function validPath(path: unknown): path is string;
export function validateSnapshot(value: unknown, pilot: string): Snapshot;
export function snapshotDigest(snapshot: Snapshot): Promise<string>;
