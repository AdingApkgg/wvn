# oRPC 全量迁移最终静态复核

本次独立复核以 `41c99d1` 为基线，阅读业务 JSON API 的工作区 diff、`src/api/` 契约和适配器、OpenAPI 生成脚本与新增 oRPC 测试。未执行构建、测试、SSH、浏览器操作或生产操作；运行结果由主任务独立记录。审查期间工作区仍有并发修改，因此以下结论限于已读的 oRPC 主体与相关调用点，不覆盖随后新增功能的完整验收。

当前未发现具有明确触发条件的新增安全漏洞或业务阻断。

- 账号受保护路由在契约输入校验前执行原有会话与 binding 检查，领域 handler 内的近期认证、所有者判断、事务锁与操作中复查仍保留。统一客户端检查调用开始时的 epoch，并在完整结果解码后再次检查；错误正文解析之后也复核 epoch，避免旧账号错误刷新新身份。
- 适配器保留业务失败原始 Response、状态码和带数据的冲突载荷；成功输出校验失败返回 500，未将未验证的成功回执交给调用方。Hono 原始上下文继续承担 Cookie、审计和中间件处理。云档分支保留 captureId、expectedHead、generation、冲突副本、所有者与领取幂等参数。
- 契约成功输出与原账号、目录、云档、分享、后台 handler 逐组对照，未发现确定的必需字段或 nullable 类型不符。私有后台令牌登录从站内聚合排除；恢复仪式、BetterAuth/WebAuthn、二进制与实时协议继续保留专用入口。
- SSR 目录与分享投影仍限制后端 origin、重定向、超时和响应大小；公开主页与统计继续通过现有 public projection bridge 限定公开 GET 路径。内容资格读取使用组件自己的 epoch，独立于首次账号确认的 AbortController。

曾提出 HEAD 兼容性疑点：Hono 的 GET 隐式 HEAD 经 `OpenAPIHandler` 后是否仍可匹配。主任务反馈已在远程预览 listener 实测 `HEAD /api/catalog=200`、`GET /api/catalog=200`，该疑点已排除；HEAD 回归测试及最终验证快照仍由主任务继续完成。此处运行证据来自主任务反馈，本审查代理未自行执行。

并发范围说明：复核期间 `src/routes/dashboard.tsx` 新出现 `StatisticsOverview` 的 lazy import，并将原有 Overview 实现替换为 Suspense 组件。此项超出本次 oRPC 静态复核主体，已告知主任务识别来源、保留改动并单独确认授权范围。

本报告不将静态复核等同于远程测试、浏览器业务验收或生产发布完成。

最后小修复复核：失败传输直接消费 `response.json()` 后立即抛出 `ApiResponseError`，没有后续复用失败 Response，不再 clone 不会丢失业务错误载荷；账号客户端仍在失败正文解码后检查 epoch，匿名 401 只在已有身份时触发账号失效刷新；独立内容资格 reader 的组件 epoch 检查保留。已阅读 HEAD 回归断言，未发现上述调整引入新阻断。未自行运行验证；主任务的最终远程快照限定本轮业务迁移，并排除其他会话新增的统计与 Biome 工作，本地并发改动保持原样。

主任务后续补测发现：外层内容 listener 的 HEAD→GET 转换让 HTTP 实测通过，但裸 Hono 适配器的 HEAD 仍返回400。新增回归已复现；适配器现仅对 GET 契约的 HEAD 请求向 oRPC matcher 提供 GET，Hono 仍保留原 HEAD 上下文并移除正文。该修复由主任务继续远程验证，之前的 HTTP 实测不能替代裸适配器覆盖。

HEAD 与遗漏挂载点的最后复核：主任务随后报告，裸 Hono 回归确实复现了 HEAD 400；此前 HTTP listener 的 HEAD→GET 转换掩盖了适配器问题，因此前文“该疑点已排除”只适用于当时实测的外层入口，不能作为裸 Hono 的证据。当前 `route.server.ts` 仅在原请求为 HEAD、契约为 GET 时为 oRPC matcher 构造 GET Request，业务 handler、player 和其余 Hono 中间件仍读取原 HEAD Context；静态复核未发现该修复扩大写权限或更改普通 GET/写方法语义。裸 Hono 的 HEAD 200 且空正文断言现已覆盖此边界，最终运行结果等待主任务的 final-08 快照。

`src/player/catalog.server.ts` 的凭据站点目录与单作品 JSON 路由改为复用现有 publicCatalog/publicWork 契约，原查询、slug 解析、过滤与 404 返回保留；`src/search/runtime.server.ts` 的不可用 fallback 改为注册 searchQuery 契约，合法请求的 503、Retry-After 与 no-store 保留。以上三处静态复核未发现新阻断。本轮只读取指定实现和 HEAD 断言，并追加本报告，未运行测试或远程操作。
