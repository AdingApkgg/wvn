# 首次生产发布（20261019-133308）

用户已明确授权更新生产。2026-10-19 用户贴回的远程日志确认：21项单元/集成测试、类型检查、SSR构建、10项浏览器测试通过，元数据包含64部作品、64个图片位、64份简介及330张已缓存图片。图片位中49个沿用原图，7个官方宣传图、5个官方标题图、3个游戏画面备用图；不将备用图称为原始封面。

用户贴回的生产只读快照确认：Windows WVN-STORAGE、H盘可用119715667968字节，CaddyWG服务与旧8212站点运行；Caddyfile SHA256为313A06303C4AD24B14CC535BDA718F09C08B3C2C0EF72110BF4D843F5AF0657F。8281/8282隔离预览仍是49图/59简介的旧快照。以上是用户执行日志证据，不能称为本轮代理远程执行结果。

执行入口：`bash scripts/publish-verified-wg.sh`，由Mac仅负责SSH、打包转运与日志；Linux打包、浏览器验收；Windows运行候选与正式应用。最终发布脚本已由代理实际执行成功（exit 0），收据status=complete；本地日志 `reports/publish-20261019-133308.log`，收据 `reports/production-20261019-133308.json`。

流程：

1. 从Linux现有已验证目录导出应用、12张新增图片以及实际引用的全部330张图片的SHA256清单；其余318张从Windows原预览缓存本机复制。避免将约80MiB已有缓存重复跨机上传，候选的全部330张图片逐字节哈希核实。
2. Windows新建按发布ID隔离的候选目录，复制相同锁文件对应的Windows依赖；通过VACUUM INTO从预览生成一致性快照，再复制为生产目录数据库。原预览、游戏资源均不覆盖，不重跑seed。
3. 严格要求导入0新增/19更新/45不变；逐条比较目录五表与未涉元数据。启动仅监听127.0.0.1:8381/8382的候选，配置本次专属开机启动任务与失败重试。任务使用SYSTEM服务账户，无交互登录口令；仅在已核实H盘本地目录运行Node。
4. Windows检查235项路由、64条资料、330张图片；复用Linux已经锁定安装的三个纯JS Playwright包，放入专属QA目录，调用Windows现有Chrome，经独立8383 Caddy反代执行相同两项只读浏览器测试。没有管理写入，不执行整套会改测试数据的用例。
5. 校验旧Caddyfile和候选配置哈希，备份原配置；只将原file_server替换为反代8381，保留8212、原域名、Tunnel、COOP/COEP、日志及缓存配置。游戏继续通过原H:/wg及原执行路径提供，保留正式origin与旧路径。
6. Caddy热重载后再次验证235项路由与所有资料/图片，并通过Linux现有11090代理对正式HTTPS站点执行两项只读浏览器测试。通过才写complete收据。

失败时尝试恢复本次备份的Caddyfile并重载，只停止/注销身份吻合的本次候选任务，保留发布目录和数据库快照；其他任务和游戏目录不操作。若实际Caddyfile出现其他变更，拒绝回滚覆盖并明确报告，保留人工检查所需文件。

回滚入口随发布写入本机reports/rollback-发布ID.ps1；可用既有remote_ps.py执行，指向确切远程发布记录。主脚本结尾显示完整回滚命令和日志路径。

首个完整图片包上传停在43345920字节，仅结束了身份核实的自有SCP进程，生产未改。增量包候选20261019-131817通过330图SHA256、19/45条目保护、235路由和330图HTTP检查，但Mac双重SSH隧道下的浏览器加载超时（同一候选API在Windows本机约187ms，经隧道15s零字节）。两项用例失败后已自动注销本次候选任务并确认旧Caddy哈希；因此改用Windows本机现有Chrome验收。失败记录应保留，不能当作该次浏览器已通过。

验证范围为目录、路由、图片、前端交互和跨源隔离；不代替全部游戏完整游玩、游戏内存档槽或重启机器后的启动验收。脚本不修改浏览器存储。

候选20261019-132701的Windows本机两项浏览器测试通过；切换后公网两项测试发现crossOriginIsolated=false，trace确认COOP/COEP各出现两次（Caddy立即写入后反代又复制了Hono响应头）。脚本已自动恢复原Caddyfile并清理本次任务。依据[Caddy header官方说明](https://caddyserver.com/docs/caddyfile/directives/header)，改为`>`延后设置响应头，统一覆盖上游值；WASM MIME和HTML缓存头同时延后覆盖。新增独立8383 Caddy代理候选，在正式切换前检查真实代理响应头、WASM MIME和同样的两项浏览器用例；235项HTTP检查也改为要求COOP/COEP精确值，重复头视为失败。公网失败trace另存构建机reports/failed-public-20261019-132701.tgz。

## 最终验收

- 发布时间：2026-10-19 13:36:49 +08:00，发布 `20261019-133308`，独立目录 `H:\wg-manager-release-20261019-133308`。
- 生产 `https://wg.saop.cc`，原Caddy 8212反代回环8381；私有管理仅8382回环。当前公开/私有端口均无局域网监听，8383测试Caddy已关闭。原8281/8282预览独立保留。
- Windows生产235/235项HTTP检查通过（含COOP/COEP精确值），330张图片和64条资料无错误；Windows代理候选两项浏览器通过，Linux经11090代理的公网两项浏览器也通过。实际 `crossOriginIsolated=true`。
- 64部作品、79个版本、64个图片位、64份简介、269张截图；0新增/19更新/45不变，目录五表逐条相同。
- 正式Caddyfile SHA256 `B62AE14900CA682FE703BA7D37DE2B31555F3C5616AF6BB825D4C15BC1E06C01`；旧配置备份哈希仍为 `313A06303C4AD24B14CC535BDA718F09C08B3C2C0EF72110BF4D843F5AF0657F`。
- 最终只读检查：Task `WG-Manager-20261019-133308` 为Running，SYSTEM，MSFT_TaskBootTrigger，失败重试5次；H盘剩余118909980672字节（约110.7GiB），高于60GiB+2GiB缓冲。未重启机器验证。
- 回滚：`python3 /Users/developer/Code/temp/wg-deploy/remote_ps.py /Users/developer/Code/temp/wg-manager/reports/rollback-20261019-133308.ps1`。备份与实际数据库均保留在本次独立发布目录，不回写游戏资源和浏览器存档。

本脚本是本次首次切换入口，严格校验旧生产配置哈希；已上线后的下一次升级需要基于当前发布记录安排，不能将首次发布脚本当成无条件覆盖脚本。

## 自适应封面墙升级（20261019-141301）

用户在预览验收后明确授权更新生产。此 UI 升级复用现有生产目录与启动任务，不进行目录导入或数据库迁移。构建来自 Linux 已验收版本，服务器产物 SHA256 为 `473c38138cd9fe7771666b296f2eb8c55dd489fc8b0b6041749eca1fb41f32a4`，运行时代码 32 个文件与原生产逐个一致。

候选目录 `H:\wg-manager-ui-20261019-141301\candidate` 使用生产数据库的一致性副本与回环 8481/8482。候选通过 235 项路由、330 张图片和 4 项只读浏览器检查后关闭。生产服务短暂重启，仅替换 build、src/routes/catalog.tsx、src/styles.css；保留上一版客户端 assets，供已有页面继续请求。Caddyfile、生产端口、开机启动任务、资源目录和元数据配置保持一致。

回滚文件与数据库快照保存在 `H:\wg-manager-ui-20261019-141301`，升级收据为该目录 receipt.json。回滚只恢复界面与两个源文件，复用当前数据库，保留切换后的记录。

```sh
python3 /Users/developer/Code/temp/wg-deploy/remote_ps.py /Users/developer/Code/temp/wg-manager/reports/rollback-gallery-20261019-141301.ps1
```

专用脚本 `scripts/upgrade-gallery-windows.ps1` 严格校验本次上线前的生产 build 与配置哈希；它是这次 UI 升级的执行与回滚入口。执行日志：reports/gallery-stage-20261019-141301.log、reports/gallery-publish-20261019-141301.log。

最终验收：2026-10-19 14:19:13 +08:00，收据 status=complete；Windows 源站 235/235 项路由、330 张图片与 4 项浏览器验收通过，Linux 经 11090 代理对正式 HTTPS 站点的 4 项浏览器验收通过。确认六张业务表与停服前一致性快照逐条相同，生产任务 Running、8381/8382 仅回环，Caddy hash 保持 B62AE149…E06C01，H 盘剩余 117790691328 字节（约 109.7 GiB）。本地收据 reports/gallery-production-20261019-141301.json，公网验收 reports/gallery-public-acceptance-20261019-141301.json。
