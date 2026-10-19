import { test } from "node:test";
import assert from "node:assert/strict";
import { sharingFixture } from "./helpers/sharing.ts";
test("link shares freeze one owned snapshot and reveal neither private IDs nor secrets", async () => {
  const f = await sharingFixture();
  try {
    const made = f.shares.create("alice", f.input);
    assert.ok(made.secret);
    assert.throws(
      () => f.shares.inspect(made.id, "wrong"),
      /SHARE_UNAVAILABLE/,
    );
    assert.throws(() => f.shares.inspect(made.id), /SHARE_UNAVAILABLE/);
    const view = f.shares.inspect(made.id, made.secret);
    assert.equal(view.title, "Chapter one");
    assert.equal(view.version.id, "version-a");
    assert.equal(f.shares.listPublic("v4").items.length, 0);
    const json = JSON.stringify(view);
    for (const secret of ["alice", f.p.id, f.revision.id, made.secret, f.root])
      assert.ok(!json.includes(secret));
    assert.equal(f.shares.create("alice", f.input).id, made.id);
    assert.equal(f.shares.create("alice", f.input).secret, undefined);
    assert.throws(
      () => f.shares.create("bob", { ...f.input, requestId: "steal" }),
      /NOT_FOUND/,
    );
  } finally {
    f.close();
  }
});
test("public moderation and metadata CAS retain approved text until the new edit is approved", async () => {
  const f = await sharingFixture();
  try {
    const made = f.shares.create("alice", { ...f.input, mode: "public" });
    assert.throws(() => f.shares.inspect(made.id), /SHARE_UNAVAILABLE/);
    f.shares.moderate(made.id, 1, "approve", "checked");
    assert.equal(f.shares.listPublic("v4").items[0].title, "Chapter one");
    f.shares.edit("alice", made.id, 1, {
      title: "New title",
      description: "Edited",
      progress: "complete",
      spoiler: true,
    });
    assert.equal(f.shares.inspect(made.id).title, "Chapter one");
    assert.throws(
      () => f.shares.moderate(made.id, 1, "approve", "late"),
      /CONTENT_CONFLICT/,
    );
    f.shares.moderate(made.id, 2, "approve", "checked");
    assert.equal(f.shares.inspect(made.id).title, "New title");
    f.shares.revoke("alice", made.id);
    assert.throws(() => f.shares.inspect(made.id), /SHARE_UNAVAILABLE/);
    assert.equal(f.shares.listPublic("v4").items.length, 0);
    assert.throws(
      () => f.shares.moderate(made.id, 2, "approve", "revive"),
      /SHARE_UNAVAILABLE/,
    );
  } finally {
    f.close();
  }
});
test("expiration, live catalog changes and the durable revocation ledger fail closed", async () => {
  const f = await sharingFixture();
  try {
    const made = f.shares.create("alice", f.input);
    f.db.prepare("UPDATE wg_save_shares SET expires=0 WHERE id=?").run(made.id);
    assert.throws(
      () => f.shares.inspect(made.id, made.secret),
      /SHARE_UNAVAILABLE/,
    );
    const next = f.shares.create("alice", { ...f.input, requestId: "next" });
    f.ledger.record(next.id);
    assert.throws(
      () => f.shares.inspect(next.id, next.secret),
      /SHARE_UNAVAILABLE/,
    );
    await f.hide();
    assert.throws(
      () => f.shares.create("alice", { ...f.input, requestId: "hidden" }),
      /VERSION_UNAVAILABLE/,
    );
  } finally {
    f.close();
  }
});

test("moderators can resolve a benign report without revoking a valid share", async () => {
  const f = await sharingFixture();
  try {
    const s = f.shares.create("alice", f.input);
    f.shares.report("bob", s.id, s.secret, "Please check");
    f.shares.moderate(s.id, 1, "resolve", "No issue found");
    assert.equal(f.shares.inspect(s.id, s.secret).title, f.input.title);
    assert.equal(f.shares.queue().length, 0);
  } finally {
    f.close();
  }
});
test("expired download leases are durable, bounded and reclaimed by GC", async () => {
  const f = await sharingFixture();
  try {
    assert.equal(
      typeof f.shares.leaseDownload,
      "function",
      "download leases must survive process loss",
    );
    const key = f.shares.leaseDownload("alice", f.revision.files);
    f.db
      .prepare("UPDATE wg_share_download_leases SET expires=0 WHERE id=?")
      .run(key);
    f.shares.gc();
    assert.equal(
      f.db
        .prepare("SELECT count(*) AS n FROM wg_save_refs WHERE revision=?")
        .get(key)?.n,
      0,
    );
  } finally {
    f.close();
  }
});

test("public and owner lists page stably through 201 records without duplicate or missing IDs", async () => {
  const f = await sharingFixture();
  try {
    const first = f.shares.create("alice", { ...f.input, mode: "public" });
    f.shares.moderate(first.id, 1, "approve", "checked");
    for (let n = 1; n <= 200; n++)
      f.db
        .prepare(
          "INSERT INTO wg_save_shares SELECT ?,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,approved,pending,metadata_revision,?,?,payload FROM wg_save_shares WHERE id=?",
        )
        .run(
          "page-" + String(n).padStart(4, "0"),
          Date.now() + n,
          "request-page-" + n,
          first.id,
        );
    const publicIds: string[] = [],
      ownIds: string[] = [];
    let cursor: string | undefined;
    do {
      const p = f.shares.listPublic("v4", undefined, cursor);
      assert.ok(p.items.length <= 20);
      publicIds.push(...p.items.map((x) => x.id));
      cursor = p.next ?? undefined;
    } while (cursor);
    do {
      const p = f.shares.listOwn("alice", cursor);
      assert.ok(p.items.length <= 20);
      ownIds.push(...p.items.map((x) => x.id));
      cursor = p.next ?? undefined;
    } while (cursor);
    assert.equal(new Set(publicIds).size, 201);
    assert.equal(new Set(ownIds).size, 201);
    assert.equal(publicIds.length, 201);
  } finally {
    f.close();
  }
});

test("missing source profiles fail closed even if a legacy process omitted the share deletion hook", async () => {
  const f = await sharingFixture();
  try {
    const made = f.shares.create("alice", f.input);
    f.db.prepare("DELETE FROM wg_save_profiles WHERE id=?").run(f.p.id);
    assert.throws(
      () => f.shares.inspect(made.id, made.secret),
      /SHARE_UNAVAILABLE/,
    );
  } finally {
    f.close();
  }
});
