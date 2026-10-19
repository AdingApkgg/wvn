import { readFile, mkdir, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
const base = process.env.WG_TEST_URL ?? "http://127.0.0.1:8281";
const document = JSON.parse(await readFile("data/metadata.json", "utf8"));
const catalog = await (await fetch(base + "/api/catalog")).json();
const images = new Set();
const errors = [];
for (const expected of document.works) {
  const actual = catalog.find((w) => w.id === expected.workId)?.metadata;
  if (!isDeepStrictEqual(actual, expected))
    errors.push({
      workId: expected.workId,
      error: "Published metadata differs from reviewed snapshot",
    });
  for (const image of [expected.cover, ...expected.screenshots].filter(Boolean))
    images.add(image.url);
}
for (const path of images) {
  try {
    const r = await fetch(base + path, { method: "HEAD" });
    if (
      r.status !== 200 ||
      !r.headers.get("content-type")?.startsWith("image/") ||
      Number(r.headers.get("content-length")) <= 0
    )
      errors.push({ path, status: r.status });
  } catch (e) {
    errors.push({ path, error: String(e) });
  }
}
await mkdir("reports", { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  works: document.works.length,
  covers: document.works.filter((w) => w.cover).length,
  screenshots: document.works.reduce((n, w) => n + w.screenshots.length, 0),
  images: images.size,
  errors,
};
await writeFile(
  "reports/metadata-http-verification.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
if (errors.length) process.exitCode = 1;
