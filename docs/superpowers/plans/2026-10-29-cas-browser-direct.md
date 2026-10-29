# 无 Worker 浏览器 CAS 直连实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浏览器从数据库 API 获得 SHA256.bin URL 并直接加载；CF 只缓存，验收后清理已核验旧版本。
**Architecture:** PG 已发布版本清单经 API 进入现有父页面/opaque iframe 通道；客户端保持逻辑路径，在网络发出前解析为哈希 URL，覆盖引擎和 DOM/CSS 自动加载。服务端不转发资源正文，删除 CF Worker 路由。
**Tech Stack:** Hono/PostgreSQL/Redis、现有 React 播放器、浏览器原生加载接口、Cloudflare CDN、B2/S3、远程 Chromium。
**Spec:** `docs/superpowers/specs/2026-10-29-cas-browser-direct-design.md`

## Global Constraints

- 用户已选择无 Worker；不得引入 CF Worker、Service Worker、新代理或边缘业务计算，改变边界须先讨论。
- 域名固定 wg-b2.saop.cc；资源URL根级完整64位小写SHA256.bin；PG只返回已发布当前版本与已登记引擎/媒体的映射。
- 主站只处理元数据、可信启动HTML、账号存档控制；资源正文由浏览器直连，不允许旧路径、302或旧对象回退掩盖遗漏。
- 原始B2字节、存档身份/版本/云端协议保持；opaque sandbox不加allow-same-origin，浏览器对B2不发送账号凭据。
- Mac只编辑/轻量单文件测试；安装、全套验证、类型检查、构建、浏览器在远程持久任务执行并记录日志/退出码，遵守已有代理。
- 生产、CF配置、实际删除只由主流程执行；已授权验收后清理，未完成门槛前不能删除。未知数据、CAS变化或保护拒绝停止核对。
- 使用现有工作树，不推送远端；每项实现原子提交并独立审查。已有计划/脚本只复用明确接口，不重新开展已完成PG迁移。

## Review Focus

- 初始HTML与动态DOM、CSS url/@import、JS/WASM相对请求必须在网络前解析，不能只拦fetch。
- 中文、空格、#、%、转义CSS路径、相对..与跨作品引用边界；类型/URL/哈希矛盾拒绝。
- 大包Range、取消/失败、原生事件/Promise兼容，Blob派生CSS生命周期与递归/循环边界。
- 每份API只包含已发布本作与已登记依赖；过期缓存不绕过撤销发布；最大49118条当前数据有有限大小与压缩。
- 实网必须无Worker路由、无虚拟CDN旧路径、无主站正文、保留原生保存/重进；不以测试拦截假装直接加载。

### Task 1: PG 资源启动清单 API

**Files:** Create `src/player/cas-manifest.server.ts`, focused `tests/cas-manifest.test.ts`; modify resource/version interfaces only if required and add docs `docs/cas-browser-direct.md`.
**Interfaces:** Produce `GET /api/player/:id/resources` with optional registered `engine` release query. Response `{schema:1,delivery:'cas',pilot,versionId,inventorySha256,resourceOrigin,resources:[{path,key,url,sha256,bytes,contentType}],engineResources:{id,files:[same]},ons?:{legacyONSManifestWithHashURLs}}`. Accept existing ControlBundle to preserve audited ONS file/lazy metadata and media substitution mapping; use existing VersionResources and ResourceRepository, no resource body fetch.

- [ ] Write and remotely run meaningful RED tests for registered/published bindings, wrong-version/unpublished, engine selection, media alias, ONS paths, malformed query and DB failure.
- [ ] Implement complete current-game metadata map, gzip/HEAD and bounded response; validate literal SHA URL and MIME/size; no old fallback, no private data or credentials in errors. Preserve existing resource endpoints.
- [ ] Verify current scope and mixed Unicode paths; run covering tests and typecheck remotely as needed, self-review, atomic commit and exact interface report for Task2. Do not deploy.

### Task 2: 播放器直连与严格网络验收驱动

**Files:** Modify `accounts-server.ts`, `src/player/b2.server.ts`, `src/player/http.server.ts`, `src/player/modules.server.ts`, `src/ons/player.tsx`, `public/player/resource-location.*`, `public/player/runtime.mjs`, `public/player/emscripten.mjs`, `public/ons/runtime.js`, `public/ons/resource-cache.*` as needed; create focused client URL/DOM/CSS modules and regressions; update `ops/b2/verify-browser.mjs` and docs.
**Interfaces:** Consume Task1 manifest verbatim; parent fetches metadata with omit credentials and sends through current nonce-bound port. Hash URLs are used before actual network: fetch/XHR, Module.locateFile, static and inserted DOM attributes, inline CSS and linked/imported CSS. Keep logical in-game paths and saves. ONS uses manifest hash URLs. Old resource redirects unavailable in CAS mode. Bootstrap CSP/module allowlist must match actual registered files.

- [ ] Inspect real engine/browser paths, add failing tests for URL validation, native request/DOM/CSS mapping, CSS comments/quotes/escapes/import cycles, initial subresource inertness, media aliases and no legacy fallback.
- [ ] Implement smallest common resolver with bounded parsed manifest and origin/path validation; no Service Worker, hidden server body proxy, new storage namespace or resource reupload. Preserve native events, Range and cancellation, sandbox/save behavior.
- [ ] Adapt parent, ONS cache and all four engine families; API supplies all actual URLs, client does not invent object keys from file extensions or derive directory URLs from hashes.
- [ ] Change browser driver to reject every non-hash CDN body URL and main-site body, independently verify expected metadata SHA/identity; no interception/rewrite for pass criteria. Keep native story/frame/saveexit/reentry.
- [ ] Run covering RED/GREEN, full TS/MJS/typecheck/build in persistent remote tasks, self-review and atomic commits. Report static build files/deployment inputs; no production/CF/deletes.

### Task 3: 无 Worker 部署验收与精确版本清理

**Files:** Operational scripts/reports under ignored `reports/cas-browser-direct-20261029/`; update `docs/cas-browser-direct.md` and final acceptance record.
**Interfaces:** Reviewed code/build, final manifest schema, existing B2 immutable plan and exact-version executor. Produces same-artifact remote preview/prod proof, no-Worker routing proof, acceptance receipt bound to actual API/client/CF state and final deletion audit.

- [ ] Inspect baseline and archive actual production code/config/routes. Create isolated remote preview with synthetic account/blob data and read-only public resource snapshot; never point a frozen account clone at production blobs.
- [ ] Audit bare SHA.bin MIME/CORS/Range/cache and metadata for all79 versions plus engines/media; run actual ONS2/Artemis/Tyrano/RenPy without game-request interception, inspect and retain evidence.
- [ ] Deploy verified artifact to production and remove all this-project Worker routes for wg-b2.saop.cc; preserve unrelated rules/services. Verify live modules/route absence, then full public native/HTTP acceptance. No rollback to Worker without discussion.
- [ ] Only after accepted, refresh whole-version/target comparison, bind receipt to exact plan and actual no-Worker deployment; delete10 verified old versions, reconcile, then resume bounded exact-version bulk cleanup. Stop on unknown/changed/protected data.
- [ ] Re-list all surviving versions, verify full CAS and mapping preservation, repeat native/HTTP checks, document actual counts/bytes and risks. Complete final independent review; no completion claim from started jobs.
