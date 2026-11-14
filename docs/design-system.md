# WVN 界面设计系统

本规范对应 `src/ui-system.css` 与现有 `src/components/ui/`，适用于读者界面和私有管理后台。游戏引擎内部菜单保持引擎自身样式。

## 页面与任务

一级入口为发现、书架、存档、设置。发现负责选择作品，书架负责继续阅读和阅读记录，存档负责备份与分享，设置负责账号安全和浏览偏好。公开页面只由 `SiteNavigation` 渲染一套页头；阅读器使用专用壳层，私有后台不接入公开导航。

页面标题先说明当前任务，再说明必要上下文。页内子导航只放同一任务的子区，例如“我的备份 / 我的分享”；不要再次并列整个站点导航。所有旧的 `/account?tab=…` 入口保留。

## 视觉变量

设计语汇是「暖纸 / 发丝线」：层级靠明度差和半透明发丝线建立，不靠阴影和厚描边；暖金只承担一个角色（当前可操作的主路径）；元数据用等宽字体与字距，和正文区分。衬线只用于站点名、页面标题与作品名，界面文字一律无衬线。

令牌正本在 `src/ui-system.css` 的 `:root`，本节只列语义：

| 变量 | 用途 |
| --- | --- |
| `--paper / --paper-raised / --paper-field / --paper-wash` | 四级纸张：页底、任务卡片、输入与占位场、悬停与选中 |
| `--ink / --ink-soft / --ink-faint` | 正文、辅助说明、元数据与标签 |
| `--hairline / --hairline-strong` | 发丝线；默认 12% 墨色，强调 20% |
| `--gold / --gold-bright / --gold-dim / --gold-veil` | 主操作、悬停、弱化强调、选中底色 |
| `--success / --warning / --info / --destructive` | 语义色；必须同时有文字说明，不单独承载含义 |
| `--background / --foreground / --card / --popover / --primary / --secondary / --muted / --accent / --border / --input / --ring` | shadcn 令牌，全部映射到上面几组，不要另设色值 |
| `--control-height: 44px` | 常用交互目标最低高度；图标按钮也至少 44px 宽 |
| `--chrome-height: 61px` | 页头高度，与 `scroll-padding-top` 共用 |
| `--shell-gutter / --pane-inset / --measure` | 页边距、卡片内衬、正文测量宽度（68ch） |
| `--radius / --radius-card / --radius-cover / --radius-pill` | 控件、任务卡片、封面、胶囊 |
| `--text-display / --text-title / --text-section / --text-body / --text-help / --text-micro` | 文字层级；界面最小 11px（等宽元数据） |
| `--font-sans / --font-serif / --font-mono` | 无衬线正文、标题衬线、等宽元数据 |

间距尺度为 4/8/12/16/24/32/48/64px；页面容器不超过 1200px，介绍文字不超过 `--measure`，普通编辑区不超过 640px。

深色暖金是当前产品主题，暂不提供浅色主题。不要在新组件中临时定义另一套配色或加载外部字体；`MiSans` 只作为 `--font-sans` 的第二 fallback 存在，实际以 `Inter` 与系统中文字体为准。图片占位不能被描述为图片已通过审核；显示范围由服务端策略与当前内容上下文共同决定。

### 组件规范

- **按钮**：高度由 `--control-height` 决定（`min-h-*` + `padding-block`，不用固定 `h-*`），标签允许换行；一屏只保留一个实心主操作。`size="icon"` 为 44×44。
- **封面墙**：`.story-card` 以 `--cover-ratio` 参与等高排布，`.card-art` 的 `aspect-ratio` 跟随原图，封面 `object-fit: contain`；横卡（Logo/超宽图）用 `.story-card-wide`。规则见[自适应封面墙](cover-gallery.md)。
- **元数据**：`.card-meta`、`.metadata-facts span`、`.player-bar-meta` 用 `--font-mono` + 字距，最小 11px，颜色不低于 `--ink-faint`。
- **阅读器**：`.player` 专用壳层，`.player-bar` 与页头同高；未确认内容提示时渲染 `.reader-gate` 一页纸，而不是孤立按钮。菜单、存档面板沿用引擎自身界面。
- **作品首屏**：`.work-heading` 为封面 + 文字两列网格（有封面才加 `.has-cover`），标题、编号、互动、主操作各占明确网格位置。
- **空状态与错误**：`.empty` 用短句 + 一个可达操作；`.reader-error` 用左侧 2px `--destructive` 竖线配文字。


## 操作与反馈

- 一个任务区优先保留一个实心主操作，次操作用描边或文字；危险操作单独分组。
- 使用具体动词和目标：“备份到云端”“下载本机备份”“设为最新云端备份”，避免一个“保存”混指多种行为。
- 表单有可见标签；错误与输入保留在任务附近。提交期间说明正在做什么，并只禁用相关操作。
- 编辑阅读记录按需展开，显式保存。收起、筛选和后台对象切换保留草稿；真正离开时提示未保存修改。
- 存档复制、恢复和清理使用统一的 `useActionConfirmation` 或既有 `AlertDialog`，显示影响与保留策略；不再新增原生 `window.confirm`。
- 对话框使用 Radix 焦点限制与返回规则，取消操作不执行写入。账号失效会取消待确认任务。
- 重要状态使用 `role="status"`，需要处理的错误使用 `role="alert"`；颜色不能单独承载含义。

## 阅读与备份术语

| 术语 | 准确含义 |
| --- | --- |
| 游戏内存档 | 由游戏自己创建进度文件；WVN 不承诺代替游戏保存当前剧情 |
| 本机副本 | 当前网站、设备、游戏版本及引擎档案中的持久副本 |
| 云端备份 | 当前账号中手动上传的固定备份；不会因继续游戏自动更新 |
| 结束阅读 | 保留已有存档文件的本机副本并停止游戏实例；仍可留在准备页 |
| 恢复到本机 | 所选备份成为下次启动的进度，当前本机副本先保留历史 |
| 设为最新云端备份 | 改变云端当前备份，不等于当前设备已恢复 |
| 领取分享 | 保存独立副本，不自动装入正在运行的游戏 |

只有确实读到本机副本时才显示“继续阅读”。只有历史版本记录时显示“打开上次版本”。从作品发起的普通版本启动使用一次性导航意图；刷新、后退和直接链接保留各自明确语义。受限版本仍需通过服务端检查与明确启动提示。

## 响应式与无障碍

验证 320、390、768、1440px，手机底栏预留安全区。作品首屏的标题、编号、互动和主操作必须有明确网格位置；不允许新增子组件落入封面宽度的隐式列。目录继承[自适应封面墙](cover-gallery.md)：按原图比例等高混排，Logo 和超宽图使用横向卡片，末行不将单张封面撑满。尺寸元数据用于首屏，图片加载后按实际比例更新；不得以统一视觉为由改成固定宽高比。contain 只保证完整显示，不能代替自适应布局。

普通文字对比度至少 4.5:1，大文字至少 3:1；不接受肉眼判断，用脚本实测。`node audit-design.mjs` 会在 1440px 打开目录、作品、账号三页，用 canvas 把每个前景/背景色真的画一笔再读回 sRGB 像素，按 WCAG 公式算合成后的比值，同时对三个页面 × 320/390/768/1440px 检查横向溢出与小于 44px 的控件；任一项不过就以非零码退出。`node shots.mjs` 生成同一组断点的交付截图到 `shots/`（JPEG，`type: jpeg` 带 `quality`），并输出每页的 `overflowX` 与 `below44` 清单。两个脚本都需先起预览，预置环境见下节。44px 触控目标是本项目采用的增强设计目标，不称为 WCAG AA 的最小要求。支持键盘、可见焦点、状态播报、缩放与 reduced-motion。动态进度仅显示实测数据，无总量时保持不定进度。

UI 改动必须在隔离远程预览执行 `npm run test:e2e:ui`，同时覆盖原封面墙比例/横卡/末行约束与阅读体验测试，不得只选择新增用例。具体实现及验收范围见 [UI/UX 验收记录](ui-ux-preview-20261104.md)，2026-11-14 的全面重设计见 [重设计记录](ui-ux-redesign-20261114.md)。对比度依据为 [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)，触控尺寸依据为 [W3C Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)。
