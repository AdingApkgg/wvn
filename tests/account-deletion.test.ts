import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { backupRoot, restoreDatabase } from "./helpers/backup.ts";
import { createAccountBackup, prepareAccountRestore, applyAccountRestore } from "../src/accounts/backup.server.ts";
import { join } from "node:path";
import { createAccountService } from "./helpers/accounts.ts";
test("independent deletion ledger is replayed after restoring an older database", async () => {
  const root = backupRoot("wg-delete-");
  const target = await restoreDatabase();
  const config = {
    origin: "https://accounts.wg.test",
    database: join(root, "current.sqlite"),
    deletionLedger: join(root, "deletions.jsonl"),
    secret: "synthetic-secret-that-is-at-least-48-characters-long",
  };
  let service = await createAccountService(config);
  try {
    const context = await service.auth.$context;
    const user = await context.internalAdapter.createUser(
      {
        name: "Synthetic",
        email: "synthetic@placeholder.invalid",
        emailVerified: false,
      },
      { method: "passkey" },
    );
    await createAccountBackup({database:service.config.database,databaseSchema:service.config.databaseSchema,blobRoot:join(root,"blobs"),ledger:config.deletionLedger,destination:join(root,"backup")});
    service.deletions.record(user.id);
    (await service.close());
    await prepareAccountRestore({backup:join(root,"backup"),currentLedger:config.deletionLedger,destination:join(root,"prepared")});
    const restored=await applyAccountRestore({prepared:join(root,"prepared"),database:target.database});
    service = await createAccountService({...config,...restored});
    assert.equal(
      (await service.db.prepare('SELECT id FROM "user" WHERE id=$1').get(user.id)),
      undefined,
    );
    assert.equal(
      (await service.db
        .prepare("SELECT user_id FROM wg_account WHERE user_id=$1")
        .get(user.id)),
      undefined,
    );
    assert.ok(service.deletions.entries.has(user.id));
  } finally {
    (await service.close());
    await target.close();
    rmSync(root, { recursive: true, force: true });
  }
});
