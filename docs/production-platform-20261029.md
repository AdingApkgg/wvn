# 2026-10-29 PostgreSQL 平台生产切换

生产入口为 `https://wg.saop.cc`，资源域为 `https://wg-b2.saop.cc`。用户已明确授权迁移生产数据、上线及配置 CORS。运行源码版本为 `9a969c573ce9f061b017c80e9f7cdff68eb9ca5e`，健康标记为 `pg-platform-20261029-9a969c5`。

冻结时间为北京时间 **09:09:31**，新服务健康检查于 **09:09:59** 恢复。最终数据重新从已停止写入的 SQLite 生成一致性快照，包含准备期间新增的记录，没有使用早先演练副本替代最终快照。

## 数据核对

| 范围 | 结果 |
| --- | --- |
| 目录原表 | 6 张表，64 部作品、79 个版本、79 条稳定路由、64 份元数据 |
| 账号原表 | 33 张表，18 个账号、18 个 Passkey、20 条会话 |
| 存档与分享 | 3 个 profile、1 个历史 revision、2 个正文引用、11 条分享记录 |
| 删除记录 | 27 条已删除账号记录及独立删除、撤销账本保留 |
| 公共映射 | 1,420,065 条原路径及独立 UUID；1,067,041 个 SHA-256 内容对象 |
| 版本绑定 | 79 个版本，实际发布目录覆盖 1,129,306 条路径 |
| 搜索 | Meilisearch 64 份公开作品文档，PG outbox 64/64 成功消费，独立 worker 常驻 |

目录和账号逐表的源/目标行数及规范化 SHA-256 全部一致。账号迁移包含账号、Passkey、会话、恢复码、书库、存档元数据、分享、统计及删除记录，保留原 ID 和时间语义。

最终目录 SQLite 摘要为 `de135b10368535e443e26e29245002ac0f8bf7893754d6ba94800764a63e2291`；最终账号 SQLite 摘要为 `f596b2d1d187cac6344c44a1e633fa555ee9026a4210cf01fdb73cd2758177d3`。

完整公共索引以原生 PG 归档恢复，保留演练时生成的 UUID。另对全部 key、原路径、内容摘要、大小、MIME、B2 版本 ID 和时间进行有序二进制流校验，源和生产摘要均为：

```text
1ca54c2201ac0773848911aa4a1a35d80456edf7aa0f2f8313f1396d90e4dc39
```

命名空间仍为 `b2/web-visual-novel/snapshot-20261028`，原 B2 对象和旧 SQLite 均保留，没有重新上传正文。

## 服务与边界

Arch 原有生产 web 和私有 manager 服务通过本次独立 drop-in 切到新源码目录，原 origin、RP ID、cookie 前缀、签名 secret、TLS 和私有正文配置保留。PG、Redis、Meili 使用本次独立容器与数据卷，仅监听回环端口 `25432`、`26379`、`27700`。Redis 使用 `noeviction`。

生产进程均不再持有 SQLite 文件句柄。公开目录、账号 HTTPS、私有管理/审核和 Windows 私有正文存储继续分别运行。搜索 worker 启用自启动；原生产服务保持自启动，用户服务管理器已启用 linger。

资源接口示例：

```text
GET https://wg.saop.cc/api/resources/202305b5-1cec-48c3-ad9c-2dfa87398717
```

返回的 URL 为：

```text
https://wg-b2.saop.cc/00001b15352958962673bb4cc446601b948a2c9eaebb1540a92a9f00cbabe7b8.bin
```

单个/批量 UUID、版本清单和相对路径接口见 [平台指南](platform-postgres.md)。现有游戏继续使用已发布的 B2 直读适配与 ONS gzip 清单；UUID API 和版本映射为后续加载方式提供数据，尚未让所有引擎自动改用哈希 URL。

房间 HTTP、WS 和 `/player/room-client.mjs` 已上线。公网 WS 已实际建立连接，并正确以 `unauthorized` / 4003 拒绝无效票据。真实账号双端房间同步、WebRTC、TURN 与 WT 的隔离验证仍见 [房间说明](rooms.md)。公网 TURN/WT 入口及游戏联机界面尚未开放。

## CORS

- B2 桶从 revision 2 更新到 3，仅增加 `wvnPublicResourceRead` 公共读规则，其他桶设置一致。
- Cloudflare 仅为 `wg-b2.saop.cc` 的 GET/HEAD 添加 `Access-Control-Allow-Origin: *`、必要的 Expose-Headers 与 `Cross-Origin-Resource-Policy: cross-origin`；既有 AstroDX HSTS 规则保留。
- OPTIONS 由 B2 实际批准，`Origin: null`、Range / If-Range 预检返回 200。
- 真实公网 COEP 账号页成功读取 11,638 字节 PNG，完整 SHA-256 一致；opaque sandbox 的 `Origin: null` Range 请求返回 206、32 字节及正确 Content-Range。

公共资源请求使用 `credentials: 'omit'`。规则仅用于公共资源域，不应用于账号或私人存档。

## 私有存储恢复与备份

上线前发现 Windows 原 Blob 任务曾在 Tailscale 地址尚未出现时以 `EADDRNOTAVAIL` 退出。已备份该任务配置，恢复原任务，并设置最多 10 次、每分钟一次的失败重试；原监听范围、令牌和数据目录保持一致。当前引用的 2 个存档正文共 **137,336 字节**，已通过原私有接口核验大小和 SHA-256；H 盘约有 351 GiB 可用空间。

切换前的 `wvn-account-backup-v3` 元数据、签名 secret 和独立账本均保存在生产机私有目录。账号原生归档已在独立空数据库恢复，**38 张表的计数和全部行摘要一致**，正文继续保留在原 Windows 数据卷。

切换后另生成包含 `catalog`、`accounts`、`resources` 的原生一致性归档，已验证 PGDMP 目录，SHA-256 为：

```text
bdde9a0c35aacf7cd36ccd60e4433c79118d2316b793ab1d2e5095184e4b03d5
```

## 验证与运维记录

构建机完成合入原生产 B2/ONS 修复后的类型检查、生产构建、242 项 TS 测试、134 项 JS 测试及 25 项隔离真实浏览器测试。公网使用全新匿名浏览器上下文进行只读验收，没有创建生产测试账号、修改存档或发布分享。

生产全部 79 个版本已通过实际 HTTP 接口核验：分页清单、相对路径、批量 key 解析均一致，真实中文搜索命中对应作品。北京时间 09:11:09–09:26:09 对公网健康、搜索、资源 API 进行了 15 分钟采样：31 轮、93 次请求全部通过，失败数为 0；经现有代理的请求中位耗时约 0.532 秒，P95 约 0.719 秒。生产 web、私有 manager 和搜索 worker 均无重启。固定 `.bin` URL 的 GET、HEAD、Range 均确认 Cloudflare 缓存 HIT 与 CORS 头；OPTIONS 为 B2 实际批准的 200。

生产操作根目录为 Arch 的 `/home/i/wvn-platform-production-20261029`：

- `backups/final-frozen/`：最终 SQLite 快照及逐表迁移回执。
- `backups/before-traffic-metadata/`：原生账号元数据、secret、账本与完整清单，仅限受权运维读取。
- `backups/account-restore-proof.json`：独立空库原生恢复回执。
- `backups/production-after-cutover.pgdump`：上线后完整平台归档。
- `backups/planned-*.conf`：本次两份生产 drop-in 的原文。
- `ops/cutover.sh`：实际执行的冻结、迁移、验收及切换脚本。
- `~/.local/state/ai-jobs/wvn-pg-prod-20261029-*/`：独立持久任务、日志、开始/结束时间和退出码。

配置和归档为私有文件，不应上传公共 B2。临时索引导出入口在摘要核对后已收到关闭确认并退出；冗余慢速传输已停止。

## 回滚

生产已有新流量，不能直接恢复旧 SQLite 配置。先停止新写入并备份当前 PG、私人正文及最新删除/撤销账本，再核对切换后的新增与变更；只有完成这些对账，才能选择修复 PG 或将差异迁回旧系统。原目录、对象、配置和最终冻结快照仍保留。

本次只通过原生产服务管理器和 Cloudflare API 发布，未推送 Git 远端。
