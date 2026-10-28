import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PgDatabase } from "../database/postgres.ts";
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
    private db: PgDatabase,
    private now = Date.now,
  ) {
  }
  private async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return (await this.db.transaction(fn, { lock: 'wvn:account-write' }));
  }
  private async generate(userId: string): Promise<string[]> {
    const group = randomUUID(),
      codes = Array.from({ length: 10 }, () =>
        randomBytes(20).toString("base64url"),
      );
    (await this.db
      .prepare("DELETE FROM wg_recovery_codes WHERE user_id=$1")
      .run(userId));
    const change = (await this.db
      .prepare(
        "UPDATE wg_account SET auth_version=auth_version+1,code_group=$1 WHERE user_id=$2",
      )
      .run(group, userId));
    if (!change.changes) throw new Error("Account not found");
    for (const code of codes)
      (await this.db
        .prepare("INSERT INTO wg_recovery_codes VALUES ($1,$2,$3,NULL)")
        .run(digest(userId + ":" + code), userId, group));
    return codes;
  }
  async rotate(userId: string): Promise<string[]> {
    return (await this.transaction(async () => {
      const codes = (await this.generate(userId));
      (await this.db
        .prepare("DELETE FROM wg_recovery_sessions WHERE user_id=$1")
        .run(userId));
      return codes;
    }));
  }
  async start(userId: string, code: string): Promise<string | null> {
    return (await this.transaction(async () => {
      (await this.db
        .prepare("DELETE FROM wg_recovery_sessions WHERE expires_at<$1")
        .run(this.now()));
      const state = (await this.db
        .prepare(
          "SELECT auth_version,code_group FROM wg_account WHERE user_id=$1",
        )
        .get(userId));
      if (!state) return null;
      const used = (await this.db
        .prepare(
          "UPDATE wg_recovery_codes SET used_at=$1 WHERE hash=$2 AND user_id=$3 AND code_group=$4 AND used_at IS NULL",
        )
        .run(
          this.now(),
          digest(userId + ":" + code),
          userId,
          String(state.code_group),
        ));
      if (!used.changes) return null;
      const token = randomBytes(32).toString("base64url");
      (await this.db
        .prepare(
          "INSERT INTO wg_recovery_sessions(hash,user_id,auth_version,code_group,expires_at) VALUES ($1,$2,$3,$4,$5)",
        )
        .run(
          digest(token),
          userId,
          Number(state.auth_version),
          String(state.code_group),
          this.now() + 600_000,
        ));
      return token;
    }));
  }
  async inspect(
    token: string,
  ): Promise<{ userId: string; version: number; challenge: string | null } | null> {
    const row = (await this.db
      .prepare(
        "SELECT s.* FROM wg_recovery_sessions s JOIN wg_account a ON a.user_id=s.user_id AND a.auth_version=s.auth_version AND a.code_group=s.code_group WHERE s.hash=$1 AND s.expires_at>$2",
      )
      .get(digest(token), this.now()));
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
  async setChallenge(token: string, challenge: string) {
    return (await this.db.transaction(async () => (await this.setChallengeLocked(token, challenge)), { lock: 'wvn:account-write' }));
  }
  async takeChallenge(token: string) {
    return (await this.db.transaction(async () => (await this.takeChallengeLocked(token)), { lock: 'wvn:account-write' }));
  }
  private async setChallengeLocked(token: string, challenge: string) {
    if (!(await this.inspect(token))) throw new Error("Recovery expired");
    (await this.db
      .prepare(
        "UPDATE wg_recovery_sessions SET challenge=$1,challenge_expires=$2 WHERE hash=$3",
      )
      .run(challenge, this.now() + 300_000, digest(token)));
  }
  private async takeChallengeLocked(token: string) {
    const state = (await this.inspect(token));
    if (!state?.challenge) throw new Error("Recovery challenge expired");
    (await this.db
      .prepare("UPDATE wg_recovery_sessions SET challenge=NULL WHERE hash=$1")
      .run(digest(token)));
    return state;
  }
  async complete(token: string, credential: RecoveredCredential): Promise<string[]> {
    return (await this.transaction(async () => {
      const state = (await this.inspect(token));
      if (!state) throw new Error("Recovery expired");
      (await this.db.prepare("DELETE FROM passkey WHERE \"userId\"=$1").run(state.userId));
      (await this.db
        .prepare(
          "INSERT INTO passkey (id,\"userId\",name,\"publicKey\",\"credentialID\",counter,\"deviceType\",\"backedUp\",transports,\"createdAt\",aaguid) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        )
        .run(
          randomUUID(),
          state.userId,
          "恢复后的通行密钥",
          credential.publicKey,
          credential.id,
          credential.counter,
          credential.deviceType,
          credential.backedUp,
          credential.transports.join(","),
          new Date(this.now()),
          "",
        ));
      (await this.db.prepare("DELETE FROM session WHERE \"userId\"=$1").run(state.userId));
      const codes = (await this.generate(state.userId));
      (await this.db
        .prepare("DELETE FROM wg_recovery_sessions WHERE user_id=$1")
        .run(state.userId));
      return codes;
    }));
  }
}
