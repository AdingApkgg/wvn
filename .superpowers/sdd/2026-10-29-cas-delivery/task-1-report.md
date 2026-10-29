# Task 1 实现报告

## 范围与行为

仅修改 brief 指定的 `src/resources/http.ts`、`ops/b2/cdn-worker.mjs`、两项测试和 `docs/resource-api.md`，另附本报告。无生产发布、Cloudflare/B2 修改或对象删除；未操作 `resource_full_20261029` 全量 schema。

新增 `GET /api/resources/by-path` 放在 UUID 路由之前，严格只接受各一次的 namespace/path，复用 `findByOriginalPath` 的已发布 PG 查询；保持原 UUID/manifest/resolve 合同。400/404/503 不泄露数据库信息。

Worker 固定命名空间 `b2/web-visual-novel/snapshot-20261028`，固定元数据源 `https://wg.saop.cc/api/resources/by-path`，固定 B2 源 `https://f003.backblazeb2.com/file/web-visual-novel`。保持原虚拟路径与相对引用，实际 B2 URL 只由已验证的小写完整 SHA 生成，以字面 `{sha256}.bin` 结束，绝不回退旧路径。

元数据在读取及缓存命中时验证 UUID v4、64 位小写摘要、公开 URL 与摘要完全相等、安全非负整数 bytes 和合法 MIME；请求不带浏览器凭据，manual 重定向并拒绝非200/404。元数据限 8192 字节；网络与元数据正文共用独立 5 秒期限；元数据缓存正文也有 5 秒期限。已验证映射缓存一天，404/错误不缓存。正文键采用 `wvn-cdn-v=3&sha256=...`，元数据键采用 `wvn-metadata-v=1`，不会命中旧正文绕过映射。

保留 32 MiB 小对象完整缓存填充与最多三次断流重试；流式 Transform 校验实际长度不超过声明与上限、结束长度相等。每次正文读取/缓存填充期限 30 秒；大对象、未知长度、Range 在收到头后直接流式响应，不设总下载期限。GET/HEAD、上游206/304、缓存 If-None-Match/If-Modified-Since、If-Range 验证器均保留；If-Range 不匹配返回完整缓存对象，匹配后由 Cache API 返回部分内容，不支持部分内容的缓存实现交回 B2。HTML 保持 octet-stream/no-transform；脚本/WASM 扩展名 MIME、其余映射 MIME，CORS/CORP/nosniff 不变。

## 验收诊断头（确切字段）

- `X-WVN-B2-Key`: 实际物理 `{64位小写sha256}.bin`。
- `X-WVN-Original-Key`: 完整原路径（含 `releases/20261027-01/`）经 `encodeURIComponent` 编码；验收时 decodeURIComponent。
- `X-WVN-Resource-Source`: `b2`。
- `X-WVN-CDN-Cache`: 正常正文 `HIT` 或 `MISS`，B2读取错误 `ERROR`。
- `Access-Control-Expose-Headers` 包含以上四项及原有长度/Range/ETag/B2 SHA1。

## TDD 与远程验证

执行主机通过 remote.py 的 hostname guard 确认为 `localhost`；源码 `/home/i/wvn-platform-20261029/source`。所有任务由已存在执行器在同名独立 tmux 会话持久执行，目录 `/home/i/.local/state/ai-jobs/<ID>/`，记录开始/结束及退出码。使用既有私有环境和代理，未输出环境值。第一次沙箱内 SSH 255，提权后在同一主机检查并运行原 ID，没有盲目复制任务。

1. RED：`wvn-platform-20261029-cas-task1-red`，2026-10-29 02:30:20–02:30:22 UTC，退出 1。先补 API 查询及实际 SHA.bin/错误映射测试，未写实现时运行 `./node_modules/.bin/tsx --test --test-concurrency=1 tests/resource-api.test.ts`、`node --test tests/b2-cdn-worker.test.mjs`。末行 `RED api=1 worker=1`；Worker 7通过/4失败，明确观察旧 releases URL 与预期 SHA.bin 不符。
2. GREEN1：`wvn-platform-20261029-cas-task1-green1`，02:31:40–02:31:41 UTC，退出 0；同上两项命令，API 7/7、Worker 11/11。
3. GREEN2：`wvn-platform-20261029-cas-task1-green2`，02:32:37–02:32:38 UTC，退出 0；API 7/7、Worker 15/15；增加缓存错误映射、304/If-Range/Range、Unicode/MIME、未知长度流等覆盖。
4. 边界补测：`wvn-platform-20261029-cas-task1-boundaries`，02:34:22–02:34:28 UTC，退出 0；`node --test tests/b2-cdn-worker.test.mjs`，Worker 17/17；实际证明元数据正文5秒期限与谎报小长度的重试边界。新增后两项测试为实现后补充，并非先 RED。
5. 提交前全套：`wvn-platform-20261029-cas-task1-full`，02:33:33 UTC 启动，依次执行 `./node_modules/.bin/tsx --test --test-concurrency=1 tests/*.test.ts`、`node --test tests/*.test.mjs`、`npm run typecheck`、`npm run build`，各一次。02:36:13 UTC 完成，退出 0，末行 `FINAL ts=0 mjs=0 typecheck=0 build=0`；TS 243/243，MJS 141/141，类型检查通过，构建成功（server index.js 391.76 kB）。日志分别 `full-ts.log`/`full-mjs.log`/`typecheck.log`/`build.log`。完整 MJS 使用上传后的最终17项 Worker测试。

## 自查、提交与风险

`git diff --check` 通过。实现提交在下方记录。

代码/模拟协议测试不代表 Cloudflare Cache API 实网验收或真实浏览器启动；仍须按后续任务完成 79 版本/固定引擎路径及浏览器验收。映射边缘缓存最长一天，撤销发布需同步清理相应元数据缓存。此实现未发布，生产仍保持原状。

本轮未将 PG bytes 与 B2 200/HEAD Content-Length 或 206 Content-Range 总长做额外一致性门禁；只校验元数据 bytes 的安全范围与小对象填充实际长度/声明长度一致。后续只读 HTTP 验收仍须对齐冻结 PG 长度。

实现提交：`12dd875`（`feat(resources): serve game assets through published CAS mappings`），基于 `34c4964`。本报告另作独立文档提交；未推送远程。

## 复审修复第 1 轮

已逐字读取 `task-1-review.md`，接受其中 2项P1、2项P2；以下记录取代前文“未将 PG bytes 与 B2 长度对齐”的实现边界。

- HTML/脚本扩展名和 HTML 隔离统一使用经过验证、解码后的规范原路径。`index%2Ehtml`、`index.%68tml`、`index.ht%6Dl` 的 `text/html` 映射仍返回 `application/octet-stream`，保持 nosniff/no-transform。诊断原路径直接编码规范路径，避免二次解码。
- 200/HEAD 的 Content-Length 必须与已发布 PG bytes 一致；完整缓存命中也必须拥有匹配的长度。206 必须有可解析的单范围，起止/总长都是安全整数，起止合法、末尾小于总长、总长等于 PG bytes，Content-Length（如有）必须等于范围长度。矛盾不写成功缓存，返回502；HEAD 缺失完整长度也拒绝。
- GET 的完整/部分/缓存正文均使用 TransformStream 累计实际字节，超过预期立即终止，结束短流报错。未知长度和大对象不完整缓冲，不以 PG bytes 为借口强行进入小对象填充；已经发送流式头后才发现长度错误时，终止流而不声称可以撤回200头。同长度损坏仍需 SHA/已有对象完整性验收，长度门禁不替代摘要验证。继续使用 Accept-Encoding identity，未改变原有下载压缩协商。
- 元数据完整阶段由一个5秒期限包围：Cache match、命中正文读取、网络/JSON、Cache put 共用该期限；超时中止网络信号并返回502，缓存写失败同样失败关闭，不在写入挂起时继续交付。
- HEAD 在任何缓存/上游路径均删除 Range 和 If-Range；返回完整表示的状态/长度，不产生部分206。

所有验证继续使用同一专用构建机 `localhost`、已有持久执行器和独立任务目录 `/home/i/.local/state/ai-jobs/<ID>/`，没有生产/CF/B2操作或删除。

| 阶段 | 持久任务 ID | UTC 开始–结束 | 命令 | 结果 |
| --- | --- | --- | --- | --- |
| RED | `wvn-platform-20261029-cas-task1-fix1-red` | 02:46:07–02:46:19 | `node --test tests/b2-cdn-worker.test.mjs` | exit 1；`tests 22 / pass 17 / fail 5` |
| GREEN | `wvn-platform-20261029-cas-task1-fix1-green` | 02:47:33–02:47:46 | `./node_modules/.bin/tsx --test --test-concurrency=1 tests/resource-api.test.ts && node --test tests/b2-cdn-worker.test.mjs` | exit 0；API 7/7；Worker 22/22 |
| 最终补充计数正反例 | `wvn-platform-20261029-cas-task1-fix1-final` | 02:48:46–02:49:00 | 同 GREEN | exit 0；API `tests 7 / pass 7 / fail 0`；Worker `tests 23 / pass 23 / fail 0` |

RED 输出明确包含：编码HTML `actual text/html` / `expected application/octet-stream`；错误长度 `200 !== 502`；未知长度流 `Missing expected rejection`；HEAD 上游仍有 `bytes=0-0`；缓存挂起 `metadata stage must finish`。五个具名回归均先失败再修实现。GREEN 期限回归同时注入挂起 match/put，约5002ms结束；末次新增覆盖缓存实际短流、合法206正例、206长度矛盾及大对象收到头即返回、结束短流失败。

已有合成 fixture 的元数据 bytes 已同步为对应HTML/HEAD/虚拟路径正文的真实长度，不再让合法行为测试依赖不一致的PG元数据。`git diff --check` 通过。遵照本轮要求，仅运行 API/Worker 专项，未重跑先前已通过的全套/类型检查/构建。修复、专项测试、接口文档与本追加报告采用同一个原子提交（标题 `fix(cdn): enforce CAS isolation and delivery bounds`），提交哈希由主代理读取该提交确认。

## 真实边缘修复第 2 轮

基于 `7977d80`，未修改 Task2 清理实现文件。主代理隔离 canary 发现：上游200的 Content-Length 正确，放入 Cache API 后读取长度为 null，完整长度门禁因此返回502。原第1轮普通 TransformStream 虽在Node测试保留手工头，但不符合实际Workers对流长度的处理，属于本轮真实修复对象。

已读取官方 [Response](https://developers.cloudflare.com/workers/runtime-apis/response/) 的 Content-Length 小节和 [FixedLengthStream](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/)：Workers按数据源确定长度，普通流不能靠手工头保留长度，原生定长流可保留长度并拒绝字节数矛盾。实现对拥有已验证Content-Length的GET正文使用 `globalThis.FixedLengthStream(expected)`，源流pipeTo原生writable，readable直接构造Response，并保持其经过result包装时不经过普通转换流。pipeTo错误由readable传递给缓存/客户端，并接收其拒绝避免未处理Promise。Node没有原生API时使用原有计数回退；未知长度仍计数且不伪造Content-Length、不缓冲大对象。HTML、PG长度/206检查、HEAD忽略Range和完整metadata期限全部保持。正文键升级 `wvn-cdn-v=4`，隔离先前v3无长度缓存。

HEAD继续返回无正文、完整Content-Length、无Content-Range；覆盖测试明确断言HEAD不创建定长流，也不消费/生成正文。这两页官方文档没有HEAD专门示例，因此真实边缘序列化后的HEAD长度仍交由主代理canary验收，不能以Node测试替代。

远程仅运行Worker测试，所有任务仍在同一 `localhost` 独立tmux及 `/home/i/.local/state/ai-jobs/<ID>/`：

| 阶段 | 任务ID | UTC开始–结束 | 命令 | 结果 |
| --- | --- | --- | --- | --- |
| 初始RED | `wvn-platform-20261029-cas-task1-fix2-red` | 03:12:30–03:12:42 | `node --test tests/b2-cdn-worker.test.mjs` | exit1；24 tests /23 pass /1 fail；先被v4缓存键断言触发502 |
| 精确原生路径RED | `wvn-platform-20261029-cas-task1-fix2-native-red` | 03:13:07–03:13:07 | `node --test --test-name-pattern='真实边缘回归' tests/b2-cdn-worker.test.mjs` | exit1；1 test /0 pass /1 fail；明确输出 `native fixed-length path must be used for fill and cache delivery` |
| GREEN | `wvn-platform-20261029-cas-task1-fix2-green` | 03:13:55–03:14:06 | `node --test tests/b2-cdn-worker.test.mjs` | exit0；24 tests /24 pass /0 fail |

专项用模拟原生FixedLengthStream捕获构造参数：4字节填充/冷热缓存实际调用定长流且全为4，206实际使用2，未知长度与HEAD不会调用；测试完整消费返回正文，断言v4键。已有23项回归同时通过。此测试证明分支使用与参数正确，不声称模拟Node流能复现Workers缓存序列化；真实canary仍由主代理完成。

`git diff --check`通过。本轮修改Worker、Worker测试、资源文档及本追加报告，同一原子提交，标题 `fix(cdn): preserve native fixed-length streams in edge cache`。未部署、未更改CF/B2、未删除、未操作清理代码或生产游戏。
