import { test } from "node:test";
import assert from "node:assert/strict";
import { sharingFixture } from "./helpers/sharing.ts";
import { AccountError } from "../src/accounts/errors.server.ts";

type Fixture = Awaited<ReturnType<typeof sharingFixture>>;
async function nextRevision(f: Fixture) {
  const current = (await f.saves.profiles("alice"))[0];
  return (await f.saves.restore(
    "alice",
    f.p.id,
    f.revision.id,
    current.head,
    current.generation,
  ));
}
async function state(f: Fixture) {
  return {
    shares: (await f.db.prepare("SELECT count(*) AS n FROM wg_save_shares").get())?.n,
    refs: (await f.db
      .prepare(
        "SELECT count(*) AS n FROM wg_save_refs WHERE revision LIKE 'share:%'",
      )
      .get())?.n,
    rates: (await f.db.prepare("SELECT * FROM wg_share_rates ORDER BY key").all()),
    keys: (await f.db.prepare("SELECT count(*) AS n FROM wg_share_publish_keys").get())
      ?.n,
  };
}
function rejected(code: string, status: number) {
  return (error: unknown) =>
    error instanceof AccountError &&
    error.code === code &&
    error.status === status;
}
// Moving the quantity/rate checks before snapshot dedup must fail these tests.
// The rejected fresh revision must also leave no rate, alias or reference writes.
for (const mode of ["link", "public"] as const) {
  test(`${mode}: duplicate succeeds at 20 active/pending shares while a new snapshot is rejected`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
    const f = await sharingFixture();
    try {
      const first = (await f.shares.create("alice", { ...f.input, mode }));
      for (let n = 1; n < 20; n++) {
        if (n % 5 === 0) {
          t.mock.timers.tick(3_600_001);
          await f.policy.refresh(true);
        }
        const revision = (await nextRevision(f));
        (await f.shares.create("alice", {
          ...f.input,
          mode,
          revisionId: revision.id,
          requestId: `fill-${n}`,
        }));
      }
      // Expire the hourly window so the rejection specifically proves the quantity boundary.
      t.mock.timers.tick(3_600_001);
      await f.policy.refresh(true);
      const fresh = (await nextRevision(f)),
        before = (await state(f));
      assert.equal(before.shares, 20);
      assert.equal(before.refs, 20);
      const repeated = (await f.shares.create("alice", {
        ...f.input,
        mode,
        requestId: "full-duplicate",
        title: "Ignored draft",
      }));
      assert.deepEqual(repeated, {
        id: first.id,
        state: mode === "link" ? "active" : "pending",
        duplicate: true,
      });
      assert.deepEqual((await state(f)), { ...before, keys: 21 });
      assert.equal(
        (await f.shares.create("alice", {
          ...f.input,
          mode,
          requestId: "full-duplicate",
          title: "Ignored draft",
        })).id,
        first.id,
      );
      await assert.rejects(
        async () =>
          (await f.shares.create("alice", {
            ...f.input,
            mode,
            requestId: "full-duplicate",
            title: "Changed bound request",
          })),
        rejected("CAPTURE_CHANGED", 409),
      );
      await assert.rejects(
        async () =>
          (await f.shares.create("alice", {
            ...f.input,
            mode,
            revisionId: fresh.id,
            requestId: "full-new",
          })),
        rejected("SHARE_LIMIT", 413),
      );
      assert.deepEqual((await state(f)), { ...before, keys: 21 });
      assert.equal(
        (await f.shares.listOwn("alice")).items.find((s) => s.id === first.id)?.title,
        f.input.title,
      );
    } finally {
      (await f.close());
    }
  });

  test(`${mode}: duplicate succeeds after 5 publications while a new snapshot is rate limited`, async () => {
    const f = await sharingFixture();
    try {
      const first = (await f.shares.create("alice", { ...f.input, mode }));
      for (let n = 1; n < 5; n++) {
        const revision = (await nextRevision(f));
        (await f.shares.create("alice", {
          ...f.input,
          mode,
          revisionId: revision.id,
          requestId: `rate-fill-${n}`,
        }));
      }
      const fresh = (await nextRevision(f)),
        before = (await state(f));
      assert.equal(before.shares, 5);
      assert.equal(before.refs, 5);
      assert.equal(before.rates.length, 1);
      assert.equal(before.rates[0].n, 5);
      const repeated = (await f.shares.create("alice", {
        ...f.input,
        mode,
        requestId: "rate-duplicate",
        days: 1,
      }));
      assert.deepEqual(repeated, {
        id: first.id,
        state: mode === "link" ? "active" : "pending",
        duplicate: true,
      });
      assert.deepEqual((await state(f)), { ...before, keys: 6 });
      await assert.rejects(
        async () =>
          (await f.shares.create("alice", {
            ...f.input,
            mode,
            revisionId: fresh.id,
            requestId: "rate-new",
          })),
        rejected("TRY_LATER", 429),
      );
      assert.deepEqual((await state(f)), { ...before, keys: 6 });
      assert.equal(
        (await f.shares.create("alice", {
          ...f.input,
          mode,
          requestId: "rate-duplicate",
          days: 1,
        })).id,
        first.id,
      );
      assert.deepEqual((await state(f)), { ...before, keys: 6 });
    } finally {
      (await f.close());
    }
  });
}
