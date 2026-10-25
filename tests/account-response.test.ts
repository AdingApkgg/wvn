import assert from "node:assert/strict";
import { test } from "node:test";
import { readAccountView } from "../src/accounts/response";

test("anonymous account replies finish their response body", async () => {
  const response = new Response('{"error":"SIGN_IN_REQUIRED"}', { status: 401 });
  assert.equal(await readAccountView(response), null);
  assert.equal(response.bodyUsed, true);
});

test("account success is parsed and non-auth failures remain errors", async () => {
  const view = { user: { id: "qa", name: "QA" }, binding: "qa" };
  assert.deepEqual(await readAccountView(Response.json(view)), view);
  await assert.rejects(readAccountView(new Response("failed", { status: 500 })), /NETWORK/);
});
