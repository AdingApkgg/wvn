import { randomUUID, createHash } from "node:crypto";
import { AccountError } from "./errors.server.ts";
import type { ShareStore } from "./shares.server.ts";
import type { SaveProfile, SaveRevision, SaveFile } from "./saves.server.ts";
type Input = { shareId: string; secret?: string; requestId: string };
type Result = { profile: SaveProfile; revision: SaveRevision };
type Locked = <T>(fn: () => T | Promise<T>) => Promise<T>;
export class ShareClaims {
  private flights = new Map<string, Promise<Result>>();
  constructor(readonly shares: ShareStore) {
    const previous = shares.saves.onRemove;
    shares.saves.onRemove = (owner, profile) => {
      previous?.(owner, profile);
      if (!profile) this.deleteOwner(owner);
    };
    shares.db
      .exec(`CREATE TABLE IF NOT EXISTS wg_save_share_claims(id TEXT PRIMARY KEY,owner TEXT NOT NULL,share TEXT NOT NULL,source_owner TEXT NOT NULL,profile TEXT NOT NULL,generation INTEGER NOT NULL,upload TEXT NOT NULL,status TEXT NOT NULL,result TEXT,expires INTEGER NOT NULL,UNIQUE(owner,share,profile,generation));
  CREATE TABLE IF NOT EXISTS wg_share_claim_keys(owner TEXT NOT NULL,request TEXT NOT NULL,claim_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(owner,request));`);
  }
  private completed(owner: string, result: string): Result {
    const value = JSON.parse(result) as Result;
    this.shares.saves.snapshot(owner, value.profile.id, value.revision.id);
    return value;
  }
  status(owner: string, requestId: string) {
    const row = this.shares.db
      .prepare(
        "SELECT c.status,c.result FROM wg_save_share_claims c JOIN wg_share_claim_keys k ON k.claim_id=c.id WHERE k.owner=? AND k.request=? AND c.owner=?",
      )
      .get(owner, requestId, owner);
    if (!row) throw new AccountError(404, "NOT_FOUND");
    return row.status === "complete"
      ? { status: "complete", ...this.completed(owner, String(row.result)) }
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
    const prepared = await locked(async () => {
      await check();
      return this.shares.atomic(() => {
        const key = db
          .prepare(
            "SELECT * FROM wg_share_claim_keys WHERE owner=? AND request=?",
          )
          .get(owner, input.requestId);
        if (key && key.payload !== payload)
          throw new AccountError(409, "CAPTURE_CHANGED");
        const previous = key
          ? db
              .prepare(
                "SELECT * FROM wg_save_share_claims WHERE id=? AND owner=?",
              )
              .get(key.claim_id, owner)
          : null;
        if (previous?.status === "complete")
          return { complete: this.completed(owner, String(previous.result)) };
        const source = this.shares.authorize(input.shareId, input.secret);
        if (source.owner === owner) throw new AccountError(400, "SHARE_SELF");
        const profile = previous
          ? {
              id: String(previous.profile),
              generation: Number(previous.generation),
            }
          : saves.createProfile(owner, String(source.version));
        let row =
          previous ??
          db
            .prepare(
              "SELECT * FROM wg_save_share_claims WHERE owner=? AND share=? AND profile=? AND generation=?",
            )
            .get(owner, source.id, profile.id, profile.generation);
        if (row?.status === "complete") {
          db.prepare(
            "INSERT OR IGNORE INTO wg_share_claim_keys VALUES (?,?,?,?)",
          ).run(owner, input.requestId, row.id, payload);
          return { complete: this.completed(owner, String(row.result)) };
        }
        const id = row ? String(row.id) : randomUUID();
        if (!row) this.shares.limit("claim:" + owner, 30);
        const files = JSON.parse(String(source.files)) as SaveFile[];
        const reservation = saves.reserve(owner, profile.id, {
          captureId: "share:" + id,
          expectedHead: null,
          generation: profile.generation,
          files,
        });
        this.shares.atomic(() => {
          if (!row)
            db.prepare(
              "INSERT INTO wg_save_share_claims VALUES (?,?,?,?,?,?,?,'pending',NULL,?)",
            ).run(
              id,
              owner,
              source.id,
              source.owner,
              profile.id,
              profile.generation,
              reservation.id,
              Date.now() + 3600_000,
            );
          else
            db.prepare(
              "UPDATE wg_save_share_claims SET expires=? WHERE id=?",
            ).run(Date.now() + 3600_000, id);
          db.prepare(
            "INSERT OR IGNORE INTO wg_share_claim_keys VALUES (?,?,?,?)",
          ).run(owner, input.requestId, id, payload);
          saves.pin(String(source.owner), "lease:" + id, files);
        });
        return {
          id,
          profileId: profile.id,
          reservation,
          files,
          sourceOwner: String(source.owner),
        };
      });
    });
    if ("complete" in prepared) return prepared.complete!;
    const id = prepared.id!;
    let flight = this.flights.get(id);
    if (!flight) {
      flight = (async () => {
        try {
          for (const file of prepared.reservation!.files) {
            const bytes = await locked(async () => {
              await check();
              this.shares.authorize(input.shareId, input.secret);
              return saves.readBlob(prepared.sourceOwner!, file);
            });
            await saves.write(
              owner,
              prepared.reservation!.id,
              file.id,
              new Blob([new Uint8Array(bytes)]).stream(),
              (fn) =>
                locked(async () => {
                  await check();
                  this.shares.authorize(input.shareId, input.secret);
                  return fn();
                }),
            );
          }
          await this.shares.catalog.refresh(true);
          return await locked(async () => {
            await check();
            this.shares.authorize(input.shareId, input.secret);
            let value!: Result;
            saves.commitReceived(
              owner,
              prepared.reservation!.id,
              input.shareId,
              (result) => {
                const profile = saves
                  .profiles(owner)
                  .find((p) => p.id === prepared.profileId);
                if (!profile) throw new AccountError(410, "PROFILE_DELETED");
                value = { profile, revision: result.revision };
                db.prepare(
                  "UPDATE wg_save_share_claims SET status='complete',result=? WHERE id=? AND owner=?",
                ).run(JSON.stringify(value), id, owner);
                saves.unpin(prepared.sourceOwner!, "lease:" + id);
              },
            );
            return value;
          });
        } finally {
          await locked(() => saves.unpin(prepared.sourceOwner!, "lease:" + id));
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
  gc() {
    const { db, saves } = this.shares;
    for (const row of db
      .prepare(
        "SELECT * FROM wg_save_share_claims WHERE status!='complete' AND expires<? LIMIT 100",
      )
      .all(Date.now()))
      saves.unpin(String(row.source_owner), "lease:" + row.id);
  }
  deleteOwner(owner: string) {
    const { db, saves } = this.shares;
    for (const row of db
      .prepare("SELECT * FROM wg_save_share_claims WHERE owner=?")
      .all(owner))
      saves.unpin(String(row.source_owner), "lease:" + row.id);
    db.prepare("DELETE FROM wg_share_claim_keys WHERE owner=?").run(owner);
    db.prepare("DELETE FROM wg_save_share_claims WHERE owner=?").run(owner);
  }
}
