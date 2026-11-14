import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { shareContract, shareViewSchema, ownShareSchema, shareClaimSchema } from "../src/api/contracts/shares";
import { registerJsonRoute } from "../src/api/route.server";
import { AccountError } from "../src/accounts/errors.server";

const view = {
  id: "share-1", mode: "link", title: "A chapter", description: "", progress: "chapter", spoiler: false,
  work: { id: "work-1", title: "Work", url: "/works/work-1" },
  version: { id: "version-1", title: "Version", number: 1, engine: "web", url: "/play/version-1", engineReleaseId: "release-2" },
  metadataBasis: "published", publicSource: null, author: "Reader", createdAt: 123, expiresAt: null,
  files: [{ name: "slot.dat", bytes: 3, sha256: "a".repeat(64) }], bytes: 3, claims: 0,
  integrity: "sha256", compatibility: "author-declared",
};

test("share contracts validate complete views and restricted projections without restoring hidden text", () => {
  assert.deepEqual(shareViewSchema.parse(view), view);
  const redacted = { ...view, title: "受限存档分享", description: "", contentRedacted: true, files: [], publicSource: { id: "parent", title: "来源分享" } };
  assert.deepEqual(shareViewSchema.parse(redacted), redacted);
  assert.equal(shareViewSchema.safeParse({ ...view, version: { id: "version-1" } }).success, false);
  assert.equal(ownShareSchema.safeParse({ ...view, state: "revoked", metadataRevision: 2, pending: null }).success, true);
  assert.equal(shareClaimSchema.safeParse({ profile: { id: "profile-1" }, revision: {} }).success, false);
});

test("share inspect contract passes secret in JSON and retains endpoint status and cookies", async () => {
  const app = new Hono();
  registerJsonRoute(app, shareContract.shareInspect, async (c) => {
    assert.equal(c.req.param("id"), "share-1");
    assert.equal((await c.req.json()).secret, "private-key");
    c.header("Set-Cookie", "session=renewed; HttpOnly; Secure");
    return c.json(view);
  });
  const response = await app.request("/api/share-links/share-1/inspect", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: "private-key" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), view);
  assert.match(response.headers.get("Set-Cookie") ?? "", /session=renewed/);
});

test("share routes reject malformed request structures and preserve business denial codes", async () => {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof AccountError) return c.json({ code: error.code }, error.status);
    throw error;
  });
  let calls = 0;
  registerJsonRoute(app, shareContract.shareReport, async () => {
    calls++;
    throw new AccountError(404, "SHARE_UNAVAILABLE");
  });
  const malformed = await app.request("/api/me/share-reports", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shareId: "share-1", reason: 12 }),
  });
  assert.equal(malformed.status, 400);
  assert.equal(calls, 0);
  const denied = await app.request("/api/me/share-reports", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shareId: "share-1", reason: "report" }),
  });
  assert.equal(denied.status, 404);
  assert.deepEqual(await denied.json(), { code: "SHARE_UNAVAILABLE" });
  assert.equal(calls, 1);
});
