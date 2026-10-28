import { randomUUID, createHash } from "node:crypto";
import { AccountError } from "./errors.server.ts";
import type { ShareStore } from "./shares.server.ts";
import type { SaveProfile, SaveRevision, SaveFile } from "./saves.server.ts";
type Input = { shareId: string; secret?: string; requestId: string };
type Result = { profile: SaveProfile; revision: SaveRevision };
type Locked = <T>(fn: () => T | Promise<T>) => Promise<T>;
export class ShareClaims {
  private flights = new Map<string, Promise<Result>>();
  private preparation = Promise.resolve();
  private async prepare<T>(fn: () => Promise<T>): Promise<T> {
    const before = this.preparation;
    let release!: () => void;
    this.preparation = new Promise<void>(resolve => { release = resolve; });
    await before;
    try { return await fn(); } finally { release(); }
  }
  constructor(readonly shares: ShareStore) {
    const previous = shares.saves.onRemove;
    shares.saves.onRemove = async (owner, profile) => {
      await previous?.(owner, profile);
      if (!profile) (await this.deleteOwner(owner));
    };
  }
  private async completed(owner: string, result: string): Promise<Result> {
    const value = JSON.parse(result) as Result;
    await this.shares.saves.snapshot(owner, value.profile.id, value.revision.id);
    return value;
  }
  async status(owner: string, requestId: string) {
    const row = (await this.shares.db
      .prepare(
        "SELECT c.status,c.result FROM wg_save_share_claims c JOIN wg_share_claim_keys k ON k.claim_id=c.id WHERE k.owner=$1 AND k.request=$2 AND c.owner=$3",
      )
      .get(owner, requestId, owner));
    if (!row) throw new AccountError(404, "NOT_FOUND");
    return row.status === "complete"
      ? { status: "complete", ...await this.completed(owner, String(row.result)) }
      : { status: String(row.status) };
  }
  async claim(
    owner: string,
    check: () => void | Promise<void>,
    input: Input,
    locked: Locked = async (fn) => fn(),
  ): Promise<Result> {
    if (
      typeof input.requestId !== "string" ||
      !input.requestId ||
      input.requestId.length > 100 ||
      typeof input.shareId !== "string"
    )
      throw new AccountError();
    const { db, saves } = this.shares;
    const payload = createHash("sha256")
      .update(
        JSON.stringify({ share: input.shareId, secret: input.secret ?? null }),
      )
      .digest("hex");
    const prepared = await this.prepare(() => locked(() => db.transaction(async () => {
      await check();
      {
        const key = (await db
          .prepare(
            "SELECT * FROM wg_share_claim_keys WHERE owner=$1 AND request=$2",
          )
          .get(owner, input.requestId));
        if (key && key.payload !== payload)
          throw new AccountError(409, "CAPTURE_CHANGED");
        const previous = key
          ? (await db
              .prepare(
                "SELECT * FROM wg_save_share_claims WHERE id=$1 AND owner=$2",
              )
              .get(key.claim_id, owner))
          : null;
        if (previous?.status === "complete")
          return { complete: await this.completed(owner, String(previous.result)) };
        const source = (await this.shares.authorize(input.shareId, input.secret));
        if (source.owner === owner) throw new AccountError(400, "SHARE_SELF");
        const profile = previous
          ? {
              id: String(previous.profile),
              generation: Number(previous.generation),
            }
          : (await saves.createProfile(owner, String(source.version), source.published_meta ? JSON.parse(String(source.published_meta)).version?.engineReleaseId : undefined));
        let row =
          previous ??
          (await db
            .prepare(
              "SELECT * FROM wg_save_share_claims WHERE owner=$1 AND share=$2 AND profile=$3 AND generation=$4",
            )
            .get(owner, source.id, profile.id, profile.generation));
        if (row?.status === "complete") {
          (await db.prepare(
            "INSERT INTO wg_share_claim_keys VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          ).run(owner, input.requestId, row.id, payload));
          return { complete: await this.completed(owner, String(row.result)) };
        }
        const id = row ? String(row.id) : randomUUID();
        if (!row) (await this.shares.limit("claim:" + owner, 30));
        const files = JSON.parse(String(source.files)) as SaveFile[];
        const reservation = await saves.reserve(owner, profile.id, {
          captureId: "share:" + id,
          expectedHead: null,
          generation: profile.generation,
          files,
        });
        (await this.shares.atomic(async () => {
          if (!row)
            (await db.prepare(
              "INSERT INTO wg_save_share_claims VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NULL,$8)",
            ).run(
              id,
              owner,
              source.id,
              source.owner,
              profile.id,
              profile.generation,
              reservation.id,
              Date.now() + 3600_000,
            ));
          else
            (await db.prepare(
              "UPDATE wg_save_share_claims SET expires=$1 WHERE id=$2",
            ).run(Date.now() + 3600_000, id));
          (await db.prepare(
            "INSERT INTO wg_share_claim_keys VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          ).run(owner, input.requestId, id, payload));
          (await saves.pin(String(source.owner), "lease:" + id, files));
        }));
        return {
          id,
          profileId: profile.id,
          reservation,
          files,
          sourceOwner: String(source.owner),
        };
      }
    }, { lock: 'wvn:account-write' })));
    if ("complete" in prepared) return prepared.complete!;
    const id = prepared.id!;
    let flight = this.flights.get(id);
    if (!flight) {
      flight = (async () => {
        try {
          for (const file of prepared.reservation!.files) {
            const bytes = await locked(async () => {
              await check();
              (await this.shares.authorize(input.shareId, input.secret));
              return (await saves.readBlob(prepared.sourceOwner!, file));
            });
            await saves.write(
              owner,
              prepared.reservation!.id,
              file.id,
              new Blob([new Uint8Array(bytes)]).stream(),
              async (fn) =>
                (await locked(async () => {
                  await check();
                  (await this.shares.authorize(input.shareId, input.secret));
                  return fn();
                })),
            );
          }
          await this.shares.catalog.refresh(true);
          return await locked(async () => {
            await check();
            (await this.shares.authorize(input.shareId, input.secret));
            await saves.commitReceived(
              owner,
              prepared.reservation!.id,
              input.shareId,
              async (result) => {
                const profile = (await saves
                  .profiles(owner))
                  .find((p) => p.id === prepared.profileId);
                if (!profile) throw new AccountError(410, "PROFILE_DELETED");
                const value: Result = { profile, revision: result.revision };
                (await db.prepare(
                  "UPDATE wg_save_share_claims SET status='complete',result=$1 WHERE id=$2 AND owner=$3",
                ).run(JSON.stringify(value), id, owner));
                (await saves.unpin(prepared.sourceOwner!, "lease:" + id));
              },
            );
            const receipt = await db.prepare("SELECT result FROM wg_save_share_claims WHERE id=$1 AND owner=$2 AND status='complete'").get(id, owner);
            if (!receipt) throw new AccountError(409, 'CLAIM_INCOMPLETE');
            return this.completed(owner, String(receipt.result));
          });
        } catch (error) {
          // 另一进程可在本次正文复制前完成同一领取；返回已提交的规范回执。
          const receipt = await db.prepare("SELECT result FROM wg_save_share_claims WHERE id=$1 AND owner=$2 AND status='complete'").get(id, owner);
          if (receipt) return this.completed(owner, String(receipt.result));
          throw error;
        } finally {
          await locked(async () => (await saves.unpin(prepared.sourceOwner!, "lease:" + id)));
        }
      })().finally(() => {
        this.flights.delete(id);
      });
      this.flights.set(id, flight);
    }
    const result = await flight;
    await locked(check);
    return result;
  }
  async gc() {
    const { db, saves } = this.shares;
    for (const row of (await db
      .prepare(
        "SELECT * FROM wg_save_share_claims WHERE status!='complete' AND expires<$1 LIMIT 100",
      )
      .all(Date.now())))
      (await saves.unpin(String(row.source_owner), "lease:" + row.id));
  }
  async deleteOwner(owner: string) {
    const { db, saves } = this.shares;
    for (const row of (await db
      .prepare("SELECT * FROM wg_save_share_claims WHERE owner=$1")
      .all(owner)))
      (await saves.unpin(String(row.source_owner), "lease:" + row.id));
    (await db.prepare("DELETE FROM wg_share_claim_keys WHERE owner=$1").run(owner));
    (await db.prepare("DELETE FROM wg_save_share_claims WHERE owner=$1").run(owner));
  }
}
