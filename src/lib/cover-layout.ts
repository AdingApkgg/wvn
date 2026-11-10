/** 沿用封面墙规则：布局适应原图，Logo 独立使用横卡，极窄图允许留边。 */
export function coverLayout(cover: {width?: number; height?: number; kind?: string} | null | undefined, naturalRatio?: number) {
  const sourceRatio = naturalRatio ?? (
    cover?.width && cover.height ? cover.width / cover.height :
    cover?.kind === 'logo' ? 2.4 : cover?.kind === 'promotion' ? 16 / 9 : 2 / 3
  );
  return {ratio: Math.max(0.5, sourceRatio), wide: cover?.kind === 'logo' || sourceRatio > 2.2};
}
