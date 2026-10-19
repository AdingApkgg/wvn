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
    {},
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
    {},
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(failed.available, false);
});

test("projection forwards combined filters and rejects mismatched response cards", async () => {
  assert.ok(mod?.projectShares);
  let observed = "";
  const base = {
    id: "filtered",
    title: "Filtered",
    description: "",
    progress: "complete",
    spoiler: false,
    author: "Player",
    bytes: 1,
    createdAt: 1,
    version: { id: "version-a", title: "Build", number: 1 },
    work: { id: "v4" },
  };
  const result = await mod.projectShares(
    "v4",
    new Set(["version-a", "version-b"]),
    { backend: "http://127.0.0.1:18484", account: "https://accounts.wg.test" },
    { version: "version-a", progress: "complete", cursor: "older" },
    async (input, options) => {
      observed = String(input);
      assert.equal(options?.credentials, "omit");
      return Response.json({
        items: [
          base,
          {
            ...base,
            id: "wrong-version",
            version: { ...base.version, id: "version-b" },
          },
          { ...base, id: "wrong-progress", progress: "route" },
        ],
        next: "older-next",
      });
    },
  );
  const url = new URL(observed);
  assert.equal(url.searchParams.get("versionId"), "version-a");
  assert.equal(url.searchParams.get("progress"), "complete");
  assert.equal(url.searchParams.get("cursor"), "older");
  assert.equal(result.available, true);
  assert.deepEqual(
    result.items.map((x) => x.id),
    ["filtered"],
  );
});
