# NSFW 浏览资格实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 账号资格与目录分类可按 dispatching-parallel-agents 分工于不重叠文件；主代理负责统一接线和远程验收。

**Goal:** 实现登录、规则理解测试、账号资格和会话主动开启控制，并提供远程验证及隔离预览。

**Architecture:** 账号服务保存资格和会话显示模式；独立内容分类仓储保存作品、版本和图片证据。请求级策略连接 SSR、目录、搜索、分享及播放器入口；保留现有公开 CAS 正文直连。

**Tech Stack:** 现有 TypeScript、Hono、React Router、PostgreSQL、Meilisearch、Passkey，无新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-11-04-nsfw-eligibility-design.md`（用户已授权实施，答题建议参数已确认）。

## Global Constraints

- 不部署生产、不推送或合并；使用 `codex/nsfw-eligibility` 隔离分支。
- 8 题全对；滚动 24 小时最多提交 3 次；失败冷却 30 分钟；有效尝试 24 小时；题库 12 题，核心 4 题必选。
- 不验证年龄或心理成熟度；资格跟随账号，主动开启跟随认证会话，新会话默认为公共浏览。
- 私人备份导出、恢复、删除不被浏览资格锁死；不删除收藏与阅读记录。
- 保留公开 CAS 模型，不增加 Worker 或正文代理；站内映射和启动需受控。
- 安装、构建、类型检查、全量测试与浏览器验证仅在 `localhost-1` 远程独立目录及专用 QA 数据库运行，长任务持久化到独立 tmux 并记录退出码。
- `WG_CONTENT_GATE=1` 显式启用，预览启用；未部署的生产保持现状。共享类型在 `src/content/types.ts`，修改接口需同步相关任务。

## Review Focus

- 旧索引、辅助列表、独立分享或资源索引可能绕过过滤：投影和 HTTP 集成测试覆盖。
- 并发提交、撤销、重测与旧会话可能复活权限：真实 PG 事务测试覆盖。
- 退出、换账号、浏览器返回可能闪现敏感内容：远程浏览器检查覆盖。
- 全部版本待核实可能错误地隐藏安全作品或破坏默认版本：策略测试及实际目录盘点覆盖。
- 匿名目录过滤可能使内部分享目录误判版本消失：内部目录与个人备份回归覆盖。

## 文件职责与接口

- `src/content/types.ts`：跨任务稳定类型 `ContentAccess`、`QuizAttempt`、`QuizResult` 及三层分类。
- `src/accounts/content-eligibility.server.ts`、`content-http.server.ts`：测试、判分、限次、资格、会话模式；独立迁移文件。账号服务挂载由该任务负责。
- `src/content/classification.server.ts`：独立分类仓储与带证据的导入；`Store` 输出可选 `classification`，媒体为可选同名字段；不在普通元数据导入中覆盖。
- `src/content/access.server.ts`、`policy.ts`：可信账号桥、默认公共上下文、投影和受限入口判断。
- `src/content/client.tsx`、`src/routes/content.tsx`：状态、规则说明、测试与主动开关；导航、根布局接线。
- `scripts/nsfw-*`、`tests/content-*`、`tests/e2e/content.spec.ts`：隔离预览、持久任务与行为回归。

### Task 1: 账号资格与规则测试

**Files:** 新建账号内容模块、题库、账号内容迁移和 `tests/content-eligibility.test.ts`；修改 `src/accounts/service.server.ts`、`config.server.ts`、`settings-http.server.ts`、`deletion.server.ts`。

**Interfaces:** `AccountService.content` 提供资格仓储；`GET /api/me/content` 返回 `ContentAccess`；`POST /api/me/content/attempts` 返回 `QuizAttempt`；`POST /api/me/content/attempts/:id/submit` 接收 `{ answers: Record<string,string> }`，返回 `QuizResult`；`PATCH /api/me/content/mode` 接收 `{ mode: 'public'|'restricted' }`，返回 `ContentAccess`。写接口沿用 Origin 和 `x-wg-binding` 约束。资格管理通过私有管理接线，仓储暴露 `moderate(userId, action, reason)`。

- [x] 先写并远程运行真实 PG 失败用例：8题构成、无答案泄露、全对通过但不自动开启、3次滚动限制、30分钟冷却、过期不计次、并发幂等、跨账号/旧规则拒绝、暂停优先、会话隔离、注销清理与导出。
- [x] 实现最小事务仓储和 HTTP 接线，使用可注入时钟，清理超过30天的已结算测试明细。
- [x] 远程运行新增测试及账号相关回归；记录日志和退出码。

### Task 2: 三层分类与现有目录证据

**Files:** 新建分类模块、迁移、导入脚本和 `data/content-classification.json`、`docs/nsfw-classification-audit.md`；修改 `src/types.ts`、`src/metadata.ts`、`src/server/store.ts`；测试 `tests/content-classification.test.ts`。

**Interfaces:** `ContentClassificationStore(db)` 暴露 `ready`、`import(document)`、`set(kind,id,expectedRevision,payload)`、`list()`；作品/版本/图片属性名统一为 `classification`。记录种类 `work|version|image`，未知不默认安全。导入保留人工覆盖并检查版本修订。

- [x] 先写失败测试：未知状态、证据校验、冲突拒绝、刷新元数据不覆写人工分类、默认生命周期不变。
- [x] 实现仓储与管理接口所需方法；盘点72作品、94版本、384图片。逐项记录文本审核结论，缺乏具体发行版证据的版本保留unknown。
- [x] VNDB逐图证据从已有采集记录或受代理保护的官方API取得；不从安全封面推断游戏内容。不足证据保留unknown并在报告说明。
- [x] 远程运行分类测试与目录/元数据回归。

### Task 3: 请求策略、公开投影和启动边界

**Files:** 内容策略及可信桥模块；目录、作品、播放器loader；搜索投影及Meili字段；`accounts-server.ts`、`server.ts`、可信目录、分享、账号目录与资源API。

**Interfaces:** `getContentAccess(request): Promise<ContentAccess>`；`projectWork(work, access): PublicWork|null`；`requireVersionAccess(work,version,access)`；功能关闭时维持现状。可信目录不依赖已过滤的匿名API。

- [x] 先写策略与HTTP失败用例：SFW页保留受限版本中性摘要、非安全文本不泄露、unknown启动受限、辅助列表一致、索引过期复查、401/403/503语义。
- [x] 实现统一判定与服务器首屏投影；站内所有资源清单、逻辑路径查询、可信启动及兼容入口检查对应版本，不改变CAS字节链路。
- [x] 保护独立分享和公共文案；私人备份仍可导出/恢复/删除，敏感名称以占位显示；分离内部完整目录。
- [x] 远程运行内容策略、HTTP及现有目录/搜索/分享/资源回归。

### Task 4: 规则测试页面、导航开关与失效处理

**Files:** 内容客户端及页面、导航、根布局、作品版本标记、分享/个人列表占位、播放器遮挡；远程浏览器用例。

**Interfaces:** 使用Task1的固定接口；`ContentProvider` 接收SSR `ContentAccess`，提供`useContentAccess()`、请求刷新和模式变更。路由 `/content` 保留经过验证的本站返回路径。

- [x] 先写浏览器失败用例：游客入口、Passkey登录、答题失败与通过、主动开启、刷新保持、重登默认关闭、移动键盘访问。
- [x] 实现规则说明、8题作答、错误解释、冷却和次数；导航显示公共浏览/已开启状态；不使用年龄或心理认证措辞。
- [x] 账号或权限失效时立即遮挡、静音，保留运行实例和本机保存退出路径；历史恢复和跨标签页复查。
- [x] 远程执行桌面/手机浏览器回归并保留截图与网络证据。

### Task 5: 远程验证、隔离预览与审阅

**Files:** 独立持久任务脚本、QA/预览启动工具、验收报告；不提交凭据与私有环境。

- [x] 在已确认 hostname=localhost 的默认构建机创建本任务独立目录、QA schema/索引、认证状态与tmux；复用既有代理和QA基础服务。
- [x] 远程基线检查，再运行整库测试、类型检查、生产构建及必要浏览器回归；日志、开始时间、PID、退出码落盘，断线先查原任务。
- [x] 独立审阅完整变更，修复重要问题并补回归；不推送、不合并、不部署生产。
- [x] 启动可供用户查看的HTTPS私有预览，核对实际账号/题目/模式/目录流程，回传验收证据并提供预览地址。

## 执行记录

- 2026-11-04：用户已授权实施与远程预览；答题参数采用建议值。原main仅有本设计文档，现已复制到功能工作区。
- 隔离工作区：`/Users/i/.codex/worktrees/nsfw-eligibility/wvn`，分支 `codex/nsfw-eligibility`。
- 远程域名在沙箱内解析失败；经已授权SSH连接同机 `192.168.9.29`，实际hostname为`localhost`，tmux和Chromium可用。没有启动重负载任务。

## 完成回执

2026-11-04：本计划五项任务已完成；完整后端314项、播放器模块227项、最后内容增量56项、最终浏览器16项、380条媒体访问边界全部通过，类型检查/构建通过。预览保持运行，未提交、推送、合并或部署生产。具体任务ID、预览证书/本地网络权限要求、现行线上CAS域名差异及验收边界见 `docs/nsfw-verification.md`。
