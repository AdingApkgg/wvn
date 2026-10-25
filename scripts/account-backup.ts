import {
  createAccountBackup,
  prepareAccountRestore,
} from "../src/accounts/backup.server.ts";
function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
if (process.env.WG_BLOB_UPSTREAM) throw new Error("Split storage requires scripts/backup-split-web.py to join metadata and Windows blobs; local-only backup is refused");
if (process.argv[2] === "restore") {
  console.log(
    JSON.stringify(
      prepareAccountRestore({
        backup: env("WG_ACCOUNT_BACKUP_FROM"),
        currentLedger: env("WG_ACCOUNT_DELETION_LEDGER"),
        currentShareLedger: process.env.WG_ACCOUNT_SHARE_LEDGER,
        destination: env("WG_ACCOUNT_RESTORE_DIR"),
      }),
      null,
      2,
    ),
  );
} else {
  const manifest = createAccountBackup({
    database: env("WG_ACCOUNT_DATABASE"),
    blobRoot: env("WG_ACCOUNT_BLOBS"),
    ledger: env("WG_ACCOUNT_DELETION_LEDGER"),
    shareLedger: process.env.WG_ACCOUNT_SHARE_LEDGER,
    destination: env("WG_ACCOUNT_BACKUP_DIR"),
  });
  console.log(
    JSON.stringify(
      {
        status: "complete",
        createdAt: manifest.createdAt,
        files: manifest.files.length,
      },
      null,
      2,
    ),
  );
}
