import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
export type RecoveredCredential = {
  id: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class RecoveryStore {
  constructor(
    private db: DatabaseSync,
    private now = Date.now,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS wg_recovery_codes(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,code_group TEXT NOT NULL,used_at INTEGER);
  CREATE TABLE IF NOT EXISTS wg_recovery_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,auth_version INTEGER NOT NULL,code_group TEXT NOT NULL,expires_at INTEGER NOT NULL,challenge TEXT,challenge_expires INTEGER);
  CREATE INDEX IF NOT EXISTS wg_codes_user ON wg_recovery_codes(user_id);
  CREATE INDEX IF NOT EXISTS wg_recovery_expiry ON wg_recovery_sessions(expires_at);`);
  }
  private transaction<T>(fn: () => T): T {
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
  private generate(userId: string): string[] {
    const group = randomUUID(),
      codes = Array.from({ length: 10 }, () =>
        randomBytes(20).toString("base64url"),
      );
    this.db
      .prepare("DELETE FROM wg_recovery_codes WHERE user_id=?")
      .run(userId);
    const change = this.db
      .prepare(
        "UPDATE wg_account SET auth_version=auth_version+1,code_group=? WHERE user_id=?",
      )
      .run(group, userId);
    if (!change.changes) throw new Error("Account not found");
    for (const code of codes)
      this.db
        .prepare("INSERT INTO wg_recovery_codes VALUES (?,?,?,NULL)")
        .run(digest(userId + ":" + code), userId, group);
    return codes;
  }
  rotate(userId: string): string[] {
    return this.transaction(() => {
      const codes = this.generate(userId);
      this.db
        .prepare("DELETE FROM wg_recovery_sessions WHERE user_id=?")
        .run(userId);
      return codes;
    });
  }
  start(userId: string, code: string): string | null {
    return this.transaction(() => {
      this.db
        .prepare("DELETE FROM wg_recovery_sessions WHERE expires_at<?")
        .run(this.now());
      const state = this.db
        .prepare(
          "SELECT auth_version,code_group FROM wg_account WHERE user_id=?",
        )
        .get(userId);
      if (!state) return null;
      const used = this.db
        .prepare(
          "UPDATE wg_recovery_codes SET used_at=? WHERE hash=? AND user_id=? AND code_group=? AND used_at IS NULL",
        )
        .run(
          this.now(),
          digest(userId + ":" + code),
          userId,
          String(state.code_group),
        );
      if (!used.changes) return null;
      const token = randomBytes(32).toString("base64url");
      this.db
        .prepare(
          "INSERT INTO wg_recovery_sessions(hash,user_id,auth_version,code_group,expires_at) VALUES (?,?,?,?,?)",
        )
        .run(
          digest(token),
          userId,
          Number(state.auth_version),
          String(state.code_group),
          this.now() + 600_000,
        );
      return token;
    });
  }
  inspect(
    token: string,
  ): { userId: string; version: number; challenge: string | null } | null {
    const row = this.db
      .prepare(
        "SELECT s.* FROM wg_recovery_sessions s JOIN wg_account a ON a.user_id=s.user_id AND a.auth_version=s.auth_version AND a.code_group=s.code_group WHERE s.hash=? AND s.expires_at>?",
      )
      .get(digest(token), this.now());
    return row
      ? {
          userId: String(row.user_id),
          version: Number(row.auth_version),
          challenge:
            row.challenge && Number(row.challenge_expires) > this.now()
              ? String(row.challenge)
              : null,
        }
      : null;
  }
  setChallenge(token: string, challenge: string) {
    if (!this.inspect(token)) throw new Error("Recovery expired");
    this.db
      .prepare(
        "UPDATE wg_recovery_sessions SET challenge=?,challenge_expires=? WHERE hash=?",
      )
      .run(challenge, this.now() + 300_000, digest(token));
  }
  takeChallenge(token: string) {
    const state = this.inspect(token);
    if (!state?.challenge) throw new Error("Recovery challenge expired");
    this.db
      .prepare("UPDATE wg_recovery_sessions SET challenge=NULL WHERE hash=?")
      .run(digest(token));
    return state;
  }
  complete(token: string, credential: RecoveredCredential): string[] {
    return this.transaction(() => {
      const state = this.inspect(token);
      if (!state) throw new Error("Recovery expired");
      this.db.prepare("DELETE FROM passkey WHERE userId=?").run(state.userId);
      this.db
        .prepare(
          "INSERT INTO passkey (id,userId,name,publicKey,credentialID,counter,deviceType,backedUp,transports,createdAt,aaguid) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          state.userId,
          "恢复后的通行密钥",
          credential.publicKey,
          credential.id,
          credential.counter,
          credential.deviceType,
          credential.backedUp ? 1 : 0,
          credential.transports.join(","),
          this.now(),
          "",
        );
      this.db.prepare("DELETE FROM session WHERE userId=?").run(state.userId);
      const codes = this.generate(state.userId);
      this.db
        .prepare("DELETE FROM wg_recovery_sessions WHERE user_id=?")
        .run(state.userId);
      return codes;
    });
  }
}
