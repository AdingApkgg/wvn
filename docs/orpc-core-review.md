# oRPC 公共层与账号客户端独立审查

审查范围：`src/api/endpoint.ts`、`route.server.ts`、`client-base.ts`、`client.ts`、`contracts/session.ts` 和 `src/accounts/client.ts` 的迁移改动，并参照 `/tmp/wvn-orpc-review.diff`。本次只读审查代码，未运行测试、SSH、安装或修改实现。

## P1：账号 epoch 检查提前到响应正文解码之前

位置：`src/accounts/client.ts:222`，并参照 `src/api/client-base.ts:23`。

新的身份保护 fetch 在收到 Response 后立即检查 epoch，再把 Response 交回 oRPC；JSON 正文读取和最终结果解码发生在这个检查之后。原有 `request()` 在 `await response.json()` 之后才检查 epoch。两者的保护时点不同。

具体触发窗口：旧账号请求已经收到响应，正文读取已经完成或其完成 Promise 已进入微任务队列；账号在 oRPC 返回结果之前发生失效。此时 `controller.abort()` 不能撤回已经完成的正文读取，而客户端没有解码完成后的第二次 epoch 检查，调用方可能收到旧账号的成功结果。部分界面虽有独立 scope/guard，但公共客户端不能依赖每个调用方另行补齐；例如云存档目录更新直接使用具名调用结果。

建议：在身份保护传输中先完整读取响应正文，读取后再次检查 epoch，再构造保留状态码、状态文本和 Headers 的 Response 交回 oRPC；或者使用覆盖最终解码结果的统一拦截器，在把成功结果交给调用方前执行捕获时的 epoch guard。失败正文也应在读取后再次检查 epoch，避免旧错误触发新账号的 `refresh(true)`。针对“响应头已到、正文/解码尚未完成时切换账号”补一项回归验证。

## 已识别、由主任务处理的边界

受保护 `/api/me` 路由必须先执行原有 player/binding 检查，再执行契约输入验证，否则旧 binding 加畸形正文会从原来的 409 变成 400。主任务已在实现 `configureJsonRouteAuth()`；本次不重复修改该逻辑，也不把尚未验证的实现视为完成。

## 其余审查结果

未发现另一项具有明确触发条件的阻断问题。当前适配器保留原 handler 和 Hono Context；成功回执经过输出校验，业务拒绝返回原 Response 或交回原错误处理链；Cookie、业务状态码及完整冲突载荷没有被统一包装丢弃。注册位置仍决定原中间件顺序，原 handler 内的领域锁和重新认证检查仍保留。客户端继续使用同源凭据，并附加当前 binding 与组合 AbortSignal。以上是静态审查结论，不能代替远程测试、浏览器验收或生产发布证据。

## 处理结果

主任务已通过 `aroundCall` 在 oRPC 完整正文解码后复核账号 epoch，并在失败正文读取后、任何身份刷新之前再次复核；新增延迟正文回归测试。受保护 JSON 路由已接入认证前置。资格轮询保留独立的组件 epoch 与类型化读取客户端，避免首次账号绑定的取消信号干扰注册与权限初始化。后续独立复核见 `orpc-final-review.md`，本节不替代最终运行记录。
