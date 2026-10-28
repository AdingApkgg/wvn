import { test } from "node:test";
import assert from "node:assert/strict";
import { sharingFixture } from "./helpers/sharing.ts";
test("link shares freeze one owned snapshot and reveal neither private IDs nor secrets", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", f.input));
    assert.ok(made.secret);
    (await assert.rejects(
      async () => (await f.shares.inspect(made.id, "wrong")),
      /SHARE_UNAVAILABLE/,
    ));
    (await assert.rejects(async () => (await f.shares.inspect(made.id)), /SHARE_UNAVAILABLE/));
    const view = (await f.shares.inspect(made.id, made.secret));
    assert.equal(view.title, "Chapter one");
    assert.equal(view.version.id, "version-a");
    assert.equal((await f.shares.listPublic("v4")).items.length, 0);
    const json = JSON.stringify(view);
    for (const secret of ["alice", f.p.id, f.revision.id, made.secret, f.root])
      assert.ok(!json.includes(secret));
    assert.equal((await f.shares.create("alice", f.input)).id, made.id);
    assert.equal((await f.shares.create("alice", f.input)).secret, undefined);
    await assert.rejects(
      async () => (await f.shares.create("bob", { ...f.input, requestId: "steal" })),
      /NOT_FOUND/,
    );
  } finally {
    (await f.close());
  }
});
test("public moderation and metadata CAS retain approved text until the new edit is approved", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", { ...f.input, mode: "public" }));
    (await assert.rejects(async () => (await f.shares.inspect(made.id)), /SHARE_UNAVAILABLE/));
    (await f.shares.moderate(made.id, 1, "approve", "checked"));
    assert.equal((await f.shares.listPublic("v4")).items[0].title, "Chapter one");
    (await f.shares.edit("alice", made.id, 1, {
      title: "New title",
      description: "Edited",
      progress: "complete",
      spoiler: true,
    }));
    assert.equal((await f.shares.inspect(made.id)).title, "Chapter one");
    (await assert.rejects(
      async () => (await f.shares.moderate(made.id, 1, "approve", "late")),
      /CONTENT_CONFLICT/,
    ));
    (await f.shares.moderate(made.id, 2, "approve", "checked"));
    assert.equal((await f.shares.inspect(made.id)).title, "New title");
    (await f.shares.revoke("alice", made.id));
    (await assert.rejects(async () => (await f.shares.inspect(made.id)), /SHARE_UNAVAILABLE/));
    assert.equal((await f.shares.listPublic("v4")).items.length, 0);
    (await assert.rejects(
      async () => (await f.shares.moderate(made.id, 2, "approve", "revive")),
      /SHARE_UNAVAILABLE/,
    ));
  } finally {
    (await f.close());
  }
});
test("expiration, live catalog changes and the durable revocation ledger fail closed", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", f.input));
    (await f.db.prepare("UPDATE wg_save_shares SET expires=0 WHERE id=$1").run(made.id));
    (await assert.rejects(
      async () => (await f.shares.inspect(made.id, made.secret)),
      /SHARE_UNAVAILABLE/,
    ));
    const next = (await f.shares.create("alice", { ...f.input, requestId: "next" }));
    f.ledger.record(next.id);
    (await assert.rejects(
      async () => (await f.shares.inspect(next.id, next.secret)),
      /SHARE_UNAVAILABLE/,
    ));
    await f.hide();
    await assert.rejects(
      async () => (await f.shares.create("alice", { ...f.input, requestId: "hidden" })),
      /VERSION_UNAVAILABLE/,
    );
  } finally {
    (await f.close());
  }
});

test("moderators can resolve a benign report without revoking a valid share", async () => {
  const f = await sharingFixture();
  try {
    const s = (await f.shares.create("alice", f.input));
    (await f.shares.report("bob", s.id, s.secret, "Please check"));
    (await f.shares.moderate(s.id, 1, "resolve", "No issue found"));
    assert.equal((await f.shares.inspect(s.id, s.secret)).title, f.input.title);
    assert.equal((await f.shares.queue()).length, 0);
  } finally {
    (await f.close());
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
    const key = (await f.shares.leaseDownload("alice", f.revision.files));
    (await f.db
      .prepare("UPDATE wg_share_download_leases SET expires=0 WHERE id=$1")
      .run(key));
    (await f.shares.gc());
    assert.equal(
      (await f.db
        .prepare("SELECT count(*) AS n FROM wg_save_refs WHERE revision=$1")
        .get(key))?.n,
      0,
    );
  } finally {
    (await f.close());
  }
});

test("public and owner lists page stably through 201 records without duplicate or missing IDs", async () => {
  const f = await sharingFixture();
  try {
    const first = (await f.shares.create("alice", { ...f.input, mode: "public" }));
    (await f.shares.moderate(first.id, 1, "approve", "checked"));
    for (let n = 1; n <= 200; n++)
      (await f.db
        .prepare(
          "INSERT INTO wg_save_shares (id,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,approved,pending,metadata_revision,created,request_id,payload) SELECT $1,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,approved,pending,metadata_revision,$2,$3,payload FROM wg_save_shares WHERE id=$4",
        )
        .run(
          "page-" + String(n).padStart(4, "0"),
          Date.now() + n,
          "request-page-" + n,
          first.id,
        ));
    const publicIds: string[] = [],
      ownIds: string[] = [];
    let cursor: string | undefined;
    do {
      const p = (await f.shares.listPublic("v4", undefined, cursor));
      assert.ok(p.items.length <= 20);
      publicIds.push(...p.items.map((x) => x.id));
      cursor = p.next ?? undefined;
    } while (cursor);
    do {
      const p = (await f.shares.listOwn("alice", cursor));
      assert.ok(p.items.length <= 20);
      ownIds.push(...p.items.map((x) => x.id));
      cursor = p.next ?? undefined;
    } while (cursor);
    assert.equal(new Set(publicIds).size, 201);
    assert.equal(new Set(ownIds).size, 201);
    assert.equal(publicIds.length, 201);
  } finally {
    (await f.close());
  }
});

test("missing source profiles fail closed even if a legacy process omitted the share deletion hook", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", f.input));
    (await f.db.prepare("DELETE FROM wg_save_profiles WHERE id=$1").run(f.p.id));
    (await assert.rejects(
      async () => (await f.shares.inspect(made.id, made.secret)),
      /SHARE_UNAVAILABLE/,
    ));
  } finally {
    (await f.close());
  }
});

test("version and approved-progress filters page before limiting and ignore pending edits", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", { ...f.input, mode: "public" }));
    (await f.shares.moderate(made.id, 1, "approve", "checked"));
    for (let n = 0; n < 65; n++) {
      const progress = n % 3 === 0 ? "complete" : "route";
      (await f.db
        .prepare(
          "INSERT INTO wg_save_shares (id,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,approved,pending,metadata_revision,created,request_id,payload) SELECT $1,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,$2,pending,metadata_revision,$3,$4,payload FROM wg_save_shares WHERE id=$5",
        )
        .run(
          "filter-" + String(n).padStart(3, "0"),
          JSON.stringify({
            description: "",
            spoiler: false,
            progress,
            title: "Filtered " + n,
          }),
          Date.now() + n,
          "filter-request-" + n,
          made.id,
        ));
    }
    (await f.shares.edit("alice", made.id, 1, { ...f.input, progress: "complete" }));
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const page = (await f.shares.listPublic("v4", "version-a", cursor, "complete"));
      assert.ok(
        page.items.every(
          (s) => s.progress === "complete" && s.version.id === "version-a",
        ),
      );
      ids.push(...page.items.map((s) => s.id));
      cursor = page.next ?? undefined;
    } while (cursor);
    assert.equal(ids.length, 22);
    assert.equal(new Set(ids).size, 22);
    assert.ok(!ids.includes(made.id));
    assert.equal(
      (await f.shares.listPublic("v4", "not-a-version", undefined, "complete")).items
        .length,
      0,
    );
    (await assert.rejects(
      async () => (await f.shares.listPublic("v4", undefined, undefined, "wrong")),
      /FILTER_INVALID/,
    ));
  } finally {
    (await f.close());
  }
});

test("private moderation projects full metadata and immutable manifest even when catalog is hidden", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", { ...f.input, mode: "public" }));
    let item = (await f.shares.queue())[0];
    assert.equal(item.work?.title, "Story");
    assert.equal(item.version?.id, "version-a");
    assert.equal(item.version?.engine, "ONS");
    assert.equal(item.author, "Alice");
    assert.deepEqual(item.files, f.revision.files);
    assert.equal(item.bytes, f.content.length);
    assert.equal(item.catalogStatus, "visible");
    const raw = JSON.stringify(item);
    for (const privateValue of [f.p.id, f.revision.id, "alice", f.root])
      assert.ok(!raw.includes(privateValue));
    await f.hide();
    item = (await f.shares.queue())[0];
    assert.equal(item.catalogStatus, "hidden");
    assert.equal(item.versionId, "version-a");
    assert.equal(item.workId, "v4");
    assert.equal(item.files[0].sha256, f.revision.files[0].sha256);
    await f.offline();
    const offlineItem = (await f.shares.queue())[0];
    assert.equal(offlineItem.catalogStatus, "unavailable");
    assert.equal(offlineItem.files[0].sha256, f.revision.files[0].sha256);
    (await f.shares.moderate(made.id, 1, "block", "Version unavailable"));
    assert.equal((await f.shares.queue()).length, 0);
  } finally {
    (await f.close());
  }
});
