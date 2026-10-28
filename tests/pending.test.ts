import { testStore } from "./helpers/catalog.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/server/store.ts";
(test("verified work creation, pending confirmation and version metadata persist", async () => {
  const s = await testStore();
  try {
    (await s.seed({
      snapshotAt: "2026-10-19T00:00:00Z",
      works: [],
      versions: [],
      pending: [
        {
          id: "pending-a",
          title: "Old name",
          legacyPath: "/old/",
          meta: "ARTEMIS WASM",
          reason: "identity unresolved",
        },
      ],
    }));
    assert.equal((await s.pending()).length, 1);
    (await assert.rejects(async () =>
      (await s.createWork({
        id: "v4",
        title: "test",
        originalTitle: "test",
        aliases: [],
        evidence: "https://evil.example",
      })),
    ));
    (await s.createWork({
      id: "v4",
      title: "CLANNAD",
      originalTitle: "CLANNAD",
      aliases: [],
      evidence: "https://vndb.org/v4",
    }));
    const v = (await s.bindPending("pending-a", "v4"));
    assert.equal(v.number, 1);
    assert.equal((await s.pending()).length, 0);
    (await s.editVersion(v.id, v.revision, {
      language: "简体中文",
      notes: "修复版说明",
      sortOrder: 10,
    }));
    const edited = (await s.raw(v.id))!;
    assert.equal(edited.language, "简体中文");
    assert.equal(edited.sortOrder, 10);
    assert.equal((await s.get("v4"))!.versions[0].notes, "修复版说明");
    (await assert.rejects(async () => (await s.bindPending("pending-a", "v4"))));
  } finally {
    (await s.close());
  }
}));
