# WVN Emscripten 统一管理

本轮仅更新远程预览，生产未切换。代码位于隔离分支 `feat/wvn-emscripten-management`；基线 `08ec684` 是实际生产冻结源码，不能用更早的 `main` 差异代替本批审阅范围。

## 已实现的分层

- `engines/` 固定 SDK、配方、旧产物组和逐游戏绑定。79 个版本保留原 ID、旧 `engine` 和存档兼容身份。68 个 Emscripten 版本与 11 个 Tyrano 版本分开表示。
- `public/player/emscripten.mjs` 共用生命周期、hook 和文件捕获；ONS 工厂与 Artemis/RenPy 全局 Module 仍有独立入口。原保存 ACK、特殊挂载和旧档路径继续保留。
- 受控 CLI 在 Linux1 安装 SDK、构建、核验、比较、验收与导出。Web 私有后台只读查看，不提供 SSH、任意命令或编译执行接口。
- 新 ONS / RenPy 候选使用独立数据库和格式 2 备份包。旧客户端拒绝候选备份；导入旧档明确复制到候选空间。未知兼容候选关闭云档，不能改写旧档标签绕过检查。

## 工具链与配方

构建机 `build.example.invalid`，源码目录 `/home/wvn/wvn-emscripten-20261025`，作业与缓存 `/home/wvn/wvn-engines/state`。SDK 独立安装在其 `toolchains/emsdk-6.0.10-linux-x64`；原 `/home/wvn/emsdk` 保留。

锁定 Emscripten `6.0.10`、emsdk `35ff8a6d150541276abbc6bae512ca90bcfbe220`、发行映射 `666337b525e673e769121856d175f6f52b8ead64`。锁包含 bootstrap/compiler 脚本及 31 份 ports 定义；下载通过构建机已有 11090 代理。

首条源码配方是 ONScripterYuri `08f744b31cc1907b66a15f0402e62321a131ed81`，Lua `5.4.4` 带固定 SHA-256。这个提交不冒充旧线上二进制的来源。Artemis 的 27 组 JS/WASM 和 RenPy 的两组旧运行时继续作为预编译包管理，原 SDK/源码未核实。新 RenPy 配方使用另外核验的官方发行源码，不能回填旧包来源。

每个构建记录 SDK、源码树、配方、构建器、补丁、依赖与产物摘要；保存上游源码归档、实际补丁字节、配方、工具链锁、许可证和构建器文件。旧失败作业保留，不能把后来的输入补写到旧回执。

## 远程受控入口

在构建机源码目录执行，显式传入状态目录：

```sh
node --import tsx scripts/engine-manager.ts list --state /home/wvn/wvn-engines/state
node --import tsx scripts/engine-manager.ts doctor --state /home/wvn/wvn-engines/state --sdk-root /home/wvn/wvn-engines/state/toolchains/emsdk-6.0.10-linux-x64
node --import tsx scripts/engine-manager.ts install --state /home/wvn/wvn-engines/state
node --import tsx scripts/engine-manager.ts build --recipe onsyuri --state /home/wvn/wvn-engines/state --sdk-root /home/wvn/wvn-engines/state/toolchains/emsdk-6.0.10-linux-x64
```

`verify --job <UUID>` 重查真实文件；`compare --job <UUID> --other <UUID>` 要求输入摘要一致并报告字节是否相同。`export --job <UUID> --destination <独立目录>` 核验输入后原子导出，已存在的发布目录永不覆盖。

SDK 安装同样生成持久作业和私有日志。遇到 `.installing` 不自动重试；先检查失败作业，完整安装经 doctor 验证后才能显式 `install --resume`。并发锁残留也要求检查，不自动移除。

`accept --job <UUID> --evidence <验收回执>` 要求精确发布 ID、实际受测版本、完整性、启动、原生存读档、回退、隔离与云端历史检查通过，才进入 `preview_ready`。此状态仅表示对应候选的预览验收，没有生产发布命令。

## 预览与回退

Web 在 Arch 的 `/home/wvn/wg-web-preview-20261024`，正式服务仍为 `/home/wvn/wg-web-production-20261024`。游戏资源与云存档对象仍在 Windows H 盘。本轮不改 Tunnel、DNS、生产 Caddy 或旧游戏资源。

- 主预览：`https://localhost:18551`，需通过现有 SSH/Tailscale 入口访问。
- 私有引擎后台：Arch 回环 `127.0.0.1:18554/manage`，沿用一次性启动令牌与独立管理会话。令牌保存在私有状态目录，不写入本文或公开接口。
- 新 ONS 源码候选：`https://localhost:18555/1194/1/`；其它尚未验证的绑定不因此自动放行。
- 新 RenPy 源码候选：`https://localhost:18557/1286/1/`，独立目录 `/home/wvn/wvn-renpy-source-preview-20261026`；私有只读引擎后台为 Arch 回环 `127.0.0.1:18560/manage`，凭据留在原机。原主预览与 ONS 候选继续保留。

激活前逐文件检查 source manifest；代码与 Web build 保留独立回退副本。回退只恢复代码/配置/绑定，不回灌数据库，不覆盖新产生的存档。临时 QA 浏览器与账号均使用独立身份，账号删除结果保留回执。

验收记录与当前未决项见同目录的 `emscripten-acceptance.md`。启动、原生存读档、云档历史与整部作品可玩性分别记录；不能互相替代。

## RenPy 8.2.1 源码配方

`renpy-8.2.1` 固定官方发行标签对应的 renpy、renpy-build、pygame_sdl2 及 AOM/libyuv/libavif 提交。`engines/locks/renpy-8.2.1-inputs.json` 记录六份源码、23 份上游归档和 22 个 Python 构建依赖。完整新产物组为 `renpy-pre.js`、`renpy.js`、`renpy.wasm`、`renpy.data`；禁止用旧 data 补新 JS/WASM。

独立 SDK 为 Emscripten 3.1.24。宿主 Python 3.11 在作业私有引导目录编译，安装到独立、只读、经摘要核验的共享工具缓存；各次引擎构建使用新的源码与输出目录。pip 只安装核验后的离线输入；上游全局 prepare、浮动 Git/pip 和 SDK 激活步骤由捕获的适配器替代。适配器及宿主工具模块的实际字节一起导出，构建明确标记 `official=false`。

```sh
node --import tsx scripts/engine-manager.ts doctor --sdk emsdk-3.1.24-linux-x64 --sdk-root /home/wvn/wvn-engines/state/toolchains/emsdk-3.1.24-linux-x64
node --import tsx scripts/engine-manager.ts build --recipe renpy-8.2.1 --state /home/wvn/wvn-engines/state --sdk-root /home/wvn/wvn-engines/state/toolchains/emsdk-3.1.24-linux-x64
```

构建与兼容验收是独立阶段。新 RenPy 候选只对明确选中的版本生效，四件套请求全部指向同一不可变发布，缺件不回退旧文件；未知兼容存档存入 releaseId 对应的独立数据库，候选云同步关闭。实际构建、字节复现和原生读档结果见验收回执，不能由配方登记成功推断。

此配方未包含 Cubism 输入，首版源码构建明确关闭可选 Live2D 模块；不据此放行依赖 Live2D 的作品。宿主工具缓存准备后保持只读，Emscripten 使用 Python `-E` 时也不能向缓存补写未核验字节码。

两次干净构建已完成；JS、pre-JS、data 一致，WASM 尚未达到逐字节复现。第一组仅对 eden* 版本完成预览验收并进入 `preview_ready`，第二组仅为 `artifact_verified`。完整证据、边界与回退说明见 [RenPy 源码验收记录](renpy-source-acceptance.md)。
