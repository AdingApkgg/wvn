import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { RecoveryStore } from "../src/accounts/recovery.server.ts";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE wg_account(user_id TEXT PRIMARY KEY,auth_version INTEGER,code_group TEXT);INSERT INTO wg_account VALUES('alice',0,'');
 CREATE TABLE passkey(id TEXT PRIMARY KEY,userId TEXT,name TEXT,publicKey TEXT,credentialID TEXT,counter INTEGER,deviceType TEXT,backedUp INTEGER,transports TEXT,createdAt INTEGER,aaguid TEXT);
 CREATE TABLE session(id TEXT PRIMARY KEY,userId TEXT);INSERT INTO session VALUES('old-session','alice');
 INSERT INTO passkey VALUES('old-key','alice','old','old','old',0,'singleDevice',0,'',0,'');`);
  return { db, store: new RecoveryStore(db) };
}
test("recovery codes are random, hashed at rest and single use", () => {
  const { db, store } = fixture();
  try {
    const codes = store.rotate("alice");
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    assert.ok(codes.every((code) => code.length >= 26));
    const dump = JSON.stringify(
      db.prepare("SELECT * FROM wg_recovery_codes").all(),
    );
    assert.ok(codes.every((code) => !dump.includes(code)));
    assert.ok(store.start("alice", codes[0]));
    assert.equal(store.start("alice", codes[0]), null);
    assert.equal(store.start("alice", "invalid-code"), null);
  } finally {
    db.close();
  }
});
test("recovery completion revokes old keys, sessions and competing tickets atomically", () => {
  const { db, store } = fixture();
  try {
    const codes = store.rotate("alice");
    const first = store.start("alice", codes[0])!;
    const other = store.start("alice", codes[1])!;
    const credential = {
      id: "new-credential",
      publicKey: "public-key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: [] as string[],
    };
    const next = store.complete(first, credential);
    assert.equal(next.length, 10);
    assert.deepEqual(
      db
        .prepare("SELECT credentialID FROM passkey")
        .all()
        .map((row) => row.credentialID),
      ["new-credential"],
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM session").get()?.n, 0);
    assert.equal(store.inspect(other), null);
    assert.throws(() =>
      store.complete(other, { ...credential, id: "competing" }),
    );
    assert.equal(store.start("alice", codes[2]), null);
    assert.ok(store.start("alice", next[0]));
  } finally {
    db.close();
  }
});
test("expired or invalidated recovery tickets cannot enroll a credential", () => {
  const { db, store } = fixture();
  try {
    let now = 1000;
    const timed = new RecoveryStore(db, () => now);
    const codes = timed.rotate("alice");
    const token = timed.start("alice", codes[0])!;
    assert.ok(token);
    now += 600_001;
    assert.equal(timed.inspect(token), null);
    now = 1000;
    const active = timed.start("alice", codes[1])!;
    assert.ok(active);
    timed.rotate("alice");
    assert.equal(timed.inspect(active), null);
    assert.equal(db.prepare("SELECT count(*) AS n FROM passkey").get()?.n, 1);
  } finally {
    db.close();
  }
});
