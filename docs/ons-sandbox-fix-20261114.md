# 游戏沙箱的Cloudflare脚本注入修复

## 目标和证据

用户在本轮引擎优化发布后要求解决CLANNAD的沙箱异常。保留opaque iframe、资格检查、资源清单、存档隔离和现有站点级防护，不通过添加allow-same-origin规避异常。

CDP捕获异常脚本：Cloudflare JSD注入代码在创建隐藏iframe后读取`a.contentDocument || a.contentWindow.document`，在opaque运行页中触发SecurityError。已登记ONS脚本SHA-256核验通过，异常不来自引擎。延迟10秒截图已出现完整的游戏提示页；此前即时截图只能证明初始化，不能证明黑屏故障。

`registerDirectB2Resources`本来发送`no-store, no-transform`，但外层`createContentFetch`将所有响应覆盖成`private, no-store`，丢失no-transform；公网响应头已核实该覆盖。Cloudflare官方说明源站no-transform会禁止JSD注入：https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/ 。

## 实现与验证

修复仅保留内层明确设置的no-transform指令，同时继续强制private/no-store；JSON投影二次封装也保留该指令。不得继承public、max-age等缓存许可，资格失败仍拒绝；不修改CSP或Cloudflare账户配置。

先覆盖真实CAS路由叠加内容门禁的GET/HEAD、匿名受限拒绝、指令大小写/边界和JSON投影，确认旧代码失败后实现。构建、类型检查及浏览器在原Debian构建机持久任务中完成。上线前后分别核对源站/公网头和注入脚本，并以真实画面、输入、存档退出补验；界面初始化不代替可读画面验收。

当前状态：三项新增回归在旧代码均按预期失败（no-transform丢失），修复后全部通过。远程持久任务 `wvn-clannad-verify-20261114` 退出码0：10项HTTP/权限回归、238项播放器模块测试、类型检查及生产构建通过。修复提交 `7c3f885baa1fc2aa0013899e3f44daf49d73df57`。


## 发布状态

后续已获得用户“更新生产吧”的明确授权，并随`ios-reader-auth-20261114-23ccc0b`发布。公网GET/HEAD保留no-transform，真实Chromium运行页未见Cloudflare JSD注入，15分钟监控通过；详见[发布记录](ios-reader-auth-release-20261114.md)。下文保留此前审批与准备历史。

本次具体生产切换被自动审批拒绝：此前“发吧”仅覆盖上一轮引擎优化，不能扩展为新增修复的生产授权。被拒命令未执行，当前生产仍为 `engine-20261114-5d04a09`。已向用户请求明确批准本次修复发布，尚未获得回复。

可审阅候选产物、逐文件哈希、基线保护、发布/回滚脚本及中文发布说明位于本机 `/private/tmp/wvn-clannad-release-20261114/`。该包仅覆盖当时的一个产品文件，已被新增iOS阅读器/账号修复范围取代，禁止直接用于本轮发布。后续新候选先检查隔离数据库副本候选，再切换Web/管理端，失败健康回退。不修改数据库、存档格式、沙箱权限或Cloudflare账户配置。

已准备 `scripts/verify-ons-sandbox.mjs`，在专用构建机通过真实截图像素、输入后画面变化、本机副本逐字节比较和重入验证。该脚本对公网的验证尚未执行，不能宣称线上异常已消失。
