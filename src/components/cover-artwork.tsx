import { useCallback, useState } from "react";
import type { PublicWork } from "../types.ts";
import type { WorkMetadata } from "../metadata.ts";

const messages = {
  missing: ["暂无封面", "来源尚未提供图片"],
  unavailable: ["封面暂不可用", "图片缓存或校验失败"],
  unreviewed: ["封面待审核", "核实图片内容后展示"],
  restricted: ["封面已隐藏", "图片不符合公共展示要求"],
  failed: ["封面加载失败", "请刷新页面重试"],
} as const;

export function CoverPlaceholder({ status }: { status?: PublicWork["coverStatus"] | "failed" }) {
  const [title, description] = messages[status && status !== "available" ? status : "missing"];
  return <span className="cover-placeholder"><span aria-hidden="true">◇</span><strong>{title}</strong><span>{description}</span></span>;
}

type Cover = NonNullable<WorkMetadata["cover"]>;
// 调用方以 URL 为 key；切换封面后不会继承上一张图片的失败状态。
export function CoverImage({ cover, alt = "", className = "cover-image", onDimensions }: { cover: Cover; alt?: string; className?: string; onDimensions?: (image: HTMLImageElement) => void }) {
  const [failed, setFailed] = useState(false);
  const inspect = useCallback((image: HTMLImageElement | null) => {
    if (!image) return;
    if (image.naturalHeight) onDimensions?.(image);
    else if (image.complete) setFailed(true);
  }, [onDimensions]);
  if (failed) return <CoverPlaceholder status="failed" />;
  return <img className={className + (cover.kind ? " cover-fit" : "")} src={cover.url} alt={alt}
    loading="lazy" decoding="async" width={cover.width} height={cover.height} ref={inspect}
    onLoad={event => onDimensions?.(event.currentTarget)} onError={() => setFailed(true)} />;
}
