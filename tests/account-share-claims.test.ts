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
    const made = (await f.shares.create("alice", f.input));
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
    assert.equal((await f.saves.profiles("bob"))[0].head, null);
    assert.equal(one.revision.originKind, "share");
    assert.equal((await f.saves.history("bob", one.profile.id)).length, 1);
    assert.equal(
      (
        await f.saves.read("bob", one.profile.id, one.revision.id, "slot.dat")
      ).toString(),
      f.content,
    );
    (await f.saves.deleteOwner("alice"));
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
    (await f.close());
  }
});
for (const lateCopy of [false, true]) test(`separate claim instances return one receipt when the second copy is ${lateCopy ? 'late' : 'overlapping'}`, async () => {
  const f = await sharingFixture();
  try {
    const a = new module!.ShareClaims(f.shares), b = new module!.ShareClaims(f.shares);
    const made = await f.shares.create('alice', f.input);
    let ready = 0, release!: () => void, finishA!: () => void;
    const bothPrepared = new Promise<void>(resolve => { release = resolve; });
    const aFinished = new Promise<void>(resolve => { finishA = resolve; });
    const lock = (second: boolean) => {
      let calls = 0;
      return async <T>(fn: () => T | Promise<T>) => {
        if (++calls === 2) {
          if (++ready === 2) release();
          await bothPrepared;
          if (second && lateCopy) await aFinished;
        }
        return fn();
      };
    };
    const first = a.claim('bob', () => {}, { shareId: made.id, secret: made.secret, requestId: 'process-a' }, lock(false)).finally(finishA);
    const second = b.claim('bob', () => {}, { shareId: made.id, secret: made.secret, requestId: 'process-b' }, lock(true));
    const results = await Promise.all([first, second]);
    assert.ok(results[0]?.revision?.id);
    assert.equal(results[0].revision.id, results[1]?.revision?.id);
    assert.equal((await f.saves.history('bob', results[0].profile.id)).length, 1);
    assert.equal((await a.status('bob', 'process-a')).status, 'complete');
    assert.equal((await b.status('bob', 'process-b')).status, 'complete');
  } finally { await f.close(); }
});
test("revocation or identity change during copying cannot commit a partial receipt", async () => {
  assert.ok(module?.ShareClaims, "ShareClaims must exist");
  const f = await sharingFixture();
  try {
    const claims = new module.ShareClaims(f.shares),
      made = (await f.shares.create("alice", f.input));
    let count = 0;
    const locked = async <T>(fn: () => T | Promise<T>) => {
      if (++count === 3) (await f.shares.revoke("alice", made.id));
      return fn();
    };
    await assert.rejects(
      async () =>
        (await claims.claim(
          "bob",
          () => {},
          { shareId: made.id, secret: made.secret, requestId: "revocation" },
          locked,
        )),
      /SHARE_UNAVAILABLE/,
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_save_revisions WHERE owner='bob'",
        )
        .get())?.n,
      0,
    );
    const second = (await f.shares.create("alice", {
      ...f.input,
      requestId: "second-share",
    }));
    await assert.rejects(
      async () =>
        (await claims.claim(
          "bob",
          () => {
            throw new Error("IDENTITY_CHANGED");
          },
          { shareId: second.id, secret: second.secret, requestId: "identity" },
        )),
      /IDENTITY_CHANGED/,
    );
  } finally {
    (await f.close());
  }
});
test("an expired receipt resumes the original generation and a deleted target never resurrects", async () => {
  assert.ok(module?.ShareClaims, "ShareClaims must exist");
  const f = await sharingFixture();
  try {
    const claims = new module.ShareClaims(f.shares),
      made = (await f.shares.create("alice", f.input));
    const input = { shareId: made.id, secret: made.secret, requestId: "retry" };
    let count = 0;
    await assert.rejects(async () =>
      (await claims.claim(
        "bob",
        () => {},
        input,
        async (fn) => {
          if (++count === 3) throw new Error("NETWORK");
          return fn();
        },
      )),
    );
    (await f.db
      .prepare("UPDATE wg_save_uploads SET expires=0 WHERE owner='bob'")
      .run());
    (await f.saves.gc());
    const result = await claims.claim("bob", () => {}, input);
    assert.equal(result.revision.originKind, "share");
    (await f.saves.remove("bob", result.profile.id, null, 1));
    await assert.rejects(
      async () => (await claims.claim("bob", () => {}, input)),
      /PROFILE_DELETED/,
    );
  } finally {
    (await f.close());
  }
});

test("low disk and receiver deletion during copying leave no committed receipt", async () => {
  const f = await sharingFixture();
  try {
    const { ShareStore } = await import("../src/accounts/shares.server.ts");
    const { SaveStore } = await import("../src/accounts/saves.server.ts");
    const made = (await f.shares.create("alice", f.input));
    const low = new ShareStore(
      f.db,
      new SaveStore(f.db, f.root, () => 60 * 1024 ** 3),
      f.policy,
      f.ledger,
    );
    const claims = new module!.ShareClaims(low);
    await assert.rejects(
      async () =>
        (await claims.claim("bob", () => {}, {
          shareId: made.id,
          secret: made.secret,
          requestId: "no-space",
        })),
      /SPACE_STOP/,
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_save_revisions WHERE owner='bob'",
        )
        .get())?.n,
      0,
    );
    const normal = new module!.ShareClaims(f.shares);
    let count = 0;
    await assert.rejects(async () =>
      (await normal.claim(
        "bob",
        () => {},
        { shareId: made.id, secret: made.secret, requestId: "deleted" },
        async (fn) => {
          if (++count === 3) (await f.saves.deleteOwner("bob"));
          return fn();
        },
      )),
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_save_revisions WHERE owner='bob'",
        )
        .get())?.n,
      0,
    );
  } finally {
    (await f.close());
  }
});
