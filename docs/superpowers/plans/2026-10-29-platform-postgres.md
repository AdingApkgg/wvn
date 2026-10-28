# PostgreSQL、资源 API、搜索与联机基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全站运行时改用 PostgreSQL，通过抽象资源 key 返回 wg-b2.saop.cc URL，接入 Redis、Meilisearch，以及可实际连通的 WS / WebRTC / coturn / WebTransport 房间基础能力。

**Architecture:** 保留 React Router / Hono 的现有公开、账号、私有管理边界，数据库访问改为异步。PostgreSQL 是业务事实来源，Redis 保存可恢复缓存、在线状态和跨进程通知，Meilisearch 是可重建的公开作品搜索投影。联机房间由统一服务鉴权和排序，WS 与独立 Go WebTransport 网关使用同一协议，WebRTC 使用房间内信令和临时 TURN 凭据。

**Tech Stack:** Node.js 24、TypeScript、Hono、React Router、pg、Drizzle PostgreSQL、Redis、Meilisearch、ws、coturn、Go / quic-go / webtransport-go。

**Spec:** 本文“已确认需求与实施决定”；用户已于 2026-10-29 确认全站迁移、保留服务边界、直接实施并省略设计审批。执行方式由实施者选择为当前会话逐项执行，不重复请求设计或计划批准。

## 已确认需求与实施决定

- 全站迁移包括资源映射、作品目录、账号、存档元数据、分享、书库、统计、备份与恢复。私人存档文件继续使用现有私有 BlobStore，不进入公共 B2 域名。
- 保留作品/版本/账号/存档原 ID、URL、Passkey RP ID、cookie 名称及签名密钥语义、历史存档身份、删除与分享撤销日志。数据库变更不重新 seed 历史数据。
- 资源 key 为独立 UUID 格式的逻辑 ID；不包含桶名、路径、存储厂商或哈希。`(namespace, original_path)` 唯一绑定 key，内容由完整 SHA-256 标识，原名与 MIME 单独保留。已发布资源映射不可覆盖，更新创建新版本映射。
- `GET /api/resources/:key` 和最多 100 项的批量查询返回 `{key,url,sha256,bytes,contentType}`。URL 为 `https://wg-b2.saop.cc/{sha256}.bin`。未知 key 返回 404，批量缺失项显式报告。不按请求参数拼任意上游 URL。
- 游戏按版本读取分页资源清单，避免逐文件查询放大和一次传输全部 142 万路径。已有隔离沙箱、相对路径、MIME、Range、WASM 及原引擎身份须保持兼容。
- Redis 缓存失效后可查询 PG；限流和房间权限校验遇依赖故障须明确拒绝。房间的成员、权限、事件序号及可恢复快照保存在 PG；Pub/Sub 仅通知，重连从 PG 补状态。
- Meilisearch 索引公开作品的标题、原名、别名、多语言标题、标签、引擎及编号。通过 PG 事务 outbox 异步更新，确认 Meilisearch task 成功才确认消费。搜索结果再经 PG 过滤当前发布状态，不输出账号或私人存档。
- 联机本轮提供创建/加入/退出房间、成员权限、信令定向转发、状态事件、重连、短期 TURN 凭据和浏览器连接 SDK。实际游戏剧情同步、投票玩法、语音/屏幕共享 UI 留给后续产品实现，不自动请求摄像头/麦克风权限。
- WT 网关提供真实 HTTP/3 / QUIC 连接与流/数据报，使用同一房间权限；客户端失败回退 WS。WT、TURN 独立于资源 CDN，常规 CF 橙云不作为 WT 回源或 TURN 中继。
- 只在隔离环境写入和验收；生产切换、域名/防火墙变更、删除旧资源与数据库、远程推送另需明确授权。

## Global Constraints

- 资源域名固定为 `https://wg-b2.saop.cc`，对象名为完整小写 SHA-256 加 `.bin`。
- 既有 B2 原对象和 SQLite 迁移源保留；不重传对象正文。
- `resources.sqlite` 基线：1,420,065 个路径、1,067,041 个唯一对象、239,205,984,120 逻辑字节。
- 本机只读改代码和轻量检查；安装、构建、全量类型检查、测试套件、容器及浏览器验证只在已确认 hostname 的远程构建机运行。
- 所有远程长任务写入独立目录、使用 tmux、记录日志、开始时间、PID、退出码；恢复先查询，不盲目重放。
- 境外网络沿用已有代理；仅 root@5.223.51.252 本次 B2 迁移直连是既有例外，不扩张到其他用途。
- 不输出密钥、令牌、私人数据；给人阅读的文档和操作说明使用中文。

## Review Focus

1. 迁移重跑或中断：不能重置逻辑 key、丢映射、重复账号或复活删除/撤销记录；以清单、逐表计数和规范化行摘要验收。
2. 两个请求同时提交同一存档/版本/房间操作：事务、唯一约束和版本条件更新保证只产生一次效果。
3. Redis / Meilisearch 故障及索引滞后：资源查询可回源 PG，搜索不暴露已隐藏内容，关键权限不能依赖可失效缓存。
4. `.bin`、同内容不同 MIME、中文/大小写/带空格路径及相对资源引用：返回正确映射并保持运行时加载语义。
5. 未登录、跨房间/跨 origin、重复 ticket、过大或过快信令、断线与网关重启：拒绝越权、限制内存、恢复房间状态，失败回退 WS。

## Task 1: PostgreSQL 基础、迁移与隔离验证环境

**Files:** `src/database/postgres.ts`, `src/database/migrations.ts`, `scripts/migration/sqlite-to-postgres.ts`, `tests/postgres.test.ts`, `tests/helpers/postgres.ts`, `ops/platform/`。

**Interfaces:** `PgDatabase` 提供异步 `all/get/run/exec/transaction/close`，每个事务绑定同一个连接；原生 `pg.Pool` 供 Better Auth 使用。离线导入只读 SQLite，以独立目标库、checkpoint、事务、计数和摘要回执工作。

- [x] 在真实隔离 PG 上增加事务回滚、并发、约束、超时、重复迁移和参数化查询测试，先观察失败。
- [x] 实现连接池、事务与版本化迁移；引入锁定依赖和仅回环发布的独立 PG / Redis / Meilisearch Compose。
- [x] 实现读取既有 SQLite 的预演/导入/核对工具；SQLite 只出现在离线迁移、旧快照读取场景。
- [x] 在构建机跑数据库测试和基线套件，保存回执并独立提交。

## Task 2: 作品目录全量改用异步 PostgreSQL

**Files:** `src/server/store.ts`, `src/server/schema.ts`, `src/server/runtime.ts`, `src/server/http.ts`, `src/routes/*.tsx`, `src/player/catalog.server.ts`, 依赖目录仓储的脚本与测试。

**Interfaces:** `Store` 读写方法返回 Promise；现有领域输入和响应类型不变；`getStore()` 返回已初始化的 PG 仓储，服务启动前应用迁移。

- [x] 把目录领域测试改为真实 PG fixture，覆盖 URL、版本序号、revision 冲突和 metadata 合并；先观察失败。
- [x] 移除运行时 SQLite DDL 和语法，改为 PG 查询与事务；更新 SSR loader、HTTP、管理和脚本的 await 链。
- [x] 运行目录与元数据回归、类型检查；核对旧目录导入前后规范化记录，独立提交。

## Task 3: 账号、存档、分享和备份恢复改用 PostgreSQL

**Files:** `src/accounts/*.server.ts`, `accounts-server.ts`, `scripts/account-backup.ts`, 账号/存档/分享/统计测试及 helpers。

**Interfaces:** Better Auth 直接接 `pg.Pool`；账号领域仓储均异步，公开 HTTP 合约与 BlobStore 合约不变。备份使用 PG 一致性快照及受保护的私有文件/撤销日志清单，恢复到独立目标先核对再使用。

- [ ] 使用 PG fixture 跑既有账号、Passkey、撤销、存档冲突、分享及统计测试并确认预期失败。
- [ ] 改造所有仓储、事务、hooks 和调用者，保留 ID / 时间语义 / cookie / 私有存档隔离；并发约束不再依靠进程内单连接锁。
- [ ] 实现 PG 备份恢复与 SQLite 旧快照导入验证，覆盖已删除账号和已撤销分享不能复活。
- [ ] 运行完整服务回归及浏览器账号/存档流程，独立提交。

## Task 4: 资源 key API、Redis 缓存与实际映射导入

**Files:** `src/resources/{schema,repository,http,cache}.ts`, `scripts/migration/import-resources.ts`, `tests/resource-api.test.ts`, 版本清单接口与播放器资源桥接。

**Interfaces:** `ResourceRepository.resolve(key)` / `resolveMany(keys)` 返回公开资源记录；统一 URL 构造只接受有效 SHA-256。导入相同 `(namespace,original_path)` 保留已分配 UUID；变更内容拒绝覆盖。

- [ ] 在真实 PG / Redis 上测试 key、中文路径、MIME、批量上限、未知 key、cache 故障和不可变冲突，先观察失败。
- [ ] 建立索引、接口、Redis 有界 TTL 缓存、版本级分页清单和既有资源身份桥接。
- [ ] 分批导入冻结完成的 1,420,065 路径；核对计数、全行摘要及抽样 API → CDN 字节 SHA-256，不下载整桶。
- [ ] 浏览器验证实际运行时请求、CORS / COEP、MIME / Range 与相对引用，独立提交。

## Task 5: Meilisearch 作品搜索与可靠索引

**Files:** `src/search/{client,projection,worker,http}.ts`, `scripts/search-index.ts`, `src/routes/catalog.tsx`, `tests/search.test.ts`。

**Interfaces:** `searchWorks({q,engine,state,tag,limit,offset})` 提供目录搜索；索引 worker 从 PG outbox 消费并等待 Meilisearch task 完成，支持全量重建。

- [ ] 用真实 Meilisearch 测试中文/别名、筛选、隐藏作品、异步失败重试及故障降级，先观察失败。
- [ ] 接入文档与索引设置、公开查询 API 和目录页，内部密钥不进入浏览器；追加索引更新事务 outbox。
- [ ] 验证重建、重跑幂等、已隐藏结果回滤和可见错误，独立提交。

## Task 6: 房间、WS、WebRTC、coturn 与 WebTransport

**Files:** `src/rooms/{repository,protocol,http,websocket,turn}.ts`, `public/player/room-client.mjs`, `services/webtransport/`, `ops/platform/turnserver.conf.example`, `tests/rooms*.test.ts`。

**Interfaces:** 版本化 JSON 消息 envelope `{v,id,type,roomId,seq,payload}`；PG 房间授权/序号/幂等事件，Redis 通知和一次性短期 ticket；WT 网关通过私有、鉴权连接进入同一房间服务。

- [ ] 写创建/加入/退出/关闭、两用户定向信令、角色、重连、ticket 重放/过期、origin、大小与速率限制测试，先观察失败。
- [ ] 实现房间 REST、WS、coturn REST HMAC 短期凭据、浏览器 WebRTC DataChannel 建链和 WS 回退。
- [ ] 实现独立 Go HTTP/3 WT 流/数据报网关及浏览器 WT 连接适配，服务端统一鉴权，失败回退 WS。
- [ ] 在远程浏览器验证双客户端、强制 TURN relay、真实 WT QUIC、重连和跨房间拒绝，保存连通证据，独立提交。

## Task 7: 全站集成、数据演练与交付

**Files:** `ops/platform/`, `.env.example`, `README.md`, `docs/platform-postgres.md`, 本任务验证回执。

- [ ] 生成可运行的隔离部署配置、健康检查、资源限制、独立卷、备份和回滚步骤；TURN / WT 默认不开放公网。
- [ ] 跑全量测试、类型检查、生产构建、迁移重跑/恢复和远程浏览器流程；记录通过范围和未获生产授权的操作。
- [ ] 使用新上下文审阅全分支，修复实质问题并复测；分功能保留本地提交。
- [ ] 交付 API 示例、数据核对、服务连通证据、预览入口与生产切换所需的具体清单。没有生产授权时不推送、不切换生产。
