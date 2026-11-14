import { registerJsonRoute } from "../api/route.server.ts";
import { catalogContract } from "../api/contracts/catalog.ts";
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ResourceRequestError } from './types.ts';
import type { ResourceRepository } from './repository.ts';

/** 包含完整 /api/resources 路径，可直接 app.route('/', createResourceApp(repo))。 */
export function createResourceApp(repository: ResourceRepository) {
  const app = new Hono();
  app.onError((error, c) => error instanceof ResourceRequestError
    ? c.json({ error: 'invalid_request' }, 400) : c.json({ error: 'resource_unavailable' }, 503));
  registerJsonRoute(app, catalogContract.resourceManifest, async c => {
    const query = new URL(c.req.url).searchParams;
    if ([...query.keys()].some(key => !['namespace', 'version', 'limit', 'cursor'].includes(key) || query.getAll(key).length !== 1))
      throw new ResourceRequestError();
    const rawLimit = query.get('limit');
    if (rawLimit !== null && !/^[1-9][0-9]{0,2}$/.test(rawLimit)) throw new ResourceRequestError();
    const page = await repository.manifest({ namespace: query.get('namespace') ?? '', version: query.get('version') ?? '', limit: rawLimit === null ? undefined : Number(rawLimit), cursor: query.get('cursor') ?? undefined });
    return page ? c.json(page) : c.json({ error: 'not_found' }, 404);
  }, { invalidResponse: c => c.json({ error: "invalid_request" }, 400) });
  app.use('/api/resources/resolve', bodyLimit({ maxSize: 8192, onError: c => c.json({ error: 'body_too_large' }, 413) }));
  registerJsonRoute(app, catalogContract.resourceResolve, async c => {
    if (c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ResourceRequestError();
    const max = 8192;
    if (Number(c.req.header('content-length')) > max) return c.json({ error: 'body_too_large' }, 413);
    let body: unknown;
    try { body = JSON.parse(Buffer.from(await c.req.arrayBuffer()).toString('utf8')); } catch { throw new ResourceRequestError(); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('keys' in body)) throw new ResourceRequestError();
    return c.json(await repository.resolve((body as { keys: string[] }).keys));
  }, { invalidResponse: c => c.json({ error: "invalid_request" }, 400) });
  registerJsonRoute(app, catalogContract.resourceByPath, async c => {
    const query = new URL(c.req.url).searchParams;
    if ([...query.keys()].some(key => !['namespace', 'path'].includes(key) || query.getAll(key).length !== 1))
      throw new ResourceRequestError();
    const resource = await repository.findByOriginalPath(query.get('namespace') ?? '', query.get('path') ?? '');
    return resource ? c.json(resource) : c.json({ error: 'not_found' }, 404);
  }, { invalidResponse: c => c.json({ error: "invalid_request" }, 400) });
  registerJsonRoute(app, catalogContract.resourceGet, async c => {
    const resource = await repository.findByKey(c.req.param('key')!);
    return resource ? c.json(resource) : c.json({ error: 'not_found' }, 404);
  }, { invalidResponse: c => c.json({ error: "invalid_request" }, 400) });
  return app;
}
