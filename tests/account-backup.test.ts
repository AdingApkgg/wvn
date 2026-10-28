import {fixtureDiskSpace} from "./helpers/disk-space.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, statSync } from "node:fs";
import { restoreDatabase } from "./helpers/backup.ts";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createAccountService } from "./helpers/accounts.ts";
import {
  createAccountBackup,
  prepareAccountRestore,
  applyAccountRestore,
} from "../src/accounts/backup.server.ts";
test("joint backup restores exact save bytes and replays newer account deletions", async (t) => {
  mkdirSync(join(process.cwd(), "state"), { recursive: true });
  const root = mkdtempSync(join(process.cwd(), "state", "wg-backup-"));
  fixtureDiskSpace(t,root);
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
  const target = await restoreDatabase();
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
    const profile = (await source.saves!.createProfile(survivor.id, "version-a"));
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
    const deletedProfile = await source.saves!.createProfile(deleted.id, "version-a");
    const deletedUpload = await source.saves!.reserve(deleted.id, deletedProfile.id, { expectedHead: null, generation: 1, captureId: "deleted-owner-save", files: [{ name: "slot.dat", bytes: 13, sha256 }] });
    await source.saves!.write(deleted.id, deletedUpload.id, deletedUpload.files[0].id, new Blob(["original-save"]).stream());
    await source.saves!.commit(deleted.id, deletedUpload.id);
    const backup = await createAccountBackup({
      database: source.config.database,
      databaseSchema: source.config.databaseSchema,
      blobRoot: config.blobRoot,
      ledger: config.deletionLedger,
      destination: join(root, "backup"),
    });
    const file = backup.files[0];
    assert.equal(statSync(join(root, "backup", "blobs", file.ownerHash)).mode & 0o777, 0o700);
    assert.equal(statSync(join(root, "backup", "blobs", file.ownerHash, file.hash + ".bin")).mode & 0o777, 0o600);
    source.deletions.record(deleted.id);
    await prepareAccountRestore({
      backup: join(root, "backup"),
      currentLedger: config.deletionLedger,
      destination: join(root, "restored"),
    });
    const applied = await applyAccountRestore({prepared:join(root,"restored"),database:target.database});
    restored = await createAccountService({ ...config, ...applied });
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
      (await restored.db.prepare('SELECT id FROM "user" WHERE id=$1').get(deleted.id)),
      undefined,
    );
    for (const table of ["wg_save_profiles", "wg_save_revisions", "wg_save_refs", "wg_save_uploads"]) {
      assert.equal((await restored.db.prepare(`SELECT count(*) n FROM ${table} WHERE owner=$1`).get(deleted.id))?.n, 0);
    }
    await assert.rejects(() =>
      prepareAccountRestore({
        backup: join(root, "backup"),
        currentLedger: config.deletionLedger,
        destination: join(root, "restored"),
      }),
    );
  } finally {
    (await source.close());
    await restored?.close();
    await target.close();
    rmSync(root, { recursive: true, force: true });
  }
});
