# 远程预览样式故障与满额去重回归

范围：localhost-1（hostname localhost）的 `/home/wvn/wg-accounts-preview-20261019`；只更新私有预览，不切生产，不改系统证书信任或服务证书。Node 24.19.0、Chromium 152.0.7977.82。

## 样式根因证据

160次匿名冷上下文加载没有复现，不能据此判定故障已消失。按原注册、备份发布、审核页顺序运行后，第2轮捕获 `/assets/root-BNKGUmLG.css` 的 `net::ERR_TOO_MANY_RETRIES`，此时主题变量为空、样式表不可读，但DOM中的stylesheet链接仍存在且未禁用。与先前“可能是hydration移除CSS”的推测不同，实际失败发生在浏览器资源传输层。

预览使用 `CN=localhost` 自签证书，原验收用 `ignoreHTTPSErrors: true` 忽略证书错误。匿名网络取证25轮捕获846次 `SSL_HANDSHAKE_ERROR / -202`（`ERR_CERT_AUTHORITY_INVALID`）；该组未达到最终CSS失败，但说明忽略错误并未消除反复握手。只增加当前证书SPKI定向信任后，相同发布审核流程连续10轮CSS均200，字节数57998、SHA256一致；匿名网络对照5轮证书握手错误为0。两组原始NetLog仅访问匿名页面，提取错误类型/错误码后删除，未采集邀请码、令牌、Cookie或私钥。

结论限定于本次可复现环境：自签预览证书经Chromium逐请求忽略错误时发生证书重试，最终可能耗尽重试并丢失CSS。没有证据支持CSS构建缺失、React删除样式链接或生产发生同类故障。

## 修复与复验

`scripts/lib/preview-browser.mjs` 从预览公有证书计算SHA256 SPKI，在Chromium启动时仅信任对应公钥；Node API请求仅在当前验收进程增加该证书信任。浏览器上下文关闭宽泛的 `ignoreHTTPSErrors`。保留主题就绪及手机无溢出断言，不增加页面/CSS失败重试。证书过期或不含localhost时直接失败。

两项TLS浏览器回归先因缺少实现失败，随后通过：关闭忽略错误后，当前证书下页面/CSS/API均可访问；使用不同localhost证书的公钥时，浏览器仍以 `ERR_CERT_AUTHORITY_INVALID` 拒绝真实预览。

`node scripts/verify-preview-styles.mjs` 对账号、审核登录页、公开来源详情和作品页各做20轮全新浏览器验证，记录CSS状态/长度/哈希、主题和手机宽度。仅访问预览loopback，不登录或创建账号，任何失败都导致非零退出并保留结构化报告，不靠重跑覆盖成功。

参考：[Chromium证书SPKI定向信任实现](https://chromium.googlesource.com/chromium/src/+/8402d3c5bc13e018fa75eba650ed881755e0223b)、[Chromium网络重试实现](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/http/http_network_transaction.cc)、[Node进程内CA接口](https://nodejs.org/docs/latest-v24.x/api/tls.html#tlssetdefaultcacertificatescerts)。这些说明接口行为；本项目根因判断以本轮请求失败、DOM、错误码及对照实验为依据。

## 满额去重边界

`tests/account-share-limits.test.ts`覆盖公开待审/链接有效两种方式各两项：

- 20份分享上限：通过真实存档历史创建20个不同revision，跨小时推进测试时钟遵守每小时5次限制；最后让发布窗口过期，单独验证数量边界。重复原快照返回原ID且无密钥，新快照返回413 `SHARE_LIMIT`。
- 每小时5次：在有效窗口内发布5个不同revision；重复原快照返回原ID且无密钥，新快照返回429 `TRY_LATER`。

两种边界都检查引用、条目和发布计数不变，新请求别名只增加一次，别名重放不增长，失败的新快照不留下别名或引用；数量上限还验证请求ID绑定冲突仍返回409。

为了证明测试能抓到回归，在远程 `/tmp` 独立副本中分别把数量检查、频率检查移到快照去重之前：两种变异都被检出，恢复原实现后4/4通过。未修改运行中服务的限额或数据，也没有为测试放宽发布限制。
