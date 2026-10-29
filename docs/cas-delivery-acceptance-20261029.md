# CAS 交付验收记录（2026-10-29）

状态：验收进行中；本文件不是删除许可或最终验收回执。生产切换、删除及最终盘点由主流程补充实际证据。

## 浏览器驱动

`ops/b2/verify-browser.mjs` 保留五个真实用例：ONS、CLANNAD、Artemis、Tyrano、RenPy 共享引擎。每个用例使用独立浏览器上下文，检查实际引擎启动、沙箱隔离、原生剧情或画面、保存退出与重新进入，并确认主站没有承载游戏正文响应。

`sources` 记录真实响应的 `source`、`key`（SHA-256 物理键）、`sha256`、解码后的 `originalKey`、`cache`、HTTP 状态及长度。物理键必须严格符合 64 位小写十六进制加 `.bin`，来源必须是 `b2`，缓存诊断必须为 `HIT` 或 `MISS`。每条 `originalKey` 由独立验收模块 `ops/b2/cas-provenance.mjs` 按冻结的 `public-assets.mjs` 控制表与固定发布版本 `20261027-01` 推导并精确比较，覆盖游戏、媒体别名、ONS 数据/引擎、共享引擎与直接 releases URL；不请求在线映射接口。错误发布、游戏、文件或残缺前缀均拒绝。

## 隔离 canary 边界

设置 `WVN_B2_CANARY_PREFIX=__cas-canary` 时，仅将浏览器实际发往 `https://wg-b2.saop.cc` 的 `/__player/resource/`、`/__ons/data/`、`/__ons/engine/`、`/__engines/resource/` 和 `/releases/` 请求加上固定前缀。使用 Playwright `route.continue`，保留浏览器网络栈与配置的代理。其他值直接拒绝。报告保存 `canaryMode`、`canaryPrefix` 及逐条 `rewrittenRequests`。

此拦截只覆盖浏览器请求。网关在服务端取得入口 HTML 时仍访问正式 Worker，生产切换前不能据此声称所有正文都经过 canary。入口 HTML 的 canary 路径须另做直接 HTTP 验证；切换后仍须执行正式路径的完整浏览器与 HTTP 验收。

## 当前证据

- 主流程已有隔离 Worker HTTP 验收报告：`reports/cas-delivery-20261029/http-canary.json`，79 个版本，冷缓存 MISS、完整 SHA-256、MIME、HEAD 忽略 Range、Range 206 与 ETag 304 均通过。
- 浏览器脚本语法检查通过；真实 canary 浏览器任务及结果由后续运行补充，不能由启动记录推定通过。
- 正式 Worker 切换、正式浏览器验收、删除回执与最终库存：待主流程填写。

## 已有记录的离线补验

`node ops/b2/cas-provenance.mjs <完整单例报告.json或results.json> [其他报告.json]` 对每例的全部 sources 执行同一严格断言。命令无网络或浏览器依赖，任何不匹配即非零退出。可用它审查旧版驱动已经记录的真实响应，但必须分别记录“原浏览器交互通过”和“新版来源离线补验通过”；不能声称运行中的旧进程已经执行新增断言。正式生产浏览器验收使用最终驱动重新运行。

## RenPy 慢速下载与就绪超时

首次隔离 canary 的 RenPy 用例在约 75.8 MB 游戏 ZIP 下载期间报 `Engine initialization timed out`。独立完整 CAS 下载验证了 75,846,045 字节及 SHA-256，但耗时 205.62 秒，超过旧版 180 秒固定就绪期限。随后使用未修改 runtime 的独立重试在 2026-10-29 03:50:26 UTC 通过（约 150 秒）；因此问题取决于下载耗时，并非每次都会失败。

本次修改让 RenPy 游戏资源的实际递增字节刷新 180 秒无进展期限，总就绪期限仍为 30 分钟；引擎失败和会话显式取消仍终止等待；资源失败是否可恢复由原生引擎决定，下载结束后初始化卡住也会超时。原有两个大型游戏的 30 分钟例外保留，其他引擎沿用原期限。远程自动化回归与构建已通过；修改后的真实浏览器原生剧情、保存退出和重新进入仍待主流程部署静态文件后验收，不能据此提前认定生产切换通过。
