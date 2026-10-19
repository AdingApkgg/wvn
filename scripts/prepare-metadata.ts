import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { sourceText, trustedImageUrl } from "../src/metadata.ts";
const collected = JSON.parse(
  readFileSync("data/metadata-collected.json", "utf8"),
);
const seed = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const fallback = JSON.parse(readFileSync("data/bangumi-evidence.json", "utf8"));
const fetchedAt = collected.fetchedAt;
function image(i: any, source: "vndb" | "bgm") {
  if (!i?.url || !trustedImageUrl(i.url)) return null;
  const hash = createHash("sha256").update(i.url).digest("hex");
  return {
    url: "/media/" + hash + ".jpg",
    sourceUrl: i.url,
    source,
    ...(i.dims?.[0] ? { width: i.dims[0], height: i.dims[1] } : {}),
  };
}
const safe = (i: any) => i && i.sexual === 0 && i.violence === 0;
const works = seed.works.map((w: any) => {
  const v = collected.vndb[w.id],
    b = collected.bangumi[w.id],
    f = fallback[w.id];
  const titles: any[] = [];
  const seen = new Set<string>();
  function title(value: string | undefined, lang: string, source: string) {
    if (value && !seen.has(value)) {
      titles.push({ title: value, lang, source });
      seen.add(value);
    }
  }
  if (b) {
    title(b.name_cn, "zh-Hans", "bgm");
    title(b.name, "ja", "bgm");
  }
  if (v) {
    for (const t of v.titles ?? []) title(t.title, t.lang, "vndb");
    title(v.title, "und", "vndb");
    title(v.alttitle, "ja", "vndb");
  }
  if (f && !b) {
    title(f.bangumiListedTitle, "zh-Hans", "bgm");
    title(f.actualTitle, "ja", "bgm");
  }
  const sources: any[] = [];
  if (v)
    sources.push({
      provider: "vndb",
      id: v.id,
      url: "https://vndb.org/" + v.id,
    });
  if (b || w.id.startsWith("b")) {
    const id = String(b?.id ?? w.id.slice(1));
    sources.push({ provider: "bgm", id, url: "https://bgm.tv/subject/" + id });
  }
  const cover = safe(v?.image)
    ? image(v.image, "vndb")
    : collected.alternativeCovers?.[w.id]
      ? image(collected.alternativeCovers[w.id], "vndb")
      : b && b.nsfw === false
        ? image({ url: b.images?.large }, "bgm")
        : null;
  const screenshots = (v?.screenshots ?? [])
    .filter(safe)
    .slice(0, 6)
    .map((i: any) => image(i, "vndb"))
    .filter(Boolean);
  const tags: any[] = [];
  const tagNames = new Set<string>();
  function tag(name: string, source: string) {
    if (
      name &&
      !tagNames.has(name.toLowerCase()) &&
      !/剧透|ネタバレ/i.test(name)
    ) {
      tags.push({ name, source });
      tagNames.add(name.toLowerCase());
    }
  }
  if (f && !b && f.listedGenre) tag(f.listedGenre, "bgm");
  for (const t of (b?.tags ?? []).slice(0, 12)) tag(t.name, "bgm");
  for (const t of (v?.tags ?? [])
    .filter((t: any) => t.spoiler === 0 && !t.lie && t.category !== "ero")
    .sort((a: any, b: any) => b.rating - a.rating)
    .slice(0, 12))
    tag(t.name, "vndb");
  const description = sourceText(b?.summary) || sourceText(v?.description);
  const ratings: any[] = [];
  if (v?.rating != null)
    ratings.push({
      source: "vndb",
      score: v.rating / 10,
      votes: v.votecount ?? 0,
    });
  if (b?.rating?.score > 0)
    ratings.push({
      source: "bgm",
      score: b.rating.score,
      votes: b.rating.total ?? 0,
    });
  const warnings: string[] = [];
  if (!v && !b)
    warnings.push(
      "Bangumi 公开 API 本轮未返回详情，保留已核实的标题、发售日与开发者。",
    );
  if (!cover)
    warnings.push("来源缺少可用封面或图片内容分级不符合当前展示条件。");
  return {
    workId: w.id,
    fetchedAt,
    titles,
    description,
    descriptionSource: description
      ? sourceText(b?.summary)
        ? "bgm"
        : "vndb"
      : null,
    cover,
    screenshots,
    tags: tags.slice(0, 24),
    released: b?.date ?? v?.released ?? f?.releaseDate ?? null,
    developers: (v?.developers ?? [])
      .map((d: any) => d.original || d.name)
      .concat(!v && f ? [f.developer] : []),
    languages: v?.languages ?? [],
    platforms:
      v?.platforms ??
      (b?.platform ? [b.platform] : f?.platform ? [f.platform] : []),
    ratings,
    sources,
    warnings,
  };
});
writeFileSync(
  "data/metadata-plan.json",
  JSON.stringify({ schemaVersion: 1, fetchedAt, works }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    works: works.length,
    covers: works.filter((w: any) => w.cover).length,
    screenshots: works.reduce(
      (n: number, w: any) => n + w.screenshots.length,
      0,
    ),
    descriptions: works.filter((w: any) => w.description).length,
    bangumi: works.filter((w: any) =>
      w.sources.some((s: any) => s.provider === "bgm"),
    ).length,
  }),
);
