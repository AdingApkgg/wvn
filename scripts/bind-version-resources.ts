import { PgDatabase } from '../src/database/postgres.ts';
import { Store } from '../src/server/store.ts';
import { ResourceRepository } from '../src/resources/repository.ts';
import { VersionResources } from '../src/platform/version-resources.server.ts';

const args = process.argv.slice(2);
const options: Record<string, string> = {};
let apply = false;
for (let i = 0; i < args.length; i++) {
  const name = args[i];
  if (name === '--apply' && !apply) { apply = true; continue; }
  if (!['--version', '--namespace', '--inventory', '--prefix', '--catalog-schema', '--resource-schema'].includes(name)
    || name in options || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid version resource binding arguments');
  options[name] = args[++i];
}
if (['--version', '--namespace', '--inventory', '--prefix', '--catalog-schema', '--resource-schema'].some(name => !options[name]))
  throw new Error('Required: --version --namespace --inventory --prefix --catalog-schema --resource-schema [--apply]');
const catalogUrl = process.env.WG_DATABASE_URL ?? process.env.DATABASE_URL;
const resourceUrl = process.env.WG_RESOURCE_DATABASE_URL ?? catalogUrl;
if (!catalogUrl || !resourceUrl) throw new Error('Catalog and resource PostgreSQL database URLs are required');
const catalog = new Store(new PgDatabase(catalogUrl, { schema: options['--catalog-schema'] }));
const db = new PgDatabase(resourceUrl, { schema: options['--resource-schema'] });
try {
  const input = { versionId: options['--version'], namespace: options['--namespace'], inventorySha256: options['--inventory'], prefix: options['--prefix'] };
  await catalog.ready;
  const version = await catalog.raw(input.versionId);
  if (version?.status !== 'published') throw new Error('Published catalog version required');
  const snapshot = await db.prepare('SELECT 1 FROM wvn_resource_snapshots WHERE namespace=$1 AND inventory_sha256=$2 AND published')
    .get(input.namespace, input.inventorySha256);
  if (!snapshot || !input.prefix.endsWith('/') || input.prefix.length > 4096) throw new Error('Published snapshot and bounded prefix required');
  const count = await db.prepare(`SELECT count(*) AS n FROM wvn_resources WHERE namespace=$1 AND original_path>=$2 COLLATE "C" AND original_path<$3 COLLATE "C"`)
    .get(input.namespace, input.prefix, input.prefix.slice(0, -1) + '0');
  if (!count?.n) throw new Error('No resource paths match this prefix');
  if (apply) await new VersionResources(catalog, new ResourceRepository(db)).bind(input);
  console.log(JSON.stringify({ status: apply ? 'bound' : 'dry-run', ...input, resources: count.n }));
} catch {
  console.error('版本资源绑定失败；请核对公开版本、已发布快照、路径前缀及不可变绑定，不要覆盖历史映射。');
  process.exitCode = 1;
} finally { await db.close(); await catalog.close(); }
