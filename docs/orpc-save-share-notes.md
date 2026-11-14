# 存档与分享的 oRPC 契约迁移

存档 JSON 接口统一使用 `savesContract`，分享 JSON 接口统一使用 `shareContract`。契约给出路径参数、查询参数、请求正文和完整成功回执结构；业务层继续负责文件名、摘要、额度、兼容性、分享文案、审核和访问权限。

界面通过 `account.api` 的具名过程调用接口，并用 `context.owner` 保留捕获时的账号归属。已有账号绑定、内容显示范围和异步结果保护继续使用；待上传存档仍先写入本机 outbox，成功提交后才移除。提交冲突保留 HTTP 409、`CONTENT_CONFLICT` 及完整 revision 回执，不能当作上传成功而丢弃本机副本。

文件上传、下载和 ZIP 流继续沿用原来的二进制通道。分享密钥只作为 inspect/claim/report 的正文参数传递，不写入公共详情 URL。分享回执显式支持 `contentRedacted`、空文件列表和发布时版本信息；显示限制由原有服务端投影和前端内容范围保护执行。

本轮新增 `tests/orpc-saves.test.ts` 与 `tests/orpc-shares.test.ts`，覆盖结构校验、原请求正文可读、409 完整冲突回执、Cookie 保留、受限分享回执和原业务拒绝码。远程验证结果由主任务统一记录；本文件不代表生产发布或真实游戏读档验收。
