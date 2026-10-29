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
