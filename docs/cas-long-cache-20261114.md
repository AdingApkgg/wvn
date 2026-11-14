# CAS 公共资源长期缓存

用户最终决定：资源分发继续放B2，不做本站引擎迁移；CAS内容更新使用新摘要，允许积极长期缓存，不因担心刷新而缩短资源TTL。

2026-11-14已通过现有Cloudflare CLI身份只读核实saop.cc实际账号及线上规则：WVN资源域的200–299边缘TTL已为31,536,000秒；400–599显式不存储。200/206/304响应头是`public, max-age=31536000, no-transform`，缺少immutable。

本次最小变更：仅修改既有`wvn_zi0_public_headers_20261031`规则中的Cache-Control值为`public, max-age=315360000, immutable, no-transform`，将浏览器新响应保鲜期设为10年；CF边缘成功响应保鲜期仍为一年。CF普通缓存不保证永久驻留，10年也不是物理永久存储。保持错误no-store、CORS、字节保持及其他域名所有规则；不清缓存、不改DNS、不加Worker、不启用付费服务。旧哈希不覆盖，页面和清单继续刷新到新哈希。已经在浏览器中按旧头缓存的对象自然沿用旧保鲜期，直到重新取得响应。

变更前核对完整规则快照，单条PATCH，变更后回读目标字段并比较其他规则未变。只保留该条规则的回滚体，不以旧快照覆盖整个共享规则集。准备材料与前后快照在`/private/tmp/wvn-cas-cache-20261114/`，不包含认证凭据。

先验证已缓存JS响应保留HIT且新头生效，再只读核对原WASM的429是否仍是no-store。429恢复和真实游戏启动另行记录，缓存配置成功不能替代游戏启动验收。

## 已执行结果

Cloudflare规则 `314dc3cea57c441f86beb8e3a25c2695` 已从version 2更新至3；API回读确认只有该条Cache-Control值变化，其余响应头规则及整个请求缓存规则集未变。没有进行全站/单文件purge，未发布应用候选、未迁移本站资源、未启用付费产品。

公网验证（2026-11-14 20:26–20:28 CST，新加坡出口）：

- JS继续200/HIT，Age 4244秒，新响应头已变为10年+immutable，原缓存保留。
- WASM由先前429恢复为200/MISS，后续200/HIT、Age 2秒，返回同样的新响应头。这说明本次出口能够正常回源并留存该对象；上游恢复不能归因于响应头变更，也不等于所有边缘节点都有副本。
- 构建机持久任务 `wvn-cas-cache-verify-20261114` 退出码0：完整读取4,050,586字节，SHA256等于登记的`64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04`，第二次请求HIT。临时校验副本仅在QA任务目录，不作为本站分发源。
- 错误不缓存规则未变。此前429响应实测no-store；恢复后不人为制造上游错误验证。

如需回退，只将该目标规则的Cache-Control恢复为`public, max-age=31536000, no-transform`，先确认目标当前版本，再单条PATCH；不能覆盖共享zone的完整旧规则集。

## 浏览器补验与Origin缓存分片

`wvn-cas-clannad-webkit-20261114`补跑真实ONS，120秒未启动，退出码1：仅请求引擎JS/WASM时仍出现429，不能记为游戏画面、输入或存档通过。后续请求对照确认Origin参与CF默认缓存键：同一WASM无Origin请求已HIT；Origin为`https://wvn-cache.saop.cc`的请求HIT且Age约283161秒；新QA来源`https://localhost:25286`和opaque来源`null`首次分别MISS。JS带QA Origin仍429/no-store，带null为200/HIT。这解释了命令行成功不能代替浏览器成功，也证明WASM曾在部分来源缓存中存在，不能称它从未缓存。

本轮只修改既有成功响应缓存头，不修改CORS来源语义或扩展到Worker代理。CF官方文档说明Origin默认进入缓存键，按header定制缓存键属于Enterprise功能；未为此升级套餐或启用付费服务。冷缓存回源仍可能受B2限流影响，真实iPhone历史故障及整作游戏可玩性尚未完成验收。

官方依据：
- https://developers.cloudflare.com/cache/how-to/cache-keys/
- https://developers.cloudflare.com/cache/concepts/retention-vs-freshness/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
