# WG 存档分享远程预览

用户授权公开分享和链接分享，先远程预览，不切生产。实现基于 [设计](superpowers/specs/2026-10-19-wg-save-sharing-design.md)。

## 功能

账号备份历史的「分享这份存档」固定选择的 revision，填写标题/说明/进度与剧透标记并确认文件。链接分享默认30天，可选1/7/30天，完整带fragment链接只显示一次；公开分享先审后发。

作品页「玩家存档」按版本浏览公开条目。详情在独立账号来源，匿名看说明、同页 Passkey 登录/注册后领取或下载。领取复制到自己的 namespace，显示「收到的存档副本」，不改当前 head、不改游戏本地存档；设为当前备份仍需单独确认/CAS。

我的分享可改文案、撤回和分页，公开文案编辑待重新审核。详情支持举报，私有审核后台支持批准、下架和无问题结案；独立 token/Cookie/listener。文件下载支持ZIP包（manifest.json + files/）与单文件。

## 数据安全

复用通用 refs，分享和下载/领取租约纳入额度、GC及联合备份。跨用户实际复制、同用户去重；每文件32MiB、快照64MiB/512文件、个人512MiB，保留62GiB。

领取准备/提交原子化并幂等，复制在SQLite锁外，过程中重查账号binding/分享状态/目录可见性/generation。撤回与最终提交串行裁决；领取已完成的独立副本不追删。

分享撤回独立fsync台账阻止旧数据库复活链接；源profile/账号删除会撤回分享。备份工具在分享库启用后拒绝遗漏撤回台账。传输同时限制每账号2、每peer8、全局16，并以16MiB/s全局预算节流。

## 远程运行与权限

只在 localhost-1（hostname localhost）的 `/home/wvn/wg-accounts-preview-20261019` 安装、构建与验收。

- 账号/详情：`https://localhost:18283/account` / `/s/:shareId`
- 新的作品页预览：`http://127.0.0.1:18284/`
- 私有审核：`https://localhost:18285/share-admin`

三者仅远程loopback，通过SSH转发；测试TLS证书沿用账号预览，需在用户浏览器信任此预览证书。正式域名/RP未启用。生产与原WG预览未切换。

```sh
# 远程：备份现有私有账号库及引用文件后，只重启cwd/命令匹配本目录的进程
bash scripts/start-sharing-preview.sh
# 本机只做转发，不运行开发/构建/预览进程；已有18283转发可保留
ssh -N -f -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:18284:127.0.0.1:18284 \
  -L 127.0.0.1:18285:127.0.0.1:18285 build.example.invalid
```

邀请码仍在 `state/accounts-preview/invite`。管理token在 `state/accounts-preview/share-admin-token`，每次账号服务重启重新生成，一次登录后消费，不得贴入日志或Git。文件/密钥不在公共Web根。

## 验收

```sh
npm test
npm run typecheck
npm run build
bash scripts/test-sharing-remote.sh
bash scripts/test-accounts-remote.sh
WG_TEST_ROOT="$PWD" WG_TEST_PUBLIC_PORT=8391 WG_TEST_ADMIN_PORT=8392 bash tests/e2e/run-remote.sh
```

测试脚本使用独立SQLite、合成账号/凭据/文件、专用18483–18486端口，不改现有用户数据。

真实游戏导出文件与原生读档兼容性尚未验收；本批用合成字节验证分享协议，不冒称存档可玩。ONS/Artemis自动捕获/应用、Safari/iOS与硬件Passkey跨系统验收继续独立，未开放。预览示例必须明确标记为合成文件，不可用于游戏。

## 备份与回滚

`start-sharing-preview.sh` 先将现有账号一致性数据库、引用对象和两份台账备份到 `state/sharing-preview/before-*`，保留原秘密和Passkey凭据，不清空用户库。新目录使用独立目录数据库，旧目录预览不重启。

分享启用后的显式备份/恢复分别传入 `WG_ACCOUNT_SHARE_LEDGER`；恢复只准备新目录，合并当前删除/撤回台账，启动重放后再开放网络。不将DB单独回滚，不覆盖现有玩家数据。默认采用代码/界面回滚并保留新增schema与当前台账；任何数据库数据回退须单独核对恢复点与新增数据。

## 已知预览限制

发布框重新打开后可以为同一快照再次创建分享（仍受额度限制）。发布时版本文字快照与条件来源链接仍待完善。

验收脚本若异常中断，finally 清理暂未检查 DELETE 非2xx响应，错误日志可能不完整；本轮正常路径已逐一断言四个临时账号删除成功。

延迟分享响应恰逢切换账号的专用浏览器用例尚未覆盖；服务端binding及前端epoch校验不代表该交错已获浏览器验收。

## 首轮实际验收记录（2026-10-19）

远程运行版本 `08955bb188b2ff3b00fccdea4203e5a2b0dfea1a`，核对171个源码文件。61/61单元、2/2分享浏览器、11/11账号浏览器、12/12目录浏览器通过，类型检查和构建通过。

持久实例已实测两种发布、独立后台审核、公开作品页、领取者私人文件、跨用户不同inode、ZIP CRC/SHA256、专用分享撤回后源inspect/download失效且私人副本仍可读。领取未改变当前head。1440px桌面和390px手机均无溢出，页面异常0；完整报告与截图在忽略目录 `reports/sharing-preview/`。

- 作品页：`http://127.0.0.1:18284/27448/#player-saves`
- 公开示例：`https://localhost:18283/s/f17d8e48-eaa1-4e65-b950-b364f7285f3d`
- 原有账号数据先联合备份到远程 `state/sharing-preview/before-*`，未清空。审核token验收后由拥有的预览重启刷新。

持久验收命令为 `node scripts/verify-sharing-preview.mjs`。该脚本直接走注册UI；不要用tsx转译浏览器回调。会添加明确标注的合成示例并消费一次后台token；验收后需刷新token。

## 筛选、进度编辑和审核补齐验收（2026-10-19）

产品提交 `3b3ed8e440b654b33c36195691f7d8eea64e6e5f`：版本与进度联合筛选在SQL分页前执行，只依据approved字段；「更多」保留筛选，重新筛选清除游标，刷新保留控件选中值。详情和作品卡片展示进度。编辑进度/剧透从pending内容初始化，公开修改在重新批准前不改变原展示；CAS继续生效。

审核页展示作品、稳定版本标识/编号/引擎、发布者、创建/到期时间、当前/待审完整内容、固定文件名/字节数/SHA256和举报。目录下线或不可用时明确标记，文件清单仍可查，下架/举报结案仍可执行。审核接口不返回源profile/revision/owner或secret。

远程64/64单元、3/3分享浏览器、11/11账号浏览器、12/12目录浏览器、typecheck/build通过。独立审阅0 Critical/Important，1个清理诊断Minor保留如上。未对未改动的存档复制内核进行全面安全重审，仅核查调用边界和既有回归。

持久预览实际验收了2页联合筛选、待审进度/剧透前后值和完整审核元数据。分页使用4个明确标记的合成临时账号各发布5份，遵守正常限额；验收后4个账号均确认删除，20份分享随之撤回。原有账号/凭据/文件先联合备份并保留。12张持久预览桌面/手机截图无溢出、页面异常0。另补远程隔离浏览器390px弹窗边界和独立截图 `reports/sharing-preview/edit-progress-mobile-checked.png`，修正全页截图未清晰捕获fixed弹窗的取证问题。

```sh
WG_SHARING_POLISH_ACCEPTANCE=1 node scripts/verify-sharing-preview.mjs
```

报告 `reports/sharing-preview/acceptance.json` 记录持久实例产品提交；`post-restart.json` 记录后续仅文档/测试提交的运行版本、完整源码哈希和与已验收相同的服务端构建哈希。审核token验收后重启刷新，仍只用SSH访问。真实游戏兼容性/实体Passkey未验收，生产未切换。
