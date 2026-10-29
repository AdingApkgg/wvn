# 游戏 CAS 加载与旧对象清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** 让游戏 CDN 实际只读取 SHA-256 `.bin`，在验收后按确切版本清理已迁移旧对象。
**Architecture:** 保留虚拟游戏 URL；PG API 查询原路径，Worker 验证映射并读取固定 B2 CAS。清理使用可审计、可恢复的精确版本清单，始终受验收门槛控制。
**Tech Stack:** Hono / PostgreSQL / Redis、Cloudflare Worker Cache API、Python B2/S3、远程 Chromium。
**Spec:** `docs/superpowers/specs/2026-10-29-cas-delivery-design.md`

## Global Constraints

- 人类文档、提示与报告用中文；不得输出或转存到新机器任何已有密钥。
- 本机禁止安装依赖、构建、全量测试、浏览器；使用远程构建机，长任务使用独立 tmux/系统任务并记录日志及退出码。
- 公共桶固定 `web-visual-novel`，namespace 固定 `b2/web-visual-novel/snapshot-20261028`；目标格式为根级完整小写 SHA-256 加 `.bin`。
- 只从已发布 PG 快照查映射；Worker 只访问固定 API/B2 源，不转发 Cookie/Authorization，不回退原对象。
- 保留游戏相对 URL、MIME、opaque sandbox、CORS/CORP、Range 与流式行为。
- 生产发布和实际删除由主流程执行。用户已授权验收后清理；任何删除前必须完成设计所列门槛，且仅按明确版本 ID 处理已核验清单。
- 原 SQLite、PG 索引、私有正文、账号与账本不属于删除范围。

## Review Focus

- 同字节不同 MIME、HTML 隔离、中文/空格/#/% 路径仍查到正确对象。
- 元数据失效/伪造 URL/字节数/MIME、API 故障不能读取旧对象或缓存错误映射。
- 缓存命中和未命中下的 HEAD/Range/If-Range/304、大对象断流保持协议语义。
- B2 多版本、清单外新对象和删除部分成功/网络不确定状态不能造成漏审或误删。
- 已缓存旧正文不能掩盖新 CAS 读取；真实浏览器确认实际 CAS key、画面/正文与退出重进。

### Task 1: PG 原路径查询与 CDN CAS 读取

**Files:** Modify `src/resources/http.ts`, `ops/b2/cdn-worker.mjs`; Test `tests/resource-api.test.ts`, `tests/b2-cdn-worker.test.mjs`; docs `docs/resource-api.md`.
**Interfaces:** Consumes `ResourceRepository.findByOriginalPath(namespace,path)` published-only lookup. Produces `GET /api/resources/by-path?namespace&path` with the unchanged public resource response; `handleB2Asset` keeps injectable cache/fetcher. Diagnostic headers provide physical CAS key plus original key. HTTP exact names must be documented in report for acceptance task.

- [ ] Add failing API tests for published/unpublished/missing paths, duplicate/unknown query values, Unicode paths and DB failure; run remote and inspect expected failures.
- [ ] Implement route before UUID catch-all; reject malformed query, reuse repository, preserve existing APIs.
- [ ] Add failing Worker tests proving captured B2 URL ends with literal expected SHA `.bin`, not old name; add cached/uncached mapping errors, MIME, HEAD/Range/If-Range/304 and bounded-stream behavior.
- [ ] Implement fixed-origin validated metadata lookup and new cache keys; keep relative paths, streaming and isolation. Never silently fall back to old names. Add metadata cache/lookup deadlines and response-size bounds. Validate namespace, resource UUID, 64-hex SHA, URL equality, safe bytes and MIME before using/caching metadata.
- [ ] Run affected tests, then full TS/MJS suite/typecheck/build remotely; self-review and atomic commit(s). Record exact commands and results; production untouched.

### Task 2: 精确版本清理审计与执行器

**Files:** Create `scripts/migration/b2-cas-cleanup.py`, `tests/b2_cas_cleanup_test.py`, `docs/b2-cas-cleanup.md`.
**Interfaces:** Consumes frozen `/root/wvn-b2-cas-20261028/data/resources.sqlite` and fixed bucket; produces a private immutable plan/receipt with count/bytes/digests, current version identities and CAS verification. Default is dry-run; actual apply additionally requires a verified acceptance receipt bound to Worker/API revisions, same namespace/inventory and plan digest. Exact CLI/report schema must be documented.

- [ ] Read actual source schema and official B2/S3 multi-object delete/version semantics. Inspect current versions read-only; record unknown versions separately, never infer they are disposable.
- [ ] Write failing tests for rejecting CAS keys, filename/version mismatch, changed/unknown source, missing or mismatched CAS, bad acceptance digest, partial delete responses and ambiguous request failure.
- [ ] Implement bounded-memory plan construction and version-specific delete batches with resumable checkpoints, safe retries/reconciliation, redacted errors. Do not use bare-key deletion, delete markers, lifecycle changes or erase mapping records.
- [ ] Test using local fake HTTP boundary plus one actual read-only inventory run; do not delete or publish. Commit and report review-ready plan and execution command.

### Task 3: 部署、真实游戏验收与受控清理

**Files:** Operational scripts/reports under ignored `reports/cas-delivery-20261029/`; update `ops/b2/verify-browser.mjs` to capture CAS provenance; docs `docs/cas-delivery-acceptance-20261029.md`.
**Interfaces:** Consumes reviewed Tasks 1/2 revisions, immutable mapping/plan digest. Produces acceptance receipt bound to deployed code, cold-cache provenance, deletion audit and final inventory.

- [ ] Save actual production API/Worker/config baseline; deploy API compatibility addition, use isolated canary Worker with real mapping and new cache namespace.
- [ ] Validate full plan targets, all 79 game prefixes plus engine/media HTTP MIME/Range; run real ONS/Artemis/Tyrano/RenPy cold-start, native story/frame, save-exit and reentry through canary, then production.
- [ ] Review evidence and publish a machine-readable acceptance receipt only when all gates pass. Before then no actual deletion is permitted.
- [ ] With the existing user authorization, perform a small exact-version deletion batch and reconcile; continue resumably only on matched results. Leave unknown/unmapped objects intact and report any blocking case.
- [ ] Re-list bucket, verify surviving CAS/indices, repeat production browser/HTTP checks, record actual removed/remaining versions and bytes, update runbook. Do not claim completion from a started job.
