import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabase, testUser } from "./helpers/accounts.ts";
import { RecoveryStore } from "../src/accounts/recovery.server.ts";
async function fixture() {
  const db = await testDatabase();
  await testUser(db, 'alice');
  await db.exec(`INSERT INTO wg_account VALUES('alice',0,'');
    INSERT INTO session(id,"userId",token,"expiresAt","createdAt","updatedAt")
      VALUES('old-session','alice','synthetic-old-token',now()+interval '1 day',now(),now());
    INSERT INTO passkey(id,"userId",name,"publicKey","credentialID",counter,"deviceType","backedUp",transports,"createdAt",aaguid)
      VALUES('old-key','alice','old','old','old',0,'singleDevice',false,'',to_timestamp(0),'');`);
  return { db, store: new RecoveryStore(db) };
}

test("recovery codes are random, hashed at rest and single use", async () => {
  const { db, store } = (await fixture());
  try {
    const codes = (await store.rotate("alice"));
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    assert.ok(codes.every((code) => code.length >= 26));
    const dump = JSON.stringify(
      (await db.prepare("SELECT * FROM wg_recovery_codes").all()),
    );
    assert.ok(codes.every((code) => !dump.includes(code)));
    assert.ok((await store.start("alice", codes[0])));
    assert.equal((await store.start("alice", codes[0])), null);
    assert.equal((await store.start("alice", "invalid-code")), null);
  } finally {
    (await db.close());
  }
});
test("recovery completion revokes old keys, sessions and competing tickets atomically", async () => {
  const { db, store } = (await fixture());
  try {
    const codes = (await store.rotate("alice"));
    const first = (await store.start("alice", codes[0]))!;
    const other = (await store.start("alice", codes[1]))!;
    const credential = {
      id: "new-credential",
      publicKey: "public-key",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      transports: [] as string[],
    };
    const next = (await store.complete(first, credential));
    assert.equal(next.length, 10);
    assert.deepEqual(
      (await db
        .prepare("SELECT \"credentialID\" FROM passkey")
        .all())
        .map((row) => row.credentialID),
      ["new-credential"],
    );
    assert.equal((await db.prepare("SELECT count(*) AS n FROM session").get())?.n, 0);
    assert.equal((await store.inspect(other)), null);
    (await assert.rejects(async () =>
      (await store.complete(other, { ...credential, id: "competing" })),
    ));
    assert.equal((await store.start("alice", codes[2])), null);
    assert.ok((await store.start("alice", next[0])));
  } finally {
    (await db.close());
  }
});
test("expired or invalidated recovery tickets cannot enroll a credential", async () => {
  const { db, store } = (await fixture());
  try {
    let now = 1000;
    const timed = new RecoveryStore(db, () => now);
    const codes = (await timed.rotate("alice"));
    const token = (await timed.start("alice", codes[0]))!;
    assert.ok(token);
    now += 600_001;
    assert.equal((await timed.inspect(token)), null);
    now = 1000;
    const active = (await timed.start("alice", codes[1]))!;
    assert.ok(active);
    (await timed.rotate("alice"));
    assert.equal((await timed.inspect(active)), null);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM passkey").get())?.n, 1);
  } finally {
    (await db.close());
  }
});
