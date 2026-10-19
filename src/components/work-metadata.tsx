import { Link } from "react-router";
import { Badge } from "./ui/badge";
import type { WorkMetadata } from "../metadata.ts";
import { metadataSourceLabel, coverKindLabel } from "../metadata-sources.ts";
export function WorkMetadataPanel({
  metadata,
  title,
}: {
  metadata: WorkMetadata;
  title: string;
}) {
  const m = metadata;
  return (
    <section className="work-metadata" aria-label="作品资料">
      <div className="metadata-facts">
        {m.released && (
          <div>
            <span>发售日期</span>
            <strong>{m.released}</strong>
          </div>
        )}
        {!!m.developers.length && (
          <div>
            <span>开发</span>
            <strong>{m.developers.join(" / ")}</strong>
          </div>
        )}
        {!!m.languages.length && (
          <div>
            <span>收录语言</span>
            <strong>{m.languages.join(" / ")}</strong>
          </div>
        )}
        {!!m.platforms.length && (
          <div>
            <span>原作平台</span>
            <strong>{m.platforms.join(" / ")}</strong>
          </div>
        )}
        {m.ratings.map((r) => (
          <div key={r.source}>
            <span>{r.source === "vndb" ? "VNDB" : "BGM"} 评分</span>
            <strong>
              {r.score.toFixed(1)} <small>/ 10 · {r.votes} 票</small>
            </strong>
          </div>
        ))}
      </div>
      {!!m.tags.length && (
        <div className="metadata-tags" aria-label="作品标签">
          {m.tags.map((t) => (
            <Link
              key={t.source + t.name}
              to={"/?tag=" + encodeURIComponent(t.name)}
              title={"来源：" + (t.source === "bgm" ? "BGM" : "VNDB")}
            >
              <Badge variant="outline">{t.name}</Badge>
            </Link>
          ))}
        </div>
      )}
      {!!m.description && (
        <div className="synopsis">
          <h2>故事简介</h2>
          <p>{m.description}</p>
          <span className="metadata-credit">
            简介来源：{metadataSourceLabel(m.descriptionSource ?? "vndb")}{m.descriptionAdapted ? "（中文整理）" : ""}
          </span>
        </div>
      )}
      {!!m.titles.length && (
        <details className="metadata-titles">
          <summary>其他标题 · {m.titles.length}</summary>
          <ul>
            {m.titles.map((t) => (
              <li key={t.title}>
                <span>{t.lang}</span>
                {t.title}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!m.screenshots.length && (
        <section className="screenshots">
          <h2>游戏截图</h2>
          <div className="screenshot-grid">
            {m.screenshots.map((s, i) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                <img
                  src={s.url}
                  alt={title + " · 截图 " + (i + 1)}
                  width={s.width}
                  height={s.height}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            ))}
          </div>
          <p className="metadata-credit">截图来自 VNDB，点击查看大图。</p>
        </section>
      )}
      <p className="metadata-credit">
        {m.cover && <>{coverKindLabel(m.cover.kind)} · {metadataSourceLabel(m.cover.source)}<br /></>}
        资料来源：
        {m.sources.map((s, i) => (
          <span key={s.provider + s.id}>
            {i ? " · " : ""}
            <a href={s.url} target="_blank" rel="noreferrer">
              {metadataSourceLabel(s.provider, s.id)} ↗
            </a>
          </span>
        ))}{" "}
        · 更新于 {m.fetchedAt.slice(0, 10)}
      </p>
      {!!m.warnings.length && (
        <p className="metadata-credit">{m.warnings.join(" ")}</p>
      )}
    </section>
  );
}
