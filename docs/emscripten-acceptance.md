# Emscripten 统一管理验收记录

此文保留 2026-10-25 的首批验收快照。2026-10-26 新增的 RenPy 源码构建、独立候选与实际验收见 [RenPy 源码验收记录](renpy-source-acceptance.md)；原预览及生产冻结版本未因此替换。

本轮完成 SDK、登记、构建、公共驱动和私有状态页的第一版，只更新远程预览。生产未切换。记录日期：2026-10-25；以下时间如带 `Z` 为 UTC。

## 当前入口与冻结版本

| 环境 | 状态 | 入口与标识 |
| --- | --- | --- |
| 主预览 | 运行中 | `https://localhost:18551/`，Arch，源码清单 `226946a90a56d31019172fa4039312ee118b248d6394e22d497b1bb06fdc854d`，277 文件 |
| 源码 ONS 候选 | 仅绑定已受测的 v1194 | `https://localhost:18555/1194/1/`，独立工作区，云存档关闭 |
| 私有后台 | 鉴权只读 | Arch 回环 `127.0.0.1:18554/manage`，79 绑定、41 发布组、68 个 Emscripten 版本 |
| 生产 | 本轮未变更 | `https://wg.saop.cc/`，源码清单 `efcae4abb93bfa1ef0564c4733f4a541144b6423d983c376043a692248b51f1f`，250 文件 |

上述 localhost 入口通过 SSH 转发到 Arch；Mac 不运行 Web、构建或浏览器验收服务。私有后台令牌留在 Arch，不能按旧的跨主机复制办法做验收。

应用代码修正提交 `d3ec236`，验收脚本提交 `49d4d99`；后续文档提交不代表重新部署。部署版本以远程源码清单及 `/health` 为准。

## 工具链与源码构建

- SDK `6.0.10`，emsdk 提交 `35ff8a6d150541276abbc6bae512ca90bcfbe220`；独立安装于 Linux1 `/home/wvn/wvn-engines/state/toolchains/emsdk-6.0.10-linux-x64`。原 `/home/wvn/emsdk` 保留。
- ONScripterYuri 源码锁定 `08f744b31cc1907b66a15f0402e62321a131ed81`，Lua `5.4.4` 固定摘要；SDK bootstrap、编译脚本及 31 份 ports 定义均在锁文件内。
- 审阅修正后的两次实际构建 `e429772b-2a5b-4c16-8499-06cc2b70a954` 和 `d9586d1c-82ff-4d6b-b42d-8976a66cec01` 均成功。输入身份相同，实际输出逐字节一致，文件集合摘要 `572f9550379abe661cf9739bb4cdaee9a8d7c3d07227d5c574c9d508bccb8820`。
- 发布 ID：`ons-d865b32e2e8decb36cf935bdbafeee160ecc9e7af4cd32c0fad92bb40b98d69a`。
- `e429772b` 已进入 `preview_ready`，验收范围只有 `legacy-caa815636729e8cfa7a09a46`（`ons-v1194-1`）。兼容状态仍为 `unknown`，没有为其它游戏登记兼容，也没有生产晋级操作。
- 导出包含实际构建输入：配方、SDK 锁、构建器、补丁字节及摘要、上游源码归档、Lua 源码、许可证和构建回执。旧失败作业及原始日志保留；没有把后来的输入补写到旧作业。

最终包已核验并原子留存于：

```text
H:\wvn-engines\releases\ons-d865b32e2e8decb36cf935bdbafeee160ecc9e7af4cd32c0fad92bb40b98d69a
```

共 20 文件（含清单），归档 SHA-256 为 `9a8f941f280eb7d918ac1eca843e83d435c29728c0bdb7a2b336ad67c8d58a37`。留存前后以及最后复查均检查 H 盘空间；最后实际剩余 `151310983168` 字节，保护线为 `66571993088` 字节（60 GiB 加 2 GiB 缓冲）。本轮没有写 Windows C 盘，没有覆盖旧游戏资源。

## 代码与浏览器验收

| 检查 | 实际结果 | 证据位置 |
| --- | --- | --- |
| TypeScript 单元 | 133/133 | Linux1 `reports/emscripten/input-all-tests.log` |
| 模块单元 | 25/25 | `input-all-mjs.log` |
| 类型检查、Web 构建 | 通过，均在 Linux1 | `input-typecheck.log`、`input-web-build.log` |
| 全量 Emscripten 启动 | 68/68 唯一版本；首次 65 通过，3 个 RenPy 单独重试通过 | `startup-combined-final.json`；原失败回执仍保留 |
| 名字修正后的五类 WASM 代表 | 启动、隔离、持久 ACK 均通过 | `input-smoke/results.json` |
| 源码候选制品 | HEAD 200、Range 206、WASM MIME/magic、不可变缓存 | `candidate-isolation-final/acceptance.json`；最终刷新另存 `candidate-isolation-current/acceptance.json` |
| 沙箱 | origin 为 `null`，父页面和 IndexedDB 拒绝访问，私人 API 被阻止 | 同上及 `input-smoke/results.json` |
| 后台浏览器布局 | 1360px、390px，无横向溢出、无页面异常 | `admin-v3/acceptance.json`（审阅修正前，UI 结构此后未改） |
| 最终私有 API | 原机鉴权通过，匿名 401，摘要无私有路径或凭据 | Arch `state/emscripten-management-20261025/admin-final-api.json` |

全量启动回归对应公共驱动修正后的 `3a89b0a9` 预览；最终 `226946a9` 增加 NekoMiko 名字输入适配后，复验五类 WASM 代表及六项旧档迁移。启动结果不表示全游戏原生存读档或整部作品通关。

## 原生存读档与历史

| 样本 | 原生验证范围 | 证据 |
| --- | --- | --- |
| ONS v1194、v14365 | 实际槽位保存、读回先前进度、重启、旧档导入和历史 | `native-ons-v1`、`native-ons-v2` |
| 新 ONS v1194 | 旧档进入新引擎、推进再保存、旧引擎读新槽、原旧工作区继续读取；检查原生剧情位置 | `candidate-v3/results.json` |
| Artemis ATRI v27448 | 两个不同槽位、重启、读第一槽再另存第三槽；原槽字节/mtime 与历史保留，第一/第三槽缩略图字节一致 | `native-artemis-final.json`、`native-session/artemis-v27448-1-*` |
| Artemis NekoMiko v25170 | 两个不同槽位、重启后真实 `FS.open` 读取第一槽、画面核对返回先前正文、另存第三槽；原槽及历史保留 | 同上及 `native-session/artemis-v25170-1-*` |
| RenPy v1286、v14240、v10597 | 引擎原生保存，真实 GUI `FileLoad` 读回更早文本，重启后再读，槽位字节/mtime 和历史保留；含 `/game/saves` 双挂载 | `native-renpy-v6/results.json` |
| Tyrano v49795 | 实际剧情 `t01.ks` 的不同进度、两个槽位、原生读回、重启、历史及缩略图 | `native-tyrano-v3/tyrano-v49795-1-native-case.json` |
| 账号云档 v1194 | 真实原生文件上传两个不可变版本并分别恢复，旧本机历史字节/mtime 与云端头保留 | `native-ons-v1/native-cloud-results.json` |

NekoMiko 的名字输入根因已确认：原生剧情调用 `prompt("请输入你的名字", "")`，被不透明沙箱拦截。现在只为该受审计版本，在启动前收集 1–32 字符名字，按纯字符串返回给精确匹配的原生请求。沙箱仍仅 `allow-scripts`，没有放开 `allow-same-origin` 或弹窗权限。未知输入请求明确报错，不自动代填。

原生 Artemis 恢复画面由执行者核对，原始截图带 SHA-256 存入回执；NekoMiko 的缩略图不要求字节相同，不能用缩略图差异直接推断原生进度不兼容。

六个独立旧库导入样本为 ATRI、NekoMiko、eden*、RenPy v14240、RenPy v10597 和 Tyrano v49795。均使用本轮合成浏览器生成的真实游戏存档，不读取真实用户旧档；导入头部文件字节/mtime 完全一致，旧库读取前后不变，之前的历史 ID 保留，启动后真实槽位仍在。证据由 `legacy-final-v3`、`legacy-final-v4`、`legacy-nekomiko-final` 汇总；失败和中断的早期试验单独保留。

RenPy 某次 `calledRun` 等待超时，而页面已报告启动。最终迁移验收改为等待播放器启动确认，再要求原生 Python VM 返回版本、真实画布及原生槽位逐字节检查通过。最终记录中 `calledRun=true`；没有证据证明旧超时的唯一原因，不据此修改产品逻辑。

云档验收合成账号 `5ed53db4-dd6c-4f18-82c0-8fdfd5e478fd` 已按 ID 删除，200 回执保留。预览最终账号数为 0，之前的 2 条分享记录保留；8 条 blob 索引包含验收产生的待正常 GC 对象，没有手工删除业务对象。

## 审阅与本轮判断

独立最终审阅提出四项 P2，均已修复：保存旧回调时的递归风险、动态 `preRun` 丢失准备步骤、SDK 安装缺少持久作业回执、导出缺少实际补丁/构建输入。修正有 RED→GREEN 记录，16 项定向检查及全量测试通过。之后发现的名字适配有单独 RED→GREEN、类型/构建、原生及隔离验收；没有再发起第二轮全分支审阅。

| 判断 | 处理与理由 | 边界或代价 |
| --- | --- | --- |
| worktree 注册工具未识别仓库 | 使用 Git linked worktree，实际生产冻结源码作为基线 | 后续审阅必须从 `08ec684` 开始，不能用更早的 main |
| 旧资源服务只读 | Arch 预览补上精确模块地址，保留 Windows 原生产资源服务 | 模块地址变更需重新验收 CSP |
| SDK ports 属于构建输入 | 锁定 31 份定义，新 SDK、缓存独立前缀 | 需要额外构建机空间，避免修改旧工具链 |
| 原生验收操作有等待和坐标差异 | 以真实槽位、原生文件读取、正文/VM 状态为准，保留失败试验 | 不把旧脚本点击失败当成游戏已损坏 |
| 原生名字请求 | 启动前收集，精确游戏及提示匹配 | 新的未知提示需要单独适配 |
| 跨主机管理令牌 | 自动审批拒绝后不重试转移；在 Arch 内存及回环接口完成最终鉴权 | 最后一次后台布局使用此前浏览器证据；最终 API 单独复核 |
| 候选兼容性未知 | 独立数据库、格式 2 备份、关闭云档；仅开启已受测 v1194 | 不替代其它游戏的兼容声明 |
| H 盘长期留存 | 空间守卫、摘要核验、原子改名到新目录 | 不覆盖旧版本，不能自动清除旧存档或资源 |
| 暂不发布 | 保留分支、回滚代码及验收证据 | 生产晋级仍需单独指令 |

临时管理令牌副本和两条临时后台 SSH 桥接已精确清理。用于用户查看主预览和候选的回环 SSH 转发保留。计划台账和失败试验保留用于后续迭代，没有清理旧资源或旧存档。

## 最终生产保护复核与未放行范围

Arch `state/emscripten-management-20261025/final-guard.json` 于 `2026-10-25 23:52:12 +0800` 逐文件核验生产 250 文件与预览 277 文件，生产启动标记仍为 `6610496661667`。预览数据库 `quick_check=ok`，原数据库 inode、密钥及原有记录已在各次激活前后核对；本轮五个服务均 active。公网 `/health` 返回 production，版本仍为 `efcae4ab…`。

以下能力没有放行：Artemis/RenPy 源码重建（现有包的源码/SDK 来源未核实）；其它游戏对新 ONS 的存档双向兼容；全量原生菜单验收；整部作品可玩性。早期 ONS v1085 原生菜单配方未产生槽位、Tyrano v36554 的标题/音频和读档超时试验，均没有算通过。它们继续使用原预编译引擎，候选范围没有扩展。
