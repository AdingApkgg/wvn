import { brand } from "../brand";
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
import { data, Form, Link, useLoaderData, useLocation } from "react-router";
import { withoutFilter } from "../lib/reader-experience";
import { workSlug } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
import { loadCatalog } from "../search/runtime.server.ts";
import {WorkCountSummary} from '../components/work-stats';
import type {WorkCounts} from '../accounts/work-stats.server';
import {getContentAccess} from '../content/access.server.ts';
import {projectWork} from '../content/policy';
import {useContentAccess} from '../content/client';
export function meta() {
  return [
    { title: brand.title },
    { name: "description", content: brand.description },
  ];
}
export async function loader({ request }: { request: Request }) {
  const result = await loadCatalog(request, getStore());
  const access=result.contentGate?await getContentAccess(request):null;
  return data({...result,contentVisibility:access?(access.canViewRestricted?'restricted':'public'):null}, { status: result.searchStatus });
}

export default function Catalog() {
  const loaded=useLoaderData<typeof loader>();
  const viewer=useContentAccess();
  const location = useLocation();
  const { counts, recentWorks, q, engine, state, tag, content, contentGate, isSearch, searchError }=loaded;
  const items=viewer.enabled?loaded.items.flatMap(work=>{const projected=projectWork(work,viewer.access);return projected?[projected]:[]}):loaded.items;
  const staleRestricted=viewer.enabled&&!viewer.access.canViewRestricted&&loaded.contentVisibility==='restricted';
  const total=staleRestricted?items.length:loaded.total;
  const versions=staleRestricted?items.reduce((sum,work)=>sum+work.versions.length,0):loaded.versions;
  const nextSearchUrl=staleRestricted?null:loaded.nextSearchUrl;
  const recentKey=String(loaded.contentVisibility)+':'+JSON.stringify(recentWorks);
  const stateLabels:Record<string,string>={unchecked:"未导入检查",passed:"有通过记录",failed:"有失败记录",incomplete:"检查未完成"};
  const contentLabels:Record<string,string>={none:"不含成人性内容",present:"含成人性内容",unknown:"内容待核实"};
  const filterValue=(key:string,value:string)=>key==="state"?(stateLabels[value]??value):key==="content"?(contentLabels[value]??value):value;
  return (
    <>
      <main className="container catalog-page">
        <section className="catalog-heading">
          <div><p className="eyebrow">{brand.fullName}</p><h1>找一段想读的故事</h1><p className="catalog-description">在浏览器中开始阅读，把喜欢的作品放进书架。</p></div>
          <p>{total} 部作品 <span aria-hidden="true">·</span> {versions} 个版本</p>
        </section>
        <Form key={q + engine + state + tag + content} className="catalog-search" method="get" role="search">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <div className="search-row">
            <div className="search field"><Label htmlFor="catalog-search">搜索作品</Label><Input id="catalog-search" type="search" name="q" defaultValue={q} placeholder="标题、别名或 VNDB / BGM 编号" /></div>
            <Button type="submit"><Search aria-hidden="true" />查找</Button>
            {(q || engine || state || tag || content) && <Button asChild variant="ghost"><Link to="/">清除</Link></Button>}
          </div>
          <details className="advanced-filters" open={!!(engine || state || content) || undefined}>
            <summary>筛选作品</summary>
            <div className="advanced-filter-fields">
              <p className="text-sm text-muted-foreground">引擎和检查记录为技术筛选；日常阅读可保持全部。</p>
              <div className="field"><Label htmlFor="catalog-engine">引擎</Label><NativeSelect id="catalog-engine" name="engine" defaultValue={engine}><NativeSelectOption value="">全部引擎</NativeSelectOption>{["ONS", "Artemis", "RenPy", "Tyrano"].map(x => <NativeSelectOption key={x}>{x}</NativeSelectOption>)}</NativeSelect></div>
              <div className="field"><Label htmlFor="catalog-state">检查记录</Label><NativeSelect id="catalog-state" name="state" defaultValue={state}><NativeSelectOption value="">全部状态</NativeSelectOption><NativeSelectOption value="unchecked">未导入检查</NativeSelectOption><NativeSelectOption value="passed">有通过记录</NativeSelectOption><NativeSelectOption value="failed">有失败记录</NativeSelectOption><NativeSelectOption value="incomplete">检查未完成</NativeSelectOption></NativeSelect></div>
              {contentGate && <div className="field"><Label htmlFor="catalog-content">版本内容</Label><NativeSelect id="catalog-content" name="content" defaultValue={content}><NativeSelectOption value="">全部可见版本</NativeSelectOption><NativeSelectOption value="none">已确认不含成人性内容</NativeSelectOption><NativeSelectOption value="present">含成人性内容</NativeSelectOption><NativeSelectOption value="unknown">内容待核实</NativeSelectOption></NativeSelect></div>}
              <p className="text-xs text-muted-foreground">检查记录仅反映已执行的项目。</p>
            </div>
          </details>
          <div className="applied-filters" aria-label="已应用筛选">
            {([["q", q, "搜索"], ["engine", engine, "引擎"], ["state", state, "检查"], ["tag", tag, "标签"], ["content", content, "内容"]] as const).filter(([,value])=>value).map(([key,value,label])=><Link className="filter-chip" key={key} to={withoutFilter(location.search,key)} aria-label={`移除${label}筛选：${filterValue(key,value)}`}>{label}：{filterValue(key,value)}<span aria-hidden="true">×</span></Link>)}
          </div>
        </Form>
        {!q && !engine && !state && !tag && !content && !staleRestricted && <RecentReading key={recentKey} works={recentWorks} />}
        {staleRestricted&&<p role="status" className="text-sm text-muted-foreground">正在按公共浏览更新目录，已收起受限内容。</p>}
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
  return (
    <Link
      to={w.url}
      className="story-card"
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
            {[...new Set(w.versions.map((v) => v.language).filter(Boolean))].join(" / ") || "在线阅读"}
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
