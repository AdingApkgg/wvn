# PostgreSQL 平台与资源 API

本轮保持公开目录、账号 HTTPS、私有目录管理、分享审核及私有 BlobStore 的服务边界。PostgreSQL 是业务数据来源；Redis 保存短期缓存、票据、限流及通知；Meilisearch 只保存可重建的公开作品投影。原 SQLite 和 B2 对象保留，生产切换需单独授权。

## 数据与服务

| 数据 | 默认 schema | 入口 |
| --- | --- | --- |
| 作品、版本、元数据、检查报告、搜索 outbox | `catalog` | `server.ts`、账号的公开目录入口 |
| 账号、Passkey、会话、书库、存档元数据、分享、统计、房间 | `accounts` | `accounts-server.ts` |
| 公共 SHA-256 对象、原路径、UUID、快照和版本绑定 | `resources` | 上述公开 API，或独立资源服务 |
| 私人存档正文、删除和撤销账本 | 原私有数据卷 | 原 BlobStore / 分离存储主机 |

各 schema 可以配置为不同数据库。`WG_DATABASE_URL` / `WG_DATABASE_SCHEMA` 指定目录，`WG_ACCOUNT_DATABASE_URL` / `WG_ACCOUNT_DATABASE_SCHEMA` 指定账号，`WG_RESOURCE_DATABASE_URL` / `WG_RESOURCE_DATABASE_SCHEMA` 指定资源。资源 URL 未单独设置时复用目录数据库连接地址，使用明确的资源 schema。兼容变量 `WG_ACCOUNT_DATABASE` 仍仅接受 PG URL。

账号默认从 PG 公开目录读取版本；设置 `WG_ACCOUNT_CATALOG_ORIGIN` 时继续通过既有目录 HTTP 边界读取。新增、改名、隐藏的版本会反映到账号目录、游玩和新存档 profile 校验；历史私有存档保留原版本身份。

## 新的隔离环境

只在专用远程构建/部署机器运行。先确认 `hostname`，将长命令写入独立任务脚本，通过该机器已有执行器或独立 tmux 启动，保存日志、PID 和退出码。依赖下载使用该机器已有代理。断线后查原任务，不重复投递。

`ops/platform/compose.yaml` 提供仅回环监听的 PG 18.6、Redis、Meili 及独立数据卷，环境中的密码由 `0600` 私有文件注入。第一次初始化创建 `catalog`、`accounts`、`resources`。`compose.qa.yaml` 为不同端口的独立测试环境，角色与数据库均为 `wvn_qa`；测试还使用随机 schema。不要对业务数据库运行测试。

```sh
docker compose --env-file /私有路径/platform.env -p wvn-isolated -f ops/platform/compose.yaml up -d
set -a
. /私有路径/application.env
set +a
npm run db:init
```

`db:init` 只初始化指定 schema 的表和版本迁移，无 HTTP listener、无账号、无目录种子，不读取旧 SQLite 和独立账本。应用私有配置参考 `.env.example`。新演示环境可显式 `npm run seed`；历史迁移目标不能用 seed 填充。

PG 官方客户端版本须与数据库兼容。Redis 使用 `noeviction`：满额后资源缓存可跳过写入并回查 PG，关键票据与限流写入失败明确拒绝，不允许通过淘汰限流键重置配额。房间 Redis 与 WT/coturn 配置见 [联机说明](rooms.md)。

## SQLite 离线迁移

先冻结旧站写入并生成一致的 SQLite 副本，保留原文件及最新删除/撤销账本。不要直接复制活跃 WAL 数据库的主文件。目标为隔离 PG schema，先 `db:init`，不 seed，不接外部流量。

通用导入器先核对全部表、列、主键、类型和约束；账号/目录整份使用一个 PG 事务，支持延迟循环外键。保留源 ID、时间、布尔语义和原始插入排序；重复导入比对行摘要，冲突不覆盖。中断则回滚整轮。SQLite 只出现在离线导入和旧快照准备代码中。

从私有环境设置本次目标 `DATABASE_URL`，对目录和账号分别执行：

```sh
node --import tsx scripts/migration/sqlite-to-postgres.ts --source /私有路径/frozen/catalog.sqlite --schema catalog
node --import tsx scripts/migration/sqlite-to-postgres.ts --source /私有路径/frozen/catalog.sqlite --schema catalog --apply
node --import tsx scripts/migration/sqlite-to-postgres.ts --source /私有路径/frozen/accounts.sqlite --schema accounts
node --import tsx scripts/migration/sqlite-to-postgres.ts --source /私有路径/frozen/accounts.sqlite --schema accounts --apply
```

预演不会写业务行；`--apply` 后每表计数与规范化 SHA-256 必须全部匹配。导入前先审查预演，不能忽略无法映射的表或列。之后在回环 listener 启动账号服务，使用原 secret、origin、cookie 名、正文卷和最新账本，等待删除/撤销重放完成，核验旧 Passkey、会话、存档正文和历史身份。

原生 PG 备份、独立空库恢复、V1/V2 SQLite 旧归档和分机存档步骤见 [备份恢复说明](pg-backups.md)。原生 dump 已包含 schema，恢复时不要先执行 `db:init`。

## 公共资源索引与 API

逻辑 key 是独立 UUID，内容是完整 SHA-256；原名/MIME 保存在 PG。客户端请求 API 获取 URL，再从 `wg-b2.saop.cc` 读取正文。

```text
GET  /api/resources/{UUID}
POST /api/resources/resolve                 {"keys":["UUID", "UUID"]}
GET  /api/resources/manifest?namespace=...&version=清单SHA256&limit=500
GET  /api/versions/{原versionId}/resources?limit=500&cursor=...
GET  /api/versions/{原versionId}/resource?path=相对文件名
```

返回 `{key,url,sha256,bytes,contentType}`，`url` 固定为 `https://wg-b2.saop.cc/{sha256}.bin`。批量最多 100 项并显式列出 missing；清单每页最多 500 项。无按请求参数拼接任意上游 URL 的入口。资源缓存故障会回查 PG。

实际完整映射已在构建机隔离 `wvn_qa.resource_full_20261029` 演练，原 SQLite 在 `/home/i/wvn-platform-20261029/data/resources.sqlite`：

| 项目 | 核对结果 |
| --- | --- |
| 路径 / 独立 UUID | 1,420,065 / 1,420,065 |
| 唯一内容对象 | 1,067,041 |
| 逻辑字节 | 239,205,984,120 |
| 预演 / 应用 / 独立核对 | 43.759 / 322.336 / 77.464 秒 |
| 源快照 SHA-256 | `2a04ee201a45363d073eb09f80c0d6ac93089ceeb0b90a5ca850084a18e0e7ee` |
| 规范化元数据 SHA-256 | `051416cf585d8241a35996811f093b7c24064b74b98a5b0feb39934d80f572bd` |

先只读验证源，分批导入并记录 checkpoint，完整摘要核对通过后才发布 namespace。原 B2 对象、源 SQLite 均未删除，也没有重传资源正文。重跑同快照保留 UUID；同原路径内容变化拒绝覆盖，应创建新快照命名空间。

```sh
node --import tsx scripts/migration/import-resources.ts --source /私有路径/resources.sqlite --namespace b2/web-visual-novel/snapshot-20261028 --schema resources
node --import tsx scripts/migration/import-resources.ts --source /私有路径/resources.sqlite --namespace b2/web-visual-novel/snapshot-20261028 --schema resources --apply
node --import tsx scripts/migration/import-resources.ts --source /私有路径/resources.sqlite --namespace b2/web-visual-novel/snapshot-20261028 --schema resources --verify
```

版本资源桥接使用不可变 `(原versionId, namespace, 清单SHA256, 完整原路径前缀)`。原路径可能包含 `imports/webgal.moe/2026-10-27/...`，不能猜测或截短。先审查实际前缀与目录版本，运行 `scripts/bind-version-resources.ts` 的预演，确认命中数后再 `--apply`：

```sh
node --import tsx scripts/bind-version-resources.ts --version 原versionId --namespace b2/web-visual-novel/snapshot-20261028 --inventory 清单SHA256 --prefix 完整游戏目录/ --catalog-schema catalog --resource-schema resources
```

清单只遍历该游戏的前缀，保留中文、空格、大小写和相对文件名，游标绑定版本和清单。已隐藏目录版本不提供清单。尚未自动替换现有游戏的资源加载地址；生产 CORS 与逐引擎兼容验收通过后再切换，避免一次加载 142 万路径或每文件一次 API 查询。

## 搜索与联机

```sh
npm run search:rebuild
npm run search:worker
npm start
npm run start:accounts
```

搜索 worker 是独立常驻进程，要和应用分别纳入持久任务/服务管理；一次 `consume` 不会持续同步。`GET /api/search` 与目录筛选均使用 Meili，保留相关性及 nextOffset；每页再以 PG 回查发布状态和筛选，故障明确 503，不伪装成零结果。基础目录浏览不依赖 Meili。密钥仅在后端，详情见 [搜索说明](search.md)。

`WG_ROOMS_ENABLED=1` 在账号 HTTPS listener 接入 `/api/rooms` 和 WS，SDK 为 `/player/room-client.mjs`。鉴权沿用 Passkey 会话及身份 binding，PG 持久化成员、权限、序号和幂等结果；Redis 票据一次性短期有效。账号注销会关闭其房间、清理成员与个人事件，保留事件序号；SDK 关闭会取消未完成的连接，鉴权失效停止重连。

WT 是独立 Go HTTP/3/QUIC 网关，路径为 `/rooms`；WS/WT 使用同一协议。coturn 使用短期 HMAC 凭据，长期 secret 不进入浏览器。未配置 TURN/WT 时相应能力不可用，WS 仍可独立工作。本轮提供联机基础与 SDK，实际游戏剧情同步、投票等产品玩法另行实现。[接口和真实浏览器连通证据](rooms.md)。

## CDN 跨域待应用变更

当前 `wg-b2.saop.cc` 样本返回 PNG 正文但缺少跨域允许头。已准备以下两份配置，**尚未应用到 B2 / Cloudflare**：

- `ops/platform/b2-public-cors.json`：仅公共读操作，允许 Range / If-Range / X-Requested-With 预检，公开必要响应头。
- `ops/platform/cdn-response-headers.json`：Cloudflare `http_response_headers_transform` 阶段的单条规则，只匹配该域名的 GET/HEAD，设 `Access-Control-Allow-Origin: *`、Expose-Headers 和 `Cross-Origin-Resource-Policy: cross-origin`。这是规则对象，不是替换整份 ruleset 的请求体。

公共资源浏览器请求使用 `credentials: 'omit'`；这些规则不应用到账号/私人存档。应用前读取并保留既有 B2 CORS 与 CF ruleset，将本规则合并，不能整份覆盖；按 B2 首匹配规则的语义安排顺序。B2 负责 OPTIONS 的真实批准；仅添加 CF 响应头不能替代预检。源端 CORS 改变后还需按 CF 官方缓存说明验证已有缓存响应。

授权应用后复测：实际账号/沙箱 COEP 页面读取 CDN、Range 206 和 Content-Range、MIME（包括 WASM/脚本）、相对引用、正文 SHA-256。相同字节可能来自不同原 MIME，PG 元数据不等于 CDN 对每个路径都能提供独立 Content-Type，不能据此直接宣称全部引擎兼容。

参考：[B2 CORS 规则](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules)、[CF 通配 CORS 响应规则](https://developers.cloudflare.com/rules/transform/examples/add-cors-header/)、[CF CORS 与缓存](https://developers.cloudflare.com/cache/cache-security/cors/)。

## 实际入口验收

构建完成后，在构建机本任务源码目录的持久化任务中加载私有 QA 服务环境，执行 `bash tests/e2e/run-remote.sh`。`scripts/test-sharing-remote.sh` 已统一转发到同一入口。编排器校验实际主机、目录、tmux、PG 角色/数据库和独立回环端口，创建本次随机 schema/index，初始化、seed 仅限该 QA 数据；实际启动公开/管理/账号/审核 listener 与搜索 worker。

浏览器使用虚拟 Passkey 和只信任本次 localhost 证书的 Chromium，验证注册/登录/恢复、存档上传分享/领取/审核、目录和搜索，以及实际账号绑定的房间 SDK。CDN 跨域结果独立记录，不把缺 CORS 时的 API 查询成功算作正文读取成功。结束后只清理本任务子进程、schema、索引和 Redis 前缀，完整正式资源演练 schema 保留。

## 上线与回滚边界

本次只修改代码、创建隔离数据和验证。账号/目录生产历史数据尚未切换，未推送远程、未改生产服务、CF/DNS 或防火墙；TURN/WT 的真实浏览器证据限隔离环境，不等于公网 NAT / 跨设备验收。

正式切换需要：核对冻结源和最新独立账本、完成 PG 逐表摘要与账号/存档浏览器验收、确认资源版本绑定与 CORS、保存原配置和快照，再取得切换授权。保持原 origin/RP ID/secret/cookie 及私有正文配置。

回滚前先停止新写入并保存新的 PG/正文/账本快照。只有确认 PG 上没有新增业务写入时，才能直接恢复原 SQLite 服务配置；已有新写入必须先对账处理，不能直接切回丢弃新数据。旧 Windows SQLite 复制发布脚本已提前停止，不能用于 PG 生产发布。
