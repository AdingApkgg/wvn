import { brand } from "../brand";
import { useState, type CSSProperties } from "react";
import type { PublicWork } from "../types.ts";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Badge } from "../components/ui/badge";
import { RecentReading } from "../components/recent-reading";
import { Search } from "lucide-react";
import { data, Form, Link, useLoaderData } from "react-router";
import { workSlug } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
import { loadCatalog } from "../search/runtime.server.ts";
import {WorkCountSummary} from '../components/work-stats';
import type {WorkCounts} from '../accounts/work-stats.server';
export function meta() {
  return [
    { title: brand.title },
    { name: "description", content: brand.description },
  ];
}
export async function loader({ request }: { request: Request }) {
  const result = await loadCatalog(request, getStore());
  return data(result, { status: result.searchStatus });
}

export default function Catalog() {
  const { items,counts, recentWorks, q, engine, state, tag, total, versions, isSearch, searchError, nextSearchUrl } =
    useLoaderData<typeof loader>();
  return (
    <>
      <main className="container catalog-page">
        <section className="catalog-heading">
          <div><p className="eyebrow">{brand.fullName}</p><h1>{brand.translation}</h1><p className="catalog-description">{brand.description}</p></div>
          <p>{total} 部作品 <span aria-hidden="true">·</span> {versions} 个版本</p>
        </section>
        <Form key={q + engine + state + tag} className="catalog-search" method="get" role="search">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <div className="search-row">
            <div className="search field"><Label htmlFor="catalog-search">搜索作品</Label><Input id="catalog-search" type="search" name="q" defaultValue={q} placeholder="标题、别名或 VNDB / BGM 编号" /></div>
            <Button type="submit"><Search aria-hidden="true" />查找</Button>
            {(q || engine || state || tag) && <Button asChild variant="ghost"><Link to="/">清除</Link></Button>}
          </div>
          <details className="advanced-filters" open={!!(engine || state) || undefined}>
            <summary>高级筛选</summary>
            <div className="advanced-filter-fields">
              <div className="field"><Label htmlFor="catalog-engine">引擎</Label><NativeSelect id="catalog-engine" name="engine" defaultValue={engine}><NativeSelectOption value="">全部引擎</NativeSelectOption>{["ONS", "Artemis", "RenPy", "Tyrano"].map(x => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></div>
              <div className="field"><Label htmlFor="catalog-state">检查记录</Label><NativeSelect id="catalog-state" name="state" defaultValue={state}><NativeSelectOption value="">全部状态</NativeSelectOption><NativeSelectOption value="unchecked">未导入检查</NativeSelectOption><NativeSelectOption value="passed">有通过记录</NativeSelectOption><NativeSelectOption value="failed">有失败记录</NativeSelectOption><NativeSelectOption value="incomplete">检查未完成</NativeSelectOption></NativeSelect></div>
              <p className="text-xs text-muted-foreground">检查记录仅反映已执行的项目。</p>
            </div>
          </details>
        </Form>
        {!q && !engine && !state && !tag && <RecentReading works={recentWorks} />}
        <div className="section-title">
          <h2>故事目录</h2>
          <span>
            {tag ? "标签：" + tag + " · " : ""}
            {searchError ? "搜索未完成" : (isSearch ? `本页 ${items.length} 部作品` : `${items.length} 部作品`)}
          </span>
        </div>
        <div className="story-grid">
          {items.map((w, i) => (
            <StoryCard key={w.id} work={w} index={i} counts={counts?.[w.id]}/>
          ))}
        </div>
        {searchError && (
          <div className="empty" role="alert">
            <h2>{searchError}</h2>
            <p>可以稍后重试，或先浏览全部故事。</p>
            <Button asChild variant="outline"><Link to="/">浏览全部故事</Link></Button>
          </div>
        )}
        {!searchError && !items.length && (
          <div className="empty">
            <h2>暂时没有匹配的故事</h2>
            <p>试试其他标题、别名或编号。</p>
            <Button asChild variant="outline">
              <Link to="/">清除筛选</Link>
            </Button>
          </div>
        )}
        {!searchError && nextSearchUrl && (
          <nav aria-label="搜索分页" className="section-title">
            <span>当前为本页可见作品</span>
            <Button asChild variant="outline"><Link to={nextSearchUrl}>下一页</Link></Button>
          </nav>
        )}
        <footer>
          <span>{brand.shortName} · {brand.fullName} · {brand.translation}</span>
          <span>检查记录仅反映已执行的项目。</span>
        </footer>
      </main>
    </>
  );
}


function StoryCard({ work: w, index: i,counts }: { work: PublicWork; index: number;counts?:WorkCounts }) {
  const cover = w.metadata?.cover;
  const [naturalRatio, setNaturalRatio] = useState<number>();
  const sourceRatio = naturalRatio ?? (
    cover?.width && cover.height ? cover.width / cover.height :
    cover?.kind === "logo" ? 2.4 : cover?.kind === "promotion" ? 16 / 9 : 2 / 3
  );
  const wide = cover?.kind === "logo" || sourceRatio > 2.2;
  const ratio = Math.max(0.5, sourceRatio);
  return (
    <Link
      to={w.url}
      className={"story-card" + (wide ? " story-card-wide" : "")}
      style={{ "--cover-ratio": ratio } as CSSProperties}
    >
      <div className={"card-art tone-" + (i % 5)} aria-hidden="true">
        {cover && (
          <img
            className={"cover-image" + (cover.kind ? " cover-fit" : "")}
            src={cover.url}
            alt=""
            loading="lazy"
            decoding="async"
            width={cover.width}
            height={cover.height}
            onLoad={(e) => {
              const image = e.currentTarget;
              if (image.naturalHeight) setNaturalRatio(image.naturalWidth / image.naturalHeight);
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <span className="art-line" />
        <span className="art-symbol">{["✦", "◌", "✧", "◇", "⋆"][i % 5]}</span>
        <span className="art-word">STORY / {w.versions[0].engine.toUpperCase()}</span>
      </div>
      <div className="card-body">
        <div className="card-meta">
          <span className="eyebrow">
            {[...new Set(w.versions.map((v) => v.engine))].join(" / ")}
          </span>
          <span className="card-work-id">{workSlug(w.id)}</span>
        </div>
        <h3>{w.title}</h3>
        <p>{w.originalTitle}</p>
        <WorkCountSummary counts={counts}/>
        <div className="card-footer">
          <Badge variant="secondary">{w.versions.length} 个版本</Badge>
          <span>阅读详情 ↗</span>
        </div>
      </div>
    </Link>
  );
}
