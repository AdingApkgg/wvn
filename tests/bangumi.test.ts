import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, legacyPath } from "../src/server/store.ts";
import { createPublicApp } from "../src/server/http.ts";

const work = (id: string) => ({
  id,
  title: id,
  originalTitle: id,
  aliases: [],
  evidence: id.startsWith("b")
    ? "https://bgm.tv/subject/" + id.slice(1)
    : "https://vndb.org/" + id,
});
test("Bangumi seed promotes an existing pending record without changing VNDB slots", () => {
  const s = new Store(":memory:");
  try {
    const old = {
      snapshotAt: "2026-10-19T00:00:00Z",
      works: [work("v4")],
      versions: [
        {
          id: "v-original",
          workId: "v4",
          number: 1,
          title: "原版",
          legacyPath: "/original/",
          engine: "ONS",
        },
      ],
      pending: [
        {
          id: "fallback",
          title: "待匹配",
          legacyPath: "/fallback/",
          meta: "Tyrano",
          reason: "No confirmed VNDB ID",
        },
      ],
    };
    s.seed(old);
    const next = {
      ...old,
      works: [...old.works, work("b4")],
      versions: [
        ...old.versions,
        {
          id: "fallback",
          workId: "b4",
          number: 1,
          title: "BGM版",
          legacyPath: "/fallback/",
          engine: "Tyrano",
        },
      ],
      pending: [],
    };
    s.seed(next);
    s.seed(next);
    s.seed(old);
    assert.equal(s.pending().length, 0);
    assert.equal(s.get("v4")?.versions[0].url, "/4/1/");
    assert.equal(s.get("b4")?.url, "/b4/");
    assert.equal(s.get("b4")?.versions[0].url, "/b4/1/");
    assert.equal(s.resolveRoute("4", "1")?.id, "v-original");
    assert.equal(s.resolveRoute("b4", "1")?.id, "fallback");
    const moved = s.reassignVersion("fallback", "v4", 1);
    assert.equal(moved.number, 2);
    assert.equal(s.resolveRoute("b4", "1")?.id, "fallback");
    assert.equal(
      s.get("v4")?.versions.find((v) => v.id === "fallback")?.url,
      "/4/2/",
    );
    assert.equal(
      s.addVersion("b4", {
        title: "新版",
        legacyPath: "/next/",
        engine: "Tyrano",
      }).number,
      2,
    );
    for (const p of ["/b4/", "/b4/nested/"]) assert.throws(() => legacyPath(p));
  } finally {
    s.close();
  }
});
test("Bangumi work creation validates its provider evidence and strict IDs", () => {
  const s = new Store(":memory:");
  try {
    assert.throws(() =>
      s.createWork({ ...work("b4"), evidence: "https://vndb.org/v4" }),
    );
    for (const id of ["b0", "b04", "b-4", "v04"])
      assert.throws(() => s.createWork(work(id)));
    assert.equal(s.createWork(work("b4")).id, "b4");
    s.addVersion("b4", {
      title: "版",
      legacyPath: "/fallback/",
      engine: "Tyrano",
    });
    for (const [slug, slot] of [
      ["b04", "1"],
      ["b4", "01"],
      ["v4", "1"],
    ])
      assert.equal(s.resolveRoute(slug, slot), undefined);
  } finally {
    s.close();
  }
});
test("Bangumi API and framework data paths use the prefixed namespace", async () => {
  const s = new Store(":memory:");
  try {
    s.createWork(work("b4"));
    s.addVersion("b4", {
      title: "版",
      legacyPath: "/fallback/",
      engine: "Tyrano",
    });
    const app = createPublicApp(s, "/nonexistent");
    app.get("/b4/_.data", (c) => c.text("work data"));
    app.get("/b4/1/_.data", (c) => c.text("version data"));
    const r = await app.request("/api/works/b4");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).url, "/b4/");
    assert.equal((await app.request("/api/works/4")).status, 404);
    for (const p of ["/b4/_.data", "/b4/1/_.data"])
      assert.equal((await app.request(p)).status, 200);
    for (const p of ["/api/works/b04", "/b4/missing.js", "/b04/_.data"])
      assert.equal((await app.request(p)).status, 404);
  } finally {
    s.close();
  }
});
