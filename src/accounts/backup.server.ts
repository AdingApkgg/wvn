import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  fsyncSync,
  closeSync,
  statfsSync,
  statSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { DeletionLedger } from "./deletion.server.ts";
type BackupFile = { ownerHash: string; hash: string; bytes: number };
function space(root: string, bytes: number) {
  const stat = statfsSync(root);
  if (stat.bavail * stat.bsize < 62 * 1024 ** 3 + bytes)
    throw new Error("Backup stopped at reserved disk-space threshold");
}
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function filePath(root: string, file: BackupFile) {
  if (
    !/^[a-f0-9]{64}$/.test(file.ownerHash) ||
    !/^[a-f0-9]{64}$/.test(file.hash) ||
    !Number.isSafeInteger(file.bytes) ||
    file.bytes < 0 ||
    file.bytes > 32 * 1024 ** 2
  )
    throw new Error("Invalid backup manifest");
  return join(root, file.ownerHash, file.hash + ".bin");
}
function copyVerified(source: string, target: string, file: BackupFile) {
  const bytes = readFileSync(source);
  if (bytes.length !== file.bytes || hash(bytes) !== file.hash)
    throw new Error("Backup file failed verification");
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  copyFileSync(source, target);
  const fd = openSync(target, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (hash(readFileSync(target)) !== file.hash)
    throw new Error("Backup copy failed verification");
}
export function createAccountBackup(options: {
  database: string;
  blobRoot: string;
  ledger: string;
  destination: string;
  shareLedger?: string;
}) {
  const destination = resolve(options.destination);
  if (existsSync(destination))
    throw new Error("Backup destination already exists");
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  space(
    dirname(destination),
    statSync(options.database).size +
      (existsSync(options.database + "-wal")
        ? statSync(options.database + "-wal").size
        : 0),
  );
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const source = new DatabaseSync(options.database);
  try {
    source.prepare("VACUUM INTO ?").run(join(destination, "accounts.sqlite"));
  } finally {
    source.close();
  }
  const snapshot = new DatabaseSync(join(destination, "accounts.sqlite"), {
    readOnly: true,
  });
  let files: BackupFile[];
  try {
    if (
      snapshot
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE name='wg_save_shares' AND type='table'",
        )
        .get() &&
      !options.shareLedger
    )
      throw new Error(
        "Share revocation ledger required for sharing-enabled backups",
      );
    files = snapshot
      .prepare(
        "SELECT b.owner,b.hash,b.bytes FROM wg_save_blobs b WHERE EXISTS(SELECT 1 FROM wg_save_refs r WHERE r.owner=b.owner AND r.hash=b.hash)",
      )
      .all()
      .map((row) => ({
        ownerHash: hash(String(row.owner)),
        hash: String(row.hash),
        bytes: Number(row.bytes),
      }));
  } finally {
    snapshot.close();
  }
  space(
    destination,
    files.reduce((n, f) => n + f.bytes, 0),
  );
  for (const file of files) {
    space(destination, file.bytes);
    copyVerified(
      filePath(options.blobRoot, file),
      filePath(join(destination, "blobs"), file),
      file,
    );
  }
  const ledger = new DeletionLedger(options.ledger, true);
  writeFileSync(
    join(destination, "deletions.jsonl"),
    [...ledger.entries]
      .map(
        ([userId, deletedAt]) => JSON.stringify({ userId, deletedAt }) + "\n",
      )
      .join(""),
    { mode: 0o600 },
  );
  if (options.shareLedger) {
    const share = new DeletionLedger(options.shareLedger, true);
    writeFileSync(
      join(destination, "share-revocations.jsonl"),
      [...share.entries]
        .map(
          ([userId, deletedAt]) => JSON.stringify({ userId, deletedAt }) + "\n",
        )
        .join(""),
      { mode: 0o600 },
    );
  }
  const manifest = {
    format: options.shareLedger
      ? "wg-account-backup-v2"
      : "wg-account-backup-v1",
    createdAt: new Date().toISOString(),
    databaseSha256: hash(readFileSync(join(destination, "accounts.sqlite"))),
    files,
  };
  writeFileSync(
    join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  return manifest;
}
export function prepareAccountRestore(options: {
  backup: string;
  currentLedger: string;
  currentShareLedger?: string;
  destination: string;
}) {
  const destination = resolve(options.destination);
  if (existsSync(destination))
    throw new Error("Restore destination already exists");
  if (!existsSync(options.currentLedger))
    throw new Error("Current independent deletion ledger is required");
  const manifest = JSON.parse(
    readFileSync(join(options.backup, "manifest.json"), "utf8"),
  );
  if (
    !["wg-account-backup-v1", "wg-account-backup-v2"].includes(
      manifest.format,
    ) ||
    !Array.isArray(manifest.files) ||
    hash(readFileSync(join(options.backup, "accounts.sqlite"))) !==
      manifest.databaseSha256
  )
    throw new Error("Invalid backup database");
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  space(
    dirname(destination),
    statSync(join(options.backup, "accounts.sqlite")).size +
      manifest.files.reduce((n: number, f: BackupFile) => n + f.bytes, 0),
  );
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  copyFileSync(
    join(options.backup, "accounts.sqlite"),
    join(destination, "accounts.sqlite"),
  );
  for (const file of manifest.files as BackupFile[]) {
    space(destination, file.bytes);
    copyVerified(
      filePath(join(options.backup, "blobs"), file),
      filePath(join(destination, "blobs"), file),
      file,
    );
  }
  const combined = new DeletionLedger(
    join(options.backup, "deletions.jsonl"),
    true,
  );
  for (const [id, time] of new DeletionLedger(options.currentLedger, true)
    .entries)
    combined.entries.set(id, time);
  writeFileSync(
    join(destination, "deletions.jsonl"),
    [...combined.entries]
      .map(
        ([userId, deletedAt]) => JSON.stringify({ userId, deletedAt }) + "\n",
      )
      .join(""),
    { mode: 0o600 },
  );
  if (
    manifest.format === "wg-account-backup-v2" &&
    (!options.currentShareLedger || !existsSync(options.currentShareLedger))
  )
    throw new Error("Current share revocation ledger required");
  if (options.currentShareLedger) {
    const current = new DeletionLedger(options.currentShareLedger, true);
    const oldPath = join(options.backup, "share-revocations.jsonl");
    const old = existsSync(oldPath) ? new DeletionLedger(oldPath, true) : null;
    for (const [id, time] of old?.entries ?? [])
      if (!current.entries.has(id)) current.entries.set(id, time);
    writeFileSync(
      join(destination, "share-revocations.jsonl"),
      [...current.entries]
        .map(
          ([userId, deletedAt]) => JSON.stringify({ userId, deletedAt }) + "\n",
        )
        .join(""),
      { mode: 0o600 },
    );
  }
  return {
    ...(options.currentShareLedger
      ? { shareLedger: join(destination, "share-revocations.jsonl") }
      : {}),
    database: join(destination, "accounts.sqlite"),
    blobRoot: join(destination, "blobs"),
    deletionLedger: join(destination, "deletions.jsonl"),
    status: "prepared",
  };
}
