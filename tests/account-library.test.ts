import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { LibraryStore } from "../src/accounts/library.server.ts";
const catalog = [
  {
    id: "v4",
    title: "CLANNAD",
    url: "/4/",
    versions: [
      {
        id: "version-a",
        number: 1,
        title: "原版",
        engine: "ONS",
        url: "/4/1/",
      },
    ],
  },
];
test("private books are owner scoped and stale edits cannot overwrite notes", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const store = new LibraryStore(db, catalog);
    const entry = store.edit("alice", "v4", 0, {
      status: "playing",
      note: "Chapter 2",
    });
    assert.equal(entry.revision, 1);
    assert.equal(store.list("bob").length, 0);
    assert.throws(() =>
      store.edit("alice", "v4", 0, { status: "completed", note: "stale" }),
    );
    assert.equal(store.list("alice")[0].note, "Chapter 2");
    assert.throws(() =>
      store.edit("alice", "v99", 0, { status: "playing", note: "" }),
    );
  } finally {
    db.close();
  }
});
test("play events are idempotent, never trust client duration and cap late heartbeats", () => {
  const db = new DatabaseSync(":memory:");
  let now = 1000;
  try {
    const store = new LibraryStore(db, catalog, () => now);
    const first = store.start("alice", "version-a", "event-a");
    assert.equal(store.start("alice", "version-a", "event-a").id, first.id);
    assert.equal(store.heartbeat("alice", first.id, 1, true).seconds, 0);
    now += 30_000;
    assert.equal(store.heartbeat("alice", first.id, 2, true).seconds, 30);
    assert.equal(store.heartbeat("alice", first.id, 2, true).seconds, 30);
    now += 3600_000;
    assert.equal(store.heartbeat("alice", first.id, 3, false).seconds, 90);
    now += 10_000;
    assert.equal(store.heartbeat("alice", first.id, 4, true).seconds, 90);
    assert.throws(() => store.heartbeat("bob", first.id, 4, true));
    assert.equal(store.list("alice")[0].lastVersionId, "version-a");
    assert.equal(store.list("alice")[0].seconds, 90);
  } finally {
    db.close();
  }
});

test("overlapping windows of one work do not double-count foreground time", () => {
  const db = new DatabaseSync(":memory:");
  let now = 1000;
  try {
    const store = new LibraryStore(db, catalog, () => now);
    const a = store.start("alice", "version-a", "window-a"),
      b = store.start("alice", "version-a", "window-b");
    store.heartbeat("alice", a.id, 1, true);
    store.heartbeat("alice", b.id, 1, true);
    now += 30_000;
    store.heartbeat("alice", a.id, 2, true);
    store.heartbeat("alice", b.id, 2, true);
    assert.equal(store.list("alice")[0].seconds, 30);
  } finally {
    db.close();
  }
});
