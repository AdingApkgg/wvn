import { WorkMetadataPanel } from "../components/work-metadata";
import { coverKindLabel } from "../metadata-sources.ts";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Link, useLoaderData } from "react-router";
import { parseWorkSlug, providerLink, providerName } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
import { projectShares } from "../server/share-projection";
import { SHARE_PROGRESS, isShareProgress } from "../accounts/share-metadata";
export async function loader({
  params,
  request,
}: {
  params: { workId?: string };
  request: Request;
}) {
  const id = parseWorkSlug(params.workId ?? "");
  if (!id) throw new Response(null, { status: 404 });
  const w = getStore().get(id);
  if (!w?.versions.length) throw new Response(null, { status: 404 });
  const url = new URL(request.url);
  const version = url.searchParams.get("saveVersion") ?? "";
  const progress = url.searchParams.get("saveProgress") ?? "";
  const saveVersion = w.versions.some((v) => v.id === version) ? version : "";
  const saveProgress = isShareProgress(progress) ? progress : "";
  const shares =
    process.env.WG_SHARE_BACKEND_ORIGIN && process.env.WG_SHARE_ACCOUNT_ORIGIN
      ? await projectShares(
          w.id,
          new Set(w.versions.map((v) => v.id)),
          {
            backend: process.env.WG_SHARE_BACKEND_ORIGIN,
            account: process.env.WG_SHARE_ACCOUNT_ORIGIN,
          },
          {
            version: saveVersion || undefined,
            progress: saveProgress || undefined,
            cursor: url.searchParams.get("saveCursor") ?? undefined,
          },
        )
      : null;
  return { ...w, shares, saveVersion, saveProgress };
}
export function meta({ loaderData: data }: { loaderData?: { title: string } }) {
  return [{ title: data ? `${data.title} — WG` : "WG · 故事放映室" }];
}
export default function Work() {
  const w = useLoaderData<typeof loader>();
  return (
    <main className="container work">
      <Link className="brand" to="/">
        WG<span>故事放映室</span>
      </Link>
      <nav>
        <Link to="/">故事目录</Link> / {w.title}
      </nav>
      <section
        className={"work-heading" + (w.metadata?.cover ? " has-cover" : "")}
      >
        {w.metadata?.cover && (
          <img
            className={
              "work-cover" + (w.metadata.cover.kind ? " cover-fit" : "")
            }
            src={w.metadata.cover.url}
            alt={w.title + " " + coverKindLabel(w.metadata.cover.kind)}
            width={w.metadata.cover.width}
            height={w.metadata.cover.height}
          />
        )}
        <div className="work-heading-body">
          <p className="eyebrow">
            {w.id.toUpperCase()} / {w.versions.length} VERSIONS
          </p>
          <h1>{w.title}</h1>
          <p className="original">{w.originalTitle}</p>
          <div className="aliases">
            {w.aliases.slice(0, 8).map((x) => (
              <Badge key={x} variant="secondary">
                {x}
              </Badge>
            ))}
          </div>
        </div>
        <Button asChild variant="outline" className="external">
          <a href={providerLink(w.id)} target="_blank" rel="noreferrer">
            在 {providerName(w.id)} 查看 ↗
          </a>
        </Button>
      </section>
      <div className="section-title">
        <h2>选择一个版本</h2>
        <span>编号固定，存档各自保留</span>
      </div>
      <div className="version-list">
        {w.versions.map((v) => (
          <Card key={v.id} className="version">
            <span className="slot">{String(v.number).padStart(2, "0")}</span>
            <div className="version-info">
              <p className="eyebrow">
                {v.engine} · {v.language}{" "}
                {v.id === w.defaultVersionId && "· 默认版本"}
              </p>
              <h2>{v.title}</h2>
              {v.notes && <p className="muted">{v.notes}</p>}
              <p className="muted">
                {v.checks.length
                  ? v.checks
                      .map(
                        (c) =>
                          `${{ resources: "资源", http: "HTTP", startup: "启动" }[c.kind]}：${{ passed: "通过", failed: "失败", incomplete: "未完成" }[c.status]}`,
                      )
                      .join(" · ")
                  : "尚未导入本版本的检查记录"}
              </p>
              {v.checks.map((c) => (
                <small key={c.kind}>
                  {c.detail} · {c.checkedAt.slice(0, 10)}
                </small>
              ))}
            </div>
            <Button asChild className="story-start">
              <Link to={v.url}>开始 ↗</Link>
            </Button>
          </Card>
        ))}
      </div>
      {w.shares && (
        <section className="share-gallery space-y-5" id="player-saves">
          <div className="section-title">
            <h2>玩家存档</h2>
            <span>固定快照 · 按版本选择</span>
          </div>
          <form method="get" className="flex flex-wrap gap-3 items-center">
            <label htmlFor="share-version-filter">游戏版本</label>
            <select
              id="share-version-filter"
              name="saveVersion"
              key={w.saveVersion}
              defaultValue={w.saveVersion}
            >
              <option value="">全部版本</option>
              {w.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  版本 {v.number} · {v.title}
                </option>
              ))}
            </select>
            <label htmlFor="share-progress-filter">进度类型</label>
            <select
              id="share-progress-filter"
              name="saveProgress"
              key={w.saveProgress}
              defaultValue={w.saveProgress}
            >
              <option value="">全部进度</option>
              {Object.entries(SHARE_PROGRESS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              筛选玩家存档
            </Button>
          </form>
          {!w.shares.available ? (
            <p className="text-muted-foreground">
              玩家存档暂时无法读取，游戏入口仍可使用。
            </p>
          ) : !w.shares.items.length ? (
            <p className="text-muted-foreground">
              这个版本还没有公开分享。可从自己的云端备份发布。
            </p>
          ) : (
            w.shares.items.map((s) => (
              <Card
                className="p-5 space-y-3"
                key={s.id}
                data-public-share-id={s.id}
              >
                <h3>
                  <a
                    href={`${w.shares!.account}/s/${s.id}`}
                    className="underline"
                  >
                    {s.title}
                  </a>
                </h3>
                <p className="text-sm text-muted-foreground">
                  {s.author} · 版本 {s.version.number} · {s.version.title} ·{" "}
                  {(s.bytes / 1024).toFixed(1)} KiB ·{" "}
                  {SHARE_PROGRESS[s.progress]}
                </p>
                {s.spoiler ? (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      展开剧透说明
                    </summary>
                    <p className="whitespace-pre-wrap break-words mt-2">
                      {s.description}
                    </p>
                  </details>
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {s.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  版本由作者标注；文件完整性校验不等于游戏内读档验证。
                </p>
              </Card>
            ))
          )}
          {w.shares.next && (
            <Button variant="outline" asChild>
              <Link
                to={`?${new URLSearchParams({ ...(w.saveVersion ? { saveVersion: w.saveVersion } : {}), ...(w.saveProgress ? { saveProgress: w.saveProgress } : {}), saveCursor: w.shares.next })}#player-saves`}
              >
                更多玩家存档
              </Link>
            </Button>
          )}
          <Button variant="link" asChild>
            <a href={w.shares.account + "/account"}>从我的云备份分享</a>
          </Button>
        </section>
      )}
      {w.metadata && (
        <WorkMetadataPanel metadata={w.metadata} title={w.title} />
      )}
      <p className="note">
        启动检查与完整游玩体验分别记录。旧版执行入口暂时保留，以兼容已有的存档命名。
      </p>
    </main>
  );
}
