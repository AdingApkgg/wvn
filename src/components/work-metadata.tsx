import { Link } from "react-router";
import { Badge } from "./ui/badge";
import type { WorkMetadata } from "../metadata.ts";
import { metadataSourceLabel, coverKindLabel } from "../metadata-sources.ts";
import {useState} from 'react';
import {useContentAccess} from '../content/client';
import { splitSynopsis } from "../lib/reader-experience";
export function WorkMetadataPanel({
  metadata,
  title,
}: {
  metadata: WorkMetadata;
  title: string;
}) {
  const m = metadata;
  const synopsis = splitSynopsis(m.description ?? "");
  return (
    <section className="work-metadata" aria-label="作品资料">
      {!!m.description && (
        <div className="synopsis" id="story-description">
          <h2>故事简介</h2>
          <p>{synopsis.primary}</p>
          {synopsis.original && <details><summary>阅读原文简介</summary><p>{synopsis.original}</p></details>}
          <span className="metadata-credit">
            简介来源：{metadataSourceLabel(m.descriptionSource ?? "vndb")}{m.descriptionAdapted ? "（中文整理）" : ""}
          </span>
        </div>
      )}
      {!!m.screenshots.length && (
        <section className="screenshots">
          <h2>游戏截图</h2>
          <div className="screenshot-grid">
            {m.screenshots.map((s, i) => <Screenshot key={s.url} image={s} title={title} number={i+1}/>)}
          </div>
          <p className="metadata-credit">截图来自 VNDB，点击查看大图。</p>
        </section>
      )}
      <details className="work-facts"><summary>作品资料、标签与其他标题</summary>
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
      </details>
    </section>
  );
}

function Screenshot({image,title,number}:{image:WorkMetadata['screenshots'][number];title:string;number:number}){
  const {enabled}=useContentAccess();
  const [opened,setOpened]=useState(!enabled||!image.classification?.spoiler);
  return <div>{!opened?<button type="button" className="rounded-md border p-4 text-sm" onClick={()=>setOpened(true)}>截图 {number} 可能涉及剧透 · 点击查看</button>:<><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`${title} · 截图 ${number}`} width={image.width} height={image.height} loading="lazy" decoding="async"/></a>{image.classification?.spoiler&&<button type="button" className="text-sm underline" onClick={()=>setOpened(false)}>收起截图 {number}</button>}</>}</div>;
}
