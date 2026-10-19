import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SaveStore } from "../src/accounts/saves.server.ts";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wg-cloud-")),
    db = new DatabaseSync(":memory:");
  return {
    root,
    db,
    store: new SaveStore(db, root, () => 1024 ** 4),
    close() {
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const files = [{ name: "save1.dat", bytes: 5, sha256: hash("hello") }];
test("private snapshot commits are complete, immutable, idempotent and owner scoped", async () => {
  const f = fixture();
  try {
    const profile = f.store.createProfile("alice", "version-a");
    const upload = f.store.reserve("alice", profile.id, {
      expectedHead: null,
      generation: 1,
      captureId: "capture-a",
      files,
    });
    assert.throws(() => f.store.commit("alice", upload.id));
    await f.store.write(
      "alice",
      upload.id,
      upload.files[0].id,
      new Blob(["hello"]).stream(),
    );
    const result = f.store.commit("alice", upload.id);
    assert.equal(result.conflict, false);
    assert.equal(
      f.store.commit("alice", upload.id).revision.id,
      result.revision.id,
    );
    assert.equal(
      (
        await f.store.read("alice", profile.id, result.revision.id, "save1.dat")
      ).toString(),
      "hello",
    );
    assert.throws(() => f.store.history("bob", profile.id));
    await assert.rejects(() =>
      f.store.read("bob", profile.id, result.revision.id, "save1.dat"),
    );
  } finally {
    f.close();
  }
});
test("parallel saves preserve a conflict and deleted generation cannot resurrect it", async () => {
  const f = fixture();
  try {
    const p = f.store.createProfile("alice", "version-a");
    const one = f.store.reserve("alice", p.id, {
      expectedHead: null,
      generation: 1,
      captureId: "first",
      files,
    });
    const two = f.store.reserve("alice", p.id, {
      expectedHead: null,
      generation: 1,
      captureId: "second",
      files,
    });
    await f.store.write(
      "alice",
      one.id,
      one.files[0].id,
      new Blob(["hello"]).stream(),
    );
    await f.store.write(
      "alice",
      two.id,
      two.files[0].id,
      new Blob(["hello"]).stream(),
    );
    const head = f.store.commit("alice", one.id);
    assert.equal(f.store.commit("alice", two.id).conflict, true);
    f.store.remove("alice", p.id, head.revision.id, 1);
    assert.throws(() =>
      f.store.reserve("alice", p.id, {
        expectedHead: head.revision.id,
        generation: 1,
        captureId: "old",
        files,
      }),
    );
  } finally {
    f.close();
  }
});
test("hash mismatch, unsafe paths, oversized snapshots and low disk refuse writes", async () => {
  const f = fixture();
  try {
    const p = f.store.createProfile("alice", "version-a");
    assert.throws(() =>
      f.store.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "unsafe",
        files: [{ ...files[0], name: "../secret" }],
      }),
    );
    assert.throws(() =>
      f.store.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "large",
        files: [{ ...files[0], bytes: 32 * 1024 ** 2 + 1 }],
      }),
    );
    const upload = f.store.reserve("alice", p.id, {
      expectedHead: null,
      generation: 1,
      captureId: "bad",
      files,
    });
    await assert.rejects(() =>
      f.store.write(
        "alice",
        upload.id,
        upload.files[0].id,
        new Blob(["wrong"]).stream(),
      ),
    );
    assert.throws(() => f.store.commit("alice", upload.id));
    const low = new SaveStore(f.db, f.root, () => 60 * 1024 ** 3);
    assert.throws(() =>
      low.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "low",
        files,
      }),
    );
  } finally {
    f.close();
  }
});
