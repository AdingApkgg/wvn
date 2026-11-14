import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogContract, publicWorkSchema, resourceManifestSchema, resourceResolveSchema, searchResultSchema, versionResourcesSchema } from '../src/api/contracts/catalog.ts';
import { createResourceApp } from '../src/resources/http.ts';
import type { ResourceRepository } from '../src/resources/repository.ts';

const resource = { key: 'f751227e-98b2-4f49-8318-5c8fa6d56fde', sha256: 'a'.repeat(64), bytes: 12, contentType: 'image/png', url: 'https://wvn-s3-zi0.saop.cc/' + 'a'.repeat(64) + '.bin' };
test('catalog contracts retain permission classification and resource manifest scope', () => {
  const work = { id: 'v1', title: '故事', originalTitle: '物語', aliases: [], evidence: '', revision: 1, defaultVersionId: null, url: '/1/', versions: [], coverStatus: 'restricted', classification: { reason: '', source: '', reviewedAt: '', revision: 1, pageSuitability: 'sfw' } };
  assert.deepEqual(publicWorkSchema.parse(work), work);
  assert.equal(publicWorkSchema.safeParse({ ...work, coverStatus: 'invalid' }).success, false);
  assert.equal(resourceManifestSchema.safeParse({ namespace: 'scope', version: 'a'.repeat(64), resources: [{ ...resource, originalPath: '中文/a.png' }], nextCursor: null }).success, true);
  assert.equal(versionResourcesSchema.safeParse({ versionId: 'game', inventorySha256: 'a'.repeat(64), resources: [{ ...resource, path: '中文/a.png' }], nextCursor: null }).success, true);
  assert.equal(resourceResolveSchema.safeParse({ resources: [{ ...resource, bytes: -1 }], missing: [] }).success, false);
  assert.equal(searchResultSchema.safeParse({ ids: [], offset: 0, limit: 20, nextOffset: null, indexEstimatedTotalHits: null, visiblePageCount: 0, filteredOut: 0, source: 'meilisearch' }).success, true);
  assert.equal(catalogContract.resourceResolve['~orpc'].route?.path, '/api/resources/resolve');
});
test('resource resolve contract preserves cached body, error protocol and bounded input', async () => {
  let calls = 0;
  const repository = { resolve: async (keys: string[]) => { calls++; return { resources: keys.length ? [resource] : [], missing: [] }; } } as unknown as ResourceRepository;
  const app = createResourceApp(repository);
  const post = (body: string) => app.request('/api/resources/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const response = await post(JSON.stringify({ keys: [resource.key] }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { resources: [resource], missing: [] });
  assert.equal(calls, 1);
  const malformed = await post('{');
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'invalid_request' });
  const oversized = await post(JSON.stringify({ keys: ['x'.repeat(9000)] }));
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: 'body_too_large' });
  assert.equal(calls, 1);
});
