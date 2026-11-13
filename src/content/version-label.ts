import type { VersionClassification } from "./types.ts";

export function versionContentLabel(classification: VersionClassification) {
  if (classification.sexualContent === "none" && classification.source.startsWith("user-default:sfw-unverified:")) {
    return "默认 SFW · 未核实";
  }
  if (classification.source.startsWith("community:") && classification.sexualContent !== "unknown") {
    return `社区标记：${classification.sexualContent === "none" ? "无" : "含"}成人性内容`;
  }
  return { none: "已确认不含成人性内容", present: "含成人性内容", unknown: "内容待核实" }[classification.sexualContent];
}
