import { z } from 'zod';
import { endpoint } from '../endpoint.ts';
import { metadataSchema } from '../../metadata.ts';
export { metadataSchema } from '../../metadata.ts';

const s = z.string(), n = z.number();
const evidence = { reason: s, source: s, reviewedAt: s, revision: n };
const check = z.object({ versionId: s, kind: z.enum(['resources', 'http', 'startup']), runId: s, startedAt: s, checkedAt: s, status: z.enum(['passed', 'failed', 'incomplete']), detail: s });
export const versionSchema = z.object({
  id: s, workId: s, number: n, title: s, engine: s, revision: n, url: s, launchPath: s,
  checks: z.array(check), language: s, notes: s, sortOrder: n,
  classification: z.object({ ...evidence, sexualContent: z.enum(['none', 'present', 'unknown']), titleSafe: z.boolean(), ageRating: s.optional() }).optional(),
});
export const publicWorkSchema = z.object({
  id: s, title: s, originalTitle: s, aliases: z.array(s), evidence: s, revision: n,
  defaultVersionId: s.nullable(), url: s, versions: z.array(versionSchema), metadata: metadataSchema.optional(),
  coverStatus: z.enum(['available', 'missing', 'unavailable', 'unreviewed', 'restricted']).optional(),
  classification: z.object({ ...evidence, pageSuitability: z.enum(['sfw', 'nsfw', 'unknown']) }).optional(),
});
export const resourceSchema = z.object({ key: s, sha256: s, bytes: n.int().nonnegative(), contentType: s, url: s });
export const resourceManifestSchema = z.object({ namespace: s, version: s, resources: z.array(resourceSchema.extend({ originalPath: s })), nextCursor: s.nullable() });
export const versionResourcesSchema = z.object({ versionId: s, inventorySha256: s, resources: z.array(resourceSchema.extend({ path: s })), nextCursor: s.nullable() });
export const resourceResolveSchema = z.object({ resources: z.array(resourceSchema), missing: z.array(s) });
export const searchResultSchema = z.object({ ids: z.array(s), offset: n, limit: n, nextOffset: n.nullable(), indexEstimatedTotalHits: n.nullable(), visiblePageCount: n.optional(), filteredOut: n, source: z.literal('meilisearch') });
const params = z.object({ id: s });
// 格式、重复参数和领域限制仍由原 handler 判断，保留原错误响应。
export const catalogContract = {
  publicCatalog: endpoint('GET', '/api/catalog', z.object({}), z.array(publicWorkSchema)),
  publicWork: endpoint('GET', '/api/works/{id}', z.object({ params }), publicWorkSchema),
  searchQuery: endpoint('GET', '/api/search', z.object({ query: z.object({ q: s.optional(), engine: s.optional(), state: s.optional(), tag: s.optional(), content: s.optional(), offset: s.optional(), limit: s.optional() }).optional() }), searchResultSchema),
  resourceManifest: endpoint('GET', '/api/resources/manifest', z.object({ query: z.object({ namespace: s.optional(), version: s.optional(), limit: s.optional(), cursor: s.optional() }).optional() }), resourceManifestSchema),
  resourceResolve: endpoint('POST', '/api/resources/resolve', z.object({ body: z.object({ keys: z.array(s) }).strict() }), resourceResolveSchema),
  resourceByPath: endpoint('GET', '/api/resources/by-path', z.object({ query: z.object({ namespace: s.optional(), path: s.optional() }).optional() }), resourceSchema),
  resourceGet: endpoint('GET', '/api/resources/{key}', z.object({ params: z.object({ key: s }) }), resourceSchema),
  versionResources: endpoint('GET', '/api/versions/{id}/resources', z.object({ params, query: z.object({ limit: s.optional(), cursor: s.optional() }).optional() }), versionResourcesSchema),
  versionResource: endpoint('GET', '/api/versions/{id}/resource', z.object({ params, query: z.object({ path: s.optional() }).optional() }), resourceSchema),
};
