import { Hono } from 'hono';
import { projectWorkCounts } from '../analytics/projection.server.ts';
import { migrate } from '../database/migrations.ts';
import type { Store } from '../server/store.ts';
import { createSearchApp } from './http.server.ts';
import { MeiliClient } from './meili.server.ts';
import { searchMigrations } from './migrations.ts';

export type SearchPage = {
  ids: string[]; offset: number; limit: number; nextOffset: number | null;
  indexEstimatedTotalHits: number; filteredOut: number; source: 'meilisearch';
};
export class SearchRuntimeError extends Error {
  constructor(readonly status: 400 | 503, readonly code: string) {
    super(status === 400 ? '搜索条件无效，请调整后重试。' : '搜索暂不可用，请稍后重试。');
  }
}
export type SearchRuntime = {
  app: Hono;
  query(params: URLSearchParams): Promise<SearchPage>;
  close?: () => Promise<void>;
};
function unavailableApp() {
  const app = new Hono();
  app.get('/api/search', c => {
    c.header('Retry-After', '5');
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'search_unavailable' }, 503);
  });
  return app;
}

/** 复用 Store 的 PG 连接，不关闭借用的数据库，也不向浏览器返回配置或密钥。 */
export async function createSearchRuntime(store: Store, env: NodeJS.ProcessEnv = process.env): Promise<SearchRuntime> {
  await store.ready;
  await migrate(store.database, searchMigrations);
  let app = unavailableApp();
  const url = env.MEILISEARCH_URL;
  const apiKey = env.MEILI_SEARCH_KEY || env.MEILI_WRITE_KEY || env.MEILI_MASTER_KEY;
  if (url && apiKey) {
    try {
      app = createSearchApp({ db: store.database, meili: new MeiliClient({ url, apiKey }),
        indexUid: env.MEILI_INDEX_UID || 'wvn_public_works' });
    } catch {
      // 配置无效时明确返回 503；基础目录不依赖此服务。
    }
  }
  return {
    app,
    async query(params) {
      const response = await app.request('/api/search?' + params.toString());
      if (!response.ok) {
        const code = (await response.json() as { error?: string }).error;
        throw new SearchRuntimeError(response.status === 400 ? 400 : 503, code || 'search_unavailable');
      }
      return response.json() as Promise<SearchPage>;
    },
  };
}

const runtimes = new WeakMap<Store, { config: (string | undefined)[]; runtime: Promise<SearchRuntime> }>();
/** 目录 loader 复用已配置 runtime；配置改变时重新创建，失败的迁移可在下次请求重试。 */
export function getConfiguredSearchRuntime(store: Store, env: NodeJS.ProcessEnv = process.env) {
  const config = [env.MEILISEARCH_URL, env.MEILI_SEARCH_KEY, env.MEILI_WRITE_KEY, env.MEILI_MASTER_KEY, env.MEILI_INDEX_UID];
  const existing = runtimes.get(store);
  if (existing && config.every((value, i) => value === existing.config[i])) return existing.runtime;
  const runtime = createSearchRuntime(store, env);
  const entry = { config, runtime };
  runtimes.set(store, entry);
  void runtime.catch(() => { if (runtimes.get(store) === entry) runtimes.delete(store); });
  return runtime;
}

/** 搜索返回 ID 后再读取公开目录，避免索引排序被目录原始顺序覆盖。 */
export async function loadCatalog(request: Request, store: Store, env: NodeJS.ProcessEnv = process.env) {
  let all = (await store.list()).filter(w => w.versions.length);
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const engine = url.searchParams.get("engine") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const tag = url.searchParams.get("tag") ?? "";
  const isSearch = ["q", "engine", "state", "tag"].some(key => url.searchParams.getAll(key).some(value => value.trim()));
  let items = all;
  let searchError: string | null = null;
  let searchStatus: 200 | 400 | 503 = 200;
  let nextOffset: number | null = null;
  let nextSearchUrl: string | null = null;
  if (isSearch) {
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams)
      if (["q", "engine", "state", "tag", "offset", "limit"].includes(key)) params.append(key, value);
    try {
      const page = await (await getConfiguredSearchRuntime(store, env)).query(params);
      all = (await store.list()).filter(w => w.versions.length);
      const byId = new Map(all.map(work => [work.id, work]));
      items = page.ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
      nextOffset = page.nextOffset;
      if (nextOffset !== null) {
        params.set("offset", String(nextOffset));
        nextSearchUrl = url.pathname + "?" + params.toString();
      }
    } catch (error) {
      items = [];
      searchStatus = error instanceof SearchRuntimeError ? error.status : 503;
      searchError = searchStatus === 400 ? "搜索条件无效，请调整后重试。" : "搜索暂不可用，请稍后重试。";
    }
  }
  return {
    items,
    counts: await projectWorkCounts(items.map(w => w.id)),
    recentWorks: all.map(w => ({ title: w.title, versions: w.versions.map(v => ({ id: v.id, url: v.url, number: v.number })) })),
    q, engine, state, tag, isSearch, searchError, searchStatus, nextOffset, nextSearchUrl,
    release: env.WG_DEPLOYMENT_MODE === "production",
    total: all.length,
    versions: all.reduce((n, w) => n + w.versions.length, 0),
  };
}
