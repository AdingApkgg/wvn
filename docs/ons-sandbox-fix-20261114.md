# 游戏沙箱的Cloudflare脚本注入修复

## 目标和证据

用户在本轮引擎优化发布后要求解决CLANNAD的沙箱异常。保留opaque iframe、资格检查、资源清单、存档隔离和现有站点级防护，不通过添加allow-same-origin规避异常。

CDP捕获异常脚本：Cloudflare JSD注入代码在创建隐藏iframe后读取`a.contentDocument || a.contentWindow.document`，在opaque运行页中触发SecurityError。已登记ONS脚本SHA-256核验通过，异常不来自引擎。延迟10秒截图已出现完整的游戏提示页；此前即时截图只能证明初始化，不能证明黑屏故障。

`registerDirectB2Resources`本来发送`no-store, no-transform`，但外层`createContentFetch`将所有响应覆盖成`private, no-store`，丢失no-transform；公网响应头已核实该覆盖。Cloudflare官方说明源站no-transform会禁止JSD注入：https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/ 。

## 实现与验证

修复仅保留内层明确设置的no-transform指令，同时继续强制private/no-store；JSON投影二次封装也保留该指令。不得继承public、max-age等缓存许可，资格失败仍拒绝；不修改CSP或Cloudflare账户配置。

先覆盖真实CAS路由叠加内容门禁的GET/HEAD、匿名受限拒绝、指令大小写/边界和JSON投影，确认旧代码失败后实现。构建、类型检查及浏览器在原Debian构建机持久任务中完成。上线前后分别核对源站/公网头和注入脚本，并以真实画面、输入、存档退出补验；界面初始化不代替可读画面验收。

当前状态：三项新增回归在旧代码均按预期失败（no-transform丢失），修复后全部通过；定向HTTP回归、播放器模块、类型检查与构建在远程任务 `wvn-clannad-verify-20261114` 中进行。
