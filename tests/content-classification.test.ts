import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testStore } from "./helpers/catalog.ts";
import type { WorkClassification } from "../src/content/types.ts";

const reviewedAt = "2026-11-03T16:00:00Z";
const imageId = "/media/" + "a".repeat(64) + ".jpg";
const seed = {
  snapshotAt: reviewedAt,
  works: [{ id: "v4", title: "人工标题", originalTitle: "CLANNAD", aliases: [], evidence: "https://vndb.org/v4" }],
  versions: [{ id: "version-one", workId: "v4", number: 1, title: "原版本", legacyPath: "/classification-fixture/", engine: "ONS" }],
};
const metadata = (fetchedAt = reviewedAt) => ({
  schemaVersion: 1, fetchedAt, works: [{
    workId: "v4", fetchedAt, titles: [], description: "普通剧情介绍", descriptionSource: "vndb", screenshots: [],
    cover: { url: imageId, sourceUrl: "https://t.vndb.org/cv/12/76012.jpg", source: "vndb" },
    tags: [], released: null, developers: [], languages: [], platforms: [], ratings: [],
    sources: [{ provider: "vndb", id: "v4", url: "https://vndb.org/v4" }], warnings: [],
  }],
});
const evidence = { reason: "人工核对本次快照的页面文案", source: "manual:fixture-review", reviewedAt };
const work = { ...evidence, pageSuitability: "sfw" as const };
const document = (records: any[]) => ({ schemaVersion: 1, records: records.map(record => ({
  ...record, ...(record.kind === "work" ? { fingerprint: "0".repeat(64) } : {}),
})) });
async function classifications(store: Awaited<ReturnType<typeof testStore>>) {
  const { ContentClassificationStore } = await import("../src/content/classification.server.ts");
  const result = new ContentClassificationStore(store.database);
  await result.ready;
  return result;
}
async function setWork(records: Awaited<ReturnType<typeof classifications>>, id: string, revision: number, payload: Omit<WorkClassification, "revision">) {
  const snapshot = await records.reviewWork(id);
  assert.ok(snapshot);
  return records.set("work", id, revision, payload, snapshot.reviewFingerprint);
}

test("unclassified catalog records are explicitly unknown without changing lifecycle or defaults", async () => {
  const store = await testStore();
  try {
    await store.seed(seed);
    await store.importMetadata(metadata(), true);
    const before = (await store.get("v4", true))!;
    assert.equal(before.classification?.pageSuitability, "unknown");
    assert.equal(before.versions[0].classification?.sexualContent, "unknown");
    assert.equal(before.metadata?.cover?.classification?.sexual, "unknown");
    assert.equal(before.metadata?.cover?.classification?.violence, "unknown");
    assert.equal(before.defaultVersionId, "version-one");
    assert.equal((await store.raw("version-one"))?.status, "published");
    assert.equal((await store.raw("version-one"))?.classification?.sexualContent, "unknown");
  } finally { await store.close(); }
});

test("classification evidence, image votes, fractional scores and duplicate records are validated atomically", async () => {
  const store = await testStore();
  try {
    const records = await classifications(store);
    await assert.rejects(records.import(document([{ kind: "work", id: "v4", classification: { ...work, reason: "", revision: 1 } }])));
    await assert.rejects(records.import(document([{ kind: "image", id: imageId, classification: {
      ...evidence, source: "https://api.vndb.org/kana/vn#v4/image", sexual: "safe", violence: "tame", spoiler: false,
      rawSexual: 0, rawViolence: 0, voteCount: 0, revision: 1,
    } }])));
    await assert.rejects(records.import(document([{ kind: "image", id: imageId, classification: {
      ...evidence, source: "https://api.vndb.org/kana/vn#v4/image", sexual: "safe", violence: "tame", spoiler: false,
      rawSexual: 0.5, rawViolence: 0, voteCount: 4, revision: 1,
    } }])));
    await assert.rejects(records.import(document([
      { kind: "work", id: "v4", classification: { ...work, revision: 1 } },
      { kind: "work", id: "v4", classification: { ...work, revision: 2 } },
    ])));
    assert.deepEqual(await records.list(), []);
    await records.import(document([{ kind: "image", id: imageId, classification: {
      ...evidence, source: "https://api.vndb.org/kana/vn#v4/image", sexual: "suggestive", violence: "tame", spoiler: false,
      rawSexual: 0.5, rawViolence: 0, voteCount: 4, revision: 1,
    } }]));
    const imported = (await records.list())[0];
    if (imported.kind !== "image") throw Error("测试图片记录缺失");
    assert.equal(imported.classification.rawSexual, 0.5);
  } finally { await store.close(); }
});

test("revision checks reject stale imports and concurrent manual changes while imports preserve overrides", async () => {
  const store = await testStore();
  try {
    await store.seed(seed);
    const records = await classifications(store);
    await records.import(document([{ kind: "work", id: "v4", classification: { ...work, revision: 2 } }]));
    await assert.rejects(records.import(document([{ kind: "work", id: "v4", classification: { ...work, revision: 1 } }])));
    await assert.rejects(records.import(document([{ kind: "work", id: "v4", classification: { ...work, reason: "相同修订的不同内容", revision: 2 } }])));
    const results = await Promise.allSettled([
      setWork(records, "v4", 2, { ...work, pageSuitability: "nsfw" }),
      setWork(records, "v4", 2, { ...work, pageSuitability: "unknown" }),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.filter(r => r.status === "rejected").length, 1);
    const manual = (await records.list())[0];
    assert.equal(manual.manual, true);
    assert.equal(manual.classification.revision, 3);
    await records.import(document([{ kind: "work", id: "v4", classification: { ...work, revision: 10 } }]));
    assert.deepEqual((await records.list())[0], manual);
  } finally { await store.close(); }
});

test("source metadata refresh cannot overwrite separate work, version or image manual classifications", async () => {
  const store = await testStore();
  try {
    await store.seed(seed);
    await store.importMetadata(metadata(), true);
    const records = await classifications(store);
    await setWork(records, "v4", 0, work);
    await records.set("version", "version-one", 0, { ...evidence, sexualContent: "present", titleSafe: true });
    await records.set("image", imageId, 0, { ...evidence, sexual: "safe", violence: "tame", spoiler: false });
    const before = (await store.get("v4", true))!;
    const changed: any = metadata("2026-11-03T17:00:00Z");
    changed.works[0].cover.classification = { ...evidence, sexual: "explicit", violence: "brutal", spoiler: true, revision: 99 };
    await store.importMetadata(changed, true);
    const after = (await store.get("v4", true))!;
    assert.deepEqual(after.classification, before.classification);
    assert.deepEqual(after.versions, before.versions);
    assert.deepEqual(after.metadata?.cover?.classification, before.metadata?.cover?.classification);
    assert.equal(after.defaultVersionId, before.defaultVersionId);
    assert.equal(after.revision, before.revision);
    assert.equal((await store.raw("version-one"))?.status, "published");
  } finally { await store.close(); }
});

test("reviewed catalog document covers each source record and its import is dry-run safe and idempotent", async () => {
  const store = await testStore();
  try {
    const records = await classifications(store);
    const audited = JSON.parse(readFileSync(new URL("../data/content-classification.json", import.meta.url), "utf8"));
    const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
    const metadata = JSON.parse(readFileSync(new URL("../data/metadata.json", import.meta.url), "utf8"));
    const coverReview = JSON.parse(readFileSync(new URL("../data/cover-review-20261114.json", import.meta.url), "utf8"));
    const retired = coverReview.records.filter((image: any) => !image.selected);
    for (const image of retired) {
      assert.notEqual(image.sexual, "safe", "保留的替换旧图不能隐式获得安全结论");
      assert.equal(audited.records.find((record: any) => record.kind === "image" && record.id === image.url)?.classification.sexual, image.sexual);
    }
    const expected = [
      ...catalog.works.map((w: any) => "work:" + w.id),
      ...catalog.versions.map((v: any) => "version:" + v.id),
      ...new Set([...metadata.works.flatMap((w: any) => [w.cover, ...w.screenshots].filter(Boolean).map((i: any) => "image:" + i.url)), ...retired.map((image: any) => "image:" + image.url)]),
    ];
    assert.deepEqual(audited.records.map((r: any) => r.kind + ":" + r.id).sort(), expected.sort());
    const plan = await records.import(audited, false);
    assert.equal(plan.added, expected.length);
    assert.deepEqual(await records.list(), []);
    await store.seed(catalog);
    await store.importMetadata(metadata, true);
    await records.import(audited);
    assert.equal((await records.import(audited)).unchanged, expected.length);
    assert.equal((await records.list()).length, expected.length);
    const projected = await store.list(true);
    for (const reviewed of audited.records.filter((record: any) => record.kind === "work")) {
      assert.equal(projected.find(work => work.id === reviewed.id)?.classification?.pageSuitability,
        reviewed.classification.pageSuitability, "导入指纹必须对应实际审核的同一文本快照");
    }
  } finally { await store.close(); }
});

test("changed page text cannot inherit an old SFW review and manual evidence is retained until a new review", async () => {
  const store = await testStore();
  try {
    await store.seed(seed);
    await store.importMetadata(metadata(), true);
    const records = await classifications(store);
    await setWork(records, "v4", 0, work);
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "sfw");
    const approved = (await records.list())[0];
    const changed = metadata("2026-11-03T17:00:00Z");
    changed.works[0].description = "后来新增的内容，尚未由上一次审核确认。";
    await store.importMetadata(changed, true);
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "unknown");
    assert.deepEqual((await records.list())[0], approved);
    await setWork(records, "v4", 1, { ...work, reason: "已重新核对变更后的文案" });
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "sfw");
    const before = (await store.get("v4"))!;
    await store.editWork("v4", before.revision, { aliases: ["新增未审核别名"] });
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "unknown");
  } finally { await store.close(); }
});

test("classification administration is private, authenticated, origin checked and conflict aware", async () => {
  const store = await testStore();
  try {
    await store.seed(seed);
    const { createAdminApp, createPublicApp } = await import("../src/server/http.ts");
    const { Auth } = await import("../src/server/auth.ts");
    const admin = createAdminApp(store, new Auth("classification-fixture-token"), {});
    const pub = createPublicApp(store, ".");
    const path = "/api/manage/content-classification";
    assert.equal((await pub.request(path)).status, 404);
    assert.equal((await admin.request(path)).status, 401);
    const login = await admin.request("/api/manage/login", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ token: "classification-fixture-token" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const review = (await (await admin.request(path, { headers: { cookie } })).json()).find((record: any) => record.kind === "work" && record.id === "v4");
    const update = (origin: string) => admin.request(path, {
      method: "PATCH", headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify({ kind: "work", id: "v4", expectedRevision: 0, expectedFingerprint: review.reviewFingerprint, payload: work }),
    });
    assert.equal((await update("https://evil.example")).status, 403);
    assert.equal((await update("http://localhost")).status, 200);
    const stale = await update("http://localhost");
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, "CLASSIFICATION_CONFLICT");
    const response = await admin.request(path, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const listed = await response.json();
    assert.equal(listed[0].manual, true);
    assert.equal(listed[0].classification.pageSuitability, "sfw");
  } finally { await store.close(); }
});

test("version title notes and language changes cannot inherit an old public page text review", async () => {
  const store = await testStore();
  try {
    await store.seed(seed);
    const records = await classifications(store);
    await setWork(records, "v4", 0, work);
    await records.set("version", "version-one", 0, { ...evidence, sexualContent: "unknown", titleSafe: true });
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "sfw");
    const version = (await store.raw("version-one"))!;
    await store.editVersion(version.id, version.revision, {
      title: "后来修改的未审核标题", notes: "后来追加的未审核版本说明", language: "未审核语言字段",
    });
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "unknown");
    assert.equal((await records.get("work", "v4"))?.pageSuitability, "sfw");
    await setWork(records, "v4", 1, { ...work, reason: "版本公开文案已重新审核" });
    assert.equal((await store.get("v4"))?.classification?.pageSuitability, "sfw");
  } finally { await store.close(); }
});

const reviewMutations = [
  { name: "work title", change: async (store: Awaited<ReturnType<typeof testStore>>) => {
    const current = (await store.get("v4"))!;
    await store.editWork("v4", current.revision, { title: "审核后另一个操作改写的标题" });
  } },
  { name: "source description", change: async (store: Awaited<ReturnType<typeof testStore>>) => {
    const changed = metadata("2026-11-03T17:00:00Z");
    changed.works[0].description = "审核后新导入、审核人未见过的简介";
    await store.importMetadata(changed, true);
  } },
  { name: "version text", change: async (store: Awaited<ReturnType<typeof testStore>>) => {
    const current = (await store.raw("version-one"))!;
    await store.editVersion(current.id, current.revision, { title: "审核后改写的版本名称", notes: "审核人未见过的说明" });
  } },
];

for (const mutation of reviewMutations) {
  test("manual work review cannot approve a changed PG text snapshot: " + mutation.name, async () => {
    const store = await testStore();
    try {
      await store.seed(seed);
      await store.importMetadata(metadata(), true);
      const { workTextFingerprint } = await import("../src/content/classification.server.ts");
      const records = await classifications(store);
      const reviewed = (await store.get("v4", true))!;
      const fingerprint = workTextFingerprint(reviewed, reviewed.metadata, reviewed.versions);
      await records.import({ schemaVersion: 1, records: [{ kind: "work", id: "v4", fingerprint, classification: { ...work, revision: 1 } }] });
      const original = await records.list();
      const history = await store.database.prepare("SELECT * FROM content_classification_history ORDER BY sequence").all();
      await mutation.change(store);
      await assert.rejects(records.set("work", "v4", 1, work, fingerprint),
        (error: any) => error.code === "CLASSIFICATION_CONFLICT", mutation.name);
      assert.deepEqual(await records.list(), original);
      assert.deepEqual(await store.database.prepare("SELECT * FROM content_classification_history ORDER BY sequence").all(), history);
    } finally { await store.close(); }
  });
}

for (const mutation of reviewMutations) {
  test("management GET review snapshot cannot approve later edits: " + mutation.name, async () => {
    const store = await testStore();
    try {
      await store.seed(seed);
      await store.importMetadata(metadata(), true);
      const { workTextFingerprint } = await import("../src/content/classification.server.ts");
      const reviewed = (await store.get("v4", true))!;
      await store.classifications.import({ schemaVersion: 1, records: [{ kind: "work", id: "v4",
        fingerprint: workTextFingerprint(reviewed, reviewed.metadata, reviewed.versions), classification: { ...work, revision: 1 } }] });
      const { createAdminApp } = await import("../src/server/http.ts");
      const { Auth } = await import("../src/server/auth.ts");
      const admin = createAdminApp(store, new Auth("review-snapshot-token"), {});
      const login = await admin.request("/api/manage/login", {
        method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ token: "review-snapshot-token" }),
      });
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const path = "/api/manage/content-classification";
      const snapshot = (await (await admin.request(path, { headers: { cookie } })).json()).find((record: any) => record.kind === "work" && record.id === "v4");
      const original = await store.classifications.list();
      await mutation.change(store);
      const response = await admin.request(path, {
        method: "PATCH", headers: { cookie, origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ kind: "work", id: "v4", expectedRevision: snapshot.classification.revision,
          expectedFingerprint: snapshot.reviewFingerprint, payload: work }),
      });
      assert.equal(response.status, 409, mutation.name);
      assert.equal((await response.json()).code, "CLASSIFICATION_CONFLICT");
      assert.deepEqual(await store.classifications.list(), original);
      const fresh = (await (await admin.request(path, { headers: { cookie } })).json()).find((record: any) => record.kind === "work" && record.id === "v4");
      assert.notEqual(fresh.reviewFingerprint, snapshot.reviewFingerprint);
      assert.equal(fresh.reviewText.title, (await store.get("v4"))!.title);
      if (mutation.name === "source description") assert.equal(fresh.reviewText.metadata.description, "审核后新导入、审核人未见过的简介");
      if (mutation.name === "version text") assert.equal(fresh.reviewText.versions[0].title, "审核后改写的版本名称");
      const confirmed = await admin.request(path, {
        method: "PATCH", headers: { cookie, origin: "http://localhost", "content-type": "application/json" },
        body: JSON.stringify({ kind: "work", id: "v4", expectedRevision: fresh.classification.revision,
          expectedFingerprint: fresh.reviewFingerprint, payload: work }),
      });
      assert.equal(confirmed.status, 200);
      assert.equal((await store.classifications.get("work", "v4"))?.revision, 2);
      assert.equal((await store.get("v4"))?.classification?.pageSuitability, "sfw");
    } finally { await store.close(); }
  });
}

test("manual review waits for an in-flight catalog write and rejects its old snapshot atomically", async () => {
  const store = await testStore();
  let release = () => {};
  let held: Promise<void> | undefined;
  try {
    await store.seed(seed);
    const records = await classifications(store);
    const { workTextFingerprint } = await import("../src/content/classification.server.ts");
    const reviewed = (await store.get("v4", true))!;
    const fingerprint = workTextFingerprint(reviewed, reviewed.metadata, reviewed.versions);
    await records.import({ schemaVersion: 1, records: [{ kind: "work", id: "v4", fingerprint, classification: { ...work, revision: 1 } }] });
    let entered = () => {};
    const inside = new Promise<void>(resolve => { entered = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    held = store.tx(async () => {
      await store.editWork("v4", reviewed.revision, { title: "并发修改的未审核标题" });
      entered();
      await resume;
    });
    await inside;
    let finished = false;
    const writing = records.set("work", "v4", 1, work, fingerprint)
      .then(() => { finished = true; return { ok: true, code: "" }; }, (error: any) => { finished = true; return { ok: false, code: error.code }; });
    await new Promise(resolve => setTimeout(resolve, 50));
    const completedBeforeCatalog = finished;
    release();
    await held;
    const result = await writing;
    assert.equal(completedBeforeCatalog, false, "分类审核必须等待正在提交的目录写入");
    assert.equal(result.ok, false);
    assert.equal(result.code, "CLASSIFICATION_CONFLICT");
    assert.equal((await records.get("work", "v4"))?.revision, 1);
  } finally { release(); await held; await store.close(); }
});
