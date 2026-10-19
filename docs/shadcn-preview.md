# WG 统一界面（预览）

用户授权使用 shadcn/ui，前台保留故事放映室氛围，后台使用标准组件；只在远程安装、构建与验证，不切生产。

采用 shadcn new-york / Radix、Tailwind v4，通过统一语义颜色、间距和圆角控制视觉。前台保留深色暖金、衬线标题与抽象故事卡片；后台使用 Card、Accordion、Table、Badge、Alert、Input、NativeSelect。筛选继续使用原生表单，支持无 JavaScript。播放器退出改用 AlertDialog，验证焦点约束、取消与恢复焦点。编辑草稿保持稳定 key，折叠时不卸载；删除登记需二次确认。

验收：远程类型检查、构建、单测、桌面与移动浏览器回归，检查 BGM/VNDB 路由、退出、后台 409 草稿保持、删除取消与确认、公开后台404、无JS筛选。Windows隔离预览备份数据库后更新，逐条HTTP验收，核对生产Caddy哈希与回环监听。

## 验证结果

- Linux `localhost-1`：16/16 单元/集成测试、类型检查、构建通过；8/8 Playwright 回归通过，含无 JavaScript 筛选、320/390/768px布局、BGM/VNDB导航、弹窗键盘焦点、409草稿、折叠/标签切换草稿，以及删除登记取消与确认。
- Windows `WVN-STORAGE` 实际预览：235/235 HTTP检查通过。远程 Chromium 经仅回环隧道登录私有后台，只读检查三个标签页、ATRI未保存草稿、320/390px布局与 BGM作品页；pageErrors=[]，不保存元数据。
- 实际浏览器检查后，SQLite works、versions、routes、reports、pending 与一致性备份完全相同：64作品、79版本、0待匹配。后台一次性令牌在验收后刷新，不写入日志或仓库。
- 备份：`H:\wg-manager-preview-20261019\state\before-ui-1792378784181.db` 及同目录 `before-ui-app-*.tgz`。应用更新没有重新 seed 数据库。
- 仅 Windows 127.0.0.1:8281/8282；用户访问 http://127.0.0.1:18281/ 与 http://127.0.0.1:18282/manage 。生产 Caddyfile SHA256 仍为 313a06303c4ad24b14cc535bda718f09c08b3c2c0ef72110bf4d843f5af0657f；H可用119883964416字节（约111.65 GiB）。
- 报告与实际界面截图在忽略的 `reports/live-*`、`reports/ui-preview-acceptance.json`。本轮验收覆盖界面与交互，游戏iframe在回归中使用资源入口占位，不重复进行完整游玩或存档验收。

## 组件与维护

官方CLI生成的组件在 `src/components/ui/`，主题在 `src/styles.css`。AccordionContent将调用方class应用在实际Radix根节点，支持forceMount保留输入、关闭时隐藏；其余组件保持标准API。表单使用NativeSelect，保留SSR及无JavaScript提交。删除登记通过标准destructive AlertDialogAction确认。

React组件复核：编号和资源映射逻辑未改；编辑器key保持稳定，折叠和标签切换不卸载表单；beforeunload监听清理；确认/取消恢复焦点；候选/报告仅在私有端口；独立请求并行加载。

安装依赖的审计仍提示两条既有依赖项（@hono/node-server 1.19.11、esbuild 0.27.7），与改造前锁文件版本一致。本应用使用自有资源处理器，不使用适配器serveStatic或esbuild开发服务器；此轮未顺带升级服务端依赖。
