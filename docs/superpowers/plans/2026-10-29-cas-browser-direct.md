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

### Task 4: 实际对象 MIME 与原始类型分离（用户明确追加确认）

**依赖顺序：** Task2复审通过后实施，Task3真实验收与发布前完成。用户明确选择“API采用实际MIME，原始值留库”；只改PG公开元数据投影，不修改B2对象、字节、版本ID或源记录。
**Files:** `src/resources/schema.ts`, `src/resources/repository.ts`, `src/resources/cache.ts`, `src/platform/version-resources.server.ts`；新增小型物理HTTP元数据校验/导入模块、CLI与聚焦测试；更新公开说明。
**Interfaces:** 不修改既有003迁移；新增幂等迁移，为 `wvn_resource_objects` 增加可空 `http_content_type` 与 `http_metadata_proof_sha256`，成对为空或MIME合法且proof为64小写hex；原 `wvn_resources.content_type` 与所有key/SHA/bytes/源目标ID/created_at保持。所有公开资源投影的contentType采用对象实际类型优先、原记录类型兜底（含按key/原路径/namespace清单/版本清单/播放器引擎媒体），URL不变。Redis必须拒绝读取旧格式MIME缓存，包含显式prefix的配置，不靠等待TTL。
**Proof contract:** schema1/bucket=`web-visual-novel`/namespace=`b2/web-visual-novel/snapshot-20261028`/inventorySha256=`fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01`/objects数组，每行 `{sha256,bytes,contentType,versionId}`。objects允许本次22个选定哈希的子集证明；只补写所列对象，其他未选对象保持原值，不要求取得整个namespace百万对象的HTTP证明。所列每个SHA在当前namespace的全部引用均须核对其bytes与target_file_id，未引用或未知的证明对象拒绝。主流程从冻结精确B2版本读取实际元数据并绑定完整文件SHA，22组证明准备中；实现者只写代码/合成测试，不访问B2或生产。校验必须存在已发布匹配快照，SHA唯一、对象大小及版本ID与当前namespace所有对应原始记录一致，无未引用/未知对象，MIME合法；禁止只凭输入覆盖任意对象。默认dry-run无DB写入，显式apply经同一验证后事务写入；可重复同一证明，冲突拒绝；CLI要求expected proof SHA与显式schema/namespace/inventory，无密钥或连接串输出。

- [ ] 写并远程运行先RED后GREEN：canonical MIME覆盖但原值不变、全部查询面一致、旧缓存无效、proof错SHA/重复/未知/不匹配bytes或version/未发布/冲突不写入、dryrun零写与apply幂等。
- [ ] 实现最小PG字段和元数据导入；不增加服务/对象命名空间/每次API回源探测，不修改冻结SQLite或原始metadata。
- [ ] 远程聚焦PG/Redis/CLI/API测试与必要类型检查/构建；原子提交、报告task-4-report.md含确切CLI/输入格式/摘要/验证输出。主流程独审后才在隔离PG演练，生产写入仍需演练比对后执行。

### Task 5: 无 Worker 清理凭据与已证实重复 CAS 保留

**依赖顺序：** Task4后实施，可与Task3只读验收协调，真实删除依旧最后。完整补充要求见本计划同名SDD workspace `cleanup-addendum.md`，分派前复制完整内容入task-5-brief，使唯一brief自足。
**Files:** `scripts/migration/b2-cas-cleanup.py`, `tests/b2_cas_cleanup_test.py` 和公开说明。
**Boundary:** 只改验收门槛与计划构建，保留精确Key+VersionId删除、同计划/检查点双互斥、pending恢复、失败停机及不删CAS。旧Worker回执拒绝；新的浏览器直连回执及保留CAS重复证明须绑定不可变plan/inventory/frozen/enrichment。只有主流程真实生产验收后签发accepted回执。实现者不部署、不读密钥、不调用真实删除。

- [ ] TDD补充无Worker回执与证明真实性/完整性/重复/冲突拒绝；运行同一Python测试文件并保留原23项保护。
- [ ] 最小实现用户已授权方案所需适配，原子提交、独立审查；报告task-5-report.md给出新enrichment/receipt合同，主流程才重建新0400计划。
