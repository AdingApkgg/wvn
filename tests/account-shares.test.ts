import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SaveStore } from "../src/accounts/saves.server.ts";
const modules = await Promise.all([import("../src/accounts/shares.server.ts").catch(() => null), import("../src/accounts/catalog-policy.server.ts").catch(() => null), import("../src/accounts/share-ledger.server.ts").catch(() => null)]);
export async function sharingFixture() {
  assert.ok(modules[0]?.ShareStore && modules[1]?.CatalogPolicy && modules[2]?.ShareLedger, "ShareStore/catalog policy/ledger must exist");
  const root = mkdtempSync(join(tmpdir(), "wg-shares-")), db = new DatabaseSync(":memory:");
  db.exec('CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT); INSERT INTO user VALUES (\'alice\',\'Alice\'),(\'bob\',\'Bob\');');
  const saves = new SaveStore(db, root, () => 1024 ** 4);
  let catalog = [{ id: "v4", title: "Story", url: "/4/", versions: [{ id: "version-a", title: "ONS build", number: 1, engine: "ONS", url: "/4/1/" }] }];
  const policy = new modules[1].CatalogPolicy(async () => catalog);
  await policy.refresh(true);
  const ledger = new modules[2].ShareLedger(join(root, "revoked.jsonl"));
  const shares = new modules[0].ShareStore(db, saves, policy, ledger);
  const p = saves.createProfile("alice", "version-a");
  const content = "first chapter", files = [{ name: "slot.dat", bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") }];
  const u = saves.reserve("alice", p.id, { expectedHead: null, generation: 1, captureId: "original", files });
  await saves.write("alice", u.id, u.files[0].id, new Blob([content]).stream());
  const revision = saves.commit("alice", u.id).revision;
  const input = { profileId: p.id, generation: 1, revisionId: revision.id, mode: "link", title: "Chapter one", description: "Spoiler notes", progress: "chapter", spoiler: true, days: 30, requestId: "publish-a" };
  return { root, db, saves, policy, shares, ledger, p, revision, input, content, hide: async () => { catalog = []; await policy.refresh(true); }, close() { db.close(); rmSync(root, { recursive: true, force: true }); } };
}
test("link shares freeze one owned snapshot and reveal neither private IDs nor secrets", async () => {
 const f = await sharingFixture(); try {
  const made = f.shares.create("alice", f.input);
  assert.ok(made.secret);
  assert.throws(() => f.shares.inspect(made.id, "wrong"), /SHARE_UNAVAILABLE/);
  assert.throws(() => f.shares.inspect(made.id), /SHARE_UNAVAILABLE/);
  const view = f.shares.inspect(made.id, made.secret);
  assert.equal(view.title, "Chapter one");
  assert.equal(view.version.id, "version-a");
  assert.equal(f.shares.listPublic("v4").items.length, 0);
  const json = JSON.stringify(view);
  for (const secret of ["alice", f.p.id, f.revision.id, made.secret, f.root]) assert.ok(!json.includes(secret));
  assert.equal(f.shares.create("alice", f.input).id, made.id);
  assert.equal(f.shares.create("alice", f.input).secret, undefined);
  assert.throws(() => f.shares.create("bob", { ...f.input, requestId: "steal" }), /NOT_FOUND/);
 } finally { f.close(); }
});
test("public moderation and metadata CAS retain approved text until the new edit is approved", async () => {
 const f = await sharingFixture(); try {
  const made = f.shares.create("alice", { ...f.input, mode: "public" });
  assert.throws(() => f.shares.inspect(made.id), /SHARE_UNAVAILABLE/);
  f.shares.moderate(made.id, 1, "approve", "checked");
  assert.equal(f.shares.listPublic("v4").items[0].title, "Chapter one");
  f.shares.edit("alice", made.id, 1, { title: "New title", description: "Edited", progress: "complete", spoiler: true });
  assert.equal(f.shares.inspect(made.id).title, "Chapter one");
  assert.throws(() => f.shares.moderate(made.id, 1, "approve", "late"), /CONTENT_CONFLICT/);
  f.shares.moderate(made.id, 2, "approve", "checked");
  assert.equal(f.shares.inspect(made.id).title, "New title");
  f.shares.revoke("alice", made.id);
  assert.throws(() => f.shares.inspect(made.id), /SHARE_UNAVAILABLE/);
  assert.equal(f.shares.listPublic("v4").items.length, 0);
  assert.throws(() => f.shares.moderate(made.id, 2, "approve", "revive"), /SHARE_UNAVAILABLE/);
 } finally { f.close(); }
});
test("expiration, live catalog changes and the durable revocation ledger fail closed", async () => {
 const f = await sharingFixture(); try {
  const made = f.shares.create("alice", f.input);
  f.db.prepare("UPDATE wg_save_shares SET expires=0 WHERE id=?").run(made.id);
  assert.throws(() => f.shares.inspect(made.id, made.secret), /SHARE_UNAVAILABLE/);
  const next = f.shares.create("alice", { ...f.input, requestId: "next" });
  f.ledger.record(next.id);
  assert.throws(() => f.shares.inspect(next.id, next.secret), /SHARE_UNAVAILABLE/);
  await f.hide();
  assert.throws(() => f.shares.create("alice", { ...f.input, requestId: "hidden" }), /VERSION_UNAVAILABLE/);
 } finally { f.close(); }
});
