# 全站后台与个人主页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一全站管理，提供数字 UID 公开主页和个人资料设置。
**Architecture:** 账号服务验证管理员白名单，共用已有目录和审核业务处理器。新增 PostgreSQL 资料表和公开 UID，公开投影沿用内容资格过滤。
**Tech Stack:** React Router、Hono、PostgreSQL、shadcn/ui、Motion。
**Spec:** docs/superpowers/specs/2026-11-14-dashboard-profiles-design.md

## Global Constraints

- 主页默认关闭，内部 UUID 保持不变；公开 UID 自增且不复用。
- 不增加依赖，不发布生产，不读取私人存档。
- 安装、构建、整库类型检查和浏览器验证只在远程专用机器运行，长任务使用 tmux。
- 沿用 M3 和现有业务修订校验。

## Review Focus

- 老账号注册时间相同仍确定补号；重启、删除账号和并发创建不改变已分配 UID。
- 过期会话、普通账号和客户端伪造字段不能获得后台权限。
- 关闭主页后 API 与页面均立即不可读，不返回私密资料。
- 主页分享列表不能暴露链接分享、待审或受限文案。
- 账号切换、表单提交失败和移动端不会丢失输入或误显示前一个账号资料。

### Task 1: UID、资料和权限服务

**Files:** 新增 src/database/profiles.ts、src/accounts/profiles.server.ts、tests/account-profiles.test.ts；修改账号配置、服务、删除与导出。
**Interfaces:** ProfileStore.readOwn(userId)、update(userId,input)、publicProfile(uid)；isAdmin(userId)精确匹配服务端配置。

- [x] 编写真实 PG 测试，验证默认关闭、数字 UID、并发分配、稳定性、资料更新修订冲突和私密字段排除。
- [x] 远程单文件运行观察新增接口缺失失败。
- [x] 增量迁移资料表、注册触发器和历史补号，实现资料服务和 GET/PATCH /api/me/profile、GET /api/public/users/:uid。
- [x] 更新本人信息返回 UID 和管理员标志；验证普通账号与伪造字段无权。
- [x] 远程单文件通过，记录结果。

### Task 2: 全站后台业务整合

**Files:** 新增 src/accounts/dashboard.server.ts、tests/dashboard.test.ts；修改 src/server/http.ts、分享审核处理器及 accounts-server.ts。
**Interfaces:** mountDashboard(service,{store,sources})；统一 /api/dash 权限与审计；复用管理处理器而非转发管理员令牌。

- [x] 编写测试，未登录401、普通账号403、管理员能查询、跨站拒绝、过期拒绝，变更产生审计。
- [x] 远程运行观察权限测试失败。
- [x] 抽出目录/审核业务路由，保留旧私有入口；在账号服务管理员中间件后挂载，新增概览、用户分页搜索和审计查询。
- [x] 接入现有资格管理与审核修订校验；只允许已有业务操作。
- [x] 远程运行后台与旧管理、分享相关回归。

### Task 3: 页面和导航

**Files:** 新增 src/routes/dashboard.tsx、src/routes/user.tsx、src/accounts/profile-settings.tsx；修改路由、现有管理组件、账号设置、导航与样式。
**Interfaces:** 后台统一布局；管理组件可配置 API 前缀；数字主页读取公开资料。

- [x] 添加浏览器用例覆盖后台准入、资料保存/关闭、公开主页、320/390/768/1440px以及键盘与错误反馈。
- [x] 复用现有目录、分类和审核组件；新增概览、用户查询和审计列表。
- [x] 接入账号资料编辑和我的主页入口，公开主页用昵称头像、简介与已审核公开分享。
- [x] 公开分享接口纳入内容资格过滤；SSR和客户端均不泄露关闭主页。
- [x] 远程类型检查、构建、定向单元及浏览器回归通过。

### Task 4: 独立审查与隔离预览

**Files:** docs/dashboard-profiles-20261114.md。

- [x] 独立审阅整批改动，修正权限、隐私和兼容性问题并定向验证。
- [x] 新建独立远程任务目录、源码、数据库 schema 和端口，不覆盖原预览。
- [x] 输出中文验证记录、预览入口及生产未变更的证据边界。

## 执行记录

- 已确认：用户批准设计，并选数字自增 UID；按用户持续推进规则在本会话执行，不再重复索要同范围授权。
- 远程已确认 hostname=localhost；已有持久执行器可参考，使用本任务独立目录。

- 审计修复：先用两个不同图片分类对象及冲突测试复现空对象/空理由，再补对象、嵌套理由和结果；audit-green-01 的2项测试通过。
- 业务整合：React Router 默认路由包装不保留自定义属性，已改为具名管理面板；browser-01 复现，browser-02 四档布局及表单/API共6项通过。
- 隐私与迁移：23项定向测试、350项TS全量测试与247项播放器测试通过；老账号确定补号、并发新用户、公开/链接/撤回分享及最外层分级过滤均已覆盖。
- 故障状态：error-red-01 复现目录/审核读取失败仍显示私有令牌；改为账号后台重试面板，最终browser-03已验证故障重试通过。
- 预览阶段决定：保留当前工作树，当时不自行提交、合并或发布；已完成独立审阅，唯一Important审计问题有红绿测试闭环。

- 最终回执：build-08类型/构建通过，final-unit-09的23项定向回归通过，browser-03的10项浏览器用例通过；中文验收记录在 docs/dashboard-profiles-20261114.md。

- 用户后续明确授权生产更新及Asuna账号管理员设置；生产已切换dashboard-20261114-2d2df56，UID1、业务数据指纹、唯一管理员配置和公网只读验收已核实，15分钟观察进行中。
