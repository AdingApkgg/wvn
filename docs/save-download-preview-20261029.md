# ATRI 存档与 B2 下载预览验收

范围：独立 Debian 预览 `https://localhost-1.tailac9c6f.ts.net:19481`。生产发布、Cloudflare 配置、B2 对象和现有账号存档均不在本次写入范围内。

## 存档超时的原因

原验收把菜单 `No.003` 直接当成文件名 `save0003.dat`。实际追踪显示，本轮原生保存写入 `save0002.dat/png`，父页已完整保留，刷新后摘要一致。`FS.syncfs` 回调约 9–15 毫秒。不能把等待错误文件名的 15 秒超时当成落盘失败，也不能由此改动原生编号或迁移旧档。

新验收记录引擎真正写入的路径，并验证它进入持久快照、页面刷新后内容一致、重开游戏后通过原生 LOAD 再次读取。菜单为了展示缩略图也会打开绝对路径的存档，因此额外检查原生实际读档时使用的相对路径，避免只打开菜单就误报读档成功。原有槽位的字节和 mtime 必须保持。

## 下载修复

- 仅对已核准的公开 B2 资源启用有限重试。瞬时 408/429/5xx、响应头失败、正文中断和闲置超时不再要求从头打开游戏。
- 已接收部分正文时，使用匿名单范围 Range 续传；必须核对同一强 ETag、起点、终点和对象总长。错误范围、对象变化或不支持范围时失败，绝不拼接不同内容。
- 不发送会触发跨域预检的 If-Range；在接受续传正文前校验响应 ETag。续传绕过浏览器完整响应缓存。
- 默认闲置上限 30 秒、总时限 30 分钟、最多重试 3 次；用户取消会停止当前网络读取和后续重试。
- ATRI 的 `root.pfs` 已登记 SHA-256，先通过可恢复读取器取得并核验，再交给原生 `getPreloadedPackage`。避免原生 XHR 下载失败后只记录日志、永久等待包依赖。
- 旧版异步二进制 XHR 保留原生事件与响应类型；临时错误有限重试，正常取消保持原语义。恢复监听必须早于游戏的 `onload/onerror` 注册。
- Artemis 的旧 `wget_data` 会反复读取相同字体/图片。本次沙箱内以有限内存复用公开字节并合并并发读取；每次给引擎独立副本。最多 64 MiB、单项 32 MiB、256 项，退出游戏后释放，不缓存保存目录。单项上限覆盖实际 16,998,496 字节的粗体字体。
- ONS 既有独立资源缓存复用相同的可恢复读取器；完整读取和校验后才写入缓存。存档数据库和格式不变。

同一公开模块白名单加入新下载模块，并修复它遮蔽既有 `room-client.mjs`、导致 404 的问题；已有平台集成用例覆盖该路径。

原始 Chromium 和 curl 对同一 13,653,025 字节对象均测到约 3 秒；也观察到个别请求收头后停等。不能把某次高速测速推广为所有网络均高速，也不能用禁用 HTTP/2 的浏览器参数代替产品修复。

## 可重复验收

远程任务根目录：`/home/i/wvn-save-download-preview-20261029`。各任务有独立 tmux 会话和 `jobs/<任务>/`，包含开始时间、PID、日志和退出码。任务只使用本轮新建的 PostgreSQL/Redis/Meilisearch、私有测试配置及合成存档。

运行前提供：

```sh
export WG_QA_BASE_URL=https://localhost-1.tailac9c6f.ts.net:19481
export WG_QA_TLS_CERT=/path/to/isolated-preview.crt
export WG_QA_RESULTS_ROOT=/path/to/isolated-results
export WG_ATRI_FIXTURE=/path/to/synthetic-artemis-files.json
node scripts/verify-resource-download-preview.mjs
node scripts/verify-save-download-preview.mjs
node scripts/verify-download-engine-preview.mjs
```

脚本固定拒绝生产 URL。Chromium 在远程运行，浏览器仅信任本轮证书的公钥；不修改系统信任或用户浏览器档案。

机器结果字段说明：`fault` 表示浏览器故意切断一次实际 B2 下载及随后发生的续传；`actualNativeSave` 是跟踪到的实际槽位文件；`durableExact` 表示刷新前后快照一致；`nativeNewSlotRead` 表示重开后实际读到新槽；`binaryCache` 是本次沙箱公开资源复用统计；`mainObjectBodies` 必须为空，证明应用服务器没有中转对象正文。任何一个状态未通过都不得称为验收完成。

## 最终结果

- 182 项 MJS、243 项数据库/API 测试、构建与类型检查全部通过。
- 真实浏览器 XHR 临时错误、闲置超时、重试上限和主动取消通过。
- ATRI 两轮完整流程均通过：故意切断实际 B2 下载后恢复，读旧档，保存，退出刷新，重开并原生读取新槽。旧槽位的字节与 mtime 保留。
- 加入复用的一轮记录 27 次命中，三种字体在两次启动/读档流程中的请求从各 4 次降至各 2 次。此完整流程采用更严格的单项 16 MiB 预算。
- 最后把单项预算提高至 32 MiB，覆盖实际 16,998,496 字节的粗体字体：真实对象仅下载一次，复读约 4.73 ms，副本 SHA-256 与已发布资源 API 一致；另有真实大小、副本隔离及 LRU 预算单测。
- 最终代码上的 CLANNAD（ONS）、Tyrano 和 RenPy 代表样本加载、保存退出、沙箱隔离通过，应用服务器对象正文数均为 0。该抽查不等于全部版本逐剧情通关。
- 预览实际提供的公开驱动与本地源码摘要一致；生产三个驱动与本轮开始一致、服务 PID 及启动时间未变。

证据汇总位于本地 `reports/save-download-fix-20261029/acceptance-summary.json` 和 `acceptance-report.md`。远程最终任务为 `jobs/validation-r4`、`jobs/browser-r4`、`jobs/final-browser-r2`，退出码均为 0。完整存读档流程没有真实用户账号或存档参与。
