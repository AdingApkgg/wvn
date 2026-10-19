import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { metadataDocument } from "../src/metadata.ts";
const document = metadataDocument.parse(JSON.parse(readFileSync("data/metadata.json", "utf8")));
const supplements = JSON.parse(readFileSync("data/metadata-supplements.json", "utf8"));
const fetchedAt = new Date().toISOString();
const changed: string[] = [];
const seen = new Set<string>();
for (const item of supplements.items) {
  if (seen.has(item.workId)) throw Error("重复补充作品");
  seen.add(item.workId);
  const work = document.works.find(w => w.workId === item.workId);
  if (!work) throw Error("补充作品不存在：" + item.workId);
  const before = JSON.stringify(work);
  if (item.cover) {
    if (work.cover && work.cover.sourceUrl !== item.cover.sourceUrl) throw Error("拒绝覆盖已有封面：" + item.workId);
    if (!work.cover) work.cover = {
      ...item.cover,
      url: item.cover.url ?? "/media/" + createHash("sha256").update(item.cover.sourceUrl).digest("hex") + ".jpg",
    };
  }
  if (item.description) {
    if (work.description && work.description !== item.description) throw Error("拒绝覆盖已有简介：" + item.workId);
    work.description = item.description;
    work.descriptionSource = item.descriptionSource;
    work.descriptionAdapted = item.descriptionAdapted;
  }
  for (const source of item.sources) {
    const old = work.sources.find(s => s.provider === source.provider && s.id === source.id);
    if (old && old.url !== source.url) throw Error("来源地址不符");
    if (!old) work.sources.push(source);
  }
  if (work.cover) work.warnings = work.warnings.filter(w => !w.includes("缺少可用封面") && !w.includes("封面缓存失败"));
  if (item.workId === "b315601") work.warnings = ["BGM 公开 API 未返回详情；简介和宣传图由发行商资料补充，作品身份仍采用已核实的 BGM 编号。"];
  if (JSON.stringify(work) !== before) {
    work.fetchedAt = fetchedAt;
    changed.push(work.workId);
  }
}
document.fetchedAt = fetchedAt;
metadataDocument.parse(document);
writeFileSync("data/metadata-plan.json", JSON.stringify(document, null, 2) + "\n");
console.log(JSON.stringify({ changed: changed.length, workIds: changed, works: document.works.length }));
