import type { VersionClassification } from "./types.ts";

/** 仅汇总当前可见版本，不把页面适宜性或默认值当成版本核实结论。 */
export function workContentLabels(versions: { classification?: VersionClassification }[]): string[] {
  const labels = new Set<string>(versions.map(({ classification }) => {
    if (classification?.sexualContent === "present") return "NSFW";
    if (classification?.sexualContent === "none") {
      return classification.source.startsWith("user-default:sfw-unverified:") ? "默认 SFW · 未核实" : "SFW";
    }
    return "内容待核实";
  }));
  return ["NSFW", "SFW", "默认 SFW · 未核实", "内容待核实"].filter(label => labels.has(label));
}

export function versionContentLabel(classification: VersionClassification) {
  if (classification.sexualContent === "none" && classification.source.startsWith("user-default:sfw-unverified:")) {
    return "默认 SFW · 未核实";
  }
  if (classification.source.startsWith("community:") && classification.sexualContent !== "unknown") {
    return `社区标记：${classification.sexualContent === "none" ? "无" : "含"}成人性内容`;
  }
  return { none: "已确认不含成人性内容", present: "含成人性内容", unknown: "内容待核实" }[classification.sexualContent];
}
