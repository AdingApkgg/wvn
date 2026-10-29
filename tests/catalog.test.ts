import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("all legacy and WebGAL entries have verified VNDB or Bangumi mappings", () => {
  const seed = JSON.parse(readFileSync("data/catalog.json", "utf8"));
  const evidence = JSON.parse(readFileSync("data/vndb-evidence.json", "utf8"));
  assert.equal(seed.versions.length, 94);
  assert.equal(seed.works.length, 72);
  assert.equal(seed.pending.length, 0);
  const bgm = JSON.parse(readFileSync("data/bangumi-evidence.json", "utf8"));
  assert.equal(
    new Set([...seed.versions, ...seed.pending].map((v: any) => v.legacyPath))
      .size,
    94,
  );
  assert.ok(seed.pending.every((p: any) => p.reason && !p.workId));
  for (const w of seed.works) {
    assert.match(w.id, /^[vb][1-9]\d*$/);
    assert.ok(w.id.startsWith("b") ? bgm[w.id] : evidence[w.id]);
    const ns = seed.versions
      .filter((v: any) => v.workId === w.id)
      .map((v: any) => v.number);
    assert.deepEqual(
      ns,
      ns.map((_: any, i: number) => i + 1),
    );
  }
  assert.notEqual(
    seed.versions.find((v: any) => v.legacyPath.includes("常规脱离")).workId,
    seed.versions.find((v: any) => v.legacyPath.includes("常轨脱离")).workId,
  );
});
