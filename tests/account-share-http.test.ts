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
