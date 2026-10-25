import { test } from "node:test";
import assert from "node:assert/strict";
import { shareHttpFixture } from "./helpers/share-http.ts";
const origin = "https://accounts.wg.test";
test("share HTTP policy exposes metadata only and blocks player access to private moderation", async () => {
  const f = await shareHttpFixture();
  try {
    const response = await f.api("/api/public/works/v4/save-shares");
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items, []);
    assert.equal(
      (await f.api("/api/public/works/v4/save-shares?progress=wrong")).status,
      400,
    );
    assert.equal((await f.api("/api/me/share-downloads", "", {})).status, 401);
    assert.equal((await f.api("/api/share-admin/queue")).status, 404);
    const cookie = await f.register("Reader");
    const me = await (await f.api("/api/me", cookie)).json();
    assert.equal(
      (await f.api("/api/me/save-shares", cookie, {}, "old-binding")).status,
      409,
    );
    const evil = await f.service.app.request(
      origin + "/api/share-links/unknown/inspect",
      {
        method: "POST",
        headers: {
          origin: "https://wg.saop.cc",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(evil.status, 403);
    assert.ok(me.binding);
  } finally {
    f.close();
  }
});

test("long downloads refresh live catalog and stop if their version becomes hidden", async (t) => {
  const f = await shareHttpFixture();
  const { createHash } = await import("node:crypto");
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  try {
    const cookie = await f.register("Slow Reader");
    const me = await (await f.api("/api/me", cookie)).json();
    const saves = f.service.saves!;
    const profile = saves.createProfile(me.user.id, "version-a");
    const bytes = Buffer.alloc(1024 * 1024, 42);
    const upload = (await saves.reserve(me.user.id, profile.id, {
      expectedHead: null,
      generation: 1,
      captureId: "slow",
      files: [
        {
          name: "slot.dat",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    }));
    await saves.write(
      me.user.id,
      upload.id,
      upload.files[0].id,
      new Blob([bytes]).stream(),
    );
    const revision = (await saves.commit(me.user.id, upload.id)).revision;
    await f.service.sharing!.catalog.refresh(true);
    const made = (await f.service.sharing!.create(me.user.id, {
      profileId: profile.id,
      generation: 1,
      revisionId: revision.id,
      mode: "link",
      days: 30,
      requestId: "slow",
      title: "Slow",
      description: "",
      progress: "chapter",
      spoiler: false,
    }));
    const response = await f.api(
      "/api/me/share-downloads",
      cookie,
      { shareId: made.id, secret: made.secret },
      me.binding,
    );
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    now += 31_000;
    assert.equal(
      (await reader.read()).done,
      false,
      "a visible version must continue beyond catalog TTL",
    );
    f.catalog.length = 0;
    now += 31_000;
    await assert.rejects(async () => {
      while (!(await reader.read()).done) {}
    }, /VERSION_UNAVAILABLE/);
  } finally {
    t.mock.restoreAll();
    f.close();
  }
});
