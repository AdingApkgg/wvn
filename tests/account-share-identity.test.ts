import { test } from "node:test";
import assert from "node:assert/strict";
import { sharingFixture } from "./helpers/sharing.ts";
import { ShareClaims } from "../src/accounts/share-claims.server.ts";
import { ShareStore } from "../src/accounts/shares.server.ts";

test("snapshot/mode dedup binds new request aliases without rate/quota or ref growth", async () => {
  const f = await sharingFixture();
  try {
    const first = f.shares.create("alice", f.input),
      original = f.shares.inspect(first.id, first.secret);
    for (let i = 0; i < 8; i++) {
      const result = f.shares.create("alice", {
        ...f.input,
        requestId: "duplicate-" + i,
        title: "Different draft",
      });
      assert.equal(result.id, first.id);
      assert.equal(result.duplicate, true);
      assert.equal(result.secret, undefined);
    }
    assert.equal(
      f.shares.inspect(first.id, first.secret).title,
      original.title,
    );
    assert.equal(
      f.shares.inspect(first.id, first.secret).expiresAt,
      original.expiresAt,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM wg_save_shares").get()?.n,
      1,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_save_refs WHERE revision LIKE 'share:%'",
        )
        .get()?.n,
      1,
    );
    assert.equal(
      f.db.prepare("SELECT max(n) AS n FROM wg_share_rates").get()?.n,
      1,
    );
    assert.throws(
      () =>
        f.shares.create("alice", {
          ...f.input,
          requestId: "duplicate-0",
          title: "changed alias",
        }),
      /CAPTURE_CHANGED/,
    );
    const publicShare = f.shares.create("alice", {
      ...f.input,
      mode: "public",
      requestId: "other-mode",
    });
    assert.notEqual(publicShare.id, first.id);
    f.shares.revoke("alice", first.id);
    const rebuilt = f.shares.create("alice", {
      ...f.input,
      requestId: "after-revoke",
    });
    assert.notEqual(rebuilt.id, first.id);
    assert.ok(rebuilt.secret);
    assert.throws(
      () =>
        f.shares.create("alice", {
          ...f.input,
          requestId: "duplicate-0",
          title: "Different draft",
        }),
      /SHARE_UNAVAILABLE/,
    );
    f.saves.deleteOwner("alice");
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) AS n FROM wg_share_publish_keys WHERE owner='alice'",
        )
        .get()?.n,
      0,
    );
  } finally {
    f.close();
  }
});

test("publication metadata stays frozen when live catalog titles change and hidden versions remain denied", async () => {
  const f = await sharingFixture();
  try {
    const made = f.shares.create("alice", f.input);
    f.shares.create("alice", {
      ...f.input,
      mode: "public",
      requestId: "pending-meta",
    });
    await f.rename("Renamed work", "Renamed build");
    const view = f.shares.inspect(made.id, made.secret);
    assert.equal(view.work.title, "Story");
    assert.equal(view.version.title, "ONS build");
    assert.equal(view.metadataBasis, "published");
    assert.equal(f.shares.listOwn("alice").items[0].version.title, "ONS build");
    await f.hide();
    assert.throws(
      () => f.shares.inspect(made.id, made.secret),
      /VERSION_UNAVAILABLE/,
    );
    assert.equal(f.shares.listOwn("alice").items[0].version.title, "ONS build");
    assert.equal(f.shares.queue()[0].publication?.version.title, "ONS build");
  } finally {
    f.close();
  }
});

test("public provenance is one authorized parent only, survives restore, and disappears after revoke", async () => {
  const f = await sharingFixture();
  try {
    const parent = f.shares.create("alice", { ...f.input, mode: "public" });
    f.shares.moderate(parent.id, 1, "approve", "checked");
    const claims = new ShareClaims(f.shares);
    const received = await claims.claim("bob", () => {}, {
      shareId: parent.id,
      requestId: "receive-parent",
    });
    const restored = f.saves.restore(
      "bob",
      received.profile.id,
      received.revision.id,
      null,
      received.profile.generation,
    );
    assert.equal(restored.originKind, "share");
    const child = f.shares.create("bob", {
      ...f.input,
      profileId: received.profile.id,
      generation: received.profile.generation,
      revisionId: restored.id,
      requestId: "republish",
      mode: "public",
    });
    f.shares.moderate(child.id, 1, "approve", "checked");
    assert.deepEqual(f.shares.inspect(child.id).publicSource, {
      id: parent.id,
      title: "Chapter one",
    });
    const raw = JSON.stringify(f.shares.inspect(child.id));
    for (const forbidden of [
      "alice",
      "bob",
      f.p.id,
      received.profile.id,
      received.revision.id,
      restored.id,
    ])
      assert.ok(!raw.includes(forbidden));
    f.shares.revoke("alice", parent.id);
    assert.equal(f.shares.inspect(child.id).publicSource, null);
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
    f.close();
  }
});

test("link-mode provenance is never disclosed in a public reshare", async () => {
  const f = await sharingFixture();
  try {
    const parent = f.shares.create("alice", f.input),
      claims = new ShareClaims(f.shares);
    const received = await claims.claim("bob", () => {}, {
      shareId: parent.id,
      secret: parent.secret,
      requestId: "receive-link",
    });
    const child = f.shares.create("bob", {
      ...f.input,
      profileId: received.profile.id,
      revisionId: received.revision.id,
      generation: received.profile.generation,
      requestId: "republish-link",
      mode: "public",
    });
    f.shares.moderate(child.id, 1, "approve", "checked");
    const view = f.shares.inspect(child.id);
    assert.equal(view.publicSource, null);
    const json = JSON.stringify(view);
    assert.ok(!json.includes(parent.id));
    assert.ok(!json.includes(parent.secret!));
  } finally {
    f.close();
  }
});

test("legacy rows do not pretend to contain publication metadata and additive migration preserves them", async () => {
  const f = await sharingFixture();
  try {
    const made = f.shares.create("alice", f.input);
    f.db.exec("DROP TABLE IF EXISTS wg_share_publish_keys");
    f.db.exec("ALTER TABLE wg_save_shares DROP COLUMN published_meta");
    f.db.exec("ALTER TABLE wg_save_shares DROP COLUMN source_share");
    const migrated = new ShareStore(f.db, f.saves, f.policy, f.ledger);
    const view = migrated.inspect(made.id, made.secret);
    assert.equal(view.metadataBasis, "legacy-current");
    assert.equal(view.version.title, "ONS build");
    assert.equal(view.publicSource, null);
    assert.equal(
      migrated.create("alice", { ...f.input, requestId: "new-legacy-request" })
        .id,
      made.id,
    );
  } finally {
    f.close();
  }
});

test("two independent SQLite writers converge on one snapshot/mode publication", async () => {
  const f = await sharingFixture(true);
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const code = `import {DatabaseSync} from 'node:sqlite';import {SaveStore} from './src/accounts/saves.server.ts';import {ShareStore} from './src/accounts/shares.server.ts';import {ShareLedger} from './src/accounts/share-ledger.server.ts';import {CatalogPolicy} from './src/accounts/catalog-policy.server.ts';const [root,input]=process.argv.slice(1);const db=new DatabaseSync(root+'/accounts.sqlite');db.exec('PRAGMA busy_timeout=5000');const policy=new CatalogPolicy(async()=>[{id:'v4',title:'Story',url:'/4/',versions:[{id:'version-a',title:'ONS build',number:1,engine:'ONS',url:'/4/1/'}]}]);await policy.refresh(true);const shares=new ShareStore(db,new SaveStore(db,root,()=>1024**4),policy,new ShareLedger(root+'/revoked.jsonl'));const result=shares.create('alice',JSON.parse(input));console.log(JSON.stringify({id:result.id,duplicate:result.duplicate??false}));db.close();`;
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
        ]),
      ),
    );
    const values = results.map((result) => JSON.parse(result.stdout));
    assert.equal(values[0].id, values[1].id);
    assert.equal(values.filter((r) => r.duplicate).length, 1);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM wg_save_shares").get()?.n,
      1,
    );
  } finally {
    f.close();
  }
});
