# oRPC 业务接口

WVN 的业务 JSON API 使用 oRPC 1.16.2 的契约优先方式。现有 URL 与 HTTP 方法保留：查询仍为 GET，写操作继续执行原有 Hono 安全、审计与事务链。

## 代码入口

- `src/api/contracts/`：账号、内容资格、书架、统计、存档、分享、后台、目录、搜索和资源 JSON 的输入与成功回执。
- `src/api/endpoint.ts`：统一使用 detailed 输入，区分 `params`、`query`、`body`。
- `src/api/route.server.ts`：在原路由位置执行 oRPC 校验，复用已有领域 handler；成功输出须通过 schema，业务错误和 409 冲突保留原状态及载荷。
- `src/api/client-base.ts`：类型化 OpenAPI 客户端、原业务错误适配和调用生命周期拦截器。
- `src/api/client.ts`：聚合业务契约与默认客户端；私有目录和审核监听器使用 `admin-client.ts` 的动态前缀工厂。

账号界面通过 `account.api.libraryList({})`、`account.api.libraryEdit({params:{id},body:{revision,status}}, {context:{owner}})` 调用具名过程，不再由调用方任意声明返回值泛型。账号保护覆盖完整 JSON 解码，身份切换会取消旧请求，并拒绝旧身份的结果与错误。内容资格轮询使用单独的类型化读取客户端，由内容组件自己的 epoch 管理，避免首次账号确认误取消已有权限快照。

服务端 `/api/me` 的认证与 binding 校验先于契约输入校验。原 handler 的近期认证、文件归属、修订冲突、审计和锁仍然执行。外层内容权限投影继续决定哪些文字和版本可见；输出 schema 不是内容审核与鉴权的替代。

## 保留的协议

Better Auth 原生接口、WebAuthn 恢复握手、文件与 ZIP 流、CAS 游戏资源、引擎清单和实时通信协议保留现有实现。云存档预留、提交、恢复及分享操作的 JSON 控制面已接入；二进制正文不经过 JSON 契约转换。外部 Meilisearch、私有 Blob 服务与引擎资源请求也不冒充本项目业务 API。

兼容适配层保留已有成功 JSON 字段，不应用输出 schema 的字段裁剪或转换。新增字段必须在契约中声明；新增输入约束不得替代领域额度、幂等、内容审核和存档一致性校验。部分结构性畸形输入会在进入领域层前返回 `INVALID_REQUEST`，各模块已为需要兼容的业务错误设置对应错误码。

## 验证与文档

在专用远程构建机执行：

```sh
npm ci --include=dev --legacy-peer-deps
npm test
node --test --test-concurrency=1 tests/*.test.mjs
NODE_ENV=development npm run typecheck
NODE_ENV=production npm run build
npm run api:openapi
```

`api:openapi` 从同一契约生成 `reports/openapi.json`，可通过额外路径参数指定输出文件，不连接数据库或读取部署凭据。私有登录仅属于私有 listener，站内 `/dash` 不生成虚构的令牌登录接口。文档描述输入与成功回执；兼容业务拒绝仍使用原有 `{code}` / `{error}` 载荷，由 `ApiResponseError` / `AccountClientError` 传递。

`tests/orpc-*.test.ts` 覆盖嵌套 schema、原路径与方法、身份拒绝顺序、Hono 正文缓存、Cookie、409 冲突、失败输出保护和延迟正文身份变更。浏览器用例继续验证实际 Passkey、资料、存档、显示资格与后台操作。测试通过不代表全部游戏剧情、真实引擎读档或生产发布已验收。

## 本轮验收范围

最终验证使用构建机本任务固定源码快照、独占 PostgreSQL 与原有 QA Redis/Meilisearch 的独立前缀。本地同时出现的后台统计和 Biome 工作由其他会话推进，已保留，不混入本轮运行结论。详细回执与源码摘要保存在本任务 reports 目录；本轮不部署生产；提交与推送状态以 Git 历史为准。

最终固定快照验收：374 项 TypeScript 单测、247 项播放器/协议测试、39 项业务浏览器回归全部通过，另有1项夹具页面验收通过；类型检查、生产构建、26项定向检查与独立静态复核完成。OpenAPI 共92条路径。测试结束后本任务预览与独占PG均已停止，日志与数据保留。回执和400份源码摘要位于 `reports/orpc-20261114/`。

## Scalar API 文档

管理员可从后台侧栏进入 **API 文档**（`/dash/api`）。页面支持搜索、示例和 schema 浏览、下载 OpenAPI 与同源测试请求。在线规范位于 `/api/dash/openapi.json`，直接复用 oRPC 契约生成器，只包含当前账号 listener 的接口；完整 CLI 导出仍包含独立私有 listener 的契约。

Scalar 1.78.1 standalone 脚本由 `/api/dash/reference/scalar.js` 同源提供，页面、规范及脚本均受现有管理员 guard 保护。关闭默认远程字体、遥测、外部 AI/客户端入口与认证持久化；调试请求先重新取得当前管理员会话绑定，仅允许本站 `/api/` 请求，禁止重定向和外部代理。`Request` 对象的原始 method、headers、body、signal 会保留。

入口代码：`src/api/reference.server.ts`；共享生成器：`src/api/openapi.server.ts`。挂载必须在后台管理员中间件之后、SSR/catch-all 之前。该文档页不加载站点 React/Tailwind 页面，避免引入 SSR 包装器和 CSS 层冲突，也不把 Scalar bundle 加进普通读者页面。

Scalar 接入验收（2026-11-15）：5项定向、381项TypeScript全量、248项协议测试以及真实浏览器权限/渲染/搜索/下载/GET与Request PATCH通过，类型检查和构建通过。已修复 standalone 保留ID导致的自动重复挂载，以及Request对象输入的方法与正文丢失。回执与截图见 `reports/scalar-20261115/`；本轮临时环境已停止，没有生产发布。
