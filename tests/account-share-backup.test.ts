import {fixtureDiskSpace} from "./helpers/disk-space.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PgDatabase } from "../src/database/postgres.ts";
import { testDatabaseSchema } from "./helpers/accounts.ts";
import { restoreDatabase } from "./helpers/backup.ts";
import { sharingFixture } from "./helpers/sharing.ts";
import { DeletionLedger } from "../src/accounts/deletion.server.ts";
import { ShareLedger } from "../src/accounts/share-ledger.server.ts";
import { ShareStore } from "../src/accounts/shares.server.ts";
import { SaveStore } from "../src/accounts/saves.server.ts";
import {
  createAccountBackup,
  prepareAccountRestore,
  applyAccountRestore,
} from "../src/accounts/backup.server.ts";
test("joint backups include share-only references and replay a newer revocation after rollback", async (t) => {
  const f = await sharingFixture(true);
  fixtureDiskSpace(t,f.root);
  let restored: PgDatabase | undefined;
  const target = await restoreDatabase();
  try {
    const made = (await f.shares.create("alice", f.input));
    new DeletionLedger(join(f.root, "deletions.jsonl"));
    (await f.db
      .prepare("DELETE FROM wg_save_refs WHERE revision=$1")
      .run(f.revision.id));
    await assert.rejects(() => createAccountBackup({ database: process.env.WVN_TEST_DATABASE_URL!, databaseSchema: testDatabaseSchema(f.db), blobRoot: f.root, ledger: join(f.root, "deletions.jsonl"), destination: join(f.root, "missing-ledger-with-share-rows") }), /share revocation ledger/i);
    const backup = await createAccountBackup({
      database: process.env.WVN_TEST_DATABASE_URL!,
      databaseSchema: testDatabaseSchema(f.db),
      blobRoot: f.root,
      ledger: join(f.root, "deletions.jsonl"),
      shareLedger: join(f.root, "revoked.jsonl"),
      destination: join(f.root, "backup"),
    });
    assert.equal(backup.files.length, 1);
    (await f.shares.revoke("alice", made.id));
    const paths = await prepareAccountRestore({
      backup: join(f.root, "backup"),
      currentLedger: join(f.root, "deletions.jsonl"),
      currentShareLedger: join(f.root, "revoked.jsonl"),
      destination: join(f.root, "restore"),
    });
    assert.ok(
      paths.shareLedger,
      "restored paths must include the combined current share deny ledger",
    );
    const applied = await applyAccountRestore({prepared:join(f.root,"restore"),database:target.database});
    restored = new PgDatabase(target.database, {schema:applied.databaseSchema});
    const saves = new SaveStore(restored, paths.blobRoot, () => 1024 ** 4);
    const shares = new ShareStore(
      restored,
      saves,
      f.policy,
      new ShareLedger(paths.shareLedger),
    );
    await shares.replay();
    (await assert.rejects(
      async () => (await shares.inspect(made.id, made.secret)),
      /SHARE_UNAVAILABLE/,
    ));
    assert.equal(
      (await restored
        .prepare("SELECT count(*) AS n FROM wg_save_refs WHERE revision=$1")
        .get("share:" + made.id))?.n,
      0,
    );
  } finally {
    await restored?.close();
    await target.close();
    (await f.close());
  }
});

test("sharing-enabled backups refuse to omit the independent share deny ledger", async (t) => {
  const f = await sharingFixture(true);
  fixtureDiskSpace(t,f.root);
  try {
    new DeletionLedger(join(f.root, "deleted.jsonl"));
    await assert.rejects(
      () =>
        createAccountBackup({
          sharingEnabled: true,
          database: process.env.WVN_TEST_DATABASE_URL!,
      databaseSchema: testDatabaseSchema(f.db),
          blobRoot: f.root,
          ledger: join(f.root, "deleted.jsonl"),
          destination: join(f.root, "incomplete"),
        }),
      /share revocation ledger/i,
    );
  } finally {
    (await f.close());
  }
});

test("backup never creates a missing source revocation ledger or accepts malformed records", async (t) => {
  const f = await sharingFixture(true);
  fixtureDiskSpace(t,f.root);
  try {
    new DeletionLedger(join(f.root, "deleted.jsonl"));
    const missing = join(f.root, "missing.jsonl");
    const options = {
      database: process.env.WVN_TEST_DATABASE_URL!,
      databaseSchema: testDatabaseSchema(f.db),
      blobRoot: f.root,
      ledger: join(f.root, "deleted.jsonl"),
      shareLedger: missing,
      destination: join(f.root, "missing-backup"),
    };
    await assert.rejects(() => createAccountBackup(options), /ledger/i);
    assert.equal(existsSync(missing), false);
    writeFileSync(missing, '{"userId":3,"deletedAt":1}\n');
    await assert.rejects(
      () =>
        createAccountBackup({
          ...options,
          destination: join(f.root, "malformed-backup"),
        }),
      /record|ledger/i,
    );
  } finally {
    (await f.close());
  }
});
