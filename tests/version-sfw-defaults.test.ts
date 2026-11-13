import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { versionContentLabel } from "../src/content/version-label.ts";
import { versionAccessError, PUBLIC_CONTENT_ACCESS } from "../src/content/policy.ts";
import type { PublicWork } from "../src/types.ts";

const read = (name: string) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), "utf8"));
const previous = read("version-nsfw-review-20261114.json");
const followup = read("version-followup-20261114.json");
const current = read("content-classification.json").records.filter((record: any) => record.kind === "version");

test("用户SFW默认和社区确证使用不同标签，未知来源本身不会放行", () => {
  const value = followup.records.find((record: any) => record.userSfwDefault).nextClassification;
  assert.equal(versionContentLabel(value), "默认 SFW · 未核实");
  assert.equal(versionContentLabel({ ...value, source: "community:VNDB:review" }), "社区标记：无成人性内容");
  assert.equal(versionContentLabel({ ...value, sexualContent: "unknown" }), "内容待核实");
  const work = { classification: { pageSuitability: "sfw" } } as PublicWork;
  assert.equal(versionAccessError(work, { classification: { ...value, sexualContent: "unknown" } } as any, PUBLIC_CONTENT_ACCESS), "SIGN_IN_REQUIRED");
});

test("仅对原39个未决版本应用策略，37个默认仍保留研究unknown与歧义", () => {
  assert.deepEqual(followup.records.map((record: any) => record.versionId).sort(), previous.records.filter((record: any) => record.decision === "unknown").map((record: any) => record.versionId).sort());
  assert.equal(new Set(followup.records.map((record: any) => record.versionId)).size, 39);
  const defaults = followup.records.filter((record: any) => record.userSfwDefault);
  assert.equal(defaults.length, 37);
  for (const record of followup.records) {
    const actual = current.find((item: any) => item.id === record.versionId).classification;
    assert.deepEqual(actual, record.nextClassification);
    assert.equal(record.previousClassification.sexualContent, "unknown");
    assert.equal(actual.revision, record.previousClassification.revision + 1);
    assert.equal(actual.titleSafe, record.previousClassification.titleSafe);
    assert.equal(actual.ageRating, record.previousClassification.ageRating);
    const group = read(record.researchFile.replace(/^data\//, ""));
    const evidence = group.records.find((item: any) => item.versionId === record.versionId);
    assert.equal(record.researchDecision, evidence.researchDecision);
    if (record.userSfwDefault) {
      assert.equal(record.researchDecision, "unknown");
      assert.equal(actual.sexualContent, "none");
      assert.match(actual.source, /^user-default:sfw-unverified:/);
      assert.match(actual.reason, /用户明确要求/);
      assert.match(actual.reason, /未核实/);
      assert.ok(record.reason);
    } else {
      assert.equal(record.researchDecision, "present");
      assert.equal(actual.sexualContent, "present");
      assert.match(actual.source, /^community:VNDB:/);
    }
  }
});

test("既有55个已决版本不被默认覆盖，最终44个成人与50个SFW可追溯", () => {
  for (const record of previous.records.filter((record: any) => record.decision !== "unknown")) {
    assert.deepEqual(current.find((item: any) => item.id === record.versionId).classification, record.nextClassification);
  }
  assert.equal(current.filter((record: any) => record.classification.sexualContent === "present").length, 44);
  assert.equal(current.filter((record: any) => record.classification.sexualContent === "none").length, 50);
  assert.equal(current.filter((record: any) => record.classification.sexualContent === "unknown").length, 0);
});
