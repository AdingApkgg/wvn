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
import type { PgDatabase } from "../database/postgres.ts";
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
  async replay(db: PgDatabase, saves: SaveStore | null) {
    for (const [id, time] of this.entries) {
      await db.transaction(async () => {
        (await deleteAccountRows(db, saves, id, time));

      }, { lock: 'wvn:account-write' });
    }
  }
}
export async function deleteAccountRows(
  db: PgDatabase,
  saves: SaveStore | null,
  userId: string,
  deletedAt: number,
) {
  await saves?.deleteOwner(userId, deletedAt);
  if (await db.prepare("SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='rooms'").get()) {
    await db.prepare(`SELECT id FROM rooms r WHERE owner_user_id=$1 OR EXISTS
      (SELECT 1 FROM room_members m WHERE m.room_id=r.id AND m.user_id=$1) ORDER BY id FOR UPDATE`).all(userId);
    await db.prepare("UPDATE rooms SET status='closed',state='{}'::jsonb,owner_user_id='deleted' WHERE owner_user_id=$1").run(userId);
    await db.prepare('DELETE FROM room_members WHERE user_id=$1').run(userId);
    // 保留事件序号供其他成员补页，同时移除被删除账号的名称、信令和标识。
    await db.prepare(`UPDATE room_events SET actor_user_id='deleted',message_id=NULL,target_user_id=NULL,kind='account.deleted',data='{}'::jsonb
      WHERE actor_user_id=$1 OR target_user_id=$1 OR data->>'userId'=$1`).run(userId);
  }
  // 离线旧备份恢复可能没有开启 foreign_keys；账本重放也必须移除个人关系。
  if((await db.prepare("SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='wg_work_reactions'").get()))
    (await db.prepare("DELETE FROM wg_work_reactions WHERE user_id=$1").run(userId));
  for (const table of [
    "wg_library",
    "wg_plays",
    "wg_play_clock",
    "wg_recovery_codes",
    "wg_recovery_sessions",
    "wg_account",
  ])
    (await db.prepare(`DELETE FROM ${table} WHERE user_id=$1`).run(userId));
  (await db.prepare("DELETE FROM passkey WHERE \"userId\"=$1").run(userId));
  (await db.prepare("DELETE FROM session WHERE \"userId\"=$1").run(userId));
  (await db.prepare("DELETE FROM account WHERE \"userId\"=$1").run(userId));
  (await db.prepare("DELETE FROM \"user\" WHERE id=$1").run(userId));
  (await db.prepare("INSERT INTO wg_deleted_accounts VALUES ($1,$2) ON CONFLICT(user_id) DO UPDATE SET deleted_at=excluded.deleted_at").run(
    userId,
    deletedAt,
  ));
}
