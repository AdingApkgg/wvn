# 平台迁移实施与最终验收

本次在 `codex/sha256-assets` 独立工作区完成代码和隔离验收，未推送或切换生产。服务保持公开目录、账号 HTTPS、私有管理/审核、私有 BlobStore 的原有边界。

## 实现结果

- 目录、账号、Passkey、会话、存档元数据、分享、书库和统计运行时均改 PostgreSQL。保留原 ID / URL / 身份绑定和时间语义，私人存档正文不进入公共 B2。
- 独立 UUID key 查询单个/批量资源 URL，域名固定 `wg-b2.saop.cc`，对象名为完整 SHA-256 加 `.bin`。原名、MIME、源/目标审计映射保留 PG，Redis 故障可回源。
- 版本级资源绑定不可覆盖，提供按游戏前缀分页清单和相对路径桥接；未自动切换现有游戏的资源加载地址。
- Meilisearch 公开搜索接入目录与 API；PG outbox、异步 task 成功确认、重试、重建及常驻 worker 已完成。
- 房间 PG 权限/序号/幂等、一次性票据、WS、WebRTC、coturn 短期凭据、真实 QUIC WT 网关与客户端回退完成，SDK 取消/终止/重连和 peer 清理有回归覆盖。
- 原生 PG 备份恢复、同一导出快照的正文引用/计数、独立删除/撤销账本、V1/V2 SQLite 离线转换，以及旧启动脚本的 PG 适配/提前拒绝已完成。

## 最终检查

任务 `wvn-platform-20261029-runtime-final-check` 在专用构建机 `hostname=localhost` 的持久化 tmux 中执行，于 **2026-10-28T22:07:57Z** 退出 0：

| 检查 | 结果 |
| --- | --- |
| 全项目类型检查 | 通过 |
| 生产构建 | 通过 |
| TypeScript 全套 | 239/239，零失败/跳过/取消 |
| JavaScript 全套 | 106/106，零失败/跳过/取消 |
| 实际服务浏览器 | 25/25，零跳过 |
| 只读异步调用审计 | 未发现 Promise 直接进入 JSON 或未等待的业务写入；既有 UI navigate 属框架导航 |
| Compose 配置、脚本和 CORS JSON 语法 | 通过；未应用线上规则 |

最终逐文件核对 **395 份运行源码、测试和配置** 与构建机一致，构建产物 SHA-256 和完整计数见 [final-check.json](final-check.json)。

实际浏览器任务 `wvn-platform-20261029-platform-browser-03` 于 **2026-10-28T22:09:45Z** 退出 0，覆盖真实 Passkey 注册/登录/恢复、身份切换、云备份/中断恢复、公开/链接分享的审核和领取、目录/搜索、指定 TLS 信任以及真实账号绑定的双客户端 RoomClient WS/状态同步/删除失效。所有应用/worker 子进程正常 code=0，未使用 SIGKILL；本轮端口、三个 schema、索引和 Redis 前缀已清理。

完整的浏览器回执与清理审计见 [platform-browser](../platform-browser/verification.md)，真实 WT 流/数据报、强制 TURN relay、直连及 WS 回退见 [rooms](../rooms/verification.md)。后者限同机隔离环境，不是公网 NAT / 跨设备验收。

## 正式公共索引的全量演练

专用 `wvn_qa.resource_full_20261029` 已实际导入并独立核验：**1,420,065 个唯一 UUID 路径、1,067,041 个对象、239,205,984,120 逻辑字节**，全部 source/target canonical 摘要一致，成功记录无错误。dry-run 43.759 秒，apply 322.336 秒，独立 verify 77.464 秒。

原始 SQLite、gzip 和完整 PG 演练数据保留；没有重传/删除 B2 正文。VPS 临时索引传输服务收到校验完成 POST 204 后已退出，18443 端口无残留监听。详细 [全量回执](../resource-api/full-rehearsal-20261029.md)。

另以真实全量索引中的 key `202305b5-1cec-48c3-ad9c-2dfa87398717` 通过资源 API 获取用户给定 PNG 的 `.bin` URL，再经代理只读请求 CDN：200、11638 字节、完整 SHA-256 一致、`image/png`、CF HIT；Range 返回 206 与正确 32 字节内容。见 [cdn-sample.json](cdn-sample.json)。

**实际 COEP 浏览器读取仍被缺失 CORS 头阻止**，与服务端 HTTP 字节验证不同。已经准备 `ops/platform/b2-public-cors.json` 和 `cdn-response-headers.json`，尚未应用。生产 CORS、逐引擎直接加载/MIME/相对引用、生产账号/目录切换、公网 TURN/WT 与真实游戏联机仍是单独授权及验收步骤。

## 审阅与回归修复

独立上下文审阅及真实浏览器发现的实质问题已修复并测试：

- 分享异步提交/删除/GC 等待，以及两实例重叠/晚到复制的规范回执；原回归先复现唯一键冲突和 `UPLOAD_COMMITTED`。
- PG 新增、改名、隐藏版本同步至账号目录、游玩和存档校验。
- 注销时关闭房间、锁定父房间行、清除成员和个人事件，保留序号并清空 message ID 避免去重键冲突。
- SDK 在 ticket、WT、TURN、SDP 等待或排队时关闭的取消；终止鉴权停止重试；同成员并发复用 peer，普通重连关闭旧 peer 后可重建。
- 审核队列 await 和管理员登录限流 await；实际限流配额通过接口消耗，缺 await 的旧路径已再次验证失败，再恢复修复跑绿。
- SSR 与 listener 分别加载模块产生两份 PG pool，改为同进程共享 runtime；双模块单测及实际 SIGTERM 正常退出均通过。

早期转换脚本曾改到构建机的一份旧并发测试副本，导致测试等待。已按逐文件摘要核对并恢复正确副本，最终使用相同源码完成全部回归，未放宽超时或跳过测试。

## 实施取舍

1. 共享数据库与目录接口先由主会话顺序实施；阶段内独立作者检查较少，交付前统一独立审阅。
2. 通用 SQLite 导入采用整份事务，支持延迟循环外键；代价为中断重跑整轮。大型公共资源导入另用分批检查点恢复。
3. 接口稳定后的资源、搜索、联机和备份模块并行实施；增加了接口整合与全套回归工作，已完成这些验证。

初版消息以 [房间接口](../../docs/rooms.md) 为准；跨版本协议协商随未来玩法演进。本轮没有把基础能力描述为全部游戏已经支持联机。

操作、API、迁移与回滚步骤见 [平台指南](../../docs/platform-postgres.md)。旧 SQLite/B2 资源与其他工作区保留，不进行生产部署或清理。
