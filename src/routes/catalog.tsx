import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Badge } from "../components/ui/badge";
import { Search } from "lucide-react";
import { Form, Link, useLoaderData } from "react-router";
import { workSlug } from "../identity.ts";
import { getStore } from "../server/runtime.ts";
export function meta() {
  return [
    { title: "WG · 故事放映室" },
    { name: "description", content: "按作品与版本整理的浏览器视觉小说目录。" },
  ];
}
export function loader({ request }: { request: Request }) {
  const all = getStore()
    .list()
    .filter((w) => w.versions.length);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const engine = url.searchParams.get("engine") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const items = all.filter(
    (w) =>
      (!q ||
        [w.title, w.originalTitle, w.id, ...w.aliases]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())) &&
      (!engine || w.versions.some((v) => v.engine === engine)) &&
      (!state ||
        w.versions.some((v) =>
          state === "unchecked"
            ? !v.checks.length
            : v.checks.some((c) => c.status === state),
        )),
  );
  return {
    items,
    q,
    engine,
    state,
    total: all.length,
    versions: all.reduce((n, w) => n + w.versions.length, 0),
  };
}
export default function Catalog() {
  const { items, q, engine, state, total, versions } =
    useLoaderData<typeof loader>();
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          WG<span>故事放映室</span>
        </Link>
        <Badge variant="outline" className="preview-badge">
          远程预览
        </Badge>
      </header>
      <main className="container">
        <section className="hero">
          <p className="eyebrow">A PLACE FOR EVERY STORY</p>
          <h1>
            让故事，
            <br />
            <em>有处可寻。</em>
          </h1>
          <p className="intro">
            作品归于一处，版本各有其名。
            <br />
            选一段故事，从上次停下的地方继续。
          </p>
          <div className="stats">
            <span>
              <b>{total}</b> 部作品
            </span>
            <span>
              <b>{versions}</b> 个版本
            </span>
            <span>ONS · Artemis · Ren'Py · Tyrano</span>
          </div>
        </section>
        <Form
          key={q + engine + state}
          className="filters"
          method="get"
          role="search"
        >
          <div className="search field">
            <Label htmlFor="catalog-search">搜索作品</Label>
            <Input
              id="catalog-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="标题、别名或 VNDB / BGM 编号"
            />
          </div>
          <div className="field">
            <Label htmlFor="catalog-engine">引擎</Label>
            <NativeSelect
              id="catalog-engine"
              name="engine"
              defaultValue={engine}
            >
              <NativeSelectOption value="">全部引擎</NativeSelectOption>
              {["ONS", "Artemis", "RenPy", "Tyrano"].map((x) => (
                <NativeSelectOption key={x}>{x}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="field">
            <Label htmlFor="catalog-state">检查记录</Label>
            <NativeSelect id="catalog-state" name="state" defaultValue={state}>
              <NativeSelectOption value="">全部状态</NativeSelectOption>
              <NativeSelectOption value="unchecked">
                未导入检查
              </NativeSelectOption>
              <NativeSelectOption value="passed">有通过记录</NativeSelectOption>
              <NativeSelectOption value="failed">有失败记录</NativeSelectOption>
              <NativeSelectOption value="incomplete">
                检查未完成
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <Button type="submit">
            <Search aria-hidden="true" />
            查找
          </Button>
          {(q || engine || state) && (
            <Button asChild variant="ghost">
              <Link to="/">清除</Link>
            </Button>
          )}
        </Form>
        <div className="section-title">
          <h2>故事目录</h2>
          <span>{items.length} 部作品</span>
        </div>
        <div className="story-grid">
          {items.map((w, i) => (
            <Link key={w.id} to={w.url} className="story-card">
              <div className={"card-art tone-" + (i % 5)} aria-hidden="true">
                <span className="card-index">{workSlug(w.id)}</span>
                <span className="art-line" />
                <span className="art-symbol">
                  {["✦", "◌", "✧", "◇", "⋆"][i % 5]}
                </span>
                <span className="art-word">
                  STORY / {w.versions[0].engine.toUpperCase()}
                </span>
              </div>
              <div className="card-body">
                <span className="eyebrow">
                  {[...new Set(w.versions.map((v) => v.engine))].join(" / ")}
                </span>
                <h3>{w.title}</h3>
                <p>{w.originalTitle}</p>
                <div className="card-footer">
                  <Badge variant="secondary">{w.versions.length} 个版本</Badge>
                  <span>阅读详情 ↗</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {!items.length && (
          <div className="empty">
            <h2>暂时没有匹配的故事</h2>
            <p>试试其他标题、别名或编号。</p>
            <Button asChild variant="outline">
              <Link to="/">清除筛选</Link>
            </Button>
          </div>
        )}
        <footer>
          <span>WG · 每段故事，都值得好好收录。</span>
          <span>检查记录仅反映已执行的项目。</span>
        </footer>
      </main>
    </>
  );
}
