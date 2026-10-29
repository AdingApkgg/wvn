import { Hono } from 'hono';
import { migrate } from '../database/migrations.ts';
import type { Store } from '../server/store.ts';
import type { ResourceRepository } from '../resources/repository.ts';
import { type ResourceMetadata, publicResource, ResourceRequestError, SHA256, validNamespace } from '../resources/types.ts';

export const versionResourceMigrations = [{ id: '006-version-resource-bindings', sql: `
CREATE TABLE wvn_version_resources(
  version_id text PRIMARY KEY,
  namespace text NOT NULL REFERENCES wvn_resource_snapshots(namespace),
  inventory_sha256 text NOT NULL CHECK(inventory_sha256 ~ '^[0-9a-f]{64}$'),
  path_prefix text COLLATE "C" NOT NULL CHECK(length(path_prefix) BETWEEN 1 AND 4096 AND right(path_prefix,1)='/'),
  created_at timestamptz NOT NULL DEFAULT now()
);
` }];

type Binding = { versionId: string; namespace: string; inventorySha256: string; prefix: string };
const fields = `r.key::text AS key,r.sha256,o.bytes,COALESCE(o.http_content_type,r.content_type) AS "contentType",r.original_path AS "originalPath"`;
export class VersionResources {
  readonly ready: Promise<void>;
  constructor(private readonly catalog: Store, private readonly resources: ResourceRepository) {
    this.ready = migrate(resources.db, versionResourceMigrations);
  }
  async bind(input: Binding) {
    await this.ready;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.versionId) || !validNamespace(input.namespace) || !SHA256.test(input.inventorySha256)
      || !input.prefix || input.prefix.length > 4096 || !input.prefix.endsWith('/') || /[\u0000-\u001f\u007f]/.test(input.prefix)) throw new ResourceRequestError('Invalid version resource binding');
    if ((await this.catalog.raw(input.versionId))?.status !== 'published') throw new ResourceRequestError('Published version required');
    await this.resources.db.transaction(async () => {
      const snapshot = await this.resources.db.prepare('SELECT 1 FROM wvn_resource_snapshots WHERE namespace=$1 AND inventory_sha256=$2 AND published').get(input.namespace, input.inventorySha256);
      if (!snapshot) throw new ResourceRequestError('Published snapshot required');
      await this.resources.db.prepare(`INSERT INTO wvn_version_resources(version_id,namespace,inventory_sha256,path_prefix)
        VALUES($1,$2,$3,$4) ON CONFLICT(version_id) DO NOTHING`).run(input.versionId, input.namespace, input.inventorySha256, input.prefix);
      const actual = await this.resources.db.prepare('SELECT * FROM wvn_version_resources WHERE version_id=$1').get(input.versionId);
      if (actual?.namespace !== input.namespace || actual.inventory_sha256 !== input.inventorySha256 || actual.path_prefix !== input.prefix)
        throw new ResourceRequestError('Version resource binding is immutable');
    });
  }
  private async binding(versionId: string) {
    await this.ready;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(versionId)) throw new ResourceRequestError('Invalid version');
    if ((await this.catalog.raw(versionId))?.status !== 'published') return;
    return this.resources.db.prepare(`SELECT b.* FROM wvn_version_resources b JOIN wvn_resource_snapshots s ON s.namespace=b.namespace
      AND s.inventory_sha256=b.inventory_sha256 AND s.published WHERE b.version_id=$1`).get(versionId);
  }
  async find(versionId: string, path: string) {
    if (!path || path.length > 12288 || path.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(path) || path.split('/').some(p => p === '.' || p === '..'))
      throw new ResourceRequestError('Invalid relative resource path');
    const binding = await this.binding(versionId);
    if (!binding) return;
    return this.resources.findByOriginalPath(binding.namespace, binding.path_prefix + path);
  }
  async manifest(versionId: string, options: { limit?: number; cursor?: string } = {}) {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new ResourceRequestError('Invalid manifest limit');
    const binding = await this.binding(versionId);
    if (!binding) return;
    let after = binding.path_prefix;
    if (options.cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,90000}$/.test(options.cursor)) throw new Error();
        const value = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8'));
        if (value.versionId !== versionId || value.inventory !== binding.inventory_sha256 || typeof value.after !== 'string'
          || !value.after.startsWith(binding.path_prefix) || value.after.length > 16384 || value.after.includes('\0')) throw new Error();
        after = value.after;
      } catch { throw new ResourceRequestError('Invalid scoped manifest cursor'); }
    }
    // 固定前缀以 / 结束；其 C 排序上界为同一字符串末尾的 0，使用现有复合索引限定游戏范围。
    const upper = binding.path_prefix.slice(0, -1) + '0';
    const rows = await this.resources.db.prepare(`SELECT ${fields} FROM wvn_resources r JOIN wvn_resource_objects o ON o.sha256=r.sha256
      WHERE r.namespace=$1 AND r.original_path>$2 COLLATE "C" AND r.original_path<$3 COLLATE "C"
      ORDER BY r.original_path COLLATE "C" LIMIT $4`).all<ResourceMetadata & { originalPath: string }>(binding.namespace, after, upper, limit + 1);
    const selected = rows.slice(0, limit);
    return { versionId, inventorySha256: binding.inventory_sha256,
      resources: selected.map(row => ({ ...publicResource(row), path: row.originalPath.slice(binding.path_prefix.length) })),
      nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ versionId, inventory: binding.inventory_sha256, after: selected.at(-1)!.originalPath })).toString('base64url') : null };
  }
}

export function createVersionResourceApp(bridge: VersionResources) {
  const app = new Hono();
  app.onError((error, c) => error instanceof ResourceRequestError ? c.json({ error: 'invalid_request' }, 400) : c.json({ error: 'resource_unavailable' }, 503));
  app.get('/api/versions/:id/resources', async c => {
    const query = new URL(c.req.url).searchParams;
    if ([...query.keys()].some(key => !['limit', 'cursor'].includes(key) || query.getAll(key).length !== 1)) throw new ResourceRequestError();
    const limit = query.get('limit');
    if (limit !== null && !/^[1-9]\d{0,2}$/.test(limit)) throw new ResourceRequestError();
    const page = await bridge.manifest(c.req.param('id'), { limit: limit === null ? undefined : Number(limit), cursor: query.get('cursor') ?? undefined });
    return page ? c.json(page) : c.json({ error: 'not_found' }, 404);
  });
  app.get('/api/versions/:id/resource', async c => {
    const query = new URL(c.req.url).searchParams;
    if ([...query.keys()].some(key => key !== 'path') || query.getAll('path').length !== 1) throw new ResourceRequestError();
    const resource = await bridge.find(c.req.param('id'), query.get('path')!);
    return resource ? c.json(resource) : c.json({ error: 'not_found' }, 404);
  });
  return app;
}
