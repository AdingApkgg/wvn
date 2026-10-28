import { testDatabaseSchema } from "./helpers/accounts.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { sharingFixture } from "./helpers/sharing.ts";
import { ShareClaims } from "../src/accounts/share-claims.server.ts";
import { ShareStore } from "../src/accounts/shares.server.ts";

test("snapshot/mode dedup binds new request aliases without rate/quota or ref growth", async () => {
  const f = await sharingFixture();
  try {
    const first = (await f.shares.create("alice", f.input)),
      original = (await f.shares.inspect(first.id, first.secret));
    for (let i = 0; i < 8; i++) {
      const result = (await f.shares.create("alice", {
        ...f.input,
        requestId: "duplicate-" + i,
        title: "Different draft",
      }));
      assert.equal(result.id, first.id);
      assert.equal(result.duplicate, true);
      assert.equal(result.secret, undefined);
    }
    assert.equal(
      (await f.shares.inspect(first.id, first.secret)).title,
      original.title,
    );
    assert.equal(
      (await f.shares.inspect(first.id, first.secret)).expiresAt,
      original.expiresAt,
    );
    assert.equal(
      (await f.db.prepare("SELECT count(*) AS n FROM wg_save_shares").get())?.n,
      1,
    );
    assert.equal(
      (await f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_save_refs WHERE revision LIKE 'share:%'",
        )
        .get())?.n,
      1,
    );
    assert.equal(
      (await f.db.prepare("SELECT max(n) AS n FROM wg_share_rates").get())?.n,
      1,
    );
    await assert.rejects(
      async () =>
        (await f.shares.create("alice", {
          ...f.input,
          requestId: "duplicate-0",
          title: "changed alias",
        })),
      /CAPTURE_CHANGED/,
    );
    const publicShare = (await f.shares.create("alice", {
      ...f.input,
      mode: "public",
      requestId: "other-mode",
    }));
    assert.notEqual(publicShare.id, first.id);
    (await f.shares.revoke("alice", first.id));
    const rebuilt = (await f.shares.create("alice", {
      ...f.input,
      requestId: "after-revoke",
    }));
    assert.notEqual(rebuilt.id, first.id);
    assert.ok(rebuilt.secret);
    await assert.rejects(
      async () =>
        (await f.shares.create("alice", {
          ...f.input,
          requestId: "duplicate-0",
          title: "Different draft",
        })),
      /SHARE_UNAVAILABLE/,
    );
    (await f.saves.deleteOwner("alice"));
    assert.equal(
      (await f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_share_publish_keys WHERE owner='alice'",
        )
        .get())?.n,
      0,
    );
  } finally {
    (await f.close());
  }
});

test("publication metadata stays frozen when live catalog titles change and hidden versions remain denied", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", f.input));
    (await f.shares.create("alice", {
      ...f.input,
      mode: "public",
      requestId: "pending-meta",
    }));
    await f.rename("Renamed work", "Renamed build");
    const view = (await f.shares.inspect(made.id, made.secret));
    assert.equal(view.work.title, "Story");
    assert.equal(view.version.title, "ONS build");
    assert.equal(view.metadataBasis, "published");
    assert.equal((await f.shares.listOwn("alice")).items[0].version.title, "ONS build");
    await f.hide();
    (await assert.rejects(
      async () => (await f.shares.inspect(made.id, made.secret)),
      /VERSION_UNAVAILABLE/,
    ));
    assert.equal((await f.shares.listOwn("alice")).items[0].version.title, "ONS build");
    assert.equal((await f.shares.queue())[0].publication?.version.title, "ONS build");
  } finally {
    (await f.close());
  }
});

test("public provenance is one authorized parent only, survives restore, and disappears after revoke", async () => {
  const f = await sharingFixture();
  try {
    const parent = (await f.shares.create("alice", { ...f.input, mode: "public" }));
    (await f.shares.moderate(parent.id, 1, "approve", "checked"));
    const claims = new ShareClaims(f.shares);
    const received = await claims.claim("bob", () => {}, {
      shareId: parent.id,
      requestId: "receive-parent",
    });
    const restored = (await f.saves.restore(
      "bob",
      received.profile.id,
      received.revision.id,
      null,
      received.profile.generation,
    ));
    assert.equal(restored.originKind, "share");
    const child = (await f.shares.create("bob", {
      ...f.input,
      profileId: received.profile.id,
      generation: received.profile.generation,
      revisionId: restored.id,
      requestId: "republish",
      mode: "public",
    }));
    (await f.shares.moderate(child.id, 1, "approve", "checked"));
    assert.deepEqual((await f.shares.inspect(child.id)).publicSource, {
      id: parent.id,
      title: "Chapter one",
    });
    const raw = JSON.stringify((await f.shares.inspect(child.id)));
    for (const forbidden of [
      "alice",
      "bob",
      f.p.id,
      received.profile.id,
      received.revision.id,
      restored.id,
    ])
      assert.ok(!raw.includes(forbidden));
    (await f.shares.revoke("alice", parent.id));
    assert.equal((await f.shares.inspect(child.id)).publicSource, null);
    assert.equal(
      (
        await f.saves.read(
          "bob",
          received.profile.id,
          received.revision.id,
          "slot.dat",
        )
      ).toString(),
      f.content,
    );
  } finally {
    (await f.close());
  }
});

test("link-mode provenance is never disclosed in a public reshare", async () => {
  const f = await sharingFixture();
  try {
    const parent = (await f.shares.create("alice", f.input)),
      claims = new ShareClaims(f.shares);
    const received = await claims.claim("bob", () => {}, {
      shareId: parent.id,
      secret: parent.secret,
      requestId: "receive-link",
    });
    const child = (await f.shares.create("bob", {
      ...f.input,
      profileId: received.profile.id,
      revisionId: received.revision.id,
      generation: received.profile.generation,
      requestId: "republish-link",
      mode: "public",
    }));
    (await f.shares.moderate(child.id, 1, "approve", "checked"));
    const view = (await f.shares.inspect(child.id));
    assert.equal(view.publicSource, null);
    const json = JSON.stringify(view);
    assert.ok(!json.includes(parent.id));
    assert.ok(!json.includes(parent.secret!));
  } finally {
    (await f.close());
  }
});

test("legacy rows preserve absent publication metadata in the PostgreSQL schema", async () => {
  const f = await sharingFixture();
  try {
    const made = (await f.shares.create("alice", f.input));
    (await f.db.exec("DELETE FROM wg_share_publish_keys"));
    (await f.db.exec("UPDATE wg_save_shares SET published_meta=NULL,source_share=NULL"));
    const migrated = new ShareStore(f.db, f.saves, f.policy, f.ledger);
    const view = (await migrated.inspect(made.id, made.secret));
    assert.equal(view.metadataBasis, "legacy-current");
    assert.equal(view.version.title, "ONS build");
    assert.equal(view.publicSource, null);
    assert.equal(
      (await migrated.create("alice", { ...f.input, requestId: "new-legacy-request" }))
        .id,
      made.id,
    );
  } finally {
    (await f.close());
  }
});

test("two independent PostgreSQL writers converge on one snapshot/mode publication", async () => {
  const f = await sharingFixture(true);
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const code = `import {PgDatabase} from './src/database/postgres.ts';import {SaveStore} from './src/accounts/saves.server.ts';import {ShareStore} from './src/accounts/shares.server.ts';import {ShareLedger} from './src/accounts/share-ledger.server.ts';import {CatalogPolicy} from './src/accounts/catalog-policy.server.ts';const [root,input]=process.argv.slice(1);const db=new PgDatabase(process.env.WVN_TEST_DATABASE_URL,{schema:process.env.WVN_TEST_SCHEMA});const policy=new CatalogPolicy(async()=>[{id:'v4',title:'Story',url:'/4/',versions:[{id:'version-a',title:'ONS build',number:1,engine:'ONS',url:'/4/1/'}]}]);await policy.refresh(true);const shares=new ShareStore(db,new SaveStore(db,root,()=>1024**4),policy,new ShareLedger(root+'/revoked.jsonl'));await shares.replay();const result=await shares.create('alice',JSON.parse(input));console.log(JSON.stringify({id:result.id,duplicate:result.duplicate??false}));await db.close();`;
    const results = await Promise.all(
      ["writer-a", "writer-b"].map((requestId) =>
        run(process.execPath, [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          code,
          f.root,
          JSON.stringify({ ...f.input, requestId }),
        ], { env: { ...process.env, WVN_TEST_SCHEMA: testDatabaseSchema(f.db) } }),
      ),
    );
    const values = results.map((result) => JSON.parse(result.stdout));
    assert.equal(values[0].id, values[1].id);
    assert.equal(values.filter((r) => r.duplicate).length, 1);
    assert.equal(
      (await f.db.prepare("SELECT count(*) AS n FROM wg_save_shares").get())?.n,
      1,
    );
  } finally {
    (await f.close());
  }
});
