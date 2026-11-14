import { test } from "node:test";
import assert from "node:assert/strict";
import { workContentLabels } from "../src/content/version-label.ts";
import type { VersionClassification } from "../src/content/types.ts";

const version = (sexualContent: VersionClassification["sexualContent"], source = "community:VNDB:review") => ({
  classification: { sexualContent, source, titleSafe: true, reason: "review", reviewedAt: "2026-11-14T00:00:00Z", revision: 1 },
});

test("混合版本同时提示NSFW和SFW，默认SFW不混同为确证，重复版本不重复标签", () => {
  assert.deepEqual(workContentLabels([
    version("none", "user-default:sfw-unverified:review"), version("none"), version("present"), version("present"),
  ]), ["NSFW", "SFW", "默认 SFW · 未核实"]);
});

test("只汇总提供的可见版本，缺失或未知分类保持待核实", () => {
  assert.deepEqual(workContentLabels([version("none")]), ["SFW"]);
  assert.deepEqual(workContentLabels([{}, version("unknown")]), ["内容待核实"]);
  assert.deepEqual(workContentLabels([]), []);
});
