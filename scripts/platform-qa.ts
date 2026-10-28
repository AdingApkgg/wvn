/** 实际入口的远程隔离验收；必须置于本任务的持久化 tmux job 中。 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, stat, statfs, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { PgDatabase } from '../src/database/postgres.ts';
import { Store } from '../src/server/store.ts';
import { ResourceRepository } from '../src/resources/repository.ts';
import { VersionResources } from '../src/platform/version-resources.server.ts';
import { MeiliClient } from '../src/search/meili.server.ts';

const source = resolve('.');
if (process.platform !== 'linux' || hostname() !== 'localhost' || source !== '/home/i/wvn-platform-20261029/source' || !process.env.TMUX)
  throw new Error('平台QA只能在已授权构建机本任务目录的持久化tmux中运行');
const extra = process.argv.slice(2);
if (extra.length && !(extra.length === 2 && extra[0] === '--grep')) throw new Error('Only an optional --grep pattern is supported');
function qaDatabase(value: string | undefined) {
  if (!value) throw new Error('缺少独立QA数据库配置');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('无效QA数据库配置'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.username) !== 'wvn_qa' || url.pathname !== '/wvn_qa'
    || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '25439') throw new Error('拒绝在独立wvn_qa角色/数据库/回环25439以外运行');
  return value;
}
const databaseUrl = qaDatabase(process.env.WVN_TEST_DATABASE_URL);
if (process.env.DATABASE_URL) qaDatabase(process.env.DATABASE_URL);
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL required');
const redisTarget = new URL(redisUrl);
if (!['127.0.0.1', 'localhost'].includes(redisTarget.hostname) || redisTarget.port !== '26389') throw new Error('QA Redis must use dedicated loopback 26389');
const meiliUrl = process.env.MEILISEARCH_URL ?? 'http://127.0.0.1:27739';
const meiliTarget = new URL(meiliUrl);
if (!['127.0.0.1', 'localhost'].includes(meiliTarget.hostname) || meiliTarget.port !== '27739') throw new Error('QA Meili must use dedicated loopback 27739');
const meiliKey = process.env.MEILI_MASTER_KEY;
if (!meiliKey) throw new Error('MEILI_MASTER_KEY required');
const proxy = process.env.WG_TEST_PROXY ?? process.env.https_proxy ?? process.env.HTTPS_PROXY ?? 'http://127.0.0.1:11090';
const proxyTarget = new URL(proxy);
if (!['127.0.0.1', 'localhost'].includes(proxyTarget.hostname) || proxyTarget.port !== '11090') throw new Error('Browser must use the existing build proxy 11090');

const run = randomUUID().replaceAll('-', '').slice(0, 16);
const runId = 'platform-' + run;
const schemas = { catalog: 'e2e_' + run + '_catalog', accounts: 'e2e_' + run + '_accounts', resources: 'e2e_' + run + '_resources' };
const indexUid = 'e2e_platform_' + run;
const state = join(source, 'state', 'platform-qa', runId);
const report = join(source, 'reports', 'platform-browser', runId);
const prefix = 'e2e:platform:' + run + ':';
const secrets = new Set<string>([databaseUrl, redisUrl, meiliKey, decodeURIComponent(new URL(databaseUrl).password), decodeURIComponent(redisTarget.password)].filter(Boolean));
function redact(value: string) {
  for (const secret of secrets) value = value.split(secret).join('[REDACTED]');
  return value.replace(/(?:postgres(?:ql)?|redis):\/\/[^\s"']+/g, '[PRIVATE_SERVICE_URL]').replace(/fill\(([\"'])[A-Za-z0-9_-]{27}\1\)/g, 'fill([REDACTED_CODE])');
}
const receipt: Record<string, any> = { runId, startedAt: new Date().toISOString(), host: hostname(), schemas, indexUid,
  boundary: '真实入口与Passkey/PG/Redis/Meili接线；不代表游戏/NAT/公网部署验收', steps: [], children: [], cleanup: {}, status: 'starting' };
let env: NodeJS.ProcessEnv;
let interrupted = false;
const createdSchemas: string[] = [];
const owned: { name: string; child: ChildProcess; result: Promise<{ code: number | null; signal: NodeJS.Signals | null }>; log: string }[] = [];
let admin: Pool | undefined;
let meili: MeiliClient | undefined;
let ownIndex = false;

async function freeSpace() {
  const disk = await statfs(state, { bigint: true });
  const free = disk.bavail * disk.bsize;
  if (free < 62n * 1024n ** 3n) throw new Error('SPACE_STOP：可用空间低于62GiB，拒绝启动QA或写存档');
  return Number(free);
}
async function vacant(port: number) {
  const server = createServer();
  await new Promise<void>((yes, no) => { server.once('error', () => no(new Error('QA端口已占用：' + port))); server.listen(port, '127.0.0.1', yes); });
  await new Promise<void>(yes => server.close(() => yes()));
}
async function launch(name: string, argv: string[], stream = false) {
  if (interrupted) throw new Error('QA已被中断');
  const log = join(state, name + '.log');
  await writeFile(log, '', { mode: 0o600 });
  const child = spawn(process.execPath, argv, { cwd: source, env, stdio: ['ignore', 'pipe', 'pipe'] });
  receipt.children.push({ name, pid: child.pid, log: log.slice(source.length + 1) });
  const writes: Promise<unknown>[] = [];
  for (const output of [child.stdout!, child.stderr!]) {
    let pending = '';
    function flush(force = false) {
      let index: number;
      while ((index = pending.indexOf('\n')) >= 0 || (force && pending)) {
        const line = index >= 0 ? pending.slice(0, index + 1) : pending;
        pending = index >= 0 ? pending.slice(index + 1) : '';
        const safe = redact(line);
        writes.push(import('node:fs/promises').then(fs => fs.appendFile(log, safe)));
        if (stream) process.stdout.write(safe);
      }
    }
    output.on('data', bytes => { pending += bytes.toString(); flush(); });
    output.on('end', () => flush(true));
  }
  const result = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(yes => {
    child.once('error', () => yes({ code: -1, signal: null }));
    child.once('close', async (code, signal) => { await Promise.allSettled(writes); yes({ code, signal }); });
  });
  const record = { name, child, result, log }; owned.push(record);
  await writeFile(join(state, 'children.json'), JSON.stringify({ runId, host: hostname(), cwd: source, children: receipt.children }, null, 2), { mode: 0o600 });
  return record;
}
async function step(name: string, argv: string[]) {
  console.log('平台QA：' + name);
  const child = await launch(name, argv);
  const result = await child.result;
  receipt.steps.push({ name, ...result });
  if (result.code !== 0) {
    console.error(redact((await readFile(child.log, 'utf8')).slice(-6000)));
    throw new Error('QA步骤失败：' + name + '，退出码' + result.code);
  }
}
async function waitReady(url: string, ca?: string, token?: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (interrupted) throw new Error('QA已被中断');
    if (owned.some(record => ['catalog-server', 'account-server', 'search-worker'].includes(record.name) && record.child.exitCode !== null)) throw new Error('实际入口或搜索worker提前退出，请检查本任务日志');
    try {
      const status = ca ? await new Promise<number>((yes, no) => {
        const req = httpsRequest(url, { ca, rejectUnauthorized: true }, response => { response.resume(); yes(response.statusCode ?? 0); });
        req.once('error', no); req.setTimeout(1000, () => req.destroy(new Error('readiness timeout'))); req.end();
      }) : (await fetch(url, { signal: AbortSignal.timeout(1000) })).status;
      if (status === 200 && (!token || (await stat(token)).size > 0)) return;
    } catch {}
    await new Promise(yes => setTimeout(yes, 200));
  }
  throw new Error('QA入口就绪超时：' + new URL(url).origin);
}
let stopping: Promise<void> | undefined;
function stopChildren() { return stopping ??= (async () => {
  for (const record of [...owned].reverse()) if (record.child.exitCode === null && record.child.signalCode === null) record.child.kill('SIGTERM');
  for (const record of [...owned].reverse()) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([record.result, new Promise<null>(yes => { timer = setTimeout(() => yes(null), 15000); })]);
    if (timer) clearTimeout(timer);
    if (result === null) { record.child.kill('SIGKILL'); await record.result; receipt.cleanup.forcedChildren ??= []; receipt.cleanup.forcedChildren.push(record.name); process.exitCode = 1; }
    (receipt.cleanup.children ??= []).push({ name: record.name, ...await record.result });
  }
})(); }
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { interrupted = true; process.exitCode = 143; void stopChildren(); });

try {
  await mkdir(state, { recursive: true, mode: 0o700 }); await chmod(state, 0o700);
  await mkdir(report, { recursive: true, mode: 0o700 }); await chmod(report, 0o700);
  await mkdir(join(source, 'reports', 'sharing-preview'), { recursive: true });
  for (const path of ['blobs', 'catalog-state']) await mkdir(join(state, path), { mode: 0o700 });
  receipt.freeBytesBefore = await freeSpace();
  console.log(JSON.stringify({ runId, schemas, indexUid, report: report.slice(source.length + 1) }));
  for (const port of [4281, 4282, 4283, 4284]) await vacant(port);
  await stat(join(source, 'build/server/index.js'));
  admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  const identity = (await admin.query('SELECT current_user AS role,current_database() AS database')).rows[0];
  if (identity.role !== 'wvn_qa' || identity.database !== 'wvn_qa') throw new Error('PG实际连接身份不属于wvn_qa，拒绝创建schema');
  for (const schema of Object.values(schemas)) { await admin.query('CREATE SCHEMA "' + schema + '"'); createdSchemas.push(schema); }
  meili = new MeiliClient({ url: meiliUrl, apiKey: meiliKey });
  if ((await meili.listIndexes()).some(item => item.uid === indexUid)) throw new Error('QA随机索引已存在，拒绝覆盖');
  ownIndex = true;
  const secretFile = join(state, 'account-secret'), tlsKey = join(state, 'tls.key'), tlsCert = join(state, 'tls.crt');
  const secret = randomBytes(64).toString('base64url'); secrets.add(secret);
  await writeFile(secretFile, secret, { mode: 0o600 });
  const fixtureFile = join(state, 'fixture.json');
  // 保留代理/PATH等环境，只显式注入本轮WG配置，避免继承其他预览/生产参数。
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('WG_')));
  env = { ...inherited, NODE_ENV: 'production', WG_DEPLOYMENT_MODE: 'preview',
    DATABASE_URL: databaseUrl, WVN_TEST_DATABASE_URL: databaseUrl,
    WG_DATABASE_URL: databaseUrl, WG_DATABASE_SCHEMA: schemas.catalog, WG_RESOURCE_DATABASE_URL: databaseUrl, WG_RESOURCE_DATABASE_SCHEMA: schemas.resources,
    WG_ACCOUNT_DATABASE_URL: databaseUrl, WG_ACCOUNT_DATABASE: databaseUrl, WG_ACCOUNT_DATABASE_SCHEMA: schemas.accounts,
    WG_RESOURCE_CACHE_PREFIX: prefix + 'resources:', WG_ROOMS_REDIS_PREFIX: prefix + 'rooms:', REDIS_URL: redisUrl,
    MEILISEARCH_URL: meiliUrl, MEILI_INDEX_UID: indexUid, MEILI_MASTER_KEY: meiliKey, MEILI_SEARCH_KEY: meiliKey, MEILI_WRITE_KEY: meiliKey, SEARCH_WORKER_IDLE_MS: '200',
    WG_PORT: '4281', WG_ADMIN_PORT: '4282', WG_STATE_DIR: join(state, 'catalog-state'),
    WG_RESOURCE_ROOT: join(source, 'fixtures/resources'), WG_MEDIA_ROOT: join(source, 'media'), WG_INVENTORY_FILE: join(source, 'data/sources.json'),
    WG_ACCOUNT_BIND: '127.0.0.1', WG_ACCOUNT_PORT: '4283', WG_ACCOUNT_ORIGIN: 'https://localhost:4283', WG_ACCOUNT_UI: '1', WG_ROOMS_ENABLED: '1',
    WG_ACCOUNT_BLOBS: join(state, 'blobs'), WG_ACCOUNT_DELETION_LEDGER: join(state, 'deletions.jsonl'), WG_ACCOUNT_SHARE_LEDGER: join(state, 'share-revocations.jsonl'),
    WG_ACCOUNT_SECRET_FILE: secretFile, WG_ACCOUNT_TLS_KEY: tlsKey, WG_ACCOUNT_TLS_CERT: tlsCert,
    WG_SHARE_ADMIN_ORIGIN: 'https://localhost:4284', WG_SHARE_ADMIN_PORT: '4284', WG_SHARE_ADMIN_TOKEN_FILE: join(state, 'share-admin-token'),
    WG_SHARE_BACKEND_ORIGIN: 'https://localhost:4283', WG_SHARE_ACCOUNT_ORIGIN: 'https://localhost:4283',
    WG_ACCOUNT_TEST_URL: 'https://localhost:4283', WG_ACCOUNT_TEST_CERT: tlsCert,
    WG_SHARING_TEST_URL: 'https://localhost:4283', WG_SHARING_TEST_CERT: tlsCert, WG_SHARING_PUBLIC_URL: 'http://127.0.0.1:4281', WG_SHARING_ADMIN_URL: 'https://localhost:4284',
    WG_TEST_URL: 'http://127.0.0.1:4281', WG_ADMIN_URL: 'http://127.0.0.1:4282', WG_TEST_TOKEN_FILE: join(state, 'catalog-state/admin-token'),
    WG_PLATFORM_FIXTURE_FILE: fixtureFile, WG_PLATFORM_REPORT_DIR: report, WG_TEST_PROXY: proxy,
    NODE_EXTRA_CA_CERTS: tlsCert, PLAYWRIGHT_JSON_OUTPUT_NAME: join(state, 'playwright-result.json'),
  };

  const certificate = spawn('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', tlsKey, '-out', tlsCert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  await new Promise<void>((yes, no) => { certificate.once('error', no); certificate.once('exit', code => code === 0 ? yes() : no(new Error('QA证书生成失败'))); });
  await chmod(tlsKey, 0o600); await chmod(tlsCert, 0o600);
  await step('initialize-schemas', ['--import', 'tsx', 'scripts/initialize-platform.ts']);
  await step('seed-qa-catalog', ['--import', 'tsx', 'scripts/seed.ts']);
  const catalog = new Store(new PgDatabase(databaseUrl, { schema: schemas.catalog }));
  const resources = new PgDatabase(databaseUrl, { schema: schemas.resources });
  try {
    await catalog.ready;
    const versionId = (await catalog.get('v27448'))!.versions[0].id;
    const sha256 = '00001b15352958962673bb4cc446601b948a2c9eaebb1540a92a9f00cbabe7b8';
    const paths = ['images/中文样本.png', 'images/second.png'], keys = paths.map(() => randomUUID());
    const inventory = createHash('sha256').update(JSON.stringify({ paths, sha256 })).digest('hex');
    const namespace = 'e2e:' + run;
    await resources.transaction(async () => {
      await resources.prepare('INSERT INTO wvn_resource_snapshots(namespace,inventory_sha256,source_sha256,total,processed,logical_bytes,published) VALUES($1,$2,$2,2,2,23276,true)').run(namespace, inventory);
      await resources.prepare('INSERT INTO wvn_resource_objects(sha256,bytes) VALUES($1,11638)').run(sha256);
      for (const [i, path] of paths.entries()) await resources.prepare('INSERT INTO wvn_resources(key,namespace,original_path,sha256,content_type,source_file_id,target_file_id,content_sha1) VALUES($1,$2,$3,$4,$5,$6,$7,$8)').run(keys[i], namespace, 'qa-game/' + path, sha256, 'image/png', 'qa-source-' + i, 'qa-target-' + i, '0'.repeat(40));
    });
    const binding = new VersionResources(catalog, new ResourceRepository(resources));
    await binding.bind({ versionId, namespace, inventorySha256: inventory, prefix: 'qa-game/' });
    await writeFile(fixtureFile, JSON.stringify({ runId, schemas, versionId, namespace, inventory, keys, paths, sha256, cdnUrl: 'https://wg-b2.saop.cc/' + sha256 + '.bin' }), { mode: 0o600 });
  } finally { await resources.close(); await catalog.close(); }
  await step('rebuild-own-search-index', ['--import', 'tsx', 'scripts/search-index.ts', 'rebuild']);
  await launch('search-worker', ['--import', 'tsx', 'scripts/search-index.ts', 'worker']);
  await launch('catalog-server', ['--import', 'tsx', 'server.ts']);
  await launch('account-server', ['--import', 'tsx', 'accounts-server.ts']);
  const ca = await readFile(tlsCert, 'utf8');
  await waitReady('http://127.0.0.1:4281/health');
  await waitReady('https://localhost:4283/health', ca, env.WG_SHARE_ADMIN_TOKEN_FILE);
  await waitReady('https://localhost:4284/share-admin', ca);
  const token = (await readFile(env.WG_SHARE_ADMIN_TOKEN_FILE!, 'utf8')).trim(); secrets.add(token); env.WG_SHARING_ADMIN_TOKEN = token;
  const publicToken = (await readFile(env.WG_TEST_TOKEN_FILE!, 'utf8')).trim(); secrets.add(publicToken);
  receipt.freeBytesAtBrowser = await freeSpace();
  console.log('平台QA：真实public/admin/accounts/moderation入口已就绪；运行指定5个浏览器测试文件');
  const playwright = await launch('playwright', ['node_modules/@playwright/test/cli.js', 'test',
    'tests/e2e/accounts.spec.ts', 'tests/e2e/shares.spec.ts', 'tests/e2e/preview-tls.spec.ts', 'tests/e2e/catalog.spec.ts', 'tests/e2e/platform.spec.ts',
    '--reporter=list,json', '--trace=off', '--output=' + join(state, 'test-results'), ...extra], true);
  const result = await playwright.result; receipt.steps.push({ name: 'playwright', ...result });
  const raw = JSON.parse(await readFile(join(state, 'playwright-result.json'), 'utf8'));
  const cases: Record<string, unknown>[] = [];
  function collect(suite: any, titles: string[] = []) {
    const current = [...titles, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) cases.push({ title: [...current, spec.title].join(' / '), status: test.status,
      outcomes: test.results.map((item: any) => ({ status: item.status, duration: item.duration, errors: item.errors?.map((error: any) => redact(error.message ?? 'test_failed')) })) });
    for (const nested of suite.suites ?? []) collect(nested, current);
  }
  for (const suite of raw.suites) collect(suite);
  await writeFile(join(report, 'playwright-results.json'), JSON.stringify({ stats: raw.stats, cases }, null, 2) + '\n');
  try { receipt.cdn = JSON.parse(await readFile(join(report, 'cdn-cors.json'), 'utf8')).status; } catch { receipt.cdn = 'not_run'; }
  receipt.status = result.code === 0 ? 'passed' : 'failed';
  if (result.code !== 0) process.exitCode = 1;
} catch (error) {
  receipt.status = interrupted ? 'interrupted' : 'failed';
  receipt.error = redact((error as Error).message);
  console.error('平台QA失败：' + receipt.error);
  for (const child of owned.filter(item => ['catalog-server', 'account-server', 'search-worker'].includes(item.name))) console.error(redact((await readFile(child.log, 'utf8').catch(() => '')).slice(-4500)));
  process.exitCode = interrupted ? 143 : 1;
} finally {
  await stopChildren();
  if (meili && ownIndex) {
    try {
      const indexes = (await meili.listIndexes()).filter(item => item.uid === indexUid || item.uid.startsWith(indexUid + '_rebuild_'));
      for (const index of indexes) await meili.deleteIndex(index.uid);
      receipt.cleanup.indexes = indexes.map(item => item.uid);
    } catch { receipt.cleanup.indexError = true; process.exitCode = 1; }
  }
  try {
    const redis = createClient({ url: redisUrl, disableOfflineQueue: true, socket: { connectTimeout: 2000, reconnectStrategy: false } });
    redis.on('error', () => {}); await redis.connect();
    let cursor = '0', removed = 0;
    do {
      const [next, keys] = await redis.sendCommand(['SCAN', cursor, 'MATCH', prefix + '*', 'COUNT', '1000']) as [string, string[]]; cursor = next;
      if (keys.length) { await redis.del(keys); removed += keys.length; }
    } while (cursor !== '0');
    redis.destroy(); receipt.cleanup.redisKeys = removed;
  } catch { receipt.cleanup.redisError = true; process.exitCode = 1; }
  if (admin) {
    for (const schema of [...createdSchemas].reverse()) {
      try { await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); (receipt.cleanup.schemas ??= []).push(schema); }
      catch { receipt.cleanup.schemaError = true; process.exitCode = 1; }
    }
    await admin.end();
  }
  if (interrupted) { receipt.status = 'interrupted'; process.exitCode = 143; }
  else if (process.exitCode && receipt.status === 'passed') receipt.status = 'cleanup_failed';
  receipt.finishedAt = new Date().toISOString();
  await writeFile(join(report, 'run.json'), JSON.stringify(receipt, null, 2) + '\n').catch(() => {});
  console.log(JSON.stringify({ runId, status: receipt.status, cdn: receipt.cdn, report: report.slice(source.length + 1), cleanup: receipt.cleanup }));
}
