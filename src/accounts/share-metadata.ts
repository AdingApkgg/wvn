export const SHARE_PROGRESS = {
  chapter: "章节节点",
  route: "路线起点",
  complete: "通关",
  unlock: "全解锁",
  other: "其他",
} as const;
export type ShareProgress = keyof typeof SHARE_PROGRESS;
export function isShareProgress(value: unknown): value is ShareProgress {
  return typeof value === "string" && Object.hasOwn(SHARE_PROGRESS, value);
}
