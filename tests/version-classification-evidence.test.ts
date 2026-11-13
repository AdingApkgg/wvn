import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const catalog = read("catalog.json");
const audit = read("version-nsfw-review-20261114.json");
const index = read("version-release-index-20261114.json");
const classifications = read("content-classification.json");

test("94个版本逐项对应社区审计，保留标题审核和年龄证据边界", () => {
  const ids = catalog.versions.map((version: any) => version.id).sort();
  assert.equal(new Set(audit.records.map((record: any) => record.versionId)).size, 94);
  assert.deepEqual(audit.records.map((record: any) => record.versionId).sort(), ids);
  const totals: Record<string, number> = { present: 0, none: 0, unknown: 0 };
  for (const record of audit.records) {
    const actual = classifications.records.find((item: any) => item.kind === "version" && item.id === record.versionId).classification;
    assert.deepEqual(actual, record.nextClassification, record.versionId);
    assert.equal(actual.sexualContent, record.decision);
    assert.equal(actual.titleSafe, record.previousClassification.titleSafe);
    assert.equal(actual.ageRating, record.previousClassification.ageRating, "不能把某个上游版年龄复制到当前包");
    if (record.sourceSites.length) assert.ok(actual.source.startsWith(`community:${record.sourceSites.join("+")}:`));
    else assert.ok(actual.source.startsWith("audit:local:"));
    assert.match(actual.reason, /社区/);
    assert.ok(record.reason && record.evidenceScope && record.packageEvidence.controlSha1);
    totals[record.decision]++;
    const source = read(record.communityResearch.replace(/^data\//, ""));
    const work = source.works.find((work: any) => work.workId === record.workId);
    const version = work.versions.find((version: any) => (version.versionId ?? version.id) === record.versionId);
    assert.equal(record.decision, version.suggestedSexualContent ?? work.suggestedSexualContent);
  }
  assert.deepEqual(totals, { present: 42, none: 13, unknown: 39 });
});

test("社区标记与完整发行事实对应，不能从封面SFW或18岁单独推导性内容", () => {
  assert.equal(index.works.length, 72);
  assert.equal(new Set(index.works.flatMap((work: any) => work.releaseCandidates.map((release: any) => release.id))).size, 1088);
  for (const record of audit.records) {
    const work = index.works.find((work: any) => work.workId === record.workId);
    assert.deepEqual(record.upstreamCandidateIds, work.releaseCandidates.map((release: any) => release.id));
    if (record.decision === "none") {
      assert.ok(work.releaseCandidates.length > 0);
      assert.ok(work.releaseCandidates.every((release: any) => release.hasEro === false), record.workId);
    }
    if (record.decision === "present") {
      assert.ok(work.releaseCandidates.some((release: any) => release.hasEro === true), record.workId);
    }
  }
  for (const workId of ["v26310", "v32805", "v1286", "v44184"]) {
    assert.ok(audit.records.filter((record: any) => record.workId === workId).every((record: any) => record.decision === "unknown"));
  }
});
