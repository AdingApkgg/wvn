import { test } from "node:test";
import assert from "node:assert/strict";
import { shareHttpFixture } from "./helpers/share-http.ts";
const module = await import("../src/accounts/share-admin.server.ts").catch(
  () => null,
);
test("moderation has a separate one-use admin login, origin and cookie namespace", async () => {
  assert.ok(module?.createShareAdminApp, "private moderator app required");
  const f = await shareHttpFixture();
  try {
    const origin = "https://localhost:18285",
      { app } = module.createShareAdminApp(
        f.service,
        origin,
        "synthetic-admin-token",
      );
    assert.equal(
      (await app.request(origin + "/api/share-admin/queue")).status,
      401,
    );
    const bad = await app.request(origin + "/api/share-admin/login", {
      method: "POST",
      headers: {
        origin: "https://wg.saop.cc",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "synthetic-admin-token" }),
    });
    assert.equal(bad.status, 403);
    const login = await app.request(origin + "/api/share-admin/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ token: "synthetic-admin-token" }),
    });
    assert.equal(login.status, 200);
    assert.match(
      login.headers.getSetCookie().join(""),
      /__Host-wg-share-admin/,
    );
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    assert.equal(
      (
        await app.request(origin + "/api/share-admin/queue", {
          headers: { cookie },
        })
      ).status,
      200,
    );
    assert.equal((await f.api("/api/share-admin/queue", cookie)).status, 404);
  } finally {
    f.close();
  }
});
