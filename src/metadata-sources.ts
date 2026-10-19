import reviewedSources from "../data/metadata-official-sources.json" with { type: "json" };
export const officialSources: Record<string, { workId: string; label: string; url: string; images: string[] }> = reviewedSources;
export function metadataSourceLabel(value: string, id?: string): string {
  return value === "official" ? (id ? officialSources[id]?.label : undefined) ?? "官方来源" : value === "bgm" ? "Bangumi" : "VNDB";
}
export function coverKindLabel(kind?: string): string {
  return kind === "logo" ? "官方标题图" : kind === "promotion" ? "官方宣传图" : kind === "screenshot" ? "游戏画面（封面备用）" : "封面";
}
