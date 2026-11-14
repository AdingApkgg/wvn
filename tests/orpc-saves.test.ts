import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { savesContract, saveCommitSchema, saveHistorySchema } from "../src/api/contracts/saves";
import { registerJsonRoute } from "../src/api/route.server";

const revision = {
  id: "revision-1", parent: null, source: null,
  files: [{ name: "slot.dat", bytes: 3, sha256: "a".repeat(64) }],
  conflict: false, createdAt: 123,
};

test("save history contract preserves nullable head, cursor and share origin metadata", () => {
  const value = { items: [{ ...revision, originKind: "share" }], current: null, next: "older-revision" };
  assert.deepEqual(saveHistorySchema.parse(value), value);
  assert.equal(saveHistorySchema.safeParse({ ...value, items: [{ ...revision, files: [{ name: "slot.dat" }] }] }).success, false);
  assert.equal(saveCommitSchema.safeParse({ conflict: true, revision, code: "CONTENT_CONFLICT" }).success, true);
  assert.equal(saveCommitSchema.safeParse({ conflict: false }).success, false);
});

test("save reserve route validates JSON shape and leaves the original request readable", async () => {
  const app = new Hono();
  let calls = 0;
  registerJsonRoute(app, savesContract.saveUploadReserve, async (c) => {
    calls++;
    const body = await c.req.json();
    assert.equal(c.req.param("id"), "profile-1");
    assert.equal(body.captureId, "capture-1");
    return c.json({ id: "upload-1", files: body.files.map((file: object) => ({ ...file, id: "file-1" })), complete: false });
  });
  const invalid = await app.request("/api/me/save-profiles/profile-1/uploads", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ captureId: "capture-1" }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
  const input = { captureId: "capture-1", expectedHead: null, generation: 1, files: revision.files };
  const valid = await app.request("/api/me/save-profiles/profile-1/uploads", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  });
  assert.equal(valid.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await valid.json(), { id: "upload-1", files: [{ ...revision.files[0], id: "file-1" }], complete: false });
});

test("save commit keeps the complete 409 branch and response cookie", async () => {
  const app = new Hono();
  const conflict = { conflict: true, revision: { ...revision, conflict: true }, code: "CONTENT_CONFLICT" };
  registerJsonRoute(app, savesContract.saveUploadCommit, (c) => {
    c.header("Set-Cookie", "session=renewed; HttpOnly; Secure");
    return c.json(conflict, 409);
  });
  const response = await app.request("/api/me/uploads/upload-1/commit", { method: "POST" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), conflict);
  assert.match(response.headers.get("Set-Cookie") ?? "", /session=renewed/);
});
