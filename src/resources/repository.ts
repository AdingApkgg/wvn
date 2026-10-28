import type { PgDatabase } from '../database/postgres.ts';
import { publicResource, RESOURCE_KEY, ResourceRequestError, SHA256, validNamespace, type ResourceCache, type ResourceMetadata } from './types.ts';

const metadata = `r.key::text AS key,r.sha256,o.bytes,r.content_type AS "contentType"`;
const joined = `FROM wvn_resources r JOIN wvn_resource_objects o ON o.sha256=r.sha256
  JOIN wvn_resource_snapshots s ON s.namespace=r.namespace AND s.published=true`;

export class ResourceRepository {
  private readonly cache?: ResourceCache;
  constructor(readonly db: PgDatabase, options: { cache?: ResourceCache } = {}) { this.cache = options.cache; }

  async findByKey(key: string) {
    if (!RESOURCE_KEY.test(key)) throw new ResourceRequestError('Invalid resource key');
    return (await this.resolve([key])).resources[0];
  }

  async resolve(input: string[]) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 100 || input.some(key => typeof key !== 'string' || !RESOURCE_KEY.test(key)))
      throw new ResourceRequestError('Expected 1 to 100 UUID resource keys');
    const keys = [...new Set(input)];
    const found = await this.cache?.getMany(keys).catch(() => new Map<string, ResourceMetadata>()) ?? new Map<string, ResourceMetadata>();
    const uncached = keys.filter(key => !found.has(key));
    if (uncached.length) {
      const rows = await this.db.prepare(`SELECT ${metadata} ${joined} WHERE r.key=ANY($1::uuid[])`).all<ResourceMetadata>(uncached);
      for (const row of rows) found.set(row.key, row);
      if (rows.length) await this.cache?.setMany(rows).catch(() => {});
    }
    return {
      resources: keys.filter(key => found.has(key)).map(key => publicResource(found.get(key)!)),
      missing: keys.filter(key => !found.has(key)),
    };
  }

  async findByOriginalPath(namespace: string, originalPath: string) {
    if (!validNamespace(namespace) || typeof originalPath !== 'string' || !originalPath.length || originalPath.length > 16384 || originalPath.includes('\0'))
      throw new ResourceRequestError('Invalid original resource path');
    const row = await this.db.prepare(`SELECT ${metadata} ${joined} WHERE r.namespace=$1 AND r.original_path=$2`).get<ResourceMetadata>(namespace, originalPath);
    return row ? publicResource(row) : undefined;
  }

  async manifest(options: { namespace: string; version: string; limit?: number; cursor?: string }) {
    const { namespace, version, cursor } = options;
    const limit = options.limit ?? 100;
    if (!validNamespace(namespace) || !SHA256.test(version) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new ResourceRequestError('Invalid resource manifest scope or limit');
    let after = '';
    if (cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,90000}$/.test(cursor)) throw new Error();
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (parsed.namespace !== namespace || parsed.version !== version || typeof parsed.after !== 'string' || !parsed.after.length || parsed.after.length > 16384 || parsed.after.includes('\0')) throw new Error();
        after = parsed.after;
      } catch { throw new ResourceRequestError('Invalid resource manifest cursor'); }
    }
    const snapshot = await this.db.prepare('SELECT namespace FROM wvn_resource_snapshots WHERE namespace=$1 AND inventory_sha256=$2 AND published=true').get(namespace, version);
    if (!snapshot) return undefined;
    const rows = await this.db.prepare(`SELECT ${metadata},r.original_path AS "originalPath" ${joined}
      WHERE r.namespace=$1 AND s.inventory_sha256=$2 AND r.original_path>$3 COLLATE "C"
      ORDER BY r.original_path COLLATE "C" LIMIT $4`).all<ResourceMetadata & { originalPath: string }>(namespace, version, after, limit + 1);
    const selected = rows.slice(0, limit);
    return {
      namespace, version,
      resources: selected.map(row => ({ ...publicResource(row), originalPath: row.originalPath })),
      nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ namespace, version, after: selected.at(-1)!.originalPath })).toString('base64url') : null,
    };
  }
}
