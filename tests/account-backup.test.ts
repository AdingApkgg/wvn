import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createAccountService } from "../src/accounts/service.server.ts";
import {
  createAccountBackup,
  prepareAccountRestore,
} from "../src/accounts/backup.server.ts";
test("joint backup restores exact save bytes and replays newer account deletions", async () => {
  mkdirSync(join(process.cwd(), "state"), { recursive: true });
  const root = mkdtempSync(join(process.cwd(), "state", "wg-backup-"));
  const catalog = [
    {
      id: "v4",
      title: "Story",
      url: "/4/",
      versions: [
        {
          id: "version-a",
          number: 1,
          title: "Version",
          engine: "ONS",
          url: "/4/1/",
        },
      ],
    },
  ];
  const config = {
    origin: "https://accounts.wg.test",
    database: join(root, "current.sqlite"),
    blobRoot: join(root, "blobs"),
    deletionLedger: join(root, "deleted.jsonl"),
    secret: "synthetic-secret-that-is-at-least-48-characters-long",
    catalog,
  };
  const source = await createAccountService(config);
  let restored: Awaited<ReturnType<typeof createAccountService>> | undefined;
  try {
    const context = await source.auth.$context;
    const survivor = await context.internalAdapter.createUser(
      {
        name: "Survivor",
        email: "survivor@placeholder.invalid",
        emailVerified: false,
      },
      { method: "passkey" },
    );
    const deleted = await context.internalAdapter.createUser(
      {
        name: "Deleted",
        email: "deleted@placeholder.invalid",
        emailVerified: false,
      },
      { method: "passkey" },
    );
    const profile = source.saves!.createProfile(survivor.id, "version-a");
    const sha256 = createHash("sha256").update("original-save").digest("hex");
    const upload = (await source.saves!.reserve(survivor.id, profile.id, {
      expectedHead: null,
      generation: 1,
      captureId: "backup-test",
      files: [{ name: "slot.dat", bytes: 13, sha256 }],
    }));
    await source.saves!.write(
      survivor.id,
      upload.id,
      upload.files[0].id,
      new Blob(["original-save"]).stream(),
    );
    const revision = (await source.saves!.commit(survivor.id, upload.id)).revision;
    createAccountBackup({
      database: config.database,
      blobRoot: config.blobRoot,
      ledger: config.deletionLedger,
      destination: join(root, "backup"),
    });
    source.deletions.record(deleted.id);
    const paths = prepareAccountRestore({
      backup: join(root, "backup"),
      currentLedger: config.deletionLedger,
      destination: join(root, "restored"),
    });
    restored = await createAccountService({ ...config, ...paths });
    assert.equal(
      (
        await restored.saves!.read(
          survivor.id,
          profile.id,
          revision.id,
          "slot.dat",
        )
      ).toString(),
      "original-save",
    );
    assert.equal(
      restored.db.prepare('SELECT id FROM "user" WHERE id=?').get(deleted.id),
      undefined,
    );
    assert.throws(() =>
      prepareAccountRestore({
        backup: join(root, "backup"),
        currentLedger: config.deletionLedger,
        destination: join(root, "restored"),
      }),
    );
  } finally {
    source.close();
    restored?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
