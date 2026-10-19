import { WorkMetadataPanel } from "../components/work-metadata";
import { coverKindLabel } from "../metadata-sources.ts";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Link, useLoaderData } from "react-router";
import { parseWorkSlug, providerLink, providerName } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
export function loader({ params }: { params: { workId?: string } }) {
  const id = parseWorkSlug(params.workId ?? "");
  if (!id) throw new Response(null, { status: 404 });
  const w = getStore().get(id);
  if (!w?.versions.length) throw new Response(null, { status: 404 });
  return w;
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
            className={"work-cover" + (w.metadata.cover.kind ? " cover-fit" : "")}
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
      {w.metadata && (
        <WorkMetadataPanel metadata={w.metadata} title={w.title} />
      )}
      <p className="note">
        启动检查与完整游玩体验分别记录。旧版执行入口暂时保留，以兼容已有的存档命名。
      </p>
    </main>
  );
}
