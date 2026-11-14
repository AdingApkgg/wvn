# M3 design and motion implementation plan

> **For agentic workers:** Use superpowers:executing-plans; 本会话直接实施，结束后独立代码审阅。

**Goal:** 在全站以 shadcn/ui 和 Motion 实现已批准的 M3 设计，并交付远程可访问预览。

**Architecture:** M3 颜色、字阶、形状 token 映射到 shadcn 语义；集中弹簧参数供组件与页面使用。保持路由、表单及播放器挂载稳定，以远程隔离 QA 验证行为与视觉。

**Tech Stack:** React Router / React / Tailwind 4 / Radix / shadcn/ui / Motion。

**Spec:** `docs/superpowers/specs/2026-11-14-m3-design-motion.md`。

## Global Constraints

- 所有安装、构建、全库类型检查、浏览器在远程 Debian 构建机执行，使用持久化 runner、日志和退出码。
- 保留原比例封面墙、logo 横条和末行保护；不重新挂载播放器 iframe，不改变权限或存档语义。
- 暗色暖色品牌；触控目标 48px，文字对比至少 4.5:1；无 JS 内容可见。
- 支持 reduced-motion；spatial / effects 参数分开，effects 无过冲。
- 不发布生产，不影响其他任务；已授权直接实施并提供预览。

## Review Focus

- SSR / 无 JavaScript 时初始内容必须可见且 GET 搜索可用。
- 手机作品封面、标题、操作的显式布局不能退化。
- 表单、Tabs 和账号上下文切换不能丢草稿或重挂载游戏。
- Radix 模态退出保留 Escape、焦点限制和回焦行为。
- 减少动态效果时关闭空间和循环动画，但不隐藏进度状态。

## Task 1: 基线与验证环境

- [x] 核对在线 main，建立基于 `91371af` 的原生工作树，复制已批准设计。
- [x] 复用远程专用 QA 服务，建立独立任务目录与源码，确认持久任务输出及退出码。
- [x] 安装前检查既有依赖；记录旧版2项新要求失败，保留基线证据。

## Task 2: M3 token、组件与 Motion

**Files:** `src/m3-tokens.css`, `src/ui-system.css`, `src/lib/m3-motion.ts`, `src/components/motion-system.tsx`, `src/components/ui/*`, `src/root.tsx`, `package.json`, `package-lock.json`。

**Interfaces:** `m3Motion.spatial|effects.fast|default|slow` 为 Motion transition；`MotionSystem` 提供配置；`RouteMotion` 只控制进场，不更换内容 key。

- [x] 新增行为验证：手机主要按钮最小 48px、减少动效无 transform、正确颜色配对和 SSR 可见。
- [x] 实测旧界面未满足新要求；视觉 token 调整通过计算和浏览器验证，不写与 CSS 实现同构的单测。
- [x] 创建完整 M3 token 并映射语义变量，统一字阶、状态层、形状、组件尺寸；以 Motion 配置和 CSS 兼容规则共用动效意图。
- [x] 远程安装 Motion，构建和类型检查；运行新增行为测试。

## Task 3: 全站页面落地

**Files:** `src/components/site-navigation.tsx`, `src/routes/catalog.tsx`, `src/routes/work.tsx`, `src/routes/account.tsx`, `src/routes/play.tsx`, `src/routes/share.tsx`, `src/routes/manage.tsx`, `src/routes/share-admin.tsx`, `src/ui-system.css`。

**Interfaces:** 使用 Task 2 token 和 spring；原路由和语义不变。

- [x] 导航使用共享选中指示；目录、详情、书架、存档、分享、资格、后台、播放器壳层统一层级。
- [x] 按钮按压、Tabs 内容、details 和对话框实现一致反馈，所有位移不作用于播放器祖先。
- [x] 用现有 `poster-layout.spec.ts` 和 `reader-experience.spec.ts` 验证封面几何、草稿、资格和确认流程；追加必要的减少动效和播放器实例稳定性覆盖。

## Task 4: 远程验证、审阅与预览

**Files:** `tests/e2e/m3-design.spec.ts`, `docs/design-system.md`, `docs/m3-preview-20261114.md`。

- [x] 远程运行 `npm run typecheck`、`npm run build`、`npm test` 与 UI 回归；明确记录环境所需的跳过项。
- [x] 按 320/390/768/1440px 检查溢出、焦点、对比、触控及正常/减少动态效果，保存关键页面截图。
- [x] 独立代码审阅，修复有实质影响的问题，重新验证必要范围。
- [x] 启动独立、可重连的预览并实际检查访问，交付链接、截图和验证边界。

## 执行记录

- 2026-11-14：用户已批准设计并授权细节自主决定。使用单会话直接实施；无需重复确认计划。
- 在线 main 已核对为 `91371afef6e9a7abb42a1a8829dba0e23c1666ca`，原生隔离工作树已创建。
- Task 1：完成。独立远程目录与持久执行器已建立；旧版两项新要求先复现失败。
- Task 2：完成。完整 token、Motion 与组件改造已落地；构建和类型检查通过。
- Task 3：完成。全站覆盖；首次点击及显式回焦修复后，包含运行中夹具的28项UI回归全部通过。
- Task 4：完成。最终类型检查、构建、330项单元测试、30项浏览器/截图用例和专用服务拒绝检查通过，源码20文件一致。详见 `docs/m3-preview-20261114.md`。
- 决定：不修改资格策略；只将已有且受活跃窗口条件约束的鼠标焦点交接规则复用到存档面板。键盘和表单控件保留原生焦点行为。
- 独立审阅已完成并复核修复；审阅未发现新的产品代码阻塞项，补强了焦点锁定循环检查。
