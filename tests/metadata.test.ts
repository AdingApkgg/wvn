import { testStore } from "./helpers/catalog.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/server/store.ts";
const seed = {
  snapshotAt: "2026-10-19T00:00:00Z",
  works: [
    {
      id: "v4",
      title: "人工标题",
      originalTitle: "CLANNAD",
      aliases: ["团子"],
      evidence: "https://vndb.org/v4",
    },
  ],
  versions: [
    {
      id: "fixed",
      workId: "v4",
      number: 1,
      title: "已修复版",
      legacyPath: "/clannad/",
      engine: "ONS",
    },
  ],
};
const snapshot = (fetchedAt = "2026-10-19T01:00:00Z") => ({
  schemaVersion: 1,
  fetchedAt,
  works: [
    {
      workId: "v4",
      fetchedAt,
      titles: [{ title: "CLANNAD", lang: "ja", source: "vndb" }],
      description: "来自来源的简介。",
      descriptionSource: "vndb",
      cover: null,
      screenshots: [],
      tags: [{ name: "Drama", source: "vndb" }],
      released: "2004-04-28",
      developers: ["Key"],
      languages: ["ja"],
      platforms: ["win"],
      ratings: [{ source: "vndb", score: 8.5, votes: 100 }],
      sources: [{ provider: "vndb", id: "v4", url: "https://vndb.org/v4" }],
      warnings: [],
    },
  ],
});
(test("metadata dry-run preserves manual fields and apply only changes source metadata", async () => {
  const store = await testStore();
  try {
    (await store.seed(seed));
    const before = (await store.get("v4"));
    const plan = (await store.importMetadata(snapshot(), false));
    assert.equal(plan.added, 1);
    assert.deepEqual((await store.get("v4")), before);
    (await store.importMetadata(snapshot(), true));
    const after = (await store.get("v4"))!;
    assert.equal(after.title, "人工标题");
    assert.deepEqual(after.aliases, ["团子"]);
    assert.equal(after.revision, before!.revision);
    assert.deepEqual(after.versions, before!.versions);
    assert.equal(after.metadata?.description, "来自来源的简介。");
    assert.equal(after.metadata?.released, "2004-04-28");
    assert.equal((await store.importMetadata(snapshot(), true)).unchanged, 1);
    (await assert.rejects(async () =>
      (await store.importMetadata(snapshot("2026-10-18T00:00:00Z"), true)),
    ));
  } finally {
    (await store.close());
  }
}));
(test("metadata rejects untrusted media, wrong provider identity and unknown works atomically", async () => {
  const store = await testStore();
  try {
    (await store.seed(seed));
    assert.equal((await store.importMetadata(snapshot(), false)).added, 1);
    const unsafe = snapshot();
    unsafe.works[0].cover = {
      url: "https://evil.test/a.jpg",
      sourceUrl: "https://evil.test/a.jpg",
      source: "vndb",
      width: 1,
      height: 1,
    } as any;
    (await assert.rejects(async () => (await store.importMetadata(unsafe, true))));
    const wrong = snapshot();
    wrong.works[0].sources[0].url = "https://vndb.org/v5";
    (await assert.rejects(async () => (await store.importMetadata(wrong, true))));
    const missing = snapshot();
    missing.works.push({ ...missing.works[0], workId: "v999" });
    (await assert.rejects(async () => (await store.importMetadata(missing, true))));
    assert.equal((await store.get("v4"))?.metadata, undefined);
  } finally {
    (await store.close());
  }
}));
(test("source markup removes spoiler blocks and preserves plain readable attribution", async () => {
  const { sourceText, trustedImageUrl } = await import("../src/metadata.ts");
  assert.equal(
    sourceText(
      "[b]简介[/b]\n[spoiler]结局[/spoiler]<script>bad</script> [url=https://example.org]来源[/url]",
    ),
    "简介\nbad 来源",
  );
  assert.equal(trustedImageUrl("https://t.vndb.org/cv/12/76012.jpg"), true);
  for (const url of [
    "http://t.vndb.org/cv/12/76012.jpg",
    "https://t.vndb.org.evil/cv/12/76012.jpg",
    "https://user@t.vndb.org/cv/12/76012.jpg",
    "https://127.0.0.1/pic/cover/a.jpg",
  ])
    assert.equal(trustedImageUrl(url), false);
}));

(test("reviewed official sources accept cached promotional art with exact work attribution", async () => {
  const { metadataSchema } = await import("../src/metadata.ts");
  const doc: any = snapshot().works[0];
  doc.workId = "v32805";
  doc.sources = [
    { provider: "vndb", id: "v32805", url: "https://vndb.org/v32805" },
    { provider: "official", id: "steam-1698030", url: "https://store.steampowered.com/app/1698030/" },
  ];
  doc.cover = {
    url: "/media/" + "a".repeat(64) + ".jpg",
    sourceUrl: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1698030/header.jpg?t=1642702039",
    source: "official", kind: "promotion",
  };
  assert.equal(metadataSchema.parse(doc).cover?.source, "official");
  const badLink = structuredClone(doc);
  badLink.sources[1].url += "?next=https://evil.test";
  assert.equal(metadataSchema.safeParse(badLink).success, false);
  const wrongWork = structuredClone(doc);
  wrongWork.workId = "v4";
  wrongWork.sources[0] = { provider: "vndb", id: "v4", url: "https://vndb.org/v4" };
  assert.equal(metadataSchema.safeParse(wrongWork).success, false);
  const falseCredit = structuredClone(doc);
  falseCredit.cover.source = "vndb";
  assert.equal(metadataSchema.safeParse(falseCredit).success, false);
  const unknownImage = structuredClone(doc);
  unknownImage.cover.sourceUrl = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/999/header.jpg";
  assert.equal(metadataSchema.safeParse(unknownImage).success, false);
  const unknownSource = structuredClone(doc);
  unknownSource.sources[1].id = "constructor";
  assert.equal(metadataSchema.safeParse(unknownSource).success, false);
  const malformed = structuredClone(doc);
  malformed.cover.sourceUrl = "not a URL";
  assert.equal(metadataSchema.safeParse(malformed).success, false);
}));
