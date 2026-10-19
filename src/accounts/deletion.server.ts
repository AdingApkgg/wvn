import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { SaveStore } from "./saves.server.ts";
export class DeletionLedger {
  readonly entries = new Map<string, number>();
  constructor(
    private file?: string,
    readOnly = false,
  ) {
    if (!file) return;
    if (readOnly && !existsSync(file))
      throw new Error("Existing independent ledger required");
    if (!readOnly) mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (!readOnly && !existsSync(file)) {
      const fd = openSync(file, "wx", 0o600);
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return;
    }
    const raw = readFileSync(file, "utf8");
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      try {
        const value = JSON.parse(lines[i]);
        if (
          typeof value.userId !== "string" ||
          !Number.isSafeInteger(value.deletedAt)
        )
          throw new Error("Invalid deletion record");
        this.entries.set(value.userId, value.deletedAt);
      } catch (e) {
        if (i !== lines.length - 1 || raw.endsWith("\n")) throw e;
        throw new Error(
          "Incomplete deletion ledger; preserve it and repair before restarting",
        );
      }
    }
  }
  record(userId: string) {
    const previous = this.entries.get(userId);
    if (previous !== undefined) return previous;
    const deletedAt = Date.now();
    if (this.file) {
      const fd = openSync(this.file, "a", 0o600);
      try {
        const bytes = Buffer.from(JSON.stringify({ userId, deletedAt }) + "\n");
        let offset = 0;
        while (offset < bytes.length) {
          const count = writeSync(fd, bytes, offset, bytes.length - offset);
          if (count < 1) throw new Error("Incomplete deletion ledger write");
          offset += count;
        }
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    this.entries.set(userId, deletedAt);
    return deletedAt;
  }
  replay(db: DatabaseSync, saves: SaveStore | null) {
    for (const [id, time] of this.entries) {
      db.exec("BEGIN IMMEDIATE");
      try {
        deleteAccountRows(db, saves, id, time);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  }
}
export function deleteAccountRows(
  db: DatabaseSync,
  saves: SaveStore | null,
  userId: string,
  deletedAt: number,
) {
  saves?.deleteOwner(userId, deletedAt);
  for (const table of [
    "wg_library",
    "wg_plays",
    "wg_play_clock",
    "wg_recovery_codes",
    "wg_recovery_sessions",
    "wg_account",
  ])
    db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
  db.prepare("DELETE FROM passkey WHERE userId=?").run(userId);
  db.prepare("DELETE FROM session WHERE userId=?").run(userId);
  db.prepare("DELETE FROM account WHERE userId=?").run(userId);
  db.prepare('DELETE FROM "user" WHERE id=?').run(userId);
  db.prepare("INSERT OR REPLACE INTO wg_deleted_accounts VALUES (?,?)").run(
    userId,
    deletedAt,
  );
}
