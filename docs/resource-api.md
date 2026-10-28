# 公共资源 key API 与 PostgreSQL 导入

资源的逻辑身份是随机 UUID v4。首次导入为每个 `(namespace, original_path)` 分配一个 key；相同字节对应不同路径或 MIME 时仍保留各自的 key。SHA-256 仅标识内容，资源地址在响应时生成：

```text
https://wg-b2.saop.cc/{完整的小写 SHA-256}.bin
```

API 不接受上游域名、URL、文件系统路径或访问密钥。缓存也只保存 key、摘要、大小、原 MIME。`source_file_id`、`target_file_id`、`content_sha1` 和冻结清单摘要保留在 PostgreSQL，供服务端审计，不出现在公开响应中。

## 接入现有服务

```ts
import { migrate } from './src/database/migrations.ts';
import { resourceMigrations, ResourceRepository, RedisResourceCache, createResourceApp } from './src/resources/index.ts';

await migrate(db, resourceMigrations); // id: 003-resources-postgres
const cache = new RedisResourceCache({
  url: process.env.REDIS_URL!,
  prefix: 'wvn:resources:platform:v1:',
  ttlSeconds: 300,
  timeoutMs: 150,
});
const resources = new ResourceRepository(db, { cache });
app.route('/', createResourceApp(resources));

// 服务端按旧路径查询，传入完整原名，不做 URL 解码或路径归一化。
const resource = await resources.findByOriginalPath(namespace, originalPath);
// 服务退出时 cache.close()；db 由原有服务关闭。
```

迁移只依赖资源表，可单独应用在专用 schema。账号、目录与资源可以共享同一 `PgDatabase`，也可以各用独立 schema。Redis 可选；不传 cache 时直接查询 PG。PG 异常返回 HTTP 503，正文不会泄露连接串。

## HTTP 契约

- `GET /api/resources/:key`：返回 `{ key, url, sha256, bytes, contentType }`。只接受规范的小写 UUID v4；格式错误 400，合法但未知的 key 404。
- `POST /api/resources/resolve`：JSON 正文仅接受 `{ "keys": ["uuid", ...] }`，1～100 项、正文最多 8192 字节。重复 key 去重并保留首次出现顺序。返回 `{ resources: [...], missing: [...] }`；missing 明确列出不存在的 UUID。格式错误 400，超限正文 413。
- `GET /api/resources/manifest?namespace=...&version=...&limit=100&cursor=...`：namespace 必填；version 必须是该命名空间冻结清单的完整 `inventory_sha256`。limit 默认 100，最大 500。返回 `{ namespace, version, resources, nextCursor }`，条目在上述资源字段外增加 `originalPath`。原路径按二进制顺序做 keyset 分页；最后一页 `nextCursor: null`。cursor 绑定 namespace/version，不能跨版本复用；未知或尚未发布的快照 404。重复或未知查询参数 400。

播放器应按选定版本分页拉取所需清单，随后直接使用内容地址。不要为 142 万条路径逐条调用 key API，也不要一次拉取整个桶。API 对任何参数均不发起上游 HTTP 请求。

`contentType` 是原路径的 MIME 元数据。相同 `.bin` 对象可被多个不同 MIME 的原路径引用；API 元数据不会自动改变 CDN 返回的 `Content-Type`。调用方若通过 Blob 使用原 MIME，应明确设置对应类型。当前生产域名的 CORS 配置另行处理，API 专项验证不代表浏览器已经能从生产站跨域读取 B2。

## Redis 的故障边界

默认 TTL 300 秒，可配置 1～3600 秒；每项都以原子 `SET EX` 写入，未找到的 key 不缓存。连接和单次操作的总时间默认最多 150ms，可配置 20～1000ms。关闭离线队列和自动重连，命令队列最多 256 项，同时进行的缓存操作最多 64 项；失败或超时销毁连接并冷却 10 秒，再允许后续请求尝试一次。PG 回源不依赖 Redis 恢复。缓存按部署环境/schema 分配不同前缀。

已发布资源的映射在应用中不可修改。若运维手工改数据库或撤销发布，应一并处理对应缓存；已有缓存最长存活配置的 TTL。

## SQLite → PG 的预检、导入、校验

入口是 `scripts/migration/import-resources.ts`，程序 API 为 `importResources({ db, source, namespace, apply?, verify?, batchSize? })`。CLI 强制显式传 `--schema`，不替操作方创建 schema。`DATABASE_URL` 从现有私有环境加载，不写进命令、报告或日志。

源数据库须是已停止写入的独立一致性快照，`application_id=0x57564e43`、`user_version=1`。导入器只读打开并设置 `query_only`；读取前后及各批之间核对文件身份、大小、修改/变更时间，拒绝非空 WAL。它计算源文件 SHA-256，并遍历所选命名空间的所有记录：

1. 每条路径都必须有一致的 `resource_objects`、`b2_cas_sources`、`b2_cas_locations`；源状态必须 `verified`，错误必须为 NULL，源摘要与路径摘要一致。
2. 原名、MIME、字节数、源版本 ID、目标版本 ID、传输 SHA-1 和清单摘要必须有效；额外/缺失的源回执同样拒绝。
3. canonical 元数据摘要包含原名、MIME、源/目标版本等全部审计字段，不包含运行中分配的 UUID。
4. 同一 namespace 已有的 inventory 或 canonical 元数据发生变化时拒绝覆盖。相同摘要已有不同字节数报 `OBJECT_CONFLICT`；已有路径的内容、MIME 或审计版本不同报 `PATH_CONFLICT`。

默认 dry-run 不写资源、进度或运行审计行，只检查计划和现有冲突；CLI 会先应用资源表结构迁移。`--apply` 每批原子写入对象/路径并提交检查点，默认批大小 1000，范围 1～5000。并发运行由命名空间租约保护。异常会记录在 `wvn_resource_import_runs`，保留最后成功批次；重新执行同一命令会保留 UUID 并从检查点继续。进程突然终止时租约最长 5 分钟到期，先查原任务再重试，不要重复投递仍在运行的导入。

所有批次完成后，使用服务端游标重新计算整个 PG 命名空间的 canonical 摘要和记录数；完全匹配才设置 `published=true`。部分导入的 key、原路径和清单对 API 都不可见。已完成的同源导入重跑仍会核验全部已有映射。`--verify` 为独立只读校验模式，会额外检测目标多出的路径；不创建新的导入运行行。`--apply` 与 `--verify` 互斥。

以下命令只在已授权的远程构建机持久化任务内执行。示例隔离 schema 为 `resource_full_20261029`；源路径按实际传递位置填写。首次使用由主任务先创建该 schema：

```sh
node --import tsx --input-type=module <<'JS'
import { PgDatabase } from './src/database/postgres.ts';
const db = new PgDatabase(process.env.DATABASE_URL);
try { await db.exec('CREATE SCHEMA IF NOT EXISTS resource_full_20261029'); }
finally { await db.close(); }
JS

# 先预检，报告应为 dry-run，核对 total / logicalBytes / sourceSha256 / metadataSha256。
node_modules/.bin/tsx scripts/migration/import-resources.ts \
  --source /home/i/wvn-platform-20261029/data/resources.sqlite \
  --namespace b2/web-visual-novel/snapshot-20261028 --schema resource_full_20261029 \
  --report reports/resource-api/full-dry-run.json

# 再写入专用 schema；若断线，先查原任务日志与退出码。
node_modules/.bin/tsx scripts/migration/import-resources.ts \
  --source /home/i/wvn-platform-20261029/data/resources.sqlite \
  --namespace b2/web-visual-novel/snapshot-20261028 --schema resource_full_20261029 \
  --batch-size 1000 --apply --report reports/resource-api/full-apply.json

# 独立重新核验所有路径和审计字段。
node_modules/.bin/tsx scripts/migration/import-resources.ts \
  --source /home/i/wvn-platform-20261029/data/resources.sqlite \
  --namespace b2/web-visual-novel/snapshot-20261028 --schema resource_full_20261029 \
  --verify --report reports/resource-api/full-verify.json
```

完成后在该 schema 内查询 `wvn_resource_snapshots` 与 `wvn_resource_import_runs`，核对 `published=true`、`processed=total`、`status='complete'`、无错误代码。预期正式源为 1,420,065 条路径、1,067,041 个内容对象、239,205,984,120 逻辑字节；这些是迁移源交接值，必须由实际全量导入再次证明。

```sql
SELECT namespace,inventory_sha256,source_sha256,metadata_sha256,total,logical_bytes,processed,published
FROM resource_full_20261029.wvn_resource_snapshots;
SELECT status,total,processed,inserted,checkpoint,error_code,error_path
FROM resource_full_20261029.wvn_resource_import_runs ORDER BY started_at DESC;
SELECT count(*) AS objects FROM resource_full_20261029.wvn_resource_objects;
SELECT count(*) AS paths,count(DISTINCT key) AS unique_keys FROM resource_full_20261029.wvn_resources;
```

全流程不上传、不复制、不删除 B2 对象，不需要 B2 密钥。原对象保留；发布完成仅指 PG 元数据可读取，不代表站点已切换、浏览器已验收或生产 CORS 已修改。

## 独立 HTTP 演练入口

在远程持久化任务中运行：

```sh
RESOURCE_DATABASE_SCHEMA=resource_full_20261029 \
RESOURCE_HOST=127.0.0.1 RESOURCE_PORT=4270 \
node_modules/.bin/tsx src/resources/server.ts
```

入口读取已有 `DATABASE_URL`、可选 `REDIS_URL`，启动时幂等应用资源迁移。默认仅监听回环；`GET /health` 会检查真实 PG。它不会启动账号、目录或播放器服务。也可调用 `startResourceServer({ db, host, port, redisUrl, cachePrefix })`；返回的 `close()` 关闭本服务的 HTTP/Redis，db 仍由调用方关闭。

## 专项验证

真实服务环境下运行：

```sh
node_modules/.bin/tsx --test --test-concurrency=1 \
  tests/resource-api.test.ts tests/resource-api-import.test.ts tests/resource-api-cache.test.ts
```

PG 测试使用 `WVN_TEST_DATABASE_URL`，仅允许专用 `wvn_qa` 数据库和角色，并为每项测试创建随机 schema。Redis 测试只删除各自随机前缀的键，不执行清库。覆盖固定 URL、MIME、未知和非法 key、批量缺失、清单分页、部分导入隔离、只读源、重跑 UUID、冲突恢复、错误回执、WAL 拒绝、独立全量元数据校验、真实 HTTP 服务、真实缓存命中与超时回源。
