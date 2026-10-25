import { brand } from "../brand";
import {publicProjectionFetch}from"../accounts/public-projection.server.ts";
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
import {projectWorkCounts} from '../analytics/projection.server';
import {WorkInteractions} from '../components/work-stats';
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
          publicProjectionFetch(),
        )
      : null;
  const counts=await projectWorkCounts([w.id]);
  return { ...w, shares, saveVersion, saveProgress,counts:counts?.[w.id]??null };
}
export function meta({ loaderData: data }: { loaderData?: { title: string } }) {
  return [{ title: data ? `${data.title} — ${brand.shortName}` : brand.title }];
}
export default function Work() {
  const w = useLoaderData<typeof loader>();
  const primary = w.versions.find(v => v.id === w.defaultVersionId) ?? w.versions[0];
  const description = w.metadata?.description ?? "";
  const summary = (description.split("[中文简介]")[1] ?? description).trim().split(/\n\s*\n/)[0];
  return (
    <main className="container work">
      <nav className="work-breadcrumb" aria-label="面包屑"><Link to="/">发现</Link><span aria-hidden="true"> / </span><span>{w.title}</span></nav>
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
          <p className="eyebrow">{providerName(w.id)} / {w.id.replace(/^v/, "")}</p>
          <h1>{w.title}</h1>
          <p className="original">{w.originalTitle}</p>
          {summary && <p className="work-summary">{summary}</p>}
          <div className="work-read-actions">
            <Button asChild size="lg"><Link to={primary.url}>开始阅读</Link></Button>
            {w.versions.length > 1 && <Button asChild variant="outline"><a href="#work-versions">切换版本 · {w.versions.length}</a></Button>}
          </div>
          <p className="text-xs text-muted-foreground">版本 {primary.number} · {primary.language || primary.engine} · 存档按版本分别保留</p>
          <WorkInteractions key={w.id} workId={w.id} workUrl={w.url} counts={w.counts}/>
          <div className="work-section-links"><a href="#story-description">故事简介</a><a href="#player-saves">玩家存档</a><a href={providerLink(w.id)} target="_blank" rel="noreferrer">{providerName(w.id)} ↗</a></div>
        </div>
      </section>
      {w.metadata && <WorkMetadataPanel metadata={w.metadata} title={w.title} />}
      <details id="work-versions" className="work-versions" open={w.versions.length > 1 || undefined}>
        <summary>{w.versions.length > 1 ? `版本选择 · ${w.versions.length} 个版本` : "版本与检查记录"}</summary>
        <div className="version-list">
          {w.versions.map(v => <Card key={v.id} className="version">
            <span className="slot">{String(v.number).padStart(2, "0")}</span>
            <div className="version-info"><p className="eyebrow">{v.engine} · {v.language} {v.id === w.defaultVersionId && "· 默认版本"}</p><h3>{v.title}</h3>
              {v.notes && <p className="muted">{v.notes}</p>}
              <details className="version-checks"><summary>查看检查记录</summary>{v.checks.length ? v.checks.map(c => <p className="muted" key={c.kind}>{({resources:"资源",http:"HTTP",startup:"启动"})[c.kind]}：{({passed:"通过",failed:"失败",incomplete:"未完成"})[c.status]} · {c.detail} · {c.checkedAt.slice(0,10)}</p>) : <p className="muted">尚未导入本版本的检查记录</p>}</details>
            </div>
            <Button asChild variant="outline"><Link to={v.url}>阅读版本 {v.number}</Link></Button>
          </Card>)}
        </div>
        {!!w.aliases.length && <details className="metadata-titles"><summary>别名 · {w.aliases.length}</summary><div className="aliases">{w.aliases.map(x => <Badge key={x} variant="secondary">{x}</Badge>)}</div></details>}
      </details>
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
                <p className="text-xs text-muted-foreground">
                  {s.metadataBasis === "published"
                    ? "发布时版本信息"
                    : "旧分享 · 当前目录信息"}
                </p>
                {s.publicSource && (
                  <a
                    className="underline text-sm"
                    href={`${w.shares!.account}/s/${s.publicSource.id}`}
                    aria-label="查看公开来源"
                  >
                    公开来源：{s.publicSource.title}
                  </a>
                )}
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
      <p className="note">
        启动检查与完整游玩体验分别记录。旧版执行入口暂时保留，以兼容已有的存档命名。
      </p>
    </main>
  );
}
