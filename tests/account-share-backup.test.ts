import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sharingFixture } from "./helpers/sharing.ts";
import { DeletionLedger } from "../src/accounts/deletion.server.ts";
import { ShareLedger } from "../src/accounts/share-ledger.server.ts";
import { ShareStore } from "../src/accounts/shares.server.ts";
import { SaveStore } from "../src/accounts/saves.server.ts";
import {
  createAccountBackup,
  prepareAccountRestore,
} from "../src/accounts/backup.server.ts";
test("joint backups include share-only references and replay a newer revocation after rollback", async () => {
  const f = await sharingFixture(true);
  let restored: DatabaseSync | undefined;
  try {
    const made = (await f.shares.create("alice", f.input));
    new DeletionLedger(join(f.root, "deletions.jsonl"));
    f.db
      .prepare("DELETE FROM wg_save_refs WHERE revision=?")
      .run(f.revision.id);
    const backup = createAccountBackup({
      database: join(f.root, "accounts.sqlite"),
      blobRoot: f.root,
      ledger: join(f.root, "deletions.jsonl"),
      shareLedger: join(f.root, "revoked.jsonl"),
      destination: join(f.root, "backup"),
    });
    assert.equal(backup.files.length, 1);
    f.shares.revoke("alice", made.id);
    const paths = prepareAccountRestore({
      backup: join(f.root, "backup"),
      currentLedger: join(f.root, "deletions.jsonl"),
      currentShareLedger: join(f.root, "revoked.jsonl"),
      destination: join(f.root, "restore"),
    });
    assert.ok(
      paths.shareLedger,
      "restored paths must include the combined current share deny ledger",
    );
    restored = new DatabaseSync(paths.database);
    const saves = new SaveStore(restored, paths.blobRoot, () => 1024 ** 4);
    const shares = new ShareStore(
      restored,
      saves,
      f.policy,
      new ShareLedger(paths.shareLedger),
    );
    assert.throws(
      () => shares.inspect(made.id, made.secret),
      /SHARE_UNAVAILABLE/,
    );
    assert.equal(
      restored
        .prepare("SELECT count(*) AS n FROM wg_save_refs WHERE revision=?")
        .get("share:" + made.id)?.n,
      0,
    );
  } finally {
    restored?.close();
    f.close();
  }
});

test("sharing-enabled backups refuse to omit the independent share deny ledger", async () => {
  const f = await sharingFixture(true);
  try {
    new DeletionLedger(join(f.root, "deleted.jsonl"));
    assert.throws(
      () =>
        createAccountBackup({
          database: join(f.root, "accounts.sqlite"),
          blobRoot: f.root,
          ledger: join(f.root, "deleted.jsonl"),
          destination: join(f.root, "incomplete"),
        }),
      /share revocation ledger/i,
    );
  } finally {
    f.close();
  }
});

test("backup never creates a missing source revocation ledger or accepts malformed records", async () => {
  const f = await sharingFixture(true);
  try {
    new DeletionLedger(join(f.root, "deleted.jsonl"));
    const missing = join(f.root, "missing.jsonl");
    const options = {
      database: join(f.root, "accounts.sqlite"),
      blobRoot: f.root,
      ledger: join(f.root, "deleted.jsonl"),
      shareLedger: missing,
      destination: join(f.root, "missing-backup"),
    };
    assert.throws(() => createAccountBackup(options), /ledger/i);
    assert.equal(existsSync(missing), false);
    writeFileSync(missing, '{"userId":3,"deletedAt":1}\n');
    assert.throws(
      () =>
        createAccountBackup({
          ...options,
          destination: join(f.root, "malformed-backup"),
        }),
      /record|ledger/i,
    );
  } finally {
    f.close();
  }
});
