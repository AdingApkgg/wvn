import { testStore } from "./helpers/catalog.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../src/server/store.ts";
import { createPublicApp, createAdminApp } from "../src/server/http.ts";
import { Auth } from "../src/server/auth.ts";
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wg-http-"));
  mkdirSync(join(root, "game"));
  writeFileSync(join(root, "game", "index.html"), "<title>game</title>");
  writeFileSync(join(root, "game", "engine.wasm"), "0123456789");
  const store = await testStore();
  (await store.seed({
    snapshotAt: "2026-10-19T00:00:00Z",
    works: [
      {
        id: "v4",
        title: "CLANNAD",
        originalTitle: "CLANNAD",
        aliases: [],
        evidence: "https://vndb.org/v4",
      },
    ],
    versions: [
      {
        id: "a",
        workId: "v4",
        number: 1,
        title: "原版",
        legacyPath: "/game/",
        engine: "ONS",
      },
    ],
  }));
  const auth = new Auth("secret");
  return {
    root,
    store,
    auth,
    pub: createPublicApp(store, root),
    admin: createAdminApp(store, auth, { sources: [] }),
    async close() {
      (await store.close());
      rmSync(root, { recursive: true, force: true });
    },
  };
}
(test("resource ranges, HEAD, traversal and missing JS do not fall into HTML", async () => {
  const f = (await fixture());
  try {
    let r = await f.pub.request("/game/engine.wasm", {
      headers: { range: "bytes=2-4" },
    });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get("content-range"), "bytes 2-4/10");
    assert.equal(await r.text(), "234");
    r = await f.pub.request("/game/engine.wasm", { method: "HEAD" });
    assert.equal(r.headers.get("content-length"), "10");
    assert.equal(await r.text(), "");
    assert.equal(
      (
        await f.pub.request("/game/engine.wasm", {
          headers: { range: "bytes=100-" },
        })
      ).status,
      416,
    );
    assert.equal((await f.pub.request("/game/missing.js")).status, 404);
    for (const p of [
      "/game/%252e%252e/secret",
      "/game/%5c..%5csecret",
      "/unknown.js",
      "/game/.env",
    ])
      assert.equal((await f.pub.request(p)).status, 404);
    try {
      symlinkSync(join(rootOutside(), "secret"), join(f.root, "game", "leak"));
    } catch {}
    assert.equal((await f.pub.request("/game/leak")).status, 404);
  } finally {
    (await f.close());
  }
}));
function rootOutside() {
  return tmpdir();
}
(test("management is absent from public server and protected on private listener", async () => {
  const f = (await fixture());
  try {
    for (const p of ["/manage", "/api/manage/catalog", "/api/manage/login"])
      assert.equal(
        (
          await f.pub.request(p, {
            method: p.endsWith("login") ? "POST" : "GET",
          })
        ).status,
        404,
      );
    assert.equal((await f.admin.request("/api/manage/catalog")).status, 401);
    assert.equal(
      (
        await f.admin.request("/api/manage/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://evil.example",
          },
          body: JSON.stringify({ token: "secret" }),
        })
      ).status,
      403,
    );
    const r = await f.admin.request("/api/manage/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({ token: "secret" }),
    });
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    assert.match(r.headers.get("set-cookie")!, /HttpOnly/);
    assert.equal(
      (
        await f.admin.request("/api/manage/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({ token: "secret" }),
        })
      ).status,
      401,
    );
    assert.equal(
      (await f.admin.request("/api/manage/catalog", { headers: { cookie } }))
        .status,
      200,
    );
    const api = await (await f.pub.request("/api/catalog")).text();
    assert.equal(api.includes(f.root), false);
    assert.equal(api.includes("legacyPath"), false);
  } finally {
    (await f.close());
  }
}));
(test("private edit conflicts are 409 and old routes stay tied to exact versions", async () => {
  const f = (await fixture());
  try {
    const login = await f.admin.request("/api/manage/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({ token: "secret" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const revision = (await f.store.get("v4"))!.revision;
    const edit = () =>
      f.admin.request("/api/manage/works/v4", {
        method: "PATCH",
        headers: {
          cookie,
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ revision, patch: { title: "编辑" } }),
      });
    assert.equal((await edit()).status, 200);
    assert.equal((await edit()).status, 409);
    assert.equal((await f.pub.request("/game/")).status, 200);
    assert.equal((await f.pub.request("/api/works/04")).status, 404);
  } finally {
    (await f.close());
  }
}));
(test("containment rejects Windows cross-volume and prefix collisions", async () => {
  const { insideRoot } = await import("../src/server/resources.ts");
  const { win32 } = await import("node:path");
  assert.equal(insideRoot("H:\\wg", "C:\\private\\file", win32), false);
  assert.equal(insideRoot("H:\\wg", "H:\\wg-other\\file", win32), false);
  assert.equal(insideRoot("H:\\wg", "H:\\wg\\atri\\file", win32), true);
}));
(test("public app passes built client assets and known framework data paths to their dedicated handlers", async () => {
  const f = (await fixture());
  try {
    f.pub.get("/assets/app.js", (c) => c.text("hydrate()"));
    for (const p of ["/_.data", "/27448/_.data", "/27448/1/_.data"])
      f.pub.get(p, (c) => c.json({ ok: true }));
    for (const p of ["/_.data?q=ATRI", "/27448/_.data", "/27448/1/_.data"])
      assert.equal((await f.pub.request(p)).status, 200);
    const r = await f.pub.request("/assets/app.js");
    assert.equal(r.status, 200);
    assert.equal(await r.text(), "hydrate()");
  } finally {
    (await f.close());
  }
}));
(test("only imported cached metadata images are served from the isolated media root", async () => {
  const f = (await fixture());
  try {
    const file = "a".repeat(64) + ".jpg";
    mkdirSync(join(f.root, "media"));
    writeFileSync(join(f.root, "media", file), Buffer.from([255, 216, 255, 0]));
    const app = createPublicApp(f.store, f.root, join(f.root, "media"));
    assert.equal((await app.request("/media/" + file)).status, 404);
    (await f.store.importMetadata(
      {
        schemaVersion: 1,
        fetchedAt: "2026-10-19T02:00:00Z",
        works: [
          {
            workId: "v4",
            fetchedAt: "2026-10-19T02:00:00Z",
            titles: [],
            description: "",
            descriptionSource: null,
            cover: {
              url: "/media/" + file,
              sourceUrl: "https://t.vndb.org/cv/12/76012.jpg",
              source: "vndb",
            },
            screenshots: [],
            tags: [],
            released: null,
            developers: [],
            languages: [],
            platforms: [],
            ratings: [],
            sources: [
              { provider: "vndb", id: "v4", url: "https://vndb.org/v4" },
            ],
            warnings: [],
          },
        ],
      },
      true,
    ));
    const response = await app.request("/media/" + file);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(
      response.headers.get("cross-origin-embedder-policy"),
      "require-corp",
    );
    for (const path of [
      "/media/catalog.db",
      "/media/..%5csecret",
      "/media/unknown.jpg",
    ])
      assert.equal((await app.request(path)).status, 404);
    assert.equal(
      (await app.request("/media/" + file, { method: "HEAD" })).status,
      200,
    );
  } finally {
    (await f.close());
  }
}));
