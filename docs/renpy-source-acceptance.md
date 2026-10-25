# RenPy 源码构建与预览验收

记录日期：2026-10-26，时区 Asia/Shanghai。仅更新独立远程预览；生产、原主预览、原 ONS 候选和既有游戏资源均保留。

## 当前结果

RenPy `8.2.1.24030407` 已接入统一管理的 SDK、固定输入、源码构建、制品核验、字节比较、不可变导出和预览验收流程。实际运行时显示 `Ren'Py 8.2.1.24030407+unofficial`，回执标记 `official=false`，不冒充官方发行产物或旧线上包的已证明来源。

| 环境或制品 | 当前状态 |
| --- | --- |
| RenPy 源码候选 | `https://localhost:18557/1286/1/`，仅 eden*，版本 `legacy-2bc9744f4a39fda45c162027` |
| 候选工作区 | Arch `/home/wvn/wvn-renpy-source-preview-20261026`，账号状态与旧预览分离 |
| 私有引擎后台 | Arch 回环 `http://127.0.0.1:18560/manage`，匿名 401；凭据仅在 Arch 使用 |
| 首次干净构建 | 作业 `9cebf998-3b38-4054-8364-a06bbda009cc`，`preview_ready`，兼容性仍为 `unknown` |
| 第二次干净构建 | 作业 `f05a8bb9-b94d-4ddb-b4f9-c6bf329a91e3`，`artifact_verified`，未登记浏览器兼容、未自动选用 |
| 原预览 | `18551` 主预览、`18555` ONS 候选继续保持原清单 `226946a9…` |
| 生产 | `https://wg.saop.cc/` 保持原清单 `efcae4ab…`，本轮未发布 |

上述 localhost 仅是 SSH 转发，实际 Web 与浏览器验收运行在远程。功能验收对应源码清单 `7233e09599e5aa70cc0583d3ab578c3e19abbf9be4db62a6684103811cf1a0c6`；后续仅文档同步的最终清单见 Arch `state/final-doc-refresh/activation.json` 和 `/health`。

## 固定输入与构建边界

| 输入 | 固定值 |
| --- | --- |
| Emscripten | `3.1.24`，独立于原 ONS SDK `6.0.10`；29 份关键工具文件核验 |
| emsdk | `35ff8a6d150541276abbc6bae512ca90bcfbe220` |
| Emscripten 源码 | `68a9f990429e0bcfb63b1cde68bad792554350a5` |
| renpy | `1a30d4dd8eb5d0f21ac8550703439db05fde0cc8` |
| renpy-build | `992db0ebeef20cf752a29eda9df503377e80e1b2` |
| pygame_sdl2 | `4fadf87b8c3e9d607b97709d3bbf3df6a7fab102` |
| AOM | `bcfe6fbfed315f83ee8a95465c654ee8078dbff9` |
| libyuv | `331c361581896292fb46c8c6905e41262b7ca95f` |
| libavif | `6ab53189045e7a6fe0bd93d14977b2a4f8efa5e9` |
| 完整输入锁 | `engines/locks/renpy-8.2.1-inputs.json`，SHA-256 `fcf0ac21a9d384ece30ec3ba6c2cd16732ffb8decc08681e1a0d6c75e72212d5` |

完整锁包括六份源码、23 份上游归档、22 个 Python 构建依赖。离线 pip 不使用浮动来源；官方全局 prepare、apt/sudo、浮动 Git 和 SDK 激活脚本均未执行。适配器 `scripts/lib/renpy-build.py` 与宿主模块 `scripts/lib/renpy_host_python.py` 的实际字节随每次作业捕获并导出。

宿主 Python 在作业私有引导目录编译，安装为独立、只读、经摘要核验的共享工具缓存。两次引擎构建各自从新源码与输出目录开始，复用同一个已核验的宿主工具链；没有声称宿主 Python 也分别重编两次。make、EMCC、Binaryen 并发均限制为 2，Cython 与上游任务组串行。

适配包含固定正时间戳、直接 GCC 替代强制 ccache、Web 静态头生成和宿主代码生成环境修正，均有严格形状检查。没有 Cubism 输入，因此明确关闭 Live2D；依赖该模块的游戏不在放行范围。

## 两次实际构建与复现结果

第一发布 ID：`renpy-ec2b222dd4caac67aff8cde8f7745d1b9c957de6d6da9d3a61bec9ac7c048972`。

第二发布 ID：`renpy-9186cfe81324d01e73995983b79ed9040e572c7df3d60eda4244c3091796d999`。

| 文件 | 两次字节数 | 逐字节相同 |
| --- | --- | --- |
| `renpy-pre.js` | 28,999 | 是 |
| `renpy.js` | 395,443 | 是 |
| `renpy.data` | 15,313,684 | 是 |
| `renpy.wasm` | 18,030,451 | 否 |

两次输入身份一致，但 WASM 有 7,400 字节不同，位于 code（10）与 data（11）段。首份 WASM 含 25 处作业 UUID，替换 UUID 后仍不相同，不能将全部差异归因于路径，也不能宣称 WASM 已实现字节复现。首份 WASM SHA-256 为 `1520c857f7d1a8129f86424469b4320b238498e710edecfd314c0622d9aecebd`，第二份为 `c426ce1f596cdc10b9a36b0c3fe6151122b55c20b87b3db519bda7f960302911`。进一步收敛非确定性仍是未完成能力，不影响本次按精确首份发布 ID 隔离验收的结论。

证据位于 Linux1 源码目录的 `reports/renpy-20261026/reproduction.json`、`reproduction-files.json`、`reproduction-cause.json`；所有失败作业和诊断树保留，诊断续编不计入这两次干净构建。

## 远程验证

以下测试及 Chromium 均在 Linux1 执行，访问 Arch 独立预览。

| 检查 | 实际结果与证据（`reports/renpy-20261026/` 下） |
| --- | --- |
| 单元与集成 | TypeScript 142/142、模块 28/28，`unit-clean-preview.log`、`module-clean-preview.log` |
| 类型、Web 构建 | 通过，`typecheck-clean-preview.log`、`web-clean-preview.log` |
| 四件套 | SHA-256 全匹配；HEAD 200、Range 206、正确 MIME、不可变缓存，`clean-isolation/acceptance.json` |
| 沙箱 | origin=`null`，父页面与 IndexedDB 拒绝访问，私人 API 被阻止，同上 |
| 原生存读档 | 旧引擎真实存档显式复制到候选；新引擎读回较早正文、推进保存、再次读回与重启均通过，`clean-native/acceptance.json` |
| 旧引擎回读 | 旧引擎独立上下文可读取候选产生的原生档并继续保存，原旧工作区及历史保留，同上；此样本结果不等于通用兼容声明 |
| 实际浏览器进程重启 | 关闭并重新启动 Chromium，复用隔离测试 profile；启动前头部与历史完全一致，6 个原生槽位重新打开，`browser-restart/acceptance.json` |
| 旧云档回归 | 未改引擎的 RenPy v14240，两设备、两个真实原生云版本、字节/mtime/本地及云端历史保留，`cloud-clean/native-cloud-results.json` |
| 其他引擎代表 | ONS v1194、Artemis v27448、旧 RenPy v14240、Tyrano v49795 启动、隔离、持久保存 ACK 通过，`representatives-clean/results.json` |
| 旧 eden* 基线 | 原引擎原生存档、GUI FileLoad、重启、字节/mtime/历史，`legacy-baseline/` |
| 状态晋级 | 首份且仅受测版本 `preview_ready`，`preview-acceptance.json`；第二份不据此晋级 |

候选的 `cloudHistory` 验收项指“候选本机历史与关闭云同步 + 未受影响旧引擎云端历史的独立回归”，没有上传候选档到旧云空间。候选数据库为 `wvn-engine-candidates-v1-<releaseId>`，备份为格式 2；跨家族、游戏身份不匹配、混组及未知兼容覆盖均拒绝。旧发布 ID、旧云档指纹和旧备份身份不改。

云端验收只使用合成账号 `fa30eb29-5a76-4946-87ce-26300818533b`，删除返回 200；无失败清理项。未手工删除业务 blob。诊断版第一次重启曾出现 `resourcewarning.png` 网络错误，未唯一定位其原因，原失败报告保留；后续干净发布的完整原生及浏览器进程重启均实际通过，没有把诊断失败改写成成功。

## 留存、回退与生产保护

首份不可变导出已逐文件核验并存入：

```text
H:\wvn-engines\releases\renpy-ec2b222dd4caac67aff8cde8f7745d1b9c957de6d6da9d3a61bec9ac7c048972
```

50 文件，包含源码、依赖、锁、实际适配器、许可证、构建回执与完整四件套。归档 282,915,255 字节，SHA-256 `8e6044f46dd6260fba85b148880ee4503905ab0f694014a29d1441aa1c4125d7`。H 留存回执为 `H:\wvn-engines\reports\<releaseId>-store.json`；存入后实际剩余 `149562826752` 字节，大于保护线 `66571993088` 字节。只新增 H 路径，未写 Windows C 盘或覆盖旧游戏资源。

候选激活前后保留代码/构建/配置副本，位置为新预览的 `state/clean-candidate-activation/before`；最终文档刷新单独保留于 `state/final-doc-refresh/before`。回退只恢复代码、构建和配置；不回灌账号数据库，不覆盖浏览器存档或历史。原主预览可继续作为旧引擎入口。

`2026-10-26 02:29:18 +0800` 的保护检查通过：生产 250 份源码摘要均一致、生产启动标记仍为 `6610496661667`；原预览 277 份源码一致，0 个账号、原 8 条 blob 索引及 2 条分享保留，五个旧服务 active。最终刷新另做同样检查，回执留在 `state/emscripten-management-20261025/final-guard.json`；新预览保护回执为 `state/final-doc-refresh/guard.json`。生产、Tunnel、DNS 未操作。

## 审阅、判断及未放行能力

一次独立最终审阅：0 Critical、0 Important、1 Minor。唯一 Minor 是宿主缓存说明将安装目录误写为作业私有；已在本次必要的验收文档更新中纠正，无功能代码修补或待处理 Minor。完整过程保留在计划台账。

| 判断 | 理由与代价 |
| --- | --- |
| 单独保留 SDK 3.1.24 | 对齐该固定源码的 Web 构建；多维护一个 SDK，旧 SDK 不变 |
| 捕获 rootless 适配器 | 避免全局安装、浮动下载与破坏性清理；适配器变更必须重新核验 |
| 共享只读宿主工具链 | 两次引擎源码/输出独立且可审计；不宣称重建两套宿主 Python |
| 固定会话的完整发布清单 | 新旧 JS/WASM/data 不混组，旧地址不改指候选；新增握手字段，非法清单拒绝 |
| 未知兼容独立工作区 | eden* 样本通过仍不登记通用兼容；候选云档关闭，其他作品未放行 |
| WASM 不同字节 | 如实保留两组发布、差异与作业；尚未消除全部非确定性 |
| Live2D 关闭 | 没有已固定的 Cubism 输入；相关作品需另行接入和验收 |
| 审阅未覆盖的运行证据 | 由执行者实跑第二构建、复现比较、原生/代表回归与生产保护，未推断通过 |
| 旧 ONS 与全部上游内部审计 | 本次做兼容单元及代表回归，不重复全量历史审计，也不作全上游代码或法律结论 |
| 仅预览收尾 | 保留分支与工作区；不推送、合并、发布生产或清理旧资源 |

未放行：其它 RenPy 游戏的逐游戏原生兼容、新候选账号云同步、依赖 Live2D 的游戏、旧二进制来源证明、Artemis 源码重建、全量原生菜单和整部作品可玩性。预览成功不能替代这些验收。
