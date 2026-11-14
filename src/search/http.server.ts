import { registerJsonRoute } from "../api/route.server.ts";
import { catalogContract } from "../api/contracts/catalog.ts";
import { Hono } from 'hono';
import type { PgDatabase } from '../database/postgres.ts';
import { MeiliClient, indexName } from './meili.server.ts';
import { documents } from './projection.server.ts';
import { filterContentVersions } from './projection.server.ts';
import { Store } from '../server/store.ts';
import { contentGateEnabled, getContentAccess } from '../content/access.server.ts';
import { projectWork, restrictedAllowed } from '../content/policy.ts';
import type { PublicWork } from '../types.ts';

export type SearchQuery = { q: string; engine: string; state: string; tag: string; content: string; offset: number; limit: number };
class InvalidQuery extends Error {}
export function parseSearchQuery(params: URLSearchParams): SearchQuery {
  const allowed = new Set(['q', 'engine', 'state', 'tag', 'content', 'offset', 'limit']);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new InvalidQuery();
  const q = (params.get('q') ?? '').trim();
  const engine = params.get('engine') ?? '';
  const state = params.get('state') ?? '';
  const tag = (params.get('tag') ?? '').trim();
  const content = params.get('content') ?? '';
  const offset = params.get('offset') ?? '0';
  const limit = params.get('limit') ?? '20';
  if (q.length > 200 || tag.length > 100 || /[\u0000-\u001f\u007f]/.test(q + tag)
    || !['', 'ONS', 'Artemis', 'RenPy', 'Tyrano'].includes(engine)
    || !['', 'passed', 'failed', 'incomplete', 'unchecked'].includes(state)
    || !['', 'none', 'present', 'unknown'].includes(content)
    || !/^\d{1,5}$/.test(offset) || Number(offset) > 10_000
    || !/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) throw new InvalidQuery();
  return { q, engine, state, tag, content, offset: Number(offset), limit: Number(limit) };
}
function matches(work: PublicWork, query: SearchQuery) {
  return (!query.engine || work.versions.some(version => version.engine === query.engine))
    && (!query.tag || work.metadata?.tags.some(tag => tag.name === query.tag))
    && (!query.state || work.versions.some(version => query.state === 'unchecked' ? !version.checks.length : version.checks.some(check => check.status === query.state)));
}
export function createSearchApp(options: { db: PgDatabase; meili: MeiliClient; indexUid: string; store?: Store; contentGate?: boolean }) {
  const app = new Hono();
  const uid = indexName(options.indexUid);
  let catalog = options.store;
  registerJsonRoute(app, catalogContract.searchQuery, async c => {
    let query: SearchQuery;
    try { query = parseSearchQuery(new URL(c.req.url).searchParams); }
    catch { return c.json({ error: 'invalid_search_query' }, 400); }
    try {
      const gated = options.contentGate ?? contentGateEnabled();
      const access = gated ? await getContentAccess(c.req.raw) : null;
      if (gated) c.header('Cache-Control', 'private, no-store');
      const filter = [query.engine && 'engines = ' + JSON.stringify(query.engine),
        query.state && 'states = ' + JSON.stringify(query.state), query.tag && 'tags = ' + JSON.stringify(query.tag),
        query.content && 'sexualContents = ' + JSON.stringify(query.content)].filter((x): x is string => !!x);
      if (access) filter.push(restrictedAllowed(access) ? 'pageSuitability IN ["sfw", "nsfw"]' : 'pageSuitability = "sfw"');
      const needsCurrentWorks = gated || !!query.content;
      const ids: string[] = [];
      let scanned = 0;
      let filteredOut = 0;
      let estimate = 0;
      let exhausted = false;
      // 每次最多检查 500 个索引候选；offset 指向原始索引位置，补页时保持相关性顺序。
      while (ids.length < query.limit && scanned < 500 && query.offset + scanned < 10_000) {
        const limit = Math.min(query.limit - ids.length, 500 - scanned, 10_000 - query.offset - scanned);
        const page = await options.meili.search(uid, { q: query.q, filter, offset: query.offset + scanned, limit });
        estimate = page.estimatedTotalHits;
        const candidates = page.hits.map(h => h.id).filter((id): id is string => typeof id === 'string' && /^[vb][1-9]\d{0,8}$/.test(id));
        let visible: Set<string>;
        if (needsCurrentWorks) {
          // 索引网络请求完成后再读当前分类；旧索引与请求中的并发审核变更均不能放行。
          const currentWorks = new Map((await (catalog ??= new Store(options.db)).list()).map(work => [work.id, work]));
          visible = new Set(candidates.flatMap(id => {
            const original = currentWorks.get(id);
            const work = original ? filterContentVersions(original, query.content) : null;
            return work && matches(work, query) && (!access || projectWork(work, access)) ? [id] : [];
          }));
        } else {
          const current = await documents(options.db, candidates);
          visible = new Set(current.filter(doc => (!query.engine || doc.engines.includes(query.engine))
            && (!query.state || doc.states.includes(query.state)) && (!query.tag || doc.tags.includes(query.tag))).map(doc => doc.id));
        }
        for (const hit of page.hits) { if (visible.has(hit.id)) ids.push(hit.id); else filteredOut++; }
        scanned += page.hits.length;
        if (page.hits.length < limit || query.offset + scanned >= estimate) { exhausted = true; break; }
      }
      return c.json({ ids, offset: query.offset, limit: query.limit,
        nextOffset: exhausted || query.offset + scanned >= 10_000 ? null : query.offset + scanned,
        // 资格模式不公开尚未经过当前分类复核的索引计数。
        indexEstimatedTotalHits: gated ? null : estimate, ...(gated ? { visiblePageCount: ids.length } : {}),
        filteredOut: gated ? 0 : filteredOut, source: 'meilisearch' });
    } catch {
      c.header('Retry-After', '5');
      c.header('Cache-Control', 'no-store');
      return c.json({ error: 'search_unavailable' }, 503);
    }
  }, { invalidResponse: c => c.json({ error: "invalid_search_query" }, 400) });
  return app;
}
