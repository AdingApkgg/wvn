import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { postgresFixture } from "./helpers/postgres.ts";
import { Store } from "../src/server/store.ts";
import { migrate } from "../src/database/migrations.ts";
import { searchMigrations } from "../src/search/migrations.ts";
import { MeiliClient } from "../src/search/meili.server.ts";
import { SearchIndexer } from "../src/search/indexer.server.ts";
import { createSearchRuntime, loadCatalog } from "../src/search/runtime.server.ts";
import { configureContentAccess } from "../src/content/access.server.ts";
import { PUBLIC_CONTENT_ACCESS } from "../src/content/policy.ts";
import type { WorkClassification } from "../src/content/types.ts";

const evidence = { reason: "人工核对搜索测试页面", source: "manual:search-fixture", reviewedAt: "2026-11-03T16:00:00Z" };
async function setWork(store: Store, id: string, revision: number, payload: Omit<WorkClassification, "revision">) {
  const snapshot = await store.classifications.reviewWork(id);
  assert.ok(snapshot);
  return store.classifications.set("work", id, revision, payload, snapshot.reviewFingerprint);
}
async function fixture() {
  const pg = await postgresFixture();
  const store = new Store(pg.db);
  await store.ready;
  await migrate(pg.db, searchMigrations);
  const indexUid = "wvn_qa_content_search_" + randomUUID().replaceAll("-", "");
  const meili = new MeiliClient({ url: process.env.MEILISEARCH_URL!, apiKey: process.env.MEILI_MASTER_KEY! });
  const env = { WG_CONTENT_GATE: "1", MEILISEARCH_URL: process.env.MEILISEARCH_URL!, MEILI_SEARCH_KEY: process.env.MEILI_MASTER_KEY!, MEILI_INDEX_UID: indexUid };
  await store.seed({ snapshotAt: evidence.reviewedAt, works: [
    { id: "v4", title: "共同搜索安全", originalTitle: "Safe", aliases: [], evidence: "https://vndb.org/v4" },
    { id: "v5", title: "共同搜索敏感", originalTitle: "Restricted", aliases: [], evidence: "https://vndb.org/v5" },
    { id: "v6", title: "共同搜索待核", originalTitle: "Unknown", aliases: [], evidence: "https://vndb.org/v6" },
  ], versions: [
    { id: "safe-none", workId: "v4", number: 1, title: "安全版本", legacyPath: "/search-safe-none/", engine: "ONS" },
    { id: "safe-present", workId: "v4", number: 2, title: "受限版本", legacyPath: "/search-safe-present/", engine: "RenPy" },
    { id: "safe-unknown", workId: "v4", number: 3, title: "待核版本", legacyPath: "/search-safe-unknown/", engine: "ONS" },
    { id: "restricted-present", workId: "v5", number: 1, title: "原版", legacyPath: "/search-restricted/", engine: "ONS" },
    { id: "unknown-none", workId: "v6", number: 1, title: "原版", legacyPath: "/search-unknown/", engine: "ONS" },
  ] });
  await setWork(store, "v4", 0, { ...evidence, pageSuitability: "sfw" });
  await setWork(store, "v5", 0, { ...evidence, pageSuitability: "nsfw" });
  for (const [id, sexualContent] of [["safe-none", "none"], ["safe-present", "present"], ["restricted-present", "present"], ["unknown-none", "none"]] as const)
    await store.classifications.set("version", id, 0, { ...evidence, sexualContent, titleSafe: true });
  configureContentAccess("https://wvn.test", async request => request.headers.get("cookie") === "viewer=restricted"
    ? { ...PUBLIC_CONTENT_ACCESS, authenticated: true, eligibility: "qualified", displayMode: "restricted", canViewRestricted: true }
    : { ...PUBLIC_CONTENT_ACCESS });
  const runtime = await createSearchRuntime(store, env);
  const indexer = new SearchIndexer({ db: pg.db, meili, indexUid });
  await indexer.rebuild();
  return { ...pg, store, meili, indexer, indexUid, env, runtime,
    async close() {
      for (const index of await meili.listIndexes())
        if (index.uid === indexUid || index.uid.startsWith(indexUid + "_")) await meili.deleteIndex(index.uid);
      await pg.close();
    },
  };
}

test("search API enforces page visibility and rechecks stale index classifications and text fingerprints", async () => {
  const f = await fixture();
  try {
    const request = (cookie = "") => f.runtime.app.request("https://wvn.test/api/search?q=共同搜索", { headers: { cookie } });
    const anonymous = await request();
    assert.equal(anonymous.status, 200);
    assert.deepEqual((await anonymous.json()).ids, ["v4"]);
    assert.match(anonymous.headers.get("cache-control") ?? "", /no-store/);
    assert.deepEqual((await (await request("viewer=restricted")).json()).ids.sort(), ["v4", "v5"]);
    await setWork(f.store, "v4", 1, { ...evidence, pageSuitability: "nsfw" });
    assert.deepEqual((await (await request()).json()).ids, []);
    await setWork(f.store, "v4", 2, { ...evidence, pageSuitability: "sfw" });
    const work = (await f.store.get("v4"))!;
    await f.store.editWork("v4", work.revision, { aliases: ["新增未经审阅文案"] });
    assert.deepEqual((await (await request("viewer=restricted")).json()).ids, ["v5"]);
  } finally { await f.close(); }
});

test("search runtime keeps viewer origin and cookies while content filtering trims versions and defaults", async () => {
  const f = await fixture();
  try {
    const viewer = new Request("https://wvn.test/?q=共同搜索&content=present", { headers: { cookie: "viewer=restricted" } });
    const page = await f.runtime.query(new URLSearchParams("q=共同搜索&content=present"), viewer);
    assert.deepEqual(page.ids.sort(), ["v4", "v5"]);
    const catalog = await loadCatalog(viewer, f.store, f.env);
    assert.equal(catalog.searchStatus, 200);
    assert.deepEqual(catalog.items.map(w => w.id).sort(), ["v4", "v5"]);
    const work = catalog.items.find(w => w.id === "v4")!;
    assert.deepEqual(work.versions.map(v => v.id), ["safe-present"]);
    assert.equal(work.defaultVersionId, "safe-present");
    assert.equal(catalog.versions, 2);
    const unknown = await loadCatalog(new Request("https://wvn.test/?content=unknown"), f.store, f.env);
    assert.deepEqual(unknown.items.flatMap(w => w.versions.map(v => v.id)), ["safe-unknown"]);
    assert.equal((await f.runtime.app.request("https://wvn.test/api/search?content=bad")).status, 400);
  } finally { await f.close(); }
});

test("classification updates reliably queue search refresh within the same PG transaction", async () => {
  const f = await fixture();
  try {
    await f.db.exec("DELETE FROM search_outbox");
    await f.store.classifications.set("version", "safe-none", 1, { ...evidence, sexualContent: "present", titleSafe: true });
    assert.deepEqual((await f.db.prepare("SELECT work_id FROM search_outbox ORDER BY work_id").all()).map(r => r.work_id), ["v4"]);
    await f.db.exec("DELETE FROM search_outbox");
    await assert.rejects(f.db.transaction(async () => {
      await setWork(f.store, "v4", 1, { ...evidence, pageSuitability: "nsfw" });
      throw Error("rollback");
    }));
    assert.equal((await f.db.prepare("SELECT count(*) AS n FROM search_outbox").get())!.n, 0);
    await setWork(f.store, "v4", 1, { ...evidence, pageSuitability: "nsfw" });
    assert.deepEqual((await f.db.prepare("SELECT work_id FROM search_outbox").all()).map(r => r.work_id), ["v4"]);
  } finally { await f.close(); }
});

test("gated multi-page search reports unknown totals separately from visible page counts", async () => {
  const f = await fixture();
  try {
    const viewer = new Request("https://wvn.test/", { headers: { cookie: "viewer=restricted" } });
    const first = await f.runtime.query(new URLSearchParams("q=共同搜索&limit=1"), viewer);
    assert.equal(first.ids.length, 1);
    assert.notEqual(first.nextOffset, null);
    assert.equal(first.indexEstimatedTotalHits, null);
    assert.equal((first as any).visiblePageCount, 1);
    const second = await f.runtime.query(new URLSearchParams("q=共同搜索&limit=1&offset=" + first.nextOffset), viewer);
    assert.equal(second.indexEstimatedTotalHits, null);
    assert.equal((second as any).visiblePageCount, second.ids.length);
    assert.notEqual(first.ids[0], second.ids[0]);
    const legacy = await createSearchRuntime(f.store, { ...f.env, WG_CONTENT_GATE: "0" });
    const beforeGate = await legacy.query(new URLSearchParams("q=共同搜索&limit=1"));
    assert.equal(typeof beforeGate.indexEstimatedTotalHits, "number");
    assert.equal((beforeGate as any).visiblePageCount, undefined);
  } finally { await f.close(); }
});
