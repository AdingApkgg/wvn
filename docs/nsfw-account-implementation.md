# 账号内容资格实现记录

日期：2026-11-04（Asia/Shanghai）。本记录仅描述隔离分支实现；没有推送、合并或部署生产。

## 交付范围

- `src/accounts/content-eligibility.server.ts`：资格、测试签发和判分、滚动次数、冷却、会话模式、管理审计、导出和清理。
- `src/accounts/content-http.server.ts`：固定的四个账号内容接口，复用既有会话、Origin 与 `x-wg-binding` 校验。
- `src/accounts/content-admin-http.server.ts`、`share-admin.server.ts`：既有私有管理应用内的账号资格读取和管理动作，沿用独立管理员 Cookie、来源检查和一次性登录；登录认证豁免使用精确路径匹配。
- `src/accounts/content-management.tsx`、`src/routes/share-admin.tsx`：登录后的最小资格与分享文案审核表单，复用当前私有应用认证；原分享发布审核保持原流程。
- `src/content/quiz.ts`：12 道规则题；4 道核心题必选，另选 4 道，题目和选项随机排序。公开投影仅保留题目、选项与标识。
- `src/database/content-accounts.ts`：独立迁移及资格、尝试、会话模式、审计四张表。
- `src/database/content-share-classification.ts`：新增 007 迁移，给分享文案增加独立分级、已审修订和理由，并扩充既有账号审计的分享关联；不改已应用 006 SQL。
- `src/accounts/service.server.ts`、`config.server.ts`、`settings-http.server.ts`、`deletion.server.ts`：账号服务接线、功能开关、导出和注销清理。
- `tests/content-eligibility.test.ts`：真实 PostgreSQL 及真实 Passkey 会话用例。

资格属于账号，模式属于认证会话。测试通过只授予资格，不自动开启显示。新会话默认为公共浏览；会话删除通过外键级联清除模式。暂停、撤销或要求重测时清除全部旧模式，失效未结算尝试。解除暂停后仍须重测。

测试全对通过，滚动 24 小时最多结算 3 次，失败冷却 30 分钟，签发有效 24 小时。过期、旧规则、无效会话、跨账号和不完整或伪造选项不结算。已结算尝试重试返回原判分，并重新查询当前权限，避免重放旧结果授予资格。

事务沿用 `wvn:account-write` 数据库锁，与删除及恢复保持相同次序，跨服务实例也串行结算。数据库另以唯一部分索引限制每账号一个未失效、未结算尝试。资格授予与结算在同一事务提交。

结算后移除题目判分快照，不保存逐题选择。每 6 小时清理超过 30 天的已结算明细和长期过期未结算尝试，资格依据保留。现有整库备份自动覆盖新表；账号导出包括资格、尝试摘要和管理审计，不导出题目快照或选项选择。注销和删除账本重放显式清除四张表。

本测试只确认本站规则理解，不核验年龄，不评价心理、人格或成熟度。

## 对外接口与接线

`AccountService.content` 提供：

- `getAccess(userId, sessionId)`、`createAttempt(userId, sessionId)`。
- `submitAttempt(userId, sessionId, attemptId, answers)`、`setMode(userId, sessionId, mode)`。
- `moderate(userId, action, reason)`：动作 `suspend | unsuspend | revoke | require_retest`；管理边界记作 `private-admin`，理由必填。
- `export(userId)`、`gc()`。
- `shareSuitability(id)`：返回 `sfw | nsfw | unknown`；不存在或文案修订与已审修订不一致时返回 `unknown`。
- `classifyShare(id, suitability, expectedMetadataRevision, reason)`：私有管理调用；在 `account-write` 事务核对当前文案修订后写入分级和审计，缺失分享 404、修订冲突 409。

`AccountService.getContentAccess(request)` 从当前 Cookie 验证真实会话，不接受客户端自报账号或权限。匿名返回公共状态；依赖异常抛出 `CONTENT_ACCESS_UNAVAILABLE`（503），不授予受限权限。主代理需在账号进程的可信校验接口调用此方法，并给内部接口应用已有私有服务认证；不能把它公开成信任客户端 `userId` 的接口。

`config.contentGate` 默认仅在 `WG_CONTENT_GATE=1` 时启用账号内容 HTTP 路由；可为隔离测试显式设置。`config.content.now` 和 `config.content.policyVersion` 支持注入时钟、规则版本；初始版本为 `2026-11-04-v1`。普通客户端不能设置这些服务端选项。

私有管理应用已接入 `GET /api/share-admin/content/users/:userId` 及 `POST /api/share-admin/content/users/:userId/moderate`。写入仅接受 `{ action, reason }`，理由去除首尾空白后须为 1–1000 字且不得含控制字符；不接受客户端自报执行者或直接授予资格。响应仅含资格、尝试摘要和审计，不含判分题库。公共账号应用没有管理接口。私有页面现可按用户 ID 查询资格及最近 20 条审计，并带理由执行四种动作；切换查询 ID 会清空旧账号结果。页面和统一目录策略消费共享 `ContentAccess`，不从 URL 或本机存储赋予权限。

私有 `PATCH /api/share-admin/content/shares/:id` 仅接受 `{ suitability, revision, reason }`；修订必须为正安全整数，理由沿用相同限制。只接受有效且已有发布文案、没有待发布文案的分享；公开分享须先批准发布，再独立分级。成功返回 `{ id, suitability, revision }`，无效入参返回 `CONTENT_SHARE_CLASSIFICATION_INVALID`（400），状态或修订不符返回 `CONTENT_CONFLICT`（409）。分享分级不改变发布、撤销或存档权限；主代理的公开列表及直达投影应调用 `shareSuitability(id)`，不缓存跨请求的正向判定。查询对非有效分享、缺少已发布文案或存在待发布文案一律返回 `unknown`。用户编辑后旧 SFW 审核自动失效；不修改既有用户编辑或发布审核的修订语义。

私有页面提供分享 ID、文案修订号、分级和理由表单。409 只显示重新核对提示，保留当前输入，不自动更新修订或覆盖新文案。管理会话失效时返回管理登录区域。现有分享审核页未提供公共 API helper，因此在该路由内增加同源、`no-store` helper；没有使用另一套 `/api/manage` 管理认证。主代理明确无需为可逆布局新增测试，由主代理远程执行浏览器基本流程。

`RULE_QUESTIONS`、`createRuleQuestions()` 及 `RuleQuestion.correctChoiceId` 只供服务端和测试进程使用。该文件依赖 `node:crypto`；客户端页面不得导入题库，浏览器只读取 HTTP 公开投影。

稳定错误码：`CONTENT_RETRY_LATER`（429），`CONTENT_POLICY_CHANGED`（409），`CONTENT_ATTEMPT_EXPIRED`（410），`CONTENT_ATTEMPT_NOT_FOUND`（404），`CONTENT_SUSPENDED` / `CONTENT_UNQUALIFIED` / `CONTENT_RETEST_REQUIRED`（403），`CONTENT_ANSWERS_INVALID` / `CONTENT_MODE_INVALID`（400）。限次后查询 `GET /api/me/content` 取得重试时间和剩余次数。

## 验证记录与要求

主代理远程 RED：任务 `wvn-nsfw-red-account-20261103T171040Z` 退出码 1，失败原因为账号内容路由及仓储尚不存在，未出现 PG 配置错误。日志：`/home/i/.local/state/ai-jobs/wvn-nsfw-red-account-20261103T171040Z/output.log`。既有账号、目录和搜索基线 10/10 通过。

实现后本机仅做读改及 `git diff --check`；没有安装、构建、整库类型检查或运行测试。

主代理待远程执行：`node --import tsx --test --test-concurrency=1 tests/content-eligibility.test.ts`，再运行账号会话、注销、恢复、备份等相关回归，并将最终结果补入总验收报告。并发用例通过相同 schema 的两个服务实例，同时创建 12 次、提交 12 次，检查一个有效尝试和一次结算；不依赖单实例 HTTP 排队。

主代理远程 GREEN：任务 `wvn-nsfw-content-20261103T171440Z` 中本任务原有 9 个资格用例全部通过。该组合任务整体退出码 1，原因是主代理另一项 HTTP 策略模块当时尚未实现；不能将组合任务标为全量通过。

主代理随后授权补齐既有私有管理应用的资格管理接口。已新增两个 HTTP 用例：独立管理员认证、普通账号无法访问、公共账号应用不存在管理路由、来源校验、暂停即时生效、四种管理动作、理由严格校验与未知账号处理。远程 RED 任务 `wvn-nsfw-red-account-20261103T171930Z` 已确认两个新用例分别因 `404 != 401`、`404 != 400` 失败，原 9 条仍通过。后续远程 `wvn-nsfw-content-20261103T172619Z` 中原账号 11 条全部通过，包含管理接线。

主代理继续授权独立审核分享文案，要求审核绑定分享的 `metadata_revision`，用户编辑后旧审核自动失效。已补两个真实 PG / 私有 API 用例（总计 13 个），覆盖真实 `ShareStore.create/edit`、并发修改、修订冲突、审计、管理员认证和严格入参。远程 RED `wvn-nsfw-content-20261103T172619Z` 确认两项分别因缺少 `shareSuitability`、私有 PATCH 返回 404 失败，原账号 11 条通过。现已实现该扩展，待主代理远程 GREEN；未修改公开分享路由或统一公开投影。

主代理审阅发现：分享发布批准操作不会递增文案修订号，因此有新待发布文案时不能把仍在展示的旧文案分级绑定到当前修订。已追加第 14 条真实 PG 回归，要求待发布文案存在时拒绝分级，新文案批准后仍待独立复核；撤回后也不沿用原 SFW。远程串行 RED `wvn-nsfw-content-20261103T174107Z` 准确复现第 14 条 `Missing expected rejection(CONTENT_CONFLICT)`；其余组合中 35 项通过，另 2 项属于主代理的旧路径及请求体大小 RED。现已按要求补上 pending / active / approved 限制，并更新管理 UI 的先发布再分级说明及 409 提示；最终 GREEN、类型检查、构建和浏览器流程仍由主代理执行，本记录不宣称这些最终检查通过。
