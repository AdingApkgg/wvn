import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase } from "./helpers/accounts.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SaveStore } from "../src/accounts/saves.server.ts";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wg-cloud-")),
    db = await testDatabase();
  return {
    root,
    db,
    store: new SaveStore(db, root, () => 1024 ** 4),
    async close() {
      (await db.close());
      rmSync(root, { recursive: true, force: true });
    },
  };
}
const files = [{ name: "save1.dat", bytes: 5, sha256: hash("hello") }];
test("private snapshot commits are complete, immutable, idempotent and owner scoped", async () => {
  const f = (await fixture());
  try {
    const profile = (await f.store.createProfile("alice", "version-a"));
    const upload = (await f.store.reserve("alice", profile.id, {
      expectedHead: null,
      generation: 1,
      captureId: "capture-a",
      files,
    }));
    await assert.rejects(async () => (await f.store.commit("alice", upload.id)));
    await f.store.write(
      "alice",
      upload.id,
      upload.files[0].id,
      new Blob(["hello"]).stream(),
    );
    const result = (await f.store.commit("alice", upload.id));
    assert.equal(result.conflict, false);
    assert.equal(
      (await f.store.commit("alice", upload.id)).revision.id,
      result.revision.id,
    );
    assert.equal(
      (
        await f.store.read("alice", profile.id, result.revision.id, "save1.dat")
      ).toString(),
      "hello",
    );
    (await assert.rejects(async () => (await f.store.history("bob", profile.id))));
    await assert.rejects(async () =>
      (await f.store.read("bob", profile.id, result.revision.id, "save1.dat")),
    );
  } finally {
    (await f.close());
  }
});
test("parallel saves preserve a conflict and deleted generation cannot resurrect it", async () => {
  const f = (await fixture());
  try {
    const p = (await f.store.createProfile("alice", "version-a"));
    const one = (await f.store.reserve("alice", p.id, {
      expectedHead: null,
      generation: 1,
      captureId: "first",
      files,
    }));
    const two = (await f.store.reserve("alice", p.id, {
      expectedHead: null,
      generation: 1,
      captureId: "second",
      files,
    }));
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
    const head = (await f.store.commit("alice", one.id));
    assert.equal((await f.store.commit("alice", two.id)).conflict, true);
    (await f.store.remove("alice", p.id, head.revision.id, 1));
    await assert.rejects(async () =>
      (await f.store.reserve("alice", p.id, {
        expectedHead: head.revision.id,
        generation: 1,
        captureId: "old",
        files,
      })),
    );
  } finally {
    (await f.close());
  }
});
test("hash mismatch, unsafe paths, oversized snapshots and low disk refuse writes", async () => {
  const f = (await fixture());
  try {
    const p = (await f.store.createProfile("alice", "version-a"));
    await assert.rejects(async () =>
      (await f.store.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "unsafe",
        files: [{ ...files[0], name: "../secret" }],
      })),
    );
    for (const name of ["\ud800", "save:stream", "save?bad"])
      await assert.rejects(
        async () =>
          (await f.store.reserve("alice", p.id, {
            expectedHead: null,
            generation: 1,
            captureId: "invalid-name",
            files: [{ ...files[0], name }],
          })),
        /MANIFEST_INVALID/,
      );
    await assert.rejects(async () =>
      (await f.store.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "large",
        files: [{ ...files[0], bytes: 32 * 1024 ** 2 + 1 }],
      })),
    );
    const upload = (await f.store.reserve("alice", p.id, {
      expectedHead: null,
      generation: 1,
      captureId: "bad",
      files,
    }));
    await assert.rejects(async () =>
      (await f.store.write(
        "alice",
        upload.id,
        upload.files[0].id,
        new Blob(["wrong"]).stream(),
      )),
    );
    await assert.rejects(async () => (await f.store.commit("alice", upload.id)));
    const low = new SaveStore(f.db, f.root, () => 60 * 1024 ** 3);
    await assert.rejects(async () =>
      (await low.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "low",
        files,
      })),
    );
  } finally {
    (await f.close());
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test("interleaved retries cannot replace bytes of an existing historical blob", async () => {
  const f = (await fixture());
  const gate = deferred(),
    release = deferred(),
    secondRead = deferred();
  let secondController!: ReadableStreamDefaultController<Uint8Array>;
  let second: Promise<void> | undefined;
  try {
    const p = (await f.store.createProfile("alice", "version-a"));
    const reserve = async (captureId: string) =>
      (await f.store.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId,
        files,
      }));
    const original = (await reserve("history"));
    await f.store.write(
      "alice",
      original.id,
      original.files[0].id,
      new Blob(["hello"]).stream(),
    );
    const history = (await f.store.commit("alice", original.id));
    const retry = (await reserve("retry"));
    let calls = 0;
    const first = f.store.write(
      "alice",
      retry.id,
      retry.files[0].id,
      new Blob(["hello"]).stream(),
      async (fn) => {
        if (++calls === 2) {
          gate.resolve();
          await release.promise;
        }
        return fn();
      },
    );
    await gate.promise;
    second = f.store.write(
      "alice",
      retry.id,
      retry.files[0].id,
      new ReadableStream({
        start(c) {
          secondController = c;
          c.enqueue(new TextEncoder().encode("he"));
        },
        pull() {
          secondRead.resolve();
        },
      }),
    );
    const rejected = assert.rejects(second, /FILE_HASH_MISMATCH|interrupted/);
    await secondRead.promise;
    await new Promise<void>((r) => setImmediate(r));
    release.resolve();
    await first;
    assert.equal(
      (
        await f.store.read("alice", p.id, history.revision.id, "save1.dat")
      ).toString(),
      "hello",
    );
    secondController.close();
    await rejected;
    assert.equal(
      (
        await f.store.read("alice", p.id, history.revision.id, "save1.dat")
      ).toString(),
      "hello",
    );
  } finally {
    release.resolve();
    if (second) {
      try {
        secondController.error(new Error("interrupted"));
      } catch {}
      await second.catch(() => {});
    }
    (await f.close());
  }
});
test("expired captures renew after GC with quota checks and preserve the original base", async () => {
  const f = (await fixture());
  try {
    const p = (await f.store.createProfile("alice", "version-a"));
    const input = {
      expectedHead: null,
      generation: 1,
      captureId: "offline",
      files,
    };
    const offline = (await f.store.reserve("alice", p.id, input));
    (await f.db
      .prepare("UPDATE wg_save_uploads SET expires=0 WHERE id=$1")
      .run(offline.id));
    (await f.store.gc());
    const newer = (await f.store.reserve("alice", p.id, {
      ...input,
      captureId: "newer",
    }));
    await f.store.write(
      "alice",
      newer.id,
      newer.files[0].id,
      new Blob(["hello"]).stream(),
    );
    (await f.db
      .prepare("UPDATE wg_save_uploads SET total=$1 WHERE id=$2")
      .run(512 * 1024 ** 2, newer.id));
    await assert.rejects(async () => (await f.store.reserve("alice", p.id, input)), /ACCOUNT_QUOTA/);
    const head = (await f.store.commit("alice", newer.id));
    const resumed = (await f.store.reserve("alice", p.id, input));
    assert.equal(resumed.files.length, 1);
    await f.store.write(
      "alice",
      resumed.id,
      resumed.files[0].id,
      new Blob(["hello"]).stream(),
    );
    const branch = (await f.store.commit("alice", resumed.id));
    assert.equal(branch.conflict, true);
    assert.equal(branch.revision.parent, null);
    assert.equal((await f.store.profiles("alice"))[0].head, head.revision.id);
    (await f.store.remove("alice", p.id, head.revision.id, 1));
    await assert.rejects(
      async () => (await f.store.reserve("alice", p.id, input)),
      /PROFILE_DELETED/,
    );
  } finally {
    (await f.close());
  }
});
test("two devices finding no profile share a canonical version and preserve both first captures", async () => {
  const f = (await fixture());
  try {
    assert.equal((await f.store.profiles("alice", "version-a")).length, 0);
    assert.equal((await f.store.profiles("alice", "version-a")).length, 0);
    const one = (await f.store.createProfile("alice", "version-a"));
    const two = (await f.store.createProfile("alice", "version-a"));
    assert.equal(one.id, two.id);
    const a = (await f.store.reserve("alice", one.id, {
      expectedHead: null,
      generation: 1,
      captureId: "device-a",
      files,
    }));
    const b = (await f.store.reserve("alice", two.id, {
      expectedHead: null,
      generation: 1,
      captureId: "device-b",
      files,
    }));
    await f.store.write(
      "alice",
      a.id,
      a.files[0].id,
      new Blob(["hello"]).stream(),
    );
    await f.store.write(
      "alice",
      b.id,
      b.files[0].id,
      new Blob(["hello"]).stream(),
    );
    assert.equal((await f.store.commit("alice", a.id)).conflict, false);
    assert.equal((await f.store.commit("alice", b.id)).conflict, true);
    assert.equal((await f.store.history("alice", one.id)).length, 2);
    assert.notEqual((await f.store.createProfile("bob", "version-a")).id, one.id);
  } finally {
    (await f.close());
  }
});

test("stable history pages and account exports retain records beyond 200 including an old head", async () => {
  const f = (await fixture());
  try {
    const p = (await f.store.createProfile("alice", "version-a"));
    let head = "";
    for (let n = 0; n < 201; n++) {
      const u = (await f.store.reserve("alice", p.id, {
        expectedHead: null,
        generation: 1,
        captureId: "history-" + n,
        files,
      }));
      if (!n)
        await f.store.write(
          "alice",
          u.id,
          u.files[0].id,
          new Blob(["hello"]).stream(),
        );
      const r = (await f.store.commit("alice", u.id));
      if (!n) head = r.revision.id;
    }
    const first = (await f.store.historyPage("alice", p.id));
    assert.equal(first.items.length, 200);
    assert.equal(first.current?.id, head);
    assert.ok(first.next);
    const last = (await f.store.historyPage("alice", p.id, first.next!));
    assert.equal(last.items.length, 1);
    assert.equal(last.next, null);
    assert.equal(
      new Set([...first.items, ...last.items].map((r) => r.id)).size,
      201,
    );
    assert.equal((await f.store.allHistory("alice", p.id)).length, 201);
    (await assert.rejects(async () => (await f.store.historyPage("bob", p.id, first.next!))));
  } finally {
    (await f.close());
  }
});

test('asynchronous storage checks preserve one reservation and one revision for simultaneous retries', async () => {
  const f = (await fixture());
  try {
    const p = (await f.store.createProfile('alice', 'version-a'));
    const input = { expectedHead: null, generation: 1, captureId: 'same-network-retry', files };
    const [one, two] = await Promise.all([f.store.reserve('alice', p.id, input), f.store.reserve('alice', p.id, input)]);
    assert.equal(one.id, two.id);
    await f.store.write('alice', one.id, one.files[0].id, new Blob(['hello']).stream());
    const [first, second] = await Promise.all([f.store.commit('alice', one.id), f.store.commit('alice', one.id)]);
    assert.equal(first.revision.id, second.revision.id);
    assert.equal((await f.store.history('alice', p.id)).length, 1);
  } finally { (await f.close()); }
});
