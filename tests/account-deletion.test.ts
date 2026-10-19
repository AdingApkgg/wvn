import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccountService } from "../src/accounts/service.server.ts";
test("independent deletion ledger is replayed after restoring an older database", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-delete-"));
  const config = {
    origin: "https://accounts.wg.test",
    database: join(root, "current.sqlite"),
    deletionLedger: join(root, "deletions.jsonl"),
    secret: "synthetic-secret-that-is-at-least-48-characters-long",
    signupInvite: "test-invite",
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
    service.db.prepare("VACUUM INTO ?").run(join(root, "old.sqlite"));
    service.deletions.record(user.id);
    service.close();
    service = await createAccountService({
      ...config,
      database: join(root, "old.sqlite"),
    });
    assert.equal(
      service.db.prepare('SELECT id FROM "user" WHERE id=?').get(user.id),
      undefined,
    );
    assert.equal(
      service.db
        .prepare("SELECT user_id FROM wg_account WHERE user_id=?")
        .get(user.id),
      undefined,
    );
    assert.ok(service.deletions.entries.has(user.id));
  } finally {
    service.close();
    rmSync(root, { recursive: true, force: true });
  }
});
