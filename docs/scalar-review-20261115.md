# Scalar 集成审查（2026-11-15）

审查范围仅为 Scalar 页面、同源资源与请求适配器、共享 OpenAPI 生成器、相关挂载和新增测试；未审查同工作区的 oRPC、统计、Oxc、Biome 改动。此次为静态审查，未运行安装、构建或测试；主任务的远程验证另行记录。

## 裁定：通过，无遗留阻塞项

- **已修复 P2：`customFetch` 丢弃 `Request` 输入的请求内容。** 初版 `src/api/reference.server.ts:17-18` 对 `Request` 仅取 URL，导致没有第二个参数的 Request 输入丢失 method/body/headers/signal。现已改为 `new Request(input instanceof Request ? input : url, init)`，保留原请求并应用调用方覆盖值；后续仍强制同源凭据、禁止重定向并覆盖最新 binding。只读复核确认该修复直接覆盖原触发条件。
- 新增单测使用带 JSON body、调用方 header 和 signal 的 PATCH Request，检查实际业务请求的 method/body/header；新增浏览器步骤通过页面真实配置中的 customFetch，以 Request 对象 PATCH 独立 QA 个人资料并断言 200 及新 bio。主任务报告该单测先复现 `GET !== PATCH`，修复后 5/5 通过，并已核对锁定 Scalar 包的 tester 确实调用 `customFetch(Request)`；此处未独立运行这些验证。

## 其余核查

- `/dash/api` 与三项资源均在已有管理员 guard 之后挂载；导航使用普通链接，能进入独立 HTML。
- 在线 spec 默认只使用当前账号 listener 契约，私有 listener 仅在离线导出显式启用；生成失败会清理缓存以允许重试。
- 请求适配器在获取会话前拒绝外站及非 `/api/` 目标，获取最新管理员状态后覆盖 binding；两次 fetch 均禁止重定向，使用同源 cookie 和 no-store。
- 配置关闭持久化认证、默认字体、遥测、代理和 agent；页面 CSP 限制连接到同源，脚本资源采用同源 CORP。
- `defer` 脚本按顺序执行，自定义挂载 ID 避开 Scalar 自动发现保留 ID。

运行时 standalone 文件解析、实际页面 CSP 兼容性和真实 tester 请求链路仍以本轮远程浏览器证据为准，静态审查不能替代它们。

证据边界：浏览器新增步骤直接调用真实页面的 customFetch 配置，覆盖 Request 对象的端到端传输；它没有模拟用户点击 Scalar tester 的发送按钮。最终浏览器运行结果由主任务另行记录。

最终运行记录：主任务在final-03批次核验5/5定向、381/381 TS、248/248 MJS、Scalar浏览器1/1、typecheck/build均通过；浏览器实际完成Request对象PATCH、搜索、下载，且外部请求为零。该记录引用主任务回执，静态审查代理未自行执行。
