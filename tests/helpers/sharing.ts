import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SaveStore } from "../../src/accounts/saves.server.ts";
const modules = await Promise.all([
  import("../../src/accounts/shares.server.ts").catch(() => null),
  import("../../src/accounts/catalog-policy.server.ts").catch(() => null),
  import("../../src/accounts/share-ledger.server.ts").catch(() => null),
]);
export async function sharingFixture(persistent = false) {
  assert.ok(
    modules[0]?.ShareStore &&
      modules[1]?.CatalogPolicy &&
      modules[2]?.ShareLedger,
    "ShareStore/catalog policy/ledger must exist",
  );
  mkdirSync(join(process.cwd(), "state"), { recursive: true });
  const root = mkdtempSync(
      join(persistent ? join(process.cwd(), "state") : tmpdir(), "wg-shares-"),
    ),
    db = new DatabaseSync(
      persistent ? join(root, "accounts.sqlite") : ":memory:",
    );
  db.exec(
    "CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT); INSERT INTO user VALUES ('alice','Alice'),('bob','Bob');",
  );
  const saves = new SaveStore(db, root, () => 1024 ** 4);
  let catalog = [
    {
      id: "v4",
      title: "Story",
      url: "/4/",
      versions: [
        {
          id: "version-a",
          title: "ONS build",
          number: 1,
          engine: "ONS",
          url: "/4/1/",
        },
      ],
    },
  ];
  let unavailable = false;
  const policy = new modules[1].CatalogPolicy(async () => {
    if (unavailable) throw new Error("catalog offline");
    return catalog;
  });
  await policy.refresh(true);
  const ledger = new modules[2].ShareLedger(join(root, "revoked.jsonl"));
  const shares = new modules[0].ShareStore(db, saves, policy, ledger);
  const p = saves.createProfile("alice", "version-a");
  const content = "first chapter",
    files = [
      {
        name: "slot.dat",
        bytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    ];
  const u = saves.reserve("alice", p.id, {
    expectedHead: null,
    generation: 1,
    captureId: "original",
    files,
  });
  await saves.write("alice", u.id, u.files[0].id, new Blob([content]).stream());
  const revision = saves.commit("alice", u.id).revision;
  const input: import("../../src/accounts/share-types.ts").ShareInput = {
    profileId: p.id,
    generation: 1,
    revisionId: revision.id,
    mode: "link",
    title: "Chapter one",
    description: "Spoiler notes",
    progress: "chapter",
    spoiler: true,
    days: 30,
    requestId: "publish-a",
  };
  return {
    root,
    db,
    saves,
    policy,
    shares,
    ledger,
    p,
    revision,
    input,
    content,
    rename: async (workTitle: string, versionTitle: string) => {
      catalog[0].title = workTitle;
      catalog[0].versions[0].title = versionTitle;
      await policy.refresh(true);
    },
    offline: async () => {
      unavailable = true;
      await policy.refresh(true).catch(() => {});
    },
    hide: async () => {
      catalog = [];
      await policy.refresh(true);
    },
    close() {
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
