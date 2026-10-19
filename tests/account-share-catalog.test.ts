import { test } from "node:test";
import assert from "node:assert/strict";
const mod = await import("../src/server/share-projection.ts").catch(() => null);
test("work projection has no credentials or arbitrary target and drops hidden-version entries", async () => {
  assert.ok(mod?.projectShares, "trusted public sharing projection required");
  let init: RequestInit | undefined,
    url = "";
  const result = await mod.projectShares(
    "v4",
    new Set(["version-a"]),
    { backend: "http://127.0.0.1:18484", account: "https://accounts.wg.test" },
    undefined,
    undefined,
    async (input, options) => {
      url = String(input);
      init = options;
      return Response.json({
        items: [
          {
            id: "a",
            title: "Public",
            description: "",
            progress: "chapter",
            spoiler: true,
            author: "Reader",
            bytes: 1,
            createdAt: 1,
            version: { id: "hidden", title: "Old", number: 2 },
            work: { id: "v4" },
          },
        ],
        next: null,
      });
    },
  );
  assert.equal(result.items.length, 0);
  assert.equal(init?.credentials, "omit");
  assert.equal(new Headers(init?.headers).get("cookie"), null);
  assert.ok(
    url.startsWith("http://127.0.0.1:18484/api/public/works/v4/save-shares"),
  );
  const failed = await mod.projectShares(
    "v4",
    new Set(["version-a"]),
    { backend: "http://127.0.0.1:18484", account: "https://accounts.wg.test" },
    undefined,
    undefined,
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(failed.available, false);
});
