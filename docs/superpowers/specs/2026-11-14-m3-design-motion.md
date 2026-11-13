# WVN：以 shadcn/ui 与 Motion 落实 Material 3

日期：2026-11-14（Asia/Shanghai）

状态：用户已批准并授权直接实施、完成远程验证后提供预览；生产发布不在本次范围。

独立实施审阅：已完成，未发现影响实施的待决问题。

## 目标和范围

把 WVN 的现有界面整体迁移到 Material 3 的设计语言：颜色角色、字阶、形状、层级、交互状态、响应式布局和动效共同落地。组件沿用 shadcn/ui 与 Radix，动画使用 Motion 的 `motion/react`。不能只完成首页换肤就称为全面完成。

覆盖目录、作品详情、账号与书架、存档与分享、播放器外壳、目录管理与分享审核，以及它们共用的组件和反馈状态。游戏 iframe 内的第三方引擎界面不在站点设计系统的控制范围内；不强行改写游戏资源。

现有功能、路由、搜索查询、权限、内容资格、存档隔离、危险操作确认和服务端校验保持原有语义。本次不新增业务写入、生产部署或第三方消息。

## 当前证据和实施基线

- 现有项目：React 19、React Router、Tailwind 4、shadcn new-york、统一 Radix 包；尚无 Motion 依赖。
- `src/styles.css` 为 1312 行，已有 shadcn 语义变量，但混合硬编码色值、衬线标题、独立动画和局部状态规则。
- 页面使用共享 `src/components/ui/`；公共导航和播放器各有外壳。后台仍有原生表单控件，需要逐处检查并映射。
- 当前本地 `main` 为 `3e69d26`，已记录的 `origin/main` 为 `91371af`，本地落后 7 个提交；远程引用还需在线核对。开始修改产品代码前先核对当前主线，在包含已有修复的隔离分支上实施。不得用旧版本覆盖现行功能。
- 三份已有未跟踪文档保持原样，本设计独立保存。
- 现有封面比例测试包括 1440 / 900 / 390 / 320px、单结果宽度和 logo 横条；该行为属于保留约束。

## 方案与选择

| 方案 | 实际效果 | 取舍 |
| --- | --- | --- |
| 只改 shadcn 配色和圆角 | 改动少 | 页面、状态和动效仍分裂，不能满足全面贯彻 |
| 自有 M3 token → shadcn 组件 → 页面，Motion 统一动效 | 保留可访问性和业务逻辑，系统性统一 | 需要逐个页面覆盖与回归；本次采用 |
| 引入另一套 Material 组件库并重写页面 | 接近库的默认外观 | 与用户指定技术及现有组件重复，扩大迁移风险 |

第二种是根据用户指定的 shadcn/ui、Motion 和现有工程作出的实施选择。视觉默认延续暗色与暖色品牌，通过 M3 色调层级重新组织；不照搬默认紫色，不新增主题设置流程。为阅读内容保留安静背景，表达性主要用于导航、主操作和状态变化。

## 设计系统

### 颜色与层级

以 `--md-sys-color-*` 定义 primary / secondary / tertiary / error 及各自 on 和 container 配对；补齐 surface、五档 surface-container、on-surface、on-surface-variant、outline、outline-variant、inverse 与 scrim。

将现有 shadcn `background/card/popover/primary/secondary/muted/accent/destructive/border/input/ring` 映射到这些角色；组件不得自己另造基础色。卡片用低层容器，导航用容器层，弹窗用高层容器；必要边界使用 outline，装饰分隔使用 outline-variant。错误背景与错误文字使用正确的 error-container / on-error-container 配对。

优先使用色调体现层级，阴影只用于悬浮或模态层。普通文本对比至少 4.5:1，大字及关键图形至少 3:1；实际颜色须计算验证，不能从“来自 M3”推断一定合格。封面／截图和游戏画面保留源颜色。

### 字体、形状与间距

定义 display / headline / title / body / label 的 M3 字阶，并按角色映射字号、行高、字重和字距；正文使用现有系统中文无衬线栈，不新增外部字体请求。品牌字标可以保留自身表达，页面标题和组件标签统一字阶。

定义 none / extra-small / small / medium / large / extra-large / full 的形状 token。按钮和导航指示器使用胶囊或完整圆角；卡片、面板、弹窗按用途分配 12 / 16 / 28px 等层级，不能所有容器使用同一圆角。

使用 4px 基础间距，组件内部与页面区块分别统一密度。移动端主要交互目标至少 48×48 CSS px；紧凑视觉控件可通过外侧布局提供目标空间，不能用透明覆盖层截获邻近控件点击。保留可见键盘焦点、错误文字与禁用语义。

### 组件与状态

改造现有 Button、Input、Textarea、NativeSelect、Badge、Card、Tabs、Accordion、Alert、AlertDialog、Table、Separator、Label。保留 shadcn 的 `asChild`、Radix 焦点管理、ARIA 和表单行为。

按钮明确 filled / tonal / outlined / text / destructive 的优先级；hover、focus、pressed 使用状态层与明确反馈，禁用控件不得产生按压反馈。表单统一标签、辅助文字、无效态、聚焦边界和触控高度；移动端输入字号避免意外缩放。

Tabs 采用有文字的选中指示与可访问键盘操作；导航状态和可点击状态清晰区分。弹窗开关动画不能延迟焦点交还、阻止 Escape 或改变确认动作。加载、空态、失败与成功反馈使用相同的容器和文字角色，不依赖颜色单独表达。

## Motion 系统

当前官方 M3 以 motion physics 为主要系统。采用 expressive scheme，定义 fast / default / slow × spatial / effects 六类集中参数。空间运动用于位置、尺寸、形状；effects 用于透明度、颜色，必须无过冲。动画必须可以被打断和重新定向，不累积排队。

弹簧的 stiffness 与 damping ratio 取官方参数；转换到 Motion 时以质量 1，使用 `damping = 2 × ratio × sqrt(stiffness × mass)`，避免把官方阻尼比直接传给 Motion 的阻尼系数。参数集中在可复用模块，标注来源。CSS 交互使用集中定义的官方曲线／时间作为兼容表达，不宣称 CSS 曲线等于真实物理模拟。

| 场景 | 动效规则 |
| --- | --- |
| 公共主导航 | 共享选中指示器；快速空间弹簧，文字状态即时更新 |
| 按钮／交互卡片 | 小幅按压与形状反馈；快速空间规则；hover 仅适用于支持悬停的设备 |
| 页面／分区切换 | 小幅位移与无过冲淡入；内容立即可用；不以整棵路由卸载实现过渡 |
| Tabs 内容 | 根据当前挂载策略呈现变化，保留表单草稿与组件状态 |
| 筛选、详情、存档面板 | 统一展开／收起；无 JS 的原生 details 行为保留 |
| 弹窗 | 面板空间变化与遮罩 effects 分开；由 Radix 控制生命周期和焦点 |
| 目录列表 | 保留 SSR 可见内容；不为全部卡片逐个延时、持续测量布局或创建滚动监听 |
| 加载与进度 | 只显示真实已知进度；沿用不确定进度语义，不生成伪百分比 |

根部 `MotionConfig reducedMotion="user"`；必要处使用 `useReducedMotion`。减少动效时取消空间移动、缩放、弹性和循环装饰，保留立即变化或短淡入。CSS 动画同步遵守该设置。SSR 和禁用 JS 时主要内容与操作必须可见，不能把初始内容永久设为透明。

播放器 iframe、缓存上下文、存档提供者与运行中的游戏不得因动画更换 key 或重新挂载。播放器根和承载 iframe 的祖先不做 layout transform，避免影响全屏、定位及输入。

## 页面落实

```text
桌面：WVN             发现  我的书架  存档         账号
      标题 / 简介 / 数量
      [搜索作品                          ] [查找]
      [高级筛选 ▾]
      继续阅读（有记录时）
      故事目录 · 作品数
      [原比例封面] [原比例封面] …

手机：WVN                                    账号
      标题 / 搜索 / 内容
      ……
      [发现]       [我的书架]       [存档]
```

- **目录**：M3 搜索容器、明确筛选层级、tonal 最近阅读卡片、统一目录文字与状态。严格保留源图比例、contain、宽图横条、末行保护及单结果不撑满；不回到统一纵横比网格。
- **作品**：标题／封面／摘要／开始阅读形成明确层级；次操作、元信息、简介、版本与玩家存档统一容器和字阶。小屏继续让阅读和互动区域跨满内容宽度。
- **账号与书架**：登录卡、账号标题、分区标签、书架列表、云备份、分享管理、安全设置和恢复码弹窗使用同一系统。切换标签不重置编辑草稿，不把动画完成当成保存成功。
- **分享**：公开快照标题、版本信息、主操作、剧透折叠、领取反馈与错误状态统一。fragment 密钥继续仅留客户端，不进入路由动画状态或日志。
- **播放器壳层**：工具栏、启动状态、真实加载进度、存档面板和退出确认统一设计；游戏画面持续稳定，游戏内 UI 不改变。全屏期间操作和状态仍可访问。
- **管理与审核**：统一标题、表单、表格、状态、分页与确认；保留高信息密度和现有授权边界，工具型操作避免大幅弹跳。

## 实施和验证

实施顺序：核对并建立最新基线 → token 与组件 → Motion 基础层 → 各页面覆盖 → 远程验证和截图 → 补齐遗漏及实际结果记录。设计批准后展开为实施计划。

所有依赖安装、构建、全项目类型检查和浏览器测试在首选 Debian 构建机 `localhost-1.tailac9c6f.ts.net` 上执行，先确认 `hostname`。使用独立持久任务目录、脚本、日志和退出码；外部访问沿用 11090 代理，不重启无关任务。Mac 仅读改代码和运行明确轻量的检查。

现有 QA 有固定工作目录和专用 PG / Redis / Meili 校验；不得绕过校验、借用生产数据或未经核查复用运行中的目录。实施时先检查现有任务与服务，选择独立工作区，适配需要的测试入口并保持独立 QA 约束。

验证至少覆盖：

1. 构建与全库类型检查；改动涉及的现有行为回归。
2. 桌面与 320 / 390 / 768px 页面、封面 1440 / 900 / 390 / 320px 几何测试，无横向溢出。
3. 色彩配对对比度、键盘焦点、Tabs、弹窗焦点锁定／Escape／回焦、表单无效态和触控目标。
4. 正常与减少动态效果两种设置；无 JS GET 搜索与初始内容可见。
5. 导航选中、账号分区草稿、筛选、详情展开和播放器不重挂载；保留正在运行游戏的输入与全屏行为。
6. 目录、详情、登录、书架／存档、分享、播放器及后台的实际可覆盖状态截图。缺少可用的隔离登录或真实设备时明确记录边界，不用匿名截图替代已登录验收。

新增测试只覆盖会退化的外部行为，避免大量读取类名或与实现同构的测试。检查完成后以同一简短记录列出实现范围、通过项、未覆盖项及预览入口；不以文件生成或请求成功替代产品验收。

## 官方依据

- [Material 3 Get started](https://m3.material.io/get-started)
- [Motion physics system](https://m3.material.io/styles/motion)
- [Motion：空间与效果、速度](https://m3.material.io/styles/motion/overview/how-it-works)
- [Color roles](https://m3.material.io/styles/color/the-color-system/)
- [Material Android Motion 参数与说明](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)
- [Motion Accessibility](https://motion.dev/docs/react-accessibility)

尚未精读取得的参数或组件规格在实现前继续查官方源；本设计不把推测值标为官方要求。
