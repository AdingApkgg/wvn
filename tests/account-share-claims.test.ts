import { test } from "node:test";
import assert from "node:assert/strict";
import { sharingFixture } from "./helpers/sharing.ts";
const module = await import("../src/accounts/share-claims.server.ts").catch(
  () => null,
);
test("two devices claim the same snapshot once without replacing the current head", async () => {
  assert.ok(module?.ShareClaims, "ShareClaims must exist");
  const f = await sharingFixture();
  try {
    const shares = new module.ShareClaims(f.shares);
    const made = f.shares.create("alice", f.input);
    const input = {
      shareId: made.id,
      secret: made.secret,
      requestId: "receive",
    };
    const [one, two] = await Promise.all([
      shares.claim("bob", () => {}, input),
      shares.claim("bob", () => {}, { ...input, requestId: "other-device" }),
    ]);
    assert.equal(one.revision.id, two.revision.id);
    assert.equal(f.saves.profiles("bob")[0].head, null);
    assert.equal(one.revision.originKind, "share");
    assert.equal(f.saves.history("bob", one.profile.id).length, 1);
    assert.equal(
      (
        await f.saves.read("bob", one.profile.id, one.revision.id, "slot.dat")
      ).toString(),
      f.content,
    );
    f.saves.deleteOwner("alice");
    assert.equal(
      (
        await f.saves.read("bob", one.profile.id, one.revision.id, "slot.dat")
      ).toString(),
      f.content,
    );
    assert.equal(
      (await shares.claim("bob", () => {}, input)).revision.id,
      one.revision.id,
    );
  } finally {
    f.close();
  }
});
test("revocation or identity change during copying cannot commit a partial receipt", async () => {
  assert.ok(module?.ShareClaims, "ShareClaims must exist");
  const f = await sharingFixture();
  try {
    const claims = new module.ShareClaims(f.shares),
      made = f.shares.create("alice", f.input);
    let count = 0;
    const locked = async <T>(fn: () => T | Promise<T>) => {
      if (++count === 3) f.shares.revoke("alice", made.id);
      return fn();
    };
    await assert.rejects(
      () =>
        claims.claim(
          "bob",
          () => {},
          { shareId: made.id, secret: made.secret, requestId: "revocation" },
          locked,
        ),
      /SHARE_UNAVAILABLE/,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_save_revisions WHERE owner='bob'",
        )
        .get()?.n,
      0,
    );
    const second = f.shares.create("alice", {
      ...f.input,
      requestId: "second-share",
    });
    await assert.rejects(
      () =>
        claims.claim(
          "bob",
          () => {
            throw new Error("IDENTITY_CHANGED");
          },
          { shareId: second.id, secret: second.secret, requestId: "identity" },
        ),
      /IDENTITY_CHANGED/,
    );
  } finally {
    f.close();
  }
});
test("an expired receipt resumes the original generation and a deleted target never resurrects", async () => {
  assert.ok(module?.ShareClaims, "ShareClaims must exist");
  const f = await sharingFixture();
  try {
    const claims = new module.ShareClaims(f.shares),
      made = f.shares.create("alice", f.input);
    const input = { shareId: made.id, secret: made.secret, requestId: "retry" };
    let count = 0;
    await assert.rejects(() =>
      claims.claim(
        "bob",
        () => {},
        input,
        async (fn) => {
          if (++count === 3) throw new Error("NETWORK");
          return fn();
        },
      ),
    );
    f.db
      .prepare("UPDATE wg_save_uploads SET expires=0 WHERE owner='bob'")
      .run();
    f.saves.gc();
    const result = await claims.claim("bob", () => {}, input);
    assert.equal(result.revision.originKind, "share");
    f.saves.remove("bob", result.profile.id, null, 1);
    await assert.rejects(
      () => claims.claim("bob", () => {}, input),
      /PROFILE_DELETED/,
    );
  } finally {
    f.close();
  }
});
