# RenPy 扩展与公开统计验收进度

本轮仅更新远程预览，未切生产。当前严格完成 **15/15** 个版本的正文原生存读档链路。覆盖范围为桌面 Chromium 的指定正文检查点，不代表全部剧情、全部设备或全部结局已通关。

## 环境与数据边界

| 用途 | Arch 路径与入口 | 状态 |
| --- | --- | --- |
| 新引擎与统计 | `/home/wvn/wvn-renpy-stats-preview-20261026`，`https://localhost:18565` | 最终包摘要见 `/health` 的 `revision` 和 `state/final-verified-refresh/activation.json`；十五项候选保持隔离 |
| 旧引擎对照 | `/home/wvn/wvn-renpy-legacy-preview-20261026`，`https://localhost:18567` | 独立账号库，原版引擎，合成旧档及回读 |
| 媒体验证旧/候选 | `/home/wvn/wvn-renpy-media-legacy-validation-20261026`、`/home/wvn/wvn-renpy-media-candidate-validation-20261026`，`https://localhost:18569`、`https://localhost:18573` | 为 v50789 媒体与 v7738 布局副本作独立验证，账号库互相隔离 |
| 前一批源构建预览 | `/home/wvn/wvn-renpy-source-preview-20261026`，`https://localhost:18557` | 已恢复原 ec2 候选、仅 Eden；原库、密钥、候选空间保留 |
| 原主预览 | `/home/wvn/wg-web-preview-20261024`，`https://localhost:18551` | 未改代码、账号库或配置 |

预览须经 SSH 转发并使用既有预览证书。浏览器、构建和整库回归均在远程执行；构建机为 `build.example.invalid` 的 `/home/wvn/wvn-emscripten-20261025`。短时网络中断后已恢复连接，没有改动网络配置或退回 Mac 构建。

候选仍为 `unknown`，使用独立 IndexedDB，云同步关闭。候选验收没有覆盖原浏览器工作区或真实云存档。验收账号、浏览器上下文和存档均为合成数据。

## 源码构建

原游戏 ZIP 的 Python 8.2.0 包与新 C/WASM 8.2.1 混用，曾造成 `config.max_texture_size` 缺失。修复把固定源码的 RenPy、pygame_sdl2 Python 包纳入 `renpy.data`；解包时不允许游戏 ZIP 覆盖运行时目录。原游戏包、旧引擎和存档目录保持原样。

- 作业 `5ea2bff3-433e-41b2-a5d4-584f039811a7`，SDK 3.1.24，十五项汇总后经 CLI 校验进入 `preview_ready`。
- 发布 `renpy-5b572ebfa6248cac249cab61f698c967cac82b7d225da7515971b383d0f0a3cf`。
- 实际浏览器 `/renpy/config.py` SHA-256 为 `c44cfa26f2a3503cd5c64839c78e0e62625eee8e9fdb1412c22529e27badb400`，与锁定源码相同。
- 完整 50 文件导出已留在 `H:\wvn-engines\releases\<releaseId>`，含源码、依赖、锁、许可证、适配器、回执及四件套；归档 286,662,386 字节，摘要 `dd18d8765d9bc627b1f6c91ded93fa69c4b57997496f3a42daac8cf1c1e6d0c1`。
- 留存时 H 空闲 144,955,514,880 字节，高于 66,571,993,088 字节保护线；未把项目文件写入 Windows C 盘。
- 修复后仅完成一次完整构建，未声称字节可复现。

## 逐版本原生兼容

严格通过包括：旧引擎生成正文原生存档；候选读入旧档并推进保存；原生菜单准确读回同一较早检查点；页面重启；独立旧引擎回读；原工作区与历史不变；真正关闭并重启 Chromium 后，同一手动槽位的非空文件、字节、mtime 和历史均保留，再通过原生菜单读回并继续保存。标准存档使用原生保存 API，自定义菜单版本走原生 FileSave 按钮；读档均走实际 FileLoad 菜单，没有跳转剧情标签。

| 版本 | 严格结果 |
| --- | --- |
| `renpy-v1286-1` | 正文完整链路通过；基线 `renpy-final-eden-20261026-v6/`，候选及进程重启 `renpy-final-eden-recovery-20261026-v7/` |
| `renpy-v8038-1` | 正文完整链路通过；候选及进程重启 `renpy-final-8038-recovery-20261026-v7/` |
| `renpy-v8038-2` | 正文完整链路通过；与 v8038-1 共用 `renpy-final-8038-recovery-20261026-v7/` 回执根目录 |
| `renpy-v10597-1` | 通过，包含双挂载 |
| `renpy-v14240-1`、`renpy-v14240-2` | 通过 |
| `renpy-v562-1`、`renpy-v562-2` | 通过 |
| `renpy-v3144-1` | 通过 |
| `renpy-v50789-1` | 独立预览的正文全链路通过；基线和候选为 `renpy-final-media-body-20261026-v4/`，进程重启为 `renpy-final-media-restart-20261026-v5/`；最终预览配置接入独立副本 |
| `renpy-v44184-1`、`renpy-v44184-2`、`renpy-v44184-3`、`renpy-v44184-4` | 正文完整链路通过，证据 `reports/renpy-final-body-20261026-v2/<id>/` |
| `renpy-v7738-1` | 正文完整链路通过，含布局与缓存修复的独立副本，证据 `reports/renpy-layout-case-20261026-v3/` |

主要证据在构建机：

- 早期四项源码与回读链路：`reports/renpy-runtime-20261026-v1/` 和 v10597 对应 `-v2/`；真实进程重启补强在 `reports/renpy-gates-20261026-resumed-v2/`。
- v14240 两版、v562-2：`reports/renpy-gates-20261026-resumed-v2/<id>/`。
- v562-1、v3144-1：`reports/renpy-custom-20261026-resumed-v3/<id>/`。
- v44184-4：正文基线在 `reports/renpy-final-body-20261026-v2/`，候选与进程重启在 `reports/renpy-final-demo093-20261026-v3/`。
- v50789：早期 `reports/renpy-media-case-20261026/` 和 `renpy-final-media-body-20261026-v3/` 仍为制作说明，已撤回正文通过的判断。四段 MPEG-2/MP2 片头转成 VP8/Vorbis WebM，原包不变，其他 1,197 条目摘要相同，详见 `renpy-media-compatibility.md`。

这些检查覆盖相应检查点与存读兼容，不代表全部剧情、所有设备或全部结局都已通关。旧版失败和开场声明回执均保留，不能替代新门槛。

## 公开统计与 Umami

口径见 `public-stats.md`：确认实际启动后计阅读，浏览器与作品滚动 30 分钟去重，跨版本共用；登录账号可点赞、收藏、撤销；公开汇总，私人的收藏列表不公开。

远程 13 项界面和接口复验通过，含实际启动/重放、关系幂等/撤销/刷新、收藏列表、导出、注销清理、390px 无横向溢出、私页不跟踪、DNT、脚本被拦截时游戏及保存可用。回执 `reports/public-stats-20261026-resumed/acceptance.json`。

真实双标签 `reports/reading-tabs-20261026-v4/acceptance.json` 通过：签发一次，两个真实 200 分别 `counted=true/false`，汇总只加一。Tyrano 真实阻断 `first.ks` 时无阅读计数，恢复后确认原生场景已解析并执行才计一次，重启去重；回执 `reports/tyrano-startup-20261026-resumed-v4/acceptance.json`。

Arch 原机 06:26:13 复验：Umami 3.4.0、PostgreSQL 18 容器健康，实际 30 事件（4 个 `reading_start`、6 个 like、6 个 favorite）；私页、query/referrer、非 WVN 标题及未批准事件均零。后台仅回环，PG 未发布端口，匿名管理返回 401，默认密码失效；所有管理秘密留在 Arch。回执为新主预览 `state/analytics-verification.json`。

## 审阅、回归与最终回执

唯一一次独立审阅为 0 Critical、3 Important、1 Minor，四项已修复并远程复验：Tyrano 实际就绪门槛、真实浏览器重启的非空槽位及 GUI 读回、持久访客签发配额、QA 清理只比较自身原基线。没有安排第二轮审阅。

远程 TypeScript **161/161**、整库类型及 Web 构建通过；最终菜单辅助脚本的相关模块 **52/52**（其中原生菜单 **20/20**）通过。后续仅整理验收文档，没有再修改已验证的运行时代码。

十五项证据汇总为构建机 `reports/renpy-expansion-20261026/final-native-acceptance.json`，列出每份候选与进程重启回执的摘要。前六项重启回执记录通过的继续保存检查；后续回执还包含实际推进后的可见文本，不补写早期未记录的文本字段。

最终激活单独保留数据库快照及源文件备份，只刷新本轮独立预览；核对账号库 inode、密钥与候选摘要、账号/分享/存档/统计数量和阅读总量。激活回执 `state/final-verified-refresh/activation.json` 与后续统计、Umami、环境守卫分别记录，不能互相替代。最终统计浏览器回执在构建机 `reports/public-stats-20261026-final/`、`reports/reading-tabs-20261026-final/`、`reports/tyrano-startup-20261026-final/`；最终环境回执为 Arch 新预览 `state/final-environment-guard.json`。整个过程不切生产，不改 Tunnel 或 DNS。

生产保护核对原 250 份源码符合摘要 `efcae4abb93bfa1ef0564c4733f4a541144b6423d983c376043a692248b51f1f`，配置与启动标记不变；环境守卫同时核对旧预览 277 份、源构建旧预览 289 份源码以及原数据数量。不能把预览通过当作生产已更新。

原生鼠标验收先通过渲染树验证按钮命中，再检查点击后的真实菜单和准确正文；不要求按下前已有悬停焦点。缺少可点击像素时，只有原生键盘焦点精确落在目标槽位后才按 Enter；不改引擎焦点、不直接调用 FileLoad 动作或跳转剧情。Eden 的起始文本从当前 `start_text` 屏幕读取，纯标点、制作说明及教程不作为正文检查点。

最终接入的 H 盘原包和两个副本于 09:52 重新核对 SHA-256，均符合预期；实际空闲 117,435,584,512 字节，高于 62 GiB 保护线。副本及失败回执保留，原游戏包、存档路径、H 盘完整引擎归档均不覆盖。
