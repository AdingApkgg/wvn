# 2026-11-14 UI/UX 全面重设计

起点 `91371af`（`main`，pr#4 合并后）。这一轮不是修修补补：把 gal.games（梓澪の妙妙屋）的视觉语汇拆出来，重写 WVN 的整个界面层，同时保留既有信息架构、引擎内部 UI 和全部服务端策略。

## 参考与取舍

参考站点给的是**语汇**，不是配色配方：暖纸底、发丝线分层、衬线只出现在站点名与作品名、元数据用等宽小字加字距、强调色只承担一个角色、封面按原图比例等高混排。WVN 的深色暖金主题继续保留，没有搬 gal.games 的浅色底。

- **照抄**：页面骨架（页头 / 页面标题 / 内容 / 页脚单列节奏）、发丝线代替阴影的层级法、衬线-无衬线-等宽三族分工、强调色单一职责、44px 交互目标、`contain` 显示封面。
- **不照抄**：浅色主题、`MiSans` 本体（WVN 用 `Inter` + 系统中文字体，`MiSans` 只作第二 fallback）、固定 317px 卡片（WVN 按原图比例排）、gal.games 的文案结构。
- **排除范围**：WebGAL / Ren'Py / ONS 引擎内菜单，由引擎自己渲染。

## 落在代码里的东西

- `src/ui-system.css` 重写为四级纸张（`--paper`…`--paper-wash`）、三级墨色、两级发丝线、四档金色，全部语义令牌，再映射到 shadcn 令牌；`src/styles.css` 里被取代的旧规则删掉，剩的是仍需的引擎相关样式。
- `src/components/ui/button.tsx` 的 cva `size` 全部对齐 `--control-height`（含 `icon` 44×44、`sm`、`link`），按钮高度用 `min-h-*` + `padding-block` 而不是固定 `h-*`，长标签换行不溢出。
- 作品首屏改成封面 + 文字显式网格；阅读器独立壳层，内容提示做成 `.reader-gate` 一页纸；空状态、错误、元数据、分享卡片、账号面板、私有后台同步换皮。
- 目录继续按 `docs/cover-gallery.md`：等高混排、原图比例、`object-fit: contain`、Logo/超宽横向卡片、末行不撑满单张。
- 颜色不单独承载语义，状态都配文字和 `role="status"/"alert"`；终态确认沿用 `useActionConfirmation` 与既有 `AlertDialog`，没有新增原生 `confirm`。

## 验收

全部在 Linux `localhost` 构建机上跑，长任务各自 tmux + 日志 + 退出码。

| 项目 | 结果 |
| --- | --- |
| `npm run typecheck` | 无输出，退出码 0 |
| `npm run build` | 退出码 0，`build/server/index.js` 592.65 kB |
| `npm test`（全量单测） | 335 passed / 0 failed，127s，两轮 |
| `npx playwright test`（全量 e2e） | 65 passed / 9 skipped / 0 failed，1.6m，多轮 |
| `node audit-design.mjs` | 73 处文字最低 6.64:1；三个页面 × 四断点零溢出、零小于 44px 控件 |
| `node shots.mjs` | 18 张截图全部 200，`overflowX` 全 0，`below44` 全空 |

9 项 skip 都是环境门，不是失败：`platform.spec.ts` 需要隔离 PostgreSQL 平台启动器，`content-cas-native` / `reader-engines` 部分用例需要 `WG_CONTENT_NATIVE_CAS=1` 的 CAS 预览，其余是分享与引擎的显式门。

截图在 `shots/`（320/390/768/1440 × 目录、作品、阅读器、账号、规则页）。

## 顺带修掉的真问题

- 内容代理 `src/content/access-proxy.server.ts` 把入站 pathname 一起转发，资格接口与页面路径无关，改为固定回源 `/api/me/content`，只挂 `/api/me` 与 `/api/me/*`。
- `scripts/lib/preview-browser.mjs` 只能吃一把证书，e2e 同时打两套自签预览必然 `ERR_CERT_AUTHORITY_INVALID`；改为接受数组并拼接 SPKI 白名单，`playwright.config.ts` 收集多把证书。
- `tests/ons-pilot.test.ts` 写死「其他引擎路由不进白名单」，但预览与生产都开 `WG_ALL_ENGINES=1`，改成按环境断言。
- 对比度用例原来只采目录一页 5 个点，扩到目录 / 作品 / 账号三页 15 处以上。

## 边界

- 本轮只到预览与本地提交，未推送、未合并、未碰生产。
- 五类引擎只验证代表版本能启动，不代表全部剧情与存档兼容。
- 对比度按采样点实测，不等于完整 WCAG 认证，也没有真实用户访谈。

## 复现

```bash
export HTTPS_PROXY=http://127.0.0.1:11090 HTTP_PROXY=http://127.0.0.1:11090
bash /tmp/restart-wvn.sh && bash /tmp/restart-accounts.sh
node audit-design.mjs && node shots.mjs
```

预览 `http://127.0.0.1:8281`（公开）与 `https://localhost:8283`（账号，自签证书）。改过 CSS 必须重新 build 再重启，否则预览仍给旧样式。
