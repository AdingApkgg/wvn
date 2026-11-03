# CAS 域名对齐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking. 沿用当前会话的直接实施与独立审阅方式；用户已授权实施、远程验证及更新预览，暂不部署生产。

**Goal:** 客户端、服务端、CSP、资源元数据与预览统一使用线上 `https://wvn-s3-zi0.saop.cc/{sha256}.bin`。

**Architecture:** 保持已有浏览器CAS直连，只替换固定可信域名。预览只读获取公开清单并严格校验新域名，返回原清单；取消旧域名回写，不保留旧域名运行时兼容。

**Tech Stack:** 既有 TypeScript、Hono、浏览器播放器模块、PostgreSQL、Playwright；不增加依赖。

**Spec:** 本轮用户指令，以及 `docs/superpowers/specs/2026-11-04-nsfw-eligibility-design.md` 的CAS与权限边界。

## 约束与审阅重点

- 不提交、推送、合并、部署生产；不调用Cloudflare/DNS/Worker配置接口，不改数据库映射或资源正文。
- 保留当前未提交的NSFW实现；旧验收历史、已停用Worker及其历史来源校验不改写为新域名。
- 正式运行模块及当前验证工具拒绝旧域名、混合来源、附加查询和不匹配SHA；CSP仅允许当前资源域。
- 服务端资源地址、浏览器解析、ONS资源缓存、所有引擎启动路径及声明类型必须一致。
- 预览清单按原始响应返回；资源、引擎及ONS文件引用都需严格校验，不以改写掩盖不一致。
- NSFW开关、资格、暂停/恢复、保存退出及媒体分类继续有效。

## Task 1：固定契约与失败回归

- [x] 修改 `tests/cas-browser-client.test.mjs`、`tests/cas-manifest.test.ts`、资源API及版本资源测试的新域名契约；增加旧域名拒绝。
- [x] 修改 `tests/content-preview.test.ts`：新域名清单原样返回，旧域名/混合资源与ONS引用拒绝。
- [x] 远程持久化运行CAS定向测试，记录实际RED。

## Task 2：实现并检查全部活跃入口

- [x] 对齐 `src/resources/types.ts`、`src/player/cas-manifest.server.ts`、`src/player/http.server.ts`、`public/player/*`、`public/ons/*` 的固定域名及声明。
- [x] 简化 `src/content/preview-manifests.server.ts` 为严格校验后原样返回；更新验证工具、当前CORS模板与活跃文档。
- [x] 更新相关测试夹具及浏览器实际请求断言；远程定向GREEN。

## Task 3：远程验收与预览

- [x] 远程整套TS/mjs回归、类型检查与构建完成；浏览器期间固定构建产物。
- [x] 核对并重启仅本任务预览，完成16项浏览器、真实新域名CAS Range以及355安全/25受限媒体检查。
- [x] 独立审阅CAS差异并修复重要问题；写入域名对齐验收记录，保留预览及工作区。

## 验收中发现的交互修复

裁定：将真实ONS启动与本机保存退出加入本轮补验。实际引擎会聚焦沙箱，原有协议夹具没有覆盖这一交互；补验两次稳定复现工具栏按钮的 mousedown 之后，父窗口 focus 触发先遮挡复查，导致按钮消失、click 未到达。保留全局权限复查，在当前页面仍持有 iframe 焦点时取消工具栏鼠标按下的默认聚焦；业务操作继续由 click 执行，不放宽权限，不提前退出。错误实现可能导致真实返回窗口时未遮挡，因此严格限定 document.hasFocus()、activeElement 为当前 iframe、主键和可见页面，保留键盘原生行为。本轮只以真实鼠标点击验证这次回归，不声称完成键盘从沙箱返回工具栏的验收。
