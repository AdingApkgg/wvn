import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/server/store.ts";
test("verified work creation, pending confirmation and version metadata persist", () => {
  const s = new Store(":memory:");
  try {
    s.seed({
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
    });
    assert.equal(s.pending().length, 1);
    assert.throws(() =>
      s.createWork({
        id: "v4",
        title: "test",
        originalTitle: "test",
        aliases: [],
        evidence: "https://evil.example",
      }),
    );
    s.createWork({
      id: "v4",
      title: "CLANNAD",
      originalTitle: "CLANNAD",
      aliases: [],
      evidence: "https://vndb.org/v4",
    });
    const v = s.bindPending("pending-a", "v4");
    assert.equal(v.number, 1);
    assert.equal(s.pending().length, 0);
    s.editVersion(v.id, v.revision, {
      language: "简体中文",
      notes: "修复版说明",
      sortOrder: 10,
    });
    const edited = s.raw(v.id)!;
    assert.equal(edited.language, "简体中文");
    assert.equal(edited.sortOrder, 10);
    assert.equal(s.get("v4")!.versions[0].notes, "修复版说明");
    assert.throws(() => s.bindPending("pending-a", "v4"));
  } finally {
    s.close();
  }
});
